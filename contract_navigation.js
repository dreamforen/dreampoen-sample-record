/* DREAMFOREN v120.37.25.0 · 계약관리 하위 메뉴 */
(function () {
  'use strict';
  const KEY = 'dreampoen_contract_tab_v1203725';
  const valid = value => value === 'documents' ? 'documents' : 'ledger';
  let restoring = false;
  let historyMode = 'push';
  let queued = false;
  const view = () => document.getElementById('dfViewContract');
  const visible = () => !!view() && !view().hidden && view().style.display !== 'none';
  function clearStaleView() {
    const current = history.state?.dfRoute || location.hash.slice(1);
    if (current && current !== 'contract' && visible()) {
      view().hidden = true;
      view().classList.remove('df-view-active');
      view().style.setProperty('display', 'none', 'important');
      view().setAttribute('aria-hidden', 'true');
    }
  }
  function remembered() {
    try { return valid(sessionStorage.getItem(KEY)); } catch (_) { return 'ledger'; }
  }
  function save(tab) {
    try { sessionStorage.setItem(KEY, valid(tab)); } catch (_) { /* storage optional */ }
  }
  function paint(tab) {
    const group = document.getElementById('dfContractNav');
    if (!group) return;
    const active = visible();
    group.querySelectorAll('[data-dfcd-nav]').forEach(button => {
      const selected = active && button.dataset.dfcdNav === tab;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    group.querySelector('[data-menu-toggle]')?.classList.toggle('active', active);
    if (active) {
      group.classList.add('open');
      group.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded', 'true');
    }
  }
  function restore(tab) {
    restoring = true;
    try {
      window.dfContractDocumentsSelectTab?.(valid(tab));
      save(tab);
      paint(valid(tab));
    } finally { restoring = false; }
  }
  function sync() {
    queued = false;
    if (visible()) {
      const tab = valid(history.state?.dfContractTab || remembered());
      const docs = document.getElementById('dfcdPage');
      if (docs && (!docs.hidden) !== (tab === 'documents')) restore(tab);
      else paint(tab);
    } else paint(remembered());
  }
  function queueSync() {
    clearStaleView();
    if (!queued) { queued = true; requestAnimationFrame(sync); }
  }
  function navigate(tab) {
    const entered = !visible();
    historyMode = entered ? 'replace' : 'push';
    const router = window.v62ShowOnly;
    // The legacy safety wrapper schedules an unconditional re-open after 240 ms.
    // Use its original, permission-checking router for this known existing view.
    const route = router?._dfV12037192Base || router;
    route?.call(window, 'contract');
    if (visible()) window.dfContractDocumentsSelectTab?.(valid(tab));
    historyMode = 'push';
  }
  function init() {
    const group = document.getElementById('dfContractNav');
    if (!group || group.dataset.contractNavigationReady) return;
    group.dataset.contractNavigationReady = '1';
    window.dfContractNavigate = navigate;
    // Scoped window capture runs before legacy document-level navigation handlers.
    window.addEventListener('click', event => {
      const button = event.target.closest?.('[data-dfcd-nav]');
      if (!button || !group.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      navigate(button.dataset.dfcdNav);
    }, true);
    window.addEventListener('df-contract-documents-tab-change', event => {
      const tab = valid(event.detail?.tab);
      save(tab);
      paint(tab);
      if (restoring || !visible()) return;
      try {
        const state = { ...(history.state || {}), dfRoute: 'contract', dfContractTab: tab };
        if (historyMode === 'replace' || history.state?.dfContractTab === tab)
          history.replaceState(state, '', '#contract');
        else history.pushState(state, '', '#contract');
      } catch (_) { /* page works without history storage */ }
    });
    window.addEventListener('popstate', event => {
      if ((event.state?.dfRoute || location.hash.slice(1)) === 'contract') {
        restore(event.state?.dfContractTab || remembered());
      }
      queueSync();
    });
    if (view()) new MutationObserver(queueSync).observe(view(), {
      attributes: true, attributeFilter: ['hidden', 'style', 'class']
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
