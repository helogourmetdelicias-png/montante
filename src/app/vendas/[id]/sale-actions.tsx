'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money } from '../format';

type ManualAttempt = { id: string; provider: string; amount: string };

const providerLabel = (provider: string) => provider === 'pix_manual' ? 'Pix manual' : provider === 'external_terminal' ? 'Maquininha externa' : provider;

export default function SaleActions({ saleId, expired, canConfirm, manualAttempts, onlinePendingCount }: {
  saleId: string;
  expired: boolean;
  canConfirm: boolean;
  manualAttempts: ManualAttempt[];
  onlinePendingCount: number;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cancelStep, setCancelStep] = useState<'idle' | 'confirm' | 'cash_refund'>('idle');
  const [cashToReturn, setCashToReturn] = useState('');

  async function confirmReceipt(attemptId: string) {
    setBusyAction(`confirm:${attemptId}`);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/sales/${saleId}/payments/${attemptId}/confirm`, { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível confirmar o recebimento.');
      setSuccess('Recebimento confirmado. A venda foi concluída.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível confirmar o recebimento.');
    } finally {
      setBusyAction('');
    }
  }

  async function cancelSale(cashRefunded = false) {
    setBusyAction('cancel');
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/sales/${saleId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashRefunded }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && result.cashRefundRequired) {
        setCashToReturn(String(result.cashToReturn));
        setCancelStep('cash_refund');
        return;
      }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível cancelar a venda.');
      setSuccess('Venda cancelada e estoque liberado.');
      setCancelStep('idle');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível cancelar a venda.');
    } finally {
      setBusyAction('');
    }
  }

  return <section className="receipt-actions mx-auto mb-5 max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Ações da venda pendente">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">Ações da venda</h2>
        <p className="mt-1 text-sm text-slate-600">Confirme um recebimento manual ou cancele a venda para liberar o estoque e o fechamento do caixa.</p>
      </div>
      <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => { setCancelStep('confirm'); setError(''); setSuccess(''); }} className="border-red-200 text-red-700 hover:bg-red-50">Cancelar venda</Button>
    </div>

    {expired && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O prazo de 15 minutos terminou. O cancelamento automático depende da verificação das cobranças e de eventual devolução de dinheiro. Cancele a venda para verificar essas pendências agora.</p>}

    {manualAttempts.length > 0 && <div className="mt-4 space-y-2">
      {manualAttempts.map(attempt => <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <span><strong>{providerLabel(attempt.provider)}</strong> · {money(attempt.amount)} aguardando confirmação</span>
        {canConfirm && !expired
          ? <Button type="button" disabled={Boolean(busyAction)} onClick={() => void confirmReceipt(attempt.id)} className="h-9 bg-emerald-600 hover:bg-emerald-700">{busyAction === `confirm:${attempt.id}` ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : <Check className="mr-2" size={16} />}Confirmar recebimento</Button>
          : <span className="text-xs text-emerald-900">{expired ? 'Prazo encerrado: só é possível cancelar.' : 'Somente o operador desta venda, com o caixa aberto, pode confirmar.'}</span>}
      </div>)}
    </div>}

    {onlinePendingCount > 0 && <p className="mt-3 text-xs text-slate-500">{onlinePendingCount === 1 ? 'Há 1 cobrança online aguardando o provedor' : `Há ${onlinePendingCount} cobranças online aguardando o provedor`}. A confirmação é automática; se o pagamento não aparecer, cancele a venda para liberar o estoque.</p>}

    {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><TriangleAlert className="mt-0.5 shrink-0" size={16} />{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}

    {cancelStep === 'confirm' && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-semibold">Cancelar esta venda?</p>
      <p className="mt-1">O estoque reservado será devolvido e a venda deixará de bloquear o caixa. Se houver Pix manual ou maquininha pendente, confirme antes que o cliente não pagou.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={Boolean(busyAction)} onClick={() => void cancelSale(false)} className="bg-red-600 hover:bg-red-700">{busyAction === 'cancel' && <LoaderCircle className="mr-2 animate-spin" size={16} />}Sim, cancelar venda</Button>
        <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => setCancelStep('idle')}>Manter venda</Button>
      </div>
    </div>}

    {cancelStep === 'cash_refund' && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-semibold">Devolva o dinheiro antes de cancelar</p>
      <p className="mt-1">Esta venda recebeu <strong>{money(cashToReturn)}</strong> em dinheiro. Devolva o valor ao cliente; o cancelamento e a liberação do estoque só acontecem depois da confirmação.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={Boolean(busyAction)} onClick={() => void cancelSale(true)} className="bg-red-600 hover:bg-red-700">{busyAction === 'cancel' && <LoaderCircle className="mr-2 animate-spin" size={16} />}Já devolvi o dinheiro. Cancelar venda</Button>
        <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={() => { setCancelStep('idle'); setCashToReturn(''); }}>Manter venda</Button>
      </div>
    </div>}
  </section>;
}
