const mongoose = require('mongoose');
const { Warehouse, Inventory, InventoryLog, StockBatch } = require('../models');
const { ApiError, parsePagination, buildMeta, escapeRegex } = require('../utils/http');
const { audit } = require('../utils/events');
const env = require('../../../config/env');

// Shared stage: attach stock totals + utilisation % to each warehouse
const stockStats = [
  {
    $lookup: {
      from: 'inventory', let: { wid: '$_id' }, as: 'st',
      pipeline: [
        { $match: { $expr: { $eq: ['$warehouse', '$$wid'] } } },
        {
          $group: {
            _id: null,
            units: { $sum: '$quantity' },
            reserved: { $sum: '$reservedQuantity' },
            skus: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
          },
        },
      ],
    },
  },
  {
    $addFields: {
      totalUnits: { $ifNull: [{ $first: '$st.units' }, 0] },
      reservedUnits: { $ifNull: [{ $first: '$st.reserved' }, 0] },
      skuCount: { $ifNull: [{ $first: '$st.skus' }, 0] },
    },
  },
  { $addFields: { utilization: { $round: [{ $multiply: [{ $divide: ['$totalUnits', '$capacity'] }, 100] }, 1] } } },
  { $project: { st: 0 } },
];

async function listWarehouses(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: ['name', 'code', 'createdAt', 'capacity', 'utilization', 'totalUnits'], defaultSort: 'code', maxLimit: 200,
  });
  const match = {};
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    match.$or = [{ name: rx }, { code: rx }, { 'address.city': rx }];
  }
  if (query.type) match.type = query.type;
  if (query.city) match['address.city'] = { $regex: `^${escapeRegex(query.city)}$`, $options: 'i' };
  if (query.isActive !== undefined) match.isActive = query.isActive === true || query.isActive === 'true';
  if (user?.role === 'warehouse_manager' && user.warehouses?.length) {
    match._id = { $in: user.warehouses.map((w) => new mongoose.Types.ObjectId(String(w))) };
  }
  const [res] = await Warehouse.aggregate([
    { $match: match },
    ...stockStats,
    { $facet: { data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } },
  ]);
  return { data: res.data, meta: buildMeta(res.total[0]?.count || 0, page, limit) };
}

async function getWarehouse(id) {
  const _id = new mongoose.Types.ObjectId(String(id));
  const [wh] = await Warehouse.aggregate([{ $match: { _id } }, ...stockStats]);
  if (!wh) throw ApiError.notFound('Warehouse not found');

  const soon = new Date(Date.now() + env.expiryWarningDays * 86400000);
  const [byCategory, lowStock, expiringBatches] = await Promise.all([
    // Stock & value by category: inventory → product → category
    Inventory.aggregate([
      { $match: { warehouse: _id, quantity: { $gt: 0 } } },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'p', pipeline: [{ $project: { category: 1, 'pricing.costPrice': 1 } }] } },
      { $unwind: '$p' },
      { $group: { _id: '$p.category', units: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$quantity', '$p.pricing.costPrice'] } } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
      { $project: { _id: 0, categoryId: '$_id', category: { $ifNull: [{ $first: '$c.name' }, 'Uncategorised'] }, units: 1, value: { $round: ['$value', 2] } } },
      { $sort: { units: -1 } },
    ]),
    Inventory.aggregate([
      { $match: { warehouse: _id } },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'p', pipeline: [{ $project: { reorderLevel: 1 } }] } },
      { $unwind: '$p' },
      { $match: { $expr: { $lte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, { $ifNull: ['$reorderLevel', '$p.reorderLevel'] }] } } },
      { $count: 'n' },
    ]),
    StockBatch.countDocuments({ warehouse: _id, status: 'active', quantity: { $gt: 0 }, expiryDate: { $ne: null, $lte: soon } }),
  ]);
  return { ...wh, byCategory, lowStockCount: lowStock[0]?.n || 0, expiringBatches };
}

async function createWarehouse(data, user) {
  const wh = await Warehouse.create(data);
  audit('warehouse.created', 'Warehouse', wh._id, user?.id, { code: wh.code });
  return getWarehouse(wh._id);
}

async function updateWarehouse(id, data, user) {
  const wh = await Warehouse.findById(id);
  if (!wh) throw ApiError.notFound('Warehouse not found');
  if (data.capacity != null) {
    const [row] = await Inventory.aggregate([{ $match: { warehouse: wh._id } }, { $group: { _id: null, u: { $sum: '$quantity' } } }]);
    if ((row?.u || 0) > data.capacity) throw ApiError.conflict(`Capacity cannot be below current stock (${row.u} units)`);
  }
  if (data.isActive === false && wh.isActive) {
    const [row] = await Inventory.aggregate([{ $match: { warehouse: wh._id } }, { $group: { _id: null, u: { $sum: '$quantity' } } }]);
    if (row?.u > 0) throw ApiError.conflict(`Transfer the remaining ${row.u} unit(s) out before deactivating`);
  }
  if (data.address) data.address = { ...wh.address.toObject(), ...data.address };
  wh.set(data);
  await wh.save();
  audit('warehouse.updated', 'Warehouse', wh._id, user?.id);
  return getWarehouse(wh._id);
}

async function deleteWarehouse(id, user) {
  const wh = await Warehouse.findById(id);
  if (!wh) throw ApiError.notFound('Warehouse not found');
  const [row] = await Inventory.aggregate([{ $match: { warehouse: wh._id } }, { $group: { _id: null, u: { $sum: '$quantity' } } }]);
  if (row?.u > 0) throw ApiError.conflict(`Warehouse still holds ${row.u} unit(s). Transfer them out first.`);
  if (await InventoryLog.exists({ warehouse: wh._id })) {
    wh.isActive = false;
    await wh.save();
    audit('warehouse.deactivated', 'Warehouse', wh._id, user?.id);
    return { deleted: true, mode: 'soft', message: 'Warehouse has history, so it was deactivated' };
  }
  await Promise.all([wh.deleteOne(), Inventory.deleteMany({ warehouse: wh._id })]);
  audit('warehouse.deleted', 'Warehouse', wh._id, user?.id, { code: wh.code });
  return { deleted: true, mode: 'hard' };
}

/** Geospatial: warehouses nearest to a point ($geoNear on the 2dsphere index). */
async function nearbyWarehouses({ lng, lat, maxDistanceKm = 500, limit = 5 }) {
  return Warehouse.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        distanceField: 'distanceMeters',
        maxDistance: Number(maxDistanceKm) * 1000,
        query: { isActive: true },
        spherical: true,
      },
    },
    { $limit: Number(limit) },
    { $project: { code: 1, name: 1, type: 1, address: 1, location: 1, distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] } } },
  ]);
}

module.exports = { listWarehouses, getWarehouse, createWarehouse, updateWarehouse, deleteWarehouse, nearbyWarehouses };
