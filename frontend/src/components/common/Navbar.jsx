import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, Search, ShieldCheck, LogOut } from 'lucide-react';
import customerService from '../../services/customerService';
import { useCart } from '../../context/CartContext';

export default function Navbar() {
  const [user, setUser] = useState(customerService.getCurrentUser());
  const [searchTerm, setSearchTerm] = useState('');
  const { cartCount, refreshCart } = useCart() || { cartCount: 0 };
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setUser(customerService.getCurrentUser());
    if (customerService.isAuthenticated() && refreshCart) {
      refreshCart();
    }
  }, [location.pathname, refreshCart]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchTerm.trim())}`);
    } else {
      navigate('/products');
    }
  };

  const handleLogout = () => {
    customerService.logout();
    setUser(null);
    if (refreshCart) refreshCart();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo / Brand */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              R
            </div>
            <div>
              <span className="text-lg font-bold text-slate-900 tracking-tight">Retail<span className="text-indigo-600">Hub</span></span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">Storefront</span>
            </div>
          </Link>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search products by title, category, SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-sm rounded-full border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>
          </form>

          {/* Navigation Links */}
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/products"
              className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition px-2 py-1"
            >
              Catalog
            </Link>

            {user && (
              <>
                <Link
                  to="/orders"
                  className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition px-2 py-1"
                >
                  Orders
                </Link>
                <Link
                  to="/payments/history"
                  className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition px-2 py-1"
                >
                  Payments
                </Link>
                <Link
                  to="/reviews/my-reviews"
                  className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition px-2 py-1"
                >
                  Reviews
                </Link>
              </>
            )}

            {/* Switch to Person 3 Intelligence Dashboard */}
            <Link
              to="/intelligence"
              className="hidden lg:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition"
              title="Person 3 Smart Inventory & Intelligence"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Intelligence
            </Link>

            {/* Cart indicator with actual counter */}
            <Link
              to="/cart"
              className="relative p-2 text-slate-600 hover:text-indigo-600 transition rounded-full hover:bg-slate-100"
              title="View Shopping Cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-indigo-600 rounded-full flex items-center justify-center shadow-sm">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>

            {/* User authentication */}
            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600"
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200">
                    {user.name ? user.name[0].toUpperCase() : 'U'}
                  </div>
                  <span className="hidden sm:inline max-w-[100px] truncate">{user.name}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/login"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
                >
                  Register
                </Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
