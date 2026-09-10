/* DREAMFOREN v120.31 · HOME RESET / RESPONSIVE / SAMPLE SUMMARY */
(function(){
  'use strict';
  const VERSION='v120.31.1';
  const $=id=>document.getElementById(id);
  const value=id=>{const el=$(id);return String(el?.value??'').trim()};
  const show=(id,v)=>{const el=$(id);if(el)el.textContent=v===''?'-':v};
  const canEditQuality=()=>{try{return String(dfCloudProfile?.role||'').toLowerCase()==='admin'||dfCloudProfile?.access_permissions?.quality_edit===true}catch(_){return false}};
  function applyQualityAccess(){const editable=canEditQuality();['dfDocNew','dfDocUpload'].forEach(id=>{const el=$(id);if(el)el.hidden=!editable});document.body.classList.toggle('df-quality-readonly',!editable)}
  function syncSummary(){
    show('rWeather',value('weather'));show('rAirTemp',value('airTemp'));show('rHumidity',value('humidity'));
    show('rPressure',value('pressure'));show('rWindDir',value('windDir'));show('rWindSpeed',value('windSpeed'));show('rStdO2',value('stdO2'));
  }
  function homeReset(){
    try{sessionStorage.setItem('df_v12031_force_home','1')}catch(_){}
    const clean=location.pathname+(location.search?location.search.replace(/([?&])dfreset=\d+(&|$)/,'$1').replace(/[?&]$/,''):'');
    location.href=clean+(clean.includes('?')?'&':'?')+'dfreset='+Date.now()+'#home';
  }
  function bind(){
    const brand=$('dfBrandHomeReset');if(brand&&!brand.dataset.v12031){brand.dataset.v12031='1';brand.addEventListener('click',homeReset);brand.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();homeReset()}})}
    document.querySelectorAll('#dfViewSample input,#dfViewSample select').forEach(el=>{if(!el.dataset.v12031){el.dataset.v12031='1';el.addEventListener('input',syncSummary);el.addEventListener('change',syncSummary)}});
    if(typeof window.recalc==='function'&&!window.recalc.__v12031){const base=window.recalc;const wrapped=function(){const out=base.apply(this,arguments);syncSummary();return out};wrapped.__v12031=true;window.recalc=wrapped}
    if(innerWidth<=1100&&innerWidth>768&&document.body.classList.contains('df-sidebar-collapsed'))document.body.classList.remove('df-sidebar-collapsed');
    syncSummary();applyQualityAccess();
    try{if(sessionStorage.getItem('df_v12031_force_home')==='1'){sessionStorage.removeItem('df_v12031_force_home');setTimeout(()=>window.v62ShowOnly?.('home'),50)}}catch(_){}
    $('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · RESPONSIVE & QMS ACCESS');
    $('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);
    window.DF_DIAG?.info('SYSTEM','v120.31 반응형·품질권한·자동계산 요약 준비 완료');
  }
  const roleBase=window.dfApplyRoleAccess;if(typeof roleBase==='function')window.dfApplyRoleAccess=function(profile){const out=roleBase.apply(this,arguments);setTimeout(applyQualityAccess,0);return out};
  addEventListener('resize',()=>{if(innerWidth<=1100&&innerWidth>768&&document.body.classList.contains('df-sidebar-collapsed'))document.body.classList.remove('df-sidebar-collapsed')});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})();
