const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const productBridge = require('../services/productBridge.service');
const inventoryAdapter = require('../services/inventoryAdapter.service');

/**
 * Helper to check if current MongoDB connection supports multi-document ACID transactions
 */
const checkReplicaSet = async () => {
  try {
    if (!mongoose.connection.db) return false;
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(hello && (hello.setName || hello.msg === 'isdbgrid'));
  } catch (_) {
    return false;
  }
};

/**
 * @desc    Checkout customer's cart into an Order using ACID replica-set transactions
 * @route   POST /api/orders/checkout
 * @access  Private (Customer)
 */
const checkout = async (req, res) => {
  const { shippingAddress, idempotencyKey } = req.body;

  // 1. Validate shipping address
  if (
    !shippingAddress ||
    !shippingAddress.street ||
    !shippingAddress.city ||
    !shippingAddress.state ||
    !shippingAddress.postalCode
  ) {
    return res.status(400).json({
      success: false,
      message: 'Complete shipping address is required (street, city, state, postal code)',
    });
  }

  // 2. Prevent duplicate submissions using idempotencyKey
  if (idempotencyKey) {
    const existing = await Order.findOne({
      customer: req.user._id,
      idempotencyKey,
    });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Duplicate submission detected, returning existing order',
        order: existing,
      });
    }
  }

  // 3. Verify replica-set transaction support
  const isReplicaSet = await module.exports.checkReplicaSet();
  if (!isReplicaSet) {
    return res.status(503).json({
      success: false,
      code: 'REPLICA_SET_REQUIRED',
      message:
        'MongoDB transactions are unavailable: database is not running as a replica set. Order creation and stock deduction require a replica set for ACID transaction safety.',
    });
  }

  const session = await mongoose.startSession();
  try {
    let createdOrder = null;

    await session.withTransaction(async () => {
      // 4. Load authenticated customer's cart
      const cart = await Cart.findOne({ customer: req.user._id }).session(session);
      if (!cart || !cart.items || cart.items.length === 0) {
        throw new Error('Your cart is empty. Add products before checking out.');
      }

      // 5. Revalidate every product and price, and verify stock at checkout time
      let totalAmount = 0;
      const orderItems = [];

      for (const item of cart.items) {
        const product = await productBridge.getProductById(item.product);
        if (!product) {
          throw new Error('One or more products in your cart are no longer available.');
        }

        const qty = item.quantity;
        if (qty > product.stock) {
          throw new Error(
            `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${qty}.`
          );
        }

        const price = Number(product.price) || 0;
        const subtotal = Math.round(price * qty * 100) / 100;
        totalAmount += subtotal;

        orderItems.push({
          product: product._id,
          name: product.name,
          sku: product.sku || '',
          quantity: qty,
          price, // Person 3 expects price snapshot
          subtotal,
          warehouse: null, // populated by deduction
        });
      }

      // 6. Deduct stock atomically
      const allocations = await inventoryAdapter.deductStock(orderItems, session);
      // Attach allocated warehouse
      orderItems.forEach((it, idx) => {
        it.warehouse = allocations[idx]?.warehouse || null;
      });

      // 7. Create immutable Order
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${datePart}-${randomPart}`;

      const [newOrder] = await Order.create(
        [
          {
            orderNumber,
            customer: req.user._id,
            items: orderItems,
            totalAmount: Math.round(totalAmount * 100) / 100,
            shippingAddress: {
              street: shippingAddress.street.trim(),
              city: shippingAddress.city.trim(),
              state: shippingAddress.state.trim(),
              postalCode: shippingAddress.postalCode.trim(),
              country: shippingAddress.country?.trim() || 'India',
            },
            status: 'PENDING',
            paymentStatus: 'PENDING',
            paymentMethod: 'PENDING',
            idempotencyKey: idempotencyKey || null,
          },
        ],
        { session }
      );

      // 8. Clear customer's cart
      cart.items = [];
      await cart.save({ session });

      createdOrder = newOrder;
    });

    await session.endSession();

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: createdOrder,
    });
  } catch (err) {
    await session.endSession();
    const isClientError = /empty|insufficient|unavailable/i.test(err.message);
    res.status(isClientError ? 400 : 500).json({
      success: false,
      message: err.message || 'Checkout failed',
    });
  }
};

/**
 * @desc    Get order history for authenticated customer
 * @route   GET /api/orders
 * @access  Private (Customer)
 */
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve orders',
      error: error.message,
    });
  }
};

/**
 * @desc    Get order details by ID
 * @route   GET /api/orders/:id
 * @access  Private (Customer)
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format',
      });
    }

    const order = await Order.findById(id).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Customer can only view their own order (unless admin)
    if (
      order.customer.toString() !== req.user._id.toString() &&
      req.user.role !== 'ADMIN'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order',
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve order details',
      error: error.message,
    });
  }
};

/**
 * @desc    Cancel an eligible order and atomically restore inventory
 * @route   PATCH /api/orders/:id/cancel
 * @access  Private (Customer)
 */
const cancelOrder = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid order ID format',
    });
  }

  const order = await Order.findById(id);
  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found',
    });
  }

  // Authorization check
  if (
    order.customer.toString() !== req.user._id.toString() &&
    req.user.role !== 'ADMIN'
  ) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to cancel this order',
    });
  }

  // Repeated cancellation check
  if (order.status === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      message: 'This order has already been cancelled',
    });
  }

  // Eligibility check: only non-shipped orders can be cancelled
  const cancellableStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING'];
  if (!cancellableStatuses.includes(order.status)) {
    return res.status(400).json({
      success: false,
      message: `Orders with status '${order.status}' cannot be cancelled. Only pending or processing orders are eligible.`,
    });
  }

  // Check replica set
  const isReplicaSet = await module.exports.checkReplicaSet();
  if (!isReplicaSet) {
    return res.status(503).json({
      success: false,
      code: 'REPLICA_SET_REQUIRED',
      message:
        'MongoDB transactions are unavailable: database is not running as a replica set. Order cancellation and stock restoration require a replica set for ACID transaction safety.',
    });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1. Atomically restore inventory
      await inventoryAdapter.restoreStock(order.items, session);

      // 2. Update order status and cancellation fields
      order.status = 'CANCELLED';
      order.cancelledAt = new Date();
      order.cancellationReason = reason ? String(reason).trim() : 'Customer requested cancellation';

      if (order.paymentStatus === 'PAID') {
        order.paymentStatus = 'REFUNDED';
        const Payment = require('../models/Payment');
        await Payment.updateMany(
          { order: order._id, status: 'PAID' },
          {
            $set: {
              status: 'REFUNDED',
              'refundDetails.isSimulated': true,
              'refundDetails.refundedAt': new Date(),
              'refundDetails.reason': order.cancellationReason,
              'refundDetails.refundNote':
                'Simulated mock refund for academic/testing purposes. No real monetary transaction occurred.',
            },
          },
          { session }
        );
      }

      await order.save({ session });
    });

    await session.endSession();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully and inventory restored',
      order,
    });
  } catch (err) {
    await session.endSession();
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order: ' + err.message,
    });
  }
};

module.exports = {
  checkout,
  getMyOrders,
  getOrderById,
  cancelOrder,
  checkReplicaSet,
};
