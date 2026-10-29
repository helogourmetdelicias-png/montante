import { Prisma, type PaymentMethod } from '@prisma/client';
import { ensureDailyCashRegister } from './cash-register/daily-session';
import { runSerializableTransaction } from './database/transactions';

export class CreditError extends Error {}

async function openDrawer(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
  return ensureDailyCashRegister(tx, tenantId, userId);
}

export async function completeCreditSale(tenantId: string, userId: string, saleId: string, customerId: string) {
  return runSerializableTransaction(async tx => {
    const existing = await tx.creditSale.findFirst({ where: { tenant_id: tenantId, sale_id: saleId } });
    if (existing) {
      if (existing.customer_id !== customerId) throw new CreditError('Esta venda já foi registrada para outro cliente.');
      return existing;
    }
    await openDrawer(tx, tenantId, userId);
    const sale = await tx.sale.findFirst({ where: { id: saleId, tenant_id: tenantId }, include: { payment_attempts: true, cash_register_session: { select: { user_id: true, status: true } } } });
    if (sale?.service_order_id) throw new CreditError('Receba a O.S. pelo caixa. A entrega exige pagamento integral.');
    if (!sale || sale.status !== 'pending' || sale.cash_register_session?.user_id !== userId || sale.cash_register_session.status !== 'OPEN' || !sale.expires_at || sale.expires_at <= new Date()) throw new CreditError('Venda indisponível, expirada ou pertencente a outro caixa.');
    if (sale.payment_attempts.length) throw new CreditError('Esta venda já possui tentativa de pagamento. Concilie/cancele a venda antes de registrar uma nova compra em Fiado.');
    const customer = await tx.customer.findFirst({ where: { id: customerId, tenant_id: tenantId, isActive: true } });
    if (!customer || (sale.customer_id && sale.customer_id !== customerId)) throw new CreditError('Selecione um cliente ativo desta loja para o fiado.');
    if (!sale.total_amount.greaterThan(0)) throw new CreditError('O valor do fiado precisa ser maior que zero.');
    await tx.sale.update({ where: { id: sale.id }, data: { status: 'completed', payment_method: 'fiado', customer_id: customer.id, sold_at: new Date(), expires_at: null } });
    return tx.creditSale.create({ data: { tenant_id: tenantId, sale_id: sale.id, customer_id: customer.id, amount: sale.total_amount } });
  });
}

export async function receiveCreditPayment(tenantId: string, userId: string, creditId: string, input: { amount: number; method: PaymentMethod; idempotencyKey: string }) {
  return runSerializableTransaction(async tx => {
    const previous = await tx.creditPayment.findUnique({ where: { tenant_id_idempotency_key: { tenant_id: tenantId, idempotency_key: input.idempotencyKey } } });
    if (previous) {
      if (previous.credit_sale_id !== creditId || previous.method !== input.method || !previous.amount.equals(input.amount)) throw new CreditError('Esta confirmação já foi usada para outro recebimento.');
      return previous;
    }
    const drawer = await openDrawer(tx, tenantId, userId);
    const credit = await tx.creditSale.findFirst({ where: { id: creditId, tenant_id: tenantId } });
    if (!credit) throw new CreditError('Fiado não encontrado nesta loja.');
    const paid = await tx.creditPayment.aggregate({ where: { tenant_id: tenantId, credit_sale_id: creditId }, _sum: { amount: true } });
    const balance = credit.amount.sub(paid._sum.amount ?? 0);
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.greaterThan(0) || amount.greaterThan(balance)) throw new CreditError('O pagamento precisa ser positivo e não pode ultrapassar o saldo do fiado.');
    return tx.creditPayment.create({ data: { tenant_id: tenantId, credit_sale_id: creditId, user_id: userId, session_id: drawer.id, amount, method: input.method, idempotency_key: input.idempotencyKey } });
  });
}
