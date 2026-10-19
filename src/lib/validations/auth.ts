import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  tenantSlug: z.string().min(1, 'Slug da loja é obrigatório'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string(),
  tenantName: z.string().min(2, 'Nome da loja obrigatório'),
  tenantSlug: z
    .string()
    .min(3, 'URL mínima de 3 caracteres')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens'),
  cnpj: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
