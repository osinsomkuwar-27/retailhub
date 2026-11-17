// Test DB bootstrapping.
// Uses MONGO_URI_TEST if set (local replica set / Atlas test cluster),
// otherwise starts an in-memory replica set (mongodb-memory-server).
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
process.env.DB_NAME = 'retailsync_test';

let replSet;

async function startDB() {
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    uri = replSet.getUri();
  }
  // runtimeAdapters: MongoDB driver 7 loads `os` with a dynamic import(), which Jest can't do
  await mongoose.connect(uri, { dbName: 'retailsync_test', runtimeAdapters: { os: require('os') } });
  await mongoose.connection.dropDatabase();
  const models = require('../models');
  for (const M of Object.values(models)) await M.syncIndexes();
  const { applySchemaValidation } = require('../scripts/applySchemaValidation');
  await applySchemaValidation(mongoose.connection.db);
}

async function stopDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

module.exports = { startDB, stopDB };
