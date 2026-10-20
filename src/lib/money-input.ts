/** Monetary typing uses cents: 1234 -> 12.34. Decimal separators are display-only. */
export function parseMoneyDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  if (digits.length > 10) return null;
  return (Number(digits) / 100).toFixed(2);
}

export function formatMoneyInput(value: string): string {
  if (!value) return '';
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}
