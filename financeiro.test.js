import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRows, summary} from './financeiro.js';
import {planImport} from './historico.js';

// Synthetic data only; never commit customer spreadsheets or documents.
const current = (overrides = {}) => ({
  Contrato: 'CONTRATO-TESTE', Referência: '01/10/2026',
  Contratante: 'Pessoa de teste', 'CNPJ/CPF do contratante': '000.000.000-00',
  'CPF do titular': '111.111.111-11', Entidade: 'ALASE',
  Vencimento: '15/10/2026', 'Vencimento original': '10/10/2026',
  'Vencimento atualizado': '20/10/2026',
  Valor: 150, Recebido: 100, Custo: 80, Mensalidade: 100,
  Coparticipação: 20, 'Taxa associativa': 30,
  Status: 'Emitido', 'Nosso número': 'COBRANCA-TESTE', ...overrides
});
const parse = raw => parseRows([raw], 'Base principal')[0];

test('new export uses Contratante for CPF and preserves authoritative totals', () => {
  const row = parse(current());
  assert.equal(row.beneficiaryName, 'Pessoa de teste');
  assert.equal(row.nameField, 'Contratante');
  assert.equal(row.contractCategory, 'Adesão');
  assert.equal(row.reference, '2026-10-01');
  assert.equal(row.due, '2026-10-20');
  assert.equal(row.originalDue, '2026-10-10');
  assert.equal(row.billed, 15000);
  assert.equal(row.received, 10000);
  assert.equal(row.cost, 8000);
});

test('old beneficiary column takes precedence and blank values fall back', () => {
  const old = parse(current({'Beneficiário titular': 'Titular de teste'}));
  assert.equal(old.beneficiaryName, 'Titular de teste');
  assert.equal(old.nameField, 'Beneficiário titular');
  assert.equal(parse(current({'Beneficiário titular': '  '})).nameField, 'Contratante');
});

test('company classification uses contractor CNPJ even with a holder CPF', () => {
  const row = parse(current({'CNPJ/CPF do contratante': '00.000.000/0000-00'}));
  assert.equal(row.contractCategory, 'Empresarial');
  assert.equal(row.beneficiaryName, 'Pessoa de teste');
  assert.equal(row.nameField, 'Contratante');
});

test('due date falls back to Vencimento, then original due date', () => {
  assert.equal(parse(current({'Vencimento atualizado': ''})).due, '2026-10-15');
  assert.equal(parse(current({'Vencimento atualizado': '', Vencimento: ''})).due, '2026-10-10');
});

test('cancelled charges stay excluded; repeated imports do not add receipts', () => {
  const rows = parseRows([
    current(), current({'Nosso número': 'CANCELADA', Status: 'Cancelado'})
  ], 'Base principal');
  assert.equal(summary(rows, 'exclude').billed, 15000);
  const initial = planImport([], rows, 'replace');
  const repeated = planImport(initial.rows, rows, 'update');
  assert.deepEqual(repeated.errors, []);
  assert.equal(repeated.stats.unchanged, 2);
  assert.equal(repeated.rows.length, 2);
  assert.equal(summary(repeated.rows, 'exclude').received, 10000);
});

test('Hermanos detailed import keeps its original mapping', () => {
  const row = parseRows([{
    Contrato: 'H-TESTE', Empresa: 'ALASE', 'Mês/Ano': '10/2026',
    'Valor da Fatura': 200, 'Valor Pago': 50, Cliente: 'Cliente de teste',
    CPF: '000.000.000-00', 'Vencimento atual': '20/10/2026'
  }], 'Hermanos')[0];
  assert.equal(row.beneficiaryName, 'Cliente de teste');
  assert.equal(row.nameField, 'Cliente');
  assert.equal(row.billed, 20000);
  assert.equal(row.due, '2026-10-20');
});

test('old unnumbered imports can be refreshed when only beneficiary metadata changed', () => {
  const incoming = [parse(current({'Nosso número': '', Valor: 150})),
    parse(current({'Nosso número': '', Valor: 175}))];
  const old = planImport([], incoming, 'replace').rows.map(row => ({
    ...row, beneficiaryName: 'Não informado', nameField: 'Beneficiário titular'
  }));
  for (const mode of ['add', 'update']) {
    const plan = planImport(old, incoming, mode);
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.rows.length, 2);
    assert.deepEqual(summary(plan.rows, 'exclude'), summary(old, 'exclude'));
    assert.deepEqual(plan.rows.map(row => row._key), old.map(row => row._key));
    assert.equal(plan.requiresAck, true);
    if (mode === 'update') {
      assert.ok(plan.rows.every(row => row.beneficiaryName === 'Pessoa de teste'));
    }
    const repeated = planImport(plan.rows, incoming, mode);
    assert.deepEqual(repeated.errors, []);
    assert.equal(repeated.rows.length, 2);
  }
});

test('identical unnumbered charges are paired one to one, without losing occurrences', () => {
  const incoming = [parse(current({'Nosso número': ''})), parse(current({'Nosso número': ''}))];
  const old = planImport([], incoming, 'replace').rows.map(row => ({
    ...row, beneficiaryName: 'Não informado', nameField: 'Beneficiário titular'
  }));
  const plan = planImport(old, incoming, 'update');
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.rows.length, 2);
  assert.equal(new Set(plan.rows.map(row => row._key)).size, 2);
  assert.equal(plan.stats.updated, 2);
});

test('ambiguous amount changes or occurrence counts still require explicit resolution', () => {
  const incoming = [parse(current({'Nosso número': ''})), parse(current({'Nosso número': ''}))];
  const old = planImport([], incoming, 'replace').rows;
  const changed = incoming.map(row => ({...row, received: row.received + 500}));
  assert.ok(planImport(old, changed, 'update').errors.length > 0);
  assert.ok(planImport(old, incoming.slice(0, 1), 'update').errors.length > 0);
});

test('Somar novas preserves ambiguous existing charges and allows safe new charges', () => {
  const repeated = [parse(current({'Nosso número': ''})), parse(current({'Nosso número': ''}))];
  const old = planImport([], repeated, 'replace').rows;
  const changed = {...repeated[0], received: 12000};
  const newRow = parse(current({Contrato: 'NOVO', 'Nosso número': 'NOVA', Valor: 20, Recebido: 5}));
  const plan = planImport(old, [changed, newRow], 'add');
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.requiresAck, true);
  assert.equal(plan.stats.added, 1);
  assert.equal(plan.stats.kept, 1);
  assert.equal(plan.stats.conflicts, 1);
  assert.deepEqual(plan.rows.slice(0, 2), old);
  assert.equal(summary(plan.rows, 'exclude').received, 20500);
  assert.ok(plan.notes.some(note => note.includes('Não importada em Somar novas')));
});
