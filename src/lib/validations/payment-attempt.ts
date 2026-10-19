import { z } from 'zod';

export const createPaymentAttemptSchema = z.object({
  idempotencyKey: z.string().uuid(),
  provider: z.enum(['mercadopago', 'pix_manual', 'external_terminal']),
  method: z.enum(['pix', 'credit_card', 'debit_card']),
  channel: z.enum(['online', 'terminal', 'external_terminal']),
  terminalId: z.string().cuid().optional(),
  customerEmail: z.string().email().optional(),
}).superRefine((value, context) => {
  if (value.provider === 'mercadopago' && !value.customerEmail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customerEmail'], message: 'Informe o e-mail do comprador para cobrar com Mercado Pago.' });
  }
  if (value.provider === 'external_terminal' && (!value.terminalId || value.channel !== 'external_terminal')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['terminalId'], message: 'Selecione uma maquininha externa ativa.' });
  }
  if (value.provider !== 'external_terminal' && value.terminalId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['terminalId'], message: 'A maquininha não se aplica a este provedor.' });
  }
});

export type CreatePaymentAttemptInput = z.infer<typeof createPaymentAttemptSchema>;
