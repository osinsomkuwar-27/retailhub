// JWT + role checks for Module 1.
//
// API CONTRACT with Person 4 (Auth module):
//   Header:  Authorization: Bearer <token>
//   Payload: { id: <userId>, role: 'admin' | 'warehouse_manager' | 'customer',
//              name?: string, warehouses?: [<warehouseId>, ...] }
//   Secret:  process.env.JWT_SECRET
//
// When Person 4's shared middleware is ready, the integrated app can keep
// using this file (same contract) or swap the import in routes/index.js.
const jwt = require('jsonwebtoken');
const env = require('../../../config/env');
const { ApiError } = require('../utils/http');
const { ROLES } = require('../utils/constants');

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function protect(req, _res, next) {
  const token = readToken(req);
  if (!token) return next(ApiError.unauthorized());
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const id = payload.id || payload._id || payload.sub;
    req.user = {
      id,
      _id: id, // Module 3 reads req.user._id
      // Roles are compared lower-case so 'ADMIN' (Module 3 style) and 'admin' both work
      role: String(payload.role || '').toLowerCase(),
      name: payload.name,
      warehouses: payload.warehouses || [],
    };
    if (!req.user.id || !req.user.role) return next(ApiError.unauthorized('Invalid token payload'));
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}

/** Like protect, but continues as a guest when there is no token (public catalogue reads). */
function optionalAuth(req, res, next) {
  if (!readToken(req)) return next();
  return protect(req, res, next);
}

const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const allowed = roles.map((r) => String(r).toLowerCase());
  if (!allowed.includes(String(req.user.role).toLowerCase())) return next(ApiError.forbidden());
  return next();
};

/**
 * Warehouse managers may be limited to specific warehouses (payload.warehouses).
 * An empty list means "all warehouses". Admins are never limited.
 */
function assertWarehouseAccess(user, ...warehouseIds) {
  if (!user || user.role === ROLES.ADMIN) return;
  if (user.role !== ROLES.WAREHOUSE_MANAGER) throw ApiError.forbidden();
  if (!user.warehouses || user.warehouses.length === 0) return;
  const allowed = new Set(user.warehouses.map(String));
  for (const id of warehouseIds) {
    if (id && !allowed.has(String(id))) throw ApiError.forbidden('You are not assigned to this warehouse');
  }
}

const isStaff = (user) => !!user && [ROLES.ADMIN, ROLES.WAREHOUSE_MANAGER].includes(user.role);

module.exports = { protect, optionalAuth, authorize, assertWarehouseAccess, isStaff };
