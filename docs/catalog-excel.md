# Excel, categorias e aviso de assinatura

## Solicitação e entrega

Foram implementados somente: importação/exportação Excel para clientes e produtos, aviso da assinatura no Perfil em vez do PDV e organização dos produtos pelas 35 categorias principais fornecidas em categoria.txt. Não houve alteração de schema, migração, autenticação, regras de cobrança ou pagamentos. Os controles usam o padrão visual existente.

Não existia uma tela de Perfil; foi criada uma visualização mínima do usuário autenticado, com o aviso de assinatura para owner/admin e acesso à tela de cobrança já existente. Não foram adicionados edição de perfil, senha ou novos dados pessoais. A tela /assinatura foi preservada.

## Uso

Em Clientes ou Produtos, Exportar Excel baixa todos os cadastros da loja, inclusive inativos, independentemente do filtro/página atual, até 10.000 registros. Acima desse limite retorna erro em vez de gerar arquivo incompleto. Importar Excel permite baixar um modelo, selecionar arquivo, validar e confirmar a importação.

Formato aceito: .xlsx, até 2 MB, 1.000 linhas por lote e 10 MB de conteúdo interno. O modelo contém as colunas aceitas e instruções; produtos também traz uma aba com as categorias. CPF/CNPJ, CEP, SKU e código de barras são exportados como texto. Preços/quantidades são números. Fórmulas, macros, arquivos protegidos, imagens e vínculos externos não são aceitos.

A importação cria novos cadastros. Não atualiza/sobrescreve registros existentes. CPF/CNPJ repetido e SKU/código de barras repetido, inclusive entre inativos, impedem o lote. Uma falha de validação impede toda a gravação; a confirmação revalida o arquivo e as duplicidades na transação. Para atualizar um cadastro existente, permanece o botão Editar. As regras dos cadastros manuais foram reutilizadas. Apenas owner/admin podem importar e exportar; dados ficam limitados ao tenant autenticado.

Categorias: o campo existente foi mantido. O cadastro sugere as 35 categorias principais do arquivo, permite digitar categorias próprias e preserva categorias legadas. A listagem possui filtro, agrupamento e paginação para não esconder produtos além dos 100 primeiros. Produtos sem categoria continuam assim até classificação explícita. Não foi feita inferência ou reclassificação por nome. As sugestões de subcategorias no arquivo não foram transformadas em novos campos de banco.

## Arquivos alterados/criados e finalidade

- package.json e package-lock.json: ExcelJS 4.4.0 e scripts de teste; override de uuid apenas dentro dessa nova dependência. As versões das bibliotecas existentes foram preservadas.
- src/lib/catalog-excel.ts: geração, leitura e validação dos arquivos, limites do ZIP, formatos e validação por linha.
- src/lib/catalog-excel-route.ts: exportação e importação transacional, autorização e isolamento.
- src/app/api/customers/excel/route.ts e src/app/api/products/excel/route.ts: rotas específicas para Excel.
- src/components/catalog-excel-controls.tsx: download/modelo, seleção, prévia, erros e confirmação compartilhados pelas duas telas.
- src/app/clientes/customer-catalog.tsx: botões Excel na tela existente.
- src/app/produtos/product-catalog.tsx: botões Excel, seletor/filtro/grupos de categoria e paginação necessária ao catálogo categorizado.
- src/app/api/products/route.ts: filtro, ordenação do catálogo administrativo e categorias existentes da própria loja; consulta do PDV mantém a ordenação anterior.
- src/lib/product-categories.ts: 35 categorias principais extraídas de categoria.txt, sem imagens, links ou instruções externas.
- src/app/pdv/page.tsx: remoção do aviso de assinatura da tela principal.
- src/app/perfil/page.tsx: visualização mínima de Perfil com o aviso permanente.
- src/components/store-navigation.tsx: entrada Perfil para acessar o aviso, preservando o acesso à cobrança pelo próprio aviso.
- tests/catalog-excel.test.cjs: testes de formatos, códigos, decimais, fórmulas, duplicidades e limites.
- tests/catalog-excel.database.cjs: testes das rotas reais com lojas QA isoladas e remoção das fixtures.
- docs/catalog-excel.md: este registro de entrega e limites operacionais.

categoria.txt foi somente lido. A alteração preexistente de checklist.md foi preservada sem novas edições nesta tarefa.

## Verificações

- npm test: 41 testes passaram, sem falhas.
- npm run test:catalog-excel:db: passou; autorização, prévia sem escrita, lote inválido sem gravação, duplicidades, concorrência, isolamento, exportação além da primeira página, zeros à esquerda, inativos e filtros de categoria.
- TypeScript: passou.
- npm ci --dry-run --ignore-scripts: confirmou consistência do arquivo de dependências.
- Navegador local autenticado: importação de produto com prévia/confirmação, exportação, agrupamento/filtro, controles em Clientes, PDV sem aviso e Perfil com status/trial. Dados e arquivo de teste foram removidos ao terminar.
- Build de produção (`npx next build --no-lint`): passou, incluindo as duas rotas Excel e a tela Perfil. ESLint não executado, conforme a opção --no-lint usada no projeto.

## Problemas adicionais e limites

A auditoria identificou vulnerabilidades preexistentes em dependências, incluindo Next.js. Não foi executada atualização global nem npm audit fix --force; essas atualizações precisam de tarefa separada devido ao risco de incompatibilidades. A dependência indireta uuid introduzida pelo ExcelJS foi limitada à versão corrigida 11.1.1, sem alterar dependências anteriores.

As três solicitações foram implementadas e validadas. A publicação pode ser acompanhada no histórico de deploy do projeto. Não houve teste em Microsoft Excel desktop; os arquivos foram validados por leitura/escrita, API e download no navegador.
