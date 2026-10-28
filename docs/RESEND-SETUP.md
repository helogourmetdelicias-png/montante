# Recuperação de senha com Resend

O login e o cadastro não enviam códigos. O Resend é usado somente por Esqueci minha senha.

Configure no ambiente de servidor:

- RESEND_API_KEY: chave da API Resend com permissão para enviar e-mails.
- AUTH_EMAIL_FROM: endereço de um remetente/domínio autorizado no Resend.

Não compartilhe valores das chaves no chat, em capturas de tela, logs ou arquivos versionados. As variáveis são opcionais para login/cadastro, mas necessárias para recuperação. Novas variáveis na Vercel exigem redeploy para serem utilizadas pela aplicação.

A recuperação usa código aleatório de seis números com validade de dez minutos, limite de tentativas e reenvio. Não revela se um e-mail está cadastrado. O código deve ser validado antes de escolher a loja e definir a nova senha. Não há código fixo nem flag de bypass. O serviço utiliza fetch para a API HTTP; não precisa instalar o SDK Resend.
