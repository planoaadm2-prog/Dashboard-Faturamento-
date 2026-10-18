import {COMPONENTS, componentSummary, componentGroups, componentAmount, federalWithholding} from './componentes.js';

const money = value => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(value / 100);
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function table(headers, rows) {
  const scroll = node('div', undefined, 'scroll');
  const table = node('table');
  const head = node('thead');
  const heading = node('tr');
  headers.forEach(label => heading.append(node('th', label)));
  head.append(heading);
  const body = node('tbody');
  for (const values of rows) {
    const tr = node('tr');
    values.forEach(value => tr.append(node('td', value)));
    body.append(tr);
  }
  if (!rows.length) {
    const td = node('td', 'Nenhum lançamento neste filtro.');
    td.colSpan = headers.length;
    const tr = node('tr'); tr.append(td); body.append(tr);
  }
  table.append(head, body); scroll.append(table);
  return scroll;
}

function renderPrimary(container, rows, id, label, period) {
  if (!container) return;
  const stats = componentSummary(rows, id);
  container.replaceChildren(node('h2', label + ' faturada'));
  container.append(node('p', `${period}. Mesmos filtros do painel; cancelados excluídos. Valores faturados, sem rateio do recebido.`, 'hint'));
  const cards = node('div', undefined, 'cards');
  for (const [title, value, hint] of [
    ['Total faturado de ' + label.toLowerCase(), stats.known ? money(stats.total) : 'Não informado', 'Já faz parte do total da cobrança.'],
    ['Cobranças com lançamento', String(stats.count), 'Uma cobrança pode conter mais de um componente.'],
    ['Sem informação deste componente', String(stats.missing), 'Dados antigos ou de outra origem podem não trazer esta coluna.']
  ]) {
    const card = node('div', undefined, 'card');
    card.append(node('span', title), node('strong', value), node('small', hint));
    cards.append(card);
  }
  container.append(cards);
  if (stats.missing) container.append(node('p', 'Reimporte em Somar novas para preencher componentes ausentes de cobranças com os demais dados iguais. Para alterar valores já informados, use Somar e atualizar. Identificações ambíguas exigem conferência pelo administrador.', 'notice'));
  for (const [field, title] of [['entity', 'Por entidade'], ['operator', 'Por operadora']]) {
    container.append(node('h3', title), table(['Nome', 'Cobranças', label],
      componentGroups(rows, id, field).map(group => [group.name, group.count, money(group.total)])));
  }
  container.append(node('h3', 'Lançamentos'), table(
    ['Nome faturado', 'Contrato', 'Título', 'Competência', 'Entidade', 'Operadora', label],
    stats.rows.map(row => [row.beneficiaryName, row.contract, row.title, row.reference.slice(0, 7), row.entity, row.operator, money(componentAmount(row, id))])
  ));
}

export function renderComponents(rows, period) {
  renderPrimary(document.getElementById('copaySection'), rows, 'copay', 'Coparticipação', period);
  renderPrimary(document.getElementById('associationSection'), rows, 'association', 'Taxa associativa', period);
  const other = document.getElementById('otherComponentsSection');
  if (!other) return;
  other.replaceChildren(node('h2', 'Outros valores do Excel'));
  other.append(node('p', `${period}. Componentes faturados das cobranças ativas, conforme os filtros. Não são somados novamente ao faturamento. Descontos são exibidos como informados; diferenças podem ser negativas.`, 'hint'));
  const remaining = COMPONENTS.filter(field => !['copay', 'association'].includes(field.id));
  other.append(table(['Componente', 'Total informado', 'Cobranças com valor', 'Sem informação'], remaining.map(({id, label}) => {
    const stats = componentSummary(rows, id);
    return [label, stats.known ? money(stats.total) : 'Não informado', stats.count, stats.missing];
  })));
  const selector = node('select');
  const label = node('label', 'Detalhar componente');
  for (const field of remaining) {
    const option = node('option', field.label); option.value = field.id; selector.append(option);
  }
  const previous = other.dataset.component;
  if (remaining.some(field => field.id === previous)) selector.value = previous;
  const detail = node('div');
  const update = () => {
    other.dataset.component = selector.value;
    const field = remaining.find(field => field.id === selector.value);
    detail.replaceChildren(table(['Nome faturado', 'Contrato', 'Entidade', 'Operadora', field.label, 'Observação'],
      componentSummary(rows, field.id).rows.map(row => [row.beneficiaryName, row.contract, row.entity, row.operator, money(componentAmount(row, field.id)),
        [row.compositionNote || '', federalWithholding(row) ? `Retenção federal confirmada: ${money(federalWithholding(row))}. Diferença original no Excel: ${money(row.components.difference)}.` : ''].filter(Boolean).join(' ')])));
  };
  selector.onchange = update; label.append(selector); other.append(label, detail); update();
  other.append(node('p', '“Sem separação” em pró-rata ou inclusão retroativa não é zero: o valor combinado aparece em Pró-rata / retroativo sem separação. Componentes ausentes nas importações antigas exigem nova importação.', 'notice'));
  other.append(node('p', 'Retenções federais confirmadas de JF de Oliveira, Chibatão e Conselho Regional de Odontologia de Rondônia são apresentadas separadamente e retiradas apenas da diferença não identificada. Não alteram o total faturado nem o recebido. A diferença original do Excel continua preservada e aparece na exportação.', 'notice'));
}
