const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

function patchScanner(original) {
  const marker = '// HERMANOS_RESUMO_LINHAS_V2';

  if (original.includes(marker)) {
    return original;
  }

  let code = original;

  function change(pattern, replacement, label) {
    const matches = [
      ...code.matchAll(new RegExp(pattern.source, 'g'))
    ];

    if (matches.length !== 1) {
      throw Error(
        'Não reconheci o trecho: ' + label +
        '. Nenhum arquivo foi substituído.'
      );
    }

    code = code.replace(pattern, replacement);
  }

  change(
    /\bseen\s*=\s*new Set\(\)/,
    'seen = new Map()',
    'controle de linhas'
  );

  change(
    /if\s*\(seen\.has\(([\s\S]*?)\)\)\s*(?:\{\s*)?throw Error\([\s\S]*?\);\s*(?:\}\s*)?seen\.add\(([\s\S]*?)\);/,
    (match, expression, repeatedExpression) => {
      if (
        expression.replace(/\s/g, '') !==
        repeatedExpression.replace(/\s/g, '')
      ) {
        throw Error(
          'Controle de repetição diferente do esperado. ' +
          'Arquivo preservado.'
        );
      }

      return (
        'const occurrenceKey = ' + expression + ';\n' +
        'const occurrence = (seen.get(occurrenceKey) || 0) + 1;\n' +
        'seen.set(occurrenceKey, occurrence);'
      );
    },
    'bloqueio por nome repetido'
  );

  change(
    /(['"])N° Cobrança\/Documento\1\s*:\s*identifier\b/,
    "'N° Cobrança/Documento': identifier + '-' + occurrence",
    'identificador de cada linha'
  );

  change(
    /row\.reportFormat\s*=\s*FORMAT\s*;/,
    'row.reportFormat = FORMAT;\n' +
    'row.summaryRepeated = occurrence > 1;',
    'informação sobre linhas repetidas'
  );

  change(
    /const\s+mixesFormats\s*=/,
    [
      'if (summarized) {',
      "  if (mode !== 'replace') {",
      "    errors.push('Este relatório é um resumo sem identificador individual de cobrança. Selecione Substituir mês desta origem como administrador para importar o relatório completo sem acumular versões.');",
      '  }',
      '  const repetitions = selected.filter(row => row.summaryRepeated).length;',
      "  notes.unshift('Todas as linhas válidas do resumo serão preservadas, inclusive nomes e valores repetidos. Não é possível distinguir cobranças diferentes de duplicações reais apenas por nome, entidade e operadora. Confira o total com o relatório de origem.');",
      '  if (repetitions) {',
      "    notes.push(repetitions + ' linhas adicionais com nome, entidade e operadora repetidos foram preservadas e precisam de conferência.');",
      '  }',
      '}',
      'const mixesFormats ='
    ].join('\n'),
    'conferência de substituição do resumo'
  );

  return marker + '\n' + code;
}

const target = path.join(__dirname, 'scanner.mjs');
let temporary;

try {
  if (!fs.existsSync(target)) {
    throw Error(
      'Salve este atualizador na mesma pasta do scanner.mjs.'
    );
  }

  const original = fs.readFileSync(target, 'utf8');
  const updated = patchScanner(original);

  if (updated === original) {
    console.log('Esta correção já foi aplicada.');
  } else {
    temporary = path.join(
      __dirname,
      'scanner-verificacao-' + Date.now() + '.mjs'
    );

    fs.writeFileSync(temporary, updated, 'utf8');

    const check = spawnSync(
      process.execPath,
      ['--check', temporary],
      {stdio: 'inherit'}
    );

    if (check.error || check.status !== 0) {
      throw Error(
        'A verificação de sintaxe falhou. Original preservado.'
      );
    }

    const backup = path.join(
      __dirname,
      '.atualizacoes',
      'resumo-linhas-' + Date.now()
    );

    fs.mkdirSync(backup, {recursive: true});
    fs.copyFileSync(target, path.join(backup, 'scanner.mjs'));
    fs.renameSync(temporary, target);
    temporary = undefined;

    console.log('Correção aplicada.');
    console.log('Backup: ' + backup);
    console.log(
      'Reinicie o servidor e importe o resumo usando ' +
      'Substituir mês desta origem.'
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary && fs.existsSync(temporary)) {
    fs.unlinkSync(temporary);
  }
}