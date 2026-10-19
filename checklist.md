# Checklist de andamento — Montante

**Atualizado em:** 19/10/2026
**Plano de referência:** `planodoprojeto.txt`
**Legenda:** `[x]` feito e validado; `[~]` implementado parcialmente ou validado só em parte; `[ ]` pendente.

Este arquivo é a referência de andamento. Só marcar como validado depois de executar a verificação correspondente. Não colocar tokens, senhas, URLs de conexão ou outros segredos neste arquivo.

## Feito e validado

- [x] Módulo inicial de Caixa e Relatórios gerenciais implementado localmente: abertura/fechamento por operador e tenant, fundo de troco, suprimento/sangria, conferência, bloqueio de vendas sem turno e bloqueio de fechamento com vendas/cobranças pendentes; API e telas de relatório restritas a `owner/admin`, filtradas por tenant e intervalo comercial de São Paulo.
- [x] Migration `20261019000100_cash_register_and_reports` aplicada no Supabase de produção com `npx prisma migrate deploy`; `npx prisma migrate status` confirmou o schema atualizado. Consultas diretas confirmaram `CashRegisterSession`, `CashRegisterMovement`, a coluna `Sale.cash_register_session_id` e o registro concluído em `_prisma_migrations`.
- [x] Qualidade do módulo Caixa/Relatórios: `npx prisma validate`, geração do Prisma Client, `npx tsc --noEmit --incremental false`, `npm test` (15/15) e `npm run build` passaram nesta publicação. Os testes cobrem cálculo do saldo esperado do caixa, entradas/saídas e isolamento tenant/sessão.
- [~] Código do módulo Caixa/Relatórios pronto para publicação em `main`; validações locais passaram. Aguardando push e confirmação do deploy de produção na Vercel.

- [~] Adapter Pix Pagar.me (Stone) implementado e publicado no commit `2cd510b`; deploy Vercel para `montante-um2r-seven.vercel.app` concluído. Inclui configuração por tenant, credencial criptografada, pedido Pix idempotente, dados do comprador e consulta automática de status no PDV. TypeScript e build de produção passaram. Falta cadastrar chave Sandbox, testar com a API da loja e homologar; a imagem fornecida tinha as chaves mascaradas.
- [~] Guia `docs/pagarme-pix.md` criado. A integração cobre Pix online; cartão presencial permanece na maquininha física. `npm test` não foi executado nesta alteração.
- [~] Chave Pagar.me não exige variável global própria na Vercel: é cadastrada em **Configurações → Pagamentos** e armazenada criptografada por loja. A variável de ambiente `ENCRYPTION_KEY` continua obrigatória na Vercel para proteger essa credencial; ainda falta confirmar no painel se ela está configurada.

- [~] Navegação entre PDV, Produtos e Configurações foi publicada no commit `4859224`; deploy da aplicação `montante-um2r` concluiu. Falta confirmação visual do usuário no navegador.

- [x] Schema Prisma inicial criado para tenants, usuários, produtos, vendas, itens, provedores de pagamento, terminais, tentativas de pagamento e cobranças SaaS.
- [x] Migration inicial aplicada ao Supabase, conforme registrado no histórico desta tarefa.
- [x] Cadastro inicial cria uma loja e seu primeiro usuário responsável com senha armazenada em hash.
- [x] Configurações de pagamento são consultadas e salvas por loja; credenciais são criptografadas no servidor e não retornam pela API.
- [x] Mercado Pago Pix Sandbox foi configurado para uma loja. A presença da credencial criptografada e o estado ativo/padrão foram conferidos sem revelar o token.
- [x] A rota de teste criou Orders Pix com HTTP `201` e consultou Orders com HTTP `200`; a tela recebeu QR Code/copia e cola.
- [x] No fluxo de venda do PDV, o QR Code Pix do Mercado Pago Sandbox abriu após informar e-mail de teste válido. A criação/exibição da cobrança e a conclusão automática após aprovação simulada estão validadas; a liquidação real pelo provedor permanece pendente.
- [x] O comportamento `pending` no teste Pix Sandbox foi esclarecido: a documentação do Mercado Pago diz que esse teste valida a criação da Order, sem simular a liquidação do Pix. [Documentação oficial](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix).
- [x] Teste de tipos TypeScript (`npx tsc --noEmit --incremental false`) passou após a tela de preparação de terminais.

## Implementado, mas ainda não validado de ponta a ponta

- [~] Tela de pagamentos com catálogo, configuração por loja e cadastro de terminal como inativo/aguardando integração.
- [~] Preparação de terminal oferece Stone/Ton, PagBank, Mercado Pago Point e maquininha externa, com identificador do ponto de venda. O cadastro pode ser preparado, mas a integração/pareamento físico aguarda equipamento real (Pinpad/SmartPOS).
- [x] Tela `/produtos` permite cadastrar, editar e excluir com desativação lógica; fluxo autenticado foi percorrido no Supabase com produto QA identificado, alterado e desativado. O registro permanece inativo para preservar histórico. Isolamento real entre tenants foi validado por teste de integração com duas sessões isoladas.
- [~] A função de faixa mensal e a contagem mensal de vendas estão no código. Não foram executados testes de limites (499/500/1000/1001), nem existe rotina mensal que gere cobrança e aviso.
- [~] O adapter pattern lista Mercado Pago, Asaas, PagBank, Stone/Ton, Pix manual e terminal externo. Mercado Pago Pix tem criação/consulta e o fluxo misto com dinheiro; Pix manual/terminal ainda dependem de confirmação do operador, e os demais provedores não estão integrados.

## Não validado ou pendente

### P0 — Acesso e loja de teste

- [x] Contexto esclarecido: Montante é o sistema; `minhaloja` e `helo` são lojas fictícias usadas para teste, sem loja física real. Não é necessário escolher uma loja comercial principal nem unir os tenants.
- [x] Usar `helo` nos testes do Mercado Pago porque a configuração Sandbox está vinculada a esse tenant; manter `minhaloja` separada para preservar o isolamento entre lojas.
- [x] A sessão autenticada de `helo` conseguiu criar e consultar Orders Pix no Sandbox (respostas HTTP `201` e `200`).

### P1 — PDV e venda

- [x] API de produtos por tenant implementada em `GET/POST /api/products` e `PATCH/DELETE /api/products/[id]`. GET/POST/PATCH/DELETE foram exercitados autenticados; teste de integração com duas sessões isoladas confirmou listas separadas e bloqueio de edição/exclusão cruzada.
- [x] Auditoria de dados para unicidade: não há produtos nem colisões de SKU/código de barras no Supabase. Migration aplicada; o banco confirma índices únicos por tenant e a API normaliza SKU/código de barras para maiúsculas antes de gravar.
- [x] Validação de catálogo e venda: quantidades admitem até três casas, preços até duas; estoque fracionado é aceito para produtos por medida e rejeitado para unidade inteira. A API do PDV valida itens, desconto, total, idempotência e reserva em transação serializável.
- [x] Fluxo do PDV confirmado pelo usuário: login identifica e exibe a loja; produto vai ao carrinho; cobrar abre QR Pix; cancelar desfaz a venda e retorna ao estado normal, permitindo iniciar outra. O usuário também confirmou visualmente o fluxo misto e a simulação Pix Sandbox: tela atualizou via polling, parcelas/troco ficaram corretos, venda concluiu e o estoque reservado não teve baixa duplicada. Liquidação real do provedor e webhook continuam pendentes.
- [x] Pagamento em dinheiro no balcão: valor recebido, troco calculado em centavos, validação de valor suficiente e conclusão idempotente. A venda registra método, valor recebido e troco; não chama gateway e conserva a reserva de estoque até concluir ou cancelar.
- [x] Pagamento misto Pix + dinheiro: permite informar a parcela em dinheiro, registra valor aplicado/recebido e troco, cobra no Pix apenas o saldo e mantém a venda pendente até o Mercado Pago confirmar a liquidação.
- [~] API de vendas implementada em `GET/POST /api/sales`, `POST /api/sales/[id]/cancel` e `POST /api/sales/[id]/cash-payment`: registra preço/itens, gera número sequencial por tenant, reserva estoque em transação serializável e usa chaves de idempotência. Dinheiro à vista conclui sem gateway; Pix + dinheiro registra a parcela e cobra somente o saldo Pix. Cancelamento e expiração passam integração no banco; liquidação real Pix segue pendente.
- [~] Rota `POST /api/sales/[id]/payments` registra tentativas por loja/venda antes de chamar o gateway, usa chave de idempotência, cobra apenas o saldo aprovado em pagamentos anteriores e reaproveita a tentativa em repetição. QR Pix, cancelamento e a simulação de conclusão foram conferidos; replay via gateway e liquidação Pix real ainda precisam de validação. Pix manual e outros provedores seguem incompletos.
- [~] Mercado Pago Sandbox exige e-mail do comprador terminado em `@testuser.com`; a tela e a API validam o formato e o QR Code Pix abriu no PDV. A aprovação simulada e a atualização automática via polling foram testadas para Pix integral e misto; falta confirmar uma liquidação feita pelo próprio provedor e validar replay da criação da cobrança.
- [~] Confirmação explícita `POST /api/sales/[id]/payments/[attemptId]/confirm` conclui vendas de Pix manual/maquininha externa somente após ação do operador; a interface do PDV já chama essa rota, ainda falta teste autenticado de ponta a ponta.
- [x] Política definida: reservar ao iniciar a venda e devolver no cancelamento/expiração.
- [x] Rota `POST /api/cron/release-expired-sales` exige `Authorization: Bearer <CRON_SECRET>` com comparação de segredo em tempo constante; ausência/invalidade retorna `401` e segredo não configurado retorna `503`. A rota também aceita `GET` autenticado para compatibilidade com Vercel Cron.
- [x] Cron processa somente uma seleção de até 100 vendas por execução, em ordem de vencimento; reexecuções não cancelam/restauram a mesma venda duas vezes. Orders Pix ativas e dinheiro recebido sem reembolso adiam a liberação; falhas por venda são registradas e devolvidas como `500` para alertar o agendador.
- [~] Guia de configuração do cron cobre Vercel, Render e cron-job.org, além de disparo manual local; `.env.example` contém o campo para `CRON_SECRET`. A execução local foi validada, mas o provedor/domínio de hospedagem ainda não foi informado para cadastrar o segredo e ativar a agenda.
- [~] Escopo confirmado para PDV físico: Dinheiro, Pix e futuramente Maquininha Física. Confirmação manual da maquininha está preparada; pareamento e operação aguardam Pinpad/SmartPOS real.

### P2 — Pagamentos

- [x] Cartão digitado na web e testes de SDK/tokenização removidos do escopo: o PDV é de balcão; pagamentos previstos são Dinheiro, Pix e Maquininha Física quando houver equipamento.
- [x] Implementado webhook Mercado Pago Orders Pix com assinatura HMAC, consulta autenticada do estado da Order, idempotência e atualização transacional. A homologação de entrega real depende da chave cadastrada e da URL HTTPS pública; simulação não substitui liquidação do provedor.
- [ ] Implementar OAuth/conexão de contas dos lojistas quando disponível, em vez de depender de cópia manual de credenciais.
- [~] Pagar.me (Stone) tem adapter Pix online publicado; confirmar Sandbox e homologar com chave válida da conta. API direta Ton, cartão na maquininha física, PagBank e Asaas ainda aguardam integração/documentação/credenciais conforme aplicável.
- [~] Parear e testar a maquininha física no ambiente da loja quando Pinpad/SmartPOS, modelo, software e credenciais estiverem disponíveis.
- [ ] Testar cancelamento, expiração, reembolso e conciliação; não persistir número de cartão, CVV ou senha.

### P3 — Assinatura SaaS

- [ ] Definir e testar os limites das faixas de preço, inclusive os valores exatamente em 500 e 1.000 vendas.
- [ ] Criar rotina mensal idempotente para contar vendas concluídas, gerar `BillingRecord` e evitar cobranças duplicadas.
- [ ] Exibir aviso da assinatura no painel e gerar QR Code Pix do SaaS com vencimento e confirmação de pagamento.
- [ ] Validar notificações, estados pago/pendente/atrasado e histórico de cobrança.

### P4 — Produção e operação

- [ ] Configurar e revisar segredos nos ambientes de deploy; confirmar persistência e backup de `ENCRYPTION_KEY` sem expor valores.
- [ ] Aplicar e conferir migrations no ambiente de produção pelo fluxo de deploy apropriado. As migrations `20261018000400_split_cash_pix` e `20261018000500_simulated_payment_approval` estão aplicadas no Supabase configurado neste workspace; isso não confirma o ambiente de produção.
- [ ] Revisar autenticação, autorização por tenant, rate limits, logs sem segredos e políticas de acesso ao banco.
- [ ] Homologar com o provedor e executar uma transação real controlada antes de liberar produção.

## Verificações conhecidas

- [x] TypeScript: `npx tsc --noEmit --incremental false` passou após a API inicial de produtos.
- [x] Build: `npx next build --no-lint` passou; as rotas novas `/api/products` e `/api/products/[id]` aparecem na build.
- [x] Validação de produto: cinco verificações locais passaram (frações válidas, limite de casas decimais, atualização parcial e rejeição de atualização vazia).
- [x] Consulta autenticada `GET /api/products?limit=1`: HTTP `200`, lista vazia na sessão aberta.
- [x] Auditoria somente de leitura no Supabase: zero produtos; nenhuma duplicidade existente por tenant/SKU ou tenant/código de barras (comparação sem distinção de caixa).
- [x] Migration `20261018000100_product_tenant_unique_codes` aplicada; `prisma migrate status` confirmou o schema atualizado e consulta ao catálogo do PostgreSQL confirmou os dois índices únicos.
- [x] Oito verificações locais de validação: produto fracionado, estoque inteiro, rejeição de fração para produto inteiro, precisão de preço/quantidade, atualização parcial e rejeição de atualização vazia.
- [x] Simulação dos handlers de produto: POST/GET/PATCH, rejeição de SKU duplicado, acesso cruzado entre dois tenants e DELETE lógico; produto de teste ficou inativo no banco em memória e nenhum dado foi gravado no Supabase.
- [x] Migration `20261018000200_sales_reservations` aplicada; sequência por tenant, campos de idempotência/expiração e índice de vendas pendentes conferidos no Supabase. Não havia vendas antes da migration.
- [x] Simulação dos handlers de venda: reserva e total por unidade, repetição idempotente, chave reutilizada com conteúdo diferente, unidade inteira, falta de estoque com rollback e bloqueio de produto de outro tenant.
- [x] Simulação do cancelamento: devolve estoque, repetição não devolve novamente; helper de expiração marca venda cancelada e devolve estoque sem duplicar a reposição.
- [x] Consulta autenticada real `GET /api/sales?limit=1`: HTTP `200`, lista vazia.
- [x] A cobrança mensal agora conta somente vendas `completed`; validação local confirmou a condição.
- [x] POST/PATCH/DELETE de produto autenticados foram exercitados no Supabase com registro QA e desativação reversível; o teste de isolamento com dois tenants temporários confirmou GET separado e PATCH/DELETE cruzados retornando HTTP `404`.
- [x] `prisma generate` concluiu após parar temporariamente o servidor local; TypeScript passou e o servidor foi reiniciado.
- [x] `prisma validate` passou após adicionar as rotas de tentativa e confirmação manual de pagamento.
- [x] TypeScript (`npx tsc --noEmit --incremental false`) passou após adicionar as rotas de tentativa e confirmação manual de pagamento.
- [x] Build (`npx next build --no-lint`) passou; as rotas `/api/sales/[id]/payments` e `/api/sales/[id]/payments/[attemptId]/confirm` aparecem na build.
- [x] Tela `/pdv`, rota de opções de pagamento e atualização da logo passaram na build de produção.
- [x] Desconto da venda validado no servidor e incluído no hash de idempotência; TypeScript e build passaram.
- [x] Sessão autenticada do PDV conferida: tenant de teste sem produtos e opção Mercado Pago Pix disponível; nenhuma venda/cobrança foi iniciada.
- [x] Processamento agendado de expirações com conciliação de Orders passou TypeScript e build de produção; configuração de hospedagem ainda pendente.
- [x] Tela `/produtos` com cadastro, edição e desativação lógica, protegida para owner/admin, passou TypeScript e build de produção.
- [x] Navegação compartilhada adicionada entre PDV, Produtos e Pagamentos; telas administrativas só aparecem para owner/admin, e a tela Pagamentos mantém o retorno ao PDV mesmo quando não consegue carregar os dados.
- [x] Interface `/produtos` conferida visualmente com sessão autenticada; formulário de cadastro aberto e fechado sem gravar dados.
- [~] POST de venda, reserva de estoque e iniciação Pix foram exercitados no Supabase; o QR Code abriu após corrigir o e-mail de Sandbox. A integração automatizada simula aprovação, cancelamento e expiração usando registros temporários revertidos; nenhuma cobrança real foi criada pelo teste. A aprovação do Pix pelo provedor e o webhook continuam pendentes.
- [x] Diagnóstico da tentativa real Mercado Pago: resposta HTTP `400` do Orders, sem `external_order_id`; correção adiciona e-mail obrigatório para Mercado Pago e valida `@testuser.com` no Sandbox.
- [x] Venda de teste que falhou no gateway foi cancelada após verificar estado e tentativas; uma unidade reservada foi restaurada ao estoque.
- [x] TypeScript (`npx tsc --noEmit --incremental false`) e build (`npx next build --no-lint`) passaram após a validação de e-mail do Mercado Pago Sandbox.
- [x] Fluxo autenticado `/produtos`: produto `QA-CHECK-20261018-01` cadastrado, preço/nome editados e registro excluído por desativação lógica; estado final `Inativo`, histórico preservado.
- [x] Edição autenticada de produto inativo não o reativou; nome e preço continuaram preservados e o estado final permaneceu `Inativo`.
- [x] Testes unitários de reserva: quatro cenários passaram (cancelamento idempotente, expiração idempotente e por tenant, venda ausente/concluída e produto ausente).
- [x] Integração real de banco em `npm run test:reservations:db`: aprovação simulada sem Order externa, cancelamento, expiração e repetição idempotente passaram dentro de uma transação com rollback; nenhum tenant/venda de teste foi persistido.
- [x] Integração HTTP `npm run test:tenant-isolation`: duas sessões JWT temporárias viram apenas os próprios produtos/vendas; tentativa cruzada de PATCH/DELETE de produto e cancelamento de venda foi bloqueada com HTTP `404`; lojas temporárias foram removidas.
- [x] Testes automatizados organizados em `tests/`: seis cenários unitários passaram; integrações de reservas e isolamento foram executadas separadamente.
- [x] Integração de marca: duas lojas temporárias confirmaram logo isolada por tenant; edição por perfil caixa foi negada com HTTP `403`. URL de teste não persistiu após limpeza.
- [~] ESLint ainda não está configurado; `next lint` abre o assistente interativo. TypeScript e build passaram.
- [~] Cartão web/SDK não se aplica ao PDV físico. Liquidação Pix real por webhook e pareamento físico ainda aguardam chave/URL pública do Mercado Pago e equipamento real; a simulação local de aprovação não representa liquidação real.

- [x] Adapter Mercado Pago implementa cancelamento de Orders e reconcilia conflito consultando estado; testes simulados cobriram sucesso e conflito. No fluxo PDV, o usuário confirmou cancelamento do QR pendente e retorno ao estado normal; nenhuma liquidação foi feita.
- [x] `npm test` passou: sete verificações, incluindo cancelamento de Order, reconciliação e cálculo de troco. Integrações de banco/HTTP passaram com insuficiência, cálculo de troco, repetição idempotente, opção dinheiro disponível e isolamento entre lojas. TypeScript e build passaram; as rotas de dinheiro, cancelamento e expiração aparecem na build.
- [x] Migration `20261018000300_cash_payment_receipt` aplicada: vendas guardam `amount_received` e `change_amount`; verificação `prisma migrate deploy` concluiu.
- [x] Migration `20261018000400_split_cash_pix` aplicada: tentativas registram valor entregue/troco; pagamentos em dinheiro usam método/canal próprios.
- [x] Migration `20261018000500_simulated_payment_approval` aplicada: tentativas podem ser marcadas como simuladas sem confundir aprovação local com liquidação confirmada pelo provedor.
- [x] Simulação com transação revertida validou pagamento misto: R$ 0,50 em dinheiro + R$ 0,50 Pix em uma venda de R$ 1,00. A venda permaneceu pendente após o dinheiro e concluiu somente após aprovação simulada do Pix; nenhuma cobrança foi enviada ao gateway.
- [x] Testes unitários (`npm test`), integração simulada com banco (`npm run test:reservations:db`) e TypeScript passaram após o fluxo Pix + dinheiro.
- [x] Integração HTTP com duas lojas passou: opção “Pix + dinheiro”, valor insuficiente, troco, replay idempotente e pendência da venda antes do Pix foram conferidos. Dados temporários foram removidos.
- [x] Build de produção (`npx next build --no-lint`) passou e incluiu as rotas de registro de dinheiro e consulta de status Pix.
- [x] Endpoint `POST /api/sales/[id]/payments/[attemptId]/simulate-approval` validado em modo local/Sandbox para Pix integral e misto: aprova a tentativa, conclui a venda somente quando o total está pago e sinaliza a aprovação como simulada. Perfil caixa recebe HTTP `403`; produção ou `PAYMENTS_TEST_ENABLED` desativado retorna `404`.
- [x] O polling `GET /api/sales/[id]/payments/[attemptId]/status` retornou `approved` e `saleCompleted` após a simulação; a interface atualiza imediatamente ao usar o botão Sandbox, sem recarregar a página.
- [x] Estoque não sofre segunda baixa ao aprovar Pix: já foi reservado ao iniciar a venda; integração do banco confirmou o saldo após aprovação Pix.
- [x] TypeScript (`npx tsc --noEmit --incremental false`), build de produção e `prisma migrate status` passaram após a alteração.
- [x] Tela de pagamentos Sandbox ganhou botão para cancelar Order pendente e endpoint de cancelamento restrito a ambiente de desenvolvimento, Sandbox e usuário owner/admin. TypeScript, testes unitários e build passaram.
- [x] Fluxo informado pelo usuário confirmou QR Pix no PDV e cancelamento com retorno ao estado normal. O usuário confirmou teste visual de Pix + dinheiro e aprovação simulada: atualização automática, conclusão, parcelas/troco e estoque reservado corretos. Nenhuma liquidação Pix real foi feita.
- [x] Autorização cron coberta por testes de token Bearer válido, ausente, malformado e incorreto; lote máximo de 100 coberto por constante testada. `npm test`, TypeScript e build passaram após a implementação.
- [x] Verificação HTTP da rota cron: `POST` sem autorização retornou `401`, `POST` com Bearer incorreto retornou `401` e `GET` com Bearer incorreto retornou `401`; segredo efêmero usado somente no processo local de validação.
- [x] Documentação cron criada em `docs/cron-expired-sales.md`, incluindo Vercel Cron (`GET`), Render Cron e cron-job.org (`POST`), URL, frequência e cabeçalho Bearer; `.env.example` documenta `CRON_SECRET`.
- [x] `npm test`: 10 testes passaram, 0 falharam (inclui testes de autorização e limite do lote cron).
- [x] `npm run test:reservations:db`: aprovação simulada, cancelamento, Pix + dinheiro, troco, expiração, idempotência e rollback passaram.
- [x] `npx tsc --noEmit --incremental false` passou sem erros.
- [x] `npx next build --no-lint` passou e incluiu `/api/cron/release-expired-sales`; a opção `--no-lint` indica que o ESLint não foi executado.
- [x] Disparo manual autorizado do `POST /api/cron/release-expired-sales` no servidor local retornou HTTP `200`; havia zero vendas expiradas, então nenhuma venda ou estoque foi alterado. Logs `cron.expired_sales.started` e `cron.expired_sales.completed` foram emitidos com lote máximo 100 e `failedSales: 0`. A chave foi efêmera e não foi salva no repositório.
- [x] Revalidação em 19/10/2026: nenhuma venda pendente vencida antes do disparo; POST local com Bearer temporário retornou `200`, `salesProcessed: 0`, `failedSales: 0` e logs de início/conclusão. Nenhuma venda ou estoque foi alterado.
- [x] URL pública de imagem de teste respondeu HTTP `200` (`image/png`). A integração de isolamento da marca foi repetida usando essa URL e confirmou persistência restrita ao tenant, logo ausente no segundo tenant e edição bloqueada para perfil caixa (`HTTP 403`); `npm run test:tenant-isolation` passou.
- [~] Os tenants reais de teste `helo` e `minhaloja` foram consultados novamente em 19/10/2026 e continuam sem logo configurada. O usuário informou que ainda está localizando as URLs oficiais; nenhuma marca provisória foi atribuída. A tela carrega e persiste a URL pelo tenant autenticado.
- [x] Rota pública `POST /api/webhooks/mercadopago` implementada com validação HMAC-SHA256 dos cabeçalhos `x-signature`/`x-request-id` e parâmetro assinado `data.id`; a middleware libera apenas essa rota, que rejeita assinatura inválida com `401` e segredo ausente com `503`.
- [x] Webhook consulta a Order no Mercado Pago com a credencial criptografada da loja e só aplica aprovação quando o provedor informa `processed`/`accredited`; o payload recebido não é tratado como prova de pagamento.
- [x] A aprovação do webhook é transacional e idempotente: tentativa já aprovada recebe resposta `200` em reenvios, a venda só conclui quando as parcelas aprovadas cobrem o total, Dinheiro + Pix é preservado e estoque não recebe baixa adicional.
- [x] Endpoint local foi exercitado por HTTP: assinatura inválida retornou `401`; assinatura HMAC válida para Order sem tentativa cadastrada foi reconhecida e respondeu `200` sem alterar vendas ou estoque. Foi usado segredo local temporário, não o segredo real do Mercado Pago.
- [x] `npm test`: 13 testes passaram, 0 falharam; inclui assinatura válida, assinatura ausente/adulterada/segredo incorreto e reprocessamento sem conclusão duplicada.
- [x] `npx tsc --noEmit --incremental false` passou após a implementação do webhook.
- [x] `npx next build --no-lint` passou e incluiu `POST /api/webhooks/mercadopago`; ESLint não foi executado por opção do comando.
- [~] Guia de configuração e variável `MERCADOPAGO_WEBHOOK_SECRET` adicionados em `docs/mercadopago-webhooks.md` e `.env.example`; falta informar o provedor/domínio, cadastrar a chave real no app/hospedagem, configurar URL HTTPS pública e receber uma liquidação real Sandbox.
- [x] Revalidação de qualidade em 19/10/2026: `npm test` passou (13/13), `npx tsc --noEmit --incremental false` passou e `npx next build --no-lint` passou incluindo Cron, PDV e webhook Mercado Pago; o build informa que lint está desabilitado.

## Próxima tarefa

1. Com o provedor/domínio informado, cadastrar o mesmo `CRON_SECRET` na aplicação e no agendador, ativar a agenda e validar uma execução pelo histórico e logs.
2. Receber as URLs HTTPS oficiais de `helo` e `minhaloja` e validar a exibição individual no PDV; não atribuir imagem provisória às lojas.
3. Com o domínio HTTPS informado, cadastrar `MERCADOPAGO_WEBHOOK_SECRET`, apontar Webhooks do Mercado Pago para a rota e validar liquidação Pix Sandbox e entrega/reenvio.
4. Parear/homologar Maquininha Física quando o equipamento e as credenciais estiverem disponíveis. Cartão digitado na web permanece fora do escopo do PDV.
5. Implementar OAuth/adapters dos demais provedores quando priorizados e com documentação/credenciais disponíveis.

## GitHub e preparação para Vercel

- [x] Repositório Git inicializado localmente na branch `main`; remoto `origin` aponta para `https://github.com/helogourmetdelicias-png/montante.git`.
- [x] Snapshot local criado no commit inicial `28ff565` com código, migrações, testes e documentação.
- [x] Conferência antes da publicação: `.env`, `node_modules`, `.next` e `*.tsbuildinfo` estão ignorados; `.env` não foi staged nem enviado. Não foram encontrados arquivos de chave privada ou tokens de gateway no conjunto staged.
- [x] Após autenticação pelo Git Credential Manager, `git push -u origin main` publicou o projeto em `https://github.com/helogourmetdelicias-png/montante.git`; a branch remota `main` foi criada e configurada como upstream.
- [x] Antes da publicação: `npm test` passou (13/13), `npx tsc --noEmit --incremental false` passou e `npx next build --no-lint` passou incluindo as rotas Cron e webhook; ESLint foi desabilitado pelo comando.
- [x] Deploy anterior de produção na Vercel confirmado pelo usuário: build com Prisma e Next.js concluída e sistema online. Isso se refere ao deploy anterior ao commit `379d6db` e não confirma o deploy mais recente.
- [~] Auditoria do painel de produção da Vercel ainda não confirmada por acesso ao projeto. Este checkout não tem vínculo `.vercel/project.json` nem CLI Vercel disponível; não presumir que variáveis locais estão cadastradas na nuvem.
- [x] Script `build` atualizado para `prisma generate && next build`, garantindo a geração do Prisma Client antes da compilação do Next.js na Vercel.
- [x] Validação da correção: `npm test` passou (13/13), `npx tsc --noEmit --incremental false` passou e `npm run build` concluiu a build otimizada de produção. A primeira tentativa encontrou a DLL do Prisma em uso pelo servidor local; após encerrar o processo Next.js da porta 3000, a mesma build passou.
- [x] Correção do script de build publicada em `origin/main` no commit `5d17695`; deploy de produção informado como concluído com sucesso.
- [x] Auditoria segura do `.env` local (nomes apenas): presentes `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SAAS_PIX_KEY`, `SAAS_PIX_KEY_TYPE`, `PAYMENTS_TEST_ENABLED` e `MERCADO_PAGO_ACCESS_TOKEN`. Nenhum valor foi exibido; `MERCADO_PAGO_ACCESS_TOKEN` não é usado pelas rotas atuais, que usam credenciais criptografadas por tenant.
- [~] Confirmar no painel Vercel as variáveis de runtime: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY` e credenciais Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); revisar `NEXTAUTH_URL` para o domínio de produção e `PAYMENTS_TEST_ENABLED=false`.
- [~] Cadastrar/confirmar `CRON_SECRET` e `MERCADOPAGO_WEBHOOK_SECRET` na Vercel antes de habilitar a limpeza agendada e receber webhooks reais. As duas não constam no `.env` local. O Access Token do Mercado Pago é configurado criptografado por tenant no sistema, não por uma variável global `MERCADOPAGO_ACCESS_TOKEN`.
- [x] Revalidação local após o deploy informado: `npm test` passou (13/13), `npx tsc --noEmit --incremental false` passou e `npm run build` passou incluindo `prisma generate` e build otimizada do Next.js.
- [x] Decisão operacional tomada: usar cron-job.org a cada 15 minutos no plano Vercel Hobby e desativar o Cron nativo da Vercel para permitir deploys.
- [x] Bloco `crons` removido de `vercel.json`; a configuração fica sem agenda nativa. A rota `GET`/`POST /api/cron/release-expired-sales`, proteção `Authorization: Bearer <CRON_SECRET>`, idempotência e lote máximo de 100 vendas permanecem intactos.
- [~] Navegação compartilhada entre PDV, Produtos e Pagamentos foi publicada anteriormente, mas o usuário informou que em produção só vê Produtos e não consegue navegar. Ajuste local adiciona rótulo explícito “Configurações”; pendente publicar e confirmar visualmente no site. O menu de gestão continua condicionado ao perfil `owner`/`admin`.
- [x] O check de deploy da Vercel para `379d6db` falhou; esse deployment histórico não publicou a navegação. O motivo foi corrigido no commit atual ao remover a agenda nativa incompatível com o plano Hobby.
- [x] Causa da falha do deploy documentada: o check Vercel de `379d6db` falhou e apontou para a limitação do plano Hobby, que aceita apenas uma execução Cron por dia; a expressão `*/15 * * * *` impedia o deploy. Referência: https://vercel.com/docs/cron-jobs/usage-and-pricing.
- [x] Guia `docs/cron-expired-sales.md` atualizado para a escolha cron-job.org: URL pública, `POST`, agenda `*/15 * * * *`, cabeçalho Bearer, verificação HTTP/logs e esclarecimento de que o job externo precisa ser criado na conta do serviço.
- [x] Parâmetros da automação externa documentados para cron-job.org: URL `https://montante-um2r-seven.vercel.app/api/cron/release-expired-sales`, método `POST`, frequência `*/15 * * * *` e cabeçalho `Authorization: Bearer <CRON_SECRET>`.
- [~] Job cron-job.org ainda não foi criado nem validado; falta confirmar/cadastrar `CRON_SECRET` no ambiente de produção e configurar o job no painel externo, ao qual este workspace não tem acesso. Não registrar o job como operacional até receber HTTP `200` e os logs de conclusão.
- [x] Publicação do código atualizado confirmada em `main` no commit `7952568` e deploy de produção concluído com sucesso para `montante-um2r-seven.vercel.app`.
- [~] Um segundo projeto Vercel associado ao repositório (`montante`) reportou falha no mesmo commit. Esse check não corresponde ao deployment do domínio `montante-um2r-seven.vercel.app`; a causa detalhada não ficou disponível publicamente e deve ser examinada no painel caso esse segundo projeto também seja utilizado.
- [~] No banco conectado a este workspace, os usuários das lojas `helo` e `minhaloja` aparecem com perfil `owner`; isso não valida o perfil/sessão usado no site de produção. Depois de publicar com sucesso, conferir o acesso administrativo e os logs do Cron no painel.
