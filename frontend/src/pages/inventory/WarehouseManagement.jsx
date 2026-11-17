import { useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { inventoryService as api, errMsg } from '../../services/inventoryService';
import useInventoryQuery, { useListState } from '../../hooks/useInventoryQuery';
import { invalidatePickers } from '../../components/inventory/pickers';
import {
  PageHeader, Panel, Async, Table, Pager, Badge, Modal, Field, Loading, ConfirmDialog, SearchInput, UtilizationBar,
  num, compactInr, inputCls, btnGhost, btnTeal, btnIcon,
} from '../../components/inventory/ui';

const TYPES = { main: 'Main', regional: 'Regional', store: 'Store', cold_storage: 'Cold storage' };
const blank = { code: '', name: '', type: 'regional', capacity: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India', lng: '', lat: '', phone: '', email: '', isActive: true };

function WarehouseModal({ row, onClose, onSaved }) {
  const isEdit = Boolean(row._id);
  const [f, setF] = useState(isEdit ? {
    code: row.code, name: row.name, type: row.type, capacity: String(row.capacity), ...row.address, line2: row.address.line2 || '',
    lng: String(row.location.coordinates[0]), lat: String(row.location.coordinates[1]),
    phone: row.contact?.phone || '', email: row.contact?.email || '', isActive: row.isActive,
  } : blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const bind = (k) => ({ className: `${inputCls} w-full`, value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) });

  const save = async () => {
    const e = {};
    if (!/^[A-Z0-9-]{3,20}$/.test(f.code)) e.code = '3–20 capitals, digits or dashes';
    if (f.name.trim().length < 2) e.name = 'Required';
    if (!(Number(f.capacity) > 0)) e.capacity = 'Must be > 0';
    ['line1', 'city', 'state', 'postalCode'].forEach((k) => { if (!String(f[k]).trim()) e[k] = 'Required'; });
    if (f.lng === '' || Math.abs(Number(f.lng)) > 180) e.lng = '−180 to 180';
    if (f.lat === '' || Math.abs(Number(f.lat)) > 90) e.lat = '−90 to 90';
    setErrors(e);
    if (Object.keys(e).length) return;
    const body = {
      code: f.code, name: f.name, type: f.type, capacity: Number(f.capacity), isActive: f.isActive,
      address: { line1: f.line1, line2: f.line2, city: f.city, state: f.state, postalCode: f.postalCode, country: f.country },
      location: { type: 'Point', coordinates: [Number(f.lng), Number(f.lat)] }, contact: { phone: f.phone, email: f.email },
    };
    setSaving(true);
    try {
      if (isEdit) await api.updateWarehouse(row._id, body); else await api.createWarehouse(body);
      toast.success(isEdit ? 'Warehouse updated' : 'Warehouse created'); onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setSaving(false); }
  };

  return (
    <Modal wide title={isEdit ? `Edit ${row.code}` : 'New warehouse'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code *" error={errors.code}><input {...bind('code')} className={`${inputCls} w-full uppercase`} placeholder="WH-PUN-01" onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Name *" error={errors.name}><input {...bind('name')} /></Field>
        <Field label="Type"><select {...bind('type')}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Capacity (units) *" error={errors.capacity}><input type="number" min="1" {...bind('capacity')} /></Field>
        <Field label="Address line 1 *" error={errors.line1} className="sm:col-span-2"><input {...bind('line1')} /></Field>
        <Field label="Address line 2" className="sm:col-span-2"><input {...bind('line2')} /></Field>
        <Field label="City *" error={errors.city}><input {...bind('city')} /></Field>
        <Field label="State *" error={errors.state}><input {...bind('state')} /></Field>
        <Field label="Postal code *" error={errors.postalCode}><input {...bind('postalCode')} /></Field>
        <Field label="Country"><input {...bind('country')} /></Field>
        <Field label="Longitude *" error={errors.lng} hint="GeoJSON stores [longitude, latitude]"><input type="number" step="any" {...bind('lng')} /></Field>
        <Field label="Latitude *" error={errors.lat}><input type="number" step="any" {...bind('lat')} /></Field>
        <Field label="Phone"><input {...bind('phone')} /></Field>
        <Field label="Email"><input type="email" {...bind('email')} /></Field>
        {isEdit && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Active</label>}
      </div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button type="button" className={btnTeal} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></div>
    </Modal>
  );
}

function WarehouseDetail({ row, onClose }) {
  const q = useInventoryQuery(() => api.warehouse(row._id), [row._id]);
  const d = q.data;
  return (
    <Modal wide title={row.name} subtitle={`${row.code} · ${row.address.line1}, ${row.address.city}`} onClose={onClose}>
      {!d ? <Loading /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Units', num(d.totalUnits)], ['SKUs', d.skuCount], ['Low-stock rows', d.lowStockCount], ['Expiring batches', d.expiringBatches]].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">{l}</p><p className="text-lg font-semibold text-slate-900">{v}</p></div>
            ))}
          </div>
          <UtilizationBar percent={d.utilization} />
          <Table rowKey="category" rows={d.byCategory} empty="No stock" columns={[
            { key: 'category', header: 'Category' },
            { key: 'units', header: 'Units', align: 'right', render: (r) => num(r.units) },
            { key: 'value', header: 'Value (cost)', align: 'right', render: (r) => compactInr(r.value) },
          ]} />
          <p className="text-xs text-slate-400">Coordinates: {d.location.coordinates[1]}, {d.location.coordinates[0]} (lat, lng)</p>
        </div>
      )}
    </Modal>
  );
}

export default function WarehouseManagement() {
  const { f, set, setPage, toggleSort } = useListState({ sort: 'code', limit: 12 });
  const [edit, setEdit] = useState(null);
  const [detail, setDetail] = useState(null);
  const [del, setDel] = useState(null);
  const q = useInventoryQuery(() => api.warehouses(f), [JSON.stringify(f)]);

  const remove = async () => {
    try { const r = await api.deleteWarehouse(del._id); toast.success(r.message); invalidatePickers(); q.reload(); } catch (e) { toast.error(errMsg(e)); }
    setDel(null);
  };

  return (
    <div>
      <PageHeader title="Warehouse Management" subtitle="Locations, capacity and utilisation."
        actions={<button type="button" className={btnTeal} onClick={() => setEdit({})}><Plus size={14} />New warehouse</button>} />
      <Panel actions={(
        <div className="flex flex-wrap gap-2">
          <SearchInput value={f.search} onChange={(search) => set({ search })} placeholder="Search code, name or city" className="w-56" />
          <select className={inputCls} value={f.type || ''} onChange={(e) => set({ type: e.target.value })}>
            <option value="">All types</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className={inputCls} value={f.isActive ?? ''} onChange={(e) => set({ isActive: e.target.value })}>
            <option value="">Active & inactive</option><option value="true">Active</option><option value="false">Inactive</option></select>
        </div>
      )}>
        <Async q={q} empty="No warehouses yet">
          <Table rows={q.data || []} sort={f.sort} onSort={toggleSort} onRowClick={setDetail} columns={[
            { key: 'code', header: 'Code', sortKey: 'code', render: (r) => <span className="whitespace-nowrap font-medium">{r.code}</span> },
            { key: 'name', header: 'Warehouse', sortKey: 'name', render: (r) => <div><div className="font-medium">{r.name}</div><div className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={12} />{r.address.city}, {r.address.state}</div></div> },
            { key: 'type', header: 'Type', render: (r) => <div className="flex gap-1"><Badge tone={r.type === 'cold_storage' ? 'blue' : 'teal'}>{TYPES[r.type]}</Badge>{!r.isActive && <Badge>Inactive</Badge>}</div> },
            { key: 'totalUnits', header: 'Units / capacity', sortKey: 'totalUnits', align: 'right', render: (r) => <span className="whitespace-nowrap">{num(r.totalUnits)} / {num(r.capacity)}</span> },
            { key: 'utilization', header: 'Utilisation', sortKey: 'utilization', render: (r) => <div className="w-40"><UtilizationBar percent={r.utilization} /></div> },
            { key: 'skuCount', header: 'SKUs', align: 'right' },
            { key: 'reservedUnits', header: 'Reserved', align: 'right', render: (r) => num(r.reservedUnits) },
            {
              key: 'a', header: '', render: (r) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={btnIcon} title="Edit" onClick={() => setEdit(r)}><Pencil size={16} /></button>
                  <button type="button" className={`${btnIcon} hover:text-red-600`} title="Delete" onClick={() => setDel(r)}><Trash2 size={16} /></button>
                </div>
              ),
            },
          ]} />
          <Pager meta={q.meta} onChange={setPage} />
        </Async>
      </Panel>
      {edit && <WarehouseModal row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); invalidatePickers(); q.reload(); }} />}
      {detail && <WarehouseDetail row={detail} onClose={() => setDetail(null)} />}
      {del && <ConfirmDialog danger title="Delete warehouse?" confirmText="Delete" onCancel={() => setDel(null)} onConfirm={remove}
        message={<>Delete <b>{del.code}</b>? A warehouse holding stock can't be deleted. One with history is deactivated instead.</>} />}
    </div>
  );
}
