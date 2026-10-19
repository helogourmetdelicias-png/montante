import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SalesReports from './sales-reports';

export const dynamic = 'force-dynamic';

/** Reports are limited to tenant owners and administrators. */
export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  if (!['owner', 'admin'].includes(session.user.role)) redirect('/pdv');
  return <SalesReports />;
}
