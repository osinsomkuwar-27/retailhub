// Module 1 UI kit. Same component names, props and Tailwind classes as Module 3's
// components/intelligence/ui.jsx, so both modules look identical and can later be
// merged into one shared kit. Extra features (server-side sort, field errors,
// danger/reason confirm) are optional props that don't change the shared API.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Inbox, AlertTriangle, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
export const inr2 = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
export const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
export const compactInr = (v) => {
  if (v == null) return '—';
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr(v);
};
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const inputCls = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
export const btnCls = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50';
export const btnGhost = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export const btnTeal = 'inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
export const btnDanger = 'inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50';
export const btnIcon = 'rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600 disabled:opacity-40';

const TONES = {
  red: 'bg-red-50 text-red-700 ring-red-200', amber: 'bg-amber-50 text-amber-700 ring-amber-200', green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200', gray: 'bg-slate-100 text-slate-600 ring-slate-200', teal: 'bg-teal-50 text-teal-700 ring-teal-200',
};
export const PALETTE = ['#0f2a4a', '#0d9488', '#38bdf8', '#f59e0b', '#ef4444', '#94a3b8'];
export const NAVY = '#0f2a4a';
export const TEAL = '#0d9488';

export const Badge = ({ tone = 'gray', children }) => (
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone])}>{children}</span>
);
export const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

// ---- Module 1 vocab (badges use the same tone names as Module 3) ----
export const stockStatusTone = { in_stock: 'green', low_stock: 'amber', out_of_stock: 'red' };
export const stockStatusLabel = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' };
export const movementTone = {
  STOCK_IN: 'green', TRANSFER_IN: 'teal', RETURN: 'teal', ADJUSTMENT: 'blue',
  STOCK_OUT: 'amber', SALE: 'gray', TRANSFER_OUT: 'gray', DAMAGED: 'red', EXPIRED: 'red',
};
export const MOVEMENT_LABELS = {
  STOCK_IN: 'Stock in', STOCK_OUT: 'Stock out', ADJUSTMENT: 'Adjustment', DAMAGED: 'Damaged', EXPIRED: 'Expired write-off',
  TRANSFER_OUT: 'Transfer out', TRANSFER_IN: 'Transfer in', SALE: 'Sale', RETURN: 'Return',
};
export const transferTone = { pending: 'amber', completed: 'green', cancelled: 'gray' };
export const batchTone = { active: 'green', depleted: 'gray', expired: 'red', written_off: 'gray' };

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{actions}</div>
  </div>
);

/** Same markup as Module 3's IntelStat (+ optional onClick). */
export const InvStat = ({ label, value, icon: Icon, tone = 'teal', hint, onClick }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cx('rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm', onClick && 'transition hover:border-teal-300 hover:shadow')}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        {Icon && <span className={cx('rounded-lg p-2', tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-600')}><Icon size={18} /></span>}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value ?? '—'}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Tag>
  );
};

export const Panel = ({ title, actions, children, className, flush }) => (
  <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>{actions}
      </div>
    )}
    <div className={flush ? '' : 'p-4'}>{children}</div>
  </section>
);

export const Loading = ({ text = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />{text}</div>
);
export const Empty = ({ text = 'Nothing to show', action }) => (
  <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400"><Inbox size={28} />{text}{action && <div className="mt-2">{action}</div>}</div>
);
export const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-col items-center gap-2 py-10 text-sm text-red-600">
    <AlertTriangle size={24} />{message}
    {onRetry && <button type="button" className={btnGhost} onClick={onRetry}>Retry</button>}
  </div>
);
export const Async = ({ q, children, empty }) => {
  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={q.reload} />;
  if (Array.isArray(q.data) && !q.data.length) return <Empty text={empty} />;
  return children;
};

/**
 * Same API as Module 3's Table. Extra optional props for server-side sorting:
 *   sort="-createdAt" onSort={(key) => …}   and per column: sortKey, align: 'right'
 * Without onSort it sorts the current rows in the browser, exactly like Module 3.
 */
export function Table({ columns, rows, rowKey = '_id', onRowClick, empty = 'No records', sort: serverSort, onSort }) {
  const [sort, setSort] = useState(null);
  const sorted = useMemo(() => {
    if (onSort || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1));
  }, [rows, sort, columns, onSort]);
  if (!rows?.length) return <Empty text={empty} />;

  const active = (c) => {
    if (onSort) {
      const k = c.sortKey || c.key;
      if (serverSort?.replace(/^-/, '') !== k) return null;
      return serverSort.startsWith('-') ? 'desc' : 'asc';
    }
    return sort?.key === c.key ? sort.dir : null;
  };
  const click = (c) => {
    if (!(c.sortable || c.sortKey)) return;
    if (onSort) onSort(c.sortKey || c.key);
    else setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }));
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((c) => {
            const dir = active(c);
            return (
              <th key={c.key} className={cx('whitespace-nowrap px-3 py-2 font-medium', (c.sortable || c.sortKey) && 'cursor-pointer select-none', c.align === 'right' && 'text-right')}
                onClick={() => click(c)}>
                <span className="inline-flex items-center gap-1">{c.header}
                  {dir && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
              </th>
            );
          })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((r, i) => (
            <tr key={r[rowKey] || i} className={cx('hover:bg-slate-50', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)}>
              {columns.map((c) => (
                <td key={c.key} className={cx('px-3 py-2 text-slate-700', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}

export const Pager = ({ meta, onChange }) => {
  const pages = meta?.pages ?? meta?.totalPages;
  return !meta || pages <= 1 ? null : (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
      <span>Page {meta.page} of {pages} · {meta.total} records</span>
      <div className="flex gap-2">
        <button type="button" className={btnGhost} disabled={meta.page <= 1} onClick={() => onChange(meta.page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
        <button type="button" className={btnGhost} disabled={meta.page >= pages} onClick={() => onChange(meta.page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
};

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
    {tabs.map((t) => (
      <button type="button" key={t.value} onClick={() => onChange(t.value)}
        className={cx('-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium', value === t.value ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
        {t.label}</button>))}
  </div>
);

export const Modal = ({ title, subtitle, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
    <div className={cx('max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-md')} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close"><X size={18} /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

/** Same API as Module 3's ConfirmDialog; optional: danger, withReason (onConfirm receives the reason). */
export function ConfirmDialog({ title, message, confirmText = 'Confirm', onConfirm, onCancel, danger, withReason, reasonLabel = 'Reason' }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const go = async () => { setBusy(true); try { await onConfirm?.(reason); } finally { setBusy(false); } };
  return (
    <Modal title={title} onClose={busy ? undefined : onCancel}>
      <div className="text-sm text-slate-600">{message}</div>
      {withReason && (
        <div className="mt-4"><Field label={reasonLabel}>
          <textarea rows={2} className={`${inputCls} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 3 characters" />
        </Field></div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={danger ? btnDanger : btnTeal} onClick={go} disabled={busy || (withReason && reason.trim().length < 3)}>{busy ? 'Working…' : confirmText}</button>
      </div>
    </Modal>
  );
}

/** Same as Module 3's Field, plus optional error / hint lines. */
export const Field = ({ label, children, error, hint, className }) => (
  <label className={cx('block text-sm', className)}>
    {label && <span className="mb-1 block font-medium text-slate-600">{label}</span>}
    {children}
    {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
  </label>
);

/** Search box in the same style as Module 3's StockPrediction search. Debounced. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  const [term, setTerm] = useState(value || '');
  useEffect(() => { const t = setTimeout(() => { if (term !== (value || '')) onChange(term); }, 350); return () => clearTimeout(t); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cx('relative', className)}>
      <Search size={14} className="absolute left-3 top-3 text-slate-400" />
      <input className={`${inputCls} w-full pl-8`} placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} />
    </div>
  );
}

export function UtilizationBar({ percent }) {
  const p = Math.min(100, Math.max(0, percent || 0));
  const color = p > 90 ? 'bg-red-500' : p > 75 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className={cx('h-full', color)} style={{ width: `${p}%` }} /></div>
      <span className="w-12 text-right text-xs tabular-nums text-slate-500">{p.toFixed(1)}%</span>
    </div>
  );
}
