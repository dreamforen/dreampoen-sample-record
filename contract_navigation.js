/* DREAMFOREN · contract ledger and original-form writing share one route. */
(function () {
  'use strict';
  const KEY = 'dreampoen_contract_tab_v1203725';
  const valid = tab => tab === 'documents' ? 'documents' : 'ledger';
  const views = {contract:'dfViewContract','sales-quotes':'dfViewSalesQuotes','sales-statements':'dfViewSalesStatements','sales-letters':'dfViewSalesLetters','sales-prices':'dfViewSalesPrices','sales-history':'dfViewSalesHistory','sales-settings':'dfViewSalesSettings'};
  const currentRoute = () => window.DF_NAVIGATION_GUARD?.getActive() || history.state?.dfRoute || location.hash.slice(1);
  const shown = element => !!element && !element.hidden && element.style.display !== 'none';
  const view = () => document.getElementById('dfViewContract');
  const visible = () => shown(view());
  const activeTab = () => shown(document.getElementById('dfcdPage')) ? 'documents' : 'ledger';
  let restoring = false, historyMode = 'push', queued = false, wasVisible = false;
  function clearStaleView() {
    const current = currentRoute();
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
  function select(tab, options) {
    const writer = window.DF_CONTRACT_WRITER;
    if (writer?.selectTab) return writer.selectTab(valid(tab), options || {});
    return window.dfContractDocumentsSelectTab?.(valid(tab));
  }
  function allowedContract() {
    try {
      const legacy = typeof dfCloudProfile !== 'undefined' && String(dfCloudProfile?.role || '').toLowerCase() === 'admin';
      if (typeof dfMenuCan === 'function') return dfMenuCan('contract','view',legacy) === true;
      if (window.DFMenuPermissions?.can) return window.DFMenuPermissions.can('contract','view',legacy) === true;
      return legacy;
    } catch (_) { return false; }
  }
  function applyGroupVisibility(group) {
    let checked=false, anyAllowed=false;
    group.querySelectorAll('.df-nav-item[data-view]').forEach(button => {
      let allowed=null;
      try {
        const legacy=typeof dfCloudProfile!=='undefined' && String(dfCloudProfile?.role||'').toLowerCase()==='admin';
        if(button.dataset.view==='sales-letters')allowed=window.DFMenuPermissions?.isAdmin?.()??legacy;
        else if(typeof dfMenuCan==='function')allowed=dfMenuCan(button.dataset.view,'view',legacy)===true;
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
      const desired = valid(tab);
      if (activeTab() !== desired) select(desired,{history:false,restore:true});
      save(desired);paint(desired);
    } finally { restoring = false; }
  }
  function sync() {
    queued = false;
    const on = visible();
    if (on) {
      const desired = !wasVisible ? valid(history.state?.dfContractTab || history.state?.dfScreen?.tab || remembered()) : activeTab();
      // Repainting never reopens an already visible editor or resets its draft.
      if (!wasVisible && desired !== activeTab()) restore(desired);
      else paint(activeTab());
    } else paint(remembered());
    wasVisible = on;
  }
  function queueSync() {
    clearStaleView();
    if (!queued) { queued = true; requestAnimationFrame(sync); }
  }
  function maySwitchWithoutGuard() {
    if (activeTab() !== 'documents') return true;
    const navigation=window.DF_CONTRACT_WRITER?.navigation;
    return navigation?.canLeave?.() !== false && navigation?.confirmLeave?.() !== false;
  }
  function navigate(tab) {
    if (!allowedContract()) return false;
    const desired=valid(tab), entered=!visible();
    if (!entered && desired===activeTab()) {paint(desired);return true;}
    historyMode = entered ? 'replace' : 'push';
    try {
      const guard=window.DF_NAVIGATION_GUARD;
      if (!entered && guard?.navigate) {
        // Run the current controller's permission/unsaved checks without its
        // legacy view hook, which used to schedule a second reopen.
        if (guard.navigate('contract',{history:false,restore:true}) === false) return false;
      } else {
        if (!entered && !maySwitchWithoutGuard()) return false;
        if (entered) {
          const router=window.v62ShowOnly,route=router?._dfV12037192Base || router;
          if (route?.call(window,'contract') === false || !visible()) return false;
        }
      }
      const result=select(desired,{history:false,restore:false});
      if (result === false) return false;
      save(desired);paint(desired);return true;
    } finally {historyMode='push';}
  }
  function init() {
    const group = document.getElementById('dfContractNav');
    if (!group || group.dataset.contractNavigationReady) return;
    group.dataset.contractNavigationReady = '1';
    window.dfContractNavigate = navigate;
    document.addEventListener('df:menu-permissions-changed', queueSync);
    window.addEventListener('click', event => {
      const button = event.target.closest?.('[data-dfcd-nav]');
      if (!button || !group.contains(button)) return;
      event.preventDefault();event.stopPropagation();navigate(button.dataset.dfcdNav);
    }, true);
    window.addEventListener('df-contract-documents-tab-change', event => {
      const tab=valid(event.detail?.tab);save(tab);paint(tab);
      if (restoring || !visible()) return;
      if (window.DF_NAVIGATION_GUARD) {window.DF_NAVIGATION_GUARD.changed({replace:historyMode==='replace'});return;}
      try {
        const state={...(history.state||{}),dfRoute:'contract',dfContractTab:tab};
        if(historyMode==='replace'||history.state?.dfContractTab===tab)history.replaceState(state,'','#contract');
        else history.pushState(state,'','#contract');
      } catch (_) { /* page works without history storage */ }
    });
    window.addEventListener('popstate', event => {
      if ((event.state?.dfRoute || location.hash.slice(1))==='contract')restore(event.state?.dfContractTab || event.state?.dfScreen?.tab || remembered());
      queueSync();
    });
    const observer=new MutationObserver(queueSync);
    Object.values(views).forEach(id=>{const element=document.getElementById(id);if(element)observer.observe(element,{attributes:true,attributeFilter:['hidden','style','class']});});
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
