'use client';

import { FormEvent, useRef, useState } from 'react';
import { Bot, LoaderCircle, Send } from 'lucide-react';
import StoreNavigation from '@/components/store-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Message = { role: 'user' | 'assistant'; content: string };
type Source = { consultedAt: string; period: { startDate: string; endDate: string }; completedSales: { count: number; revenue: string }; currentOutstandingCreditsAllTime: { amount: string; openCount: number }; creditReceiptTotalsInPeriod: { amount: string; count: number } };
function today() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}
const money = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const date = (value: string) => value.split('-').reverse().join('/');

export default function MontanteAssistant({ configured }: { configured: boolean }) {
  const [startDate, setStartDate] = useState(() => `${today().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  function reset() { setMessages([]); setSource(null); setError(''); }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !question.trim() || !configured) return;
    locked.current = true; setBusy(true); setError('');
    const content = question.trim();
    try {
      const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: content, startDate, endDate, history: messages.slice(-6) }) });
      if (response.redirected) { window.location.assign('/login'); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível consultar a IA.');
      setMessages(current => [...current.slice(-18), { role: 'user', content }, { role: 'assistant', content: body.answer }]);
      setSource(body.snapshot); setQuestion('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha na consulta. Tente novamente.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-5xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Bot className="text-orange-600" />IA Montante</h1><p className="mt-1 text-sm text-slate-600">Vendas, pagamentos, fiados e orientações para sua loja.</p></div><StoreNavigation activePage="ai" canManageStore /></header>
    <section className="space-y-3 rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">Ao enviar, sua pergunta e um resumo financeiro da loja serão compartilhados com a Groq. O resumo não inclui nomes, documentos ou contatos de clientes. Evite inserir dados pessoais na pergunta. A IA faz consultas e orienta; confira os valores nas telas do sistema antes de tomar decisões.</p>
      {!configured && <p role="status" className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800">Aguardando conexão com a Groq. O administrador do Montante precisa configurar a chave no servidor.</p>}
      <div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm">De<Input type="date" value={startDate} disabled={busy} onChange={e => { setStartDate(e.target.value); reset(); }} /></label><label className="space-y-1 text-sm">Até<Input type="date" value={endDate} disabled={busy} onChange={e => { setEndDate(e.target.value); reset(); }} /></label><Button type="button" variant="outline" disabled={busy} onClick={reset}>Limpar conversa</Button></div>
      <p className="text-xs text-slate-500">Até 366 dias por consulta. O saldo em aberto de fiados é sempre o saldo atual de todo o histórico.</p>
    </section>
    {source && <section aria-label="Dados consultados" className="rounded-xl border bg-white p-5 text-sm"><p className="font-medium">Fonte: registros da sua loja • {date(source.period.startDate)} a {date(source.period.endDate)}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><p>Vendas concluídas: <strong>{source.completedSales.count}</strong></p><p>Faturamento: <strong>{money(source.completedSales.revenue)}</strong></p><p>Fiados em aberto hoje: <strong>{money(source.currentOutstandingCreditsAllTime.amount)}</strong></p><p>Fiados recebidos no período: <strong>{money(source.creditReceiptTotalsInPeriod.amount)}</strong></p></div><p className="mt-2 text-xs text-slate-500">Consultado em {new Date(source.consultedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Faturamento inclui fiados e não equivale a recebimentos.</p></section>}
    <section className="rounded-xl border bg-white p-5" aria-label="Conversa com IA Montante">
      {messages.length === 0 && <div className="space-y-3"><h2 className="font-semibold">Como posso ajudar?</h2><div className="flex flex-wrap gap-2">{['Resuma minhas vendas no período.', 'Quanto tenho de fiado em aberto?', 'Compare vendas a fiado e recebimentos no período.', 'Como registro um pagamento parcial de fiado?'].map(text => <Button key={text} variant="outline" type="button" className="h-auto whitespace-normal text-left" disabled={busy || !configured} onClick={() => setQuestion(text)}>{text}</Button>)}</div></div>}
      <div role="log" aria-label="Mensagens" aria-live="polite" className="max-h-[480px] space-y-4 overflow-y-auto">{messages.map((message, index) => <article key={index} className={`mt-4 rounded-lg p-4 ${message.role === 'user' ? 'bg-orange-50' : 'bg-slate-50'}`}><p className="mb-1 text-xs font-semibold text-slate-500">{message.role === 'user' ? 'Você' : 'IA Montante'}</p><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p></article>)}</div>
      <form onSubmit={send} className="mt-5 space-y-3"><label htmlFor="ai-question" className="text-sm font-medium">Sua pergunta</label><textarea id="ai-question" value={question} maxLength={1000} disabled={busy || !configured} onChange={e => setQuestion(e.target.value)} placeholder="Pergunte sobre as vendas e fiados do período selecionado…" className="min-h-24 w-full rounded-lg border p-3 text-sm disabled:opacity-60" /><div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{question.length}/1000</span><Button type="submit" disabled={busy || !configured || !question.trim() || !startDate || !endDate}>{busy ? <LoaderCircle size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}{busy ? 'Consultando…' : 'Enviar pergunta'}</Button></div>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</form>
    </section>
  </div></main>;
}
