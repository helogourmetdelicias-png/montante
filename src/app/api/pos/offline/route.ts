import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { signOffline, ticketValue, productValue, OFFLINE_WINDOW_MS } from '@/lib/offline/signing';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only sale metadata is stored on the device: no customers or gateway credentials. */
export async function GET() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) return NextResponse.json({ error: 'Entre na loja para preparar o modo offline.' }, { status: 401 });
  const preparedAt = new Date().toISOString();
  const [tenant, products] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.product.findMany({ where: { tenant_id: tenantId, is_active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, sku: true, barcode: true, price: true, stock_quantity: true, sell_by_fraction: true, unit_of_measure: true } }),
  ]);
  const ticket = signOffline(ticketValue(tenantId, userId, preparedAt));
  return NextResponse.json({
    tenantId, userId, storeName: tenant?.name ?? 'Loja', operatorName: session.user.name ?? 'Operador',
    preparedAt, expiresAt: new Date(Date.parse(preparedAt) + OFFLINE_WINDOW_MS).toISOString(), ticket,
    products: products.map(product => ({
      id: product.id, name: product.name, sku: product.sku, barcode: product.barcode,
      price: product.price.toFixed(2), stockQuantity: product.stock_quantity.toFixed(3),
      sellByFraction: product.sell_by_fraction, unitOfMeasure: product.unit_of_measure,
      signature: signOffline(productValue(ticket, product.id, product.price.toFixed(2), product.sell_by_fraction)),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
