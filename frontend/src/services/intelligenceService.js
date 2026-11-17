import api from './api';

const get = (url, params) => api.get(`/intelligence${url}`, { params }).then((r) => r.data);
const post = (url, body) => api.post(`/intelligence${url}`, body).then((r) => r.data);
const put = (url, body) => api.put(`/intelligence${url}`, body).then((r) => r.data);
const patch = (url, body) => api.patch(`/intelligence${url}`, body).then((r) => r.data);

export const intelligenceService = {
  dashboard: () => get('/dashboard'),
  predictions: (p) => get('/predictions', p),
  demandTrend: (productId, days = 60) => get(`/demand-trend/${productId}`, { days }),
  slowMoving: (p) => get('/slow-moving', p),
  recommendations: (p) => get('/reorder-recommendations', p),
  upsertRule: (productId, body) => put(`/reorder-rules/${productId}`, body),
  createOrder: (body) => post('/reorder-recommendations/create-order', body),
  alerts: (p) => get('/alerts', p),
  ackAlert: (id) => patch(`/alerts/${id}/acknowledge`),
  resolveAlert: (id) => patch(`/alerts/${id}/resolve`),
  anomalies: (p) => get('/anomalies', p),
  anomalySummary: () => get('/anomalies/summary'),
  reviewAnomaly: (id, body) => patch(`/anomalies/${id}/review`, body),
  transfers: (p) => get('/transfer-suggestions', p),
  expiry: (p) => get('/expiry', p),
  expirySummary: () => get('/expiry/summary'),
  ackExpiry: (id) => patch(`/expiry/${id}/acknowledge`),
  suppliers: (p) => get('/suppliers', p),
  createSupplier: (b) => post('/suppliers', b),
  supplierPerformance: (p) => get('/suppliers/performance', p),
  supplierOrders: (p) => get('/supplier-orders', p),
  receiveOrder: (id, receipts) => patch(`/supplier-orders/${id}/receive`, { receipts }),
  cancelOrder: (id) => patch(`/supplier-orders/${id}/cancel`),
  runJob: (name) => post(`/jobs/${name}/run`),
};
export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';