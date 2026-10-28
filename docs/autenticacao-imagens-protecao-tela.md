# Autenticação, imagens e proteção de tela

Implementação local de 28/10/2026. Publicação pendente da homologação dos serviços.

## Ambiente do servidor

Configure localmente e na Vercel, sem inserir segredos no repositório:

- RESEND_API_KEY: chave da API do Resend para envio de e-mails transacionais.
- AUTH_EMAIL_FROM: endereço de remetente validado no Resend (formato: onboarding@seudominio.com).
- NEXT_PUBLIC_SUPABASE_URL: URL HTTPS real do projeto.
- SUPABASE_SERVICE_ROLE_KEY: chave secreta de servidor, nunca com prefixo NEXT_PUBLIC.
- AUTH_SECRET: segredo persistente da autenticação.

O envio usa o Resend para e-mails transacionais. O plano gratuito oferece 100 e-mails por dia e 3.000 por mês. Para produção, recomenda-se um domínio verificado no Resend. Limites ou atrasos podem impedir que códigos cheguem nos dez minutos de validade.
Referência: https://resend.com/docs/introduction

## Preparação da publicação

1. Faça backup e aplique a migração aditiva 20261028000100_security_personalization pelo fluxo de migrações do projeto.
2. Execute `node --env-file=.env scripts/setup-image-storage.cjs`. O bucket montante-images deve ser privado. O script não converte bucket público existente.
3. Homologue e-mail real, cadastro, login em novo dispositivo, recuperação e upload com contas próprias de teste.
4. Publique e confira as variáveis no ambiente de produção.

Sem e-mail configurado, o novo fluxo recusa cadastro e login em dispositivo desconhecido. Não existe desvio para autenticação somente por senha. Migração e publicação não foram realizadas nesta entrega local.

## Comportamento e segurança

Login pede e-mail e senha. Se várias lojas tiverem as mesmas credenciais, a escolha aparece após validar a senha. Primeiro acesso e navegador desconhecido exigem código numérico. O cookie de dispositivo é HttpOnly e dura até 90 dias. Códigos duram dez minutos, com cinco tentativas e reenvio após 60 segundos. Tickets de sessão são descartáveis e vinculados ao navegador.

A recuperação não revela se o e-mail existe. Após verificar a caixa de e-mail, permite escolher a loja quando necessário. Trocar a senha revoga sessões e dispositivos daquela conta.

Produtos, O.S., avatar, logo e proteção de tela oferecem galeria e câmera, prévia e confirmação. O servidor valida as imagens, converte em WebP e remove metadados. Storage privado e leitura autenticada da mesma loja. URLs HTTPS antigas das O.S. continuam aceitas.

No Perfil, configure imagem e timer. No PDV, a proteção usa imagem sem distorção/corte; primeiro clique ou tecla fecha sem acionar a venda. É proteção visual, não bloqueio de autenticação.

## Testes e limites

Integração usa schema temporário PostgreSQL removido ao terminar. E-mail e Storage são simulados. Testes de navegador cobrem login/código, upload com prévia, layout móvel, inatividade e prevenção de clique na venda ao sair. TypeScript, lint e build aprovados; três avisos anteriores permanecem. APK 1.1 compilado, lint Android e assinatura verificados; câmera física ainda requer aparelho.

Envio real Resend e Storage real aguardam configuração válida do ambiente; testes simulados não comprovam entrega real.

Atualização de implantação: em 28/10/2026 a migração aditiva foi aplicada com sucesso no banco principal. Bucket privado criado e remetente verificado. As variáveis foram cadastradas pelo usuário na Vercel; presença conferida em Production. Homologação real e publicação do novo código ainda precisam ser confirmadas.

**Migração para Resend:** A integração de e-mail foi migrada do Brevo para o Resend. A variável BREVO_API_KEY deve ser substituída por RESEND_API_KEY no ambiente de produção.

Publicação confirmada em 28/10/2026: commit b0b306f, implantação DARgNLnjnA5dkgjFQqhQTL8PrN5d na Vercel montante-um2r, status Ready. Health, login e recuperação HTTP 200; media exige sessão. Envio real e upload autenticado ainda aguardam homologação; criação de conta temporária bloqueada pela revisão automática antes da execução.
