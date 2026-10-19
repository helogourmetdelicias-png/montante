# Webhook de Orders Pix do Mercado Pago

O PDV usa o webhook do Mercado Pago para receber notificações da Order e confirmar o Pix sem depender somente do polling. Configure a URL pública HTTPS `https://<dominio>/api/webhooks/mercadopago` para receber eventos de Order. A rota exige o segredo de assinatura configurado na aplicação Mercado Pago e no servidor como `MERCADOPAGO_WEBHOOK_SECRET`.

## Segurança e confirmação

- O Mercado Pago envia `x-signature`, `x-request-id` e `data.id` na query string. A assinatura HMAC-SHA256 é validada com o manifesto oficial `id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;`.
- Assinatura ausente ou inválida retorna `401`. Segredo ausente retorna `503` e deve ser corrigido antes de ativar o webhook.
- A rota considera somente eventos `type=order` (ou `topic=order`). Eventos válidos de outros tipos recebem `200` e são ignorados.
- O corpo/ação da notificação não é tratado como prova de pagamento. Para a Order associada, o servidor consulta `GET /v1/orders/{id}` usando a credencial criptografada daquela loja e só aprova quando o Mercado Pago informa estado liquidado (`processed`/`accredited`).
- A tentativa Pix é atualizada dentro de transação serializável; a venda é concluída somente quando o total das parcelas aprovadas cobre o total da venda. A parcela em dinheiro aprovada é preservada. O webhook não baixa estoque: ele já foi reservado no início da venda.
- Reenvios depois da aprovação são reconhecidos e recebem `200`; a atualização da venda é protegida pelo estado `pending`, então a conclusão não é repetida. Falhas transitórias retornam `500` para permitir nova tentativa do Mercado Pago.

## Configuração

1. No painel **Suas integrações > Webhooks**, configure a URL acima, habilite os eventos de Order e copie a chave secreta do webhook.
2. Cadastre essa chave como variável `MERCADOPAGO_WEBHOOK_SECRET` na hospedagem. Para desenvolvimento, configure-a no `.env` local (arquivo ignorado pelo Git); nunca salve o segredo em código, URL, `vercel.json` ou logs.
3. Para testar o webhook local, exponha temporariamente o servidor local por um túnel HTTPS controlado e configure a URL encaminhada para `/api/webhooks/mercadopago`. O endpoint de simulação Sandbox continua separado e não substitui uma liquidação real.
4. Confira os logs `mercadopago.webhook.order_processed`, `mercadopago.webhook.signature_rejected` e `mercadopago.webhook.processing_failed`. Não registre a assinatura completa nem credenciais.

O Mercado Pago documenta a validação do manifesto, os cabeçalhos e a consulta do recurso notificado na [documentação oficial de Webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks) e na [documentação de notificações de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications).
