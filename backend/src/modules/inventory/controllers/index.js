// Thin controllers: read request → call service → send response.
const { asyncHandler, sendSuccess } = require('../utils/http');
const productService = require('../services/product.service');
const categoryService = require('../services/category.service');
const warehouseService = require('../services/warehouse.service');
const inventoryService = require('../services/inventory.service');
const stockService = require('../services/stock.service');
const transferService = require('../services/transfer.service');
const batchService = require('../services/batch.service');
const { assertWarehouseAccess } = require('../middleware/auth');

const list = (fn) => asyncHandler(async (req, res) => {
  const { data, meta } = await fn(req.query, req.user);
  sendSuccess(res, { data, meta });
});

// ---------------- Categories ----------------
const categories = {
  list: list(categoryService.listCategories),
  get: asyncHandler(async (req, res) => sendSuccess(res, { data: await categoryService.getCategory(req.params.id) })),
  create: asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: 'Category created', data: await categoryService.createCategory(req.body, req.user) })),
  update: asyncHandler(async (req, res) => sendSuccess(res, { message: 'Category updated', data: await categoryService.updateCategory(req.params.id, req.body, req.user) })),
  remove: asyncHandler(async (req, res) => sendSuccess(res, { message: 'Category deleted', data: await categoryService.deleteCategory(req.params.id, req.user) })),
};

// ---------------- Products ----------------
const products = {
  list: list(productService.listProducts),
  get: asyncHandler(async (req, res) => sendSuccess(res, { data: await productService.getProduct(req.params.id, req.user) })),
  stock: asyncHandler(async (req, res) => sendSuccess(res, { data: await productService.getProductStock(req.params.id) })),
  create: asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: 'Product created', data: await productService.createProduct(req.body, req.user) })),
  update: asyncHandler(async (req, res) => sendSuccess(res, { message: 'Product updated', data: await productService.updateProduct(req.params.id, req.body, req.user) })),
  remove: asyncHandler(async (req, res) => {
    const data = await productService.deleteProduct(req.params.id, req.user, { hard: req.query.hard === true });
    sendSuccess(res, { message: data.message || 'Product deleted', data });
  }),
  skuPreview: asyncHandler(async (req, res) => sendSuccess(res, { data: await productService.previewSku(req.query.category, req.query.brand) })),
  skuCheck: asyncHandler(async (req, res) => sendSuccess(res, { data: await productService.checkSku(req.query.sku, req.query.excludeId) })),
};

// ---------------- Warehouses ----------------
const warehouses = {
  list: list(warehouseService.listWarehouses),
  get: asyncHandler(async (req, res) => sendSuccess(res, { data: await warehouseService.getWarehouse(req.params.id) })),
  create: asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: 'Warehouse created', data: await warehouseService.createWarehouse(req.body, req.user) })),
  update: asyncHandler(async (req, res) => sendSuccess(res, { message: 'Warehouse updated', data: await warehouseService.updateWarehouse(req.params.id, req.body, req.user) })),
  remove: asyncHandler(async (req, res) => {
    const data = await warehouseService.deleteWarehouse(req.params.id, req.user);
    sendSuccess(res, { message: data.message || 'Warehouse deleted', data });
  }),
  nearby: asyncHandler(async (req, res) => sendSuccess(res, { data: await warehouseService.nearbyWarehouses(req.query) })),
};

// ---------------- Inventory & stock ----------------
const inventory = {
  dashboard: asyncHandler(async (req, res) => sendSuccess(res, { data: await inventoryService.getDashboard(req.user) })),
  list: list(inventoryService.listInventory),
  lowStock: list(inventoryService.listLowStock),
  logs: list(inventoryService.listLogs),
  summary: asyncHandler(async (req, res) => sendSuccess(res, { data: await inventoryService.movementSummary(req.query) })),
  settings: asyncHandler(async (req, res) => sendSuccess(res, { message: 'Settings saved', data: await inventoryService.updateInventorySettings(req.params.id, req.body, req.user) })),

  stockIn: asyncHandler(async (req, res) => {
    assertWarehouseAccess(req.user, req.body.warehouseId);
    const r = await stockService.stockIn({ ...req.body, userId: req.user.id });
    sendSuccess(res, { status: 201, message: `Added ${req.body.quantity} unit(s) — batch ${r.batch.batchNumber}`, data: { inventory: r.inventory, batch: r.batch, log: r.log } });
  }),
  stockOut: asyncHandler(async (req, res) => {
    assertWarehouseAccess(req.user, req.body.warehouseId);
    const r = await stockService.stockOut({ ...req.body, userId: req.user.id });
    sendSuccess(res, { message: `Removed ${req.body.quantity} unit(s)`, data: { inventory: r.inventory, consumedBatches: r.consumed, log: r.log } });
  }),
  adjust: asyncHandler(async (req, res) => {
    assertWarehouseAccess(req.user, req.body.warehouseId);
    const r = await stockService.adjustStock({ ...req.body, userId: req.user.id });
    sendSuccess(res, { message: `Stock adjusted to ${req.body.countedQuantity}`, data: { inventory: r.inventory, log: r.log } });
  }),
};

// ---------------- Transfers ----------------
const transfers = {
  list: list(transferService.listTransfers),
  get: asyncHandler(async (req, res) => sendSuccess(res, { data: await transferService.getTransfer(req.params.id) })),
  create: asyncHandler(async (req, res) => {
    const data = await transferService.createTransfer(req.body, req.user);
    sendSuccess(res, { status: 201, message: data.status === 'completed' ? `Transfer ${data.transferNumber} completed` : `Transfer ${data.transferNumber} created`, data });
  }),
  complete: asyncHandler(async (req, res) => {
    const data = await transferService.completeTransfer(req.params.id, req.user, req.body.note);
    sendSuccess(res, { message: `Transfer ${data.transferNumber} completed`, data });
  }),
  cancel: asyncHandler(async (req, res) => {
    const data = await transferService.cancelTransfer(req.params.id, req.user, req.body.reason);
    sendSuccess(res, { message: `Transfer ${data.transferNumber} cancelled`, data });
  }),
};

// ---------------- Batches ----------------
const batches = {
  list: list(batchService.listBatches),
  get: asyncHandler(async (req, res) => sendSuccess(res, { data: await batchService.getBatch(req.params.id) })),
  update: asyncHandler(async (req, res) => sendSuccess(res, { message: 'Batch updated', data: await batchService.updateBatch(req.params.id, req.body, req.user) })),
  writeOff: asyncHandler(async (req, res) => sendSuccess(res, { message: 'Batch written off', data: await batchService.writeOffBatch(req.params.id, req.body, req.user) })),
  summary: asyncHandler(async (req, res) => sendSuccess(res, { data: await batchService.expirySummary(req.user, req.query.days) })),
};

module.exports = { categories, products, warehouses, inventory, transfers, batches };
