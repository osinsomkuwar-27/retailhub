import { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldAlert, Search, UserX } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';
import { intelligenceService as api, errMsg } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, IntelStat, Panel, Async, Table, Pager, Badge, Modal, Field, severityTone, statusTone, pretty, fmtDateTime, inputCls, btnGhost, btnTeal } from '../../components/intelligence/ui';

export function ReviewModal({ row, onClose, onSaved }) {
  const [status, setStatus] = useState('INVESTIGATING'); const [note, setNote] = useState('');
  const save = async () => { try { await api.reviewAnomaly(row._id, { status, note }); toast.success('Anomaly updated'); onSaved(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title="Review anomaly" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">{row.description}</p>
      <Field label="Decision"><select className={`${inputCls} w-full`} value={status} onChange={(e) => setStatus(e.target.value)}>
        {['INVESTIGATING', 'CONFIRMED', 'DISMISSED'].map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</select></Field>
      <div className="mt-3"><Field label="Note"><textarea rows={3} className={`${inputCls} w-full`} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      <div className="mt-5 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnTeal} onClick={save}>Save</button></div>
    </Modal>
  );
}

export const anomalyColumns = (extra) => [
  { key: 'severity', header: 'Severity', render: (r) => <Badge tone={severityTone[r.severity]}>{r.severity}</Badge> },
  { key: 'type', header: 'Rule triggered', render: (r) => pretty(r.type) },
  { key: 'description', header: 'Details', render: (r) => <div className="max-w-md"><p>{r.description}</p>
      <p className="text-xs text-slate-400">{[r.product?.name, r.warehouse?.name].filter(Boolean).join(' · ')}</p></div> },
  { key: 'who', header: 'Actor', render: (r) => r.user?.name || r.customer?.name || '—' },
  { key: 'detectedAt', header: 'Detected', sortable: true, render: (r) => fmtDateTime(r.detectedAt) },
  { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{pretty(r.status)}</Badge> },
  ...(extra || []),
];

export default function AnomalyMonitoring() {
  const [page, setPage] = useState(1); const [review, setReview] = useState(null);
  const sum = useIntelQuery(() => api.anomalySummary(), [], { interval: 30000 });
  const list = useIntelQuery(() => api.anomalies({ status: 'OPEN', page, limit: 10 }), [page], { interval: 30000 });
  const s = sum.data;
  const count = (arr, id) => arr?.find((x) => x._id === id)?.count || 0;
  return (
    <div>
      <PageHeader title="Anomaly Monitoring" subtitle="Rule-based detection: unapproved large stock reductions, rapid repeated reductions, repeated order cancellations." />
      {s && <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <IntelStat label="Open / investigating" value={s.open} icon={ShieldAlert} tone={s.open ? 'red' : 'teal'} />
        <IntelStat label="Unapproved reductions" value={count(s.byType, 'LARGE_UNAPPROVED_REDUCTION') + count(s.byType, 'RAPID_REPEATED_REDUCTIONS')} icon={Search} />
        <IntelStat label="Repeated cancellations" value={count(s.byType, 'REPEATED_ORDER_CANCELLATION')} icon={UserX} />
        <IntelStat label="Confirmed incidents" value={count(s.byStatus, 'CONFIRMED')} icon={ShieldAlert} />
      </div>}
      {s && <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Detections by rule"><div className="h-52"><ResponsiveContainer><BarChart layout="vertical" data={s.byType.map((t) => ({ name: pretty(t._id), count: t.count }))}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={190} /><Tooltip />
          <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></Panel>
        <Panel title="Trend (14 days)"><div className="h-52"><ResponsiveContainer><LineChart data={s.trend}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} /><YAxis allowDecimals={false} /><Tooltip />
          <Line dataKey="count" stroke="#0f2a4a" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Panel>
      </div>}
      <Panel title="Open anomalies" className="mt-6">
        <Async q={list} empty="No open anomalies">
          <Table rows={list.data || []} columns={anomalyColumns([{ key: 'a', header: '', render: (r) => <button className={btnGhost} onClick={() => setReview(r)}>Review</button> }])} />
          <Pager meta={list.meta} onChange={setPage} />
        </Async>
      </Panel>
      {review && <ReviewModal row={review} onClose={() => setReview(null)} onSaved={() => { setReview(null); list.reload(); sum.reload(); }} />}
    </div>
  );
}