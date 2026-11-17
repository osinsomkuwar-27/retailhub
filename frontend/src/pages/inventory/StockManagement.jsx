// Deep links (e.g. from Module 3):
//   /inventory/stock?status=attention                     → low-stock alerts tab
//   /inventory/stock?action=receive&product=<id>&quantity=60[&warehouse=<id>&supplier=<id>]
//                                                          → opens "Receive stock" pre-filled
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardCheck, MinusCircle, PlusCircle, Settings2 } from 'lucide-react';
import { inventoryService as api, errMsg } from '../../services/inventoryService';
import useInventoryQuery, { useListState } from '../../hooks/useInventoryQuery';
import { CategorySelect, ProductPicker, WarehouseSelect } from '../../components/inventory/pickers';
import {
  PageHeader, Panel, Async, Table, Pager, Badge, Modal, Field, Tabs, SearchInput,
  stockStatusTone, stockStatusLabel, inr, num, compactInr, toInputDate, inputCls, btnGhost, btnTeal, btnDanger, btnIcon,
} from '../../components/inventory/ui';

const TITLES = { in: 'Receive stock', out: 'Reduce stock', adjust: 'Stock count (adjustment)', settings: 'Stock settings' };
const full = `${inputCls} w-full`;

export function StockActionModal({ action, onClose, onDone }) {
  const { mode, row, prefill = {} } = action;
  const [product, setProduct] = useState(row ? { ...row.product, available: row.available } : prefill.product || null);
  const [f, setF] = useState({
    warehouseId: row?.warehouse._id || prefill.warehouseId || '', quantity: prefill.quantity || '', reason: prefill.reason || '', type: 'STOCK_OUT', batchNumber: '',
    expiryDate: '', manufactureDate: '', costPrice: row?.product.pricing?.costPrice ?? prefill.product?.pricing?.costPrice ?? '',
    countedQuantity: row ? String(row.quantity) : '', reorderLevel: row?.reorderLevel ?? '', binLocation: row?.binLocation || '', supplierId: prefill.supplierId,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    const e = {};
    if (mode !== 'settings') {
      if (!product) e.product = 'Choose a product';
      if (!f.warehouseId) e.warehouseId = 'Choose a warehouse';
    }
    const qty = Number(f.quantity);
    if ((mode === 'in' || mode === 'out') && !(qty > 0 && Number.isInteger(qty))) e.quantity = 'Whole number greater than 0';
    if (mode === 'out' && product?.available != null && qty > product.available) e.quantity = `Only ${product.available} available`;
    if ((mode === 'out' || mode === 'adjust') && f.reason.trim().length < 3) e.reason = 'Please give a reason';
    if (mode === 'adjust' && (f.countedQuantity === '' || Number(f.countedQuantity) < 0)) e.countedQuantity = 'Enter the counted quantity';
    if (mode === 'in' && product?.isPerishable && !f.expiryDate && !product.shelfLifeDays) e.expiryDate = 'Required for perishable products';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const base = { productId: product?._id, warehouseId: f.warehouseId, reason: f.reason };
      let res;
      if (mode === 'in') {
        res = await api.stockIn({ ...base, quantity: qty, batchNumber: f.batchNumber, expiryDate: f.expiryDate || undefined, manufactureDate: f.manufactureDate || undefined, costPrice: f.costPrice === '' ? undefined : Number(f.costPrice), supplierId: f.supplierId });
      } else if (mode === 'out') {
        res = await api.stockOut({ ...base, quantity: qty, type: f.type, batchNumber: f.batchNumber });
      } else if (mode === 'adjust') {
        res = await api.adjustStock({ ...base, countedQuantity: Number(f.countedQuantity), expiryDate: f.expiryDate || undefined });
      } else {
        res = await api.inventorySettings(row._id, { reorderLevel: f.reorderLevel === '' ? null : Number(f.reorderLevel), binLocation: f.binLocation });
      }
      toast.success(res.message);
      onDone();
    } catch (err) { toast.error(errMsg(err)); } finally { setSaving(false); }
  };

  return (
    <Modal title={TITLES[mode]} subtitle={row && `${row.product.sku} · ${row.warehouse.code}`} onClose={onClose}>
      <div className="space-y-3">
        {mode !== 'settings' && !row && (
          <>
            <Field label="Warehouse *" error={errors.warehouseId}>
              <WarehouseSelect className="w-full" value={f.warehouseId} onChange={(v) => { setF((s) => ({ ...s, warehouseId: v })); if (mode !== 'in') setProduct(null); }} />
            </Field>
            <Field label="Product *" error={errors.product} hint={mode !== 'in' ? 'Only products stocked in the selected warehouse' : undefined}>
              <ProductPicker value={product} onChange={setProduct} warehouseId={mode !== 'in' ? f.warehouseId || undefined : undefined} />
            </Field>
          </>
        )}
        {product?.available != null && mode !== 'settings' && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Currently available: <strong>{product.available}</strong></p>}

        {mode === 'in' && (<>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity *" error={errors.quantity}><input type="number" min="1" className={full} value={f.quantity} onChange={set('quantity')} /></Field>
            <Field label="Unit cost (₹)"><input type="number" min="0" step="0.01" className={full} value={f.costPrice} onChange={set('costPrice')} /></Field>
          </div>
          <Field label="Batch number" hint="Leave empty to auto-generate. Re-using a number adds to that batch.">
            <input className={`${full} uppercase`} placeholder="Auto" value={f.batchNumber} onChange={(e) => setF((s) => ({ ...s, batchNumber: e.target.value.toUpperCase() }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manufacture date"><input type="date" className={full} max={toInputDate(new Date())} value={f.manufactureDate} onChange={set('manufactureDate')} /></Field>
            <Field label={`Expiry date${product?.isPerishable ? ' *' : ''}`} error={errors.expiryDate} hint={product?.isPerishable && product?.shelfLifeDays ? `Auto: +${product.shelfLifeDays} days if empty` : undefined}>
              <input type="date" className={full} min={toInputDate(new Date(Date.now() + 864e5))} value={f.expiryDate} onChange={set('expiryDate')} /></Field>
          </div>
          <Field label="Note"><input className={full} placeholder="e.g. PO-1043 from supplier" value={f.reason} onChange={set('reason')} /></Field>
        </>)}

        {mode === 'out' && (<>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity *" error={errors.quantity}><input type="number" min="1" className={full} value={f.quantity} onChange={set('quantity')} /></Field>
            <Field label="Type"><select className={full} value={f.type} onChange={set('type')}>
              <option value="STOCK_OUT">Stock out (manual)</option><option value="DAMAGED">Damaged</option><option value="EXPIRED">Expired</option></select></Field>
          </div>
          <Field label="Specific batch" hint="Optional. Otherwise the earliest-expiring batch is used first (FEFO).">
            <input className={`${full} uppercase`} placeholder="FEFO" value={f.batchNumber} onChange={(e) => setF((s) => ({ ...s, batchNumber: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Reason *" error={errors.reason}><textarea rows={2} className={full} placeholder="Why is stock leaving? (recorded in the history)" value={f.reason} onChange={set('reason')} /></Field>
          <p className="text-xs text-slate-400">Large reductions without a sale or transfer are flagged by Anomaly Monitoring.</p>
        </>)}

        {mode === 'adjust' && (<>
          {row && <p className="text-sm text-slate-600">System quantity: <strong>{row.quantity}</strong></p>}
          <Field label="Counted quantity *" error={errors.countedQuantity}><input type="number" min="0" className={full} value={f.countedQuantity} onChange={set('countedQuantity')} /></Field>
          {product?.isPerishable && <Field label="Expiry for surplus units" hint="Only used if the count is higher than the system"><input type="date" className={full} value={f.expiryDate} onChange={set('expiryDate')} /></Field>}
          <Field label="Reason *" error={errors.reason}><input className={full} placeholder="e.g. Monthly cycle count" value={f.reason} onChange={set('reason')} /></Field>
        </>)}

        {mode === 'settings' && row && (<>
          <Field label="Reorder level for this warehouse" hint={`Leave empty to use the product default (${row.product.reorderLevel})`}>
            <input type="number" min="0" className={full} value={f.reorderLevel} onChange={set('reorderLevel')} /></Field>
          <Field label="Bin / shelf location"><input className={full} placeholder="e.g. A-03-2" value={f.binLocation} onChange={set('binLocation')} /></Field>
        </>)}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
        <button type="button" className={mode === 'out' ? btnDanger : btnTeal} disabled={saving} onClick={submit}>{saving ? 'Saving…' : TITLES[mode]}</button>
      </div>
    </Modal>
  );
}

export default function StockManagement() {
  const [params, setParams] = useSearchParams();
  const { f, set, setPage, toggleSort } = useListState({ stockStatus: params.get('status') || '' });
  const [action, setAction] = useState(null);
  const q = useInventoryQuery(() => api.inventory(f), [JSON.stringify(f)]);

  useEffect(() => { const s = params.get('status'); if (s !== null) set({ stockStatus: s }); }, [params, set]);
  // Deep link: open "Receive stock" pre-filled
  useEffect(() => {
    if (params.get('action') !== 'receive') return;
    const productId = params.get('product');
    const open = (product) => setAction({ mode: 'in', prefill: { product, quantity: params.get('quantity') || '', warehouseId: params.get('warehouse') || '', supplierId: params.get('supplier') || undefined, reason: params.get('note') || '' } });
    if (productId) api.product(productId).then((r) => open(r.data)).catch(() => open(null)); else open(null);
    setParams((p) => { ['action', 'product', 'quantity', 'warehouse', 'supplier', 'note'].forEach((k) => p.delete(k)); return p; }, { replace: true });
  }, [params, setParams]);

  return (
    <div>
      <PageHeader title="Stock Management" subtitle="Receive, reduce and count stock. Every change is a MongoDB transaction with a history log."
        actions={(
          <>
            <button type="button" className={btnGhost} onClick={() => setAction({ mode: 'out' })}><MinusCircle size={14} />Reduce stock</button>
            <button type="button" className={btnTeal} onClick={() => setAction({ mode: 'in' })}><PlusCircle size={14} />Receive stock</button>
          </>
        )} />
      <Tabs value={f.stockStatus || ''} onChange={(stockStatus) => set({ stockStatus })}
        tabs={[{ value: '', label: 'All stock' }, { value: 'attention', label: 'Low-stock alerts' }, { value: 'low_stock', label: 'Low' }, { value: 'out_of_stock', label: 'Out of stock' }, { value: 'in_stock', label: 'Healthy' }]} />
      <Panel title={q.meta ? `${q.meta.total} rows · ${num(q.meta.totalUnits)} units · ${compactInr(q.meta.totalValue)} at cost` : 'Stock'} actions={(
        <div className="flex flex-wrap gap-2">
          <SearchInput value={f.search} onChange={(search) => set({ search })} placeholder="Product or SKU" className="w-52" />
          <WarehouseSelect allLabel="All warehouses" value={f.warehouse} onChange={(warehouse) => set({ warehouse })} />
          <CategorySelect allLabel="All categories" value={f.category} onChange={(category) => set({ category })} />
        </div>
      )}>
        <Async q={q} empty={f.stockStatus ? 'No rows in this state' : 'No stock yet. Receive stock into a warehouse to get started.'}>
          <Table rows={q.data || []} sort={f.sort} onSort={toggleSort} columns={[
            { key: 'product', header: 'Product', sortKey: 'product.name', render: (r) => <div className="min-w-[180px] max-w-[260px]"><div className="truncate font-medium" title={r.product.name}>{r.product.name}</div><div className="text-xs text-slate-400">{r.product.sku}{r.binLocation && ` · bin ${r.binLocation}`}</div></div> },
            { key: 'warehouse', header: 'Warehouse', render: (r) => <span className="whitespace-nowrap" title={r.warehouse.name}>{r.warehouse.code}</span> },
            { key: 'quantity', header: 'On hand', sortKey: 'quantity', align: 'right', render: (r) => num(r.quantity) },
            { key: 'available', header: 'Available', sortKey: 'available', align: 'right', render: (r) => <div><div className="font-semibold">{num(r.available)}</div>{r.reservedQuantity > 0 && <div className="whitespace-nowrap text-xs text-slate-400">{num(r.reservedQuantity)} reserved</div>}</div> },
            { key: 'reorder', header: 'Reorder at', align: 'right', render: (r) => <span title={r.reorderLevel != null ? 'Warehouse override' : 'Product default'}>{r.effectiveReorderLevel}{r.reorderLevel != null && '*'}</span> },
            { key: 'value', header: 'Value', sortKey: 'stockValue', align: 'right', render: (r) => inr(r.stockValue) },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={stockStatusTone[r.stockStatus]}>{stockStatusLabel[r.stockStatus]}</Badge> },
            {
              key: 'a', header: '', render: (r) => (
                <div className="flex justify-end gap-0.5 whitespace-nowrap">
                  <button type="button" className={`${btnIcon} hover:text-emerald-600`} title="Add stock" onClick={() => setAction({ mode: 'in', row: r })}><PlusCircle size={16} /></button>
                  <button type="button" className={`${btnIcon} hover:text-red-600`} title="Reduce stock" onClick={() => setAction({ mode: 'out', row: r })}><MinusCircle size={16} /></button>
                  <button type="button" className={btnIcon} title="Stock count" onClick={() => setAction({ mode: 'adjust', row: r })}><ClipboardCheck size={16} /></button>
                  <button type="button" className={btnIcon} title="Reorder level & bin" onClick={() => setAction({ mode: 'settings', row: r })}><Settings2 size={16} /></button>
                </div>
              ),
            },
          ]} />
          <Pager meta={q.meta} onChange={setPage} />
        </Async>
      </Panel>
      {action && <StockActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); q.reload(); }} />}
    </div>
  );
}
