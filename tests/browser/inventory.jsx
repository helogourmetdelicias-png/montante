import React from 'react';
import { createRoot } from 'react-dom/client';
import InventoryAlertsPanel from '../../src/components/inventory-alerts-panel';
import ProductCatalog from '../../src/app/produtos/product-catalog';
import PointOfSale from '../../src/app/pdv/point-of-sale';
import '../../src/app/globals.css';
const mode = new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')).render(mode === 'catalog'
  ? <ProductCatalog initialNiche="BEVERAGES" />
  : mode === 'pdv' ? <PointOfSale storeName="Loja de teste" canManageBrand operatorName="Lojista" />
  : <main className="mx-auto max-w-7xl p-4"><h1 className="mb-4 text-2xl font-semibold">Relatórios</h1><InventoryAlertsPanel mode="report" /></main>);
