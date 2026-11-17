/**
 * RetailSync Shared Models Registry
 * 
 * Person 2 Models:
 * - User (Customer / Admin / Warehouse Manager)
 * - Cart (Customer cart persistence)
 * - Order (Customer orders and sync with Person 3 SalesHistory)
 * - Payment (Transaction records)
 * - Review (Product reviews)
 * 
 * Person 1 Models (Integration Interfaces):
 * - Product: Expected fields {_id, name, sku, description, category, price, costPrice, stockQuantity, images, isActive, averageRating, numReviews}
 * - Inventory: Expected fields {_id, product, warehouse, quantity, reservedQuantity, minThreshold}
 * - Warehouse, StockBatch, InventoryLog: Defined by Person 1 for inventory tracking
 */

const User = require('./User');
const Cart = require('./Cart');
const Order = require('./Order');
const Payment = require('./Payment');
const Review = require('./Review');

module.exports = {
  User,
  Cart,
  Order,
  Payment,
  Review,
};
