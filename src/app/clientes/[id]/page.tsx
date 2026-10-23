import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import CustomerHistory from './customer-history';

export const dynamic = 'force-dynamic';
export default async function CustomerHistoryPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ startDate?: string; endDate?: string }> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  if (!['owner', 'admin'].includes(session.user.role)) redirect('/pdv');
  return <CustomerHistory customerId={params.id} initialStart={searchParams.startDate ?? ''} initialEnd={searchParams.endDate ?? ''} />;
}
