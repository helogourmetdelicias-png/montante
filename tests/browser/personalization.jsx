import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoginForm from '../../src/app/login/login-form';
import Personalization from '../../src/app/perfil/personalization';
import PdvScreensaver from '../../src/components/pdv-screensaver';
import StoreActions from '../../src/app/admin/store-actions';
import '../../src/app/globals.css';
function Harness() {
  const mode = new URLSearchParams(location.search).get('mode');
  const [sales, setSales] = useState(0);
  if (mode === 'login') return <LoginForm />;
  if (mode === 'admin') return <StoreActions store={{ id: 'qa-store', name: 'Loja de teste', slug: 'loja-teste', active: true, planOverride: 'automatic', protected: false }} onChanged={() => setSales(value => value + 1)} />;
  if (mode === 'screensaver') return <main className="p-8"><h1>PDV de teste</h1><label>Valor da venda<input aria-label="Valor da venda" defaultValue="25,90" /></label><button type="button" onClick={() => setSales(value => value + 1)}>Registrar venda de teste</button><p>Vendas registradas: {sales}</p><PdvScreensaver initial={{ minutes: 2, imageUrl: '/banner-test.png' }} /></main>;
  return <main className="mx-auto max-w-4xl space-y-5 bg-slate-50 p-5"><h1 className="text-2xl font-semibold">Perfil</h1><Personalization avatarUrl="" logoUrl="" imageUrl="" minutes={0} canManage /></main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
