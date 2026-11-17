// =============================================================================
// explain() demo — shows which index MongoDB picks for Module 1's hot queries,
// and compares one of them against a forced full collection scan.
// Run AFTER seeding:  npm run db:explain
// =============================================================================
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../../../config/db');

function planStages(plan, out = []) {
  if (!plan) return out;
  out.push(plan.stage + (plan.indexName ? `(${plan.indexName})` : ''));
  if (plan.inputStage) planStages(plan.inputStage, out);
  (plan.inputStages || []).forEach((p) => planStages(p, out));
  return out;
}

function summarize(label, exp) {
  const s = exp.executionStats;
  const winning = exp.queryPlanner.winningPlan.queryPlan || exp.queryPlanner.winningPlan;
  return {
    query: label,
    plan: [...new Set(planStages(winning))].join(' <- '),
    returned: s.nReturned,
    keysExamined: s.totalKeysExamined,
    docsExamined: s.totalDocsExamined,
    ms: s.executionTimeMillis,
  };
}

async function run() {
  const db = mongoose.connection.db;
  const product = await db.collection('products').findOne({ status: 'active' });
  const inv = await db.collection('inventory').findOne({});
  if (!product || !inv) throw new Error('Seed the database first: npm run seed');

  const rows = [];
  rows.push(summarize('products: $text "rice"',
    await db.collection('products').find({ $text: { $search: 'rice' } }).explain('executionStats')));
  rows.push(summarize('products: category+status sort createdAt',
    await db.collection('products').find({ category: product.category, status: 'active' }).sort({ createdAt: -1 }).explain('executionStats')));
  rows.push(summarize('products: by SKU (unique)',
    await db.collection('products').find({ sku: product.sku }).explain('executionStats')));
  rows.push(summarize('inventory: product+warehouse',
    await db.collection('inventory').find({ product: inv.product, warehouse: inv.warehouse }).explain('executionStats')));
  rows.push(summarize('stock_batches: FEFO order',
    await db.collection('stock_batches').find({ product: inv.product, warehouse: inv.warehouse, status: 'active' }).sort({ expiryDate: 1, receivedAt: 1 }).explain('executionStats')));
  rows.push(summarize('stock_batches: expiring in 30d',
    await db.collection('stock_batches').find({ status: 'active', expiryDate: { $gt: new Date(), $lte: new Date(Date.now() + 30 * 86400000) } }).explain('executionStats')));
  rows.push(summarize('inventory_logs: product history',
    await db.collection('inventory_logs').find({ product: inv.product }).sort({ createdAt: -1 }).limit(20).explain('executionStats')));
  rows.push(summarize('inventory_logs: SAME query, forced COLLSCAN',
    await db.collection('inventory_logs').find({ product: inv.product }).sort({ createdAt: -1 }).limit(20).hint({ $natural: 1 }).explain('executionStats')));
  rows.push(summarize('warehouses: $near Mumbai (2dsphere)',
    await db.collection('warehouses').find({ location: { $near: { $geometry: { type: 'Point', coordinates: [72.8777, 19.076] }, $maxDistance: 2_000_000 } } }).explain('executionStats')));

  console.log('\nexplain("executionStats") — Module 1 queries\n');
  console.table(rows);
  console.log('IXSCAN = index used • COLLSCAN = full scan • lower docsExamined/returned ratio is better.\n');
}

(async () => {
  await connectDB();
  await run();
  await disconnectDB();
})().catch((e) => { console.error(e.message); process.exit(1); });
