'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LockKeyhole, Wallet } from 'lucide-react';
import { Button } from './ui/button';

export default function PdvCashMenu({ disabled }: { disabled: boolean }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild><Button type="button" variant="outline" className="gap-2 rounded-lg bg-white" aria-label="Caixa"><Wallet size={17} aria-hidden="true" />Caixa<ChevronDown size={14} aria-hidden="true" /></Button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="z-[60] w-64 rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-xl">
      <DropdownMenu.Label className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Controle do caixa</DropdownMenu.Label>
      <DropdownMenu.Item disabled={disabled} onSelect={() => window.location.assign('/caixa?action=open')} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm outline-none focus:bg-orange-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"><Wallet size={17} />Abrir caixa</DropdownMenu.Item>
      <DropdownMenu.Item disabled={disabled} onSelect={() => window.location.assign('/caixa?action=close')} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm text-red-700 outline-none focus:bg-red-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"><LockKeyhole size={17} />Fechar caixa</DropdownMenu.Item>
      {disabled && <p className="px-3 py-2 text-xs leading-5 text-slate-500">Conclua ou limpe a venda em andamento para acessar o caixa.</p>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
