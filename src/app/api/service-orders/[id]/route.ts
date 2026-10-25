import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { updateServiceOrderSchema } from '@/lib/service-orders/validation';
import { orderInclude, saveServiceOrder, serializeServiceOrder, ServiceOrderError } from '@/lib/service-orders/service';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const { id } = await context.params;
  const order = await prisma.serviceOrder.findFirst({ where: { id, tenant_id: session.user.tenantId }, include: orderInclude });
  return order ? NextResponse.json({ order: serializeServiceOrder(order) }, { headers: { 'Cache-Control': 'private, no-store' } }) : NextResponse.json({ error: 'O.S. não encontrada.' }, { status: 404 });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateServiceOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira os campos e atualize a página antes de salvar.' }, { status: 400 });
  try {
    const order = await runSerializableTransaction(tx => saveServiceOrder(tx, session.user.tenantId, parsed.data, { id, version: parsed.data.version, status: parsed.data.status }));
    return NextResponse.json({ order: serializeServiceOrder(order) });
  } catch (error) {
    if (error instanceof ServiceOrderError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('service_order.update_failed');
    return NextResponse.json({ error: 'Não foi possível atualizar a O.S.' }, { status: 500 });
  }
}
