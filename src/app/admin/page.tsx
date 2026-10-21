import { redirect } from 'next/navigation';
import { platformAdminAccess } from '@/lib/platform-admin';
import PlatformDashboard from './platform-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const access = await platformAdminAccess();
  if (!access.ok) redirect(access.status === 401 ? '/login' : '/pdv');
  return <PlatformDashboard />;
}
