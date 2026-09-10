/* DREAMFOREN v120.36.2 · ERP VISIBLE EDIT */
(function(){
  'use strict';
  const VERSION='v120.36.2',$=id=>document.getElementById(id);
  document.addEventListener('DOMContentLoaded',()=>{
    $('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · ERP VISIBLE EDIT');
    $('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);
    window.DF_DIAG?.info('SYSTEM','v120.36.2 ERP 상세·매칭·업체명 수정 버튼 표시 완료');
  });
})();
