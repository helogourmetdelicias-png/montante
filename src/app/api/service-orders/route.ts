import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { createServiceOrderSchema, SERVICE_STATUSES } from '@/lib/service-orders/validation';
import { orderInclude, saveServiceOrder, serializeServiceOrder, ServiceOrderError } from '@/lib/service-orders/service';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const status = url.searchParams.get('status');
  const page = Number(url.searchParams.get('page') ?? 1);
  if (q.length > 120 || !Number.isSafeInteger(page) || page < 1 || page > 100000 || (status && !SERVICE_STATUSES.includes(status as typeof SERVICE_STATUSES[number]))) return NextResponse.json({ error: 'Confira os filtros.' }, { status: 400 });
  const where = { tenant_id: session.user.tenantId, ...(status ? { status: status as typeof SERVICE_STATUSES[number] } : {}), ...(q ? { OR: [{ client_name: { contains: q, mode: 'insensitive' as const } }, { device_brand_model: { contains: q, mode: 'insensitive' as const } }, { serial_number_imei: { contains: q, mode: 'insensitive' as const } }, ...(Number.isSafeInteger(Number(q)) && Number(q) > 0 && Number(q) <= 2147483647 ? [{ number: Number(q) }] : [])] } : {}) };
  const [orders, total] = await Promise.all([prisma.serviceOrder.findMany({ where, include: orderInclude, orderBy: { created_at: 'desc' }, take: 30, skip: (page - 1) * 30 }), prisma.serviceOrder.count({ where })]);
  return NextResponse.json({ orders: orders.map(serializeServiceOrder), total, page }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const parsed = createServiceOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira os campos obrigatórios, valores e URLs HTTPS.' }, { status: 400 });
  try {
    const order = await runSerializableTransaction(tx => saveServiceOrder(tx, session.user.tenantId, parsed.data));
    return NextResponse.json({ order: serializeServiceOrder(order) }, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceOrderError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('service_order.create_failed');
    return NextResponse.json({ error: 'Não foi possível salvar a O.S. Tente novamente.' }, { status: 500 });
  }
}
