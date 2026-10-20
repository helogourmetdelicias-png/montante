'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { UserPlus, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CustomerPicker, { type SaleCustomer } from './customer-picker';

type Props = {
  selected: SaleCustomer | null;
  canCreate: boolean;
  onContinue: (customer: SaleCustomer | null) => void;
  onBack: () => void;
};

/** Identifies the customer after choosing products and before creating a sale. */
export default function CustomerCheckout({ selected, canCreate, onContinue, onBack }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<'choose' | 'create'>('choose');
  const [customer, setCustomer] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível cadastrar o cliente.');
      onContinue(result.customer);
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível cadastrar o cliente.'); setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby="checkout-customer-title" onCancel={event => { event.preventDefault(); if (!busy) onBack(); }} className="m-auto max-h-[90dvh] w-[min(95vw,680px)] overflow-y-auto rounded-2xl border bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
    <h2 id="checkout-customer-title" className="text-xl font-semibold">Quem é o cliente desta venda?</h2>
    <p className="mt-2 text-sm text-slate-500">Os produtos já estão selecionados. Identifique o cliente ou siga sem identificação.</p>
    <div className="my-5 grid gap-3 sm:grid-cols-3">
      <Button type="button" variant={choice === 'choose' ? 'default' : 'outline'} disabled={busy} onClick={() => { setChoice('choose'); setError(''); }} className="h-auto min-h-16 whitespace-normal"><Users size={18} className="mr-2 shrink-0" />Escolher cliente</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => onContinue(null)} className="h-auto min-h-16 whitespace-normal"><UserRound size={18} className="mr-2 shrink-0" />Vender sem cliente</Button>
      {canCreate && <Button type="button" variant={choice === 'create' ? 'default' : 'outline'} disabled={busy} onClick={() => { setChoice('create'); setError(''); }} className="h-auto min-h-16 whitespace-normal"><UserPlus size={18} className="mr-2 shrink-0" />Cadastrar novo cliente</Button>}
    </div>
    {choice === 'choose' ? <><CustomerPicker selected={customer} disabled={busy} onSelect={setCustomer} /><div className="mt-5 flex flex-wrap justify-between gap-3"><Button type="button" variant="outline" onClick={onBack}>Voltar aos produtos</Button><Button type="button" disabled={!customer} onClick={() => onContinue(customer)}>Continuar com este cliente</Button></div></> : <form onSubmit={create} className="space-y-4"><p className="text-sm text-slate-500">Somente o nome é obrigatório. O cliente será cadastrado e vinculado à venda.</p><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Nome / razão social<Input name="name" required minLength={2} maxLength={120} autoComplete="name" className="mt-1" /></label>
      <label className="text-sm">CPF/CNPJ (opcional)<Input name="document" maxLength={20} inputMode="numeric" className="mt-1" /></label>
      <label className="text-sm">Telefone com DDD (opcional)<Input name="phone" type="tel" maxLength={30} autoComplete="tel" className="mt-1" /></label>
      <label className="text-sm sm:col-span-2">E-mail (opcional)<Input name="email" type="email" maxLength={160} autoComplete="email" className="mt-1" /></label>
    </fieldset>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<div className="mt-5 flex flex-wrap justify-between gap-3"><Button type="button" variant="outline" disabled={busy} onClick={onBack}>Voltar aos produtos</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar e continuar'}</Button></div></form>}
    {!canCreate && <p className="mt-4 text-xs text-slate-500">Novos clientes são cadastrados pelo responsável ou administrador da loja.</p>}
  </dialog>;
}
