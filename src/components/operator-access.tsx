'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Operator = { id: string; name: string; email?: string; role: string; is_active: boolean };
const field = 'space-y-1 text-sm';

export function OperatorSwitch({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<Operator[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function show() {
    setOpen(true); setError(''); setUsers([]);
    try {
      const response = await fetch('/api/operators', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUsers(data.users.filter((user: Operator) => user.is_active));
    } catch { setError('Não foi possível carregar os operadores.'); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const result = await signIn('operator-pin', { userId: form.get('userId'), pin: form.get('pin'), redirect: false });
      if (!result || result.error) { setError('PIN inválido ou indisponível. Após 5 erros, aguarde 15 minutos.'); setBusy(false); return; }
      window.location.assign('/caixa');
    } catch { setError('Não foi possível trocar o operador.'); setBusy(false); }
  }
  return <>
    <button type="button" onClick={show} title="Trocar operador" aria-label="Trocar operador" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"><span aria-hidden="true" className="w-5 shrink-0 text-center">⇄</span><span className={collapsed ? 'lg:hidden' : ''}>Trocar operador</span></button>
    {open && createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="operator-switch-title" className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 text-slate-900">
      <h2 id="operator-switch-title" className="text-lg font-semibold">Trocar operador</h2>
      <p className="text-sm text-slate-600">Conclua a venda em edição antes de trocar. O caixa atual permanece com seu responsável. Você acessará o caixa do operador escolhido.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">Operador<select name="userId" required className="mt-1 h-10 w-full rounded-md border bg-white px-3"><option value="">Selecione</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label className="block text-sm">PIN de 6 números<Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2"><Button type="submit" disabled={busy || !users.length}>{busy ? 'Trocando…' : 'Entrar como operador'}</Button><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button></div>
      </form>
    </section></div>, document.body)}
  </>;
}

export default function OperatorAccess({ canManageStore, tenantSlug }: { canManageStore: boolean; tenantSlug: string }) {
  const [users, setUsers] = useState<Operator[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState('');
  async function load() {
    const response = await fetch('/api/operators', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setUsers(data.users);
  }
  useEffect(() => { if (canManageStore) load().catch(() => setNotice('Não foi possível carregar os operadores.')); }, [canManageStore]);
  async function save(event: FormEvent<HTMLFormElement>, action: 'create' | 'my-pin' | 'credentials') {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    await send(action === 'create' ? 'POST' : 'PATCH', action === 'create' ? data : { ...data, action, ...(action === 'credentials' ? { userId: resetId } : {}) }, () => { form.reset(); setResetId(''); });
  }
  async function send(method: string, data: object, success?: () => void) {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/operators', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      success?.();
      if (canManageStore) await load();
      setNotice('Alteração salva.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  const credentials = <><label className={field}>Senha (8 a 72 caracteres)<Input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" required /></label><label className={field}>PIN de 6 números<Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required /></label></>;
  return <section className="space-y-5 rounded-xl border bg-white p-5">
    <h2 className="text-lg font-semibold">Acesso por operador</h2>
    <p className="text-sm text-slate-600">Identificador da loja: <strong>{tenantSlug}</strong>. Entre com e-mail e senha. Com a loja aberta, use “Trocar operador” e seu PIN. Cada operador mantém seu próprio caixa.</p>
    <form onSubmit={event => save(event, 'my-pin')} className="grid gap-3 sm:grid-cols-2"><h3 className="font-medium sm:col-span-2">Meu PIN para troca de operador</h3><label className={field}>Minha senha atual<Input name="password" type="password" autoComplete="current-password" required maxLength={72} /></label><label className={field}>Novo PIN de 6 números<Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required /></label><Button disabled={busy} className="justify-self-start">Salvar meu PIN</Button></form>
    {canManageStore && <>
      <form onSubmit={event => save(event, 'create')} className="grid gap-3 border-t pt-4 sm:grid-cols-2"><h3 className="font-medium sm:col-span-2">Cadastrar operador</h3><label className={field}>Nome<Input name="name" required minLength={2} maxLength={100} /></label><label className={field}>E-mail<Input name="email" type="email" required maxLength={254} /></label>{credentials}<Button disabled={busy} className="justify-self-start">Cadastrar operador</Button><p className="text-sm text-slate-600 sm:col-span-2">Operadores acessam PDV, vendas e caixa. A administração permanece restrita ao dono e administradores.</p></form>
      <div className="space-y-3 border-t pt-4"><h3 className="font-medium">Operadores da loja</h3>{users.filter(user => user.role === 'staff').map(user => <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-medium">{user.name} · {user.is_active ? 'Ativo' : 'Inativo'}</p><p className="text-sm text-slate-600">{user.email}</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => setResetId(user.id)}>Redefinir acesso</Button><Button variant="outline" disabled={busy} onClick={() => send('PATCH', { action: 'status', userId: user.id, active: !user.is_active })}>{user.is_active ? 'Desativar' : 'Ativar'}</Button></div></div>)}{!users.some(user => user.role === 'staff') && <p className="text-sm text-slate-600">Nenhum operador cadastrado.</p>}</div>
      {resetId && <form onSubmit={event => save(event, 'credentials')} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><h3 className="font-medium sm:col-span-2">Redefinir acesso de {users.find(user => user.id === resetId)?.name}</h3>{credentials}<div className="flex gap-2 sm:col-span-2"><Button disabled={busy}>Salvar novo acesso</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setResetId('')}>Cancelar</Button></div></form>}
    </>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>;
}
