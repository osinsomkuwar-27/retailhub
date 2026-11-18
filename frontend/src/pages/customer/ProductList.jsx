import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowUpDown, PackageOpen, CheckCircle, AlertTriangle, ShoppingBag, Check } from 'lucide-react';
import customerService from '../../services/customerService';
import { useCart } from '../../context/CartContext';

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToCart } = useCart() || {};
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [addedMap, setAddedMap] = useState({});

  // Filter and sort states
  const searchTerm = searchParams.get('search') || '';
  const selectedCategory = searchParams.get('category') || '';
  const selectedSort = searchParams.get('sortBy') || 'newest';
  const inStockOnly = searchParams.get('inStock') === 'true';

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [searchTerm, selectedCategory, selectedSort, inStockOnly]);

  const fetchCategories = async () => {
    try {
      const data = await customerService.getCategories();
      if (data?.categories) setCategories(data.categories);
    } catch (_) {
      // Graceful fallback
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        search: searchTerm,
        category: selectedCategory,
        sortBy: selectedSort,
        inStock: inStockOnly ? 'true' : undefined,
      };
      const data = await customerService.getProducts(params);
      setProducts(data?.products || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const handleQuickAdd = async (e, product) => {
    e.preventDefault();
    e.stopPropagation();

    if (!product.isInStock || addingId) return;

    setAddingId(product._id);
    const res = await addToCart(product._id, 1);
    setAddingId(null);

    if (res.requireAuth) {
      navigate(`/login?redirect=/products`);
      return;
    }

    if (res.success) {
      setAddedMap((prev) => ({ ...prev, [product._id]: true }));
      setTimeout(() => {
        setAddedMap((prev) => ({ ...prev, [product._id]: false }));
      }, 2000);
    } else {
      alert(res.message || 'Could not add product to cart');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Explore Products</h1>
          <p className="text-sm text-slate-500 mt-1">Browse catalog, view real-time warehouse stock, and find what you need.</p>
        </div>

        {/* Sorting and stock filter controls */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 transition">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => updateParam('inStock', e.target.checked ? 'true' : '')}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            In Stock Only
          </label>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            <select
              value={selectedSort}
              onChange={(e) => updateParam('sortBy', e.target.value)}
              className="text-xs font-medium text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="newest">Newest First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-8">
        {/* Filters Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-600" />
                Categories
              </span>
              {selectedCategory && (
                <button
                  onClick={() => updateParam('category', '')}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="mt-3 space-y-1">
              <button
                onClick={() => updateParam('category', '')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                  !selectedCategory
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => updateParam('category', cat)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                    selectedCategory.toLowerCase() === cat.toLowerCase()
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
              {categories.length === 0 && (
                <p className="text-xs text-slate-400 italic px-3 py-2">No categories yet</p>
              )}
            </div>
          </div>
        </aside>

        {/* Product Grid Area */}
        <main className="lg:col-span-3">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-3 text-sm">Loading products...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Error Loading Products
              </div>
              <p className="mt-1">{error}</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-xl p-8">
              <PackageOpen className="w-12 h-12 mx-auto text-slate-300" />
              <h3 className="mt-3 text-base font-semibold text-slate-800">No products found</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                {searchTerm || selectedCategory
                  ? 'Try clearing your filters or searching for something else.'
                  : 'Person 1 catalog is awaiting initialization or seed data. Products and stock will appear here automatically.'}
              </p>
              {(searchTerm || selectedCategory) && (
                <button
                  onClick={() => {
                    updateParam('search', '');
                    updateParam('category', '');
                  }}
                  className="mt-4 px-4 py-2 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((p) => (
                <div
                  key={p._id}
                  className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition flex flex-col justify-between"
                >
                  <Link to={`/products/${p._id}`} className="block">
                   {/* Media */}
<div className="h-44 bg-slate-100 flex items-center justify-center relative overflow-hidden">
  {p.images?.[0] && !p.images[0].includes('placeholder') ? (
    <img
      src={p.images[0]}
      alt={p.name}
      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
    />
  ) : (
    <div className="text-slate-300 group-hover:scale-105 transition duration-300">
      <PackageOpen className="w-14 h-14" />
    </div>
  )}
  <span className="absolute top-2 left-2 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-white/90 text-slate-700 shadow-sm">
    {p.category}
  </span>
</div>

                    {/* Details */}
                    <div className="p-4">
                      <h3 className="font-semibold text-sm text-slate-900 group-hover:text-indigo-600 transition line-clamp-1">
                        {p.name}
                      </h3>
                      {p.sku && (
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">SKU: {p.sku}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                        {p.description || 'No description provided.'}
                      </p>
                    </div>
                  </Link>

                  {/* Price, Stock and Add to Cart footer */}
                  <div className="p-4 pt-0 border-t border-slate-50 mt-2">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-base font-bold text-slate-900">₹{p.price?.toLocaleString('en-IN')}</span>
                      <div>
                        {p.isInStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle className="w-3 h-3" />
                            {p.stock} in stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            Out of stock
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!p.isInStock || addingId === p._id}
                      onClick={(e) => handleQuickAdd(e, p)}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        addedMap[p._id]
                          ? 'bg-emerald-600 text-white'
                          : p.isInStock
                          ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {addedMap[p._id] ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Added to Cart
                        </>
                      ) : addingId === p._id ? (
                        'Adding...'
                      ) : (
                        <>
                          <ShoppingBag className="w-3.5 h-3.5" />
                          {p.isInStock ? 'Add to Cart' : 'Out of Stock'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
