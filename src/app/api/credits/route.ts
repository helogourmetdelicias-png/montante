import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const tenantId = session.user.tenantId;
  const params = new URL(request.url).searchParams;
  const page = Number(params.get('page') ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return NextResponse.json({ error: 'Página inválida.' }, { status: 400 });
  const q = (params.get('q') ?? '').trim().slice(0, 120);
  const where: Prisma.CreditSaleWhereInput = { tenant_id: tenantId, ...(q ? { customer: { is: { name: { contains: q, mode: 'insensitive' } } } } : {}) };
  const [rows, total] = await prisma.$transaction([
    prisma.creditSale.findMany({ where, include: { customer: { select: { name: true, phone: true } }, sale: { select: { sale_number: true } }, payments: { orderBy: { created_at: 'desc' }, include: { user: { select: { name: true } } } } }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50 }),
    prisma.creditSale.count({ where }),
  ]);
  return NextResponse.json({ total, page, credits: rows.map(row => {
    const paid = row.payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
    return { id: row.id, saleId: row.sale_id, saleNumber: row.sale.sale_number, customer: row.customer.name, phone: row.customer.phone, amount: row.amount.toFixed(2), paid: paid.toFixed(2), balance: row.amount.sub(paid).toFixed(2), createdAt: row.created_at,
      payments: row.payments.map(payment => ({ id: payment.id, amount: payment.amount.toFixed(2), method: payment.method, operator: payment.user.name, createdAt: payment.created_at })) };
  }) });
}
