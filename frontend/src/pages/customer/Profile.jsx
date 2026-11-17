import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Phone, MapPin, CheckCircle, AlertCircle, ShoppingBag, CreditCard, MessageSquare } from 'lucide-react';
import customerService from '../../services/customerService';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!customerService.isAuthenticated()) {
      navigate('/login?redirect=/profile');
      return;
    }
    fetchProfile();
  }, [navigate]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await customerService.getProfile();
      if (data?.user) {
        setUser(data.user);
        setFormData({
          name: data.user.name || '',
          phone: data.user.phone || '',
          street: data.user.address?.street || '',
          city: data.user.address?.city || '',
          state: data.user.address?.state || '',
          postalCode: data.user.address?.postalCode || '',
          country: data.user.address?.country || 'India',
        });
      }
    } catch (_) {
      customerService.logout();
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const payload = {
        name: formData.name,
        phone: formData.phone,
        address: {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
          country: formData.country,
        },
      };
      const res = await customerService.updateProfile(payload);
      if (res?.user) {
        setUser(res.user);
        localStorage.setItem('user', JSON.stringify(res.user));
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm">Loading customer profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm">
        <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-sm">
            {user?.name ? user.name[0].toUpperCase() : 'U'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{user?.name}</h1>
            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{user?.email}</span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-semibold rounded-full text-[10px]">
                {user?.role}
              </span>
            </p>
          </div>
        </div>

        {/* Quick customer shortcuts */}
        <div className="grid grid-cols-3 gap-3 py-4 border-b border-slate-100">
          <Link
            to="/orders"
            className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 text-xs font-semibold text-slate-700 hover:text-indigo-700 transition"
          >
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
            <span>My Orders</span>
          </Link>
          <Link
            to="/payments/history"
            className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 text-xs font-semibold text-slate-700 hover:text-indigo-700 transition"
          >
            <CreditCard className="w-4 h-4 text-indigo-600" />
            <span>Payments</span>
          </Link>
          <Link
            to="/reviews/my-reviews"
            className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 text-xs font-semibold text-slate-700 hover:text-indigo-700 transition"
          >
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            <span>My Reviews</span>
          </Link>
        </div>

        {message && (
          <div
            className={`my-6 p-4 rounded-xl text-xs flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-6 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email (Read Only)</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-600" />
              Default Delivery Address
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  placeholder="Flat / House No., Building, Street"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Pune / Mumbai"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="Maharashtra"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  placeholder="411001"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="py-2.5 px-6 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
            >
              {saving ? 'Saving Changes...' : 'Save Profile Details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
