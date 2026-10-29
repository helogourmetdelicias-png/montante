import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getInventoryAlerts } from '@/lib/inventory-alerts-server';
import { INVENTORY_FILTERS, INVENTORY_LABELS, inventoryDate, matchesInventoryFilter, type InventoryFilter } from '@/lib/inventory-alerts';
import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.user.role)) return NextResponse.json({ error: 'Acesso restrito à gestão da loja.' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const filter = params.get('filter') ?? 'all';
  const query = (params.get('q') ?? '').trim();
  if (!INVENTORY_FILTERS.includes(filter as InventoryFilter) || query.length > 100) return NextResponse.json({ error: 'Filtro inválido.' }, { status: 400 });
  const report = await getInventoryAlerts(prisma, session.user.tenantId);
  const rows = report.items.filter(item => matchesInventoryFilter(item, filter as InventoryFilter) && (!query || `${item.name} ${item.sku ?? ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))));
  if (rows.length > 10000) return NextResponse.json({ error: 'A exportação aceita até 10.000 produtos. Refine os filtros; nenhum arquivo parcial foi gerado.' }, { status: 422 });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Montante';
  const sheet = workbook.addWorksheet('Alertas', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = ['Produto', 'SKU', 'Categoria', 'Quantidade atual', 'Unidade', 'Estoque mínimo', 'Validade', 'Dias restantes', 'Lote', 'Alertas', 'Data da consulta'].map((header, index) => ({ header, key: String(index), width: [32, 20, 24, 18, 12, 18, 16, 18, 20, 55, 18][index] }));
  rows.forEach(item => sheet.addRow([item.name, item.sku ?? '', item.category ?? '', Number(item.stockQuantity), item.unitOfMeasure, item.stockMinAlert == null ? '' : Number(item.stockMinAlert), inventoryDate(item.attributes.expiryDate), item.daysUntilExpiry ?? '', item.attributes.lot ?? '', item.flags.map(flag => INVENTORY_LABELS[flag]).join(' · '), inventoryDate(report.today)]));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A3412' } };
  sheet.autoFilter = { from: 'A1', to: 'K1' };
  [4, 6].forEach(column => { sheet.getColumn(column).numFmt = '#,##0.###'; });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="alertas-estoque-validade-${report.today}.xlsx"`, 'Cache-Control': 'private, no-store' } });
}
