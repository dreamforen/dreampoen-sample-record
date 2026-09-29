/* Beta 3.8: account-scoped IndexedDB working copies. Server records remain authoritative. */
(function(window){'use strict';
 const native=window.localStorage,DB='dreampoen_company_records_v1',STORE='entries';
 const KEYS={records:'dreampoen_sample_records_v17',draft:'dreampoen_sample_draft_v17',lab:'dreampoen_lab_raw_input_v64',guards:'dreampoen_confirmed_record_guard_v12037162',deleted:'dreampoen_repository_deleted_receipts_v12012',reuse:'dreampoen_receipt_reuse_intent_v12037167',day:'dreampoen_sample_workday_v1124',outbox:'df_company_outbox_v1',history:'df_company_draft_history_v1'};
 KEYS.confirmed='df_company_confirmed_v1';
 const managed=new Set(Object.values(KEYS)),maps=new Set([KEYS.lab,KEYS.guards,KEYS.reuse,KEYS.outbox,KEYS.history,KEYS.confirmed]);
 let db=null,owner='',active=false,epoch=0,flight=null,lastError=null,readyFlight=null;
 const values=new Map(),versions=new Map(),dirty=new Map(),confirmed=new Map();
 const parse=(v,fallback)=>{try{return JSON.parse(v)||fallback;}catch(_){return fallback;}};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const key=(name,id='')=>name+'\n'+id;
 const full=name=>owner+'\n'+name;
 const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('기기 저장이 취소되었습니다.'));});
 const transaction=mode=>{try{return db.transaction(STORE,mode,mode==='readwrite'?{durability:'strict'}:undefined);}catch(error){if(error instanceof TypeError)return db.transaction(STORE,mode);throw error;}};
 function notify(){window.dispatchEvent(new CustomEvent('df:storage-state',{detail:status()}));}
 function status(){return {active,owner,pending:dirty.size,busy:!!flight,error:lastError?.message||'',durable:active&&!!db&&!dirty.size&&!lastError};}
 function open(){return new Promise((resolve,reject)=>{
  if(!window.indexedDB)return reject(Error('이 브라우저에서 기기 보관함을 사용할 수 없습니다.'));
  const req=indexedDB.open(DB,1),timer=setTimeout(()=>reject(Error('기기 보관함 연결이 지연되었습니다. 다른 탭을 닫고 다시 시도해주세요.')),12000);
  req.onupgradeneeded=()=>{const s=req.result.createObjectStore(STORE,{keyPath:'key'});s.createIndex('owner','owner',{unique:false});};
  req.onsuccess=()=>{clearTimeout(timer);db=req.result;db.onversionchange=()=>{db.close();db=null;lastError=Error('보관함이 갱신되었습니다. 미전송 내용을 백업한 뒤 페이지를 다시 열어주세요.');notify();};resolve(db);};
  req.onerror=()=>{clearTimeout(timer);reject(req.error);};req.onblocked=()=>{clearTimeout(timer);reject(Error('다른 탭에서 보관함을 사용 중입니다. 해당 탭을 닫고 다시 시도해주세요.'));};
 });}
 function explode(name,text){
  if(name===KEYS.records){const seen=new Map();return new Map(parse(text,[]).map((r,i)=>{const id=String(r.id||'legacy_'+i),count=seen.get(id)||0;seen.set(id,count+1);return [key(name,id+(count?'\nduplicate:'+count:'')),JSON.stringify(r)];}));}
  if(maps.has(name))return new Map(Object.entries(parse(text,{})).map(([id,v])=>[key(name,id),JSON.stringify(v)]));
  return text===null?new Map():new Map([[key(name),String(text)]]);
 }
 function assemble(name){
  const entries=[...values].filter(([k])=>k.startsWith(name+'\n'));
  if(name===KEYS.records)return entries.length?JSON.stringify(entries.map(([,v])=>JSON.parse(v))):null;
  if(maps.has(name))return entries.length?JSON.stringify(Object.fromEntries(entries.map(([k,v])=>[k.slice(name.length+1),JSON.parse(v)]))):null;
  return values.get(key(name))??null;
 }
 function stage(k,value){
  if((values.get(k)??null)===value)return;
  if(value===null)values.delete(k);else values.set(k,value);
  dirty.set(k,{value,base:versions.get(k)||0});lastError=null;schedule();
 }
 function set(name,text){
  if(!managed.has(name))return text===null?native.removeItem(name):native.setItem(name,text);
  // Startup compatibility code runs before account activation; it cannot alter migration sources.
  if(!active)return;
  if(name===KEYS.draft&&text===null){
   const draft=assemble(name);if(draft){const history=parse(assemble(KEYS.history),{});history[new Date().toISOString()+'_'+Math.random().toString(36).slice(2)]={savedAt:new Date().toISOString(),draft:parse(draft,{}),reason:'draft-replaced'};set(KEYS.history,JSON.stringify(history));}
  }
  const next=explode(name,text),old=[...values.keys()].filter(k=>k.startsWith(name+'\n'));
  old.forEach(k=>{if(!next.has(k))stage(k,null);});next.forEach((v,k)=>stage(k,v));
 }
 function get(name){if(!managed.has(name))return native.getItem(name);return active?assemble(name):native.getItem(name);}
 const facade={getItem:name=>get(String(name)),setItem:(name,value)=>set(String(name),String(value)),removeItem:name=>set(String(name),null),
  key(index){return [...new Set([...Array.from({length:native.length},(_,i)=>native.key(i)),...managed])][index]??null;},
  get length(){return new Set([...Array.from({length:native.length},(_,i)=>native.key(i)),...managed]).size;}};
 async function drain(){
  if(flight)return flight;if(!dirty.size)return true;
  if(!db){lastError=Error('기기 저장을 확인하지 못했습니다. 서버 저장 또는 복구파일 백업이 필요합니다.');notify();throw lastError;}
  const generation=epoch,account=owner,todo=[...dirty].map(([name,e])=>({name,...e}));
  flight=(async()=>{
   const tx=transaction('readwrite'),s=tx.objectStore(STORE),complete=done(tx);let conflict=null;
   for(const item of todo){
    const req=s.get(account+'\n'+item.name);req.onsuccess=()=>{
     const current=req.result,rev=current?.rev||0;
     if(rev!==item.base){conflict=Error('다른 탭에서 같은 자료를 수정했습니다. 현재 내용을 복구파일로 보관하고 최신 자료를 다시 열어주세요.');tx.abort();return;}
     // Keep revision tombstones, so another tab cannot recreate a removed stale entry.
     s.put({key:account+'\n'+item.name,owner:account,name:item.name,value:item.value,rev:rev+1,time:Date.now()});
    };
   }
   try{await complete;}catch(error){throw conflict||error;}
   if(generation!==epoch)return true;
   for(const item of todo){versions.set(item.name,item.base+1);const latest=dirty.get(item.name);if(latest?.value===item.value)dirty.delete(item.name);else if(latest)latest.base=item.base+1;}
   lastError=null;channel?.postMessage({owner:account});return true;
  })().catch(error=>{if(generation===epoch)lastError=error;throw error;}).finally(()=>{flight=null;notify();});
  return flight;
 }
 function schedule(){Promise.resolve().then(()=>{if(!flight&&dirty.size&&!lastError)drain().then(()=>{if(dirty.size)schedule();}).catch(()=>{});});notify();}
 async function flush(){await readyFlight;if(!active)throw Error('로그인 후 저장해주세요.');while(dirty.size)await drain();return true;}
 async function load(){
  const account=owner,generation=epoch,tx=db.transaction(STORE,'readonly');const rows=await request(tx.objectStore(STORE).index('owner').getAll(account));
  if(generation!==epoch)return;
  for(const row of rows){if(dirty.has(row.name))continue;versions.set(row.name,row.rev||0);if(row.value===null)values.delete(row.name);else values.set(row.name,row.value);}
 }
 async function migrate(account=owner){
  const sources=Object.fromEntries([...managed].map(k=>[k,native.getItem(k)]).filter(([,v])=>v!==null));if(!Object.keys(sources).length)return;
  const scoped=name=>account+'\n'+name,tx=transaction('readwrite'),s=tx.objectStore(STORE),complete=done(tx);let imported=false;
  const claim=s.get('__legacy_owner__');claim.onsuccess=()=>{
   if(claim.result&&claim.result.value!==account)return;
   const marker=s.get(scoped('__migration__'));marker.onsuccess=()=>{
    if(marker.result)return;
    imported=true;s.put({key:'__legacy_owner__',owner:'__meta__',name:'owner',value:account,rev:1});
    s.put({key:scoped('__migration__'),owner:account,name:'__migration__',value:JSON.stringify(sources),rev:1});
    for(const [name,text] of Object.entries(sources))for(const [entry,value] of explode(name,text))s.put({key:scoped(entry),owner:account,name:entry,value,rev:1,time:Date.now()});
   };
  };
  await complete;if(!imported)return;
  // Verify the immutable migration backup before removing any legacy key.
  const stored=await request(db.transaction(STORE,'readonly').objectStore(STORE).index('owner').getAll(account)),byName=new Map(stored.map(row=>[row.name,row.value]));
  if(byName.get('__migration__')!==JSON.stringify(sources)||Object.entries(sources).some(([name,text])=>[...explode(name,text)].some(([entry,value])=>byName.get(entry)!==value)))throw Error('기존 자료 이전 확인에 실패했습니다. 기존 보관함은 유지합니다.');
  for(const [name,text] of Object.entries(sources))if(native.getItem(name)===text)native.removeItem(name);
 }
 async function activate(user,project=''){
  const account=String(project)+'|'+String(user);if(active&&owner===account)return status();
  if(dirty.size){try{await flush();}catch(error){throw Error('이전 계정의 미보관 내용이 있습니다. 복구파일로 백업한 뒤 계정을 전환해주세요.');}}
  const generation=++epoch;owner=account;active=false;values.clear();versions.clear();dirty.clear();confirmed.clear();lastError=null;
  readyFlight=(async()=>{
   try{if(!db)await open();if(generation!==epoch)throw Error('로그인이 변경되어 기기 보관함 연결을 중단했습니다.');await migrate(account);if(generation!==epoch)throw Error('로그인이 변경되었습니다.');await load();}
   catch(error){if(generation!==epoch)throw error;lastError=error;if(db){try{await load();}catch(_){}}for(const name of managed){const text=native.getItem(name);if(text!==null)for(const [k,v] of explode(name,text))if(!values.has(k))values.set(k,v);}}
   if(generation!==epoch)throw Error('로그인이 변경되었습니다.');
   active=true;notify();return status();
  })();return readyFlight;
 }
 async function deactivate(){if(dirty.size)await flush();active=false;owner='';epoch++;values.clear();versions.clear();confirmed.clear();notify();}
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('dreampoen_company_records_v1'):null;
 if(channel)channel.onmessage=event=>{if(active&&db&&event.data?.owner===owner)load().then(()=>window.dispatchEvent(new Event('df:storage-refreshed'))).catch(()=>{});};
 function object(name){return parse(get(name),{});}
 function putObject(name,id,value){const data=object(name);if(value===null)delete data[id];else data[id]=clone(value);set(name,JSON.stringify(data));}
 function exportRecovery(){return {format:'DREAMPOEN_RECOVERY_1',exportedAt:new Date().toISOString(),owner,values:Object.fromEntries([...managed].map(name=>[name,get(name)])),migrationBackup:parse(values.get('__migration__'),null),uncommitted:dirty.size};}
 async function digest(value){if(!window.crypto?.subtle)return null;const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;const bytes=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ordered(value))));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
 async function confirmedCopy(record){const generation=epoch,hash=await digest(record);if(hash&&generation===epoch)putObject(KEYS.confirmed,String(record.id),{hash,at:Date.now()});}
 async function prune(protectedIds=[]){
  const generation=epoch,records=parse(get(KEYS.records),[]),pin=new Set(protectedIds.filter(Boolean).map(String)),outbox=object(KEYS.outbox);
  Object.values(outbox).forEach(job=>pin.add(String(job.record?.id||job.recordId||'')));
  const proofs=object(KEYS.confirmed),candidates=[];
  for(const record of records){if(!pin.has(String(record.id))&&proofs[record.id]?.hash&&proofs[record.id].hash===await digest(record))candidates.push(record);}
  candidates.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const remove=new Map(candidates.slice(150).map(r=>[String(r.id),JSON.stringify(r)]));
  if(remove.size&&generation===epoch){const latest=parse(get(KEYS.records),[]);set(KEYS.records,JSON.stringify(latest.filter(r=>remove.get(String(r.id))!==JSON.stringify(r))));}
 }
 async function importRecovery(file){
  if(!active||file?.format!=='DREAMPOEN_RECOVERY_1'||file.owner!==owner)throw Error('현재 계정의 기기 복구파일을 선택해주세요.');
  const history=object(KEYS.history),tag=new Date().toISOString();let restored=0,conflicts=0;
  for(const [name,text] of Object.entries(file.values||{})){
   if(!managed.has(name)||name===KEYS.confirmed||text===null)continue;
   for(const [entry,value] of explode(name,text)){
    const current=values.get(entry);if(current===value)continue;
    if(current===undefined){stage(entry,value);restored++;}
    else{const incoming=parse(value,{});history[tag+'_'+conflicts]={savedAt:tag,reason:'import-conflict',entry,value:incoming,...(incoming.data?{draft:{data:incoming.autosaveData||incoming.data,recordId:incoming.id}}:{})};conflicts++;}
   }
  }
  set(KEYS.history,JSON.stringify({...object(KEYS.history),...history}));await flush();return {restored,conflicts};
 }
 window.addEventListener('beforeunload',event=>{if(dirty.size||flight){event.preventDefault();event.returnValue='';}});
 window.dfLocalStorage=facade;
 window.DF_COMPANY_STORAGE={keys:KEYS,activate,deactivate,flush,status,getItem:facade.getItem,setItem:facade.setItem,removeItem:facade.removeItem,object,putObject,exportRecovery,importRecovery,confirmedCopy,prune,
  pending:()=>Object.values(object(KEYS.outbox)),drafts:()=>[...Object.entries(object(KEYS.history)).filter(([,item])=>item.draft?.data),...parse(get(KEYS.records),[]).filter(r=>r.autosaveData&&!equal(r.data,r.autosaveData)).map(r=>['record:'+r.id,{savedAt:r.autosavedAt,draft:{data:r.autosaveData,recordId:r.id}}])],
  async cacheCatalog(rows){if(!db||!active)return;const generation=epoch,tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({key:full('__catalog__'),owner,name:'__catalog__',value:JSON.stringify(rows),rev:1});await done(tx);if(generation===epoch)values.set('__catalog__',JSON.stringify(rows));},
  catalog:()=>parse(values.get('__catalog__'),[]),
  async retry(){lastError=null;if(!db)await open();await flush();return status();}
 };
})(window);
