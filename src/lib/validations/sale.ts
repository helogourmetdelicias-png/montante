import { z } from 'zod';

const saleQuantity = z.number()
  .finite()
  .gt(0)
  .max(9_999_999.999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, 'Use no máximo três casas decimais.');

export const createSaleSchema = z.object({
  idempotencyKey: z.string().uuid(),
  discountAmount: z.number().finite().min(0).max(99_999_999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use no máximo duas casas decimais.')
    .default(0),
  items: z.array(z.object({
    productId: z.string().min(1).max(64),
    quantity: saleQuantity,
  })).min(1).max(100),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
