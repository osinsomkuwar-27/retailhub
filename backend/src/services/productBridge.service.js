const mongoose = require('mongoose');

/**
 * Product & Inventory Integration Bridge (Person 2)
 *
 * Adheres strictly to integration rules:
 * - Does NOT register a conflicting Mongoose model if Person 1 has defined or will define it.
 * - Safely detects if Person 1's Product / Inventory models exist in Mongoose.
 * - Falls back to querying native MongoDB collections ('products', 'inventories') if models are not registered in Mongoose.
 * - Stock is calculated ONLY from real inventory data.
 *   Calculates NET SELLABLE stock by checking availableQuantity or deducting reservedQuantity / damagedQuantity.
 *   Never invents fake stock values.
 */

// Helper to calculate net sellable quantity from an inventory document
const calculateSellableQuantity = (record) => {
  if (!record) return 0;

  // 1. Explicit available/sellable fields take precedence if maintained by Person 1
  if (record.availableQuantity !== undefined && !isNaN(Number(record.availableQuantity))) {
    return Math.max(0, Number(record.availableQuantity));
  }
  if (record.sellableQuantity !== undefined && !isNaN(Number(record.sellableQuantity))) {
    return Math.max(0, Number(record.sellableQuantity));
  }

  // 2. Net calculation: total on-hand minus reserved and damaged units
  const total = Number(record.quantity) || 0;
  const reserved = Number(record.reservedQuantity) || 0;
  const damaged = Number(record.damagedQuantity) || 0;

  return Math.max(0, total - reserved - damaged);
};

// Helper to get Product model or collection
const getProductSource = () => {
  if (mongoose.models && mongoose.models.Product) {
    return { type: 'model', target: mongoose.models.Product };
  }
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return { type: 'collection', target: mongoose.connection.db.collection('products') };
  }
  return null;
};

// Helper to get Inventory model or collection
const getInventorySource = () => {
  if (mongoose.models && mongoose.models.Inventory) {
    return { type: 'model', target: mongoose.models.Inventory };
  }
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return { type: 'collection', target: mongoose.connection.db.collection('inventories') };
  }
  return null;
};

/**
 * Get net available/sellable stock for a product from existing inventory records
 */
const getAvailableStockForProduct = async (productId, defaultProductStock = 0) => {
  try {
    const invSource = getInventorySource();
    if (!invSource) return Number(defaultProductStock) || 0;

    const oid = mongoose.Types.ObjectId.isValid(productId)
      ? new mongoose.Types.ObjectId(String(productId))
      : productId;

    if (invSource.type === 'model') {
      const records = await invSource.target.find({ product: oid }).lean();
      if (records && records.length > 0) {
        return records.reduce((sum, r) => sum + calculateSellableQuantity(r), 0);
      }
    } else if (invSource.type === 'collection') {
      const records = await invSource.target.find({ $or: [{ product: oid }, { product: String(productId) }] }).toArray();
      if (records && records.length > 0) {
        return records.reduce((sum, r) => sum + calculateSellableQuantity(r), 0);
      }
    }

    return Number(defaultProductStock) || 0;
  } catch (err) {
    console.error(`[productBridge] Error calculating stock for ${productId}:`, err.message);
    return Number(defaultProductStock) || 0;
  }
};

/**
 * List products with search, category filtering, price range, and sorting.
 */
const listProducts = async ({
  search = '',
  category = '',
  minPrice,
  maxPrice,
  inStock,
  sortBy = 'newest',
  page = 1,
  limit = 12,
} = {}) => {
  const prodSource = getProductSource();
  if (!prodSource) {
    return {
      products: [],
      pagination: { total: 0, page: 1, limit, pages: 0 },
      sourceInfo: 'Database not connected or Product collection unavailable',
    };
  }

  const query = {};

  if (search && search.trim()) {
    const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: regex }, { description: regex }, { sku: regex }, { category: regex }];
  }

  if (category && category.trim()) {
    query.category = new RegExp(`^${category.trim()}$`, 'i');
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {};
    if (minPrice !== undefined && !isNaN(Number(minPrice))) query.price.$gte = Number(minPrice);
    if (maxPrice !== undefined && !isNaN(Number(maxPrice))) query.price.$lte = Number(maxPrice);
  }

  let sort = { createdAt: -1 };
  if (sortBy === 'price_asc') sort = { price: 1 };
  else if (sortBy === 'price_desc') sort = { price: -1 };
  else if (sortBy === 'name') sort = { name: 1 };
  else if (sortBy === 'newest') sort = { createdAt: -1, _id: -1 };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
  const skip = (pageNum - 1) * limitNum;

  let rawProducts = [];
  let total = 0;

  if (prodSource.type === 'model') {
    [total, rawProducts] = await Promise.all([
      prodSource.target.countDocuments(query),
      prodSource.target.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
    ]);
  } else {
    total = await prodSource.target.countDocuments(query);
    rawProducts = await prodSource.target.find(query).sort(sort).skip(skip).limit(limitNum).toArray();
  }

  // Populate verified real net inventory stock
  const enrichedProducts = await Promise.all(
    rawProducts.map(async (p) => {
      const stock = await getAvailableStockForProduct(p._id, p.stockQuantity ?? p.stock);
      return {
        _id: p._id,
        name: p.name || 'Unnamed Product',
        sku: p.sku || '',
        description: p.description || '',
        category: p.category || 'General',
        price: Number(p.price) || 0,
        costPrice: Number(p.costPrice) || 0,
        images: Array.isArray(p.images) && p.images.length ? p.images : [p.image || '/placeholder-product.svg'],
        stock,
        isInStock: stock > 0,
        createdAt: p.createdAt,
      };
    })
  );

  const filteredProducts = inStock === 'true' || inStock === true
    ? enrichedProducts.filter((p) => p.isInStock)
    : enrichedProducts;

  return {
    products: filteredProducts,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
    sourceInfo: prodSource.type === 'model' ? 'Person 1 Product Mongoose Model' : 'Raw MongoDB products collection',
  };
};

/**
 * Retrieve single product details by ID along with inventory stock
 */
const getProductById = async (id) => {
  const prodSource = getProductSource();
  if (!prodSource) return null;

  const oid = mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(String(id))
    : id;

  let product = null;
  if (prodSource.type === 'model') {
    product = await prodSource.target.findById(oid).lean();
  } else {
    product = await prodSource.target.findOne({ _id: oid });
  }

  if (!product) return null;

  const stock = await getAvailableStockForProduct(product._id, product.stockQuantity ?? product.stock);

  return {
    _id: product._id,
    name: product.name,
    sku: product.sku || '',
    description: product.description || '',
    category: product.category || 'General',
    price: Number(product.price) || 0,
    costPrice: Number(product.costPrice) || 0,
    images: Array.isArray(product.images) && product.images.length ? product.images : [product.image || '/placeholder-product.svg'],
    stock,
    isInStock: stock > 0,
    lowStockThreshold: product.lowStockThreshold || 10,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

/**
 * Get distinct categories from existing product records
 */
const getCategories = async () => {
  const prodSource = getProductSource();
  if (!prodSource) return [];

  if (prodSource.type === 'model') {
    return prodSource.target.distinct('category');
  } else {
    return prodSource.target.distinct('category');
  }
};

module.exports = {
  listProducts,
  getProductById,
  getCategories,
  getAvailableStockForProduct,
  calculateSellableQuantity,
};
