// =============================================================================
// MODULE 1 — Product & Inventory Management (Person 1)
// Public surface of the module. Other modules import ONLY from here.
// =============================================================================
const router = require('./routes');
const models = require('./models');
const stockService = require('./services/stock.service');
const { inventoryEvents, EVENTS } = require('./utils/events');
const { startExpiryJob } = require('./jobs/expiry.job');

module.exports = {
  router,          // app.use('/api', inventory.router)
  models,          // { Product, Category, Warehouse, Inventory, StockBatch, StockTransfer, InventoryLog }
  inventoryEvents, // subscribe to stock events
  EVENTS,
  startJobs: () => startExpiryJob(),

  // ---- Integration API for Person 2 (orders) ----
  // All accept an optional { session } to join the order transaction.
  reserveStock: stockService.reserveStock,
  releaseReservation: stockService.releaseReservation,
  deductForOrder: stockService.deductForOrder,
  restockForOrder: stockService.restockForOrder,
  findFulfilmentWarehouse: stockService.findFulfilmentWarehouse,
  emitPendingEvents: stockService.emitPendingEvents, // call after YOUR commit if you passed a session
};
