# Publicar o dashboard no Render

Esta configuração cria um Web Service Node.js com HTTPS e disco persistente para
SQLite e arquivos importados. O plano Starter e o disco são pagos; confira os
valores apresentados pelo Render antes de confirmar. Este repositório não
contrata nem publica um serviço automaticamente.

## 1. Enviar o código atualizado ao GitHub

O Render precisa receber a aplicação inteira, incluindo as alterações de leitura
do Excel, novas abas, `componentes.js`, `componentes-ui.js`, `limpeza.mjs`,
`limpeza-ui.js`, `server-config.mjs` e `render.yaml`. Envie os arquivos atualizados
para a raiz do repositório `planoaadm2-prog/Dashboard-Faturamento-`, na branch
`main`. Só enviar o `render.yaml` não envia as alterações feitas neste ambiente.

Não envie `.data`, bancos SQLite, planilhas, backups ou senhas ao GitHub. O
`.gitignore` protege arquivos ainda não rastreados; não remove arquivos que já
estejam versionados.

## 2. Criar o serviço

1. Acesse https://dashboard.render.com e conecte sua conta do GitHub.
2. Crie um Blueprint a partir desse repositório, usando o arquivo `render.yaml`.
3. Revise o Web Service Starter e o disco de 1 GB em `/var/data` antes de confirmar.
4. Inicie o deploy e acompanhe os logs até a conclusão.
5. Abra o endereço HTTPS fornecido pelo Render, terminado em `.onrender.com`.

O build executa `npm ci --no-audit --no-fund` e `npm run build`; o servidor inicia
com `npm start`. Não use Static Site: o aplicativo precisa executar Node.js.

As dependências vêm de `registry.npmjs.org` e `cdn.sheetjs.com`. Se a instalação
falhar, consulte a mensagem concreta dos logs; não desative TLS ou a verificação
de integridade. O teste de saúde configurado é `/api/health`, que deve retornar
HTTP 200 e `{"ok":true}`.

## 3. Cadastrar o administrador

Na aba Shell do serviço já iniciado no Render, execute:

```bash
npm run setup-admin
```

Escolha seu usuário, nome e senha no terminal interativo. A senha não deve ser
colocada no GitHub, nos comandos de build ou neste documento. Se o administrador
já existir no banco persistente, não tente criá-lo novamente.

Em seguida, entre pelo endereço HTTPS do serviço. Operadores podem ser criados na
aba Administração do dashboard.

## 4. Trazer os dados do computador

O novo serviço começa com um banco vazio: publicar o código não copia a `.data`
do computador. Antes de mudar de instalação, baixe o backup pelo painel antigo.
No novo painel, entre como administrador e restaure o backup com conferência.
Esse backup transfere dados, versões e arquivos, mas não transfere usuários e
senhas; recrie os operadores no novo painel. Preserve sua instalação antiga até
verificar a restauração e as importações no endereço HTTPS.

Se precisar preservar também as contas existentes, uma migração completa do
SQLite precisa ser planejada separadamente, com o servidor antigo parado.
Não envie o banco ao GitHub.

## Persistência e atualizações

- `DASHBOARD_DATA_DIR=/var/data/dashboard` mantém o banco no disco persistente.
  Não altere essa pasta nem remova o disco sem backup.
- Use uma única instância com SQLite. Não troque o plano por um que não permita
  disco persistente.
- Cookies usam `Secure`. O servidor escuta `0.0.0.0` e a porta `PORT` do Render.
- O endereço HTTPS do Render é usado para validar a origem das operações.
  Se configurar domínio próprio, defina `DASHBOARD_PUBLIC_ORIGIN` com a origem
  HTTPS exata, como `https://financeiro.suaempresa.com.br`, sem caminho.
- Deploy automático está desativado. Depois de atualizar o GitHub, faça deploy
  manual no Render. A reinicialização deve manter o banco e as contas no disco.
- O disco preserva dados entre deploys, mas não substitui backups externos.

## Verificação após o deploy

Confirme a página de login, acesso administrativo, restrição dos operadores,
importação com conferência, coparticipação e exportação de backup. Faça um deploy
manual e verifique novamente se os dados e usuários continuam disponíveis.
Essas verificações no Render dependem da criação do serviço e não foram
executadas apenas por preparar os arquivos neste repositório.
