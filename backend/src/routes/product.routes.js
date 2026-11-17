const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  getCategories,
} = require('../controllers/product.controller');

router.get('/', getProducts);
router.get('/categories', getCategories);
router.get('/:id', getProductById);

module.exports = router;
