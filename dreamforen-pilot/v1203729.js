// ==========================================================
// DREAMFOREN v120.37.16.9
// 과거 날짜 자료실 기록 → LAB 열기/계산/저장 + 먼지 양방향 연동 보정
// - 오늘 추가한 과거 측정일 기록도 날짜 필터에 막히지 않고 LAB에서 연다.
// - 구형 자료에 내부 기록 ID가 빠진 경우 동일 자료에 항상 같은 ID를 복원한다.
// - LAB 저장 시 기존 자료실/여지대장 저장 경로를 그대로 사용한다.
// - 복원 ID 기록의 여지값은 접수번호·날짜·업체·시설이 모두 같을 때만 연결한다.
// ==========================================================
(function dfV12037169PastLabAndDustSync(){
  'use strict';

  const VERSION='v120.37.16.9';
  const VERSION_LABEL=`ONLINE ${VERSION} · PAST LAB & DUST SYNC ACTIVE`;
  const RECOVERED_PREFIX='rec_repo_';
  let openSerial=0;
  let versionObserver=null;

  const clean=value=>String(value??'').trim();
  const clone=value=>{try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}};
  const normalize=value=>clean(value).normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,' ');
  const normalizeCompany=value=>normalize(value).replace(/주식회사|유한회사|㈜|\(주\)/g,'').replace(/[^0-9a-z가-힣]/g,'');
  const normalizeFacility=value=>normalize(value).replace(/[^0-9a-z가-힣]/g,'');

  function hash(value){
    let result=2166136261;
    for(const character of String(value||'')){
      result^=character.charCodeAt(0);
      result=Math.imul(result,16777619);
    }
    return (result>>>0).toString(36);
  }

  function fieldsOfRow(row){
    const fields=row?.measurement_data?.data?.fields||{};
    return {
      receipt:clean(fields.receiptNo||row?.receipt_no),
      date:clean(fields.measureDate||row?.measure_date).slice(0,10),
      company:clean(fields.company||row?.company_name),
      facility:clean(fields.facility||row?.facility_name),
      type:clean(row?.measurement_data?.data?.recordType||row?.record_type)
    };
  }

  function identityOfRow(row){
    const fields=fieldsOfRow(row);
    return [
      fields.receipt,
      fields.date,
      normalizeCompany(fields.company),
      normalizeFacility(fields.facility),
      fields.type
    ].join('|');
  }

  function recoveredId(row){
    const measurementId=clean(row?.measurement_data?.id);
    if(measurementId)return measurementId;
    const analysisId=clean(row?.analysis_data?.recordId);
    if(analysisId)return analysisId;
    return `${RECOVERED_PREFIX}${hash(identityOfRow(row))}`;
  }

  // 서버의 구형 기록은 measurement_data.id 또는 data.fields 일부가 없을 수 있다.
  // DB를 조회하는 순간에는 쓰기 작업을 하지 않고, 화면에서 사용할 복제본만 보정한다.
  function ensureRow(row){
    if(!row?.measurement_data?.data)return row;
    const next=clone(row),record=next.measurement_data;
    const data=record.data||(record.data={});
    const fields=data.fields||(data.fields={});
    const top=fieldsOfRow(row);

    record.id=recoveredId(row);
    if(!clean(record.createdAt))record.createdAt=row.measurement_updated_at||row.updated_at||'';
    if(!clean(record.updatedAt))record.updatedAt=row.measurement_updated_at||row.updated_at||record.createdAt||'';
    if(!clean(fields.receiptNo))fields.receiptNo=top.receipt;
    if(!clean(fields.measureDate))fields.measureDate=top.date;
    if(!clean(fields.company))fields.company=top.company;
    if(!clean(fields.facility))fields.facility=top.facility;
    if(!clean(data.recordType))data.recordType=top.type;
    return next;
  }

  function ensureRows(rows){
    return (Array.isArray(rows)?rows:[]).map(ensureRow);
  }

  function logicalIdentity(record){
    const data=record?.data||{},fields=data.fields||{};
    return [
      clean(fields.receiptNo),
      clean(fields.measureDate).slice(0,10),
      normalizeCompany(fields.company),
      normalizeFacility(fields.facility),
      clean(data.recordType)
    ].join('|');
  }

  function storeMeasurementRecord(record){
    if(!record?.id||!record?.data||typeof readRecordStore!=='function'||typeof writeRecordStore!=='function')return false;
    const id=clean(record.id),identity=logicalIdentity(record);
    const store=readRecordStore();
    const kept=store.filter(item=>clean(item?.id)!==id&&logicalIdentity(item)!==identity);
    kept.push(clone(record));
    writeRecordStore(kept);
    return true;
  }

  function importAnalysisValues(row,record){
    const values=row?.analysis_data?.values;
    if(!values||!record?.id||typeof analysisInputCache!=='function')return false;
    const cache=analysisInputCache();
    cache[record.id]={...values,_cloudSavedAt:row.analysis_data.savedAt||row.analysis_updated_at||row.updated_at||''};
    const key=typeof ANALYSIS_INPUT_CACHE_KEY!=='undefined'?ANALYSIS_INPUT_CACHE_KEY:'dreampoen_lab_raw_input_v64';
    localStorage.setItem(key,JSON.stringify(cache));
    return true;
  }

  function replaceRepositoryRow(receipt,row){
    try{
      if(typeof dfRepositoryRows==='undefined'||!Array.isArray(dfRepositoryRows))return;
      const index=dfRepositoryRows.findIndex(item=>clean(item?.receipt_no)===clean(receipt));
      if(index>=0)dfRepositoryRows[index]=row;
    }catch(_){/* 자료실이 아직 초기화 전이면 다음 조회에서 보정 */}
  }

  function setPastRecordFilter(row){
    const fields=fieldsOfRow(row);
    const today=document.getElementById('analysisTodayOnly');
    const date=document.getElementById('analysisRecordDate');
    const search=document.getElementById('analysisRecordSearch');
    if(today)today.checked=false;
    if(date){date.disabled=false;date.value=fields.date;}
    // 한 날짜에 기록이 많아 표시 개수를 넘어도 선택한 접수번호가 반드시 목록에 남는다.
    if(search)search.value=fields.receipt;
  }

  function analysisListItem(record){
    if(typeof analysisSavedRecords==='function'){
      const item=analysisSavedRecords().find(candidate=>clean(candidate?.id)===clean(record?.id));
      if(item)return item;
    }
    return {
      id:clean(record?.id),
      raw:record,
      data:record?.data||{},
      fields:record?.data?.fields||{},
      ts:clean(record?.updatedAt||record?.createdAt),
      logicalKey:logicalIdentity(record)
    };
  }

  function focusAnalysisRecord(record,serial){
    if(serial!==openSerial||!record?.id)return false;
    try{analysisSelectedRecordId=record.id;}catch(_){return false;}
    if(typeof refreshAnalysisRecordList==='function')refreshAnalysisRecordList(true);
    const item=analysisListItem(record);
    const select=document.getElementById('analysisRecordSelect');
    if(select){
      const records=Array.isArray(select._records)?select._records:[];
      if(!records.some(candidate=>clean(candidate?.id)===clean(item.id))){
        const option=document.createElement('option');
        option.value=item.id;
        option.textContent=`자료실 열기 · ${typeof analysisRecordLabel==='function'?analysisRecordLabel(item):fieldsOfRow({measurement_data:record}).receipt}`;
        select.appendChild(option);
        select._records=[item,...records];
      }
      select.value=item.id;
    }
    if(typeof loadAnalysisRecord==='function')loadAnalysisRecord(item,{preserveLab:false});
    return true;
  }

  async function openPastAnalysis(receipt){
    const serial=++openSerial;
    const value=clean(receipt);
    let row=null;
    try{row=(Array.isArray(dfRepositoryRows)?dfRepositoryRows:[]).find(item=>clean(item?.receipt_no)===value)||null;}
    catch(_){row=null;}
    if(!row?.measurement_data?.data){
      alert('연결할 시료채취기록을 찾지 못했습니다. 자료실을 새로고침한 뒤 다시 시도해주세요.');
      return false;
    }

    row=ensureRow(row);
    const record=row.measurement_data;
    replaceRepositoryRow(value,row);
    storeMeasurementRecord(record);
    importAnalysisValues(row,record);
    setPastRecordFilter(row);
    try{analysisSelectedRecordId=record.id;}catch(_){/* 아래 focus에서 다시 확인 */}

    if(typeof v62ShowOnly==='function')v62ShowOnly('analysis');
    focusAnalysisRecord(record,serial);

    // 화면 전환 시 실행되는 온라인 동기화가 끝난 뒤에도 같은 과거 기록을 다시 잡는다.
    // 날짜/접수번호 필터도 함께 맞춰 두므로 느린 서버에서도 오늘 기록으로 되돌아가지 않는다.
    try{
      if(typeof dfRepositorySync==='function')await dfRepositorySync({quiet:true});
    }catch(error){
      window.DF_DIAG?.warn('PAST-LAB-SYNC-12037169','과거 LAB 열기 후 자료실 재동기화 보류',error?.message||String(error));
    }
    if(serial!==openSerial)return true;

    try{
      const refreshed=(Array.isArray(dfRepositoryRows)?dfRepositoryRows:[]).find(item=>clean(item?.receipt_no)===value);
      if(refreshed?.measurement_data?.data){
        row=ensureRow(refreshed);
        replaceRepositoryRow(value,row);
        storeMeasurementRecord(row.measurement_data);
        importAnalysisValues(row,row.measurement_data);
      }
    }catch(_){/* 최초 확보한 기록을 계속 사용 */}
    setPastRecordFilter(row);
    focusAnalysisRecord(row.measurement_data,serial);
    return true;
  }

  function patchFetchedRows(){
    if(window.dfV12037169FetchPatched)return true;

    const baseNormalizer=window.dfV1203726NormalizeFetchedRows;
    window.dfV1203726NormalizeFetchedRows=function dfV12037169NormalizeWithRecoveredIds(rows){
      const normalized=typeof baseNormalizer==='function'?baseNormalizer(rows):rows;
      return ensureRows(normalized);
    };

    if(typeof dfRepoFetch==='function'){
      const baseFetch=dfRepoFetch;
      dfRepoFetch=async function dfV12037169FetchWithRecoveredIds(){
        return ensureRows(await baseFetch.apply(this,arguments));
      };
      window.dfRepoFetch=dfRepoFetch;
    }
    window.dfV12037169FetchPatched=true;
    return true;
  }

  function patchRecoveredLedgerMatch(){
    if(window.dfV12037169LedgerMatchPatched)return true;
    const baseMatch=window.dfV1203726LedgerMatchesRecord;
    if(typeof baseMatch!=='function')return false;

    window.dfV1203726LedgerMatchesRecord=function dfV12037169RecoveredLedgerMatch(entry,value){
      if(baseMatch(entry,value))return true;
      const raw=value?.measurement_data||value?.raw||value;
      const record=raw?.data?raw:null;
      if(!record||!clean(record.id).startsWith(RECOVERED_PREFIX))return false;
      const fields=record.data?.fields||{};
      return clean(entry?.receipt_no)===clean(fields.receiptNo)&&
        clean(entry?.measure_date).slice(0,10)===clean(fields.measureDate).slice(0,10)&&
        normalizeCompany(entry?.company_name)===normalizeCompany(fields.company)&&
        normalizeFacility(entry?.facility_name)===normalizeFacility(fields.facility);
    };
    window.dfV12037169LedgerMatchPatched=true;
    return true;
  }

  function patchOpenAnalysis(){
    if(window.dfV12037169OpenPatched)return true;
    if(typeof dfRepositoryOpenAnalysis!=='function')return false;
    dfRepositoryOpenAnalysis=openPastAnalysis;
    window.dfRepositoryOpenAnalysis=dfRepositoryOpenAnalysis;
    window.dfV12037169OpenPatched=true;
    return true;
  }

  function normalizeCurrentRows(){
    try{
      if(typeof dfRepositoryRows!=='undefined'&&Array.isArray(dfRepositoryRows)){
        dfRepositoryRows=ensureRows(dfRepositoryRows);
        if(typeof dfRepositoryRender==='function')dfRepositoryRender();
      }
    }catch(_){/* 로그인 후 첫 온라인 조회에서 다시 보정 */}
  }

  function replaceVersionNode(id){
    const current=document.getElementById(id);
    if(!current||current.dataset.v12037169Owner==='1')return current;
    const replacement=current.cloneNode(true);
    replacement.dataset.v12037169Owner='1';
    current.replaceWith(replacement);
    return replacement;
  }

  function applyVersion(){
    const side=document.getElementById('dfBuildVersionStatic');
    const footer=document.getElementById('dfFooterVersion');
    if(side){
      if(side.textContent!==VERSION_LABEL)side.textContent=VERSION_LABEL;
      side.title='이 문구가 보이면 과거 날짜 LAB 열기와 먼지 양방향 연동 수정본이 적용된 상태입니다.';
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
    patchFetchedRows();
    patchRecoveredLedgerMatch();
    patchOpenAnalysis();
    normalizeCurrentRows();
    ownVersionDisplay();
    [180,700,1600,3200].forEach(wait=>setTimeout(()=>{
      patchFetchedRows();
      patchRecoveredLedgerMatch();
      patchOpenAnalysis();
      applyVersion();
    },wait));
    window.DF_DIAG?.info(
      'PAST-LAB-DUST-SYNC-12037169',
      '과거 날짜 자료실 기록의 LAB 열기·계산·저장·먼지 양방향 연결 준비 완료',
      '자료실 접수번호 선택 유지 / 구형 누락 ID 안정 복원 / 측정일 기준 여지대장 반영'
    );
  }

  window.dfV1203729EnsureRepositoryRows=ensureRows;
  window.dfV1203729OpenPastAnalysis=openPastAnalysis;
  window.dfV1203729ApplyVersion=applyVersion;

  if(document.readyState==='complete')setTimeout(init,0);
  else window.addEventListener('load',init,{once:true});
})();
