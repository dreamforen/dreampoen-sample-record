/* DREAMFOREN v120.37.3 · ERP PER-USER ACCESS */
(function(){
  'use strict';
  const V='v120.37.3';
  const setVersion=()=>{
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${V} · ERP ACCESS`;
    if(foot)foot.textContent=V;
    window.DF_DIAG?.info('SYSTEM','v120.37.3 ERP 직원별 화면·DB 권한 일치 적용');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setVersion,{once:true});
  else setVersion();
})();
