import { auth } from '@/auth';
import { isCurrentBusinessDay } from '@/lib/cash-register/business-day';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const movementSchema = z.object({
  type: z.enum(['supply', 'withdrawal']),
  amount: z.number().finite().positive().max(99999999.99),
  description: z.string().trim().min(3).max(240),
});

/** Records an audited supply or withdrawal in the signed-in operator's open drawer. */
export async function POST(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) return NextResponse.json({ error: 'Entre na sua conta para registrar a movimentação.' }, { status: 401 });

  const parsed = movementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira o tipo, o valor e a descrição da movimentação.' }, { status: 400 });
  const register = await prisma.cashRegisterSession.findFirst({
    where: { tenant_id: tenantId, user_id: userId, status: 'OPEN' },
    select: { id: true },
  });
  if (!register) return NextResponse.json({ error: 'Abra um caixa antes de registrar movimentações.' }, { status: 409 });

  try {
    const movement = await runSerializableTransaction(async (tx) => {
      const stillOpen = await tx.cashRegisterSession.findFirst({
        where: { id: register.id, tenant_id: tenantId, user_id: userId, status: 'OPEN' },
        select: { id: true, opened_at: true },
      });
      if (!stillOpen) throw new Error('CASH_REGISTER_CLOSED');
      if (!isCurrentBusinessDay(stillOpen.opened_at)) throw new Error('CASH_REGISTER_PREVIOUS_DAY');
      return tx.cashRegisterMovement.create({
        data: {
          tenant_id: tenantId,
          session_id: register.id,
          user_id: userId,
          type: parsed.data.type === 'supply' ? 'SUPPLY' : 'WITHDRAWAL',
          amount: new Prisma.Decimal(parsed.data.amount),
          description: parsed.data.description,
        },
      });
    });
    return NextResponse.json({ movement: { id: movement.id, type: movement.type.toLowerCase(), amount: movement.amount.toFixed(2), description: movement.description, createdAt: movement.created_at } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'CASH_REGISTER_PREVIOUS_DAY') return NextResponse.json({ error: 'Feche o caixa do dia anterior e abra o caixa de hoje antes de registrar movimentações.' }, { status: 409 });
    if (error instanceof Error && error.message === 'CASH_REGISTER_CLOSED') return NextResponse.json({ error: 'O caixa já foi fechado.' }, { status: 409 });
    console.error('cash_register.movement_failed', error);
    return NextResponse.json({ error: 'Não foi possível registrar a movimentação.' }, { status: 500 });
  }
}
