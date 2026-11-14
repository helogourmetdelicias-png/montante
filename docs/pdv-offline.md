# Vendas em dinheiro sem internet

O PDV prepara automaticamente uma tela de contingência ao ser aberto com internet. Aguarde **Offline pronto** no topo. O catálogo é completo, isolado por loja e operador, e renovado a cada 15 minutos enquanto o PDV está aberto. A preparação permite novas vendas por sete dias; depois é necessário conectar novamente.

Quando a conexão cair, use **Continuar vendendo offline**. O valor ou os produtos em edição são levados para a tela offline. Se o PDV for recarregado sem conexão, o navegador abre a contingência automaticamente. Uma cobrança online já iniciada precisa ser conferida com internet; não é convertida silenciosamente em outra venda.

Na contingência é possível fazer venda rápida, buscar produtos por nome/SKU/código de barras, vender quantidades fracionadas, dar desconto em reais, informar dinheiro recebido e calcular troco. Apenas dinheiro: Pix, cartão integrado, fiado, clientes e ordens de serviço continuam no fluxo online.

Uma venda só aparece como salva depois de a transação do IndexedDB concluir. Ela fica com a identificação original, data/hora, preço do catálogo utilizado, dinheiro recebido e troco. O estoque disponível no aparelho desconta as vendas locais, inclusive entre duas abas concorrentes.

Ao voltar a conexão, mantenha a tela offline ou o PDV aberto. O envio acontece automaticamente, com tentativa a cada 30 segundos e botão **Enviar pendentes**. Fechar o navegador não apaga as vendas, mas interrompe o envio até abrir novamente. Há histórico local com estado aguardando/enviada, referência e erro de conferência, além de **Salvar cópia das vendas** em JSON. O arquivo é uma cópia de segurança para conferência; não há importação automática nesta versão.

## Integridade no servidor

- Contexto e preços preparados recebem assinaturas HMAC usando o segredo de autenticação, com separação de domínio. O segredo nunca vai ao aparelho. Não se guardam clientes, senhas, tokens de sessão ou credenciais de pagamento no armazenamento offline.
- O envio exige sessão válida da mesma loja e do mesmo operador. Sair ou trocar de operador invalida o contexto ativo, preservando as filas do operador anterior. Ele precisa entrar novamente para enviá-las.
- Cada venda usa `offline:<uuid>` como chave única por loja. O hash do conteúdo impede reutilizar uma identificação com valores diferentes. Reenvios ou confirmação perdida não repetem estoque, receita nem recebimento.
- Venda concluída, itens, baixa de estoque, número sequencial e pagamento aprovado são gravados na mesma transação serializável. As reservas online expiradas são liberadas antes da tentativa. Falhas revertem toda a tentativa.
- Preços assinados são preservados, mesmo se o catálogo online mudou. Produto removido/inativo ou estoque insuficiente produz conflito; a venda permanece no aparelho, sem descarte. O responsável ajusta o cadastro/estoque e tenta novamente.
- `sold_at`, `created_at` e o recebimento usam o instante original. O caixa é procurado pelo dia do Rio/São Paulo e operador. Uma venda enviada no dia seguinte não entra no caixa atual. Se o caixa original estava fechado, os valores esperado e diferença são recalculados, preservando valor declarado e fechamento. A venda é identificada nas observações como offline.
- A janela de sete dias vale para a realização da venda, não para o envio: uma venda válida pode ser enviada posteriormente. Datas futuras ou anteriores à preparação (com tolerância de relógio de cinco minutos) são rejeitadas para conferência.

## Armazenamento e cache

O service worker `/sw.js` guarda apenas `/offline/index.html`, CSS e módulos JS estáticos. Nenhuma página autenticada, API, resposta de login ou dado financeiro é colocado no Cache API. IndexedDB contém catálogo, edição e vendas por operador. O shell público sem contexto ativo não exibe dados da loja. HTTPS e navegador com service worker/IndexedDB são necessários. O navegador recebe uma solicitação de armazenamento persistente após ação de venda; o suporte e a concessão dependem do navegador.

Não limpar os dados do navegador, desinstalar seu perfil ou usar navegação anônima como operação habitual enquanto existirem pendências. O armazenamento é local: outro computador não consegue recuperar uma venda ainda não enviada. A cópia JSON permite guardar uma referência fora do navegador.

## Verificação

- `npx playwright test --config playwright.offline.config.ts`: preparação, transferência de edição, cache real, recarga e navegação `/pdv` sem rede, dinheiro/troco, produtos fracionados, estoque local, confirmação perdida, conflito, exportação, catálogo vencido, isolamento de operador, logout, concorrência entre abas e falha de armazenamento.
- `npx vitest run tests/vitest/offline-sales.test.ts tests/vitest/health-middleware.test.ts`: autenticação, assinaturas, preço histórico, idempotência, datas, caixa fechado, validação de totais e acesso público restrito ao shell.
- `node --env-file=.env tests/offline-sales.database.cjs`: cria uma loja exclusiva de QA e remove seus registros no final; confirma transação e rollback no PostgreSQL, concorrência da mesma venda, um único recebimento, atualização do caixa antigo sem misturar com hoje e preparação do catálogo.

Referências utilizadas: [service workers e cache](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) e [armazenamento de dados offline](https://web.dev/learn/pwa/offline-data).
