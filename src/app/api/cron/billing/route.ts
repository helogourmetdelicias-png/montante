import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasValidCronSecret } from '@/lib/cron/auth';
import { processTenantBilling } from '@/lib/billing-service';
export const dynamic = 'force-dynamic';
async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Cron não configurado.' }, { status: 503 });
  if (!hasValidCronSecret(request, secret)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const now = new Date();
  const cursor = new URL(request.url).searchParams.get('cursor');
  try {
    const tenants = await prisma.tenant.findMany({ where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: 'asc' }, take: 100, select: { id: true } });
    let invoices = 0;
    let failed = 0;
    for (const tenant of tenants) {
      try { invoices += await processTenantBilling(tenant.id, now); }
      catch (error) { failed++; console.error('billing.tenant_failed', { tenantId: tenant.id, error }); }
    }
    const summary = { tenants: tenants.length, invoices, failed, nextCursor: tenants.length === 100 ? tenants[99].id : null };
    console.info('billing.completed', summary);
    return NextResponse.json(summary, { status: failed ? 500 : 200 });
  } catch { return NextResponse.json({ error: 'Falha no faturamento.' }, { status: 500 }); }
}
export const GET = run;
export const POST = run;
