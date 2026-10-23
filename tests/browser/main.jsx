import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SaleActions from '../../src/app/vendas/[id]/sale-actions';

// Isolated browser harness: real UI, mocked HTTP in Playwright, no store database.
function Harness() {
  const [refreshed, setRefreshed] = useState(false);
  useEffect(() => {
    const refresh = () => setRefreshed(true);
    window.addEventListener('sale-refresh', refresh);
    return () => window.removeEventListener('sale-refresh', refresh);
  }, []);
  const mode = new URLSearchParams(location.search).get('mode');
  return refreshed ? <p role="status">Dados da venda atualizados</p> : <SaleActions
    saleId="sale-a" expired={mode === 'expired'} canConfirm={mode !== 'other-operator'}
    manualAttempts={mode === 'online' ? [] : [{ id: 'attempt-a', provider: 'pix_manual', amount: '25.90' }]}
    onlinePendingCount={mode === 'online' ? 1 : 0}
  />;
}
createRoot(document.getElementById('root')).render(<Harness />);
