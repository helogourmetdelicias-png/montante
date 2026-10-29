import { describe, expect, it } from 'vitest';
import { businessDateKey } from '../../src/lib/cash-register/business-day';
import { productInventoryAlerts, summarizeInventory, matchesInventoryFilter, type InventoryProduct } from '../../src/lib/inventory-alerts';

const product: InventoryProduct = { id: 'one', name: 'Produto', sku: null, category: null, unitOfMeasure: 'un', stockQuantity: '2.000', stockMinAlert: '5.000', attributes: {}, isActive: true };
const classify = (expiryDate: string | null, changes: Partial<InventoryProduct> = {}) => productInventoryAlerts({ ...product, ...changes, attributes: { expiryDate } }, '2026-10-29');
describe('inventory alerts', () => {
  it('uses a strictly lower minimum, preserves fractions and never counts zero as low', () => {
    expect(classify(null).flags).toEqual(['low']);
    expect(classify(null, { stockQuantity: '5' }).flags).toEqual([]);
    expect(classify(null, { stockQuantity: '0' }).flags).toEqual(['out']);
    expect(classify(null, { stockQuantity: '0.125', stockMinAlert: '0.250' }).flags).toEqual(['low']);
    expect(classify(null, { stockMinAlert: null }).flags).toEqual([]);
  });
  it('treats today as valid until midnight and respects 7 and 30 day boundaries', () => {
    for (const [date, flag, days] of [['2026-10-28', 'expired', -1], ['2026-10-29', 'urgent', 0], ['2026-11-05', 'urgent', 7], ['2026-11-06', 'expiring', 8], ['2026-11-28', 'expiring', 30]] as const) {
      const alert = classify(date, { stockMinAlert: null });
      expect(alert.flags).toEqual([flag]); expect(alert.daysUntilExpiry).toBe(days);
    }
    expect(classify('2026-11-29', { stockMinAlert: null }).flags).toEqual([]);
    expect(businessDateKey(new Date('2026-10-29T02:59:59Z'))).toBe('2026-10-28');
    expect(businessDateKey(new Date('2026-10-29T03:00:00Z'))).toBe('2026-10-29');
  });
  it('ignores expiry for empty or inactive products and rejects impossible dates', () => {
    expect(classify('2026-10-01', { stockQuantity: '0' }).flags).toEqual(['out']);
    expect(classify('2026-10-01', { isActive: false }).flags).toEqual([]);
    for (const date of ['2026-02-30', 'invalid', '2026-1-01']) expect(classify(date).flags).toEqual(['low']);
  });
  it('counts products once overall while allowing multiple independent warnings', () => {
    const item = { ...product, ...classify('2026-11-01') };
    const summary = summarizeInventory([item]);
    expect(summary).toEqual({ all: 1, low: 1, out: 0, urgent: 1, expiring: 1, expired: 0 });
    expect(matchesInventoryFilter(item, 'expiring')).toBe(true);
    expect(matchesInventoryFilter(item, 'expired')).toBe(false);
  });
});
