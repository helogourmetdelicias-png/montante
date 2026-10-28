import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length > 120) return NextResponse.json({ error: 'Busca muito longa.' }, { status: 400 });
  const products = await prisma.product.findMany({ where: { tenant_id: session.user.tenantId, is_active: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, price: true, cost_price: true, stock_quantity: true, sell_by_fraction: true }, orderBy: { name: 'asc' }, take: 20 });
  return NextResponse.json({ products: products.map(p => ({ id: p.id, name: p.name, price: p.price.toFixed(2), costPrice: p.cost_price?.toFixed(2) ?? null, stock: p.stock_quantity.toString(), fractional: p.sell_by_fraction })) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
