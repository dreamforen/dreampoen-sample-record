/* Beta 3.38: receipt corrections and explicit, version-checked replacement. */
(function(window){'use strict';
 const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
 const text=x=>String(x??'').trim(),no=r=>text(r?.data?.fields?.receiptNo);
 const inactive=r=>r?.hidden===true||[r?.measurement_data?.deleted,r?.measurement_data?._deleted].some(x=>/^(true|t|1|yes)$/i.test(text(x)));
 const idOf=r=>r?.measurement_data?.id||(r?.measurement_data?.data?'rec_repo_'+encodeURIComponent(r.receipt_no):'');
 const entity=r=>JSON.stringify([r.measure_date,r.record_type,r.measurement_data?.data?.fields?.companyDbId||r.company_name,r.measurement_data?.data?.fields?.facilityDbId||r.facility_name]);
 const ignored=k=>/^(df(?!Rect)|qpf|qif|qic|schedule|analysisRecord)/.test(k)||['companySearch','companyTrackYear','navigationCompanySearch','analysisTodayOnly','contractYear','contractSearch','contractStatus'].includes(k);
 function baselineFor(record,bases,owner){
  const matches=[...bases.entries()].filter(([key,b])=>key.startsWith('measurement:')&&b.owner===owner&&idOf(b.row)===record.id).map(([,b])=>b);
  return copy(matches.at(-1)?.row||null);
 }
 function description(row){return row?`${row.receipt_no} · ${row.company_name||'-'} / ${row.facility_name||'-'}\n측정일 ${row.measure_date||'-'} · 분석자료 ${row.analysis_data?'있음':'없음'}`:'없음';}
 function paths(a,b,model,path='',out=[]){
  if(model.equal(a,b,path))return out;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(!(path==='fields'&&ignored(k)))paths(a[k],b[k],model,path?path+'.'+k:k,out);
  }else out.push(path);
  return out;
 }
 function assign(data,path,value){const keys=path.split('.');let obj=data;for(const key of keys.slice(0,-1))obj=obj[key]||(obj[key]={});if(value===undefined)delete obj[keys.at(-1)];else obj[keys.at(-1)]=copy(value);}
 function renumber(row,receipt){if(!row)return null;const out=copy(row);out.receipt_no=receipt;if(out.measurement_data?.data?.fields)out.measurement_data.data.fields.receiptNo=receipt;return out;}
 async function reviewWithoutBase(job,row,s){
  if(!job.interactive)throw Error('수정 기준 원본이 없어 값 비교가 필요합니다. 자료실에서 저장 다시 확인을 눌러주세요.');
  const model=window.DF_SAMPLE_SAVE_MODEL,server=model.data(row),draft=job.record.data;
  const changed=paths(server,draft,model);
  if(!changed.length)return {record:copy(row.measurement_data),changed:false};
  if(!window.DF_SAMPLE_SAVE_REVIEW)throw Error('저장 비교 화면을 불러오지 못했습니다. 입력을 백업해주세요.');
  if(!window.confirm('수정 기준 원본이 없어 자동 병합할 수 없습니다.\n\n서버 값과 내 입력을 비교하여 저장할 값을 직접 선택할까요?\n선택하지 않은 서버 값은 유지하며, 저장 전 원본은 서버 이력에 보관합니다.'))throw Error('저장 값 비교를 취소했습니다. 현재 입력과 미전송 내용은 유지됩니다.');
  const chosen=await window.DF_SAMPLE_SAVE_REVIEW.choose({receipt:job.receipt,paths:changed,server:copy(server),draft:copy(draft),base:copy(server)});
  s.fence(s.client,job.owner);if(!chosen)throw Error('저장 값 선택을 보류했습니다. 현재 입력과 미전송 내용은 유지됩니다.');
  const merged=copy(server);
  for(const path of changed){if(!['draft','server'].includes(chosen[path]))throw Error('저장할 값을 모두 선택해주세요.');if(chosen[path]==='draft')assign(merged,path,model.get(draft,path));}
  const now=new Date().toISOString();
  return {changed:!model.equal(server,merged),record:{...copy(row.measurement_data),data:merged,backup:copy(server),backupAt:row.measurement_data.updatedAt||row.updated_at,updatedAt:now,autosaveData:copy(merged),autosavedAt:now}};
 }
 async function route(job,current,s){
  if(job.receiptReviewOnly)throw Error(job.receiptReviewOnly+' · 이 내용 백업으로 보관한 뒤 최신 원본에서 다시 저장해주세요.');
  const result=await s.client.from('dreampoen_repository').select('*').eq('measurement_data->>id',text(job.record.id)).limit(101);
  if(result.error)throw result.error;s.fence(s.client,job.owner);
  const matches=result.data||[];if(matches.length>100)throw Error('같은 기록 ID가 너무 많이 연결되어 있습니다. 현재 입력을 백업하고 관리자에게 확인해주세요.');
  if(job.base?.receipt_no&&!matches.some(r=>r.receipt_no===job.base.receipt_no)){
   const prior=await s.readServer(job.base.receipt_no);if(prior&&idOf(prior)===job.record.id)matches.push(prior);
  }
  if(current&&!matches.some(r=>r.receipt_no===current.receipt_no)&&idOf(current)===job.record.id)matches.push(current);
  const active=matches.filter(r=>!inactive(r)),other=active.filter(r=>text(r.receipt_no)!==job.receipt);
  const source=idOf(current)===job.record.id&&!inactive(current)?current:
   active.find(r=>r.receipt_no===job.base?.receipt_no)||active.find(r=>r.receipt_no===text(job.record.backup?.fields?.receiptNo))||active[0]||null;
  if(active.some(r=>entity(r)!==entity(source)))throw Error('같은 기록 ID가 서로 다른 업체·시설·측정일에 연결되어 있습니다. 자동 정정하지 않고 미전송 내용을 보관했습니다.');
  if(!source&&matches.length)throw Error('원본이 삭제되었거나 숨김 처리되었습니다. 이전 입력으로 자동 복원하지 않습니다.');
  if(current&&inactive(current))throw Error('삭제되었거나 숨김 처리된 접수번호입니다. 다른 접수번호를 사용해주세요.');
  const localConflicts=typeof window.readRecordStore==='function'?window.readRecordStore().filter(r=>r.id!==job.record.id&&no(r)===job.receipt):[];
  const localRecovery=localConflicts.length>0&&idOf(current)===job.record.id;
  if(!localRecovery&&localConflicts.some(r=>!current||idOf(current)!==r.id))throw Error('이 번호에 아직 서버 원본과 일치하지 않는 다른 기기 초안이 있습니다. 그 초안을 먼저 백업하거나 다른 접수번호를 사용해주세요. 초안은 삭제하지 않았습니다.');
  if(!source&&!current){if(job.base||text(job.record.backup?.fields?.receiptNo)&&no(job.record)!==text(job.record.backup.fields.receiptNo))throw Error('번호 정정의 기존 원본을 찾을 수 없습니다. 자동으로 새 기록을 만들지 않고 미전송 내용을 보관했습니다.');return null;}
  const moving=!!source&&text(source.receipt_no)!==job.receipt;
  if(moving&&job.base?.receipt_no===job.receipt)throw Error(`접수번호가 이미 ${job.receipt} → ${source.receipt_no}로 변경되었습니다. 오래된 화면에서 번호를 되돌리지 않고 입력을 보관했습니다. 최신 번호의 원본을 열어주세요.`);
  const collision=!!current&&(!source||idOf(current)!==job.record.id);
  const special=moving||collision||other.length>0||localRecovery;
  if(special&&!job.interactive)throw Error('접수번호 정정 또는 기존 기록 교체 확인이 필요합니다. 자료실에서 저장 다시 확인을 눌러주세요.');
  let prepared,forced=false,checkedSource=source;
  if(source){
   const compareJob={...job,receipt:text(source.receipt_no),record:copy(job.record),base:job.base?renumber(job.base,text(source.receipt_no)):null};
   compareJob.record.data.fields.receiptNo=compareJob.receipt;
   if(compareJob.record.backup?.fields)compareJob.record.backup.fields.receiptNo=compareJob.receipt;
   // Never normalize a baseline belonging to a different record into this source.
   if(compareJob.base&&idOf(job.base)!==job.record.id)compareJob.base=null;
   try{const checked=await s.prepareMeasurement(compareJob,source);prepared=checked.prepared;checkedSource=checked.current;}
   catch(error){if(error.code!=='DF_SAMPLE_BASE_REQUIRED')throw error;prepared=await reviewWithoutBase(compareJob,source,s);forced=true;}
  }else prepared={changed:true,record:copy(job.record)};
  if(!prepared.record.id){prepared.record.id=job.record.id;prepared.changed=true;}
  if(!special&&!forced)return {normal:true,prepared,current:checkedSource};
  const record=copy(prepared.record);record.data.fields.receiptNo=job.receipt;record.updatedAt=new Date().toISOString();record.autosavedAt=record.updatedAt;record.autosaveData=copy(record.data);
  if(collision){
   if(typeof window.dfMenuCan==='function'&&!window.dfMenuCan('repository','delete',false))throw Error('다른 기록을 교체하려면 기존 자료실 삭제 권한이 필요합니다. 권한은 변경하지 않았습니다.');
   const question=`접수번호 ${job.receipt}에 다른 기록이 있습니다.\n\n기존 기록: ${description(current)}\n\n저장할 기록: ${record.data.fields.company||'-'} / ${record.data.fields.facility||'-'}\n\n기존 측정·분석자료를 교체 이력으로 보관하고 현재 입력으로 덮어쓰시겠습니까?\n기존 분석자료는 새 기록에 합쳐지지 않습니다. 취소하면 서버 자료는 변경되지 않습니다.`;
   if(!window.confirm(question))throw Error('기존 기록 교체를 취소했습니다. 서버 원본과 미전송 입력을 유지합니다.');
  }else if(localRecovery&&!moving&&!other.length){
   if(!window.confirm(`서버에는 현재 기록 ID로 ${job.receipt} 저장이 확인됩니다.\n이 기기에 남은 같은 번호의 다른 기록/초안을 복구 이력으로 보관하고 저장 결과를 맞출까요?\n이전 초안은 지우지 않고 자료실 초안 복구에서 확인할 수 있게 보관합니다.`))throw Error('기기 사본 정리를 보류했습니다. 이전 초안과 미전송 내용은 유지됩니다.');
  }else if(moving||other.length){
   if(!window.confirm(`접수번호를 정정하여 저장할까요?\n\n${text(source.receipt_no)} → ${job.receipt}\n${description(source)}\n\n기록 ID와 기존 분석자료를 유지하여 이동하고, 정정 전 원본을 서버 이력에 보관합니다.${other.length?'\n같은 기록 ID의 이전 번호 사본도 이력으로 보관합니다.':''}\n취소하면 서버 자료는 변경되지 않습니다.`))throw Error('접수번호 정정을 취소했습니다. 서버 원본과 미전송 입력을 유지합니다.');
  }
  s.fence(s.client,job.owner);s.permission('measurement',!!source);
  if(collision&&typeof window.dfMenuCan==='function'&&!window.dfMenuCan('repository','delete',false))throw Error('확인 중 교체 권한이 변경되었습니다.');
  const sources=active.map(r=>r.receipt_no===checkedSource?.receipt_no?checkedSource:r);
  const replacedRecordIds=[...new Set(localConflicts.map(r=>r.id).concat(collision?[text(current?.measurement_data?.id)]:[]).filter(Boolean))];
  if(localRecovery&&!moving&&!other.length&&!forced&&!prepared.changed){
   const latest=await s.readServer(job.receipt);s.fence(s.client,job.owner);
   if(!window.DF_SAMPLE_SAVE_MODEL.equal(latest,checkedSource))throw Error('기기 사본 확인 중 서버 자료가 변경되었습니다. 미전송 내용을 유지하니 다시 확인해주세요.');
   return {saved:checkedSource,record:copy(checkedSource.measurement_data),replacedRecordIds,changedReceipts:[]};
  }
  const rpc=await s.client.rpc('df_sample_receipt_save_v338',{
   p_request_id:(job.requestId||'receipt')+':'+Date.now()+'_'+Math.random().toString(36).slice(2),p_source_no:source?text(source.receipt_no):null,p_target_no:job.receipt,
   p_expected_sources:sources,p_expected_target:current?.receipt_no===checkedSource?.receipt_no?checkedSource:current||null,p_record:record,p_replace:collision,
   p_intent:job.record
  });
  if(rpc.error){if(['PGRST202','42883'].includes(rpc.error.code))throw Error('접수번호 안전 저장 SQL(39번)이 아직 적용되지 않았습니다. 미전송 내용은 유지됩니다.');throw rpc.error;}
  s.fence(s.client,job.owner);
  const saved=rpc.data;if(!saved?.measurement_data?.data||saved.receipt_no!==job.receipt||saved.measurement_data.id!==job.record.id)throw Error('서버의 번호 정정 결과를 확인하지 못했습니다. 미전송 내용을 유지합니다.');
  return {saved,record,replacedRecordIds,changedReceipts:[...new Set(sources.map(r=>r.receipt_no).filter(n=>n!==job.receipt))]};
 }
 window.DF_SAMPLE_RECEIPT_SAVE=Object.freeze({version:'Beta 3.38',baselineFor,route});
})(window);
