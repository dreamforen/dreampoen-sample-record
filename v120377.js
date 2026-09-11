/* DREAMFOREN v120.37.7 · APPROVED QUOTATION PRINT DESIGN */
(function(){
  'use strict';
  const V='v120.37.7';
  const setVersion=()=>{
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${V} · QUOTE DESIGN`;
    if(foot)foot.textContent=V;
    window.DF_DIAG?.info('SYSTEM','v120.37.7 승인 견적서 A4 출력 디자인 복원 적용');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setVersion,{once:true});
  else setVersion();
})();
