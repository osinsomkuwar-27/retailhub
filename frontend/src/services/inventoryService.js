// Module 1 API client, same style as Module 3's intelligenceService:
// a flat object of calls + errMsg().
import api from './api'; // the repo's shared axios client (adds the JWT from localStorage "token")

// Every call resolves to the response body { success, message, data, meta }
const http = {
  get: (url, cfg) => api.get(url, cfg).then((r) => r.data),
  post: (url, body) => api.post(url, body).then((r) => r.data),
  put: (url, body) => api.put(url, body).then((r) => r.data),
  patch: (url, body) => api.patch(url, body).then((r) => r.data),
  delete: (url, cfg) => api.delete(url, cfg).then((r) => r.data),
};

export function errMsg(e) {
  const body = e?.response?.data;
  if (body?.errors?.length) {
    return `${body.message}: ${body.errors.map((x) => x.message || (x.sku ? `${x.sku} available ${x.available}` : JSON.stringify(x))).join('; ')}`;
  }
  return body?.message || e?.message || 'Something went wrong';
}

const clean = (p = {}) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== null && v !== undefined));
const get = (url, params) => http.get(url, { params: clean(params) });

export const inventoryService = {
  // dashboard
  dashboard: () => get('/inventory/dashboard'),

  // categories
  categories: (p) => get('/categories', p),
  category: (id) => get(`/categories/${id}`),
  createCategory: (b) => http.post('/categories', b),
  updateCategory: (id, b) => http.put(`/categories/${id}`, b),
  deleteCategory: (id) => http.delete(`/categories/${id}`),

  // products
  products: (p) => get('/products', p),
  product: (id) => get(`/products/${id}`),
  productStock: (id) => get(`/products/${id}/stock`),
  createProduct: (b) => http.post('/products', b),
  updateProduct: (id, b) => http.put(`/products/${id}`, b),
  deleteProduct: (id, hard = false) => http.delete(`/products/${id}`, { params: hard ? { hard: true } : {} }),
  skuPreview: (category, brand) => get('/products/sku/preview', { category, brand }),
  skuCheck: (sku, excludeId) => get('/products/sku/check', { sku, excludeId }),

  // warehouses
  warehouses: (p) => get('/warehouses', p),
  warehouse: (id) => get(`/warehouses/${id}`),
  createWarehouse: (b) => http.post('/warehouses', b),
  updateWarehouse: (id, b) => http.put(`/warehouses/${id}`, b),
  deleteWarehouse: (id) => http.delete(`/warehouses/${id}`),
  nearbyWarehouses: (p) => get('/warehouses/nearby', p),

  // stock
  inventory: (p) => get('/inventory', p),
  lowStock: (p) => get('/inventory/low-stock', p),
  logs: (p) => get('/inventory/logs', p),
  logSummary: (p) => get('/inventory/logs/summary', p),
  stockIn: (b) => http.post('/inventory/stock-in', clean(b)),
  stockOut: (b) => http.post('/inventory/stock-out', clean(b)),
  adjustStock: (b) => http.post('/inventory/adjust', clean(b)),
  inventorySettings: (id, b) => http.patch(`/inventory/${id}`, b),

  // transfers
  transfers: (p) => get('/stock-transfers', p),
  transfer: (id) => get(`/stock-transfers/${id}`),
  createTransfer: (b) => http.post('/stock-transfers', b),
  completeTransfer: (id, note) => http.post(`/stock-transfers/${id}/complete`, { note }),
  cancelTransfer: (id, reason) => http.post(`/stock-transfers/${id}/cancel`, { reason }),

  // batches & expiry
  batches: (p) => get('/batches', p),
  batch: (id) => get(`/batches/${id}`),
  updateBatch: (id, b) => http.patch(`/batches/${id}`, b),
  writeOffBatch: (id, b) => http.post(`/batches/${id}/write-off`, b),
  expirySummary: (p) => get('/batches/expiry-summary', p),
};
