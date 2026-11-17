// Deep link (e.g. from Module 3's Transfer Suggestions):
//   /inventory/transfers?from=<warehouseId>&to=<warehouseId>&product=<productId>&quantity=25
//   → opens "New transfer" pre-filled
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Eye, Plus, Trash2, XCircle } from 'lucide-react';
import { inventoryService as api, errMsg } from '../../services/inventoryService';
import useInventoryQuery, { useListState } from '../../hooks/useInventoryQuery';
import { ProductPicker, WarehouseSelect } from '../../components/inventory/pickers';
import {
  PageHeader, Panel, Async, Table, Pager, Badge, Modal, Field, Tabs, Loading, ConfirmDialog, SearchInput,
  transferTone, pretty, fmtDate, fmtDateTime, inputCls, btnGhost, btnTeal, btnIcon,
} from '../../components/inventory/ui';

function NewTransferModal({ prefill = {}, onClose, onCreated }) {
  const [from, setFrom] = useState(prefill.from || '');
  const [to, setTo] = useState(prefill.to || '');
  const [lines, setLines] = useState([{ product: prefill.product || null, quantity: prefill.quantity || '' }]);
  const [notes, setNotes] = useState(prefill.notes || '');
  const [executeNow, setExecuteNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setErr('');
    if (!from || !to) return setErr('Choose both warehouses');
    if (from === to) return setErr('Source and destination must be different');
    const items = lines.filter((l) => l.product);
    if (!items.length) return setErr('Add at least one product');
    for (const l of items) {
      const qn = Number(l.quantity);
      if (!(qn > 0 && Number.isInteger(qn))) return setErr(`Enter a whole quantity for ${l.product.sku}`);
      if (l.product.available != null && qn > l.product.available) return setErr(`${l.product.sku}: only ${l.product.available} available at source`);
    }
    setSaving(true);
    try {
      const res = await api.createTransfer({ fromWarehouse: from, toWarehouse: to, items: items.map((l) => ({ product: l.product._id, quantity: Number(l.quantity) })), notes, executeNow });
      toast.success(res.message); onCreated();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
    return undefined;
  };

  return (
    <Modal wide title="New stock transfer" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="From warehouse *"><WarehouseSelect className="w-full" value={from} exclude={to} onChange={(v) => { setFrom(v); setLines([{ product: null, quantity: '' }]); }} /></Field>
          <ArrowRight size={18} className="mb-2.5 hidden text-teal-600 sm:block" />
          <Field label="To warehouse *"><WarehouseSelect className="w-full" value={to} exclude={from} onChange={setTo} /></Field>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-600">Items *</span>
          <div className="space-y-2">
            {lines.map((l, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="flex gap-2">
                <div className="flex-1">{from ? <ProductPicker value={l.product} warehouseId={from} onChange={(p) => setLine(i, { product: p })} /> : <div className={`${inputCls} text-slate-400`}>Choose the source warehouse first</div>}</div>
                <input type="number" min="1" className={`${inputCls} w-28`} placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <button type="button" className={`${btnIcon} hover:text-red-600`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline" disabled={lines.length >= 50} onClick={() => setLines([...lines, { product: null, quantity: '' }])}><Plus size={14} />Add line</button>
        </div>
        <Field label="Notes"><textarea rows={2} maxLength={500} className={`${inputCls} w-full`} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={executeNow} onChange={(e) => setExecuteNow(e.target.checked)} />Complete immediately (move the stock now)</label>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
        <button type="button" className={btnTeal} disabled={saving} onClick={submit}>{saving ? 'Saving…' : executeNow ? 'Create & complete' : 'Create transfer'}</button>
      </div>
    </Modal>
  );
}

function TransferDetail({ row, onClose }) {
  const q = useInventoryQuery(() => api.transfer(row._id), [row._id, row.status]);
  const t = q.data;
  return (
    <Modal wide title={row.transferNumber} subtitle={`${row.fromWarehouse.name} → ${row.toWarehouse.name}`} onClose={onClose}>
      {!t ? <Loading /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={transferTone[t.status]}>{pretty(t.status)}</Badge>{t.notes && <span className="text-sm text-slate-500">“{t.notes}”</span>}</div>
          <Table rowKey="sku" rows={t.items.map((i) => ({ ...i, sku: i.product.sku }))} columns={[
            { key: 'p', header: 'Product', render: (i) => <div><div className="font-medium">{i.product.name}</div><div className="text-xs text-slate-400">{i.product.sku}</div></div> },
            { key: 'quantity', header: 'Qty', align: 'right' },
            {
              key: 'b', header: 'Batches moved', render: (i) => (i.batches.length === 0 ? '—' : i.batches.map((b) => (
                <div key={b.batchNumber} className="text-xs">{b.batchNumber} × {b.quantity}{b.expiryDate && <span className="text-slate-400"> (exp {fmtDate(b.expiryDate)})</span>}</div>
              ))),
            },
          ]} />
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-600">Status history</h4>
            <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
              {t.statusHistory.map((h) => (
                <li key={`${h.status}-${h.changedAt}`} className="text-sm">
                  <Badge tone={transferTone[h.status]}>{pretty(h.status)}</Badge> <span className="text-slate-400">{fmtDateTime(h.changedAt)}</span>
                  {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function StockTransfer() {
  const [params, setParams] = useSearchParams();
  const { f, set, setPage, toggleSort } = useListState({ sort: '-createdAt' });
  const [creating, setCreating] = useState(null); // null | { prefill }
  const [view, setView] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const q = useInventoryQuery(() => api.transfers(f), [JSON.stringify(f)]);

  // Deep link from Transfer Suggestions
  useEffect(() => {
    const from = params.get('from'); const to = params.get('to');
    if (!from && !to) return;
    const productId = params.get('product');
    const prefill = { from: from || '', to: to || '', quantity: params.get('quantity') || '', notes: 'Created from Transfer Suggestions' };
    const open = (product) => setCreating({ prefill: { ...prefill, product } });
    if (productId) {
      api.inventory({ warehouse: from, product: productId, limit: 1 })
        .then((r) => open(r.data[0] ? { ...r.data[0].product, available: r.data[0].available } : null)).catch(() => open(null));
    } else open(null);
    setParams((p) => { ['from', 'to', 'product', 'quantity'].forEach((k) => p.delete(k)); return p; }, { replace: true });
  }, [params, setParams]);

  const act = async (reason) => {
    const { kind, t } = confirm;
    try {
      const res = kind === 'complete' ? await api.completeTransfer(t._id) : await api.cancelTransfer(t._id, reason);
      toast.success(res.message);
    } catch (e) { toast.error(errMsg(e)); }
    setConfirm(null); q.reload();
  };

  return (
    <div>
      <PageHeader title="Stock Transfer" subtitle="Move stock between warehouses. Completing a transfer is one all-or-nothing MongoDB transaction."
        actions={<button type="button" className={btnTeal} onClick={() => setCreating({ prefill: {} })}><Plus size={14} />New transfer</button>} />
      <Tabs value={f.status || ''} onChange={(status) => set({ status })}
        tabs={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} />
      <Panel actions={(
        <div className="flex flex-wrap gap-2">
          <SearchInput value={f.search} onChange={(search) => set({ search })} placeholder="Transfer number" className="w-52" />
          <WarehouseSelect allLabel="All warehouses" value={f.warehouse} onChange={(warehouse) => set({ warehouse })} />
        </div>
      )}>
        <Async q={q} empty="No transfers yet">
          <Table rows={q.data || []} sort={f.sort} onSort={toggleSort} onRowClick={setView} columns={[
            { key: 'transferNumber', header: 'Transfer #', sortKey: 'transferNumber', render: (r) => <span className="whitespace-nowrap font-medium">{r.transferNumber}</span> },
            { key: 'route', header: 'Route', render: (r) => <span className="inline-flex items-center gap-2 whitespace-nowrap">{r.fromWarehouse.code}<ArrowRight size={14} className="text-teal-600" />{r.toWarehouse.code}</span> },
            { key: 'items', header: 'Items', render: (r) => <span title={r.items.map((i) => `${i.product.sku} × ${i.quantity}`).join('\n')}>{r.items.length} line(s) · {r.items.reduce((s, i) => s + i.quantity, 0)} units</span> },
            { key: 'status', header: 'Status', sortKey: 'status', render: (r) => <Badge tone={transferTone[r.status]}>{pretty(r.status)}</Badge> },
            { key: 'createdAt', header: 'Requested', sortKey: 'createdAt', render: (r) => fmtDateTime(r.createdAt) },
            { key: 'completedAt', header: 'Completed', render: (r) => fmtDateTime(r.completedAt) },
            {
              key: 'a', header: '', render: (r) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={btnIcon} title="View" onClick={() => setView(r)}><Eye size={16} /></button>
                  {r.status === 'pending' && (<>
                    <button type="button" className={`${btnIcon} hover:text-emerald-600`} title="Complete" onClick={() => setConfirm({ kind: 'complete', t: r })}><CheckCircle2 size={16} /></button>
                    <button type="button" className={`${btnIcon} hover:text-red-600`} title="Cancel" onClick={() => setConfirm({ kind: 'cancel', t: r })}><XCircle size={16} /></button>
                  </>)}
                </div>
              ),
            },
          ]} />
          <Pager meta={q.meta} onChange={setPage} />
        </Async>
      </Panel>
      {creating && <NewTransferModal prefill={creating.prefill} onClose={() => setCreating(null)} onCreated={() => { setCreating(null); q.reload(); }} />}
      {view && <TransferDetail row={view} onClose={() => setView(null)} />}
      {confirm && (
        <ConfirmDialog
          danger={confirm.kind === 'cancel'} withReason={confirm.kind === 'cancel'}
          title={confirm.kind === 'complete' ? 'Complete transfer?' : 'Cancel transfer?'}
          confirmText={confirm.kind === 'complete' ? 'Complete transfer' : 'Cancel transfer'}
          message={confirm.kind === 'complete'
            ? <>Stock for <b>{confirm.t.transferNumber}</b> will leave <b>{confirm.t.fromWarehouse.code}</b> and arrive at <b>{confirm.t.toWarehouse.code}</b> in one transaction. If any line is short, nothing moves.</>
            : <>Cancel <b>{confirm.t.transferNumber}</b>? No stock has moved yet.</>}
          onConfirm={act} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
