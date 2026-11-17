const router = require('express').Router();
const { protect, authorize } = require('../utils/intelligence/shared');
const v = require('../validators/intelligence.validator');
const c = require('../controllers/intelligence/intelligence.controller');

const READ = authorize('ADMIN', 'WAREHOUSE_MANAGER');
const ADMIN = authorize('ADMIN');
router.use(protect);

router.get('/dashboard', READ, c.dashboard);

router.get('/predictions', READ, c.predictions);
router.get('/predictions/:productId', READ, v.objectIdParams('productId'), c.predictionDetail);
router.get('/demand-trend/:productId', READ, v.objectIdParams('productId'), c.demandTrend);
router.get('/slow-moving', READ, c.slowMoving);

router.get('/reorder-recommendations', READ, c.reorderRecommendations);
router.post('/reorder-recommendations/create-order', READ, v.supplierOrder, v.lineItems('items', 'quantity'), c.createOrderFromRecommendations);
router.get('/reorder-rules', READ, c.reorderRules);
router.put('/reorder-rules/:productId', ADMIN, v.objectIdParams('productId'), v.reorderRule, c.upsertRule);

router.get('/alerts', READ, c.alerts);
router.get('/alerts/summary', READ, c.alertSummary);
router.patch('/alerts/:id/acknowledge', READ, v.objectIdParams('id'), c.ackAlert);
router.patch('/alerts/:id/resolve', READ, v.objectIdParams('id'), c.resolveAlert);

router.get('/anomalies', READ, c.anomalies);
router.get('/anomalies/summary', READ, c.anomalySummary);
router.patch('/anomalies/:id/review', ADMIN, v.objectIdParams('id'), v.anomalyReview, c.reviewAnomaly);

router.get('/transfer-suggestions', READ, c.transferSuggestions);

router.get('/expiry', READ, c.expiry);
router.get('/expiry/summary', READ, c.expirySummary);
router.patch('/expiry/:id/acknowledge', READ, v.objectIdParams('id'), c.ackExpiry);

router.get('/suppliers', READ, c.suppliers);
router.post('/suppliers', ADMIN, v.supplier, c.createSupplier);
router.put('/suppliers/:id', ADMIN, v.objectIdParams('id'), v.supplierUpdate, c.updateSupplier);
router.get('/suppliers/performance', READ, c.supplierPerformance);
router.get('/supplier-orders', READ, c.supplierOrders);
router.post('/supplier-orders', READ, v.supplierOrder, v.lineItems('items', 'quantity'), c.createSupplierOrder);
router.patch('/supplier-orders/:id/receive', READ, v.objectIdParams('id'), c.receiveSupplierOrder);
router.patch('/supplier-orders/:id/cancel', ADMIN, v.objectIdParams('id'), c.cancelSupplierOrder);

router.get('/jobs', ADMIN, c.jobStatus);
router.post('/jobs/:name/run', ADMIN, c.runJob);

module.exports = router;