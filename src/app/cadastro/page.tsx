'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LoaderCircle, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import NicheChoices from '@/components/niche-choices';
import type { BusinessNiche } from '@/lib/business-niche';

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

export default function RegisterPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [niche, setNiche] = useState<BusinessNiche | ''>('');
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const data = {
      name: String(form.get('name')).trim(),
      email: String(form.get('email')).trim().toLowerCase(),
      password: String(form.get('password')),
      confirmPassword: String(form.get('confirmPassword')),
      tenantName: tenantName.trim(),
      tenantSlug: tenantSlug.trim().toLowerCase(),
      cnpj: String(form.get('cnpj') ?? '').trim() || undefined,
      niche,
    };

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível criar a loja.');

      window.location.assign('/login?registered=1');
      setBusy(false);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Falha inesperada ao criar a loja.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Store className="h-6 w-6" /></div>
          <p className="mt-4 text-sm font-semibold text-primary">Montante</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Cadastre sua loja</h1>
          <p className="mt-2 text-sm text-muted-foreground">Você será o responsável principal e poderá configurar os pagamentos.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-xl">Criar conta da loja</CardTitle><CardDescription>Use uma senha forte. Ela será armazenada como hash seguro.</CardDescription></CardHeader>
          <CardContent>
            <form method="post" onSubmit={handleSubmit} className="space-y-5">
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="tenantName">Nome da loja</Label><Input id="tenantName" value={tenantName} onChange={(event) => { const value = event.target.value; setTenantName(value); if (!slugEdited) setTenantSlug(slugify(value)); }} required minLength={2} maxLength={100} placeholder="Helô Gourmet Delícias" /></div>
                <div className="space-y-2"><Label htmlFor="tenantSlug">Identificador da loja</Label><Input id="tenantSlug" value={tenantSlug} onChange={(event) => { setSlugEdited(true); setTenantSlug(slugify(event.target.value)); }} required minLength={3} maxLength={50} placeholder="minha-loja" autoCapitalize="none" autoCorrect="off" /><p className="text-xs text-muted-foreground">Identifica sua loja. Para entrar, use apenas e-mail e senha.</p></div>
              </section>
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="name">Seu nome</Label><Input id="name" name="name" required minLength={2} maxLength={100} autoComplete="name" /></div>
                <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
              </section>
              <div className="space-y-2"><Label htmlFor="cnpj">CNPJ <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="cnpj" name="cnpj" inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" /></div>
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
                <div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar senha</Label><Input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" /></div>
              </section>
              <NicheChoices value={niche} onChange={setNiche} disabled={busy} />
              {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy || !tenantSlug.trim()}>{busy ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Criando loja…</> : <>Criar loja e continuar <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">Já tem uma conta? <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">Entrar</Link></p>
      </div>
    </main>
  );
}
