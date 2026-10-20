import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import PointOfSale from './point-of-sale';

export const dynamic = 'force-dynamic';

/** Loads tenant branding server-side so the cashier sees the right store immediately. */
export default async function PointOfSalePage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect('/login');

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, logo_url: true },
  });
  if (!tenant) redirect('/login');

  const canManageStore = ['owner', 'admin'].includes(session.user.role);
  return <>
    <PointOfSale storeName={tenant.name} initialLogoUrl={tenant.logo_url ?? ''} canManageBrand={canManageStore} operatorName={session.user.name ?? 'Operador'} />
  </>;
}
