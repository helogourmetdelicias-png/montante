import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { brandKey } from '@/lib/brand-commission';
import { businessDayRange } from '@/lib/cash-register/business-day';
import { ensureDailyCashRegister } from '@/lib/cash-register/daily-session';
import { expectedDrawerAmount, getCashRegisterSummary } from '@/lib/cash-register/summary';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { snapshotCost } from '@/lib/sales/costs';
import { releaseExpiredSales } from '@/lib/sales/reservations';
import { offlineLineCents, offlineSaleSchema } from '@/lib/offline/sale';
import { OFFLINE_WINDOW_MS, productValue, ticketValue, verifyOffline } from '@/lib/offline/signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class SyncError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

/** A cash sale, stock debit and approved receipt commit together or not at all. */
export async function POST(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) return NextResponse.json({ error: 'Entre novamente na loja para enviar as vendas. Elas continuam salvas neste aparelho.' }, { status: 401 });
  const body = await request.text();
  if (body.length > 150_000) return NextResponse.json({ error: 'Venda muito grande.' }, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(body); } catch { return NextResponse.json({ error: 'Venda inválida.' }, { status: 400 }); }
  const parsed = offlineSaleSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Confira os dados da venda offline.' }, { status: 400 });
  const sale = parsed.data;
  if (sale.tenantId !== tenantId || sale.userId !== userId) return NextResponse.json({ error: 'Esta venda pertence a outra loja ou operador. Entre com o operador que a registrou.' }, { status: 403 });
  const hash = createHash('sha256').update(JSON.stringify({ ...sale, items: [...sale.items].sort((a, b) => a.productId.localeCompare(b.productId)) })).digest('hex');
  const idempotencyKey = `offline:${sale.id}`;
  const occurredAt = new Date(sale.occurredAt);
  const preparedAt = Date.parse(sale.preparedAt);
  if (!verifyOffline(ticketValue(tenantId, userId, sale.preparedAt), sale.ticket) ||
      occurredAt.getTime() < preparedAt - 5 * 60_000 || occurredAt.getTime() > preparedAt + OFFLINE_WINDOW_MS ||
      occurredAt.getTime() > Date.now() + 5 * 60_000 || sale.items.some(item =>
        !verifyOffline(productValue(sale.ticket, item.productId, item.price, item.sellByFraction), item.signature))) {
    return NextResponse.json({ error: 'O catálogo ou a data desta venda precisa de conferência. A venda permanece salva no aparelho.' }, { status: 409 });
  }
  const subtotalCents = sale.mode === 'quick' ? sale.quickCents : sale.items.reduce((sum, item) => sum + offlineLineCents(item.price, item.quantityMilli), 0);
  const totalCents = subtotalCents - sale.discountCents;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 9_999_999_999 || sale.receivedCents < totalCents) {
    return NextResponse.json({ error: 'Total ou dinheiro recebido inválido.' }, { status: 400 });
  }
  try {
    const result = await runSerializableTransaction(async tx => {
      const existing = await tx.sale.findUnique({ where: { tenant_id_idempotency_key: { tenant_id: tenantId, idempotency_key: idempotencyKey } } });
      if (existing) {
        if (existing.request_hash !== hash || existing.status !== 'completed') throw new SyncError('Esta identificação já foi utilizada com outros dados.');
        return { id: existing.id, saleNumber: existing.sale_number, replayed: true };
      }
      await releaseExpiredSales(tx, tenantId, new Date());
      const products = await tx.product.findMany({
        where: { tenant_id: tenantId, id: { in: sale.items.map(item => item.productId) }, is_active: true },
        select: { id: true, name: true, cost_price: true, brand: true, category: true },
      });
      if (products.length !== sale.items.length) throw new SyncError('Um produto foi removido ou desativado. Confira a venda pendente.');
      const byId = new Map(products.map(product => [product.id, product]));
      const rules = await tx.brandCommission.findMany({ where: { tenant_id: tenantId } });
      const rates = new Map(rules.map(rule => [rule.brand_key, rule.rate]));
      for (const item of sale.items) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, tenant_id: tenantId, is_active: true, stock_quantity: { gte: new Prisma.Decimal(item.quantityMilli).div(1000) } },
          data: { stock_quantity: { decrement: new Prisma.Decimal(item.quantityMilli).div(1000) } },
        });
        if (updated.count !== 1) throw new SyncError(`Estoque insuficiente de ${byId.get(item.productId)!.name}. Ajuste o estoque na loja e tente enviar novamente.`);
      }
      // A late upload belongs to the ORIGINAL day and operator, even after closing.
      const previousDrawer = await tx.cashRegisterSession.findFirst({
        where: { tenant_id: tenantId, user_id: userId, opened_at: businessDayRange(occurredAt) },
        orderBy: [{ status: 'asc' }, { opened_at: 'desc' }],
      });
      const drawer = previousDrawer ?? await ensureDailyCashRegister(tx, tenantId, userId, occurredAt);
      const tenant = await tx.tenant.update({ where: { id: tenantId }, data: { sales_sequence: { increment: 1 } }, select: { sales_sequence: true } });
      const amount = new Prisma.Decimal(totalCents).div(100);
      const created = await tx.sale.create({
        data: {
          tenant_id: tenantId, sale_number: tenant.sales_sequence, status: 'completed', payment_method: 'cash',
          is_quick_sale: sale.mode === 'quick', total_amount: amount, discount_amount: new Prisma.Decimal(sale.discountCents).div(100),
          amount_received: new Prisma.Decimal(sale.receivedCents).div(100), change_amount: new Prisma.Decimal(sale.receivedCents - totalCents).div(100),
          idempotency_key: idempotencyKey, request_hash: hash, sold_at: occurredAt, created_at: occurredAt,
          cash_register_session_id: drawer.id, notes: `[Venda offline · ${sale.id}]${sale.notes ? `\n${sale.notes}` : ''}`,
          cost_total: sale.mode === 'quick' ? null : snapshotCost(sale.items.map(item => ({ quantity: new Prisma.Decimal(item.quantityMilli).div(1000), unitCost: byId.get(item.productId)!.cost_price }))),
          items: { create: sale.items.map(item => {
            const product = byId.get(item.productId)!;
            return { product_id: item.productId, quantity: new Prisma.Decimal(item.quantityMilli).div(1000), unit_price: new Prisma.Decimal(item.price), total_price: new Prisma.Decimal(offlineLineCents(item.price, item.quantityMilli)).div(100), catalog_snapshot: true, brand_snapshot: product.brand, category_snapshot: product.category, commission_rate: product.brand ? rates.get(brandKey(product.brand)) ?? null : null };
          }) },
          payment_attempts: { create: {
            provider: 'cash', method: 'CASH', channel: 'IN_PERSON', status: 'APPROVED', amount,
            amount_received: new Prisma.Decimal(sale.receivedCents).div(100), change_amount: new Prisma.Decimal(sale.receivedCents - totalCents).div(100),
            idempotency_key: idempotencyKey, cash_session_id: drawer.id, confirmed_at: occurredAt, created_at: occurredAt,
          } },
        },
      });
      if (drawer.status === 'CLOSED') {
        const expected = expectedDrawerAmount(drawer.initial_amount, await getCashRegisterSummary(tx, tenantId, drawer.id));
        await tx.cashRegisterSession.update({ where: { id: drawer.id }, data: { expected_amount: expected, difference_amount: drawer.declared_amount?.sub(expected) ?? null } });
      }
      return { id: created.id, saleNumber: created.sale_number, replayed: false };
    });
    return NextResponse.json({ sale: result });
  } catch (error) {
    if (error instanceof SyncError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Concurrent sends from two tabs can race on the unique key; acknowledge only an identical commit.
    if ((error as { code?: string }).code === 'P2002') {
      const existing = await prisma.sale.findUnique({ where: { tenant_id_idempotency_key: { tenant_id: tenantId, idempotency_key: idempotencyKey } } });
      if (existing?.request_hash === hash && existing.status === 'completed') return NextResponse.json({ sale: { id: existing.id, saleNumber: existing.sale_number, replayed: true } });
    }
    console.error('Falha na sincronização offline:', error);
    return NextResponse.json({ error: 'Não foi possível enviar agora. A venda continua salva no aparelho; tente novamente.' }, { status: 500 });
  }
}
