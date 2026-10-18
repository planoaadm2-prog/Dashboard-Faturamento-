// All amounts are stored in cents. Components describe Valor; they never add to it.
export const COMPONENTS = [
  ['monthly', 'Mensalidade'], ['copay', 'Coparticipação'],
  ['association', 'Taxa associativa'], ['administration', 'Taxa administrativa'],
  ['annualAdjustment', 'Reajuste anual'], ['ageAdjustment', 'Reajuste por faixa etária'],
  ['prorata', 'Pró-rata'], ['retroactive', 'Inclusão retroativa'],
  ['unseparated', 'Pró-rata / retroativo sem separação'],
  ['interest', 'Juros'], ['fine', 'Multa'], ['addition', 'Acréscimo'],
  ['discount', 'Desconto'], ['federalWithholding', 'Retenção federal confirmada'],
  ['difference', 'Diferença não discriminada']
].map(([id, column]) => ({id, column,
  label: id === 'difference' ? 'Diferença não identificada' : column,
  derived: id === 'federalWithholding'}));

const normalize = value => String(value ?? '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');

export function readComponents(raw) {
  const indexed = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalize(key), value]));
  const components = {};
  for (const {id, column, derived} of COMPONENTS) {
    if (derived) continue; // This classification is not a source Excel column.
    const key = normalize(column);
    if (!(key in indexed)) continue;
    const value = indexed[key];
    let text = String(value ?? '').trim();
    if (!text || (['prorata', 'retroactive'].includes(id) && normalize(text) === 'sem separacao')) {
      components[id] = null;
      continue;
    }
    text = text.replace(/R\$|\s/g, '');
    if (/^\(.*\)$/.test(text)) text = '-' + text.slice(1, -1);
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    const number = typeof value === 'number' ? value : Number(text);
    const amount = Math.round(number * 100);
    if (!Number.isFinite(number) || !Number.isSafeInteger(amount)) {
      throw Error('Valor inválido na coluna ' + column);
    }
    components[id] = amount;
  }
  return components;
}

// Explicit business rules confirmed by the administrator. Match full company
// names, never the broad prefix "JF" (the Excel also contains another JF).
const WITHHOLDING_COMPANIES = new Set([
  'jfdeoliveira', 'jfdeoliveiranavegacaoltda',
  'chibataonavegacaoecomercioltda', 'portochibatao',
  'conselhoregionaldeodontologiaderondonia'
]);

export function federalWithholding(row) {
  if (row.source !== 'Base principal' || row.documentType !== 'CNPJ') return 0;
  const company = normalize(String(row.beneficiaryName ?? '').split('(')[0]).replace(/[^a-z0-9]/g, '');
  if (!WITHHOLDING_COMPANIES.has(company)) return 0;
  const monthly = row.components?.monthly;
  const difference = row.components?.difference;
  if (![monthly, difference, row.billed].every(Number.isSafeInteger)) return 0;
  const reduction = monthly - row.billed;
  // Do not invent percentages or attribute an unrelated composition difference.
  return reduction > 0 && difference === -reduction ? reduction : 0;
}

export function componentAmount(row, id) {
  if (id === 'federalWithholding') return row.components ? federalWithholding(row) : null;
  const reported = row.components?.[id];
  if (!Number.isSafeInteger(reported)) return null;
  return id === 'difference' ? reported + federalWithholding(row) : reported;
}

export function validateComponents(row) {
  if (row.components === undefined) return; // Existing backups remain compatible.
  const values = row.components;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('Composição inválida no backup');
  for (const [id, value] of Object.entries(values)) {
    if (!COMPONENTS.some(field => field.id === id && !field.derived) || (value !== null && !Number.isSafeInteger(value))) {
      throw Error('Valor de composição inválido no backup');
    }
  }
  if (row.compositionNote !== undefined && typeof row.compositionNote !== 'string') {
    throw Error('Observação da composição inválida no backup');
  }
}

export function componentSummary(rows, id) {
  const active = rows.filter(row => !row.cancelled && !row.cancelDate);
  const known = active.filter(row => Number.isSafeInteger(componentAmount(row, id)));
  const charged = known.filter(row => componentAmount(row, id) !== 0);
  return {total: known.reduce((sum, row) => sum + componentAmount(row, id), 0),
    count: charged.length, known: known.length, missing: active.length - known.length,
    rows: charged};
}

export function componentGroups(rows, id, field) {
  const groups = new Map();
  for (const row of componentSummary(rows, id).rows) {
    const name = row[field] || 'Não informado';
    const group = groups.get(name) || {name, total: 0, count: 0};
    group.total += componentAmount(row, id);
    group.count++;
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
}

export function componentExport(row) {
  return {...Object.fromEntries(COMPONENTS.map(({id, label}) => {
    const amount = componentAmount(row, id);
    return [label, Number.isSafeInteger(amount) ? amount / 100 : ''];
  })), 'Diferença de composição original (Excel)':
    Number.isSafeInteger(row.components?.difference) ? row.components.difference / 100 : ''};
}
