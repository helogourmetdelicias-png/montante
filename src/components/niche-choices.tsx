'use client';

import { Hammer, Shirt, Sparkles, Store, Wine } from 'lucide-react';
import { BUSINESS_NICHES, NICHE_LABELS, type BusinessNiche } from '@/lib/business-niche';

const icons = { CONSTRUCTION: Hammer, COSMETICS: Sparkles, CLOTHING: Shirt, BEVERAGES: Wine, OTHER: Store };

export default function NicheChoices({ value, onChange, disabled = false }: { value: BusinessNiche | ''; onChange: (value: BusinessNiche) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="space-y-3"><legend className="mb-3 text-base font-semibold">Qual é o nicho da sua loja?</legend><div className="grid gap-3 sm:grid-cols-2">{BUSINESS_NICHES.map(niche => {
    const Icon = icons[niche];
    return <label key={niche} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${value === niche ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-700'} ${disabled ? 'opacity-60' : ''}`}><input type="radio" name="niche" value={niche} checked={value === niche} onChange={() => onChange(niche)} required className="accent-orange-600" /><Icon size={20} aria-hidden="true" className="shrink-0" /><span>{NICHE_LABELS[niche]}</span></label>;
  })}</div></fieldset>;
}
