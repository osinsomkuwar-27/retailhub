import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, ArrowLeft, AlertCircle, ArrowRight, PackageOpen } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import customerService from '../../services/customerService';

export default function Cart() {
  const { cart, loading, error, updateQuantity, removeItem, clearCart } = useCart() || {};
  const navigate = useNavigate();

  if (!customerService.isAuthenticated()) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <ShoppingBag className="w-12 h-12 text-indigo-600 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 mt-4">Sign in to view your cart</h2>
          <p className="text-xs text-slate-500 mt-2">
            Your cart is securely saved to your customer account across all devices.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              to="/login?redirect=/cart"
              className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition"
            >
              Sign In
            </Link>
            <Link
              to="/register?redirect=/cart"
              className="w-full py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition"
            >
              Create Customer Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !cart) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading your cart...</p>
      </div>
    );
  }

  const items = cart?.items || [];
  const hasItems = items.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shopping Cart</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {hasItems ? `${cart.totalItems} item${cart.totalItems > 1 ? 's' : ''} in your cart` : 'Your cart is empty'}
          </p>
        </div>

        {hasItems && (
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to clear your cart?')) {
                clearCart();
              }
            }}
            className="text-xs text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Cart
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cart?.hasStockIssue && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span>
            Some items in your cart exceed available warehouse inventory. Please adjust quantities before checkout.
          </span>
        </div>
      )}

      {!hasItems ? (
        <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-2xl p-8 mt-6">
          <PackageOpen className="w-14 h-14 mx-auto text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">Your shopping cart is empty</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Explore our product catalog and find items to add to your cart.
          </p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          {/* Cart Item List */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item._id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition ${
                  item.hasStockIssue ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-400">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                  <div>
                    <Link
                      to={`/products/${item.productId}`}
                      className="font-semibold text-sm text-slate-900 hover:text-indigo-600 transition line-clamp-1"
                    >
                      {item.product?.name || 'Product'}
                    </Link>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      SKU: {item.product?.sku || 'N/A'}
                    </p>
                    <p className="text-xs font-bold text-slate-800 mt-1">
                      ₹{item.unitPrice?.toLocaleString('en-IN')}
                    </p>
                    {item.errorMessage && (
                      <p className="text-[11px] text-amber-700 font-medium mt-1">
                        ⚠️ {item.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quantity Controls & Subtotal */}
                <div className="flex items-center justify-between w-full sm:w-auto gap-6 sm:border-l sm:border-slate-100 sm:pl-6">
                  {/* +/- buttons */}
                  <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                    <button
                      type="button"
                      disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 disabled:opacity-40 transition font-bold"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 text-xs font-bold text-slate-800 min-w-[28px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      disabled={item.quantity >= (item.product?.stock || 0)}
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 disabled:opacity-40 transition font-bold"
                    >
                      +
                    </button>
                  </div>

                  {/* Item Subtotal */}
                  <div className="text-right min-w-[80px]">
                    <span className="text-sm font-bold text-slate-900">
                      ₹{item.subtotal?.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Remove Item */}
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            <div className="pt-2">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Continue Shopping
              </Link>
            </div>
          </div>

          {/* Order Summary Card */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm sticky top-24">
              <h2 className="text-base font-bold text-slate-900 pb-4 border-b border-slate-100">
                Order Summary
              </h2>

              <div className="space-y-3 mt-4 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal ({cart.totalItems} items)</span>
                  <span className="font-semibold text-slate-900">₹{cart.subtotal?.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Estimated Shipping</span>
                  <span className="font-semibold text-emerald-600">FREE</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Taxes (GST)</span>
                  <span className="font-semibold text-slate-500">Included</span>
                </div>
                <div className="pt-3 border-t border-slate-100 flex justify-between text-sm">
                  <span className="font-bold text-slate-900">Order Total</span>
                  <span className="font-extrabold text-indigo-600 text-base">₹{cart.total?.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={cart.hasStockIssue || !hasItems}
                onClick={() => navigate('/checkout')}
                className="w-full mt-6 py-3 px-4 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm transition flex items-center justify-center gap-2"
              >
                Proceed to Checkout
                <ArrowRight className="w-4 h-4" />
              </button>

              {cart.hasStockIssue && (
                <p className="text-[11px] text-amber-700 text-center mt-2 font-medium">
                  Please resolve stock issues before checkout.
                </p>
              )}

              <p className="text-[10px] text-slate-400 text-center mt-4">
                Prices and stock are strictly verified against backend database records.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
