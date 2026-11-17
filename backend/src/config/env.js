// Loads environment variables once for the whole backend.
require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/retailsync_db?replicaSet=rs0',
  dbName: process.env.DB_NAME || 'retailhub_db', // same database as Module 3
  jwtSecret: process.env.JWT_SECRET || 'dev_only_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  enableJobs: process.env.ENABLE_JOBS !== 'false',
  expiryWarningDays: Number(process.env.EXPIRY_WARNING_DAYS) || 30,
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'dev_only_change_me') {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = env;
