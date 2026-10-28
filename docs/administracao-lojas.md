# Administração de lojas

A conta tecnicorikardo@gmail.com já possui o grant de administração geral. Entre com e-mail, senha e código quando solicitado, e acesse /admin. Se necessário, saia e entre novamente para renovar a sessão administrativa; troca de operador por PIN não concede este privilégio.

Em Gerenciar loja, defina plano automático por vendas, gratuito, Padrão ou Avançado. Gratuito interrompe novas mensalidades. A mudança preserva cobranças já emitidas e inicia a próxima apuração no próximo aniversário mensal. Planos pagos definidos pela administração liberam o dashboard gerencial; não criam comprovantes fictícios de pagamento. A exceção de dashboard da conta Ricardo continua preservada.

Desativar bloqueia o acesso e novas apurações, preservando o histórico. Reativar volta a permitir o login dos usuários ativos da loja.

Excluir definitivamente remove a loja, usuários e dados relacionados. A ação exige digitar exatamente o identificador da loja. A própria loja administrativa e qualquer loja com administrador geral estão protegidas. Resolva cobranças externas pendentes antes. A exclusão não executa cancelamentos/estornos nos bancos. A auditoria da operação é preservada separadamente; imagens privadas são removidas do Storage após a transação. Se a limpeza falhar, o painel sinaliza e os caminhos ficam na auditoria para conferência.

Nenhuma conta real foi excluída durante a implantação. Os testes de exclusão usaram somente um schema PostgreSQL temporário, removido ao terminar.

O login não mostra mais lista de contas locais. Para salvar login e senha, use o gerenciador nativo do navegador. Ele decide quando mostrar confirmação e pode exigir desbloqueio do dispositivo. Senhas não são persistidas em localStorage pela aplicação.
