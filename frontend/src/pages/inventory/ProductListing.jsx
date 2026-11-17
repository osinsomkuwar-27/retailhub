import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { inventoryService as api, errMsg } from '../../services/inventoryService';
import useInventoryQuery, { useListState } from '../../hooks/useInventoryQuery';
import { CategorySelect } from '../../components/inventory/pickers';
import {
  PageHeader, Panel, Async, Table, Pager, Badge, Modal, Loading, ConfirmDialog, SearchInput,
  stockStatusTone, stockStatusLabel, batchTone, pretty, inr, num, fmtDate, inputCls, btnTeal, btnIcon,
} from '../../components/inventory/ui';

const statusTone = { active: 'green', inactive: 'gray', discontinued: 'red' };

function StockModal({ product, onClose }) {
  const q = useInventoryQuery(() => api.productStock(product._id), [product._id]);
  return (
    <Modal wide title={product.name} subtitle={`${product.sku} · reorder level ${product.reorderLevel}`} onClose={onClose}>
      {!q.data ? <Loading /> : (
        <div className="space-y-5">
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-600">By warehouse</h4>
            <Table rows={q.data.warehouses} empty="Not stocked in any warehouse yet" columns={[
              { key: 'w', header: 'Warehouse', render: (r) => `${r.warehouse.code} · ${r.warehouse.address?.city || ''}` },
              { key: 'quantity', header: 'Qty', align: 'right' },
              { key: 'reservedQuantity', header: 'Reserved', align: 'right' },
              { key: 'available', header: 'Available', align: 'right', render: (r) => <Badge tone={r.available <= 0 ? 'red' : r.available <= r.reorderLevel ? 'amber' : 'green'}>{r.available}</Badge> },
              { key: 'binLocation', header: 'Bin', render: (r) => r.binLocation || '—' },
            ]} />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-600">Batches in stock</h4>
            <Table rows={q.data.batches} empty="No batches with stock" columns={[
              { key: 'batchNumber', header: 'Batch' },
              { key: 'wh', header: 'Warehouse', render: (r) => r.warehouse.code },
              { key: 'quantity', header: 'Qty', align: 'right' },
              { key: 'expiryDate', header: 'Expiry', render: (r) => fmtDate(r.expiryDate) },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={batchTone[r.status]}>{pretty(r.status)}</Badge> },
            ]} />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function ProductListing() {
  const navigate = useNavigate();
  const { f, set, setPage, toggleSort } = useListState({ sort: '-createdAt' });
  const [del, setDel] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const q = useInventoryQuery(() => api.products(f), [JSON.stringify(f)]);

  const remove = async () => {
    try { const r = await api.deleteProduct(del._id); toast.success(r.message); q.reload(); } catch (e) { toast.error(errMsg(e)); }
    setDel(null);
  };

  return (
    <div>
      <PageHeader title="Products" subtitle="Catalogue with live stock across warehouses."
        actions={<Link to="/inventory/products/new" className={btnTeal}><Plus size={14} />Add product</Link>} />
      <Panel actions={(
        <div className="flex flex-wrap gap-2">
          <SearchInput value={f.search} onChange={(search) => set({ search })} placeholder="Search name, brand or SKU" className="w-60" />
          <CategorySelect allLabel="All categories" value={f.category} onChange={(category) => set({ category })} />
          <select className={inputCls} value={f.status || ''} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any status</option>{['active', 'inactive', 'discontinued'].map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</select>
          <select className={inputCls} value={f.stockStatus || ''} onChange={(e) => set({ stockStatus: e.target.value })}>
            <option value="">Any availability</option>{Object.entries(stockStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      )}>
        <Async q={q} empty="No products match these filters">
          <Table rows={q.data || []} sort={f.sort} onSort={toggleSort} onRowClick={setStockFor} columns={[
            { key: 'name', header: 'Product', sortKey: 'name', render: (r) => <div className="min-w-[200px]"><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku}{r.brand && ` · ${r.brand}`}</div></div> },
            { key: 'category', header: 'Category', render: (r) => r.category?.name || '—' },
            { key: 'price', header: 'Price', sortKey: 'pricing.sellingPrice', align: 'right', render: (r) => inr(r.pricing?.sellingPrice) },
            { key: 'cost', header: 'Cost', align: 'right', render: (r) => inr(r.pricing?.costPrice) },
            { key: 'stock', header: 'Stock', sortKey: 'totalStock', align: 'right', render: (r) => <div><div className="font-medium">{num(r.availableStock)}</div><div className="whitespace-nowrap text-xs text-slate-400">{r.warehouseCount} wh · reorder {r.reorderLevel}</div></div> },
            { key: 'stockStatus', header: 'Availability', render: (r) => <Badge tone={stockStatusTone[r.stockStatus]}>{stockStatusLabel[r.stockStatus]}</Badge> },
            { key: 'status', header: 'Status', render: (r) => <div className="flex flex-wrap gap-1"><Badge tone={statusTone[r.status]}>{pretty(r.status)}</Badge>{r.isPerishable && <Badge tone="blue">Perishable</Badge>}</div> },
            {
              key: 'a', header: '', render: (r) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={btnIcon} title="Stock by warehouse" onClick={() => setStockFor(r)}><Boxes size={16} /></button>
                  <button type="button" className={btnIcon} title="Edit" onClick={() => navigate(`/inventory/products/${r._id}/edit`)}><Pencil size={16} /></button>
                  {r.status !== 'discontinued' && <button type="button" className={`${btnIcon} hover:text-red-600`} title="Delete" onClick={() => setDel(r)}><Trash2 size={16} /></button>}
                </div>
              ),
            },
          ]} />
          <Pager meta={q.meta} onChange={setPage} />
        </Async>
      </Panel>
      {stockFor && <StockModal product={stockFor} onClose={() => setStockFor(null)} />}
      {del && <ConfirmDialog danger title="Delete product?" confirmText="Delete" onCancel={() => setDel(null)} onConfirm={remove}
        message={<>Delete <b>{del.name}</b>? Products with stock can't be deleted. Products with history are marked <i>discontinued</i> instead.</>} />}
    </div>
  );
}
