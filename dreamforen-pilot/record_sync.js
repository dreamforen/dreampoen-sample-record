/* Beta 3.39: refresh server-backed working copies without sending or discarding local work. */
(function(window,document){'use strict';
 const S=window.DF_COMPANY_STORAGE,TABLE='dreampoen_repository';
 const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
 const text=x=>String(x??'').trim(),receipt=r=>text(r?.data?.fields?.receiptNo);
 const api=()=>typeof dfSupabase!=='undefined'?dfSupabase:null,owner=()=>typeof dfCloudUser!=='undefined'?text(dfCloudUser?.id):'';
 const local=()=>typeof readRecordStore==='function'?readRecordStore():[],labs=()=>typeof analysisInputCache==='function'?analysisInputCache():{};
 const ignored=k=>/^(df(?!Rect)|qpf|qif|qic|schedule|analysisRecord)/.test(k)||['companySearch','companyTrackYear','navigationCompanySearch','analysisTodayOnly','contractYear','contractSearch','contractStatus'].includes(k);
 const relevant=d=>{const out=copy(d),sampleFields=new Set([...document.querySelectorAll('#dfViewSample input[id],#dfViewSample select[id]')].map(el=>el.id));if(out?.fields)for(const k of Object.keys(out.fields))if(ignored(k)||sampleFields.size&&!sampleFields.has(k))delete out.fields[k];return out;};
 const same=(a,b)=>window.DF_SAMPLE_SAVE_MODEL?window.DF_SAMPLE_SAVE_MODEL.equal(a,b):JSON.stringify(a)===JSON.stringify(b);
 const sameData=(a,b)=>same(relevant(a),relevant(b));
 const plain=v=>{const out=copy(v)||{};for(const k of ['_localUpdatedAt','_cloudSavedAt','_filterLedgerAt'])delete out[k];return out;};
 const inactive=r=>r?.hidden===true||[r?.measurement_data?.deleted,r?.measurement_data?._deleted].some(x=>/^(true|t|1|yes)$/i.test(text(x)));
 const version=r=>JSON.stringify([r.receipt_no,r.measurement_updated_at||'',r.analysis_updated_at||'',r.updated_at||'',r.measurement_data?.id||'',r.hidden===true,inactive(r)]);
 let sampleOpen=window.openSavedRecord,labLoad=null,sampleTicket=0,labTicket=0,refreshTimer=0,refreshFlight=null,refreshAgain=false,installed=false,labDisabled=null,shownSample=null,shownLab=null;
 const probes=new Map(),receivedRows=new Map();let readClock=0;
 function valid(context){if(context.client!==api()||context.owner!==owner()||!context.owner)throw Error('로그인이 변경되어 수신을 중단했습니다.');}
 function view(){const route=window.DF_NAVIGATION_GUARD?.getActive?.();if(route)return route;for(const [id,v] of [['dfViewSample','sample'],['dfViewAnalysis','analysis']]){const el=document.getElementById(id);if(el&&!el.hidden&&el.style?.display!=='none')return v;}return '';}
 function activeSample(){return typeof currentRecordId!=='undefined'?currentRecordId:null;}
 function activeLab(){return typeof analysisSelectedRecordId!=='undefined'?analysisSelectedRecordId:null;}
 function form(){try{return typeof collect==='function'?copy(collect()):null;}catch(_){return null;}}
 function proof(no){return S.keys.remote?S.object(S.keys.remote)[no]||null:null;}
 function jobs(no,kind){return S.pending().filter(j=>j.owner===owner()&&j.receipt===no&&j.kind===kind&&!j.receiptReviewOnly);}
 function sampleDirty(record,context){
  if(!record)return false;
  if(jobs(receipt(record),'measurement').length)return true;
  const guards=S.object(S.keys.guards);if(Object.values(guards).some(g=>!g.companyStorageMigrated&&(g.record?.id||g.id)===record.id))return true;
  if(record.autosaveData&&!sameData(record.autosaveData,record.data))return true;
  if(context?.record&&record.id===context.record.id&&!sameData(record.data,context.record.data)&&!sameData(record.data,context.receivedData))return true;
  if(activeSample()===record.id&&view()==='sample'){const data=form(),baseline=shownSample?.owner===owner()&&shownSample.client===api()&&shownSample.id===record.id?shownSample.data:record.data;if(data&&!sameData(data,baseline))return true;}
  return false;
 }
 function labDirty(id,no,remoteValues){
  if(jobs(no,'analysis').length)return true;
  const value=labs()[id];if(!value)return false;
  const base=proof(no);if(base?.recordId===id&&base.analysisKnown)return !same(plain(value),base.analysis);
  if(remoteValues&&same(plain(value),plain(remoteValues)))return false;
  // Old caches have no baseline after loadAnalysisRecord() stamped a local save.
  return !!value._localUpdatedAt||!value._cloudSavedAt;
 }
 function capture(no,options={}){const r=local().find(r=>receipt(r)===no)||local().find(r=>r.id===options.recordId);return {client:api(),owner:owner(),receipt:no,record:copy(r),sampleId:activeSample(),labId:activeLab(),sampleTicket,labTicket,mode:'background',kind:'measurement',...options};}
 function notice(kind,message){const el=document.getElementById(kind==='analysis'?'analysisSaveStatus':'saveStatus');if(el)el.textContent=message;}
 function held(no,kind){for(const job of jobs(no,kind)){const warning='다른 기기 최신 원본을 열어 이전 미전송 입력을 별도 보관했습니다';S.putObject(S.keys.outbox,job.key,{...job,receiptReviewOnly:warning,correctedReceipt:no,error:warning,state:'receipt-review'});}}
 async function preserve(record,context,kind){
  const no=receipt(record)||context.receipt,cache=labs()[record?.id];
  const draft=kind==='measurement'?{recordId:record?.id,data:activeSample()===record?.id&&view()==='sample'?form():copy(record?.autosaveData||record?.data)}:null;
  S.putObject(S.keys.history,'remote-open:'+Date.now()+':'+Math.random().toString(36).slice(2),{savedAt:new Date().toISOString(),reason:'before-remote-open',receipt:no,record:copy(record),analysis:copy(cache),...(draft?.data?{draft}:{})});
  held(no,kind);await S.flush();valid(context);
  const current=local().find(r=>r.id===record?.id&&receipt(r)===no);
  if(!same(current,record)||(draft?.data&&activeSample()===record?.id&&view()==='sample'&&!sameData(form(),draft.data))||!same(labs()[record?.id],cache))throw Error('최신 원본 확인 중 새 입력이 생겨 수신 적용을 보류했습니다. 현재 입력은 유지됩니다.');
 }
 async function receive(row,context){
  valid(context);if(context.mode==='open'&&(context.kind==='analysis'?context.labTicket!==labTicket:context.sampleTicket!==sampleTicket)){const e=Error('다른 기록을 선택하여 이전 조회를 취소했습니다.');e.code='DF_SYNC_CANCELLED';throw e;}const previous=receivedRows.get(context.owner+'|'+text(row?.receipt_no));if(previous?.client===context.client&&previous.token>context.readToken)return receive(copy(previous.row),{...context,readToken:previous.token});if(row?._dfSummary||!row?.measurement_data?.data||inactive(row))throw Error('전체 서버 원본을 확인할 수 없습니다. 현재 입력은 유지됩니다.');
  const incoming=copy(row.measurement_data),no=text(row.receipt_no);let records=local();
  let index=records.findIndex(r=>receipt(r)===no);if(index<0&&context.record?.id===incoming.id)index=records.findIndex(r=>r.id===incoming.id&&receipt(r)===receipt(context.record));
  const prior=index<0?null:records[index],sampleWork=sampleDirty(prior,{...context,receivedData:incoming.data});let analysisProtected=labDirty(prior?.id||incoming.id,no,row.analysis_data?.values),measurementProtected=sampleWork||!!prior&&prior.id!==incoming.id&&analysisProtected;
  const changed=!!prior&&(!sameData(prior.data,incoming.data)||prior.id!==incoming.id||activeSample()===prior.id&&view()==='sample'&&!sameData(form(),incoming.data)||shownLab?.id===incoming.id&&!sameData(shownLab.data,incoming.data));
  const labChanged=!same(plain(labs()[incoming.id]),plain(row.analysis_data?.values))||shownLab?.id===incoming.id&&!same(shownLab.analysis,plain(row.analysis_data?.values));
  const chosen=context.kind==='analysis'?analysisProtected:measurementProtected;
  if(context.mode==='open'&&chosen){
   if(!window.confirm('이 기기에 작성 중이거나 미전송인 내용이 있습니다.\n현재 입력을 복구 이력에 보관하고 최신 서버 원본을 열까요?\n확인하면 이전 미전송은 자동 재전송하지 않고 별도 보관합니다. 취소하면 현재 입력을 유지합니다.')){const e=Error('최신 원본 열기를 취소했습니다. 현재 입력을 유지합니다.');e.code='DF_SYNC_CANCELLED';throw e;}
   await preserve(prior||incoming,context,context.kind);if(context.kind==='analysis'){analysisProtected=false;if(!sampleWork)measurementProtected=false;}else{measurementProtected=false;if(prior&&prior.id!==incoming.id)held(receipt(prior),'analysis');}
  }
  valid(context);records=local();index=records.findIndex(r=>receipt(r)===no);if(index<0&&prior)index=records.findIndex(r=>r.id===prior.id&&receipt(r)===receipt(prior));
  // No browser-clock ordering: this row is the current, authenticated server result.
  if(!measurementProtected){if(index<0)records.push(incoming);else records[index]=incoming;writeRecordStore(records);}
  if(!analysisProtected){const cache=labs(),a=row.analysis_data;if(a?.values)cache[incoming.id]={...copy(a.values),_cloudSavedAt:a.savedAt||row.analysis_updated_at||row.updated_at};else delete cache[incoming.id];S.setItem(S.keys.lab,JSON.stringify(cache));}
  if(S.keys.remote)S.putObject(S.keys.remote,no,{recordId:incoming.id,version:version(row),analysisKnown:true,analysis:plain(row.analysis_data?.values)});
  const result={measurementProtected,analysisProtected};
  probes.set(context.owner+'|'+no,{client:context.client,version:version(row)});
  receivedRows.delete(context.owner+'|'+no);receivedRows.set(context.owner+'|'+no,{client:context.client,token:context.readToken||0,row:copy(row)});while(receivedRows.size>32)receivedRows.delete(receivedRows.keys().next().value);
  if(context.mode!=='open'){
   if(changed&&measurementProtected&&activeSample()===prior?.id)notice('measurement','다른 기기 수정 확인 · 작성 중 입력은 유지됩니다. 저장 시 변경값을 비교해주세요.');
   if(labChanged&&analysisProtected&&activeLab()===(prior?.id||incoming.id))notice('analysis','다른 기기 수정 확인 · 기기 분석 입력은 유지됩니다. 최신 원본 열기에서 비교해주세요.');
   if(!measurementProtected&&changed&&view()==='sample'&&activeSample()===prior?.id&&context.sampleId===prior?.id&&context.sampleTicket===sampleTicket){currentRecordId=incoming.id;apply(copy(incoming.data));notice('measurement','다른 기기 수정내용 수신 완료 · '+no);}
   if(!analysisProtected&&(changed||labChanged)&&view()==='analysis'&&activeLab()===(prior?.id||incoming.id)&&context.labId===activeLab()&&context.labTicket===labTicket)renderLab(incoming,{preserveLab:false});
  }
  await S.flush();valid(context);return {...result,row};
 }
 function accepted(row){
  if(!row?.measurement_data?.id||!S.keys.remote)return;
  S.putObject(S.keys.remote,row.receipt_no,{recordId:row.measurement_data.id,version:version(row),analysisKnown:true,analysis:plain(row.analysis_data?.values)});
  probes.set(owner()+'|'+row.receipt_no,{client:api(),version:version(row)});
 }
 function renderLab(record,options){if(typeof labLoad!=='function')return;const was=window.dfAnalysisLoading;window.dfAnalysisLoading=true;try{if(!record){shownLab=null;return labLoad(null,options);}const result=labLoad({id:record.id,raw:record,data:record.data,fields:record.data.fields||{},ts:record.updatedAt||'',logicalKey:receipt(record)},options);shownLab={id:record.id,analysis:plain(labs()[record.id]),data:copy(record.data)};return result;}finally{window.dfAnalysisLoading=was;}}
 async function openMeasurement(no,{navigate=true,id=null}={}){
  const ticket=++sampleTicket,context=capture(no,{mode:'open',kind:'measurement',recordId:id});
  try{
   if(navigator.onLine===false){const r=context.record;if(!r)throw Error('오프라인 상태에서는 기기에 없는 원본을 불러올 수 없습니다.');if(navigate)window.v62ShowOnly?.('sample');sampleOpen(r.id);notice('measurement','오프라인 · 기기에 보관된 기록입니다.');return true;}
   const row=await window.DF_COMPANY_ARCHIVE.getRecord(no,{kind:'measurement',syncContext:context});valid(context);if(ticket!==sampleTicket||activeSample()!==context.sampleId)return false;
   if(navigate&&window.v62ShowOnly?.('sample')===false)return false;
   sampleOpen(row.measurement_data.id);notice('measurement','최신 서버 원본 불러옴 · '+no);return true;
  }catch(error){if(ticket!==sampleTicket)return false;if(error.code==='DF_RECORD_MISSING'&&context.record&&!proof(no)&&!context.record._dfSummary){sampleOpen(context.record.id);notice('measurement','기기에 보관된 입력 · 온라인 저장을 확인해주세요.');return true;}if(error.code!=='DF_SYNC_CANCELLED')notice('measurement','최신 원본 조회 실패 · '+error.message);return false;}
 }
 async function openAnalysis(record,options,base){
  if(!labLoad)labLoad=base;if(!record){++labTicket;for(const [button,disabled] of labDisabled||[])button.disabled=disabled;labDisabled=null;return renderLab(null,options);}if(window.dfAnalysisLoading)return renderLab(record.raw||record,options);
  const no=text(record.fields?.receiptNo||record.data?.fields?.receiptNo),ticket=++labTicket,context=capture(no,{kind:'analysis',mode:'open',recordId:record.id});
  const buttons=['analysisSaveBtn','analysisPrintBtn'].map(id=>document.getElementById(id)).filter(Boolean);if(!labDisabled)labDisabled=buttons.map(b=>[b,b.disabled]);buttons.forEach(b=>b.disabled=true);analysisSelectedRecordId=null;
  try{if(navigator.onLine===false){renderLab(record.raw||record,options);notice('analysis','오프라인 · 기기에 보관된 분석자료입니다.');return;}
   const row=await window.DF_COMPANY_ARCHIVE.getRecord(no,{kind:'analysis',syncContext:context});valid(context);if(ticket!==labTicket)return;
   const cached=local().find(r=>receipt(r)===no)||row.measurement_data;renderLab(cached,{...options,preserveLab:false});notice('analysis','최신 서버 원본 불러옴 · '+no);
  }catch(error){if(ticket===labTicket){analysisSelectedRecordId=context.labId;const select=document.getElementById('analysisRecordSelect');if(select)select.value=context.labId||'';if(error.code!=='DF_SYNC_CANCELLED')notice('analysis','최신 원본 조회 실패 · '+error.message);}}
  finally{if(ticket===labTicket){for(const [button,disabled] of labDisabled||[])button.disabled=disabled;labDisabled=null;}}
 }
 async function openAnalysisReceipt(no){
  const record=local().find(r=>receipt(r)===no)||window.DF_COMPANY_ARCHIVE.measurements([]).find(r=>receipt(r)===no)||{id:null,data:{fields:{receiptNo:no}}};
  if(window.v62ShowOnly?.('analysis')===false)return false;
  return window.loadAnalysisRecord({id:record.id,raw:record,data:record.data,fields:record.data.fields||{receiptNo:no}},{preserveLab:false});
 }
 async function refresh(rows=null){
  if(document.hidden||navigator.onLine===false||!owner()||!S.status().active||window.DF_STABILITY?.busy?.('repository'))return;
  const route=view(),id=route==='sample'?activeSample():route==='analysis'?activeLab():null;if(!id)return;
  const record=local().find(r=>r.id===id);if(!record)return;
  const summary=rows?.find(r=>!inactive(r)&&r.measurement_data?.id===id)||rows?.find(r=>r.receipt_no===receipt(record));
  const no=summary?.receipt_no||receipt(record);if(!no)return;
  const context=capture(no,{recordId:id,kind:route==='analysis'?'analysis':'measurement'});
  if(summary){const seen=probes.get(owner()+'|'+no);if(seen?.client===api()&&seen.version===version(summary))return;}
  else{
   const key=context.owner+'|'+no;if(refreshFlight){refreshAgain=true;return refreshFlight;}
   refreshFlight=(async()=>{const r=await context.client.from(TABLE).select('receipt_no,measurement_updated_at,analysis_updated_at,updated_at,hidden,measurement_data:measurement_data->id').eq('receipt_no',no).maybeSingle();valid(context);if(r.error)throw r.error;const seen=probes.get(key);if(!r.data){const candidates=await context.client.from(TABLE).select('*').eq('measurement_data->>id',record._dfOriginalRecordId||record.id).limit(3);valid(context);if(candidates.error)throw candidates.error;const sameEntity=row=>{const f=row.measurement_data?.data?.fields||{},old=record.data?.fields||{};return text(row.measure_date)===text(old.measureDate)&&text(row.record_type)===text(record.data?.recordType)&&text(f.companyDbId||row.company_name)===text(old.companyDbId||old.company)&&text(f.facilityDbId||row.facility_name)===text(old.facilityDbId||old.facility);};const active=(candidates.data||[]).filter(row=>!inactive(row));if(active.length===1&&sameEntity(active[0]))await window.DF_COMPANY_ARCHIVE.getRecord(active[0].receipt_no,{kind:context.kind,syncContext:context});return;}if(seen?.client===api()&&seen.version===version({...r.data,measurement_data:{id:r.data.measurement_data}}))return;await window.DF_COMPANY_ARCHIVE.getRecord(no,{kind:context.kind,syncContext:context});})().catch(e=>window.DF_DIAG?.warn('RECORD-SYNC','최신 원본 수신 보류',e.message)).finally(()=>{refreshFlight=null;if(refreshAgain){refreshAgain=false;schedule();}});return refreshFlight;
  }
  try{await window.DF_COMPANY_ARCHIVE.getRecord(no,{kind:context.kind,syncContext:context});}catch(e){window.DF_DIAG?.warn('RECORD-SYNC','최신 원본 수신 보류',e.message);}
 }
 function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(),350);}
 function install(){
  if(installed)return;installed=true;sampleOpen=window.openSavedRecord;
  const applyBase=window.apply;if(typeof applyBase==='function')window.apply=function(data){const result=applyBase.apply(this,arguments);shownSample={owner:owner(),client:api(),id:activeSample(),data:form()||copy(data)};return result;};if(activeSample())shownSample={owner:owner(),client:api(),id:activeSample(),data:form()};
  if(typeof sampleOpen==='function')window.openSavedRecord=function(id){const r=local().find(r=>r.id===id);if(r)return openMeasurement(receipt(r),{navigate:false,id});const r2=window.DF_COMPANY_ARCHIVE.measurements([]).find(r=>r.id===id);if(r2)return openMeasurement(receipt(r2),{navigate:false,id});return false;};
  window.addEventListener('focus',schedule);window.addEventListener('online',schedule);window.addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="sample"],[data-view="analysis"],[data-view="repository"]'))schedule();},true);
  setInterval(()=>refresh(),30000);schedule();
 }
 window.DF_RECORD_SYNC={version:'3.39',begin:()=>++readClock,capture,receive,accepted,refresh,openMeasurement,openAnalysis,openAnalysisReceipt,protects:sampleDirty};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
})(window,document);
