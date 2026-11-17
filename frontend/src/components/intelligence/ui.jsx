import { useMemo, useState } from 'react';
import { Loader2, Inbox, AlertTriangle, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
export const inputCls = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
export const btnCls = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50';
export const btnGhost = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export const btnTeal = 'inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';

const TONES = {
  red: 'bg-red-50 text-red-700 ring-red-200', amber: 'bg-amber-50 text-amber-700 ring-amber-200', green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200', gray: 'bg-slate-100 text-slate-600 ring-slate-200', teal: 'bg-teal-50 text-teal-700 ring-teal-200',
};
export const severityTone = { CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'blue', LOW: 'gray' };
export const riskTone = { OUT_OF_STOCK: 'red', CRITICAL: 'red', WARNING: 'amber', HEALTHY: 'green', NO_DEMAND: 'gray' };
export const statusTone = { OPEN: 'red', ACKNOWLEDGED: 'amber', RESOLVED: 'green', INVESTIGATING: 'amber', CONFIRMED: 'red', DISMISSED: 'gray',
  EXPIRED: 'red', WARNING: 'amber', PLACED: 'blue', PARTIAL: 'amber', RECEIVED: 'green', CANCELLED: 'gray' };

export const Badge = ({ tone = 'gray', children }) => (
  <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone])}>{children}</span>
);
export const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{actions}</div>
  </div>
);

export const IntelStat = ({ label, value, icon: Icon, tone = 'teal', hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      {Icon && <span className={cx('rounded-lg p-2', tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-600')}><Icon size={18} /></span>}
    </div>
    <div className="mt-2 text-2xl font-semibold text-slate-900">{value ?? '—'}</div>
    {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
  </div>
);

export const Panel = ({ title, actions, children, className }) => (
  <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
    {(title || actions) && (
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>{actions}
      </div>
    )}
    <div className="p-4">{children}</div>
  </section>
);

export const Loading = ({ text = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />{text}</div>
);
export const Empty = ({ text = 'Nothing to show' }) => (
  <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400"><Inbox size={28} />{text}</div>
);
export const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-col items-center gap-2 py-10 text-sm text-red-600">
    <AlertTriangle size={24} />{message}
    {onRetry && <button className={btnGhost} onClick={onRetry}>Retry</button>}
  </div>
);
export const Async = ({ q, children, empty }) => {
  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={q.reload} />;
  if (Array.isArray(q.data) && !q.data.length) return <Empty text={empty} />;
  return children;
};

export function Table({ columns, rows, rowKey = '_id', onRowClick, empty = 'No records' }) {
  const [sort, setSort] = useState(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1));
  }, [rows, sort, columns]);
  if (!rows?.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((c) => (
            <th key={c.key} className={cx('px-3 py-2 font-medium', c.sortable && 'cursor-pointer select-none')}
              onClick={() => c.sortable && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}>
              <span className="inline-flex items-center gap-1">{c.header}
                {sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
            </th>))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((r, i) => (
            <tr key={r[rowKey] || i} className={cx('hover:bg-slate-50', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)}>
              {columns.map((c) => <td key={c.key} className="px-3 py-2 text-slate-700">{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}

export const Pager = ({ meta, onChange }) => !meta || meta.pages <= 1 ? null : (
  <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
    <span>Page {meta.page} of {meta.pages} · {meta.total} records</span>
    <div className="flex gap-2">
      <button className={btnGhost} disabled={meta.page <= 1} onClick={() => onChange(meta.page - 1)}><ChevronLeft size={14} /></button>
      <button className={btnGhost} disabled={meta.page >= meta.pages} onClick={() => onChange(meta.page + 1)}><ChevronRight size={14} /></button>
    </div>
  </div>
);

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="mb-4 flex gap-1 border-b border-slate-200">
    {tabs.map((t) => (
      <button key={t.value} onClick={() => onChange(t.value)}
        className={cx('-mb-px border-b-2 px-4 py-2 text-sm font-medium', value === t.value ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
        {t.label}</button>))}
  </div>
);

export const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
    <div className={cx('max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-md')} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export const ConfirmDialog = ({ title, message, confirmText = 'Confirm', onConfirm, onCancel }) => (
  <Modal title={title} onClose={onCancel}>
    <p className="text-sm text-slate-600">{message}</p>
    <div className="mt-5 flex justify-end gap-2">
      <button className={btnGhost} onClick={onCancel}>Cancel</button>
      <button className={btnTeal} onClick={onConfirm}>{confirmText}</button>
    </div>
  </Modal>
);

export const Field = ({ label, children }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">{label}</span>{children}</label>
);
export const PALETTE = ['#0f2a4a', '#0d9488', '#38bdf8', '#f59e0b', '#ef4444', '#94a3b8'];