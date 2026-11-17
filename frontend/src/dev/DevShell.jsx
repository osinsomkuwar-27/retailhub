// =============================================================================
// TEMPORARY DEV SHELL — lets Person 1 run and demo Module 1 on its own.
// Person 4 replaces this with the real layout (Sidebar/Navbar), login page and
// role guard. Nothing in pages/, components/, services/ or routes/ depends on this file.
// =============================================================================
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Boxes, LogOut, Menu } from 'lucide-react';
import { inventoryRoutes } from '../routes/inventoryRoutes';

const API = import.meta.env.VITE_API_URL || '/api';

function readUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

export function DevLogin() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const login = async (role) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/dev/token`, { role });
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      navigate('/inventory');
    } catch {
      toast.error('Dev login failed. Is the backend running with ENABLE_DEV_AUTH=true?');
    } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f2a4a] p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2"><Boxes className="h-7 w-7 text-teal-600" /><span className="text-xl font-semibold text-slate-900">RetailSync</span></div>
        <p className="mb-1 text-sm font-medium text-slate-700">Development sign-in</p>
        <p className="mb-6 text-xs text-slate-500">Temporary until the Auth module (Person 4) is integrated.</p>
        <div className="space-y-2">
          <button type="button" className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => login('admin')}>Continue as Admin</button>
          <button type="button" className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => login('warehouse_manager')}>Continue as Warehouse Manager</button>
        </div>
      </div>
    </div>
  );
}

export function RequireRole({ roles, children }) {
  const user = readUser();
  if (!localStorage.getItem('token') || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(String(user.role).toUpperCase())) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">Your role (<b>{user.role}</b>) cannot open this page.</div>;
  }
  return children;
}

export default function DevShell() {
  const navigate = useNavigate();
  const user = readUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onUnauthorized = () => { localStorage.removeItem('token'); navigate('/login'); };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [navigate]);

  if (!user) return <Navigate to="/login" replace />;
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login'); };
  const items = inventoryRoutes.filter((r) => !r.hidden && r.roles.includes(String(user.role).toUpperCase()));

  return (
    <div className="min-h-screen lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-[#0f2a4a] text-slate-300 transition lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5"><Boxes className="h-6 w-6 text-teal-400" /><span className="text-lg font-semibold text-white">RetailSync</span></div>
        <nav className="p-3">
          <p className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Inventory</p>
          {items.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === '/inventory'} onClick={() => setOpen(false)}
              className={({ isActive }) => `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-teal-600/20 font-medium text-white ring-1 ring-teal-500/30' : 'hover:bg-white/10 hover:text-white'}`}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button type="button" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <span className="hidden text-sm text-slate-500 lg:block">Module 1 · Product & Inventory Management</span>
          <div className="flex items-center gap-3">
            <div className="text-right"><p className="text-sm font-medium text-slate-800">{user.name}</p><p className="text-xs text-slate-500">{String(user.role).replace('_', ' ').toLowerCase()}</p></div>
            <button type="button" className="rounded-md p-2 text-slate-600 hover:bg-slate-100" onClick={logout} title="Sign out"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
