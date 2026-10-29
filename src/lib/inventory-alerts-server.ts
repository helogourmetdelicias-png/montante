import { Prisma } from '@prisma/client';
import { businessDateKey } from './cash-register/business-day';
import { productInventoryAlerts, summarizeInventory, type InventoryItem, type InventoryProduct } from './inventory-alerts';

type Database = Pick<Prisma.TransactionClient, '$queryRaw'>;
type Row = { id: string; name: string; sku: string | null; unit_of_measure: string; stock_quantity: Prisma.Decimal; stock_min_alert: Prisma.Decimal | null; category: string | null; attributes: InventoryProduct['attributes'] | null };

/** One tenant-scoped candidate query covers the entire catalog, before UI pagination. */
export async function getInventoryAlerts(db: Database, tenantId: string, now = new Date()) {
  const today = businessDateKey(now);
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + 30);
  const lastDate = cutoff.toISOString().slice(0, 10);
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT id, name, sku, unit_of_measure, stock_quantity, stock_min_alert, category, attributes
    FROM "Product"
    WHERE tenant_id = ${tenantId} AND is_active = true AND (
      stock_quantity <= 0 OR (stock_min_alert IS NOT NULL AND stock_quantity < stock_min_alert)
      OR (stock_quantity > 0 AND attributes->>'expiryDate' >= '0000-01-01' AND attributes->>'expiryDate' <= ${lastDate})
    )
    ORDER BY name, id
  `);
  const priority = { expired: 0, out: 1, urgent: 2, low: 3, expiring: 4 };
  const items: InventoryItem[] = rows.map(row => {
    const product: InventoryProduct = { id: row.id, name: row.name, sku: row.sku, unitOfMeasure: row.unit_of_measure,
      stockQuantity: row.stock_quantity.toFixed(3), stockMinAlert: row.stock_min_alert?.toFixed(3) ?? null,
      category: row.category, attributes: row.attributes ?? {}, isActive: true };
    return { ...product, ...productInventoryAlerts(product, today) };
  }).filter(item => item.flags.length > 0);
  items.sort((a, b) => Math.min(...a.flags.map(flag => priority[flag])) - Math.min(...b.flags.map(flag => priority[flag])) || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  return { today, items, summary: summarizeInventory(items) };
}
