import { useState } from 'react';
import toast from 'react-hot-toast';
import { Settings2, ShoppingCart } from 'lucide-react';
import { intelligenceService as api, errMsg } from '../../services/intelligenceService';
import useIntelQuery from '../../hooks/useIntelQuery';
import { PageHeader, Panel, Async, Table, Badge, Modal, Field, ConfirmDialog, riskTone, pretty, inr, inputCls, btnGhost, btnTeal } from '../../components/intelligence/ui';

function RuleModal({ row, suppliers, onClose, onSaved }) {
  const [f, setF] = useState({ safetyStock: row.safetyStock, leadTimeDays: row.leadTimeDays, reviewPeriodDays: row.reviewPeriodDays, minOrderQty: row.minOrderQty, preferredSupplier: row.preferredSupplier || '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    try {
      await api.upsertRule(row.productId, { safetyStock: +f.safetyStock, leadTimeDays: +f.leadTimeDays, reviewPeriodDays: +f.reviewPeriodDays, minOrderQty: +f.minOrderQty, ...(f.preferredSupplier ? { preferredSupplier: f.preferredSupplier } : {}) });
      toast.success('Reorder rule saved'); onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Reorder rule: ${row.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Safety stock"><input type="number" min="0" className={`${inputCls} w-full`} value={f.safetyStock} onChange={set('safetyStock')} /></Field>
        <Field label="Lead time (days)"><input type="number" min="0" className={`${inputCls} w-full`} value={f.leadTimeDays} onChange={set('leadTimeDays')} /></Field>
        <Field label="Review period (days)"><input type="number" min="0" className={`${inputCls} w-full`} value={f.reviewPeriodDays} onChange={set('reviewPeriodDays')} /></Field>
        <Field label="Min order qty"><input type="number" min="1" className={`${inputCls} w-full`} value={f.minOrderQty} onChange={set('minOrderQty')} /></Field>
        <div className="col-span-2"><Field label="Preferred supplier">
          <select className={`${inputCls} w-full`} value={f.preferredSupplier} onChange={set('preferredSupplier')}>
            <option value="">None</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field></div>
      </div>
      <p className="mt-3 text-xs text-slate-400">Reorder point = daily sales × lead time + safety stock. Target = daily sales × (lead time + review period) + safety stock. (Admin only.)</p>
      <div className="mt-5 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnTeal} disabled={saving} onClick={save}>Save rule</button></div>
    </Modal>
  );
}

export default function ReorderRecommendations() {
  const q = useIntelQuery(() => api.recommendations(), [], { interval: 60000 });
  const sup = useIntelQuery(() => api.suppliers({ active: true }), []);
  const [picked, setPicked] = useState({});   // productId -> qty
  const [supplier, setSupplier] = useState('');
  const [rule, setRule] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const toggle = (r) => setPicked((p) => { const n = { ...p }; if (n[r.productId]) delete n[r.productId]; else n[r.productId] = r.recommendedQty; return n; });
  const items = Object.entries(picked).map(([product, quantity]) => ({ product, quantity: +quantity }));

  const createPO = async () => {
    try {
      const po = await api.createOrder({ supplier, items });
      toast.success(`Purchase order ${po.data.orderNumber} placed`); setPicked({}); setConfirm(false); q.reload();
    } catch (e) { toast.error(errMsg(e)); setConfirm(false); }
  };

  return (
    <div>
      <PageHeader title="Reorder Recommendations" subtitle="Suggested quantities based on demand, lead time, safety stock and stock already on order." />
      <Panel actions={<div className="flex gap-2">
        <select className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="">Select supplier…</option>{(sup.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
        <button className={btnTeal} disabled={!items.length || !supplier} onClick={() => setConfirm(true)}><ShoppingCart size={14} />Create PO ({items.length})</button>
      </div>}>
        <Async q={q} empty="All products are above their reorder points">
          <Table rowKey="productId" rows={q.data || []} columns={[
            { key: 'sel', header: '', render: (r) => <input type="checkbox" checked={!!picked[r.productId]} onChange={() => toggle(r)} /> },
            { key: 'name', header: 'Product', sortable: true, render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku}</div></div> },
            { key: 'available', header: 'Stock' }, { key: 'onOrder', header: 'On order' },
            { key: 'avgDailySales', header: 'Sales/day' },
            { key: 'reorderPoint', header: 'Reorder pt' },
            { key: 'daysUntilStockout', header: 'Days left' },
            { key: 'riskStatus', header: 'Urgency', render: (r) => <Badge tone={riskTone[r.riskStatus]}>{pretty(r.riskStatus)}</Badge> },
            { key: 'recommendedQty', header: 'Order qty', sortable: true, render: (r) => picked[r.productId] !== undefined
                ? <input type="number" min={r.minOrderQty} className={`${inputCls} w-24 py-1`} value={picked[r.productId]} onChange={(e) => setPicked({ ...picked, [r.productId]: e.target.value })} />
                : <strong>{r.recommendedQty}</strong> },
            { key: 'estimatedCost', header: 'Est. cost', render: (r) => inr(r.estimatedCost) },
            { key: 'supplier', header: 'Preferred', render: (r) => r.supplier?.name || '—' },
            { key: 'rule', header: '', render: (r) => <button className="text-slate-400 hover:text-teal-600" title="Edit rule" onClick={() => setRule(r)}><Settings2 size={16} /></button> },
          ]} />
        </Async>
      </Panel>
      {rule && <RuleModal row={rule} suppliers={sup.data || []} onClose={() => setRule(null)} onSaved={() => { setRule(null); q.reload(); }} />}
      {confirm && <ConfirmDialog title="Place purchase order?" message={`Create a purchase order for ${items.length} product(s) with the selected supplier.`} confirmText="Place order" onConfirm={createPO} onCancel={() => setConfirm(false)} />}
    </div>
  );
}