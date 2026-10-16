/* Beta 3.36 · sampling record changes against their confirmed source. */
(function(root){'use strict';
 const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const ordered=value=>Array.isArray(value)?value.map(ordered):object(value)?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,ordered(value[key])])):value;
 const equal=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
 const text=value=>String(value??'').trim();
 const labels={gasRows:'가스 항목·채취시간',fields:'기록지',points:'측정점',metalItems:'중금속 항목',recordType:'기록 종류',selectedTeam:'팀',moist:'수분',o2vals:'산소',co2vals:'이산화탄소',comboDustPoints:'먼지 측정점',comboMetalPoints:'중금속 측정점',company:'업체명',companyDbId:'업체 연결',facility:'시설명',facilityDbId:'시설 연결',receiptNo:'접수번호',measureDate:'측정일',filterNo:'여지번호'};
 function error(message,code='DF_SAMPLE_CONFLICT'){const e=Error(message);e.code=code;return e;}
 function merge(base,current,draft,path='',conflicts=[]){
  if(equal(draft,base)||equal(draft,current))return copy(current);
  if(equal(current,base))return copy(draft);
  if(object(base)&&object(current)&&object(draft)){
   const out=copy(current);
   for(const key of new Set([...Object.keys(base),...Object.keys(draft)])){
    const value=merge(base[key],current[key],draft[key],path?path+'.'+key:key,conflicts);
    if(value===undefined)delete out[key];else out[key]=value;
   }
   return out;
  }
  conflicts.push(path);return copy(current);
 }
 function data(row){
  const record=row?.measurement_data;
  if(row?._dfSummary||record?._dfSummary||!object(record?.data))throw error('전체 저장 원본을 확인할 수 없습니다. 자료실에서 원본을 열어주세요.','DF_SAMPLE_BASE_REQUIRED');
  const out=copy(record.data),fields=out.fields||(out.fields={});
  if(!object(fields))throw error('기록지 항목 구조를 확인할 수 없습니다. 현재 입력을 백업해주세요.','DF_SAMPLE_BASE_REQUIRED');
  for(const [key,value] of Object.entries({receiptNo:row.receipt_no,measureDate:row.measure_date,company:row.company_name,facility:row.facility_name}))if(!fields[key])fields[key]=value||'';
  if(!out.recordType)out.recordType=row.record_type;
  return out;
 }
 function validate(row,draft,no){
  if(row.hidden===true||[row.measurement_data?.deleted,row.measurement_data?._deleted].some(value=>/^(true|t|1|yes)$/i.test(text(value))))throw error('삭제되었거나 숨김 처리된 자료입니다. 미전송 내용을 보관하고 관리자에게 확인해주세요.','DF_SAMPLE_INACTIVE');
  if(!object(draft?.data)||draft._dfSummary||!text(draft.id)||text(draft.data.fields?.receiptNo)!==no||text(row.receipt_no)!==no)throw error('저장 원본의 접수번호를 확인할 수 없습니다. 현재 입력을 백업해주세요.','DF_SAMPLE_IDENTITY');
  if(text(row.measurement_data?.id)&&text(row.measurement_data.id)!==text(draft.id))throw error('같은 접수번호에 다른 기록이 연결되어 있습니다. 미전송 내용은 보관했습니다.','DF_SAMPLE_IDENTITY');
  const inner=text(row.measurement_data?.data?.fields?.receiptNo);
  if(inner&&inner!==no)throw error('서버 원본의 접수번호 연결이 다릅니다. 미전송 내용은 보관했습니다.','DF_SAMPLE_IDENTITY');
 }
 function prepare(base,row,draft,no,now){
  validate(row,draft,no);
  const current=data(row);let prior;
  if(equal(current,draft.data))return {record:copy(row.measurement_data),changed:false};
  // A manual save carries its immediate previous confirmed data as backup.
  // It also makes consecutive saves safe when the first request is still in flight.
  if(object(draft.backup)&&equal(current,draft.backup))prior=current;
  else if(base){
   validate(base,draft,no);prior=data(base);
  }else throw error('수정 기준 원본이 없어 자동으로 합칠 수 없습니다. 미전송 내용을 백업한 뒤 자료실에서 최신 원본을 열어주세요.','DF_SAMPLE_BASE_REQUIRED');
  const conflicts=[],merged=merge(prior,current,draft.data,'',conflicts);
  if(conflicts.length){
   const paths=[...new Set(conflicts.map(path=>path.split('.').map(key=>labels[key]||key).join(' · ')))];
   const e=error('같은 항목이 다른 곳에서도 수정되어 저장을 보류했습니다. 확인할 항목: '+paths.join(', ')+'\n현재 입력과 미전송 내용은 유지됩니다. 자료실의 저장 상태에서 이 내용을 백업한 뒤 최신 자료와 비교해주세요.');
   e.paths=conflicts;throw e;
  }
  const record={...copy(row.measurement_data),id:row.measurement_data.id||draft.id,data:merged,updatedAt:now,autosavedAt:now,autosaveData:copy(merged),backup:copy(current),backupAt:row.measurement_data.updatedAt||row.measurement_updated_at||row.updated_at};
  return {record,changed:!equal(current,merged)};
 }
 const api=Object.freeze({version:'Beta 3.36',equal,merge,prepare});
 if(typeof module==='object'&&module.exports)module.exports=api;else root.DF_SAMPLE_SAVE_MODEL=api;
})(typeof window==='undefined'?globalThis:window);
