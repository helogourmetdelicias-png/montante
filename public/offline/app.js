import { ownerKey, readMeta, writeMeta, readSales, enqueueSale, syncSales } from '/offline/storage.js';

const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const date = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
let context, owner, records = [], mode = 'quick', lines = [], saving = false, syncing = false, draftTimer;
const cents = value => {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(normalized)) return 0;
  return Math.round(Number(normalized) * 100);
};
const lineCents = (product, quantityMilli) => Number((BigInt(product.price.replace('.', '')) * BigInt(quantityMilli) + 500n) / 1000n);
function total() { return mode === 'quick' ? cents($('quick-amount').value) : lines.reduce((sum, line) => sum + lineCents(line.product, line.quantityMilli), 0) - cents($('discount').value); }
const expired = () => !context || Date.now() > Date.parse(context.expiresAt) || Date.now() < Date.parse(context.preparedAt) - 300_000;
function notice(message) { $('notice').textContent = message; }
function available(product) {
  const used = records.filter(row => row.status !== 'synced' || row.syncedAt > context.preparedAt)
    .reduce((sum, row) => sum + row.sale.items.filter(item => item.productId === product.id).reduce((sum, item) => sum + item.quantityMilli, 0), 0);
  return Math.max(0, Math.round(Number(product.stockQuantity) * 1000) - used);
}
function updateTotals() {
  const amount = total(), received = cents($('received').value);
  $('total').textContent = money(Math.max(0, amount));
  $('change').textContent = received >= amount && amount > 0 ? money(received - amount) : 'Valor insuficiente';
  $('save').disabled = saving || expired() || amount <= 0 || amount > 9_999_999_999 || received < amount ||
    (mode === 'advanced' && (!lines.length || lines.some(line => line.quantityMilli < 1 || line.quantityMilli > available(line.product) || (!line.product.sellByFraction && line.quantityMilli % 1000))));
}
function renderStatus() {
  const pending = records.filter(row => row.status !== 'synced');
  $('status').textContent = `${navigator.onLine ? 'Conexão disponível' : 'Sem internet'} · ${pending.length} venda(s) aguardando envio${syncing ? ' · Enviando…' : ''}. Catálogo salvo em ${date(context.preparedAt)}.`;
  $('sale-fields').disabled = expired();
  if (expired()) $('status').textContent += ' Catálogo vencido ou relógio incorreto. Conecte e volte ao PDV para preparar novamente. As vendas anteriores continuam guardadas.';
  $('sync').disabled = syncing || !navigator.onLine || !pending.length;
  $('backup').disabled = !records.length;
  updateTotals();
}
function renderHistory() {
  $('sales').replaceChildren();
  if (!records.length) { $('sales').textContent = 'Nenhuma venda offline registrada neste aparelho para este operador.'; return; }
  for (const row of [...records].reverse()) {
    const record = document.createElement('article'); record.className = 'record';
    const title = document.createElement('strong'); title.textContent = `${money(row.display.totalCents)} · ${date(row.sale.occurredAt)}`;
    const status = document.createElement('span'); status.className = row.status === 'synced' ? 'synced' : 'badge'; status.textContent = row.status === 'synced' ? ` · Enviada · venda #${row.saleNumber}` : ' · Aguardando envio';
    const detail = document.createElement('small'); detail.textContent = `${row.display.summary} · Dinheiro: ${money(row.sale.receivedCents)} · Troco: ${money(row.sale.receivedCents - row.display.totalCents)}`;
    const reference = document.createElement('small'); reference.textContent = `Referência: ${row.id}`;
    record.append(title, status, detail, reference);
    if (row.error) { const error = document.createElement('p'); error.className = 'error'; error.textContent = row.error; record.append(error); }
    $('sales').append(record);
  }
}
function renderProducts() {
  const search = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const filtered = context.products.filter(product => [product.name, product.sku, product.barcode].some(value => value?.toLocaleLowerCase('pt-BR').includes(search))).slice(0, 40);
  $('products').replaceChildren();
  for (const product of filtered) {
    const button = document.createElement('button'); button.type = 'button'; button.disabled = expired() || available(product) <= 0;
    button.append(document.createTextNode(`${product.name} · ${money(Math.round(Number(product.price) * 100))}`));
    const stock = document.createElement('small'); stock.textContent = `Disponível no aparelho: ${available(product) / 1000} ${product.unitOfMeasure}`; button.append(stock);
    button.addEventListener('click', () => addProduct(product)); $('products').append(button);
  }
  if (!filtered.length) $('products').textContent = 'Nenhum produto encontrado no catálogo salvo.';
}
function addProduct(product) {
  const line = lines.find(line => line.product.id === product.id);
  if (lines.length >= 200 && !line) { notice('O limite é de 200 produtos por venda.'); return; }
  if ((line?.quantityMilli ?? 0) + 1000 > available(product)) { notice('A quantidade supera o estoque salvo no aparelho.'); return; }
  if (line) line.quantityMilli += 1000; else lines.push({ product, quantityMilli: 1000 });
  renderCart(); updateTotals(); saveDraft();
}
function renderCart() {
  $('cart').replaceChildren();
  for (const line of lines) {
    const row = document.createElement('div'); row.className = 'line';
    const label = document.createElement('div'); label.textContent = line.product.name;
    const price = document.createElement('small'); price.textContent = money(lineCents(line.product, line.quantityMilli)); label.append(price);
    const quantity = document.createElement('input'); quantity.type = 'number'; quantity.min = line.product.sellByFraction ? '0.001' : '1'; quantity.step = line.product.sellByFraction ? '0.001' : '1'; quantity.value = String(line.quantityMilli / 1000); quantity.setAttribute('aria-label', `Quantidade de ${line.product.name}`);
    quantity.addEventListener('input', () => { const value = Number(quantity.value); line.quantityMilli = Number.isFinite(value) ? Math.max(0, Math.round(value * 1000)) : 0; price.textContent = money(lineCents(line.product, line.quantityMilli)); updateTotals(); saveDraft(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover'; remove.setAttribute('aria-label', `Remover ${line.product.name}`);
    remove.addEventListener('click', () => { lines = lines.filter(item => item !== line); renderCart(); updateTotals(); saveDraft(); });
    row.append(label, quantity, remove); $('cart').append(row);
  }
}
function setMode(next) {
  mode = next;
  $('quick-mode').setAttribute('aria-pressed', String(mode === 'quick')); $('product-mode').setAttribute('aria-pressed', String(mode === 'advanced'));
  $('quick-fields').hidden = mode !== 'quick'; $('product-fields').hidden = mode !== 'advanced';
  updateTotals(); if (mode === 'advanced') renderProducts();
}
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => writeMeta(`draft:${owner}`, { mode, quickAmount: $('quick-amount').value, discount: $('discount').value, notes: $('notes').value, received: $('received').value, items: lines.map(line => ({ productId: line.product.id, quantityMilli: line.quantityMilli, price: line.product.price })) }).catch(() => notice('Não foi possível guardar a edição. As vendas já concluídas permanecem salvas.')), 200);
}
async function reloadRecords() {
  if (await readMeta('active') !== owner) {
    $('workspace').hidden = true; $('sales').replaceChildren(); $('sync').disabled = true; $('backup').disabled = true;
    $('status').textContent = 'O operador mudou ou saiu da conta. Volte ao PDV com internet para continuar. As vendas anteriores permanecem guardadas.';
    context = null; owner = null; return;
  }
  records = await readSales(owner); renderStatus(); renderHistory(); if (mode === 'advanced') renderProducts();
}
async function sync() {
  if (syncing || !navigator.onLine || !owner) return;
  syncing = true; renderStatus();
  try { await syncSales(owner); await reloadRecords(); }
  catch { notice('Não foi possível acessar as vendas guardadas. Tente novamente.'); }
  finally { syncing = false; if (context) renderStatus(); }
}
$('quick-mode').addEventListener('click', () => { setMode('quick'); saveDraft(); });
$('product-mode').addEventListener('click', () => { setMode('advanced'); saveDraft(); });
for (const id of ['quick-amount', 'discount', 'received', 'notes']) $(id).addEventListener('input', () => { updateTotals(); saveDraft(); });
$('search').addEventListener('input', renderProducts);
$('search').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return; event.preventDefault();
  const query = $('search').value.trim().toLowerCase();
  const exact = context.products.find(product => product.barcode?.toLowerCase() === query || product.sku?.toLowerCase() === query);
  if (exact) { addProduct(exact); $('search').value = ''; renderProducts(); }
});
$('save').addEventListener('click', async () => {
  if (saving || $('save').disabled) return;
  saving = true; updateTotals(); clearTimeout(draftTimer);
  try {
    if (await readMeta('active') !== owner) throw new Error('O operador mudou. Volte ao PDV antes de continuar.');
    const amount = total();
    const sale = { id: crypto.randomUUID(), tenantId: context.tenantId, userId: context.userId, preparedAt: context.preparedAt, ticket: context.ticket, occurredAt: new Date().toISOString(), mode, quickCents: mode === 'quick' ? amount : 0, discountCents: mode === 'advanced' ? cents($('discount').value) : 0, receivedCents: cents($('received').value), notes: $('notes').value.trim(), items: mode === 'quick' ? [] : lines.map(({ product, quantityMilli }) => ({ productId: product.id, quantityMilli, price: product.price, sellByFraction: product.sellByFraction, signature: product.signature })) };
    const summary = mode === 'quick' ? sale.notes || 'Venda rápida' : lines.map(line => `${line.quantityMilli / 1000} × ${line.product.name}`).join(', ');
    await enqueueSale(owner, sale, { totalCents: amount, summary }, context);
    // Request durable device storage after a deliberate sale action; unsupported browsers still use IndexedDB.
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    notice(`Venda salva neste aparelho: ${money(amount)}. Troco: ${money(sale.receivedCents - amount)}. Aguardando envio à loja.`);
    lines = []; $('quick-amount').value = ''; $('discount').value = '0,00'; $('received').value = ''; $('notes').value = ''; renderCart();
    await reloadRecords(); void sync();
  } catch (error) { notice(`A venda não foi concluída. ${error.message}`); }
  finally { saving = false; updateTotals(); }
});
$('sync').addEventListener('click', () => void sync());
$('backup').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), storeName: context.storeName, operatorName: context.operatorName, sales: records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `montante-vendas-offline-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('online', () => { if (context) { renderStatus(); void sync(); } });
window.addEventListener('offline', () => { if (context) renderStatus(); });
window.addEventListener('focus', () => { if (owner) void reloadRecords(); });
window.addEventListener('beforeunload', event => { if (saving) { event.preventDefault(); event.returnValue = ''; } });
$('normal-pdv').addEventListener('click', event => { if (!navigator.onLine) { event.preventDefault(); notice('Você já está na tela preparada para vender sem internet. Volte ao PDV quando a conexão retornar.'); } });

try {
  owner = await readMeta('active'); context = owner && await readMeta(`context:${owner}`);
  if (!context || ownerKey(context) !== owner) {
    $('status').textContent = 'Este aparelho ainda não foi preparado para o operador atual. Acesse o PDV com internet antes de usar o modo offline.';
    $('sync').disabled = true; $('backup').disabled = true;
  } else {
    $('store').textContent = context.storeName; $('operator').textContent = `Operador: ${context.operatorName} · Somente dinheiro`;
    const draft = await readMeta(`draft:${owner}`);
    if (draft) {
      $('quick-amount').value = draft.quickAmount ?? ''; $('discount').value = draft.discount ?? '0,00'; $('notes').value = draft.notes ?? ''; $('received').value = draft.received ?? '';
      let changed = false;
      for (const item of draft.items ?? []) {
        const product = context.products.find(product => product.id === item.productId);
        if (product) { lines.push({ product, quantityMilli: item.quantityMilli }); if (product.price !== item.price) changed = true; } else changed = true;
      }
      if (changed) notice('O catálogo mudou desde a edição. Confira os itens e os preços antes de concluir.');
      mode = draft.mode === 'advanced' ? 'advanced' : 'quick';
    }
    await reloadRecords(); $('workspace').hidden = false; renderCart(); setMode(mode); void sync();
    setInterval(() => { if (context) { renderStatus(); if (navigator.onLine) void sync(); } }, 30_000);
  }
} catch {
  $('status').textContent = 'Não foi possível acessar o armazenamento deste navegador. Use o navegador normal, com espaço disponível. Nenhuma venda foi registrada.';
  $('sync').disabled = true; $('backup').disabled = true;
}
