/* v120.37.32.0 — 사용자 요청으로 영구 삭제한 접수번호의 로컬 복구·재업로드 방지 */
(function(){
  'use strict';
  var TARGET='20260916-114',VERSION='v120.37.32.0';
  var KEYS={records:'dreampoen_sample_records_v17',draft:'dreampoen_sample_draft_v17',guards:'dreampoen_confirmed_record_guard_v12037162',reuse:'dreampoen_receipt_reuse_intent_v12037167',lab:'dreampoen_lab_raw_input_v64',deleted:'dreampoen_repository_deleted_receipts_v12012'};
  var cleanupBusy=false,cleanupDoneFor='',lastAttempt=0,patchTimer=null;
  function text(v){return String(v==null?'':v).trim();}
  function getReceipt(row){
    if(typeof row==='string'||typeof row==='number')return text(row);
    if(!row||typeof row!=='object')return '';
    return text(row.receipt_no)||text(row.source_receipt_no)||text(row.measurement_no)||text(row.report_no)||text(row.data&&row.data.fields&&row.data.fields.receiptNo)||text(row.form_data&&row.form_data.receipt_no)||text(row.fields&&row.fields.receiptNo)||getReceipt(row.record)||text(row.receipt);
  }
  function isRetired(row){return getReceipt(row)===TARGET;}
  function normalizeFetchedRows(rows){return filterRows(rows).map(function(row){
    var outer=text(row&&row.receipt_no),record=row&&row.measurement_data;
    // 서버의 정정된 14 행은 보존하고 로컬 복사본의 오래된 내부 번호만 맞춥니다.
    if(outer&&outer!==TARGET&&isRetired(record)){var copied=JSON.parse(JSON.stringify(row)),inner=copied.measurement_data;
      ['receipt_no','source_receipt_no','measurement_no','report_no','receipt'].forEach(function(key){if(text(inner[key])===TARGET)inner[key]=outer;});
      if(inner.data&&inner.data.fields&&text(inner.data.fields.receiptNo)===TARGET)inner.data.fields.receiptNo=outer;
      if(inner.fields&&text(inner.fields.receiptNo)===TARGET)inner.fields.receiptNo=outer;
      if(inner.form_data&&text(inner.form_data.receipt_no)===TARGET)inner.form_data.receipt_no=outer;
      return copied;}

    return row;
  });}
  function filterRows(rows){return (Array.isArray(rows)?rows:[]).filter(function(row){return !isRetired(row);});}
  function read(key,fallback){try{var v=JSON.parse(localStorage.getItem(key)||'null');return v==null?fallback:v;}catch(e){return fallback;}}
  function writeChanged(key,before,after){if(JSON.stringify(before)!==JSON.stringify(after))localStorage.setItem(key,JSON.stringify(after));}
  function purgeLocal(){
    var records=read(KEYS.records,[]);if(!Array.isArray(records))records=[];
    var kept=filterRows(records),keptIds=new Set(kept.map(function(r){return text(r.id);})),removedIds=new Set(records.filter(isRetired).map(function(r){return text(r.id);}));
    writeChanged(KEYS.records,records,kept);
    var draft=read(KEYS.draft,null);if(isRetired(draft))localStorage.removeItem(KEYS.draft);
    [KEYS.guards,KEYS.reuse].forEach(function(key){var value=read(key,{});if(!value||Array.isArray(value)||typeof value!=='object')return;var next=Object.assign({},value);Object.keys(value).forEach(function(id){if(id===TARGET||isRetired(value[id])){if(key===KEYS.guards&&value[id]&&value[id].record)removedIds.add(text(value[id].record.id||id));delete next[id];}});writeChanged(key,value,next);});
    var lab=read(KEYS.lab,{});if(lab&&typeof lab==='object'&&!Array.isArray(lab)){var next=Object.assign({},lab);removedIds.forEach(function(id){if(id&&!keptIds.has(id))delete next[id];});writeChanged(KEYS.lab,lab,next);}
    // 기존 삭제 이력은 전부 유지하며 대상 번호만 보충합니다.
    var deleted=read(KEYS.deleted,[]);if(Array.isArray(deleted)&&!deleted.some(function(r){return text(r)===TARGET;})){deleted=deleted.concat([TARGET]);localStorage.setItem(KEYS.deleted,JSON.stringify(deleted));}
    return records.length-kept.length;
  }
  function retiredError(){return new Error('접수번호 '+TARGET+'는 영구 삭제된 번호입니다. 다른 접수번호의 정상 자료를 사용해주세요.');}
  function check(row){if(isRetired(row))throw retiredError();}
  function wrap(name,make){var old=window[name];if(typeof old!=='function'||old.__dfRetirement32)return;var next=make(old);next.__dfRetirement32=true;window[name]=next;}
  function currentData(){try{return typeof collect==='function'?collect():null;}catch(e){return null;}}
  function patch(){
    purgeLocal();
    wrap('readRecordStore',function(old){return function(){return filterRows(old.apply(this,arguments));};});
    wrap('writeRecordStore',function(old){return function(rows){return old.call(this,filterRows(rows));};});
    wrap('dfRepoFetch',function(old){return async function(){return normalizeFetchedRows(await old.apply(this,arguments));};});
    wrap('dfRepoUpsertMeasurement',function(old){return async function(record){check(record);return old.apply(this,arguments);};});
    wrap('dfV1203726SaveDirectMeasurement',function(old){return async function(record){check(record);return old.apply(this,arguments);};});
    wrap('dfV1203727PrepareReplacement',function(old){return async function(record){check(record);return old.apply(this,arguments);};});
    wrap('dfRepoUpsertAnalysis',function(old){return async function(recordId){var records=read(KEYS.records,[]),record=Array.isArray(records)?records.find(function(r){return text(r.id)===text(recordId);}):null;check(record);return old.apply(this,arguments);};});
    wrap('dfRepositorySync',function(old){return async function(){purgeLocal();try{return await old.apply(this,arguments);}finally{purgeLocal();}};});
    wrap('manualSaveRecord',function(old){return function(){if(isRetired(currentData())){window.alert(retiredError().message);return false;}return old.apply(this,arguments);};});
    wrap('autoSaveCurrent',function(old){return function(){if(isRetired(currentData()))return false;return old.apply(this,arguments);};});
  }
  function client(){try{return typeof dfSupabase!=='undefined'?dfSupabase:null;}catch(e){return null;}}
  function admin(){try{return typeof dfCloudProfile!=='undefined'&&dfCloudProfile&&dfCloudProfile.role==='admin'&&dfCloudProfile.active!==false&&typeof dfCloudUser!=='undefined'&&dfCloudUser?dfCloudUser.id:'';}catch(e){return '';}}
  function showStatus(message,error){
    var box=document.getElementById('dfReceiptRetirementStatus');
    if(!box){box=document.createElement('div');box.id='dfReceiptRetirementStatus';box.setAttribute('role','status');box.style.cssText='position:fixed;right:16px;bottom:16px;max-width:min(420px,calc(100vw - 32px));z-index:12000;background:#fff;border:1px solid #ccd5d1;border-radius:10px;padding:12px;box-shadow:0 4px 18px #0002;font-size:13px;color:#182c24';document.body.appendChild(box);}
    if(!document.getElementById('dfRetirementPrintStyle')){var style=document.createElement('style');style.id='dfRetirementPrintStyle';style.textContent='@media print{#dfReceiptRetirementStatus{display:none!important}}';document.head.appendChild(style);}
    box.replaceChildren();var label=document.createElement('span');label.textContent=message;box.appendChild(label);
    if(error){var retry=document.createElement('button');retry.type='button';retry.textContent='다시 정리';retry.style.marginLeft='8px';retry.onclick=function(){cleanup(true);};box.appendChild(retry);}
    var close=document.createElement('button');close.type='button';close.textContent='닫기';close.style.marginLeft='8px';close.onclick=function(){box.remove();};box.appendChild(close);
  }
  async function cleanup(force){
    var db=client(),uid=admin();if(!db||!uid||cleanupBusy||(!force&&(cleanupDoneFor===uid||Date.now()-lastAttempt<30000)))return;
    cleanupBusy=true;lastAttempt=Date.now();
    try{
      var pending=await db.rpc('df_retired_receipt_cleanup_pending');if(pending.error)throw pending.error;
      var rows=Array.isArray(pending.data)?pending.data:[],failed=[];var cleared=0;
      for(var i=0;i<rows.length;i++){
        var row=rows[i];if(row.bucket_id!=='quality-documents'||!text(row.id)||!text(row.storage_path)){failed.push(row);continue;}
        try{var result=await db.storage.from(row.bucket_id).remove([row.storage_path]);if(result.error)throw result.error;var ack=await db.rpc('df_retired_receipt_cleanup_ack',{p_id:row.id});if(ack.error)throw ack.error;cleared++;}catch(e){failed.push(row);console.warn('지정 접수번호 파일 정리 재시도 필요',e.message||e);}
      }
      if(failed.length)showStatus(TARGET+' 파일 '+failed.length+'개를 아직 정리하지 못했습니다. 다른 자료는 유지됩니다.',true);
      else{cleanupDoneFor=uid;if(cleared)showStatus(TARGET+' 저장파일 '+cleared+'개 정리를 완료했습니다.',false);}
      document.dispatchEvent(new CustomEvent('df:receipt-retirement-cleanup',{detail:{receipt:TARGET,removed:cleared,pending:failed.length}}));
    }catch(e){
      var message=text(e&&e.message||e);if(/PGRST202|Could not find.*function|does not exist|schema cache/i.test(message))showStatus(TARGET+' 영구 정리를 위해 SQL 43을 먼저 실행해주세요.',true);
      else showStatus(TARGET+' 저장파일 정리를 완료하지 못했습니다. '+message,true);
    }finally{cleanupBusy=false;}
  }
  function init(){patch();[100,800,2000,5000,8500].forEach(function(ms){setTimeout(patch,ms);});cleanup();}
  function onSaved(){purgeLocal();if(patchTimer)clearTimeout(patchTimer);patchTimer=setTimeout(patch,0);}
  window.DF_RECEIPT_RETIREMENT={version:VERSION,isRetired:isRetired,getReceipt:getReceipt,filterRows:filterRows,purgeLocal:purgeLocal,retryCleanup:function(){return cleanup(true);},patch:patch};
  document.addEventListener('click',function(event){if(event.target&&event.target.closest&&event.target.closest('#btnSave')&&isRetired(currentData())){event.preventDefault();event.stopImmediatePropagation();window.alert(retiredError().message);}},true);
  document.addEventListener('dreampoen:record-saved',onSaved,true);
  document.addEventListener('df:menu-permissions-changed',function(){patch();cleanup();});
  window.addEventListener('storage',function(event){if(Object.keys(KEYS).some(function(k){return KEYS[k]===event.key;}))onSaved();});
  patch();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
