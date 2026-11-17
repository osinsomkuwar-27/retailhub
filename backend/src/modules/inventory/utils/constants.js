// Role names — must match Person 4's roles collection / JWT payload.
const ROLES = Object.freeze({
  ADMIN: 'admin',
  WAREHOUSE_MANAGER: 'warehouse_manager',
  CUSTOMER: 'customer',
});

// Every stock movement type written to inventory_logs.
// Person 3 (anomaly detection) watches these via Change Streams.
const MOVEMENT_TYPES = Object.freeze({
  STOCK_IN: 'STOCK_IN',          // goods received
  STOCK_OUT: 'STOCK_OUT',        // manual reduction
  ADJUSTMENT: 'ADJUSTMENT',      // physical count correction (+/-)
  DAMAGED: 'DAMAGED',
  EXPIRED: 'EXPIRED',            // expired batch written off
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  SALE: 'SALE',                  // Person 2 – order placed
  RETURN: 'RETURN',              // Person 2 – order cancelled / returned
});

const INBOUND_TYPES = [MOVEMENT_TYPES.STOCK_IN, MOVEMENT_TYPES.TRANSFER_IN, MOVEMENT_TYPES.RETURN, MOVEMENT_TYPES.ADJUSTMENT];
const OUTBOUND_TYPES = [
  MOVEMENT_TYPES.STOCK_OUT, MOVEMENT_TYPES.ADJUSTMENT, MOVEMENT_TYPES.DAMAGED,
  MOVEMENT_TYPES.EXPIRED, MOVEMENT_TYPES.TRANSFER_OUT, MOVEMENT_TYPES.SALE,
];

const REFERENCE_KINDS = ['Manual', 'StockTransfer', 'Order', 'ExpiryWriteOff', 'Seed'];

const PRODUCT_UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'dozen'];
const PRODUCT_STATUS = ['active', 'inactive', 'discontinued'];
const WAREHOUSE_TYPES = ['main', 'regional', 'store', 'cold_storage'];
const BATCH_STATUS = ['active', 'depleted', 'expired', 'written_off'];
const TRANSFER_STATUS = ['pending', 'completed', 'cancelled'];

// e.g. ELE-SAM-00012  (category code - brand code - sequence)
const SKU_REGEX = /^[A-Z0-9]{2,6}(-[A-Z0-9]{2,8}){1,3}$/;

module.exports = {
  ROLES, MOVEMENT_TYPES, INBOUND_TYPES, OUTBOUND_TYPES, REFERENCE_KINDS,
  PRODUCT_UNITS, PRODUCT_STATUS, WAREHOUSE_TYPES, BATCH_STATUS, TRANSFER_STATUS, SKU_REGEX,
};
