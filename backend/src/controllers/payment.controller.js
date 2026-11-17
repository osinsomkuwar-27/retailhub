const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { checkReplicaSet } = require('./order.controller');

/**
 * Generate a unique alphanumeric payment identifier
 */
const generatePaymentNumber = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.floor(1000 + Math.random() * 9000);
  return `PAY-${d}-${r}`;
};

/**
 * @desc    Process mock online payment or confirm Cash on Delivery (COD)
 * @route   POST /api/payments/process
 * @access  Private (Customer)
 */
const processPayment = async (req, res) => {
  try {
    const { orderId, paymentMethod, simulateOutcome, clientAmount } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid Order ID is required',
      });
    }

    if (!['MOCK_ONLINE', 'COD'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method. Choose either MOCK_ONLINE or COD.',
      });
    }

    // 1. Fetch order and verify ownership
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pay for this order',
      });
    }

    // 2. Validate order status
    if (order.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot process payment for a cancelled order',
      });
    }

    // 3. Prevent duplicate successful payments
    if (order.paymentStatus === 'PAID') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate payment prevented: This order has already been paid in full.',
      });
    }

    const existingPaid = await Payment.findOne({ order: order._id, status: 'PAID' });
    if (existingPaid) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate payment prevented: A successful payment record already exists for this order.',
      });
    }

    // 4. Server-Side Amount Verification (Never trust client-supplied amount)
    const authoritativeAmount = Number(order.totalAmount);
    if (
      clientAmount !== undefined &&
      !isNaN(Number(clientAmount)) &&
      Number(clientAmount) !== authoritativeAmount
    ) {
      return res.status(400).json({
        success: false,
        message: `Payment amount mismatch: Client sent ₹${clientAmount}, but authoritative order total is ₹${authoritativeAmount}.`,
        authoritativeAmount,
      });
    }

    const isReplicaSet = await checkReplicaSet();

    // 5. Case A: Cash on Delivery (COD)
    // COD orders are NOT marked as PAID before delivery
    if (paymentMethod === 'COD') {
      if (order.paymentMethod === 'COD') {
        return res.status(400).json({
          success: false,
          message: 'Cash on Delivery has already been selected for this order.',
        });
      }

      order.paymentMethod = 'COD';
      order.paymentStatus = 'PENDING';
      if (order.status === 'PENDING') {
        order.status = 'CONFIRMED';
      }

      let payment = null;

      if (isReplicaSet) {
        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
          await order.save({ session });
          const [p] = await Payment.create(
            [
              {
                paymentNumber: generatePaymentNumber(),
                order: order._id,
                orderNumber: order.orderNumber,
                customer: req.user._id,
                amount: authoritativeAmount,
                currency: 'INR',
                paymentMethod: 'COD',
                status: 'PENDING',
                gatewayResponse: {
                  gateway: 'COD_CASH_ON_DELIVERY',
                  message: 'Cash to be collected upon physical package delivery.',
                  isSimulated: false,
                },
              },
            ],
            { session }
          );
          payment = p;
        });
        await session.endSession();
      } else {
        await order.save();
        payment = await Payment.create({
          paymentNumber: generatePaymentNumber(),
          order: order._id,
          orderNumber: order.orderNumber,
          customer: req.user._id,
          amount: authoritativeAmount,
          currency: 'INR',
          paymentMethod: 'COD',
          status: 'PENDING',
          gatewayResponse: {
            gateway: 'COD_CASH_ON_DELIVERY',
            message: 'Cash to be collected upon physical package delivery.',
            isSimulated: false,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Cash on Delivery selected. Payment will be collected upon delivery.',
        payment,
        order,
      });
    }

    // 6. Case B: Mock Online Payment
    const isSimulatedFailure = simulateOutcome === 'FAIL' || simulateOutcome === 'FAILED';

    if (isSimulatedFailure) {
      // Record failed payment attempt without marking order as paid
      order.paymentStatus = 'FAILED';
      await order.save();

      const failedPayment = await Payment.create({
        paymentNumber: generatePaymentNumber(),
        order: order._id,
        orderNumber: order.orderNumber,
        customer: req.user._id,
        amount: authoritativeAmount,
        currency: 'INR',
        paymentMethod: 'MOCK_ONLINE',
        status: 'FAILED',
        gatewayResponse: {
          gateway: 'MOCK_PAYMENT_GATEWAY',
          message: 'Simulated bank card decline / insufficient test funds.',
          isSimulated: true,
        },
      });

      return res.status(400).json({
        success: false,
        message: 'Simulated payment was declined by the mock gateway.',
        payment: failedPayment,
        order,
      });
    }

    // 7. Successful Mock Online Payment
    const txnId = `TXN-MOCK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    let successfulPayment = null;

    if (isReplicaSet) {
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        order.paymentStatus = 'PAID';
        order.paymentMethod = 'MOCK_ONLINE';
        if (order.status === 'PENDING') {
          order.status = 'CONFIRMED';
        }
        await order.save({ session });

        const [p] = await Payment.create(
          [
            {
              paymentNumber: generatePaymentNumber(),
              order: order._id,
              orderNumber: order.orderNumber,
              customer: req.user._id,
              amount: authoritativeAmount,
              currency: 'INR',
              paymentMethod: 'MOCK_ONLINE',
              status: 'PAID',
              transactionId: txnId,
              gatewayResponse: {
                gateway: 'MOCK_PAYMENT_GATEWAY',
                message: 'Mock payment authorization approved successfully.',
                isSimulated: true,
              },
            },
          ],
          { session }
        );
        successfulPayment = p;
      });
      await session.endSession();
    } else {
      order.paymentStatus = 'PAID';
      order.paymentMethod = 'MOCK_ONLINE';
      if (order.status === 'PENDING') {
        order.status = 'CONFIRMED';
      }
      await order.save();

      successfulPayment = await Payment.create({
        paymentNumber: generatePaymentNumber(),
        order: order._id,
        orderNumber: order.orderNumber,
        customer: req.user._id,
        amount: authoritativeAmount,
        currency: 'INR',
        paymentMethod: 'MOCK_ONLINE',
        status: 'PAID',
        transactionId: txnId,
        gatewayResponse: {
          gateway: 'MOCK_PAYMENT_GATEWAY',
          message: 'Mock payment authorization approved successfully.',
          isSimulated: true,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Mock online payment completed successfully.',
      payment: successfulPayment,
      order,
    });
  } catch (error) {
    if (error.code === 11000 || (error.message && error.message.includes('E11000'))) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate payment prevented: A successful payment has already been recorded for this order.',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Payment processing error: ' + error.message,
    });
  }
};

/**
 * @desc    Get customer's payment history
 * @route   GET /api/payments
 * @access  Private (Customer)
 */
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment history',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payment records for a specific order
 * @route   GET /api/payments/order/:orderId
 * @access  Private (Customer)
 */
const getPaymentByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format',
      });
    }

    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.customer.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view payments for this order',
      });
    }

    const payments = await Payment.find({ order: orderId }).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payments for order',
      error: error.message,
    });
  }
};

/**
 * @desc    Get a single payment record by ID
 * @route   GET /api/payments/:id
 * @access  Private (Customer)
 */
const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment ID format',
      });
    }

    const payment = await Payment.findById(id).lean();
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    if (payment.customer.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this payment',
      });
    }

    res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment',
      error: error.message,
    });
  }
};

module.exports = {
  processPayment,
  getPaymentHistory,
  getPaymentByOrderId,
  getPaymentById,
};
