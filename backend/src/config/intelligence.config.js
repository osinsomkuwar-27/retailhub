const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

module.exports = {
  // Model names registered by the other modules (adjust here if they differ)
  models: {
    Product: 'Product', Inventory: 'Inventory', Warehouse: 'Warehouse',
    StockBatch: 'StockBatch', InventoryLog: 'InventoryLog', Order: 'Order',
  },
  batchQtyField: 'quantity',

  prediction: {
    windowDays: num(process.env.INTEL_DEMAND_WINDOW_DAYS, 30),
    warningBufferDays: 7,            // WARNING if days <= leadTime + this
    slowMovingWindowDays: 90,
    slowMovingMaxDailySales: 0.1,
  },
  reorder: { defaultSafetyStock: 10, defaultLeadTimeDays: 7, defaultReviewPeriodDays: 14, defaultMinOrderQty: 1 },
  alerts: { defaultLowStockThreshold: 10, resolvedTtlDays: 90 },
  anomaly: {
    largeReductionUnits: num(process.env.INTEL_LARGE_REDUCTION_UNITS, 50),
    rapidWindowMinutes: 60, rapidReductionCount: 5, rapidReductionUnits: 80,
    cancellationCount: 3, cancellationWindowDays: 7,
    reductionTypes: ['STOCK_OUT', 'ADJUSTMENT'],
    approvedReferenceTypes: ['SALE', 'ORDER', 'TRANSFER', 'SUPPLIER_RETURN'],
    sweepLookbackMinutes: 120,
  },
  expiry: { warningDays: 30, criticalDays: 7 },
  transfer: { surplusCoverDays: 60, targetCoverDays: 30, minTransferQty: 5 },
  jobs: {
    enabled: process.env.INTEL_JOBS_ENABLED !== 'false',
    changeStreamsEnabled: process.env.INTEL_CHANGE_STREAMS !== 'false',
    timezone: process.env.TZ || 'Asia/Kolkata',
    schedules: {
      lowStockScan: '*/15 * * * *',
      anomalySweep: '5 * * * *',
      salesReconcile: '15 * * * *',
      expiryScan: '0 1 * * *',
      supplierOverdueScan: '30 1 * * *',
    },
  },
};