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

/** Explicit decimal entry: both 12,34 and 12.34 mean twelve reais and 34 cents. */
export function parseMoneyDecimal(raw: string): string | null {
  if (!raw) return '';
  if (!/^\d{0,8}([.,]\d{0,2})?$/.test(raw)) return null;
  const normalized = raw.replace(',', '.');
  if (normalized === '.') return '';
  const value = Number(normalized);
  return Number.isFinite(value) && value <= 99_999_999.99 ? value.toFixed(2) : null;
}
