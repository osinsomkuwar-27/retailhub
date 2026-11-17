import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, PackageCheck, ArrowRight, ShoppingBag, MapPin, Calendar } from 'lucide-react';
import customerService from '../../services/customerService';

export default function OrderConfirmation() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const data = await customerService.getOrderById(id);
      setOrder(data?.order || null);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-3 text-sm">Loading order confirmation...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 shadow-sm text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mt-5">Order Placed Successfully!</h1>
        <p className="text-xs text-slate-500 mt-1">
          Thank you for your purchase. Your order has been placed and inventory is reserved.
        </p>

        {order && (
          <div className="mt-8 text-left bg-slate-50 rounded-2xl p-6 border border-slate-100">
            <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-200 gap-2">
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Order Number</span>
                <p className="text-sm font-mono font-bold text-indigo-600">{order.orderNumber}</p>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Order Status</span>
                <span className="block text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full border border-emerald-200 text-center mt-0.5">
                  {order.status}
                </span>
              </div>
            </div>

            <div className="py-4 border-b border-slate-200 space-y-2 text-xs">
              <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider block mb-2">Items Ordered</span>
              {order.items?.map((item) => (
                <div key={item._id} className="flex justify-between items-center text-slate-700">
                  <span className="line-clamp-1 flex-1 pr-2">
                    {item.name} <span className="text-slate-400">× {item.quantity}</span>
                  </span>
                  <span className="font-bold text-slate-900">₹{item.subtotal?.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-between items-center text-sm">
              <span className="font-bold text-slate-800">Total Amount</span>
              <span className="font-extrabold text-base text-indigo-600">₹{order.totalAmount?.toLocaleString('en-IN')}</span>
            </div>

            {order.shippingAddress && (
              <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <span>
                  Delivering to: {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {order?.paymentStatus === 'PENDING' && order?.paymentMethod === 'PENDING' && (
            <Link
              to={`/payments/${order._id}`}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm transition flex items-center gap-1.5"
            >
              Choose Payment Method & Pay
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
          <Link
            to={`/orders/${order?._id || ''}`}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-sm transition flex items-center gap-1.5"
          >
            View Order Details
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/orders"
            className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition"
          >
            All Orders
          </Link>
          <Link
            to="/products"
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
