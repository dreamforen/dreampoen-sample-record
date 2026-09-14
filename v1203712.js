/* DREAMFOREN v120.37.12 · CONTRACT DOCUMENT AUTHORING */
'use strict';
(function(){
  const VERSION='v120.37.12';
  document.addEventListener('DOMContentLoaded',()=>{
    const side=document.getElementById('dfBuildVersionStatic'),foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent='ONLINE v120.37.12 · CONTRACT DOCS + WEATHER';
    if(foot)foot.textContent=VERSION;
    window.DF_DIAG?.info('BUILD-1203712','계약문서 작성 탭 적용 완료','표준양식 4종 · 독립 누적관리');
  },{once:true});
})();
