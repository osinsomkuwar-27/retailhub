// In-process event bus for Module 1.
// Other modules SUBSCRIBE — they never need to edit Module 1 code:
//
//   const { inventoryEvents } = require('../inventory');
//   inventoryEvents.on('inventory.lowStock', (payload) => { ... });   // Person 3
//   inventoryEvents.on('audit', (entry) => AuditLog.create(entry));    // Person 4
//
// Events are emitted only AFTER a transaction commits.
const { EventEmitter } = require('events');

const inventoryEvents = new EventEmitter();
inventoryEvents.setMaxListeners(50);

const EVENTS = Object.freeze({
  STOCK_CHANGED: 'inventory.stockChanged', // { productId, warehouseId, type, quantityChange, quantityAfter, userId }
  LOW_STOCK: 'inventory.lowStock',         // { productId, warehouseId, available, reorderLevel }
  TRANSFER_COMPLETED: 'inventory.transferCompleted',
  AUDIT: 'audit',                          // { action, entity, entityId, userId, details }
});

function emitSafe(event, payload) {
  try { inventoryEvents.emit(event, payload); } catch (err) { console.error(`[events] listener for ${event} failed:`, err.message); }
}

function audit(action, entity, entityId, userId, details = {}) {
  emitSafe(EVENTS.AUDIT, { module: 'inventory', action, entity, entityId, userId, details, at: new Date() });
}

module.exports = { inventoryEvents, EVENTS, emitSafe, audit };
