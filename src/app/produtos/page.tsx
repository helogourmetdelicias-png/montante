import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import ProductCatalog from './product-catalog';
import { prisma } from '@/lib/prisma';
import { INVENTORY_FILTERS, type InventoryFilter } from '@/lib/inventory-alerts';

export const dynamic = 'force-dynamic';

/** Catalog management stays limited to tenant owners and administrators. */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ alert?: string; q?: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  if (!['owner', 'admin'].includes(session.user.role)) redirect('/pdv');
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { niche: true } });
  if (!tenant) redirect('/login');
  const params = await searchParams;
  const filter = INVENTORY_FILTERS.includes(params.alert as InventoryFilter) ? params.alert as InventoryFilter : 'all';
  return <ProductCatalog initialNiche={tenant.niche} initialFilter={filter} initialQuery={params.q?.slice(0, 100) ?? ''} />;
}
