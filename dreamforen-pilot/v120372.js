/* DREAMFOREN v120.37.2 · CONTRACT STATUS & DIRECT COMPANY LINK */
(function(){
  'use strict';
  const V='v120.37.2';
  const setVersion=()=>{
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${V} · CONTRACT DIRECT LINK`;
    if(foot)foot.textContent=V;
    window.DF_DIAG?.info('SYSTEM','v120.37.2 계약일 기준 상태·업체 직접연결 적용');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setVersion,{once:true});
  else setVersion();
})();
