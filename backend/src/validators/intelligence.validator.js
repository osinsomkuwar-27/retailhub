const { isId, HttpError } = require('../utils/intelligence/shared');

const objectIdParams = (...names) => (req, res, next) => {
  for (const n of names) if (!isId(req.params[n])) return next(new HttpError(400, `Invalid ${n}`));
  next();
};

const body = (rules) => (req, res, next) => {
  const errors = [];
  for (const [f, r] of Object.entries(rules)) {
    const v = req.body[f];
    if (v === undefined || v === null || v === '') { if (r.required) errors.push(`${f} is required`); continue; }
    if (r.type === 'number' && (typeof v !== 'number' || Number.isNaN(v) || (r.min !== undefined && v < r.min))) errors.push(`${f} must be a number${r.min !== undefined ? ` >= ${r.min}` : ''}`);
    if (r.type === 'id' && !isId(v)) errors.push(`${f} must be a valid id`);
    if (r.type === 'string' && typeof v !== 'string') errors.push(`${f} must be a string`);
    if (r.enum && !r.enum.includes(v)) errors.push(`${f} must be one of ${r.enum.join(', ')}`);
  }
  if (errors.length) return next(new HttpError(400, 'Validation failed', errors));
  next();
};

const lineItems = (field, qtyField) => (req, res, next) => {
  const arr = req.body[field];
  if (!Array.isArray(arr) || !arr.length) return next(new HttpError(400, `${field} must be a non-empty array`));
  for (const i of arr) {
    if (!isId(i.product)) return next(new HttpError(400, `${field}: invalid product id`));
    if (typeof i[qtyField] !== 'number' || i[qtyField] <= 0) return next(new HttpError(400, `${field}: ${qtyField} must be > 0`));
  }
  next();
};

module.exports = {
  objectIdParams, lineItems,
  reorderRule: body({
    safetyStock: { type: 'number', min: 0 }, leadTimeDays: { type: 'number', min: 0 },
    reviewPeriodDays: { type: 'number', min: 0 }, minOrderQty: { type: 'number', min: 1 }, preferredSupplier: { type: 'id' },
  }),
  supplier: body({ name: { required: true, type: 'string' }, code: { required: true, type: 'string' }, leadTimeDays: { type: 'number', min: 0 } }),
  supplierUpdate: body({ name: { type: 'string' }, leadTimeDays: { type: 'number', min: 0 } }),
  supplierOrder: body({ supplier: { required: true, type: 'id' } }),
  anomalyReview: body({ status: { required: true, enum: ['INVESTIGATING', 'CONFIRMED', 'DISMISSED'] }, note: { type: 'string' } }),
};