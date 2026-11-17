import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { intelligenceService as api } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, Panel, Async, Table, Pager, Badge, Tabs, Modal, Loading, riskTone, pretty, fmtDate, inr, inputCls } from '../../components/intelligence/ui';

function TrendModal({ row, onClose }) {
  const q = useIntelQuery(() => api.demandTrend(row.productId, 60), [row.productId]);
  return (
    <Modal wide title={`Demand trend: ${row.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">
        Days until stock-out = {row.available} available ÷ {row.avgDailySales}/day ={' '}
        <strong>{row.daysUntilStockout ?? '∞'}</strong>
        {row.estimatedStockoutDate && <> · estimated {fmtDate(row.estimatedStockoutDate)}</>} · lead time {row.leadTimeDays}d
      </p>
      {q.loading ? <Loading /> : (
        <div className="h-72"><ResponsiveContainer><ComposedChart data={q.data || []}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5, 10)} /><YAxis /><Tooltip /><Legend />
          <Bar dataKey="units" name="Units/day" fill="#0d9488" radius={[3, 3, 0, 0]} />
          <Line dataKey="movingAvg7" name="7-day moving avg" stroke="#0f2a4a" strokeWidth={2} dot={false} />
        </ComposedChart></ResponsiveContainer></div>)}
    </Modal>
  );
}

export default function StockPrediction() {
  const [tab, setTab] = useState('predictions');
  const [f, setF] = useState({ days: 30, status: '', search: '', page: 1 });
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState(null);
  useEffect(() => { const t = setTimeout(() => setF((s) => ({ ...s, search: term, page: 1 })), 350); return () => clearTimeout(t); }, [term]);

  const pred = useIntelQuery(() => api.predictions({ ...f, limit: 15 }), [f.days, f.status, f.search, f.page], { interval: 60000 });
  const slow = useIntelQuery(() => api.slowMoving({ page: f.page, limit: 15 }), [tab === 'slow', f.page]);

  return (
    <div>
      <PageHeader title="Stock Prediction" subtitle="Days Until Stock-out = Available Stock ÷ Average Daily Sales (a deterministic formula, not machine learning)." />
      <Tabs value={tab} onChange={(t) => { setTab(t); setF((s) => ({ ...s, page: 1 })); }}
        tabs={[{ value: 'predictions', label: 'Predictions' }, { value: 'slow', label: 'Slow-moving products' }]} />
      {tab === 'predictions' ? (
        <Panel actions={<div className="flex flex-wrap gap-2">
          <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input className={`${inputCls} pl-8`} placeholder="Search name or SKU" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
          <select className={inputCls} value={f.days} onChange={(e) => setF({ ...f, days: +e.target.value, page: 1 })}>
            {[14, 30, 60, 90].map((d) => <option key={d} value={d}>Demand window: {d} days</option>)}</select>
          <select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
            <option value="">All risk levels</option>
            {['OUT_OF_STOCK', 'CRITICAL', 'WARNING', 'HEALTHY', 'NO_DEMAND'].map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</select>
        </div>}>
          <Async q={pred} empty="No products match these filters">
            <Table rowKey="productId" onRowClick={setSelected} rows={pred.data || []} columns={[
              { key: 'name', header: 'Product', sortable: true, render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku}</div></div> },
              { key: 'available', header: 'Available', sortable: true },
              { key: 'avgDailySales', header: 'Avg sales/day', sortable: true },
              { key: 'daysUntilStockout', header: 'Days left', sortable: true, sortValue: (r) => r.daysUntilStockout ?? Infinity },
              { key: 'estimatedStockoutDate', header: 'Est. stock-out', render: (r) => fmtDate(r.estimatedStockoutDate) },
              { key: 'leadTimeDays', header: 'Lead time' },
              { key: 'riskStatus', header: 'Risk', render: (r) => <Badge tone={riskTone[r.riskStatus]}>{pretty(r.riskStatus)}</Badge> },
            ]} />
            <Pager meta={pred.meta} onChange={(page) => setF({ ...f, page })} />
          </Async>
        </Panel>
      ) : (
        <Panel title={`No meaningful sales in ${90} days but stock on hand`}>
          <Async q={slow} empty="No slow-moving products">
            <Table rowKey="productId" rows={slow.data || []} columns={[
              { key: 'name', header: 'Product', render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku}</div></div> },
              { key: 'available', header: 'On hand', sortable: true },
              { key: 'totalSold', header: 'Sold (90d)' },
              { key: 'daysSinceLastSale', header: 'Days since last sale', render: (r) => r.daysSinceLastSale ?? 'Never' },
              { key: 'stockValue', header: 'Capital tied up', sortable: true, render: (r) => inr(r.stockValue) },
            ]} />
            <Pager meta={slow.meta} onChange={(page) => setF({ ...f, page })} />
          </Async>
        </Panel>
      )}
      {selected && <TrendModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}