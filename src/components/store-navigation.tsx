'use client';

import Link from 'next/link';
import StoreShortcuts from './store-shortcuts';
import { signOut } from 'next-auth/react';
import { OperatorSwitch } from '@/components/operator-access';
import { useEffect, useState } from 'react';
import { BarChart3, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Package, Settings, ShoppingBag, UserCircle, Users, Wallet, X } from 'lucide-react';

type StorePage = 'pdv' | 'sales' | 'customers' | 'products' | 'cash' | 'reports' | 'settings' | 'payments' | 'subscription' | 'profile';

type StoreNavigationProps = {
  activePage: StorePage;
  canManageStore: boolean;
};

const navigationItems: { href: string; label: string; page: StorePage; icon: typeof ShoppingBag; managementOnly?: boolean }[] = [
  { href: '/pdv', label: 'PDV', page: 'pdv', icon: ShoppingBag },
  { href: '/vendas', label: 'Vendas', page: 'sales', icon: ShoppingBag },
  { href: '/caixa', label: 'Caixa', page: 'cash', icon: Wallet },
  { href: '/produtos', label: 'Produtos', page: 'products', icon: Package, managementOnly: true },
  { href: '/clientes', label: 'Clientes', page: 'customers', icon: Users, managementOnly: true },
  { href: '/perfil', label: 'Perfil', page: 'profile', icon: UserCircle },
  { href: '/relatorios', label: 'Relatórios', page: 'reports', icon: BarChart3, managementOnly: true },
  { href: '/configuracoes/pagamentos', label: 'Configurações', page: 'settings', icon: Settings, managementOnly: true },
];

/** Collapsible desktop column and mobile drawer share role-aware navigation. */
export default function StoreNavigation({ activePage, canManageStore }: StoreNavigationProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut({ callbackUrl: '/login' });
    } catch {
      setSignOutError('Não foi possível sair. Tente novamente.');
      setSigningOut(false);
    }
  }
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('montante.sidebar.collapsed') === 'true'); } catch { /* Storage can be unavailable. */ }
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mobileOpen]);
  function toggle() {
    setCollapsed(value => {
      try { localStorage.setItem('montante.sidebar.collapsed', String(!value)); } catch { /* Keep the control usable without storage. */ }
      return !value;
    });
  }
  return <>
    <button type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-controls="store-sidebar" className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm lg:hidden"><Menu size={18} />Menu</button>
    {mobileOpen && <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />}
    <aside id="store-sidebar" data-store-sidebar={collapsed ? 'collapsed' : 'expanded'} aria-label="Menu da loja" className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${collapsed ? 'lg:w-[72px]' : 'lg:w-60'}`}>
      <div className="flex h-20 shrink-0 items-center justify-between gap-2 border-b px-3">
        <Link href="/pdv" className={`flex min-w-0 items-center gap-2 text-orange-600 ${collapsed ? 'lg:hidden' : ''}`} onClick={() => setMobileOpen(false)}><ShoppingBag size={25} /><span className="text-lg font-bold">Montante</span></Link>
        <button type="button" onClick={toggle} aria-label={collapsed ? 'Exibir menu lateral' : 'Recolher menu lateral'} aria-expanded={!collapsed} className="hidden rounded-lg p-3 text-slate-500 hover:bg-orange-50 hover:text-orange-700 lg:block">{collapsed ? <PanelLeftOpen size={21} /> : <PanelLeftClose size={21} />}</button>
        <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="p-2 lg:hidden"><X size={20} /></button>
      </div>
      <nav aria-label="Navegação da loja" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        <StoreShortcuts collapsed={collapsed} onOpen={() => setMobileOpen(false)} />
        {navigationItems.filter(item => !item.managementOnly || canManageStore).map(({ href, label, page, icon: Icon }) => <Link key={page} href={href} title={label} aria-label={label} aria-current={page === activePage ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium ${page === activePage ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
          <Icon aria-hidden="true" size={20} className="shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
        </Link>)}
      </nav>
      <div className="shrink-0 border-t p-2">
        <OperatorSwitch collapsed={collapsed} />
        <button type="button" onClick={handleSignOut} disabled={signingOut} title="Sair da conta" aria-label="Sair da conta" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"><LogOut aria-hidden="true" size={20} className="shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>{signingOut ? 'Saindo…' : 'Sair da conta'}</span></button>
        {signOutError && <p role="alert" className="px-2 pb-2 text-xs text-red-600">{signOutError}</p>}
      </div>
    </aside>
  </>;
}
