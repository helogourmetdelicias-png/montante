import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import StoreNavigation from '@/components/store-navigation';
import SubscriptionNotice from '@/components/subscription-notice';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  const canManageStore = ['owner', 'admin'].includes(session.user.role);
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-5xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Perfil</h1><StoreNavigation activePage="profile" canManageStore={canManageStore} /></header>
    <section className="space-y-2 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{session.user.name ?? 'Usuário'}</h2><p className="text-sm text-slate-600">{session.user.email}</p></section>
    {canManageStore && <section className="overflow-hidden rounded-xl border bg-white"><h2 className="px-6 pt-5 text-lg font-semibold">Assinatura da loja</h2><SubscriptionNotice tenantId={session.user.tenantId} /></section>}
  </div></main>;
}
