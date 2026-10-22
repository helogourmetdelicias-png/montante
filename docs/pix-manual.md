# QR Code no Pix manual

O Pix manual gera um QR Code PNG local e o código Pix Copia e Cola com o valor restante da venda. A chave não é mais enviada como se fosse um código Copia e Cola. Nenhum dado é enviado a geradores externos de QR Code.

## Configuração

Em Configurações > Pagamentos > Pix manual, selecionar o tipo da chave (telefone, CPF, CNPJ, e-mail ou aleatória), informar a chave cadastrada no banco, o nome do recebedor e a cidade. Nome e cidade podem usar o cadastro da loja quando disponíveis. Os dados continuam criptografados no banco; editar apenas cidade/nome preserva a chave já salva.

Telefones brasileiros com DDD são convertidos para +55. CPF e CNPJ perdem pontuação; e-mail e chave aleatória são normalizados. Uma chave antiga com 11 números sem tipo exige escolher telefone ou CPF, evitando supor um destinatário. A validação confere formato, não registro no DICT ou titularidade. O aplicativo do banco mostra os dados reais da conta vinculada à chave.

O payload inclui moeda BRL, valor da cobrança, nome (até 25 caracteres), cidade (até 15), referência alfanumérica de até 25 caracteres e CRC16. A referência é derivada da chave de idempotência da tentativa. Os textos são normalizados para o conjunto de caracteres aceito pelo BR Code.

## Recebimento

O cliente aponta a câmera pelo aplicativo do banco ou usa o botão Copiar código Pix. A venda continua pendente até o lojista conferir o crédito no banco e confirmar manualmente. QR estático não oferece conciliação automática, estorno, vencimento bancário ou invalidação remota: cancelar/expirar uma venda no Montante não impede que alguém pague um código já compartilhado. A chave pode receber dinheiro real mesmo se o cadastro estiver marcado como Sandbox.

Não há migração de banco. Configurações antigas podem precisar complementar tipo de chave e cidade antes de gerar cobranças.

## Verificações

`tests/pix-manual.test.cjs` verifica o vetor oficial do BCB (CRC 1D3D), normalização de chaves, valores/limites, decodificação real do PNG, igualdade com o Copia e Cola, geração sem acesso externo, status pendente, resposta da API com banco simulado, isolamento por loja, acesso e preservação da chave em edições parciais. Incluído em `npm test`.

O componente da tela e o botão de copiar foram verificados no navegador com dados fictícios. Nenhum pagamento real ou alteração de configuração de uma loja existente foi feito.

Referências: [Manual de Padrões para Iniciação do Pix, seções 2.5–2.6](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf) e [node-qrcode](https://github.com/soldair/node-qrcode).
