// ==========================================================
// DREAMFOREN v120.37.16.2
// 접수번호 변경 확정본 보호
// - 기록 저장 직후의 로컬 확정본을 서버 확인 전까지 보호한다.
// - 같은 기록 ID로 남은 이전 접수번호 서버 행은 최신 접수번호 1건으로 정리해 표시한다.
// - 이전 접수번호에 있던 LAB 자료는 새 접수번호 행에 이어서 표시한다.
// 기존 입력·계산·인쇄·DB 구조는 변경하지 않는다.
// ==========================================================
(function dfV12037162ReceiptRenameGuard(){
  'use strict';

  const VERSION='v120.37.16.2';
  const GUARD_KEY='dreampoen_confirmed_record_guard_v12037162';
  const DELETED_KEY='dreampoen_repository_deleted_receipts_v12012';
  const byId=id=>document.getElementById(id);
  const copy=value=>{
    try{return JSON.parse(JSON.stringify(value));}
    catch(_){return value;}
  };

  function receiptOf(record){
    try{
      if(typeof dfRepoReceipt==='function')return String(dfRepoReceipt(record?.data)||'').trim();
    }catch(_){/* 이전 자료 호환 */}
    return String(record?.data?.fields?.receiptNo||'').trim();
  }

  function parsedTime(value){
    const time=Date.parse(value||'');
    return Number.isFinite(time)?time:0;
  }

  function recordTime(record){
    return parsedTime(record?.updatedAt||record?.autosavedAt||record?.createdAt||'');
  }

  function measurementTime(row){
    const direct=Math.max(
      parsedTime(row?.measurement_updated_at),
      parsedTime(row?.measurement_data?.updatedAt)
    );
    return direct||parsedTime(row?.updated_at);
  }

  function analysisTime(row){
    return Math.max(
      parsedTime(row?.analysis_updated_at),
      parsedTime(row?.analysis_data?.savedAt),
      parsedTime(row?.updated_at)
    );
  }

  function loadGuards(){
    try{
      const value=JSON.parse(localStorage.getItem(GUARD_KEY)||'{}');
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    }catch(_){return {};}
  }

  function saveGuards(guards){
    const keys=Object.keys(guards||{});
    if(!keys.length){localStorage.removeItem(GUARD_KEY);return;}
    // 비정상적으로 누적되더라도 최근 80건까지만 보존한다.
    if(keys.length>80){
      keys.sort((a,b)=>parsedTime(guards[b]?.savedAt)-parsedTime(guards[a]?.savedAt));
      keys.slice(80).forEach(key=>delete guards[key]);
    }
    localStorage.setItem(GUARD_KEY,JSON.stringify(guards));
  }

  function deletedHistoryHas(receipt){
    const value=String(receipt||'').trim();
    if(!value)return false;
    try{return new Set(JSON.parse(localStorage.getItem(DELETED_KEY)||'[]').map(String)).has(value);}
    catch(_){return false;}
  }

  function forgetDeletedReceipt(receipt){
    const value=String(receipt||'').trim();
    if(!value)return false;
    try{
      const items=JSON.parse(localStorage.getItem(DELETED_KEY)||'[]').map(String);
      const kept=items.filter(item=>item!==value);
      if(kept.length===items.length)return false;
      localStorage.setItem(DELETED_KEY,JSON.stringify(kept));
      return true;
    }catch(_){return false;}
  }

  function captureSavedRecord(event){
    const id=String(event?.detail?.id||'').trim();
    if(!id||typeof readRecordStore!=='function')return false;
    const record=readRecordStore().find(item=>String(item?.id||'')===id);
    if(!record)return false;
    const receipt=receiptOf(record);
    const hadDeletedHistory=deletedHistoryHas(receipt);
    // 사용자가 직접 '기록 저장'한 번호는 과거 삭제 이력보다 우선한다.
    // 자동 동기화에는 이 캡처가 없으므로 삭제자료 자동부활은 계속 차단된다.
    if(hadDeletedHistory)forgetDeletedReceipt(receipt);
    const guards=loadGuards();
    guards[id]={
      id,
      receipt,
      updatedAt:record.updatedAt||record.autosavedAt||record.createdAt||'',
      savedAt:new Date().toISOString(),
      allowRevive:true,
      hadDeletedHistory,
      record:copy(record)
    };
    saveGuards(guards);
    return true;
  }

  function rowRecordId(row){
    return String(row?.measurement_data?.id||'').trim();
  }

  function rowReceipt(row){
    return String(row?.receipt_no||'').trim();
  }

  function activeRow(row){
    try{return !(typeof dfRepoIsDeleted==='function'&&dfRepoIsDeleted(row));}
    catch(_){return true;}
  }

  function dedupeFetchedRows(rows){
    const source=Array.isArray(rows)?rows:[];
    const groups=new Map();
    source.forEach((row,index)=>{
      if(!activeRow(row))return;
      const id=rowRecordId(row);
      if(!id)return;
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push({row,index});
    });

    const replacement=new Map(),removed=new Set();
    groups.forEach(items=>{
      if(items.length<2)return;
      let newest=items[0];
      items.slice(1).forEach(item=>{
        const a=measurementTime(item.row),b=measurementTime(newest.row);
        if(a>b||(a===b&&parsedTime(item.row?.updated_at)>parsedTime(newest.row?.updated_at)))newest=item;
      });

      let latestAnalysis=null;
      items.forEach(item=>{
        if(!item.row?.analysis_data)return;
        if(!latestAnalysis||analysisTime(item.row)>analysisTime(latestAnalysis.row))latestAnalysis=item;
      });

      const selected={...newest.row};
      if(latestAnalysis&&(!selected.analysis_data||analysisTime(latestAnalysis.row)>analysisTime(selected))){
        selected.analysis_data=copy(latestAnalysis.row.analysis_data);
        selected.analysis_updated_at=latestAnalysis.row.analysis_updated_at||latestAnalysis.row.updated_at||selected.analysis_updated_at;
      }
      replacement.set(newest.index,selected);
      items.forEach(item=>{if(item.index!==newest.index)removed.add(item.index);});
    });

    return source.map((row,index)=>replacement.get(index)||row).filter((_,index)=>!removed.has(index));
  }

  function explicitlyDeleted(guard,rows){
    const value=String(guard?.receipt||'').trim();
    if(!value)return false;
    const tombstones=(Array.isArray(rows)?rows:[]).filter(row=>rowReceipt(row)===value&&!activeRow(row));
    if(guard?.allowRevive){
      const saveTime=Math.max(recordTime(guard.record),parsedTime(guard.savedAt));
      // 저장보다 오래된 삭제표식은 이번 직접 저장으로 복구한다.
      // 저장 뒤 새로 만들어진 삭제표식만 실제 삭제로 인정한다.
      return tombstones.some(row=>Math.max(measurementTime(row),parsedTime(row?.measurement_data?.deletedAt))>saveTime);
    }
    try{
      if(typeof dfRepoDeletedSet==='function'&&dfRepoDeletedSet().has(value))return true;
    }catch(_){/* 삭제 이력 접근 실패 시 보존 */}
    return tombstones.length>0;
  }

  function matchingConfirmedRow(guard,rows){
    const matches=(Array.isArray(rows)?rows:[]).filter(row=>{
      if(!activeRow(row)||rowRecordId(row)!==String(guard?.id||''))return false;
      const embedded=receiptOf(row.measurement_data);
      return rowReceipt(row)===String(guard?.receipt||'')&&embedded===String(guard?.receipt||'');
    });
    matches.sort((a,b)=>measurementTime(b)-measurementTime(a));
    const row=matches[0]||null;
    return row&&measurementTime(row)>=recordTime(guard?.record)?row:null;
  }

  function replaceStableRecord(records,id,candidate){
    const wanted=String(id||'');
    const output=[];
    let inserted=false;
    (Array.isArray(records)?records:[]).forEach(record=>{
      if(String(record?.id||'')!==wanted){output.push(record);return;}
      if(!inserted){output.push(copy(candidate));inserted=true;}
    });
    if(!inserted)output.push(copy(candidate));
    return output;
  }

  function reconcileProtectedRecords(rows){
    if(typeof readRecordStore!=='function'||typeof writeRecordStore!=='function')return {restored:0,confirmed:0};
    const guards=loadGuards();
    const ids=Object.keys(guards);
    if(!ids.length)return {restored:0,confirmed:0};

    let records=readRecordStore();
    const before=JSON.stringify(records);
    let restored=0,confirmed=0,guardsChanged=false;

    ids.forEach(id=>{
      const guard=guards[id];
      if(!guard?.record){delete guards[id];guardsChanged=true;return;}
      if(explicitlyDeleted(guard,rows)){
        delete guards[id];guardsChanged=true;return;
      }
      if(guard.allowRevive)forgetDeletedReceipt(guard.receipt);

      const cloud=matchingConfirmedRow(guard,rows);
      const candidate=cloud?.measurement_data||guard.record;
      records=replaceStableRecord(records,id,candidate);
      if(cloud){delete guards[id];guardsChanged=true;confirmed++;}
      else restored++;
    });

    if(JSON.stringify(records)!==before)writeRecordStore(records);
    if(guardsChanged)saveGuards(guards);
    return {restored,confirmed};
  }

  async function forceUpsertGuardedRecord(record){
    const receipt=receiptOf(record);
    const supabase=typeof dfSupabase!=='undefined'?dfSupabase:null;
    const user=typeof dfCloudUser!=='undefined'?dfCloudUser:null;
    if(!receipt||!record?.data||!supabase||!user)return false;
    const fields=record.data.fields||{};
    const now=new Date().toISOString();
    const value=(fn,fallback)=>{
      try{return typeof fn==='function'?fn(record.data):fallback;}
      catch(_){return fallback;}
    };
    const payload={
      receipt_no:receipt,
      measure_date:value(typeof dfRepoDate==='function'?dfRepoDate:null,String(fields.measureDate||'').slice(0,10))||null,
      company_name:value(typeof dfRepoCompany==='function'?dfRepoCompany:null,String(fields.company||'').trim())||null,
      facility_name:value(typeof dfRepoFacility==='function'?dfRepoFacility:null,String(fields.facility||'').trim())||null,
      record_type:record.data.recordType||null,
      measurement_data:record,
      measurement_updated_at:record.updatedAt||now,
      updated_by:user.id,
      updated_at:now
    };
    const table=typeof DF_REPOSITORY_TABLE!=='undefined'?DF_REPOSITORY_TABLE:'dreampoen_repository';
    const {error}=await supabase.from(table).upsert(payload,{onConflict:'receipt_no'});
    if(error)throw error;
    forgetDeletedReceipt(receipt);
    return true;
  }

  function patchRepository(){
    if(window.dfV12037162RepositoryPatched)return true;
    if(typeof dfRepoFetch!=='function'||typeof dfRepoMergeCloud!=='function')return false;

    if(typeof dfRepoUpsertMeasurement==='function'){
      const baseUpsert=dfRepoUpsertMeasurement;
      dfRepoUpsertMeasurement=async function dfV12037162UpsertManualRevive(record,options){
        const id=String(record?.id||'').trim(),receipt=receiptOf(record);
        const guard=loadGuards()[id];
        const explicitlySaved=!!guard&&String(guard.receipt||'')===receipt;
        if(explicitlySaved)forgetDeletedReceipt(receipt);
        const result=await baseUpsert.apply(this,arguments);
        if(result!==false||!explicitlySaved)return result;
        // 과거 삭제표식 때문에 기존 저장기가 거절한 경우에만 직접 저장으로 복구한다.
        const guards=loadGuards();
        if(guards[id]){guards[id].allowRevive=true;saveGuards(guards);}
        forgetDeletedReceipt(receipt);
        return forceUpsertGuardedRecord(record);
      };
    }

    const baseFetch=dfRepoFetch;
    dfRepoFetch=async function dfV12037162FetchLatestReceiptPerRecord(){
      const rows=await baseFetch.apply(this,arguments);
      return dedupeFetchedRows(rows);
    };

    const baseMerge=dfRepoMergeCloud;
    dfRepoMergeCloud=function dfV12037162MergeWithLocalSaveGuard(rows){
      const result=baseMerge.apply(this,arguments);
      const state=reconcileProtectedRecords(rows);
      if((state.restored||state.confirmed)&&result&&typeof result==='object')result.changed=true;
      return result;
    };

    window.dfV12037162RepositoryPatched=true;
    return true;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · RECEIPT RENAME GUARD`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    patchRepository();
    applyVersion();
    [180,700,1600].forEach(wait=>setTimeout(()=>{
      patchRepository();
      applyVersion();
    },wait));
    window.DF_DIAG?.info(
      'RECEIPT-RENAME-12037162',
      '접수번호 변경 확정본 보호 완료',
      '저장 직후 로컬값 보호 / 이전 서버번호 재덮기 차단 / 동일 기록 최신번호 표시'
    );
  }

  window.dfV1203722CaptureSavedRecord=captureSavedRecord;
  window.dfV1203722DedupeFetchedRows=dedupeFetchedRows;
  window.dfV1203722ReconcileProtectedRecords=reconcileProtectedRecords;
  window.dfV1203722ForgetDeletedReceipt=forgetDeletedReceipt;
  window.dfV1203722ForceUpsertGuardedRecord=forceUpsertGuardedRecord;
  window.dfV1203722PatchRepository=patchRepository;

  // 같은 document에 등록된 기존 일반 리스너보다 먼저 확정 저장본을 잡는다.
  document.addEventListener('dreampoen:record-saved',captureSavedRecord,true);
  patchRepository();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
