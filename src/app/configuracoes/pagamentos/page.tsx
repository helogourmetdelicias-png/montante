'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleHelp, CreditCard, LoaderCircle, LockKeyhole, Plus, RefreshCw, Save, Store, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import StoreNavigation from '@/components/store-navigation';

type Provider = {
  id: string;
  label: string;
  state: 'available' | 'planned';
  available: { methods: string[]; channels: string[] };
  planned: { methods: string[]; channels: string[] };
};

type Configuration = {
  id: string;
  provider: string;
  displayName: string | null;
  environment: 'sandbox' | 'production';
  isActive: boolean;
  isDefault: boolean;
  credentialsConfigured: boolean;
};

type Terminal = {
  id: string;
  provider: string;
  external_terminal_id: string;
  name: string;
  connection_status: string;
  is_active: boolean;
};

type PageData = { providers: Provider[]; configurations: Configuration[] };

const credentialFields: Record<string, { name: string; label: string; hint: string }[]> = {
  mercadopago: [{ name: 'access_token', label: 'Access Token', hint: 'Use o token de teste no ambiente sandbox.' }],
  pagarme: [{ name: 'api_key', label: 'Chave secreta da API (sk_...)', hint: 'Use uma chave de teste no Sandbox. A chave fica protegida e nunca é exibida novamente.' }],
  asaas: [{ name: 'api_key', label: 'Chave de API', hint: 'A integração ainda está em preparação.' }],
  pagbank: [{ name: 'token', label: 'Token da API de Pedidos PagBank', hint: 'Cole somente o token, sem “Bearer”. Use o token correspondente a Sandbox ou Produção. A conta precisa ter uma chave Pix ativa.' }],
  stone_ton: [
    { name: 'client_id', label: 'Client ID', hint: 'Informe somente quando receber as credenciais oficiais da integração.' },
    { name: 'client_secret', label: 'Client Secret', hint: 'A integração ainda não inicia cobranças.' },
  ],
  pix_manual: [{ name: 'pix_key', label: 'Chave Pix da loja', hint: 'Essa opção não confirma o pagamento automaticamente.' }],
};

const methodNames: Record<string, string> = { pix: 'Pix', credit_card: 'Crédito', debit_card: 'Débito' };
const terminalProviderNames: Record<string, string> = {
  pagarme: 'Pagar.me (Stone)',
  stone_ton: 'Stone / Ton (API direta)',
  pagbank: 'PagBank',
  mercadopago: 'Mercado Pago Point',
  external_terminal: 'Outra maquininha (manual)',
};

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new Error(response.ok
      ? 'O servidor retornou uma resposta inválida. Tente atualizar a página.'
      : `O servidor não conseguiu concluir a solicitação (HTTP ${response.status}).`);
  }
}

function integrationSummary(provider: Provider) {
  const availableMethods = provider.available.methods.map((method) => methodNames[method] ?? method);
  if (provider.state === 'planned') return 'Disponível para configuração futura; cobrança ainda não habilitada.';
  if (provider.id === 'external_terminal') return 'Maquininha externa: registro manual, sem confirmação automática.';
  return `Disponível: ${availableMethods.join(', ')} online.`;
}

export default function PaymentSettingsPage() {
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('mercadopago');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [isActive, setIsActive] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [terminalName, setTerminalName] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [terminalProvider, setTerminalProvider] = useState('stone_ton');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(() => pageData?.providers.find(({ id }) => id === selectedProvider), [pageData, selectedProvider]);
  const currentConfig = pageData?.configurations.find(({ provider }) => provider === selectedProvider);
  const fields = credentialFields[selectedProvider] ?? [];

  const loadData = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const [settingsResponse, terminalResponse] = await Promise.all([
        fetch('/api/settings/payments', { cache: 'no-store' }),
        fetch('/api/settings/payments/terminals', { cache: 'no-store' }),
      ]);
      if (settingsResponse.status === 401 || settingsResponse.status === 403) {
        throw new Error(settingsResponse.status === 401 ? 'Entre na sua conta para acessar as configurações.' : 'Somente o responsável ou administrador da loja pode alterar pagamentos.');
      }
      const settings = await readJson(settingsResponse);
      if (!settingsResponse.ok) throw new Error(settings.error ?? 'Não foi possível carregar as configurações.');
      const terminalData = terminalResponse.ok ? await readJson(terminalResponse) : { terminals: [] };
      setPageData(settings);
      setTerminals(terminalData.terminals ?? []);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar as configurações.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const config = pageData?.configurations.find(({ provider }) => provider === selectedProvider);
    setEnvironment(config?.environment ?? 'sandbox');
    setIsActive(config?.isActive ?? false);
    setIsDefault(config?.isDefault ?? false);
    setDisplayName(config?.displayName ?? '');
    setCredentials({});
  }, [pageData, selectedProvider]);

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/settings/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          displayName: displayName || undefined,
          environment,
          isActive,
          isDefault,
          credentials: Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim())),
        }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar.');
      setNotice({ kind: 'success', text: 'Configuração salva com segurança.' });
      await loadData();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao salvar a configuração.' });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch('/api/settings/payments/test', { method: 'POST' });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível testar a conexão.');
      setNotice({ kind: data.ok ? 'success' : 'error', text: [data.message, data.environmentWarning].filter(Boolean).join(' ') });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível testar a conexão.' }); }
    finally { setBusy(false); }
  }

  async function registerTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/settings/payments/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: terminalProvider, externalTerminalId: terminalId, name: terminalName }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível registrar a maquininha.');
      setTerminalId('');
      setTerminalName('');
      setNotice({ kind: 'success', text: `${terminalProviderNames[terminalProvider]} preparado para este ponto de venda. A máquina ficará aguardando integração até ser instalada e pareada.` });
      await loadData();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao registrar a maquininha.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Montante · Administração da loja</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Pagamentos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Configure os provedores da sua loja. Cada estabelecimento mantém suas próprias credenciais.</p>
          <div className="mt-4">
            <StoreNavigation activePage="settings" canManageStore={Boolean(pageData)} />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadData()} disabled={loading || busy}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </header>

      {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-4 text-sm ${notice.kind === 'error' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-emerald-600/30 bg-emerald-600/5 text-emerald-800'}`}>{notice.text}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><CreditCard className="h-5 w-5 text-primary" /> Provedores de pagamento</CardTitle>
          <CardDescription>Escolha um provedor para ver seu estado e editar a configuração.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !pageData ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando configurações…</div> : pageData && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageData.providers.map((provider) => {
              const config = pageData.configurations.find(({ provider: id }) => id === provider.id);
              const active = selectedProvider === provider.id;
              return <button key={provider.id} type="button" onClick={() => setSelectedProvider(provider.id)} className={`rounded-lg border p-4 text-left transition-colors hover:border-primary/60 ${active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-background'}`}>
                <span className="flex items-start justify-between gap-2"><span className="font-semibold">{provider.label}</span>{config?.isActive ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Ativo</span> : <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{provider.state === 'planned' ? 'Em preparação' : 'Inativo'}</span>}</span>
                <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{integrationSummary(provider)}</span>
              </button>;
            })}
          </div>}
        </CardContent>
      </Card>

      {selected && <Card>
        <CardHeader>
          <CardTitle className="text-xl">Configurar {selected.label}</CardTitle>
          <CardDescription>{integrationSummary(selected)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveConfiguration} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="displayName">Nome para identificar</Label><Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={selected.label} maxLength={80} /></div>
              <div className="space-y-2"><Label htmlFor="environment">Ambiente</Label><select id="environment" value={environment} onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'production')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="sandbox">Sandbox · testes</option><option value="production">Produção</option></select></div>
            </div>

            {fields.length > 0 && <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4" /> Credenciais protegidas</div>
              {currentConfig?.credentialsConfigured && <p className="text-xs text-muted-foreground">Já existe uma credencial salva. Deixe em branco para mantê-la; o valor nunca é exibido nesta tela.</p>}
              {fields.map((field) => <div key={field.name} className="space-y-1.5"><Label htmlFor={`credential-${field.name}`}>{field.label}</Label><Input id={`credential-${field.name}`} type={field.name.toLowerCase().includes('secret') || field.name.includes('token') || field.name.includes('key') ? 'password' : 'text'} autoComplete="new-password" value={credentials[field.name] ?? ''} onChange={(event) => setCredentials((current) => ({ ...current, [field.name]: event.target.value }))} placeholder={currentConfig?.credentialsConfigured ? 'Credencial salva · digite somente para substituir' : 'Cole a credencial aqui'} /><p className="text-xs text-muted-foreground">{field.hint}</p></div>)}
            </div>}

            {selected.state === 'planned' && <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p>Você pode preparar os dados, mas este provedor não pode ser ativado para cobranças até a integração ser implementada e homologada.</p></div>}

            {selected.id === 'pix_manual' && <div className="flex gap-3 rounded-lg border p-4 text-sm text-muted-foreground"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /><p>O Pix manual exibe a chave informada, mas não verifica automaticamente se o cliente pagou.</p></div>}

            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} disabled={selected.state === 'planned'} className="h-4 w-4 accent-primary" /><span><strong className="block">Ativar este provedor</strong><span className="text-xs text-muted-foreground">Provedores em preparação não podem ser ativados.</span></span></label>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} disabled={!isActive} className="h-4 w-4 accent-primary" /><span><strong className="block">Usar como padrão</strong><span className="text-xs text-muted-foreground">Somente um padrão deve ser escolhido por loja.</span></span></label>
            </div>
            {selected.id === 'pagarme' && <p className="text-xs text-muted-foreground">Salve a configuração antes de testar. O teste usa a chave já salva no servidor, sem gerar cobrança ou validar a habilitação do Pix.</p>}
            <div className="flex flex-wrap justify-end gap-3">{selected.id === 'pagarme' && <Button type="button" variant="outline" disabled={busy || loading || !currentConfig?.credentialsConfigured || Object.values(credentials).some(value => value.trim())} onClick={testConnection}><RefreshCw className="mr-2 h-4 w-4" />Testar conexão sem cobrança</Button>}<Button type="submit" disabled={busy || loading || !pageData}><Save className="mr-2 h-4 w-4" />{busy ? 'Processando…' : 'Salvar configuração'}</Button></div>
          </form>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><Store className="h-5 w-5 text-primary" /> Preparar maquininha</CardTitle>
          <CardDescription>Cadastre agora o provedor e o ponto de venda. A maquininha fica inativa e aguardando integração até ser instalada e pareada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={registerTerminal} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="space-y-2"><Label htmlFor="terminalProvider">Provedor da maquininha</Label><select id="terminalProvider" value={terminalProvider} onChange={(event) => setTerminalProvider(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{Object.entries(terminalProviderNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="terminalName">Nome da maquininha</Label><Input id="terminalName" value={terminalName} onChange={(event) => setTerminalName(event.target.value)} placeholder="Ex.: Ton balcão" required minLength={2} maxLength={80} /></div>
            <div className="space-y-2"><Label htmlFor="terminalId">Identificação do ponto de venda</Label><Input id="terminalId" value={terminalId} onChange={(event) => setTerminalId(event.target.value)} placeholder="Ex.: caixa-01" required maxLength={100} /></div>
            <Button type="submit" variant="outline" disabled={busy || loading}><Plus className="mr-2 h-4 w-4" /> Preparar terminal</Button>
          </form>
          {terminals.length > 0 ? <ul className="divide-y rounded-lg border">{terminals.map((terminal) => <li key={terminal.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><strong>{terminal.name}</strong><span className="ml-2 text-muted-foreground">{terminalProviderNames[terminal.provider] ?? terminal.provider} · {terminal.external_terminal_id}</span></span><span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">{terminal.is_active ? 'Ativa' : 'Aguardando instalação/integração'}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum terminal preparado para esta loja.</p>}
        </CardContent>
      </Card>

      <p className="flex gap-2 text-xs text-muted-foreground"><Check className="h-4 w-4 shrink-0" /> Os dados são separados por loja. Não cadastre número de cartão, senha de cartão ou código de segurança nesta tela.</p>
    </main>
  );
}
