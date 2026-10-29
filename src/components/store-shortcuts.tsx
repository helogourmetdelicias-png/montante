'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUpFromLine, LoaderCircle, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import CustomerPicker, { type SaleCustomer } from '@/app/pdv/customer-picker';

/** Shortcuts reuse the operator's existing drawer and tenant-scoped customer search. */
export default function StoreShortcuts({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  const withdrawal = useRef<HTMLDialogElement>(null);
  const customerSearch = useRef<HTMLDialogElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [customer, setCustomer] = useState<SaleCustomer | null>(null);

  useEffect(() => {
    if (searchOpen) customerSearch.current?.querySelector('input')?.focus();
  }, [searchOpen]);

  function open(kind: 'withdrawal' | 'customer') {
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    onOpen();
    if (kind === 'withdrawal') {
      setAmount(''); setDescription(''); setError(''); setSuccess('');
      withdrawal.current?.showModal();
      requestAnimationFrame(() => amountInput.current?.focus());
    } else {
      setCustomer(null); setSearchOpen(true);
      customerSearch.current?.showModal();
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!['F3', 'F4'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
      event.preventDefault();
      open(event.key === 'F3' ? 'withdrawal' : 'customer');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function recordWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/cash-register/movements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'withdrawal', amount: Number(amount), description: description.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível registrar a sangria.');
      setSuccess(`Sangria de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(data.movement.amount))} registrada.`);
      window.dispatchEvent(new Event('montante:cash-movement'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a sangria. Confira o caixa antes de tentar novamente.');
    } finally {
      submitting.current = false; setBusy(false);
    }
  }

  const buttonClass = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900';
  return <>
    <button type="button" title="F3 · Sangria" aria-label="F3 · Sangria" aria-keyshortcuts="F3" onClick={() => open('withdrawal')} className={buttonClass}><ArrowUpFromLine aria-hidden="true" size={20} className="shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>F3 · Sangria</span></button>
    <button type="button" title="F4 · Buscar cliente" aria-label="F4 · Buscar cliente" aria-keyshortcuts="F4" onClick={() => open('customer')} className={buttonClass}><Search aria-hidden="true" size={20} className="shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>F4 · Buscar cliente</span></button>

    <dialog ref={withdrawal} aria-labelledby="withdrawal-shortcut-title" onCancel={event => { if (submitting.current) event.preventDefault(); }} className="m-auto max-h-[90dvh] w-[min(95vw,480px)] overflow-y-auto rounded-2xl border bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
      <header className="mb-4 flex items-center justify-between gap-3"><h2 id="withdrawal-shortcut-title" className="text-xl font-semibold">F3 · Sangria</h2><button type="button" disabled={busy} aria-label="Fechar sangria" onClick={() => withdrawal.current?.close()} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></header>
      {success ? <><p role="status" className="text-sm text-emerald-700">{success}</p><Button type="button" onClick={() => withdrawal.current?.close()} className="mt-5 w-full">Fechar</Button></> : <form onSubmit={recordWithdrawal} className="space-y-4">
        <p className="text-sm text-slate-500">Retirada de dinheiro do caixa de hoje. Não é necessário abrir o caixa manualmente. Informe o valor e o motivo.</p>
        <label className="block text-sm font-medium">Valor da retirada (R$)<MoneyInput ref={amountInput} required disabled={busy} value={amount} onValueChange={setAmount} className="mt-2" /></label>
        <label className="block text-sm font-medium">Motivo da retirada<Input required disabled={busy} minLength={3} maxLength={240} value={description} onChange={event => setDescription(event.target.value)} className="mt-2" /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => withdrawal.current?.close()}>Cancelar</Button><Button type="submit" disabled={busy || Number(amount) <= 0 || !amount || description.trim().length < 3}>{busy && <LoaderCircle size={16} className="mr-2 animate-spin" />}Registrar sangria</Button></div>
      </form>}
    </dialog>

    <dialog ref={customerSearch} aria-labelledby="customer-search-shortcut-title" onClose={() => setSearchOpen(false)} className="m-auto max-h-[90dvh] w-[min(95vw,560px)] overflow-y-auto rounded-2xl border bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
      <header className="mb-4 flex items-center justify-between gap-3"><h2 id="customer-search-shortcut-title" className="text-xl font-semibold">F4 · Buscar cliente</h2><button type="button" aria-label="Fechar busca de cliente" onClick={() => customerSearch.current?.close()} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></header>
      <p className="mb-4 text-sm text-slate-500">Consulte os dados do cliente. Esta busca não altera a venda em andamento.</p>
      {searchOpen && <CustomerPicker label="Buscar cliente" selected={customer} disabled={false} onSelect={setCustomer} />}
      {customer && <dl className="space-y-2 text-sm"><div><dt className="font-medium">CPF/CNPJ</dt><dd>{customer.document || 'Não informado'}</dd></div><div><dt className="font-medium">Telefone</dt><dd>{customer.phone || 'Não informado'}</dd></div><div><dt className="font-medium">E-mail</dt><dd>{customer.email || 'Não informado'}</dd></div></dl>}
      <Button type="button" variant="outline" className="mt-5 w-full" onClick={() => customerSearch.current?.close()}>Fechar</Button>
    </dialog>
  </>;
}
