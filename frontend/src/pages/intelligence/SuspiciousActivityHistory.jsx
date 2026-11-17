import { useState } from 'react';
import { intelligenceService as api } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, Panel, Async, Table, Pager, Modal, pretty, fmtDateTime, inputCls } from '../../components/intelligence/ui';
import { anomalyColumns } from './AnomalyMonitoring';

export default function SuspiciousActivityHistory() {
  const [f, setF] = useState({ type: '', status: '', severity: '', from: '', to: '', page: 1 });
  const [row, setRow] = useState(null);
  const q = useIntelQuery(() => api.anomalies({ ...f, limit: 15 }), [f.type, f.status, f.severity, f.from, f.to, f.page]);
  const sel = (k, opts, label) => (
    <select className={inputCls} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value, page: 1 })}>
      <option value="">{label}</option>{opts.map((o) => <option key={o} value={o}>{pretty(o)}</option>)}</select>);
  return (
    <div>
      <PageHeader title="Suspicious Activity History" subtitle="Complete audit trail of every detected anomaly and how it was resolved." />
      <Panel actions={<div className="flex flex-wrap gap-2">
        {sel('type', ['LARGE_UNAPPROVED_REDUCTION', 'RAPID_REPEATED_REDUCTIONS', 'REPEATED_ORDER_CANCELLATION'], 'All rules')}
        {sel('status', ['OPEN', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED'], 'All statuses')}
        {sel('severity', ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], 'All severities')}
        <input type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} />
        <input type="date" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, page: 1 })} /></div>}>
        <Async q={q} empty="No anomalies recorded for these filters">
          <Table rows={q.data || []} onRowClick={setRow} columns={anomalyColumns([
            { key: 'reviewedBy', header: 'Reviewed by', render: (r) => r.reviewedBy?.name || '—' }])} />
          <Pager meta={q.meta} onChange={(page) => setF({ ...f, page })} />
        </Async>
      </Panel>
      {row && <Modal wide title={pretty(row.type)} onClose={() => setRow(null)}>
        <p className="text-sm text-slate-700">{row.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-400">Detected</dt><dd>{fmtDateTime(row.detectedAt)}</dd></div>
          <div><dt className="text-slate-400">Reviewed</dt><dd>{row.reviewedAt ? `${fmtDateTime(row.reviewedAt)} by ${row.reviewedBy?.name || '—'}` : 'Not yet'}</dd></div>
          <div className="col-span-2"><dt className="text-slate-400">Resolution note</dt><dd>{row.resolutionNote || '—'}</dd></div>
        </dl>
        <h4 className="mb-1 mt-4 text-sm font-medium text-slate-600">Evidence</h4>
        <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(row.evidence, null, 2)}</pre>
      </Modal>}
    </div>
  );
}