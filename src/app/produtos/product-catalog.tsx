'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Box, CircleAlert, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import StoreNavigation from '@/components/store-navigation';
import CatalogExcelControls from '@/components/catalog-excel-controls';
import { getNicheCategories, type BusinessNiche } from '@/lib/business-niche';
import NicheOnboarding from '@/components/niche-onboarding';
import NicheProductFields from './niche-product-fields';
import { getNicheAttributeKeys, type ProductAttributes } from '@/lib/product-attributes';
import { Fragment } from 'react';
import ImageUpload from '@/components/image-upload';
import InventoryAlertsPanel from '@/components/inventory-alerts-panel';
import InventoryAlertBadges from '@/components/inventory-alert-badges';
import { INVENTORY_FILTERS, INVENTORY_LABELS, inventoryDate, productInventoryAlerts, type InventoryFilter } from '@/lib/inventory-alerts';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitOfMeasure: string;
  sellByFraction: boolean;
  price: string;
  costPrice: string | null;
  stockQuantity: string;
  stockMinAlert: string | null;
  stockAisle: string | null;
  stockShelf: string | null;
  category: string | null;
  brand: string | null;
  imageUrl: string | null;
  attributes: ProductAttributes;
  isActive: boolean;
};

type ProductDraft = {
  name: string;
  sku: string;
  barcode: string;
  unitOfMeasure: string;
  sellByFraction: boolean;
  price: string;
  costPrice: string;
  stockQuantity: string;
  stockMinAlert: string;
  stockAisle: string;
  stockShelf: string;
  category: string;
  brand: string;
  imageUrl: string;
  attributes: ProductAttributes;
  isActive: boolean;
};

const EMPTY_DRAFT: ProductDraft = {
  name: '', sku: '', barcode: '', unitOfMeasure: 'un', sellByFraction: false,
  price: '', costPrice: '', stockQuantity: '0', stockMinAlert: '', stockAisle: '', stockShelf: '', category: '', brand: '', imageUrl: '', attributes: {}, isActive: true,
};
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function draftFromProduct(product: Product): ProductDraft {
  return {
    name: product.name,
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    unitOfMeasure: product.unitOfMeasure,
    sellByFraction: product.sellByFraction,
    price: product.price,
    costPrice: product.costPrice ?? '',
    stockQuantity: product.stockQuantity.replace(/0+$/, '').replace(/\.$/, ''),
    stockMinAlert: product.stockMinAlert ?? '',
    stockAisle: product.stockAisle ?? '',
    stockShelf: product.stockShelf ?? '',
    category: product.category ?? '',
    brand: product.brand ?? '',
    imageUrl: product.imageUrl ?? '',
    attributes: product.attributes ?? {},
    isActive: product.isActive,
  };
}

function toPayload(draft: ProductDraft, niche: BusinessNiche | null) {
  return {
    name: draft.name.trim(), sku: draft.sku.trim() || null, barcode: draft.barcode.trim() || null,
    unitOfMeasure: draft.unitOfMeasure.trim(), sellByFraction: draft.sellByFraction,
    price: Number(draft.price), costPrice: draft.costPrice === '' ? null : Number(draft.costPrice), stockQuantity: Number(draft.stockQuantity),
    stockMinAlert: draft.stockMinAlert === '' ? null : Number(draft.stockMinAlert),
    stockAisle: draft.stockAisle.trim() || null, stockShelf: draft.stockShelf.trim() || null,
    category: draft.category.trim() || null, isActive: draft.isActive,
    imageUrl: draft.imageUrl || null,
    ...((niche === 'COSMETICS' || niche === 'CONSTRUCTION') ? { brand: draft.brand.trim() || null } : {}),
    attributes: Object.fromEntries(getNicheAttributeKeys(niche).map(key => {
      const value = draft.attributes[key];
      return [key, typeof value === 'string' ? value.trim() || null : value ?? (key === 'requiresContainer' ? false : null)];
    })),
  };
}

function readError(value: unknown) {
  return value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
    ? value.error : 'Não foi possível concluir a operação.';
}

/** Reuses the same editor for new and existing items to keep catalog rules consistent. */
export default function ProductCatalog({ initialNiche, initialFilter = 'all', initialQuery = '' }: { initialNiche: BusinessNiche | null; initialFilter?: InventoryFilter; initialQuery?: string }) {
  const [niche, setNiche] = useState(initialNiche);
  const [products, setProducts] = useState<Product[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [alertFilter, setAlertFilter] = useState<InventoryFilter>(initialFilter);
  const [alertRevision, setAlertRevision] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadProducts = useCallback(async (search: string) => {
    const params = new URLSearchParams({ limit: '100', includeInactive: 'true', page: String(page) });
    if (categoryFilter) params.set('category', categoryFilter);
    if (alertFilter !== 'all') params.set('alert', alertFilter);
    if (search.trim()) params.set('q', search.trim());
    const response = await fetch(`/api/products?${params}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(readError(result));
    setProducts(result.products as Product[]);
    setCategories(result.categories ?? []);
    setTotal(result.total);
  }, [categoryFilter, page, alertFilter]);

  // A short delay prevents a request for every character while the owner searches the catalog.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProducts(query).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha ao carregar produtos.'));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, loadProducts]);

  useEffect(() => {
    const refresh = () => { void loadProducts(query).catch(() => undefined); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('montante:inventory-updated', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('montante:inventory-updated', refresh); };
  }, [loadProducts, query]);

  function openNewProduct() {
    setEditingId('');
    setDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  }

  function openEditProduct(product: Product) {
    setEditingId(product.id);
    setDraft(draftFromProduct(product));
    setEditorOpen(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(editingId ? `/api/products/${editingId}` : '/api/products', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(draft, niche)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result));
      await loadProducts(query);
      setAlertRevision(value => value + 1);
      setEditorOpen(false);
      setMessage(editingId ? 'Produto atualizado.' : 'Produto cadastrado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o produto.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivateProduct(product: Product) {
    const confirmed = window.confirm(
      `Excluir "${product.name}" do catálogo? O produto será desativado e o histórico de vendas será preservado.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(readError(result));
    await loadProducts(query);
    setAlertRevision(value => value + 1);
    setMessage('Produto desativado. O histórico de vendas foi preservado.');
  }

  const fields: Array<{ key: Exclude<keyof ProductDraft, 'sellByFraction' | 'isActive' | 'brand' | 'attributes'>; label: string; type?: string; step?: string }> = [
    { key: 'name', label: 'Nome do produto' }, { key: 'sku', label: 'SKU' },
    { key: 'barcode', label: 'Código de barras' }, { key: 'unitOfMeasure', label: niche === 'CONSTRUCTION' ? 'Unidade de Venda Fracionada (m², m, kg, saco, un)' : 'Unidade de venda' },
    { key: 'price', label: 'Preço de venda (R$)', type: 'number', step: '0.01' },
    { key: 'costPrice', label: 'Custo por unidade do produto / material (R$)', type: 'number', step: '0.01' },
    { key: 'stockQuantity', label: editingId ? 'Quantidade atual em estoque' : 'Estoque inicial', type: 'number', step: draft.sellByFraction ? '0.001' : '1' },
    { key: 'stockMinAlert', label: 'Estoque mínimo para alerta (opcional)', type: 'number', step: '0.001' },
    { key: 'stockAisle', label: 'Corredor' }, { key: 'stockShelf', label: 'Prateleira' },
    { key: 'category', label: 'Categoria' },
  ];

  const categoryOptions = [...new Set<string>([...getNicheCategories(niche), ...categories, ...(draft.category ? [draft.category] : [])])];
  const sortedProducts = [...products].sort((a, b) => (a.category || 'Sem categoria').localeCompare(b.category || 'Sem categoria', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      {!niche && <NicheOnboarding onSaved={setNiche} />}
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8"><div><h1 className="text-2xl font-semibold tracking-tight">Catálogo de produtos</h1><p className="mt-1 text-sm text-slate-500">Gerencie preços, estoque e unidades de venda da sua loja.</p></div><div className="flex flex-wrap items-center gap-3"><StoreNavigation activePage="products" canManageStore /><Button type="button" onClick={openNewProduct} className="h-11 rounded-xl bg-orange-600 hover:bg-orange-700"><Plus className="mr-2" size={18} />Novo produto</Button></div></div></header>
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <div className="mb-5"><InventoryAlertsPanel mode="catalog" refreshKey={String(alertRevision)} onFilter={value => { setAlertFilter(value); setPage(1); }} /></div>
        <label className="mb-4 block text-sm font-medium">Filtrar alertas do catálogo<select value={alertFilter} onChange={event => { setAlertFilter(event.target.value as InventoryFilter); setPage(1); }} className="ml-2 h-10 max-w-full rounded-lg border bg-white px-3"><option value="all">Todos os produtos</option>{INVENTORY_FILTERS.filter(value => value !== 'all').map(value => <option key={value} value={value}>{INVENTORY_LABELS[value]}</option>)}</select></label>
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><Search className="ml-2 text-slate-400" size={18} /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar por nome, SKU ou código de barras" className="h-11 border-0 shadow-none focus-visible:ring-orange-500" aria-label="Buscar no catálogo" /><span className="mr-2 whitespace-nowrap text-sm text-slate-500">{total} produtos</span></div>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><label className="text-sm">Categoria<select aria-label="Filtrar por categoria" value={categoryFilter} onChange={event => { setCategoryFilter(event.target.value); setPage(1); }} className="ml-2 h-10 max-w-full rounded-lg border bg-white px-3"><option value="">Todas as categorias</option><option value="__uncategorized">Sem categoria</option>{categoryOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label><CatalogExcelControls kind="products" onImported={async () => { await loadProducts(query); setAlertRevision(value => value + 1); }} /></div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-medium">Produto</th><th className="px-5 py-3 font-medium">Unidade</th><th className="px-5 py-3 text-right font-medium">Preço</th><th className="px-5 py-3 text-right font-medium">Estoque</th><th className="px-5 py-3 font-medium">Localização</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{sortedProducts.map((product, index) => <Fragment key={product.id}>{(index === 0 || product.category !== sortedProducts[index - 1].category) && <tr className="bg-slate-50"><th colSpan={7} className="px-5 py-3 font-semibold">{product.category || 'Sem categoria'}</th></tr>}<tr className="hover:bg-slate-50/70"><td className="px-5 py-4"><button type="button" onClick={() => openEditProduct(product)} className="text-left font-medium hover:text-orange-700">{product.name}</button><p className="mt-1 text-xs text-slate-500">{product.sku ? `SKU ${product.sku}` : product.barcode || 'Sem código'}</p><div className="mt-2"><InventoryAlertBadges flags={productInventoryAlerts(product).flags} /></div>{product.attributes?.expiryDate && <p className="mt-1 text-xs text-slate-500">Validade: {inventoryDate(product.attributes.expiryDate)}</p>}</td><td className="px-5 py-4">{product.unitOfMeasure}{product.sellByFraction ? <span className="ml-1 text-xs text-slate-500">· fracionado</span> : ''}</td><td className="px-5 py-4 text-right tabular-nums">{currency.format(Number(product.price))}</td><td className="px-5 py-4 text-right tabular-nums">{product.stockQuantity}</td><td className="px-5 py-4 text-slate-600">{[product.stockAisle && `Corredor ${product.stockAisle}`, product.stockShelf && `Prateleira ${product.stockShelf}`].filter(Boolean).join(' · ') || '—'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{product.isActive ? 'Ativo' : 'Inativo'}</span></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openEditProduct(product)} className="mr-4 text-xs font-medium text-orange-700 hover:underline">Editar</button>{product.isActive && <button type="button" onClick={() => deactivateProduct(product).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha ao excluir produto.'))} className="text-xs font-medium text-slate-500 hover:text-red-600">Excluir</button>}</td></tr></Fragment>)}</tbody></table></div> : <div className="flex min-h-64 flex-col items-center justify-center text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-700"><Box size={23} /></div><p className="font-medium">Nenhum produto no catálogo</p><p className="mt-1 text-sm text-slate-500">Cadastre o primeiro item para vender pelo PDV.</p><Button type="button" onClick={openNewProduct} variant="outline" className="mt-4">Cadastrar produto</Button></div>}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 pb-6 text-sm"><span>{total} produtos · Página {page}</span><div className="flex gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="underline disabled:opacity-40">Anterior</button><button type="button" disabled={page * 100 >= total} onClick={() => setPage(page + 1)} className="underline disabled:opacity-40">Próxima</button></div></div>

      {message && <div role="status" className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"><CircleAlert size={17} />{message}<button type="button" aria-label="Fechar aviso" onClick={() => setMessage('')}><X size={16} /></button></div>}

      {editorOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="product-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 id="product-title" className="text-lg font-semibold">{editingId ? 'Editar produto' : 'Novo produto'}</h2><p className="mt-1 text-sm text-slate-500">Informe o custo por unidade comercial. Deixe vazio se desconhecido ou informe 0 para custo zero.</p></div><button type="button" onClick={() => setEditorOpen(false)} aria-label="Fechar" className="text-slate-400 hover:text-slate-700"><X size={19} /></button></div><form onSubmit={saveProduct}><div className="grid gap-4 sm:grid-cols-2">{fields.map(({ key, label, type, step }) => <label key={key} className={`block text-sm font-medium ${key === 'name' ? 'sm:col-span-2' : ''}`}>{label}{key === 'category' ? <><Input list="product-category-options" value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} placeholder="Selecione ou digite uma categoria" className="mt-2 h-10 font-normal" /><datalist id="product-category-options">{categoryOptions.map(name => <option key={name} value={name} />)}</datalist></> : (key === 'price' || key === 'costPrice') ? <MoneyInput required={key === 'price'} value={draft[key]} onValueChange={value => setDraft(current => ({ ...current, [key]: value }))} className="mt-2 h-10 font-normal" /> : <Input required={key === 'name' || key === 'unitOfMeasure' || key === 'stockQuantity'} list={key === 'unitOfMeasure' && niche === 'CONSTRUCTION' ? 'construction-unit-options' : undefined} type={type ?? 'text'} step={step} min={type === 'number' ? '0' : undefined} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 h-10 font-normal" />}</label>)}{niche === 'CONSTRUCTION' && <datalist id="construction-unit-options">{['m²', 'm', 'kg', 'saco', 'un'].map(unit => <option key={unit} value={unit} />)}</datalist>}<div className="sm:col-span-2"><ImageUpload label="Foto do produto" purpose="product" value={draft.imageUrl} onChange={imageUrl => setDraft(current => ({ ...current, imageUrl }))} onBusyChange={setImageBusy} disabled={busy} /></div>{niche !== 'COSMETICS' && <><label className="block text-sm font-medium">Data de validade (opcional)<Input type="date" value={draft.attributes.expiryDate ?? ''} onChange={event => setDraft(current => ({ ...current, attributes: { ...current.attributes, expiryDate: event.target.value || null } }))} className="mt-2 h-10 font-normal" /></label><label className="block text-sm font-medium">Lote (opcional)<Input maxLength={120} value={draft.attributes.lot ?? ''} onChange={event => setDraft(current => ({ ...current, attributes: { ...current.attributes, lot: event.target.value || null } }))} className="mt-2 h-10 font-normal" /></label></>}<p className="text-xs text-slate-500 sm:col-span-2">Estoque baixo: abaixo do mínimo informado. Validade: avisos em 30 e 7 dias. Se houver lotes com validades diferentes, cadastre cada lote como um produto separado para manter quantidade e validade corretas.</p><NicheProductFields niche={niche} brand={draft.brand} attributes={draft.attributes} onBrandChange={brand => setDraft(current => ({ ...current, brand }))} onAttributesChange={attributes => setDraft(current => ({ ...current, attributes }))} /><label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2"><input type="checkbox" checked={draft.sellByFraction} onChange={(event) => setDraft((current) => ({ ...current, sellByFraction: event.target.checked }))} className="h-4 w-4 accent-orange-600" /><span><span className="block font-medium">Permitir venda fracionada</span><span className="text-xs font-normal text-slate-500">Use para metros, peso, volume ou sacos fracionáveis.</span></span></label>{editingId && <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-orange-600" /><span className="font-medium">Produto ativo e disponível no PDV</span></label>}</div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || imageBusy} className="bg-orange-600 hover:bg-orange-700">{busy && <LoaderCircle className="mr-2 animate-spin" size={16} />}Salvar produto</Button></div></form></section></div>}
    </main>
  );
}
