const mongoose = require('mongoose');
const paymentController = require('../controllers/payment.controller');
const Payment = require('../models/Payment');
const Order = require('../models/Order');

describe('Stage 5: Payment Management Module Tests', () => {
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const sampleOrderId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Payment Validation & Security', () => {
    test('processPayment rejects invalid order ID', async () => {
      const req = {
        user: { _id: customerId },
        body: { orderId: 'bad-id', paymentMethod: 'MOCK_ONLINE' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'A valid Order ID is required' })
      );
    });

    test('processPayment forbids customer from paying for another customer order', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        customer: otherCustomerId, // belongs to someone else
        totalAmount: 1200,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);

      const req = {
        user: { _id: customerId },
        body: { orderId: sampleOrderId.toString(), paymentMethod: 'MOCK_ONLINE' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not authorized to pay for this order' })
      );
    });

    test('processPayment prevents payment on a cancelled order', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        customer: customerId,
        totalAmount: 1200,
        status: 'CANCELLED',
        paymentStatus: 'PENDING',
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);

      const req = {
        user: { _id: customerId },
        body: { orderId: sampleOrderId.toString(), paymentMethod: 'MOCK_ONLINE' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Cannot process payment for a cancelled order' })
      );
    });

    test('processPayment detects and rejects client-side amount mismatch', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        customer: customerId,
        totalAmount: 5000, // authoritative server price
        status: 'PENDING',
        paymentStatus: 'PENDING',
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);
      jest.spyOn(Payment, 'findOne').mockResolvedValue(null);

      const req = {
        user: { _id: customerId },
        body: {
          orderId: sampleOrderId.toString(),
          paymentMethod: 'MOCK_ONLINE',
          clientAmount: 50, // client attempts price tampering
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Payment amount mismatch/),
          authoritativeAmount: 5000,
        })
      );
    });

    test('processPayment prevents duplicate payment if order is already PAID', async () => {
      const alreadyPaidOrder = {
        _id: sampleOrderId,
        customer: customerId,
        totalAmount: 1200,
        status: 'CONFIRMED',
        paymentStatus: 'PAID', // already paid
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(alreadyPaidOrder);

      const req = {
        user: { _id: customerId },
        body: { orderId: sampleOrderId.toString(), paymentMethod: 'MOCK_ONLINE' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Duplicate payment prevented/),
        })
      );
    });

    test('processPayment prevents duplicate payment if existing successful Payment record exists', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        customer: customerId,
        totalAmount: 1200,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);
      jest.spyOn(Payment, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        status: 'PAID',
        transactionId: 'TXN-EXISTING',
      });

      const req = {
        user: { _id: customerId },
        body: { orderId: sampleOrderId.toString(), paymentMethod: 'MOCK_ONLINE' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Duplicate payment prevented/),
        })
      );
    });
    test('processPayment catches MongoDB E11000 duplicate key error and responds with 400', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        orderNumber: 'ORD-20261117-009',
        customer: customerId,
        totalAmount: 1200,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);
      jest.spyOn(Payment, 'findOne').mockResolvedValue(null);

      const duplicateKeyErr = new Error('E11000 duplicate key error collection: payments index: order_1 dup key');
      duplicateKeyErr.code = 11000;
      jest.spyOn(Payment, 'create').mockRejectedValue(duplicateKeyErr);

      const req = {
        user: { _id: customerId },
        body: { orderId: sampleOrderId.toString(), paymentMethod: 'MOCK_ONLINE' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Duplicate payment prevented/),
        })
      );
    });
  });

  describe('Cash on Delivery (COD) Processing', () => {
    test('processPayment prevents duplicate COD selection on an order that already has COD', async () => {
      const codOrder = {
        _id: sampleOrderId,
        orderNumber: 'ORD-20261117-COD',
        customer: customerId,
        totalAmount: 1800,
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        status: 'CONFIRMED',
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(codOrder);

      const req = {
        user: { _id: customerId },
        body: { orderId: sampleOrderId.toString(), paymentMethod: 'COD' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Cash on Delivery has already been selected/),
        })
      );
    });

    test('COD leaves paymentStatus as PENDING until physical collection and confirms order', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        orderNumber: 'ORD-20261117-001',
        customer: customerId,
        totalAmount: 1800,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);
      jest.spyOn(Payment, 'findOne').mockResolvedValue(null);

      const mockPaymentDoc = {
        paymentNumber: 'PAY-20261117-001',
        order: sampleOrderId,
        status: 'PENDING',
        paymentMethod: 'COD',
      };
      jest.spyOn(Payment, 'create').mockResolvedValue(mockPaymentDoc);

      const req = {
        user: { _id: customerId },
        body: { orderId: sampleOrderId.toString(), paymentMethod: 'COD' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      // Verify COD paymentStatus remains PENDING
      expect(mockOrder.paymentMethod).toBe('COD');
      expect(mockOrder.paymentStatus).toBe('PENDING');
      expect(mockOrder.status).toBe('CONFIRMED');
      expect(mockOrder.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Cash on Delivery selected/i),
          payment: expect.objectContaining({ status: 'PENDING', paymentMethod: 'COD' }),
        })
      );
    });
  });

  describe('Mock Online Payment Processing (Success & Failure)', () => {
    test('processPayment records FAILED payment when simulated failure is requested', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        orderNumber: 'ORD-20261117-002',
        customer: customerId,
        totalAmount: 2400,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);
      jest.spyOn(Payment, 'findOne').mockResolvedValue(null);

      const mockFailedPayment = {
        paymentNumber: 'PAY-20261117-002',
        status: 'FAILED',
        paymentMethod: 'MOCK_ONLINE',
      };
      jest.spyOn(Payment, 'create').mockResolvedValue(mockFailedPayment);

      const req = {
        user: { _id: customerId },
        body: {
          orderId: sampleOrderId.toString(),
          paymentMethod: 'MOCK_ONLINE',
          simulateOutcome: 'FAIL',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(mockOrder.paymentStatus).toBe('FAILED');
      expect(mockOrder.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/declined/i),
          payment: expect.objectContaining({ status: 'FAILED' }),
        })
      );
    });

    test('processPayment processes successful mock payment, generating txnId and marking order as PAID', async () => {
      const mockOrder = {
        _id: sampleOrderId,
        orderNumber: 'ORD-20261117-003',
        customer: customerId,
        totalAmount: 3500,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Order, 'findById').mockResolvedValue(mockOrder);
      jest.spyOn(Payment, 'findOne').mockResolvedValue(null);

      const mockPaidPayment = {
        paymentNumber: 'PAY-20261117-003',
        status: 'PAID',
        paymentMethod: 'MOCK_ONLINE',
        transactionId: 'TXN-MOCK-123456',
        amount: 3500,
      };
      jest.spyOn(Payment, 'create').mockResolvedValue(mockPaidPayment);

      const req = {
        user: { _id: customerId },
        body: {
          orderId: sampleOrderId.toString(),
          paymentMethod: 'MOCK_ONLINE',
          simulateOutcome: 'SUCCESS',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.processPayment(req, res);

      expect(mockOrder.paymentStatus).toBe('PAID');
      expect(mockOrder.paymentMethod).toBe('MOCK_ONLINE');
      expect(mockOrder.status).toBe('CONFIRMED');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/Mock online payment completed/),
          payment: expect.objectContaining({ status: 'PAID' }),
        })
      );
    });
  });

  describe('Payment History & Ownership Checks', () => {
    test('getPaymentHistory returns only payments belonging to the authenticated customer', async () => {
      const mockPayments = [
        { paymentNumber: 'PAY-1', customer: customerId, amount: 2000, status: 'PAID' },
      ];
      const findSpy = {
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockPayments),
        }),
      };
      jest.spyOn(Payment, 'find').mockReturnValue(findSpy);

      const req = { user: { _id: customerId } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.getPaymentHistory(req, res);

      expect(Payment.find).toHaveBeenCalledWith({ customer: customerId });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1, payments: mockPayments })
      );
    });

    test('getPaymentById forbids customer from reading another customer payment record', async () => {
      const otherUserPayment = {
        _id: new mongoose.Types.ObjectId(),
        customer: otherCustomerId,
        amount: 9999,
      };
      jest.spyOn(Payment, 'findById').mockReturnValue({
        lean: jest.fn().mockResolvedValue(otherUserPayment),
      });

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: otherUserPayment._id.toString() },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await paymentController.getPaymentById(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not authorized to view this payment' })
      );
    });
  });
});
