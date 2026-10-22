# Contas salvas no login

O login permite manter várias combinações de loja e e-mail no navegador. A lista mostra o nome da loja, identificador e e-mail. É possível entrar com outra conta, remover um atalho ou limpar todos. Nenhuma dessas ações exclui lojas/usuários do banco.

Marcar **Salvar esta conta neste computador** grava os dados somente após autenticação bem-sucedida. O nome na lista é um apelido opcional, sem alterar o nome da loja no banco. O registro antigo `montante.login` é migrado para `montante.login.accounts.v1`. A última conta usada é restaurada sem sobrescrever preenchimento prévio do navegador.

## Senhas

Senhas não são gravadas no localStorage, nos atalhos de teste ou em arquivos. O gerenciador do navegador recebe a senha após login bem-sucedido, se a opção de salvar estiver marcada. A identidade da credencial inclui loja e e-mail para separar lojas que usam o mesmo e-mail.

Ao selecionar um atalho, navegadores compatíveis podem abrir o seletor de credenciais. O botão **Preencher senha salva** permite tentar novamente. A aplicação só aceita uma credencial identificada para a combinação selecionada, sem iniciar login automaticamente. Credenciais antigas que identificam apenas o e-mail precisam ser salvas novamente após digitar a senha. Em navegadores sem suporte a PasswordCredential, permanece disponível o preenchimento nativo/manual. A aceitação e a disponibilidade do salvamento dependem do navegador.

Remover um atalho não remove a senha do cofre do navegador: essa exclusão é feita nas configurações do próprio navegador.

## Atalhos das lojas de teste

`LOGIN_TEST_ACCOUNTS` em `.env.local` pode conter um JSON com uma lista de objetos `{ "tenantName": "Loja de teste", "tenantSlug": "loja-teste", "email": "teste@example.com" }`. Não adicionar senhas a essa variável e não usar prefixo `NEXT_PUBLIC_`.

A página só fornece esses atalhos quando NODE_ENV é development e o host é localhost, 127.0.0.1 ou [::1]. Não consulta nem lista lojas do banco na página pública de login. Produção nunca recebe essa lista inicial, mesmo se a variável estiver configurada. Os atalhos de desenvolvimento são importados uma única vez por navegador/origem; uma lista esvaziada pelo usuário continua vazia após recarregar.

Os atalhos locais foram preenchidos a partir de uma consulta de leitura às lojas ativas e aos e-mails de seus responsáveis/administradores. Nenhum cadastro ou senha foi alterado. Contas salvas em localhost não são transferidas automaticamente para o domínio de produção.

## Verificação

`node --test tests/saved-login-accounts.test.cjs` cobre separação por loja, migração, exclusão persistente, entradas corrompidas, indisponibilidade do armazenamento e bloqueio dos atalhos locais em produção. Esses testes também integram `npm test`.
