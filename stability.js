/* Beta 3.7: bounded requests, ordered saves and foreground refresh. No write retries. */
(function(window,document){'use strict';
 const VERSION='Beta 3.7',queues=new Map(),writes=new Map(),epochs=new Map(),installed=new Set();
 let refreshTimer=0,refreshFlight=null,lastRefresh=0,stampClient=null,stampUser='',stamps=new Map();
 const identity=()=>typeof dfCloudUser!=='undefined'?String(dfCloudUser?.id||''):'';
 const client=()=>typeof dfSupabase!=='undefined'?dfSupabase:null;
 const route=()=>window.DF_NAVIGATION_GUARD?.getActive()||'';
 const log=(level,area,message,detail)=>window.DF_DIAG?.[level]?.(area,message,detail);
 const revision=scope=>epochs.get(scope)||0;
 const busy=scope=>scope?(writes.get(scope)||0)>0:[...writes.values()].some(n=>n>0);
 async function idle(scope){while(busy(scope)){await Promise.allSettled([...queues.values()].filter(x=>x.scope===scope).map(x=>x.promise));}}
 function write(scope,key,work){
  const uid=identity(),api=client(),queueKey=scope+':'+uid+':'+key,previous=queues.get(queueKey);
  writes.set(scope,(writes.get(scope)||0)+1);epochs.set(scope,revision(scope)+1);
  const item={scope,promise:null};
  item.promise=Promise.resolve(previous?.promise).catch(()=>{}).then(()=>{
   if(!uid||identity()!==uid||client()!==api)throw Error('로그인이 변경되어 저장을 중단했습니다. 입력 내용을 확인해주세요.');
   return work();
  }).finally(()=>{
   writes.set(scope,Math.max(0,(writes.get(scope)||1)-1));epochs.set(scope,revision(scope)+1);
   if(queues.get(queueKey)===item)queues.delete(queueKey);
  });
  queues.set(queueKey,item);return item.promise;
 }
 async function request(input,options={}){
  const method=String(options.method||input?.method||'GET').toUpperCase();
  const url=new URL(typeof input==='string'?input:input.url,document.baseURI);
  const parts=url.pathname.split('/').filter(Boolean),rpc=parts.indexOf('rpc');
  const area=parts[0]==='rest'?(rpc>=0?'rpc/'+(parts[rpc+1]||''):'table/'+(parts[2]||'')):parts[0]||'request';
  const duration=parts[0]==='storage'?180000:['GET','HEAD'].includes(method)?30000:60000;
  const controller=new AbortController(),signal=options.signal||input?.signal;
  let timedOut=false,timer;const started=Date.now(),view=route();
  const cancel=()=>controller.abort(signal?.reason);
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>{timedOut=true;controller.abort();},duration);
  try{
   const response=await window.fetch(input,{...options,signal:controller.signal});
   if(!response.ok||Date.now()-started>5000||window.DF_DIAG?.isEnabled?.())
    log(response.ok?'info':'warn','NETWORK',response.ok?'서버 응답':'서버 요청 실패',JSON.stringify({method,area,status:response.status,ms:Date.now()-started,view}));
   return response;
  }catch(error){
   log('warn','NETWORK',timedOut?'서버 응답시간 초과':'서버 연결 중단',JSON.stringify({method,area,ms:Date.now()-started,view,online:navigator.onLine,timeout:timedOut}));
   if(timedOut){const e=Error(['GET','HEAD'].includes(method)?'서버 조회가 지연되었습니다. 잠시 후 다시 불러와주세요.':'서버 응답이 지연되어 처리 결과를 확인하지 못했습니다. 새로고침으로 저장 여부를 확인한 뒤 다시 시도해주세요.');e.code='DF_TIMEOUT';throw e;}
   throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 function wrap(name,scope,key,snapshot=false){
  const original=window[name];if(installed.has(name)||typeof original!=='function'||original._dfStability)return;installed.add(name);
  const wrapped=function(...args){const self=this,values=snapshot?args.map((v,i)=>i===0&&v?JSON.parse(JSON.stringify(v)):v):args;return write(scope,key(values),()=>original.apply(self,values));};
  wrapped._dfStability=true;window[name]=wrapped;
 }
 function install(){
  wrap('dfRepoUpsertMeasurement','repository',a=>String(a[0]?.data?.fields?.receiptNo||a[0]?.id||''),true);
  wrap('dfRepoUpsertAnalysis','repository',a=>String(window.readRecordStore?.().find(r=>r.id===a[0])?.data?.fields?.receiptNo||'lab:'+a[0]));
  wrap('dfV68SyncCompany','company',a=>String(a[0]?.OnlineId||a[0]?.Id||''));
  wrap('dfV1131SyncSchedule','schedule',a=>String(a[0]?.OnlineId||a[0]?.Id||''));
 }
 async function changed(scope,tables){
  const api=client(),uid=identity();if(stampClient!==api||stampUser!==uid){stamps.clear();stampClient=api;stampUser=uid;}
  const parts=await Promise.all(tables.map(async table=>{
   // Facility saves also update their company. Older facility schemas lack updated_at.
   const column=table==='facilities'?'id':'updated_at';
   const result=await api.from(table).select(column,{count:'exact'}).order(column,{ascending:false}).limit(1);
   if(result.error)throw result.error;return [table,result.count,result.data?.[0]?.[column]||''];
  }));
  if(api!==client()||uid!==identity())return null;
  const stamp=JSON.stringify(parts);return stamps.get(scope)===stamp?null:stamp;
 }
 async function refresh(){
  if(refreshFlight||document.hidden||navigator.onLine===false||!identity()||busy()||window.DF_NAVIGATION_GUARD?.isRestoring())return;
  if(Date.now()-lastRefresh<5000)return;lastRefresh=Date.now();
  const view=route(),scope=['sample','analysis','repository'].includes(view)?'repository':['company','progress','navigation'].includes(view)?'company':view;
  // These readers preserve open forms; document writers keep their own explicit refresh.
  const job=['sample','analysis','repository'].includes(view)?()=>window.dfRepositorySync?.({quiet:true}):
   ['company','progress','navigation'].includes(view)&&!document.querySelector('#companyModal:not([hidden])')?()=>window.dfV70RefreshCompaniesOnline?.(false):
   view==='schedule'&&!(typeof dfV1123ScheduleDirty!=='undefined'&&dfV1123ScheduleDirty)?()=>window.dfV1101RefreshSchedulesOnline?.(false):null;
  if(!job)return;
  // Poll only count/latest timestamp. Fetch full records after an actual change.
  const tables=scope==='repository'?['dreampoen_repository']:scope==='company'?['companies','facilities']:['schedules'];
  const api=client(),uid=identity();
  refreshFlight=Promise.resolve().then(async()=>{
   const stamp=await changed(scope,tables);if(stamp===null||view!==route()||busy()||window.DF_NAVIGATION_GUARD?.isRestoring())return;
   const result=await job();if(result!==false&&api===client()&&uid===identity())stamps.set(scope,stamp);
  }).catch(e=>log('warn','FOREGROUND-SYNC','화면 최신자료 조회 실패',e.code||e.message)).finally(()=>{refreshFlight=null;});
  await refreshFlight;
 }
 function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,350);}
 function init(){
  install();[250,1200].forEach(ms=>setTimeout(install,ms));
  window.addEventListener('online',()=>{log('info','CONNECTION','네트워크 연결 복구',route());scheduleRefresh();});
  window.addEventListener('offline',()=>log('warn','CONNECTION','네트워크 연결 끊김',route()));
  window.addEventListener('focus',scheduleRefresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRefresh();});
  setInterval(refresh,30000);
  window.addEventListener('beforeunload',e=>{if(busy()){e.preventDefault();e.returnValue='';}});
  log('info','STABILITY',VERSION+' 안정화 모듈 준비','저장 순서 보호 · 조회 제한시간 · 접속 복귀 동기화');
 }
 window.DF_STABILITY={version:VERSION,fetch:request,write,idle,busy,revision,refresh:scheduleRefresh,
  canLeave:view=>!busy(['sample','analysis','repository'].includes(view)?'repository':view==='schedule-add'?'schedule':view),
  status:()=>({version:VERSION,route:route(),online:navigator.onLine,pending:[...writes].filter(x=>x[1]>0).map(([scope,count])=>({scope,count}))})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})(window,document);
