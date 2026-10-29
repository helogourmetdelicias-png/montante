import { snapshotCost } from '@/lib/sales/costs';
import { auth } from '@/auth';
import { randomUUID } from 'node:crypto';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { ensureDailyCashRegister } from '@/lib/cash-register/daily-session';
import { releaseExpiredSales } from '@/lib/sales/reservations';
import { ServiceOrderError } from '@/lib/service-orders/service';
import { NextResponse } from 'next/server';
import { applyPaymentResult } from '@/lib/sales/payment-result';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const { id } = await context.params;
  const tenantId = session.user.tenantId;
  try {
    const result = await runSerializableTransaction(async tx => {
      const now = new Date();
      await releaseExpiredSales(tx, tenantId, now);
      const order = await tx.serviceOrder.findFirst({ where: { id, tenant_id: tenantId }, include: { parts: { include: { product: true } } } });
      if (!order) throw new ServiceOrderError('O.S. não encontrada.', 404);
      if (order.status !== 'READY') throw new ServiceOrderError('Marque a O.S. como pronta antes de receber.');
      const register = await ensureDailyCashRegister(tx, tenantId, session.user.id, now);
      const existing = await tx.sale.findFirst({ where: { tenant_id: tenantId, service_order_id: id, status: { not: 'cancelled' } }, include: { cash_register_session: { select: { user_id: true } }, payment_attempts: { where: { status: { in: ['CREATED', 'PENDING', 'APPROVED'] } } } } });
      if (existing) {
        if (existing.cash_register_session?.user_id !== session.user.id) throw new ServiceOrderError('Esta O.S. já está em recebimento com outro operador. Resolva a venda vinculada.');
        const approved = existing.payment_attempts.find(attempt => attempt.status === 'APPROVED' && !['cash', 'pix_manual', 'external_terminal'].includes(attempt.provider));
        if (approved) {
          const reconciled = await applyPaymentResult(tx, { tenantId, saleId: existing.id, attemptId: approved.id, provider: approved.provider, method: approved.method.toLowerCase(), result: { status: 'approved', externalId: approved.external_order_id ?? undefined } });
          if (reconciled.saleCompleted) return { saleId: existing.id, href: `/ordens-servico/${id}` };
        }
        return { saleId: existing.id, href: existing.payment_attempts.length ? `/vendas/${existing.id}` : `/pdv?serviceSale=${existing.id}` };
      }
      if (!order.grand_total.greaterThan(0)) throw new ServiceOrderError('Informe um orçamento maior que zero.');
      for (const part of order.parts) if (!part.product.is_active || part.product.stock_quantity.lessThan(part.quantity)) throw new ServiceOrderError(`Estoque insuficiente: ${part.name_snapshot}. Reponha antes de receber.`);
      const claim = await tx.serviceOrder.updateMany({ where: { id, tenant_id: tenantId, status: 'READY', version: order.version }, data: { version: { increment: 1 } } });
      if (claim.count !== 1) throw new ServiceOrderError('A O.S. foi alterada. Atualize a página.');
      const tenant = await tx.tenant.update({ where: { id: tenantId }, data: { sales_sequence: { increment: 1 } }, select: { sales_sequence: true } });
      const sale = await tx.sale.create({ data: { tenant_id: tenantId, service_order_id: id, sale_number: tenant.sales_sequence, is_quick_sale: true, status: 'pending', cost_total: snapshotCost(order.parts.map(part => ({ quantity: part.quantity, unitCost: part.unit_cost })), order.additional_material_cost), total_amount: order.grand_total, discount_amount: 0, cash_register_session_id: register.id, idempotency_key: randomUUID(), request_hash: `service:${id}:${order.version}`, expires_at: new Date(now.getTime() + 15 * 60000), notes: `O.S. #${order.number} · ${order.device_type} ${order.device_brand_model} · Cliente: ${order.client_name} · Peças: R$ ${order.parts_total.toFixed(2)} · Mão de obra: R$ ${order.labor_total.toFixed(2)}` } });
      return { saleId: sale.id, href: `/pdv?serviceSale=${sale.id}` };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ServiceOrderError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('service_order.checkout_failed');
    return NextResponse.json({ error: 'Não foi possível levar a O.S. ao caixa. Atualize a página e tente novamente.' }, { status: 500 });
  }
}
