'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import NicheChoices from '@/components/niche-choices';
import type { BusinessNiche } from '@/lib/business-niche';

export default function NicheOnboarding({ onSaved }: { onSaved: (niche: BusinessNiche) => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [niche, setNiche] = useState<BusinessNiche | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { element?.close(); };
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!niche || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/settings/tenant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ niche }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar o nicho.');
      onSaved(data.niche);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.'); setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="niche-title" onCancel={event => event.preventDefault()} className="max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/40"><h2 id="niche-title" className="mb-2 text-xl font-semibold">Vamos conhecer sua loja</h2><p className="mb-5 text-sm text-slate-600">Escolha o segmento para receber sugestões de categorias. Seus produtos e categorias existentes serão preservados.</p><form onSubmit={save} className="space-y-5"><NicheChoices value={niche} onChange={setNiche} disabled={busy} />{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex flex-wrap items-center justify-between gap-3"><Link href="/pdv" className="text-sm text-slate-600 underline">Voltar ao PDV</Link><Button disabled={!niche || busy} type="submit">{busy ? 'Salvando…' : 'Salvar e continuar'}</Button></div></form></dialog>;
}
