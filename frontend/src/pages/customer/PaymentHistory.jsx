import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, ChevronRight, AlertCircle, ShoppingBag, ShieldCheck } from 'lucide-react';
import customerService from '../../services/customerService';

export default function PaymentHistory() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate('/login?redirect=/payments/history');
      return;
    }
    fetchPayments();
  }, [navigate]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerService.getPaymentHistory();
      setPayments(data?.payments || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load payment history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
      FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
      REFUNDED: 'bg-purple-50 text-purple-700 border-purple-200',
    };
    return map[status] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading payment transactions...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payment History</h1>
          <p className="text-sm text-slate-500 mt-0.5">Audit log of your payment transactions and receipts</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-2xl p-8 mt-6">
          <CreditCard className="w-14 h-14 mx-auto text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">No payment records found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Payment transactions for completed purchases will appear here.
          </p>
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-sm"
          >
            View Your Orders
          </Link>
        </div>
      ) : (
        <div className="space-y-4 mt-6">
          {payments.map((p) => (
            <div
              key={p._id}
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm hover:border-slate-300 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-900">{p.paymentNumber}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(p.status)}`}>
                      {p.status}
                    </span>
                    <span className="text-xs text-slate-400">({p.paymentMethod})</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(p.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-base font-extrabold text-slate-900">
                    ₹{p.amount?.toLocaleString('en-IN')}
                  </span>
                  <span className="block text-[11px] font-mono text-indigo-600">
                    Order: {p.orderNumber}
                  </span>
                </div>
              </div>

              {/* Extra details */}
              <div className="py-3 text-xs text-slate-500 space-y-1">
                {p.transactionId && (
                  <p>
                    <span className="text-slate-400">Transaction ID:</span> <span className="font-mono text-slate-700">{p.transactionId}</span>
                  </p>
                )}
                {p.gatewayResponse?.message && (
                  <p>
                    <span className="text-slate-400">Gateway Note:</span> {p.gatewayResponse.message}
                  </p>
                )}
                {p.status === 'REFUNDED' && p.refundDetails?.refundNote && (
                  <div className="mt-2 p-2.5 bg-purple-50 border border-purple-100 rounded-lg text-purple-900 text-[11px]">
                    <strong>Refund Info (Simulated):</strong> {p.refundDetails.refundNote}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-400">
                  {p.gatewayResponse?.isSimulated ? '✓ Mock Sandbox Transaction' : 'Physical COD'}
                </span>

                <Link
                  to={`/orders/${p.order}`}
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  View Related Order
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
