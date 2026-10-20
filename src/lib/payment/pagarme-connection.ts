export async function testPagarMeConnection(apiKey: string) {
  const key = apiKey.trim();
  if (!/^sk_[A-Za-z0-9_]+$/.test(key)) return { ok: false, code: 'INVALID_KEY_FORMAT', message: 'A credencial salva não tem formato de chave secreta Pagar.me v5. Confira o campo de chave no painel e salve novamente.' };
  try {
    const response = await fetch('https://api.pagar.me/core/v5/orders?size=1', {
      method: 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    // Never read, log or return the merchant's orders or the supplied credential.
    await response.body?.cancel();
    if (response.ok) return { ok: true, code: 'CONNECTED', providerStatus: response.status, message: 'Pagar.me aceitou a chave salva em uma consulta sem cobrança. Este teste confirma acesso à API; a habilitação do Pix precisa ser validada separadamente.' };
    if (response.status === 401) return { ok: false, code: 'PROVIDER_UNAUTHORIZED', providerStatus: 401, message: 'Pagar.me recusou a chave salva também em uma consulta sem cobrança (401). Confirme no painel se a chave pertence à conta correta e está ativa na API v5. Se estiver, informe ao suporte Pagar.me: GET /core/v5/orders retorna 401 usando Basic Auth com chave secreta e senha vazia. Não envie sua chave ao suporte por mensagem.' };
    if (response.status === 403) return { ok: false, code: 'PROVIDER_FORBIDDEN', providerStatus: 403, message: 'Pagar.me negou permissão para consultar pedidos (403). Confira as permissões da chave e a liberação da conta com o suporte Pagar.me.' };
    return { ok: false, code: 'PROVIDER_ERROR', providerStatus: response.status, message: `Pagar.me respondeu HTTP ${response.status} à consulta de conexão. Tente novamente em instantes; nenhuma cobrança foi criada.` };
  } catch {
    return { ok: false, code: 'CONNECTION_ERROR', message: 'Não foi possível concluir a consulta ao Pagar.me em até 10 segundos ou houve falha de conexão. Nenhuma cobrança foi criada.' };
  }
}
