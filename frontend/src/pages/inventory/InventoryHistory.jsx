import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { inventoryService as api } from '../../services/inventoryService';
import useInventoryQuery, { useListState } from '../../hooks/useInventoryQuery';
import { WarehouseSelect } from '../../components/inventory/pickers';
import {
  PageHeader, Panel, Async, Table, Pager, Badge, Empty, SearchInput, MOVEMENT_LABELS, movementTone, fmtDateTime, inr2, inputCls, NAVY, TEAL,
} from '../../components/inventory/ui';

export default function InventoryHistory() {
  const { f, set, setPage, toggleSort } = useListState({ sort: '-createdAt', limit: 20 });
  const [days, setDays] = useState(30);
  const q = useInventoryQuery(() => api.logs(f), [JSON.stringify(f)]);
  const sum = useInventoryQuery(() => api.logSummary({ days, warehouse: f.warehouse }), [days, f.warehouse]);

  return (
    <div>
      <PageHeader title="Inventory History" subtitle="Append-only log of every stock movement (inventory_logs)." />
      <Panel title="Daily movement" actions={(
        <select className={inputCls} value={days} onChange={(e) => setDays(+e.target.value)}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
      )}>
        {sum.data?.byDay?.length ? (
          <div className="h-56"><ResponsiveContainer><BarChart data={sum.data.byDay}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} /><YAxis /><Tooltip /><Legend />
            <Bar dataKey="inbound" name="Inbound" fill={TEAL} radius={[3, 3, 0, 0]} />
            <Bar dataKey="outbound" name="Outbound" fill={NAVY} radius={[3, 3, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
        ) : <Empty text={sum.loading ? 'Loading…' : 'No movements in this period'} />}
      </Panel>

      <Panel title="Movements" className="mt-6" actions={(
        <div className="flex flex-wrap gap-2">
          <SearchInput value={f.search} onChange={(search) => set({ search })} placeholder="Product, SKU or reference" className="w-56" />
          <WarehouseSelect allLabel="All warehouses" value={f.warehouse} onChange={(warehouse) => set({ warehouse })} />
          <select className={inputCls} value={f.type || ''} onChange={(e) => set({ type: e.target.value })}>
            <option value="">All types</option>{Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className={inputCls} value={f.direction || ''} onChange={(e) => set({ direction: e.target.value })}>
            <option value="">In & out</option><option value="in">Inbound</option><option value="out">Outbound</option></select>
          <input type="date" className={inputCls} value={f.from || ''} onChange={(e) => set({ from: e.target.value })} aria-label="From date" />
          <input type="date" className={inputCls} value={f.to || ''} onChange={(e) => set({ to: e.target.value })} aria-label="To date" />
        </div>
      )}>
        <Async q={q} empty="No movements match these filters">
          <Table rows={q.data || []} sort={f.sort} onSort={toggleSort} columns={[
            { key: 'createdAt', header: 'When', sortKey: 'createdAt', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</span> },
            { key: 'type', header: 'Movement', sortKey: 'type', render: (r) => <Badge tone={movementTone[r.type]}>{MOVEMENT_LABELS[r.type]}</Badge> },
            { key: 'product', header: 'Product', render: (r) => <div className="min-w-[170px]"><div className="font-medium">{r.product.name}</div><div className="text-xs text-slate-400">{r.product.sku}</div></div> },
            { key: 'warehouse', header: 'Warehouse', render: (r) => <span className="whitespace-nowrap">{r.warehouse.code}</span> },
            { key: 'quantityChange', header: 'Change', sortKey: 'quantityChange', align: 'right', render: (r) => <strong className={r.quantityChange > 0 ? 'text-emerald-600' : 'text-red-600'}>{r.quantityChange > 0 ? '+' : ''}{r.quantityChange}</strong> },
            { key: 'bal', header: 'Before → after', align: 'right', render: (r) => <span className="whitespace-nowrap text-xs">{r.quantityBefore} → <strong>{r.quantityAfter}</strong></span> },
            { key: 'batches', header: 'Batches', render: (r) => <span className="text-xs text-slate-400">{r.batches?.map((b) => `${b.batchNumber}×${b.quantity}`).join(', ') || '—'}</span> },
            { key: 'ref', header: 'Reference', render: (r) => <div className="text-xs"><div>{r.reference?.code || r.reference?.kind}</div><div className="max-w-[200px] truncate text-slate-400" title={r.reason}>{r.reason}</div></div> },
            { key: 'unitCost', header: 'Unit cost', align: 'right', render: (r) => <span className="text-xs">{inr2(r.unitCost)}</span> },
            { key: 'by', header: 'By', render: (r) => <span className="text-xs text-slate-400">{r.performedBy?.name || '—'}</span> },
          ]} />
          <Pager meta={q.meta} onChange={setPage} />
        </Async>
      </Panel>
    </div>
  );
}
