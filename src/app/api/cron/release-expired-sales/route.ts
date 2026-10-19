import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { releaseExpiredSaleWithProviderCheck } from '@/lib/sales/provider-order-lifecycle';
import { hasValidCronSecret } from '@/lib/cron/auth';
import { EXPIRED_SALES_BATCH_SIZE } from '@/lib/cron/expired-sales';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Runs one bounded batch; both scheduler methods share this protected handler. */
async function runExpiredSalesCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return NextResponse.json({ error: 'Processamento agendado não configurado.' }, { status: 503 });
  if (!hasValidCronSecret(request, cronSecret)) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });

  const now = new Date();
  const executionId = randomUUID();
  try {
    console.info('cron.expired_sales.started', { executionId, batchSize: EXPIRED_SALES_BATCH_SIZE, startedAt: now.toISOString() });
    const expiredSales = await prisma.sale.findMany({
      where: { status: 'pending', expires_at: { lte: now } },
      select: { id: true, tenant_id: true },
      orderBy: [{ expires_at: 'asc' }, { tenant_id: 'asc' }, { id: 'asc' }],
      take: EXPIRED_SALES_BATCH_SIZE,
    });

    const tenantIds = new Set(expiredSales.map(({ tenant_id }) => tenant_id));
    let releasedSales = 0;
    let deferredSales = 0;
    let paymentReceivedSales = 0;
    let failedSales = 0;
    for (const sale of expiredSales) {
      try {
        const result = await releaseExpiredSaleWithProviderCheck(sale.tenant_id, sale.id, now);
        if (result.released) releasedSales += 1;
        if (result.state === 'still_pending' || result.state === 'cash_refund_required') deferredSales += 1;
        if (result.state === 'payment_received') paymentReceivedSales += 1;
      } catch (error) {
        failedSales += 1;
        deferredSales += 1;
        console.error('cron.expired_sales.sale_failed', { executionId, saleId: sale.id, error });
      }
    }

    const summary = {
      executionId,
      tenantsProcessed: tenantIds.size,
      salesProcessed: expiredSales.length,
      releasedSales,
      deferredSales,
      paymentReceivedSales,
      failedSales,
      processedAt: now.toISOString(),
    };
    console.info('cron.expired_sales.completed', summary);
    if (failedSales > 0) {
      return NextResponse.json({ error: 'Uma ou mais vendas expiradas não puderam ser processadas.', ...summary }, { status: 500 });
    }
    return NextResponse.json(summary);
  } catch (error) {
    console.error('cron.expired_sales.execution_failed', { executionId, error });
    return NextResponse.json({ error: 'Não foi possível processar as reservas expiradas.', executionId }, { status: 500 });
  }
}

/** Vercel Cron sends GET requests; this method shares the same Bearer auth and bounded worker. */
export async function GET(request: Request) {
  return runExpiredSalesCron(request);
}

/** POST is used by Render Cron Jobs, cron-job.org, and other schedulers. */
export async function POST(request: Request) {
  return runExpiredSalesCron(request);
}
