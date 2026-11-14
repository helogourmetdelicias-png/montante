# PDV com foco na venda — 13/11/2026

O cabeçalho reúne loja, operador, o menu **Caixa** e o sino **Alertas**, com o contador de produtos. **Abrir caixa** e **Fechar caixa** continuam disponíveis dentro do menu. As opções de saída para o caixa ficam desabilitadas enquanto existe uma venda em andamento, com orientação no próprio menu.

Os detalhes de estoque e validade aparecem somente ao clicar no sino. A consulta continua atualizando o contador e sinalizando falhas. Listas e relatórios abrem em outra aba para preservar a venda atual. O catálogo e os relatórios mantêm seus quadros e filtros completos.

Na venda rápida, o valor pode ser digitado diretamente na tela. Descrição opcional fica recolhida. Os atalhos F1/F2 e suas janelas continuam disponíveis. Após sair da janela F2, a busca de produtos também fica na tela principal, mantendo consulta e carrinho. O catálogo de seleção só é montado em um lugar por vez para evitar campos, IDs e referências de foco duplicados.

O resumo concentra cliente, pagamento e total. Foram retirados o valor livre repetido no corpo, o subtotal da venda rápida e o segundo quadro de confirmação que repetia total e cliente. Subtotal e desconto da venda com produtos permanecem. Foram preservados os fluxos de Pix, dinheiro, troco, fiado, confirmação e cancelamento.

Validação: onze testes de navegador nos conjuntos de caixa e estoque, incluindo computador com altura de 620 px e celular de 390 px. Cobrem acesso ao caixa, seleção e fechamento do dia anterior, abertura manual, estoque recolhido no sino, preservação de valor ao abrir avisos, menu de caixa protegido durante a venda, descrição opcional, busca de produtos na tela principal e cobrança sem abertura obrigatória. TypeScript, lint dos arquivos alterados e build de produção conferidos. Sem migração nem alteração de dados reais.
