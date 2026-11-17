// Small HTTP helpers used across Module 1.
// Response shape (shared API contract):
//   success: { success: true, message, data, meta? }
//   error:   { success: false, message, errors? }

class ApiError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
  static badRequest(msg, errors) { return new ApiError(400, msg, errors); }
  static unauthorized(msg = 'Authentication required') { return new ApiError(401, msg); }
  static forbidden(msg = 'You do not have permission to do this') { return new ApiError(403, msg); }
  static notFound(msg = 'Resource not found') { return new ApiError(404, msg); }
  static conflict(msg, errors) { return new ApiError(409, msg, errors); }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sendSuccess(res, { data = null, message = 'OK', meta, status = 200 } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

/**
 * Parses ?page, ?limit and ?sort=field or -field against a whitelist.
 */
function parsePagination(query, { allowedSort = [], defaultSort = '-createdAt', maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || 10));
  let sortStr = query.sort || defaultSort;
  const field = sortStr.replace(/^-/, '');
  if (!allowedSort.includes(field)) sortStr = defaultSort;
  const sort = { [sortStr.replace(/^-/, '')]: sortStr.startsWith('-') ? -1 : 1 };
  if (!('_id' in sort)) sort._id = 1; // stable ordering
  return { page, limit, skip: (page - 1) * limit, sort };
}

function buildMeta(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, totalPages, pages: totalPages }; // `pages` = Module 3 naming
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { ApiError, asyncHandler, sendSuccess, parsePagination, buildMeta, escapeRegex };
