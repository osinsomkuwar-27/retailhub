// All Module 1 routes. Mounted by the app at /api:
//   app.use('/api', require('./modules/inventory').router)
const express = require('express');
const c = require('../controllers');
const v = require('../validators');
const { validate } = require('../middleware/validate');
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

const ADMIN = ROLES.ADMIN;
const STAFF = [ROLES.ADMIN, ROLES.WAREHOUSE_MANAGER];

const router = express.Router();

// ---------------- Categories (public read, admin write) ----------------
const categories = express.Router();
categories.get('/', optionalAuth, validate(v.category.list), c.categories.list);
categories.get('/:id', optionalAuth, validate(v.category.byId), c.categories.get);
categories.post('/', protect, authorize(ADMIN), validate(v.category.create), c.categories.create);
categories.put('/:id', protect, authorize(ADMIN), validate(v.category.update), c.categories.update);
categories.delete('/:id', protect, authorize(ADMIN), validate(v.category.byId), c.categories.remove);

// ---------------- Products (public read for catalogue, admin write) ----------------
const products = express.Router();
products.get('/', optionalAuth, validate(v.product.list), c.products.list);
products.get('/sku/preview', protect, authorize(ADMIN), validate(v.product.skuPreview), c.products.skuPreview);
products.get('/sku/check', protect, authorize(ADMIN), validate(v.product.skuCheck), c.products.skuCheck);
products.get('/:id', optionalAuth, validate(v.product.byId), c.products.get);
products.get('/:id/stock', protect, authorize(...STAFF), validate(v.product.byId), c.products.stock);
products.post('/', protect, authorize(ADMIN), validate(v.product.create), c.products.create);
products.put('/:id', protect, authorize(ADMIN), validate(v.product.update), c.products.update);
products.delete('/:id', protect, authorize(ADMIN), validate(v.product.remove), c.products.remove);

// ---------------- Warehouses ----------------
const warehouses = express.Router();
warehouses.get('/nearby', protect, validate(v.warehouse.nearby), c.warehouses.nearby);
warehouses.get('/', protect, authorize(...STAFF), validate(v.warehouse.list), c.warehouses.list);
warehouses.get('/:id', protect, authorize(...STAFF), validate(v.warehouse.byId), c.warehouses.get);
warehouses.post('/', protect, authorize(ADMIN), validate(v.warehouse.create), c.warehouses.create);
warehouses.put('/:id', protect, authorize(ADMIN), validate(v.warehouse.update), c.warehouses.update);
warehouses.delete('/:id', protect, authorize(ADMIN), validate(v.warehouse.byId), c.warehouses.remove);

// ---------------- Inventory & stock operations (staff only) ----------------
const inventory = express.Router();
inventory.use(protect, authorize(...STAFF));
inventory.get('/dashboard', c.inventory.dashboard);
inventory.get('/', validate(v.inventory.list), c.inventory.list);
inventory.get('/low-stock', validate(v.inventory.list), c.inventory.lowStock);
inventory.get('/logs', validate(v.inventory.logs), c.inventory.logs);
inventory.get('/logs/summary', validate(v.inventory.summary), c.inventory.summary);
inventory.post('/stock-in', validate(v.stock.in), c.inventory.stockIn);
inventory.post('/stock-out', validate(v.stock.out), c.inventory.stockOut);
inventory.post('/adjust', validate(v.stock.adjust), c.inventory.adjust);
inventory.patch('/:id', validate(v.inventory.settings), c.inventory.settings);

// ---------------- Stock transfers ----------------
const transfers = express.Router();
transfers.use(protect, authorize(...STAFF));
transfers.get('/', validate(v.transfer.list), c.transfers.list);
transfers.get('/:id', validate(v.transfer.byId), c.transfers.get);
transfers.post('/', validate(v.transfer.create), c.transfers.create);
transfers.post('/:id/complete', validate(v.transfer.action), c.transfers.complete);
transfers.post('/:id/cancel', validate(v.transfer.action), c.transfers.cancel);

// ---------------- Batches & expiry ----------------
const batches = express.Router();
batches.use(protect, authorize(...STAFF));
batches.get('/', validate(v.batch.list), c.batches.list);
batches.get('/expiry-summary', validate(v.batch.summary), c.batches.summary);
batches.get('/:id', validate(v.batch.byId), c.batches.get);
batches.patch('/:id', validate(v.batch.update), c.batches.update);
batches.post('/:id/write-off', validate(v.batch.writeOff), c.batches.writeOff);

router.use('/categories', categories);
router.use('/products', products);
router.use('/warehouses', warehouses);
router.use('/inventory', inventory);
router.use('/stock-transfers', transfers);
router.use('/batches', batches);

module.exports = router;
