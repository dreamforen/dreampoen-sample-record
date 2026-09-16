// ==========================================================
// DREAMFOREN v120.37.16.7
// 삭제 후 접수번호 재사용 + 여지대장 구번호 중복 정리
// - 사용자가 삭제한 접수번호는 이전 서버행을 보관번호로 옮긴 뒤 재사용한다.
// - 삭제된 기록의 확정저장 보호큐가 삭제 직후 다시 되살리는 순서를 차단한다.
// - 접수번호 정정 이력(예: 114→14)은 여지대장에 최신 1건만 표시한다.
// ==========================================================
(function dfV12037167DeleteReplaceFix(){
  'use strict';

  const VERSION='v120.37.16.7';
  const VERSION_LABEL=`ONLINE ${VERSION} · DELETE + REPLACE FIX ACTIVE`;
  const GUARD_KEY='dreampoen_confirmed_record_guard_v12037162';
  const DELETED_KEY='dreampoen_repository_deleted_receipts_v12012';
  const REUSE_KEY='dreampoen_receipt_reuse_intent_v12037167';
  const REUSE_MAX_AGE=1000*60*60*24*30;
  const clean=value=>String(value??'').trim();
  let versionObserver=null;

  function client(){
    try{return typeof dfSupabase!=='undefined'?dfSupabase:null;}
    catch(_){return null;}
  }

  function user(){
    try{return typeof dfCloudUser!=='undefined'?dfCloudUser:null;}
    catch(_){return null;}
  }

  function table(){
    try{return typeof DF_REPOSITORY_TABLE!=='undefined'?DF_REPOSITORY_TABLE:'dreampoen_repository';}
    catch(_){return 'dreampoen_repository';}
  }

  function receiptOf(record){
    try{
      if(typeof dfRepoReceipt==='function')return clean(dfRepoReceipt(record?.data));
    }catch(_){/* 이전 버전 호환 */}
    return clean(record?.data?.fields?.receiptNo);
  }

  function normalizeName(value){
    return clean(value).normalize('NFKC').toLocaleLowerCase('ko')
      .replace(/주식회사|유한회사|㈜|\(주\)/g,'')
      .replace(/[^0-9a-z가-힣]/g,'');
  }

  function normalizeFacility(value){
    return clean(value).normalize('NFKC').toLocaleLowerCase('ko').replace(/[^0-9a-z가-힣]/g,'');
  }

  function identityOf(value){
    const row=value?.measurement_data?value:{};
    const record=value?.measurement_data||value;
    const data=record?.data||record||{},fields=data?.fields||{};
    return [
      clean(fields.measureDate||row.measure_date).slice(0,10),
      normalizeName(fields.company||row.company_name),
      normalizeFacility(fields.facility||row.facility_name),
      clean(data.recordType||row.record_type)
    ].join('|');
  }

  function isDeleted(row){
    try{if(typeof dfRepoIsDeleted==='function')return !!dfRepoIsDeleted(row);}catch(_){/* 직접 판별 */}
    return row?.measurement_data?.deleted===true||row?.measurement_data?._deleted===true;
  }

  function timestamp(value){
    const parsed=Date.parse(value||'');
    return Number.isFinite(parsed)?parsed:0;
  }

  function measurementTime(row){
    const direct=Math.max(timestamp(row?.measurement_updated_at),timestamp(row?.measurement_data?.updatedAt));
    return direct||timestamp(row?.updated_at);
  }

  function analysisTime(row){
    return Math.max(timestamp(row?.analysis_updated_at),timestamp(row?.analysis_data?.savedAt),timestamp(row?.updated_at));
  }

  function clone(value){
    try{return JSON.parse(JSON.stringify(value));}
    catch(_){return value;}
  }

  function localRecords(){
    try{return typeof readRecordStore==='function'?readRecordStore():[];}
    catch(_){return [];}
  }

  function loadObject(key){
    try{
      const value=JSON.parse(localStorage.getItem(key)||'{}');
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    }catch(_){return {};}
  }

  function saveObject(key,value){
    const entries=Object.entries(value||{});
    if(!entries.length){localStorage.removeItem(key);return;}
    localStorage.setItem(key,JSON.stringify(value));
  }

  function deletedReceipts(){
    try{return new Set(JSON.parse(localStorage.getItem(DELETED_KEY)||'[]').map(String));}
    catch(_){return new Set();}
  }

  function rememberReuseIntent(receipt){
    const value=clean(receipt);
    if(!value)return;
    const intents=loadObject(REUSE_KEY),now=Date.now();
    Object.keys(intents).forEach(key=>{if(now-timestamp(intents[key]?.deletedAt)>REUSE_MAX_AGE)delete intents[key];});
    intents[value]={receipt:value,deletedAt:new Date(now).toISOString()};
    saveObject(REUSE_KEY,intents);
  }

  function hasReuseIntent(receipt){
    const intent=loadObject(REUSE_KEY)[clean(receipt)];
    return !!intent&&Date.now()-timestamp(intent.deletedAt)<=REUSE_MAX_AGE;
  }

  function clearReuseIntent(receipt){
    const intents=loadObject(REUSE_KEY),value=clean(receipt);
    if(!intents[value])return false;
    delete intents[value];
    saveObject(REUSE_KEY,intents);
    return true;
  }

  function forgetGuards({recordId='',receipt=''}={}){
    const guards=loadObject(GUARD_KEY),wantedId=clean(recordId),wantedReceipt=clean(receipt);
    let changed=false;
    Object.keys(guards).forEach(key=>{
      const guard=guards[key];
      if((wantedId&&clean(guard?.id||key)===wantedId)||(wantedReceipt&&clean(guard?.receipt)===wantedReceipt)){
        delete guards[key];changed=true;
      }
    });
    if(changed)saveObject(GUARD_KEY,guards);
    return changed;
  }

  // 사용자가 삭제한 기록 또는 같은 접수번호의 새 로컬 기록이 생긴 경우에만
  // 예전 확정저장 보호큐를 제거한다. 단순 서버조회 누락은 계속 보호한다.
  function purgeStaleGuards(){
    const guards=loadObject(GUARD_KEY),records=localRecords();
    const ids=new Set(records.map(record=>clean(record?.id)).filter(Boolean));
    const byReceipt=new Map();
    records.forEach(record=>{
      const receipt=receiptOf(record);
      if(receipt)byReceipt.set(receipt,record);
    });
    const deleted=deletedReceipts();
    let removed=0;
    Object.keys(guards).forEach(key=>{
      const guard=guards[key],id=clean(guard?.id||key),receipt=clean(guard?.receipt);
      if(ids.has(id))return;
      const replacement=byReceipt.get(receipt);
      if(deleted.has(receipt)||hasReuseIntent(receipt)||(replacement&&clean(replacement.id)!==id)){
        delete guards[key];removed++;
      }
    });
    if(removed)saveObject(GUARD_KEY,guards);
    return removed;
  }

  async function readServerRow(receipt){
    const supabase=client();
    if(!supabase||!receipt)return null;
    const result=await supabase.from(table())
      .select('receipt_no,measure_date,company_name,facility_name,record_type,measurement_data,analysis_data,measurement_updated_at,analysis_updated_at,updated_at,hidden')
      .eq('receipt_no',receipt).maybeSingle();
    if(result.error)throw result.error;
    return result.data||null;
  }

  function sameRecord(existing,record){
    const oldId=clean(existing?.measurement_data?.id),nextId=clean(record?.id);
    return (oldId&&nextId&&oldId===nextId)||identityOf(existing)===identityOf(record);
  }

  function replacementQuestion(receipt,existing,record){
    const before=existing?.measurement_data?.data?.fields||{};
    const after=record?.data?.fields||{};
    return `접수번호 ${receipt}에 이전 온라인 기록이 남아 있습니다.\n\n이전: ${before.company||existing?.company_name||'-'} / ${before.facility||existing?.facility_name||'-'}\n새 기록: ${after.company||'-'} / ${after.facility||'-'}\n\n이전 기록을 삭제이력으로 보관하고 새 기록으로 교체할까요?\n취소하면 아무 자료도 덮어쓰지 않습니다.`;
  }

  async function archiveLedger(receipt,archivedReceipt,now=new Date().toISOString()){
    const supabase=client(),currentUser=user();
    if(!supabase||!currentUser)return false;
    try{
      const ledger=await supabase.from('filter_ledger_entries').update({receipt_no:archivedReceipt,updated_by:currentUser.id,updated_at:now}).eq('receipt_no',receipt);
      if(ledger.error)throw ledger.error;
      return true;
    }catch(error){
      window.DF_DIAG?.warn('FILTER-ARCHIVE-12037167','구 여지값 보관 보류',error?.message||String(error));
      return false;
    }
  }

  async function archiveExisting(receipt,existing){
    const supabase=client(),currentUser=user(),now=new Date().toISOString();
    if(!supabase||!currentUser)throw Error('온라인 로그인이 연결되지 않아 이전 기록을 정리할 수 없습니다.');
    const archivedReceipt=`__REPLACED__${receipt}__${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const marker={
      ...(existing?.measurement_data||{}),
      deleted:true,
      _deleted:true,
      deletedAt:now,
      replacedReceipt:receipt,
      replacedBy:currentUser.id
    };
    const archived=await supabase.from(table()).update({
      receipt_no:archivedReceipt,
      measurement_data:marker,
      hidden:true,
      updated_by:currentUser.id,
      updated_at:now
    }).eq('receipt_no',receipt);
    if(archived.error)throw Error(`이전 온라인 기록 보관 실패: ${archived.error.message||archived.error}`);

    // 같은 번호에 남은 구 여지값도 보관번호로 옮겨 새 기록과 섞이지 않게 한다.
    await archiveLedger(receipt,archivedReceipt,now);
    forgetGuards({recordId:existing?.measurement_data?.id,receipt});
    return archivedReceipt;
  }

  async function prepareReplacement(record,{interactive=true}={}){
    const receipt=receiptOf(record);
    if(!receipt)return {replaced:false};
    const existing=await readServerRow(receipt);
    if(!existing)return {replaced:false};
    if(isDeleted(existing)){
      // 삭제된 접수번호를 다시 사용할 때 예전 여지값은 새 기록에 붙지 않게 별도 보관한다.
      const archivedLedger=`__REPLACED_LEDGER__${receipt}__${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      await archiveLedger(receipt,archivedLedger);
      return {replaced:false,existing};
    }
    if(sameRecord(existing,record))return {replaced:false,existing};

    const approved=hasReuseIntent(receipt)||(interactive&&typeof confirm==='function'&&confirm(replacementQuestion(receipt,existing,record)));
    if(!approved){
      const oldFields=existing?.measurement_data?.data?.fields||{},newFields=record?.data?.fields||{};
      throw Error(`접수번호 ${receipt}는 이미 다른 기록에 사용 중입니다.\n기존: ${oldFields.company||existing?.company_name||'-'} / ${oldFields.facility||existing?.facility_name||'-'}\n현재: ${newFields.company||'-'} / ${newFields.facility||'-'}`);
    }
    await archiveExisting(receipt,existing);
    return {replaced:true,existing};
  }

  function filterSignature(row){
    const fields=row?.measurement_data?.data?.fields||{};
    const filterNo=clean(fields.filterNo);
    if(!filterNo)return '';
    return [
      clean(fields.measureDate||row?.measure_date).slice(0,10),
      normalizeName(fields.company||row?.company_name),
      normalizeFacility(fields.facility||row?.facility_name),
      clean(row?.record_type||row?.measurement_data?.data?.recordType),
      filterNo.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'')
    ].join('|');
  }

  // 여지대장 전용: v16.6의 동일-ID 정리를 먼저 적용하고, 복사 저장으로 ID까지
  // 달라진 완전 동일 측정행은 날짜·업체·시설·여지번호가 같은 최신 1건만 남긴다.
  function normalizeFilterSources(rows){
    const base=typeof window.dfV1203726NormalizeFetchedRows==='function'
      ?window.dfV1203726NormalizeFetchedRows(rows)
      :(Array.isArray(rows)?rows:[]);
    const selected=new Map(),members=new Map(),removed=new Set();
    base.forEach((row,index)=>{
      if(isDeleted(row))return;
      const key=filterSignature(row);
      if(!key)return;
      if(!members.has(key))members.set(key,[]);
      members.get(key).push({row,index});
      const previous=selected.get(key);
      if(!previous){selected.set(key,{row,index});return;}
      const currentTime=measurementTime(row),previousTime=measurementTime(previous.row);
      if(currentTime>previousTime||(currentTime===previousTime&&timestamp(row?.updated_at)>timestamp(previous.row?.updated_at))){
        removed.add(previous.index);selected.set(key,{row,index});
      }else removed.add(index);
    });

    const replacements=new Map();
    selected.forEach((selectedItem,key)=>{
      const same=members.get(key)||[];
      let latestAnalysis=null;
      same.forEach(item=>{
        if(item.row?.analysis_data&&(!latestAnalysis||analysisTime(item.row)>analysisTime(latestAnalysis.row)))latestAnalysis=item;
      });
      if(latestAnalysis&&analysisTime(latestAnalysis.row)>analysisTime(selectedItem.row)){
        const row=clone(selectedItem.row);
        row.analysis_data=clone(latestAnalysis.row.analysis_data);
        row.analysis_updated_at=latestAnalysis.row.analysis_updated_at||latestAnalysis.row.updated_at||row.analysis_updated_at;
        replacements.set(selectedItem.index,row);
      }
    });
    return base.map((row,index)=>replacements.get(index)||row).filter((_,index)=>!removed.has(index));
  }

  function patchRuntime(){
    if(!window.dfV12037167DeletePatched&&typeof dfRepoSoftDelete==='function'){
      const baseDelete=dfRepoSoftDelete;
      dfRepoSoftDelete=async function dfV12037167DeleteWithoutRevive(receipt){
        const value=clean(receipt);
        rememberReuseIntent(value);
        forgetGuards({receipt:value});
        return baseDelete.apply(this,arguments);
      };
      window.dfRepoSoftDelete=dfRepoSoftDelete;
      window.dfV12037167DeletePatched=true;
    }

    if(!window.dfV12037167MeasurementPatched&&typeof dfRepoUpsertMeasurement==='function'){
      const baseMeasurement=dfRepoUpsertMeasurement;
      dfRepoUpsertMeasurement=async function dfV12037167ReplaceDeletedReceipt(record,options){
        if(options?.quiet===true)return baseMeasurement.apply(this,arguments);
        const state=await prepareReplacement(record,{interactive:true});
        const result=await baseMeasurement.apply(this,arguments);
        if(state.replaced||hasReuseIntent(receiptOf(record)))clearReuseIntent(receiptOf(record));
        return result;
      };
      window.dfV12037167MeasurementPatched=true;
    }

    if(!window.dfV12037167AnalysisPatched&&typeof dfRepoUpsertAnalysis==='function'){
      const baseAnalysis=dfRepoUpsertAnalysis;
      dfRepoUpsertAnalysis=async function dfV12037167ReplaceBeforeAnalysis(recordId){
        const record=localRecords().find(item=>clean(item?.id)===clean(recordId));
        if(record)await prepareReplacement(record,{interactive:true});
        const result=await baseAnalysis.apply(this,arguments);
        if(record)clearReuseIntent(receiptOf(record));
        return result;
      };
      window.dfV12037167AnalysisPatched=true;
    }

    if(!window.dfV12037167SyncPatched&&typeof dfRepositorySync==='function'){
      const baseSync=dfRepositorySync;
      dfRepositorySync=async function dfV12037167SyncWithoutDeletedGuardRevive(){
        purgeStaleGuards();
        return baseSync.apply(this,arguments);
      };
      window.dfRepositorySync=dfRepositorySync;
      window.dfV12037167SyncPatched=true;
    }
    return !!(window.dfV12037167DeletePatched&&window.dfV12037167MeasurementPatched&&window.dfV12037167SyncPatched);
  }

  function replaceVersionNode(id){
    const current=document.getElementById(id);
    if(!current||current.dataset.v12037167Owner==='1')return current;
    const replacement=current.cloneNode(true);
    replacement.dataset.v12037167Owner='1';
    current.replaceWith(replacement);
    return replacement;
  }

  function applyVersion(){
    const side=document.getElementById('dfBuildVersionStatic');
    const footer=document.getElementById('dfFooterVersion');
    if(side){
      if(side.textContent!==VERSION_LABEL)side.textContent=VERSION_LABEL;
      side.title='이 문구가 보이면 삭제 후 재사용·여지 중복 수정본이 적용된 상태입니다.';
      side.style.fontWeight='700';
    }
    if(footer&&footer.textContent!==VERSION)footer.textContent=VERSION;
    if(document.documentElement)document.documentElement.dataset.dreamforenVersion=VERSION;
    window.DF_ACTIVE_BUILD=VERSION;
  }

  function ownVersionDisplay(){
    replaceVersionNode('dfBuildVersionStatic');
    replaceVersionNode('dfFooterVersion');
    applyVersion();
    if(versionObserver||typeof MutationObserver==='undefined')return;
    const targets=['dfBuildVersionStatic','dfFooterVersion'].map(id=>document.getElementById(id)).filter(Boolean);
    versionObserver=new MutationObserver(applyVersion);
    targets.forEach(target=>versionObserver.observe(target,{childList:true,characterData:true,subtree:true}));
  }

  function init(){
    purgeStaleGuards();
    patchRuntime();
    ownVersionDisplay();
    [180,700,1600,3200,6500,8000].forEach(wait=>setTimeout(()=>{patchRuntime();applyVersion();},wait));
    window.DF_DIAG?.info(
      'DELETE-REPLACE-12037167',
      '삭제 후 접수번호 재사용·여지대장 구번호 중복 보호 적용 완료',
      '삭제 guard 제거 / 이전 서버행 보관 / 동일 측정 최신 1건 표시'
    );
  }

  window.dfV1203727NormalizeFilterSources=normalizeFilterSources;
  window.dfV1203727PurgeStaleGuards=purgeStaleGuards;
  window.dfV1203727ForgetGuards=forgetGuards;
  window.dfV1203727PrepareReplacement=prepareReplacement;
  window.dfV1203727PatchRuntime=patchRuntime;
  window.dfV1203727ApplyVersion=applyVersion;

  patchRuntime();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
