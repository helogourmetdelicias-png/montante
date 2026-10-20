import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value || null);
export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos dois caracteres.').max(120),
  document: text(20).transform(value => value === null ? null : value.replace(/\D/g, '')).refine(value => value === null || [11, 14].includes(value.length), 'CPF/CNPJ deve ter 11 ou 14 dígitos.'),
  email: text(160).refine(value => value === null || z.string().email().safeParse(value).success, 'E-mail inválido.'),
  phone: text(30).transform(value => {
    let digits = value === null ? null : value.replace(/\D/g, '');
    if (digits && [12, 13].includes(digits.length) && digits.startsWith('55')) digits = digits.slice(2);
    return digits;
  }).refine(value => value === null || [10, 11].includes(value.length), 'Informe telefone com DDD.'),
  zipCode: text(12).transform(value => value === null ? null : value.replace(/\D/g, '')).refine(value => value === null || value.length === 8, 'CEP deve ter oito dígitos.'),
  street: text(120), number: text(20), neighborhood: text(100), city: text(100),
  state: text(2).transform(value => value?.toUpperCase() || null).refine(value => value === null || /^[A-Z]{2}$/.test(value), 'Informe a UF com duas letras.'),
  isActive: z.boolean().default(true),
});
export const updateCustomerSchema = createCustomerSchema.partial().refine(value => Object.keys(value).length > 0, 'Informe pelo menos um campo.');
