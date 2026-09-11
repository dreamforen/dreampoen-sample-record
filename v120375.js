/* DREAMFOREN v120.37.5 · ERP PHONE READ-ONLY & ALIGNMENT */
(function(){
  'use strict';
  const V='v120.37.5';
  const setVersion=()=>{
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${V} · ERP PHONE VIEW`;
    if(foot)foot.textContent=V;
    window.DF_DIAG?.info('SYSTEM','v120.37.5 ERP 전화번호 목록 읽기 전용·정렬 보정 적용');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setVersion,{once:true});
  else setVersion();
})();
