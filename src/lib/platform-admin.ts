import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/** Revalidates the explicit account grant on every cross-tenant page/API request. */
export async function platformAdminAccess() {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) return { ok: false as const, status: 401 as const };
  if (session.user.isPlatformAdmin !== true) return { ok: false as const, status: 403 as const };
  const user = await prisma.user.findFirst({
    where: { id: session.user.id, tenant_id: session.user.tenantId, is_platform_admin: true, is_active: true, tenant: { is_active: true } },
    select: { id: true, name: true },
  });
  if (!user) return { ok: false as const, status: 403 as const };
  return { ok: true as const, user };
}
