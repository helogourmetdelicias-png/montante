import { Prisma } from '@prisma/client';
import { encryptCredentials } from '@/lib/encryption';
import { canTransitionServiceOrder, type ServiceOrderInput } from './validation';
import { mediaId } from '../media/types';

export class ServiceOrderError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export const orderInclude = {
  parts: { orderBy: { id: 'asc' as const } },
  sales: { orderBy: { created_at: 'desc' as const }, select: { id: true, status: true, cash_register_session_id: true, sale_number: true } },
};
type Order = Prisma.ServiceOrderGetPayload<{ include: typeof orderInclude }>;
export function serializeServiceOrder(order: Order) {
  return {
    id: order.id, number: order.number, clientName: order.client_name, clientPhone: order.client_phone,
    deviceType: order.device_type, deviceBrandModel: order.device_brand_model, serialNumberImei: order.serial_number_imei ?? '',
    reportedDefect: order.reported_defect, aestheticCondition: order.aesthetic_condition, hasPassword: !!order.device_password_encrypted,
    additionalMaterialCost: order.additional_material_cost?.toFixed(2) ?? null,
    status: order.status, version: order.version, partsTotal: order.parts_total.toFixed(2), laborTotal: order.labor_total.toFixed(2), grandTotal: order.grand_total.toFixed(2),
    photoUrls: order.photo_urls, createdAt: order.created_at.toISOString(), completedAt: order.completed_at?.toISOString() ?? null,
    parts: order.parts.map(p => ({ productId: p.product_id, unitCost: p.unit_cost?.toFixed(2) ?? null, name: p.name_snapshot, quantity: p.quantity.toString(), unitPrice: p.unit_price.toFixed(2), totalPrice: p.total_price.toFixed(2) })),
    sales: order.sales.map(s => ({ id: s.id, number: s.sale_number, status: s.status })),
  };
}

export async function saveServiceOrder(tx: Prisma.TransactionClient, tenantId: string, input: ServiceOrderInput, edit?: { id: string; version: number; status: 'PENDING_APPROVAL' | 'IN_PROGRESS' | 'READY' | 'CANCELLED' }) {
  const photoIds = [...new Set(input.photoUrls.map(mediaId).filter((id): id is string => !!id))];
  if (photoIds.length && await tx.mediaAsset.count({ where: { id: { in: photoIds }, tenant_id: tenantId, purpose: 'service-order' } }) !== photoIds.length) {
    throw new ServiceOrderError('Uma das fotos não pertence a esta loja.', 403);
  }
  if (edit) {
    const order = await tx.serviceOrder.findFirst({ where: { id: edit.id, tenant_id: tenantId }, include: { sales: { where: { status: { not: 'cancelled' } }, select: { id: true } } } });
    if (!order) throw new ServiceOrderError('Ordem de serviço não encontrada.', 404);
    if (order.version !== edit.version) throw new ServiceOrderError('A O.S. foi alterada. Atualize a página antes de salvar.');
    if (!canTransitionServiceOrder(order.status, edit.status)) throw new ServiceOrderError('Esta mudança de situação não é permitida. O.S. entregue só é concluída pelo pagamento.');
    if (order.sales.length) throw new ServiceOrderError('Resolva ou cancele a venda vinculada antes de alterar a O.S.');
  }
  const ids = input.parts.map(p => p.productId);
  if (new Set(ids).size !== ids.length) throw new ServiceOrderError('Não repita a mesma peça; ajuste sua quantidade.', 400);
  const products = ids.length ? await tx.product.findMany({ where: { tenant_id: tenantId, id: { in: ids }, is_active: true } }) : [];
  if (products.length !== ids.length) throw new ServiceOrderError('Peça não encontrada ou inativa nesta loja.', 400);
  const parts = input.parts.map(p => {
    const product = products.find(row => row.id === p.productId)!;
    const quantity = new Prisma.Decimal(p.quantity);
    if (!product.sell_by_fraction && !quantity.isInteger()) throw new ServiceOrderError('Esta peça exige quantidade inteira.', 400);
    const price = p.unitPrice === undefined ? product.price : new Prisma.Decimal(p.unitPrice);
    return { tenant_id: tenantId, product_id: product.id, name_snapshot: product.name, unit_cost: p.unitCost === undefined ? product.cost_price : p.unitCost === null ? null : new Prisma.Decimal(p.unitCost), quantity, unit_price: price, total_price: price.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) };
  });
  const partsTotal = parts.reduce((sum, p) => sum.add(p.total_price), new Prisma.Decimal(0));
  const grandTotal = partsTotal.add(input.laborTotal);
  if (grandTotal.greaterThan('99999999.99')) throw new ServiceOrderError('Total acima do limite permitido.', 400);
  const password = input.removePassword ? null : input.devicePassword ? encryptCredentials({ password: input.devicePassword }) : undefined;
  const data = {
    client_name: input.clientName, client_phone: input.clientPhone, device_type: input.deviceType, device_brand_model: input.deviceBrandModel,
    serial_number_imei: input.serialNumberImei || null, reported_defect: input.reportedDefect, aesthetic_condition: input.aestheticCondition,
    ...(password !== undefined ? { device_password_encrypted: password } : {}),
    photo_urls: input.photoUrls, additional_material_cost: input.additionalMaterialCost == null ? null : new Prisma.Decimal(input.additionalMaterialCost), parts_total: partsTotal, labor_total: new Prisma.Decimal(input.laborTotal), grand_total: grandTotal,
  };
  if (edit) {
    const claim = await tx.serviceOrder.updateMany({ where: { id: edit.id, tenant_id: tenantId, version: edit.version }, data: { ...data, status: edit.status, version: { increment: 1 }, ...(edit.status === 'CANCELLED' ? { device_password_encrypted: null } : {}) } });
    if (claim.count !== 1) throw new ServiceOrderError('A O.S. foi alterada por outro operador. Atualize a página.');
    await tx.serviceOrderPart.deleteMany({ where: { tenant_id: tenantId, service_order_id: edit.id } });
    if (parts.length) await tx.serviceOrderPart.createMany({ data: parts.map(p => ({ ...p, service_order_id: edit.id })) });
    return tx.serviceOrder.findFirstOrThrow({ where: { id: edit.id, tenant_id: tenantId }, include: orderInclude });
  }
  const tenant = await tx.tenant.update({ where: { id: tenantId }, data: { service_sequence: { increment: 1 } }, select: { service_sequence: true } });
  const created = await tx.serviceOrder.create({ data: { ...data, tenant_id: tenantId, number: tenant.service_sequence } });
  if (parts.length) await tx.serviceOrderPart.createMany({ data: parts.map(p => ({ ...p, service_order_id: created.id })) });
  return tx.serviceOrder.findFirstOrThrow({ where: { id: created.id, tenant_id: tenantId }, include: orderInclude });
}
