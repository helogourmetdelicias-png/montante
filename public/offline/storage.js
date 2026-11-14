// Shared by the normal PDV and the self-contained contingency screen.
const DB_NAME = 'montante-offline-v1';
export const ownerKey = context => `${context.tenantId}:${context.userId}`;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('meta');
      request.result.createObjectStore('sales', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Feche outras abas antigas para atualizar o modo offline.'));
  });
}

export async function readMeta(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readonly');
    const request = transaction.objectStore('meta').get(key);
    request.onsuccess = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function writeMeta(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readwrite');
    transaction.objectStore('meta').put(value, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Não foi possível salvar no aparelho.')); };
  });
}

export async function saveContext(context) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readwrite');
    transaction.objectStore('meta').put(context, `context:${ownerKey(context)}`);
    transaction.objectStore('meta').put(ownerKey(context), 'active');
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export async function readSales(owner) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sales', 'readonly');
    const request = transaction.objectStore('sales').getAll();
    request.onsuccess = () => resolve(request.result.filter(row => row.owner === owner).sort((a, b) => a.sale.occurredAt.localeCompare(b.sale.occurredAt)));
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => db.close();
  });
}

/** Atomic append + draft clear. An ID can never overwrite a previous sale. */
export async function enqueueSale(owner, sale, display, context) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sales', 'meta'], 'readwrite');
    const store = transaction.objectStore('sales');
    const request = store.getAll();
    let stockError = '';
    request.onsuccess = () => {
      for (const item of sale.items) {
        const product = context.products.find(product => product.id === item.productId);
        const used = request.result.filter(row => row.owner === owner && (row.status !== 'synced' || row.syncedAt > context.preparedAt))
          .reduce((sum, row) => sum + row.sale.items.filter(line => line.productId === item.productId).reduce((quantity, line) => quantity + line.quantityMilli, 0), 0);
        if (!product || used + item.quantityMilli > Math.round(Number(product.stockQuantity) * 1000)) {
          stockError = 'O estoque salvo no aparelho é insuficiente. Confira as quantidades.';
          transaction.abort(); return;
        }
      }
      try {
        store.add({ id: sale.id, owner, sale, display, status: 'pending', error: '', syncedAt: null });
        transaction.objectStore('meta').delete(`draft:${owner}`);
      } catch (error) { stockError = error.message; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(new Error(stockError || transaction.error?.message || 'A venda não foi salva. Não entregue o troco até tentar novamente.')); };
  });
}

export async function updateSale(id, patch) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sales', 'readwrite');
    const store = transaction.objectStore('sales');
    const request = store.get(id);
    request.onsuccess = () => {
      const row = request.result;
      // Another tab may have acknowledged the same sale already.
      if (row && row.status !== 'synced') store.put({ ...row, ...patch });
    };
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export async function syncSales(owner) {
  const run = async () => {
    const rows = await readSales(owner);
    for (const row of rows.filter(row => row.status !== 'synced')) {
      // Never send a former operator's queue from a switched browser session.
      if (await readMeta('active') !== owner) break;
      let response;
      try {
        response = await fetch('/api/pos/offline/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row.sale), redirect: 'error', signal: AbortSignal.timeout(20_000),
        });
        const result = await response.json();
        if (!response.ok) {
          await updateSale(row.id, { error: result.error ?? 'Confira a venda antes de enviar novamente.' });
          if ([401, 403].includes(response.status) || response.status >= 500) break;
          continue;
        }
        if (!result.sale?.id) throw new Error('Resposta de envio inválida.');
        await updateSale(row.id, { status: 'synced', error: '', syncedAt: new Date().toISOString(), serverId: result.sale.id, saleNumber: result.sale.saleNumber });
      } catch {
        // Lost acknowledgement is safe: the next send uses the SAME sale id.
        break;
      }
    }
    window.dispatchEvent(new Event('montante-offline-update'));
  };
  // Server idempotency still protects browsers without Web Locks.
  if (navigator.locks) return navigator.locks.request(`montante-sync:${owner}`, { ifAvailable: true }, lock => lock ? run() : undefined);
  return run();
}
