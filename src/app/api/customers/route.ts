import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { customerAccess, customerSelect } from '@/lib/customers';
import { createCustomerSchema } from '@/lib/validations/customer';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const access = await customerAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const params = new URL(request.url).searchParams;
  const page = Number(params.get('page') ?? '1');
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return NextResponse.json({ error: 'Página inválida.' }, { status: 400 });
  const q = (params.get('q') ?? '').trim().slice(0, 120);
  const digits = q.replace(/\D/g, '');
  const where: Prisma.CustomerWhereInput = { tenant_id: access.tenantId,
    ...(params.get('includeInactive') === 'true' ? {} : { isActive: true }),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, ...(digits ? [{ document: { contains: digits } }, { phone: { contains: digits } }] : [])] } : {}),
  };
  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({ where, select: customerSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 }),
    prisma.customer.count({ where }),
  ]);
  return NextResponse.json({ customers, total, page, limit: 25 });
}

export async function POST(request: Request) {
  const access = await customerAccess(true);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = createCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
  try {
    const customer = await prisma.customer.create({ data: { ...parsed.data, tenant_id: access.tenantId }, select: customerSelect });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'Já existe cliente com este CPF/CNPJ nesta loja, inclusive entre os inativos.' }, { status: 409 });
    throw error;
  }
}
