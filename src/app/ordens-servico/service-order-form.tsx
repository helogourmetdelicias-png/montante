'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SERVICE_STATUS_LABELS, canTransitionServiceOrder } from '@/lib/service-orders/validation';
import type { serializeServiceOrder } from '@/lib/service-orders/service';
import { money } from '../vendas/format';
import ImageUpload from '@/components/image-upload';

type Order = ReturnType<typeof serializeServiceOrder>;
type Part = { productId: string; name: string; quantity: string; unitPrice: string };
type Product = { id: string; name: string; price: string; stock: string; fractional: boolean };
const control = 'mt-2 block w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal disabled:bg-slate-50';
export default function ServiceOrderForm({ order }: { order?: Order }) {
  const router = useRouter();
  const [draft, setDraft] = useState({ clientName: order?.clientName ?? '', clientPhone: order?.clientPhone ?? '', deviceType: order?.deviceType ?? '', deviceBrandModel: order?.deviceBrandModel ?? '', serialNumberImei: order?.serialNumberImei ?? '', reportedDefect: order?.reportedDefect ?? '', aestheticCondition: order?.aestheticCondition ?? '', devicePassword: '', laborTotal: order?.laborTotal ?? '0.00' });
  const [status, setStatus] = useState(order?.status ?? 'PENDING_APPROVAL');
  const [parts, setParts] = useState<Part[]>(order?.parts ?? []);
  const [photos, setPhotos] = useState(order?.photoUrls.join('\n') ?? '');
  const [imageBusy, setImageBusy] = useState(false);
  const [removePassword, setRemovePassword] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState('');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const locked = !!order && (['COMPLETED', 'CANCELLED'].includes(order.status) || order.sales.some(s => s.status !== 'cancelled'));
  const partsTotal = parts.reduce((sum, p) => sum + Math.round(Number(p.quantity) * Number(p.unitPrice) * 100), 0) / 100;
  const grandTotal = partsTotal + (Number(draft.laborTotal) || 0);
  useEffect(() => {
    if (locked) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/service-orders/parts?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: 'no-store' }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Não foi possível buscar as peças.'); if (!controller.signal.aborted) setProducts(data.products); }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, locked]);
  useEffect(() => { if (!revealedPassword) return; const timer = setTimeout(() => setRevealedPassword(''), 30000); return () => clearTimeout(timer); }, [revealedPassword]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || locked) return;
    if (order && status === 'CANCELLED' && !window.confirm('Cancelar esta ordem de serviço? A senha de testes será removida.')) return;
    setBusy(true); setError('');
    try {
      const payload = { ...draft, laborTotal: Number(draft.laborTotal), removePassword, photoUrls: photos.split('\n').map(p => p.trim()).filter(Boolean), parts: parts.map(p => ({ productId: p.productId, quantity: Number(p.quantity), unitPrice: Number(p.unitPrice) })), ...(order ? { status, version: order.version } : {}) };
      const res = await fetch(order ? `/api/service-orders/${order.id}` : '/api/service-orders', { method: order ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error ?? 'Não foi possível salvar.');
      setRevealedPassword(''); router.push(`/ordens-servico/${result.order.id}`); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao salvar.'); } finally { setBusy(false); }
  }
  async function receive() {
    if (!order || busy || dirty) return; setBusy(true); setError('');
    try { const res = await fetch(`/api/service-orders/${order.id}/checkout`, { method: 'POST' }); const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Não foi possível abrir o caixa.'); router.push(data.href); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha no recebimento.'); setBusy(false); }
  }
  async function showPassword() {
    if (!order || busy) return; setBusy(true); setError('');
    try { const res = await fetch(`/api/service-orders/${order.id}/password`, { method: 'POST', cache: 'no-store' }); const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Não foi possível consultar.'); setRevealedPassword(data.password); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao consultar.'); } finally { setBusy(false); }
  }
  const field = (name: keyof typeof draft, label: string, maxLength: number, required = true) => <label className="block text-sm font-medium">{label}<input className={control} value={draft[name]} maxLength={maxLength} required={required} onChange={e => setDraft(d => ({ ...d, [name]: e.target.value }))} /></label>;
  return <>
    <Link href="/ordens-servico" className="text-orange-700 underline">Voltar às ordens de serviço</Link>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-orange-700">Assistência técnica</p><h1 className="text-3xl font-semibold">{order ? `O.S. #${order.number}` : 'Nova ordem de serviço'}</h1>{order && <p className="mt-2 font-medium">{SERVICE_STATUS_LABELS[order.status]}</p>}</div>{order?.status === 'READY' && <button onClick={() => void receive()} disabled={busy || dirty} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Receber no caixa / PDV</button>}</header>
    {order && dirty && <p role="status" className="text-sm text-amber-800">Salve as alterações do orçamento antes de receber no caixa.</p>}
    {order?.sales.map(sale => <p key={sale.id} className="rounded-lg border bg-slate-50 p-3 text-sm">Venda #{sale.number} · {sale.status === 'completed' ? 'Paga' : sale.status === 'cancelled' ? 'Cancelada' : 'Recebimento pendente'} · <Link className="text-orange-700 underline" href={`/vendas/${sale.id}`}>Abrir venda</Link></p>)}
    {locked && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{order?.status === 'COMPLETED' ? 'Entrega e pagamento concluídos. As peças já foram baixadas do estoque.' : order?.status === 'CANCELLED' ? 'Ordem cancelada. Nenhuma peça foi baixada.' : 'Orçamento bloqueado durante o recebimento. Para editar, resolva ou cancele a venda vinculada.'}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    <form onChangeCapture={() => setDirty(true)} onSubmit={event => void save(event)} className="space-y-6">
      <fieldset disabled={busy || locked} className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Cliente e aparelho</h2><div className="grid gap-4 sm:grid-cols-2">{field('clientName', 'Nome do cliente', 120)}{field('clientPhone', 'Telefone do cliente', 30)}<label className="block text-sm font-medium">Tipo do aparelho<input list="device-types" className={control} value={draft.deviceType} maxLength={80} required onChange={e => setDraft(d => ({ ...d, deviceType: e.target.value }))} /><datalist id="device-types">{['Celular', 'Smartphone', 'Notebook', 'Computador', 'Tablet', 'Outro'].map(t => <option key={t} value={t} />)}</datalist></label>{field('deviceBrandModel', 'Marca e modelo', 160)}{field('serialNumberImei', 'Número de série / IMEI (opcional)', 100, false)}</div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Defeito relatado<textarea className={control} rows={4} required minLength={3} maxLength={5000} value={draft.reportedDefect} onChange={e => setDraft(d => ({ ...d, reportedDefect: e.target.value }))} /></label><label className="text-sm font-medium">Estado físico na entrada<textarea className={control} rows={4} required minLength={2} maxLength={3000} placeholder="Marcas, riscos, tela, acessórios recebidos…" value={draft.aestheticCondition} onChange={e => setDraft(d => ({ ...d, aestheticCondition: e.target.value }))} /></label></div><label className="block text-sm font-medium">Senha para testes (opcional)<input type="password" autoComplete="new-password" className={control} maxLength={200} value={draft.devicePassword} placeholder={order?.hasPassword ? 'Senha já cadastrada; deixe vazio para manter' : 'Informe apenas se necessário ao serviço'} onChange={e => setDraft(d => ({ ...d, devicePassword: e.target.value }))} /></label>{order?.hasPassword && <label className="flex gap-2 text-sm"><input type="checkbox" checked={removePassword} onChange={e => setRemovePassword(e.target.checked)} />Remover senha cadastrada</label>}<p className="text-xs text-slate-500">Senha protegida e removida ao entregar ou cancelar a O.S.</p></section>
        <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Peças e orçamento</h2><p className="text-sm text-slate-600">As peças não ficam reservadas. Confira a disponibilidade antes do recebimento; a baixa ocorre somente na conclusão paga.</p>{!locked && <><label className="block text-sm font-medium">Buscar peça do estoque<input className={control} value={query} maxLength={120} placeholder="Nome ou código" onChange={e => setQuery(e.target.value)} /></label><div className="max-h-48 overflow-auto rounded-lg border">{products.map(product => <div key={product.id} className="flex items-center justify-between gap-3 border-b p-3 text-sm"><span>{product.name}<span className="block text-xs text-slate-500">Estoque: {product.stock} · {money(product.price)}</span></span><button type="button" disabled={parts.some(p => p.productId === product.id)} className="rounded border px-3 py-1 text-orange-700 disabled:opacity-40" onClick={() => { setDirty(true); setParts(p => [...p, { productId: product.id, name: product.name, quantity: '1', unitPrice: product.price }]); }}>Adicionar peça</button></div>)}</div></>}
          {parts.map((part, index) => <div key={part.productId} className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_100px_140px_auto]"><p className="text-sm font-medium">{part.name}</p><label className="text-xs">Quantidade<input type="number" min="0.001" max="9999999.999" step="0.001" required className={control} value={part.quantity} onChange={e => setParts(rows => rows.map((p, i) => i === index ? { ...p, quantity: e.target.value } : p))} /></label><label className="text-xs">Preço unitário (R$)<input type="number" min="0" max="99999999.99" step="0.01" required className={control} value={part.unitPrice} onChange={e => setParts(rows => rows.map((p, i) => i === index ? { ...p, unitPrice: e.target.value } : p))} /></label><button type="button" className="rounded border px-3 py-2 text-sm text-red-700" onClick={() => { setDirty(true); setParts(rows => rows.filter((_, i) => i !== index)); }}>Remover peça</button></div>)}
          <label className="block max-w-xs text-sm font-medium">Mão de obra (R$)<input type="number" min="0" max="99999999.99" step="0.01" required className={control} value={draft.laborTotal} onChange={e => setDraft(d => ({ ...d, laborTotal: e.target.value }))} /></label>
          <dl className="space-y-2 border-t pt-4"><div className="flex justify-between"><dt>Peças</dt><dd>{money(partsTotal)}</dd></div><div className="flex justify-between"><dt>Mão de obra</dt><dd>{money(draft.laborTotal)}</dd></div><div className="flex justify-between text-xl font-semibold"><dt>Total da O.S.</dt><dd>{money(grandTotal)}</dd></div></dl>
        </section>
        <section className="space-y-4 rounded-xl border bg-white p-5"><ImageUpload label="Fotos do aparelho" purpose="service-order" value="" onBusyChange={setImageBusy} disabled={busy || photos.split('\n').filter(Boolean).length >= 10} onChange={url => { if (url) { setPhotos(current => [...new Set([...current.split('\n').filter(Boolean), url])].join('\n')); setDirty(true); } }} /><label className="block text-sm font-medium">Imagens e links vinculados (até 10)<textarea rows={3} className={control} value={photos} placeholder="Uma URL por linha, até 10 fotos" onChange={e => setPhotos(e.target.value)} /></label><p className="mt-2 text-xs text-slate-500">Confirme cada imagem após conferir a prévia. Fotos enviadas ficam privadas na sua loja. Você também pode manter links HTTPS existentes.</p></section>
        {order && <label className="block text-sm font-medium">Situação<select aria-label="Situação" className={control} value={status} onChange={e => setStatus(e.target.value as typeof status)}>{Object.entries(SERVICE_STATUS_LABELS).filter(([key]) => key === order.status || canTransitionServiceOrder(order.status, key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><span className="mt-2 block text-xs font-normal text-slate-500">Marque como pronta após a aprovação e o serviço. A entrega é concluída somente pelo recebimento integral no caixa.</span></label>}
      </fieldset>
      {!locked && <button disabled={busy || imageBusy} className="rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Salvando…' : order ? 'Salvar alterações' : 'Criar ordem de serviço'}</button>}
    </form>
    {order?.hasPassword && !['COMPLETED', 'CANCELLED'].includes(order.status) && <section className="rounded-lg border p-4"><button disabled={busy} type="button" className="text-sm text-orange-700 underline" onClick={() => revealedPassword ? setRevealedPassword('') : void showPassword()}>{revealedPassword ? 'Ocultar senha de testes' : 'Consultar senha de testes'}</button>{revealedPassword && <p className="mt-2 font-mono" role="status">{revealedPassword}</p>}</section>}
    {!!order?.photoUrls.length && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Fotos vinculadas</h2><ul className="mt-3 space-y-2">{order.photoUrls.map((url, i) => <li key={`${url}:${i}`}><a href={url} target="_blank" rel="noopener noreferrer" className="text-orange-700 underline">Abrir foto {i + 1}</a></li>)}</ul></section>}
  </>;
}
