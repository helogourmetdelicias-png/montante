import { z } from 'zod';

const saleQuantity = z.number()
  .finite()
  .gt(0)
  .max(9_999_999.999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, 'Use no máximo três casas decimais.');

export const createSaleSchema = z.object({
  idempotencyKey: z.string().uuid(),
  customerId: z.string().cuid().optional(),
  mode: z.enum(['advanced', 'quick']).default('advanced'),
  quickAmount: z.number().finite().positive().max(99_999_999.99)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use no máximo duas casas decimais.')
    .optional(),
  discountAmount: z.number().finite().min(0).max(99_999_999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use no máximo duas casas decimais.')
    .default(0),
  items: z.array(z.object({
    productId: z.string().min(1).max(64),
    quantity: saleQuantity,
  })).max(100).default([]),
}).superRefine((input, ctx) => {
  if (input.mode === 'quick') {
    if (input.quickAmount === undefined) ctx.addIssue({ code: 'custom', path: ['quickAmount'], message: 'Informe o valor da venda rápida.' });
    if (input.items.length || input.customerId || input.discountAmount !== 0) ctx.addIssue({ code: 'custom', message: 'Venda rápida deve conter somente o valor, sem produtos, cliente ou desconto.' });
  } else if (!input.items.length || input.quickAmount !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'Adicione produtos à venda avançada.' });
  }
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
