const mongoose = require('mongoose');
const productBridge = require('../services/productBridge.service');
const productController = require('../controllers/product.controller');

describe('Stage 2: Product Browsing & Stock Calculation Tests', () => {
  describe('Stock Calculation & Data Safety', () => {
    test('getAvailableStockForProduct returns 0 when no inventory source or records exist', async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const stock = await productBridge.getAvailableStockForProduct(dummyId);
      expect(stock).toBe(0);
    });

    test('getAvailableStockForProduct sums quantities accurately without inventing numbers', async () => {
      const dummyId = new mongoose.Types.ObjectId();

      const originalInventory = mongoose.models.Inventory;
      // Assign mock model to mongoose.models.Inventory
      mongoose.models.Inventory = {
        find: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { product: dummyId, warehouse: 'WH-1', quantity: 25 },
            { product: dummyId, warehouse: 'WH-2', quantity: 15 },
          ]),
        }),
      };

      const stock = await productBridge.getAvailableStockForProduct(dummyId);
      expect(stock).toBe(40);

      // Restore
      if (originalInventory) {
        mongoose.models.Inventory = originalInventory;
      } else {
        delete mongoose.models.Inventory;
      }
    });

    test('calculateSellableQuantity correctly deducts reserved and damaged stock', () => {
      // 100 on-hand, 20 reserved for pending orders, 5 damaged
      const record = { quantity: 100, reservedQuantity: 20, damagedQuantity: 5 };
      expect(productBridge.calculateSellableQuantity(record)).toBe(75);

      // Explicit availableQuantity takes precedence if provided by Person 1
      const recordWithExplicit = { quantity: 100, availableQuantity: 60 };
      expect(productBridge.calculateSellableQuantity(recordWithExplicit)).toBe(60);

      // When reserved exceeds quantity, floor at 0
      const recordOverReserved = { quantity: 10, reservedQuantity: 15 };
      expect(productBridge.calculateSellableQuantity(recordOverReserved)).toBe(0);
    });
  });

  describe('Product Listing & Bridge Safety', () => {
    test('listProducts returns empty result structure when no products exist', async () => {
      const result = await productBridge.listProducts();
      expect(result).toHaveProperty('products');
      expect(Array.isArray(result.products)).toBe(true);
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 12,
      });
    });

    test('listProducts correctly enriches products with verified real stock', async () => {
      const prodId = new mongoose.Types.ObjectId();
      const mockProducts = [
        {
          _id: prodId,
          name: 'Wireless Ergonomic Keyboard',
          sku: 'KB-ERGO-01',
          price: 3499,
          category: 'Electronics',
          description: 'Ergonomic split keyboard',
        },
      ];

      const originalProduct = mongoose.models.Product;
      const originalInventory = mongoose.models.Inventory;

      mongoose.models.Product = {
        countDocuments: jest.fn().mockResolvedValue(1),
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockProducts),
        }),
      };

      mongoose.models.Inventory = {
        find: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { product: prodId, quantity: 20, reservedQuantity: 2 },
          ]),
        }),
      };

      const result = await productBridge.listProducts({ page: 1, limit: 10 });
      expect(result.products.length).toBe(1);
      expect(result.products[0].name).toBe('Wireless Ergonomic Keyboard');
      // 20 total - 2 reserved = 18 sellable
      expect(result.products[0].stock).toBe(18);
      expect(result.products[0].isInStock).toBe(true);

      if (originalProduct) mongoose.models.Product = originalProduct;
      else delete mongoose.models.Product;

      if (originalInventory) mongoose.models.Inventory = originalInventory;
      else delete mongoose.models.Inventory;
    });
  });

  describe('Product Controller Handlers', () => {
    test('getProducts returns HTTP 200 with products array', async () => {
      const req = { query: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await productController.getProducts(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          products: expect.any(Array),
        })
      );
    });

    test('getProductById returns 404 when product is not found', async () => {
      const req = { params: { id: new mongoose.Types.ObjectId().toString() } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await productController.getProductById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Product not found',
        })
      );
    });
  });
});
