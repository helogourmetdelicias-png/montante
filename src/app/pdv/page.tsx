import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import PointOfSale from './point-of-sale';

export const dynamic = 'force-dynamic';

/** Loads the store name for the authenticated cashier. */
export default async function PointOfSalePage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect('/login');

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  if (!tenant) redirect('/login');

  const canManageStore = ['owner', 'admin'].includes(session.user.role);
  return <>
    <PointOfSale storeName={tenant.name} canManageBrand={canManageStore} operatorName={session.user.name ?? 'Operador'} />
  </>;
}
