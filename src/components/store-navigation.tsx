import Link from 'next/link';
import { BarChart3, CreditCard, Package, Settings, ShoppingBag, Users, Wallet } from 'lucide-react';

type StorePage = 'pdv' | 'sales' | 'customers' | 'products' | 'cash' | 'reports' | 'settings' | 'payments' | 'subscription';

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
  { href: '/assinatura', label: 'Assinatura', page: 'subscription', icon: CreditCard, managementOnly: true },
  { href: '/relatorios', label: 'Relatórios', page: 'reports', icon: BarChart3, managementOnly: true },
  { href: '/configuracoes/pagamentos', label: 'Configurações', page: 'settings', icon: Settings, managementOnly: true },
];

/** Shared store navigation keeps the checkout and management screens easy to reach. */
export default function StoreNavigation({ activePage, canManageStore }: StoreNavigationProps) {
  return (
    <nav aria-label="Navegação da loja" className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {navigationItems
        .filter(({ managementOnly }) => !managementOnly || canManageStore)
        .map(({ href, label, page, icon: Icon }) => {
          const active = page === activePage;
          return (
            <Link
              key={page}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${active ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
            >
              <Icon aria-hidden="true" size={17} />
              <span>{label}</span>
            </Link>
          );
        })}
    </nav>
  );
}
