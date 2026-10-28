import { RequestError } from '@/lib/security/request';
export const ADMIN_PLANS = ['automatic', 'free', 'standard', 'advanced'] as const;
export function managedPlan(override: string | null | undefined, sales: number) {
  if (override === 'free') return { label: 'Gratuito', amount: '0.00' };
  if (override === 'standard') return { label: 'Padrão', amount: '49.90' };
  if (override === 'advanced') return { label: 'Avançado', amount: '79.00' };
  return sales > 500 ? { label: 'Avançado', amount: '79.00' } : { label: 'Padrão', amount: '49.90' };
}
export function assertDeletableStore(actorTenant: string, target: { id: string; slug: string; admins: number }, confirmation: string) {
  if (target.id === actorTenant || target.admins > 0) throw new RequestError('A loja da administração geral não pode ser excluída.', 409);
  if (confirmation !== target.slug) throw new RequestError('Digite exatamente o identificador da loja para confirmar a exclusão.');
}
