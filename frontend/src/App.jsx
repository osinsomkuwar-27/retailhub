import { Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  Link,
} from "react-router-dom";

import { intelligenceRoutes } from "./routes/intelligenceRoutes";
import Navbar from "./components/common/Navbar";
import { CartProvider } from "./context/CartContext";
import ProductList from "./pages/customer/ProductList";
import ProductDetail from "./pages/customer/ProductDetail";
import Cart from "./pages/customer/Cart";
import Checkout from "./pages/customer/Checkout";
import Orders from "./pages/customer/Orders";
import OrderDetail from "./pages/customer/OrderDetail";
import OrderConfirmation from "./pages/customer/OrderConfirmation";
import Payment from "./pages/customer/Payment";
import PaymentResult from "./pages/customer/PaymentResult";
import PaymentHistory from "./pages/customer/PaymentHistory";
import MyReviews from "./pages/customer/MyReviews";
import Login from "./pages/customer/Login";
import Register from "./pages/customer/Register";
import Profile from "./pages/customer/Profile";

// Customer Storefront Layout (Person 2)
function StorefrontLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        RetailSync Advanced DBMS — Person 2 Storefront Module
      </footer>
    </div>
  );
}

// Person 3 Intelligence Layout (Preserved Exactly)
function IntelligenceLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-slate-950 text-white md:flex">
        <div className="border-b border-slate-800 p-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">RetailHub</h1>
            <p className="mt-1 text-xs text-slate-400">
              Smart Inventory Intelligence
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {intelligenceRoutes.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/intelligence"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                    isActive
                      ? "bg-teal-600 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
          <Link
            to="/"
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium transition"
          >
            ← Return to Storefront
          </Link>
        </div>
      </aside>

      <main className="min-h-screen md:ml-64">
        <header className="sticky top-0 z-10 border-b bg-white px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">
            RetailHub Dashboard
          </h2>
          <Link
            to="/"
            className="text-xs font-semibold text-indigo-600 hover:underline md:hidden"
          >
            Storefront
          </Link>
        </header>

        <div className="p-4 md:p-8">
          <Suspense
            fallback={
              <div className="py-20 text-center text-slate-500">
                Loading intelligence page...
              </div>
            }
          >
            <Routes>
              {intelligenceRoutes.map(({ path, element: Page }) => (
                <Route
                  key={path}
                  path={path.replace(/^\/intelligence/, "") || "/"}
                  element={<Page />}
                />
              ))}

              <Route
                path="*"
                element={<Navigate to="/intelligence" replace />}
              />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Routes>
          {/* Person 2 Customer Storefront Routes */}
          <Route
            path="/"
            element={
              <StorefrontLayout>
                <ProductList />
              </StorefrontLayout>
            }
          />
          <Route
            path="/products"
            element={
              <StorefrontLayout>
                <ProductList />
              </StorefrontLayout>
            }
          />
          <Route
            path="/products/:id"
            element={
              <StorefrontLayout>
                <ProductDetail />
              </StorefrontLayout>
            }
          />
          <Route
            path="/cart"
            element={
              <StorefrontLayout>
                <Cart />
              </StorefrontLayout>
            }
          />
          <Route
            path="/checkout"
            element={
              <StorefrontLayout>
                <Checkout />
              </StorefrontLayout>
            }
          />
          <Route
            path="/orders"
            element={
              <StorefrontLayout>
                <Orders />
              </StorefrontLayout>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <StorefrontLayout>
                <OrderDetail />
              </StorefrontLayout>
            }
          />
          <Route
            path="/orders/confirmation/:id"
            element={
              <StorefrontLayout>
                <OrderConfirmation />
              </StorefrontLayout>
            }
          />
          <Route
            path="/payments/:orderId"
            element={
              <StorefrontLayout>
                <Payment />
              </StorefrontLayout>
            }
          />
          <Route
            path="/payments/result/:orderId"
            element={
              <StorefrontLayout>
                <PaymentResult />
              </StorefrontLayout>
            }
          />
          <Route
            path="/payments/history"
            element={
              <StorefrontLayout>
                <PaymentHistory />
              </StorefrontLayout>
            }
          />
          <Route
            path="/reviews/my-reviews"
            element={
              <StorefrontLayout>
                <MyReviews />
              </StorefrontLayout>
            }
          />
          <Route
            path="/login"
            element={
              <StorefrontLayout>
                <Login />
              </StorefrontLayout>
            }
          />
          <Route
            path="/register"
            element={
              <StorefrontLayout>
                <Register />
              </StorefrontLayout>
            }
          />
          <Route
            path="/profile"
            element={
              <StorefrontLayout>
                <Profile />
              </StorefrontLayout>
            }
          />

          {/* Person 3 Intelligence Module Routes */}
          <Route path="/intelligence/*" element={<IntelligenceLayout />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  );
}
