import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMPONENTS, readComponents, validateComponents, componentSummary, componentGroups, componentExport, federalWithholding, componentAmount} from './componentes.js';
import {parseRows, summary} from './financeiro.js';
import {planImport, validateRows} from './historico.js';

const raw = overrides => ({Contrato: 'TESTE', Referência: '01/10/2026',
  Contratante: 'Nome fictício', Valor: 150, Recebido: 90, Status: 'Emitido',
  'Nosso número': 'COBRANCA-TESTE', Mensalidade: 100, Coparticipação: 40,
  'Taxa associativa': 10, ...overrides});

test('import persists component amounts without changing billed or received', () => {
  const [row] = parseRows([raw()], 'Base principal');
  assert.equal(row.components.copay, 4000);
  assert.equal(row.components.association, 1000);
  assert.equal(row.components.monthly, 10000);
  assert.equal(summary([row], 'exclude').billed, 15000);
  assert.equal(summary([row], 'exclude').received, 9000);
});

test('zero, missing and unseparated amounts remain distinct; combined amount is retained', () => {
  const values = readComponents({'Coparticipação': 0, 'Taxa associativa': '',
    'Pró-rata': 'Sem separação', 'Inclusão retroativa': 'Sem separação',
    'Pró-rata / retroativo sem separação': 'R$ 15,30'});
  assert.equal(values.copay, 0);
  assert.equal(values.association, null);
  assert.equal(values.prorata, null);
  assert.equal(values.retroactive, null);
  assert.equal(values.unseparated, 1530);
  assert.equal('monthly' in values, false);
});

test('signed adjustments and monetary strings are parsed; invalid amounts block import', () => {
  assert.equal(readComponents({'Diferença não discriminada': '-10,25'}).difference, -1025);
  assert.equal(readComponents({'Diferença não discriminada': '(1.234,56)'}).difference, -123456);
  assert.equal(readComponents({'Taxa associativa': 'R$\u00a01.200,50'}).association, 120050);
  for (const value of ['abc', Infinity, NaN, Number.MAX_VALUE]) {
    assert.throws(() => readComponents({'Coparticipação': value}), /Valor inválido/);
  }
});

test('summaries exclude cancelled charges and distinguish old records from zero values', () => {
  const rows = [
    {components: {copay: 1000}, entity: 'A', operator: 'X'},
    {components: {copay: 2000}, entity: 'A', operator: 'Y'},
    {components: {copay: 0}, entity: 'B'},
    {}, {components: {copay: null}},
    {components: {copay: 9999}, cancelled: true},
    {components: {copay: 9999}, cancelDate: '2026-10-16'}
  ];
  const stats = componentSummary(rows, 'copay');
  assert.equal(stats.total, 3000);
  assert.equal(stats.count, 2);
  assert.equal(stats.known, 3);
  assert.equal(stats.missing, 2);
  assert.deepEqual(componentGroups(rows, 'copay', 'entity'), [{name: 'A', total: 3000, count: 2}]);
  assert.deepEqual(componentGroups(rows, 'copay', 'operator').map(g => g.name), ['Y', 'X']);
});

test('export writes component amounts in reais and missing values as blank', () => {
  const values = componentExport({components: {copay: 1234, association: 0, prorata: null}});
  assert.equal(values['Coparticipação'], 12.34);
  assert.equal(values['Taxa associativa'], 0);
  assert.equal(values['Pró-rata'], '');
  assert.equal(Object.keys(values).length, COMPONENTS.length + 1);
});

test('old backups are valid, but malformed component values are rejected', () => {
  validateComponents({});
  validateComponents({components: {difference: -500, copay: 0, prorata: null}});
  for (const components of [null, [], {copay: '10'}, {copay: 1.2}, {unknown: 0}]) {
    assert.throws(() => validateComponents({components}));
  }
});

test('reimport can fill old records without duplicating unnumbered charges', () => {
  const incoming = parseRows([raw({'Nosso número': ''}), raw({'Nosso número': '', Valor: 160})], 'Base principal');
  const old = planImport([], incoming, 'replace').rows.map(({components, compositionNote, ...row}) => row);
  const refreshed = planImport(old, incoming, 'update');
  assert.deepEqual(refreshed.errors, []);
  assert.equal(refreshed.rows.length, 2);
  assert.equal(componentSummary(refreshed.rows, 'copay').total, 8000);
  assert.deepEqual(summary(refreshed.rows, 'exclude'), summary(old, 'exclude'));
  validateRows(refreshed.rows, '2026-10', 'Base principal');
  const again = planImport(refreshed.rows, incoming, 'update');
  assert.deepEqual(again.errors, []);
  assert.equal(again.stats.unchanged, 2);
});

test('Somar novas fills absent components on identical existing charges', () => {
  const incoming = parseRows([raw(), raw({'Nosso número': '', Contrato: 'SEM-NUMERO'})], 'Base principal');
  const old = planImport([], incoming, 'replace').rows.map(({components, compositionNote, ...row}) => row);
  const before = structuredClone(old);
  const plan = planImport(old, incoming, 'add');
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.stats.componentBackfills, 2);
  assert.equal(plan.requiresAck, true);
  assert.equal(plan.rows.length, 2);
  assert.equal(componentSummary(plan.rows, 'copay').total, 8000);
  assert.equal(componentSummary(plan.rows, 'association').total, 2000);
  assert.deepEqual(summary(plan.rows, 'exclude'), summary(old, 'exclude'));
  assert.deepEqual(plan.rows.map(r => r._key), old.map(r => r._key));
  assert.deepEqual(old, before);
  const repeated = planImport(plan.rows, incoming, 'add');
  assert.equal(repeated.stats.componentBackfills, 0);
  assert.equal(repeated.stats.unchanged, 2);
});

test('Somar novas never overwrites known components, including zero', () => {
  const [incoming] = parseRows([raw()], 'Base principal');
  const old = planImport([], [incoming], 'replace').rows;
  old[0].components = {copay: 0, association: 500, monthly: null};
  const plan = planImport(old, [incoming], 'add');
  assert.equal(plan.rows[0].components.copay, 0);
  assert.equal(plan.rows[0].components.association, 500);
  assert.equal(plan.rows[0].components.monthly, 10000);
  assert.equal(plan.stats.componentBackfills, 1);
});

test('Somar novas does not backfill components when other charge data changed', () => {
  const [incoming] = parseRows([raw()], 'Base principal');
  const old = planImport([], [incoming], 'replace').rows.map(({components, compositionNote, ...row}) => row);
  for (const changed of [{...incoming, billed: 20000}, {...incoming, received: 10000}, {...incoming, cancelled: true}]) {
    const plan = planImport(old, [changed], 'add');
    assert.equal(plan.stats.componentBackfills, 0);
    assert.deepEqual(plan.rows, old);
  }
});

const retainedCompany = (name, overrides = {}) => ({
  source: 'Base principal', documentType: 'CNPJ', beneficiaryName: name,
  billed: 95000, received: 95000,
  components: {monthly: 100000, difference: -5000, interest: 0, fine: 0, discount: 0},
  ...overrides
});

test('confirmed JF, Chibatão and Odontologia reductions are shown as federal withholding', () => {
  for (const name of [
    'JF DE OLIVEIRA (JF DE OLIVEIRA NAVEGACAO LTDA)',
    'J F DE OLIVEIRA (J F DE OLIVEIRA NAVEGACAO LTDA)',
    'CHIBATÃO NAVEGAÇÃO E COMÉRCIO LTDA (PORTO CHIBATAO)',
    'CONSELHO REGIONAL DE ODONTOLOGIA DE RONDÔNIA'
  ]) {
    const row = retainedCompany(name);
    const original = JSON.stringify(row);
    assert.equal(federalWithholding(row), 5000);
    assert.equal(componentAmount(row, 'federalWithholding'), 5000);
    assert.equal(componentAmount(row, 'difference'), 0);
    assert.equal(componentAmount(row, 'interest'), 0);
    assert.equal(componentAmount(row, 'fine'), 0);
    assert.equal(componentAmount(row, 'discount'), 0);
    assert.equal(JSON.stringify(row), original);
  }
});

test('other JF companies and unconfirmed councils stay unclassified', () => {
  for (const name of ['JF CORTINAS E PERSIANAS LTDA', 'ASSER RO',
    'CONSELHO REGIONAL DE MEDICINA DE RONDONIA',
    'CONSELHO REGIONAL DE ODONTOLOGIA DE OUTRO ESTADO']) {
    const row = retainedCompany(name);
    assert.equal(federalWithholding(row), 0);
    assert.equal(componentAmount(row, 'difference'), -5000);
  }
});

test('no rates are assumed and absent or mismatched reductions are not classified', () => {
  const name = 'JF DE OLIVEIRA';
  const row = retainedCompany(name, {billed: 93123, components: {monthly: 100000, difference: -6877}});
  assert.equal(federalWithholding(row), 6877);
  for (const changed of [
    {billed: 100000}, {components: {monthly: 100000, difference: -4999}},
    {components: {difference: -5000}}, {components: undefined},
    {source: 'Hermanos'}, {documentType: 'CPF'}
  ]) assert.equal(federalWithholding(retainedCompany(name, changed)), 0);
});

test('withholding summaries exclude cancelled charges and export retains the source difference', () => {
  const row = retainedCompany('JF DE OLIVEIRA');
  const rows = [row, {...row, cancelled: true}];
  assert.equal(componentSummary(rows, 'federalWithholding').total, 5000);
  assert.equal(componentSummary(rows, 'difference').total, 0);
  const exported = componentExport(row);
  assert.equal(exported['Retenção federal confirmada'], 50);
  assert.equal(exported['Diferença não identificada'], 0);
  assert.equal(exported['Diferença de composição original (Excel)'], -50);
});
