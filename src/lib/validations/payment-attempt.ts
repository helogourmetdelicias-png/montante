import { z } from 'zod';

export const createPaymentAttemptSchema = z.object({
  idempotencyKey: z.string().uuid(),
  provider: z.enum(['mercadopago', 'pagarme', 'pagbank', 'pix_manual', 'external_terminal']),
  method: z.enum(['pix', 'credit_card', 'debit_card']),
  channel: z.enum(['online', 'terminal', 'external_terminal']),
  terminalId: z.string().cuid().optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().trim().min(2).max(120).optional(),
  customerDocument: z.string().trim().max(20).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  customerAddress: z.object({
    zipCode: z.string().trim().max(12),
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(20),
    neighborhood: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().length(2),
  }).optional(),
}).superRefine((value, context) => {
  if (value.provider === 'mercadopago' && !value.customerEmail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customerEmail'], message: 'Informe o e-mail do comprador para cobrar com Mercado Pago.' });
  }
  if (value.provider === 'pagarme') {
    const documentLength = value.customerDocument?.replace(/\D/g, '').length;
    const phoneLength = value.customerPhone?.replace(/\D/g, '').length;
    if (!value.customerName?.trim() || !value.customerEmail || ![11, 14].includes(documentLength ?? 0) || ![10, 11].includes(phoneLength ?? 0)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['customerName'], message: 'Para cobrar com Pix Pagar.me, informe nome, e-mail, CPF/CNPJ válido e celular com DDD.' });
    }
  }
  if (value.provider === 'pagbank' && (!value.customerName?.trim() || !value.customerEmail || ![11, 14].includes(value.customerDocument?.replace(/\D/g, '').length ?? 0))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customerName'], message: 'Para Pix PagBank, informe nome, e-mail e CPF/CNPJ do comprador.' });
  }
  if (value.provider === 'external_terminal' && (!value.terminalId || value.channel !== 'external_terminal')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['terminalId'], message: 'Selecione uma maquininha externa ativa.' });
  }
  if (value.provider !== 'external_terminal' && value.terminalId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['terminalId'], message: 'A maquininha não se aplica a este provedor.' });
  }
});

export type CreatePaymentAttemptInput = z.infer<typeof createPaymentAttemptSchema>;
