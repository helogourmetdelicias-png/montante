import { businessDateKey } from './cash-register/business-day';

export const INVENTORY_FILTERS = ['all', 'low', 'out', 'expiring', 'urgent', 'expired'] as const;
export type InventoryFilter = typeof INVENTORY_FILTERS[number];
export type InventoryFlag = Exclude<InventoryFilter, 'all'>;
export const INVENTORY_LABELS: Record<InventoryFilter, string> = {
  all: 'Todos os alertas', low: 'Estoque baixo', out: 'Sem estoque', expiring: 'Vencem em até 30 dias', urgent: 'Vencem em até 7 dias', expired: 'Vencidos',
};
export type InventoryProduct = {
  id: string; name: string; sku: string | null; unitOfMeasure: string; stockQuantity: string;
  stockMinAlert: string | null; category: string | null; attributes: { expiryDate?: string | null; lot?: string | null }; isActive: boolean;
};
export type InventoryItem = InventoryProduct & { flags: InventoryFlag[]; daysUntilExpiry: number | null };
export type InventorySummary = Record<InventoryFilter, number>;

export function productInventoryAlerts(product: Pick<InventoryProduct, 'stockQuantity' | 'stockMinAlert' | 'attributes' | 'isActive'>, today = businessDateKey(new Date())) {
  const flags: InventoryFlag[] = [];
  let daysUntilExpiry: number | null = null;
  if (!product.isActive) return { flags, daysUntilExpiry };
  const quantity = Number(product.stockQuantity);
  if (quantity <= 0) flags.push('out');
  else if (product.stockMinAlert != null && quantity < Number(product.stockMinAlert)) flags.push('low');
  const expiry = product.attributes?.expiryDate;
  if (quantity > 0 && expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    const date = new Date(`${expiry}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === expiry) {
      daysUntilExpiry = Math.round((date.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86400000);
      if (daysUntilExpiry < 0) flags.push('expired');
      else if (daysUntilExpiry <= 7) flags.push('urgent');
      else if (daysUntilExpiry <= 30) flags.push('expiring');
    }
  }
  return { flags, daysUntilExpiry };
}

export function matchesInventoryFilter(item: Pick<InventoryItem, 'flags'>, filter: InventoryFilter) {
  return filter === 'all' ? item.flags.length > 0 : filter === 'expiring' ? item.flags.some(flag => flag === 'expiring' || flag === 'urgent') : item.flags.includes(filter);
}

export function summarizeInventory(items: InventoryItem[]): InventorySummary {
  return Object.fromEntries(INVENTORY_FILTERS.map(filter => [filter, items.filter(item => matchesInventoryFilter(item, filter)).length])) as InventorySummary;
}

export function inventoryDate(value?: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'Não informada';
}
