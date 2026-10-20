import { auth } from '@/auth';

export async function customerAccess(management = false) {
  const session = await auth();
  if (!session?.user?.tenantId) return { ok: false as const, status: 401, error: 'Entre na sua conta para acessar os clientes.' };
  if (management && !['owner', 'admin'].includes(session.user.role)) return { ok: false as const, status: 403, error: 'Somente responsáveis e administradores podem alterar clientes.' };
  return { ok: true as const, tenantId: session.user.tenantId };
}

export const customerSelect = {
  id: true, name: true, document: true, email: true, phone: true,
  zipCode: true, street: true, number: true, neighborhood: true, city: true, state: true, isActive: true,
} as const;
