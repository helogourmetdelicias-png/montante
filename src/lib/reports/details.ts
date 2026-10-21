import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Group = { kind: string; name: string; revenue: Prisma.Decimal; commission: Prisma.Decimal; sale_count: bigint; unconfigured: bigint };
type CalendarGroup = { date: string; revenue: Prisma.Decimal; sale_count: bigint };

/** Allocates sale-level discounts in cents so groups reconcile with the sale total. */
export async function salesDetails(tenantId: string, start: Date, end: Date) {
  const [groups, days, months, credits, receipts, commissions, brands] = await Promise.all([
    prisma.$queryRaw<Group[]>(Prisma.sql`
      WITH lines AS (
        SELECT i.id, s.id AS sale_id, i.total_price,
          CASE WHEN i.catalog_snapshot THEN i.brand_snapshot ELSE p.brand END AS brand,
          CASE WHEN i.catalog_snapshot THEN i.category_snapshot ELSE p.category END AS category,
          i.commission_rate, s.discount_amount, s.total_amount + s.discount_amount AS gross,
          SUM(i.total_price) OVER (PARTITION BY s.id ORDER BY i.id) AS cumulative
        FROM "SaleItem" i JOIN "Sale" s ON s.id = i.sale_id
        JOIN "Product" p ON p.id = i.product_id AND p.tenant_id = s.tenant_id
        WHERE s.tenant_id = ${tenantId} AND s.status = 'completed' AND s.sold_at >= ${start} AND s.sold_at < ${end}
      ), net AS (
        SELECT *, total_price - CASE WHEN gross > 0 THEN
          (ROUND(discount_amount * 100 * cumulative / gross) - ROUND(discount_amount * 100 * (cumulative - total_price) / gross)) / 100 ELSE 0 END AS revenue FROM lines
      )
      SELECT 'brand' AS kind, COALESCE(NULLIF(UPPER(TRIM(brand)), ''), 'Sem marca') AS name,
        SUM(revenue) AS revenue, SUM(ROUND(revenue * COALESCE(commission_rate, 0) / 100, 2)) AS commission,
        COUNT(DISTINCT sale_id) AS sale_count, COUNT(*) FILTER (WHERE commission_rate IS NULL) AS unconfigured
      FROM net GROUP BY COALESCE(NULLIF(UPPER(TRIM(brand)), ''), 'Sem marca')
      UNION ALL
      SELECT 'category', COALESCE(NULLIF(TRIM(category), ''), 'Sem categoria'), SUM(revenue), 0::numeric,
        COUNT(DISTINCT sale_id), 0::bigint FROM net GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Sem categoria')
    `),
    prisma.$queryRaw<CalendarGroup[]>(Prisma.sql`SELECT to_char(sold_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date, SUM(total_amount) AS revenue, COUNT(*) AS sale_count FROM "Sale" WHERE tenant_id = ${tenantId} AND status = 'completed' AND sold_at >= ${start} AND sold_at < ${end} GROUP BY date ORDER BY revenue DESC, date ASC`),
    prisma.$queryRaw<CalendarGroup[]>(Prisma.sql`SELECT to_char(sold_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS date, SUM(total_amount) AS revenue, COUNT(*) AS sale_count FROM "Sale" WHERE tenant_id = ${tenantId} AND status = 'completed' AND sold_at >= ${start} AND sold_at < ${end} GROUP BY date ORDER BY revenue DESC, date ASC`),
    prisma.creditSale.aggregate({ where: { tenant_id: tenantId, sale: { is: { sold_at: { gte: start, lt: end } } } }, _sum: { amount: true } }),
    prisma.creditPayment.groupBy({ by: ['method'], where: { tenant_id: tenantId, created_at: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.brandCommission.findMany({ where: { tenant_id: tenantId }, orderBy: { brand: 'asc' } }),
    prisma.product.findMany({ where: { tenant_id: tenantId, brand: { not: null } }, distinct: ['brand'], select: { brand: true }, orderBy: { brand: 'asc' } }),
  ]);
  const mapGroup = (group: Group) => ({ name: group.name, revenue: group.revenue.toFixed(2), commission: group.commission.toFixed(2), saleCount: Number(group.sale_count), unconfiguredItems: Number(group.unconfigured) });
  const calendar = (row: CalendarGroup) => ({ date: row.date, revenue: row.revenue.toFixed(2), saleCount: Number(row.sale_count) });
  return {
    byBrand: groups.filter(group => group.kind === 'brand').sort((a, b) => b.revenue.comparedTo(a.revenue) || a.name.localeCompare(b.name)).map(mapGroup),
    byCategory: groups.filter(group => group.kind === 'category').sort((a, b) => b.revenue.comparedTo(a.revenue) || a.name.localeCompare(b.name)).map(mapGroup),
    bestDay: days[0] ? calendar(days[0]) : null, bestMonth: months[0] ? calendar(months[0]) : null,
    days: days.map(calendar), months: months.map(calendar),
    creditSales: credits._sum.amount?.toFixed(2) ?? '0.00',
    creditReceipts: receipts.map(row => ({ method: row.method.toLowerCase(), amount: row._sum.amount?.toFixed(2) ?? '0.00' })),
    commissionRules: commissions.map(row => ({ brand: row.brand, rate: row.rate.toFixed(2) })),
    brands: brands.flatMap(row => row.brand?.trim() ? [row.brand.trim()] : []),
  };
}
