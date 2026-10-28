'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { ArrowRight, LoaderCircle, LockKeyhole, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SecurityCode, { securityRequest, type VerificationResult } from '@/components/security-code';
import { accountKey, forgetAccount, LEGACY_LOGIN_KEY, LOGIN_ACCOUNTS_KEY, parseAccount, parsePasswordCredentialId, passwordCredentialId, readLoginState, rememberAccount, writeLoginState, type SavedLoginAccount, type SavedLoginState } from '@/lib/saved-login-accounts';

type BrowserPassword = Credential & { password: string };
type PasswordWindow = Window & { PasswordCredential?: new (data: { id: string; password: string; name: string }) => Credential };

export default function LoginForm({ initialAccounts = [] }: { initialAccounts?: SavedLoginAccount[] }) {
  const [busy, setBusy] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [state, setState] = useState<SavedLoginState>({ accounts: [], lastUsed: null });
  const [selected, setSelected] = useState('');
  const [remember, setRemember] = useState(true);
  const [passwordManager, setPasswordManager] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; email: string } | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [tenantChoice, setTenantChoice] = useState('');
  const tenantInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const disabled = busy || retrieving;

  function fillAccount(account?: SavedLoginAccount) {
    setStores([]); setTenantChoice('');
    if (tenantInput.current) tenantInput.current.value = account?.tenantSlug ?? '';
    if (nameInput.current) nameInput.current.value = account?.tenantName ?? '';
    if (emailInput.current) emailInput.current.value = account?.email ?? '';
    if (passwordInput.current) passwordInput.current.value = '';
    setSelected(account ? accountKey(account) : '');
    setError('');
    setNotice('');
  }

  function persist(next: SavedLoginState) {
    setState(next);
    try {
      if (writeLoginState(localStorage, next)) return;
    } catch { /* Storage may be disabled by the browser. */ }
    setNotice('O navegador bloqueou o armazenamento. Você ainda pode entrar, mas a lista não será lembrada após fechar esta página.');
  }

  useEffect(() => {
    setPasswordManager(Boolean((window as PasswordWindow).PasswordCredential && navigator.credentials && window.isSecureContext));
    let saved: SavedLoginState;
    try {
      saved = readLoginState(localStorage.getItem(LOGIN_ACCOUNTS_KEY), localStorage.getItem(LEGACY_LOGIN_KEY), initialAccounts);
    } catch { saved = readLoginState(null, null, initialAccounts); }
    const last = saved.accounts.find(account => accountKey(account) === saved.lastUsed);
    // Do not overwrite credentials already filled by the browser before hydration.
    if (last && !tenantInput.current?.value && !emailInput.current?.value && !passwordInput.current?.value) fillAccount(last);
    persist(saved);
    const currentUrl = new URL(window.location.href);
    let changed = false;
    for (const key of ['email', 'password', 'tenantSlug']) {
      if (currentUrl.searchParams.has(key)) { currentUrl.searchParams.delete(key); changed = true; }
    }
    if (changed) window.history.replaceState(null, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }, [initialAccounts]);

  async function fillSavedPassword(account: SavedLoginAccount) {
    if (!passwordManager) return;
    setRetrieving(true);
    setNotice('');
    try {
      const options: CredentialRequestOptions & { password: boolean } = { password: true, mediation: 'required' };
      const credential = await navigator.credentials.get(options) as BrowserPassword | null;
      if (!credential || credential.type !== 'password') {
        setNotice('Nenhuma senha foi selecionada. Digite a senha para entrar e salvá-la pelo navegador.');
        return;
      }
      const identity = parsePasswordCredentialId(credential.id);
      if (!identity || accountKey(identity) !== accountKey(account)) {
        setNotice('A senha selecionada não está identificada para esta loja e este e-mail. Digite a senha uma vez para salvá-la com a loja correta.');
        return;
      }
      if (passwordInput.current) passwordInput.current.value = credential.password;
      setNotice('Senha preenchida pelo navegador. Clique em Entrar para continuar.');
    } catch {
      setNotice('Não foi possível preencher pelo gerenciador. Digite a senha ou use o preenchimento automático do navegador.');
    } finally { setRetrieving(false); }
  }

  function selectAccount(key: string) {
    const account = state.accounts.find(item => accountKey(item) === key);
    fillAccount(account);
    setRemember(true);
    if (account) void fillSavedPassword(account);
  }

  function identityChanged() {
    if (tenantInput.current) tenantInput.current.value = '';
    setSelected('');
    setError('');
    setNotice('');
    setStores([]); setTenantChoice('');
    if (passwordInput.current) passwordInput.current.value = '';
    if (nameInput.current) nameInput.current.value = '';
  }

  async function completeLogin(proof: VerificationResult) {
    if (!proof.ticket) throw new Error('A verificação expirou. Entre novamente.');
    const requestedPath = new URLSearchParams(window.location.search).get('callbackUrl') ?? '/';
    const callbackUrl = requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\') ? requestedPath : '/';
    const result = await signIn('credentials', { loginTicket: proof.ticket, redirect: false, callbackUrl });
    if (!result?.ok || result.error) throw new Error('Não foi possível abrir a sessão. Entre novamente.');
    if (remember) {
      try {
        const session = await (await fetch('/api/auth/session', { cache: 'no-store' })).json();
        const account = parseAccount({ tenantSlug: session.user.tenantSlug, email: session.user.email, tenantName: nameInput.current?.value });
        if (account) {
          persist(rememberAccount(state, account));
          const PasswordCredential = (window as PasswordWindow).PasswordCredential;
          if (PasswordCredential && navigator.credentials && passwordInput.current?.value) await navigator.credentials.store(new PasswordCredential({ id: passwordCredentialId(account), password: passwordInput.current.value, name: `${account.tenantName} — ${account.email}` }));
        }
      } catch { /* Saving optional browser credentials must not block sign-in. */ }
    }
    if (passwordInput.current) passwordInput.current.value = '';
    window.location.assign(callbackUrl);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const tenantSlug = String(form.get('tenantSlug')).trim().toLowerCase();
    const rawEmail = String(form.get('email')).trim();
    // A browser may autofill the composite password-manager username directly.
    const credentialIdentity = parsePasswordCredentialId(rawEmail);
    if (tenantSlug && credentialIdentity && credentialIdentity.tenantSlug !== tenantSlug) {
      setError('A credencial preenchida pelo navegador pertence a outra loja. Selecione a conta correta.');
      return;
    }
    const email = credentialIdentity?.email ?? rawEmail.toLowerCase();
    const password = String(form.get('password'));
    const query = new URLSearchParams(window.location.search);
    const requestedPath = query.get('callbackUrl') ?? '/';
    const callbackUrl = requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\') ? requestedPath : '/';
    setBusy(true);
    try {
      const choice = tenantChoice || credentialIdentity?.tenantSlug || tenantSlug;
      const result = await securityRequest('start', { email, password, ...(choice ? { tenantChoice: choice } : {}) });
      if (result.stores) { setStores(result.stores); setNotice('Escolha a loja para esta conta.'); }
      else if (result.challengeId) setChallenge({ id: result.challengeId, email });
      else await completeLogin(result);
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><LockKeyhole className="h-6 w-6" /></div>
          <p className="mt-4 text-sm font-semibold text-primary">Montante</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Acesse sua loja</h1>
          <p className="mt-2 text-sm text-muted-foreground">Escolha uma conta salva ou informe seus dados.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Entrar</CardTitle>
            <CardDescription>Suas contas ficam disponíveis neste navegador.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">{challenge && <SecurityCode challengeId={challenge.id} email={challenge.email} onVerified={completeLogin} onBack={() => setChallenge(null)} />}<div className={challenge ? 'hidden' : 'space-y-5'}>
            {state.accounts.length > 0 && <section className="space-y-2" aria-label="Contas salvas">
              <Label htmlFor="savedAccount">Contas salvas ({state.accounts.length})</Label>
              <select id="savedAccount" value={selected} onChange={event => selectAccount(event.target.value)} disabled={disabled} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Entrar com outra conta</option>
                {state.accounts.map(account => <option key={accountKey(account)} value={accountKey(account)}>{account.tenantName} ({account.tenantSlug}) — {account.email}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!selected || disabled} onClick={() => { const next = forgetAccount(state, selected); fillAccount(); persist(next); }}><Trash2 className="mr-2 h-4 w-4" />Remover conta</Button>
                <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { fillAccount(); persist({ accounts: [], lastUsed: null }); }}>Limpar todas</Button>
              </div>
              <p className="text-xs text-muted-foreground">Remover apaga apenas o atalho daqui. Senhas salvas são gerenciadas nas configurações do navegador.</p>
            </section>}
            <form method="post" autoComplete="on" onSubmit={handleSubmit} className="space-y-4">
              <input ref={tenantInput} name="tenantSlug" type="hidden" />
              <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input ref={emailInput} id="email" name="email" type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="voce@loja.com.br" required disabled={disabled} onChange={identityChanged} /></div>
              <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input ref={passwordInput} id="password" name="password" type="password" autoComplete="current-password" required minLength={6} disabled={disabled} /></div>
              <Link href="/recuperar-senha" className="inline-block text-sm font-medium text-orange-700 underline">Esqueci minha senha</Link>{stores.length > 1 && <label className="block text-sm">Escolha a loja<select required value={tenantChoice} onChange={event => setTenantChoice(event.target.value)} className="mt-2 block w-full rounded-lg border p-2"><option value="">Selecione uma loja</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
              {passwordManager && selected && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => { const account = state.accounts.find(item => accountKey(item) === selected); if (account) void fillSavedPassword(account); }}>{retrieving ? 'Consultando navegador…' : 'Preencher senha salva'}</Button>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={disabled} className="h-4 w-4" />Salvar esta conta neste computador</label>
              <div className={remember ? 'space-y-2' : 'hidden'}><Label htmlFor="tenantName">Nome da loja na lista <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input ref={nameInput} id="tenantName" name="tenantName" placeholder="ex.: Minha loja" autoComplete="off" maxLength={100} disabled={disabled} /></div>
              <p className="text-xs text-muted-foreground">O atalho da conta é salvo após entrar. Para lembrar a senha, aceite salvá-la no gerenciador do navegador. Use apenas seu e-mail e senha.</p>
              {notice && <p role="status" className="rounded-md bg-muted p-3 text-sm">{notice}</p>}
              {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={disabled}>{disabled ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />{retrieving ? 'Consultando senha…' : 'Entrando…'}</> : <>Entrar <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
            </form>
          </div></CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Novos dispositivos são confirmados com um código enviado ao seu e-mail.</p>
        <p className="mt-3 text-center text-sm text-muted-foreground">Ainda não tem loja cadastrada? <Link href="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">Criar loja</Link></p>
      </div>
    </main>
  );
}
