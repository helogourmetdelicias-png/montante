'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = { kind: 'customers' | 'products'; onImported: () => void | Promise<void> };
export default function CatalogExcelControls({ kind, onImported }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState<{ row: number; message: string }[]>([]);
  const [preview, setPreview] = useState<{ count: number; sample: { row: number; name: string }[] } | null>(null);
  const endpoint = `/api/${kind}/excel`;

  async function download(template: boolean) {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`${endpoint}${template ? '?template=true' : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Não foi possível baixar a planilha.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${template ? 'modelo-' : ''}${kind === 'products' ? 'produtos' : 'clientes'}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Erro ao baixar.'); }
    finally { setBusy(false); }
  }

  async function send(action: 'preview' | 'import') {
    if (!file || busy) return;
    setBusy(true); setNotice(''); setIssues([]);
    try {
      const form = new FormData(); form.set('file', file); form.set('action', action);
      const response = await fetch(endpoint, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) { setPreview(null); setIssues(data.errors ?? []); throw new Error(data.error ?? 'Não foi possível importar.'); }
      if (action === 'preview') setPreview(data);
      else { setPreview(null); setFile(null); setNotice(`${data.imported} cadastros importados.`); await onImported(); dialog.current?.close(); }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Erro na importação.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void download(false)}>Exportar Excel</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => { setNotice(''); dialog.current?.showModal(); }}>Importar Excel</Button>
    </div>
    {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}
    <dialog ref={dialog} aria-labelledby={`excel-title-${kind}`} onCancel={event => { if (busy) event.preventDefault(); }} className="m-auto max-h-[90dvh] w-[min(95vw,650px)] space-y-4 overflow-y-auto rounded-xl border bg-white p-5 text-slate-900 backdrop:bg-slate-950/50">
      <h2 id={`excel-title-${kind}`} className="text-xl font-semibold">Importar {kind === 'products' ? 'produtos' : 'clientes'} por Excel</h2>
      <p className="text-sm text-slate-600">Importa novos cadastros sem alterar os existentes. Use o modelo .xlsx, até 1.000 linhas e 2 MB. A exportação inclui todos os cadastros da loja, inclusive inativos, até 10.000 registros.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void download(true)}>Baixar modelo Excel</Button>
      <label className="block text-sm font-medium">Planilha Excel (.xlsx)<input type="file" accept=".xlsx" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setIssues([]); setNotice(''); }} className="mt-2 block w-full rounded-lg border p-2 text-sm" /></label>
      {preview && <div className="rounded-lg border bg-slate-50 p-3 text-sm"><p className="font-medium">{preview.count} cadastros válidos. Confirme para importar.</p><ul className="mt-2">{preview.sample.map(row => <li key={row.row}>Linha {row.row}: {row.name}</li>)}</ul></div>}
      {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
      {issues.length > 0 && <ul className="max-h-48 overflow-y-auto rounded-lg border p-3 text-sm text-red-700">{issues.map((issue, index) => <li key={index}>Linha {issue.row}: {issue.message}</li>)}</ul>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</Button><Button type="button" disabled={busy || !file} onClick={() => void send(preview ? 'import' : 'preview')} className="bg-orange-600 hover:bg-orange-700">{busy ? 'Processando…' : preview ? 'Confirmar importação' : 'Validar planilha'}</Button></div>
    </dialog>
  </div>;
}
