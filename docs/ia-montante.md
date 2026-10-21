# IA Montante (Groq)

## Implementação

Menu **IA Montante**, em `/ia`, para responsáveis e administradores da loja, com conversa e filtro de até 366 dias. Cada pergunta consulta novamente os dados do tenant da sessão. Alterar o período limpa a conversa para evitar misturar datas. A conversa fica apenas na memória da tela.

O retrato contém faturamento e quantidade de vendas concluídas, ticket médio, pagamentos aprovados por data de confirmação (com indicação de simulação), fiados vendidos e recebidos no período, saldo atual de fiados de todo o histórico, suprimentos/sangrias e amostra das 20 vendas concluídas mais recentes. Os totais são calculados no banco, com decimais, sem depender da amostra. Datas comerciais usam São Paulo. Não há nomes, documentos ou contatos de clientes, observações, credenciais, IDs de tenant ou dados de outras lojas no contexto automático. Perguntas digitadas pelo lojista são enviadas integralmente: a tela orienta a não inserir dados pessoais.

A IA pode orientar sobre as telas existentes. Não executa operações, SQL, navegação ou ferramentas; não recebe credenciais de pagamentos. Não identifica devedores individuais, calcula lucro, confirma liquidação bancária ou responde sobre dados fora do retrato. Para a lista de clientes devedores, aponta o menu Fiados. A resposta gerada pode conter imprecisões; os números de referência aparecem separadamente na tela, diretamente do banco.

## Ativação

1. Preencher `GROQ_API_KEY` no arquivo local `.env.local`, ignorado pelo Git. Não enviar a chave por chat, nem usar `NEXT_PUBLIC_`.
2. Modelo padrão `openai/gpt-oss-120b`, substituível por `GROQ_MODEL` no servidor conforme a disponibilidade da conta.
3. Para produção, adicionar a variável secreta `GROQ_API_KEY` ao ambiente **Production** do projeto Vercel **montante-um2r** e publicar novamente. A chave local não é enviada no deploy.
4. Configurar limites de gasto/uso do projeto Groq. Há proteção local de uma consulta simultânea e dez consultas por minuto por tenant e instância; ela **não é uma cota global distribuída** entre instâncias Vercel. A API trata recusas e limites do provedor sem expor respostas brutas ou segredos.

Sem chave, a tela explica a pendência, desabilita o envio e a API retorna 503 antes de consultar dados. Requisições têm corpo limitado a 48 KB, pergunta de até 1.000 caracteres, até seis mensagens anteriores, resposta de até 1.400 tokens e prazo de 25 segundos para a Groq. Chamadas ao provedor não são repetidas automaticamente. Não há custos de API nos testes automatizados.

Documentação consultada: [API Groq](https://console.groq.com/docs/api-reference) e [modelos disponíveis](https://console.groq.com/docs/models).

## Arquivos e motivos

- `src/components/store-navigation.tsx`: link e ícone da IA, com a mesma regra de acesso dos relatórios.
- `src/app/ia/page.tsx`: autorização e detecção da configuração no servidor.
- `src/app/ia/montante-assistant.tsx`: conversa, período, aviso de envio à Groq, pendência de conexão e números de referência.
- `src/app/api/ai/chat/route.ts`: autenticação, papel, validações, origem, limites e resposta privada sem cache.
- `src/lib/ai/snapshot.ts`: consultas estritamente por tenant e projeção de dados sem identificação de clientes.
- `src/lib/ai/groq.ts`: cliente HTTP servidor, instruções de orientação e tratamento seguro de falhas.
- `src/lib/ai/limits.ts`: contenção por instância/tenant.
- `.env.example`: variáveis de conexão sem valores secretos.
- `tests/ai.test.cjs`: autorização, injeção de tenant/papel, datas, tamanho, isolamento das consultas, projeção, transporte Groq simulado, erros e limites.
- `tests/ai.database.cjs`: duas lojas temporárias no banco real, limites de data, status, recebimentos parciais e saldo atual.
- `package.json`: comandos dos testes da IA.
- `checklist.md`: conclusão e pendências verificadas.

Nenhuma alteração de schema, migração, permissão dos operadores ou integração de pagamentos é necessária.

## Validações em 21/10/2026

- 55 testes automatizados passaram, incluindo os quatro novos testes da IA.
- Integração com banco real passou com duas lojas temporárias: isolamento, status concluído, datas de São Paulo, recebimentos parciais e saldo de todo o histórico. Fixtures dessa integração removidas.
- TypeScript passou. Build de produção executado sem lint.
- Conexão real à Groq validada exclusivamente com dados fictícios. Modelo disponível na conta: `openai/gpt-oss-120b`. Confirmados R$ 120,50 em vendas, R$ 40,00 recebidos de fiado e R$ 60,00 de saldo em aberto.
- A chave permanece apenas no ambiente local/servidor e não integra o Git ou o código cliente.

Limitações: o assistente não conhece todos os registros individuais, não identifica clientes e pode errar em explicações. Valores de referência são exibidos diretamente do banco. A contenção de uso é por instância, complementada pelos limites do projeto Groq. Não foram corrigidos avisos preexistentes do Node sobre tipo de módulo, nem alterada a configuração de lint.
