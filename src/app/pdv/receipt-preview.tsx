'use client';

import { useEffect, useRef, useState } from 'react';

export default function ReceiptPreview({ saleId }: { saleId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const restoreFullscreen = useRef(false);
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  function showReceipt() {
    restoreFullscreen.current = Boolean(document.fullscreenElement);
    setOpen(true);
    dialog.current?.showModal();
  }

  function closeReceipt() {
    // Request during the click: afterprint does not provide user activation.
    if (restoreFullscreen.current && !document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        void document.documentElement.requestFullscreen().catch(() => {
          setMessage('Use o botão Tela cheia para retomar esse modo.');
        });
      } else setMessage('Use a opção de tela cheia do navegador para retomar esse modo.');
    }
    dialog.current?.close();
  }

  return <>
    <button ref={opener} type="button" onClick={showReceipt} className="block w-full rounded-xl border border-orange-200 p-3 text-center text-sm font-medium text-orange-700 hover:bg-orange-50">Ver comprovante / imprimir</button>
    {message && <p role="status" className="mt-2 text-sm text-slate-600">{message}</p>}
    <dialog ref={dialog} aria-label="Comprovante da venda" onClose={() => { setOpen(false); opener.current?.focus(); }} className="m-auto h-[90dvh] max-h-[900px] w-[min(95vw,780px)] rounded-xl border bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3"><h2 className="font-semibold">Comprovante</h2><button type="button" onClick={closeReceipt} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white">{restoreFullscreen.current && !fullscreen ? 'Voltar ao PDV em tela cheia' : 'Voltar ao PDV'}</button></header>
        {open && <iframe title="Comprovante para impressão" src={`/vendas/${saleId}?embedded=1`} className="min-h-0 w-full flex-1 border-0" />}
      </div>
    </dialog>
  </>;
}
