'use client';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function StoreActions({ store, onChanged }: { store: { id: string; name: string; slug: string; active: boolean; planOverride: string; protected: boolean }; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const planId = useId();
  const [plan, setPlan] = useState(store.planOverride);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(method: 'PATCH' | 'DELETE', body: unknown) {
    setBusy(true); setMessage('');
    try {
      const r = await fetch(`/api/admin/stores/${store.id}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.redirected) throw new Error('Entre novamente na conta administradora.');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Não foi possível salvar.');
      if (data.storageWarning) { setMessage('Loja excluída. A limpeza das imagens no armazenamento precisa ser conferida pela administração.'); return; }
      dialog.current?.close(); onChanged();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <><Button variant="outline" size="sm" onClick={() => { setPlan(store.planOverride); setMessage(''); setConfirmation(''); dialog.current?.showModal(); }}>Gerenciar loja</Button>
    <dialog ref={dialog} className="w-[calc(100%-2rem)] max-w-lg rounded-2xl p-6 shadow-xl backdrop:bg-black/50" onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 className="text-lg font-semibold">Gerenciar {store.name}</h2><p className="mt-1 text-sm text-slate-500">{store.slug}</p>
      <label htmlFor={planId} className="mt-5 block text-sm font-medium">Plano</label><select id={planId} aria-label="Plano" value={plan} onChange={event => setPlan(event.target.value)} disabled={busy} className="mt-2 block w-full rounded-lg border p-2"><option value="automatic">Automático por vendas</option><option value="free">Gratuito — sem novas mensalidades</option><option value="standard">Padrão — R$ 49,90/mês</option><option value="advanced">Avançado — R$ 79,00/mês</option></select>
      <p className="mt-2 text-xs text-slate-500">A mudança vale para os próximos ciclos. Cobranças já emitidas permanecem no histórico.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void save('PATCH', { plan })}>Salvar plano</Button><Button variant="outline" disabled={busy || store.protected} onClick={() => void save('PATCH', { active: !store.active })}>{store.active ? 'Desativar acesso' : 'Reativar acesso'}</Button></div>
      {!store.protected ? <section className="mt-6 border-t pt-4"><h3 className="font-semibold text-red-700">Excluir loja e suas contas</h3><p className="mt-2 text-sm">A exclusão é definitiva e remove usuários, vendas, clientes, produtos, O.S. e histórico desta loja. Não cancela pagamentos no banco. Resolva cobranças externas pendentes antes.</p><label className="mt-3 block text-sm">Digite {store.slug} para confirmar<Input value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" className="mt-2" /></label><Button variant="destructive" className="mt-3" disabled={busy || confirmation !== store.slug} onClick={() => void save('DELETE', { confirmation })}>Excluir definitivamente</Button></section> : <p className="mt-5 text-sm">Loja da administração protegida contra exclusão e desativação.</p>}
      {message && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}<Button variant="ghost" className="mt-4" disabled={busy} onClick={() => dialog.current?.close()}>Fechar</Button>
    </dialog></>;
}
