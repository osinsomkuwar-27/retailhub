
import { Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
} from "react-router-dom";

import { intelligenceRoutes } from "./routes/intelligenceRoutes";
import { inventoryRoutes } from "./routes/inventoryRoutes";
import { DevLogin } from "./dev/DevShell";

// Sidebar sections. Entries with hidden: true (Add / Edit Product) are routes only.
const NAV_SECTIONS = [
  { title: "Inventory", routes: inventoryRoutes.filter((r) => !r.hidden) },
  { title: "Smart Inventory", routes: intelligenceRoutes },
];
const ALL_ROUTES = [...inventoryRoutes, ...intelligenceRoutes];

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
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="pb-3">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {section.title}
              </p>
          {section.routes.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/intelligence" || item.path === "/inventory"}
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
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
          {/* TEMPORARY dev sign-in until Person 4's login exists */}
          <NavLink to="/login" className="hover:text-white">Dev sign-in</NavLink>
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
              {ALL_ROUTES.map(({ path, element: Page }) => (
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
      <Routes>
        <Route path="/login" element={<DevLogin />} />
        <Route path="*" element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
