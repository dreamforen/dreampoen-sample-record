/* DFEN-QPF-01-03 (01): original template and read-only staff archives. */
(function(){'use strict';
 const CODE='DFEN-QPF-01-03',BUCKET='quality-documents',TABLE='quality_documents',PACK='dreamforen.pledges.v1';
 const state={year:new Date().getFullYear(),form:null,currentId:null,currentUpdated:null,pendingFormId:null,dirty:false,scope:'all',active:false,busy:false,rows:[],pending:[],identity:null,load:0,fitView:true};
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
  const query=($('qpfPledgeSearch').value||'').trim().toLowerCase();
  for(const role of ['template','archive']){
   const list=state.rows.filter(r=>{const m=info(r);return m?.role===role&&(role==='template'||state.scope==='all'||Number(m.record_year)===state.year)&&(!query||[r.file_name,m.employee,m.record_year].join(' ').toLowerCase().includes(query));});
   $('qpfPledge'+(role==='template'?'Templates':'Archives')).innerHTML=list.map(r=>{const m=info(r);return `<article class="qpf-pledge-file"><div><strong>${role==='archive'?esc(m.employee):'작성용 빈 양식'}</strong><p>${esc(r.file_name)}</p><small>${role==='archive'?(esc(m.record_year||'연도 미지정')+(m.record_year?'년':'')+' · '):''}${(Number(r.file_size)/1024).toFixed(1)} KB · 등록 ${esc(String(r.created_at||'').slice(0,10))}${role==='archive'?' · 원본 보관':''}</small></div><button type="button" data-download="${esc(r.id)}">${role==='archive'?'원본 내려받기':'양식 내려받기'}</button></article>`;}).join('')||'<p class="qpf-pledge-empty">'+(query?'검색 결과가 없습니다.':'등록된 '+(role==='template'?'빈 양식':'보관본')+'이 없습니다.')+'</p>';
   $('qpfPledge'+(role==='template'?'TemplateCount':'ArchiveCount')).textContent=list.length;
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
      const raw=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));entries.push({name:String(item.name),role:item.role,employee:String(item.employee||''),year:Number(item.record_year)||null,bytes:raw,expected:item.sha256});
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
 async function download(id){const identity=state.identity,api=context(identity),row=state.rows.find(r=>r.id===id);if(!row)return;const result=await api.storage.from(BUCKET).download(row.storage_path);if(result.error)throw result.error;context(identity);if(await digest(await result.data.arrayBuffer())!==info(row).sha256)throw Error('원본 확인에 실패했습니다. 다시 조회해주세요.');const url=URL.createObjectURL(result.data),a=document.createElement('a');a.href=url;a.download=row.file_name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const run=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>message(e.message||String(e),true));
 function ensure(){
  if($('qpfPledgePane'))return $('qpfPledgePane');const root=$('dfQualityFormWorkspace');if(!root)return null;
  const pane=document.createElement('section');pane.id='qpfPledgePane';pane.hidden=true;pane.innerHTML=`<div class="qpf-pledge-toolbar"><button type="button" id="qpfPledgeChoose">서약서 파일 등록</button><button type="button" id="qpfPledgeRefresh">새로고침</button><select id="qpfPledgeScope" aria-label="업로드 파일 조회 범위"><option value="all">업로드 파일 전체조회</option><option value="year">선택 연도 보관본</option></select><input id="qpfPledgeSearch" type="search" placeholder="직원 이름 / 파일명 / 연도 검색"><input id="qpfPledgeInput" type="file" accept=".json,.hwp,.hwpx,.pdf" multiple hidden></div><p id="qpfPledgeStatus" role="status" aria-live="polite"></p><section id="qpfPledgeQueue" hidden><h3>등록할 파일 확인</h3><p>가져오기 파일 또는 원본 HWP·HWPX·PDF를 선택할 수 있습니다. 같은 원본은 중복 등록하지 않습니다.</p><div class="qpf-pledge-scroll"><table><thead><tr><th>파일명</th><th>구분</th><th>직원 이름</th><th>보관 연도(선택)</th></tr></thead><tbody id="qpfPledgePending"></tbody></table></div><button type="button" id="qpfPledgeRegister">확인한 파일 등록</button><button type="button" id="qpfPledgeClear">선택 취소</button></section><h3>작성용 빈 양식 <span id="qpfPledgeTemplateCount">0</span></h3><p>웹 작성 화면에서 작성하거나, 원본 양식을 내려받아 작성할 수 있습니다.</p><div id="qpfPledgeTemplates"></div><h3>직원별 보관본 <span id="qpfPledgeArchiveCount">0</span></h3><p>작성·서명된 원본을 보관합니다. 연도 미지정 파일은 전체조회에서 확인할 수 있습니다. 등록한 파일의 내용을 덮어쓰지 않습니다.</p><div id="qpfPledgeArchives"></div>`;root.append(pane);
  $('qpfPledgeChoose').onclick=()=>{if(!state.busy)$('qpfPledgeInput').click();};$('qpfPledgeInput').onchange=run(async e=>{const files=Array.from(e.target.files);e.target.value='';await prepare(files);});
  $('qpfPledgeRefresh').onclick=run(async()=>{if(!discard())return;state.currentId=null;state.pendingFormId=null;state.currentUpdated=null;state.form=blankForm();state.dirty=false;state.pending=[];await reload();message('최신 등록본을 불러왔습니다.');});$('qpfPledgeSearch').oninput=render;
  $('qpfPledgeRegister').onclick=run(register);$('qpfPledgeClear').onclick=()=>{if(!state.busy){state.pending=[];render();message('파일 선택을 취소했습니다.');}};
  $('qpfPledgePending').onchange=e=>{if(state.busy)return;const role=e.target.dataset.role,person=e.target.dataset.person;if(role!==undefined){state.pending[Number(role)].role=e.target.value;render();}if(person!==undefined)state.pending[Number(person)].employee=e.target.value;};
  ensureEditor(pane);
  $('qpfPledgeScope').onchange=e=>{state.scope=e.target.value;render();};
  pane.addEventListener('change',e=>{if(e.target.dataset.pledgeYear!==undefined&&!state.busy)state.pending[Number(e.target.dataset.pledgeYear)].year=e.target.value?Number(e.target.value):null;});
  pane.onclick=e=>{const button=e.target.closest('[data-download]');if(button)run(()=>download(button.dataset.download))();};return pane;
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
  return `<article class="qpf-pledge-sheet"><header><img src="assets/dreamforen_ci.jpg" alt="드림포이엔"><h2>서 약 서</h2><table class="qpf-pledge-approval"><tr><th rowspan="2">승<br>인</th><th>품질책임자</th></tr><tr><td>${field('quality_manager','text','품질책임자')}</td></tr></table></header><table class="qpf-pledge-person"><colgroup><col style="width:11%"><col style="width:9%"><col style="width:32%"><col style="width:16%"><col style="width:32%"></colgroup><tr><th rowspan="2">이 름</th><th>한글</th><td>${field('name','text','한글 이름')}</td><th>생년월일</th><td>${field('birth_date','date','생년월일')}</td></tr><tr><th>영문</th><td>${field('english_name','text','영문 이름')}</td><th>입사일자</th><td>${field('hire_date','date','입사일자')}</td></tr><tr><th colspan="2">부 서</th><td>${field('department','text','부서')}</td><th>직 위</th><td>${field('position','text','직위')}</td></tr></table><div class="qpf-pledge-body"><p>상기 본인은 당사에 근무함에 있어 다음 사항을 준수할 것을 서약합니다.</p><ol>${CLAUSES.map(x=>'<li>'+esc(x)+'</li>').join('')}</ol><div class="qpf-pledge-sign"><div>${field('pledge_date','date','서약일')}</div><div>서명 ${field('signer','text','서명란 성명')} (인)</div></div><div class="qpf-pledge-issuer"><h3>주식회사 드림포이엔</h3><img class="qpf-pledge-seal" src="assets/qualification_seal.jpg" alt="주식회사 드림포이엔 직인"></div></div><footer><span>DFEN-QPF-01-03</span><span>Rev. 01</span><span>A4(210×297mm)</span></footer></article>`;
 }
 function renderEditor(){
  if(!$('qpfPledgeEditor'))return;
  const years=new Set([state.year,...state.rows.map(r=>Number(info(r)?.record_year)).filter(Boolean)]),current=new Date().getFullYear();for(let y=current-10;y<=current+2;y++)years.add(y);
  $('qpfPledgeYear').innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}년</option>`).join('');
  $('qpfPledgeUploadTitle').textContent=state.year+'년 업로드 자료';
  $('qpfPledgeRecordCount').textContent=webRows().length+'건';
  $('qpfPledgeRecordList').innerHTML=webRows().map(r=>{const m=info(r);return `<button type="button" data-pledge-record="${esc(r.id)}" class="${r.id===state.currentId?'selected':''}"><strong>${esc(m.form?.name||'이름 미입력')}</strong><small>${esc(m.form?.department||'')} · ${esc(m.form?.pledge_date||'')}</small></button>`;}).join('')||'<p>이 연도의 웹 작성자료가 없습니다.</p>';
  $('qpfPledgeEditor').innerHTML='<div class="qpf-pledge-page">'+sheet()+'</div>';scheduleFit();$('qpfPledgeNew').disabled=state.busy||!can('create');$('qpfPledgeSave').disabled=state.busy||!editAllowed();
  $('qpfPledgeDelete').disabled=state.busy||!state.currentId||!can('delete');$('qpfPledgeYear').disabled=state.busy;
  $('qpfPledgeDraftStatus').textContent=state.dirty?'저장하지 않은 변경사항':state.currentId?'저장된 서약서':'새 서약서';
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
  const css=new URL('qpf_pledge.css?v=beta33',document.baseURI).href,base=new URL('.',document.baseURI).href;
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
  const button=$('qpfPledgeFit');button.classList.toggle('active',state.fitView);button.setAttribute('aria-pressed',String(state.fitView));button.textContent=state.fitView?'화면 맞춤 ✓':'실제 크기';
 }
 function ensureEditor(pane){
  const files=document.createElement('section');files.className='qpf-pledge-files';
  files.innerHTML='<h3 class="qpf-pledge-panel-title"><span id="qpfPledgeUploadTitle">업로드 자료</span></h3>';
  const status=$('qpfPledgeStatus'),queue=$('qpfPledgeQueue');status.remove();queue.remove();
  while(pane.firstChild)files.append(pane.firstChild);pane.append(files);
  files.querySelector('.qpf-pledge-panel-title').append($('qpfPledgeRefresh'));
  const toolbar=files.querySelector('.qpf-pledge-toolbar');
  toolbar.prepend(Object.assign(document.createElement('label'),{htmlFor:'qpfPledgeScope',textContent:'조회 범위'}));
  const searchLabel=Object.assign(document.createElement('label'),{htmlFor:'qpfPledgeSearch',textContent:'파일 찾기'});$('qpfPledgeSearch').before(searchLabel);
  const drop=document.createElement('div');drop.id='qpfPledgeDrop';drop.className='df-file-drop';drop.dataset.dfFileTarget='qpfPledgeInput';drop.innerHTML='<strong>파일을 여기에 끌어놓기</strong><small>또는 클릭하여 여러 파일 선택 · 파일당 최대 50MB</small>';
  $('qpfPledgeChoose').textContent='파일 선택';drop.append($('qpfPledgeChoose'));toolbar.after(drop);
  const hint=document.createElement('p');hint.className='qpf-pledge-upload-hint';hint.textContent='파일을 확인한 뒤 구분·직원 이름·보관 연도를 지정해 등록합니다.';drop.after(hint);

  const area=document.createElement('section');area.className='qpf-pledge-writing';area.innerHTML=`<div class="qpf-pledge-toolbar qpf-pledge-actions"><label>작성 연도 <select id="qpfPledgeYear" aria-label="작성 연도"></select></label><button type="button" id="qpfPledgeNew">+ 새 서약서</button><button type="button" id="qpfPledgeSave">저장</button><button type="button" id="qpfPledgeDelete">삭제</button><button type="button" id="qpfPledgePreview">미리보기</button><button type="button" id="qpfPledgePrint">인쇄</button><button type="button" id="qpfPledgeFit" aria-pressed="true">화면 맞춤 ✓</button><span id="qpfPledgeDraftStatus" role="status"></span></div><div class="qpf-pledge-layout"><aside class="qpf-pledge-sidebar"><section class="qpf-pledge-records"><h3 class="qpf-pledge-panel-title">웹 작성자료 <span id="qpfPledgeRecordCount">0건</span></h3><div id="qpfPledgeRecordList"></div></section></aside><div id="qpfPledgeEditor" class="qpf-pledge-editor"></div></div>`;pane.append(area);
  area.querySelector('.qpf-pledge-sidebar').prepend(files);area.querySelector('.qpf-pledge-actions').after(status,queue);
  $('qpfPledgeFit').onclick=()=>{state.fitView=!state.fitView;scheduleFit();};
  if(window.ResizeObserver){const resize=new ResizeObserver(scheduleFit);resize.observe($('qpfPledgeEditor'));}else window.addEventListener('resize',scheduleFit);
  $('qpfPledgeNew').onclick=newRecord;$('qpfPledgeSave').onclick=run(saveForm);$('qpfPledgeDelete').onclick=run(deleteForm);$('qpfPledgePreview').onclick=run(()=>printForm(false));$('qpfPledgePrint').onclick=run(()=>printForm(true));
  $('qpfPledgeYear').onchange=e=>{if(!discard()){e.target.value=state.year;return;}state.pending=[];state.year=Number(e.target.value);state.currentId=null;state.currentUpdated=null;state.pendingFormId=null;state.form=blankForm();state.dirty=false;render();};
  $('qpfPledgeRecordList').onclick=e=>{const b=e.target.closest('[data-pledge-record]');if(b)selectRecord(b.dataset.pledgeRecord);};
  $('qpfPledgeEditor').oninput=e=>{const key=e.target.dataset.pledgeField;if(key&&editAllowed()&&!state.busy){state.form[key]=e.target.value;state.dirty=true;$('qpfPledgeDraftStatus').textContent='저장하지 않은 변경사항';}};
 }
 window.addEventListener('beforeunload',e=>{if(state.active&&(state.dirty||state.busy||state.pending.length)){e.preventDefault();e.returnValue='';}});

 function open(folderNumber){
  if(state.busy)return window.alert('서약서 등록을 마친 후 다시 열어주세요.');
  if(!can('view'))return window.alert('작성용 품질문서 조회 권한이 없습니다.');
  window.DF_QPF_FORMS?.open();const pane=ensure();if(!pane)return;
  state.active=true;state.identity=user().id;state.rows=[];state.pending=[];state.form=blankForm();state.currentId=null;state.currentUpdated=null;state.pendingFormId=null;state.dirty=false;state.scope='all';$('qpfPledgeScope').value='all';window.DF_QPF_FORMS.state.view='qpf-pledge';
  $('qpfFolderPane').hidden=true;$('qpfLedgerPane').hidden=true;pane.hidden=false;
  if($('dfDocTitle'))$('dfDocTitle').textContent='DFEN-QPF-01-03 (01) 서약서';if($('dfDocDescription'))$('dfDocDescription').textContent='웹 작성 · 연도별 보관 · 업로드 파일 전체조회';if($('dfDocBack'))$('dfDocBack').textContent='← 작성용 품질문서';
  render();window.DF_FILE_DROP?.scan();message('서약서 불러오는 중…');run(async()=>{await reload();message('');})();
 }
 function close(){state.active=false;state.load++;if($('qpfPledgePane'))$('qpfPledgePane').hidden=true;if(!state.busy){state.pending=[];state.dirty=false;}}
 document.addEventListener('df:menu-permissions-changed',()=>{if(user()?.id!==state.identity||!can('view')){state.rows=[];state.pending=[];close();}render();});
 const navigation={capture(){return {...state,search:$('qpfPledgeSearch')?.value||''};},canLeave(){return !state.busy;},restore(value){ensure();Object.assign(state,value||{});state.load++;state.active=true;state.identity=user()?.id;state.busy=false;$('qpfPledgePane').hidden=false;$('qpfPledgeScope').value=state.scope;$('qpfPledgeSearch').value=state.search||'';window.DF_QPF_FORMS.state.view='qpf-pledge';$('dfDocTitle').textContent='DFEN-QPF-01-03 (01) 서약서';$('dfDocDescription').textContent='웹 작성 · 연도별 보관 · 업로드 파일 전체조회';render();}};
 window.DF_QPF_PLEDGE={open,close,confirmDiscard:discard,state,navigation};
})();
