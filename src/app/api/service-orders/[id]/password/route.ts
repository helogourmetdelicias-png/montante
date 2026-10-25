import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { decryptCredentials } from '@/lib/encryption';
import { NextResponse } from 'next/server';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const { id } = await context.params;
  const order = await prisma.serviceOrder.findFirst({ where: { id, tenant_id: session.user.tenantId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { device_password_encrypted: true } });
  if (!order) return NextResponse.json({ error: 'O.S. não encontrada ou encerrada.' }, { status: 404 });
  console.info('service_order.password_viewed', { orderId: id, tenantId: session.user.tenantId, userId: session.user.id });
  return NextResponse.json({ password: order.device_password_encrypted ? decryptCredentials(order.device_password_encrypted).password : '' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
