# Fiados e relatórios por marca

## Uso

No PDV, selecione **Fiado · Pagar depois** e identifique um cliente ativo. Vendas rápidas também pedem um cliente ao escolher Fiado. A compra é concluída e o estoque já fica baixado, mas não existe recebimento nessa etapa. A venda conta no faturamento e no volume de vendas da assinatura.

Em **Fiados**, cada compra mostra cliente, valor original, recebido, saldo e histórico. **Receber parte ou quitar** aceita um valor positivo até o saldo restante. É necessário ter o caixa de hoje aberto. Escolha a forma do valor que já foi recebido. Pix e cartão nesta tela são registros manuais de recebimentos conferidos na conta/maquininha; não geram transações externas. Recebimentos em dinheiro entram na gaveta do operador que os registrou, inclusive em outro turno/dia da compra.

Os recebimentos ficam vinculados ao operador e ao turno. A confirmação tem chave de idempotência e transação serializável, impedindo duplicação da mesma confirmação e baixa acima do saldo em concorrência. A criação de cobranças do PDV também revalida a venda em transação serializável para não gerar cobrança em uma venda transformada em fiado.

O comprovante identifica a venda em Fiado, mostra pagamentos e saldo e avisa que registrar a compra não comprova quitação. A implementação não inclui estorno ou cancelamento de fiado concluído, mantendo a regra existente de cancelamento apenas de vendas pendentes.

## Relatórios e comissão

Relatórios têm vendas por marca e categoria após descontos, ranking de dias e meses e melhor dia/mês do intervalo selecionado, pelo faturamento, no horário de São Paulo. Descontos são distribuídos entre os itens em centavos, preservando a soma do total da venda. Uma compra com várias marcas pode participar da contagem de mais de uma marca. Vendas rápidas ficam identificadas separadamente, sem atribuir marca/categoria inexistente.

O percentual por marca é opcional e exclusivo da gestão. Quando informado, calcula uma estimativa sobre o valor do item após desconto. Não muda preço, não envia pagamento de comissão e não deduz uma margem que não foi informada. Novas vendas guardam marca, categoria e percentual na abertura da venda. Alterações posteriores no cadastro não recalculam essas vendas. Nas vendas antigas sem esses dados, marca/categoria usam o cadastro atual e a comissão fica sem estimativa. Percentual pode ser zero.

Fiados vendidos integram o faturamento uma vez. Recebimentos aparecem separadamente pela data em que ocorreram, inclusive de compras antigas, e não geram nova venda nem comissão adicional. Os rankings anteriores de produtos mantêm os valores brutos dos itens, agora com indicação explícita; os novos grupos por marca/categoria são líquidos de desconto.

## Arquivos e finalidade

- `prisma/schema.prisma` e `prisma/migrations/20261021000200_credit_and_commissions/migration.sql`: contas a receber, pagamentos, regras de comissão e dados históricos dos itens. Migração aditiva, com chaves compostas por loja e restrições de valores positivos.
- `src/lib/credit.ts`, `src/app/api/credits/route.ts`, `src/app/api/credits/[id]/payments/route.ts`, `src/app/api/sales/[id]/credit/route.ts`: registro, consulta e recebimentos isolados por tenant.
- `src/app/fiados/page.tsx` e `src/app/fiados/credit-ledger.tsx`: menu de compras a prazo e pagamentos parciais.
- `src/components/store-navigation.tsx`: entrada Fiados no menu.
- `src/app/api/pos/payment-options/route.ts`, `src/app/pdv/point-of-sale.tsx`, `src/app/pdv/customer-checkout.tsx`: pagamento Fiado e cliente obrigatório, mantendo as demais opções.
- `src/lib/cash-register/summary.ts`, `src/app/api/cash-register/session/route.ts`, `src/app/caixa/register-page.tsx`: recebimentos de fiado em dinheiro separados das novas vendas e incluídos no saldo do turno correto.
- `src/app/vendas/page.tsx`, `src/app/vendas/[id]/page.tsx`, `src/app/vendas/format.ts`: identificação do Fiado e saldo no comprovante.
- `src/app/api/sales/[id]/payments/route.ts`: proteção da criação de cobranças contra transformação simultânea da venda em Fiado.
- `src/app/api/sales/route.ts`, `src/lib/brand-commission.ts`: captura de marca, categoria e percentual nas novas vendas.
- `src/lib/reports/details.ts`, `src/app/api/reports/sales/route.ts`, `src/app/relatorios/report-details.tsx`, `src/app/relatorios/sales-reports.tsx`: novos detalhamentos, descontos, datas, distinção entre venda e recebimento.
- `src/app/api/reports/commissions/route.ts`: configuração de comissão restrita a owner/admin da própria loja.
- `tests/credit-reports.database.cjs`, `tests/cash-register.test.mjs`, `package.json`: testes e comando de integração; `checklist.md`: resultados e estado da entrega.

## Validação

Os resultados finais dos testes, a conferência visual e a publicação são registrados em `checklist.md`.
