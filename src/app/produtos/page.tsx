import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import ProductCatalog from './product-catalog';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Catalog management stays limited to tenant owners and administrators. */
export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  if (!['owner', 'admin'].includes(session.user.role)) redirect('/pdv');
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { niche: true } });
  if (!tenant) redirect('/login');
  return <ProductCatalog initialNiche={tenant.niche} />;
}
