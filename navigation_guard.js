/* DREAMPOEN v120.37.27.0 · Single active application view.
 * Load last. Retains existing view hooks and filter restoration, while excluding
 * the obsolete unversioned 80/240ms route retry wrapper. No business data writes.
 */
(function (window, document) {
  'use strict';
  if (window.DF_NAVIGATION_GUARD) return;
  var routes = {
    home:'dfViewHome', approval:'dfViewApproval', employees:'dfViewEmployees',
    contract:'dfViewContract', bid:'dfViewBid', billing:'dfViewBilling',
    'sales-quotes':'dfViewSalesQuotes', 'sales-statements':'dfViewSalesStatements',
    'sales-prices':'dfViewSalesPrices', 'sales-history':'dfViewSalesHistory', 'sales-settings':'dfViewSalesSettings',
    company:'dfViewCompany', schedule:'dfViewSchedule', 'schedule-add':'dfViewScheduleAdd', progress:'dfViewProgress',
    navigation:'dfViewNavigation', repository:'dfViewRepository', sample:'dfViewSample',
    'lab-hub':'dfViewLabHub', analysis:'dfViewAnalysis', 'filter-ledger':'dfViewFilterLedger',
    quality:'dfViewQuality', 'quality-manual':'dfViewQualityManual', organization:'dfViewOrganization', 'doc-hub':'dfViewDocHub',
    'measurement-reports':'dfViewMeasurementReports', 'halfyear-reports':'dfViewHalfYearReports',
    'measurement-methods':'dfViewMeasurementMethods'
  };
  var permissions = {
    analysis:'lab_analysis', 'lab-hub':'lab_hub', 'filter-ledger':'filter_ledger',
    'schedule-add':'schedule', 'quality-manual':'quality_manual',
    'measurement-reports':'repository', 'halfyear-reports':'repository', 'measurement-methods':'repository'
  };
  var adminRoutes = ['employees','contract','bid','sales-quotes','sales-statements','sales-prices','sales-history','sales-settings'];
  var active = '', generation = 0, baseRouter = null, initialized = false, scheduled = false;
  var observer = null, routeDepth = 0, pendingInitialRoute = '';
  try { pendingInitialRoute=window.location.hash.slice(1)||sessionStorage.getItem('dreampoen_current_view_v1101')||''; } catch (_) {}
  function by(id) { return document.getElementById(id); }
  function profile() { try { return typeof dfCloudProfile !== 'undefined' ? dfCloudProfile : null; } catch (_) { return null; } }
  function legacyAllowed(view) {
    var p = profile();
    if (p && String(p.role).toLowerCase() === 'admin') return true;
    if (adminRoutes.indexOf(view) >= 0) return false;
    var access = p && (p.access_permissions || p.board_permissions) || {};
    if (view === 'lab-hub') return access.lab_hub !== false || ['lab_analysis','filter_ledger','reagent_ledger'].some(function(k){return access[k] === true;});
    if (view === 'quality') return access.quality !== false || ['organization','quality_manual','quality_procedure','quality_instruction','quality_form'].some(function(k){return access[k] === true;});
    var key = permissions[view] || view;
    return key === 'billing' ? access[key] === true : access[key] !== false;
  }
  function allowed(view) { return window.DFMenuPermissions ? window.DFMenuPermissions.can(view === 'schedule-add' ? 'schedule' : view, 'view', function(){ return legacyAllowed(view); }) : legacyAllowed(view); }
  function known(view) { return typeof view === 'string' && Object.prototype.hasOwnProperty.call(routes, view) && !!by(routes[view]); }
  function sections() {
    var result = Object.keys(routes).map(function(k){return by(routes[k]);}).filter(Boolean);
    // Includes future top-level views without touching tabs/cards inside a view.
    document.querySelectorAll('main .df-view[id]').forEach(function(el){
      if (!el.parentElement.closest('.df-view') && result.indexOf(el) < 0) result.push(el);
    });
    return result;
  }
  function setAttribute(el, name, value) { if (el.getAttribute(name) !== value) el.setAttribute(name, value); }
  function synchronize() {
    scheduled = false;
    if (!known(active)) return;
    var selected = by(routes[active]);
    sections().forEach(function(section){
      var on = section === selected, display = on ? 'block' : 'none';
      if (section.hidden === on) section.hidden = !on;
      if (section.classList.contains('df-view-active') !== on) section.classList.toggle('df-view-active', on);
      if (section.style.getPropertyValue('display') !== display || section.style.getPropertyPriority('display') !== 'important') section.style.setProperty('display', display, 'important');
      setAttribute(section, 'aria-hidden', on ? 'false' : 'true');
    });
    document.querySelectorAll('.df-nav-item[data-view]').forEach(function(button){
      // Contract tabs own their active marker and history state.
      if (button.hasAttribute('data-dfcd-nav')) return;
      var on = button.dataset.view === active;
      if (button.classList.contains('active') !== on) button.classList.toggle('active', on);
    });
    var nav = document.querySelector('.df-nav-sub .df-nav-item[data-view="' + active + '"]');
    var group = nav && nav.closest('.df-nav-group');
    if (group) { group.classList.add('open'); var toggle = group.querySelector('[data-menu-toggle]'); if(toggle)setAttribute(toggle, 'aria-expanded', 'true'); }
  }
  function queueSync() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(synchronize);
  }
  function remember(view, opts) {
    try { sessionStorage.setItem('dreampoen_current_view_v1101', view); } catch (_) {}
    if (opts && opts.history === false) return;
    try {
      var state = window.history.state || {}, hash = '#' + view;
      if (state.dfRoute !== view) window.history.pushState({dfRoute:view}, '', hash);
      else if (window.location.hash !== hash) window.history.replaceState(state, '', hash);
    } catch (_) {}
  }
  function reportHook(view) {
    var task;
    if (view.indexOf('sales-') === 0 && typeof window.dfSalesDocumentsLoad === 'function') task=window.dfSalesDocumentsLoad();
    else if(view === 'billing' && typeof window.dfErpLoad === 'function') task=window.dfErpLoad();
    if (view === 'measurement-reports') task = window.DF_REPORT_WRITER && window.DF_REPORT_WRITER.openReports && window.DF_REPORT_WRITER.openReports();
    else if (view === 'halfyear-reports') task = window.DF_REPORT_WRITER && window.DF_REPORT_WRITER.openHalfYear && window.DF_REPORT_WRITER.openHalfYear();
    else if (view === 'measurement-methods') task = window.DF_MEASUREMENT_METHODS && window.DF_MEASUREMENT_METHODS.open && window.DF_MEASUREMENT_METHODS.open();
    else if (view === 'filter-ledger' && typeof window.dfFilterReload === 'function') task = window.dfFilterReload();
    if (task && typeof task.catch === 'function') task.catch(function(error){window.console.warn('[NAVIGATION] view load', view, error);});
  }
  function legacyHubBlocked(view) {
    var p = profile(), access = p && (p.access_permissions || p.board_permissions) || {};
    return !(window.DFMenuPermissions && window.DFMenuPermissions.granted(view,'view')) && p && p.role !== 'admin' && ((view === 'lab-hub' && access.lab_hub === false) || (view === 'quality' && access.quality === false));
  }
  function navigate(view, opts) {
    opts = opts || {};
    if (opts.history !== false) pendingInitialRoute='';
    if (!known(view)) return false;
    if (!allowed(view)) { window.alert('이 계정은 해당 메뉴 열람 권한이 없습니다. 직원관리에서 메뉴 권한을 확인해주세요.'); return false; }
    active = view;
    var mine = ++generation, result;
    routeDepth += 1;
    try {
      // Keep permission checks, loading hooks and filter snapshots of the old
      // router. Report-only routes are handled below because its map lacks them.
      if (baseRouter && !legacyHubBlocked(view)) {
        try { result = baseRouter.call(window, view, opts); }
        catch (error) { window.console.warn('[NAVIGATION] legacy view hook', view, error); }
      }
      if (mine === generation) {
        remember(view, opts);
        synchronize();
        reportHook(view);
      }
    } finally {
      routeDepth -= 1;
      if (mine === generation) synchronize();
    }
    return result === undefined ? true : result;
  }
  // The old module periodically attempts to wrap this function again. Its own
  // marker prevents recreating its stale timers. Do not expose its Base property:
  // contract_navigation must pass through this current-route controller.
  navigate._dfV12037192 = true;
  navigate._dfNavigationGuard = true;

  function currentRoute() {
    var candidates = [window.history.state && window.history.state.dfRoute, window.location.hash.slice(1)];
    try { candidates.push(sessionStorage.getItem('dreampoen_current_view_v1101')); } catch (_) {}
    for (var i=0;i<candidates.length;i++) if (known(candidates[i]) && allowed(candidates[i])) return candidates[i];
    return Object.keys(routes).find(function(k){var el=by(routes[k]);return el && !el.hidden && el.style.display !== 'none' && allowed(k);}) || 'home';
  }
  function init() {
    if (initialized) return;
    initialized = true;
    var old = window.v62ShowOnly;
    baseRouter = old && old._dfV12037192Base || old;
    window.v62ShowOnly = navigate;
    active = currentRoute();
    synchronize();
    // Observe only outer screen attributes and new outer screens. Child text,
    // input values, scroll, nested tabs and document dialog attributes are ignored.
    observer = new MutationObserver(function(mutations){
      if (routeDepth) return;
      if (mutations.some(function(m){
        if(m.type==='childList') return Array.from(m.addedNodes).some(function(n){return n.nodeType===1 && (n.matches('.df-view[id]') || Object.values(routes).indexOf(n.id)>=0);});
        return Object.values(routes).indexOf(m.target.id)>=0 || m.target.matches('.df-view[id]') && !m.target.parentElement.closest('.df-view');
      })) queueSync();
    });
    var main=document.querySelector('main');
    if(main)observer.observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class','aria-hidden']});

    window.addEventListener('click',function(event){
      var button=event.target.closest && event.target.closest('.df-nav-item[data-view],[data-lab-module]');
      if(!button || button.hasAttribute('data-dfcd-nav'))return;
      var view=button.dataset.view || ({analysis:'analysis','filter-ledger':'filter-ledger'}[button.dataset.labModule]);
      if(!known(view))return;
      event.preventDefault();event.stopImmediatePropagation();
      navigate(view);
    },true);
    // A browser-history event must be handled before the old router maps report
    // routes to home. Capture still lets contract_navigation restore its subtab.
    window.addEventListener('popstate',function(event){
      var view=event.state && event.state.dfRoute || window.location.hash.slice(1) || 'home';
      if(!known(view) || !allowed(view))view='home';
      navigate(view,{history:false});
      event.stopImmediatePropagation();
      if(view==='contract' && typeof window.dfContractDocumentsSelectTab==='function') window.dfContractDocumentsSelectTab(event.state && event.state.dfContractTab === 'documents'?'documents':'ledger');
    },true);
    window.addEventListener('hashchange',function(){
      var view=window.location.hash.slice(1);
      if(known(view) && view!==active && allowed(view)) navigate(view,{history:false});
    });
    document.addEventListener('df:menu-permissions-changed',function(event){if(event.detail?.status!=='ready')return;if(pendingInitialRoute){var desired=pendingInitialRoute;pendingInitialRoute='';if(known(desired)&&allowed(desired)){navigate(desired,{history:false});return;}}if(!allowed(active)){var fallback=Object.keys(routes).find(function(v){return known(v)&&allowed(v);});if(fallback)navigate(fallback,{history:false});else{active='';generation+=1;sections().forEach(function(el){el.hidden=true;el.style.setProperty('display','none','important');el.classList.remove('df-view-active');el.setAttribute('aria-hidden','true');});}}else if(active)synchronize();});
    window.dfV1101OpenRoleHome=function(forceDefault){
      var desired='';
      if(!forceDefault)try{desired=sessionStorage.getItem('dreampoen_current_view_v1101')||'';}catch(_){}
      return navigate(known(desired)&&allowed(desired)?desired:'home');
    };
  }
  window.DF_NAVIGATION_GUARD=Object.freeze({version:'120.37.30.0',navigate:navigate,getActive:function(){return active;},routes:Object.freeze(routes)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window,document);

