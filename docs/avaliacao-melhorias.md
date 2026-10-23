# Avaliação do feedback do Montante

Revisão de `avaliacao.txt` em 23/10/2026. A avaliação descreve uma experiência de uso; as sugestões foram comparadas com o código, sem excluir ou estornar as vendas fictícias #19 e #20.

## Melhorias implementadas nesta revisão

| Pedido | Resultado |
| --- | --- |
| Menos etapas na venda avançada | Produtos seguem diretamente para pagamento. Identificação do cliente é opcional; fiado continua exigindo cliente. |
| Cliente opcional na venda rápida | Reutiliza o seletor, cadastro e vínculo de cliente existentes, com validação da loja e de cliente ativo. |
| Descrição, observação e referência | Reutiliza `Sale.notes`, sem criar outra tabela ou campo equivalente. Disponível nos dois modos; aparece no histórico e no comprovante. Orçamento/pedido pode ser informado como texto, sem criar um módulo de orçamento. |
| Valor digitado com vírgula ou ponto | Venda rápida abre em modo decimal: `12,34` e `12.34` significam R$ 12,34. O modo anterior em centavos permanece selecionável: `1234` significa R$ 12,34. Em modo decimal, `1234` significa R$ 1.234,00. |
| Atalhos de valor | Botões de R$ 10, R$ 20, R$ 50 e R$ 100 substituem o valor da venda rápida. |
| Aviso sobre estoque | Texto explícito: a venda rápida registra valor financeiro e não baixa produtos. |
| Categorias no catálogo do PDV | Filtro utiliza a API de produtos existente e categorias ativas da própria loja. |
| Adicionar produto mais evidente | Botão do produto passa a exibir “Adicionar” além do símbolo. |
| Quantidade acima do estoque | Aviso identifica produto, quantidade solicitada e disponível; impede iniciar a cobrança até ajustar. A validação definitiva do estoque permanece no servidor. |
| Resumo antes da cobrança | Cliente, descrição, método e total aparecem junto ao botão de cobrança. Subtotal e desconto continuam no mesmo painel; não foi introduzida outra etapa obrigatória. |
| Identificação do cliente | Telefone visível após selecionar. Responsáveis e administradores têm acesso direto ao histórico existente, preservando as permissões. |
| Busca automática | Mantida; respostas de pesquisas antigas são descartadas para não substituir resultados mais recentes. |
| Fechamento de caixa | Preservada a correção da etapa anterior: tentativa manual de venda cancelada não bloqueia o fechamento. Pendências reais aparecem no Caixa e nos detalhes; cobranças externas continuam bloqueando até resolução. Regra compartilhada entre as duas telas. |

Não houve migração de banco nem mudança no cálculo financeiro, reserva de estoque, permissões, integração com provedores ou regras de fiado. A compilação identificou incompatibilidades existentes com Next.js 15: corrigidas a leitura assíncrona do cabeçalho no login e a resolução dos parâmetros nas rotas dinâmicas e páginas de vendas/clientes. São ajustes de compatibilidade, sem alteração das regras dessas rotas.

## Recursos já existentes

| Sugestão | Situação encontrada |
| --- | --- |
| Busca enquanto digita | Já existe, com intervalo de 250 ms. |
| Foco para código de barras | Já existe ao abrir a venda avançada; Enter adiciona correspondência encontrada. |
| Quantidade digitável e frações | Já existem; precisão de até três casas, respeitando o cadastro do produto. |
| Dinheiro + Pix | Já existe a opção de pagamento dividido, conforme provedor disponível. Não significa suporte a quaisquer combinações. |
| Histórico de compras do cliente | Já existe para responsável/administrador. |
| Telefone e endereço | Já existem no cadastro e são reaproveitados quando o provedor exige dados do comprador. |
| Ranking de produtos | Já existe nos relatórios, por receita e quantidade. Ordenar o catálogo pelos mais vendidos ainda é uma melhoria separada. |
| Identificação de pagamento simulado | Há indicação para a simulação específica de Pix. Isso não constitui um ambiente geral de treinamento isolado. |
| Saldo de fiado | Já existe na área Fiados; exibição automática no seletor do PDV ainda não foi implementada. |

## Viáveis, mas exigem uma próxima etapa

| Proposta | Trabalho necessário para preservar a operação |
| --- | --- |
| Treinamento/demonstração e reset | Separar dados, caixa, estoque, faturamento e credenciais. Preferir loja/base de homologação. Não basta marcar uma venda real como teste ou ocultá-la dos relatórios. |
| Estorno de vendas concluídas / limpeza dos testes | Criar fluxo auditável para dinheiro, estoque, fiado e provedores. O cancelamento atual de reservas pendentes não equivale a um estorno. Não apagar vendas concluídas silenciosamente. |
| Cartão + dinheiro, dois cartões e entrada + fiado | Definir parcelas, saldo, cancelamento parcial, estorno e conciliação. Reutilizar tentativas existentes, ampliar o fluxo transacional e testar cada combinação. |
| Desconto por operador, autorização do gerente, preço mínimo, margem e motivo | Definir limites, permissões e tratamento de produtos sem custo. Exigir validação no servidor e auditoria; não apenas bloquear na interface. |
| Saldo e inadimplência antes do fiado | Mostrar saldo reaproveitando a apuração existente. Para chamar de “inadimplente” ou bloquear vendas, definir vencimento, limite de crédito e exceções. |
| Último preço, clientes frequentes | Definir período e política de acesso; buscar histórico da própria loja. |
| Favoritos | Definir se pertencem ao operador ou à loja, persistência e tratamento de produtos inativos. |
| Mais vendidos no catálogo | Reutilizar agregações de relatórios com período e atualização definidos. |
| Catálogo compacto, sem modal grande | Reorganizar o componente existente para não duplicar catálogo/carrinho; validar atalhos, foco e telas pequenas. |
| Multiplicação rápida, teclado na tela, repetir último valor e acréscimos | Definir atalhos sem conflito e comportamento inequívoco dos valores; validar leitores e dispositivos móveis. O teclado numérico do dispositivo já é solicitado pelo campo. |
| Observação por item | Exige persistência por item e alteração do comprovante; não confundir com observação geral da venda. |
| Categoria de venda rápida e distinção serviço/produto | Criar classificação explícita e relatórios compatíveis, incluindo tratamento dos registros anteriores sem classificação. |
| Kits e sugestões complementares | Definir composição, preço, desconto e baixa de cada componente. |
| Fidelidade | Definir pontos, resgates, validade e estorno. |
| Relatório sem cliente, por operador/horário e comparação rápida/avançada | Reutilizar filtros e agregações existentes, definir indicadores e períodos. “Conversão” exige definir qual evento está sendo medido. |

Todas são tecnicamente possíveis. As próximas prioridades recomendadas são treinamento isolado, consulta de saldo no PDV e ampliação dos pagamentos divididos, com regras acordadas antes de alterar o comportamento financeiro.

## Validação

- Suíte completa: 72 testes passaram, incluindo valores, cliente opcional, fechamento e o teste da API de venda rápida.
- Teste da API de venda rápida: descrição persistida, cliente da própria loja, ausência de baixa de estoque, repetição idempotente e conflito de descrição; executado com dependências isoladas, sem acesso à base real.
- Acrescentado e aprovado mais um caso para parâmetros assíncronos com consulta restrita à loja; o arquivo com os dois testes de API passou novamente. Total: 73 casos distintos aprovados.
- Verificação TypeScript passou após a correção do login.
- Lint passou com avisos existentes de hooks e imagem.
- Compilação de produção concluída com sucesso, incluindo geração das páginas e validação dos tipos das rotas.
- Não foram executadas vendas reais ou testes de pagamento com provedores. Publicação e conferência visual autenticada no ambiente de homologação continuam separadas desta revisão.
