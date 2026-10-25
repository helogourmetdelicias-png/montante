import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import StoreNavigation from '@/components/store-navigation';
import ServiceOrderList from './service-order-list';
export const dynamic = 'force-dynamic';
export default async function ServiceOrdersPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8"><StoreNavigation activePage="service-orders" canManageStore={['owner', 'admin'].includes(session.user.role)} /><ServiceOrderList /></main>;
}
