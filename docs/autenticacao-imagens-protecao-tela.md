# Autenticação, imagens e proteção de tela

## Estado atual

Login e cadastro funcionam sem verificação por código. O login valida e-mail e senha antes de identificar a loja; se houver várias contas com as mesmas credenciais, solicita a escolha. O acesso à sessão continua usando ticket descartável vinculado ao navegador. Permissões de loja e administração geral são revalidadas no servidor.

O Resend permanece somente para recuperação de senha. Configure RESEND_API_KEY e AUTH_EMAIL_FROM no servidor para habilitar esse recurso. A ausência dessas variáveis não impede login ou cadastro. Não existe código fixo de recuperação nem flag DISABLE_2FA no fluxo ativo. A troca de senha invalida sessões antigas e registros legados de dispositivos.

Removidos a rota pública /api/test-env, logs de prefixo de chave/endereço do remetente, arquivos temporários de debug/redeploy e o SDK de e-mail desnecessário. O envio de recuperação utiliza a API HTTP do Resend. Guias de Brevo e instruções antigas de migração não são requisitos do login atual.

## Imagens e identidade visual

NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para Storage. A chave de servidor nunca deve ter prefixo NEXT_PUBLIC. O bucket montante-images é privado, com limite de 3 MB e arquivos WebP validados e convertidos pelo servidor. O script scripts/setup-image-storage.cjs prepara o bucket quando necessário.

Galeria e câmera oferecem prévia e confirmação em produtos, O.S., foto de perfil, logo e proteção de tela. A logo da loja salva no Perfil aparece no cabeçalho do PDV, no menu e no painel principal da administração, sem distorção ou corte. A leitura das imagens privadas exige sessão da mesma loja. Imagem indisponível usa ícone de reserva. Salvar imagens avisa os componentes de identidade visual da página.

A proteção de tela no PDV preserva a venda e retorna no primeiro clique/tecla. O timer e a imagem são persistidos por loja. A proteção é visual, não bloqueio de autenticação.

## Banco e histórico

As migrações de segurança, imagens e administração já aplicadas são preservadas. Não apagar migrações históricas nem tabelas usadas por tickets, recuperação, limite de tentativas ou invalidação de registros legados. Esta limpeza não exclui contas ou dados e não requer nova migração.
