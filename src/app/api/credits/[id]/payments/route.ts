import { auth } from '@/auth';
import { receiveCreditPayment, CreditError } from '@/lib/credit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  idempotencyKey: z.string().uuid(),
  amount: z.number().finite().positive().max(99_999_999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001),
  method: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD']),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Confira valor e forma de recebimento.' }, { status: 400 });
  try {
    const payment = await receiveCreditPayment(session.user.tenantId, session.user.id, params.id, input.data);
    return NextResponse.json({ payment: { id: payment.id, amount: payment.amount.toFixed(2) } });
  } catch (error) {
    if (error instanceof CreditError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('credit.receive_failed', error);
    return NextResponse.json({ error: 'Não foi possível confirmar. Tente novamente com a mesma confirmação.' }, { status: 500 });
  }
}
