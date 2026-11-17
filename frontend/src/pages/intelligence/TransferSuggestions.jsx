import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { intelligenceService as api } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, Panel, Async, Table, inputCls } from '../../components/intelligence/ui';

export default function TransferSuggestions() {
  const [days, setDays] = useState(30);
  const q = useIntelQuery(() => api.transfers({ days }), [days]);
  return (
    <div>
      <PageHeader title="Warehouse Transfer Suggestions"
        subtitle="Move surplus from slow-selling warehouses to warehouses that will run short before replenishment arrives. Suggestions only; create the transfer in Stock Transfer." />
      <Panel actions={<select className={inputCls} value={days} onChange={(e) => setDays(+e.target.value)}>
        {[14, 30, 60, 90].map((d) => <option key={d} value={d}>Demand window: {d} days</option>)}</select>}>
        <Async q={q} empty="No beneficial transfers right now. Stock is balanced across warehouses.">
          <Table rowKey="productId" rows={q.data || []} columns={[
            { key: 'name', header: 'Product', render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku}</div></div> },
            { key: 'route', header: 'Route', render: (r) => <span className="inline-flex items-center gap-2">{r.from.name || '—'}<ArrowRight size={14} className="text-teal-600" />{r.to.name || '—'}</span> },
            { key: 'quantity', header: 'Suggested qty', render: (r) => <strong>{r.quantity}</strong> },
            { key: 'receiverCoverDays', header: 'Receiver cover (d)' },
            { key: 'donorCoverDays', header: 'Donor cover (d)', render: (r) => r.donorCoverDays ?? '∞' },
            { key: 'reason', header: 'Why', render: (r) => <span className="text-xs text-slate-500">{r.reason}</span> },
          ]} />
        </Async>
      </Panel>
    </div>
  );
}