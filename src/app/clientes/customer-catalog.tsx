'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import StoreNavigation from '@/components/store-navigation';
import CatalogExcelControls from '@/components/catalog-excel-controls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const blank = { name: '', document: '', email: '', phone: '', zipCode: '', street: '', number: '', neighborhood: '', city: '', state: '', isActive: true };
type Draft = typeof blank;
type Customer = { id: string; isActive: boolean } & Record<Exclude<keyof Draft, 'isActive'>, string | null>;
const fields: { key: Exclude<keyof Draft, 'isActive'>; label: string; type?: string; max: number }[] = [
  { key: 'name', label: 'Nome / razão social', max: 120 }, { key: 'document', label: 'CPF/CNPJ', max: 20 },
  { key: 'email', label: 'E-mail', type: 'email', max: 160 }, { key: 'phone', label: 'Telefone com DDD', type: 'tel', max: 30 },
  { key: 'zipCode', label: 'CEP', max: 12 }, { key: 'street', label: 'Rua', max: 120 }, { key: 'number', label: 'Número', max: 20 },
  { key: 'neighborhood', label: 'Bairro', max: 100 }, { key: 'city', label: 'Cidade', max: 100 }, { key: 'state', label: 'UF', max: 2 },
];

export default function CustomerCatalog() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<Draft>(blank);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/customers?${new URLSearchParams({ q: query, page: String(page), includeInactive: 'true' })}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar os clientes.');
      if (id === requestId.current) { setCustomers(data.customers); setTotal(data.total); }
    } catch (error) {
      if (id === requestId.current) setMessage(error instanceof Error ? error.message : 'Falha ao carregar clientes.');
    } finally { if (id === requestId.current) setLoading(false); }
  }, [query, page]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => { window.clearTimeout(timer); requestId.current++; }; }, [load]);

  function edit(customer?: Customer) {
    setEditingId(customer?.id ?? '');
    setDraft(customer ? Object.fromEntries(Object.keys(blank).map(key => [key, customer[key as keyof Customer] ?? ''])) as Draft : { ...blank });
    dialog.current?.showModal();
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch(editingId ? `/api/customers/${editingId}` : '/api/customers', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar.');
      dialog.current?.close(); await load(); setMessage(editingId ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar cliente.'); }
    finally { setBusy(false); }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Excluir ${customer.name}? O cadastro ficará inativo e o histórico das vendas será preservado.`)) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível excluir.');
      await load(); setMessage('Cliente excluído da seleção do PDV. O histórico foi preservado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao excluir cliente.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Clientes</h1><p className="text-sm text-slate-500">Cadastre uma vez e selecione o cliente no PDV.</p></div><StoreNavigation activePage="customers" canManageStore /></header>
    <div className="flex flex-wrap gap-3"><Input aria-label="Buscar clientes" placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} className="min-w-48 flex-1 bg-white" /><Button disabled={busy} onClick={() => edit()} className="bg-orange-600 hover:bg-orange-700">Novo cliente</Button></div>
    <CatalogExcelControls kind="customers" onImported={load} />
    {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{['Cliente', 'CPF/CNPJ', 'Contato', 'Situação', 'Ações'].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody>{customers.map(customer => <tr key={customer.id} className="border-t"><td className="p-4 font-medium">{customer.name}</td><td className="p-4">{customer.document || '—'}</td><td className="p-4"><p>{customer.email || '—'}</p><p>{customer.phone}</p></td><td className="p-4">{customer.isActive ? 'Ativo' : 'Inativo'}</td><td className="whitespace-nowrap p-4"><a href={`/clientes/${customer.id}`} className="mr-4 font-medium text-orange-700 underline">Histórico</a><button disabled={busy} onClick={() => edit(customer)} className="mr-4 font-medium text-orange-700 underline disabled:opacity-50">Editar</button>{customer.isActive && <button disabled={busy} onClick={() => void remove(customer)} className="text-red-700 underline disabled:opacity-50">Excluir</button>}</td></tr>)}</tbody></table>{!customers.length && <p className="p-6 text-center text-slate-500">{loading ? 'Carregando…' : 'Nenhum cliente encontrado.'}</p>}</div>
    <div className="flex items-center justify-between gap-3 text-sm"><span>{total} clientes · Página {page}</span><div className="flex gap-3"><button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="underline disabled:opacity-40">Anterior</button><button disabled={page * 25 >= total || loading} onClick={() => setPage(page + 1)} className="underline disabled:opacity-40">Próxima</button></div></div>
    <dialog ref={dialog} aria-labelledby="customer-title" onCancel={event => { if (busy) event.preventDefault(); }} className="m-auto max-h-[90dvh] w-[min(95vw,640px)] overflow-y-auto rounded-xl border p-5 text-slate-900 backdrop:bg-slate-950/50"><h2 id="customer-title" className="text-xl font-semibold">{editingId ? 'Editar cliente' : 'Novo cliente'}</h2><p className="mt-1 text-sm text-slate-500">Somente o nome é obrigatório. Para pagamentos online, complete os dados exigidos pelo provedor.</p><form onSubmit={save}><fieldset disabled={busy} className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(field => <label key={field.key} className="text-sm">{field.label}<Input autoFocus={field.key === 'name'} required={field.key === 'name'} minLength={field.key === 'name' ? 2 : undefined} maxLength={field.max} type={field.type ?? 'text'} value={draft[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]: field.key === 'state' ? event.target.value.toUpperCase() : event.target.value }))} className="mt-1" /></label>)}{editingId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft(current => ({ ...current, isActive: event.target.checked }))} />Cliente ativo</label>}</fieldset>{message && <p role="status" className="mt-3 text-sm">{message}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</Button><Button disabled={busy} className="bg-orange-600 hover:bg-orange-700">{busy ? 'Salvando…' : 'Salvar cliente'}</Button></div></form></dialog>
  </div></main>;
}
