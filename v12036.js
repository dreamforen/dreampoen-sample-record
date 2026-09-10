/* DREAMFOREN v120.36.0 · ERP MATCHING / ITEM MANAGEMENT */
(function(){
  'use strict';
  const VERSION='v120.36.0',$=id=>document.getElementById(id);
  document.addEventListener('DOMContentLoaded',()=>{
    $('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · ERP MATCHING');
    $('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);
    window.DF_DIAG?.info('SYSTEM','v120.36 ERP 다중기준 매칭·직접 항목관리 적용 완료');
  });
})();
