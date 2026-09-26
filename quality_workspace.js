(function(){'use strict';
 const $=id=>document.getElementById(id),C=window.DFQualityCore,B=parent!==window?parent.DFQualityBridge:null;
 const S={sources:[],catalog:[],effective:[],current:null,editCurrent:false,tab:'document',mapDirty:false,source:null,row:null,payload:null,history:[],kind:'manual',mode:'edit',range:null,loading:false,composing:false,disposed:false,previewValid:false,overflow:false,identity:null,followCurrent:true,actionBusy:false,syncing:null};
 const STATUS={source:'검토 기준자료 · 미승인',correction:'현재 수정본 · 개정번호 유지 · 별도 결재 없음',draft:'개정안 작성 중 · 미승인',submitted:'개정안 결재 중 · 미승인',active:'승인본',obsolete:'구본',rejected:'반려',cancelled:'개정 취소 · 미시행'};
 const REV_FIELDS='id,doc_key,revision,status,approval_id,effective_date,reason,lock_version,document_title,created_by,created_at,updated_at';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const result=async query=>{const r=await query;if(r.error)throw r.error;return r.data;};
 function api(){const x=B?.context();if(!x?.user||!x?.api||S.identity&&S.identity!==x.user.id)throw Error('로그인이 변경되었습니다. 다시 로그인하고 작업실을 열어주세요.');return x.api;}
 const can=a=>!!B?.can(S.kind,a);
 const writable=()=>!!((S.editCurrent&&S.followCurrent&&!workingFor(S.source?.doc_key)||S.row?.status==='draft'&&!S.row.approval_id)&&!S.approvalPending&&can('update')&&!S.disposed);
 const editable=()=>writable()&&!S.actionBusy;
 function say(message,good=false){$('message').textContent=message;$('message').hidden=!message;$('message').classList.toggle('good',good);}
 function error(e){if(!S.disposed)say(String(e?.message||e));}
 const run=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(error);
 const backupKey=()=>S.editCurrent?'df-qw:'+S.identity+':current:'+S.source.doc_key+':'+(S.current.basis_id||'source'):S.row&&'df-qw:'+S.identity+':'+S.row.id;
 function collect(){
  const p=C.clone(S.payload);if(S.mode==='edit')Array.from($('editorPages').querySelectorAll('.editable')).forEach((n,i)=>p.sections[i].html=C.sanitize(C.unbindToc(n.cloneNode(true)).innerHTML));
  p.layoutReviewed=$('reviewed').checked;return {payload:C.payload(p),reason:$('reason').value};
 }
 function recovery(){if(!S.row&&!S.editCurrent)return;try{sessionStorage.setItem(backupKey(),JSON.stringify({format:'dreamforen.quality.recovery.v1',key:S.source.doc_key,version:queue.version,...collect()}));}catch(_){say('이 브라우저에 임시 복구본을 남길 수 없습니다. 서버 저장 상태를 확인하고 백업을 내려받으세요.');}}
 const queue=new C.SaveQueue({
  get:collect,
  save:async(value,expected,checkpoint)=>{
   if(!writable())throw Error('현재 문서를 수정할 권한이 없거나 결재로 잠겼습니다.');
   if(S.editCurrent)return result(api().rpc('df_qw_correct',{p_key:S.source.doc_key,p_basis:S.current.basis_id,p_basis_version:S.current.basis_version,p_expected:expected,p_reason:value.reason.trim()||'본문·서식 수정 (개정번호 유지)',p_payload:value.payload}));
   const row=await result(api().rpc('df_qw_save',{p_id:S.row.id,p_expected:expected,p_payload:value.payload,p_reason:value.reason,p_checkpoint:checkpoint}));
   return Array.isArray(row)?row[0]:row;
  },
  onState(state,e){
   const text={dirty:'변경됨 · 저장 대기',saving:'서버 저장 중…',saved:'서버 저장 완료',error:'저장 실패 · 입력은 화면에 보존됨'};
   $('saveState').textContent=text[state]||state;$('saveState').classList.toggle('error',state==='error');$('retry').hidden=state!=='error';
   if(state==='error'){recovery();say((/QW_CONFLICT/.test(e.message)?'동시편집 충돌: 다른 사용자의 저장본을 덮어쓰지 않았습니다. 현재 입력을 백업한 뒤 목차에서 문서를 다시 여세요.\n':'자동 재시도를 멈췄습니다. 연결과 권한을 확인한 뒤 저장 재시도를 눌러주세요.\n')+e.message);}
   if(state==='saved')try{sessionStorage.removeItem(backupKey());}catch(_){}
  },
  onSaved(row){if(S.editCurrent){S.current=row;S.effective=S.effective.filter(x=>x.doc_key!==row.doc_key).concat(row);}else{S.row=row;S.catalog=S.catalog.filter(x=>x.id!==row.id);S.catalog.push(row);}updateMeta();renderToc();}
 });
 function changed({review=false,internal=false}={}){
  if(!editable()||S.loading&&!internal)return;
  if(!review)$('reviewed').checked=false;
  S.previewValid=false;recordUndo();queue.change();recovery();
 }
 function recordUndo(){
  const value=JSON.stringify(collect());S.undo=S.undo||[];if(S.undo.at(-1)!==value)S.undo.push(value);S.redo=[];
  while(S.undo.length>30||(S.undo.length>2&&S.undo.reduce((n,x)=>n+x.length,0)>8000000))S.undo.shift();
 }
 function restoreUndo(redo=false){
  if(!editable()||S.loading)return;let value;
  if(redo){if(!S.redo?.length)return;value=S.redo.pop();S.undo.push(value);}
  else{if(!S.undo||S.undo.length<2)return;S.redo=S.redo||[];S.redo.push(S.undo.pop());value=S.undo.at(-1);}
  const state=JSON.parse(value);S.payload=C.payload(state.payload);$('reason').value=state.reason;$('reviewed').checked=false;S.mode='edit';renderEditor();setMode('edit');S.previewValid=false;queue.change();recovery();
 }
 const showingCurrent=()=>S.followCurrent&&(!S.row||S.row.status==='active');
 const effectiveFor=key=>S.effective.find(x=>x.doc_key===key);
 function metadata(){const e=S.correctionHistory||(showingCurrent()?S.current:null);return {key:S.source.doc_key,title:e?.title||S.row?.document_title||S.source.title,originalTitle:S.source.title,revision:e?.revision??S.row?.revision??S.source.base_revision,status:e?.has_correction||S.editCurrent?'correction':S.row?.status||'source',effectiveDate:e?.effective_date||S.row?.effective_date||null};}
 const rev=n=>'Rev.'+String(n).padStart(2,'0');
 const activeFor=key=>S.catalog.find(r=>r.doc_key===key&&r.status==='active');
 const workingFor=key=>S.catalog.find(r=>r.doc_key===key&&['draft','submitted'].includes(r.status));
 const currentFor=key=>workingFor(key)||activeFor(key)||null;
 const liveToc=()=>S.followCurrent&&S.source?.doc_key.endsWith('-00');
 function applyToc(area){if(liveToc())return C.bindToc(area,Object.fromEntries(S.effective.map(r=>[r.doc_key,r])));return 0;}
 function updateMeta(){
  if(S.disposed||!S.source)return;const m=metadata(),active=activeFor(m.key),current=effectiveFor(m.key),official=active?'시행 '+rev(current?.revision??active.revision):'기준 '+rev(current?.revision??S.source.base_revision)+' (미승인)',working=['draft','submitted'].includes(m.status);
  $('code').textContent=m.key+' · '+official+(working?' · 개정안 '+rev(m.revision):!S.followCurrent?' · 이력 '+rev(m.revision):'');$('title').textContent=m.title;
  $('meta').textContent=(!S.followCurrent?'이력 보기 · ':'')+STATUS[m.status]+(S.row?.approval_id?(m.status==='correction'?' · 이전 승인본 이력 보존':' · 결재문서 연결됨'):'')+(m.status==='cancelled'?' · '+(S.row.cancel_reason||'취소 이력 보존'):m.effectiveDate?' · 시행일 '+m.effectiveDate:' · 시행일은 승인 시 반영');
  $('modeStatus').textContent=S.editCurrent?'수정 모드 · 개정번호 유지 · 자동 저장 · 수정 전후 이력 보존':STATUS[m.status]+' · 수정: 번호 유지 / 개정: 다음 번호로 결재';
  const locked=!editable()||S.loading;
  $('formatTools').disabled=locked||S.mode!=='edit';$('paragraphTools').disabled=locked||S.mode!=='edit';
  $('reason').disabled=locked;$('reviewed').disabled=locked;$('save').disabled=locked;
  $('newDraft').disabled=S.actionBusy||S.loading||!can('create')||!!workingFor(m.key);
  $('approve').disabled=locked||S.editCurrent||!B;
  $('correct').disabled=S.actionBusy||S.loading||!can('update')||!!workingFor(m.key)||S.editCurrent;
  $('finishCorrection').hidden=!S.editCurrent;$('finishCorrection').disabled=S.actionBusy||S.loading; $('upload').disabled=S.actionBusy||S.loading||!can('upload')||!!(S.row&&!editable());
  $('cancelRevision').disabled=S.actionBusy||S.loading||!can('update')||!working||S.approvalPending;
  $('refreshStatus').disabled=S.actionBusy;
  $('documentTab').disabled=S.actionBusy||S.loading;$('matchingTab').disabled=S.actionBusy||S.loading;$('matchFields').disabled=S.actionBusy||S.loading;
  $('kind').disabled=S.actionBusy||S.loading;$('importButton').disabled=S.actionBusy||S.loading;$('retry').disabled=S.actionBusy||S.loading;
  $('approvalList').hidden=!S.row?.approval_id&&!S.approvalPending;
  $('legacyFiles').hidden=S.kind==='manual'||!B?.legacyFiles;
  $('tocNotice').hidden=!liveToc();$('tocNotice').textContent='목차·머리말·꼬리말은 현재 등록번호를 함께 반영합니다. 제목과 번호 정정은 매칭 탭에서 가능합니다.';
  $('print').disabled=false;
  $('editorPages').querySelectorAll('.editable').forEach(n=>n.contentEditable=String(!locked));
 }
 function renderToc(){
  const query=$('search').value.trim().toLowerCase();const items=S.sources.filter(d=>d.kind===S.kind&&(!query||(d.doc_key+' '+(effectiveFor(d.doc_key)?.title||d.title)).toLowerCase().includes(query)));
  $('toc').innerHTML=items.map(d=>{const a=activeFor(d.doc_key),w=workingFor(d.doc_key),e=effectiveFor(d.doc_key);return `<button type="button" data-key="${esc(d.doc_key)}" class="${d.doc_key===S.source?.doc_key?'active':''}"><small>${esc(d.doc_key)}</small>${esc(e?.title||d.title)}<span class="toc-revision">${a?'시행 '+rev(e?.revision??a.revision):'기준 '+rev(e?.revision??d.base_revision)+' · 미승인'}${e?.has_correction?' · 수정본':''}</span>${w?`<span class="toc-working">개정안 ${rev(w.revision)} · ${w.status==='submitted'?'결재 중':w.approval_id?'기안 연결됨':'작성 중'}</span>`:''}</button>`;}).join('')||'<p>등록된 문서가 없습니다.</p>';
  $('toc').querySelectorAll('button').forEach(b=>b.onclick=run(()=>openDocument(b.dataset.key)));
 }
 async function refresh(){
  const [sources,catalog,effective]=await Promise.all([
   result(api().from('quality_workspace_sources').select('doc_key,kind,title,base_revision,source_sha256').order('doc_key')),
   result(api().from('quality_workspace_revisions').select(REV_FIELDS).in('status',['active','draft','submitted'])),
   result(api().rpc('df_qw_current_index'))
  ]);S.sources=sources;S.catalog=catalog;S.effective=effective;
  renderToc();$('editorPages').querySelectorAll('.editable').forEach(applyToc);S.previewValid=false;
 }
 async function flush(){if(S.mapDirty)throw Error('매칭 탭의 입력을 먼저 저장하거나 되돌려 주세요.');if(S.composing)throw Error('한글 입력을 마친 뒤 다시 시도하세요.');if(queue.dirty()||queue.running)await queue.flush();}
 async function openDocument(key,revisionId){
  if(S.loading)return;
  if(S.actionBusy)throw Error('개정 처리가 끝난 뒤 문서를 전환하세요.');
  if(queue.error){if(!confirm('저장하지 못한 입력이 있습니다. 백업 내려받기를 먼저 하세요. 현재 화면 입력을 버리고 서버 자료를 다시 불러올까요?'))return;queue.error=null;queue.saved=queue.sequence;}
  S.loading=true;updateMeta();
  try{
   await flush();
   const src=await result(api().from('quality_workspace_sources').select('*').eq('doc_key',key).single());if(S.disposed)throw Error('문서가 닫혔습니다.');
   const revisions=await result(api().from('quality_workspace_revisions').select(REV_FIELDS).eq('doc_key',key).order('created_at',{ascending:false}));
   let selected=revisionId==='source'?null:revisionId?revisions.find(x=>x.id===revisionId):revisions.find(x=>['draft','submitted'].includes(x.status))||revisions.find(x=>x.status==='active')||null;
   if(revisionId&&revisionId!=='source'&&!selected)throw Error('해당 개정본을 찾을 수 없습니다.');
   if(selected)selected=await result(api().from('quality_workspace_revisions').select('*').eq('id',selected.id).single());
   const current=await result(api().rpc('df_qw_current',{p_key:key}));if(S.disposed)throw Error('문서가 닫혔습니다.');
   S.current=current;S.effective=S.effective.filter(x=>x.doc_key!==key).concat(current);S.editCurrent=false;S.correctionHistory=null;
   S.source=src;S.kind=src.kind;S.row=selected;S.history=revisions;S.payload=C.payload(!revisionId&&(!selected||selected.status==='active')?current.payload:selected?.payload||src.payload);S.range=null;S.previewValid=false;S.approvalPending=false;S.followCurrent=!revisionId;
   S.catalog=S.catalog.filter(r=>r.doc_key!==key).concat(revisions.filter(r=>['active','draft','submitted'].includes(r.status)));
   let repaired=null;
   // Approved/submitted records keep their stored appearance. A new draft can receive repairs.
   if(!selected||selected.status==='draft'&&!selected.approval_id){repaired=await window.DFQualityNativeFormat.restore(S.payload,key);S.payload=repaired.payload;}
   queue.reset(selected?.lock_version||0);$('reason').value=selected?.reason||'';$('reviewed').checked=S.payload.layoutReviewed;
   $('kind').value=S.kind;$('empty').hidden=true;$('issues').innerHTML='<ul>'+S.payload.issues.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>';
   $('issueCount').textContent='· '+S.payload.issues.length+'개 확인사항';
   $('saveState').textContent=selected?'서버 자료 불러옴':'원본 기반 기준자료';$('retry').hidden=true;say('');
   S.tab='document';showTab();renderToc();S.mode='edit';renderEditor();setMode('edit');updateMeta();S.undo=[];recordUndo();await loadFiles();renderHistory();
   const fontNote=document.createElement('p');fontNote.textContent='원본 글꼴: '+S.payload.fonts.join(', ')+'. 이 PC에 없는 글꼴은 대체 글꼴로 표시되므로 인쇄 전 확인하세요.';$('issues').append(fontNote);
   if(selected&&editable()){
    let recovered;try{recovered=JSON.parse(sessionStorage.getItem(backupKey())||'null');}catch(_){}
    if(recovered&&confirm('이 브라우저에 저장하지 못한 복구본이 있습니다. 서버 자료 위에 바로 저장하지 않고 화면에 복구할까요?')){
     repaired=await window.DFQualityNativeFormat.restore(C.payload(recovered.payload),key);S.payload=repaired.payload;$('reason').value=String(recovered.reason||'');$('reviewed').checked=false;renderEditor();changed({internal:true});
     // A recovery from an older server version must not overwrite another editor.
     if(recovered.version!==selected.lock_version){clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 복구본과 서버 저장 버전이 다릅니다. 백업 후 변경사항을 대조하세요.');queue.onState('error',queue.error);}
    }
   }
   if(repaired?.changed&&!queue.error){
    say('원본의 표·번호 들여쓰기·문단 간격을 보완했습니다. 인쇄 미리보기에서 원본과 대조해 주세요.',true);
    if(editable()&&!queue.error){queue.change();await queue.flush(true);}
   }
  }finally{S.loading=false;updateMeta();}
 }
 function renderEditor(){
  $('editorPages').innerHTML='';const m=metadata();
  S.payload.sections.forEach((s,i)=>{
   const p=document.createElement('article');p.className='paper source-segment';p.style.width=s.page.width+'pt';p.style.minHeight=s.page.height+'pt';p.style.padding=`${s.page.top}pt ${s.page.right}pt ${s.page.bottom}pt ${s.page.left}pt`;
   p.innerHTML=`<div class="draft-label">${esc(STATUS[m.status])} · 편집 구역 ${i+1}${liveToc()?' · 현재 등록번호 반영 목차':''}</div><div class="paper-header">${C.bindHeader(s.header,m,'—','—')}</div><div class="editable" role="textbox" aria-multiline="true" aria-label="${esc(S.source.title)} 본문 ${i+1}" spellcheck="false"></div><div class="paper-footer">${C.bindHeader(s.footer,m,'—','—')}</div><div class="page-footline"><span>${esc(m.key)} · Rev.${String(m.revision).padStart(2,'0')}</span><span>쪽수는 인쇄 미리보기에서 자동 계산</span></div>`;
   const e=p.querySelector('.editable');e.innerHTML=s.html;applyToc(e);e.contentEditable=String(editable()&&!S.loading);
   e.addEventListener('input',()=>{if(!S.composing)changed();});e.addEventListener('compositionstart',()=>{S.composing=true;clearTimeout(queue.timer);});e.addEventListener('compositionend',()=>{S.composing=false;changed();});
   e.addEventListener('paste',event=>{if(!editable())return;event.preventDefault();const html=event.clipboardData.getData('text/html');const plain=event.clipboardData.getData('text/plain');document.execCommand('insertHTML',false,html?C.sanitize(html):esc(plain).replace(/\n/g,'<br>'));changed();});
   e.addEventListener('drop',event=>event.preventDefault());$('editorPages').append(p);
  });fit();
 }
 function setMode(mode){
  if(!S.source)return;if(mode==='preview'&&S.mode==='edit')S.payload=collect().payload;
  if(mode==='edit'&&S.mode==='preview')renderEditor();S.mode=mode;
  $('editMode').setAttribute('aria-pressed',String(mode==='edit'));$('previewMode').setAttribute('aria-pressed',String(mode==='preview'));
  $('editorPages').hidden=mode!=='edit';$('printPages').hidden=mode!=='preview';updateMeta();fit();
 }
 function fit(){
  const val=$('zoom').value;const width=$('canvas').clientWidth-40,scale=val==='fit'?Math.min(1,Math.max(.3,width/(210*96/25.4))):Number(val)/100;
  $('editorPages').style.zoom=scale;$('printPages').style.zoom=scale;
 }
 async function draft(){
  if(!S.source||S.loading||S.actionBusy||!can('create'))return;await flush();
  const active=S.history.find(x=>x.status==='active');let base=null;
  if(!active){const value=prompt('원본의 기준 개정번호를 확인해 주세요. 다음 개정번호의 미승인 초안을 만듭니다.\n머리말·꼬리말이 서로 다르면 승인된 관리대장을 기준으로 입력하세요.',String(effectiveFor(S.source.doc_key)?.revision??S.source.base_revision));if(value===null)return;if(!/^\d{1,4}$/.test(value))throw Error('0~9998의 정수를 입력하세요.');base=Number(value);}
  await result(api().rpc('df_qw_new_draft',{p_key:S.source.doc_key,p_base_revision:base}));await openDocument(S.source.doc_key);
 }
 async function startCorrection(){
  if(!S.source||S.loading||S.actionBusy||!can('update'))return;
  if(workingFor(S.source.doc_key))throw Error('진행 중인 개정 초안에서 수정할 수 있습니다. 현재 번호를 유지하려면 개정을 취소한 뒤 수정하세요.');
  await flush();if(!showingCurrent())await openDocument(S.source.doc_key);
  S.editCurrent=true;queue.reset(S.current.lock_version);$('reason').value='본문·서식 수정 (개정번호 유지)';
  const repaired=await window.DFQualityNativeFormat.restore(S.payload,S.source.doc_key);S.payload=repaired.payload;S.mode='edit';renderEditor();setMode('edit');S.undo=[];recordUndo();
  let saved;try{saved=JSON.parse(sessionStorage.getItem(backupKey())||'null');}catch(_){}
  if(saved&&confirm('저장하지 못한 수정 내용이 있습니다. 화면에 복구할까요?')){
   S.payload=C.payload(saved.payload);$('reason').value=saved.reason||'복구한 수정 내용';renderEditor();changed();
   if(saved.version!==S.current.lock_version){clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 복구본과 서버의 수정 이력이 다릅니다. 백업 후 대조하세요.');queue.onState('error',queue.error);}
  }
  if(!queue.error)say('수정 모드입니다. 글자·띄어쓰기·내용·서식을 고치면 자동 저장되며 개정번호는 유지됩니다. 수정 전후 내용은 이력에 남습니다.',true);
 }
 function showTab(){
  const matching=S.tab==='matching';$('matchingPanel').hidden=!matching;$('documentPanel').hidden=matching;
  $('documentTab').setAttribute('aria-selected',String(!matching));$('matchingTab').setAttribute('aria-selected',String(matching));
 }
 async function setTab(tab){
  await flush();S.tab=tab;showTab();if(tab==='matching')await loadMatching();else{await syncStatus(true);if(S.mode==='preview'&&!S.previewValid)await preview();}
 }
 async function loadMatching(){
  await flush();if(S.loading||S.actionBusy)return;
  S.actionBusy=true;$('matchRefresh').disabled=true;updateMeta();
  try{
   await refresh();S.matchSources=await result(api().from('quality_workspace_sources').select('*').order('doc_key'));
   S.currentTocBooks=await Promise.all(S.matchSources.filter(d=>d.doc_key.endsWith('-00')).map(d=>result(api().rpc('df_qw_current',{p_key:d.doc_key}))));
   S.sourceToc={};S.bookHistory={};S.sourceHints={};for(const d of S.matchSources.filter(x=>x.doc_key.endsWith('-00'))){const div=document.createElement('div');div.innerHTML=C.sanitize(d.payload.sections.map(s=>s.html).join(''));for(const r of C.tocRows(div))S.sourceToc[r.key]={revision:Number(r.revisionCell.textContent.trim()),title:r.titleCell?.textContent.trim()||''};
    const entries=[];for(const table of div.querySelectorAll('table'))if(/이\s*력\s*사\s*항/.test(table.textContent))for(const row of table.rows){const cells=Array.from(row.cells).map(c=>c.textContent.trim());if(/^\d{1,4}$/.test(cells[0])&&/^20\d{2}[.-]\d{2}[.-]\d{2}/.test(cells[1]))entries.push({number:Number(cells[0]),date:cells[1],scope:cells[2]});}
    S.bookHistory[d.kind]=entries.sort((a,b)=>a.number-b.number).at(-1);
   }
   renderMatching();if(S.matchKey&&S.matchSources.some(d=>d.doc_key===S.matchKey&&d.kind===S.kind))await chooseMatch(S.matchKey);else $('matchDetail').hidden=true;
  }finally{S.actionBusy=false;$('matchRefresh').disabled=false;updateMeta();}
 }
 function renderMatching(){
  const docs=(S.matchSources||[]).filter(d=>d.kind===S.kind),numbers=values=>values.length?values.map(rev).join(' / '):'없음';let differences=0;
  S.currentToc={};const records=Object.fromEntries(S.effective.map(r=>[r.doc_key,r]));
  for(const book of S.currentTocBooks||[]){const div=document.createElement('div');div.innerHTML=C.sanitize(book.payload.sections.map(s=>s.html).join(''));C.bindToc(div,records);for(const row of C.tocRows(div))(S.currentToc[row.key]||=[]).push({book:book.doc_key,revision:Number(row.revisionCell.textContent.trim()),title:row.titleCell?.textContent.trim()||''});}
  $('matchRows').innerHTML=docs.map(d=>{
   const e=effectiveFor(d.doc_key),hints=S.sourceHints[d.doc_key]||(S.sourceHints[d.doc_key]={head:C.revisionHints(d.payload),foot:C.revisionHints(d.payload,'footer')}),{head,foot}=hints,toc=S.sourceToc[d.doc_key],w=workingFor(d.doc_key);
   const conflict=head.length!==1||foot.some(n=>n!==head[0])||d.base_revision!==head[0],tocDiff=toc&&toc.revision!==e?.revision;
   if(conflict||tocDiff)differences++;
   const links=S.currentToc[d.doc_key]||[],cover=d.doc_key.endsWith('-00'),linked=links.length===1&&links[0].revision===e?.revision;
   const note=cover?'표지·이력·목차':links.length>1?'목차 중복 연결':linked?'목차·본문 연결됨':'목차 연결 확인 필요';
   const tocText=cover?'목차 원문':links.length?links.map(x=>rev(x.revision)).join(' / '):'연결된 행 없음';
   return `<tr><td><strong>${esc(d.doc_key)}</strong><br>${esc(e?.title||d.title)}</td><td>${esc(rev(e?.revision??d.base_revision))}<small>${e?.has_correction?'수정·매칭 반영':e?.basis_id?'시행본 기준':'원본 머리말 기준'}${w?' · 개정 진행 중':''}</small></td><td><strong>${esc(tocText)}</strong>${links[0]?'<small>'+esc(links[0].title)+'</small>':''}<button data-match-toc="${esc(d.doc_key)}" class="toc-link-button">현재 목차 보기</button></td><td>${esc(note)}${e?.has_correction?'<small>정정 이력 있음</small>':''}</td><td><button data-match-key="${esc(d.doc_key)}">확인·수정</button></td></tr>`;
  }).join('');
  const broken=docs.filter(d=>!d.doc_key.endsWith('-00')&&((S.currentToc[d.doc_key]||[]).length!==1||S.currentToc[d.doc_key][0].revision!==effectiveFor(d.doc_key)?.revision));
  $('matchSummary').textContent=`${docs.length}개 문서 대조 · 현재 목차 연결 확인 ${broken.length}개. 번호와 제목은 현재 저장본에서 함께 반영됩니다. 원본 표기 차이 ${differences}개는 확인·수정에서 비교할 수 있습니다.`;
  const history=S.bookHistory[S.kind];$('matchBookHistory').textContent=history?`원본 책 전체 이력표의 마지막 기록: No.${String(history.number).padStart(2,'0')} · ${history.date} · ${history.scope}. 이 번호와 각 문서 머리말이 다를 수 있으므로 관리대장과 함께 대조하세요.`:'';
  $('matchRows').querySelectorAll('[data-match-key]').forEach(b=>b.onclick=run(()=>chooseMatch(b.dataset.matchKey)));
  $('matchRows').querySelectorAll('[data-match-toc]').forEach(b=>b.onclick=run(()=>openMatchingToc(b.dataset.matchToc)));
 }
 async function openMatchingToc(key){
  await flush();const book=S.currentToc[key]?.[0]?.book||key.slice(0,-2)+'00';await openDocument(book);await preview();
  Array.from($('printPages').querySelectorAll('[data-qw-toc-target]')).find(r=>r.dataset.qwTocTarget===key)?.scrollIntoView?.({block:'center'});
 }
 async function chooseMatch(key){
  if(S.mapDirty)throw Error('현재 매칭 입력을 저장하거나 되돌린 뒤 다른 문서를 선택하세요.');
  const current=await result(api().rpc('df_qw_current',{p_key:key}));if(S.disposed)return;
  S.matchKey=key;S.matchCurrent=current;S.matchCopy=null;S.mapDirty=false;$('matchDetail').hidden=false;
  const working=workingFor(key),locked=!!working||!can('update');$('matchKey').textContent=key;
  $('matchTitle').value=current.title;$('matchRevision').value=current.revision;$('matchReason').value='문서 제목·개정번호·본문 연결 대조 및 정정';
  $('matchBody').innerHTML='<option value="">현재 본문 유지</option>'+(S.matchSources||[]).filter(d=>d.kind===S.kind&&d.doc_key!==key&&!d.doc_key.endsWith('-00')).map(d=>`<option value="${esc(d.doc_key)}">${esc(d.doc_key+' · '+(effectiveFor(d.doc_key)?.title||d.title))}</option>`).join('');
  $('matchBody').value='';const original=S.matchSources.find(d=>d.doc_key===key),hints=S.sourceHints[key],links=S.currentToc[key]||[];$('matchEvidence').textContent='현재 본문 '+rev(current.revision)+' / 현재 목차 '+(links.length?links.map(x=>rev(x.revision)).join(', '):key.endsWith('-00')?'표지·목차':'연결 없음')+' · 원본 보존 기록: 머리말 '+(hints?.head.map(rev).join(', ')||'없음')+', 꼬리말 '+(hints?.foot.map(rev).join(', ')||'없음')+', 목차 '+(S.sourceToc[key]?rev(S.sourceToc[key].revision):'없음')+' · 원본 제목: '+(original?.title||'—');$('matchBodyFrom').textContent=current.body_from?'본문 가져온 문서: '+current.body_from:'현재 문서에 저장된 본문';
  $('matchLock').textContent=working?'진행 중인 개정 초안이 있습니다. 초안 수정 또는 개정 취소 후 매칭을 변경하세요.':'저장하면 제목·번호·본문 연결을 정정합니다. 개정번호를 자동으로 올리거나 새로 승인하지 않습니다.';
  for(const id of ['matchTitle','matchRevision','matchReason','matchBody','matchSave','matchEdit'])$(id).disabled=locked;
  renderMatchPreview(current);$('matchDetail').scrollIntoView?.({block:'nearest'});
 }
 function renderMatchPreview(record){
  $('matchPreviewLabel').textContent=(record.doc_key===S.matchKey?'현재 본문':'가져올 본문')+' · '+record.doc_key+' · '+record.title+' · '+rev(record.revision);
  $('matchPreview').innerHTML=C.payload(record.payload).sections.map(s=>'<section class="match-body-section">'+s.html+'</section>').join('');
 }
 async function previewMatchBody(){
  const key=$('matchBody').value,target=S.matchKey;S.matchCopy=null;
  if(!key){renderMatchPreview(S.matchCurrent);return;}
  const copy=await result(api().rpc('df_qw_current',{p_key:key}));
  if(S.matchKey!==target||$('matchBody').value!==key)return;S.matchCopy=copy;renderMatchPreview(copy);
 }
 async function saveMatching(){
  if(S.actionBusy||S.disposed||!S.matchCurrent||!can('update'))return;
  const current=S.matchCurrent,title=$('matchTitle').value.trim(),raw=$('matchRevision').value,reason=$('matchReason').value.trim(),copyKey=$('matchBody').value;
  if(!title||title.length>160||!/^\d{1,4}$/.test(raw)||!reason)throw Error('제목·0~9999의 개정번호·수정 사유를 확인하세요.');
  const copy=S.matchCopy;if(copyKey&&copy?.doc_key!==copyKey)throw Error('가져올 본문 미리보기를 불러오는 중입니다.');
  if(copy&&!confirm(`${current.doc_key}의 본문을 ${copy.doc_key}에서 가져온 내용으로 바꿀까요?\n위 미리보기를 확인하세요. 변경 전 본문은 수정 이력에 보존됩니다.`))return;
  S.actionBusy=true;$('matchSave').disabled=true;updateMeta();
  try{
   const saved=await result(api().rpc('df_qw_correct',{p_key:current.doc_key,p_basis:current.basis_id,p_basis_version:current.basis_version,p_expected:current.lock_version,p_title:title,p_revision:Number(raw),p_reason:reason,...(copy?{p_copy_key:copy.doc_key,p_copy_basis:copy.basis_id,p_copy_basis_version:copy.basis_version,p_copy_expected:copy.lock_version}:{})}));
   if(current.doc_key.endsWith('-00'))S.currentTocBooks=(S.currentTocBooks||[]).filter(b=>b.doc_key!==current.doc_key).concat(saved);
   S.mapDirty=false;await refresh();renderMatching();await chooseMatch(current.doc_key);S.previewValid=false;
   say('매칭을 저장했습니다. 목차·머리말·꼬리말·현재 본문에 반영되며, 수정 전후 기록이 보존됩니다.',true);
  }finally{S.actionBusy=false;$('matchSave').disabled=!!workingFor(current.doc_key)||!can('update');updateMeta();}
 }
 async function cancelRevision(){
  if(S.actionBusy||!S.row||!['draft','submitted'].includes(S.row.status)||!can('update'))return;
  if(S.approvalPending)throw Error('열린 결재창을 닫고 최신 상태를 확인한 뒤 취소하세요.');
  const reason=prompt('개정을 취소하고 현재 시행본(없으면 기준자료)으로 돌아갑니다.\n연결된 미승인 결재도 함께 취소되며, 공식 개정번호는 바뀌지 않습니다.\n작성 내용은 취소 이력에 보존됩니다. 취소 사유를 입력하세요.','시험 개정 취소');
  if(reason===null)return;if(!reason.trim())throw Error('취소 사유를 입력하세요.');
  const key=S.source.doc_key,localKey=backupKey();S.actionBusy=true;updateMeta();
  try{
   await flush();
   const data=await result(api().rpc('df_qw_cancel',{p_id:S.row.id,p_expected:queue.version,p_reason:reason.trim()}));
   const row=Array.isArray(data)?data[0]:data;if(!row||row.status!=='cancelled')throw Error('취소 결과를 확인하지 못했습니다. 최신 상태를 확인하세요.');
   S.row=row;queue.reset(row.lock_version);S.approvalPending=false;try{sessionStorage.removeItem(localKey);}catch(_){}
   await refresh();S.actionBusy=false;await openDocument(key);
   say('개정을 취소했습니다. 현재 시행본(없으면 기준자료)으로 돌아왔고, 공식 개정번호는 유지됩니다. 취소한 내용은 개정이력에서 확인할 수 있습니다.',true);
  }catch(e){
   if(/df_qw_cancel|PGRST202|schema cache/i.test((e.code||'')+' '+e.message))throw Error('개정 취소 기능의 quality_workspace_44.sql을 먼저 실행해 주세요. 입력 내용은 보존되어 있습니다.');
   if(!queue.dirty()&&!queue.error)setTimeout(()=>syncStatus(true).catch(syncFailure),0);
   throw e;
  }finally{S.actionBusy=false;updateMeta();}
 }
 function rememberSelection(){
  const selection=window.getSelection();if(!selection?.rangeCount)return;const r=selection.getRangeAt(0),node=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;
  if(!node?.closest('.editable'))return;S.range=r.cloneRange();const cs=getComputedStyle(node),paragraph=node.closest('p,li,h1,h2,h3,h4');
  if(cs.fontSize)$('size').value=(parseFloat(cs.fontSize)*72/96).toFixed(1);const family=cs.fontFamily.split(',')[0].replace(/["']/g,'').trim();
  if(family){if(!Array.from($('font').options).some(x=>x.value===family))$('font').add(new Option(family,family));$('font').value=family;}
  if(paragraph){const p=getComputedStyle(paragraph);$('indentLeft').value=(parseFloat(p.marginLeft||0)*25.4/96).toFixed(1);$('indentFirst').value=(parseFloat(p.textIndent||0)*25.4/96).toFixed(1);if(parseFloat(p.lineHeight)&&parseFloat(p.fontSize))$('line').value=Math.round(parseFloat(p.lineHeight)/parseFloat(p.fontSize)*100);}
 }
 function selection(){if(!editable()||S.loading||S.mode!=='edit')throw Error('수정 또는 개정 초안의 편집 모드에서 사용하세요.');if(!S.range||!S.range.startContainer.isConnected)throw Error('본문에서 적용할 위치나 글자를 먼저 선택하세요.');const s=window.getSelection();s.removeAllRanges();s.addRange(S.range);return s;}
 function command(name,value){selection();document.execCommand('styleWithCSS',false,true);document.execCommand(name,false,value);rememberSelection();changed();}
 function paragraphs(){selection();const root=S.range.commonAncestorContainer.nodeType===1?S.range.commonAncestorContainer:S.range.commonAncestorContainer.parentElement;const area=root.closest('.editable');if(!area)throw Error('한 편집 구역 안에서 선택하세요.');let list=Array.from(area.querySelectorAll('p,li,h1,h2,h3,h4')).filter(n=>S.range.intersectsNode(n));if(!list.length){document.execCommand('formatBlock',false,'p');rememberSelection();return paragraphs();}return list;}
 function styleParagraph(style){paragraphs().forEach(n=>Object.assign(n.style,style));changed();}
 function fontSize(){const value=Number($('size').value);if(value<6||value>72)throw Error('글자 크기는 6~72pt입니다.');selection();document.execCommand('styleWithCSS',false,false);document.execCommand('fontSize',false,'7');document.querySelectorAll('.editable font[size="7"]').forEach(n=>{const s=document.createElement('span');s.style.fontSize=value+'pt';s.append(...n.childNodes);n.replaceWith(s);});rememberSelection();changed();}
 function download(name,data,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function backup(){if(!S.source)throw Error('백업할 문서를 선택하세요.');download(S.source.doc_key+'_Rev'+metadata().revision+'_backup.qw.json',JSON.stringify({format:'dreamforen.quality.backup.v1',doc_key:S.source.doc_key,revision:S.row?.revision,serverVersion:queue.version,savedAt:new Date().toISOString(),...collect()},null,2));say('백업에는 현재 화면의 입력이 포함됩니다. 서버 저장 성공 여부와는 별개입니다.',true);}
 async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');}
 async function uploadFile(file,kind,revision=null,expectedHash=null){
  if(!B.can(kind,'upload'))throw Error(kind+' 파일등록 권한이 없습니다.');if(!file.size||file.size>20*1024*1024)throw Error('파일은 20MB 이하로 등록하세요.');
  const ext=file.name.split('.').at(-1).toLowerCase();if(!/^(hwp|hwpx|pdf|docx|xlsx|png|jpg|jpeg)$/.test(ext))throw Error('지원하지 않는 파일 형식입니다.');
  const bytes=await file.arrayBuffer(),hash=await sha256(bytes);if(expectedHash&&expectedHash!==hash)throw Error('원본 파일 해시가 일치하지 않습니다.');
  const path=kind+'/'+hash+'.'+ext,bucket=api().storage.from('quality-workspace-originals');
  let lookup=api().from('quality_workspace_files').select('*').eq('path',path);lookup=revision?lookup.eq('revision_id',revision):lookup.is('revision_id',null);
  const previous=await result(lookup.maybeSingle());if(previous)return previous;
  const u=await bucket.upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(u.error){
   // A prior successful upload with a failed metadata request is safe to retry.
   const existing=await bucket.download(path);if(existing.error||!existing.data||await sha256(await existing.data.arrayBuffer())!==hash)throw u.error;
  }
  return result(api().rpc('df_qw_register_file',{p_kind:kind,p_revision:revision,p_name:file.name,p_sha:hash,p_size:file.size,p_ext:ext}));
 }
 async function importFile(file){
  if(!file)return;if(file.size>20*1024*1024)throw Error('가져오기 파일은 20MB 이하로 선택하세요.');await flush();const pack=JSON.parse(await file.text());
  if(pack.format==='dreamforen.quality.backup.v1'){
   if(!editable()||pack.doc_key!==S.source.doc_key)throw Error('백업과 같은 문서를 열고 수정 또는 개정 초안 편집을 시작하세요.');
   if(!confirm('현재 편집 중인 본문을 선택한 백업으로 바꿀까요? 기존 서버 상태는 저장시점 이력에 먼저 보존됩니다.'))return;
   await queue.flush(true);S.payload=C.payload(pack.payload);$('reason').value=String(pack.reason||'');$('reviewed').checked=false;S.mode='edit';setMode('edit');renderEditor();changed();return;
  }
  if(pack.format!=='dreamforen.quality.import.v1'||!Array.isArray(pack.documents)||pack.documents.length>100||!Array.isArray(pack.originals)||pack.originals.length>10)throw Error('제공된 기준문서 가져오기 파일을 선택하세요.');
  const cleaned=pack.documents.map(d=>{if(!/^DFEN-Q[MPI]-\d{2}$/.test(d.key)||!['manual','procedure','instruction'].includes(d.kind)||!B.can(d.kind,'create')||!B.can(d.kind,'upload'))throw Error('문서번호와 작성·등록 권한을 확인하세요.');return {...d,payload:C.payload(d.payload)};});
  if(!confirm(`${cleaned.length}개 기준문서와 ${pack.originals.length}개 원본을 등록합니다. 기존 기준자료를 덮어쓰거나 승인하지 않습니다. 진행할까요?`))return;
  $('importButton').disabled=true;
  try{
   for(const o of pack.originals){const bytes=Uint8Array.from(atob(o.data),c=>c.charCodeAt(0));if(bytes.length!==o.size)throw Error('원본 크기 불일치');await uploadFile(new File([bytes],o.name),o.kind,null,o.sha256);}
   let count=0;for(const d of cleaned){$('saveState').textContent=`기준자료 등록 중 ${++count}/${cleaned.length}`;await result(api().rpc('df_qw_import_source',{p_key:d.key,p_title:d.title,p_base:d.baseRevision,p_payload:d.payload,p_sha:d.sourceSha256}));}
   await refresh();say('기준자료와 원본 등록 완료. 목차에서 문서를 선택해 수정 또는 개정을 시작하세요.',true);$('saveState').textContent='기준자료 등록 완료';
  }finally{$('importButton').disabled=false;}
 }
 async function loadFiles(){
  const rows=await result(api().from('quality_workspace_files').select('*').eq('kind',S.kind).order('created_at',{ascending:false}));
  $('files').innerHTML='';for(const f of rows.filter(x=>!x.revision_id||x.revision_id===S.row?.id)){
   const b=document.createElement('button');b.textContent=f.name+' · '+(f.size/1024).toFixed(0)+' KB · 원본 내려받기';b.onclick=run(async()=>{const blob=await result(api().storage.from('quality-workspace-originals').download(f.path));download(f.name,blob,blob.type);});$('files').append(b);
  }
 }
 function renderHistory(){
  $('history').innerHTML='<button data-revision="source">원본 기반 기준자료 보기</button>'+S.history.map(r=>`<button data-revision="${esc(r.id)}">Rev.${String(r.revision).padStart(2,'0')} · ${esc(STATUS[r.status])} · ${esc(new Date(r.created_at).toLocaleString('ko-KR'))}</button>`).join('');
  $('history').querySelectorAll('button').forEach(b=>b.onclick=run(()=>openDocument(S.source.doc_key,b.dataset.revision)));
  const historyKey=S.source.doc_key;
  result(api().from('quality_workspace_correction_history').select('id,event,created_at').eq('doc_key',historyKey).order('id',{ascending:false}).limit(40)).then(rows=>{
   if(S.disposed||S.source?.doc_key!==historyKey)return;
   for(const r of rows){const b=document.createElement('button');b.textContent=(r.event==='before'?'수정 전':r.event==='matching'?'매칭 정정':'번호 유지 수정')+' · '+new Date(r.created_at).toLocaleString('ko-KR');b.onclick=run(async()=>{
    await flush();const x=await result(api().from('quality_workspace_correction_history').select('*').eq('id',r.id).single());await openDocument(historyKey,'source');
    S.correctionHistory=x.state;S.payload=C.payload(x.state.payload);S.previewValid=false;$('reason').value=x.state.reason||'';renderEditor();updateMeta();say('선택한 수정 시점의 기록입니다. 현재 문서는 목차에서 다시 열 수 있습니다.',true);
   });$('history').append(b);}
  }).catch(error);
  $('snapshots').innerHTML='';if(!S.row)return;
  result(api().from('quality_workspace_snapshots').select('id,revision_id,lock_version,event,created_at').eq('revision_id',S.row.id).order('created_at',{ascending:false}).limit(30)).then(rows=>{
   for(const r of rows){const b=document.createElement('button');b.textContent='저장시점 '+new Date(r.created_at).toLocaleString('ko-KR')+' · '+r.event+' · 백업';b.onclick=run(async()=>{const x=await result(api().from('quality_workspace_snapshots').select('*').eq('id',r.id).single());download(S.source.doc_key+'_snapshot_'+r.id+'.qw.json',JSON.stringify({format:'dreamforen.quality.backup.v1',doc_key:S.source.doc_key,payload:x.payload,reason:x.reason,serverVersion:x.lock_version}));});$('snapshots').append(b);}
  }).catch(error);
 }
 async function approval(){
  if(S.editCurrent)throw Error('번호를 유지하는 수정은 자동 저장됩니다. 새 결재가 필요하면 개정 초안을 만드세요.');
  await queue.flush(true);if(!editable())throw Error('결재를 요청할 초안을 확인하세요.');
  if(!$('reviewed').checked||!$('reason').value.trim())throw Error('원본 대조 확인과 개정사유를 먼저 입력하세요.');
  if(!S.previewValid)await preview();if(S.overflow)throw Error('인쇄 영역 초과 항목을 먼저 수정하세요.');
  if(!confirm('현재 저장본을 기존 내부결재에 연결합니다. 기안이 저장되면 본문 편집이 잠기며, 승인 후 시행본으로 반영됩니다. 계속할까요?'))return;
  S.approvalPending=true;updateMeta();
  try{B.approval({doc_type:'general',locked:true,title:`${S.source.doc_key} ${metadata().title} Rev.${String(S.row.revision).padStart(2,'0')} 개정 승인`,content:`DF-QW:${S.row.id}:${S.row.lock_version}\n[첫 줄은 문서 연결정보이므로 수정하지 마세요.]\n문서번호: ${S.source.doc_key}\n개정번호: ${S.row.revision}\n개정사유: ${S.row.reason}\n\n품질문서 작업실에서 연결된 저장본을 검토하세요. 원본 대조 확인: 완료\n이 연결 이후의 내용 변경은 잠기며, 기존 결재선의 최종 승인 후에만 시행됩니다.`});}
  catch(e){S.approvalPending=false;updateMeta();throw e;}
  say('기존 결재창에서 결재선을 확인하고 저장 또는 상신하세요. 결재창을 닫으면 상태를 자동 확인합니다. 저장하지 않고 닫으면 본문 편집을 이어갈 수 있습니다.',true);
 }
 // The reader uses the same pagination and print layout as editing previews.
 async function preview(){
  if(!S.source)return;await flush();if(S.mode==='edit')S.payload=collect().payload;
  const meta=metadata(),result=await window.DFQualityPrint.render({documents:[{meta,payload:S.payload,label:STATUS[meta.status]}],records:Object.fromEntries(S.effective.map(r=>[r.doc_key,r])),live:liveToc()});
  if(S.disposed)return;$('printPages').replaceChildren(...result.pages);S.previewValid=true;S.overflow=result.overflow;$('pageCount').textContent=result.pages.length+'쪽';setMode('preview');
  if(S.overflow)say('인쇄 영역을 초과한 표 또는 개체가 있습니다(주황색 테두리). 글자 크기·여백·행 높이를 조정한 뒤 다시 확인하세요.');
  $('print').disabled=S.overflow;
 }
 async function selectKind(kind){
  if(!['manual','procedure','instruction'].includes(kind)||!B.can(kind,'view'))throw Error('문서 조회 권한을 확인하세요.');
  try{
   if(S.actionBusy||S.loading)throw Error('현재 문서 처리가 끝난 뒤 다시 선택하세요.');await flush();
   const first=S.sources.find(x=>x.kind===kind);if(first){const tab=S.tab;await openDocument(first.doc_key);if(tab==='matching')await setTab('matching');return;}
   S.kind=kind;S.source=null;S.row=null;S.payload=null;S.history=[];S.range=null;queue.reset(0);
   for(const id of ['editorPages','printPages','history','snapshots','files','issues'])$(id).replaceChildren();
   $('empty').hidden=false;$('code').textContent='등록된 문서가 없습니다';$('title').textContent=$('kind').selectedOptions[0]?.textContent||'품질문서';$('meta').textContent='기준문서 가져오기로 등록할 수 있습니다.';
   for(const id of ['save','newDraft','correct','finishCorrection','matchSave','matchEdit','approve','cancelRevision','print','upload','reviewed'])$(id).disabled=true;
   $('formatTools').disabled=true;$('paragraphTools').disabled=true;$('reason').value='';$('reason').disabled=true;$('approvalList').hidden=true;$('tocNotice').hidden=true;$('pageCount').textContent='';renderToc();
  }finally{$('kind').value=S.kind;}
 }
 function bind(){
  $('kind').onchange=run(()=>selectKind($('kind').value));$('search').oninput=renderToc;
  $('documentTab').onclick=run(()=>setTab('document'));$('matchingTab').onclick=run(()=>setTab('matching'));
  $('correct').onclick=run(startCorrection);$('finishCorrection').onclick=run(async()=>{await flush();S.editCurrent=false;updateMeta();renderHistory();say('수정 내용을 저장했습니다. 개정번호는 그대로 유지됩니다.',true);});
  $('matchRefresh').onclick=run(loadMatching);$('matchReset').onclick=run(async()=>{S.mapDirty=false;await chooseMatch(S.matchKey);});$('matchSave').onclick=run(saveMatching);
  $('matchEdit').onclick=run(async()=>{await flush();await openDocument(S.matchKey);await startCorrection();});
  for(const id of ['matchTitle','matchRevision','matchReason'])$(id).oninput=()=>S.mapDirty=true;
  $('matchBody').onchange=run(async()=>{S.mapDirty=true;await previewMatchBody();});
  $('newDraft').onclick=run(draft);$('save').onclick=run(()=>queue.flush(true));$('retry').onclick=run(()=>queue.retry());$('backup').onclick=run(backup);
  $('cancelRevision').onclick=run(cancelRevision);$('refreshStatus').onclick=run(()=>syncStatus(true));
  $('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=run(async e=>{try{await importFile(e.target.files[0]);}finally{e.target.value='';}});
  $('reason').oninput=()=>changed();$('reviewed').onchange=()=>changed({review:true});$('approve').onclick=run(approval);
  $('approvalList').onclick=run(async()=>{await flush();B.approvalList();});
  $('legacyFiles').onclick=run(async()=>{await flush();B.legacyFiles?.(S.kind);});
  $('editMode').onclick=()=>setMode('edit');$('previewMode').onclick=run(preview);$('zoom').onchange=fit;window.addEventListener('resize',fit);
  $('printPages').onclick=run(async e=>{const row=e.target.closest?.('[data-qw-toc-target]');if(row&&liveToc())await openDocument(row.dataset.qwTocTarget);});
  $('print').onclick=run(async()=>{await preview();if(S.overflow)throw Error('인쇄 영역 초과 항목을 먼저 수정하세요.');window.print();});
  $('upload').onchange=run(async e=>{const file=e.target.files[0];if(!file)return;try{await flush();await uploadFile(file,S.kind,S.row?.id||null);await loadFiles();say('원본 파일을 별도로 보존했습니다. 본문은 바뀌지 않았습니다.',true);}finally{e.target.value='';}});
  $('refreshHistory').onclick=run(()=>S.source&&openDocument(S.source.doc_key));$('back').onclick=run(async()=>{await flush();await B?.leave();});
  document.addEventListener('selectionchange',rememberSelection);
  document.querySelectorAll('[data-command]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=run(()=>command(b.dataset.command));});
  document.querySelectorAll('[data-align]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=run(()=>styleParagraph({textAlign:b.dataset.align}));});
  $('font').onchange=run(()=>command('fontName',$('font').value));$('size').onchange=run(fontSize);$('color').onchange=run(()=>command('foreColor',$('color').value));
  $('applyPara').onclick=run(()=>{const left=Number($('indentLeft').value),first=Number($('indentFirst').value),line=Number($('line').value);if(left<0||left>80||first<-left||first>80||line<80||line>300)throw Error('내어쓰기 폭은 왼쪽 여백 이내로, 줄간격은 80~300%로 입력하세요.');styleParagraph({marginLeft:left+'mm',textIndent:first+'mm',lineHeight:String(line/100)});});
  $('undo').onclick=run(()=>restoreUndo(false));$('redo').onclick=run(()=>restoreUndo(true));
  $('pageBreak').onclick=run(()=>command('insertHTML','<div data-page-break="1"><br></div><p><br></p>'));
  $('table').onclick=run(()=>{const n=prompt('행 × 열 (예: 3x3)','3x3');if(n===null)return;const m=n.match(/^(\d{1,2})\s*[x×]\s*(\d{1,2})$/);if(!m||+m[1]<1||+m[1]>20||+m[2]<1||+m[2]>12)throw Error('최대 20행 × 12열로 입력하세요.');command('insertHTML','<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tbody>'+Array.from({length:+m[1]},()=>'<tr>'+Array.from({length:+m[2]},()=>'<td style="border:1px solid #333;padding:4pt"><p><br></p></td>').join('')+'</tr>').join('')+'</tbody></table><p><br></p>');});
  $('margins').onclick=run(()=>{if(!editable())return;const p=S.payload.sections[0].page;for(const input of $('marginDialog').querySelectorAll('input'))input.value=(p[input.name]*25.4/72).toFixed(1);$('marginDialog').showModal();});
  $('applyMargins').onclick=e=>{const values={};for(const n of $('marginDialog').querySelectorAll('input')){if(!n.checkValidity()){e.preventDefault();n.reportValidity();return;}values[n.name]=Number(n.value)*72/25.4;}S.payload=collect().payload;S.payload.sections.forEach(s=>Object.assign(s.page,values));renderEditor();changed();};
  window.addEventListener('beforeunload',e=>{if(queue.dirty()||queue.running||S.mapDirty){recovery();e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if(S.tab==='matching'){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();run(saveMatching)();}return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(editable()&&!S.loading)run(()=>queue.flush(true))();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();$('print').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&editable()){e.preventDefault();restoreUndo(e.shiftKey);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&editable()){e.preventDefault();restoreUndo(true);}});
  window.addEventListener('beforeprint',()=>{if(!S.previewValid||S.overflow){$('printPages').hidden=true;$('printPages').textContent='인쇄 미리보기를 먼저 확인하세요. 인쇄 대화상자를 취소해 주세요.';}});
 }
 const catalogStamp=rows=>JSON.stringify(rows.map(r=>[r.id,r.doc_key,r.status,r.revision,r.lock_version,r.approval_id]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
 const currentStamp=e=>JSON.stringify(e&&[e.doc_key,e.basis_id,e.basis_version,e.lock_version,e.revision,e.title]);
 function syncFailure(){if(!S.disposed){$('refreshStatus').textContent='상태 확인 재시도';$('refreshStatus').classList.add('sync-stale');$('refreshStatus').title='연결이 끊겨 최신 결재 상태를 확인하지 못했습니다.';}}
 async function syncStatus(force=false){
  if(S.disposed||S.loading||S.actionBusy||queue.running||!force&&(document.hidden||B?.isVisible?.()===false))return;
  if(S.syncing){if(force)S.syncAgain=true;return S.syncing;}
  S.syncing=(async()=>{
   const id=S.row?.id,key=S.source?.doc_key,stamp=JSON.stringify(S.effective.map(currentStamp));
   const [sources,rows,selected,effective]=await Promise.all([
    result(api().from('quality_workspace_sources').select('doc_key,kind,title,base_revision,source_sha256').order('doc_key')),
    result(api().from('quality_workspace_revisions').select(REV_FIELDS).in('status',['active','draft','submitted'])),
    id?result(api().from('quality_workspace_revisions').select(REV_FIELDS).eq('id',id).single()):null,
    result(api().rpc('df_qw_current_index'))
   ]);
   if(S.disposed||S.loading||S.actionBusy||queue.running||S.row?.id!==id||S.source?.doc_key!==key)return;
   if(selected&&selected.lock_version<S.row.lock_version)return;
   S.sources=sources;S.catalog=rows;S.effective=effective;renderToc();
   $('refreshStatus').textContent='최신 상태 확인';$('refreshStatus').classList.remove('sync-stale');$('refreshStatus').title='';
   const changed=selected&&(selected.lock_version!==S.row.lock_version||selected.status!==S.row.status||selected.approval_id!==S.row.approval_id);
   const switched=S.followCurrent&&currentFor(key)?.id!==id;
   const corrected=showingCurrent()&&currentStamp(S.current)!==currentStamp(effectiveFor(key));
   if(S.mapDirty){updateMeta();return;}
   if(changed||switched||corrected){
    if(queue.dirty()||S.composing){
     clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 서버 저장본 또는 결재 상태가 변경되었습니다. 입력을 백업한 뒤 새로고침하세요.');queue.onState('error',queue.error);
     updateMeta();return;
    }
    if(key){const tab=S.tab,editing=S.editCurrent;await openDocument(key,S.followCurrent?undefined:id||'source');if(editing&&!workingFor(key))await startCorrection();S.tab=tab;showTab();}
   }else{
    if(S.approvalPending&&!B.approvalBusy?.()){S.approvalPending=false;say('저장된 결재문서 연결이 없습니다. 본문 편집을 계속할 수 있습니다.',true);}
    updateMeta();
   }
   if(S.tab==='matching'&&S.matchSources){if((S.currentTocBooks||[]).some(b=>currentStamp(b)!==currentStamp(effectiveFor(b.doc_key))))await loadMatching();else renderMatching();}
   if(liveToc()&&stamp!==JSON.stringify(effective.map(currentStamp))&&!S.composing){
    $('editorPages').querySelectorAll('.editable').forEach(applyToc);S.previewValid=false;
    if(S.mode==='preview'&&!queue.dirty())await preview();
   }
  })();
  try{return await S.syncing;}catch(e){syncFailure();throw e;}
  finally{S.syncing=null;if(S.syncAgain){S.syncAgain=false;setTimeout(()=>syncStatus(true).catch(syncFailure),0);}}
 }
 function dispose(){
  S.disposed=true;queue.dispose();clearInterval(S.poll);
  if(S.channel){Promise.resolve(S.client.removeChannel(S.channel)).catch(()=>{});S.channel=null;}
 }
 function permissionChanged(){
  const ctx=B?.context(),identityChanged=!ctx?.user||ctx.user.id!==S.identity,revoked=S.source&&!B.can(S.kind,'view');
  if(!identityChanged&&ctx.profile?.role!=='admin'&&ctx.permissionStatus&&ctx.permissionStatus!=='ready'){
   clearTimeout(queue.timer);updateMeta();$('saveState').textContent='권한 확인 중 · 입력 보존';return;
  }
  if(identityChanged||revoked){
   dispose();queue.saved=queue.sequence;queue.error=null;
   for(const id of ['editorPages','printPages','issues','history','snapshots','files','toc','matchRows','matchPreview'])$(id).replaceChildren();
   S.payload=null;S.source=null;S.row=null;S.current=null;S.effective=[];S.matchSources=[];S.matchCurrent=null;S.matchCopy=null;S.mapDirty=false;$('matchDetail').hidden=true;S.undo=[];S.redo=[];$('reason').value='';$('code').textContent='문서 닫힘';$('title').textContent='작업실을 다시 열어주세요';$('meta').textContent='';$('saveState').textContent='계정·권한 확인 필요';
   for(const id of ['save','newDraft','correct','finishCorrection','matchSave','matchEdit','approve','cancelRevision','print','upload','reviewed'])$(id).disabled=true;$('formatTools').disabled=true;$('paragraphTools').disabled=true;
   try{for(let i=sessionStorage.length-1;i>=0;i--){const k=sessionStorage.key(i);if(k.startsWith('df-qw:'+S.identity+':'))sessionStorage.removeItem(k);}}catch(_){}
   say(identityChanged?'로그아웃 또는 계정 변경으로 문서를 닫았습니다. 작업실을 다시 열어주세요.':'조회 권한이 변경되어 문서를 닫았습니다.');return;
  }
  updateMeta();
  if(queue.dirty()&&!queue.error&&editable())queue.flush().catch(()=>{});
 }
 window.DFQualityWorkspace={getKind:()=>S.kind,getKey:()=>S.source?.doc_key,flush,isPending:()=>queue.dirty()||!!queue.running||S.actionBusy||S.mapDirty,permissionChanged,selectKind,sync:()=>syncStatus(true),dispose};
 async function start(){
  bind();if(!B)throw Error('로그인한 업무 사이트의 품질문서 메뉴에서 작업실을 여세요.');if(!window.DFQualityNativeFormat)throw Error('품질문서 서식 파일을 불러오지 못했습니다. 제공된 웹 파일을 모두 올리고 Ctrl+Shift+R로 새로고침해 주세요.');const ctx=B.context();S.identity=ctx.user?.id;if(!S.identity)throw Error('로그인이 필요합니다.');
  const requested=new URLSearchParams(location.search).get('kind');
  S.kind=['manual','procedure','instruction'].includes(requested)&&B.can(requested,'view')?requested:['manual','procedure','instruction'].find(k=>B.can(k,'view'))||'manual';$('kind').value=S.kind;
  for(const o of $('kind').options)o.disabled=!B.can(o.value,'view');
  $('importButton').hidden=!['manual','procedure','instruction'].some(k=>B.can(k,'create')&&B.can(k,'upload'));
  await refresh();$('saveState').textContent='문서 목록 불러옴';const requestedKey=new URLSearchParams(location.search).get('key');if(requestedKey&&S.sources.some(d=>d.doc_key===requestedKey&&d.kind===S.kind))await openDocument(requestedKey);else await selectKind(S.kind);
  const update=()=>syncStatus(true).catch(syncFailure);S.poll=setInterval(()=>syncStatus().catch(syncFailure),5000);
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  S.client=api();if(typeof S.client.channel==='function')try{
   S.channel=S.client.channel('quality-workspace-'+S.identity+'-'+Date.now()).on('postgres_changes',{event:'*',schema:'public',table:'quality_workspace_revisions'},update).subscribe();
  }catch(_){/* Five-second polling also works without realtime. */}
 }
 start().catch(e=>{error(/quality_workspace|schema cache|does not exist/i.test(e.message)?'품질문서 작업실 DB 설치 확인이 필요합니다. 이번 업데이트의 quality_workspace_45.sql을 먼저 실행해 주세요. 이전 버전 SQL은 다시 실행하지 마세요.':e);$('saveState').textContent='연결 확인 필요';});
})();
