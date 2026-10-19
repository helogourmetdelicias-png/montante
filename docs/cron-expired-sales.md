# Limpeza agendada de vendas expiradas

O endpoint de limpeza é `POST /api/cron/release-expired-sales`. Ele exige o cabeçalho `Authorization: Bearer <CRON_SECRET>`. A comparação do segredo é feita em tempo constante. Requisições sem token ou com token incorreto recebem `401`; se `CRON_SECRET` não estiver configurado no servidor, a resposta é `503` para indicar configuração incompleta.

Cada execução busca e processa no máximo 100 vendas pendentes expiradas, em ordem de vencimento. Uma nova execução continua o backlog. A venda só é cancelada e o estoque restaurado uma vez; Orders Pix ainda ativas ou dinheiro recebido sem reembolso mantêm a venda/estoque reservados para conciliação. O retorno JSON inclui totais processados, liberados, adiados e falhos. Logs estruturados `cron.expired_sales.*` registram início, resultado e falha sem incluir o segredo.

## 1. Criar o segredo

Gere um valor aleatório forte localmente, por exemplo:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

Cadastre o resultado como variável de ambiente `CRON_SECRET` no servidor e no agendador quando eles não compartilharem o mesmo conjunto de variáveis. Não coloque o valor no repositório, em `vercel.json`, na URL nem nos logs. Para desenvolvimento local, copie-o para o `.env` ignorado pelo Git.

## 2. URL e cabeçalho

Use a URL pública completa da aplicação:

```text
https://<seu-dominio>/api/cron/release-expired-sales
```

Para Render Cron Jobs e cron-job.org, configure:

- Método: `POST`
- Cabeçalho: `Authorization: Bearer <o mesmo valor de CRON_SECRET>`
- Corpo: vazio
- Agenda inicial sugerida: a cada 15 minutos (`*/15 * * * *`), respeitando os limites do plano do provedor.

### Vercel Cron

O Vercel Cron invoca rotas usando `GET`; por isso esta rota também aceita `GET` com a mesma autenticação e o mesmo processamento limitado. Quando `CRON_SECRET` está configurado no projeto Vercel, o valor é enviado automaticamente como `Authorization: Bearer ...`. Exemplo de configuração versionável em `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/release-expired-sales",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Cadastre `CRON_SECRET` nas variáveis do projeto Vercel e faça um novo deploy para aplicar a agenda. Confira as restrições de frequência do plano: o plano Hobby pode limitar cron jobs a uma execução diária, o que não atende a uma limpeza a cada 15 minutos.

### Render Cron Jobs

Crie um Cron Job e configure `CRON_SECRET` e `APP_URL` (`https://<seu-dominio>`) nas variáveis de ambiente do job. Use um comando que envie a requisição HTTP:

```bash
curl --fail-with-body --silent --show-error \
  --request POST "$APP_URL/api/cron/release-expired-sales" \
  --header "Authorization: Bearer $CRON_SECRET"
```

Defina a agenda no painel do Render. As agendas do Render são interpretadas em UTC.

### cron-job.org

Crie um job com a URL completa, selecione `POST`, deixe o corpo vazio e adicione o cabeçalho personalizado `Authorization` com o valor `Bearer <CRON_SECRET>`. Escolha a frequência e habilite notificações de falha no painel do serviço.

## 3. Verificar a instalação

Uma chamada autorizada responde `200` com campos como `salesProcessed`, `releasedSales`, `deferredSales`, `paymentReceivedSales` e `failedSales`. Sem `Authorization` ou com token inválido, a resposta é `401`; com o segredo ausente no servidor, é `503`. Confira o histórico de execuções do agendador e os logs `cron.expired_sales.completed`/`cron.expired_sales.execution_failed` da aplicação.

Para um disparo manual local, configure `CRON_SECRET` no `.env` ignorado pelo Git e envie o mesmo valor no Bearer:

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Uri 'http://localhost:3000/api/cron/release-expired-sales' -Method Post -Headers $headers
```

Esse endpoint executa a limpeza de verdade: antes de chamá-lo contra produção, confira se há vendas pendentes vencidas, pois a rotina poderá cancelá-las e devolver o estoque. Um retorno `200` com `salesProcessed: 0` significa que não havia vendas vencidas naquele disparo; confirme também os logs para distinguir uma execução válida de uma chamada rejeitada.

Links oficiais: [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs), [segurança e logs no Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Render Cron Jobs](https://render.com/docs/cronjobs) e [FAQ do cron-job.org](https://cron-job.org/en/faq/).
