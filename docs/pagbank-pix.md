# PagBank Pix no PDV

Em Configurações → Pagamentos, selecione PagBank, escolha Sandbox ou Produção e salve o token da API de Pedidos/Pagamentos no campo protegido. Informe somente o token, sem o prefixo Bearer. A conta PagBank precisa ter uma chave Pix ativa. Não envie o token por mensagens.

No PDV, escolha Pix online do PagBank e informe nome, e-mail e CPF/CNPJ do comprador. O pedido gera QR Code e código copia e cola com validade de 30 minutos. A venda só é concluída após a consulta retornar PAID e conferir o valor da cobrança.

Enquanto o Pix estiver ativo, o cancelamento local mantém a venda e a reserva de estoque pendentes. Após o PagBank confirmar o cancelamento/expiração, a reserva pode ser liberada. O sistema não solicita estorno automaticamente.

As consultas ocorrem no PDV e na rotina existente de reconciliação de vendas expiradas, quando configurada. Não foi adicionado webhook PagBank. Em falhas de rede com resultado incerto, a tentativa fica pendente para impedir duplicidade; se nenhum identificador do pedido tiver sido recebido, será necessário conferir o pedido no painel PagBank antes de resolver a tentativa. Trocar o ambiente é bloqueado enquanto houver tentativas pendentes.

Validações: 48 testes unitários, teste de integração com banco e respostas PagBank simuladas, TypeScript e build passaram. Nenhum pagamento real foi criado. A autenticação do token do lojista e o pagamento real/Sandbox ainda precisam ser validados; a liberação do ambiente de produção depende do PagBank.

Arquivos envolvidos: adaptador e catálogo de pagamentos, validação de tentativas, rotas de criação/consulta/cancelamento, configurações, PDV e proteção/reconciliação das reservas. Não há migração de banco nesta integração.

Referências oficiais:
- https://developer.pagbank.com.br/reference/criar-pedido-com-qr-code-pix-v2
- https://developer.pagbank.com.br/reference/consultar-pedido
- https://developer.pagbank.com.br/docs/primeiros-passos
