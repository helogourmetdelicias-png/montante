import { z } from 'zod';

const cents = z.number().int().min(0).max(9_999_999_999);
export const offlineSaleSchema = z.object({
  id: z.string().uuid(), tenantId: z.string().min(1).max(100), userId: z.string().min(1).max(100),
  preparedAt: z.string().datetime(), ticket: z.string().regex(/^[a-f0-9]{64}$/),
  occurredAt: z.string().datetime(), mode: z.enum(['quick', 'advanced']),
  quickCents: cents, discountCents: cents, receivedCents: cents,
  notes: z.string().max(1000).default(''),
  items: z.array(z.object({
    productId: z.string().min(1).max(100), quantityMilli: z.number().int().min(1).max(9_999_999_999),
    price: z.string().regex(/^\d{1,8}\.\d{2}$/), sellByFraction: z.boolean(), signature: z.string().regex(/^[a-f0-9]{64}$/),
  })).max(200),
}).superRefine((sale, ctx) => {
  if ((sale.mode === 'quick' && (!sale.quickCents || sale.items.length || sale.discountCents)) ||
      (sale.mode === 'advanced' && (!sale.items.length || sale.quickCents)) ||
      new Set(sale.items.map(item => item.productId)).size !== sale.items.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Itens ou valor inválidos.' });
  }
  if (sale.items.some(item => !item.sellByFraction && item.quantityMilli % 1000 !== 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Produto exige quantidade inteira.' });
  }
});
export type OfflineSale = z.infer<typeof offlineSaleSchema>;

/** Same half-up rounding for fractional lines in the browser and on the server. */
export function offlineLineCents(price: string, quantityMilli: number) {
  const priceCents = BigInt(price.replace('.', ''));
  return Number((priceCents * BigInt(quantityMilli) + BigInt(500)) / BigInt(1000));
}
