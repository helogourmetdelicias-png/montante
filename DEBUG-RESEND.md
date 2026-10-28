# Debug - Resend não está funcionando

## Passo 1: Verificar variáveis no Vercel

Acesse: Settings → Environment Variables

Confirme:
- [ ] `RESEND_API_KEY` existe e começa com `re_`
- [ ] `AUTH_EMAIL_FROM` existe (ex: onboarding@resend.dev)
- [ ] `BREVO_API_KEY` foi DELETADA
- [ ] Todas marcadas para Production, Preview, Development

## Passo 2: Verificar Deploy

Acesse: Deployments

Confirme:
- [ ] O último deploy está com status "Ready"
- [ ] Não há erros vermelhos
- [ ] O commit mais recente foi deployado

## Passo 3: Verificar Logs em Tempo Real

1. Acesse a aba "Deployments"
2. Clique no deployment "Ready"
3. Clique na aba "Logs" ou "Runtime Logs"
4. Tente criar uma conta no site
5. Veja se aparece algum erro nos logs

## Passo 4: Testar API do Resend Diretamente

Para ter certeza que sua chave está válida:

1. Acesse: https://resend.com/api-keys
2. Veja se a chave está "Active"
3. Se necessário, gere uma nova chave
4. Atualize no Vercel
5. Faça redeploy

## Passo 5: Verificar Formato do E-mail

O formato correto é:
```
onboarding@resend.dev
```

NÃO use:
- ❌ "Montante <onboarding@resend.dev>"
- ❌ '<onboarding@resend.dev>'
- ❌ Espaços antes ou depois

## Passo 6: Se nada funcionar

Compartilhe:
1. Screenshot da página de Environment Variables (pode borrar os valores)
2. Screenshot do erro que aparece
3. Status do último deployment
4. Mensagem de erro exata que aparece

## Checklist de Sintaxe

Copie e cole no Vercel EXATAMENTE assim:

**Nome da variável:**
```
RESEND_API_KEY
```

**Valor:** (sua chave, algo como)
```
re_abcd1234_xxxxxxxxxxxxxxxxxxxxxxx
```

**Nome da variável:**
```
AUTH_EMAIL_FROM
```

**Valor:**
```
onboarding@resend.dev
```

⚠️ **IMPORTANTE**: Não adicione aspas, espaços ou caracteres extras!
