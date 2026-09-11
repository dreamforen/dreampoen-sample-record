/* DREAMFOREN v120.37.6 · SALES DOCUMENT ROW ACTIONS */
(function(){
  'use strict';
  const V='v120.37.6';
  const setVersion=()=>{
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${V} · SALES ACTIONS`;
    if(foot)foot.textContent=V;
    window.DF_DIAG?.info('SYSTEM','v120.37.6 견적·거래명세서 관리 버튼 3분할·한 줄 정렬 적용');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setVersion,{once:true});
  else setVersion();
})();
