// HERMANOS_RESUMO_LINHAS_V2
import XLSX from 'xlsx';
import {createHash} from 'node:crypto';
import {
  parseRows, summary, clean, key, cents, iso
} from './financeiro.js';
import {
  monthValid, planImport, copy
} from './historico.js';

const FORMAT = 'hermanos-resumo-v1';

const header = value => key(value)
  .replace(/\s*\/\s*/g, '/')
  .replace(/\s+/g, ' ');

const indexed = raw => Object.fromEntries(
  Object.entries(raw).map(([name, value]) => [header(name), value])
);

function isSummary(data) {
  return data.some(raw => {
    const row = indexed(raw);
    return 'beneficiario/empresa' in row ||
      'saldo a receber ajustado' in row;
  });
}

function signedCents(value) {
  const text = clean(value);

  if (!text) {
    throw Error('Saldo a receber ajustado vazio');
  }

  if (typeof value === 'number') {
    return Math.round(value * 100);
  }

  if (text.startsWith('-')) {
    return -cents(text.slice(1));
  }

  if (/^\(.*\)$/.test(text)) {
    return -cents(text.slice(1, -1));
  }

  return cents(value);
}

export function parseSummary(data, month) {
  const required = [
    'beneficiario/empresa',
    'faturamento',
    'recebido',
    'saldo a receber ajustado',
    'operadora',
    'entidade/grupo'
  ];

  const rows = [];
  const invalid = [];
  const seen = new Map();
  let skipped = 0;

  data.forEach((raw, index) => {
    try {
      const x = indexed(raw);
      const line = index + 2;

      for (const field of required) {
        if (!(field in x)) {
          throw Error('Coluna ausente no resumo: ' + field);
        }
      }

      const name = clean(x['beneficiario/empresa']);

      const emptyFinancials = [
        'faturamento',
        'recebido',
        'saldo a receber ajustado'
      ].every(field => !clean(x[field]));

      if (!name && emptyFinancials) {
        skipped++;
        return;
      }

      const totalNames = [
        'total', 'total geral', 'totais', 'subtotal'
      ];

      if (
        totalNames.includes(key(name)) &&
        !clean(x.operadora) &&
        !clean(x['entidade/grupo'])
      ) {
        skipped++;
        return;
      }

      if (!name) {
        throw Error('Beneficiário / Empresa vazio');
      }

      if (!clean(x.faturamento) || !clean(x.recebido)) {
        throw Error('Faturamento ou Recebido vazio');
      }

      const billed = cents(x.faturamento);
      const received = cents(x.recebido);
      const balance = signedCents(x['saldo a receber ajustado']);

      if (!Number.isSafeInteger(balance)) {
        throw Error('Saldo inválido');
      }

      const difference = billed - received;

      if (
        balance !== difference &&
        balance !== Math.max(0, difference)
      ) {
        throw Error(
          'Saldo ajustado diferente de Faturamento menos Recebido. ' +
          'Conferir ajustes antes de importar'
        );
      }

      const identity = JSON.stringify([
        key(name).replace(/\s+/g, ' '),
        key(x['entidade/grupo']).replace(/\s+/g, ' '),
        key(x.operadora).replace(/\s+/g, ' ')
      ]);

      const period =
        x.competencia || x['mes/ano'] || x.referencia || '';

      const reference = clean(period)
        ? iso(period, true)
        : month + '-01';

      const identifier = 'RESUMO-' + createHash('sha256')
        .update(identity)
        .digest('hex');

      const uniqueKey = reference.slice(0, 7) + '|' + identifier;

      const occurrenceKey = uniqueKey;
const occurrence = (seen.get(occurrenceKey) || 0) + 1;
seen.set(occurrenceKey, occurrence);

      const document =
        x['cnpj/cpf'] || x['cpf/cnpj'] || x.cpf || x.cnpj || '';

      const row = parseRows([{
        Contrato: identifier,
        Empresa: x['entidade/grupo'],
        CPF: document,
        Cliente: name,
        'Mês/Ano': reference,
        'Valor da Fatura': x.faturamento,
        'Valor Pago': x.recebido,
        Operadora: x.operadora,
        'N° Cobrança/Documento': identifier + '-' + occurrence
      }], 'Hermanos')[0];

      row.reference = reference;
      row.reportMonthAssigned = !clean(period);

      // Identificador técnico: não representa um contrato real.
      row.contract = '';
      row.title = 'Resumo';
      row.sourceLine = line;
      row.reportFormat = FORMAT;
row.summaryRepeated = occurrence > 1;
      row.reportedAdjustedBalance = balance;

      row.pendingReason = [
        row.pendingReason,
        !clean(x.operadora)
          ? 'Operadora ausente no resumo. Conferir cadastro.'
          : '',
        !document
          ? 'Documento não informado: conferir classificação empresarial/adesão.'
          : ''
      ].filter(Boolean).join(' ');

      rows.push(row);
    } catch (error) {
      invalid.push({
        line: index + 2,
        message: error.message.replace(/^Linha 2: /, '')
      });
    }
  });

  return {rows, invalid, skipped};
}

export function scanWorkbook(
  bytes,
  source,
  month,
  mode,
  existing = []
) {
  if (!monthValid(month)) {
    throw Error(
      'Selecione mês e ano da competência antes de importar'
    );
  }

  const workbook = XLSX.read(bytes, {
    type: 'buffer',
    cellDates: true
  });

  if (!workbook.SheetNames.length) {
    throw Error('Arquivo sem abas');
  }

  const sheet = workbook.SheetNames[0];

  const data = XLSX.utils.sheet_to_json(
    workbook.Sheets[sheet],
    {defval: ''}
  );

  if (!data.length) {
    throw Error('A primeira aba está vazia');
  }

  const summarized = isSummary(data);

  if (summarized && source !== 'Hermanos') {
    throw Error(
      'Este resumo deve ser importado no campo Hermanos'
    );
  }

  let parsed = [];
  let invalid = [];
  let skipped = 0;

  if (summarized) {
    const result = parseSummary(data, month);
    parsed = result.rows;
    invalid = result.invalid;
    skipped = result.skipped;
  } else {
    data.forEach((raw, index) => {
      try {
        const row = parseRows([raw], source)[0];
        row.sourceLine = index + 2;
        parsed.push(row);
      } catch (error) {
        invalid.push({
          line: index + 2,
          message: error.message.replace(/^Linha 2: /, '')
        });
      }
    });
  }

  const months = new Map();

  for (const row of parsed) {
    const foundMonth = row.reference.slice(0, 7);
    months.set(
      foundMonth,
      (months.get(foundMonth) || 0) + 1
    );
  }

  const selected = parsed.filter(
    row => row.reference.slice(0, 7) === month
  );

  const outside = parsed.filter(
    row => row.reference.slice(0, 7) !== month
  );

  const plan = planImport(existing, selected, mode);

  const errors = [
    ...invalid.map(
      error => 'Linha ' + error.line + ': ' + error.message
    ),
    ...plan.errors
  ];

  const notes = [...plan.notes];

  if (!selected.length) {
    errors.push(
      'Nenhum registro válido pertence à competência selecionada. ' +
      'Confira o formato e o mês escolhido.'
    );
  }

  if (summarized) {
  if (mode !== 'replace') {
    errors.push('Este relatório é um resumo sem identificador individual de cobrança. Selecione Substituir mês desta origem como administrador para importar o relatório completo sem acumular versões.');
  }
  const repetitions = selected.filter(row => row.summaryRepeated).length;
  notes.unshift('Todas as linhas válidas do resumo serão preservadas, inclusive nomes e valores repetidos. Não é possível distinguir cobranças diferentes de duplicações reais apenas por nome, entidade e operadora. Confira o total com o relatório de origem.');
  if (repetitions) {
    notes.push(repetitions + ' linhas adicionais com nome, entidade e operadora repetidos foram preservadas e precisam de conferência.');
  }
}
const mixesFormats = existing.some(
    row => (row.reportFormat === FORMAT) !== summarized
  );

  if (mixesFormats && mode !== 'replace') {
    errors.push(
      'Este mês da Hermanos já contém outro formato de relatório. ' +
      'Somar resumo e detalhamento pode duplicar valores. ' +
      'Para trocar a base, o administrador deve selecionar ' +
      'Substituir mês desta origem e conferir os totais.'
    );
  }

  if (summarized) {
    const assigned = parsed.filter(
      row => row.reportMonthAssigned
    ).length;

    if (assigned) {
      notes.unshift(
        assigned + ' linhas sem competência no arquivo recebem o mês ' +
        month + '. Confirme esse mês antes de salvar.'
      );
    }

    notes.push(
      'Cada linha é um resumo de beneficiário/empresa. ' +
      'A quantidade de linhas não representa necessariamente ' +
      'a quantidade de cobranças individuais.'
    );

    notes.push(
      'O resumo não informa contrato, vencimento ou cancelamento. ' +
      'Não é possível verificar esses dados; cobranças canceladas ' +
      'devem estar excluídas do arquivo de origem.'
    );

    notes.push(
      'Identificação técnica por nome + entidade + operadora; ' +
      'não é número de contrato. Confira homônimos e mudanças de nomes. ' +
      'Para relatório completo atualizado, prefira a substituição ' +
      'conferida do mês pelo administrador.'
    );

    notes.push(
      'Sem CPF/CNPJ, o tipo empresarial/adesão pode ficar ' +
      'Não classificado. Não se deduz documento pelo nome.'
    );

    if (skipped) {
      notes.push(
        skipped +
        ' linhas vazias ou totais identificados foram ignoradas.'
      );
    }
  }

  return {
    sheet,
    scannedCount: data.length,
    validCount: parsed.length,
    selectedCount: selected.length,
    outsideCount: outside.length,
    months: [...months].map(([month, count]) => ({
      month,
      count
    })),
    invalid,
    rows: selected,
    outsideRows: outside,
    pending: selected.filter(row => row.pendingReason),
    plan: {
      ...plan,
      errors,
      notes,
      requiresAck:
        plan.requiresAck || summarized || mixesFormats
    },
    before: summary(existing, 'exclude'),
    incoming: summary(selected, 'exclude'),
    after: summary(plan.rows, 'exclude')
  };
}

export function importResult(state, stage, actor, fileId) {
  const next = copy(state);
  const bucket = stage.bucketKey;
  const at = new Date().toISOString();

  const before = copy(next.buckets[bucket] || null);

  const files = [
    ...new Set([
      ...(before?.files || []),
      stage.filename
    ])
  ];

  const after = {
    month: stage.month,
    source: stage.source,
    rows: copy(stage.scan.plan.rows),
    files,
    updatedAt: at
  };

  next.buckets[bucket] = after;

  next.history.push({
    id: crypto.randomUUID(),
    at,
    label: 'Importar arquivo',
    scope: 'bucket',
    month: stage.month,
    source: stage.source,
    actor,
    filename: stage.filename,
    mode: stage.mode,
    fileId,
    stats: stage.scan.plan.stats,
    before,
    after: copy(after),
    incomingRows: copy(stage.scan.rows),
    outsideCount: stage.scan.outsideCount,
    scannedCount: stage.scan.scannedCount
  });

  return next;
}