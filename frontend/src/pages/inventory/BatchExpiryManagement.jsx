import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarClock, CalendarX, Layers, Pencil, Trash } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { inventoryService as api, errMsg } from '../../services/inventoryService';
import useInventoryQuery, { useListState } from '../../hooks/useInventoryQuery';
import { WarehouseSelect } from '../../components/inventory/pickers';
import {
  PageHeader, InvStat, Panel, Async, Table, Pager, Badge, Modal, Field, Tabs, ConfirmDialog, SearchInput,
  batchTone, pretty, fmtDate, inr, num, compactInr, toInputDate, inputCls, btnGhost, btnTeal, btnIcon,
} from '../../components/inventory/ui';

function expiryBadge(b) {
  if (b.daysToExpiry == null) return <Badge>No expiry</Badge>;
  if (b.daysToExpiry < 0) return <Badge tone="red">Expired {Math.abs(b.daysToExpiry)}d ago</Badge>;
  if (b.daysToExpiry <= 7) return <Badge tone="red">{b.daysToExpiry}d left</Badge>;
  if (b.daysToExpiry <= 30) return <Badge tone="amber">{b.daysToExpiry}d left</Badge>;
  return <Badge tone="green">{b.daysToExpiry}d left</Badge>;
}

function EditBatchModal({ row, onClose, onSaved }) {
  const [f, setF] = useState({ expiryDate: toInputDate(row.expiryDate), manufactureDate: toInputDate(row.manufactureDate), notes: row.notes || '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (f.expiryDate && f.manufactureDate && f.expiryDate <= f.manufactureDate) { toast.error('Expiry must be after manufacture date'); return; }
    setSaving(true);
    try { await api.updateBatch(row._id, { notes: f.notes, expiryDate: f.expiryDate || null, manufactureDate: f.manufactureDate || null }); toast.success('Batch updated'); onSaved(); }
    catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Batch ${row.batchNumber}`} subtitle={`${row.product.sku} · ${row.warehouse.code}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Manufacture date"><input type="date" className={`${inputCls} w-full`} value={f.manufactureDate} onChange={(e) => setF({ ...f, manufactureDate: e.target.value })} /></Field>
        <Field label="Expiry date" hint="Correcting a wrong expiry into the future re-activates an expired batch"><input type="date" className={`${inputCls} w-full`} value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} /></Field>
        <Field label="Notes"><textarea rows={2} className={`${inputCls} w-full`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button type="button" className={btnTeal} disabled={saving} onClick={save}>Save</button></div>
    </Modal>
  );
}

export default function BatchExpiryManagement() {
  const [params] = useSearchParams();
  const { f, set, setPage, toggleSort } = useListState({ sort: 'expiryDate', expiry: params.get('expiry') || '' });
  const [writeOff, setWriteOff] = useState(null);
  const [edit, setEdit] = useState(null);
  const q = useInventoryQuery(() => api.batches(f), [JSON.stringify(f)]);
  const sum = useInventoryQuery(() => api.expirySummary(), []);
  const s = sum.data;
  const refresh = () => { q.reload(); sum.reload(); };

  useEffect(() => { const e = params.get('expiry'); if (e !== null) set({ expiry: e }); }, [params, set]);

  const doWriteOff = async (reason) => {
    try {
      await api.writeOffBatch(writeOff._id, { reason, type: writeOff.daysToExpiry != null && writeOff.daysToExpiry < 0 ? 'EXPIRED' : 'DAMAGED' });
      toast.success(`Batch ${writeOff.batchNumber} written off`); refresh();
    } catch (e) { toast.error(errMsg(e)); }
    setWriteOff(null);
  };

  return (
    <div>
      <PageHeader title="Batch & Expiry Management" subtitle="Every receipt is a batch. Sales use First-Expiry-First-Out (FEFO)." />
      {s && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <InvStat label="Expired, on shelf" value={s.expired.batches} icon={CalendarX} tone={s.expired.batches ? 'red' : 'teal'} hint={`${num(s.expired.units)} units · ${compactInr(s.expired.value)}`} onClick={() => set({ expiry: 'expired', days: undefined })} />
          <InvStat label="Critical (≤ 7 days)" value={s.expiringIn7Days.batches} icon={CalendarClock} tone={s.expiringIn7Days.batches ? 'amber' : 'teal'} hint={`${num(s.expiringIn7Days.units)} units`} onClick={() => set({ expiry: 'expiring', days: 7 })} />
          <InvStat label={`Warning (≤ ${s.windowDays} days)`} value={s.expiringInWindow.batches} icon={CalendarClock} hint={`${num(s.expiringInWindow.units)} units · ${compactInr(s.expiringInWindow.value)}`} onClick={() => set({ expiry: 'expiring', days: undefined })} />
          <InvStat label="Non-perishable batches" value={s.noExpiry.batches} icon={Layers} hint={`${num(s.noExpiry.units)} units`} />
        </div>
      )}

      {s?.timeline?.length > 0 && (
        <Panel title="Units expiring per week (next 12 weeks)" className="mt-6">
          <div className="h-48"><ResponsiveContainer><BarChart data={s.timeline}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="week" tickFormatter={(w) => `Wk ${w}`} /><YAxis /><Tooltip labelFormatter={(w) => `Week ${w}`} />
            <Bar dataKey="units" name="Units" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
        </Panel>
      )}

      <div className="mt-6">
        <Tabs value={f.expiry || ''} onChange={(expiry) => set({ expiry, days: undefined })}
          tabs={[{ value: '', label: 'All batches' }, { value: 'expired', label: 'Expired' }, { value: 'expiring', label: `Expiring${f.days ? ` ≤ ${f.days}d` : ' soon'}` }, { value: 'fresh', label: 'Fresh' }]} />
      </div>
      <Panel actions={(
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={f.search} onChange={(search) => set({ search })} placeholder="Batch number" className="w-44" />
          <WarehouseSelect allLabel="All warehouses" value={f.warehouse} onChange={(warehouse) => set({ warehouse })} />
          <select className={inputCls} value={f.status || ''} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any status</option>{['active', 'expired', 'depleted', 'written_off'].map((x) => <option key={x} value={x}>{pretty(x)}</option>)}</select>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={f.inStock === 'false'} onChange={(e) => set({ inStock: e.target.checked ? 'false' : undefined })} />Include empty</label>
        </div>
      )}>
        <Async q={q} empty="No batches match">
          <Table rows={q.data || []} sort={f.sort} onSort={toggleSort} columns={[
            { key: 'batchNumber', header: 'Batch', sortKey: 'batchNumber', render: (r) => <span className="whitespace-nowrap font-medium">{r.batchNumber}</span> },
            { key: 'product', header: 'Product', render: (r) => <div className="min-w-[170px]"><div className="font-medium">{r.product.name}</div><div className="text-xs text-slate-400">{r.product.sku}</div></div> },
            { key: 'warehouse', header: 'Warehouse', render: (r) => <span className="whitespace-nowrap">{r.warehouse.code}</span> },
            { key: 'quantity', header: 'Remaining', sortKey: 'quantity', align: 'right', render: (r) => <span>{num(r.quantity)} <span className="text-xs text-slate-400">/ {num(r.initialQuantity)}</span></span> },
            { key: 'value', header: 'Value', align: 'right', render: (r) => inr(r.value) },
            { key: 'receivedAt', header: 'Received', sortKey: 'receivedAt', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDate(r.receivedAt)}</span> },
            { key: 'expiryDate', header: 'Expiry', sortKey: 'expiryDate', render: (r) => <div className="space-y-1">{r.expiryDate && <div className="whitespace-nowrap text-xs">{fmtDate(r.expiryDate)}</div>}{expiryBadge(r)}</div> },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={batchTone[r.status]}>{pretty(r.status)}</Badge> },
            {
              key: 'a', header: '', render: (r) => (
                <div className="flex justify-end gap-1">
                  <button type="button" className={btnIcon} title="Edit" onClick={() => setEdit(r)}><Pencil size={16} /></button>
                  {r.quantity > 0 && <button type="button" className={`${btnIcon} hover:text-red-600`} title="Write off" onClick={() => setWriteOff(r)}><Trash size={16} /></button>}
                </div>
              ),
            },
          ]} />
          <Pager meta={q.meta} onChange={setPage} />
        </Async>
      </Panel>
      {edit && <EditBatchModal row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
      {writeOff && (
        <ConfirmDialog danger withReason title={`Write off batch ${writeOff.batchNumber}?`} confirmText="Write off" onCancel={() => setWriteOff(null)} onConfirm={doWriteOff}
          message={<>All <b>{writeOff.quantity}</b> remaining unit(s) of <b>{writeOff.product.name}</b> in {writeOff.warehouse.code} will be removed from stock and logged as <b>{writeOff.daysToExpiry < 0 ? 'EXPIRED' : 'DAMAGED'}</b>.</>} />
      )}
    </div>
  );
}
