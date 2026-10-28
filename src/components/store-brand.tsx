'use client';
/* Private store images require the browser session cookie; use a native image. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
export default function StoreBrand({ name = 'Montante', logoUrl = '', showName = true }: { name?: string; logoUrl?: string; showName?: boolean }) {
  const [brand, setBrand] = useState({ name, logoUrl });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/settings/personalization', { cache: 'no-store', signal: controller.signal });
        if (!response.ok || response.redirected) return;
        const data = await response.json();
        if (active && typeof data.name === 'string') { setBrand({ name: data.name, logoUrl: data.logoUrl ?? '' }); setFailed(false); }
      } catch { /* Keep the current identity while offline. */ }
    }
    void load();
    window.addEventListener('focus', load);
    window.addEventListener('montante:brand-updated', load);
    return () => { active = false; controller.abort(); window.removeEventListener('focus', load); window.removeEventListener('montante:brand-updated', load); };
  }, []);
  return <span className="flex min-w-0 items-center gap-2">
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-orange-100 bg-white p-1 text-orange-600">
      {brand.logoUrl && !failed ? <img src={brand.logoUrl} alt={`Logo de ${brand.name}`} className="h-full w-full object-contain" onError={() => setFailed(true)} /> : <ShoppingBag size={25} aria-hidden="true" />}
    </span>
    {showName && <span className="truncate text-base font-bold" title={brand.name}>{brand.name}</span>}
  </span>;
}
