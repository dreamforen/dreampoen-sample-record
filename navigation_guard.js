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
  var observer = null, routeDepth = 0, pendingInitialRoute = '', initialHistory=window.history.state||{};
  var pendingRoleHome = null;
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
  // Browser history owns both top-level menus and their nested screens. Drafts
  // stay in memory; history.state contains only route identifiers, never forms.
  var entries=new Map(),currentId='',position=Number.isInteger(initialHistory.dfNavIndex)?initialHistory.dfNavIndex:0,restoring=false,rollingBack=false,pendingPop=null,pendingNavigation=null,changeQueued=false,serial=0;
  function owner(){try{return typeof dfCloudUser!=='undefined'&&dfCloudUser?String(dfCloudUser.id):'';}catch(_){return '';}}
  function permissionsReady(){
    var api=window.DFMenuPermissions;
    if(!api || typeof api.getStatus!=='function')return true;
    if(api.isAdmin?.())return true;
    var status=api.getStatus();
    return !!owner()&&status.status==='ready'&&status.userId===owner();
  }
  function adapter(view){return window.DF_SCREEN_HISTORY&&window.DF_SCREEN_HISTORY.adapter(view);}
  function snapshot(view){var api=adapter(view),screen=api&&api.capture?api.capture():null;return {view:view,screen:screen||{key:'root',data:{}},owner:owner(),scrollY:window.scrollY};}
  function captureCurrent(){if(!currentId||!known(active)||restoring)return;var prior=entries.get(currentId),next=snapshot(active);if(!prior||prior.view===next.view&&prior.screen.key===next.screen.key)entries.set(currentId,next);}
  function remember(view,opts){
    try{sessionStorage.setItem('dreampoen_current_view_v1101',view);}catch(_){}
    var currentAdapter=adapter(view);
    if(restoring||opts&&opts.history===false||currentAdapter&&currentAdapter.isChanging&&currentAdapter.isChanging())return;
    var next=snapshot(view),prev=entries.get(currentId),same=prev&&prev.owner===next.owner&&prev.view===view&&prev.screen.key===next.screen.key;
    if(same){entries.set(currentId,next);return;}
    var initial=!currentId,replace=initial||opts&&opts.replace,id='dfnav-'+Date.now().toString(36)+'-'+(++serial),state=Object.assign({},initial?window.history.state||{}:{},{dfRoute:view,dfNavId:id,dfNavIndex:replace?position:position+1,dfScreen:next.screen.data||{}});
    if(view==='contract')state.dfContractTab=next.screen.data.tab;
    try{window.history[replace?'replaceState':'pushState'](state,'','#'+view);currentId=id;position=state.dfNavIndex;entries.set(id,next);}catch(error){window.console.warn('[NAVIGATION] history unavailable',error);}
  }
  function changed(opts){
    if(opts&&opts.replace&&!restoring&&known(active)){remember(active,{replace:true});return;}
    if(restoring||routeDepth||changeQueued||!initialized)return;
    changeQueued=true;Promise.resolve().then(function(){changeQueued=false;var api=adapter(active);if(!restoring&&known(active)&&!(api&&api.isChanging&&api.isChanging()))remember(active);});
  }
  function mayLeave(){var api=adapter(active);if(window.DF_STABILITY?.canLeave(active)===false||api&&api.canLeave&&api.canLeave()===false){window.alert('진행 중인 저장이나 불러오기가 끝난 뒤 이동해주세요.');return false;}return true;}
  function back(){if(restoring||rollingBack||!mayLeave())return true;if(position<1)return false;captureCurrent();window.history.back();return true;}
  function forward(){if(restoring||rollingBack||!mayLeave())return true;captureCurrent();window.history.forward();return true;}
  function keydown(event){
    if(event.key!=='Backspace'||event.defaultPrevented||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey)return;
    var target=event.target,control=target&&target.closest&&target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
    if(control&&!(control.tagName==='INPUT'&&/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test(control.type))){if(control.disabled||control.readOnly||control.tagName==='SELECT')event.preventDefault();return;}
    if(target&&target.isContentEditable)return;
    event.preventDefault();event.stopImmediatePropagation();back();
  }
  function attachFrameKeys(){document.querySelectorAll('main iframe').forEach(function(frame){if(frame._dfHistoryBound)return;frame._dfHistoryBound=true;function bind(){try{frame.contentWindow.addEventListener('keydown',keydown,true);}catch(_){}}frame.addEventListener('load',bind);bind();});}
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
    if((restoring||rollingBack)&&!opts.fromHistory){pendingNavigation={view:view,opts:opts};return true;}
    if (opts.history !== false) pendingInitialRoute='';
    if (!known(view)) return false;
    if (!allowed(view)) { window.alert('이 계정은 해당 메뉴 열람 권한이 없습니다. 직원관리에서 메뉴 권한을 확인해주세요.'); return false; }
    if(!restoring&&!mayLeave())return false;
    captureCurrent();
    active = view;
    var mine = ++generation, result;
    routeDepth += 1;
    try {
      // Keep permission checks, loading hooks and filter snapshots of the old
      // router. Report-only routes are handled below because its map lacks them.
      if (baseRouter && !opts.restore && !legacyHubBlocked(view)) {
        try { result = baseRouter.call(window, view, Object.assign({},opts,{history:false})); }
        catch (error) { window.console.warn('[NAVIGATION] legacy view hook', view, error); }
      }
      if (mine === generation) {
        remember(view, opts);
        synchronize();
        window.DF_DIAG?.isEnabled?.()&&window.DF_DIAG.info('NAVIGATION','화면 이동',JSON.stringify({view:view,index:position,replace:!!opts.replace}));
        if(!opts.restore)reportHook(view);
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
    active = known(pendingInitialRoute)&&allowed(pendingInitialRoute)?pendingInitialRoute:currentRoute();
    synchronize();remember(active);attachFrameKeys();
    // Observe only outer screen attributes and new outer screens. Child text,
    // input values, scroll, nested tabs and document dialog attributes are ignored.
    observer = new MutationObserver(function(mutations){
      if(mutations.some(function(m){return m.type==='childList';})){attachFrameKeys();changed();}
      if (routeDepth) return;
      if (mutations.some(function(m){
        if(m.type==='childList') return Array.from(m.addedNodes).some(function(n){return n.nodeType===1 && (n.matches('.df-view[id]') || Object.values(routes).indexOf(n.id)>=0);});
        return Object.values(routes).indexOf(m.target.id)>=0 || m.target.matches('.df-view[id]') && !m.target.parentElement.closest('.df-view');
      })) queueSync();
    });
    var main=document.querySelector('main');
    if(main)observer.observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class','aria-hidden']});

    window.addEventListener('keydown',keydown,true);
    window.addEventListener('click',function(event){captureCurrent();changed();},true);
    ['input','change'].forEach(function(type){document.addEventListener(type,function(){Promise.resolve().then(captureCurrent);},true);});
    window.addEventListener('click',function(event){
      var backButton=event.target.closest&&event.target.closest('#rhxWizardBack,#rhxWizardCancel,#rhxFolderBack,#dfDocBack,[data-hy2-action="back"],#scheduleAddBack');
      if(backButton&&back()){event.preventDefault();event.stopImmediatePropagation();return;}
      var button=event.target.closest && event.target.closest('.df-nav-item[data-view],[data-lab-module]');
      if(!button || button.hasAttribute('data-dfcd-nav'))return;
      var view=button.dataset.view || ({analysis:'analysis','filter-ledger':'filter-ledger'}[button.dataset.labModule]);
      if(!known(view))return;
      event.preventDefault();event.stopImmediatePropagation();
      navigate(view);
    },true);
    // A browser-history event must be handled before the old router maps report
    // routes to home. Capture still lets contract_navigation restore its subtab.
    async function restoreTarget(target){
      var view=target.dfRoute||window.location.hash.slice(1),targetIndex=Number.isInteger(target.dfNavIndex)?target.dfNavIndex:position-1;
      if(!known(view)||!allowed(view)||!mayLeave()){
        var delta=position-targetIndex;
        if(delta){rollingBack=true;restoring=true;window.history.go(delta);}
        else window.history.replaceState({dfRoute:active,dfNavId:currentId,dfNavIndex:position},'','#'+active);
        return;
      }
      captureCurrent();restoring=true;
      try{
        var cached=entries.get(target.dfNavId);if(cached&&cached.owner!==owner())cached=null;
        var api=adapter(view),screen=cached?cached.screen:{data:target.dfScreen||{},key:''};
        navigate(view,{history:false,restore:!!(api&&api.restore),fromHistory:true});
        // The browser has already traversed: commit its identity even when the
        // target reader fails, otherwise the next Back uses the wrong position.
        currentId=target.dfNavId||'dfnav-'+Date.now().toString(36)+'-'+(++serial);position=Math.max(0,targetIndex);
        if(api&&api.restore)await api.restore(screen);
        var restored=snapshot(view);entries.set(currentId,restored);
        if(!pendingPop&&window.history.state?.dfNavId===target.dfNavId)window.history.replaceState(Object.assign({},target,{dfRoute:view,dfNavId:currentId,dfNavIndex:position,dfScreen:restored.screen.data||{}}),'','#'+view);
        window.scrollTo(0,cached&&cached.scrollY||0);
      }catch(error){window.console.warn('[NAVIGATION] restore',error);window.DF_DIAG?.warn('NAVIGATION','이전 화면 조회 실패 · 이동 위치 유지',JSON.stringify({view:view,code:error.code||''}));window.alert('이전 화면을 불러오지 못했습니다. '+(error.message||error));}
      finally{restoring=false;synchronize();if(pendingPop){var next=pendingPop;pendingPop=null;await restoreTarget(next);}else if(pendingNavigation){var desired=pendingNavigation;pendingNavigation=null;navigate(desired.view,desired.opts);}}
    }
    window.addEventListener('popstate',function(event){
      event.stopImmediatePropagation();
      if(rollingBack){rollingBack=false;restoring=false;pendingPop=null;synchronize();if(pendingNavigation){var desired=pendingNavigation;pendingNavigation=null;navigate(desired.view,desired.opts);}return;}
      if(restoring){pendingPop=event.state||{};return;}
      restoreTarget(event.state||{});
    },true);
    window.addEventListener('hashchange',function(){
      if(restoring)return;var view=window.location.hash.slice(1);
      if(known(view)&&view!==active&&allowed(view))navigate(view,{history:false});
    });
    document.addEventListener('df:menu-permissions-changed',function(event){
      if(event.detail?.status!=='ready'||!permissionsReady())return;
      if(pendingRoleHome){
        var request=pendingRoleHome;pendingRoleHome=null;
        if(request.owner===owner()&&window.dfV1101OpenRoleHome(request.forceDefault))return;
      }
      if(pendingInitialRoute){var desired=pendingInitialRoute;pendingInitialRoute='';if(known(desired)&&allowed(desired)){navigate(desired,{history:false});return;}}
      if(!allowed(active)){
        var fallback=Object.keys(routes).find(function(v){return known(v)&&allowed(v);});
        if(fallback)navigate(fallback,{history:false});
        else{active='';generation+=1;sections().forEach(function(el){el.hidden=true;el.style.setProperty('display','none','important');el.classList.remove('df-view-active');el.setAttribute('aria-hidden','true');});}
      }else if(active)synchronize();
    });
    window.dfV1101OpenRoleHome=function(forceDefault){
      // 직원의 권한 조회가 끝나기 전에는 자동 화면 복원을 보류합니다.
      if(!permissionsReady()){
        pendingRoleHome={forceDefault:!!forceDefault,owner:owner()};
        window.DFMenuPermissions?.refresh?.();
        return false;
      }
      pendingRoleHome=null;
      var desired='';
      if(!forceDefault)try{desired=pendingInitialRoute||sessionStorage.getItem('dreampoen_current_view_v1101')||'';}catch(_){}
      var target=known(desired)&&allowed(desired)?desired:Object.keys(routes).find(function(view){return known(view)&&allowed(view);});
      if(!target){
        active='';generation+=1;
        sections().forEach(function(el){el.hidden=true;el.style.setProperty('display','none','important');el.classList.remove('df-view-active');el.setAttribute('aria-hidden','true');});
        return false;
      }
      return navigate(target,{replace:true});
    };
  }
  window.DF_NAVIGATION_GUARD=Object.freeze({version:'Beta 3.7',navigate:navigate,changed:changed,back:back,forward:forward,isRestoring:function(){return restoring;},getActive:function(){return active;},routes:Object.freeze(routes)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window,document);
