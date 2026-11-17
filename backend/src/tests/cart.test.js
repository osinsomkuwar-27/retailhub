const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const cartController = require('../controllers/cart.controller');
const productBridge = require('../services/productBridge.service');

describe('Stage 3: Shopping Cart Module Tests', () => {
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const sampleProductId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cart Calculation & Server-Side Totals', () => {
    test('enrichAndCalculateCart accurately computes subtotals and totals from real product prices', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Smart Bluetooth Speaker',
        price: 2499,
        stock: 10,
        isInStock: true,
      });

      const mockCartDoc = {
        _id: new mongoose.Types.ObjectId(),
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 3 }],
      };

      const result = await cartController.enrichAndCalculateCart(mockCartDoc);

      expect(result.items.length).toBe(1);
      expect(result.items[0].unitPrice).toBe(2499);
      expect(result.items[0].subtotal).toBe(7497); // 2499 * 3
      expect(result.total).toBe(7497);
      expect(result.totalItems).toBe(3);
      expect(result.hasStockIssue).toBe(false);
    });

    test('flags stock issue when cart quantity exceeds available warehouse stock', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Limited Stock Headphones',
        price: 1999,
        stock: 2, // only 2 available
        isInStock: true,
      });

      const mockCartDoc = {
        _id: new mongoose.Types.ObjectId(),
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 5 }], // requested 5
      };

      const result = await cartController.enrichAndCalculateCart(mockCartDoc);

      expect(result.hasStockIssue).toBe(true);
      expect(result.items[0].hasStockIssue).toBe(true);
      expect(result.items[0].errorMessage).toMatch(/exceeds available stock/);
    });

    test('handles deleted or unavailable products gracefully', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue(null);

      const mockCartDoc = {
        _id: new mongoose.Types.ObjectId(),
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 1 }],
      };

      const result = await cartController.enrichAndCalculateCart(mockCartDoc);

      expect(result.items[0].isAvailable).toBe(false);
      expect(result.items[0].hasStockIssue).toBe(true);
      expect(result.total).toBe(0);
    });
  });

  describe('Cart Controller Handlers & Validation', () => {
    test('addItem rejects invalid product ID', async () => {
      const req = { user: { _id: customerId }, body: { productId: 'invalid-id', quantity: 1 } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.addItem(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'A valid Product ID is required' })
      );
    });

    test('addItem rejects non-positive quantity', async () => {
      const req = { user: { _id: customerId }, body: { productId: sampleProductId.toString(), quantity: -2 } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.addItem(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Quantity must be a positive integer' })
      );
    });

    test('addItem returns 404 when product does not exist', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue(null);

      const req = { user: { _id: customerId }, body: { productId: sampleProductId.toString(), quantity: 1 } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.addItem(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Product not found' })
      );
    });

    test('addItem returns 400 when requested quantity exceeds available inventory stock', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Item',
        price: 500,
        stock: 3, // only 3 available
      });

      // Existing cart has 2 units
      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 2 }],
        save: jest.fn(),
      };
      jest.spyOn(Cart, 'findOne').mockResolvedValue(mockCart);

      // Customer tries to add 2 more (total 4 > 3 stock)
      const req = { user: { _id: customerId }, body: { productId: sampleProductId.toString(), quantity: 2 } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.addItem(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          availableStock: 3,
        })
      );
    });

    test('addItem successfully increases quantity when inventory is sufficient', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Item',
        price: 500,
        stock: 20,
      });

      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 2 }],
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Cart, 'findOne').mockResolvedValue(mockCart);

      const req = { user: { _id: customerId }, body: { productId: sampleProductId.toString(), quantity: 3 } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.addItem(req, res);

      expect(mockCart.items[0].quantity).toBe(5);
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('updateItemQuantity removes item when quantity is 0', async () => {
      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 2 }],
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Cart, 'findOne').mockResolvedValue(mockCart);

      const req = {
        user: { _id: customerId },
        params: { productId: sampleProductId.toString() },
        body: { quantity: 0 },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.updateItemQuantity(req, res);

      expect(mockCart.items.length).toBe(0);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Item removed from cart' })
      );
    });

    test('removeItem removes matching product from customer cart', async () => {
      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 2 }],
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Cart, 'findOne').mockResolvedValue(mockCart);

      const req = {
        user: { _id: customerId },
        params: { productId: sampleProductId.toString() },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.removeItem(req, res);

      expect(mockCart.items.length).toBe(0);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('clearCart empties customer cart items', async () => {
      const mockCart = {
        customer: customerId,
        items: [{ product: sampleProductId, quantity: 2 }],
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Cart, 'findOne').mockResolvedValue(mockCart);

      const req = { user: { _id: customerId } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.clearCart(req, res);

      expect(mockCart.items).toEqual([]);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('enforces customer cart ownership and prevents cross-customer access', async () => {
      const findSpy = jest.spyOn(Cart, 'findOne').mockResolvedValue({
        customer: customerId,
        items: [],
      });

      const req = { user: { _id: customerId } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await cartController.getCart(req, res);

      // Verify Cart query is explicitly scoped to authenticated req.user._id
      expect(findSpy).toHaveBeenCalledWith({ customer: customerId });
      expect(findSpy).not.toHaveBeenCalledWith({ customer: otherCustomerId });
    });
  });
});
