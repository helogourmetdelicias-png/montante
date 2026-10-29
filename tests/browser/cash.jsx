import React from 'react';
import { createRoot } from 'react-dom/client';
import CashRegisterPage from '../../src/app/caixa/register-page';
import PointOfSale from '../../src/app/pdv/point-of-sale';
import '../../src/app/globals.css';
const pdv = new URLSearchParams(location.search).get('mode') === 'pdv';
createRoot(document.getElementById('root')).render(pdv
  ? <PointOfSale storeName="Loja de teste" operatorName="Operador" canManageBrand={false} />
  : <CashRegisterPage initialAction={new URLSearchParams(location.search).get('action')} operatorName="Operador" canManageStore={false} />);
