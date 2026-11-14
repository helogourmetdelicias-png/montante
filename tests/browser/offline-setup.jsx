import React from 'react';
import { createRoot } from 'react-dom/client';
import PdvOfflineStatus from '../../src/components/pdv-offline-status';
createRoot(document.getElementById('root')).render(<PdvOfflineStatus tenantId="store-a" userId="user-a" blocked={false} getDraft={() => ({ mode: 'quick', quickAmount: '12,50', discount: '0,00', notes: 'Venda em edição', items: [] })} />);
