import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, ShieldCheck, ShoppingBag, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import customerService from '../../services/customerService';

export default function Checkout() {
  const { cart, loading, refreshCart } = useCart() || {};
  const navigate = useNavigate();

  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate('/login?redirect=/checkout');
      return;
    }
    loadProfileAddress();
  }, [navigate]);

  const loadProfileAddress = async () => {
    try {
      const data = await customerService.getProfile();
      if (data?.user?.address) {
        setAddress({
          street: data.user.address.street || '',
          city: data.user.address.city || '',
          state: data.user.address.state || '',
          postalCode: data.user.address.postalCode || '',
          country: data.user.address.country || 'India',
        });
      }
    } catch (_) {}
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setError(null);

    if (!address.street || !address.city || !address.state || !address.postalCode) {
      setError('Please provide a complete shipping address');
      return;
    }

    try {
      setSubmitting(true);
      const idempotencyKey = `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const res = await customerService.checkout({
        shippingAddress: address,
        idempotencyKey,
      });

      if (refreshCart) await refreshCart();

      if (res?.order?._id) {
        navigate(`/orders/confirmation/${res.order._id}`);
      } else {
        navigate('/orders');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Checkout failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !cart) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Preparing checkout...</p>
      </div>
    );
  }

  const items = cart?.items || [];
  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 mt-4">Your cart is empty</h2>
          <p className="text-xs text-slate-500 mt-2">
            Add items to your cart before proceeding to checkout.
          </p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Explore Catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/cart"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Shopping Cart
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Shipping Address Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900 pb-4 border-b border-slate-100 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              Delivery Address
            </h1>

            {error && (
              <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handlePlaceOrder} id="checkout-form" className="space-y-4 mt-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Street Address / Flat / Floor
                </label>
                <input
                  type="text"
                  required
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  placeholder="e.g. Flat 402, Sunshine Towers, MG Road"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="e.g. Pune"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    required
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    placeholder="e.g. Maharashtra"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    required
                    value={address.postalCode}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                    placeholder="e.g. 411001"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={address.country}
                    onChange={(e) => setAddress({ ...address, country: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>
            </form>

            <div className="mt-8 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Transaction Safety & Inventory Verification:</span>
                <p className="mt-1 text-[11px] text-indigo-700 leading-relaxed">
                  When you place an order, stock is atomically verified and allocated in a MongoDB transaction.
                  Order snapshots are immutable. Payment management will be selected in Stage 5.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Order Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm sticky top-24">
            <h2 className="text-base font-bold text-slate-900 pb-4 border-b border-slate-100">
              Order Review ({cart.totalItems} items)
            </h2>

            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto my-3 pr-1">
              {items.map((item) => (
                <div key={item._id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="pr-2">
                    <p className="font-semibold text-slate-800 line-clamp-1">{item.product?.name}</p>
                    <p className="text-[11px] text-slate-400">Qty: {item.quantity} × ₹{item.unitPrice}</p>
                  </div>
                  <span className="font-bold text-slate-900 flex-shrink-0">
                    ₹{item.subtotal?.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">₹{cart.subtotal?.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Standard Shipping</span>
                <span className="font-semibold text-emerald-600">FREE</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between text-sm">
                <span className="font-bold text-slate-900">Total Payable</span>
                <span className="font-extrabold text-indigo-600 text-base">₹{cart.total?.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <button
              type="submit"
              form="checkout-form"
              disabled={submitting || cart.hasStockIssue}
              className="w-full mt-6 py-3 px-4 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-2"
            >
              {submitting ? 'Confirming Order...' : 'Place Order & Reserve Stock'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
