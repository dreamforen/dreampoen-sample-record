/* Formatted Excel exports use this library; the rest of the app need not load it. */
(function(){
  'use strict';
  let pending;
  window.DFLoadExcelJS=function(){
    if(window.ExcelJS?.Workbook)return Promise.resolve(window.ExcelJS);
    if(pending)return pending;
    pending=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      const timer=setTimeout(fail,18000);
      function cleanup(){clearTimeout(timer);script.onload=null;script.onerror=null;script.remove();}
      function fail(){cleanup();reject(Error('엑셀 기능을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.'));}
      script.onload=()=>{if(!window.ExcelJS?.Workbook){fail();return;}cleanup();resolve(window.ExcelJS);};
      script.onerror=fail;
      document.head.append(script);
    }).finally(()=>{pending=null;});
    return pending;
  };
})();
