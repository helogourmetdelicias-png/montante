import { snapshotCost } from '@/lib/sales/costs';
import { createHash } from 'node:crypto';
import { isCurrentBusinessDay } from '@/lib/cash-register/business-day';
import { auth } from '@/auth';
import { brandKey } from '@/lib/brand-commission';
import { runSerializableTransaction } from '@/lib/database/transactions';
import { prisma } from '@/lib/prisma';
import { releaseExpiredSales } from '@/lib/sales/reservations';
import { createSaleSchema, type CreateSaleInput } from '@/lib/validations/sale';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESERVATION_MINUTES = 15;

class SaleInputError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

function getRequestHash(items: Array<{ productId: string; quantityMilli: number }>, discountCents: number, customerId?: string, quickAmount?: number, notes?: string) {
  return createHash('sha256').update(JSON.stringify({ items, discountCents, ...(customerId ? { customerId } : {}), ...(quickAmount !== undefined ? { quickAmountCents: Math.round(quickAmount * 100) } : {}), ...(notes ? { notes } : {}) })).digest('hex');
}

function serializeSale(sale: {
  id: string;
  sale_number: number;
  status: string;
  is_quick_sale: boolean;
  total_amount: Prisma.Decimal;
  amount_received: Prisma.Decimal | null;
  change_amount: Prisma.Decimal | null;
  discount_amount: Prisma.Decimal;
  customer_id: string | null;
  expires_at: Date | null;
  created_at: Date;
  items: Array<{ product_id: string; quantity: Prisma.Decimal; unit_price: Prisma.Decimal; total_price: Prisma.Decimal }>;
}) {
  return {
    id: sale.id,
    saleNumber: sale.sale_number,
    status: sale.status,
    mode: sale.is_quick_sale ? 'quick' : 'advanced',
    totalAmount: sale.total_amount.toFixed(2),
    discountAmount: sale.discount_amount.toFixed(2),
    customerId: sale.customer_id,
    amountReceived: sale.amount_received?.toFixed(2) ?? null,
    changeAmount: sale.change_amount?.toFixed(2) ?? null,
    expiresAt: sale.expires_at,
    createdAt: sale.created_at,
    items: sale.items.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unit_price.toFixed(2),
      totalPrice: item.total_price.toFixed(2),
    })),
  };
}

function aggregateItems(input: CreateSaleInput) {
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    const quantityMilli = Math.round(item.quantity * 1000);
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + quantityMilli);
  }
  const items = Array.from(quantities, ([productId, quantityMilli]) => ({ productId, quantityMilli }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
  return items;
}

export async function GET(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Entre na sua conta para consultar as vendas.' }, { status: 401 });

  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? '1');
  const limit = Number(url.searchParams.get('limit') ?? '50');
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: 'Parâmetros de paginação inválidos.' }, { status: 400 });
  }

  const where: Prisma.SaleWhereInput = { tenant_id: tenantId };
  const [sales, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      include: { items: true },
      orderBy: [{ created_at: 'desc' }, { sale_number: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sale.count({ where }),
  ]);

  return NextResponse.json({ sales: sales.map(serializeSale), page, limit, total });
}

export async function POST(request: Request) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) return NextResponse.json({ error: 'Entre na sua conta para iniciar uma venda.' }, { status: 401 });

  const parsed = createSaleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Confira os dados da venda.', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const items = aggregateItems(input);
  if (items.some((item) => item.quantityMilli > 9_999_999_999)) {
    return NextResponse.json({ error: 'A quantidade total por produto excede o limite permitido.' }, { status: 400 });
  }
  const discountCents = Math.round(input.discountAmount * 100);
  const requestHash = getRequestHash(items, discountCents, input.customerId, input.quickAmount, input.notes);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000);

  try {
    const result = await runSerializableTransaction(async (tx) => {
      await releaseExpiredSales(tx, tenantId, now);

      const existing = await tx.sale.findUnique({
        where: { tenant_id_idempotency_key: { tenant_id: tenantId, idempotency_key: input.idempotencyKey } },
        include: { items: true },
      });
      if (existing) {
        if (existing.request_hash !== requestHash) throw new SaleInputError('Esta chave de idempotência já foi usada com outros itens.', 409);
        return { sale: existing, replayed: true };
      }

      // Associate every new sale with the operator's active drawer and block checkout without one.
      if (input.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: input.customerId, tenant_id: tenantId, isActive: true }, select: { id: true } });
        if (!customer) throw new SaleInputError('Cliente não encontrado ou inativo nesta loja.', 404);
      }
      const cashRegister = await tx.cashRegisterSession.findFirst({
        where: { tenant_id: tenantId, user_id: userId, status: 'OPEN' },
        select: { id: true, opened_at: true },
      });
      if (!cashRegister) throw new SaleInputError('Abra o caixa antes de iniciar uma venda.', 409);
      if (!isCurrentBusinessDay(cashRegister.opened_at, now)) throw new SaleInputError('Feche o caixa do dia anterior e abra o caixa de hoje antes de iniciar uma venda.', 409);

      const productIds = items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { tenant_id: tenantId, id: { in: productIds }, is_active: true },
        select: { id: true, price: true, cost_price: true, stock_quantity: true, sell_by_fraction: true, brand: true, category: true },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      if (products.length !== items.length) throw new SaleInputError('Um ou mais produtos não existem ou estão inativos nesta loja.', 404);

      const rules = await tx.brandCommission.findMany({ where: { tenant_id: tenantId } });
      const rates = new Map(rules.map(rule => [rule.brand_key, rule.rate]));
      const saleItems: Array<{ product_id: string; quantity: Prisma.Decimal; unit_price: Prisma.Decimal; total_price: Prisma.Decimal; catalog_snapshot: boolean; brand_snapshot: string | null; category_snapshot: string | null; commission_rate: Prisma.Decimal | null }> = [];
      let totalAmount = new Prisma.Decimal(input.mode === 'quick' ? input.quickAmount! : 0);
      for (const item of items) {
        const product = productsById.get(item.productId)!;
        const quantity = new Prisma.Decimal(item.quantityMilli).div(1000);
        if (!product.sell_by_fraction && !quantity.isInteger()) {
          throw new SaleInputError('Este produto só pode ser vendido em unidades inteiras.');
        }

        const lineTotal = product.price.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        totalAmount = totalAmount.plus(lineTotal);
        saleItems.push({
          product_id: product.id,
          catalog_snapshot: true, brand_snapshot: product.brand, category_snapshot: product.category,
          commission_rate: product.brand ? rates.get(brandKey(product.brand)) ?? null : null,
          quantity,
          unit_price: product.price,
          total_price: lineTotal,
        });
      }
      const discountAmount = new Prisma.Decimal(discountCents).div(100);
      if (discountAmount.greaterThan(totalAmount)) throw new SaleInputError('O desconto não pode ser maior que o subtotal.');
      totalAmount = totalAmount.minus(discountAmount);
      if (totalAmount.greaterThan('99999999.99')) throw new SaleInputError('O total da venda excede o limite permitido.');

      for (const item of saleItems) {
        const reserved = await tx.product.updateMany({
          where: { id: item.product_id, tenant_id: tenantId, is_active: true, stock_quantity: { gte: item.quantity } },
          data: { stock_quantity: { decrement: item.quantity } },
        });
        if (reserved.count !== 1) throw new SaleInputError('Estoque insuficiente para um ou mais produtos.', 409);
      }

      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { sales_sequence: { increment: 1 } },
        select: { sales_sequence: true },
      });

      const sale = await tx.sale.create({
        data: {
          tenant_id: tenantId,
          sale_number: tenant.sales_sequence,
          status: 'pending',
          is_quick_sale: input.mode === 'quick',
          cost_total: input.mode === 'quick' ? null : snapshotCost(items.map(item => ({ quantity: new Prisma.Decimal(item.quantityMilli).div(1000), unitCost: productsById.get(item.productId)!.cost_price }))),
          total_amount: totalAmount,
          discount_amount: discountAmount,
          idempotency_key: input.idempotencyKey,
          request_hash: requestHash,
          expires_at: expiresAt,
          cash_register_session_id: cashRegister.id,
          customer_id: input.customerId,
          notes: input.notes || null,
          items: { create: saleItems },
        },
        include: { items: true },
      });

      return { sale, replayed: false };
    });

    return NextResponse.json({ sale: serializeSale(result.sale), replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof SaleInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if ((error as { code?: string })?.code === 'P2002') {
      const existing = await prisma.sale.findUnique({
        where: { tenant_id_idempotency_key: { tenant_id: tenantId, idempotency_key: input.idempotencyKey } },
        include: { items: true },
      });
      if (existing?.request_hash === requestHash) {
        return NextResponse.json({ sale: serializeSale(existing), replayed: true }, { status: 200 });
      }
      if (existing) return NextResponse.json({ error: 'Esta chave de idempotência já foi usada com outros itens.' }, { status: 409 });
    }
    console.error('Falha ao iniciar venda:', error);
    return NextResponse.json({ error: 'Não foi possível iniciar a venda.' }, { status: 500 });
  }
}
