'use client';
/* eslint-disable @next/next/no-img-element -- Private, authenticated images must be loaded directly with the session cookie. */
import { useEffect, useId, useRef, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IMAGE_MAX_BYTES, type MediaPurpose } from '@/lib/media/types';

async function preparePhoto(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Escolha uma foto menor, de até 20 MB antes do ajuste.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use uma foto PNG, JPG ou WebP.');
  if (file.size <= IMAGE_MAX_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (!blob || blob.size > IMAGE_MAX_BYTES) throw new Error('Escolha uma imagem menor, de até 3 MB.');
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}

export default function ImageUpload({ label, purpose, value, onChange, disabled = false, onBusyChange }: { label: string; purpose: MediaPurpose; value: string; onChange: (url: string) => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const id = useId();
  const gallery = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyCallback = useRef(onBusyChange);
  const alive = useRef(true), controller = useRef<AbortController | null>(null);
  useEffect(() => { busyCallback.current = onBusyChange; }, [onBusyChange]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); busyCallback.current?.(false); }; }, []);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function choose(picked?: File) {
    if (!picked) return;
    setError(''); setBusy(true); onBusyChange?.(true);
    try { const prepared = await preparePhoto(picked); if (alive.current) setFile(prepared); }
    catch (error) { setFile(null); onBusyChange?.(false); setError(error instanceof Error ? error.message : 'Não foi possível ler a imagem.'); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!file) return; setBusy(true); setError('');
    try {
      const body = new FormData(); body.set('file', file); body.set('purpose', purpose);
      controller.current = new AbortController();
      const response = await fetch('/api/media', { method: 'POST', body, signal: controller.current.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Falha no envio.');
      if (!alive.current) return;
      onChange(data.url); setFile(null); onBusyChange?.(false);
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : 'Falha no envio.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="space-y-3" aria-labelledby={`${id}-label`}><h3 id={`${id}-label`} className="text-sm font-medium">{label}</h3><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled || busy} onClick={() => gallery.current?.click()}><ImagePlus size={16} className="mr-2" />Selecionar imagem</Button><Button type="button" variant="outline" disabled={disabled || busy} onClick={() => camera.current?.click()}><Camera size={16} className="mr-2" />Tirar foto</Button></div><input ref={gallery} type="file" accept="image/*" aria-label={`Selecionar ${label}`} hidden disabled={disabled || busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} /><input ref={camera} type="file" accept="image/*" capture="environment" aria-label={`Fotografar ${label}`} hidden disabled={disabled || busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />{(preview || value) && <div className="rounded-xl border bg-slate-100 p-3"><img src={preview || value} alt={`Prévia: ${label}`} className="mx-auto max-h-56 w-full object-contain" /><p className="mt-2 text-xs text-slate-500">{file ? 'Confira a imagem antes de confirmar.' : 'Imagem selecionada. Salve o formulário para concluir.'}</p></div>}{file ? <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || disabled} onClick={() => void upload()}>{busy ? 'Enviando…' : 'Usar esta imagem'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setFile(null); onBusyChange?.(false); }}>Cancelar imagem</Button></div> : value && <Button type="button" variant="ghost" disabled={busy || disabled} onClick={() => onChange('')}>Remover imagem</Button>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<p className="text-xs text-slate-500">PNG, JPG ou WebP. Fotos grandes são ajustadas mantendo a proporção.</p></section>;
}
