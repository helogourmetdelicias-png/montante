import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: { id: string; attemptId: string } }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para confirmar o pagamento.' }, { status: 401 });

  const attempt = await prisma.paymentAttempt.findFirst({
    where: { id: context.params.attemptId, sale_id: context.params.id, tenant_id: tenantId },
    select: { id: true, sale_id: true, provider: true, status: true, amount: true, method: true },
  });
  if (!attempt) return NextResponse.json({ error: 'Tentativa de pagamento não encontrada nesta loja.' }, { status: 404 });
  if (!['pix_manual', 'external_terminal'].includes(attempt.provider)) {
    return NextResponse.json({ error: 'Este pagamento deve ser confirmado pelo provedor.' }, { status: 409 });
  }
  if (attempt.status === 'APPROVED') return NextResponse.json({ status: 'approved', replayed: true });
  if (attempt.status !== 'PENDING') return NextResponse.json({ error: 'Somente pagamentos pendentes podem ser confirmados.' }, { status: 409 });

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: attempt.sale_id, tenant_id: tenantId, status: 'pending', OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      select: { id: true },
    });
    if (!sale) return false;

    const changed = await tx.paymentAttempt.updateMany({
      where: { id: attempt.id, tenant_id: tenantId, status: 'PENDING' },
      data: { status: 'APPROVED', confirmed_at: now },
    });
    if (changed.count !== 1) return false;

    await tx.sale.updateMany({
      where: { id: sale.id, tenant_id: tenantId, status: 'pending' },
      data: { status: 'completed', payment_method: attempt.method.toLowerCase(), expires_at: null },
    });
    return true;
  });

  if (!updated) return NextResponse.json({ error: 'A venda expirou ou já foi processada.' }, { status: 409 });
  return NextResponse.json({ status: 'approved', replayed: false });
}
