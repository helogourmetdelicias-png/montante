# Assistência técnica e ordens de serviço

## Fluxo

Os nichos `PHONE_REPAIR` e `IT_SUPPORT` estão disponíveis no cadastro e no onboarding. O catálogo sugere categorias de peças para celulares ou informática. O módulo **Ordens de serviço** fica disponível no menu das lojas, sem obrigar a alteração do nicho de uma loja existente.

1. Registrar cliente/telefone, aparelho, marca/modelo, série/IMEI opcional, defeito e estado físico.
2. Adicionar peças do catálogo, quantidade e preço orçado, mais mão de obra livre. Os totais são calculados no servidor. URLs HTTPS de até dez fotos são opcionais; não há upload de arquivos nesta etapa.
3. Alterar a situação entre aguardando aprovação, em andamento e pronto. O responsável pela operação registra a aprovação na situação da O.S.; não há aceite remoto do cliente.
4. Com a O.S. salva como pronta e o caixa do dia aberto, usar **Receber no caixa / PDV**. O valor do orçamento fica fixo no PDV e o orçamento fica bloqueado durante o recebimento.
5. Receber pelos meios existentes no PDV. Entrega e baixa de peças acontecem na mesma transação da conclusão paga. Não é possível concluir manualmente por edição ou registrar a entrega como Fiado.

A venda vinculada alimenta o fechamento e os relatórios existentes, com peças e mão de obra no comprovante. A mão de obra não é um produto fictício e não movimenta estoque. O faturamento total entra uma única vez na venda; as peças ficam discriminadas na O.S. e no comprovante, sem criar uma segunda venda de peças. Rankings de produtos continuam baseados em itens das vendas de catálogo, sem incluir peças de O.S. nesta primeira etapa.

## Estoque e cancelamento

Peças orçadas não são reservadas. O recebimento valida disponibilidade, e a conclusão bloqueia os produtos em ordem estável antes da baixa. Não há estoque negativo ou baixa repetida. A O.S. só fica entregue depois do pagamento integral. Dinheiro parcial permanece no caixa e a O.S. continua pronta.

Cancelar/expirar uma venda de recebimento não movimenta peças, pois elas ainda não foram baixadas. A O.S. permanece pronta e pode voltar ao caixa; a cobrança anterior permanece no histórico. Para cancelar ou alterar a O.S., primeiro resolva a venda vinculada. O cancelamento de uma O.S. não paga remove sua senha de testes. Ordens canceladas e entregues ficam somente para consulta.

Se uma aprovação online chegar quando não há peças disponíveis, a aprovação é preservada e a venda e a O.S. permanecem pendentes de entrega. Reponha as peças e use novamente **Receber no caixa / PDV**, no caixa original, para conciliar a entrega sem gerar outra cobrança. Nenhuma aprovação de provedor é simulada pela interface de produção.

## Segurança e consistência

- Todas as consultas e alterações usam exclusivamente o tenant da sessão; IDs de tenant e totais enviados pelo cliente são rejeitados.
- Número sequencial de O.S. por loja, versão otimista no orçamento e checkout transacional com uma única venda ativa por O.S.
- Peças e venda têm chaves compostas de loja no banco, além de verificação na aplicação.
- Senha opcional do aparelho criptografada com AES-256-GCM, nunca serializada em listas, dados iniciais da página ou comprovantes. Consulta explícita por sessão da loja, com resposta sem cache, registro de acesso sem conteúdo da senha e ocultação na tela após 30 segundos. Removida ao concluir/cancelar.
- Fotos são links, abertos apenas por ação do operador. O servidor não busca URLs externas.

## Banco e validação

Migração aditiva: `20261025000100_service_orders`. Acrescenta enum, tabelas, campos e restrições, sem reclassificar lojas ou modificar vendas existentes.

```sh
npm test
npm run test:unit
npm run test:browser
npm run test:service-orders:db
npm run build
npm run test:service-orders:browser
```

O teste de banco cria lojas temporárias próprias, exercita estoque, criptografia, isolamento, pagamento parcial, idempotência, concorrência, rollback e conciliação de aprovação sem estoque. O teste Playwright completo usa login real e a aplicação local, cria uma O.S., recebe em dinheiro de fixture e confere comprovante e caixa. Ambos removem suas fixtures. Não geram cobranças ou pagamentos bancários reais.
