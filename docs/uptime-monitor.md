# Monitoramento do PDV e banco de dados

URL para cadastrar no UptimeRobot: `https://montante-um2r-seven.vercel.app/api/health`.

- Tipo: HTTP / website monitoring.
- Método: GET (HEAD também consulta o banco).
- Intervalo sugerido: 5 minutos.
- Resposta saudável: HTTP 200, `{"status":"ok","database":"up"}`.
- Falha de banco: HTTP 503 com mensagem genérica, sem detalhes internos.
- Sem login, senha, token ou corpo de requisição. Ative o e-mail desejado nas notificações.

A rota faz uma única leitura pequena no banco a cada chamada, sem cache, sem gravar dados e sem retornar identificadores de lojas/clientes. O middleware libera apenas o caminho exato `/api/health`; demais rotas seguem suas regras existentes.

O plano gratuito do Supabase pode pausar projetos com pouca atividade durante sete dias; não é uma expiração automática sete dias após a criação. Monitorar apenas o login pode deixar de consultar o banco. Esta rota verifica a conexão de verdade e gera leitura de banco, mas a política de pausa e disponibilidade é do Supabase. Se já estiver pausado, retome o projeto no painel Supabase.

Referência oficial: https://supabase.com/docs/guides/platform/free-project-pausing
