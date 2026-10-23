import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { customerAccess, customerSelect } from '@/lib/customers';
import { updateCustomerSchema } from '@/lib/validations/customer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const access = await customerAccess(true);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = updateCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
  try {
    const customer = await prisma.customer.update({ where: { id_tenant_id: { id: params.id, tenant_id: access.tenantId } }, data: parsed.data, select: customerSelect });
    return NextResponse.json({ customer });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2025') return NextResponse.json({ error: 'Cliente não encontrado nesta loja.' }, { status: 404 });
    if (code === 'P2002') return NextResponse.json({ error: 'Já existe cliente com este CPF/CNPJ nesta loja.' }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const access = await customerAccess(true);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await prisma.customer.updateMany({ where: { id: params.id, tenant_id: access.tenantId }, data: { isActive: false } });
  if (!result.count) return NextResponse.json({ error: 'Cliente não encontrado nesta loja.' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
