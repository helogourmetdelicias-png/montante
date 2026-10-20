# Checklist de funcionalidades — PDV Montante

Atualizado em: 19/10/2026.
Fonte de ideias: `funcionalidadesPDV.txt`. Conferência: telas, APIs, validações, schema Prisma e testes do projeto.

Esta é uma seleção para o comércio de balcão, com foco inicial em material de construção e venda por medida. A lista de referência não é uma obrigação de implementar todos os recursos. Priorização por utilidade operacional e dependências, sem pesquisa de frequência de uso no mercado.

Legenda: `[x]` disponível e com validação registrada; `[~]` parcial, presente apenas no código ou aguardando validação; `[ ]` ausente ou ainda não iniciado. Um campo no banco não significa que a funcionalidade está pronta. Publicação e homologação continuam em `checklist.md`.

## 1. Base já disponível

- [x] Login individual, loja identificada e isolamento dos dados por loja.
- [x] Cadastro, edição e desativação de produtos, preservando o histórico.
- [x] SKU e código de barras únicos por loja, com normalização e validação no servidor.
- [~] Busca no balcão por nome, SKU e código de barras; Enter adiciona correspondência exata. Falta validar leitor físico e leitura rápida enquanto a busca ainda está carregando.
- [x] Adicionar e remover produtos, alterar quantidade e cancelar venda pendente com devolução de reserva.
- [x] Unidades de medida flexíveis e venda fracionada, com até três casas decimais; unidade inteira rejeita frações.
- [x] Preço, estoque e localização por corredor/prateleira.
- [~] Categoria de produto disponível no cadastro; sem subcategorias e filtros avançados.
- [x] Desconto em reais sobre o total, validado no servidor.
- [x] Reserva de estoque ao iniciar venda, bloqueio de falta de estoque e devolução no cancelamento/expiração; baixa sem duplicação.
- [x] Dinheiro com valor recebido e cálculo de troco.
- [~] Pix Mercado Pago com QR e consulta de status: criação Sandbox e aprovação simulada validadas; liquidação real e webhook ainda aguardam homologação.
- [x] Fluxo misto dinheiro + Pix e troco validados com aprovação simulada; homologação real do Pix permanece separada.
- [~] Pix manual e registro de pagamento na maquininha externa preparados; falta validar operação completa e parear equipamento quando aplicável.
- [x] Abertura e fechamento de caixa por operador/turno, fundo de troco e conferência com diferença registrada.
- [x] Sangria e suprimento com registro por sessão de caixa.
- [x] Bloqueio de venda sem caixa aberto e de fechamento com vendas/cobranças pendentes.
- [x] Relatórios por período: faturamento, quantidade de vendas, ticket médio, pagamentos e produtos mais vendidos por valor/quantidade.
- [x] Produtos, configurações e relatórios com restrições de acesso; permissões detalhadas ainda pendentes.
- [~] Interface responsiva, operação touch e logotipo por loja; ampliar validação visual em tablet/celular e acessibilidade.

## 2. Primeira entrega — agilidade no balcão

- [~] Desconto em porcentagem: seletor R$/%, conversão para valor em reais enviado à API, limite de 100%, valor aplicado visível e bloqueio de edição após iniciar venda. Implementado localmente; validar no navegador e publicar.
- [~] Tela cheia: botão para entrar/sair e aviso para navegadores incompatíveis. Implementado localmente; validar no navegador e publicar.
- [ ] Atalhos de teclado com ajuda visível: buscar, abrir cobrança e próxima venda; respeitar campos de texto, janelas abertas e estado da cobrança.
- [ ] Leitor de código confiável: buscar o código digitado no Enter, mesmo quando a lista da busca anterior ainda estiver na tela; homologar leitor USB.
- [x] Histórico `/vendas` com número, data em São Paulo, situação e total; filtros por número/situação e paginação de 25 registros. Pagamentos aparecem no detalhe. HTTP autenticado e isolamento entre lojas validados.
- [x] Detalhe `/vendas/[id]` com itens, desconto, parcelas confirmadas, troco e operador vinculado ao caixa; acesso cruzado retorna 404. Valores/quantidades são históricos; nome/SKU vêm do cadastro atual, pois ainda não há snapshot desses campos.
- [~] Comprovante não fiscal e reimpressão pelo detalhe/histórico, com link após conclusão no PDV. Botão de imprimir/salvar PDF exclusivo de vendas concluídas; pendentes/canceladas exibem aviso de que não comprovam pagamento e simulação é identificada como teste. Layout de impressão estreito (72 mm), inclusive em A4, implementado; falta conferência visual/física na impressora e homologação do tamanho do papel.
- [ ] Observação opcional na venda, salva e visível no detalhe/comprovante quando apropriado. Campo `Sale.notes` existe, mas falta fluxo completo.

Critérios: total cobrado igual ao persistido, isolamento por loja, vendas canceladas/pendentes sem aparência de pagas e reimpressão sem nova cobrança ou baixa de estoque.

## 3. Segunda entrega — estoque confiável

- [ ] Tela própria de estoque com busca, saldo e localização.
- [ ] Entrada de mercadoria e ajuste com motivo e operador. Hoje é possível editar saldo no produto, sem um livro de movimentações.
- [ ] Histórico de movimentações com origem, saldo anterior/posterior, data, operador e vínculo à venda/ajuste.
- [ ] Estoque mínimo e alertas de reposição; campo `stock_min_alert` já existe, falta fluxo de cadastro e exibição.
- [ ] Inventário físico e registro das diferenças com aprovação.
- [ ] Perdas/avarias com motivo e rastreabilidade.
- [ ] Importação de produtos por CSV com prévia, validação de duplicidade e confirmação; exportação CSV.
- [ ] Preço de custo e margem estimada: campo de custo existe no banco, falta fluxo e definição do cálculo.

Critérios: não editar estoque sem rastreio; concorrência, cancelamento e repetição não podem duplicar movimentos. Novos registros e telas devem respeitar permissões e loja.

## 4. Terceira entrega — clientes e continuidade

- [~] Tela `/clientes` e APIs por loja: criar/editar/excluir (desativação), reativar, buscar por nome/documento/contato e paginar. Nome obrigatório; CPF/CNPJ, contato e endereço opcionais. Gestão restrita a owner/admin; operadores podem pesquisar para selecionar no PDV. API validada por integração autenticada, incluindo duplicidade, perfis e isolamento. Conferência visual da tela pendente.
- [~] Cliente opcional no PDV, preenchimento dos dados de cobrança ao selecionar e vínculo persistido à venda, visível no detalhe/comprovante. Cliente de outra loja/inativo é rejeitado; requisitos do gateway continuam obrigatórios. Vínculo e idempotência validados por integração; preenchimento visual no navegador pendente. Nome do cliente reflete o cadastro atual, sem snapshot histórico.
- [ ] Histórico de compras do cliente com acesso restrito.
- [ ] Suspender e recuperar carrinho, com identificação e escolha explícita da política de reserva. Uma venda pendente não equivale a um carrinho suspenso.
- [ ] Orçamento com validade e conversão em venda, recalculando preços e disponibilidade antes da cobrança.
- [ ] Compartilhar comprovante por ação do operador; definir canal sem envio automático.
- [ ] Troca/devolução total ou parcial com motivo, autorização, política de retorno ao estoque e estorno conciliado ao pagamento.

## 5. Quarta entrega — gestão e operação real

- [ ] Cadastro/gestão de funcionários e bloqueio de acesso.
- [ ] Permissões para desconto, cancelamento, devolução, ajustes e sangria; limites e autorização gerencial.
- [ ] Auditoria de alterações e operações críticas por usuário.
- [ ] Histórico de caixas e justificativa das divergências; fechamento cego se a operação precisar.
- [ ] Relatórios de descontos, cancelamentos, devoluções e vendas por operador.
- [ ] Comparação entre períodos e exportação CSV dos relatórios.
- [ ] Fornecedores e recebimento de compras ligados à entrada de estoque.
- [ ] Contas a pagar/receber e despesas, separadas do dinheiro físico do caixa.
- [ ] Confirmar requisitos fiscais da operação com o responsável contábil e selecionar integração antes do uso comercial que a exija; antecipar esta entrega quando necessário.
- [ ] Implementar documentos fiscais aplicáveis, dados fiscais de produtos, homologação, cancelamento e contingência após definição do escopo.
- [ ] Configurar backup e testar restauração; validar monitoração e proteção de acesso.

## 6. Expansão — fora das primeiras entregas

- [ ] Promoções, cupons, kits e tabelas de preço.
- [ ] Variações/grades, lotes, validade e números de série.
- [ ] Etiquetas, balanças, gaveta e impressora integrada diretamente.
- [ ] Cartão parcelado, vouchers, crediário e conciliação de taxas.
- [ ] Fidelidade, cashback e crédito da loja.
- [ ] Filiais com transferência e gestão consolidada. Isolamento de lojas atual não equivale a gestão de filiais.
- [ ] Delivery, catálogo online e integração com comércio eletrônico.
- [ ] Operação offline com sincronização e resolução de conflitos.
- [ ] Previsões e automações inteligentes após existir histórico confiável.

## Importante, adiado — Stone/Pagar.me

- [ ] Retomar apenas depois da etapa atual, conforme pedido do usuário. Foi usada chave pública e o gateway respondeu 401; cadastrar chave secreta v5 correta, verificar conta/ambiente e homologar criação e confirmação do Pix. Não enviar segredos pelo chat.

## Como acompanhar cada entrega

1. Implementar API, tela e regras necessárias, sem marcar apenas pela existência de campo no banco.
2. Executar verificações adequadas à mudança e registrar resultados abaixo.
3. Publicar e validar o fluxo na interface antes de marcar `[x]`.
4. Atualizar este arquivo com as lacunas restantes e `checklist.md` com publicação/homologação.

### Registro desta revisão

- [~] Clientes e produtos: migration `20261019000200_customers` aplicada e status do banco atualizado. Adicionado botão explícito Editar em Produtos ao lado de Excluir; edição ao clicar no nome continua disponível. Exclusões preservam histórico por desativação. Nenhum cliente fictício padrão foi criado e a configuração Stone segue adiada.
- [x] Qualidade de Clientes: Prisma validate/generate, migration status, TypeScript, build e `npm test` (26/26) passaram. `tests/customers.integration.mjs` exercitou CRUD e seleção no servidor com lojas QA temporárias, removidas ao finalizar; nenhuma cobrança externa foi iniciada. O teste também verifica edição/exclusão de produto associado a venda preservando o item histórico.

- [~] Ajuste de impressão/tela cheia: comprovante passa a abrir em janela interna do PDV, sem trocar de aba. Ao voltar pelo botão, restaura a tela cheia se ela estava ativa ao abrir. O diálogo de impressão pode encerrar a tela cheia conforme o navegador; restauração automática sem clique não é garantida. Escape continua permitindo sair sem forçar reentrada. Testes de impressão física e interação no navegador pendentes.
- [x] Verificações do ajuste: 23 testes e TypeScript passaram; `next build` passou com Prisma Client existente (o comando completo encontrou DLL em uso pelo servidor local). Integração HTTP conferiu comprovante incorporado e isolamento com vendas concluídas/canceladas; pendente foi ignorada porque não havia registro nesse estado, sem criar ou alterar vendas para o teste.

- [x] Código publicado em `origin/main` no commit `714fa37`; check `Vercel – montante-um2r` confirmou sucesso. Domínio `https://montante-um2r-seven.vercel.app`; `/vendas` sem sessão redireciona ao login. O segundo projeto `montante` falhou, como nos deploys anteriores, e não atende esse domínio. Validação visual autenticada e impressão física continuam pendentes.

- [x] Continuação: `npm test` passou (23/23), TypeScript e build passaram incluindo `/vendas` e `/vendas/[id]`. `node --env-file=.env tests/sales-history.integration.mjs` passou com consultas somente de leitura: login, filtros, detalhes para concluída/pendente/cancelada, botão de impressão por situação, isolamento entre lojas e página inválida. Não houve cobrança ou alteração de estoque.

- [x] Lista de referência lida e confrontada com implementação atual; prioridades registradas.
- [~] Primeira implementação local: desconto percentual e tela cheia. Validação e publicação pendentes.
- [x] Verificação local após a primeira implementação: `npm test` (23/23), TypeScript e `npm run build` passaram. Os testes existentes não cobrem interação com os novos controles; validação no navegador e publicação ainda pendentes.

Próximo bloco sugerido: observações de venda, leitor confiável e atalhos de teclado; depois iniciar movimentações e alertas de estoque. Conferência visual da impressão permanece pendente.
