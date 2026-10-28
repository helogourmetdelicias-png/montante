import { z } from 'zod';
import { PRODUCT_GENDERS, PRODUCT_PACKAGING } from '../product-attributes';
import { isMediaPath } from '../media/types';

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

const optionalText = z.string().trim().max(120).nullable().optional();
export const productAttributesSchema = z.object({
  volume: optionalText,
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data de validade inválida.').nullable().optional(),
  lot: optionalText,
  size: optionalText,
  color: optionalText,
  gender: z.enum(PRODUCT_GENDERS).nullable().optional(),
  packaging: z.enum(PRODUCT_PACKAGING).nullable().optional(),
  requiresContainer: z.boolean().optional(),
  containerValue: money.nullable().optional(),
}).strict();

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
  imageUrl: z.string().max(200).refine(isMediaPath).nullable().optional(),
  attributes: productAttributesSchema.optional(),
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
