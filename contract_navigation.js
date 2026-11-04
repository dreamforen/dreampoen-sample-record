/* DREAMFOREN Beta 3.9.5 · 계약현황·영업문서 하위 메뉴 */
(function () {
  'use strict';
  const KEY = 'dreampoen_contract_tab_v1203725';
  const valid = () => 'ledger';
  const views = {contract:'dfViewContract','sales-quotes':'dfViewSalesQuotes','sales-statements':'dfViewSalesStatements','sales-prices':'dfViewSalesPrices','sales-history':'dfViewSalesHistory','sales-settings':'dfViewSalesSettings'};
  const currentRoute = () => window.DF_NAVIGATION_GUARD?.getActive() || history.state?.dfRoute || location.hash.slice(1);
  const shown = element => !!element && !element.hidden && element.style.display !== 'none';
  let restoring = false;
  let historyMode = 'push';
  let queued = false;
  const view = () => document.getElementById('dfViewContract');
  const visible = () => shown(view());
  function clearStaleView() {
    // history.state changes before popstate. Use the router's committed view
    // so competing observers cannot repeatedly hide/show the contract page.
    const current = window.DF_NAVIGATION_GUARD?.getActive() || history.state?.dfRoute || location.hash.slice(1);
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
  function applyGroupVisibility(group) {
    let checked=false, anyAllowed=false;
    group.querySelectorAll('.df-nav-item[data-view]').forEach(button => {
      let allowed=null;
      try {
        const legacy=typeof dfCloudProfile!=='undefined' && String(dfCloudProfile?.role||'').toLowerCase()==='admin';
        if(typeof dfMenuCan==='function')allowed=dfMenuCan(button.dataset.view,'view',legacy)===true;
        else if(window.DFMenuPermissions?.can)allowed=window.DFMenuPermissions.can(button.dataset.view,'view',legacy)===true;
      } catch (_) { allowed=false; }
      if(allowed===null)return;
      checked=true;button.hidden=!allowed;anyAllowed=anyAllowed||allowed;
    });
    if(checked)group.hidden=!anyAllowed;
  }
  function paint(tab) {
    const group = document.getElementById('dfContractNav');
    if (!group) return;
    applyGroupVisibility(group);
    const route = currentRoute(), active = Object.prototype.hasOwnProperty.call(views, route) && shown(document.getElementById(views[route]));
    group.querySelectorAll('.df-nav-item[data-view]').forEach(button => {
      const selected = active && button.dataset.view === route && (!button.hasAttribute('data-dfcd-nav') || button.dataset.dfcdNav === valid(tab));
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
      if (docs && !docs.hidden) restore(tab);
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
    save('ledger');
    document.addEventListener('df:menu-permissions-changed', queueSync);
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
      if(window.DF_NAVIGATION_GUARD){window.DF_NAVIGATION_GUARD.changed({replace:historyMode==='replace'});return;}
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
    const observer = new MutationObserver(queueSync);
    Object.values(views).forEach(id => { const element=document.getElementById(id);if(element)observer.observe(element, {
      attributes: true, attributeFilter: ['hidden', 'style', 'class']
    }); });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
