import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { createProductSchema } from '@/lib/validations/product';

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

async function getSessionAccess() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return { authorized: false as const, status: 401 as const };
  return {
    authorized: true as const,
    tenantId,
    role: session.user.role,
  };
}

function hasManagementAccess(role: string) {
  return ['owner', 'admin'].includes(role);
}

export async function GET(request: Request) {
  const access = await getSessionAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Entre na sua conta para acessar os produtos.' }, { status: access.status });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const page = Number(url.searchParams.get('page') ?? '1');
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const includeInactive = url.searchParams.get('includeInactive') === 'true';
  if (query.length > 100 || !Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: 'Parâmetros de pesquisa ou paginação inválidos.' }, { status: 400 });
  }
  if (includeInactive && !hasManagementAccess(access.role)) {
    return NextResponse.json({ error: 'Somente responsáveis e administradores podem consultar produtos inativos.' }, { status: 403 });
  }

  const where: Prisma.ProductWhereInput = {
    tenant_id: access.tenantId,
    ...(includeInactive ? {} : { is_active: true }),
    ...(query ? {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { barcode: { contains: query, mode: 'insensitive' } },
      ],
    } : {}),
  };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    products: products.map(toProductResponse),
    page,
    limit,
    total,
  });
}

export async function POST(request: Request) {
  const access = await getSessionAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: 'Entre na sua conta para cadastrar produtos.' }, { status: access.status });
  }
  if (!hasManagementAccess(access.role)) {
    return NextResponse.json({ error: 'Somente responsáveis e administradores podem cadastrar produtos.' }, { status: 403 });
  }

  const parsed = createProductSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Confira os dados do produto.', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const sku = cleanCode(input.sku);
  const barcode = cleanCode(input.barcode);
  const duplicateConditions = [
    ...(sku ? [{ sku: { equals: sku, mode: 'insensitive' as const } }] : []),
    ...(barcode ? [{ barcode: { equals: barcode, mode: 'insensitive' as const } }] : []),
  ];
  const duplicate = duplicateConditions.length
    ? await prisma.product.findFirst({
      where: { tenant_id: access.tenantId, OR: duplicateConditions },
      select: { id: true },
    })
    : null;
  if (duplicate) {
    return NextResponse.json({ error: 'Já existe um produto desta loja com esse SKU ou código de barras.' }, { status: 409 });
  }

  const product = await prisma.product.create({
    data: {
      tenant_id: access.tenantId,
      name: input.name,
      description: cleanText(input.description),
      sku,
      barcode,
      unit_of_measure: input.unitOfMeasure,
      sell_by_fraction: input.sellByFraction,
      price: decimal(input.price),
      cost_price: input.costPrice == null ? null : decimal(input.costPrice),
      stock_quantity: decimal(input.stockQuantity),
      stock_min_alert: input.stockMinAlert == null ? null : decimal(input.stockMinAlert),
      stock_aisle: cleanText(input.stockAisle),
      stock_shelf: cleanText(input.stockShelf),
      category: cleanText(input.category),
      brand: cleanText(input.brand),
      is_active: input.isActive,
    },
  });

  return NextResponse.json({ product: toProductResponse(product) }, { status: 201 });
}
