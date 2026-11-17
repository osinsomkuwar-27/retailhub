const mongoose = require('mongoose');
const { Product, Category, Inventory, InventoryLog, StockBatch, Counter } = require('../models');
const { ApiError, parsePagination, buildMeta, escapeRegex } = require('../utils/http');
const { SKU_REGEX } = require('../utils/constants');
const { audit } = require('../utils/events');
const { isStaff } = require('../middleware/auth');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// ---------------------------------------------------------------------------
// SKU generation & validation
// Format: <CATEGORY CODE>-<BRAND CODE>-<5-digit sequence>  e.g. ELE-SAM-00012
// ---------------------------------------------------------------------------
const brandCode = (brand) => (String(brand || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'GEN').padEnd(3, 'X');

async function generateSku(categoryId, brand) {
  const category = await Category.findById(categoryId).lean();
  if (!category) throw ApiError.badRequest('Category not found');
  const prefix = `${category.code}-${brandCode(brand)}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seq = await Counter.next(`sku:${prefix}`);
    const sku = `${prefix}-${String(seq).padStart(5, '0')}`;
    if (!(await Product.exists({ sku }))) return sku; // skip numbers taken by manual SKUs
  }
  throw ApiError.conflict('Could not generate a unique SKU, please retry');
}

async function previewSku(categoryId, brand) {
  const category = await Category.findById(categoryId).lean();
  if (!category) throw ApiError.badRequest('Category not found');
  const prefix = `${category.code}-${brandCode(brand)}`;
  const seq = await Counter.peek(`sku:${prefix}`);
  return { sku: `${prefix}-${String(seq).padStart(5, '0')}`, note: 'Preview only — final SKU is assigned on save' };
}

async function checkSku(sku, excludeId) {
  const value = String(sku || '').toUpperCase().trim();
  if (!SKU_REGEX.test(value)) return { sku: value, valid: false, available: false, message: 'Invalid format (e.g. ELE-SAM-00012)' };
  const filter = { sku: value };
  if (excludeId) filter._id = { $ne: excludeId };
  const taken = await Product.exists(filter);
  return { sku: value, valid: true, available: !taken, message: taken ? 'SKU already in use' : 'SKU is available' };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function assertCategory(id) {
  const category = await Category.findById(id).lean();
  if (!category) throw ApiError.badRequest('Category not found');
  if (!category.isActive) throw ApiError.badRequest('Category is inactive');
  return category;
}

async function createProduct(data, user) {
  await assertCategory(data.category);
  let { sku } = data;
  if (sku) {
    const check = await checkSku(sku);
    if (!check.valid) throw ApiError.badRequest(check.message);
    if (!check.available) throw ApiError.conflict(check.message);
    sku = check.sku;
  } else {
    sku = await generateSku(data.category, data.brand);
  }
  const product = await Product.create({ ...data, sku, createdBy: user?.id, updatedBy: user?.id });
  audit('product.created', 'Product', product._id, user?.id, { sku });
  return getProduct(product._id, user);
}

async function updateProduct(id, data, user) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  if (data.category && String(data.category) !== String(product.category)) await assertCategory(data.category);

  if (data.sku && data.sku.toUpperCase() !== product.sku) {
    // SKU is frozen once stock has moved (logs/orders reference it)
    if (await InventoryLog.exists({ product: product._id })) {
      throw ApiError.conflict('SKU cannot be changed after stock movements exist');
    }
    const check = await checkSku(data.sku, product._id);
    if (!check.valid) throw ApiError.badRequest(check.message);
    if (!check.available) throw ApiError.conflict(check.message);
    data.sku = check.sku;
  } else {
    delete data.sku;
  }

  if (data.pricing) data.pricing = { ...product.pricing.toObject(), ...data.pricing };
  product.set({ ...data, updatedBy: user?.id });
  await product.save();
  audit('product.updated', 'Product', product._id, user?.id, { fields: Object.keys(data) });
  return getProduct(product._id, user);
}

/**
 * Products with stock are never deleted.
 * Products that ever moved stock are soft-deleted (status = discontinued) so
 * orders/logs keep valid references. Brand-new products can be hard-deleted.
 */
async function deleteProduct(id, user, { hard = false } = {}) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  const [stock] = await Inventory.aggregate([
    { $match: { product: product._id } },
    { $group: { _id: null, qty: { $sum: '$quantity' } } },
  ]);
  if (stock?.qty > 0) throw ApiError.conflict(`Product still has ${stock.qty} unit(s) in stock. Reduce or transfer stock first.`);

  const hasHistory = await InventoryLog.exists({ product: product._id });
  if (hard && !hasHistory) {
    await Promise.all([
      Product.deleteOne({ _id: product._id }),
      Inventory.deleteMany({ product: product._id }),
      StockBatch.deleteMany({ product: product._id }),
    ]);
    audit('product.deleted', 'Product', product._id, user?.id, { sku: product.sku });
    return { deleted: true, mode: 'hard' };
  }
  product.status = 'discontinued';
  product.updatedBy = user?.id;
  await product.save();
  audit('product.discontinued', 'Product', product._id, user?.id, { sku: product.sku });
  return { deleted: true, mode: 'soft', message: hasHistory ? 'Product has history, so it was marked discontinued' : 'Product marked discontinued' };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Product listing = one aggregation pipeline:
 *   $match ($text search + filters) → $lookup category → $lookup inventory
 *   ($group sum per product) → stock status → $facet (page + total count)
 */
async function listProducts(query, user) {
  const staff = isStaff(user);
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: ['name', 'sku', 'createdAt', 'pricing.sellingPrice', 'totalStock'],
    defaultSort: query.search ? 'score' : '-createdAt',
  });

  const run = async (useText) => {
    const match = {};
    if (query.search) {
      if (useText) match.$text = { $search: query.search };
      else {
        const rx = { $regex: escapeRegex(query.search), $options: 'i' };
        match.$or = [{ name: rx }, { sku: rx }, { brand: rx }];
      }
    }
    if (query.category) match.category = oid(query.category);
    if (query.brand) match.brand = { $regex: `^${escapeRegex(query.brand)}$`, $options: 'i' };
    if (staff && query.status) match.status = query.status;
    if (!staff) match.status = 'active'; // customers only see sellable products
    if (query.isPerishable !== undefined) match.isPerishable = query.isPerishable === true || query.isPerishable === 'true';
    if (query.minPrice != null || query.maxPrice != null) {
      match['pricing.sellingPrice'] = {};
      if (query.minPrice != null) match['pricing.sellingPrice'].$gte = Number(query.minPrice);
      if (query.maxPrice != null) match['pricing.sellingPrice'].$lte = Number(query.maxPrice);
    }

    const pipeline = [{ $match: match }];
    if (useText && query.search) pipeline.push({ $addFields: { score: { $meta: 'textScore' } } });
    pipeline.push(
      {
        $lookup: {
          from: 'categories', localField: 'category', foreignField: '_id', as: 'category',
          pipeline: [{ $project: { name: 1, code: 1, slug: 1 } }],
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'inventory',
          let: { pid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$product', '$$pid'] } } },
            { $group: { _id: null, qty: { $sum: '$quantity' }, reserved: { $sum: '$reservedQuantity' }, warehouses: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } } } },
          ],
          as: 'stock',
        },
      },
      {
        $addFields: {
          totalStock: { $ifNull: [{ $first: '$stock.qty' }, 0] },
          availableStock: { $subtract: [{ $ifNull: [{ $first: '$stock.qty' }, 0] }, { $ifNull: [{ $first: '$stock.reserved' }, 0] }] },
          warehouseCount: { $ifNull: [{ $first: '$stock.warehouses' }, 0] },
        },
      },
      {
        $addFields: {
          stockStatus: {
            $switch: {
              branches: [
                { case: { $lte: ['$availableStock', 0] }, then: 'out_of_stock' },
                { case: { $lte: ['$availableStock', '$reorderLevel'] }, then: 'low_stock' },
              ],
              default: 'in_stock',
            },
          },
        },
      },
    );
    if (query.stockStatus) pipeline.push({ $match: { stockStatus: query.stockStatus } });

    const sortStage = 'score' in sort ? { score: -1, _id: 1 } : sort;
    const projection = staff
      ? { stock: 0, score: 0 }
      : { stock: 0, score: 0, 'pricing.costPrice': 0, costPrice: 0, createdBy: 0, updatedBy: 0, totalStock: 0, warehouseCount: 0 };
    pipeline.push({
      $facet: {
        data: [{ $sort: sortStage }, { $skip: skip }, { $limit: limit }, { $project: projection }],
        total: [{ $count: 'count' }],
      },
    });
    const [res] = await Product.aggregate(pipeline);
    return { data: res.data, total: res.total[0]?.count || 0 };
  };

  // $text matches whole words; fall back to partial (regex) matching if it finds nothing
  let result = await run(true);
  if (query.search && result.total === 0) result = await run(false);
  return { data: result.data, meta: buildMeta(result.total, page, limit) };
}

async function getProduct(id, user) {
  const product = await Product.findById(id).populate('category', 'name code slug').lean();
  if (!product) throw ApiError.notFound('Product not found');
  if (!isStaff(user)) {
    if (product.status !== 'active') throw ApiError.notFound('Product not found');
    delete product.pricing.costPrice;
    delete product.costPrice;
  }
  const [stock] = await Inventory.aggregate([
    { $match: { product: product._id } },
    { $group: { _id: null, qty: { $sum: '$quantity' }, reserved: { $sum: '$reservedQuantity' } } },
  ]);
  product.totalStock = stock?.qty || 0;
  product.availableStock = (stock?.qty || 0) - (stock?.reserved || 0);
  if (!isStaff(user)) delete product.totalStock;
  return product;
}

/** Per-warehouse breakdown + active batches for the product details panel. */
async function getProductStock(id) {
  const product = await Product.findById(id).select('sku name reorderLevel unit isPerishable').lean();
  if (!product) throw ApiError.notFound('Product not found');
  const [warehouses, batches] = await Promise.all([
    Inventory.aggregate([
      { $match: { product: product._id } },
      { $lookup: { from: 'warehouses', localField: 'warehouse', foreignField: '_id', as: 'warehouse', pipeline: [{ $project: { code: 1, name: 1, 'address.city': 1 } }] } },
      { $unwind: '$warehouse' },
      {
        $project: {
          warehouse: 1, quantity: 1, reservedQuantity: 1, binLocation: 1, lastStockInAt: 1, lastStockOutAt: 1,
          available: { $subtract: ['$quantity', '$reservedQuantity'] },
          reorderLevel: { $ifNull: ['$reorderLevel', product.reorderLevel] },
        },
      },
      { $sort: { quantity: -1 } },
    ]),
    StockBatch.find({ product: product._id, quantity: { $gt: 0 } })
      .populate('warehouse', 'code name')
      .sort({ expiryDate: 1, receivedAt: 1 })
      .lean(),
  ]);
  return { product, warehouses, batches };
}

module.exports = {
  generateSku, previewSku, checkSku, createProduct, updateProduct, deleteProduct,
  listProducts, getProduct, getProductStock,
};
