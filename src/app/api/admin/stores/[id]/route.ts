import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { platformAdminAccess } from '@/lib/platform-admin';
import { ADMIN_PLANS, assertDeletableStore, managedPlan } from '@/lib/platform-management';
import { assertSameOrigin, RequestError } from '@/lib/security/request';
import { imageStorage, IMAGE_BUCKET } from '@/lib/media/storage';
import { billingCycle } from '@/lib/billing';
import { isAbandonedManualCharge } from '@/lib/cash-register/pending';
export const runtime = 'nodejs';
export const maxDuration = 30;
const change = z.object({ plan: z.enum(ADMIN_PLANS).optional(), active: z.boolean().optional() }).strict().refine(v => v.plan !== undefined || v.active !== undefined);
async function handle(request: Request, context: { params: Promise<{ id: string }> }, deleting: boolean) {
  try {
    const access = await platformAdminAccess();
    if (!access.ok) return NextResponse.json({ error: 'Acesso exclusivo da administração geral.' }, { status: access.status });
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const input = deleting ? z.object({ confirmation: z.string().max(100) }).strict().safeParse(body) : change.safeParse(body);
    if (!input.success) throw new RequestError('Confira os dados da alteração.');
    const paths = await prisma.$transaction(async tx => {
      // Revalidate the grant inside the same transaction as the cross-store mutation.
      const actor = await tx.user.findFirst({ where: { id: access.user.id, is_platform_admin: true, is_active: true, tenant: { is_active: true } } });
      if (!actor) throw new RequestError('Permissão administrativa revogada.', 403);
      const store = await tx.tenant.findUnique({ where: { id }, include: { users: { where: { is_platform_admin: true }, select: { id: true } } } });
      if (!store) throw new RequestError('Loja não encontrada.', 404);
      if (!deleting) {
        const data = input.data as z.infer<typeof change>;
        if (data.active === false && (actor.tenant_id === id || store.users.length)) throw new RequestError('A loja da administração geral não pode ser desativada.', 409);
        await tx.tenant.update({ where: { id }, data: { ...(data.active === undefined ? {} : { is_active: data.active }), ...(data.plan === undefined ? {} : { billing_plan_override: data.plan === 'automatic' ? null : data.plan, plan_tier: data.plan === 'automatic' ? store.plan_tier : managedPlan(data.plan, 0).label }) } });
        if (data.plan) {
          const now = new Date();
          // A changed plan starts a fresh next cycle; never rewrite already-issued invoices.
          const next = billingCycle(store.created_at, now).end;
          await tx.tenantSubscription.upsert({ where: { tenant_id: id }, create: { tenant_id: id, trial_ends_at: now, next_billing_at: next, status: 'ACTIVE' }, update: { next_billing_at: next, status: 'ACTIVE' } });
        }
        await tx.platformAudit.create({ data: { actor_id: actor.id, tenant_id: id, action: 'store.update', details: { before: { active: store.is_active, plan: store.billing_plan_override }, after: data } } });
        return [] as string[];
      }
      assertDeletableStore(actor.tenant_id, { id, slug: store.slug, admins: store.users.length }, (input.data as { confirmation: string }).confirmation);
      const attempts = await tx.paymentAttempt.findMany({ where: { tenant_id: id, provider: { not: 'cash' }, OR: [{ status: { in: ['CREATED', 'PENDING'] } }, { status: 'APPROVED', sale: { status: 'pending' } }] }, select: { provider: true, sale: { select: { status: true } } } });
      const pending = attempts.some(attempt => !isAbandonedManualCharge(attempt.sale.status, attempt.provider));
      const billing = await tx.billingRecord.count({ where: { tenant_id: id, status: { in: ['pending', 'overdue'] }, OR: [{ external_payment_id: { not: null } }, { checkout_url: { not: null } }] } });
      if (pending || billing) throw new RequestError('Resolva as cobranças externas pendentes antes de excluir esta loja.', 409);
      const assets = await tx.mediaAsset.findMany({ where: { tenant_id: id }, select: { storage_path: true } });
      const where = { tenant_id: id };
      await tx.creditPayment.deleteMany({ where });
      await tx.brandCommission.deleteMany({ where });
      await tx.creditSale.deleteMany({ where });
      await tx.paymentAttempt.deleteMany({ where });
      await tx.saleItem.deleteMany({ where: { sale: { tenant_id: id } } });
      await tx.sale.deleteMany({ where });
      await tx.serviceOrderPart.deleteMany({ where });
      await tx.serviceOrder.deleteMany({ where });
      await tx.cashRegisterMovement.deleteMany({ where });
      await tx.cashRegisterSession.deleteMany({ where });
      await tx.platformAudit.create({ data: { actor_id: actor.id, tenant_id: id, action: 'store.delete', details: { slug: store.slug, name: store.name, imagePaths: assets.map(a => a.storage_path) } } });
      await tx.tenant.delete({ where: { id } });
      return assets.map(a => a.storage_path);
    }, { isolationLevel: 'Serializable', timeout: 20000 });
    let storageWarning = false;
    if (deleting && paths.length) {
      try { for (let i = 0; i < paths.length; i += 100) { const result = await imageStorage().from(IMAGE_BUCKET).remove(paths.slice(i, i + 100)); if (result.error) storageWarning = true; } }
      catch { storageWarning = true; }
    }
    return NextResponse.json({ ok: true, storageWarning }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestError ? error.message : 'Não foi possível concluir. Atualize o painel e tente novamente.' }, { status: error instanceof RequestError ? error.status : 409 });
  }
}
export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, context, false);
export const DELETE = (request: Request, context: { params: Promise<{ id: string }> }) => handle(request, context, true);
