const express = require('express');
const router = express.Router();
const {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
} = require('../controllers/cart.controller');
const { protect } = require('../middleware/auth.middleware');

// All cart endpoints require customer authentication
router.use(protect);

router.get('/', getCart);
router.post('/items', addItem);
router.put('/items/:productId', updateItemQuantity);
router.delete('/items/:productId', removeItem);
router.delete('/', clearCart);

module.exports = router;
