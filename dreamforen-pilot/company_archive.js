/* Beta 3.39: receive current device records while preserving the existing receipt-safe saves. */
(function(window,document){'use strict';
 const TABLE='dreampoen_repository',S=window.DF_COMPANY_STORAGE;
 const COLUMNS='receipt_no,measure_date,company_name,facility_name,record_type,measurement_updated_at,analysis_updated_at,updated_at,hidden,measurement_id:measurement_data->>id,measurement_type:measurement_data->data->>recordType,measurement_receipt:measurement_data->data->fields->>receiptNo,company_ref:measurement_data->data->fields->>companyDbId,facility_ref:measurement_data->data->fields->>facilityDbId,measurement_deleted:measurement_data->>deleted,measurement_old_deleted:measurement_data->>_deleted,team:measurement_data->data->>selectedTeam,field_team:measurement_data->data->fields->>team,analysis_id:analysis_data->>recordId,analysis_saved_at:analysis_data->>savedAt';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const same=(a,b)=>{const order=x=>Array.isArray(x)?x.map(order):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,order(x[k])])):x;return JSON.stringify(order(a))===JSON.stringify(order(b));};
 const api=()=>typeof dfSupabase!=='undefined'?dfSupabase:null,user=()=>typeof dfCloudUser!=='undefined'?dfCloudUser:null;
 const receipt=record=>String(record?.data?.fields?.receiptNo||'').trim();
 const deleted=row=>row?.measurement_data?.deleted===true||row?.measurement_data?._deleted===true;
 const stamp=row=>row?.updated_at||null;
 let catalogue=[],catalogueOwner='',readSerial=0,loadingLab=0,installDone=false;
 const bases=new Map(),flights=new Map(),saves=new Map();
 function identity(){return String(user()?.id||'');}
 function fence(client,id){if(api()!==client||identity()!==id)throw Error('로그인이 변경되어 자료 처리를 중단했습니다.');}
 function normalize(rows){return typeof window.dfV1203726NormalizeFetchedRows==='function'?window.dfV1203726NormalizeFetchedRows(rows):rows;}
 function summary(row){
  const isDeleted=row.measurement_deleted==='true'||row.measurement_old_deleted==='true';
  const id=row.measurement_id||row.analysis_id||'rec_repo_'+encodeURIComponent(row.receipt_no);
  return {...row,_dfSummary:true,measurement_data:isDeleted?{deleted:true}:row.measurement_id||row.measurement_updated_at||row.measurement_type||row.measurement_receipt?{
   id,updatedAt:row.measurement_updated_at||row.updated_at,_dfSummary:true,data:{recordType:row.record_type,selectedTeam:row.team||row.field_team,fields:{receiptNo:row.receipt_no,measureDate:row.measure_date,company:row.company_name,facility:row.facility_name,companyDbId:row.company_ref||'',facilityDbId:row.facility_ref||'',team:row.field_team||row.team}}
  }:null,analysis_data:row.analysis_id||row.analysis_updated_at||row.analysis_saved_at?{recordId:row.analysis_id||id,_dfSummary:true}:null};
 }
 function currentCatalog(){return catalogueOwner===identity()?catalogue:[];}
 async function pages(columns){
  const client=api(),id=identity();if(!client||!id)throw Error('로그인 후 자료를 조회해주세요.');const rows=[];
  for(let from=0;;from+=500){const result=await client.from(TABLE).select(columns).order('measure_date',{ascending:false}).order('updated_at',{ascending:false}).order('receipt_no',{ascending:true}).range(from,from+499);if(result.error)throw result.error;fence(client,id);rows.push(...(result.data||[]));if((result.data||[]).length<500)break;}
  return rows;
 }
 async function fetchCatalog(){
  const id=identity();const rows=normalize((await pages(COLUMNS)).map(summary));if(id!==identity())throw Error('로그인이 변경되었습니다.');
  catalogue=rows;catalogueOwner=id;S.cacheCatalog(rows).catch(()=>{});await window.DF_RECORD_SYNC?.refresh(rows);return rows;
 }
 async function readServer(no){const client=api(),id=identity();if(!client||!id)throw Error('온라인 연결을 확인해주세요.');const result=await client.from(TABLE).select('*').eq('receipt_no',no).maybeSingle();if(result.error)throw result.error;fence(client,id);return result.data;}
 function remember(row,kind){if(row?.receipt_no&&kind)bases.set(kind+':'+String(row.receipt_no),{owner:identity(),row:clone(row)});}
 function baseline(no,kind){const b=bases.get(kind+':'+no);return b?.owner===identity()?b.row:null;}
 async function getRecord(no,{kind='measurement',syncContext=null}={}){
  const id=identity(),client=api(),key=id+'|'+kind+'|'+no+'|'+(syncContext?.mode||'background');if(flights.has(key))return flights.get(key);
  const work=(async()=>{
   const context=syncContext||window.DF_RECORD_SYNC?.capture(no,{kind});if(context)context.readToken=window.DF_RECORD_SYNC?.begin(no);
   const row=await readServer(no);fence(client,id);if(!row||deleted(row)||row.hidden===true){const e=Error('삭제되었거나 조회할 수 없는 자료입니다. 자료실을 새로고침해주세요.');e.code=row?'DF_RECORD_INACTIVE':'DF_RECORD_MISSING';throw e;}
   let full=clone(row);const known=currentCatalog().find(r=>String(r.receipt_no)===String(no));
   if(full.measurement_data?.data&&!full.measurement_data.id)full.measurement_data.id=known?.measurement_data?.id||'rec_repo_'+encodeURIComponent(no);
   if(known?.measurement_data?.id&&full.measurement_data?.data&&(known.measurement_data.id===full.measurement_data.id||known.measurement_data._dfOriginalRecordId===full.measurement_data.id)){const old=full.measurement_data.id;full.measurement_data.id=known.measurement_data.id;if(full.analysis_data?.recordId===old)full.analysis_data.recordId=known.measurement_data.id;}
   if(full.measurement_data?.data){const record=full.measurement_data,data=record.data,fields=data.fields||(data.fields={});for(const [name,value] of Object.entries({receiptNo:no,measureDate:full.measure_date,company:full.company_name,facility:full.facility_name}))if(!fields[name])fields[name]=value||'';if(!data.recordType)data.recordType=full.record_type;if(!record.updatedAt)record.updatedAt=full.measurement_updated_at||full.updated_at;}
   if(typeof dfRepositoryRows!=='undefined'){const i=dfRepositoryRows.findIndex(r=>String(r.receipt_no)===String(no));if(i>=0)dfRepositoryRows[i]=full;}
   const received=full.measurement_data?.data&&window.DF_RECORD_SYNC?await window.DF_RECORD_SYNC.receive(full,context):null;
   if(received?.row)full=clone(received.row);
   if(!received||(kind==='analysis'?!received.analysisProtected:!received.measurementProtected))remember(full,kind);
   if(full.measurement_data?.data){if(!received)dfRepoMergeCloud([full]);await S.confirmedCopy(typeof dfRepoCompactRecord==='function'?dfRepoCompactRecord(full.measurement_data):full.measurement_data);await S.prune([typeof currentRecordId!=='undefined'?currentRecordId:null,typeof analysisSelectedRecordId!=='undefined'?analysisSelectedRecordId:null,full.measurement_data.id]);}
   const position=catalogue.findIndex(r=>String(r.receipt_no)===String(no));if(position>=0)catalogue[position]=summary({...full,measurement_id:full.measurement_data?.id,measurement_type:full.record_type,measurement_receipt:full.measurement_data?.data?.fields?.receiptNo,company_ref:full.measurement_data?.data?.fields?.companyDbId,facility_ref:full.measurement_data?.data?.fields?.facilityDbId,measurement_deleted:String(deleted(full)),measurement_old_deleted:'false',team:full.measurement_data?.data?.selectedTeam,analysis_id:full.analysis_data?.recordId,analysis_saved_at:full.analysis_data?.savedAt});
   fence(client,id);return full;
  })().finally(()=>flights.delete(key));flights.set(key,work);return work;
 }
 function measurements(local){
  const byReceipt=new Map(local.map(r=>[receipt(r),r]));
  for(const row of currentCatalog()){
   if(deleted(row)||row.hidden===true||!row.measurement_data?.data)continue;
   const current=byReceipt.get(String(row.receipt_no));
   if(!current||!window.DF_RECORD_SYNC?.protects(current)&&Date.parse(current.updatedAt||0)<Date.parse(row.measurement_updated_at||0))byReceipt.set(String(row.receipt_no),row.measurement_data);
  }
  return [...byReceipt.values()];
 }
 function message(text,bad=false){const el=document.getElementById('dfRepositoryStatus');if(el){el.textContent=text;el.style.color=bad?'#a53434':'';}}
 function exportJson(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function safeNo(no){return String(no||'자료').replace(/[\\/:*?"<>|]/g,'_');}
 async function backupOne(no){try{const row=await getRecord(no,{kind:null});dfRepoDownload(dfRepoFolderName(row)+'_전체백업.json',{receiptNo:no,measurement:row.measurement_data,analysis:row.analysis_data,exportedAt:new Date().toISOString()});}catch(error){alert(error.message);}}
 async function backupAll(){if(dfCloudProfile?.role!=='admin')return;try{message('전체 원본 백업을 조회 중입니다…');const rows=await pages('*');dfRepoDownload('DREAMFOREN_자료실_전체백업_'+new Date().toISOString().slice(0,10)+'.json',{version:'Beta3.8',exportedAt:new Date().toISOString(),rows});message('전체 원본 백업 다운로드 완료');}catch(error){message('백업 실패: '+error.message,true);}}
 function queue(job){if(!S.status().active||!S.status().owner.endsWith('|'+job.owner))return Promise.reject(Error('로그인이 변경되어 미전송 보관을 중단했습니다. 현재 입력을 확인해주세요.'));const prior=S.object(S.keys.outbox)[job.key];if(job.kind==='measurement'&&prior?.record?.id&&(prior.record.id!==job.record?.id||prior.receiptReviewOnly))S.putObject(S.keys.history,'pending-before-replace:'+Date.now()+':'+prior.token,{savedAt:new Date().toISOString(),reason:'pending-before-replace',job:clone(prior),draft:{data:clone(prior.record.data),recordId:prior.record.id}});S.putObject(S.keys.outbox,job.key,job);return S.flush().then(()=>true).catch(()=>false);}
 function pending(job,reason){const current=S.object(S.keys.outbox)[job.key];if(current?.token===job.token)S.putObject(S.keys.outbox,job.key,{...current,error:String(reason||''),state:'pending'});}
 async function acknowledge(job,row){
  remember(row,job.kind);const current=S.object(S.keys.outbox)[job.key];if(current?.token===job.token)S.putObject(S.keys.outbox,job.key,null);
  if(job.kind==='measurement')await S.confirmedCopy(typeof dfRepoCompactRecord==='function'?dfRepoCompactRecord(job.record):job.record);
  try{await S.flush();}catch(_){/* The server confirmed the write; a stale durable queue is reconciled on retry. */}
  renderStatus();
 }
 function reconcileMeasurement(job,row,submitted){
  if(!submitted||identity()!==job.owner||!row?.measurement_data?.data)return;
  try{
   const records=readRecordStore(),index=records.findIndex(record=>record.id===submitted.id&&receipt(record)===job.receipt);
   if(index<0||records[index].updatedAt!==submitted.updatedAt||!same(records[index].data,submitted.data))return;
   const local=records[index],saved=clone(row.measurement_data);
   if(local.autosaveData&&!same(local.autosaveData,local.data)){saved.autosaveData=clone(local.autosaveData);saved.autosavedAt=local.autosavedAt;}
   records[index]=saved;writeRecordStore(records);
   if(typeof currentRecordId!=='undefined'&&currentRecordId===submitted.id){const unchanged=typeof collect==='function'&&same(collect(),submitted.data);currentRecordId=saved.id;if(unchanged&&typeof apply==='function')apply(clone(saved.data));}
  }catch(error){window.DF_DIAG?.warn('SAMPLE-SAVE-CACHE','서버 저장 완료 · 기기 사본 갱신 보류',error.message);}
 }
 async function finishSaved(job,row,submitted){
  if(identity()!==job.owner)throw Error('로그인이 변경되어 저장 확인을 중단했습니다.');
  if(job.kind==='analysis'&&typeof window.dfFilterCommitLabSync==='function')await window.dfFilterCommitLabSync(job.record,job.values,job.filterSync);
  if(identity()!==job.owner)throw Error('로그인이 변경되어 저장 확인을 중단했습니다.');
  await acknowledge(job,row);
  if(job.kind==='measurement')reconcileMeasurement(job,row,submitted);
  window.DF_RECORD_SYNC?.accepted(row);
 }
 function permission(kind,exists){const menu=kind==='measurement'?'sample':'analysis';if(typeof dfMenuCan==='function'&&!dfMenuCan(menu,exists?'update':'create',true))throw Error('이 자료를 저장할 권한이 없습니다.');}
 async function conditionalWrite(job,payload,current){
  const client=api(),id=identity();fence(job.client,id);if(id!==job.owner)throw Error('다른 계정의 미전송 자료는 저장할 수 없습니다.');
  let query=current?client.from(TABLE).update(payload).eq('receipt_no',job.receipt):client.from(TABLE).insert(payload);
  if(current)query=stamp(current)?query.eq('updated_at',stamp(current)):query.is('updated_at',null);
  const result=await query.select('*');if(result.error)throw result.error;fence(client,id);
  if(!result.data?.length)throw Error('다른 직원 또는 기기에서 자료가 변경되었습니다. 현재 내용은 미전송함에 보관했습니다. 최신 자료를 확인해주세요.');
  return result.data[0];
 }
 function jobFor(kind,no,fields){const queued=S.object(S.keys.outbox)[kind+':'+no],prior=queued&&!queued.receiptReviewOnly&&(kind==='measurement'?queued.record?.id===fields.record?.id:queued.recordId===fields.recordId)?queued:null,related=kind==='measurement'&&fields.record?window.DF_SAMPLE_RECEIPT_SAVE?.baselineFor(fields.record,bases,identity()):null;return {kind,key:kind+':'+no,receipt:no,owner:identity(),createdAt:prior?.createdAt||new Date().toISOString(),requestId:window.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2),token:Date.now()+'_'+Math.random().toString(36).slice(2),state:'pending',base:prior?.base||baseline(no,kind)||related,...fields};}
 function serial(key,work){const old=saves.get(key),next=Promise.resolve(old).catch(()=>{}).then(work).finally(()=>{if(saves.get(key)===next)saves.delete(key);});saves.set(key,next);return next;}
 async function prepareMeasurement(job,current){
  const model=window.DF_SAMPLE_SAVE_MODEL,client=api();let row=current;
  if(!model)throw Error('저장 확인 파일을 불러오지 못했습니다. 현재 내용을 백업한 뒤 새로고침해주세요.');
  const resolutions={},proofs={};
  for(let attempt=0;attempt<4;attempt++){
   fence(client,job.owner);if(!row)throw Error('서버에서 기존 자료가 사라졌습니다. 미전송 내용은 유지됩니다.');
   permission('measurement',!!row.measurement_data);
   const currentData=model.data(row);
   for(const path of Object.keys(resolutions))if(!model.equal(proofs[path],model.get(currentData,path),path)){delete resolutions[path];delete proofs[path];}
   try{return {prepared:model.prepare(job.base,row,job.record,job.receipt,new Date().toISOString(),{resolutions}),current:row};}
   catch(error){
    if(!error.report||!window.DF_SAMPLE_SAVE_REVIEW)throw error;
    if(job.interactive===false)throw Error('저장할 값 선택이 필요합니다. 자료실에서 저장 다시 확인을 눌러주세요.');
    const selected=await window.DF_SAMPLE_SAVE_REVIEW.choose(error.report);
    fence(client,job.owner);
    if(!selected)throw Error('저장할 값 선택을 보류했습니다. 현재 입력과 미전송 내용은 유지됩니다.');
    for(const path of error.report.paths)if(selected[path]==='draft'||selected[path]==='server'){resolutions[path]=selected[path];proofs[path]=model.get(error.report.server,path);}
    row=await readServer(job.receipt);
   }
  }
  throw Error('확인 중 서버 자료가 여러 번 변경되었습니다. 미전송 내용을 유지했으니 잠시 후 다시 저장해주세요.');
 }
 async function send(job){
  let durable=await queue(job);renderStatus();
  try{
   if(!api()||identity()!==job.owner)throw Error('로그인 상태를 확인해주세요.');
   if(navigator.onLine===false)throw Error('인터넷 연결이 끊겨 미전송함에 보관했습니다.');
   if(job.receiptReviewOnly)throw Error(job.receiptReviewOnly+' · 백업 후 최신 번호의 원본에서 다시 저장해주세요.');
   let current=await readServer(job.receipt);if(job.kind!=='measurement')permission(job.kind,!!current?.analysis_data);
   if(deleted(current)&&job.kind!=='measurement')throw Error('서버에서 삭제된 접수번호입니다. 시료채취기록을 먼저 확인 후 다시 저장해주세요.');
   if(job.kind==='analysis'&&current?.measurement_data?.id&&current.measurement_data.id!==job.recordId){
    const alias=String(job.recordId||'').startsWith(current.measurement_data.id+'__')&&job.base?.measurement_data?.id===current.measurement_data.id;
    if(!alias)throw Error('이 접수번호의 시료 원본이 다른 기록으로 교체되었습니다. 이전 기록의 분석값을 합치지 않습니다. 최신 원본을 열어주세요.');
   }
   if(job.kind==='analysis'&&!job.prepared){
    const client=api();let prepared=null;
    if(typeof window.dfFilterPrepareLabSync==='function')prepared=await window.dfFilterPrepareLabSync(job.record,job.values);
    fence(client,job.owner);job={...job,values:clone(prepared?.values||job.values),filterSync:prepared?clone(prepared):null,prepared:true};durable=await queue(job);
   }
   let submitted=null;
   if(job.kind==='measurement'){
    submitted=clone(job.record);
    const helper=window.DF_SAMPLE_RECEIPT_SAVE;if(!helper)throw Error('접수번호 안전 저장 파일을 불러오지 못했습니다. 새로고침 후 다시 저장해주세요.');
    const route=await helper.route(job,current,{client:api(),fence,permission,prepareMeasurement,readServer});
    if(route?.saved){
     if(route.reused)await clearReceiptDeletion(job.receipt);
     await finishSaved({...job,record:route.record},route.saved,submitted);
     await finishReceiptChange(job,route.saved,route.changedReceipts,route.replacedRecordIds);
     return true;
    }
    if(route?.normal){
     const prepared=route.prepared;current=route.current;
     if(!prepared.changed){await finishSaved({...job,record:clone(current.measurement_data)},current,submitted);await finishReceiptChange(job,current,[]);return true;}
     // Preserve the original queued draft until the conditional write succeeds.
     job={...job,record:prepared.record};
    }else permission('measurement',false);
   }
   if(job.kind==='analysis'&&same(current?.analysis_data?.values,job.values)){await finishSaved(job,current);return true;}
   const base=job.base;
   if(current&&job.kind!=='measurement'){
    const ownPrior=job.kind==='measurement'&&same(current.measurement_data?.data,job.record.backup);
    const unchangedMeasurement=job.kind==='measurement'&&base&&same(base.measurement_data,current.measurement_data);
    if(base&&stamp(base)!==stamp(current)&&!ownPrior&&!unchangedMeasurement)throw Error('서버 자료가 작성 시작 이후 변경되었습니다. 최신 자료와 미전송 내용을 비교한 뒤 저장해주세요.');
    if(!base){
     const matches=job.kind==='measurement'?same(current.measurement_data?.data,job.record.backup):
      String(current.analysis_data?.savedAt||current.analysis_updated_at||'')===String(job.values?._cloudSavedAt||'');
     if(!matches)throw Error('서버의 기존 자료와 변경 기준을 확인할 수 없습니다. 자료실에서 최신 원본을 먼저 열어주세요. 입력 내용은 미전송함에 보관했습니다.');
    }
   }else if(!current&&base)throw Error('서버에서 기존 자료가 사라졌습니다. 자동으로 다시 만들지 않습니다. 관리자에게 확인해주세요.');
   if(job.kind==='analysis'&&!current?.measurement_data?.data)throw Error('시료채취기록을 먼저 온라인 저장해주세요.');
   const now=new Date().toISOString(),rec=job.record,fields=rec?.data?.fields||{};
   const payload=job.kind==='measurement'?{receipt_no:job.receipt,measure_date:fields.measureDate||null,company_name:fields.company||null,facility_name:fields.facility||null,record_type:rec.data.recordType||null,measurement_data:rec,measurement_updated_at:rec.updatedAt||now,updated_at:now,updated_by:job.owner,hidden:false}:
    {analysis_data:{recordId:job.recordId,values:job.values,savedAt:now},analysis_updated_at:now,updated_at:now,updated_by:job.owner};
   const saved=await conditionalWrite({...job,client:api()},payload,current);await finishSaved(job,saved,submitted);return true;
  }catch(error){pending(job,error.message);try{await S.flush();}catch(_){}renderStatus();const e=Error(error.message+(durable?'':'\n기기 보관도 확인하지 못했습니다. 창을 닫기 전에 복구파일을 다운로드해주세요.'));e.localDurable=durable;throw e;}
 }
 async function finishReceiptChange(job,row,changedReceipts,replacedRecordIds=[]){
  try{
  // A lost RPC response is also reconciled here when a retry finds the saved row.
  const changed=new Set(changedReceipts||[]),replaced=new Set(replacedRecordIds||[]),id=row?.measurement_data?.id||job.record.id;
  if(job.base?.measurement_data?.id===id&&job.base.receipt_no!==job.receipt)changed.add(job.base.receipt_no);
  if(!changed.size&&!replaced.size)return;
  const now=new Date().toISOString();
  for(const pending of S.pending())if(pending.owner===job.owner&&(pending.record?.id===id&&pending.receipt!==job.receipt||replaced.has(pending.record?.id)&&pending.receipt===job.receipt)){
   const warning=`접수번호 ${job.receipt}의 원본이 정정/교체되어 이전 기록의 자동 재전송을 중단했습니다`;
   S.putObject(S.keys.outbox,pending.key,{...pending,receiptReviewOnly:warning,correctedReceipt:job.receipt,error:warning,state:'receipt-review'});
  }
  for(const old of changed)bases.delete('measurement:'+old);
  catalogue=catalogue.filter(r=>!changed.has(r.receipt_no)&&r.receipt_no!==job.receipt);catalogue.push(clone(row));catalogueOwner=identity();
  if(typeof dfRepositoryRows!=='undefined')dfRepositoryRows=dfRepositoryRows.filter(r=>!changed.has(r.receipt_no)&&r.receipt_no!==job.receipt).concat(clone(row));
  S.putObject(S.keys.history,'receipt-change:'+now+':'+id,{savedAt:now,reason:'receipt-corrected',from:[...changed],to:job.receipt,recordId:id});
  // Local source copies no longer represent an independent online record.
  const local=readRecordStore(),kept=local.filter(r=>!(replaced.has(r.id)&&receipt(r)===job.receipt)&&!(r.id===id&&changed.has(receipt(r))&&Date.parse(r.updatedAt)<=Date.parse(job.record.updatedAt)));
  if(kept.length!==local.length){for(const r of local.filter(r=>!kept.includes(r)))S.putObject(S.keys.history,'receipt-source:'+now+':'+receipt(r),{savedAt:now,reason:'receipt-source-copy',record:clone(r),draft:{data:clone(r.autosaveData||r.data),recordId:r.id}});writeRecordStore(kept);}
  await S.cacheCatalog(catalogue);await S.flush();renderStatus();
  }catch(error){window.DF_DIAG?.warn('RECEIPT-SAVE-CACHE','온라인 정정 완료 · 기기 사본 갱신 보류',error.message);}
 }
 function saveMeasurement(record){const snapshot=clone(record),no=receipt(snapshot);if(!no)return Promise.reject(Error('시료접수번호를 입력해주세요.'));if(no==='20260916-114')return Promise.reject(Error('영구 삭제된 접수번호입니다. 다른 접수번호를 사용해주세요.'));const job=jobFor('measurement',no,{record:snapshot,interactive:true});return serial(job.owner+'|measurement-id:'+snapshot.id,()=>send(job));}
 async function saveAnalysis(recordId){
  const record=readRecordStore().find(r=>String(r.id)===String(recordId));if(!record)throw Error('시료채취기록을 먼저 열어주세요.');
  const no=receipt(record),values=clone(analysisInputCache()[recordId]||{});
  const job=jobFor('analysis',no,{recordId,record:clone(record),values});
  return serial(job.owner+'|'+job.key,()=>send(job));
 }
 async function clearReceiptDeletion(no){
  if(no==='20260916-114')return;
  try{if(S.keys.deleted){const list=JSON.parse(S.getItem(S.keys.deleted)||'[]');if(Array.isArray(list))S.setItem(S.keys.deleted,JSON.stringify(list.filter(value=>String(value)!==no)));}if(S.keys.reuse)S.putObject(S.keys.reuse,no,null);await S.flush();}
  catch(error){window.DF_DIAG?.warn('RECEIPT-REUSE-CACHE','온라인 재사용 완료 · 기기 삭제표시 갱신 보류',error.message);}
 }
 async function assertCanDelete(no){
  if(typeof dfMenuCan==='function'&&!dfMenuCan('repository','delete',dfCloudProfile?.role==='admin'))throw Error('자료실 삭제 권한이 없습니다.');
  if(!window.DF_SAMPLE_RECEIPT_SAVE?.assertDeletable)throw Error('삭제 확인 파일을 불러오지 못했습니다. 새로고침해주세요.');
  await window.DF_SAMPLE_RECEIPT_SAVE.assertDeletable(no,{client:api(),owner:identity(),fence});
 }
 async function deleteReceipt(no){
  await assertCanDelete(no);
  const current=await readServer(no);if(!current||deleted(current))return true;
  const now=new Date().toISOString(),marker={...current.measurement_data,deleted:true,_deleted:true,deletedAt:now,deletedBy:identity()};
  await conditionalWrite({receipt:no,owner:identity(),client:api()},{measurement_data:marker,analysis_data:null,measurement_updated_at:now,analysis_updated_at:now,updated_at:now,updated_by:identity()},current);
  dfRepoRememberDeleted(no);return true;
 }
 async function retryJob(key,{interactive=true}={}){const job=S.object(S.keys.outbox)[key];if(!job||job.owner!==identity())return;try{await serial(job.owner+'|'+(job.kind==='measurement'?'measurement-id:'+job.record.id:key),()=>send({...job,interactive,requestId:job.requestId||Date.now()+'_'+Math.random().toString(36).slice(2),token:Date.now()+'_'+Math.random().toString(36).slice(2)}));message(job.receipt+' 온라인 저장 확인 완료');await dfRepositorySync({quiet:true});}catch(error){message(error.message,true);}}
 function restoreDraft(value){
  if(!value?.data)return;
  if(typeof collect==='function')S.putObject(S.keys.history,new Date().toISOString(),{savedAt:new Date().toISOString(),draft:{data:clone(collect())},reason:'before-restore'});
  currentRecordId=value.recordId||null;apply(clone(value.data));S.setItem(S.keys.draft,JSON.stringify(value));v62ShowOnly('sample');document.getElementById('saveStatus').textContent='보관된 초안 복구됨 · 내용 확인 후 기록 저장';
 }
 function renderStatus(){
  let panel=document.getElementById('dfCompanyStoragePanel');const host=document.querySelector('.df-repository-help');if(!host)return;
  if(!panel){panel=document.createElement('details');panel.id='dfCompanyStoragePanel';panel.style.cssText='margin:12px 0;padding:12px;border:1px solid #d0d5dd;border-radius:10px;background:#f8fafc';panel.innerHTML='<summary>저장 상태 · 미전송 자료 · 초안 복구</summary><p data-storage-status></p><button type="button" data-storage-backup>기기 복구파일 다운로드</button> <button type="button" data-storage-retry>기기 보관 다시 확인</button><div data-pending-list></div><div data-draft-list></div>';host.after(panel);panel.querySelector('[data-storage-backup]').onclick=()=>exportJson('DREAMFOREN_기기복구_'+new Date().toISOString().slice(0,10)+'.json',S.exportRecovery());panel.querySelector('[data-storage-retry]').onclick=()=>S.retry().then(renderStatus).catch(error=>alert(error.message));}
  if(!panel.querySelector('[data-storage-import]')){const label=document.createElement('label');label.style.cssText='display:block;margin:10px 0';label.textContent='기기 복구파일 불러오기 ';const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.dataset.storageImport='1';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{const result=await S.importRecovery(JSON.parse(await file.text()));renderTodayRecords();refreshAnalysisRecordList(true);renderStatus();alert(`복구 ${result.restored}건 · 기존 내용과 다른 ${result.conflicts}건은 별도로 보관했습니다.`);}catch(error){alert('복구 실패: '+error.message);}finally{input.value='';}};label.append(input);panel.querySelector('[data-pending-list]').before(label);}
  const state=S.status(),jobs=S.pending(),held=jobs.filter(j=>j.receiptReviewOnly).length;panel.querySelector('[data-storage-status]').textContent=state.error?'기기 보관 미확인: '+state.error:state.pending?'기기 보관 중…':`기기 보관 확인 · 온라인 미전송 ${jobs.length-held}건${held?' · 이전 기록 보관 '+held+'건':''}`;(panel.querySelector('[data-storage-status]')).textContent+=window.DF_SAMPLE_RECEIPT_SAVE?' · 접수번호 안전 저장 3.38.1':' · 접수번호 저장 파일 읽기 실패';if(window.DF_RECORD_SYNC)panel.querySelector('[data-storage-status]').textContent+=' · 기기 간 수신 3.39';
  const list=panel.querySelector('[data-pending-list]');list.replaceChildren();for(const job of jobs){const line=document.createElement('p'),label=document.createElement('span');label.textContent=`${job.receipt} / ${job.kind==='analysis'?'분석':'측정'} · ${job.error||'온라인 저장 대기'} `;line.append(label);const retry=document.createElement('button');retry.type='button';retry.textContent=job.receiptReviewOnly?'최신 원본 열기':'저장 다시 확인';retry.onclick=()=>job.receiptReviewOnly?window.DF_COMPANY_ARCHIVE.openMeasurement(job.correctedReceipt||job.receipt):retryJob(job.key);line.append(retry);const backup=document.createElement('button');backup.type='button';backup.textContent='이 내용 백업';backup.onclick=()=>exportJson(safeNo(job.receipt)+'_미전송.json',job);line.append(backup);list.append(line);}
  const drafts=panel.querySelector('[data-draft-list]');drafts.replaceChildren();for(const [id,item] of S.drafts().slice(-20).reverse()){const line=document.createElement('p'),button=document.createElement('button');button.type='button';button.textContent=`${item.savedAt||id} 초안 복구`;button.onclick=()=>restoreDraft(item.draft);line.append(button);drafts.append(line);}
 }
 function storageFeedback(){const st=S.status(),badge=document.getElementById('autoSaveBadge');if(badge){if(st.error)badge.textContent='기기 보관 미확인 · 자료실에서 복구파일 백업 필요';else if(st.pending)badge.textContent='작성내용 기기 보관 중…';else if(st.active&&!/온라인/.test(badge.textContent))badge.textContent='작성내용 기기 보관 확인';}renderStatus();}
 async function activate(){
  catalogue=S.catalog();catalogueOwner=identity();bases.clear();if(typeof dfRepositoryRows!=='undefined')dfRepositoryRows=catalogue;
  // Preserve legacy explicit-save protection jobs without uploading them during migration.
  const owner=identity(),jobs=S.object(S.keys.outbox),migrated=[];for(const [key,guard] of Object.entries(S.object(S.keys.guards))){if(guard?.companyStorageMigrated)continue;const record=guard?.record||readRecordStore().find(r=>String(r.id)===String(guard?.id));const no=receipt(record);if(record?.data&&no){if(!jobs['measurement:'+no])S.putObject(S.keys.outbox,'measurement:'+no,{kind:'measurement',key:'measurement:'+no,receipt:no,owner,createdAt:guard.savedAt||new Date().toISOString(),token:'migrated_'+record.id,state:'pending',base:null,record:clone(record),error:'이전 버전에서 온라인 확인을 기다리던 기록'});migrated.push([key,guard]);}}
  if(migrated.length){try{await S.flush();if(owner===identity()&&S.status().owner.endsWith('|'+owner)){for(const [key,guard] of migrated)if(same(S.object(S.keys.guards)[key],guard))S.putObject(S.keys.guards,key,{...guard,companyStorageMigrated:true});await S.flush();}}catch(_){/* Keep original guards until the pending jobs and migration flags are durable. */}}
  renderStatus();if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
 }
 function install(){
  if(installDone)return;installDone=true;
  const loadBase=window.loadAnalysisRecord;window.loadAnalysisRecord=function(record,options){
   if(window.DF_RECORD_SYNC)return window.DF_RECORD_SYNC.openAnalysis(record,options,loadBase);
   const ticket=++loadingLab,buttons=['analysisSaveBtn','analysisPrintBtn'].map(id=>document.getElementById(id)).filter(Boolean);
   if(!record?.raw?._dfSummary){buttons.forEach(b=>b.disabled=false);return loadBase.apply(this,arguments);}
   analysisSelectedRecordId=null;buttons.forEach(b=>b.disabled=true);
   const info=document.getElementById('analysisRecordInfo');if(info)info.textContent='서버에서 분석 원본을 불러오는 중…';
   return getRecord(record.fields.receiptNo,{kind:'analysis'}).then(row=>{if(ticket!==loadingLab)return;const full=analysisSavedRecords().find(r=>r.id===row.measurement_data.id);return loadBase(full,options);}).catch(error=>{if(ticket===loadingLab&&info)info.textContent='자료 조회 실패: '+error.message;}).finally(()=>{if(ticket===loadingLab)buttons.forEach(b=>b.disabled=false);});
  };
  document.addEventListener('df:storage-refreshed',()=>{renderTodayRecords();refreshAnalysisRecordList(true);renderStatus();});
  renderStatus();
 }
 window.addEventListener('df:storage-state',storageFeedback);
 window.addEventListener('online',async()=>{const owner=identity();for(const job of S.pending()){if(!owner||owner!==identity())break;if(job.owner===owner&&!job.receiptReviewOnly)await retryJob(job.key,{interactive:false});}});
 window.DF_COMPANY_ARCHIVE={fetchCatalog,getRecord,measurements,backupOne,backupAll,saveMeasurement,saveAnalysis,deleteReceipt,assertCanDelete,activate,renderStatus,retryJob,
  async openMeasurement(no){if(window.DF_RECORD_SYNC)return window.DF_RECORD_SYNC.openMeasurement(no);try{await getRecord(no);return dfRepositoryOpenMeasurement(no,{loaded:true});}catch(error){alert(error.message);return false;}},
  async openAnalysis(no){if(window.DF_RECORD_SYNC)return window.DF_RECORD_SYNC.openAnalysisReceipt(no);try{await getRecord(no,{kind:'analysis'});return dfRepositoryOpenAnalysis(no,{loaded:true});}catch(error){alert(error.message);return false;}},
  async download(no){try{await getRecord(no,{kind:null});return dfRepositoryDownloadMeasurementExcel(no,{loaded:true});}catch(error){alert(error.message);}},
  async printAnalysis(no){try{await getRecord(no,{kind:'analysis'});return dfRepositoryPrintAnalysis(no,{loaded:true});}catch(error){alert(error.message);}}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
})(window,document);


