# Auditoria de vendas Pix pendentes

Verificação realizada em 23/10/2026.

## Comportamento encontrado

- A criação da venda reserva estoque por 15 minutos (`src/app/api/sales/route.ts`). Gerar QR Pix não confirma recebimento.
- O caixa bloqueia o fechamento enquanto houver venda ou cobrança ativa pendente (`src/app/api/cash-register/session/route.ts`).
- A expiração pode cancelar a venda pela rotina agendada ou pela limpeza de reservas ao criar/cancelar vendas. Cobranças online e parcelas em dinheiro exigem verificações adicionais. O cancelamento observado após retornar à aplicação é compatível com essa expiração; sem os registros daquela venda, não é possível atribuir a causa exata.
- As alterações locais encontradas já adicionavam `SaleActions` à página da venda e o link “Resolver venda” no caixa. Foram preservadas e cobertas pelos testes desta auditoria.
- O histórico oferece confirmação explícita para Pix manual/maquininha externa, limitada ao operador do caixa aberto, e cancelamento com confirmação. Cobranças online dependem do provedor.
- Foi corrigida a mensagem de expiração: ela prometia cancelamento “em instantes”, embora cobranças ativas ou dinheiro a devolver possam impedir a liberação.

## Verificação reproduzível

```sh
npm test
npm run test:unit
npx playwright install chromium
npm run test:browser
```

- Suite existente: 73 testes aprovados.
- Vitest: 9 testes aprovados, incluindo página real de detalhes, autenticação, escopo da loja, operador/caixa aberto, rejeição de confirmação manual online, venda expirada, repetição e pendências de fechamento.
- Playwright/Chromium: 6 cenários aprovados com o componente real `SaleActions`: confirmação manual, cancelamento/desistência, devolução de dinheiro, erro do provedor, expiração e outro operador.

Os testes de navegador usam uma página de teste Vite com respostas HTTP controladas; os testes de API usam dependências isoladas. Não acessam o banco da loja ou provedores bancários. Não constituem validação integral de login → PDV → Pix real → fechamento de caixa em ambiente conectado.
