import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { completeServiceOrder } from '../service-orders/complete.ts';

type Transaction = PrismaTypes.TransactionClient;

/** Returns the change in cents, or null when the received amount is invalid/insufficient. */
export function calculateCashChangeCents(totalCents: number, receivedCents: number) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 1) return null;
  if (!Number.isSafeInteger(receivedCents) || receivedCents < totalCents) return null;
  return receivedCents - totalCents;
}

type CompleteCashPaymentInput = {
  tenantId: string;
  saleId: string;
  idempotencyKey: string;
  receivedCents: number;
  appliedCents: number;
  cashSessionId?: string;
  now?: Date;
};

/** Records cash received and leaves any remaining Pix balance open for confirmation. */
export async function completeCashPayment(tx: Transaction, input: CompleteCashPaymentInput) {
  const existingAttempt = await tx.paymentAttempt.findFirst({
    where: {
      tenant_id: input.tenantId,
      provider: 'cash',
      idempotency_key: input.idempotencyKey,
    },
    select: {
      sale_id: true,
      status: true,
      amount: true,
      amount_received: true,
      change_amount: true,
    },
  });

  if (existingAttempt) {
    const sameRequest = existingAttempt.sale_id === input.saleId &&
      existingAttempt.amount_received?.toNumber() === input.receivedCents / 100 &&
      existingAttempt.amount.toNumber() === input.appliedCents / 100;
    if (!sameRequest) return { state: 'idempotency_conflict' as const };
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, tenant_id: input.tenantId },
      select: { status: true, total_amount: true },
    });
    if (!sale) return { state: 'not_found' as const };
    const approved = await tx.paymentAttempt.aggregate({
      where: { tenant_id: input.tenantId, sale_id: input.saleId, status: 'APPROVED' },
      _sum: { amount: true },
    });
    const remainingCents = Math.max(0, Number(sale.total_amount.mul(100).toDecimalPlaces(0).toString()) -
      Number((approved._sum.amount ?? new Prisma.Decimal(0)).mul(100).toDecimalPlaces(0).toString()));
    return {
      state: 'recorded' as const,
      replayed: true,
      cashAmount: existingAttempt.amount.toFixed(2),
      amountReceived: existingAttempt.amount_received!.toFixed(2),
      changeAmount: existingAttempt.change_amount?.toFixed(2) ?? '0.00',
      remainingAmount: (remainingCents / 100).toFixed(2),
      saleCompleted: sale.status === 'completed',
    };
  }

  const sale = await tx.sale.findFirst({
    where: { id: input.saleId, tenant_id: input.tenantId },
    select: {
      id: true,
      status: true,
      payment_method: true,
      total_amount: true,
      amount_received: true,
      change_amount: true,
      expires_at: true,
      service_order_id: true,
    },
  });
  if (!sale) return { state: 'not_found' as const };

  const totalCents = Number(sale.total_amount.mul(100).toDecimalPlaces(0).toString());
  const now = input.now ?? new Date();
  if (sale.status !== 'pending' || (sale.expires_at && sale.expires_at <= now)) {
    return { state: 'not_pending' as const };
  }

  const approved = await tx.paymentAttempt.aggregate({
    where: { tenant_id: input.tenantId, sale_id: input.saleId, status: 'APPROVED' },
    _sum: { amount: true },
  });
  const paidCents = Number((approved._sum.amount ?? new Prisma.Decimal(0)).mul(100).toDecimalPlaces(0).toString());
  const balanceCents = Math.max(0, totalCents - paidCents);
  const activeProviderPayment = await tx.paymentAttempt.findFirst({
    where: { tenant_id: input.tenantId, sale_id: input.saleId, status: { in: ['CREATED', 'PENDING'] } },
    select: { id: true },
  });
  if (activeProviderPayment) return { state: 'payment_pending' as const };
  const appliedCents = input.appliedCents;
  if (!Number.isSafeInteger(appliedCents) || appliedCents < 1 || appliedCents > balanceCents) {
    return { state: 'invalid_contribution' as const };
  }
  const changeCents = calculateCashChangeCents(appliedCents, input.receivedCents);
  if (changeCents === null) return { state: 'insufficient' as const };

  const amountReceived = new Prisma.Decimal(input.receivedCents).div(100);
  const amountApplied = new Prisma.Decimal(appliedCents).div(100);
  const changeAmount = new Prisma.Decimal(changeCents).div(100);
  const attempt = await tx.paymentAttempt.create({
    data: {
      tenant_id: input.tenantId,
      sale_id: sale.id,
      cash_session_id: input.cashSessionId,
      provider: 'cash',
      method: 'CASH',
      channel: 'IN_PERSON',
      status: 'APPROVED',
      amount: amountApplied,
      amount_received: amountReceived,
      change_amount: changeAmount,
      idempotency_key: input.idempotencyKey,
      confirmed_at: now,
    },
  });

  const remainingCents = balanceCents - appliedCents;
  const update = await tx.sale.updateMany({
    where: { id: sale.id, tenant_id: input.tenantId, status: 'pending', OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
    data: {
      amount_received: (sale.amount_received ?? new Prisma.Decimal(0)).add(amountReceived),
      change_amount: (sale.change_amount ?? new Prisma.Decimal(0)).add(changeAmount),
      ...(remainingCents === 0 ? { status: 'completed', payment_method: 'cash', expires_at: null, sold_at: now } : {}),
    },
  });
  if (update.count !== 1) throw new Error('A venda não pôde ser atualizada após registrar o dinheiro.');
  if (remainingCents === 0 && sale.service_order_id) await completeServiceOrder(tx, input.tenantId, sale.service_order_id, sale.id, now);

  return {
    state: 'recorded' as const,
    replayed: false,
    cashAmount: attempt.amount.toFixed(2),
    amountReceived: attempt.amount_received!.toFixed(2),
    changeAmount: changeAmount.toFixed(2),
    remainingAmount: (remainingCents / 100).toFixed(2),
    saleCompleted: remainingCents === 0,
  };
}
