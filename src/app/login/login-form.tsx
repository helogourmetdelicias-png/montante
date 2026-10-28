'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { securityRequest, type VerificationResult } from '@/components/security-code';
import { parseAccount, parsePasswordCredentialId, passwordCredentialId } from '@/lib/saved-login-accounts';
type PasswordWindow = Window & { PasswordCredential?: new (data: { id: string; password: string; name: string }) => Credential };

export default function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [passwordManager, setPasswordManager] = useState(false);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [tenantChoice, setTenantChoice] = useState('');
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const tenantHint = useRef('');
  useEffect(() => {
    setPasswordManager(Boolean((window as PasswordWindow).PasswordCredential && navigator.credentials && window.isSecureContext));
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ['email', 'password', 'tenantSlug']) { if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; } }
    if (changed) window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  async function fillSavedPassword() {
    setBusy(true); setNotice(''); setError('');
    try {
      const options: CredentialRequestOptions & { password: boolean } = { password: true, mediation: 'required' };
      const credential = await navigator.credentials.get(options) as (Credential & { password: string }) | null;
      if (!credential || credential.type !== 'password') { setNotice('Selecione um login no gerenciador do navegador ou digite seus dados.'); return; }
      const identity = parsePasswordCredentialId(credential.id);
      tenantHint.current = identity?.tenantSlug ?? '';
      if (emailInput.current) emailInput.current.value = identity?.email ?? credential.id;
      if (passwordInput.current) passwordInput.current.value = credential.password;
      setStores([]); setTenantChoice('');
    } catch { setNotice('Use o preenchimento automático do navegador ou digite seus dados.'); }
    finally { setBusy(false); }
  }
  async function completeLogin(proof: VerificationResult) {
    if (!proof.ticket) throw new Error('A verificação expirou. Entre novamente.');
    const requestedPath = new URLSearchParams(window.location.search).get('callbackUrl') ?? '/';
    const callbackUrl = requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\') ? requestedPath : '/';
    const result = await signIn('credentials', { loginTicket: proof.ticket, redirect: false, callbackUrl });
    if (!result?.ok || result.error) throw new Error('Não foi possível abrir a sessão. Entre novamente.');
    if (saveCredentials) {
      try {
        const session = await (await fetch('/api/auth/session', { cache: 'no-store' })).json();
        const account = parseAccount({ tenantSlug: session.user.tenantSlug, email: session.user.email });
        const PasswordCredential = (window as PasswordWindow).PasswordCredential;
        if (account && PasswordCredential && navigator.credentials && passwordInput.current?.value) await navigator.credentials.store(new PasswordCredential({ id: passwordCredentialId(account), password: passwordInput.current.value, name: account.email }));
      } catch { /* Optional password-manager saving must not block a verified session. */ }
    }
    if (passwordInput.current) passwordInput.current.value = '';
    window.location.assign(callbackUrl);
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const rawEmail = String(form.get('email')).trim();
    const identity = parsePasswordCredentialId(rawEmail);
    const email = identity?.email ?? rawEmail.toLowerCase();
    const choice = tenantChoice || identity?.tenantSlug || tenantHint.current;
    setBusy(true);
    try {
      const result = await securityRequest('start', { email, password: String(form.get('password')), ...(choice ? { tenantChoice: choice } : {}) });
      if (result.stores) { setStores(result.stores); setNotice('Escolha a loja para esta conta.'); }
      else await completeLogin(result);
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10"><div className="w-full max-w-md">
    <div className="mb-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><LockKeyhole className="h-6 w-6" /></div><p className="mt-4 text-sm font-semibold text-primary">Montante</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Acesse sua loja</h1><p className="mt-2 text-sm text-muted-foreground">Entre com seu e-mail e senha.</p></div>
    <Card><CardHeader><CardTitle className="text-xl">Entrar</CardTitle><CardDescription>Seu login e senha podem ser lembrados pelo navegador.</CardDescription></CardHeader><CardContent className="space-y-5">
      <form method="post" autoComplete="on" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input ref={emailInput} id="email" name="email" type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="voce@loja.com.br" required disabled={busy} onChange={() => { tenantHint.current = ''; setStores([]); setTenantChoice(''); setError(''); }} /></div>
        <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input ref={passwordInput} id="password" name="password" type="password" autoComplete="current-password" required minLength={6} disabled={busy} /></div>
        <Link href="/recuperar-senha" className="inline-block text-sm font-medium text-orange-700 underline">Esqueci minha senha</Link>
        {stores.length > 1 && <label className="block text-sm">Escolha a loja<select required value={tenantChoice} onChange={event => setTenantChoice(event.target.value)} className="mt-2 block w-full rounded-lg border p-2"><option value="">Selecione uma loja</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveCredentials} onChange={event => setSaveCredentials(event.target.checked)} disabled={busy} className="h-4 w-4" />Salvar login e senha no navegador</label>
        {passwordManager && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void fillSavedPassword()}>Preencher login e senha salvos</Button>}
        <p className="text-xs text-muted-foreground">Ao entrar, aceite salvar no gerenciador do navegador. A senha não é guardada na lista de contas do sistema.</p>
        {notice && <p role="status" className="rounded-md bg-muted p-3 text-sm">{notice}</p>}{error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Entrando…</> : <>Entrar <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
      </form>
    </CardContent></Card><p className="mt-4 text-center text-xs text-muted-foreground">Use uma senha exclusiva para proteger sua conta.</p><p className="mt-3 text-center text-sm text-muted-foreground">Ainda não tem loja cadastrada? <Link href="/cadastro" className="font-medium text-primary underline">Criar loja</Link></p>
  </div></main>;
}
