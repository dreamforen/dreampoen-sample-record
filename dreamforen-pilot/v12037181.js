/* DREAMFOREN v120.37.18.1 · QUALITY DOCUMENT EDITOR */
(function(){
  'use strict';
  const VERSION='v120.37.18.1';
  function apply(){
    const side=document.getElementById('dfBuildVersionStatic');
    const footer=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · QUALITY DOCUMENT EDITOR`;
    if(footer)footer.textContent=VERSION;
    window.DF_DIAG?.info('QMS-EDITOR','품질매뉴얼 전체 화면 문서 편집기 적용',VERSION);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
