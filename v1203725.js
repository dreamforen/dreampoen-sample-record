// ==========================================================
// DREAMFOREN v120.37.16.5
// 자료실 전체조회 + 직접 저장 확정 + 여지 새로고침 안정화
// - 자료실을 1,000건 단위로 끝까지 읽어 오래된 기록도 목록에 표시한다.
// - 사용자가 직접 저장한 기록만 삭제표식/숨김 이력에서 안전하게 복구한다.
// - 자동 동기화는 삭제자료를 되살리지 않는 기존 보호 규칙을 유지한다.
// ==========================================================
(function dfV12037165RepositoryAndFilterRefresh(){
  'use strict';

  const VERSION='v120.37.16.5';
  const PAGE_SIZE=1000;
  const clean=value=>String(value??'').trim();

  function supabaseClient(){
    try{return typeof dfSupabase!=='undefined'?dfSupabase:null;}
    catch(_){return null;}
  }

  function cloudUser(){
    try{return typeof dfCloudUser!=='undefined'?dfCloudUser:null;}
    catch(_){return null;}
  }

  function repositoryTable(){
    try{return typeof DF_REPOSITORY_TABLE!=='undefined'?DF_REPOSITORY_TABLE:'dreampoen_repository';}
    catch(_){return 'dreampoen_repository';}
  }

  function receiptOf(record){
    try{
      if(typeof dfRepoReceipt==='function')return clean(dfRepoReceipt(record?.data));
    }catch(_){/* 구버전 호환 */}
    return clean(record?.data?.fields?.receiptNo);
  }

  function recordById(recordId){
    try{
      if(typeof analysisSavedRecords==='function'){
        const hit=analysisSavedRecords().find(record=>clean(record?.id)===clean(recordId));
        if(hit)return hit;
      }
      if(typeof readRecordStore==='function')return readRecordStore().find(record=>clean(record?.id)===clean(recordId))||null;
    }catch(_){/* 저장목록 미준비 */}
    return null;
  }

  function isDeletedRow(row){
    try{
      if(typeof dfRepoIsDeleted==='function')return !!dfRepoIsDeleted(row);
    }catch(_){/* 직접 판별 */}
    return row?.measurement_data?.deleted===true||row?.measurement_data?._deleted===true;
  }

  function isDirectMeasurementSave(_record,options){
    // 기존 자동 업로드 경로는 항상 quiet:true를 전달한다.
    // 따라서 quiet가 아닌 호출만 사용자가 누른 '기록 저장'으로 취급한다.
    return options?.quiet!==true;
  }

  function forgetDeleted(receipt){
    try{window.dfV1203722ForgetDeletedReceipt?.(receipt);}catch(_){/* 선택 기능 */}
  }

  async function readServerRow(receipt){
    const client=supabaseClient();
    if(!client||!receipt)return null;
    const result=await client.from(repositoryTable())
      .select('receipt_no,measure_date,company_name,facility_name,record_type,measurement_data,analysis_data,measurement_updated_at,analysis_updated_at,updated_at,hidden')
      .eq('receipt_no',receipt)
      .maybeSingle();
    if(result.error)throw result.error;
    return result.data||null;
  }

  function measurementPayload(record){
    const receipt=receiptOf(record);
    const fields=record?.data?.fields||{};
    const now=new Date().toISOString();
    const safe=(fn,fallback)=>{
      try{return typeof fn==='function'?fn(record.data):fallback;}
      catch(_){return fallback;}
    };
    return {
      receipt_no:receipt,
      measure_date:safe(typeof dfRepoDate==='function'?dfRepoDate:null,clean(fields.measureDate).slice(0,10))||null,
      company_name:safe(typeof dfRepoCompany==='function'?dfRepoCompany:null,clean(fields.company))||null,
      facility_name:safe(typeof dfRepoFacility==='function'?dfRepoFacility:null,clean(fields.facility))||null,
      record_type:record?.data?.recordType||null,
      measurement_data:record,
      measurement_updated_at:record?.updatedAt||now,
      updated_by:cloudUser()?.id||null,
      updated_at:now,
      hidden:false
    };
  }

  async function restoreMeasurementRow(record,{archiveTombstone=false}={}){
    const client=supabaseClient(),user=cloudUser(),receipt=receiptOf(record);
    if(!client||!user)throw Error('온라인 로그인이 연결되지 않아 자료실에 저장할 수 없습니다.');
    if(!receipt)throw Error('시료접수번호가 없어 온라인 자료실에 저장할 수 없습니다.');
    if(typeof dfMenuCan==='function'){
      const permissionRow=await readServerRow(receipt);
      if(!dfMenuCan('sample',permissionRow?.measurement_data?.data&&!isDeletedRow(permissionRow)?'update':'create',true))throw Error('시료채취기록 복원·저장 권한이 없습니다.');
      if(archiveTombstone&&!dfMenuCan('repository','delete',true))throw Error('삭제된 접수번호를 다시 사용하려면 자료실 삭제 권한이 필요합니다.');
    }

    if(archiveTombstone){
      // 삭제표식 자체는 감사 이력으로 남기고, 고유 접수번호만 별도 보관 번호로 옮긴다.
      // 일반 저장과 같은 UPDATE 권한만 사용하므로 실제 DELETE 권한에 의존하지 않는다.
      const archivedReceipt=`__DELETED__${receipt}__${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const archived=await client.from(repositoryTable()).update({
        receipt_no:archivedReceipt,
        hidden:true,
        updated_by:user.id,
        updated_at:new Date().toISOString()
      }).eq('receipt_no',receipt);
      if(archived.error)throw Error(`기존 삭제표식 보관 실패: ${archived.error.message||archived.error}`);
    }

    const saved=await client.from(repositoryTable()).upsert(measurementPayload(record),{onConflict:'receipt_no'});
    if(saved.error)throw saved.error;
    forgetDeleted(receipt);
    return true;
  }

  async function unhideAndVerify(record,{requireAnalysis=false}={}){
    const client=supabaseClient(),receipt=receiptOf(record);
    const visible=await client.from(repositoryTable()).update({hidden:false}).eq('receipt_no',receipt);
    if(visible.error)throw visible.error;
    const row=await readServerRow(receipt);
    if(!row)throw Error('서버 저장 확인 결과를 찾지 못했습니다. 다시 저장해주세요.');
    if(isDeletedRow(row))throw Error('과거 삭제표식이 남아 저장이 반영되지 않았습니다. 관리자에게 알려주세요.');
    if(row.hidden===true)throw Error('자료실 숨김 상태를 해제하지 못했습니다. 관리자에게 알려주세요.');
    if(!row.measurement_data?.data)throw Error('시료채취기록 본문이 서버에 반영되지 않았습니다.');
    if(requireAnalysis&&!row.analysis_data?.values)throw Error('시료분석 값이 서버에 반영되지 않았습니다.');
    return row;
  }

  async function fetchAllRepositoryRows(){
    const client=supabaseClient();
    if(!client||!cloudUser())return [];
    const rows=[];
    for(let from=0;;from+=PAGE_SIZE){
      const result=await client.from(repositoryTable())
        .select('*')
        .order('measure_date',{ascending:false})
        .order('updated_at',{ascending:false})
        .range(from,from+PAGE_SIZE-1);
      if(result.error)throw result.error;
      const page=result.data||[];
      rows.push(...page);
      if(page.length<PAGE_SIZE)break;
    }
    return typeof window.dfV1203722DedupeFetchedRows==='function'
      ?window.dfV1203722DedupeFetchedRows(rows)
      :rows;
  }

  function patchRepository(){
    if(window.dfV12037165RepositoryPatched)return true;
    if(typeof dfRepoFetch!=='function'||typeof dfRepoUpsertMeasurement!=='function'||typeof dfRepoUpsertAnalysis!=='function')return false;

    const baseMeasurement=dfRepoUpsertMeasurement;
    const baseAnalysis=dfRepoUpsertAnalysis;

    dfRepoFetch=fetchAllRepositoryRows;

    dfRepoUpsertMeasurement=async function dfV12037165SaveVisibleMeasurement(record,options){
      const direct=isDirectMeasurementSave(record,options);
      if(!direct)return baseMeasurement.apply(this,arguments);
      const receipt=receiptOf(record);
      if(!receipt)throw Error('시료접수번호가 없어 온라인 자료실에 저장할 수 없습니다.');

      const before=await readServerRow(receipt);
      if(typeof dfMenuCan==='function'&&!dfMenuCan('sample',before?.measurement_data?.data&&!isDeletedRow(before)?'update':'create',true))throw Error('시료채취기록 저장 권한이 없습니다.');
      let result;
      if(before&&isDeletedRow(before)){
        // DB의 삭제보호 트리거는 UPDATE로는 해제되지 않는다. 사용자가 직접 저장한
        // 이 한 건만 삭제표식을 제거한 뒤 새 행으로 확정해 자동부활은 계속 차단한다.
        result=await restoreMeasurementRow(record,{archiveTombstone:true});
      }else{
        result=await baseMeasurement.apply(this,arguments);
        if(result===false)throw Error('온라인 자료실 저장이 거절되었습니다. 접수번호와 로그인 상태를 확인해주세요.');
      }
      await unhideAndVerify(record);
      window.DF_DIAG?.info('REPOSITORY-SAVE-12037165','직접 저장 자료의 서버 반영 확인 완료',receipt);
      return result===false?true:result;
    };

    dfRepoUpsertAnalysis=async function dfV12037165SaveVisibleAnalysis(recordId){
      const record=recordById(recordId);
      if(!record)return baseAnalysis.apply(this,arguments);
      const receipt=receiptOf(record);
      if(!receipt)throw Error('시료접수번호가 없어 LAB 자료를 온라인 저장할 수 없습니다.');

      const before=await readServerRow(receipt);
      if(typeof dfMenuCan==='function'&&!dfMenuCan('analysis',before?.analysis_data?.values?'update':'create',true))throw Error('시료분석 저장 권한이 없습니다.');
      if(!before||isDeletedRow(before)||!before.measurement_data?.data){
        await restoreMeasurementRow(record,{archiveTombstone:!!before&&isDeletedRow(before)});
      }
      const result=await baseAnalysis.apply(this,arguments);
      if(result===false)throw Error('LAB 자료의 온라인 저장이 거절되었습니다.');
      await unhideAndVerify(record,{requireAnalysis:true});
      window.DF_DIAG?.info('REPOSITORY-LAB-SAVE-12037165','LAB 자료의 서버 반영 확인 완료',receipt);
      return result;
    };

    window.dfV12037165RepositoryPatched=true;
    return true;
  }

  function init(){
    patchRepository();
    [180,700,1600].forEach(wait=>setTimeout(patchRepository,wait));
    window.DF_DIAG?.info(
      'REPOSITORY-FILTER-12037165',
      '자료실 전체조회·직접 저장 확인·여지 새로고침 보호 준비 완료',
      '1,000건 단위 전체조회 / 직접 저장만 삭제표식 복구 / 자동부활 차단 유지'
    );
  }

  window.dfV1203725FetchAllRepositoryRows=fetchAllRepositoryRows;
  window.dfV1203725ReadServerRow=readServerRow;
  window.dfV1203725RestoreMeasurementRow=restoreMeasurementRow;
  window.dfV1203725PatchRepository=patchRepository;

  patchRepository();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
