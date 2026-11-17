const mongoose = require('mongoose');
const orderController = require('../controllers/order.controller');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const productBridge = require('../services/productBridge.service');
const inventoryAdapter = require('../services/inventoryAdapter.service');

describe('Stage 4: Orders & Checkout Module Tests', () => {
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const sampleProductId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation & Edge Cases Before Transaction', () => {
    test('checkout rejects invalid or incomplete shipping address', async () => {
      const req = {
        user: { _id: customerId },
        body: {
          shippingAddress: { street: '123 Main St', city: '' }, // missing state, postalCode
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Complete shipping address is required/),
        })
      );
    });

    test('checkout returns existing order on duplicate submission with idempotencyKey', async () => {
      const existingOrder = {
        _id: new mongoose.Types.ObjectId(),
        orderNumber: 'ORD-20261117-1001',
        customer: customerId,
        idempotencyKey: 'idem-key-12345',
      };
      jest.spyOn(Order, 'findOne').mockResolvedValue(existingOrder);

      const req = {
        user: { _id: customerId },
        body: {
          shippingAddress: { street: '123 Main St', city: 'Pune', state: 'MH', postalCode: '411001' },
          idempotencyKey: 'idem-key-12345',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Duplicate submission detected, returning existing order',
          order: existingOrder,
        })
      );
    });

    test('checkout returns 503 error when MongoDB transactions are unavailable (standalone mode)', async () => {
      jest.spyOn(Order, 'findOne').mockResolvedValue(null);
      jest.spyOn(orderController, 'checkReplicaSet').mockResolvedValue(false);

      const req = {
        user: { _id: customerId },
        body: {
          shippingAddress: { street: '123 Main St', city: 'Pune', state: 'MH', postalCode: '411001' },
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'REPLICA_SET_REQUIRED',
        })
      );
    });
  });

  describe('Transactional Checkout Logic (Simulated Session)', () => {
    let mockSession;

    beforeEach(() => {
      jest.spyOn(orderController, 'checkReplicaSet').mockResolvedValue(true);

      mockSession = {
        withTransaction: jest.fn(async (cb) => {
          return await cb();
        }),
        endSession: jest.fn().mockResolvedValue(),
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('checkout aborts and returns 400 when cart is empty', async () => {
      jest.spyOn(Order, 'findOne').mockResolvedValue(null);
      const cartFindSpy = {
        session: jest.fn().mockResolvedValue({ customer: customerId, items: [] }),
      };
      jest.spyOn(Cart, 'findOne').mockReturnValue(cartFindSpy);

      const req = {
        user: { _id: customerId },
        body: {
          shippingAddress: { street: '123 Main St', city: 'Pune', state: 'MH', postalCode: '411001' },
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/cart is empty/i) })
      );
    });

    test('checkout aborts when available stock is insufficient at checkout time', async () => {
      jest.spyOn(Order, 'findOne').mockResolvedValue(null);
      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 5 }],
      };
      jest.spyOn(Cart, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockCart),
      });

      // Product in DB only has 2 units in stock
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: '4K Monitor',
        price: 24999,
        stock: 2,
      });

      const req = {
        user: { _id: customerId },
        body: {
          shippingAddress: { street: '123 Main St', city: 'Pune', state: 'MH', postalCode: '411001' },
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/Insufficient stock/) })
      );
    });

    test('checkout uses fresh server product prices, ignoring any client price tampering', async () => {
      jest.spyOn(Order, 'findOne').mockResolvedValue(null);
      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 2 }],
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Cart, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockCart),
      });

      // Real price from DB is 1500 (even if client tried to claim price was 100)
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Mechanical Keyboard',
        sku: 'KB-01',
        price: 1500,
        stock: 10,
      });

      jest.spyOn(inventoryAdapter, 'deductStock').mockResolvedValue([
        { product: sampleProductId, warehouse: 'WH-CENTRAL', deductedQty: 2 },
      ]);

      const createdOrderDoc = {
        _id: new mongoose.Types.ObjectId(),
        orderNumber: 'ORD-20261117-9999',
        customer: customerId,
        items: [{ product: sampleProductId, name: 'Mechanical Keyboard', quantity: 2, price: 1500, subtotal: 3000 }],
        totalAmount: 3000,
      };
      jest.spyOn(Order, 'create').mockResolvedValue([createdOrderDoc]);

      const req = {
        user: { _id: customerId },
        body: {
          shippingAddress: { street: '123 Main St', city: 'Pune', state: 'MH', postalCode: '411001' },
          clientPrice: 100, // Client attempts to supply a low price
          clientTotal: 200,
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.checkout(req, res);

      // Verify order was created with real server price 1500 and total 3000
      expect(Order.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            totalAmount: 3000,
            items: expect.arrayContaining([
              expect.objectContaining({ price: 1500, subtotal: 3000 }),
            ]),
          }),
        ]),
        expect.anything()
      );
      // Verify cart was cleared
      expect(mockCart.items).toEqual([]);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('checkout handles inventory deduction failure and rolls back transaction', async () => {
      jest.spyOn(Order, 'findOne').mockResolvedValue(null);
      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 2 }],
        save: jest.fn(),
      };
      jest.spyOn(Cart, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockCart),
      });

      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Item',
        price: 500,
        stock: 5,
      });

      // Simulate atomic deduction failure (e.g. concurrent checkout)
      jest.spyOn(inventoryAdapter, 'deductStock').mockRejectedValue(
        new Error('Insufficient inventory during atomic deduction')
      );

      const req = {
        user: { _id: customerId },
        body: {
          shippingAddress: { street: '123 Main St', city: 'Pune', state: 'MH', postalCode: '411001' },
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.checkout(req, res);

      // Cart should not be cleared because transaction threw
      expect(mockCart.save).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/Insufficient inventory/) })
      );
    });
  });

  describe('Order Ownership & History', () => {
    test('getMyOrders returns only orders belonging to authenticated customer', async () => {
      const mockOrders = [
        { _id: new mongoose.Types.ObjectId(), orderNumber: 'ORD-1', customer: customerId },
      ];
      const findSpy = {
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockOrders),
        }),
      };
      jest.spyOn(Order, 'find').mockReturnValue(findSpy);

      const req = { user: { _id: customerId } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.getMyOrders(req, res);

      expect(Order.find).toHaveBeenCalledWith({ customer: customerId });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1, orders: mockOrders })
      );
    });

    test('getOrderById forbids customer from accessing another customer order', async () => {
      const orderOfAnotherUser = {
        _id: new mongoose.Types.ObjectId(),
        customer: otherCustomerId, // belongs to someone else
        orderNumber: 'ORD-SECRET',
      };
      jest.spyOn(Order, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(orderOfAnotherUser),
      });

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: orderOfAnotherUser._id.toString() },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.getOrderById(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not authorized to view this order' })
      );
    });
  });

  describe('Order Cancellation & Inventory Restoration', () => {
    test('cancelOrder prevents repeated cancellation of already cancelled order', async () => {
      const alreadyCancelledOrder = {
        _id: new mongoose.Types.ObjectId(),
        customer: customerId,
        status: 'CANCELLED',
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(alreadyCancelledOrder);

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: alreadyCancelledOrder._id.toString() },
        body: {},
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'This order has already been cancelled' })
      );
    });

    test('cancelOrder prevents cancellation of shipped or delivered orders', async () => {
      const shippedOrder = {
        _id: new mongoose.Types.ObjectId(),
        customer: customerId,
        status: 'SHIPPED',
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(shippedOrder);

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: shippedOrder._id.toString() },
        body: {},
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.cancelOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/cannot be cancelled/) })
      );
    });

    test('cancelOrder atomically restores inventory and updates status to CANCELLED', async () => {
      const eligibleOrder = {
        _id: new mongoose.Types.ObjectId(),
        customer: customerId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        items: [{ product: sampleProductId, quantity: 3, warehouse: 'WH-1' }],
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(eligibleOrder);
      jest.spyOn(orderController, 'checkReplicaSet').mockResolvedValue(true);

      const mockSession = {
        withTransaction: jest.fn(async (cb) => await cb()),
        endSession: jest.fn().mockResolvedValue(),
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
      const restoreSpy = jest.spyOn(inventoryAdapter, 'restoreStock').mockResolvedValue();

      const Payment = require('../models/Payment');
      const refundSpy = jest.spyOn(Payment, 'updateMany').mockResolvedValue({ modifiedCount: 1 });

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: eligibleOrder._id.toString() },
        body: { reason: 'Changed my mind' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await orderController.cancelOrder(req, res);

      // 1. Verify restoreStock was called with items and session
      expect(restoreSpy).toHaveBeenCalledWith(eligibleOrder.items, mockSession);
      // 2. Verify refund update was called on payments
      expect(refundSpy).toHaveBeenCalled();
      // 3. Verify status changed to CANCELLED (matching Person 3 expectations)
      expect(eligibleOrder.status).toBe('CANCELLED');
      expect(eligibleOrder.paymentStatus).toBe('REFUNDED');
      expect(eligibleOrder.cancellationReason).toBe('Changed my mind');
      expect(eligibleOrder.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);

      jest.restoreAllMocks();
    });
  });
});
