import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { updateProductSchema } from '@/lib/validations/product';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toProductResponse(product: {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  unit_of_measure: string;
  sell_by_fraction: boolean;
  price: Prisma.Decimal;
  cost_price: Prisma.Decimal | null;
  stock_quantity: Prisma.Decimal;
  stock_min_alert: Prisma.Decimal | null;
  stock_aisle: string | null;
  stock_shelf: string | null;
  category: string | null;
  brand: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    sku: product.sku,
    barcode: product.barcode,
    unitOfMeasure: product.unit_of_measure,
    sellByFraction: product.sell_by_fraction,
    price: product.price.toFixed(2),
    costPrice: product.cost_price?.toFixed(2) ?? null,
    stockQuantity: product.stock_quantity.toFixed(3),
    stockMinAlert: product.stock_min_alert?.toFixed(3) ?? null,
    stockAisle: product.stock_aisle,
    stockShelf: product.stock_shelf,
    category: product.category,
    brand: product.brand,
    isActive: product.is_active,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}

function cleanCode(value: string | null | undefined) {
  return cleanText(value)?.toUpperCase() ?? null;
}

function decimal(value: number) {
  return new Prisma.Decimal(value.toString());
}

async function getManagementAccess() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return { authorized: false as const, status: 401 as const };
  if (!['owner', 'admin'].includes(session.user.role)) {
    return { authorized: false as const, status: 403 as const };
  }
  return { authorized: true as const, tenantId };
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const access = await getManagementAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado para editar produtos.' }, { status: access.status });
  }

  const parsed = updateProductSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Confira os dados para atualizar o produto.', details: parsed.error.flatten() }, { status: 400 });
  }

  const current = await prisma.product.findFirst({
    where: { id: context.params.id, tenant_id: access.tenantId },
  });
  if (!current) return NextResponse.json({ error: 'Produto não encontrado nesta loja.' }, { status: 404 });

  const input = parsed.data;
  const resultingSellByFraction = input.sellByFraction ?? current.sell_by_fraction;
  const resultingStockQuantity = input.stockQuantity ?? Number(current.stock_quantity);
  if (!resultingSellByFraction && !Number.isInteger(resultingStockQuantity)) {
    return NextResponse.json({ error: 'Produtos vendidos por unidade inteira precisam ter estoque inteiro.' }, { status: 400 });
  }

  const sku = input.sku === undefined ? current.sku : cleanCode(input.sku);
  const barcode = input.barcode === undefined ? current.barcode : cleanCode(input.barcode);
  const duplicateConditions = [
    ...(input.sku !== undefined && sku ? [{ sku: { equals: sku, mode: 'insensitive' as const } }] : []),
    ...(input.barcode !== undefined && barcode ? [{ barcode: { equals: barcode, mode: 'insensitive' as const } }] : []),
  ];
  const duplicate = duplicateConditions.length
    ? await prisma.product.findFirst({
      where: { tenant_id: access.tenantId, id: { not: current.id }, OR: duplicateConditions },
      select: { id: true },
    })
    : null;
  if (duplicate) {
    return NextResponse.json({ error: 'Já existe outro produto desta loja com esse SKU ou código de barras.' }, { status: 409 });
  }

  const product = await prisma.product.update({
    where: { id: current.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: cleanText(input.description) } : {}),
      ...(input.sku !== undefined ? { sku } : {}),
      ...(input.barcode !== undefined ? { barcode } : {}),
      ...(input.unitOfMeasure !== undefined ? { unit_of_measure: input.unitOfMeasure } : {}),
      ...(input.sellByFraction !== undefined ? { sell_by_fraction: input.sellByFraction } : {}),
      ...(input.price !== undefined ? { price: decimal(input.price) } : {}),
      ...(input.costPrice !== undefined ? { cost_price: input.costPrice === null ? null : decimal(input.costPrice) } : {}),
      ...(input.stockQuantity !== undefined ? { stock_quantity: decimal(input.stockQuantity) } : {}),
      ...(input.stockMinAlert !== undefined ? { stock_min_alert: input.stockMinAlert === null ? null : decimal(input.stockMinAlert) } : {}),
      ...(input.stockAisle !== undefined ? { stock_aisle: cleanText(input.stockAisle) } : {}),
      ...(input.stockShelf !== undefined ? { stock_shelf: cleanText(input.stockShelf) } : {}),
      ...(input.category !== undefined ? { category: cleanText(input.category) } : {}),
      ...(input.brand !== undefined ? { brand: cleanText(input.brand) } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    },
  });

  return NextResponse.json({ product: toProductResponse(product) });
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const access = await getManagementAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Acesso não autorizado para desativar produtos.' }, { status: access.status });
  }

  const product = await prisma.product.findFirst({
    where: { id: context.params.id, tenant_id: access.tenantId },
  });
  if (!product) return NextResponse.json({ error: 'Produto não encontrado nesta loja.' }, { status: 404 });

  const deactivated = await prisma.product.update({
    where: { id: product.id },
    data: { is_active: false },
  });
  return NextResponse.json({ product: toProductResponse(deactivated) });
}
