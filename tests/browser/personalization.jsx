import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoginForm from '../../src/app/login/login-form';
import Personalization from '../../src/app/perfil/personalization';
import PdvScreensaver from '../../src/components/pdv-screensaver';
import StoreActions from '../../src/app/admin/store-actions';
import StoreBrand from '../../src/components/store-brand';
import ProductCatalog from '../../src/app/produtos/product-catalog';
import ServiceOrderForm from '../../src/app/ordens-servico/service-order-form';
import NicheProductFields from '../../src/app/produtos/niche-product-fields';
import '../../src/app/globals.css';
function Harness() {
  const mode = new URLSearchParams(location.search).get('mode');
  const [sales, setSales] = useState(0);
  const [niche, setNiche] = useState('CLOTHING');
  const [attributes, setAttributes] = useState({});
  if (mode === 'product-cost') return <ProductCatalog initialNiche="IT_SUPPORT" />;
  if (mode === 'service-cost') return <main className="p-5"><ServiceOrderForm /></main>;
  if (mode === 'material') return <main className="p-5"><label>Nicho<select value={niche} onChange={event => setNiche(event.target.value)}>{['CLOTHING', 'CONSTRUCTION', 'PHONE_REPAIR', 'IT_SUPPORT', 'COSMETICS', 'BEVERAGES', 'OTHER'].map(value => <option key={value}>{value}</option>)}</select></label><NicheProductFields niche={niche} brand="" attributes={attributes} onBrandChange={() => {}} onAttributesChange={setAttributes} /></main>;
  if (mode === 'login') return <LoginForm />;
  if (mode === 'brand') return <main className="p-5"><StoreBrand /><button onClick={() => window.dispatchEvent(new Event('montante:brand-updated'))}>Atualizar logo</button></main>;
  if (mode === 'admin') return <StoreActions store={{ id: 'qa-store', name: 'Loja de teste', slug: 'loja-teste', active: true, planOverride: 'automatic', protected: false }} onChanged={() => setSales(value => value + 1)} />;
  if (mode === 'screensaver') return <main className="p-8"><h1>PDV de teste</h1><label>Valor da venda<input aria-label="Valor da venda" defaultValue="25,90" /></label><button type="button" onClick={() => setSales(value => value + 1)}>Registrar venda de teste</button><p>Vendas registradas: {sales}</p><PdvScreensaver initial={{ minutes: 2, imageUrl: '/banner-test.png' }} /></main>;
  return <main className="mx-auto max-w-4xl space-y-5 bg-slate-50 p-5"><h1 className="text-2xl font-semibold">Perfil</h1><Personalization avatarUrl="" logoUrl="" imageUrl="" minutes={0} canManage /></main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
