# Dashboard avançado em Relatórios

Disponível em `/relatorios`, com alternância para os relatórios detalhados existentes. Indicadores de faturamento após descontos, vendas concluídas, ticket médio e média diária; comparação com o intervalo imediatamente anterior de mesma duração; evolução diária interativa, pagamentos aprovados, categorias e clientes em destaque. Dias sem vendas aparecem com zero, sem inventar crescimento quando a base anterior é zero. Atalhos de hoje, 7, 30 e 90 dias; limite de 366 dias na visão avançada.

## Acesso

A página e a API `GET /api/reports/sales?dashboard=1` verificam o usuário ativo, sua loja ativa e o papel responsável/administrador. A assinatura precisa ter uma mensalidade Padrão ou Avançado com valor positivo, status pago e data de pagamento, cujo intervalo de cobertura contenha o instante atual. Teste gratuito, mensalidade pendente ou cobertura vencida não liberam o dashboard. Relatórios básicos continuam com suas regras anteriores.

Por solicitação do responsável, a conta existente `tecnicorikardo@gmail.com`, da loja `infomengo`, tem exceção gratuita apenas para este recurso. A exceção está vinculada aos identificadores atuais do usuário e da loja em `src/lib/reports/dashboard-access.ts`; um cadastro do mesmo e-mail em outra loja não herda o benefício. Não altera plano, mensalidade ou cobrança. Se a conta for recriada, a exceção deve ser revista.

## Dados

Reutiliza a API e os agrupamentos existentes; acrescenta apenas a consulta de totais do período anterior no modo avançado. Todas as consultas usam a loja da sessão. Datas comerciais seguem São Paulo. Pagamentos aprovados podem diferir do faturamento por vendas a prazo e não incluem recebimentos de fiados antigos. Categorias são valores dos itens após descontos; não representam margem de lucro. Nenhuma migração ou nova dependência.

## Verificação

- `npm test`
- `npm run test:unit`
- `npx playwright test tests/browser/dashboard.spec.ts`
- `npx next build`
- Com servidor local na porta 3017: `node --env-file=.env tests/advanced-dashboard.integration.mjs` (cria e remove apenas lojas temporárias de teste; a conta de exceção é apenas consultada).

As prévias de navegador usam dados fictícios e ficam em `test-results/dashboard-desktop.png` e `test-results/dashboard-mobile.png`. Não são imagens de dados reais da loja.

Validação desta entrega: 75 testes existentes e 33 Vitest aprovados; os dois cenários de navegador passaram e as capturas desktop/celular foram inspecionadas. Build de produção aprovado com os três avisos de lint preexistentes. A integração local com banco confirmou totais, período anterior, limites de datas, isolamento, acesso pago/gratuito/vencido/pendente e a exceção da conta existente; fixtures removidas ao final. Ainda não publicado.
