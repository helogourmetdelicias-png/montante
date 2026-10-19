# Backend de pagamentos

## Ambiente Supabase

O projeto Supabase informado é `https://zqhhgdankdinrsivpcbq.supabase.co`. A chave `anon public` é destinada a operações públicas protegidas por políticas RLS; ela não permite administrar o projeto e não deve ser usada como `service_role`. O backend atual usa Prisma/PostgreSQL via `DATABASE_URL` e `DIRECT_URL`; essas URLs e respectivas senhas precisam ser configuradas como segredos do ambiente. A chave pública enviada não foi copiada para arquivos do repositório.

`ENCRYPTION_KEY` deve conter 32 bytes aleatórios representados por 64 caracteres hexadecimais. Mantenha a mesma chave no ambiente onde as credenciais foram gravadas; trocá-la sem recriptografar os dados torna as credenciais armazenadas ilegíveis. Nenhuma configuração de pagamento havia sido gravada quando a chave local foi regenerada.

Para obter as URLs corretas, abra o projeto no painel Supabase, use **Connect** e copie as connection strings Postgres correspondentes a `DATABASE_URL` e `DIRECT_URL`. Substitua todos os placeholders pelo usuário, host e senha reais do banco; em particular, não deixe `[PROJECT-REF]` nem `[YOUR-PASSWORD]` no `.env`. A senha do banco é diferente da chave `anon public`.

Não coloque credenciais Supabase, de gateway ou de banco no GitHub. O repositório local ainda não possui metadados Git, portanto nenhuma conexão, commit ou push foi realizado. Depois de inicializar o repositório, mantenha `.env` ignorado e cadastre os segredos no ambiente de deploy.

## Mercado Pago Sandbox

1. Cada loja deve salvar o próprio Access Token de teste na tela `/configuracoes/pagamentos`, ativar o Mercado Pago e manter o ambiente em `sandbox`.
2. Defina `PAYMENTS_TEST_ENABLED=true` e inicie o servidor de desenvolvimento. A variável `MERCADO_PAGO_ACCESS_TOKEN` não é usada pelas rotas de teste por loja.
3. Acesse `http://localhost:3000/pagamentos-teste` com uma sessão de `owner` ou `admin`, crie uma cobrança Pix de baixo valor e confira o QR/copia e cola.
4. Use os usuários de teste e os meios indicados pelo Mercado Pago para simular o pagamento.

As rotas autenticam a sessão e buscam a credencial criptografada da loja ativa. Elas aceitam somente configuração `sandbox`, criam uma order Pix no modo automático em `/v1/orders` com chave de idempotência e consultam o status em `/v1/orders/{id}`. A resposta disponibiliza QR Code, Pix copia e cola e link de pagamento. A página e as rotas de teste só ficam acessíveis pelo próprio computador (`localhost`/`127.0.0.1`) e respondem 404 em produção independentemente da variável de habilitação. O status aprovado só deve ser usado para conciliação depois de confirmado pelo servidor do gateway.

Referências oficiais: [criar Order](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/create-order/post), [Checkout Transparente via Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix), [modelo de integração Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-model).

## Antes de produção

- O schema agora prevê configurações por tenant, ambiente sandbox/produção, terminais e tentativas de pagamento com provedor, método, canal, status, valores, chaves de idempotência e IDs externos. Nenhum número de cartão ou CVV deve ser persistido.
- `GET/POST /api/settings/payments` lista o catálogo e salva configurações por loja. `GET/POST /api/settings/payments/terminals` lista e registra os terminais da loja. As rotas exigem sessão e papel `owner` ou `admin`; respostas nunca devolvem credenciais descriptografadas.
- O catálogo do código distingue o que já está disponível do que depende de integração futura: Mercado Pago Pix online e Pix manual estão disponíveis; Point, Stone/Ton, Asaas e PagBank ficam listados para configuração/roadmap, mas não devem iniciar cobranças até seus adaptadores serem implementados e homologados. Maquininha externa pode ser registrada manualmente, sem confirmação automática.
- A tela `/configuracoes/pagamentos` lista provedores, configura ambiente e credenciais, define ativo/padrão e registra uma maquininha externa. Requer sessão e papel `owner` ou `admin`, como as rotas de backend.
- A migration inicial `prisma/migrations/20261017000100_initial_schema/migration.sql` foi aplicada ao Supabase após aprovação; ela cria o schema Prisma atual.
- `/cadastro` e `POST /api/auth/register` criam uma loja e seu primeiro usuário com papel `owner`; o cadastro usa senha com hash e direciona para as configurações de pagamentos.

- Persistir tentativas e IDs externos vinculados ao tenant/venda no banco, com chave de idempotência estável da venda.
- Configurar webhook público, validar assinatura conforme a documentação vigente e atualizar estado idempotentemente.
- Aplicar autenticação/limites por tenant e auditoria às rotas de operação real.
- Usar credenciais de produção apenas em segredos do ambiente de produção e executar uma cobrança real controlada após homologação.
- Não tratar o QR Pix manual como confirmação automática; requer conciliação ou confirmação explícita.

## Reservas expiradas

A rota `POST /api/cron/release-expired-sales` libera reservas vencidas e devolve o estoque na mesma transação. Ela aceita até 100 tenants por execução; chamadas repetidas são seguras porque só transiciona vendas ainda pendentes.

Configure `CRON_SECRET` como segredo no ambiente de hospedagem e agende um `POST` periódico com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. Um intervalo de um minuto mantém a reserva de 15 minutos próxima do comportamento esperado no caixa. A rota retorna `401` sem a credencial, `503` quando o segredo não está configurado e não inclui detalhes da credencial nas respostas ou logs.
