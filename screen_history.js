/* Adapters for nested screens. Browser state stores identifiers and filters only. */
(function(window,document){'use strict';
 const root={capture:()=>({key:'root',data:{}})};
 const documentKeys=['formType','packageId','contractId','year','month','scope','query','listScope'];
 function documentData(raw){
  const data={tab:'documents'};
  for(const key of documentKeys){const value=raw?.[key];if(typeof value==='string')data[key]=value.slice(0,key==='query'?300:180);else if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null)data[key]=value;}
  return data;
 }
 const contract={
  capture(){
   const docs=document.getElementById('dfcdPage');if(!docs||docs.hidden)return {key:'ledger',data:{tab:'ledger'}};
   const saved=window.DF_CONTRACT_WRITER?.navigation?.capture?.(),raw=saved?.data||saved||{};
   return {key:typeof saved?.key==='string'?saved.key.slice(0,180):'contract-writing',data:documentData(raw)};
  },
  canLeave(){const docs=document.getElementById('dfcdPage');return !docs||docs.hidden||window.DF_CONTRACT_WRITER?.navigation?.canLeave?.()!==false;},
  confirmLeave(){const docs=document.getElementById('dfcdPage');return !docs||docs.hidden||window.DF_CONTRACT_WRITER?.navigation?.confirmLeave?.()!==false;},
  restore(saved){
   const tab=saved?.data?.tab==='documents'?'documents':'ledger',writer=window.DF_CONTRACT_WRITER;
   if(writer?.selectTab)writer.selectTab(tab,{history:false,restore:true});else window.dfContractDocumentsSelectTab?.(tab);
   if(tab==='documents'&&writer?.navigation?.restore)return writer.navigation.restore({key:typeof saved?.key==='string'?saved.key.slice(0,180):'contract-writing',data:documentData(saved?.data)});
  }
 };
 function adapter(view){
  if(view==='sales-letters')return window.DF_OUTGOING_LETTERS?.navigation||root;
  if(view==='measurement-reports')return window.DF_REPORT_WRITER?.navigation||root;
  if(view==='halfyear-reports')return window.DF_HALFYEAR_REPORT?.navigation||root;
  if(view==='doc-hub')return window.DF_QPF_FORMS?.navigation||root;
  if(view==='official-test-methods')return window.DF_OFFICIAL_TEST_METHODS?.navigation||root;
  if(view==='quality-manual'||view==='quality-procedure'||view==='quality-instruction')return window.DFQualityBridge?.navigation?.(view)||root;
  if(view==='contract')return contract;
  return root;
 }
 window.DF_SCREEN_HISTORY={adapter};
})(window,document);
