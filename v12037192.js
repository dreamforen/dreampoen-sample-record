/* DREAMFOREN v120.37.21.0 · REPORT WRITER / HALF-YEAR / MENU ROUTE STABILITY */
(function dfV12037192MenuRouteStability(){
  'use strict';

  const VERSION='v120.37.21.0';
  const ROUTES={
    home:'dfViewHome',approval:'dfViewApproval',employees:'dfViewEmployees',contract:'dfViewContract',
    bid:'dfViewBid',billing:'dfViewBilling','sales-quotes':'dfViewSalesQuotes',
    'sales-statements':'dfViewSalesStatements','sales-prices':'dfViewSalesPrices',
    'sales-history':'dfViewSalesHistory','sales-settings':'dfViewSalesSettings',company:'dfViewCompany',
    schedule:'dfViewSchedule','schedule-add':'dfViewScheduleAdd',navigation:'dfViewNavigation',
    quality:'dfViewQuality','quality-manual':'dfViewQualityManual',organization:'dfViewOrganization',
    'doc-hub':'dfViewDocHub',sample:'dfViewSample','lab-hub':'dfViewLabHub',
    analysis:'dfViewAnalysis','filter-ledger':'dfViewFilterLedger',repository:'dfViewRepository',
    'measurement-reports':'dfViewMeasurementReports','halfyear-reports':'dfViewHalfYearReports'
  };
  const ROUTE_PERMISSION={analysis:'lab_analysis','lab-hub':'lab_hub','filter-ledger':'filter_ledger','measurement-reports':'repository','halfyear-reports':'repository'};
  const QUALITY_CHILDREN=['organization','quality_manual','quality_procedure','quality_instruction','quality_form'];
  const LAB_CHILDREN=['lab_analysis','filter_ledger','reagent_ledger'];
  let versionObserver=null;

  const byId=id=>document.getElementById(id);
  function profile(){try{return typeof dfCloudProfile!=='undefined'?dfCloudProfile:null}catch(_){return null}}
  function permissions(){const p=profile();return p?.access_permissions||p?.board_permissions||{}}
  function isAdmin(){return String(profile()?.role||'').toLowerCase()==='admin'}
  function keyAllowed(key){
    if(!key||isAdmin())return true;
    const value=permissions()[key];
    return key==='billing'||key==='quality_edit'?value===true:value!==false;
  }
  function hubAllowed(view){
    if(isAdmin())return true;
    const p=permissions();
    if(view==='lab-hub')return p.lab_hub!==false||LAB_CHILDREN.some(key=>p[key]===true);
    if(view==='quality')return p.quality!==false||QUALITY_CHILDREN.some(key=>p[key]===true);
    return keyAllowed(ROUTE_PERMISSION[view]||view);
  }
  function routeAllowed(view){return view==='lab-hub'||view==='quality'?hubAllowed(view):keyAllowed(ROUTE_PERMISSION[view]||view)}

  function openActiveGroup(view){
    const nav=document.querySelector(`.df-nav-sub .df-nav-item[data-view="${view}"]`);
    const group=nav?.closest('.df-nav-group');
    if(group){group.classList.add('open');group.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded','true')}
  }

  function runViewHook(view){
    try{
      if(view==='home'&&typeof dfHomeLoad==='function')dfHomeLoad();
      if(view==='contract'&&typeof dfV68LoadContracts==='function')dfV68LoadContracts();
      if(view==='billing'&&typeof dfV1209BillingLoad==='function')dfV1209BillingLoad();
      if(view==='company'&&typeof companyRender==='function')companyRender();
      if(view==='schedule'){
        if(typeof scheduleRenderAll==='function')scheduleRenderAll();
        if(typeof dfV1101RefreshSchedulesOnline==='function')dfV1101RefreshSchedulesOnline(false);
      }
      if(view==='repository'&&typeof dfRepositoryOpen==='function')dfRepositoryOpen();
      if(view==='measurement-reports')window.DF_REPORT_WRITER?.openReports?.();
      if(view==='halfyear-reports')window.DF_REPORT_WRITER?.openHalfYear?.();
      if(view==='sample'&&typeof dfRepositorySync==='function')dfRepositorySync({quiet:true});
      if(view==='analysis'){
        const refresh=()=>{
          if(typeof refreshAnalysisRecordList==='function')refreshAnalysisRecordList();
          if(typeof v66ReloadSelectedAnalysis==='function')v66ReloadSelectedAnalysis();
        };
        if(typeof dfRepositorySync==='function')Promise.resolve(dfRepositorySync({quiet:true})).then(refresh,refresh);
        else refresh();
      }
      if(view==='filter-ledger'&&typeof window.dfFilterReload==='function')window.dfFilterReload();
      if(view==='employees'&&typeof dfEmployeesLoad==='function')dfEmployeesLoad();
      if(view==='organization'&&typeof window.dfOrganizationOpen==='function')window.dfOrganizationOpen();
      if(view==='doc-hub'&&typeof dfV12011DocLoad==='function')dfV12011DocLoad();
    }catch(error){console.warn('[MENU-12037192] view hook',view,error)}
  }

  function directShow(view,opts={}){
    const target=byId(ROUTES[view]);
    if(!target)return false;
    [...new Set(Object.values(ROUTES))].map(byId).filter(Boolean).forEach(section=>{
      const active=section===target;
      section.hidden=!active;
      section.classList.toggle('df-view-active',active);
      section.style.setProperty('display',active?'block':'none','important');
      section.setAttribute('aria-hidden',active?'false':'true');
    });
    document.querySelectorAll('.df-nav-item[data-view]').forEach(button=>{
      button.classList.toggle('active',button.dataset.view===view);
    });
    openActiveGroup(view);
    try{sessionStorage.setItem('dreampoen_current_view_v1101',view)}catch(_){ }
    if(opts.history!==false){
      try{
        const hash='#'+view;
        if(history.state?.dfRoute!==view)history.pushState({dfRoute:view},'',hash);
        else if(location.hash!==hash)history.replaceState({dfRoute:view},'',hash);
      }catch(_){ }
    }
    runViewHook(view);
    return true;
  }

  function routeVisible(view){
    const target=byId(ROUTES[view]);
    return !!target&&!target.hidden&&getComputedStyle(target).display!=='none';
  }

  function legacyHubWouldBlock(view){
    if(isAdmin())return false;
    const p=permissions();
    if(view==='lab-hub')return p.lab_hub===false&&LAB_CHILDREN.some(key=>p[key]===true);
    if(view==='quality')return p.quality===false&&QUALITY_CHILDREN.some(key=>p[key]===true);
    return false;
  }

  function wrapRouter(){
    const base=window.v62ShowOnly;
    if(typeof base!=='function'||base._dfV12037192)return;
    const wrapped=function(view,opts={}){
      if(!ROUTES[view])return base.apply(this,arguments);
      if(!routeAllowed(view))return base.apply(this,arguments);
      let result;
      if(!legacyHubWouldBlock(view)){
        try{result=base.apply(this,arguments)}
        catch(error){console.error('[MENU-12037192] base route failed',view,error)}
      }
      const ensure=()=>{if(!routeVisible(view))directShow(view,opts);else openActiveGroup(view)};
      ensure();
      requestAnimationFrame(ensure);
      setTimeout(ensure,80);
      setTimeout(ensure,240);
      return result;
    };
    wrapped._dfV12037192=true;
    wrapped._dfV12037192Base=base;
    window.v62ShowOnly=wrapped;
  }

  function openLabModule(module){
    const view=module==='analysis'?'analysis':module==='filter-ledger'?'filter-ledger':'';
    if(!view)return;
    const key=ROUTE_PERMISSION[view];
    if(!keyAllowed(key)){
      alert(`이 계정은 ${module==='analysis'?'시료 분석':'먼지 여지관리대장'} 열람 권한이 없습니다.\n직원관리에서 해당 메뉴 권한을 확인해주세요.`);
      return;
    }
    window.v62ShowOnly?.(view);
    if(view==='filter-ledger')setTimeout(()=>window.dfFilterReload?.(),30);
  }

  function bindIndependentClicks(){
    document.addEventListener('click',event=>{
      const toggle=event.target.closest?.('[data-menu-toggle]');
      if(toggle){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        const group=toggle.closest('.df-nav-group');
        if(!group)return;
        const open=group.classList.toggle('open');
        toggle.setAttribute('aria-expanded',String(open));
        return;
      }
      const nav=event.target.closest?.('.df-nav-item[data-view]');
      if(nav&&ROUTES[nav.dataset.view]){
        const view=nav.dataset.view;
        if(!routeAllowed(view)){
          event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
          alert('이 계정은 해당 메뉴 열람 권한이 없습니다.\n직원관리에서 드림포이엔 자료실 권한을 확인해주세요.');
          return;
        }
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        directShow(view);
        return;
      }
      const lab=event.target.closest?.('[data-lab-module]');
      if(lab){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        openLabModule(lab.dataset.labModule);
        return;
      }
      const doc=event.target.closest?.('[data-doc-category]');
      if(doc){
        const category=doc.dataset.docCategory;
        if(!keyAllowed(category)){
          event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
          alert('이 계정은 해당 품질문서 열람 권한이 없습니다.\n직원관리에서 메뉴 권한을 확인해주세요.');
          return;
        }
        if(typeof window.dfOpenDocumentHub==='function'){
          event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
          window.dfOpenDocumentHub(category);
        }
      }
    },true);
  }

  function setHidden(element,hidden){if(element&&element.hidden!==hidden)element.hidden=hidden}
  function syncPermissionMenus(){
    setHidden(document.querySelector('.df-nav-item[data-view="lab-hub"]'),!hubAllowed('lab-hub'));
    setHidden(document.querySelector('.df-nav-item[data-view="quality"]'),!hubAllowed('quality'));
    setHidden(document.querySelector('.df-nav-item[data-view="measurement-reports"]'),!keyAllowed('repository'));
    setHidden(document.querySelector('.df-nav-item[data-view="halfyear-reports"]'),!keyAllowed('repository'));
    document.querySelectorAll('[data-lab-module]').forEach(button=>{
      const key=button.dataset.labModule==='analysis'?'lab_analysis':'filter_ledger';
      setHidden(button,!keyAllowed(key));
    });
    document.querySelectorAll('[data-doc-category]').forEach(button=>setHidden(button,!keyAllowed(button.dataset.docCategory)));
    document.querySelectorAll('.df-nav-group:not(.df-admin-only)').forEach(group=>{
      const children=[...group.querySelectorAll('.df-nav-sub .df-nav-item[data-view]')];
      if(children.length)setHidden(group,!children.some(button=>!button.hidden));
    });
  }

  function audit(){
    const issues=[];
    document.querySelectorAll('.df-nav-item[data-view]').forEach(button=>{
      const view=button.dataset.view,id=ROUTES[view];
      if(!id)issues.push(`${view}: 경로 없음`);
      else if(!byId(id))issues.push(`${view}: 화면 #${id} 없음`);
    });
    document.querySelectorAll('[data-menu-toggle]').forEach(button=>{
      const name=button.dataset.menuToggle;
      if(!document.querySelector(`[data-menu-panel="${name}"]`))issues.push(`${name}: 하위 메뉴판 없음`);
    });
    document.querySelectorAll('[data-menu-panel]').forEach(panel=>{
      const name=panel.dataset.menuPanel;
      if(!document.querySelector(`[data-menu-toggle="${name}"]`))issues.push(`${name}: 상위 메뉴버튼 없음`);
    });
    const result={version:VERSION,ok:issues.length===0,issues,directMenus:document.querySelectorAll('.df-nav-item[data-view]').length,groups:document.querySelectorAll('[data-menu-toggle]').length,internalModules:document.querySelectorAll('[data-lab-module],[data-doc-category]').length};
    window.DF_MENU_HEALTH=result;
    if(result.ok)console.info(`[DREAMFOREN] ${VERSION} menu audit OK · ${result.directMenus} direct / ${result.groups} groups / ${result.internalModules} modules`);
    else console.error('[DREAMFOREN] menu audit failed',result);
    return result;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side&&side.textContent!==`ONLINE ${VERSION} · REPORT WRITER + HALF-YEAR`)side.textContent=`ONLINE ${VERSION} · REPORT WRITER + HALF-YEAR`;
    if(footer&&footer.textContent!==VERSION)footer.textContent=VERSION;
    if(document.documentElement)document.documentElement.dataset.dreamforenVersion=VERSION;
    window.DF_ACTIVE_BUILD=VERSION;
  }

  function replaceVersionNode(id){
    const current=byId(id);
    if(!current||current.dataset.v12037200Owner==='1')return current;
    const replacement=current.cloneNode(true);
    replacement.dataset.v12037200Owner='1';
    current.replaceWith(replacement);
    return replacement;
  }

  function ownVersionDisplay(){
    replaceVersionNode('dfBuildVersionStatic');
    replaceVersionNode('dfFooterVersion');
    applyVersion();
    if(versionObserver||typeof MutationObserver==='undefined')return;
    const targets=['dfBuildVersionStatic','dfFooterVersion'].map(byId).filter(Boolean);
    versionObserver=new MutationObserver(applyVersion);
    targets.forEach(target=>versionObserver.observe(target,{childList:true,characterData:true,subtree:true}));
  }

  function init(){
    wrapRouter();bindIndependentClicks();syncPermissionMenus();ownVersionDisplay();audit();
    try{
      const remembered=sessionStorage.getItem('dreampoen_current_view_v1101')||'';
      if((remembered==='measurement-reports'||remembered==='halfyear-reports')&&routeAllowed(remembered))directShow(remembered,{history:false});
    }catch(_){ }
    window.addEventListener('popstate',event=>{
      const view=event.state?.dfRoute||(location.hash||'').replace(/^#/,'');
      if((view==='measurement-reports'||view==='halfyear-reports')&&routeAllowed(view))directShow(view,{history:false});
    });
    const nav=document.querySelector('.df-side-nav');
    if(nav)new MutationObserver(()=>syncPermissionMenus()).observe(nav,{subtree:true,attributes:true,attributeFilter:['hidden']});
    [220,900,2100,3100,5200,8200].forEach(delay=>setTimeout(()=>{wrapRouter();syncPermissionMenus();applyVersion()},delay));
    window.DF_DIAG?.info('MENU-12037210','성적서작성·반기별 보고서·전체 메뉴 경로 안정화 완료','기존 일정·자료실·대장 데이터 변경 없음');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
