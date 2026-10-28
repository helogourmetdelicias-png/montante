'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import SecurityCode, { securityRequest, type VerificationResult } from '@/components/security-code';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [proof, setProof] = useState<VerificationResult | null>(null);
  const [tenantChoice, setTenantChoice] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      if (!proof) { const data = await securityRequest('forgot', { email }); setChallengeId(data.challengeId); }
      else { await securityRequest('reset', { ticket: proof.resetTicket, password: String(form.get('password')), confirmPassword: String(form.get('confirmPassword')), ...(tenantChoice ? { tenantChoice } : {}) }); setSuccess(true); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível continuar.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-md space-y-5 rounded-2xl border bg-white p-6 shadow-sm"><p className="text-sm font-semibold text-orange-600">Montante</p>{success ? <><h1 className="text-xl font-semibold">Senha atualizada</h1><p className="text-sm text-slate-600">Entre com sua nova senha. Por segurança, os dispositivos precisam ser verificados novamente.</p><Link href="/login" className="block rounded-lg bg-orange-600 p-3 text-center font-medium text-white">Ir para o login</Link></> : challengeId && !proof ? <SecurityCode recovery challengeId={challengeId} email={email} onBack={() => setChallengeId('')} onVerified={async data => { setProof(data); setChallengeId(''); }} /> : <><h1 className="text-xl font-semibold">{proof ? 'Defina sua nova senha' : 'Esqueci minha senha'}</h1><p className="text-sm text-slate-600">{proof ? 'Escolha uma senha de 8 a 72 caracteres.' : 'Informe o e-mail da sua conta para receber um código de recuperação.'}</p><form onSubmit={submit} className="space-y-4">{!proof ? <label className="block text-sm">E-mail<Input type="email" required autoComplete="email" value={email} maxLength={254} onChange={event => setEmail(event.target.value)} className="mt-2" /></label> : <>{(proof.stores?.length ?? 0) > 1 && <label className="block text-sm">Conta da loja<select required value={tenantChoice} onChange={event => setTenantChoice(event.target.value)} className="mt-2 block w-full rounded-lg border p-3"><option value="">Escolha a loja</option>{proof.stores?.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}<label className="block text-sm">Nova senha<Input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-2" /></label><label className="block text-sm">Confirmar nova senha<Input name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="mt-2" /></label></>}{message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}<Button className="w-full" disabled={busy}>{busy ? 'Aguarde…' : proof ? 'Salvar nova senha' : 'Enviar código'}</Button></form></>}<Link href="/login" className="inline-block text-sm text-orange-700 underline">Voltar ao login</Link></div></main>;
}
