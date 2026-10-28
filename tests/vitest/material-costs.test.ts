import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { snapshotCost } from '../../src/lib/sales/costs';
import { createServiceOrderSchema } from '../../src/lib/service-orders/validation';
const d = (n: string | number) => new Prisma.Decimal(n);
describe('material cost snapshots', () => {
  it('multiplies quantities with per-line cent rounding and counts extras once', () => {
    expect(snapshotCost([{ quantity: d('1.5'), unitCost: d('10.01') }, { quantity: d(2), unitCost: d(20) }], d('3.50'))?.toFixed(2)).toBe('58.52');
  });
  it('distinguishes unknown costs from explicitly free materials', () => {
    expect(snapshotCost([{ quantity: d(1), unitCost: null }])).toBeNull();
    expect(snapshotCost([], null)).toBeNull();
    expect(snapshotCost([{ quantity: d(1), unitCost: d(0) }], d(0))?.toFixed(2)).toBe('0.00');
    expect(snapshotCost([], d('12.34'))?.toFixed(2)).toBe('12.34');
  });
  it('validates extras and part cost independently from prices charged', () => {
    const base = { clientName: 'Cliente', clientPhone: '11999999999', deviceType: 'Notebook', deviceBrandModel: 'Modelo teste', reportedDefect: 'Não liga', aestheticCondition: 'Riscos', laborTotal: 100 };
    for (const bad of [-1, 1.234, Infinity, 100000000]) {
      expect(createServiceOrderSchema.safeParse({ ...base, additionalMaterialCost: bad }).success).toBe(false);
      expect(createServiceOrderSchema.safeParse({ ...base, parts: [{ productId: 'c1234567890123456789012345', quantity: 1, unitCost: bad }] }).success).toBe(false);
    }
    expect(createServiceOrderSchema.safeParse({ ...base, additionalMaterialCost: 0 }).success).toBe(true);
    expect(createServiceOrderSchema.safeParse({ ...base, additionalMaterialCost: null }).success).toBe(true);
  });
});
