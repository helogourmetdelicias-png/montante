# Venda rápida e digitação de valores

No PDV, F1 abre a venda rápida e F2 abre a venda avançada. Os botões na tela oferecem as mesmas ações no celular. Os modais usam diálogo nativo, foco inicial e fechamento por Escape. Limpe o rascunho antes de trocar de modo; uma venda com cobrança iniciada não pode trocar de modo.

Venda rápida recebe apenas um valor positivo em reais: não cria produto fictício, não vincula cliente e não movimenta estoque. Usa o caixa do operador e as mesmas formas de pagamento da venda avançada. Cadastro de cliente é dispensado; informações exigidas pelo provedor de pagamento continuam sendo solicitadas quando aplicável. Dinheiro não exige dados do comprador.

Na API `POST /api/sales`, enviar `mode: "quick"`, `quickAmount: 12.34` e `idempotencyKey` UUID. Itens podem ser omitidos ou vazios. O backend rejeita cliente, produtos ou desconto nesse modo. O valor integra o hash de idempotência. O modo é registrado em `Sale.is_quick_sale`. Vendas avançadas antigas continuam aceitas sem o campo mode.

Vendas rápidas pendentes não entram na receita nem no volume da assinatura; após pagamento e status completed, entram normalmente. O comprovante identifica valor livre e mostra os totais corretos. Ranking de produtos considera somente itens de catálogo.

Campos monetários do PDV (venda rápida, desconto em reais, dinheiro recebido e parcela), caixa e preço do produto usam digitação em centavos: `1 → 0,01`, `12 → 0,12`, `1234 → 12,34`. Colagem de `1.234,56` mantém R$ 1.234,56. A representação interna/API continua decimal com ponto. Quantidades e percentuais mantêm suas regras próprias.

Validação: `npm test`, `npm run test:quick-sales:db`, TypeScript e build. O teste de banco usa lojas QA isoladas e remove os dados ao terminar. Nenhum gateway externo é cobrado durante esses testes.
