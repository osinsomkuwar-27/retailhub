const { Category, Product } = require('../models');
const { ApiError, parsePagination, buildMeta, escapeRegex } = require('../utils/http');
const { audit } = require('../utils/events');

async function listCategories(query) {
  const { page, limit, skip, sort } = parsePagination(query, {
    allowedSort: ['name', 'code', 'createdAt', 'productCount'], defaultSort: 'name', maxLimit: 200,
  });
  const match = {};
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    match.$or = [{ name: rx }, { code: rx }];
  }
  if (query.isActive !== undefined) match.isActive = query.isActive === true || query.isActive === 'true';

  const [res] = await Category.aggregate([
    { $match: match },
    // $lookup with a sub-pipeline that only counts → no product docs are loaded
    {
      $lookup: {
        from: 'products', let: { cid: '$_id' }, as: 'pc',
        pipeline: [{ $match: { $expr: { $eq: ['$category', '$$cid'] }, status: { $ne: 'discontinued' } } }, { $count: 'n' }],
      },
    },
    { $lookup: { from: 'categories', localField: 'parent', foreignField: '_id', as: 'parent', pipeline: [{ $project: { name: 1, code: 1 } }] } },
    { $addFields: { productCount: { $ifNull: [{ $first: '$pc.n' }, 0] }, parent: { $first: '$parent' } } },
    { $project: { pc: 0 } },
    { $facet: { data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } },
  ]).collation({ locale: 'en', strength: 2 });
  return { data: res.data, meta: buildMeta(res.total[0]?.count || 0, page, limit) };
}

async function getCategory(id) {
  const c = await Category.findById(id).populate('parent', 'name code').lean();
  if (!c) throw ApiError.notFound('Category not found');
  c.productCount = await Product.countDocuments({ category: c._id, status: { $ne: 'discontinued' } });
  return c;
}

async function assertParent(parentId, selfId) {
  if (!parentId) return;
  if (selfId && String(parentId) === String(selfId)) throw ApiError.badRequest('A category cannot be its own parent');
  const parent = await Category.findById(parentId).lean();
  if (!parent) throw ApiError.badRequest('Parent category not found');
  if (selfId && parent.parent && String(parent.parent) === String(selfId)) throw ApiError.badRequest('Circular category hierarchy');
}

async function createCategory(data, user) {
  await assertParent(data.parent);
  const c = await Category.create(data);
  audit('category.created', 'Category', c._id, user?.id, { name: c.name });
  return c.toObject();
}

async function updateCategory(id, data, user) {
  const c = await Category.findById(id);
  if (!c) throw ApiError.notFound('Category not found');
  if (data.code && data.code.toUpperCase() !== c.code && (await Product.exists({ category: c._id }))) {
    throw ApiError.conflict('Code cannot change once products use this category (it is part of their SKUs)');
  }
  await assertParent(data.parent, c._id);
  c.set(data);
  await c.save();
  audit('category.updated', 'Category', c._id, user?.id);
  return c.toObject();
}

async function deleteCategory(id, user) {
  const c = await Category.findById(id);
  if (!c) throw ApiError.notFound('Category not found');
  const [products, children] = await Promise.all([Product.countDocuments({ category: c._id }), Category.countDocuments({ parent: c._id })]);
  if (products) throw ApiError.conflict(`Category has ${products} product(s). Move them or deactivate the category instead.`);
  if (children) throw ApiError.conflict(`Category has ${children} sub-categor${children === 1 ? 'y' : 'ies'}`);
  await c.deleteOne();
  audit('category.deleted', 'Category', c._id, user?.id, { name: c.name });
  return { deleted: true };
}

module.exports = { listCategories, getCategory, createCategory, updateCategory, deleteCategory };
