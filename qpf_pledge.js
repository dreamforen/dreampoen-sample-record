/* DFEN-QPF-01-03 (01): original template and read-only staff archives. */
(function(){'use strict';
 const CODE='DFEN-QPF-01-03',BUCKET='quality-documents',TABLE='quality_documents',PACK='dreamforen.pledges.v1';
 const state={active:false,busy:false,rows:[],pending:[],identity:null,load:0};
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const db=()=>typeof dfSupabase!=='undefined'?dfSupabase:null,user=()=>typeof dfCloudUser!=='undefined'?dfCloudUser:null;
 function can(action){const p=typeof dfCloudProfile!=='undefined'?dfCloudProfile:null;return !!user()&&(window.DFMenuPermissions?window.DFMenuPermissions.can('quality-forms',action,action==='view'||p?.role==='admin'||p?.access_permissions?.quality_edit===true):action==='view'||p?.role==='admin'||p?.access_permissions?.quality_edit===true);}
 function context(id,write=false){if(!db()||!user()||user().id!==id)throw Error('로그인이 변경되었습니다. 서약서 폴더를 다시 열어주세요.');if(!can('view')||write&&(!can('create')||!can('upload')))throw Error('서약서 '+(write?'등록':'조회')+' 권한이 없습니다.');return db();}
 function info(row){try{const m=JSON.parse(row.content);return m.schema===PACK&&['template','archive'].includes(m.role)?m:null;}catch{return null;}}
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 async function idFor(entry){const h=await digest(new TextEncoder().encode(CODE+'|'+entry.role+'|'+entry.employee+'|'+entry.sha256));return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
 function message(text,error=false){if(!$('qpfPledgeStatus'))return;$('qpfPledgeStatus').textContent=text;$('qpfPledgeStatus').classList.toggle('error',error);}
 function render(){
  if(!$('qpfPledgePane'))return;
  const write=can('create')&&can('upload');$('qpfPledgeChoose').hidden=!write;$('qpfPledgeChoose').disabled=state.busy;$('qpfPledgeRefresh').disabled=state.busy;
  $('qpfPledgeQueue').hidden=!state.pending.length;$('qpfPledgeRegister').disabled=state.busy||!write;$('qpfPledgeClear').disabled=state.busy;
  $('qpfPledgePending').innerHTML=state.pending.map((e,i)=>`<tr><td>${esc(e.name)}</td><td><select data-role="${i}" aria-label="${esc(e.name)} 구분" ${state.busy?'disabled':''}><option value="template" ${e.role==='template'?'selected':''}>작성용 빈 양식</option><option value="archive" ${e.role==='archive'?'selected':''}>직원 보관본</option></select></td><td><input data-person="${i}" aria-label="직원 이름" maxlength="60" value="${esc(e.employee)}" ${e.role==='template'||state.busy?'disabled':''}></td></tr>`).join('');
  const query=($('qpfPledgeSearch').value||'').trim().toLowerCase();
  for(const role of ['template','archive']){
   const list=state.rows.filter(r=>{const m=info(r);return m?.role===role&&(!query||[r.file_name,m.employee].join(' ').toLowerCase().includes(query));});
   $('qpfPledge'+(role==='template'?'Templates':'Archives')).innerHTML=list.map(r=>{const m=info(r);return `<article class="qpf-pledge-file"><div><strong>${role==='archive'?esc(m.employee):'작성용 빈 양식'}</strong><p>${esc(r.file_name)}</p><small>${(Number(r.file_size)/1024).toFixed(1)} KB · 등록 ${esc(String(r.created_at||'').slice(0,10))}${role==='archive'?' · 원본 보관':''}</small></div><button type="button" data-download="${esc(r.id)}">${role==='archive'?'원본 내려받기':'양식 내려받기'}</button></article>`;}).join('')||'<p class="qpf-pledge-empty">'+(query?'검색 결과가 없습니다.':'등록된 '+(role==='template'?'빈 양식':'보관본')+'이 없습니다.')+'</p>';
   $('qpfPledge'+(role==='template'?'TemplateCount':'ArchiveCount')).textContent=state.rows.filter(r=>info(r)?.role===role).length;
  }
 }
 async function reload(){
  const identity=state.identity,token=++state.load,api=context(identity);let rows=[];
  // Avoid silent truncation when the archive grows beyond the server page size.
  for(let from=0;;from+=500){context(identity);const r=await api.from(TABLE).select('*').eq('category','quality_form').eq('doc_no',CODE).order('created_at',{ascending:false}).order('id').range(from,from+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)break;}
  context(identity);if(token!==state.load||!state.active)return;state.rows=rows;render();
 }
 async function prepare(files){
  if(state.busy)return;const identity=state.identity;context(identity,true);state.busy=true;render();message('파일 확인 중…');
  try{
   const entries=[];let bytes=0;
   if(files.length>100)throw Error('한 번에 100개까지 등록할 수 있습니다.');
   for(const file of files){
    if(file.size>75*1024*1024)throw Error('파일이 너무 큽니다.');
    if(/\.json$/i.test(file.name)){
     const pack=JSON.parse(await file.text());if(pack.format!==PACK||!Array.isArray(pack.files)||!pack.files.length||pack.files.length>100)throw Error('서약서 가져오기 파일을 확인하세요.');
     for(const item of pack.files){
      if(typeof item.data!=='string'||item.data.length>70*1024*1024||!['template','archive'].includes(item.role)||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('서약서 묶음 정보가 올바르지 않습니다.');
      const raw=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));entries.push({name:String(item.name),role:item.role,employee:String(item.employee||''),bytes:raw,expected:item.sha256});
     }
    }else{const person=file.name.match(/서약서\s*\(([^)]+)\)\.[^.]+$/);entries.push({name:file.name,role:person?'archive':'template',employee:person?person[1].trim():'',bytes:new Uint8Array(await file.arrayBuffer())});}
   }
   if(entries.length>100)throw Error('한 번에 100개까지 등록할 수 있습니다.');
   for(const e of entries){
    bytes+=e.bytes.length;if(!e.bytes.length||e.bytes.length>50*1024*1024||bytes>75*1024*1024)throw Error('파일당 50MB, 묶음당 75MB 이내로 등록하세요.');
    if(!/\.(hwp|hwpx|pdf)$/i.test(e.name)||/[\\/]/.test(e.name)||e.name.length>240)throw Error('HWP, HWPX, PDF 원본 파일을 선택하세요.');
    e.sha256=await digest(e.bytes);if(e.expected&&e.expected!==e.sha256)throw Error(e.name+'의 원본 확인에 실패했습니다.');
    if(e.employee.length>60||e.role==='archive'&&!e.employee.trim())throw Error('보관본의 직원 이름을 확인하세요.');
   }
   context(identity,true);state.pending=entries;message(entries.length+'개 파일을 확인했습니다. 구분과 직원 이름을 확인하고 등록하세요.');
  }finally{state.busy=false;render();}
 }
 async function storeEntry(e,identity){
  const api=context(identity,true),id=await idFor(e),path='quality_form/pledges/'+e.role+'/'+id+'.'+e.name.split('.').pop().toLowerCase();
  async function existing(){context(identity,true);const found=await api.from(TABLE).select('*').eq('id',id).maybeSingle();if(found.error)throw found.error;if(!found.data)return false;const m=info(found.data);if(m?.sha256!==e.sha256||m?.role!==e.role||m?.employee!==e.employee)throw Error('기존 등록 정보가 다릅니다. 관리자에게 확인해주세요.');return true;}
  if(await existing())return 'skip';
  context(identity,true);const mime=/\.pdf$/i.test(e.name)?'application/pdf':/\.hwpx$/i.test(e.name)?'application/hwp+zip':'application/x-hwp';
  const uploaded=await api.storage.from(BUCKET).upload(path,new Blob([e.bytes],{type:mime}),{contentType:mime,upsert:false});
  if(uploaded.error){
   if(await existing())return 'skip';
   // Recover a previously uploaded original after a lost network response.
   context(identity,true);const original=await api.storage.from(BUCKET).download(path);
   if(original.error||await digest(await original.data.arrayBuffer())!==e.sha256)throw Error('원본 업로드 실패: '+uploaded.error.message);
  }
  try{
   context(identity,true);const result=await api.from(TABLE).insert({id,category:'quality_form',doc_no:CODE,title:e.role==='template'?'서약서 · 작성용 빈 양식':'서약서 · '+e.employee+' · 보관용',version:'01',status:'active',content:JSON.stringify({schema:PACK,role:e.role,employee:e.employee,sha256:e.sha256}),file_name:e.name,storage_path:path,mime_type:mime,file_size:e.bytes.length,created_by:identity,updated_by:identity});
   if(result.error)throw result.error;return 'saved';
  }catch(error){
   // A timed-out response may already have committed. Never delete that original.
   let committed;try{committed=await existing();}catch{throw Error('등록 응답을 확인하지 못했습니다. 새로고침 후 다시 등록하세요. 원본 경로: '+path);}
   if(committed)return 'saved';
   if(uploaded.error)throw error;
   const cleanup=await api.storage.from(BUCKET).remove([path]);if(cleanup.error)throw Error('문서정보 저장 실패. 업로드 파일 정리가 필요합니다: '+path+' · '+error.message);throw error;
  }
 }
 async function register(){
  if(state.busy||!state.pending.length)return;const identity=state.identity;context(identity,true);
  for(const e of state.pending){e.employee=e.role==='template'?'':e.employee.trim();if(e.role==='archive'&&!e.employee)throw Error('보관본의 직원 이름을 입력하세요.');}
  state.busy=true;render();let saved=0,skipped=0;const failures=[];
  try{
   const all=state.pending.slice();for(let i=0;i<all.length;i++){
    message((i+1)+' / '+all.length+' 등록 중…');
    try{const result=await storeEntry(all[i],identity);if(result==='skip')skipped++;else saved++;state.pending=state.pending.filter(x=>x!==all[i]);}
    catch(e){failures.push(all[i].name+': '+(e.message||e));if(user()?.id!==identity||!can('upload')||!can('create'))break;}
   }
   await reload();message('등록 '+saved+'개 · 기존 파일 '+skipped+'개'+(failures.length?'\n미완료 '+state.pending.length+'개\n'+failures.join('\n'):' · 완료'),!!failures.length);
  }finally{state.busy=false;render();}
 }
 async function download(id){const identity=state.identity,api=context(identity),row=state.rows.find(r=>r.id===id);if(!row)return;const result=await api.storage.from(BUCKET).download(row.storage_path);if(result.error)throw result.error;context(identity);if(await digest(await result.data.arrayBuffer())!==info(row).sha256)throw Error('원본 확인에 실패했습니다. 다시 조회해주세요.');const url=URL.createObjectURL(result.data),a=document.createElement('a');a.href=url;a.download=row.file_name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const run=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>message(e.message||String(e),true));
 function ensure(){
  if($('qpfPledgePane'))return $('qpfPledgePane');const root=$('dfQualityFormWorkspace');if(!root)return null;
  const pane=document.createElement('section');pane.id='qpfPledgePane';pane.hidden=true;pane.innerHTML=`<div class="qpf-pledge-toolbar"><button type="button" id="qpfPledgeChoose">서약서 파일 등록</button><button type="button" id="qpfPledgeRefresh">새로고침</button><input id="qpfPledgeSearch" type="search" placeholder="직원 이름 / 파일명 검색"><input id="qpfPledgeInput" type="file" accept=".json,.hwp,.hwpx,.pdf" multiple hidden></div><p id="qpfPledgeStatus" role="status" aria-live="polite"></p><section id="qpfPledgeQueue" hidden><h3>등록할 파일 확인</h3><p>가져오기 파일 또는 원본 HWP·HWPX·PDF를 선택할 수 있습니다. 같은 원본은 중복 등록하지 않습니다.</p><div class="qpf-pledge-scroll"><table><thead><tr><th>파일명</th><th>구분</th><th>직원 이름</th></tr></thead><tbody id="qpfPledgePending"></tbody></table></div><button type="button" id="qpfPledgeRegister">확인한 파일 등록</button><button type="button" id="qpfPledgeClear">선택 취소</button></section><h3>작성용 빈 양식 <span id="qpfPledgeTemplateCount">0</span></h3><p>양식을 내려받아 한글에서 작성한 뒤 직원 보관본으로 등록하세요.</p><div id="qpfPledgeTemplates"></div><h3>직원별 보관본 <span id="qpfPledgeArchiveCount">0</span></h3><p>작성·서명된 원본을 보관합니다. 등록한 파일의 내용을 덮어쓰지 않습니다.</p><div id="qpfPledgeArchives"></div>`;root.append(pane);
  $('qpfPledgeChoose').onclick=()=>{if(!state.busy)$('qpfPledgeInput').click();};$('qpfPledgeInput').onchange=run(async e=>{const files=Array.from(e.target.files);e.target.value='';await prepare(files);});
  $('qpfPledgeRefresh').onclick=run(async()=>{await reload();message('최신 등록본을 불러왔습니다.');});$('qpfPledgeSearch').oninput=render;
  $('qpfPledgeRegister').onclick=run(register);$('qpfPledgeClear').onclick=()=>{if(!state.busy){state.pending=[];render();message('파일 선택을 취소했습니다.');}};
  $('qpfPledgePending').onchange=e=>{if(state.busy)return;const role=e.target.dataset.role,person=e.target.dataset.person;if(role!==undefined){state.pending[Number(role)].role=e.target.value;render();}if(person!==undefined)state.pending[Number(person)].employee=e.target.value;};
  pane.onclick=e=>{const button=e.target.closest('[data-download]');if(button)run(()=>download(button.dataset.download))();};return pane;
 }
 function open(){
  if(state.busy)return window.alert('서약서 등록을 마친 후 다시 열어주세요.');
  if(!can('view'))return window.alert('작성용 품질문서 조회 권한이 없습니다.');
  window.DF_QPF_FORMS?.open();const pane=ensure();if(!pane)return;
  state.active=true;state.identity=user().id;state.rows=[];state.pending=[];window.DF_QPF_FORMS.state.view='qpf-pledge';
  $('qpfFolderPane').hidden=true;$('qpfLedgerPane').hidden=true;pane.hidden=false;
  if($('dfDocTitle'))$('dfDocTitle').textContent='DFEN-QPF-01-03 (01) 서약서';if($('dfDocDescription'))$('dfDocDescription').textContent='작성용 빈 양식 · 직원별 서약서 원본 보관';if($('dfDocBack'))$('dfDocBack').textContent='← 작성용 품질문서';
  render();message('서약서 불러오는 중…');run(async()=>{await reload();message('');})();
 }
 function close(){state.active=false;state.load++;if($('qpfPledgePane'))$('qpfPledgePane').hidden=true;if(!state.busy)state.pending=[];}
 document.addEventListener('df:menu-permissions-changed',()=>{if(user()?.id!==state.identity||!can('view')){state.rows=[];state.pending=[];close();}render();});
 window.DF_QPF_PLEDGE={open,close,confirmDiscard:()=>!state.busy&&(state.pending.length===0||confirm('등록하지 않은 파일 선택을 취소하고 이동할까요?'))};
})();
