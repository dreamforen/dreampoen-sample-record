/* DREAMFOREN v120.37.13 · CONTRACT DOCUMENT UI FIX */
'use strict';
(function(){
  const VERSION='v120.37.13';
  document.addEventListener('DOMContentLoaded',()=>{
    const side=document.getElementById('dfBuildVersionStatic'),foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent='ONLINE v120.37.13 · CONTRACT DOCS UI FIX + WEATHER';
    if(foot)foot.textContent=VERSION;
    window.DF_DIAG?.info('BUILD-1203713','계약문서 표시 보완 완료','원본 글꼴 · 팝업 스크롤 · 의뢰기관명 · 삭제');
  },{once:true});
})();
