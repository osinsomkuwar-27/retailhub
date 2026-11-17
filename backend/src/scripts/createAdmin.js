// Creates (or resets) a staff login so the Inventory / Smart Inventory pages can be used.
//   npm run create:admin
//   npm run create:admin -- --email=wm@retailsync.com --password=Wm@12345 --role=WAREHOUSE_MANAGER --name="Warehouse Manager"
// Uses Person 2's User model, so the account logs in through the normal /login page.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const env = require('../config/env');
const User = require('../models/User');

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;

(async () => {
  const email = arg('email', 'admin@retailsync.com').toLowerCase();
  const password = arg('password', 'Admin@123');
  const role = arg('role', 'ADMIN').toUpperCase();
  const name = arg('name', role === 'ADMIN' ? 'Admin' : 'Warehouse Manager');
  if (!['ADMIN', 'WAREHOUSE_MANAGER'].includes(role)) throw new Error('role must be ADMIN or WAREHOUSE_MANAGER');

  await mongoose.connect(env.mongoUri, { dbName: env.dbName });
  let user = await User.findOne({ email });
  if (user) { user.password = password; user.role = role; user.name = name; }
  else user = new User({ name, email, password, role, phone: '9000000000' });
  await user.save();
  console.log(`[create:admin] ${role} ready → email: ${email}  password: ${password}`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error('[create:admin] failed:', e.message); await mongoose.disconnect(); process.exit(1); });
