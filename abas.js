import './abas.css';

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
