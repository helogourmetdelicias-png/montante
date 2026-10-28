# Como Configurar o Resend para Envio de E-mails

Este guia explica como criar e configurar sua conta no Resend para o envio de códigos OTP (autenticação de dois fatores) no sistema Montante.

## 📋 Pré-requisitos

- Uma conta de e-mail válida
- (Recomendado para produção) Um domínio próprio

## 🚀 Passo a Passo

### 1. Criar Conta no Resend

1. Acesse [resend.com](https://resend.com)
2. Clique em **Sign Up** (Cadastrar)
3. Preencha os dados solicitados ou faça login com GitHub
4. Confirme seu e-mail

### 2. Obter a API Key

1. Após fazer login, vá para o [Dashboard](https://resend.com/home)
2. No menu lateral, clique em **API Keys**
3. Clique em **Create API Key**
4. Preencha:
   - **Name**: `Montante Production` (ou nome de sua preferência)
   - **Permission**: Selecione "Sending access"
   - **Domain**: Selecione o domínio (ou "All Domains" para começar)
5. Clique em **Add**
6. **IMPORTANTE**: Copie a chave API gerada - ela só será exibida uma vez!
   - Formato: `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 3. Configurar Domínio de Envio (Recomendado para Produção)

#### Opção A: Usando Domínio Próprio (Recomendado)

1. No menu lateral, clique em **Domains**
2. Clique em **Add Domain**
3. Digite seu domínio (exemplo: `seudominio.com.br`)
4. Siga as instruções para adicionar os registros DNS:
   - **SPF** (Sender Policy Framework)
   - **DKIM** (DomainKeys Identified Mail)
   - **DMARC** (Domain-based Message Authentication)
5. Aguarde a verificação (pode levar até 72 horas, mas geralmente é rápido)
6. Use o endereço: `onboarding@seudominio.com.br` ou `noreply@seudominio.com.br`

#### Opção B: Usando Domínio do Resend (Apenas para Testes)

Para desenvolvimento/teste, você pode usar o domínio compartilhado do Resend:
- E-mail: `onboarding@resend.dev`
- **ATENÇÃO**: Este domínio tem limitações e não é recomendado para produção!

### 4. Configurar Variáveis de Ambiente

#### No Vercel (Produção)

1. Acesse seu projeto no [Vercel Dashboard](https://vercel.com)
2. Vá em **Settings** → **Environment Variables**
3. **REMOVER** a variável antiga:
   - Delete `BREVO_API_KEY`
4. **ADICIONAR** as novas variáveis:

   **RESEND_API_KEY**
   - Value: `re_sua_chave_aqui`
   - Environment: `Production`, `Preview`, `Development`
   
   **AUTH_EMAIL_FROM**
   - Value: `onboarding@seudominio.com.br` (ou `onboarding@resend.dev` para testes)
   - Environment: `Production`, `Preview`, `Development`

5. Clique em **Save**
6. **IMPORTANTE**: Faça um novo deploy do projeto para aplicar as mudanças

#### Localmente (.env)

Crie ou atualize o arquivo `.env` na raiz do projeto:

```bash
# Resend (substitui Brevo)
RESEND_API_KEY=re_sua_chave_aqui
AUTH_EMAIL_FROM=onboarding@seudominio.com.br

# Outras variáveis necessárias
AUTH_SECRET=seu_secret_aqui
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_aqui
DATABASE_URL=postgresql://...
```

**NUNCA** commite o arquivo `.env` no git!

### 5. Verificar a Instalação

Execute o build do projeto para verificar se está tudo correto:

```bash
npm install
npm run build
```

## 📊 Limites do Plano Gratuito

O Resend oferece no plano gratuito:

- **100 e-mails por dia**
- **3.000 e-mails por mês**
- 1 domínio personalizado
- API completa

Para produção com alto volume, considere upgrading para um plano pago.

## 🔍 Testando o Envio

Você pode testar o envio criando uma nova conta no sistema ou solicitando recuperação de senha. O código de 6 dígitos deve chegar em até 1 minuto.

### Troubleshooting

Se o e-mail não chegar:

1. **Verifique o spam/lixo eletrônico**
2. **Confira as variáveis de ambiente** no Vercel
3. **Verifique os logs do Resend**:
   - Acesse [Logs](https://resend.com/logs) no dashboard
   - Veja se o e-mail foi enviado com sucesso
4. **Domínio não verificado**: Se usar domínio próprio, aguarde a verificação DNS
5. **Limite excedido**: Verifique se não ultrapassou os limites do plano

## 📚 Recursos Adicionais

- [Documentação Oficial do Resend](https://resend.com/docs)
- [Guia de Verificação de Domínio](https://resend.com/docs/dashboard/domains/introduction)
- [API Reference](https://resend.com/docs/api-reference/introduction)
- [Status do Serviço](https://status.resend.com)

## ⚠️ Segurança

- **NUNCA** compartilhe sua API Key
- **NUNCA** commite a API Key no repositório
- **SEMPRE** use variáveis de ambiente
- **SEMPRE** revogue chaves antigas ao gerar novas
- Use domínio verificado em produção para melhor entregabilidade

## 🔄 Migrando do Brevo

Se você já tinha o Brevo configurado:

1. ✅ Instale o pacote `resend`: Já incluído no package.json
2. ✅ Configure a API Key do Resend (passos acima)
3. ✅ Remova `BREVO_API_KEY` do Vercel
4. ✅ Faça deploy da nova versão
5. ⚠️ Teste o envio de e-mails em staging primeiro
6. ✅ Libere para produção

---

**Dúvidas?** Consulte a [documentação oficial](https://resend.com/docs) ou abra uma issue no repositório.
