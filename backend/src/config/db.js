const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

async function connectDB(uri = env.mongoUri) {
  await mongoose.connect(uri, { dbName: env.dbName });
  console.log(`[db] connected to ${mongoose.connection.name}`);

  // Transactions need a replica set (Atlas is one). Warn loudly if not.
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && !hello.msg /* mongos */) {
    console.warn('[db] WARNING: not a replica set — multi-document transactions will FAIL. Use Atlas or start mongod with --replSet.');
  }
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
