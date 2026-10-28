import { auth } from '@/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import StoreNavigation from '@/components/store-navigation';
import SubscriptionNotice from '@/components/subscription-notice';
import OperatorAccess from '@/components/operator-access';
import { prisma } from '@/lib/prisma';
import Personalization from './personalization';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  const canManageStore = ['owner', 'admin'].includes(session.user.role);
  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { logo_url: true, screensaver_url: true, screensaver_minutes: true } }),
    prisma.user.findFirst({ where: { id: session.user.id, tenant_id: session.user.tenantId }, select: { avatar_url: true } }),
  ]);
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-5xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Perfil</h1><StoreNavigation activePage="profile" canManageStore={canManageStore} /></header>
    <section className="space-y-2 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{session.user.name ?? 'Usuário'}</h2><p className="text-sm text-slate-600">{session.user.email}</p></section>
    <Personalization avatarUrl={user?.avatar_url ?? ''} logoUrl={tenant?.logo_url ?? ''} imageUrl={tenant?.screensaver_url ?? ''} minutes={tenant?.screensaver_minutes ?? 0} canManage={canManageStore} />
    {canManageStore && <section className="overflow-hidden rounded-xl border bg-white"><h2 className="px-6 pt-5 text-lg font-semibold">Assinatura da loja</h2><SubscriptionNotice tenantId={session.user.tenantId} /></section>}
    {session.user.isPlatformAdmin && <section className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Administração geral</h2><Link href="/admin" className="mt-2 inline-block font-medium text-orange-700 underline">Monitorar todas as lojas</Link></section>}
    <OperatorAccess canManageStore={canManageStore} tenantSlug={session.user.tenantSlug} />
  </div></main>;
}
