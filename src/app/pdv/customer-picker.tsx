'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

export type SaleCustomer = {
  id: string; name: string; document: string | null; email: string | null; phone: string | null;
  zipCode: string | null; street: string | null; number: string | null; neighborhood: string | null; city: string | null; state: string | null;
};

export default function CustomerPicker({ selected, disabled, onSelect }: { selected: SaleCustomer | null; disabled: boolean; onSelect: (customer: SaleCustomer | null) => void }) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<SaleCustomer[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (disabled || selected || query.trim().length < 2) { setCustomers([]); setMessage(''); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/customers?${new URLSearchParams({ q: query })}`, { signal: controller.signal, cache: 'no-store' });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error ?? 'Não foi possível buscar clientes.');
        setCustomers(data.customers); setMessage(data.customers.length ? '' : 'Nenhum cliente encontrado.');
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha na busca.'); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, selected, disabled]);
  return <section aria-label="Cliente da venda" className="mb-4 rounded-xl border border-slate-200 p-3 text-sm"><label htmlFor="sale-customer" className="font-medium">Cliente (opcional)</label>{selected ? <div className="mt-2 flex items-center justify-between gap-2"><span>{selected.name}</span><button type="button" disabled={disabled} onClick={() => { setQuery(''); onSelect(null); }} className="text-orange-700 underline disabled:opacity-40">Remover</button></div> : <Input id="sale-customer" value={query} disabled={disabled} onChange={event => { setQuery(event.target.value); setCustomers([]); setMessage(''); }} placeholder="Buscar nome ou CPF/CNPJ (2 caracteres)" className="mt-2" />}{customers.length > 0 && <ul className="mt-2 max-h-48 overflow-y-auto divide-y">{customers.map(customer => <li key={customer.id}><button type="button" onClick={() => { onSelect(customer); setCustomers([]); setQuery(''); }} className="w-full p-2 text-left hover:bg-orange-50"><span className="block font-medium">{customer.name}</span><span className="text-xs text-slate-500">{customer.document || customer.email || 'Sem documento cadastrado'}</span></button></li>)}</ul>}{message && <p role="status" className="mt-2 text-xs text-slate-500">{message}</p>}</section>;
}
