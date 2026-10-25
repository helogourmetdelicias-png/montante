import { Prisma } from '@prisma/client';

/** Called in the same payment transaction. Never reserve these parts at checkout creation. */
export async function completeServiceOrder(tx: Prisma.TransactionClient, tenantId: string, orderId: string, saleId: string, now: Date, deferOnStock = false) {
  const order = await tx.serviceOrder.findFirst({ where: { id: orderId, tenant_id: tenantId }, include: { parts: { orderBy: { product_id: 'asc' } } } });
  if (!order || order.status !== 'READY') throw new Error('A O.S. não está pronta para conclusão.');
  const sale = await tx.sale.findFirst({ where: { id: saleId, tenant_id: tenantId, service_order_id: orderId, status: 'completed' }, select: { total_amount: true } });
  if (!sale || !sale.total_amount.equals(order.grand_total)) throw new Error('O valor recebido diverge do orçamento da O.S.');
  const paid = await tx.paymentAttempt.aggregate({ where: { tenant_id: tenantId, sale_id: saleId, status: 'APPROVED' }, _sum: { amount: true } });
  if (!paid._sum.amount || paid._sum.amount.lessThan(order.grand_total)) throw new Error('A entrega da O.S. exige pagamento integral.');
  // Lock all parts in a stable order before checking availability. A provider may
  // already have received money; keep that approval and defer delivery if needed.
  const available = order.parts.length ? await tx.$queryRaw<Array<{ id: string; stock_quantity: Prisma.Decimal; is_active: boolean }>>(Prisma.sql`SELECT id, stock_quantity, is_active FROM "Product" WHERE tenant_id = ${tenantId} AND id IN (${Prisma.join(order.parts.map(p => p.product_id))}) ORDER BY id FOR UPDATE`) : [];
  if (order.parts.some(part => !available.some(product => product.id === part.product_id && product.is_active && product.stock_quantity.greaterThanOrEqualTo(part.quantity)))) {
    if (deferOnStock) return false;
    throw new Error('Estoque insuficiente para concluir a O.S. Reponha as peças antes de receber.');
  }
  const claimed = await tx.serviceOrder.updateMany({ where: { id: orderId, tenant_id: tenantId, status: 'READY', version: order.version }, data: { status: 'COMPLETED', completed_at: now, version: { increment: 1 }, device_password_encrypted: null } });
  if (claimed.count !== 1) throw new Error('A O.S. foi concluída ou alterada por outro operador.');
  for (const part of order.parts) {
    const changed = await tx.product.updateMany({ where: { id: part.product_id, tenant_id: tenantId, is_active: true, stock_quantity: { gte: part.quantity } }, data: { stock_quantity: { decrement: part.quantity } } });
    if (changed.count !== 1) throw new Error('Estoque insuficiente para concluir a O.S. Reponha as peças antes de receber.');
  }
  return true;
}
