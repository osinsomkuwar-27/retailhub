// Read-side of inventory: stock lists, low-stock, movement history, dashboard.
const mongoose = require('mongoose');
const { Inventory, InventoryLog, Product, Category, Warehouse, StockBatch, StockTransfer } = require('../models');
const { ApiError, parsePagination, buildMeta, escapeRegex } = require('../utils/http');
const { audit } = require('../utils/events');
const { assertWarehouseAccess } = require('../middleware/auth');
const env = require('../../../config/env');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

function scopedWarehouses(user) {
  if (user?.role === 'warehouse_manager' && user.warehouses?.length) return user.warehouses.map(oid);
  return null;
}

/**
 * Stock rows with product + warehouse joined, computed availability, value and status.
 */
async function listInventory(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: ['quantity', 'available', 'stockValue', 'updatedAt', 'product.name'], defaultSort: 'product.name',
  });
  const match = {};
  if (query.warehouse) match.warehouse = oid(query.warehouse);
  if (query.product) match.product = oid(query.product);
  const scope = scopedWarehouses(user);
  if (scope) match.warehouse = query.warehouse ? (scope.some((w) => w.equals(match.warehouse)) ? match.warehouse : { $in: [] }) : { $in: scope };

  const post = {};
  if (query.category) post['product.category'] = oid(query.category);
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    post.$or = [{ 'product.name': rx }, { 'product.sku': rx }];
  }
  if (query.stockStatus === 'attention') post.stockStatus = { $in: ['low_stock', 'out_of_stock'] };
  else if (query.stockStatus) post.stockStatus = query.stockStatus;

  const [res] = await Inventory.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'products', localField: 'product', foreignField: '_id', as: 'product',
        pipeline: [{ $project: { sku: 1, name: 1, unit: 1, category: 1, reorderLevel: 1, isPerishable: 1, shelfLifeDays: 1, status: 1, 'pricing.costPrice': 1 } }],
      },
    },
    { $unwind: '$product' },
    { $lookup: { from: 'warehouses', localField: 'warehouse', foreignField: '_id', as: 'warehouse', pipeline: [{ $project: { code: 1, name: 1 } }] } },
    { $unwind: '$warehouse' },
    {
      $addFields: {
        available: { $subtract: ['$quantity', '$reservedQuantity'] },
        effectiveReorderLevel: { $ifNull: ['$reorderLevel', '$product.reorderLevel'] },
        stockValue: { $round: [{ $multiply: ['$quantity', '$product.pricing.costPrice'] }, 2] },
      },
    },
    {
      $addFields: {
        stockStatus: {
          $switch: {
            branches: [
              { case: { $lte: ['$available', 0] }, then: 'out_of_stock' },
              { case: { $lte: ['$available', '$effectiveReorderLevel'] }, then: 'low_stock' },
            ],
            default: 'in_stock',
          },
        },
        // how far below the threshold (for sorting "most urgent first")
        shortfall: { $max: [0, { $subtract: [{ $ifNull: ['$reorderLevel', '$product.reorderLevel'] }, { $subtract: ['$quantity', '$reservedQuantity'] }] }] },
      },
    },
    { $match: post },
    {
      $facet: {
        data: [{ $sort: query.sort ? sort : (query.stockStatus ? { shortfall: -1, _id: 1 } : sort) }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
        totals: [{ $group: { _id: null, units: { $sum: '$quantity' }, value: { $sum: '$stockValue' } } }],
      },
    },
  ]);
  return {
    data: res.data,
    meta: { ...buildMeta(res.total[0]?.count || 0, page, limit), totalUnits: res.totals[0]?.units || 0, totalValue: res.totals[0]?.value || 0 },
  };
}

const listLowStock = (query, user) => listInventory({ ...query, stockStatus: query.stockStatus || 'attention' }, user);

/** Per-row settings: reorder level override, bin location. */
async function updateInventorySettings(id, data, user) {
  const inv = await Inventory.findById(id);
  if (!inv) throw ApiError.notFound('Inventory record not found');
  assertWarehouseAccess(user, inv.warehouse);
  if (data.reorderLevel !== undefined) inv.reorderLevel = data.reorderLevel;
  if (data.binLocation !== undefined) inv.binLocation = data.binLocation;
  await inv.save();
  audit('inventory.settingsUpdated', 'Inventory', inv._id, user.id, data);
  return inv.toObject();
}

/** Movement history with joins, filters and pagination. */
async function listLogs(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, { allowedSort: ['createdAt', 'quantityChange', 'type'], defaultSort: '-createdAt' });
  const match = {};
  if (query.product) match.product = oid(query.product);
  if (query.warehouse) match.warehouse = oid(query.warehouse);
  const scope = scopedWarehouses(user);
  if (scope && !query.warehouse) match.warehouse = { $in: scope };
  if (query.type) match.type = { $in: String(query.type).split(',') };
  if (query.direction === 'in') match.quantityChange = { $gt: 0 };
  if (query.direction === 'out') match.quantityChange = { $lt: 0 };
  if (query.referenceKind) match['reference.kind'] = query.referenceKind;
  if (query.from || query.to) {
    match.createdAt = {};
    if (query.from) match.createdAt.$gte = new Date(query.from);
    if (query.to) match.createdAt.$lte = new Date(`${query.to}T23:59:59.999Z`);
  }
  const productSearch = query.search
    ? { $or: [{ 'product.name': { $regex: escapeRegex(query.search), $options: 'i' } }, { 'product.sku': { $regex: escapeRegex(query.search), $options: 'i' } }, { 'reference.code': { $regex: escapeRegex(query.search), $options: 'i' } }] }
    : {};

  const [res] = await InventoryLog.aggregate([
    { $match: match },
    { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product', pipeline: [{ $project: { sku: 1, name: 1, unit: 1 } }] } },
    { $unwind: '$product' },
    { $match: productSearch },
    {
      $facet: {
        data: [
          { $sort: sort }, { $skip: skip }, { $limit: limit },
          { $lookup: { from: 'warehouses', localField: 'warehouse', foreignField: '_id', as: 'warehouse', pipeline: [{ $project: { code: 1, name: 1 } }] } },
          { $unwind: '$warehouse' },
          // users collection belongs to Person 4 — join is harmless if it doesn't exist yet
          { $lookup: { from: 'users', localField: 'performedBy', foreignField: '_id', as: 'performedBy', pipeline: [{ $project: { name: 1, email: 1, role: 1 } }] } },
          { $addFields: { performedBy: { $first: '$performedBy' } } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  return { data: res.data, meta: buildMeta(res.total[0]?.count || 0, page, limit) };
}

/** Daily in/out totals for charts. */
async function movementSummary({ days = 30, warehouse, product }) {
  const since = new Date(Date.now() - Number(days) * 86400000);
  const match = { createdAt: { $gte: since } };
  if (warehouse) match.warehouse = oid(warehouse);
  if (product) match.product = oid(product);
  const [byDay, byType] = await Promise.all([
    InventoryLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          inbound: { $sum: { $cond: [{ $gt: ['$quantityChange', 0] }, '$quantityChange', 0] } },
          outbound: { $sum: { $cond: [{ $lt: ['$quantityChange', 0] }, { $abs: '$quantityChange' }, 0] } },
          movements: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', inbound: 1, outbound: 1, movements: 1 } },
    ]),
    InventoryLog.aggregate([
      { $match: match },
      { $group: { _id: '$type', count: { $sum: 1 }, units: { $sum: { $abs: '$quantityChange' } } } },
      { $project: { _id: 0, type: '$_id', count: 1, units: 1 } },
      { $sort: { units: -1 } },
    ]),
  ]);
  return { days: Number(days), byDay, byType };
}

/** Inventory Dashboard — several aggregations in parallel, inventory stats via $facet. */
async function getDashboard(user) {
  const scope = scopedWarehouses(user);
  const invMatch = scope ? { warehouse: { $in: scope } } : {};
  const soon = new Date(Date.now() + env.expiryWarningDays * 86400000);
  const now = new Date();

  const [products, categories, warehouses, pendingTransfers, invFacet, expiringSoon, expired, recentMovements, trend] = await Promise.all([
    Product.countDocuments({ status: 'active' }),
    Category.countDocuments({ isActive: true }),
    Warehouse.countDocuments(scope ? { _id: { $in: scope }, isActive: true } : { isActive: true }),
    StockTransfer.countDocuments({ status: 'pending' }),
    Inventory.aggregate([
      { $match: invMatch },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'p', pipeline: [{ $project: { name: 1, sku: 1, reorderLevel: 1, category: 1, 'pricing.costPrice': 1 } }] } },
      { $unwind: '$p' },
      {
        $addFields: {
          available: { $subtract: ['$quantity', '$reservedQuantity'] },
          level: { $ifNull: ['$reorderLevel', '$p.reorderLevel'] },
          value: { $multiply: ['$quantity', '$p.pricing.costPrice'] },
        },
      },
      {
        $facet: {
          totals: [{ $group: { _id: null, units: { $sum: '$quantity' }, reserved: { $sum: '$reservedQuantity' }, value: { $sum: '$value' } } }],
          lowStock: [{ $match: { $expr: { $and: [{ $gt: ['$available', 0] }, { $lte: ['$available', '$level'] }] } } }, { $count: 'n' }],
          outOfStock: [{ $match: { available: { $lte: 0 } } }, { $count: 'n' }],
          byWarehouse: [
            { $group: { _id: '$warehouse', units: { $sum: '$quantity' }, value: { $sum: '$value' } } },
            { $lookup: { from: 'warehouses', localField: '_id', foreignField: '_id', as: 'w' } },
            { $unwind: '$w' },
            { $project: { _id: 0, warehouseId: '$_id', code: '$w.code', name: '$w.name', capacity: '$w.capacity', units: 1, value: { $round: ['$value', 2] } } },
            { $sort: { units: -1 } },
          ],
          byCategory: [
            { $group: { _id: '$p.category', units: { $sum: '$quantity' }, value: { $sum: '$value' } } },
            { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
            { $project: { _id: 0, category: { $ifNull: [{ $first: '$c.name' }, 'Uncategorised'] }, units: 1, value: { $round: ['$value', 2] } } },
            { $sort: { value: -1 } },
          ],
          urgent: [
            { $match: { $expr: { $lte: ['$available', '$level'] } } },
            { $lookup: { from: 'warehouses', localField: 'warehouse', foreignField: '_id', as: 'w' } },
            { $project: { _id: 1, product: { _id: '$p._id', name: '$p.name', sku: '$p.sku' }, warehouse: { $first: '$w.code' }, available: 1, reorderLevel: '$level' } },
            { $sort: { available: 1 } },
            { $limit: 6 },
          ],
        },
      },
    ]),
    StockBatch.countDocuments({ ...invMatch, status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now, $lte: soon } }),
    StockBatch.countDocuments({ ...invMatch, status: { $in: ['active', 'expired'] }, quantity: { $gt: 0 }, expiryDate: { $lte: now } }),
    listLogs({ limit: 8 }, user),
    movementSummary({ days: 14 }),
  ]);

  const f = invFacet[0];
  return {
    counts: {
      products, categories, warehouses, pendingTransfers,
      lowStock: f.lowStock[0]?.n || 0,
      outOfStock: f.outOfStock[0]?.n || 0,
      expiringSoon, expired,
    },
    stock: {
      totalUnits: f.totals[0]?.units || 0,
      reservedUnits: f.totals[0]?.reserved || 0,
      inventoryValue: Math.round((f.totals[0]?.value || 0) * 100) / 100,
    },
    byWarehouse: f.byWarehouse,
    byCategory: f.byCategory,
    urgentLowStock: f.urgent,
    recentMovements: recentMovements.data,
    movementTrend: trend.byDay,
    expiryWarningDays: env.expiryWarningDays,
  };
}

module.exports = { listInventory, listLowStock, updateInventorySettings, listLogs, movementSummary, getDashboard };
