import { INVENTORY_LABELS, type InventoryFlag } from '@/lib/inventory-alerts';

export default function InventoryAlertBadges({ flags }: { flags: InventoryFlag[] }) {
  return <span className="flex flex-wrap gap-1">{flags.map(flag => <span key={flag} className={`rounded-full px-2 py-1 text-xs font-medium ${flag === 'expired' || flag === 'out' ? 'bg-red-50 text-red-800' : flag === 'urgent' ? 'bg-orange-100 text-orange-900' : 'bg-amber-50 text-amber-900'}`}>{INVENTORY_LABELS[flag]}</span>)}</span>;
}
