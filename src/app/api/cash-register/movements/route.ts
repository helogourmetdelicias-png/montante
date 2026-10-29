import { auth } from '@/auth';
import { ensureDailyCashRegister } from '@/lib/cash-register/daily-session';
import { runSerializableTransaction } from '@/lib/database/transactions';
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

  try {
    const movement = await runSerializableTransaction(async (tx) => {
      const register = await ensureDailyCashRegister(tx, tenantId, userId);
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
    console.error('cash_register.movement_failed', error);
    return NextResponse.json({ error: 'Não foi possível registrar a movimentação.' }, { status: 500 });
  }
}
