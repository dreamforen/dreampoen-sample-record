/* DREAMFOREN v120.37.4 · ERP NOTE VISIBILITY & SAVE */
(function(){
  'use strict';
  const V='v120.37.4';
  const setVersion=()=>{
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${V} · ERP NOTE FIX`;
    if(foot)foot.textContent=V;
    window.DF_DIAG?.info('SYSTEM','v120.37.4 ERP 비고 표시·저장 확인 보정 적용');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setVersion,{once:true});
  else setVersion();
})();
