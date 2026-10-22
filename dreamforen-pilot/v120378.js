/* DREAMFOREN v120.37.8 · QUOTATION PRINT CLEANUP */
(function(){
  'use strict';
  const V='v120.37.8';
  const setVersion=()=>{
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${V} · QUOTE CLEANUP`;
    if(foot)foot.textContent=V;
    window.DF_DIAG?.info('SYSTEM','v120.37.8 견적서 로고 제거·인감 경로 보강·합계표 상단선 제거 적용');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setVersion,{once:true});
  else setVersion();
})();
