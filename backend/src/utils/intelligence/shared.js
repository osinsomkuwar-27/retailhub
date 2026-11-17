// Single adjustment point for shared infrastructure (auth, logger, errors, helpers).
const mongoose = require('mongoose');
const cfg = require('../../config/intelligence.config');

let logger;
try { logger = require('../logger'); } catch (_) { logger = console; }

const { protect, authorize } = require('../../middleware/auth.middleware');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.statusCode = status; this.status = status; this.details = details; this.isOperational = true;
  }
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

const lazy = (key) => mongoose.model(cfg.models[key]);
const models = {
  get Product() { return lazy('Product'); },
  get Inventory() { return lazy('Inventory'); },
  get Warehouse() { return lazy('Warehouse'); },
  get StockBatch() { return lazy('StockBatch'); },
  get InventoryLog() { return lazy('InventoryLog'); },
  get Order() { return lazy('Order'); },
};

const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parsePaging = (q) => ({
  page: Math.max(1, parseInt(q.page, 10) || 1),
  limit: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20)),
});
const paginate = (arr, page, limit) => ({
  rows: arr.slice((page - 1) * limit, page * limit),
  meta: { page, limit, total: arr.length, pages: Math.max(1, Math.ceil(arr.length / limit)) },
});
const DAY = 86400000;

module.exports = {
  logger, protect, authorize, HttpError, asyncHandler, ok, models,
  isId, oid, escapeRegex, parsePaging, paginate, DAY,
};