
import { Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
} from "react-router-dom";

import { intelligenceRoutes } from "./routes/intelligenceRoutes";

function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-slate-950 text-white md:flex">
        <div className="border-b border-slate-800 p-6">
          <h1 className="text-xl font-bold">RetailHub</h1>
          <p className="mt-1 text-xs text-slate-400">
            Smart Inventory Intelligence
          </p>
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
        </div>
      </aside>

      <main className="min-h-screen md:ml-64">
        <header className="sticky top-0 z-10 border-b bg-white px-6 py-4">
          <h2 className="font-semibold text-slate-800">
            RetailHub Dashboard
          </h2>
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
                  path={path}
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
      <AppLayout />
    </BrowserRouter>
  );
}
