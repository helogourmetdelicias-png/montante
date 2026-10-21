# Administração geral do Montante

O painel `/admin` monitora todas as lojas. Mostra lojas ativas/inativas, testes e assinaturas em atraso, vendas concluídas e faturamento do período, mensalidades recebidas e em aberto, cadastros por loja e saldo de fiados. Busca por nome/identificador e paginação de 50 lojas. O período inicial é o mês atual no horário de São Paulo. O painel atualiza a cada minuto enquanto visível e possui atualização manual.

O faturamento das lojas inclui compras em Fiado concluídas e não equivale a dinheiro recebido. Mensalidades são os registros de cobrança do próprio Montante. Contagens de assinatura refletem a rotina de cobrança existente; o painel não cria faturas nem altera status. Saldos de fiados e mensalidades em aberto abrangem todas as datas. A busca filtra a lista; os indicadores gerais continuam abrangendo toda a plataforma.

## Acesso

A conta indicada pelo usuário foi identificada pelo ID, e-mail e loja. O acesso é dado à conta individual por `User.is_platform_admin`, com padrão falso. Não existe promoção por igualdade de e-mail, configuração pública de permissão ou passagem de `tenantId` para operar outra loja.

O login continua usando identificador da loja, e-mail e senha já cadastrados. Após habilitar a permissão, é necessário sair e entrar novamente com a senha. A página inicial direciona a conta habilitada para `/admin`; Perfil também oferece o link. O painel possui retorno à própria loja e saída da conta.

A troca por PIN sempre remove a capacidade geral da sessão, mesmo quando o operador escolhido tem a permissão no banco. Sessões antigas não são promovidas automaticamente. Página e API revalidam a permissão atual, o usuário ativo e sua loja ativa. Owner/admin comuns, registros públicos com o mesmo e-mail e alegações de permissão sem concessão no banco são recusados. A revogação no banco vale na próxima consulta.

O painel é somente de leitura. Não permite excluir/bloquear lojas, alterar cobranças, administrar usuários de outras lojas ou entrar como outro lojista. Não retorna senhas, PINs, tokens ou credenciais de pagamentos. A API usa respostas privadas sem cache compartilhado.

## Operação de manutenção

`scripts/grant-platform-admin.cjs` habilita uma conta existente somente quando coincidem ID, e-mail e identificador da loja e o usuário é proprietário ativo em loja ativa. Recebe os três identificadores como argumentos. Não cria usuário, troca senha ou altera o papel local. Deve ser executado apenas no ambiente de manutenção autorizado, nunca exposto em uma rota do aplicativo.

## Arquivos alterados

- `prisma/schema.prisma` e `prisma/migrations/20261021000300_platform_admin/migration.sql`: permissão individual opcional, padrão falso, sem alterar os papéis das lojas.
- `src/auth.ts` e `src/types/next-auth.d.ts`: concessão apenas no login por senha, remoção no PIN e revalidação da sessão.
- `src/lib/platform-admin.ts`: guarda exclusiva de página e API, consultando a permissão atual no banco.
- `src/app/admin/page.tsx`, `src/app/admin/platform-dashboard.tsx` e `src/app/api/admin/overview/route.ts`: painel e métricas de todas as lojas, filtros, paginação e atualização.
- `src/app/page.tsx` e `src/app/perfil/page.tsx`: destino inicial da conta geral e link no perfil.
- `scripts/grant-platform-admin.cjs`: concessão explícita à conta autorizada, sem regra automática por e-mail.
- `tests/platform-admin-auth.test.cjs`, `tests/platform-admin.database.cjs` e `package.json`: verificações de senha/PIN, permissões, isolamento e métricas; comandos dos testes.
- `checklist.md`: validação e estado da entrega.

Resultados de testes, concessão e publicação são registrados no checklist. A implementação preserva o acesso habitual das demais lojas.
