const express = require('express');
const router = express.Router();
const {
  createReview,
  getProductReviews,
  checkReviewEligibility,
  updateReview,
  deleteReview,
  getMyReviews,
} = require('../controllers/review.controller');
const { protect } = require('../middleware/auth.middleware');

// Public route: Get product reviews and rating summary
router.get('/product/:productId', getProductReviews);

// Protected routes (Customer)
router.use(protect);

router.post('/', createReview);
router.get('/my-reviews', getMyReviews);
router.get('/product/:productId/eligibility', checkReviewEligibility);
router.put('/:id', updateReview);
router.delete('/:id', deleteReview);

module.exports = router;
