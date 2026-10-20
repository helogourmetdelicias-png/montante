'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tenantInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('montante.login') ?? 'null');
      if (typeof saved?.tenantSlug === 'string' && tenantInput.current && !tenantInput.current.value) tenantInput.current.value = saved.tenantSlug;
      if (typeof saved?.email === 'string' && emailInput.current && !emailInput.current.value) emailInput.current.value = saved.email;
    } catch { /* Login remains available when browser storage is unavailable. */ }
    // Remove credentials left in the address bar by an older, non-hydrated login page.
    const currentUrl = new URL(window.location.href);
    let changed = false;
    for (const key of ['email', 'password', 'tenantSlug']) {
      if (currentUrl.searchParams.has(key)) {
        currentUrl.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(null, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const tenantSlug = String(form.get('tenantSlug')).trim().toLowerCase();
    const password = String(form.get('password'));
    const query = new URLSearchParams(window.location.search);
    const requestedPath = query.get('callbackUrl') ?? '/';
    const callbackUrl = requestedPath.startsWith('/') && !requestedPath.startsWith('//')
      ? requestedPath
      : '/';

    try {
      const result = await signIn('credentials', {
        email,
        password,
        tenantSlug,
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        setError(['CallbackRouteError', 'Configuration'].includes(result.error)
          ? 'O sistema não conseguiu acessar o banco da loja. A conexão com o Supabase precisa ser configurada pelo administrador.'
          : 'Não foi possível entrar. Confira o e-mail, a senha e o identificador da loja.');
        setBusy(false);
        return;
      }
      try {
        localStorage.setItem('montante.login', JSON.stringify({ tenantSlug, email }));
      } catch { /* Remembering the account must never block a successful login. */ }
      // Passwords are saved only by the browser's password manager, with its consent flow.
      try {
        const PasswordCredential = (window as Window & { PasswordCredential?: new (data: { id: string; password: string }) => Credential }).PasswordCredential;
        if (PasswordCredential && navigator.credentials) {
          await navigator.credentials.store(new PasswordCredential({ id: email, password }));
        }
      } catch { /* Browsers without password saving still complete the login normally. */ }
      window.location.assign(result?.url ?? callbackUrl);
    } catch {
      setError('O serviço de autenticação não respondeu. Tente novamente em instantes.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><LockKeyhole className="h-6 w-6" /></div>
          <p className="mt-4 text-sm font-semibold text-primary">Montante</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Acesse sua loja</h1>
          <p className="mt-2 text-sm text-muted-foreground">Entre com seus dados de acesso do Montante.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Entrar</CardTitle>
            <CardDescription>Informe também o identificador da sua loja para localizar sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" autoComplete="on" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="tenantSlug">Identificador da loja</Label><Input ref={tenantInput} id="tenantSlug" name="tenantSlug" placeholder="ex.: minha-loja" autoCapitalize="none" autoCorrect="off" autoComplete="organization" required minLength={1} /></div>
              <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input ref={emailInput} id="email" name="email" type="email" autoComplete="username" placeholder="voce@loja.com.br" required /></div>
              <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} /></div>
              <p className="text-xs text-muted-foreground">A loja e o e-mail serão lembrados neste navegador. Para preencher a senha nas próximas entradas, aceite salvá-la quando o navegador solicitar.</p>
              {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Entrando…</> : <>Entrar <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Se você não sabe o identificador da loja, peça ao administrador da conta.</p>
        <p className="mt-3 text-center text-sm text-muted-foreground">Ainda não tem loja cadastrada? <Link href="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">Criar loja</Link></p>
      </div>
    </main>
  );
}
