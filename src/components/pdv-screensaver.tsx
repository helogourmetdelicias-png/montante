'use client';
/* eslint-disable @next/next/no-img-element -- The banner is a private tenant image loaded with the authenticated browser session. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Settings = { imageUrl: string; minutes: number };
export default function PdvScreensaver({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeRef = useRef(false), blockedUntil = useRef(0);
  const lastActivity = useRef(0);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { if (!document.hidden) void fetch('/api/settings/screensaver', { cache: 'no-store', signal: controller.signal }).then(async response => { if (response.ok) { const data = await response.json(); if ([0, 2, 5, 10, 15, 30].includes(data.minutes) && typeof data.imageUrl === 'string') setSettings(data); } }).catch(() => {}); };
    const poll = setInterval(refresh, 60000); window.addEventListener('focus', refresh);
    return () => { controller.abort(); clearInterval(poll); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    lastActivity.current = Date.now();
    if (!settings.minutes || !settings.imageUrl) { activeRef.current = false; setActive(false); }
    const activity = (event: Event) => {
      const dismiss = ['pointerdown', 'touchstart', 'keydown', 'click'].includes(event.type);
      if (activeRef.current) {
        if (dismiss) { event.preventDefault(); event.stopImmediatePropagation(); blockedUntil.current = Date.now() + 500; activeRef.current = false; setActive(false); lastActivity.current = Date.now(); }
        return;
      }
      if (dismiss && Date.now() < blockedUntil.current) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      lastActivity.current = Date.now();
    };
    const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel', 'click'];
    for (const type of events) document.addEventListener(type, activity, { capture: true, passive: false });
    const timer = setInterval(() => { if (settings.minutes && settings.imageUrl && !document.hidden && !activeRef.current && Date.now() - lastActivity.current >= settings.minutes * 60000) { activeRef.current = true; setActive(true); } }, 1000);
    return () => { clearInterval(timer); for (const type of events) document.removeEventListener(type, activity, true); };
  }, [settings.minutes, settings.imageUrl]);
  useEffect(() => {
    const element = dialog.current;
    if (active && element && !element.open) element.showModal();
    if (!active && element?.open) element.close();
  }, [active, mounted]);
  if (!mounted) return null;
  return createPortal(<dialog ref={dialog} aria-label="Proteção de tela do PDV" aria-modal="true" onCancel={event => event.preventDefault()} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-black p-0 text-white backdrop:bg-black"><img src={settings.imageUrl || undefined} alt="Banner da loja" className="h-full w-full object-contain" /><p className="absolute inset-x-0 bottom-5 text-center text-sm text-white drop-shadow">Toque na tela ou pressione uma tecla para voltar ao PDV</p></dialog>, document.body);
}
