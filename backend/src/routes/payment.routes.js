const express = require('express');
const router = express.Router();
const {
  processPayment,
  getPaymentHistory,
  getPaymentByOrderId,
  getPaymentById,
} = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.post('/process', processPayment);
router.get('/', getPaymentHistory);
router.get('/order/:orderId', getPaymentByOrderId);
router.get('/:id', getPaymentById);

module.exports = router;
