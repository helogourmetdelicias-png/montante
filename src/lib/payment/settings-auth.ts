import { auth } from '@/auth';

export async function getPaymentSettingsAccess() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;

  if (!tenantId) return { authorized: false as const, status: 401 as const };
  if (!['owner', 'admin'].includes(session.user.role)) {
    return { authorized: false as const, status: 403 as const };
  }

  return { authorized: true as const, tenantId };
}
