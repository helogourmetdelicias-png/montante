import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import StoreNavigation from '@/components/store-navigation';
import { orderInclude, serializeServiceOrder } from '@/lib/service-orders/service';
import ServiceOrderForm from '../service-order-form';
export const dynamic = 'force-dynamic';
export default async function ServiceOrderDetail(props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  const { id } = await props.params;
  const order = await prisma.serviceOrder.findFirst({ where: { id, tenant_id: session.user.tenantId }, include: orderInclude });
  if (!order) notFound();
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8"><StoreNavigation activePage="service-orders" canManageStore={['owner', 'admin'].includes(session.user.role)} /><ServiceOrderForm key={`${order.id}:${order.version}`} order={serializeServiceOrder(order)} /></main>;
}
