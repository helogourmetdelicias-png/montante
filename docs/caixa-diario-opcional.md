# Caixa diário opcional

Abertura e fechamento manuais são opcionais. Vendas rápidas, vendas de produtos, fiados, recebimentos de fiados, O.S., suprimentos e sangrias iniciam automaticamente um caixa do dia para o operador quando necessário. O fundo inicial automático é zero. Valores de dias anteriores não são transportados; dinheiro colocado na gaveta hoje pode ser registrado como fundo inicial ou suprimento.

O dia muda à meia-noite no horário do Rio de Janeiro/São Paulo (`America/Sao_Paulo`). Caixas anteriores continuam disponíveis em **Caixa → Dia para consultar**, para conferência e fechamento opcionais. As pendências continuam bloqueando apenas o fechamento daquele caixa, sem impedir novas operações no dia atual. Fechar um caixa também não obriga abertura manual para a próxima venda.

`ensureDailyCashRegister` executa dentro da transação serializável. O índice parcial permite um caixa aberto por operador, loja e dia; conflitos na criação concorrente provocam nova tentativa da transação. A migração `20261029100000_optional_daily_cash_register` substitui o índice antigo sem excluir sessões e adiciona `PaymentAttempt.cash_session_id`, opcional e com vínculo composto por loja. Assim, o dinheiro recebido após a meia-noite pertence ao novo dia mesmo quando a venda começou antes. Registros antigos sem esse vínculo continuam no caixa original, sem reescrever histórico.

Validação: 77 testes de regressão, 44 testes Vitest, dois testes de navegador (consulta separada no celular e cobrança sem abertura manual), TypeScript/lint e build de produção. Migrações reais e fluxos de caixa testados em schema PostgreSQL descartável: criação concorrente, fundo zero, caixa anterior preservado, recebimentos em dias diferentes, fiado na virada do dia, suprimentos/sangrias, fechamento/reabertura opcional, O.S. sem abertura e retomada em outro dia, e isolamento entre lojas. Nenhuma operação de caixa real foi criada nos testes.

Comandos específicos:

```text
node --env-file=.env tests/daily-cash-register.database.cjs
npx playwright test --config playwright.daily-cash.config.ts
```

Migração aplicada ao banco principal em 29/10/2026 sem exclusão ou alteração de valores existentes. Publicação acompanhada na Vercel `montante-um2r`.
