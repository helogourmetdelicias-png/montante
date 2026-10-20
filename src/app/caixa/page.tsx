import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import CashRegisterPage from './register-page';

export const dynamic = 'force-dynamic';

/** The shift belongs to the authenticated operator within their tenant. */
export default async function CashRegisterRoute() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  return <CashRegisterPage operatorName={session.user.name ?? 'Operador'} canManageStore={['owner', 'admin'].includes(session.user.role)} />;
}
