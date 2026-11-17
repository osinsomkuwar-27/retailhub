import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Calendar, ChevronRight, XCircle, AlertCircle, ShoppingBag } from 'lucide-react';
import customerService from '../../services/customerService';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate('/login?redirect=/orders');
      return;
    }
    fetchOrders();
  }, [navigate]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerService.getMyOrders();
      setOrders(data?.orders || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load order history');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (orderId) => {
    const reason = window.prompt('Please enter a cancellation reason:');
    if (reason === null) return; // user clicked Cancel

    try {
      setCancellingId(orderId);
      await customerService.cancelOrder(orderId, reason || 'Customer requested cancellation');
      await fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Cancellation failed');
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading your orders...</p>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const map = {
      PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
      CONFIRMED: 'bg-blue-50 text-blue-700 border-blue-200',
      PROCESSING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      SHIPPED: 'bg-purple-50 text-purple-700 border-purple-200',
      DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
    };
    return map[status] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track, review, or manage your recent purchases</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-2xl p-8 mt-6">
          <ShoppingBag className="w-14 h-14 mx-auto text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">No orders placed yet</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            You haven't placed any orders yet. Check out our catalog to find products.
          </p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4 mt-6">
          {orders.map((order) => {
            const isEligibleForCancel = ['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status);

            return (
              <div
                key={order._id}
                className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm hover:border-slate-300 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-slate-900">{order.orderNumber}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-base font-extrabold text-slate-900">
                      ₹{order.totalAmount?.toLocaleString('en-IN')}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {order.items?.length || 0} item{order.items?.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Items summary */}
                <div className="py-4 space-y-2">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs text-slate-600">
                      <span className="line-clamp-1 pr-2">
                        {item.name} <span className="text-slate-400">× {item.quantity}</span>
                      </span>
                      <span className="font-semibold text-slate-800">
                        ₹{item.subtotal?.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Card Action footer */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div>
                    {isEligibleForCancel && (
                      <button
                        type="button"
                        disabled={cancellingId === order._id}
                        onClick={() => handleCancel(order._id)}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {cancellingId === order._id ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    )}
                    {order.status === 'CANCELLED' && order.cancellationReason && (
                      <span className="text-[11px] text-slate-400 italic">
                        Reason: {order.cancellationReason}
                      </span>
                    )}
                  </div>

                  <Link
                    to={`/orders/${order._id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    View Details
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
