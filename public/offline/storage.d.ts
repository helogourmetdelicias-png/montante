export type OfflineContext = {
  tenantId: string; userId: string; storeName: string; operatorName: string;
  preparedAt: string; expiresAt: string; ticket: string;
  products: Array<{ id: string; name: string; sku: string | null; barcode: string | null; price: string; stockQuantity: string; sellByFraction: boolean; unitOfMeasure: string; signature: string }>;
};
export type OfflineDraft = { mode: string; quickAmount: string; discount: string; notes: string; received?: string; items: Array<{ productId: string; quantityMilli: number; price: string }> };
export type OfflineRecord = { id: string; owner: string; sale: import('../../src/lib/offline/sale').OfflineSale; display: { totalCents: number; summary: string }; status: string; error: string; syncedAt: string | null; serverId?: string; saleNumber?: number };
export function ownerKey(context: { tenantId: string; userId: string }): string;
export function readMeta(key: string): Promise<any>;
export function writeMeta(key: string, value: unknown): Promise<void>;
export function saveContext(context: OfflineContext): Promise<void>;
export function readSales(owner: string): Promise<OfflineRecord[]>;
export function enqueueSale(owner: string, sale: OfflineRecord['sale'], display: OfflineRecord['display'], context: OfflineContext): Promise<void>;
export function updateSale(id: string, patch: Partial<OfflineRecord>): Promise<void>;
export function syncSales(owner: string): Promise<void>;
