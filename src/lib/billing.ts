import { Decimal } from '@prisma/client/runtime/library';

type BillingTier = {
  label: string;
  amount: Decimal;
};

/**
 * Regra de negócio: calcula a faixa de cobrança mensal do SaaS
 * baseada no total de vendas realizadas no período.
 *
 * < 500 vendas  -> R$ 10,00 (Starter)
 * 500 a 1000   -> R$ 24,90 (Grow)
 * > 1000        -> R$ 49,00 (Pro — teto máximo)
 */
export function calculateBillingTier(totalSales: number): BillingTier {
  if (totalSales < 500) {
    return { label: 'Starter', amount: new Decimal('10.00') };
  }
  if (totalSales <= 1000) {
    return { label: 'Grow', amount: new Decimal('24.90') };
  }
  return { label: 'Pro', amount: new Decimal('49.00') };
}

/**
 * Conta o total de vendas de um tenant em um mês de referência.
 * @param prismaClient - instância do PrismaClient
 * @param tenantId - ID do tenant
 * @param referenceMonth - formato "YYYY-MM", ex: "2025-01"
 */
export async function countMonthlySales(
  prismaClient: any,
  tenantId: string,
  referenceMonth: string
): Promise<number> {
  const [year, month] = referenceMonth.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const count = await prismaClient.sale.count({
    where: {
      tenant_id: tenantId,
      status: 'completed',
      sold_at: { gte: startDate, lt: endDate },
    },
  });

  return count;
}
