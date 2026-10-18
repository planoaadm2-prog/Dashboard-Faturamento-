# Dashboard-Faturamento-
Dashboard

## Importação do Excel financeiro

O relatório com a aba **Faturamento** deve ser enviado em **Base principal**.
Selecione a competência antes de importar: um arquivo pode conter vários meses,
mas somente o mês selecionado entra na operação.

- O total faturado vem de **Valor** e o pagamento de **Recebido**. Mensalidade,
  coparticipação, taxas e reajustes são componentes do valor e não são somados
  novamente ao total.
- Para CPF, o nome vem de **Beneficiário titular**, quando preenchido; caso
  contrário, usa **Contratante**, conforme o novo relatório. Para CNPJ, continua
  usando **Contratante**. A classificação usa **CNPJ/CPF do contratante**;
  **CPF do titular** não altera a categoria de um contrato empresarial.
- O vencimento usa **Vencimento atualizado**, depois **Vencimento** e, por
  último, **Vencimento original**. O vencimento original continua preservado
  para identificação da cobrança.
- Cobranças com status cancelado continuam fora dos indicadores. A conferência
  antes de salvar e os modos de importação permanecem obrigatórios.

Testes da leitura e da reimportação: `node --test financeiro.test.js`.

Na reimportação, alterações apenas no nome exibido não criam uma nova cobrança
sem número: os demais dados precisam corresponder, preservando cada ocorrência.
Em **Somar novas**, cobranças sem identificação suficiente que possam já existir
não são adicionadas; aparecem como aviso na conferência e a base salva é mantida.
É necessário revisar e aceitar esses avisos. Esse modo não atualiza pagamentos
existentes. Use **Somar e atualizar** para correspondências identificadas ou a
substituição conferida do mês como administrador para resolver grupos ambíguos.

## Apagar todas as importações (administrador)

Em Administração, use **Apagar todas as planilhas e dados**. A conferência mostra
a quantidade de arquivos, registros, competências e versões. Digite
**APAGAR TODOS** para confirmar. A operação remove os arquivos salvos, os dados
de todas as competências das duas origens e o histórico de importações e
restaurações. Usuários, senhas e auditoria são mantidos. Exporte um backup antes
se precisar restaurar esses dados posteriormente.

Operadores não podem executar a exclusão. A confirmação é recusada se os dados
mudarem durante a conferência. A operação é transacional e invalida conferências
de importação/restauração pendentes. Backups já exportados e planilhas no seu
computador não são apagados.

Testes: `node --test financeiro.test.js limpeza.test.mjs`.

## Abas dos componentes faturados

**Coparticipação** e **Taxa associativa** têm abas próprias com total faturado,
agrupamento por entidade e operadora e lista das cobranças. **Outros valores**
mostra mensalidade, taxas administrativas, reajustes, pró-rata, retroativos,
juros, multas, acréscimos, descontos e diferenças, com seleção para detalhamento.
Todas respeitam a competência e os filtros do painel e excluem cancelados.

Os componentes descrevem o campo **Valor**, sem alterar ou somar novamente o
faturamento total. O Excel não discrimina recebimento por componente; não é feito
rateio de recebimentos. Valores ausentes são diferentes de zero. Pró-rata e
retroativo marcados como **Sem separação** mantêm o valor combinado na coluna
correspondente. Diferenças negativas são preservadas. A exportação completa
inclui os componentes.

Dados salvos antes da atualização não possuem os componentes. Ao reimportar em
**Somar novas**, a composição ausente é preenchida se os demais dados da cobrança
coincidirem exatamente, sem alterar faturamento, recebimentos ou componentes já
informados (inclusive zero). O preenchimento exige conferência e confirmação.
Se os demais dados mudaram, use **Somar e atualizar**; grupos sem identificação
suficiente exigem substituição conferida da competência pelo administrador.
A base Hermanos continua válida e
aparece como sem informação de componentes quando seu formato não os contém.

Testes: `node --test financeiro.test.js limpeza.test.mjs componentes.test.js`.

Retenções federais confirmadas pelo administrador são apresentadas em **Outros
valores**, separadas de descontos, juros e multas. No arquivo de referência,
foram confirmadas as reduções da mensalidade de JF de Oliveira (incluindo a
grafia J F de Oliveira), Chibatão e Conselho Regional de Odontologia de Rondônia. A classificação usa o nome completo da
empresa, contrato empresarial e a correspondência exata entre a redução de
Mensalidade para Valor e a diferença negativa informada. Não presume alíquotas
e não inclui outras empresas que apenas começam com JF.

A classificação não altera o faturado, o recebido ou a composição original
armazenada. A diferença identificada como retenção deixa de compor apenas o
indicador **Diferença não identificada**. A exportação mantém uma coluna com a
diferença de composição original do Excel. O Conselho Regional de Odontologia de Rondônia foi confirmado explicitamente
pelo administrador; outros conselhos não são classificados por semelhança de nome.

## Hospedagem no Render

Veja [RENDER.md](RENDER.md) para publicar com HTTPS, disco persistente e criação
segura do administrador. O `render.yaml` configura o serviço; a publicação exige
conectar o repositório e revisar o plano pago no Render.
