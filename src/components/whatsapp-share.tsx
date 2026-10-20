'use client';

import { useRef } from 'react';
import { whatsappShareUrl } from '@/lib/reports/share';
import { Button } from '@/components/ui/button';

export default function WhatsappShare({ text, label = 'Compartilhar no WhatsApp', disabled = false }: { text: string; label?: string; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><Button type="button" variant="outline" disabled={disabled} onClick={() => dialog.current?.showModal()}>{label}</Button><dialog ref={dialog} aria-label="Compartilhar no WhatsApp" className="m-auto max-h-[90dvh] w-[min(95vw,640px)] overflow-auto rounded-xl border bg-white p-5 text-slate-900 backdrop:bg-slate-950/50"><h2 className="text-lg font-semibold">Compartilhar no WhatsApp</h2><p className="mt-2 text-sm text-slate-500">Confira o resumo. O WhatsApp abrirá para você escolher o contato e enviar a mensagem.</p><textarea aria-label="Prévia da mensagem" readOnly value={text} className="mt-4 h-72 w-full rounded-lg border p-3 text-sm" /><div className="mt-4 flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Fechar</Button><a href={whatsappShareUrl(text)} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Abrir WhatsApp</a></div></dialog></>;
}
