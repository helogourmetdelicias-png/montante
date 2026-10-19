'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Box, CircleAlert, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StoreNavigation from '@/components/store-navigation';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitOfMeasure: string;
  sellByFraction: boolean;
  price: string;
  stockQuantity: string;
  stockAisle: string | null;
  stockShelf: string | null;
  category: string | null;
  isActive: boolean;
};

type ProductDraft = {
  name: string;
  sku: string;
  barcode: string;
  unitOfMeasure: string;
  sellByFraction: boolean;
  price: string;
  stockQuantity: string;
  stockAisle: string;
  stockShelf: string;
  category: string;
  isActive: boolean;
};

const EMPTY_DRAFT: ProductDraft = {
  name: '', sku: '', barcode: '', unitOfMeasure: 'un', sellByFraction: false,
  price: '', stockQuantity: '0', stockAisle: '', stockShelf: '', category: '', isActive: true,
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
    stockQuantity: product.stockQuantity.replace(/0+$/, '').replace(/\.$/, ''),
    stockAisle: product.stockAisle ?? '',
    stockShelf: product.stockShelf ?? '',
    category: product.category ?? '',
    isActive: product.isActive,
  };
}

function toPayload(draft: ProductDraft) {
  return {
    name: draft.name.trim(), sku: draft.sku.trim() || null, barcode: draft.barcode.trim() || null,
    unitOfMeasure: draft.unitOfMeasure.trim(), sellByFraction: draft.sellByFraction,
    price: Number(draft.price), stockQuantity: Number(draft.stockQuantity),
    stockAisle: draft.stockAisle.trim() || null, stockShelf: draft.stockShelf.trim() || null,
    category: draft.category.trim() || null, isActive: draft.isActive,
  };
}

function readError(value: unknown) {
  return value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
    ? value.error : 'Não foi possível concluir a operação.';
}

/** Reuses the same editor for new and existing items to keep catalog rules consistent. */
export default function ProductCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadProducts = useCallback(async (search: string) => {
    const params = new URLSearchParams({ limit: '100', includeInactive: 'true' });
    if (search.trim()) params.set('q', search.trim());
    const response = await fetch(`/api/products?${params}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(readError(result));
    setProducts(result.products as Product[]);
  }, []);

  // A short delay prevents a request for every character while the owner searches the catalog.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProducts(query).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha ao carregar produtos.'));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, loadProducts]);

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
        body: JSON.stringify(toPayload(draft)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(readError(result));
      await loadProducts(query);
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
    setMessage('Produto desativado. O histórico de vendas foi preservado.');
  }

  const fields: Array<{ key: Exclude<keyof ProductDraft, 'sellByFraction' | 'isActive'>; label: string; type?: string; step?: string }> = [
    { key: 'name', label: 'Nome do produto' }, { key: 'sku', label: 'SKU' },
    { key: 'barcode', label: 'Código de barras' }, { key: 'unitOfMeasure', label: 'Unidade (ex.: saco, m, kg)' },
    { key: 'price', label: 'Preço de venda (R$)', type: 'number', step: '0.01' },
    { key: 'stockQuantity', label: 'Estoque inicial', type: 'number', step: draft.sellByFraction ? '0.001' : '1' },
    { key: 'stockAisle', label: 'Corredor' }, { key: 'stockShelf', label: 'Prateleira' },
    { key: 'category', label: 'Categoria' },
  ];

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8"><div><h1 className="text-2xl font-semibold tracking-tight">Catálogo de produtos</h1><p className="mt-1 text-sm text-slate-500">Gerencie preços, estoque e unidades de venda da sua loja.</p></div><div className="flex flex-wrap items-center gap-3"><StoreNavigation activePage="products" canManageStore /><Button type="button" onClick={openNewProduct} className="h-11 rounded-xl bg-orange-600 hover:bg-orange-700"><Plus className="mr-2" size={18} />Novo produto</Button></div></div></header>
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><Search className="ml-2 text-slate-400" size={18} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, SKU ou código de barras" className="h-11 border-0 shadow-none focus-visible:ring-orange-500" aria-label="Buscar no catálogo" /><span className="mr-2 whitespace-nowrap text-sm text-slate-500">{products.length} produtos</span></div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-medium">Produto</th><th className="px-5 py-3 font-medium">Unidade</th><th className="px-5 py-3 text-right font-medium">Preço</th><th className="px-5 py-3 text-right font-medium">Estoque</th><th className="px-5 py-3 font-medium">Localização</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{products.map((product) => <tr key={product.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><button type="button" onClick={() => openEditProduct(product)} className="text-left font-medium hover:text-orange-700">{product.name}</button><p className="mt-1 text-xs text-slate-500">{product.sku ? `SKU ${product.sku}` : product.barcode || 'Sem código'}</p></td><td className="px-5 py-4">{product.unitOfMeasure}{product.sellByFraction ? <span className="ml-1 text-xs text-slate-500">· fracionado</span> : ''}</td><td className="px-5 py-4 text-right tabular-nums">{currency.format(Number(product.price))}</td><td className="px-5 py-4 text-right tabular-nums">{product.stockQuantity}</td><td className="px-5 py-4 text-slate-600">{[product.stockAisle && `Corredor ${product.stockAisle}`, product.stockShelf && `Prateleira ${product.stockShelf}`].filter(Boolean).join(' · ') || '—'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{product.isActive ? 'Ativo' : 'Inativo'}</span></td><td className="px-5 py-4 text-right">{product.isActive && <button type="button" onClick={() => deactivateProduct(product).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha ao excluir produto.'))} className="text-xs font-medium text-slate-500 hover:text-red-600">Excluir</button>}</td></tr>)}</tbody></table></div> : <div className="flex min-h-64 flex-col items-center justify-center text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-700"><Box size={23} /></div><p className="font-medium">Nenhum produto no catálogo</p><p className="mt-1 text-sm text-slate-500">Cadastre o primeiro item para vender pelo PDV.</p><Button type="button" onClick={openNewProduct} variant="outline" className="mt-4">Cadastrar produto</Button></div>}
        </div>
      </div>

      {message && <div role="status" className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"><CircleAlert size={17} />{message}<button type="button" aria-label="Fechar aviso" onClick={() => setMessage('')}><X size={16} /></button></div>}

      {editorOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="product-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 id="product-title" className="text-lg font-semibold">{editingId ? 'Editar produto' : 'Novo produto'}</h2><p className="mt-1 text-sm text-slate-500">Informe as medidas e o estoque conforme a unidade comercial.</p></div><button type="button" onClick={() => setEditorOpen(false)} aria-label="Fechar" className="text-slate-400 hover:text-slate-700"><X size={19} /></button></div><form onSubmit={saveProduct}><div className="grid gap-4 sm:grid-cols-2">{fields.map(({ key, label, type, step }) => <label key={key} className={`block text-sm font-medium ${key === 'name' ? 'sm:col-span-2' : ''}`}>{label}<Input required={key === 'name' || key === 'unitOfMeasure' || key === 'price' || key === 'stockQuantity'} type={type ?? 'text'} step={step} min={type === 'number' ? '0' : undefined} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 h-10 font-normal" /></label>)}<label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2"><input type="checkbox" checked={draft.sellByFraction} onChange={(event) => setDraft((current) => ({ ...current, sellByFraction: event.target.checked }))} className="h-4 w-4 accent-orange-600" /><span><span className="block font-medium">Permitir venda fracionada</span><span className="text-xs font-normal text-slate-500">Use para metros, peso, volume ou sacos fracionáveis.</span></span></label>{editingId && <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-orange-600" /><span className="font-medium">Produto ativo e disponível no PDV</span></label>}</div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy} className="bg-orange-600 hover:bg-orange-700">{busy && <LoaderCircle className="mr-2 animate-spin" size={16} />}Salvar produto</Button></div></form></section></div>}
    </main>
  );
}
