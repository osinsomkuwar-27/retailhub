import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, Boxes, CalendarClock, CalendarX, IndianRupee, Package, PackageX, RefreshCw, Warehouse } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { inventoryService as api } from '../../services/inventoryService';
import useInventoryQuery from '../../hooks/useInventoryQuery';
import {
  PageHeader, InvStat, Panel, Async, Table, Badge, Empty, MOVEMENT_LABELS, movementTone, compactInr, num, fmtDateTime, btnGhost, btnTeal, NAVY, TEAL,
} from '../../components/inventory/ui';

export default function InventoryDashboard() {
  const q = useInventoryQuery(() => api.dashboard(), [], { interval: 30000 });
  const navigate = useNavigate();
  const d = q.data;

  return (
    <div>
      <PageHeader title="Inventory Dashboard" subtitle="Live stock position across all warehouses. Auto-refreshes every 30s."
        actions={(
          <>
            <button type="button" className={btnGhost} onClick={q.reload}><RefreshCw size={14} className={q.loading ? 'animate-spin' : ''} />Refresh</button>
            <Link to="/inventory/stock" className={btnTeal}><Boxes size={14} />Manage stock</Link>
          </>
        )} />
      <Async q={q}>
        {d && (<>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <InvStat label="Active products" value={num(d.counts.products)} icon={Package} hint={`${d.counts.categories} categories`} onClick={() => navigate('/inventory/products')} />
            <InvStat label="Units in stock" value={num(d.stock.totalUnits)} icon={Boxes} hint={`${num(d.stock.reservedUnits)} reserved for orders`} />
            <InvStat label="Inventory value (cost)" value={compactInr(d.stock.inventoryValue)} icon={IndianRupee} />
            <InvStat label="Warehouses" value={d.counts.warehouses} icon={Warehouse} hint={`${d.counts.pendingTransfers} pending transfer(s)`} onClick={() => navigate('/inventory/warehouses')} />
            <InvStat label="Low stock" value={d.counts.lowStock} icon={AlertTriangle} tone={d.counts.lowStock ? 'amber' : 'teal'} hint="At or below reorder level" onClick={() => navigate('/inventory/stock?status=low_stock')} />
            <InvStat label="Out of stock" value={d.counts.outOfStock} icon={PackageX} tone={d.counts.outOfStock ? 'red' : 'teal'} hint="Product-warehouse rows" onClick={() => navigate('/inventory/stock?status=out_of_stock')} />
            <InvStat label={`Expiring ≤ ${d.expiryWarningDays} days`} value={d.counts.expiringSoon} icon={CalendarClock} tone={d.counts.expiringSoon ? 'amber' : 'teal'} hint="Batches" onClick={() => navigate('/inventory/batches?expiry=expiring')} />
            <InvStat label="Expired, still on shelf" value={d.counts.expired} icon={CalendarX} tone={d.counts.expired ? 'red' : 'teal'} hint="Batches to write off" onClick={() => navigate('/inventory/batches?expiry=expired')} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Panel title="Stock movement, last 14 days" className="lg:col-span-2">
              {d.movementTrend.length === 0 ? <Empty text="No movements yet" /> : (
                <div className="h-64"><ResponsiveContainer><AreaChart data={d.movementTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} /><YAxis /><Tooltip /><Legend />
                  <Area type="monotone" dataKey="inbound" name="Inbound" stroke={TEAL} fill={TEAL} fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="outbound" name="Outbound" stroke={NAVY} fill={NAVY} fillOpacity={0.1} strokeWidth={2} />
                </AreaChart></ResponsiveContainer></div>
              )}
            </Panel>
            <Panel title="Stock by warehouse">
              {d.byWarehouse.length === 0 ? <Empty text="No stock yet" /> : (
                <div className="h-64"><ResponsiveContainer><BarChart layout="vertical" data={d.byWarehouse}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" /><YAxis type="category" dataKey="code" width={100} tick={{ fontSize: 12 }} /><Tooltip formatter={(v) => num(v)} />
                  <Bar dataKey="units" name="Units" fill={TEAL} radius={[0, 4, 4, 0]} />
                </BarChart></ResponsiveContainer></div>
              )}
            </Panel>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Panel title="Low-stock alerts" actions={<Link to="/inventory/stock?status=attention" className="text-sm font-medium text-teal-700 hover:underline">View all</Link>}>
              <Table rowKey="_id" empty="All stock levels healthy" rows={d.urgentLowStock} columns={[
                { key: 'product', header: 'Product', render: (r) => <div><div className="font-medium">{r.product.name}</div><div className="text-xs text-slate-400">{r.product.sku} · {r.warehouse}</div></div> },
                { key: 'available', header: 'Avail / reorder', render: (r) => <Badge tone={r.available <= 0 ? 'red' : 'amber'}>{r.available} / {r.reorderLevel}</Badge> },
              ]} />
            </Panel>
            <Panel title="Value by category">
              {d.byCategory.length === 0 ? <Empty text="No stock yet" /> : (
                <ul className="space-y-3">
                  {d.byCategory.map((c) => (
                    <li key={c.category}>
                      <div className="flex justify-between text-sm"><span className="text-slate-700">{c.category}</span><span className="tabular-nums text-slate-500">{compactInr(c.value)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(c.value / (d.byCategory[0].value || 1)) * 100}%`, background: NAVY }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Recent movements" actions={<Link to="/inventory/history" className="text-sm font-medium text-teal-700 hover:underline">History</Link>}>
              {d.recentMovements.length === 0 ? <Empty text="No movements yet" /> : (
                <ul className="divide-y divide-slate-100">
                  {d.recentMovements.map((m) => (
                    <li key={m._id} className="flex items-start gap-3 py-2.5">
                      <Badge tone={movementTone[m.type]}>{MOVEMENT_LABELS[m.type]}</Badge>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-700">{m.product.name}</p>
                        <p className="text-xs text-slate-400">{m.warehouse.code} · {fmtDateTime(m.createdAt)}</p></div>
                      <span className={`text-sm font-semibold tabular-nums ${m.quantityChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{m.quantityChange > 0 ? '+' : ''}{m.quantityChange}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/inventory/transfers" className={btnGhost}><ArrowLeftRight size={14} />New transfer</Link>
          </div>
        </>)}
      </Async>
    </div>
  );
}
