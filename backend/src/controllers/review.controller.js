const mongoose = require('mongoose');
const Review = require('../models/Review');
const Order = require('../models/Order');
const productBridge = require('../services/productBridge.service');

/**
 * Format customer name for privacy (e.g. "Jane Doe" -> "Jane D." or "Jane Doe")
 * Never exposes email, password, address, or internal user details.
 */
const maskCustomerName = (name) => {
  if (!name) return 'Verified Customer';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
};

/**
 * @desc    Submit a new product review
 * @route   POST /api/reviews
 * @access  Private (Customer with DELIVERED order)
 */
const createReview = async (req, res) => {
  try {
    const { productId, rating, title, comment } = req.body;

    // 1. Validate product ID
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid Product ID is required',
      });
    }

    // 2. Validate rating (whole number between 1 and 5)
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5 stars',
      });
    }

    // 3. Validate title and comment
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Review title is required',
      });
    }

    if (!comment || typeof comment !== 'string' || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Review comment is required',
      });
    }

    // 4. Verify product exists
    const product = await productBridge.getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // 5. Prevent duplicate review (Application Check)
    const existingReview = await Review.findOne({
      product: productId,
      customer: req.user._id,
    });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product. You can update your existing review.',
      });
    }

    // 6. Server-side purchase eligibility verification:
    // Only customers who have received this product in a DELIVERED order can review.
    const pId = new mongoose.Types.ObjectId(String(productId));
    const deliveredOrder = await Order.findOne({
      customer: req.user._id,
      status: 'DELIVERED',
      $or: [{ 'items.product': pId }, { 'items.product': String(productId) }],
    }).lean();

    if (!deliveredOrder) {
      return res.status(403).json({
        success: false,
        message:
          'Verified Purchase Required: You can only review products from orders that have been successfully DELIVERED to you.',
      });
    }

    // 7. Create review with masked public name and audit order reference
    const review = await Review.create({
      product: pId,
      customer: req.user._id,
      customerName: maskCustomerName(req.user.name),
      rating: numRating,
      title: title.trim(),
      comment: comment.trim(),
      isVerifiedPurchase: true,
      order: deliveredOrder._id,
    });

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review,
    });
  } catch (error) {
    // Database-level unique constraint collision safeguard
    if (error.code === 11000 || (error.message && error.message.includes('E11000'))) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted a review for this product.',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit review: ' + error.message,
    });
  }
};

/**
 * @desc    Get public reviews, average rating, and rating breakdown for a product
 * @route   GET /api/reviews/product/:productId
 * @access  Public
 */
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = 'newest' } = req.query;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
      });
    }

    const pId = new mongoose.Types.ObjectId(String(productId));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Sorting options
    let sortQuery = { createdAt: -1 };
    if (sort === 'oldest') {
      sortQuery = { createdAt: 1 };
    } else if (sort === 'highest') {
      sortQuery = { rating: -1, createdAt: -1 };
    } else if (sort === 'lowest') {
      sortQuery = { rating: 1, createdAt: -1 };
    }

    // Filter condition
    const query = { product: pId };

    // Fetch paginated reviews - strictly project safe public fields
    const [reviews, totalCount, stats] = await Promise.all([
      Review.find(query)
        .select('_id rating title comment customerName isVerifiedPurchase createdAt updatedAt product')
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(query),
      Review.aggregate([
        { $match: { product: pId } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
            count1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            count2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            count3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            count4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            count5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stat = stats[0] || {};
    const averageRating = stat.averageRating ? Math.round(stat.averageRating * 10) / 10 : 0;
    const totalReviews = stat.totalReviews || 0;
    const ratingDistribution = {
      5: stat.count5 || 0,
      4: stat.count4 || 0,
      3: stat.count3 || 0,
      2: stat.count2 || 0,
      1: stat.count1 || 0,
    };

    res.status(200).json({
      success: true,
      reviews,
      summary: {
        averageRating,
        totalReviews,
        ratingDistribution,
      },
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve product reviews: ' + error.message,
    });
  }
};

/**
 * @desc    Check customer's review eligibility for a product
 * @route   GET /api/reviews/product/:productId/eligibility
 * @access  Private (Customer)
 */
const checkReviewEligibility = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
      });
    }

    const pId = new mongoose.Types.ObjectId(String(productId));

    // 1. Check existing review
    const existingReview = await Review.findOne({
      product: pId,
      customer: req.user._id,
    }).lean();

    // 2. Check delivered orders
    const deliveredOrder = await Order.findOne({
      customer: req.user._id,
      status: 'DELIVERED',
      $or: [{ 'items.product': pId }, { 'items.product': String(productId) }],
    }).lean();

    const hasDeliveredOrder = Boolean(deliveredOrder);
    const alreadyReviewed = Boolean(existingReview);
    const canReview = hasDeliveredOrder && !alreadyReviewed;

    let reason = '';
    if (alreadyReviewed) {
      reason = 'You have already reviewed this product.';
    } else if (!hasDeliveredOrder) {
      reason = 'Only customers who have received this product in a delivered order can write a review.';
    }

    res.status(200).json({
      success: true,
      canReview,
      hasDeliveredOrder,
      alreadyReviewed,
      existingReview: existingReview || null,
      reason,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to verify review eligibility: ' + error.message,
    });
  }
};

/**
 * @desc    Update customer's own review
 * @route   PUT /api/reviews/:id
 * @access  Private (Owner only)
 */
const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, title, comment } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID format',
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Ownership check: only review author or admin can update
    if (review.customer.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to edit this review',
      });
    }

    // Validate updates
    if (rating !== undefined) {
      const numRating = Number(rating);
      if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be an integer between 1 and 5 stars',
        });
      }
      review.rating = numRating;
    }

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Review title cannot be empty',
        });
      }
      review.title = title.trim();
    }

    if (comment !== undefined) {
      if (typeof comment !== 'string' || !comment.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Review comment cannot be empty',
        });
      }
      review.comment = comment.trim();
    }

    await review.save();

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update review: ' + error.message,
    });
  }
};

/**
 * @desc    Delete customer's own review
 * @route   DELETE /api/reviews/:id
 * @access  Private (Owner only)
 */
const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID format',
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Ownership check: only author or admin can delete
    if (review.customer.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review',
      });
    }

    await Review.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete review: ' + error.message,
    });
  }
};

/**
 * @desc    Get all reviews authored by the authenticated customer
 * @route   GET /api/reviews/my-reviews
 * @access  Private (Customer)
 */
const getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with product details where available from product bridge
    const enriched = await Promise.all(
      reviews.map(async (r) => {
        try {
          const product = await productBridge.getProductById(r.product);
          return {
            ...r,
            productDetails: product
              ? {
                  _id: product._id,
                  name: product.name,
                  category: product.category,
                  price: product.price,
                }
              : null,
          };
        } catch (_) {
          return r;
        }
      })
    );

    res.status(200).json({
      success: true,
      count: enriched.length,
      reviews: enriched,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your reviews: ' + error.message,
    });
  }
};

module.exports = {
  createReview,
  getProductReviews,
  checkReviewEligibility,
  updateReview,
  deleteReview,
  getMyReviews,
};
