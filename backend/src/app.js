
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const inventory = require('./modules/inventory');
const { errorHandler, notFound } = require('./modules/inventory/middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const paymentRoutes = require('./routes/payment.routes');
const reviewRoutes = require('./routes/review.routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'RetailSync API',
    timestamp: new Date(),
  });
});

// Person 2: Customer, Product Browsing, Cart, Orders, Payments and Reviews
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);

// Person 1: Product and Inventory Management
app.use('/api', inventory.router);

// Person 3: Intelligence routes
const { intelligenceRouter } = require('./intelligence');
app.use('/api/intelligence', intelligenceRouter);

// Not-found and global error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
