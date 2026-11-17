// Shared by pages/inventory/AddProduct.jsx and EditProduct.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Plus, Save, Trash2, XCircle } from 'lucide-react';
import { inventoryService as api, errMsg } from '../../services/inventoryService';
import { CategorySelect } from './pickers';
import { PageHeader, Panel, Field, Loading, ErrorState, inputCls, btnGhost, btnTeal, btnIcon } from './ui';

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'dozen'];
const EMPTY = {
  name: '', brand: '', category: '', description: '', unit: 'pcs',
  pricing: { costPrice: '', sellingPrice: '', mrp: '', taxRate: '0' },
  reorderLevel: '10', isPerishable: false, shelfLifeDays: '', status: 'active', attributes: [], images: '',
};
const SKU_RE = /^[A-Z0-9]{2,6}(-[A-Z0-9]{2,8}){1,3}$/;
const full = `${inputCls} w-full`;

function validate(f, skuMode, sku) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Name is required (min 2 characters)';
  if (!f.category) e.category = 'Choose a category';
  const sell = Number(f.pricing.sellingPrice);
  if (f.pricing.costPrice === '' || Number(f.pricing.costPrice) < 0) e.costPrice = 'Enter a cost price ≥ 0';
  if (f.pricing.sellingPrice === '' || sell < 0) e.sellingPrice = 'Enter a selling price ≥ 0';
  if (f.pricing.mrp !== '' && sell > Number(f.pricing.mrp)) e.sellingPrice = 'Selling price cannot exceed MRP';
  if (f.reorderLevel === '' || Number(f.reorderLevel) < 0) e.reorderLevel = 'Reorder level must be ≥ 0';
  if (f.isPerishable && f.shelfLifeDays !== '' && Number(f.shelfLifeDays) < 1) e.shelfLifeDays = 'At least 1 day';
  if (skuMode === 'manual' && !SKU_RE.test(sku)) e.sku = 'Format like ELE-SAM-00012';
  if (f.attributes.some((a) => !a.key.trim() || !a.value.trim())) e.attributes = 'Fill in or remove empty attribute rows';
  return e;
}

export default function ProductForm({ id }) {
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [skuMode, setSkuMode] = useState('auto');
  const [sku, setSku] = useState('');
  const [originalSku, setOriginalSku] = useState('');
  const [skuInfo, setSkuInfo] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    api.product(id).then(({ data: p }) => {
      setForm({
        name: p.name, brand: p.brand || '', category: p.category?._id || '', description: p.description || '', unit: p.unit,
        pricing: { costPrice: String(p.pricing.costPrice ?? ''), sellingPrice: String(p.pricing.sellingPrice ?? ''), mrp: p.pricing.mrp != null ? String(p.pricing.mrp) : '', taxRate: String(p.pricing.taxRate ?? 0) },
        reorderLevel: String(p.reorderLevel), isPerishable: p.isPerishable, shelfLifeDays: p.shelfLifeDays ? String(p.shelfLifeDays) : '',
        status: p.status, attributes: p.attributes || [], images: (p.images || []).join('\n'),
      });
      setSku(p.sku); setOriginalSku(p.sku); setSkuMode('manual');
    }).catch((e) => setLoadError(errMsg(e))).finally(() => setLoading(false));
  }, [id, isEdit]);

  // SKU preview (auto) / availability check (manual), debounced
  useEffect(() => {
    if (skuMode !== 'auto') return undefined;
    if (!form.category) { setSkuInfo(null); return undefined; }
    const t = setTimeout(() => api.skuPreview(form.category, form.brand).then((r) => setSkuInfo({ preview: r.data.sku })).catch(() => setSkuInfo(null)), 400);
    return () => clearTimeout(t);
  }, [skuMode, form.category, form.brand]);
  useEffect(() => {
    if (skuMode !== 'manual' || !sku || sku === originalSku) { if (skuMode === 'manual') setSkuInfo(null); return undefined; }
    const t = setTimeout(() => api.skuCheck(sku, id).then((r) => setSkuInfo(r.data)).catch(() => setSkuInfo(null)), 400);
    return () => clearTimeout(t);
  }, [skuMode, sku, originalSku, id]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPrice = (k, v) => setForm((f) => ({ ...f, pricing: { ...f.pricing, [k]: v } }));
  const setAttr = (i, k, v) => setForm((f) => ({ ...f, attributes: f.attributes.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(form, skuMode, sku);
    if (skuInfo && skuInfo.available === false) errs.sku = skuInfo.message;
    setErrors(errs);
    if (Object.keys(errs).length) { toast.error('Please fix the highlighted fields'); return; }
    const body = {
      name: form.name.trim(), brand: form.brand.trim(), category: form.category, description: form.description.trim(), unit: form.unit,
      pricing: { costPrice: Number(form.pricing.costPrice), sellingPrice: Number(form.pricing.sellingPrice), mrp: form.pricing.mrp === '' ? null : Number(form.pricing.mrp), taxRate: Number(form.pricing.taxRate || 0) },
      reorderLevel: Number(form.reorderLevel), isPerishable: form.isPerishable,
      shelfLifeDays: form.isPerishable && form.shelfLifeDays ? Number(form.shelfLifeDays) : null,
      attributes: form.attributes.map((a) => ({ key: a.key.trim(), value: a.value.trim() })),
      images: form.images.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    if (isEdit) body.status = form.status;
    if (skuMode === 'manual' && sku !== originalSku) body.sku = sku;
    setSaving(true);
    try {
      const res = isEdit ? await api.updateProduct(id, body) : await api.createProduct(body);
      toast.success(`${res.message}: ${res.data.sku}`);
      navigate('/inventory/products');
    } catch (err) {
      const list = err.response?.data?.errors;
      if (list) setErrors(Object.fromEntries(list.map((x) => [x.field?.split('.').pop(), x.message])));
      toast.error(errMsg(err));
    } finally { setSaving(false); }
  };

  if (loading) return <Loading />;
  if (loadError) return <ErrorState message={loadError} />;

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader title={isEdit ? 'Edit Product' : 'Add Product'}
        subtitle={isEdit ? originalSku : 'New products start with zero stock. Add stock from Stock Management.'}
        actions={(
          <>
            <Link to="/inventory/products" className={btnGhost}><ArrowLeft size={14} />Back</Link>
            <button type="submit" className={btnTeal} disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save product'}</button>
          </>
        )} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Basic details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product name *" error={errors.name} className="sm:col-span-2"><input className={full} value={form.name} maxLength={150} onChange={(e) => setField('name', e.target.value)} /></Field>
              <Field label="Category *" error={errors.category}><CategorySelect className="w-full" value={form.category} onChange={(v) => setField('category', v)} /></Field>
              <Field label="Brand"><input className={full} value={form.brand} maxLength={60} onChange={(e) => setField('brand', e.target.value)} /></Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={3} className={full} value={form.description} maxLength={2000} onChange={(e) => setField('description', e.target.value)} /></Field>
              <Field label="Unit"><select className={full} value={form.unit} onChange={(e) => setField('unit', e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
              {isEdit && (
                <Field label="Status"><select className={full} value={form.status} onChange={(e) => setField('status', e.target.value)}>
                  <option value="active">Active</option><option value="inactive">Inactive</option><option value="discontinued">Discontinued</option></select></Field>
              )}
            </div>
          </Panel>

          <Panel title="Pricing (₹)">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Cost price *" error={errors.costPrice}><input type="number" min="0" step="0.01" className={full} value={form.pricing.costPrice} onChange={(e) => setPrice('costPrice', e.target.value)} /></Field>
              <Field label="Selling price *" error={errors.sellingPrice}><input type="number" min="0" step="0.01" className={full} value={form.pricing.sellingPrice} onChange={(e) => setPrice('sellingPrice', e.target.value)} /></Field>
              <Field label="MRP"><input type="number" min="0" step="0.01" className={full} value={form.pricing.mrp} onChange={(e) => setPrice('mrp', e.target.value)} /></Field>
              <Field label="GST %"><input type="number" min="0" max="100" className={full} value={form.pricing.taxRate} onChange={(e) => setPrice('taxRate', e.target.value)} /></Field>
            </div>
            {form.pricing.costPrice !== '' && form.pricing.sellingPrice !== '' && Number(form.pricing.sellingPrice) > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Margin: ₹{(form.pricing.sellingPrice - form.pricing.costPrice).toFixed(2)} ({(((form.pricing.sellingPrice - form.pricing.costPrice) / form.pricing.sellingPrice) * 100).toFixed(1)}%)
              </p>
            )}
          </Panel>

          <Panel title="Attributes" actions={<button type="button" className={btnGhost} onClick={() => setField('attributes', [...form.attributes, { key: '', value: '' }])}><Plus size={14} />Add</button>}>
            {form.attributes.length === 0 && <p className="text-sm text-slate-400">e.g. Color = Blue, Weight = 1kg (stored as embedded documents).</p>}
            <div className="space-y-2">
              {form.attributes.map((a, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="flex gap-2">
                  <input className={full} placeholder="Key" value={a.key} onChange={(e) => setAttr(i, 'key', e.target.value)} />
                  <input className={full} placeholder="Value" value={a.value} onChange={(e) => setAttr(i, 'value', e.target.value)} />
                  <button type="button" className={`${btnIcon} hover:text-red-600`} onClick={() => setField('attributes', form.attributes.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            {errors.attributes && <p className="mt-2 text-xs text-red-600">{errors.attributes}</p>}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="SKU">
            <div className="mb-3 flex gap-4 text-sm text-slate-600">
              <label className="flex items-center gap-2"><input type="radio" className="accent-teal-600" checked={skuMode === 'auto'} disabled={isEdit} onChange={() => setSkuMode('auto')} />Auto-generate</label>
              <label className="flex items-center gap-2"><input type="radio" className="accent-teal-600" checked={skuMode === 'manual'} onChange={() => setSkuMode('manual')} />Manual</label>
            </div>
            {skuMode === 'auto' ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                {skuInfo?.preview
                  ? <>Next SKU: <strong className="text-slate-900">{skuInfo.preview}</strong><p className="mt-1 text-xs text-slate-400">Category code, brand code, sequence. Final number assigned on save.</p></>
                  : <span className="text-slate-400">Choose a category to preview the SKU.</span>}
              </div>
            ) : (
              <Field error={errors.sku} hint="Format: CAT-BRAND-00001">
                <input className={`${full} uppercase`} value={sku} placeholder="ELE-SAM-00012" onChange={(e) => setSku(e.target.value.toUpperCase())} />
                {skuInfo && (
                  <span className={`mt-1 flex items-center gap-1 text-xs ${skuInfo.available ? 'text-emerald-600' : 'text-red-600'}`}>
                    {skuInfo.available ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{skuInfo.message}
                  </span>
                )}
              </Field>
            )}
          </Panel>

          <Panel title="Inventory rules">
            <div className="space-y-3">
              <Field label="Reorder level *" error={errors.reorderLevel} hint="Low-stock alert when available stock in a warehouse falls to this level">
                <input type="number" min="0" className={full} value={form.reorderLevel} onChange={(e) => setField('reorderLevel', e.target.value)} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={form.isPerishable} onChange={(e) => setField('isPerishable', e.target.checked)} />Perishable (track expiry per batch)
              </label>
              {form.isPerishable && (
                <Field label="Shelf life (days)" error={errors.shelfLifeDays} hint="Used to fill the expiry date when a batch is received without one">
                  <input type="number" min="1" className={full} value={form.shelfLifeDays} onChange={(e) => setField('shelfLifeDays', e.target.value)} />
                </Field>
              )}
            </div>
          </Panel>

          <Panel title="Image URLs">
            <textarea rows={3} className={`${full} text-xs`} placeholder="One https:// URL per line" value={form.images} onChange={(e) => setField('images', e.target.value)} />
          </Panel>
        </div>
      </div>
    </form>
  );
}
