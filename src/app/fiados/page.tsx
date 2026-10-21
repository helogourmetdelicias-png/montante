import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import CreditLedger from './credit-ledger';

export default async function CreditsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  return <CreditLedger canManageStore={['owner', 'admin'].includes(session.user.role)} />;
}
