import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import StoreNavigation from '@/components/store-navigation';
import ServiceOrderForm from '../service-order-form';
export const dynamic = 'force-dynamic';
export default async function NewServiceOrder() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8"><StoreNavigation activePage="service-orders" canManageStore={['owner', 'admin'].includes(session.user.role)} /><ServiceOrderForm /></main>;
}
