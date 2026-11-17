// node src/scripts/setupIntelligenceDb.js
require('dotenv').config();
const mongoose = require('mongoose');
// Register the other modules' models first (adjust path to your shared models index):
try { require('../models'); } catch (_) {}
const M = {
  SalesHistory: require('../models/intelligence/SalesHistory'),
  ReorderRule: require('../models/intelligence/ReorderRule'),
  Supplier: require('../models/intelligence/Supplier'),
  SupplierOrder: require('../models/intelligence/SupplierOrder'),
  StockAlert: require('../models/intelligence/StockAlert'),
  AnomalyRecord: require('../models/intelligence/AnomalyRecord'),
  ExpiryAlert: require('../models/intelligence/ExpiryAlert'),
  StreamCheckpoint: require('../models/intelligence/StreamCheckpoint'),
};

const validators = {
  stock_alerts: { $jsonSchema: { bsonType: 'object', required: ['type', 'severity', 'dedupeKey', 'message'], properties: {
    type: { enum: ['LOW_STOCK', 'OUT_OF_STOCK', 'PREDICTED_STOCKOUT', 'ANOMALY', 'SUPPLIER_OVERDUE'] },
    severity: { enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }, status: { enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] } } } },
  anomaly_records: { $jsonSchema: { bsonType: 'object', required: ['type', 'severity', 'status', 'description'], properties: {
    type: { enum: ['LARGE_UNAPPROVED_REDUCTION', 'RAPID_REPEATED_REDUCTIONS', 'REPEATED_ORDER_CANCELLATION'] },
    severity: { enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }, status: { enum: ['OPEN', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED'] } } } },
  supplier_orders: { $jsonSchema: { bsonType: 'object', required: ['orderNumber', 'supplier', 'items', 'expectedDate'], properties: {
    items: { bsonType: 'array', minItems: 1 }, status: { enum: ['PLACED', 'PARTIAL', 'RECEIVED', 'CANCELLED'] } } } },
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME || 'retailhub_db' });
  const db = mongoose.connection.db;
  for (const [name, model] of Object.entries(M)) {
    try { await model.createCollection(); } catch (e) { if (e.code !== 48) throw e; }
    await model.syncIndexes();
    console.log(`ok  ${name} -> ${model.collection.name}`);
  }
  for (const [coll, validator] of Object.entries(validators)) {
    await db.command({ collMod: coll, validator, validationLevel: 'moderate', validationAction: 'error' });
    console.log(`ok  $jsonSchema validator on ${coll}`);
  }
  const info = await db.listCollections({ name: 'sales_history' }).toArray();
  console.log('sales_history options:', JSON.stringify(info[0]?.options));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });