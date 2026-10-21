import { auth } from '@/auth';
import { completeCreditSale, CreditError } from '@/lib/credit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const parsed = z.object({ customerId: z.string().cuid() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Selecione o cliente do fiado.' }, { status: 400 });
  try {
    const credit = await completeCreditSale(session.user.tenantId, session.user.id, params.id, parsed.data.customerId);
    return NextResponse.json({ creditId: credit.id, saleCompleted: true });
  } catch (error) {
    if (error instanceof CreditError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('credit.create_failed', error);
    return NextResponse.json({ error: 'Não foi possível registrar o fiado. Consulte a venda antes de tentar novamente.' }, { status: 500 });
  }
}
