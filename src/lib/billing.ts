export const TRIAL_MONTHS = 3;
export const SALES_LIMIT = 500;
/** Registration anniversary in UTC, clamped to the final day of short months. */
export function addBillingMonths(anchor: Date, months: number): Date {
  const result = new Date(anchor);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), last));
  return result;
}
export function calculateBillingTier(totalSales: number) {
  if (!Number.isSafeInteger(totalSales) || totalSales < 0) throw new Error('Quantidade inválida.');
  return totalSales > SALES_LIMIT ? { label: 'Avançado', amount: '79.00' } : { label: 'Padrão', amount: '49.90' };
}
export function billingCycle(anchor: Date, now: Date) {
  let index = Math.max(0, (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth());
  if (addBillingMonths(anchor, index) > now) index = Math.max(0, index - 1);
  return { index, start: addBillingMonths(anchor, index), end: addBillingMonths(anchor, index + 1) };
}
export function completedSalesWhere(tenantId: string, start: Date, end: Date) {
  return { tenant_id: tenantId, status: 'completed', sold_at: { gte: start, lt: end } };
}
