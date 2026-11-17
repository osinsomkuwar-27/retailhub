const calc = require('../utils/intelligence/calculations');

describe('stock-out prediction', () => {
  test('days until stockout = available / avg daily sales', () => {
    expect(calc.daysUntilStockout(120, 8)).toBe(15);
    expect(calc.daysUntilStockout(50, 0)).toBeNull();
  });
  test('risk classification', () => {
    expect(calc.classifyRisk({ available: 0, avgDaily: 3, leadTimeDays: 7 })).toBe('OUT_OF_STOCK');
    expect(calc.classifyRisk({ available: 20, avgDaily: 5, leadTimeDays: 7 })).toBe('CRITICAL');
    expect(calc.classifyRisk({ available: 60, avgDaily: 5, leadTimeDays: 7 })).toBe('WARNING');
    expect(calc.classifyRisk({ available: 500, avgDaily: 5, leadTimeDays: 7 })).toBe('HEALTHY');
    expect(calc.classifyRisk({ available: 30, avgDaily: 0, leadTimeDays: 7 })).toBe('NO_DEMAND');
  });
});

describe('reorder', () => {
  const base = { avgDaily: 10, leadTimeDays: 7, safetyStock: 20, reviewPeriodDays: 14, minOrderQty: 12 };
  test('reorders when position <= reorder point and rounds to min order qty', () => {
    const r = calc.computeReorder({ ...base, available: 50, onOrder: 0 });
    expect(r.reorderPoint).toBe(90); expect(r.targetStock).toBe(230);
    expect(r.needsReorder).toBe(true); expect(r.recommendedQty).toBe(180); // 180 already a multiple of 12
  });
  test('stock on order is counted', () => {
    expect(calc.computeReorder({ ...base, available: 50, onOrder: 200 }).needsReorder).toBe(false);
  });
});

describe('anomaly rules', () => {
  test('reduction units', () => {
    expect(calc.reductionUnits({ type: 'STOCK_OUT', quantity: 50 })).toBe(50);
    expect(calc.reductionUnits({ type: 'ADJUSTMENT', quantity: -12 })).toBe(12);
    expect(calc.reductionUnits({ type: 'STOCK_IN', quantity: 40 })).toBe(0);
  });
  test('approval by reference', () => {
    expect(calc.isApproved({ reference: { type: 'SALE' } })).toBe(true);
    expect(calc.isApproved({ reference: null })).toBe(false);
  });
});

describe('expiry', () => {
  test('status thresholds', () => {
    expect(calc.expiryStatus(-1)).toBe('EXPIRED'); expect(calc.expiryStatus(5)).toBe('CRITICAL');
    expect(calc.expiryStatus(20)).toBe('WARNING'); expect(calc.expiryStatus(60)).toBeNull();
  });
});

describe('transfers & supplier score', () => {
  test('moves surplus from slow warehouse to fast-selling one', () => {
    const out = calc.matchTransfers(
      [{ warehouse: 'A', quantity: 400, avgDaily: 1 }, { warehouse: 'B', quantity: 10, avgDaily: 5 }],
      { leadTimeDays: 7, safetyStock: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fromWarehouse: 'A', toWarehouse: 'B' });
    expect(out[0].quantity).toBeGreaterThan(0);
  });
  test('weighted supplier score', () => { expect(calc.scoreSupplier({ onTimeRate: 1, fillRate: 0.5 })).toBe(80); });
});