// Zod request validators for Module 1.
const { z } = require('zod');
const {
  PRODUCT_UNITS, PRODUCT_STATUS, WAREHOUSE_TYPES, BATCH_STATUS, TRANSFER_STATUS, MOVEMENT_TYPES: T, SKU_REGEX,
} = require('../utils/constants');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParam = z.object({ id: objectId });
const qty = z.coerce.number().int('Must be a whole number').positive('Must be greater than 0').max(1_000_000);
const optDate = z.coerce.date().optional().nullable();
const boolish = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

const listQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.string().max(40).optional(),
  search: z.string().trim().max(100).optional(),
};

// ---------------- Categories ----------------
const categoryBody = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, 'Code must be 2–6 letters/digits'),
  description: z.string().trim().max(500).optional(),
  parent: objectId.nullable().optional(),
  isActive: z.boolean().optional(),
});

const category = {
  list: { query: z.object({ ...listQuery, isActive: boolish.optional() }) },
  create: { body: categoryBody },
  update: { params: idParam, body: categoryBody.partial() },
  byId: { params: idParam },
};

// ---------------- Products ----------------
const pricing = z.object({
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  mrp: z.coerce.number().min(0).optional().nullable(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  currency: z.string().length(3).optional(),
});

const productBody = z.object({
  sku: z.string().trim().toUpperCase().regex(SKU_REGEX, 'SKU must look like ELE-SAM-00012').optional().or(z.literal('')).transform((v) => v || undefined),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional(),
  category: objectId,
  brand: z.string().trim().max(60).optional(),
  unit: z.enum(PRODUCT_UNITS).optional(),
  pricing,
  attributes: z.array(z.object({ key: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(200) })).max(30).optional(),
  images: z.array(z.string().url()).max(10).optional(),
  reorderLevel: z.coerce.number().int().min(0).max(100000).optional(),
  isPerishable: z.boolean().optional(),
  shelfLifeDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  supplier: objectId.optional().nullable(),
  status: z.enum(PRODUCT_STATUS).optional(),
});

const product = {
  list: {
    query: z.object({
      ...listQuery,
      category: objectId.optional(),
      brand: z.string().max(60).optional(),
      status: z.enum(PRODUCT_STATUS).optional(),
      stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
      isPerishable: boolish.optional(),
      minPrice: z.coerce.number().min(0).optional(),
      maxPrice: z.coerce.number().min(0).optional(),
    }),
  },
  create: { body: productBody },
  update: { params: idParam, body: productBody.partial().extend({ pricing: pricing.partial().optional() }) },
  byId: { params: idParam },
  remove: { params: idParam, query: z.object({ hard: boolish.optional() }) },
  skuPreview: { query: z.object({ category: objectId, brand: z.string().max(60).optional() }) },
  skuCheck: { query: z.object({ sku: z.string().min(1).max(40), excludeId: objectId.optional() }) },
};

// ---------------- Warehouses ----------------
const warehouseBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Code must be 3–20 letters, digits or dashes'),
  name: z.string().trim().min(2).max(100),
  type: z.enum(WAREHOUSE_TYPES).optional(),
  address: z.object({
    line1: z.string().trim().min(2),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2),
    postalCode: z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/, 'Invalid postal code'),
    country: z.string().trim().optional(),
  }),
  location: z.object({
    type: z.literal('Point').default('Point'),
    coordinates: z.tuple([z.coerce.number().min(-180).max(180), z.coerce.number().min(-90).max(90)]),
  }),
  capacity: z.coerce.number().int().positive(),
  manager: objectId.nullable().optional(),
  contact: z.object({ phone: z.string().max(20).optional(), email: z.string().email().optional().or(z.literal('')) }).optional(),
  isActive: z.boolean().optional(),
});

const warehouse = {
  list: { query: z.object({ ...listQuery, type: z.enum(WAREHOUSE_TYPES).optional(), city: z.string().max(60).optional(), isActive: boolish.optional() }) },
  create: { body: warehouseBody },
  update: {
    params: idParam,
    body: warehouseBody.partial().extend({ address: warehouseBody.shape.address.partial().optional() }),
  },
  byId: { params: idParam },
  nearby: {
    query: z.object({
      lng: z.coerce.number().min(-180).max(180),
      lat: z.coerce.number().min(-90).max(90),
      maxDistanceKm: z.coerce.number().positive().max(20000).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    }),
  },
};

// ---------------- Stock operations ----------------
const stockBase = { productId: objectId, warehouseId: objectId, reason: z.string().trim().max(300).optional() };

const stock = {
  in: {
    body: z.object({
      ...stockBase,
      quantity: qty,
      batchNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-_/]{1,39}$/, 'Invalid batch number').optional().or(z.literal('')).transform((v) => v || undefined),
      expiryDate: optDate,
      manufactureDate: optDate,
      costPrice: z.coerce.number().min(0).optional(),
      supplierId: objectId.optional(),
      batchNotes: z.string().max(300).optional(),
    }).refine((d) => !d.expiryDate || !d.manufactureDate || d.expiryDate > d.manufactureDate, {
      message: 'Expiry date must be after manufacture date', path: ['expiryDate'],
    }),
  },
  out: {
    body: z.object({
      ...stockBase,
      quantity: qty,
      type: z.enum([T.STOCK_OUT, T.DAMAGED, T.EXPIRED]).default(T.STOCK_OUT),
      batchNumber: z.string().trim().toUpperCase().optional().or(z.literal('')).transform((v) => v || undefined),
      reason: z.string().trim().min(3, 'Please give a reason (min 3 characters)').max(300),
    }),
  },
  adjust: {
    body: z.object({
      ...stockBase,
      countedQuantity: z.coerce.number().int().min(0).max(1_000_000),
      expiryDate: optDate,
      reason: z.string().trim().min(3, 'Please give a reason').max(300),
    }),
  },
};

const inventory = {
  list: {
    query: z.object({
      ...listQuery,
      warehouse: objectId.optional(),
      product: objectId.optional(),
      category: objectId.optional(),
      stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'attention']).optional(),
    }),
  },
  settings: {
    params: idParam,
    body: z.object({ reorderLevel: z.coerce.number().int().min(0).nullable().optional(), binLocation: z.string().trim().max(40).optional() }),
  },
  logs: {
    query: z.object({
      ...listQuery,
      product: objectId.optional(),
      warehouse: objectId.optional(),
      type: z.string().regex(new RegExp(`^(${Object.values(T).join('|')})(,(${Object.values(T).join('|')}))*$`), 'Invalid movement type').optional(),
      direction: z.enum(['in', 'out']).optional(),
      referenceKind: z.string().max(30).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  },
  summary: { query: z.object({ days: z.coerce.number().int().min(1).max(365).optional(), warehouse: objectId.optional(), product: objectId.optional() }) },
};

// ---------------- Transfers ----------------
const transfer = {
  list: {
    query: z.object({
      ...listQuery,
      status: z.enum(TRANSFER_STATUS).optional(),
      warehouse: objectId.optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  },
  create: {
    body: z.object({
      fromWarehouse: objectId,
      toWarehouse: objectId,
      items: z.array(z.object({ product: objectId, quantity: qty })).min(1, 'Add at least one item').max(50),
      notes: z.string().trim().max(500).optional(),
      executeNow: z.boolean().optional(),
    }).refine((d) => d.fromWarehouse !== d.toWarehouse, { message: 'Source and destination must differ', path: ['toWarehouse'] }),
  },
  byId: { params: idParam },
  action: { params: idParam, body: z.object({ note: z.string().trim().max(300).optional(), reason: z.string().trim().max(300).optional() }) },
};

// ---------------- Batches ----------------
const batch = {
  list: {
    query: z.object({
      ...listQuery,
      product: objectId.optional(),
      warehouse: objectId.optional(),
      status: z.enum(BATCH_STATUS).optional(),
      expiry: z.enum(['expired', 'expiring', 'fresh']).optional(),
      days: z.coerce.number().int().min(1).max(365).optional(),
      inStock: z.enum(['true', 'false']).optional(),
    }),
  },
  byId: { params: idParam },
  update: {
    params: idParam,
    body: z.object({ notes: z.string().trim().max(300).optional(), expiryDate: optDate, manufactureDate: optDate }),
  },
  writeOff: {
    params: idParam,
    body: z.object({ reason: z.string().trim().min(3).max(300), type: z.enum([T.EXPIRED, T.DAMAGED]).default(T.EXPIRED) }),
  },
  summary: { query: z.object({ days: z.coerce.number().int().min(1).max(365).optional() }) },
};

module.exports = { category, product, warehouse, stock, inventory, transfer, batch, objectId };
