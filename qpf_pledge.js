/* DFEN-QPF-01-03 (01): original template and read-only staff archives. */
(function(){'use strict';
 const CODE='DFEN-QPF-01-03',BUCKET='quality-documents',TABLE='quality_documents',PACK='dreamforen.pledges.v1';
 const state={year:new Date().getFullYear(),form:null,currentId:null,currentUpdated:null,pendingFormId:null,dirty:false,scope:'all',active:false,busy:false,rows:[],pending:[],identity:null,load:0,fitView:true,formQuery:''};
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const db=()=>typeof dfSupabase!=='undefined'?dfSupabase:null,user=()=>typeof dfCloudUser!=='undefined'?dfCloudUser:null;
 function can(action){const p=typeof dfCloudProfile!=='undefined'?dfCloudProfile:null;return !!user()&&(window.DFMenuPermissions?window.DFMenuPermissions.can('quality-forms',action,action==='view'||p?.role==='admin'||p?.access_permissions?.quality_edit===true):action==='view'||p?.role==='admin'||p?.access_permissions?.quality_edit===true);}
 function context(id,write=false){if(!db()||!user()||user().id!==id)throw Error('로그인이 변경되었습니다. 서약서 폴더를 다시 열어주세요.');if(!can('view')||write&&(!can('create')||!can('upload')))throw Error('서약서 '+(write?'등록':'조회')+' 권한이 없습니다.');return db();}
 function info(row){try{const m=JSON.parse(row.content);return m.schema===PACK&&['template','archive','web'].includes(m.role)?m:null;}catch{return null;}}
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 async function idFor(entry){const h=await digest(new TextEncoder().encode(CODE+'|'+entry.role+'|'+entry.employee+'|'+entry.sha256));return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
 function message(text,error=false){if(!$('qpfPledgeStatus'))return;$('qpfPledgeStatus').textContent=text;$('qpfPledgeStatus').classList.toggle('error',error);}
 function render(){
  if(!$('qpfPledgePane'))return;renderEditor();
  const write=can('create')&&can('upload');$('qpfPledgeChoose').hidden=!write;$('qpfPledgeChoose').disabled=state.busy;$('qpfPledgeRefresh').disabled=state.busy;
  $('qpfPledgeQueue').hidden=!state.pending.length;$('qpfPledgeRegister').disabled=state.busy||!write;$('qpfPledgeClear').disabled=state.busy;
  $('qpfPledgePending').innerHTML=state.pending.map((e,i)=>`<tr><td>${esc(e.name)}</td><td><select data-role="${i}" aria-label="${esc(e.name)} 구분" ${state.busy?'disabled':''}><option value="template" ${e.role==='template'?'selected':''}>작성용 빈 양식</option><option value="archive" ${e.role==='archive'?'selected':''}>직원 보관본</option></select></td><td><input data-person="${i}" aria-label="직원 이름" maxlength="60" value="${esc(e.employee)}" ${e.role==='template'||state.busy?'disabled':''}></td><td><input type="number" data-pledge-year="${i}" aria-label="보관 연도" min="1900" max="2200" placeholder="미지정" value="${esc(e.year||'')}" ${e.role==='template'||state.busy?'disabled':''}></td></tr>`).join('');
  renderFiles();
 }
 function fileRows(){
  const query=($('qpfPledgeSearch').value||'').trim().toLowerCase();
  return state.rows.filter(r=>{const m=info(r);return r.status!=='obsolete'&&m?.role==='archive'&&(state.scope==='all'||Number(m.record_year)===state.year)&&(!query||[r.file_name,m.employee,m.record_year].join(' ').toLowerCase().includes(query));}).sort((a,b)=>Number(info(b).record_year||0)-Number(info(a).record_year||0)||String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''))||String(a.id).localeCompare(String(b.id)));
 }
 function renderFiles(){
  const rows=fileRows();
  $('qpfPledgeUploadTitle').textContent=state.scope==='all'?'업로드 파일 전체조회':state.year+'년 업로드 자료';
  $('qpfPledgeArchiveCount').textContent=rows.length+'건';
  $('qpfPledgeUploadTarget').textContent='새 파일 등록 위치: '+state.year+'년';
  $('qpfPledgeFileMessage').textContent=state.scope==='all'?'모든 연도의 업로드 자료입니다. 연도 미지정 원본도 포함됩니다.':'현재 연도의 기존 자료입니다.';
  $('qpfPledgeArchives').innerHTML=rows.map(r=>{const m=info(r),stamp=String(r.updated_at||r.created_at||'').slice(0,10),title=r.file_name+' · '+m.employee;return `<article class="qic-file-item" data-pledge-file="${esc(r.id)}"><div class="qic-file-info" title="${esc(title)}"><strong>${esc(r.file_name)}</strong><small>${esc(m.record_year?m.record_year+'년':'연도 미지정')} · ${(Number(r.file_size)/1024).toFixed(1)} KB · ${esc(stamp)}</small></div><div class="qic-file-actions"><button type="button" data-file-action="preview" ${state.busy?'disabled':''}>미리보기</button><button type="button" data-file-action="download" data-download="${esc(r.id)}" ${state.busy?'disabled':''}>받기</button>${can('update')?'<button type="button" data-file-action="rename" '+(state.busy?'disabled':'')+'>이름</button>':''}${can('delete')?'<button type="button" class="danger" data-file-action="delete" '+(state.busy?'disabled':'')+'>삭제</button>':''}</div></article>`;}).join('')||'<div class="qic-file-empty">조회 조건에 맞는 업로드 파일이 없습니다.</div>';
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
      const raw=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));entries.push({name:String(item.name),role:item.role,employee:String(item.employee||''),year:Number(item.record_year)||null,bytes:raw,expected:item.sha256});
     }
    }else{const person=file.name.match(/서약서\s*\(([^)]+)\)\.[^.]+$/);entries.push({name:file.name,role:'archive',employee:person?person[1].trim():'',year:state.year,bytes:new Uint8Array(await file.arrayBuffer())});}
   }
   if(entries.length>100)throw Error('한 번에 100개까지 등록할 수 있습니다.');
   for(const e of entries){
    bytes+=e.bytes.length;if(!e.bytes.length||e.bytes.length>50*1024*1024||bytes>75*1024*1024)throw Error('파일당 50MB, 묶음당 75MB 이내로 등록하세요.');
    if(!/\.(hwp|hwpx|pdf)$/i.test(e.name)||/[\\/]/.test(e.name)||e.name.length>240)throw Error('HWP, HWPX, PDF 원본 파일을 선택하세요.');
    e.sha256=await digest(e.bytes);if(e.expected&&e.expected!==e.sha256)throw Error(e.name+'의 원본 확인에 실패했습니다.');
    if(e.employee.length>60)throw Error('보관본의 직원 이름을 확인하세요.');
   }
   context(identity,true);state.pending=entries;message(entries.length+'개 파일을 확인했습니다. 구분과 직원 이름을 확인하고 등록하세요.');
  }finally{state.busy=false;render();}
 }
 async function storeEntry(e,identity){
  const api=context(identity,true),id=await idFor(e),path='quality_form/pledges/'+e.role+'/'+id+'.'+e.name.split('.').pop().toLowerCase();
  async function existing(){context(identity,true);const found=await api.from(TABLE).select('*').eq('id',id).maybeSingle();if(found.error)throw found.error;if(!found.data)return false;const m=info(found.data);if(m?.sha256!==e.sha256||m?.role!==e.role||m?.employee!==e.employee)throw Error('기존 등록 정보가 다릅니다. 관리자에게 확인해주세요.');
   if(found.data.status==='obsolete'){
    if(!can('update'))throw Error('삭제된 원본을 다시 등록하려면 수정 권한이 필요합니다.');
    let query=api.from(TABLE).update({status:'active',updated_by:identity,updated_at:new Date().toISOString()}).eq('id',id);query=found.data.updated_at?query.eq('updated_at',found.data.updated_at):query.is('updated_at',null);
    const restored=await query.select('id').maybeSingle();if(restored.error)throw restored.error;if(!restored.data)throw Error('다른 곳에서 수정된 원본입니다. 새로고침 후 다시 등록해주세요.');
   }return true;}
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
   context(identity,true);const result=await api.from(TABLE).insert({id,category:'quality_form',doc_no:CODE,title:e.role==='template'?'서약서 · 작성용 빈 양식':'서약서 · '+e.employee+' · 보관용',version:'01',status:'active',content:JSON.stringify({schema:PACK,role:e.role,employee:e.employee,sha256:e.sha256,record_year:e.role==='archive'?(e.year||null):null}),file_name:e.name,storage_path:path,mime_type:mime,file_size:e.bytes.length,created_by:identity,updated_by:identity});
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
  for(const e of state.pending){if(e.year&&(!Number.isInteger(e.year)||e.year<1900||e.year>2200))throw Error('보관 연도를 확인하세요.');e.employee=e.role==='template'?'':e.employee.trim();if(e.role==='archive'&&!e.employee)throw Error('보관본의 직원 이름을 입력하세요.');}
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
 async function originalBlob(row,identity){
  const api=context(identity),result=await api.storage.from(BUCKET).download(row.storage_path);if(result.error)throw result.error;
  context(identity);if(await digest(await result.data.arrayBuffer())!==info(row).sha256)throw Error('원본 확인에 실패했습니다. 다시 조회해주세요.');return result.data;
 }
 async function download(id){const identity=state.identity,row=state.rows.find(r=>r.id===id&&r.status!=='obsolete');if(!row)return;const blob=await originalBlob(row,identity),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=row.file_name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function fileAction(action,id){
  if(state.busy)return;const identity=state.identity,api=context(identity),row=state.rows.find(r=>r.id===id&&r.status!=='obsolete'&&info(r)?.role==='archive');if(!row)return;
  if(action==='download')return download(id);
  if(action==='preview'){
   const preview=window.DF_QUALITY_FILE_PREVIEW;if(!preview?.open)throw Error('미리보기 모듈을 불러오지 못했습니다. 새로고침해주세요.');
   return preview.open({name:row.file_name,mime:row.mime_type,size:row.file_size,load:()=>originalBlob(row,identity)});
  }
  const permission=action==='rename'?'update':action==='delete'?'delete':null;if(!permission)return;if(!can(permission))throw Error('서약서 파일 '+(action==='rename'?'수정':'삭제')+' 권한이 없습니다.');
  let payload;
  if(action==='rename'){
   let name=prompt('목록에 표시할 파일명을 입력해주세요.',row.file_name);if(name===null)return;name=name.trim();if(!name||name.length>240||/[\\/]/.test(name))throw Error('파일명은 경로 기호 없이 240자 이내로 입력해주세요.');
   const ext=row.file_name.match(/\.[^.]+$/)?.[0]||'';if(!name.toLowerCase().endsWith(ext.toLowerCase()))throw Error('원본 확장자 '+ext+'를 유지해주세요.');if(name===row.file_name)return;payload={file_name:name};
  }else{if(!confirm('"'+row.file_name+'" 파일을 목록에서 삭제할까요? 웹 작성 서약서는 유지됩니다.'))return;payload={status:'obsolete'};}
  state.busy=true;render();
  try{
   context(identity);if(!can(permission))throw Error('파일 관리 권한이 변경되었습니다.');
   let query=api.from(TABLE).update({...payload,updated_by:identity,updated_at:new Date().toISOString()}).eq('id',id);query=row.updated_at?query.eq('updated_at',row.updated_at):query.is('updated_at',null);
   const result=await query.select('id').maybeSingle();if(result.error)throw result.error;if(!result.data)throw Error('다른 곳에서 수정된 파일입니다. 새로고침 후 확인해주세요.');
   context(identity);await reload();message(action==='rename'?'파일명을 수정했습니다.':'업로드 파일을 목록에서 삭제했습니다.');
  }finally{state.busy=false;render();}
 }
 const run=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>message(e.message||String(e),true));
 function ensure(){
  if($('qpfPledgePane'))return $('qpfPledgePane');const root=$('dfQualityFormWorkspace');if(!root)return null;
  const pane=document.createElement('section');pane.id='qpfPledgePane';pane.className='qic-pane';pane.hidden=true;
  // Reuse the certificate's workspace components so future forms share one visual frame.
  pane.innerHTML=`<div class="qic-toolbar">
   <label>작성 연도<select id="qpfPledgeYear" aria-label="작성 연도"></select></label>
   <label class="qic-search-label">성명·부서·직위 검색<input id="qpfPledgeFormSearch" type="search" placeholder="성명 · 부서 · 직위"></label>
   <button type="button" class="qpf-button" id="qpfPledgeRefresh">새로고침</button><button type="button" class="qpf-button" id="qpfPledgeNew">+ 새 서약서</button><button type="button" class="qpf-button primary" id="qpfPledgeSave">저장</button><button type="button" class="qpf-button danger" id="qpfPledgeDelete">삭제</button>
   <span class="qpf-toolbar-separator" aria-hidden="true"></span><button type="button" class="qpf-button" id="qpfPledgePreview">미리보기</button><button type="button" class="qpf-button" id="qpfPledgePrint">인쇄</button><button type="button" class="qpf-button active" id="qpfPledgeFit" aria-pressed="true">화면 맞춤</button>
  </div><div class="qic-status"><span id="qpfPledgeStatus" role="status" aria-live="polite"></span><span id="qpfPledgeDraftStatus"></span></div>
  <section id="qpfPledgeQueue" hidden><h3>등록할 파일 확인</h3><p>구분·직원 이름·보관 연도를 확인해 주세요. 같은 원본은 중복 등록하지 않습니다.</p><div class="qpf-pledge-scroll"><table><thead><tr><th>파일명</th><th>구분</th><th>직원 이름</th><th>보관 연도(선택)</th></tr></thead><tbody id="qpfPledgePending"></tbody></table></div><button type="button" class="qpf-button primary" id="qpfPledgeRegister">확인한 파일 등록</button><button type="button" class="qpf-button" id="qpfPledgeClear">선택 취소</button></section>
  <div class="qic-layout"><aside class="qic-side-stack"><section class="qic-file-panel">
   <div class="qic-record-head"><strong id="qpfPledgeUploadTitle">업로드 파일 전체조회</strong><span id="qpfPledgeArchiveCount">0건</span></div>
   <div class="qpf-file-filters"><label>조회 범위<select id="qpfPledgeScope"><option value="year">선택 연도</option><option value="all" selected>업로드 파일 전체조회</option></select></label><label>파일 찾기<input id="qpfPledgeSearch" type="search" placeholder="파일명 · 직원 이름 · 연도"></label><small id="qpfPledgeUploadTarget"></small></div>
   <div id="qpfPledgeDrop" class="qic-drop-zone" data-df-file-target="qpfPledgeInput"><b>파일을 여기에 끌어놓기</b><small>또는 클릭하여 여러 파일 선택 · 파일당 최대 50MB</small><button type="button" class="qpf-button" id="qpfPledgeChoose">파일 선택</button><input id="qpfPledgeInput" type="file" accept=".json,.hwp,.hwpx,.pdf" multiple hidden></div>
   <div id="qpfPledgeFileMessage" class="qic-file-message ok"></div><div id="qpfPledgeArchives" class="qic-file-list"></div>
  </section><section class="qic-record-panel"><div class="qic-record-head"><strong>웹 작성자료</strong><span id="qpfPledgeRecordCount">0건</span></div><div id="qpfPledgeRecordList" class="qic-record-list"></div></section></aside>
  <main class="qic-form-panel"><div id="qpfPledgeEditor" class="qic-form-scroll"></div></main></div>`;root.append(pane);
  $('qpfPledgeChoose').onclick=()=>{if(!state.busy)$('qpfPledgeInput').click();};$('qpfPledgeInput').onchange=run(async e=>{const files=Array.from(e.target.files);e.target.value='';await prepare(files);});
  $('qpfPledgeRefresh').onclick=run(async()=>{if(!discard())return;state.currentId=null;state.pendingFormId=null;state.currentUpdated=null;state.form=blankForm();state.dirty=false;state.pending=[];await reload();message('최신 등록본을 불러왔습니다.');});$('qpfPledgeSearch').oninput=renderFiles;
  $('qpfPledgeFormSearch').oninput=e=>{state.formQuery=e.target.value;renderRecordList();};
  $('qpfPledgeRegister').onclick=run(register);$('qpfPledgeClear').onclick=()=>{if(!state.busy){state.pending=[];render();message('파일 선택을 취소했습니다.');}};
  $('qpfPledgePending').onchange=e=>{if(state.busy)return;const role=e.target.dataset.role,person=e.target.dataset.person;if(role!==undefined){state.pending[Number(role)].role=e.target.value;render();}if(person!==undefined)state.pending[Number(person)].employee=e.target.value;};
  ensureEditor(pane);
  $('qpfPledgeScope').onchange=e=>{state.scope=e.target.value;renderFiles();};
  pane.addEventListener('change',e=>{if(e.target.dataset.pledgeYear!==undefined&&!state.busy)state.pending[Number(e.target.dataset.pledgeYear)].year=e.target.value?Number(e.target.value):null;});
  pane.addEventListener('click',e=>{const button=e.target.closest('[data-file-action]'),row=button?.closest('[data-pledge-file]');if(row&&!button.disabled)run(()=>fileAction(button.dataset.fileAction,row.dataset.pledgeFile))();});return pane;
 }

 const CLAUSES=[
 '시험·검사 업무와 관련하여 부당한 내부압력 (경영진의 압력, 비정상적인 시험 일정 단축 등) 과 외부압력 (성적서 변조 요구 등) 으로부터 굴복하지 않고 독립적으로 업무에 임한다.',
 '시험·검사 전반에 대하여 규정된 절차를 성실하게 준수하여 공평성에 위반되는 제반 행위를 하지 않는다.',
 '사적인 청탁이나 이익을 목적으로 시험을 수행하지 않으며, 시험·검사 결과를 사적인 이익이나 목적으로 사용하지 않는다.',
 '시험·검사 업무와 관련하여 획득 및 생산된 고객의 비밀사항 및 재산권을 보호해야 할 책임이 있다.',
 '우리 회사의 자격, 공평성, 판정 또는 운영상 성실도와 신뢰를 저해하는 어떠한 활동에도 참여하지 않는다.',
 '위 항 및 기타 당사의 규정을 준수하지 않을 시는 어떠한 처벌도 감수한다.'
 ];
 function blankForm(){return {name:'',english_name:'',birth_date:'',hire_date:'',department:'',position:'',pledge_date:'',quality_manager:'',signer:''};}
 function discard(){return !state.busy&&(!state.dirty&&!state.pending.length||confirm('저장하지 않은 작성 내용과 파일 선택을 취소하고 이동할까요?'));}
 function editAllowed(){return can(state.currentId?'update':'create');}
 function webRows(){return state.rows.filter(r=>r.status!=='obsolete'&&info(r)?.role==='web'&&Number(info(r).record_year)===state.year);}
 function sheet(print=false){
  const f=state.form||blankForm(),field=(key,type='text',label=key)=>print?`<span>${esc(type==='date'?String(f[key]||'').replace(/-/g,'.'):f[key])}</span>`:`<input data-pledge-field="${key}" aria-label="${esc(label)}" type="${type}" maxlength="120" value="${esc(f[key])}" ${editAllowed()&&!state.busy?'':'disabled'}>`;
  return `<article class="qpf-pledge-sheet"><header><img src="assets/dreamforen_ci.jpg" alt="드림포이엔"><h2>서 약 서</h2><table class="qpf-pledge-approval"><tr><th rowspan="2">승<br>인</th><th>품질책임자</th></tr><tr><td>${field('quality_manager','text','품질책임자')}</td></tr></table></header><table class="qpf-pledge-person"><colgroup><col style="width:11%"><col style="width:9%"><col style="width:32%"><col style="width:16%"><col style="width:32%"></colgroup><tr><th rowspan="2">이 름</th><th>한글</th><td>${field('name','text','한글 이름')}</td><th>생년월일</th><td>${field('birth_date','date','생년월일')}</td></tr><tr><th>영문</th><td>${field('english_name','text','영문 이름')}</td><th>입사일자</th><td>${field('hire_date','date','입사일자')}</td></tr><tr><th colspan="2">부 서</th><td>${field('department','text','부서')}</td><th>직 위</th><td>${field('position','text','직위')}</td></tr></table><div class="qpf-pledge-body"><p>상기 본인은 당사에 근무함에 있어 다음 사항을 준수할 것을 서약합니다.</p><ol>${CLAUSES.map(x=>'<li>'+esc(x)+'</li>').join('')}</ol><div class="qpf-pledge-sign"><div>${field('pledge_date','date','서약일')}</div><div>서명 ${field('signer','text','서명란 성명')} (인)</div></div><div class="qpf-pledge-issuer"><h3>주식회사 드림포이엔</h3><img class="qpf-pledge-seal" src="assets/qualification_seal.jpg" alt="주식회사 드림포이엔 직인"></div></div><footer><span>DFEN-QPF-01-03</span><span>Rev. ${esc(window.DF_DOCUMENT_REVISIONS?.rev(CODE,'01')||'01')}</span><span>A4(210×297mm)</span></footer></article>`;
 }
 function renderEditor(){
  if(!$('qpfPledgeEditor'))return;
  const years=new Set([state.year,...state.rows.map(r=>Number(info(r)?.record_year)).filter(Boolean)]),current=new Date().getFullYear();for(let y=current-10;y<=current+2;y++)years.add(y);
  $('qpfPledgeYear').innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}년</option>`).join('');
  $('qpfPledgeFormSearch').value=state.formQuery||'';renderRecordList();
  $('qpfPledgeEditor').innerHTML='<div class="qpf-pledge-page">'+sheet()+'</div>';scheduleFit();$('qpfPledgeNew').disabled=state.busy||!can('create');$('qpfPledgeSave').disabled=state.busy||!editAllowed();
  $('qpfPledgeDelete').disabled=state.busy||!state.currentId||!can('delete');$('qpfPledgeYear').disabled=state.busy;
  $('qpfPledgeDraftStatus').textContent=(state.dirty?'저장하지 않은 변경사항':state.currentId?'저장된 서약서':'새 문서')+' · '+state.year+'년';
 }
 function renderRecordList(){
  const query=(state.formQuery||'').trim().toLowerCase(),rows=webRows().filter(r=>{const f=info(r).form;return !query||[f?.name,f?.department,f?.position,f?.pledge_date].join(' ').toLowerCase().includes(query);});
  $('qpfPledgeRecordCount').textContent=rows.length+'건';
  $('qpfPledgeRecordList').innerHTML=rows.map(r=>{const f=info(r).form;return `<button type="button" data-pledge-record="${esc(r.id)}" class="qic-record-item ${r.id===state.currentId?'selected':''}"><strong>${esc(f?.name||'이름 미입력')}</strong><span>${esc([f?.department,f?.position].filter(Boolean).join(' · ')||'부서·직위 미입력')}</span><small>${esc(f?.pledge_date||'서약일 미입력')}</small></button>`;}).join('')||'<div class="qic-file-empty">'+(query?'검색 결과가 없습니다.':'선택한 연도에 작성된 서약서가 없습니다.')+'</div>';
 }
 function selectRecord(id){
  if(!discard())return;const row=state.rows.find(r=>r.id===id&&info(r)?.role==='web');if(!row)return;
  state.pending=[];state.pendingFormId=null;state.currentId=id;state.currentUpdated=row.updated_at;state.form={...blankForm(),...info(row).form};state.dirty=false;renderEditor();
 }
 function newRecord(){if(!discard())return;state.pending=[];state.currentId=null;state.currentUpdated=null;state.pendingFormId=null;state.form=blankForm();state.dirty=false;renderEditor();}
 async function saveForm(){
  if(state.busy)return;const identity=state.identity,api=context(identity),action=state.currentId?'update':'create';if(!can(action))throw Error('서약서 '+(action==='update'?'수정':'작성')+' 권한이 없습니다.');
  const form={...state.form};for(const k of Object.keys(form))form[k]=String(form[k]||'').trim();
  if(!form.name)throw Error('이름을 입력해주세요.');if(!/^\d{4}-\d{2}-\d{2}$/.test(form.pledge_date)||new Date(form.pledge_date+'T00:00:00Z').toISOString().slice(0,10)!==form.pledge_date)throw Error('서약일을 확인해주세요.');
  const year=Number(form.pledge_date.slice(0,4)),id=state.currentId||state.pendingFormId||crypto.randomUUID();state.pendingFormId=id;
  const payload={category:'quality_form',doc_no:CODE,title:'서약서 · '+form.name+' · '+form.pledge_date,version:'01',status:'active',content:JSON.stringify({schema:PACK,role:'web',record_year:year,form}),updated_by:identity,updated_at:new Date().toISOString()};
  state.busy=true;render();message('서약서 저장 중…');
  try{
   context(identity);if(!can(action))throw Error('저장 권한이 변경되었습니다.');
   let query;if(state.currentId){query=api.from(TABLE).update(payload).eq('id',id);query=state.currentUpdated?query.eq('updated_at',state.currentUpdated):query.is('updated_at',null);}else query=api.from(TABLE).insert({...payload,id,created_by:identity});
   let result=await query.select('*').maybeSingle();
   if(result.error){const found=await api.from(TABLE).select('*').eq('id',id).maybeSingle();if(!found.error&&found.data?.content===payload.content&&found.data?.updated_by===identity)result=found;else throw result.error;}
   if(!result.data)throw Error('다른 곳에서 수정된 서약서입니다. 입력 내용은 화면에 유지했습니다. 새로고침 후 확인해주세요.');
   context(identity);state.currentId=result.data.id;state.pendingFormId=null;state.currentUpdated=result.data.updated_at;state.form=form;state.year=year;state.dirty=false;await reload();message('서약서를 '+year+'년 작성자료에 저장했습니다.');
  }finally{state.busy=false;render();}
 }
 async function deleteForm(){
  if(state.busy||!state.currentId)return;if(!can('delete'))throw Error('서약서 삭제 권한이 없습니다.');if(!confirm('선택한 웹 작성 서약서를 삭제할까요? 직원별 원본 보관본은 유지됩니다.'))return;
  const api=context(state.identity),id=state.currentId;state.busy=true;render();
  try{let q=api.from(TABLE).update({status:'obsolete',updated_by:state.identity,updated_at:new Date().toISOString()}).eq('id',id);q=state.currentUpdated?q.eq('updated_at',state.currentUpdated):q.is('updated_at',null);const r=await q.select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error('다른 곳에서 변경된 서약서입니다. 새로고침해주세요.');state.currentId=null;state.currentUpdated=null;state.pendingFormId=null;state.form=blankForm();state.dirty=false;await reload();message('웹 작성 서약서를 삭제했습니다.');}finally{state.busy=false;render();}
 }
 function printForm(auto){
  context(state.identity);const popup=window.open('about:blank','_blank');if(!popup)return message('브라우저에서 미리보기 팝업을 허용해주세요.',true);
  const css=new URL('qpf_pledge.css?v=beta34',document.baseURI).href,base=new URL('.',document.baseURI).href;
  // Reuse the stylesheet already loaded in the editor so printing never races a new CSS request.
  const styles=Array.from(document.styleSheets).map(s=>{try{const text=Array.from(s.cssRules).map(r=>r.cssText).join('\n');return /qpf-pledge-sheet/.test(text)?text:'';}catch{return '';}}).filter(Boolean).join('\n');
  let html=sheet(true);
  $('qpfPledgeEditor')?.querySelectorAll('img').forEach(img=>{if(img.complete&&img.naturalWidth){try{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);html=html.replace('src="'+img.getAttribute('src')+'"','src="'+canvas.toDataURL()+'"');}catch{}}});
  popup.document.open();if(auto)popup.addEventListener('load',()=>popup.print(),{once:true});popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="${esc(base)}"><title>서약서 ${esc(state.form?.name||'')}</title>${styles?'<style>'+styles+'</style>':'<link rel="stylesheet" href="'+esc(css)+'">'}</head><body class="qpf-pledge-print"><nav class="qpf-pledge-print-tools"><button onclick="window.print()">인쇄</button></nav>${html}</body></html>`);popup.document.close();
 }
 let fitFrame=0;
 function scheduleFit(){if(fitFrame)cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(()=>{fitFrame=0;fitSheet();});}
 function fitSheet(){
  const editor=$('qpfPledgeEditor'),paper=editor?.querySelector('.qpf-pledge-sheet'),page=editor?.querySelector('.qpf-pledge-page');if(!paper||!editor.clientWidth)return;
  const css=getComputedStyle(editor),available=editor.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-2;
  const scale=state.fitView?Math.min(1,Math.max(.1,available/paper.offsetWidth)):1;
  page.style.width=paper.offsetWidth*scale+'px';page.style.height=paper.offsetHeight*scale+'px';paper.style.transform='scale('+scale+')';
  const button=$('qpfPledgeFit');button.classList.toggle('active',state.fitView);button.setAttribute('aria-pressed',String(state.fitView));button.textContent=state.fitView?'화면 맞춤':'실제 크기';
 }
 function ensureEditor(pane){
  $('qpfPledgeFit').onclick=()=>{state.fitView=!state.fitView;scheduleFit();};
  if(window.ResizeObserver){const resize=new ResizeObserver(scheduleFit);resize.observe($('qpfPledgeEditor'));}else window.addEventListener('resize',scheduleFit);
  $('qpfPledgeNew').onclick=newRecord;$('qpfPledgeSave').onclick=run(saveForm);$('qpfPledgeDelete').onclick=run(deleteForm);$('qpfPledgePreview').onclick=run(()=>printForm(false));$('qpfPledgePrint').onclick=run(()=>printForm(true));
  $('qpfPledgeYear').onchange=e=>{if(!discard()){e.target.value=state.year;return;}state.pending=[];state.formQuery='';state.year=Number(e.target.value);state.currentId=null;state.currentUpdated=null;state.pendingFormId=null;state.form=blankForm();state.dirty=false;render();};
  $('qpfPledgeRecordList').onclick=e=>{const b=e.target.closest('[data-pledge-record]');if(b)selectRecord(b.dataset.pledgeRecord);};
  $('qpfPledgeEditor').oninput=e=>{const key=e.target.dataset.pledgeField;if(key&&editAllowed()&&!state.busy){state.form[key]=e.target.value;state.dirty=true;$('qpfPledgeDraftStatus').textContent='저장하지 않은 변경사항';}};
 }
 window.addEventListener('beforeunload',e=>{if(state.active&&(state.dirty||state.busy||state.pending.length)){e.preventDefault();e.returnValue='';}});

 function open(folderNumber){
  if(state.busy)return window.alert('서약서 등록을 마친 후 다시 열어주세요.');
  if(!can('view'))return window.alert('작성용 품질문서 조회 권한이 없습니다.');
  window.DF_QPF_FORMS?.open();const pane=ensure();if(!pane)return;
  state.active=true;state.identity=user().id;state.rows=[];state.pending=[];state.form=blankForm();state.currentId=null;state.currentUpdated=null;state.pendingFormId=null;state.dirty=false;state.formQuery='';state.scope='all';$('qpfPledgeScope').value='all';window.DF_QPF_FORMS.state.view='qpf-pledge';
  $('qpfFolderPane').hidden=true;$('qpfLedgerPane').hidden=true;pane.hidden=false;
  if($('dfDocTitle'))$('dfDocTitle').textContent='DFEN-QPF-01-03 (01) 서약서';if($('dfDocDescription'))$('dfDocDescription').textContent='원본 세로 A4 양식 작성 · 직인 기본 삽입 · 직원별·연도별 작성 및 기존파일 보관';if($('dfDocBack'))$('dfDocBack').textContent='← 작성용 품질문서';
  render();window.DF_FILE_DROP?.scan();message('서약서 불러오는 중…');run(async()=>{await reload();message(webRows().length?'작성된 서약서 '+webRows().length+'건을 불러왔습니다.':'작성된 서약서가 없습니다.');})();
 }
 function close(){state.active=false;state.load++;if($('qpfPledgePane'))$('qpfPledgePane').hidden=true;if(!state.busy){state.pending=[];state.dirty=false;}}
 document.addEventListener('df:menu-permissions-changed',()=>{if(user()?.id!==state.identity||!can('view')){state.rows=[];state.pending=[];close();}render();});
 const navigation={capture(){return {...state,search:$('qpfPledgeSearch')?.value||''};},canLeave(){return !state.busy;},restore(value){ensure();Object.assign(state,value||{});state.load++;state.active=true;state.identity=user()?.id;state.busy=false;$('qpfPledgePane').hidden=false;$('qpfPledgeScope').value=state.scope;$('qpfPledgeSearch').value=state.search||'';window.DF_QPF_FORMS.state.view='qpf-pledge';$('dfDocTitle').textContent='DFEN-QPF-01-03 (01) 서약서';$('dfDocDescription').textContent='원본 세로 A4 양식 작성 · 직인 기본 삽입 · 직원별·연도별 작성 및 기존파일 보관';render();}};
 window.DF_QPF_PLEDGE={open,close,confirmDiscard:discard,state,navigation};
})();
