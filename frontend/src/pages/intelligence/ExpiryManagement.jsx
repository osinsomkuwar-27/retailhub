import { useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarX, CalendarClock, IndianRupee, RefreshCw, Check } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { intelligenceService as api, errMsg } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, IntelStat, Panel, Async, Table, Pager, Badge, statusTone, pretty, fmtDate, inr, inputCls, btnGhost, PALETTE } from '../../components/intelligence/ui';

export default function ExpiryManagement() {
  const [f, setF] = useState({ status: '', page: 1 });
  const sum = useIntelQuery(() => api.expirySummary(), []);
  const q = useIntelQuery(() => api.expiry({ ...f, limit: 15 }), [f.status, f.page]);
  const s = sum.data; const by = (id) => s?.byStatus.find((x) => x._id === id) || { batches: 0, units: 0, value: 0 };
  const refresh = () => { sum.reload(); q.reload(); };
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); refresh(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div>
      <PageHeader title="Expiry Management" subtitle="Batches within 30 days of expiry (or already expired) with a suggested action. Scanned daily."
        actions={<button className={btnGhost} onClick={() => act(() => api.runJob('expiryScan'), 'Expiry scan complete')}><RefreshCw size={14} />Scan now</button>} />
      {s && <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <IntelStat label="Expired batches" value={by('EXPIRED').batches} icon={CalendarX} tone={by('EXPIRED').batches ? 'red' : 'teal'} hint={`${by('EXPIRED').units} units`} />
        <IntelStat label="Critical (≤ 7 days)" value={by('CRITICAL').batches} icon={CalendarClock} tone={by('CRITICAL').batches ? 'amber' : 'teal'} />
        <IntelStat label="Warning (≤ 30 days)" value={by('WARNING').batches} icon={CalendarClock} />
        <IntelStat label="Value at risk" value={inr(s.totals.value)} icon={IndianRupee} tone="amber" hint={`${s.totals.units} units`} />
      </div>}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="By status">{s && s.byStatus.length ? <div className="h-52"><ResponsiveContainer><PieChart>
          <Pie data={s.byStatus.map((x) => ({ name: pretty(x._id), value: x.batches }))} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75} label>
            {s.byStatus.map((_, i) => <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
          : <p className="py-10 text-center text-sm text-slate-400">No expiring stock</p>}</Panel>
        <Panel title="By warehouse" className="lg:col-span-2">
          <Table rowKey="name" empty="No expiring stock" rows={s?.byWarehouse || []} columns={[
            { key: 'name', header: 'Warehouse' }, { key: 'batches', header: 'Batches' }, { key: 'units', header: 'Units' },
            { key: 'value', header: 'Value at risk', render: (r) => inr(r.value) }]} />
        </Panel>
      </div>
      <Panel title="Expiring batches" className="mt-6" actions={
        <select className={inputCls} value={f.status} onChange={(e) => setF({ status: e.target.value, page: 1 })}>
          <option value="">All</option>{['EXPIRED', 'CRITICAL', 'WARNING'].map((x) => <option key={x} value={x}>{pretty(x)}</option>)}</select>}>
        <Async q={q} empty="No batches need attention">
          <Table rows={q.data || []} columns={[
            { key: 'product', header: 'Product', render: (r) => <div><div className="font-medium">{r.product?.name}</div><div className="text-xs text-slate-400">Batch {r.batchNumber}</div></div> },
            { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse?.name },
            { key: 'quantity', header: 'Qty', sortable: true },
            { key: 'expiryDate', header: 'Expires', sortable: true, render: (r) => fmtDate(r.expiryDate) },
            { key: 'daysToExpiry', header: 'Days', sortable: true, render: (r) => (r.daysToExpiry < 0 ? `${-r.daysToExpiry} ago` : r.daysToExpiry) },
            { key: 'valueAtRisk', header: 'Value', render: (r) => inr(r.valueAtRisk) },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'amber'}>{pretty(r.status)}</Badge> },
            { key: 'suggestedAction', header: 'Suggested action', render: (r) => pretty(r.suggestedAction) },
            { key: 'ack', header: '', render: (r) => r.acknowledged ? <Badge tone="green">Acknowledged</Badge>
                : <button className={btnGhost} onClick={() => act(() => api.ackExpiry(r._id), 'Acknowledged')}><Check size={14} /></button> },
          ]} />
          <Pager meta={q.meta} onChange={(page) => setF({ ...f, page })} />
        </Async>
      </Panel>
    </div>
  );
}