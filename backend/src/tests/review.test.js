const mongoose = require('mongoose');
const reviewController = require('../controllers/review.controller');
const Review = require('../models/Review');
const Order = require('../models/Order');
const productBridge = require('../services/productBridge.service');

describe('Stage 6: Product Reviews and Ratings Module Tests', () => {
  const customerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const sampleProductId = new mongoose.Types.ObjectId();
  const sampleOrderId = new mongoose.Types.ObjectId();
  const sampleReviewId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Review Validation & Security Safeguards', () => {
    test('createReview rejects invalid product ID', async () => {
      const req = {
        user: { _id: customerId, name: 'Alice Smith' },
        body: { productId: 'bad-id', rating: 5, title: 'Great', comment: 'Loved it' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'A valid Product ID is required' })
      );
    });

    test('createReview rejects invalid ratings (e.g. 0, 6, decimal)', async () => {
      const invalidRatings = [0, 6, -1, 3.5, 'invalid'];

      for (const badRating of invalidRatings) {
        const req = {
          user: { _id: customerId, name: 'Alice Smith' },
          body: {
            productId: sampleProductId.toString(),
            rating: badRating,
            title: 'Great',
            comment: 'Loved it',
          },
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await reviewController.createReview(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Rating must be an integer between 1 and 5 stars',
          })
        );
      }
    });

    test('createReview rejects missing or empty title and comment', async () => {
      const testCases = [
        { title: '', comment: 'Good' },
        { title: '   ', comment: 'Good' },
        { title: 'Good title', comment: '' },
        { title: 'Good title', comment: '   ' },
      ];

      for (const tc of testCases) {
        const req = {
          user: { _id: customerId, name: 'Alice Smith' },
          body: {
            productId: sampleProductId.toString(),
            rating: 5,
            ...tc,
          },
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await reviewController.createReview(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      }
    });

    test('createReview rejects review if product does not exist in product bridge', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue(null);

      const req = {
        user: { _id: customerId, name: 'Alice Smith' },
        body: {
          productId: sampleProductId.toString(),
          rating: 4,
          title: 'Nice',
          comment: 'Very nice product',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Product not found' })
      );
    });
  });

  describe('Verified Purchase & Delivered Order Verification', () => {
    test('createReview rejects review if customer has no DELIVERED order for the product', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Wireless Mouse',
      });
      jest.spyOn(Review, 'findOne').mockResolvedValue(null);
      // No delivered order found for this customer and product
      jest.spyOn(Order, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const req = {
        user: { _id: customerId, name: 'Alice Smith' },
        body: {
          productId: sampleProductId.toString(),
          rating: 5,
          title: 'Amazing',
          comment: 'Works flawlessly',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Verified Purchase Required/i),
        })
      );
    });

    test('createReview successfully creates review when verified DELIVERED order exists', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Wireless Mouse',
      });
      jest.spyOn(Review, 'findOne').mockResolvedValue(null);

      const mockDeliveredOrder = {
        _id: sampleOrderId,
        customer: customerId,
        status: 'DELIVERED',
        items: [{ product: sampleProductId, quantity: 1, price: 500 }],
      };
      jest.spyOn(Order, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDeliveredOrder),
      });

      const createdReviewDoc = {
        _id: sampleReviewId,
        product: sampleProductId,
        customer: customerId,
        customerName: 'Alice S.',
        rating: 5,
        title: 'Amazing',
        comment: 'Works flawlessly',
        isVerifiedPurchase: true,
        order: sampleOrderId,
      };
      jest.spyOn(Review, 'create').mockResolvedValue(createdReviewDoc);

      const req = {
        user: { _id: customerId, name: 'Alice Smith' },
        body: {
          productId: sampleProductId.toString(),
          rating: 5,
          title: 'Amazing',
          comment: 'Works flawlessly',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          review: expect.objectContaining({
            customerName: 'Alice S.',
            isVerifiedPurchase: true,
            rating: 5,
          }),
        })
      );
    });

    test('createReview prevents duplicate review per customer per product (Application level)', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Wireless Mouse',
      });
      // Existing review already in DB
      jest.spyOn(Review, 'findOne').mockResolvedValue({
        _id: sampleReviewId,
        product: sampleProductId,
        customer: customerId,
        rating: 5,
      });

      const req = {
        user: { _id: customerId, name: 'Alice Smith' },
        body: {
          productId: sampleProductId.toString(),
          rating: 4,
          title: 'Another review',
          comment: 'Trying to post again',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/already reviewed this product/),
        })
      );
    });

    test('createReview catches database E11000 duplicate key error and responds with 400', async () => {
      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Wireless Mouse',
      });
      jest.spyOn(Review, 'findOne').mockResolvedValue(null);
      jest.spyOn(Order, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: sampleOrderId }),
      });

      const dupErr = new Error('E11000 duplicate key error collection: reviews index: product_1_customer_1 dup key');
      dupErr.code = 11000;
      jest.spyOn(Review, 'create').mockRejectedValue(dupErr);

      const req = {
        user: { _id: customerId, name: 'Alice Smith' },
        body: {
          productId: sampleProductId.toString(),
          rating: 5,
          title: 'Dup check',
          comment: 'Concurrent write attempt',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.createReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/already submitted a review/i),
        })
      );
    });
  });

  describe('Review Ownership & Edit/Delete Permissions', () => {
    test('updateReview forbids customer from updating another customer review', async () => {
      const otherUserReview = {
        _id: sampleReviewId,
        customer: otherCustomerId, // belongs to someone else
        product: sampleProductId,
        rating: 4,
        title: 'Others review',
        comment: 'Nice',
      };
      jest.spyOn(Review, 'findById').mockResolvedValue(otherUserReview);

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: sampleReviewId.toString() },
        body: { rating: 1, title: 'Vandalized', comment: 'Hacked' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.updateReview(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not authorized to edit this review' })
      );
    });

    test('updateReview allows review author to update rating, title, and comment', async () => {
      const myReview = {
        _id: sampleReviewId,
        customer: customerId,
        product: sampleProductId,
        rating: 4,
        title: 'Initial Title',
        comment: 'Initial Comment',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Review, 'findById').mockResolvedValue(myReview);

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: sampleReviewId.toString() },
        body: { rating: 5, title: 'Updated Title', comment: 'Updated Comment' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.updateReview(req, res);

      expect(myReview.rating).toBe(5);
      expect(myReview.title).toBe('Updated Title');
      expect(myReview.comment).toBe('Updated Comment');
      expect(myReview.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Review updated successfully',
        })
      );
    });

    test('deleteReview forbids customer from deleting another customer review', async () => {
      const otherUserReview = {
        _id: sampleReviewId,
        customer: otherCustomerId,
      };
      jest.spyOn(Review, 'findById').mockResolvedValue(otherUserReview);

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: sampleReviewId.toString() },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.deleteReview(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not authorized to delete this review' })
      );
    });

    test('deleteReview allows author to delete their own review', async () => {
      const myReview = {
        _id: sampleReviewId,
        customer: customerId,
      };
      jest.spyOn(Review, 'findById').mockResolvedValue(myReview);
      jest.spyOn(Review, 'findByIdAndDelete').mockResolvedValue(myReview);

      const req = {
        user: { _id: customerId, role: 'CUSTOMER' },
        params: { id: sampleReviewId.toString() },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.deleteReview(req, res);

      expect(Review.findByIdAndDelete).toHaveBeenCalledWith(sampleReviewId.toString());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Review deleted successfully' })
      );
    });
  });

  describe('Public Review Retrieval, Aggregation, & Pagination', () => {
    test('getProductReviews returns paginated reviews with average rating and rating distribution', async () => {
      const mockReviews = [
        {
          _id: new mongoose.Types.ObjectId(),
          rating: 5,
          title: 'Top notch',
          comment: 'Super fast delivery and great quality',
          customerName: 'Bob M.',
          isVerifiedPurchase: true,
          createdAt: new Date(),
        },
        {
          _id: new mongoose.Types.ObjectId(),
          rating: 4,
          title: 'Good value',
          comment: 'Works as expected',
          customerName: 'Carol D.',
          isVerifiedPurchase: true,
          createdAt: new Date(),
        },
      ];

      const mockStats = [
        {
          _id: null,
          averageRating: 4.5,
          totalReviews: 2,
          count1: 0,
          count2: 0,
          count3: 0,
          count4: 1,
          count5: 1,
        },
      ];

      const queryChain = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockReviews),
        }),
      };

      jest.spyOn(Review, 'find').mockReturnValue(queryChain);
      jest.spyOn(Review, 'countDocuments').mockResolvedValue(2);
      jest.spyOn(Review, 'aggregate').mockResolvedValue(mockStats);

      const req = {
        params: { productId: sampleProductId.toString() },
        query: { page: 1, limit: 10, sort: 'highest' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.getProductReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reviews: mockReviews,
          summary: {
            averageRating: 4.5,
            totalReviews: 2,
            ratingDistribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
          },
          pagination: {
            total: 2,
            page: 1,
            limit: 10,
            pages: 1,
          },
        })
      );
    });

    test('checkReviewEligibility returns canReview: true when delivered order exists and no previous review', async () => {
      jest.spyOn(Review, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      jest.spyOn(Order, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: sampleOrderId }),
      });

      const req = {
        user: { _id: customerId },
        params: { productId: sampleProductId.toString() },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.checkReviewEligibility(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          canReview: true,
          hasDeliveredOrder: true,
          alreadyReviewed: false,
        })
      );
    });

    test('getMyReviews returns all reviews authored by customer enriched with product details', async () => {
      const myReviews = [
        {
          _id: sampleReviewId,
          product: sampleProductId,
          customer: customerId,
          rating: 5,
          title: 'My Review',
          comment: 'Personal thoughts',
        },
      ];

      const sortSpy = {
        lean: jest.fn().mockResolvedValue(myReviews),
      };
      jest.spyOn(Review, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue(sortSpy),
      });

      jest.spyOn(productBridge, 'getProductById').mockResolvedValue({
        _id: sampleProductId,
        name: 'Smart Watch',
        category: 'Electronics',
        price: 4999,
      });

      const req = { user: { _id: customerId } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await reviewController.getMyReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 1,
          reviews: expect.arrayContaining([
            expect.objectContaining({
              title: 'My Review',
              productDetails: expect.objectContaining({ name: 'Smart Watch' }),
            }),
          ]),
        })
      );
    });
  });
});
