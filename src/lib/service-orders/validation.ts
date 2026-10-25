import { z } from 'zod';

export const SERVICE_STATUSES = ['PENDING_APPROVAL', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'] as const;
export const SERVICE_STATUS_LABELS: Record<typeof SERVICE_STATUSES[number], string> = {
  PENDING_APPROVAL: 'Aguardando orçamento / aprovação', IN_PROGRESS: 'Em andamento', READY: 'Pronto para entrega', COMPLETED: 'Entregue / pago', CANCELLED: 'Cancelada',
};
const money = z.number().finite().min(0).max(99999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, 'Use duas casas decimais.');
const fields = {
  clientName: z.string().trim().min(2).max(120),
  clientPhone: z.string().trim().min(8).max(30).regex(/^[+\d\s().-]+$/),
  deviceType: z.string().trim().min(2).max(80),
  deviceBrandModel: z.string().trim().min(2).max(160),
  serialNumberImei: z.string().trim().max(100).default(''),
  reportedDefect: z.string().trim().min(3).max(5000),
  aestheticCondition: z.string().trim().min(2).max(3000),
  devicePassword: z.string().max(200).optional(),
  removePassword: z.boolean().optional(),
  laborTotal: money,
  photoUrls: z.array(z.string().trim().url().max(2000).refine(url => new URL(url).protocol === 'https:', 'Use URLs HTTPS.')).max(10).default([]),
  parts: z.array(z.object({
    productId: z.string().cuid(),
    quantity: z.number().finite().positive().max(9999999.999).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001),
    unitPrice: money.optional(),
  }).strict()).max(100).default([]),
};
export const createServiceOrderSchema = z.object(fields).strict();
export const updateServiceOrderSchema = z.object({ ...fields, version: z.number().int().positive(), status: z.enum(['PENDING_APPROVAL', 'IN_PROGRESS', 'READY', 'CANCELLED']) }).strict();
export type ServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

export function canTransitionServiceOrder(from: string, to: string) {
  const transitions: Record<string, string[]> = {
    PENDING_APPROVAL: ['PENDING_APPROVAL', 'IN_PROGRESS', 'READY', 'CANCELLED'],
    IN_PROGRESS: ['IN_PROGRESS', 'PENDING_APPROVAL', 'READY', 'CANCELLED'],
    READY: ['READY', 'IN_PROGRESS', 'CANCELLED'],
  };
  return transitions[from]?.includes(to) ?? false;
}
