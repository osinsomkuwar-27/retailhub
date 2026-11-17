import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  ShoppingBag,
  Tag,
  Info,
  Check,
  AlertCircle,
  Star,
  ShieldCheck,
  Calendar,
  MessageSquare,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';
import customerService from '../../services/customerService';
import { useCart } from '../../context/CartContext';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart() || {};

  // Product state
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Reviews state (Stage 6)
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });
  const [reviewPagination, setReviewPagination] = useState({ page: 1, limit: 5, total: 0, pages: 1 });
  const [reviewSort, setReviewSort] = useState('newest');
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Review eligibility & submission state
  const [eligibility, setEligibility] = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [editReviewId, setEditReviewId] = useState(null);
  const [formRating, setFormRating] = useState(5);
  const [formTitle, setFormTitle] = useState('');
  const [formComment, setFormComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState(null);

  const currentUser = customerService.getCurrentUser();

  useEffect(() => {
    fetchProduct();
    fetchReviews(1, reviewSort);
    if (customerService.isAuthenticated()) {
      checkEligibility();
    }
  }, [id]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerService.getProductById(id);
      setProduct(data?.product || null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Product not found');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async (page = 1, sort = reviewSort) => {
    try {
      setReviewsLoading(true);
      const res = await customerService.getProductReviews(id, { page, limit: 5, sort });
      setReviews(res?.reviews || []);
      if (res?.summary) {
        setReviewSummary(res.summary);
      }
      if (res?.pagination) {
        setReviewPagination(res.pagination);
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const checkEligibility = async () => {
    try {
      const res = await customerService.checkReviewEligibility(id);
      setEligibility(res);
    } catch (_) {
      setEligibility(null);
    }
  };

  const handleAddToCart = async () => {
    if (!product || !product.isInStock) return;
    setAdding(true);
    setFeedback(null);

    const res = await addToCart(product._id, quantity);
    setAdding(false);

    if (res.requireAuth) {
      navigate(`/login?redirect=/products/${product._id}`);
      return;
    }

    if (res.success) {
      setFeedback({ type: 'success', text: `Added ${quantity} unit${quantity > 1 ? 's' : ''} to your cart!` });
    } else {
      setFeedback({ type: 'error', text: res.message || 'Failed to add item' });
    }
  };

  const handleSortChange = (e) => {
    const newSort = e.target.value;
    setReviewSort(newSort);
    fetchReviews(1, newSort);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > reviewPagination.pages) return;
    fetchReviews(newPage, reviewSort);
  };

  const handleOpenCreateForm = () => {
    setIsEditingReview(false);
    setEditReviewId(null);
    setFormRating(5);
    setFormTitle('');
    setFormComment('');
    setReviewFeedback(null);
    setShowReviewForm(true);
  };

  const handleOpenEditForm = (existingRev) => {
    const target = existingRev || eligibility?.existingReview;
    if (!target) return;
    setIsEditingReview(true);
    setEditReviewId(target._id);
    setFormRating(target.rating || 5);
    setFormTitle(target.title || '');
    setFormComment(target.comment || '');
    setReviewFeedback(null);
    setShowReviewForm(true);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    setReviewFeedback(null);

    try {
      if (isEditingReview && editReviewId) {
        await customerService.updateReview(editReviewId, {
          rating: formRating,
          title: formTitle,
          comment: formComment,
        });
        setReviewFeedback({ type: 'success', text: 'Review updated successfully!' });
      } else {
        await customerService.submitReview({
          productId: id,
          rating: formRating,
          title: formTitle,
          comment: formComment,
        });
        setReviewFeedback({ type: 'success', text: 'Review published successfully!' });
      }

      setShowReviewForm(false);
      await fetchReviews(1, reviewSort);
      if (customerService.isAuthenticated()) {
        await checkEligibility();
      }
    } catch (err) {
      setReviewFeedback({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to submit review',
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('Are you sure you want to delete your review?')) return;

    try {
      setReviewFeedback(null);
      await customerService.deleteReview(reviewId);
      setReviewFeedback({ type: 'success', text: 'Your review was deleted successfully.' });
      await fetchReviews(1, reviewSort);
      if (customerService.isAuthenticated()) {
        await checkEligibility();
      }
    } catch (err) {
      setReviewFeedback({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to delete review',
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading product details...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <Info className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 mt-4">Product Unavailable</h2>
          <p className="text-sm text-slate-500 mt-1">{error || 'The requested product could not be found.'}</p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <Link
        to="/products"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Products
      </Link>

      {/* Main Product Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Left: Product Image / Showcase */}
        <div className="bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center min-h-[320px] p-8">
          <div className="text-center">
            <ShoppingBag className="w-24 h-24 mx-auto text-slate-300" />
            <span className="inline-block mt-4 text-xs font-semibold px-3 py-1 bg-white border border-slate-200 rounded-full text-slate-600">
              {product.category}
            </span>
          </div>
        </div>

        {/* Right: Product Info & Real Stock Status */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold tracking-wide uppercase">
              <Tag className="w-3.5 h-3.5" />
              {product.category}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
              {product.name}
            </h1>

            {/* Rating Summary Link */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= Math.round(reviewSummary.averageRating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-200'
                    }`}
                  />
                ))}
              </div>
              <a href="#reviews-section" className="text-xs font-semibold text-indigo-600 hover:underline">
                {reviewSummary.totalReviews > 0
                  ? `${reviewSummary.averageRating} (${reviewSummary.totalReviews} review${reviewSummary.totalReviews > 1 ? 's' : ''})`
                  : 'No reviews yet'}
              </a>
            </div>

            {product.sku && (
              <p className="text-xs font-mono text-slate-400 mt-1">SKU: {product.sku}</p>
            )}

            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-slate-900">
                ₹{product.price?.toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-slate-400">inclusive of all taxes</span>
            </div>

            {/* Inventory Real Stock Display */}
            <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Inventory Status:</span>
                {product.isInStock ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100/60 px-2.5 py-1 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5" />
                    In Stock ({product.stock} units available)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-100/60 px-2.5 py-1 rounded-full border border-rose-200">
                    <XCircle className="w-3.5 h-3.5" />
                    Currently Out of Stock
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Real-time stock verified against actual warehouse inventory.
              </p>
            </div>

            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Description</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">
                {product.description || 'No detailed description available for this item.'}
              </p>
            </div>
          </div>

          {/* Action / Add to Cart Controls */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            {feedback && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-center justify-between ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {feedback.type === 'success' ? (
                    <Check className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
                {feedback.type === 'success' && (
                  <Link to="/cart" className="font-bold underline ml-2 hover:text-emerald-900">
                    View Cart →
                  </Link>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                <button
                  type="button"
                  disabled={quantity <= 1 || !product.isInStock}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-200 disabled:opacity-40 transition font-bold"
                >
                  -
                </button>
                <span className="px-4 py-2 text-xs font-semibold text-slate-800">{quantity}</span>
                <button
                  type="button"
                  disabled={!product.isInStock || quantity >= product.stock}
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-200 disabled:opacity-40 transition font-bold"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                disabled={!product.isInStock || adding}
                onClick={handleAddToCart}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm transition"
              >
                <ShoppingBag className="w-4 h-4" />
                {adding
                  ? 'Adding to Cart...'
                  : product.isInStock
                  ? 'Add to Cart'
                  : 'Out of Stock'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stage 6: Customer Ratings & Reviews Section */}
      <div id="reviews-section" className="mt-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Customer Ratings & Reviews</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified feedback from customers who purchased and received this product
            </p>
          </div>

          {/* Review action buttons */}
          <div>
            {!customerService.isAuthenticated() ? (
              <Link
                to={`/login?redirect=/products/${product._id}`}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
              >
                Log In to Review
              </Link>
            ) : eligibility?.canReview ? (
              <button
                type="button"
                onClick={handleOpenCreateForm}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm inline-flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Write a Review
              </button>
            ) : eligibility?.alreadyReviewed ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  ✓ You reviewed this
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenEditForm()}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition"
                >
                  Edit Review
                </button>
              </div>
            ) : (
              <span
                className="text-xs text-slate-400 italic bg-slate-100 px-3 py-1.5 rounded-lg"
                title="Only customers who have received this product in a DELIVERED order can review"
              >
                Delivered Purchase Required to Review
              </span>
            )}
          </div>
        </div>

        {/* Global Review Notification / Feedback */}
        {reviewFeedback && (
          <div
            className={`mt-4 p-4 rounded-xl text-xs flex items-center justify-between ${
              reviewFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {reviewFeedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{reviewFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setReviewFeedback(null)}
              className="text-slate-400 hover:text-slate-600 font-bold ml-4"
            >
              ×
            </button>
          </div>
        )}

        {/* Write / Edit Review Modal Box */}
        {showReviewForm && (
          <div className="mt-6 bg-slate-50 border border-indigo-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                {isEditingReview ? 'Edit Your Review' : 'Write a Product Review'}
              </h3>
              <button
                type="button"
                onClick={() => setShowReviewForm(false)}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="mt-4 space-y-4">
              {/* Star Rating Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Overall Rating <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormRating(star)}
                      className="p-1 text-amber-400 hover:scale-110 transition"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= formRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-3 text-xs font-bold text-slate-700">
                    {formRating} of 5 Stars
                  </span>
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Headline / Review Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  placeholder="e.g., Outstanding quality and fast shipping!"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Comment Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Written Feedback <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  maxLength={2000}
                  placeholder="What did you like or dislike about this product? How did it meet your expectations?"
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">
                  ✓ Verified purchase badge will be automatically attached.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReviewForm(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition shadow-sm"
                  >
                    {submittingReview ? 'Submitting...' : isEditingReview ? 'Update Review' : 'Submit Review'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Rating Breakdown & Summary Metrics */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {/* Average Rating Big Box */}
          <div className="flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-100 pb-6 md:pb-0 md:pr-6">
            <span className="text-5xl font-extrabold text-slate-900">
              {reviewSummary.averageRating.toFixed(1)}
            </span>
            <div className="flex items-center mt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    star <= Math.round(reviewSummary.averageRating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Based on {reviewSummary.totalReviews} verified rating{reviewSummary.totalReviews === 1 ? '' : 's'}
            </p>
          </div>

          {/* Rating Distribution Progress Bars */}
          <div className="md:col-span-2 space-y-2 justify-center flex flex-col">
            {[5, 4, 3, 2, 1].map((ratingNum) => {
              const count = reviewSummary.ratingDistribution?.[ratingNum] || 0;
              const pct = reviewSummary.totalReviews > 0
                ? Math.round((count / reviewSummary.totalReviews) * 100)
                : 0;

              return (
                <div key={ratingNum} className="flex items-center gap-3 text-xs">
                  <span className="w-12 text-slate-600 font-semibold flex items-center gap-1">
                    {ratingNum} <Star className="w-3 h-3 fill-amber-400 text-amber-400 inline" />
                  </span>
                  <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-slate-400 text-[11px]">
                    {pct}% ({count})
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filter and Sort Bar */}
        <div className="mt-8 flex items-center justify-between pb-3">
          <span className="text-xs font-semibold text-slate-600">
            Showing {reviews.length} of {reviewPagination.total} reviews
          </span>

          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="review-sort" className="text-slate-400">
              Sort by:
            </label>
            <select
              id="review-sort"
              value={reviewSort}
              onChange={handleSortChange}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="newest">Newest First</option>
              <option value="highest">Highest Rating</option>
              <option value="lowest">Lowest Rating</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Reviews List */}
        {reviewsLoading ? (
          <div className="py-12 text-center text-slate-400">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-2 text-xs">Loading customer reviews...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-8">
            <MessageSquare className="w-10 h-10 mx-auto text-slate-300" />
            <h4 className="mt-2 text-sm font-semibold text-slate-800">No reviews yet</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Be the first verified customer to share your experience with this product.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {reviews.map((rev) => {
              const isOwner = currentUser && (rev.customer === currentUser._id || rev.customer?._id === currentUser._id);

              return (
                <div
                  key={rev._id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm hover:border-slate-300 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-slate-800">{rev.rating}/5</span>

                      {rev.isVerifiedPurchase && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" />
                          Verified Purchase
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(rev.createdAt).toLocaleDateString('en-IN', {
                          dateStyle: 'medium',
                        })}
                      </span>

                      {/* Author Edit/Delete Controls */}
                      {isOwner && (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditForm(rev)}
                            className="p-1 text-slate-400 hover:text-indigo-600 transition"
                            title="Edit your review"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReview(rev._id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition"
                            title="Delete your review"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3">
                    <h4 className="text-xs font-bold text-slate-900">{rev.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">
                      {rev.comment}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-slate-300" />
                    <span>By {rev.customerName || 'Verified Buyer'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {reviewPagination.pages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={reviewPagination.page <= 1}
              onClick={() => handlePageChange(reviewPagination.page - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <span className="px-3 text-xs text-slate-500">
              Page {reviewPagination.page} of {reviewPagination.pages}
            </span>
            <button
              type="button"
              disabled={reviewPagination.page >= reviewPagination.pages}
              onClick={() => handlePageChange(reviewPagination.page + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
