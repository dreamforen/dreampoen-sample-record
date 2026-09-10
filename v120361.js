/* DREAMFOREN v120.36.1 · ERP REMATCH */
(function(){
  'use strict';
  const VERSION='v120.36.1',$=id=>document.getElementById(id);
  document.addEventListener('DOMContentLoaded',()=>{
    $('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · ERP REMATCH');
    $('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);
    window.DF_DIAG?.info('SYSTEM','v120.36.1 완료 입금 매칭 수정 기능 적용');
  });
})();
