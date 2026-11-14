'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudOff, WifiOff } from 'lucide-react';
import { ownerKey, readMeta, writeMeta, saveContext, readSales, syncSales, type OfflineContext, type OfflineDraft } from '../../public/offline/storage.js';

type Props = { tenantId: string; userId: string; blocked: boolean; getDraft: () => OfflineDraft };

export default function PdvOfflineStatus({ tenantId, userId, blocked, getDraft }: Props) {
  const [offline, setOffline] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const draftRef = useRef(getDraft); draftRef.current = getDraft;
  const owner = ownerKey({ tenantId, userId });

  useEffect(() => {
    let stopped = false, running = false;
    let lastPrepared = 0;
    const refresh = async () => {
      const rows = await readSales(owner);
      if (!stopped) { setPending(rows.filter(row => row.status !== 'synced').length); setConflicts(rows.some(row => row.status !== 'synced' && Boolean(row.error))); }
    };
    const prepare = async () => {
      if (running || stopped) return;
      running = true;
      try {
        if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Este navegador não oferece o modo offline.');
        const active = await readMeta('active');
        if (active && active !== owner) await writeMeta('active', null);
        const cached: OfflineContext | undefined = await readMeta(`context:${owner}`);
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Preparação offline em andamento. Tente novamente em instantes.')), 20_000))]);
        if (cached && active === owner && registration.active && !stopped) setReady(true);
        if (!navigator.onLine) { if (!stopped) setOffline(true); await refresh(); return; }
        await syncSales(owner);
        await refresh();
        if (Date.now() - lastPrepared > 15 * 60_000) {
          const response = await fetch('/api/pos/offline', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
          if (!response.ok) throw new Error('Não foi possível preparar o modo offline. Entre novamente se sua sessão venceu.');
          const context: OfflineContext = await response.json();
          if (context.tenantId !== tenantId || context.userId !== userId) throw new Error('O operador mudou. Atualize o PDV.');
          if (stopped) return;
          await saveContext(context);
          lastPrepared = Date.now();
          setReady(true); setError('');
        }
        if (!stopped) setOffline(false);
      } catch (failure) {
        if (!stopped) { setError(failure instanceof Error ? failure.message : 'Modo offline ainda não preparado.'); setOffline(!navigator.onLine); }
      } finally { running = false; }
    };
    const online = () => { setOffline(false); void prepare(); };
    const offlineEvent = () => { setOffline(true); };
    const updated = () => { void refresh().catch(() => undefined); };
    window.addEventListener('online', online); window.addEventListener('offline', offlineEvent);
    window.addEventListener('montante-offline-update', updated);
    void prepare();
    const timer = window.setInterval(() => void prepare(), 30_000);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent); window.removeEventListener('montante-offline-update', updated); };
  }, [owner, tenantId, userId]);

  async function openOffline() {
    if (!ready || opening) return;
    setOpening(true);
    try {
      const draft = draftRef.current();
      if (!blocked && (Number(draft.quickAmount.replace(',', '.')) > 0 || draft.items.length || draft.notes.trim())) await writeMeta(`draft:${owner}`, draft);
      window.location.assign('/offline/index.html');
    } catch { setError('Não foi possível guardar a venda em edição. Tente novamente.'); setOpening(false); }
  }

  if (offline || pending > 0 || conflicts) return <section aria-label="Modo offline" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 lg:mx-6">
    <div><p className="font-semibold"><WifiOff size={16} className="mr-2 inline" />{offline ? 'Sem internet' : 'Vendas salvas neste aparelho'}{pending > 0 ? ` · ${pending} venda(s) aguardando envio` : ''}</p><p className="mt-1 text-xs">{blocked ? 'A cobrança em andamento precisa de conexão para ser conferida. Você pode consultar as vendas offline.' : conflicts ? 'Há vendas que precisam de conferência. Elas continuam guardadas no aparelho.' : ready ? 'Você pode continuar vendendo em dinheiro na tela offline.' : 'Este aparelho ainda não terminou a preparação offline.'}</p></div>
    <button type="button" onClick={() => void openOffline()} disabled={!ready || opening} className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-medium disabled:opacity-50">{blocked || pending ? 'Consultar vendas offline' : 'Continuar vendendo offline'}</button>
  </section>;
  return <button type="button" onClick={() => void openOffline()} disabled={!ready || opening || blocked} title={error || 'Catálogo preparado neste aparelho. Somente vendas em dinheiro.'} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"><CloudOff size={15} />{ready ? 'Offline pronto' : error ? 'Offline indisponível' : 'Preparando offline…'}</button>;
}
