# Pix Pagar.me (Stone)

O PDV integra Pix online pela API v5 do Pagar.me. Cartões presenciais continuam sendo cobrados em uma maquininha física; esta integração não captura dados de cartão.

## Preparar a loja

1. Abra **Configurações → Pagamentos** e selecione **Pagar.me (Stone)**.
2. Escolha Sandbox para testes ou Produção para cobranças reais.
3. Cole a chave secreta da API (`sk_...`) no campo correspondente, ative a integração e salve. A chave é criptografada por tenant e não é exibida novamente.
4. No PDV, selecione **Pagar.me (Stone) · Pix**. Para criar o Pix, informe nome, e-mail, CPF/CNPJ e celular com DDD. O endereço fica em campos extras e só deve ser preenchido quando a conta Pagar.me exigir.
5. O PDV exibe o código Pix/QR Code e consulta o pedido no Pagar.me a cada cinco segundos. A venda e o estoque só são consolidados quando a API informar pagamento aprovado.

Nunca envie a chave secreta em mensagens, screenshots ou no navegador. A imagem compartilhada exibe somente chaves mascaradas; ela não permite configurar o gateway.

## Escopo e homologação

- O endpoint utilizado é `POST https://api.pagar.me/core/v5/orders`, autenticado com HTTP Basic usando a chave secreta como usuário e senha vazia.
- A documentação de Pix lista nome, e-mail, documento e telefone como dados obrigatórios. A documentação de pedidos informa que contas do tipo PSP exigem o objeto `customer` completo, incluindo endereço e telefone; por isso o endereço é opcional no fluxo e o detalhe retornado pelo provedor orienta quando será necessário preenchê-lo.
- O pedido Pix expira em 30 minutos e usa a chave de idempotência da tentativa da venda.
- O status é consultado no endpoint de pedido do Pagar.me; notificações recebidas não substituem a confirmação no provedor.
- Pix Pagar.me é separado da API direta Ton. A integração de cartão/maquininha física permanece aguardando homologação e equipamento compatível.
- Antes de habilitar cobranças reais, valide a conta e o fluxo Sandbox com chave de teste (`sk_test_...`). O Pagar.me pode exigir campos adicionais conforme o tipo de conta/PSP.

Referências oficiais: [Criar pedido](https://docs.pagar.me/reference/criar-pedido-2) e [Pix](https://docs.pagar.me/reference/pix-2).
