/* Beta 3.2: adapters for nested screens. Browser state stores identifiers only. */
(function(window,document){'use strict';
 const root={capture:()=>({key:'root',data:{}})};
 const contract={capture(){const docs=document.getElementById('dfcdPage'),tab=docs&&!docs.hidden?'documents':'ledger';return {key:tab,data:{tab}};},restore(s){window.dfContractDocumentsSelectTab?.(s.data.tab==='documents'?'documents':'ledger');}};
 function adapter(view){
  if(view==='measurement-reports')return window.DF_REPORT_WRITER?.navigation||root;
  if(view==='halfyear-reports')return window.DF_HALFYEAR_REPORT?.navigation||root;
  if(view==='doc-hub')return window.DF_QPF_FORMS?.navigation||root;
  if(view==='quality'||view==='quality-manual')return window.DFQualityBridge?.navigation?.(view)||root;
  if(view==='contract')return contract;
  return root;
 }
 window.DF_SCREEN_HISTORY={adapter};
})(window,document);
