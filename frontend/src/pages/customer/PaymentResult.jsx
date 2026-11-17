import { useEffect, useState } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight, ArrowLeft, RefreshCw, ShoppingBag, Receipt, MapPin } from 'lucide-react';
import customerService from '../../services/customerService';

export default function PaymentResult() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const passedResult = location.state?.paymentResult;

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate('/login');
      return;
    }
    fetchOrderAndPayments();
  }, [orderId, navigate]);

  const fetchOrderAndPayments = async () => {
    try {
      setLoading(true);
      const [orderRes, paymentsRes] = await Promise.all([
        customerService.getOrderById(orderId),
        customerService.getPaymentByOrderId(orderId),
      ]);
      setOrder(orderRes?.order || null);
      setPayments(paymentsRes?.payments || []);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-3 text-sm">Verifying payment receipt...</p>
      </div>
    );
  }

  // Determine latest payment or fallback from passed state
  const latestPayment = payments[0] || passedResult?.payment;
  const isSuccess = order?.paymentStatus === 'PAID' || latestPayment?.status === 'PAID';
  const isCOD = order?.paymentMethod === 'COD' || latestPayment?.paymentMethod === 'COD';
  const isFailed = latestPayment?.status === 'FAILED' && !isSuccess;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 shadow-sm text-center">
        {isSuccess ? (
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>
        ) : isCOD ? (
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <Receipt className="w-10 h-10" />
          </div>
        ) : (
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <XCircle className="w-10 h-10" />
          </div>
        )}

        <h1 className="text-2xl font-bold text-slate-900 mt-5">
          {isSuccess
            ? 'Payment Successful!'
            : isCOD
            ? 'Cash on Delivery Confirmed'
            : 'Payment Authorization Declined'}
        </h1>

        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          {isSuccess
            ? 'Your mock online payment has been approved and verified on the server.'
            : isCOD
            ? 'Order confirmed. Please keep cash or UPI ready at the time of delivery.'
            : latestPayment?.gatewayResponse?.message || 'The simulated payment transaction failed.'}
        </p>

        {/* Receipt Box */}
        <div className="mt-8 text-left bg-slate-50 rounded-2xl p-6 border border-slate-100 text-xs space-y-3">
          <div className="flex justify-between items-center pb-3 border-b border-slate-200">
            <span className="text-slate-500">Order Number</span>
            <span className="font-mono font-bold text-slate-800">{order?.orderNumber}</span>
          </div>

          {latestPayment?.paymentNumber && (
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <span className="text-slate-500">Payment Reference</span>
              <span className="font-mono font-semibold text-indigo-600">{latestPayment.paymentNumber}</span>
            </div>
          )}

          {latestPayment?.transactionId && (
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <span className="text-slate-500">Transaction ID (Mock)</span>
              <span className="font-mono text-slate-700">{latestPayment.transactionId}</span>
            </div>
          )}

          <div className="flex justify-between items-center pb-3 border-b border-slate-200">
            <span className="text-slate-500">Payment Method</span>
            <span className="font-semibold text-slate-800">{latestPayment?.paymentMethod || order?.paymentMethod}</span>
          </div>

          <div className="flex justify-between items-center pb-3 border-b border-slate-200">
            <span className="text-slate-500">Payment Status</span>
            <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
              isSuccess ? 'bg-emerald-100 text-emerald-800' : isCOD ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {isSuccess ? 'PAID' : isCOD ? 'PENDING (COD)' : 'FAILED'}
            </span>
          </div>

          <div className="flex justify-between items-center pt-1 text-sm font-bold">
            <span className="text-slate-800">Amount</span>
            <span className="text-indigo-600 text-base">₹{order?.totalAmount?.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {isFailed && (
            <Link
              to={`/payments/${orderId}`}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-sm transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Payment
            </Link>
          )}

          <Link
            to={`/orders/${orderId}`}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition"
          >
            Order Details
          </Link>

          <Link
            to="/payments/history"
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
          >
            Payment History
          </Link>
        </div>
      </div>
    </div>
  );
}
