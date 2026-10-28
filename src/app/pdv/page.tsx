import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import PointOfSale from './point-of-sale';
import PdvScreensaver from '@/components/pdv-screensaver';

export const dynamic = 'force-dynamic';

/** Loads the store name for the authenticated cashier. */
export default async function PointOfSalePage(props: { searchParams: Promise<{ serviceSale?: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect('/login');

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, screensaver_url: true, screensaver_minutes: true },
  });
  if (!tenant) redirect('/login');

  const canManageStore = ['owner', 'admin'].includes(session.user.role);
  const { serviceSale } = await props.searchParams;
  let initialServiceSale;
  if (serviceSale) {
    const sale = await prisma.sale.findFirst({ where: { id: serviceSale, tenant_id: tenantId, status: 'pending', service_order: { is: { status: 'READY' } }, cash_register_session: { is: { user_id: session.user.id, status: 'OPEN' } } }, include: { payment_attempts: { where: { status: { in: ['CREATED', 'PENDING', 'APPROVED'] } }, select: { id: true } } } });
    if (!sale) redirect('/ordens-servico');
    if (sale.payment_attempts.length) redirect(`/vendas/${sale.id}`);
    initialServiceSale = { id: sale.id, total: sale.total_amount.toFixed(2), notes: sale.notes ?? '', orderId: sale.service_order_id! };
  }
  return <>
    <PdvScreensaver initial={{ imageUrl: tenant.screensaver_url ?? '', minutes: tenant.screensaver_minutes }} />
    <PointOfSale key={initialServiceSale?.id ?? 'new'} storeName={tenant.name} canManageBrand={canManageStore} operatorName={session.user.name ?? 'Operador'} initialServiceSale={initialServiceSale} />
  </>;
}
