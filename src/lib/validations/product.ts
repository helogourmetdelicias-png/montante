import { z } from 'zod';

const money = z.number()
  .finite()
  .min(0)
  .max(99_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use no máximo duas casas decimais.');

const quantity = z.number()
  .finite()
  .min(0)
  .max(9_999_999.999)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, 'Use no máximo três casas decimais.');

const productFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(5000).nullable().optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  unitOfMeasure: z.string().trim().min(1).max(24),
  sellByFraction: z.boolean(),
  price: money,
  costPrice: money.nullable().optional(),
  stockQuantity: quantity.default(0),
  stockMinAlert: quantity.nullable().optional(),
  stockAisle: z.string().trim().max(80).nullable().optional(),
  stockShelf: z.string().trim().max(80).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  isActive: z.boolean().default(true),
};

export const createProductSchema = z.object(productFields)
  .refine((product) => product.sellByFraction || Number.isInteger(product.stockQuantity), {
    path: ['stockQuantity'],
    message: 'Produtos vendidos por unidade inteira precisam ter estoque inteiro.',
  });

export const updateProductSchema = z.object(productFields)
  .partial()
  .refine((values) => Object.keys(values).length > 0, 'Informe pelo menos um campo para atualizar.')
  .refine((values) => values.sellByFraction !== false || values.stockQuantity === undefined || Number.isInteger(values.stockQuantity), {
    path: ['stockQuantity'],
    message: 'Produtos vendidos por unidade inteira precisam ter estoque inteiro.',
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
