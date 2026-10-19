import { z } from 'zod';

export const tenantProfileSchema = z.object({
  name: z.string().min(2, 'Nome da loja obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  cnpj: z.string().optional(),
  address_street: z.string().optional(),
  address_number: z.string().optional(),
  address_complement: z.string().optional(),
  address_neighborhood: z.string().optional(),
  address_city: z.string().optional(),
  address_state: z.string().max(2).optional(),
  address_zip: z.string().optional(),
});

export const userProfileSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual obrigatória'),
    newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Senhas não coincidem',
    path: ['confirmNewPassword'],
  });

export type TenantProfileInput = z.infer<typeof tenantProfileSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
