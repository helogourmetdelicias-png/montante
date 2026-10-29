import { auth } from '@/auth';
import { getClosingIssues } from '@/lib/cash-register/pending';
import { businessDayRange, isCurrentBusinessDay } from '@/lib/cash-register/business-day';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { getCashRegisterSummary, expectedDrawerAmount } from '@/lib/cash-register/summary';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const openSchema = z.object({ initialAmount: z.number().finite().min(0).max(99999999.99) });
const closeSchema = z.object({ sessionId: z.string().cuid(), declaredAmount: z.number().finite().min(0).max(99999999.99) });

async function getIdentity() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  return tenantId && userId ? { tenantId, userId } : null;
}

/** Returns the signed-in operator's open shift and a live drawer estimate. */
export async function GET(request: Request) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: 'Entre na sua conta para acessar o caixa.' }, { status: 401 });

  const selectedId = new URL(request.url).searchParams.get('sessionId');
  const previousSessions = await prisma.cashRegisterSession.findMany({
    where: { tenant_id: identity.tenantId, user_id: identity.userId, status: 'OPEN', opened_at: { lt: businessDayRange().gte } },
    select: { id: true, opened_at: true },
    orderBy: { opened_at: 'desc' },
  });
  const previousDays = previousSessions.map(item => ({ id: item.id, openedAt: item.opened_at }));
  const register = await prisma.cashRegisterSession.findFirst({
    where: { tenant_id: identity.tenantId, user_id: identity.userId, status: 'OPEN', ...(selectedId ? { id: selectedId } : { opened_at: businessDayRange() }) },
    include: { movements: { orderBy: { created_at: 'desc' }, take: 50 } },
  });
  if (!register) {
    const closedRegister = await prisma.cashRegisterSession.findFirst({
      where: { tenant_id: identity.tenantId, user_id: identity.userId, status: 'CLOSED' },
      orderBy: { closed_at: 'desc' },
      select: { declared_amount: true, expected_amount: true, difference_amount: true, closed_at: true },
    });
    return NextResponse.json({ session: null, previousDays, lastClosing: closedRegister ? {
      declaredAmount: closedRegister.declared_amount?.toFixed(2) ?? '0.00',
      expectedAmount: closedRegister.expected_amount?.toFixed(2) ?? '0.00',
      differenceAmount: closedRegister.difference_amount?.toFixed(2) ?? '0.00',
      closedAt: closedRegister.closed_at,
    } : null });
  }

  const totals = await getCashRegisterSummary(prisma, identity.tenantId, register.id);
  const pendingIssues = await getClosingIssues(prisma, identity.tenantId, register.id);
  const expected = expectedDrawerAmount(register.initial_amount, totals);
  return NextResponse.json({
    previousDays,
    session: {
      id: register.id,
      pendingIssues,
      status: register.status,
      initialAmount: register.initial_amount.toFixed(2),
      expectedAmount: expected.toFixed(2),
      openedAt: register.opened_at,
      needsClosing: !isCurrentBusinessDay(register.opened_at),
      movements: register.movements.map((movement) => ({
        id: movement.id,
        type: movement.type.toLowerCase(),
        amount: movement.amount.toFixed(2),
        description: movement.description,
        createdAt: movement.created_at,
      })),
      totals: {
        cashSales: totals.cashSales.toFixed(2),
        cashCreditReceipts: totals.cashCreditReceipts.toFixed(2),
        supplies: totals.supplies.toFixed(2),
        withdrawals: totals.withdrawals.toFixed(2),
      },
    },
  });
}

/** Opens one cash drawer per operator and tenant. */
export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: 'Entre na sua conta para abrir o caixa.' }, { status: 401 });
  const parsed = openSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe um fundo de troco válido.' }, { status: 400 });

  try {
    const register = await runSerializableTransaction(async (tx) => {
      const openRegister = await tx.cashRegisterSession.findFirst({
        where: { tenant_id: identity.tenantId, user_id: identity.userId, status: 'OPEN', opened_at: businessDayRange() },
        select: { id: true, opened_at: true },
      });
      if (openRegister) return { existing: true, id: openRegister.id };
      const created = await tx.cashRegisterSession.create({
        data: {
          tenant_id: identity.tenantId,
          user_id: identity.userId,
          initial_amount: new Prisma.Decimal(parsed.data.initialAmount),
        },
        select: { id: true },
      });
      return { existing: false, id: created.id };
    });
    if (register.existing) return NextResponse.json({ error: 'O caixa de hoje já foi iniciado. Use um suprimento para adicionar dinheiro à gaveta.' }, { status: 409 });
    return NextResponse.json({ sessionId: register.id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'Já existe um caixa aberto para este operador.' }, { status: 409 });
    console.error('cash_register.open_failed', error);
    return NextResponse.json({ error: 'Não foi possível abrir o caixa.' }, { status: 500 });
  }
}

/** Closes the operator's shift and persists the expected-versus-declared difference. */
export async function PATCH(request: Request) {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: 'Entre na sua conta para fechar o caixa.' }, { status: 401 });
  const parsed = closeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe o valor contado no caixa.' }, { status: 400 });

  const result = await runSerializableTransaction(async (tx) => {
    const register = await tx.cashRegisterSession.findFirst({
      where: { id: parsed.data.sessionId, tenant_id: identity.tenantId, user_id: identity.userId, status: 'OPEN' },
    });
    if (!register) return null;
    const issues = await getClosingIssues(tx, identity.tenantId, register.id);
    if (issues.some(issue => issue.pendingSale)) return { blocked: 'pending_sales' as const };
    if (issues.length > 0) return { blocked: 'pending_attempts' as const };
    const totals = await getCashRegisterSummary(tx, identity.tenantId, register.id);
    const expected = expectedDrawerAmount(register.initial_amount, totals);
    const declared = new Prisma.Decimal(parsed.data.declaredAmount);
    const difference = declared.sub(expected).toDecimalPlaces(2);
    const closed = await tx.cashRegisterSession.updateMany({
      where: { id: register.id, tenant_id: identity.tenantId, user_id: identity.userId, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        declared_amount: declared,
        expected_amount: expected,
        difference_amount: difference,
        closed_at: new Date(),
      },
    });
    if (closed.count !== 1) return null;
    return { blocked: null, expectedAmount: expected.toFixed(2), declaredAmount: declared.toFixed(2), differenceAmount: difference.toFixed(2) };
  });

  if (result?.blocked === 'pending_sales') return NextResponse.json({ error: 'Finalize ou cancele as vendas pendentes antes de fechar o caixa.' }, { status: 409 });
  if (result?.blocked === 'pending_attempts') return NextResponse.json({ error: 'Aguarde ou cancele as cobranças pendentes antes de fechar o caixa.' }, { status: 409 });
  if (!result) return NextResponse.json({ error: 'Caixa aberto não encontrado para este operador.' }, { status: 404 });
  return NextResponse.json({ session: { status: 'closed', ...result } });
}
