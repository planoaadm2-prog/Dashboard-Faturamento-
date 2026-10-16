// Atualizador completo das abas. Execute com o servidor parado.
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const dashboard = path.join(root, 'dashboard.js');
const index = path.join(root, 'index.html');

if (!fs.existsSync(dashboard) || !fs.existsSync(index)) {
  throw new Error('Salve este atualizador dentro da pasta DashboardConvenios.');
}

const html = fs.readFileSync(index, 'utf8');

for (const id of [
  'categorySection',
  'entitiesSection',
  'operatorsSection',
  'registrationSection',
  'historySection',
  'adminSection'
]) {
  if (!html.includes(id)) {
    throw new Error('Esta pasta nao contem a versao esperada do dashboard.');
  }
}

const backup = path.join(root, '.atualizacoes', 'abas-' + Date.now());
fs.mkdirSync(backup, {recursive:true});

for (const name of [
  'dashboard.js',
  'painel-app.js',
  'abas.js',
  'abas.css'
]) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(backup, name));
  }
}

if (fs.existsSync(path.join(root, 'dist'))) {
  fs.cpSync(
    path.join(root, 'dist'),
    path.join(backup, 'dist'),
    {recursive:true}
  );
}

const moduleCode = String.raw`import './abas.css';

function iniciarAbas() {
  const app = document.getElementById('application');
  const main = app?.querySelector('main');
  const nav = app?.querySelector('.hero-nav');

  if (!main || !nav || nav.dataset.abas === 'prontas') return;

  const byId = id => document.getElementById(id);
  const source = byId('sources')?.closest('section');
  const composition = byId('composition')?.closest('section');
  const ranking = byId('bars')?.closest('section');
  const oldGrid = ranking?.parentElement;
  const overviewHeading = main.querySelector('.overview-heading');

  const definitions = [
    ['visao', 'Visão geral', [
      byId('categorySection'),
      overviewHeading,
      byId('cards'),
      source,
      composition
    ]],
    ['entidades', 'Entidades', [
      ranking,
      byId('entitiesSection')
    ]],
    ['operadoras', 'Operadoras', [
      byId('operatorsSection')
    ]],
    ['cobrancas', 'Cobranças', [
      byId('details')?.closest('section'),
      byId('namesAudit')?.closest('details')
    ]],
    ['pendencias', 'Pendências de cadastro', [
      byId('registrationSection')
    ]],
    ['historico', 'Histórico de arquivos', [
      byId('historySection')
    ]],
    ['administracao', 'Administração', [
      byId('adminSection')
    ]]
  ];

  if (definitions.some(([, , nodes]) => nodes.some(node => !node))) {
    console.error('Abas: esta versão do painel não contém todas as seções esperadas.');
    return;
  }

  nav.dataset.abas = 'prontas';
  nav.classList.add('dashboard-tabs');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Páginas do dashboard');
  nav.replaceChildren();
  app.querySelector('.hero').after(nav);

  const outlet = document.createElement('div');
  outlet.className = 'dashboard-pages';
  main.insertBefore(outlet, byId('categorySection'));

  const pages = definitions.map(([id, label, nodes]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'aba-' + id;
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'pagina-' + id);
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;

    if (id === 'administracao') {
      button.dataset.admin = '';
      button.hidden = byId('adminSection').hidden;
    }

    const panel = document.createElement('div');
    panel.id = 'pagina-' + id;
    panel.className = 'dashboard-page';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.tabIndex = 0;
    panel.hidden = true;

    for (const node of nodes) panel.append(node);

    outlet.append(panel);
    nav.append(button);

    return {id, button, panel};
  });

  if (oldGrid?.classList.contains('grid') && !oldGrid.children.length) {
    oldGrid.remove();
  }

  const totals = document.createElement('div');
  totals.className = 'tab-totals-grid';
  source.before(totals);
  totals.append(source, composition);

  const filters = main.querySelector('.filter-panel');
  const controls = document.createElement('details');
  controls.className = 'tab-controls';

  const summary = document.createElement('summary');
  const label = document.createElement('strong');
  label.textContent = 'Competência, importação e filtros';

  const period = document.createElement('span');
  summary.append(label, period);
  controls.append(summary);

  filters.before(controls);
  controls.append(filters, byId('bases'), byId('warning'));

  const updatePeriod = () => {
    period.textContent = byId('competence').value + ' · Clique para abrir';
  };

  byId('competence').addEventListener('input', updatePeriod);
  byId('competence').addEventListener('change', updatePeriod);

  const periodObserver = new MutationObserver(updatePeriod);
  periodObserver.observe(byId('periodChip'), {
    childList:true,
    characterData:true,
    subtree:true
  });

  updatePeriod();

  const aliases = {
    categorySection:'visao',
    entitiesSection:'entidades',
    operatorsSection:'operadoras',
    registrationSection:'pendencias',
    historySection:'historico',
    adminSection:'administracao'
  };

  function requestedPage() {
    let hash = '';
    try {
      hash = decodeURIComponent(location.hash.slice(1));
    } catch {}

    return aliases[hash] || hash || 'visao';
  }

  let current = '';

  function selectPage(id, options = {}) {
    const selected =
      pages.find(page => page.id === id && !page.button.hidden) ||
      pages[0];

    current = selected.id;

    for (const page of pages) {
      const active = page === selected;
      page.panel.hidden = !active;
      page.button.setAttribute('aria-selected', String(active));
      page.button.tabIndex = active ? 0 : -1;
    }

    if (options.push) {
      history.pushState(null, '', '#' + current);
    } else if (location.hash !== '#' + current) {
      history.replaceState(null, '', '#' + current);
    }

    if (options.focus) {
      selected.button.focus({preventScroll:true});
    }

    if (options.scroll) {
      const top =
        main.getBoundingClientRect().top +
        window.scrollY -
        nav.offsetHeight -
        12;

      window.scrollTo({
        top:Math.max(0, top),
        behavior:'instant'
      });

      selected.button.scrollIntoView({
        block:'nearest',
        inline:'nearest',
        behavior:'instant'
      });
    }
  }

  for (const page of pages) {
    page.button.addEventListener('click', () => {
      selectPage(page.id, {
        push:current !== page.id,
        scroll:true
      });
    });

    page.button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        return;
      }

      event.preventDefault();

      const available = pages.filter(item => !item.button.hidden);
      const index = available.indexOf(page);

      const next =
        event.key === 'Home'
          ? available[0]
          : event.key === 'End'
            ? available.at(-1)
            : available[
                (
                  index +
                  (event.key === 'ArrowRight' ? 1 : -1) +
                  available.length
                ) % available.length
              ];

      selectPage(next.id, {
        push:current !== next.id,
        focus:true,
        scroll:true
      });
    });
  }

  const adminPage = pages.find(page => page.id === 'administracao');

  const permissions = new MutationObserver(() => {
    adminPage.button.hidden = byId('adminSection').hidden;

    if (current === 'administracao' && adminPage.button.hidden) {
      selectPage('visao');
    }
  });

  permissions.observe(byId('adminSection'), {
    attributes:true,
    attributeFilter:['hidden']
  });

  window.addEventListener('popstate', () => {
    selectPage(requestedPage(), {scroll:true});
  });

  window.addEventListener('hashchange', () => {
    selectPage(requestedPage(), {scroll:true});
  });

  selectPage(requestedPage());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarAbas, {once:true});
} else {
  iniciarAbas();
}
`;

const cssCode = String.raw`
.hero:has(+ .dashboard-tabs) {
  padding-bottom:24px;
}

.hero-nav.dashboard-tabs {
  position:sticky;
  top:0;
  z-index:25;
  display:flex;
  gap:6px;
  margin:0;
  padding:8px max(16px,calc((100% - 1456px)/2));
  background:#173b50;
  box-shadow:0 3px 12px #102b4018;
  overflow-x:auto;
  white-space:nowrap;
  scrollbar-width:thin;
}

.dashboard-tabs button {
  flex:0 0 auto;
  width:auto;
  min-height:42px;
  padding:11px 16px;
  border:1px solid transparent;
  border-radius:9px;
  background:transparent;
  color:#c3d7e1;
  font-size:12px;
  font-weight:600;
  box-shadow:none;
}

.dashboard-tabs button:hover {
  background:#ffffff12;
  color:white;
}

.dashboard-tabs button[aria-selected=true] {
  background:#e2f6f0;
  border-color:#8ad5c3;
  color:#10564d;
}

.dashboard-tabs button:focus-visible {
  outline-color:#8ce2d0;
  outline-offset:-3px;
}

.dashboard-page[hidden] {
  display:none!important;
}

.dashboard-page:not([hidden]) {
  display:grid;
  gap:18px;
  min-width:0;
  animation:tab-enter .18s ease-out;
}

.dashboard-page>.panel,
.dashboard-page>.category-section,
.dashboard-page>.cards,
.dashboard-page>.gap {
  margin-top:0;
  margin-bottom:0;
}

.dashboard-page>.overview-heading {
  margin-top:6px;
}

.tab-totals-grid {
  display:grid;
  grid-template-columns:minmax(0,1.7fr) minmax(270px,1fr);
  gap:18px;
  align-items:start;
  min-width:0;
}

.tab-controls {
  border:1px solid #dce5ef;
  border-radius:14px;
  background:#fff;
  margin-bottom:14px;
  overflow:hidden;
}

.tab-controls>summary {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:center;
  flex-wrap:wrap;
  padding:17px 20px;
  cursor:pointer;
  list-style:none;
  color:#1a4357;
}

.tab-controls>summary::-webkit-details-marker {
  display:none;
}

.tab-controls>summary strong {
  font-size:14px;
}

.tab-controls>summary span {
  font-size:12px;
  color:#647b90;
}

.tab-controls[open]>summary {
  border-bottom:1px solid #e5ebf3;
}

.tab-controls>.filter-panel {
  border:0;
  box-shadow:none;
  margin:0;
  border-radius:0;
}

.tab-controls>.notice {
  margin:0 20px 14px;
}

@keyframes tab-enter {
  from {
    opacity:.5;
    transform:translateY(4px);
  }
  to {
    opacity:1;
    transform:translateY(0);
  }
}

@media(max-width:900px) {
  .tab-totals-grid {
    grid-template-columns:minmax(0,1fr);
  }
}

@media(max-width:600px) {
  .hero-nav.dashboard-tabs {
    padding:7px 10px;
  }
  .dashboard-tabs button {
    padding:10px 12px;
  }
  .tab-controls>summary {
    padding:15px;
  }
  .tab-controls>.filter-panel {
    padding:16px;
  }
}

@media(prefers-reduced-motion:reduce) {
  .dashboard-page:not([hidden]) {
    animation:none;
  }
}
`;

fs.writeFileSync(path.join(root, 'abas.js'), moduleCode, 'utf8');
fs.writeFileSync(path.join(root, 'abas.css'), cssCode, 'utf8');

for (const name of ['dashboard.js','painel-app.js']) {
  const file = path.join(root, name);

  if (!fs.existsSync(file)) continue;

  let code = fs.readFileSync(file, 'utf8');

  if (!/import\s*['"]\.\/abas\.js['"]/.test(code)) {
    code += "\nimport './abas.js';\n";
    fs.writeFileSync(file, code, 'utf8');
  }
}

console.log('Abas instaladas. Backup do codigo: ' + backup);
console.log('Agora execute npm.cmd run build e depois npm.cmd start.');