# Alertas de estoque e validade

Disponíveis para responsáveis e administradores no topo do PDV, no catálogo e em Relatórios. São avisos dentro do sistema, sem janelas automáticas nem envio de mensagens externas. O quadro atualiza ao carregar, ao voltar à tela, a cada minuto e após uma venda concluída ou edição/importação no catálogo.

- Sem estoque: quantidade menor ou igual a zero.
- Estoque baixo: quantidade positiva estritamente abaixo do mínimo informado no cadastro. Mínimo vazio desativa apenas este aviso; o aviso de estoque zerado permanece.
- Vencem em até 30 dias: inclui os produtos que vencem hoje ou nos próximos sete dias, destacados como urgentes.
- Vencido: validade anterior ao dia atual. A validade de hoje permanece válida até o fim do dia, com aviso urgente.
- Produtos inativos ficam fora dos alertas. Sem saldo, o produto gera aviso de falta de estoque, mas não de validade.

As datas usam o calendário do Rio de Janeiro/São Paulo. Datas ausentes ou inválidas em registros antigos não são inventadas. O total geral conta produtos distintos: o mesmo produto pode ter aviso de estoque e de validade, sem duplicar o total.

Os relatórios mostram o estoque atual, independentemente do período financeiro selecionado. Filtros por situação e busca por nome/SKU são aplicados no servidor; contagens cobrem o catálogo inteiro antes da paginação. Excel exporta a seleção inteira até 10.000 produtos, sem produzir arquivo parcial quando o limite é excedido. Contém produto, SKU, categoria, quantidade, unidade, mínimo, validade, dias restantes, lote, avisos e data da consulta. A planilha de cadastro também preserva validade e lote, com datas ISO, brasileiras ou células de data do Excel.

Cada cadastro tem uma quantidade e uma validade. Lotes com validades diferentes precisam de cadastros separados e códigos distintos. Esta versão não faz baixa automática por lote nem impede vendas por validade.

Reutiliza `Product.stock_quantity`, `stock_min_alert` e os atributos `expiryDate`/`lot`. Validade e lote passam a ser aceitos em todos os nichos. Sem nova migração, atualização de produtos reais, alteração de preços, vendas ou histórico. Consultas SQL parametrizadas e APIs verificam loja e perfil autenticados.

Validações: 78 testes de regressão, 48 Vitest, três testes de navegador e integração PostgreSQL em schema descartável. A integração cobre 126 produtos com alertas, contagens além da primeira página, limites de validade, estoque mínimo, filtros catálogo/relatório/Excel, preservação de lote e separação entre lojas. Os schemas temporários são removidos no final.

```text
node --env-file=.env tests/inventory-alerts.database.cjs
npx playwright test --config playwright.inventory.config.ts
```
