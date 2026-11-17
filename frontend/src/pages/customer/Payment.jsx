import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CreditCard, Banknote, ShieldAlert, CheckCircle2, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import customerService from '../../services/customerService';

export default function Payment() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [paymentMethod, setPaymentMethod] = useState('MOCK_ONLINE');
  const [simulateOutcome, setSimulateOutcome] = useState('SUCCESS');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate(`/login?redirect=/payments/${orderId}`);
      return;
    }
    fetchOrder();
  }, [orderId, navigate]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerService.getOrderById(orderId);
      const ord = data?.order;
      if (!ord) throw new Error('Order not found');

      if (ord.paymentStatus === 'PAID') {
        navigate(`/payments/result/${orderId}`);
        return;
      }
      if (ord.status === 'CANCELLED') {
        setError('This order has been cancelled and cannot be paid.');
      }
      setOrder(ord);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!order || processing) return;

    try {
      setProcessing(true);
      setError(null);

      const res = await customerService.processPayment({
        orderId: order._id,
        paymentMethod,
        simulateOutcome: paymentMethod === 'MOCK_ONLINE' ? simulateOutcome : undefined,
      });

      navigate(`/payments/result/${order._id}`, { state: { paymentResult: res } });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Payment processing failed';
      setError(msg);
      // If it returned a failed payment record, pass it to result screen
      if (err.response?.data?.payment) {
        navigate(`/payments/result/${order._id}`, { state: { paymentResult: err.response.data } });
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading payment options...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 mt-4">Order Not Found</h2>
          <p className="text-xs text-slate-500 mt-1">{error || 'Unable to locate order for payment.'}</p>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        to={`/orders/${order._id}`}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Order #{order.orderNumber}
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Payment Gateway</span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">Select Payment Method</h1>
            <p className="text-xs text-slate-500 mt-0.5">Order #{order.orderNumber}</p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-slate-400">Amount Due</span>
            <p className="text-2xl font-extrabold text-indigo-600">₹{order.totalAmount?.toLocaleString('en-IN')}</p>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmitPayment} className="space-y-6 mt-8">
          {/* Method 1: Mock Online Payment */}
          <div
            onClick={() => setPaymentMethod('MOCK_ONLINE')}
            className={`p-5 rounded-2xl border cursor-pointer transition ${
              paymentMethod === 'MOCK_ONLINE'
                ? 'border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-500/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  paymentMethod === 'MOCK_ONLINE' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Mock Online Payment</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Simulate instant credit card / net banking authorization</p>
                </div>
              </div>
              <input
                type="radio"
                name="paymentMethod"
                value="MOCK_ONLINE"
                checked={paymentMethod === 'MOCK_ONLINE'}
                onChange={() => setPaymentMethod('MOCK_ONLINE')}
                className="mt-1 text-indigo-600 focus:ring-indigo-500"
              />
            </div>

            {paymentMethod === 'MOCK_ONLINE' && (
              <div className="mt-4 pt-4 border-t border-indigo-100/60 pl-13">
                <p className="text-xs font-semibold text-slate-700 mb-2">Simulate Gateway Outcome:</p>
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="simulateOutcome"
                      value="SUCCESS"
                      checked={simulateOutcome === 'SUCCESS'}
                      onChange={() => setSimulateOutcome('SUCCESS')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium text-emerald-700">Simulate Success (Approved)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="simulateOutcome"
                      value="FAIL"
                      checked={simulateOutcome === 'FAIL'}
                      onChange={() => setSimulateOutcome('FAIL')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium text-rose-700">Simulate Failure (Card Decline)</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Method 2: Cash on Delivery (COD) */}
          <div
            onClick={() => setPaymentMethod('COD')}
            className={`p-5 rounded-2xl border cursor-pointer transition ${
              paymentMethod === 'COD'
                ? 'border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-500/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  paymentMethod === 'COD' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Cash on Delivery (COD)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Pay with cash or UPI at your doorstep upon package arrival</p>
                </div>
              </div>
              <input
                type="radio"
                name="paymentMethod"
                value="COD"
                checked={paymentMethod === 'COD'}
                onChange={() => setPaymentMethod('COD')}
                className="mt-1 text-indigo-600 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-700">Academic / Sandbox Simulation Environment:</span>
              <p className="mt-0.5 leading-relaxed text-[11px]">
                This is a mock payment simulation. Real credit card numbers, CVVs, PINs, or banking credentials are never requested or stored.
              </p>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <Link
              to="/orders"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              Pay Later
            </Link>

            <button
              type="submit"
              disabled={processing || order.status === 'CANCELLED'}
              className="py-3 px-6 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm flex items-center gap-2"
            >
              {processing
                ? 'Processing...'
                : paymentMethod === 'COD'
                ? 'Confirm Cash on Delivery'
                : `Authorize Mock Payment (₹${order.totalAmount?.toLocaleString('en-IN')})`}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
