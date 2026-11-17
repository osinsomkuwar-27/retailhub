// Express app. Person 4 owns the final integrated version of this file;
// Module 1 only needs ONE line in it:  app.use('/api', inventory.router)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const inventory = require('./modules/inventory');
const { errorHandler, notFound } = require('./modules/inventory/middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ success: true, message: 'RetailSync API is running', data: { time: new Date() } }));

// DEV ONLY — remove when Person 4's /api/auth is integrated
if (env.nodeEnv !== 'production' && process.env.ENABLE_DEV_AUTH === 'true') {
  app.use('/api/dev', require('./dev/devAuth').router);
}

// ---- Module 1: Product & Inventory Management ----
app.use('/api', inventory.router);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
