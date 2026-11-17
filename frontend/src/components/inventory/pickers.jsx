import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Package, Loader2 } from 'lucide-react';
import { inventoryService as api } from '../../services/inventoryService';
import { cx, inputCls } from './ui';

// Small cache so every dropdown on a page doesn't refetch
const cache = {};
function cached(key, fn) {
  if (!cache[key]) cache[key] = fn().catch((e) => { delete cache[key]; throw e; });
  return cache[key];
}
export const invalidatePickers = () => Object.keys(cache).forEach((k) => delete cache[k]);

export function WarehouseSelect({ value, onChange, allLabel, exclude, className = '' }) {
  const [list, setList] = useState([]);
  useEffect(() => { cached('warehouses', () => api.warehouses({ limit: 200, isActive: true })).then((r) => setList(r.data)).catch(() => setList([])); }, []);
  return (
    <select className={cx(inputCls, className)} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allLabel ? <option value="">{allLabel}</option> : <option value="" disabled>Select warehouse…</option>}
      {list.filter((w) => w._id !== exclude).map((w) => <option key={w._id} value={w._id}>{w.code} — {w.name}</option>)}
    </select>
  );
}

export function CategorySelect({ value, onChange, allLabel, exclude, placeholder = 'Select category…', className = '' }) {
  const [list, setList] = useState([]);
  useEffect(() => { cached('categories', () => api.categories({ limit: 200 })).then((r) => setList(r.data)).catch(() => setList([])); }, []);
  return (
    <select className={cx(inputCls, className)} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel || placeholder}</option>
      {list.filter((c) => c._id !== exclude && (c.isActive || c._id === value)).map((c) => <option key={c._id} value={c._id}>{c.name} ({c.code})</option>)}
    </select>
  );
}

/**
 * Searchable product picker. With `warehouseId` it lists only products stocked
 * there and shows available units. value = product object | null.
 */
export function ProductPicker({ value, onChange, warehouseId, placeholder = 'Search product by name or SKU…' }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => { const t = setTimeout(() => setQ(term), 250); return () => clearTimeout(t); }, [term]);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    const req = warehouseId
      ? api.inventory({ warehouse: warehouseId, search: q, limit: 10 }).then((r) => r.data.map((row) => ({ ...row.product, available: row.available })))
      : api.products({ search: q, limit: 10, status: 'active' }).then((r) => r.data);
    req.then((d) => alive && setItems(d)).catch(() => alive && setItems([])).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [q, open, warehouseId]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={cx(inputCls, 'flex w-full items-center justify-between text-left')} onClick={() => setOpen((o) => !o)}>
        {value ? <span className="truncate"><span className="text-xs text-slate-400">{value.sku}</span> · {value.name}</span> : <span className="text-slate-400">{placeholder}</span>}
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2"><input autoFocus className={`${inputCls} w-full`} placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} /></div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {loading && <li className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-teal-600" /></li>}
            {!loading && items.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-400">{warehouseId ? 'No stock in this warehouse matches' : 'No products found'}</li>}
            {!loading && items.map((p) => (
              <li key={p._id}>
                <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-teal-50" onClick={() => { onChange(p); setOpen(false); setTerm(''); }}>
                  <Package size={16} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-800">{p.name}</span><span className="text-xs text-slate-400">{p.sku}</span></span>
                  {p.available != null && <span className="text-xs tabular-nums text-slate-500">{p.available} avail.</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
