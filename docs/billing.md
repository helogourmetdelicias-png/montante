# Assinaturas Montante

Trial: 3 meses desde o cadastro, conforme regra comercial. Ciclos no aniversário UTC do cadastro, ajustando ao último dia nos meses curtos sem acumular desvio. Apuração: vendas completed por sold_at em [início, fim). Até 500: R$ 49,90; acima: R$ 79,00 no ciclo seguinte, com regressão automática.

Primeira fatura ao fim do trial, baseada no último ciclo gratuito. Não cobra os três meses de trial. Vencimento adotado: 7 dias após início do ciclo pago. OVERDUE sinaliza pendência vencida, sem bloquear o PDV. Migration preserva histórico e usa cadastro original das lojas existentes.

## Operação

Aplicar `npx prisma migrate deploy`. Agendar diariamente GET ou POST /api/cron/billing com Authorization: Bearer CRON_SECRET. Até 100 tenants por chamada; seguir nextCursor em ?cursor=... até null. Repetir a página se houver falhas. Até 12 ciclos por tenant por chamada; repetir varredura para atrasos maiores. Transações serializáveis e chave única tenant/ciclo protegem reexecuções.

## Mercado Pago

Configurar MERCADO_PAGO_ACCESS_TOKEN com a conta que recebe mensalidades do SaaS, SAAS_BILLING_URL com a origem pública HTTPS e SAAS_MERCADOPAGO_WEBHOOK_SECRET com o segredo do app recebedor. Não reutilizar credenciais criptografadas das lojas.

Configurar notificações payment para /api/webhooks/billing. O checkout envia notification_url. A página /assinatura abre Checkout Pro por fatura; não configura débito automático. Os meios disponíveis dependem da conta Mercado Pago, incluindo Pix quando habilitado. A consulta /v1/payments exige aprovação, referência, moeda e valor corretos antes da baixa. Retorno ao site sozinho não quita fatura. Reenvios do webhook são idempotentes.

Homologar com comprador/vendedor de teste distintos, pagamento de fixture e reenvio do webhook. Não efetuar cobrança real para validação. Publicação, variáveis de produção, agendador e homologação de pagamento precisam ser confirmados no ambiente público.

Referências: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post e https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
