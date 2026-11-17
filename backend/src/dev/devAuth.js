// =============================================================================
// DEV-ONLY token issuer so Person 1 can test before Person 4's login exists.
// Enabled only when NODE_ENV !== 'production' AND ENABLE_DEV_AUTH=true.
// DELETE this file (and its line in app.js) once real auth is integrated.
// =============================================================================
const express = require('express');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Fixed ids so inventory logs from dev sessions stay consistent
const DEV_USERS = {
  admin: { id: '000000000000000000000a01', name: 'Dev Admin', role: 'ADMIN', warehouses: [] },
  warehouse_manager: { id: '000000000000000000000b01', name: 'Dev Warehouse Manager', role: 'WAREHOUSE_MANAGER', warehouses: [] },
  customer: { id: '000000000000000000000c01', name: 'Dev Customer', role: 'CUSTOMER', warehouses: [] },
};

function signDevToken(role = 'admin', overrides = {}) {
  const user = { ...(DEV_USERS[role] || DEV_USERS.admin), ...overrides };
  return { token: jwt.sign(user, env.jwtSecret, { expiresIn: env.jwtExpiresIn }), user };
}

const router = express.Router();
router.post('/token', (req, res) => {
  const role = String(req.body?.role || 'admin').toLowerCase();
  if (!DEV_USERS[role]) return res.status(400).json({ success: false, message: 'role must be admin, warehouse_manager or customer' });
  return res.json({ success: true, message: 'Dev token issued', data: signDevToken(role, { warehouses: req.body?.warehouses || [] }) });
});

module.exports = { router, signDevToken, DEV_USERS };
