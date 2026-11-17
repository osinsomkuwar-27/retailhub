import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Star,
  MessageSquare,
  Edit3,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Package,
} from 'lucide-react';
import customerService from '../../services/customerService';

export default function MyReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editRating, setEditRating] = useState(5);
  const [editTitle, setEditTitle] = useState('');
  const [editComment, setEditComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate('/login?redirect=/reviews/my-reviews');
      return;
    }
    fetchMyReviews();
  }, [navigate]);

  const fetchMyReviews = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerService.getMyReviews();
      setReviews(data?.reviews || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load your reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (rev) => {
    setEditingReviewId(rev._id);
    setEditRating(rev.rating);
    setEditTitle(rev.title);
    setEditComment(rev.comment);
    setFeedback(null);
  };

  const handleCancelEdit = () => {
    setEditingReviewId(null);
    setEditRating(5);
    setEditTitle('');
    setEditComment('');
  };

  const handleSaveEdit = async (id) => {
    try {
      setSaving(true);
      setFeedback(null);
      await customerService.updateReview(id, {
        rating: editRating,
        title: editTitle,
        comment: editComment,
      });
      setFeedback({ type: 'success', text: 'Review updated successfully!' });
      setEditingReviewId(null);
      await fetchMyReviews();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to update review',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this review?')) return;

    try {
      setSaving(true);
      setFeedback(null);
      await customerService.deleteReview(id);
      setFeedback({ type: 'success', text: 'Review deleted successfully.' });
      await fetchMyReviews();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to delete review',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading your submitted reviews...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Product Reviews</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your verified purchase reviews and ratings
          </p>
        </div>
        <Link
          to="/products"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
        >
          Browse Products →
        </Link>
      </div>

      {feedback && (
        <div
          className={`mt-4 p-4 rounded-xl text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 ml-4 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-2xl p-8 mt-6">
          <MessageSquare className="w-14 h-14 mx-auto text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">No reviews written yet</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Once your orders are DELIVERED, you can write reviews and rate the products you received.
          </p>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm"
          >
            <Package className="w-4 h-4" />
            View Delivered Orders
          </Link>
        </div>
      ) : (
        <div className="space-y-5 mt-6">
          {reviews.map((rev) => (
            <div
              key={rev._id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-slate-300 transition"
            >
              {editingReviewId === rev._id ? (
                /* Edit Form */
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-700">Editing Review</span>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Rating selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Rating (1 to 5 Stars)
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setEditRating(star)}
                          className="p-1 text-amber-400 hover:scale-110 transition"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              star <= editRating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-xs font-bold text-slate-700">{editRating} / 5</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Review Title
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      maxLength={120}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Review Comment
                    </label>
                    <textarea
                      rows={3}
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      maxLength={2000}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(rev._id)}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal View */
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      {rev.productDetails?.name ? (
                        <Link
                          to={`/products/${rev.product}`}
                          className="font-bold text-sm text-slate-900 hover:text-indigo-600 inline-flex items-center gap-1.5 transition"
                        >
                          {rev.productDetails.name}
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Link>
                      ) : (
                        <Link
                          to={`/products/${rev.product}`}
                          className="font-bold text-sm text-slate-900 hover:text-indigo-600 inline-flex items-center gap-1.5 transition"
                        >
                          Product #{String(rev.product).slice(-6)}
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Link>
                      )}

                      <div className="flex items-center gap-2 mt-1">
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
                        <span className="text-xs font-bold text-slate-700">{rev.rating}/5</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" />
                          Verified Purchase
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(rev)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition font-medium"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rev._id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 transition font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="pt-3">
                    <h4 className="text-xs font-bold text-slate-900">{rev.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">
                      {rev.comment}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Reviewed on {new Date(rev.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                      {rev.updatedAt && rev.updatedAt !== rev.createdAt && ' (edited)'}
                    </span>
                    <Link
                      to={`/products/${rev.product}`}
                      className="font-semibold text-indigo-600 hover:underline"
                    >
                      View on Product Page →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
