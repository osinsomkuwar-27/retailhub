import { useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { inventoryService as api, errMsg } from '../../services/inventoryService';
import useInventoryQuery, { useListState } from '../../hooks/useInventoryQuery';
import { CategorySelect, invalidatePickers } from '../../components/inventory/pickers';
import { PageHeader, Panel, Async, Table, Pager, Badge, Modal, Field, ConfirmDialog, SearchInput, fmtDate, inputCls, btnGhost, btnTeal, btnIcon } from '../../components/inventory/ui';

function CategoryModal({ row, onClose, onSaved }) {
  const isEdit = Boolean(row._id);
  const [f, setF] = useState({ name: row.name || '', code: row.code || '', description: row.description || '', parent: row.parent?._id || '', isActive: row.isActive ?? true });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'At least 2 characters';
    if (!/^[A-Z0-9]{2,6}$/.test(f.code)) e.code = '2–6 capital letters or digits';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { ...f, parent: f.parent || null };
      if (isEdit) await api.updateCategory(row._id, body); else await api.createCategory(body);
      toast.success(isEdit ? 'Category updated' : 'Category created'); onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setSaving(false); }
  };
  return (
    <Modal title={isEdit ? 'Edit category' : 'New category'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name *" error={errors.name}><input autoFocus className={`${inputCls} w-full`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="SKU code *" error={errors.code} hint="Used as SKU prefix, e.g. ELE → ELE-SAM-00001">
          <input maxLength={6} className={`${inputCls} w-full uppercase`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Parent category"><CategorySelect className="w-full" value={f.parent} exclude={row._id} placeholder="None (top level)" onChange={(v) => setF({ ...f, parent: v })} /></Field>
        <Field label="Description"><textarea rows={2} className={`${inputCls} w-full`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Active</label>
      </div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button type="button" className={btnTeal} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></div>
    </Modal>
  );
}

export default function CategoryManagement() {
  const { f, set, setPage, toggleSort } = useListState({ sort: 'name', limit: 20 });
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const q = useInventoryQuery(() => api.categories(f), [JSON.stringify(f)]);

  const remove = async () => {
    try { await api.deleteCategory(del._id); toast.success('Category deleted'); invalidatePickers(); q.reload(); } catch (e) { toast.error(errMsg(e)); }
    setDel(null);
  };

  return (
    <div>
      <PageHeader title="Category Management" subtitle="The category code becomes the first part of every product SKU."
        actions={<button type="button" className={btnTeal} onClick={() => setEdit({})}><Plus size={14} />New category</button>} />
      <Panel actions={(
        <div className="flex flex-wrap gap-2">
          <SearchInput value={f.search} onChange={(search) => set({ search })} placeholder="Search name or code" className="w-56" />
          <select className={inputCls} value={f.isActive ?? ''} onChange={(e) => set({ isActive: e.target.value })}>
            <option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></select>
        </div>
      )}>
        <Async q={q} empty="No categories yet">
          <Table rows={q.data || []} sort={f.sort} onSort={toggleSort} columns={[
            { key: 'name', header: 'Name', sortKey: 'name', render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.description || '—'}</div></div> },
            { key: 'code', header: 'SKU code', sortKey: 'code' },
            { key: 'parent', header: 'Parent', render: (r) => r.parent?.name || '—' },
            { key: 'productCount', header: 'Products', sortKey: 'productCount', align: 'right' },
            { key: 'isActive', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
            { key: 'createdAt', header: 'Created', sortKey: 'createdAt', render: (r) => fmtDate(r.createdAt) },
            {
              key: 'a', header: '', render: (r) => (
                <div className="flex justify-end gap-1">
                  <button type="button" className={btnIcon} title="Edit" onClick={() => setEdit(r)}><Pencil size={16} /></button>
                  <button type="button" className={`${btnIcon} hover:text-red-600`} title="Delete" onClick={() => setDel(r)}><Trash2 size={16} /></button>
                </div>
              ),
            },
          ]} />
          <Pager meta={q.meta} onChange={setPage} />
        </Async>
      </Panel>
      {edit && <CategoryModal row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); invalidatePickers(); q.reload(); }} />}
      {del && <ConfirmDialog danger title="Delete category?" confirmText="Delete" onCancel={() => setDel(null)} onConfirm={remove}
        message={<>Delete <b>{del.name}</b>? Categories with products or sub-categories can't be deleted. Deactivate them instead.</>} />}
    </div>
  );
}
