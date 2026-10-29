import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { getNicheCategories } from '@/lib/business-niche';
import { createCatalogWorkbook, readCatalogWorkbook, EXPORT_MAX_ROWS, IMPORT_MAX_BYTES, type CatalogKind, type ImportIssue } from '@/lib/catalog-excel';

type ParsedWorkbook = Awaited<ReturnType<typeof readCatalogWorkbook>>;
class ImportConflict extends Error {
  constructor(readonly issues: ImportIssue[]) { super('Existem duplicidades na planilha. Nenhum cadastro foi importado.'); }
}

async function access() {
  const session = await auth();
  if (!session?.user?.tenantId) return { response: NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 }) };
  if (!['owner', 'admin'].includes(session.user.role)) return { response: NextResponse.json({ error: 'Somente responsáveis e administradores podem importar ou exportar cadastros.' }, { status: 403 }) };
  return { tenantId: session.user.tenantId };
}

async function duplicateIssues(tx: Pick<typeof prisma, 'customer' | 'product'>, kind: CatalogKind, tenantId: string, parsed: ParsedWorkbook): Promise<ImportIssue[]> {
  if (kind === 'customers') {
    const documents = parsed.customers.flatMap(row => row.data.document ? [row.data.document] : []);
    const existing = await tx.customer.findMany({ where: { tenant_id: tenantId, document: { in: documents } }, select: { document: true } });
    const keys = new Set(existing.map(row => row.document));
    return parsed.customers.filter(row => row.data.document && keys.has(row.data.document)).map(row => ({ row: row.row, message: 'CPF/CNPJ já cadastrado nesta loja, inclusive entre os inativos.' }));
  }
  const skus = parsed.products.flatMap(row => row.data.sku ? [row.data.sku] : []);
  const barcodes = parsed.products.flatMap(row => row.data.barcode ? [row.data.barcode] : []);
  const existing = await tx.product.findMany({ where: { tenant_id: tenantId, OR: [{ sku: { in: skus, mode: 'insensitive' } }, { barcode: { in: barcodes, mode: 'insensitive' } }] }, select: { sku: true, barcode: true } });
  const skuSet = new Set(existing.map(row => row.sku?.toUpperCase())), barcodeSet = new Set(existing.map(row => row.barcode?.toUpperCase()));
  return parsed.products.filter(row => row.data.sku && skuSet.has(row.data.sku) || row.data.barcode && barcodeSet.has(row.data.barcode)).map(row => ({ row: row.row, message: 'SKU ou código de barras já cadastrado nesta loja, inclusive entre os inativos.' }));
}

export async function exportCatalog(request: Request, kind: CatalogKind) {
  const identity = await access();
  if (identity.response) return identity.response;
  const template = new URL(request.url).searchParams.get('template') === 'true';
  try {
    let rows: Record<string, unknown>[] = [];
    if (!template && kind === 'customers') rows = await prisma.customer.findMany({ where: { tenant_id: identity.tenantId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: EXPORT_MAX_ROWS + 1,
      select: { name: true, document: true, email: true, phone: true, zipCode: true, street: true, number: true, neighborhood: true, city: true, state: true, isActive: true } });
    if (!template && kind === 'products') {
      const products = await prisma.product.findMany({ where: { tenant_id: identity.tenantId }, orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }], take: EXPORT_MAX_ROWS + 1 });
      rows = products.map(row => ({ name: row.name, sku: row.sku, barcode: row.barcode, unitOfMeasure: row.unit_of_measure, price: row.price,
        stockQuantity: row.stock_quantity, sellByFraction: row.sell_by_fraction, category: row.category, description: row.description, brand: row.brand,
        costPrice: row.cost_price, stockMinAlert: row.stock_min_alert, stockAisle: row.stock_aisle, stockShelf: row.stock_shelf, isActive: row.is_active,
        expiryDate: (row.attributes as { expiryDate?: string } | null)?.expiryDate ?? null, lot: (row.attributes as { lot?: string } | null)?.lot ?? null }));
    }
    if (rows.length > EXPORT_MAX_ROWS) return NextResponse.json({ error: 'A exportação aceita até 10.000 cadastros. Nenhum arquivo parcial foi gerado.' }, { status: 422 });
    const tenant = kind === 'products' ? await prisma.tenant.findUnique({ where: { id: identity.tenantId! }, select: { niche: true } }) : null;
    const buffer = await createCatalogWorkbook(kind, rows, getNicheCategories(tenant?.niche ?? null));
    return new Response(new Uint8Array(buffer), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${template ? 'modelo-' : ''}${kind === 'customers' ? 'clientes' : 'produtos'}.xlsx"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch { return NextResponse.json({ error: 'Não foi possível exportar a planilha.' }, { status: 500 }); }
}

/** Read a bounded multipart body so oversized uploads cannot be buffered without limit. */
async function uploadForm(request: Request) {
  if (!request.body) throw new Error('Selecione uma planilha .xlsx.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > IMPORT_MAX_BYTES + 65536) { await reader.cancel(); throw new Error('O arquivo deve ter no máximo 2 MB.'); }
    chunks.push(part.value);
  }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}

export async function importCatalog(request: Request, kind: CatalogKind) {
  const identity = await access();
  if (identity.response) return identity.response;
  let parsed: ParsedWorkbook;
  let action: FormDataEntryValue | null;
  try {
    const form = await uploadForm(request);
    action = form.get('action');
    if (!['preview', 'import'].includes(String(action))) throw new Error('Ação inválida.');
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.name.toLowerCase().endsWith('.xlsx') || file.size > IMPORT_MAX_BYTES) throw new Error('Selecione um arquivo .xlsx de até 2 MB.');
    parsed = await readCatalogWorkbook(kind, Buffer.from(await file.arrayBuffer()));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Planilha inválida.' }, { status: 400 }); }
  try {
    const errors = [...parsed.errors, ...await duplicateIssues(prisma, kind, identity.tenantId!, parsed)];
    if (errors.length) return NextResponse.json({ error: 'Corrija as linhas indicadas. Nenhum cadastro foi importado.', errors: errors.slice(0, 50), errorCount: errors.length }, { status: 422 });
    const items = kind === 'customers' ? parsed.customers : parsed.products;
    if (action === 'preview') return NextResponse.json({ count: items.length, sample: items.slice(0, 5).map(row => ({ row: row.row, name: row.data.name })) });
    const imported = await runSerializableTransaction(async tx => {
      const conflicts = await duplicateIssues(tx, kind, identity.tenantId!, parsed);
      if (conflicts.length) throw new ImportConflict(conflicts);
      if (kind === 'customers') return (await tx.customer.createMany({ data: parsed.customers.map(row => ({ ...row.data, tenant_id: identity.tenantId! })) })).count;
      return (await tx.product.createMany({ data: parsed.products.map(({ data }) => ({ tenant_id: identity.tenantId!, name: data.name, sku: data.sku, barcode: data.barcode,
        description: data.description || null, unit_of_measure: data.unitOfMeasure, sell_by_fraction: data.sellByFraction, price: data.price, cost_price: data.costPrice ?? null,
        stock_quantity: data.stockQuantity, stock_min_alert: data.stockMinAlert ?? null, stock_aisle: data.stockAisle || null, stock_shelf: data.stockShelf || null,
        category: data.category || null, brand: data.brand || null, attributes: data.attributes ?? {}, is_active: data.isActive })) })).count;
    });
    return NextResponse.json({ imported }, { status: 201 });
  } catch (error) {
    if (error instanceof ImportConflict) return NextResponse.json({ error: error.message, errors: error.issues.slice(0, 50) }, { status: 409 });
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'Um cadastro com os mesmos dados já foi criado. Valide a planilha novamente. Nenhum cadastro foi importado.' }, { status: 409 });
    return NextResponse.json({ error: 'A importação não foi concluída. Nenhum cadastro foi importado.' }, { status: 500 });
  }
}
