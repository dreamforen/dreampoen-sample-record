/* DREAMFOREN v120.35.0 · FILTER ORDER / METER CARRY / CO DEFAULT */
(function(){
  'use strict';
  const VERSION='v120.35.0',$=id=>document.getElementById(id);
  function bind(){
    $('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · FILTER & METER FIX');
    $('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);
    window.DF_DIAG?.info('SYSTEM','v120.35 여지번호 정렬·적산유량계 승계·CO 기본값 적용 완료');
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})();
