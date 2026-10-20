import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import CustomerCatalog from './customer-catalog';

export const dynamic = 'force-dynamic';
export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  if (!['owner', 'admin'].includes(session.user.role)) redirect('/pdv');
  return <CustomerCatalog />;
}
