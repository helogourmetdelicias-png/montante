'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type VerificationResult = { ticket?: string; resetTicket?: string; stores?: { id: string; name: string }[] };
export async function securityRequest(action: string, body: unknown) {
  const response = await fetch(`/api/auth/security/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível concluir esta etapa.');
  return data;
}

export default function SecurityCode({ challengeId: initial, email, recovery = false, onVerified, onBack }: { challengeId: string; email: string; recovery?: boolean; onVerified: (result: VerificationResult) => Promise<void>; onBack: () => void }) {
  const [challengeId, setChallengeId] = useState(initial);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(60);
  useEffect(() => { const timer = setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000); return () => clearInterval(timer); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const result = await securityRequest('verify', { challengeId, code }); await onVerified(result); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível verificar o código.'); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setMessage('');
    try { const result = await securityRequest('resend', { challengeId }); setChallengeId(result.challengeId); setSeconds(60); setCode(''); setMessage('Um novo código foi enviado. Confira também a pasta de spam.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível reenviar o código.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4" aria-label="Verificação de segurança"><div><h2 className="text-xl font-semibold">Confira seu e-mail</h2><p className="mt-2 text-sm text-slate-600">{recovery ? 'Se houver uma conta cadastrada, enviamos' : 'Enviamos'} um código de seis números para <strong>{email}</strong>. Ele vale por 10 minutos.</p></div><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-medium">Código de segurança<Input autoFocus value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} className="mt-2 h-12 text-center text-2xl tracking-[.4em]" /></label><Button className="w-full" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Confirmar código'}</Button></form>{message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}<div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="ghost" disabled={busy} onClick={onBack}>Voltar</Button><Button type="button" variant="outline" disabled={busy || seconds > 0} onClick={() => void resend()}>{seconds ? `Reenviar em ${seconds}s` : 'Reenviar código'}</Button></div><p className="text-xs text-slate-500">Não compartilhe o código. Confira também a pasta de spam.</p></section>;
}
