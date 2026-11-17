import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, MapPin, Calendar, CreditCard, XCircle, AlertCircle, CheckCircle } from 'lucide-react';
import customerService from '../../services/customerService';

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate(`/login?redirect=/orders/${id}`);
      return;
    }
    fetchOrder();
  }, [id, navigate]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerService.getOrderById(id);
      setOrder(data?.order || null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    const reason = window.prompt('Please enter a cancellation reason:');
    if (reason === null) return;

    try {
      setCancelling(true);
      await customerService.cancelOrder(order._id, reason || 'Customer requested cancellation');
      await fetchOrder();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Cancellation failed');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading order details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 mt-4">Order Not Found</h2>
          <p className="text-xs text-slate-500 mt-1">{error || 'Unable to retrieve order details.'}</p>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Orders
          </Link>
        </div>
      </div>
    );
  }

  const isEligibleForCancel = ['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/orders"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Orders
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Order Details</span>
            <h1 className="text-xl sm:text-2xl font-mono font-bold mt-1">{order.orderNumber}</h1>
            <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              Placed on {new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-semibold tracking-wide border border-white/20">
              Status: {order.status}
            </span>
            <span className="text-xs text-slate-300">
              Payment: <strong className="text-white">{order.paymentStatus}</strong> ({order.paymentMethod})
            </span>
            {order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED' && order.paymentMethod === 'PENDING' && (
              <Link
                to={`/payments/${order._id}`}
                className="mt-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                Complete Payment →
              </Link>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Items breakdown */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              Purchased Items ({order.items?.length || 0})
            </h2>

            <div className="divide-y divide-slate-100 mt-2">
              {order.items?.map((item, idx) => (
                <div key={idx} className="py-4 flex items-center justify-between text-xs gap-4">
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900">{item.name}</h3>
                    {item.sku && <p className="text-[11px] font-mono text-slate-400 mt-0.5">SKU: {item.sku}</p>}
                    <p className="text-slate-500 mt-1">
                      Quantity: <strong className="text-slate-800">{item.quantity}</strong> × ₹{item.price?.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-900">
                      ₹{item.subtotal?.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800">₹{order.totalAmount?.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span className="font-semibold text-emerald-600">FREE</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-900">Grand Total</span>
                <span className="font-extrabold text-base text-indigo-600">₹{order.totalAmount?.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div className="pt-6 border-t border-slate-100">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                Delivery Information
              </h2>
              <div className="mt-3 p-4 bg-slate-50 rounded-xl text-xs text-slate-700 leading-relaxed border border-slate-100">
                <p className="font-semibold">{order.shippingAddress.street}</p>
                <p>{order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}</p>
                <p className="text-slate-500 mt-0.5">{order.shippingAddress.country}</p>
              </div>
            </div>
          )}

          {/* Cancellation Info & Actions */}
          <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              {order.status === 'CANCELLED' ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  <p className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    Order Cancelled
                  </p>
                  {order.cancelledAt && (
                    <p className="text-[11px] text-rose-600 mt-0.5">
                      Cancelled on {new Date(order.cancelledAt).toLocaleString('en-IN')}
                    </p>
                  )}
                  {order.cancellationReason && (
                    <p className="text-[11px] text-slate-600 mt-1 italic">
                      Reason: "{order.cancellationReason}"
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {isEligibleForCancel
                    ? 'Need to make changes? You can cancel your order before it ships.'
                    : 'This order is in transit or completed and can no longer be cancelled.'}
                </p>
              )}
            </div>

            {isEligibleForCancel && (
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancel}
                className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {cancelling ? 'Cancelling Order...' : 'Cancel This Order'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
