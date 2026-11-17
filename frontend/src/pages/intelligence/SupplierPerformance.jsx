import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, PackageCheck } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { intelligenceService as api, errMsg } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, Panel, Async, Table, Pager, Badge, Tabs, Modal, Field, ConfirmDialog, statusTone, pretty, fmtDate, inputCls, btnGhost, btnTeal } from '../../components/intelligence/ui';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function ReceiveModal({ order, onClose, onSaved }) {
  const [qty, setQty] = useState(Object.fromEntries(order.items.map((i) => [i.product._id, Math.max(0, i.quantityOrdered - i.quantityReceived)])));
  const save = async () => {
    const receipts = Object.entries(qty).filter(([, v]) => +v > 0).map(([product, v]) => ({ product, quantityReceived: +v }));
    if (!receipts.length) return toast.error('Enter at least one received quantity');
    try { await api.receiveOrder(order._id, receipts); toast.success('Receipt recorded. Remember to add the stock in Stock Management.'); onSaved(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Modal title={`Receive ${order.orderNumber}`} onClose={onClose}>
      {order.items.map((i) => (
        <div key={i._id} className="mb-3 flex items-center justify-between gap-3 text-sm">
          <div><div className="font-medium">{i.product.name}</div><div className="text-xs text-slate-400">ordered {i.quantityOrdered} · received {i.quantityReceived}</div></div>
          <input type="number" min="0" className={`${inputCls} w-24`} value={qty[i.product._id]} onChange={(e) => setQty({ ...qty, [i.product._id]: e.target.value })} />
        </div>))}
      <div className="mt-5 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnTeal} onClick={save}>Record receipt</button></div>
    </Modal>
  );
}

function SupplierModal({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', code: '', email: '', phone: '', leadTimeDays: 7 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => { try { await api.createSupplier({ ...f, leadTimeDays: +f.leadTimeDays }); toast.success('Supplier added'); onSaved(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title="Add supplier" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Name"><input className={`${inputCls} w-full`} value={f.name} onChange={set('name')} /></Field></div>
        <Field label="Code"><input className={`${inputCls} w-full`} value={f.code} onChange={set('code')} /></Field>
        <Field label="Lead time (days)"><input type="number" className={`${inputCls} w-full`} value={f.leadTimeDays} onChange={set('leadTimeDays')} /></Field>
        <Field label="Email"><input className={`${inputCls} w-full`} value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className={`${inputCls} w-full`} value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnTeal} onClick={save}>Save</button></div>
    </Modal>
  );
}

export default function SupplierPerformance() {
  const [tab, setTab] = useState('performance'); const [days, setDays] = useState(180); const [page, setPage] = useState(1);
  const [receive, setReceive] = useState(null); const [add, setAdd] = useState(false); const [cancel, setCancel] = useState(null);
  const perf = useIntelQuery(() => api.supplierPerformance({ days }), [days]);
  const sups = useIntelQuery(() => api.suppliers(), []);
  const orders = useIntelQuery(() => api.supplierOrders({ page, limit: 10 }), [page]);

  return (
    <div>
      <PageHeader title="Supplier Performance" subtitle="Score = 60% on-time delivery + 40% fill rate (weighted rule, not ML)."
        actions={<button className={btnTeal} onClick={() => setAdd(true)}><Plus size={14} />Add supplier</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'performance', label: 'Performance' }, { value: 'orders', label: 'Supplier orders' }, { value: 'suppliers', label: 'Suppliers' }]} />

      {tab === 'performance' && (<>
        <Panel title="Delivery scorecard" actions={<select className={inputCls} value={days} onChange={(e) => setDays(+e.target.value)}>
          {[90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>}>
          <Async q={perf} empty="No received orders in this period">
            <div className="mb-6 h-64"><ResponsiveContainer><BarChart data={(perf.data || []).map((p) => ({ name: p.supplier.name, 'On-time %': Math.round(p.onTimeRate * 100), 'Fill rate %': Math.round(p.fillRate * 100) }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Legend />
              <Bar dataKey="On-time %" fill="#0f2a4a" radius={[4, 4, 0, 0]} /><Bar dataKey="Fill rate %" fill="#0d9488" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <Table rowKey="score" rows={perf.data || []} columns={[
              { key: 'name', header: 'Supplier', render: (r) => <span className="font-medium">{r.supplier.name}</span> },
              { key: 'orders', header: 'Orders', sortable: true }, { key: 'onTimeRate', header: 'On-time', sortable: true, render: (r) => pct(r.onTimeRate) },
              { key: 'fillRate', header: 'Fill rate', sortable: true, render: (r) => pct(r.fillRate) },
              { key: 'avgDelayDays', header: 'Avg delay (d)' },
              { key: 'lead', header: 'Actual vs promised lead', render: (r) => `${r.avgLeadDays}d vs ${r.promisedLeadDays}d` },
              { key: 'score', header: 'Score', sortable: true, render: (r) => <Badge tone={r.score >= 85 ? 'green' : r.score >= 65 ? 'amber' : 'red'}>{r.score}</Badge> },
            ]} />
          </Async>
        </Panel>
      </>)}

      {tab === 'orders' && (
        <Panel title="Purchase orders"><Async q={orders} empty="No supplier orders yet. Create one from Reorder Recommendations.">
          <Table rows={orders.data || []} columns={[
            { key: 'orderNumber', header: 'PO #' }, { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name },
            { key: 'items', header: 'Lines', render: (r) => `${r.items.length} item(s)` },
            { key: 'expectedDate', header: 'Expected', render: (r) => fmtDate(r.expectedDate) },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{pretty(r.status)}</Badge> },
            { key: 'a', header: '', render: (r) => ['PLACED', 'PARTIAL'].includes(r.status) && (
              <div className="flex gap-1"><button className={btnGhost} onClick={() => setReceive(r)}><PackageCheck size={14} />Receive</button>
                {r.status === 'PLACED' && <button className={btnGhost} onClick={() => setCancel(r)}>Cancel</button>}</div>) },
          ]} />
          <Pager meta={orders.meta} onChange={setPage} />
        </Async></Panel>)}

      {tab === 'suppliers' && (
        <Panel title="Supplier directory"><Async q={sups} empty="No suppliers">
          <Table rows={sups.data || []} columns={[
            { key: 'name', header: 'Name', sortable: true }, { key: 'code', header: 'Code' }, { key: 'email', header: 'Email' },
            { key: 'phone', header: 'Phone' }, { key: 'leadTimeDays', header: 'Lead time (d)' },
            { key: 'isActive', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
          ]} /></Async></Panel>)}

      {receive && <ReceiveModal order={receive} onClose={() => setReceive(null)} onSaved={() => { setReceive(null); orders.reload(); perf.reload(); }} />}
      {add && <SupplierModal onClose={() => setAdd(false)} onSaved={() => { setAdd(false); sups.reload(); }} />}
      {cancel && <ConfirmDialog title="Cancel purchase order?" message={`${cancel.orderNumber} will be cancelled.`} confirmText="Cancel order"
        onCancel={() => setCancel(null)} onConfirm={async () => { try { await api.cancelOrder(cancel._id); toast.success('Order cancelled'); orders.reload(); } catch (e) { toast.error(errMsg(e)); } setCancel(null); }} />}
    </div>
  );
}