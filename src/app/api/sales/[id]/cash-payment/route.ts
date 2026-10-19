import { auth } from '@/auth';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { prisma } from '@/lib/prisma';
import { completeCashPayment } from '@/lib/sales/cash-payment';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cashPaymentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  amountReceived: z.number().finite().positive().max(99999999.99),
  amountApplied: z.number().finite().positive().max(99999999.99),
}).refine(({ amountReceived }) => Math.abs(amountReceived * 100 - Math.round(amountReceived * 100)) < 0.00001, {
  message: 'Informe o valor recebido com até duas casas decimais.',
  path: ['amountReceived'],
}).refine(({ amountApplied }) => Math.abs(amountApplied * 100 - Math.round(amountApplied * 100)) < 0.00001, {
  message: 'Informe a parcela em dinheiro com até duas casas decimais.',
  path: ['amountApplied'],
});

/** Records a cash contribution; an outstanding balance stays pending for Pix confirmation. */
export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) return NextResponse.json({ error: 'Entre na sua conta para concluir a venda.' }, { status: 401 });

  const parsed = cashPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira o valor recebido em dinheiro.' }, { status: 400 });
  const receivedCents = Math.round(parsed.data.amountReceived * 100);

  const saleRegister = await prisma.sale.findFirst({
    where: { id: context.params.id, tenant_id: tenantId },
    select: { cash_register_session_id: true },
  });
  const openRegister = saleRegister?.cash_register_session_id ? await prisma.cashRegisterSession.findFirst({
    where: { id: saleRegister.cash_register_session_id, tenant_id: tenantId, user_id: userId, status: 'OPEN' },
    select: { id: true },
  }) : null;
  if (!openRegister) return NextResponse.json({ error: 'O caixa desta venda foi fechado. Abra um novo turno antes de receber dinheiro.' }, { status: 409 });

  try {
    const result = await runSerializableTransaction((tx) => completeCashPayment(tx, {
      tenantId,
      saleId: context.params.id,
      idempotencyKey: parsed.data.idempotencyKey,
      receivedCents,
      appliedCents: Math.round(parsed.data.amountApplied * 100),
    }));

    if (result.state === 'not_found') return NextResponse.json({ error: 'Venda não encontrada nesta loja.' }, { status: 404 });
    if (result.state === 'insufficient') return NextResponse.json({ error: 'O valor recebido não pode ser menor que a parcela em dinheiro.' }, { status: 400 });
    if (result.state === 'not_pending') return NextResponse.json({ error: 'A venda expirou ou já foi processada.' }, { status: 409 });
    if (result.state === 'payment_pending') return NextResponse.json({ error: 'Aguarde a cobrança Pix atual antes de registrar outro valor em dinheiro.' }, { status: 409 });
    if (result.state === 'invalid_contribution') return NextResponse.json({ error: 'A parcela em dinheiro deve ser menor ou igual ao saldo restante.' }, { status: 400 });
    if (result.state === 'idempotency_conflict') return NextResponse.json({ error: 'Esta chave de pagamento já foi usada com outros valores.' }, { status: 409 });

    return NextResponse.json({
      status: result.saleCompleted ? 'approved' : 'partially_paid',
      replayed: result.replayed,
      cashAmount: 'cashAmount' in result ? result.cashAmount : undefined,
      amountReceived: result.amountReceived,
      changeAmount: result.changeAmount,
      remainingAmount: result.remainingAmount,
    });
  } catch (error) {
    console.error('Falha ao concluir venda em dinheiro:', error);
    return NextResponse.json({ error: 'Não foi possível concluir a venda em dinheiro.' }, { status: 500 });
  }
}
