import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getInventoryAlerts } from '@/lib/inventory-alerts-server';
import { INVENTORY_FILTERS, matchesInventoryFilter, type InventoryFilter } from '@/lib/inventory-alerts';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Apenas responsáveis e administradores podem consultar os alertas.' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const filter = params.get('filter') ?? 'all';
  const page = Number(params.get('page') ?? 1);
  const query = (params.get('q') ?? '').trim();
  if (!INVENTORY_FILTERS.includes(filter as InventoryFilter) || !Number.isInteger(page) || page < 1 || query.length > 100) return NextResponse.json({ error: 'Filtro inválido.' }, { status: 400 });
  const report = await getInventoryAlerts(prisma, session.user.tenantId);
  const items = report.items.filter(item => matchesInventoryFilter(item, filter as InventoryFilter) && (!query || `${item.name} ${item.sku ?? ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))));
  return NextResponse.json({ today: report.today, summary: report.summary, items: items.slice((page - 1) * 50, page * 50), total: items.length, page, pageSize: 50 }, { headers: { 'Cache-Control': 'private, no-store' } });
}
