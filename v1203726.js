// ==========================================================
// DREAMFOREN v120.37.16.6
// 자료실/로컬기록/먼지여지대장 데이터 정합성 보정
// - 직접 저장 자료는 서버 확인 전까지 재시도 큐에서 보호한다.
// - 동일 접수번호의 서로 다른 기록 덮어쓰기를 저장 전에 차단한다.
// - 같은 과거 ID라도 업체/시설이 다르면 별도 기록으로 유지한다.
// - 여지대장은 기록 ID까지 확인해 다른 업체 무게를 가져오지 않는다.
// - 새로고침은 온라인 조회 완료 뒤 연도별 화면을 다시 그린다.
// ==========================================================
(function dfV12037166DataConsistency(){
  'use strict';

  const VERSION='v120.37.16.6';
  const VERSION_LABEL=`ONLINE ${VERSION} · DATA CONSISTENCY ACTIVE`;
  const GUARD_KEY='dreampoen_confirmed_record_guard_v12037162';
  const PAGE_SIZE=1000;
  const clean=value=>String(value??'').trim();
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let retryRunning=false;
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
    }catch(_){/* 구버전 호환 */}
    return clean(record?.data?.fields?.receiptNo);
  }

  function recordData(value){
    if(value?.measurement_data?.data)return value.measurement_data;
    if(value?.raw?.data)return value.raw;
    if(value?.data?.fields)return value;
    return value?.data||value||null;
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
    const record=recordData(value),data=record?.data||record||{},fields=data?.fields||{};
    const row=value?.measurement_data?value:{};
    const company=normalizeName(fields.company||row.company_name);
    const facility=normalizeFacility(fields.facility||row.facility_name);
    const date=clean(fields.measureDate||row.measure_date).slice(0,10);
    const type=clean(data.recordType||row.record_type);
    return [date,company,facility,type].join('|');
  }

  function isDeleted(row){
    try{if(typeof dfRepoIsDeleted==='function')return !!dfRepoIsDeleted(row);}catch(_){/* 직접 판별 */}
    return row?.measurement_data?.deleted===true||row?.measurement_data?._deleted===true;
  }

  function timestamp(value){
    const parsed=Date.parse(value||'');
    return Number.isFinite(parsed)?parsed:0;
  }

  function rowTime(row){
    const direct=Math.max(timestamp(row?.measurement_updated_at),timestamp(row?.measurement_data?.updatedAt));
    return direct||timestamp(row?.updated_at);
  }

  function analysisTime(row){
    return Math.max(timestamp(row?.analysis_updated_at),timestamp(row?.analysis_data?.savedAt),timestamp(row?.updated_at));
  }

  function hash(value){
    let result=2166136261;
    for(const char of String(value||'')){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}
    return (result>>>0).toString(36);
  }

  function clone(value){
    try{return JSON.parse(JSON.stringify(value));}
    catch(_){return value;}
  }

  // 같은 기록 ID가 과거 복사 오류로 서로 다른 업체/시설에 쓰인 경우만 ID를 분리한다.
  // 업체·시설·날짜가 같은 접수번호 변경 이력은 가장 최신 행 1건만 유지한다.
  function normalizeFetchedRows(rows){
    const source=Array.isArray(rows)?rows:[];
    const groups=new Map();
    source.forEach((row,index)=>{
      if(isDeleted(row))return;
      const id=clean(row?.measurement_data?.id);
      if(!id)return;
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push({row,index,identity:identityOf(row)});
    });

    const removed=new Set(),replacements=new Map();
    groups.forEach((items,originalId)=>{
      if(items.length<2)return;
      const identities=new Map(),latestAnalysisByIdentity=new Map();
      items.forEach(item=>{
        const key=item.identity||`receipt:${clean(item.row?.receipt_no)}`;
        const previous=identities.get(key);
        if(!previous||rowTime(item.row)>rowTime(previous.row)){
          if(previous)removed.add(previous.index);
          identities.set(key,item);
        }else removed.add(item.index);
        const previousAnalysis=latestAnalysisByIdentity.get(key);
        if(item.row?.analysis_data&&(!previousAnalysis||analysisTime(item.row)>analysisTime(previousAnalysis.row))){
          latestAnalysisByIdentity.set(key,item);
        }
      });
      if(identities.size<2){
        const current=[...identities.values()][0];
        if(!current)return;
        let latestAnalysis=null;
        items.forEach(item=>{
          if(item.row?.analysis_data&&(!latestAnalysis||analysisTime(item.row)>analysisTime(latestAnalysis.row)))latestAnalysis=item;
        });
        if(latestAnalysis&&analysisTime(latestAnalysis.row)>analysisTime(current.row)){
          const row=clone(current.row);
          row.analysis_data=clone(latestAnalysis.row.analysis_data);
          row.analysis_updated_at=latestAnalysis.row.analysis_updated_at||latestAnalysis.row.updated_at||row.analysis_updated_at;
          replacements.set(current.index,row);
        }
        return;
      }
      identities.forEach((item,key)=>{
        const row=clone(item.row),stableId=`${originalId}__${hash(`${originalId}|${key}`)}`;
        const latestAnalysis=latestAnalysisByIdentity.get(key);
        if(latestAnalysis&&analysisTime(latestAnalysis.row)>analysisTime(row)){
          row.analysis_data=clone(latestAnalysis.row.analysis_data);
          row.analysis_updated_at=latestAnalysis.row.analysis_updated_at||latestAnalysis.row.updated_at||row.analysis_updated_at;
        }
        row.measurement_data={...row.measurement_data,_dfOriginalRecordId:originalId,id:stableId};
        if(row.analysis_data?.recordId===originalId)row.analysis_data={...row.analysis_data,recordId:stableId};
        replacements.set(item.index,row);
      });
    });
    return source.map((row,index)=>replacements.get(index)||row).filter((_,index)=>!removed.has(index));
  }

  async function fetchAllRawRows(){
    const supabase=client();
    if(!supabase||!user())return [];
    const rows=[];
    for(let from=0;;from+=PAGE_SIZE){
      const result=await supabase.from(table()).select('*')
        .order('measure_date',{ascending:false})
        .order('updated_at',{ascending:false})
        .range(from,from+PAGE_SIZE-1);
      if(result.error)throw result.error;
      const page=result.data||[];
      rows.push(...page);
      if(page.length<PAGE_SIZE)break;
    }
    return rows;
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
    const existingId=clean(existing?.measurement_data?.id);
    const nextId=clean(record?.id);
    return (existingId&&nextId&&existingId===nextId)||identityOf(existing)===identityOf(record);
  }

  function collisionMessage(receipt,existing,record){
    const oldFields=existing?.measurement_data?.data?.fields||{};
    const nextFields=record?.data?.fields||{};
    return `접수번호 ${receipt}는 이미 다른 기록에 사용 중입니다.\n\n기존: ${oldFields.company||existing?.company_name||'-'} / ${oldFields.facility||existing?.facility_name||'-'}\n현재: ${nextFields.company||'-'} / ${nextFields.facility||'-'}\n\n자료가 섞이지 않도록 저장을 중단했습니다. 현재 기록의 접수번호를 확인해주세요.`;
  }

  function payloadFor(record,existing=null){
    const fields=record?.data?.fields||{},now=new Date().toISOString();
    const payload={
      receipt_no:receiptOf(record),
      measure_date:clean(fields.measureDate).slice(0,10)||null,
      company_name:clean(fields.company)||null,
      facility_name:clean(fields.facility)||null,
      record_type:record?.data?.recordType||null,
      measurement_data:record,
      measurement_updated_at:record?.updatedAt||now,
      updated_by:user()?.id||null,
      updated_at:now,
      hidden:false
    };
    if(existing?.analysis_data){
      payload.analysis_data={...existing.analysis_data,recordId:record.id};
      payload.analysis_updated_at=existing.analysis_updated_at||existing.updated_at||now;
    }
    return payload;
  }

  function forgetDeleted(receipt){
    try{window.dfV1203722ForgetDeletedReceipt?.(receipt);}catch(_){/* 선택 기능 */}
  }

  async function archiveTombstone(receipt){
    const supabase=client(),currentUser=user();
    const archivedReceipt=`__DELETED__${receipt}__${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const result=await supabase.from(table()).update({
      receipt_no:archivedReceipt,
      hidden:true,
      updated_by:currentUser.id,
      updated_at:new Date().toISOString()
    }).eq('receipt_no',receipt);
    if(result.error)throw Error(`기존 삭제표식 보관 실패: ${result.error.message||result.error}`);
  }

  async function saveDirectMeasurement(record,{forAnalysis=false}={}){
    const supabase=client(),currentUser=user(),receipt=receiptOf(record);
    if(!supabase||!currentUser)throw Error('온라인 로그인이 연결되지 않아 자료실에 저장할 수 없습니다.');
    if(!record?.data)throw Error('저장할 시료채취기록을 찾지 못했습니다.');
    if(!receipt)throw Error('시료접수번호가 없어 온라인 자료실에 저장할 수 없습니다.');

    let existing=await readServerRow(receipt);
    if(typeof dfMenuCan==='function'){
      if(forAnalysis&&!dfMenuCan('analysis',existing?.analysis_data?.values?'update':'create',true))throw Error('시료분석 저장 권한이 없습니다.');
      // LAB saves must not rewrite an already stored sampling record. In
      // particular an analysis-only employee cannot overwrite sampling data.
      if(forAnalysis&&existing?.measurement_data?.data&&!isDeleted(existing)&&sameRecord(existing,record))return true;
      if(!dfMenuCan('sample',existing?.measurement_data?.data&&!isDeleted(existing)?'update':'create',true))throw Error('시료채취기록 저장 권한이 없습니다. 먼저 담당자가 기록지를 저장해주세요.');
      if(existing&&isDeleted(existing)&&!dfMenuCan('repository','delete',true))throw Error('삭제된 접수번호를 다시 사용하려면 자료실 삭제 권한이 필요합니다.');
    }
    if(existing&&!isDeleted(existing)&&!sameRecord(existing,record))throw Error(collisionMessage(receipt,existing,record));
    if(existing&&isDeleted(existing)){
      await archiveTombstone(receipt);
      existing=null;
    }

    const saved=await supabase.from(table()).upsert(payloadFor(record,existing),{onConflict:'receipt_no'});
    if(saved.error)throw saved.error;
    forgetDeleted(receipt);

    const verified=await readServerRow(receipt);
    if(!verified||isDeleted(verified)||verified.hidden===true)throw Error('저장 직후 서버 확인에 실패했습니다. 자료실 저장을 다시 시도해주세요.');
    if(clean(verified?.measurement_data?.id)!==clean(record.id))throw Error('같은 접수번호의 다른 기록이 서버에 남아 있어 저장을 중단했습니다.');
    return true;
  }

  function savedRecords(){
    try{return typeof readRecordStore==='function'?readRecordStore():[];}
    catch(_){return [];}
  }

  function recordById(recordId){
    return savedRecords().find(record=>clean(record?.id)===clean(recordId))||null;
  }

  function loadGuards(){
    try{
      const value=JSON.parse(localStorage.getItem(GUARD_KEY)||'{}');
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    }catch(_){return {};}
  }

  async function retryPendingSaves(){
    if(retryRunning||!client()||!user())return {retried:0,failed:0};
    retryRunning=true;
    let retried=0,failed=0;
    try{
      const guards=loadGuards();
      for(const guard of Object.values(guards).slice(0,20)){
        const record=guard?.record||recordById(guard?.id);
        const receipt=receiptOf(record);
        if(!record?.data||!receipt)continue;
        try{
          const server=await readServerRow(receipt);
          const confirmed=server&&!isDeleted(server)&&clean(server?.measurement_data?.id)===clean(record.id)&&rowTime(server)>=timestamp(record.updatedAt||record.createdAt);
          if(confirmed)continue;
          await saveDirectMeasurement(record);
          retried++;
        }catch(error){
          failed++;
          window.DF_DIAG?.warn('REPOSITORY-RETRY-12037166','확정 저장자료 재전송 보류',`${receipt} / ${error?.message||error}`);
        }
      }
      return {retried,failed};
    }finally{retryRunning=false;}
  }

  function localReceiptConflict(){
    if(typeof collect!=='function')return null;
    const data=collect(),receipt=clean(data?.fields?.receiptNo);
    if(!receipt)return null;
    const activeId=clean(typeof currentRecordId!=='undefined'?currentRecordId:'');
    const duplicate=savedRecords().find(record=>clean(record?.id)!==activeId&&receiptOf(record)===receipt);
    return duplicate?{receipt,duplicate,data}:null;
  }

  function blockDuplicateReceiptSave(event){
    const button=event.target?.closest?.('#btnSave');
    if(!button)return;
    const conflict=localReceiptConflict();
    if(!conflict)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const oldFields=conflict.duplicate?.data?.fields||{},nextFields=conflict.data?.fields||{};
    const message=`접수번호 ${conflict.receipt}가 이 기기의 다른 기록에 이미 있습니다.\n\n기존: ${oldFields.company||'-'} / ${oldFields.facility||'-'}\n현재: ${nextFields.company||'-'} / ${nextFields.facility||'-'}\n\n같은 접수번호로 저장하면 자료실과 여지대장이 섞이므로 저장하지 않았습니다.`;
    const status=document.getElementById('saveStatus');
    if(status)status.textContent=`저장 중단 · 접수번호 ${conflict.receipt} 중복`;
    alert(message);
  }

  // 여지대장 행의 memo에 저장한 RID와 현재 시료 기록 ID를 우선 대조한다.
  function ledgerMatchesRecord(entry,value){
    if(!entry)return false;
    const record=recordData(value),data=record?.data||record||{},fields=data?.fields||{};
    const recordId=clean(record?.id||value?.measurement_data?.id);
    const linkedId=clean(entry.memo).match(/^RID:(.+)$/)?.[1]||'';
    if(linkedId&&recordId)return linkedId===recordId;
    const entryCompany=normalizeName(entry.company_name),recordCompany=normalizeName(fields.company||value?.company_name);
    const entryFacility=normalizeFacility(entry.facility_name),recordFacility=normalizeFacility(fields.facility||value?.facility_name);
    if(entryCompany&&recordCompany&&entryCompany!==recordCompany)return false;
    if(entryFacility&&recordFacility&&entryFacility!==recordFacility)return false;
    return true;
  }

  function patchRepository(){
    if(window.dfV12037166RepositoryPatched)return true;
    if(typeof dfRepoFetch!=='function'||typeof dfRepoUpsertMeasurement!=='function'||typeof dfRepoUpsertAnalysis!=='function'||typeof dfRepositorySync!=='function')return false;
    const baseMeasurement=dfRepoUpsertMeasurement;
    const baseAnalysis=dfRepoUpsertAnalysis;
    const baseSync=dfRepositorySync;

    dfRepoFetch=async function dfV12037166FetchIdentitySafe(){
      return normalizeFetchedRows(await fetchAllRawRows());
    };

    dfRepoUpsertMeasurement=async function dfV12037166UpsertMeasurement(record,options){
      if(options?.quiet===true)return baseMeasurement.apply(this,arguments);
      return saveDirectMeasurement(record);
    };

    dfRepoUpsertAnalysis=async function dfV12037166UpsertAnalysis(recordId){
      const record=recordById(recordId);
      if(record)await saveDirectMeasurement(record,{forAnalysis:true});
      const result=await baseAnalysis.apply(this,arguments);
      if(result===false)throw Error('LAB 자료의 온라인 저장이 거절되었습니다.');
      const receipt=receiptOf(record),verified=receipt?await readServerRow(receipt):null;
      if(record&&(!verified?.analysis_data?.values||clean(verified.analysis_data.recordId)!==clean(record.id)))throw Error('LAB 저장 직후 서버 확인에 실패했습니다.');
      return result;
    };

    dfRepositorySync=async function dfV12037166RepositorySync(options){
      await retryPendingSaves();
      return baseSync.apply(this,arguments);
    };
    window.dfRepositorySync=dfRepositorySync;
    window.dfV12037166RepositoryPatched=true;
    return true;
  }

  function replaceVersionNode(id){
    const current=document.getElementById(id);
    if(!current||current.dataset.v12037166Owner==='1')return current;
    const replacement=current.cloneNode(true);
    replacement.dataset.v12037166Owner='1';
    current.replaceWith(replacement);
    return replacement;
  }

  function applyVersion(){
    const side=document.getElementById('dfBuildVersionStatic');
    const footer=document.getElementById('dfFooterVersion');
    if(side){
      if(side.textContent!==VERSION_LABEL)side.textContent=VERSION_LABEL;
      side.title='이 문구가 보이면 v120.37.16.6 파일이 적용된 상태입니다.';
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

  function patchFilterRefresh(){
    const original=document.getElementById('dfFilterRefresh');
    if(!original||original.dataset.v12037166Refresh==='1')return true;
    const button=original.cloneNode(true);
    button.dataset.v12037166Refresh='1';
    original.replaceWith(button);
    button.addEventListener('click',async()=>{
      const oldText=button.textContent;
      button.disabled=true;
      button.textContent='새로고침 중';
      try{
        if(typeof window.dfFilterReload!=='function')throw Error('여지대장 조회 기능을 찾지 못했습니다.');
        await window.dfFilterReload();
        await delay(80);
        const body=document.getElementById('dfFilterTbody');
        if(String(body?.textContent||'').includes('DB 준비가 필요합니다'))return;
        window.dfFilterRenderAnnualPage?.();
      }catch(error){
        alert(`여지관리대장 새로고침 실패\n${error?.message||error}`);
      }finally{
        button.disabled=false;
        button.textContent=oldText;
      }
    });
    return true;
  }

  function bindFilterRecovery(){
    document.querySelector('[data-lab-module="filter-ledger"]')?.addEventListener('click',()=>{
      [350,900,1600].forEach(wait=>setTimeout(()=>{
        const body=document.getElementById('dfFilterTbody');
        if(body?.querySelector('tr[data-filter-receipt]'))window.dfFilterRenderAnnualPage?.();
      },wait));
    });
    document.getElementById('dfFilterLabApply')?.addEventListener('click',()=>setTimeout(()=>window.dfFilterRenderAnnualPage?.(),900));
  }

  function diagnoseLocalDuplicates(){
    const byReceipt=new Map(),conflicts=[];
    savedRecords().forEach(record=>{
      const receipt=receiptOf(record);
      if(!receipt)return;
      if(byReceipt.has(receipt))conflicts.push({receipt,first:byReceipt.get(receipt),second:record});
      else byReceipt.set(receipt,record);
    });
    if(conflicts.length){
      window.DF_DIAG?.warn('RECEIPT-DUPLICATE-12037166',`이 기기의 중복 접수번호 ${conflicts.length}건 · 자동삭제하지 않음`,conflicts.map(x=>x.receipt).join(', '));
    }
    return conflicts;
  }

  function init(){
    patchRepository();
    ownVersionDisplay();
    patchFilterRefresh();
    bindFilterRecovery();
    diagnoseLocalDuplicates();
    document.addEventListener('click',blockDuplicateReceiptSave,true);
    [180,700,1600,3200,6500].forEach(wait=>setTimeout(()=>{
      patchRepository();
      patchFilterRefresh();
      applyVersion();
    },wait));
    window.DF_DIAG?.info(
      'DATA-CONSISTENCY-12037166',
      '자료실·시료기록·먼지여지대장 연결키 보호 적용 완료',
      '직접저장 재확인 / 중복 접수번호 차단 / RID 여지연결 / 새로고침 완료 후 렌더'
    );
  }

  window.dfV1203726NormalizeFetchedRows=normalizeFetchedRows;
  window.dfV1203726LedgerMatchesRecord=ledgerMatchesRecord;
  window.dfV1203726SaveDirectMeasurement=saveDirectMeasurement;
  window.dfV1203726RetryPendingSaves=retryPendingSaves;
  window.dfV1203726FindLocalReceiptConflict=localReceiptConflict;
  window.dfV1203726PatchRepository=patchRepository;
  window.dfV1203726PatchFilterRefresh=patchFilterRefresh;
  window.dfV1203726ApplyVersion=applyVersion;

  patchRepository();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
