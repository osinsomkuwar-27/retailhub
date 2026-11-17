const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware:
 * Validates the JWT Bearer token from the Authorization header.
 * Attaches the authenticated user to req.user (excluding password).
 * Person 3's controllers access `req.user?._id`.
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const secret = process.env.JWT_SECRET || 'retailsync_jwt_secret_key_2026';
      const decoded = jwt.verify(token, secret);

      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User no longer exists or session expired',
        });
      }

      if (user.isBlocked) {
        return res.status(403).json({
          success: false,
          message: 'User account has been blocked',
        });
      }

      req.user = user;
      return next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token verification failed',
        error: err.message,
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
    });
  }
};

/**
 * Authorize middleware:
 * Restricts access to specified roles.
 * Compatible with Person 3 role checks:
 *   authorize('ADMIN', 'WAREHOUSE_MANAGER')
 *   authorize('ADMIN')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before authorization check',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this resource`,
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
};
