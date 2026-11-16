(function(){'use strict';
 const $=id=>document.getElementById(id),C=window.DFQualityCore,B=parent!==window?parent.DFQualityBridge:null;
 const S={sources:[],catalog:[],effective:[],current:null,editCurrent:false,editDraft:false,tab:'document',mapDirty:false,source:null,row:null,payload:null,history:[],kind:'manual',mode:'preview',range:null,loading:false,composing:false,disposed:false,previewValid:false,overflow:false,identity:null,followCurrent:true,actionBusy:false,syncing:null};
 const TITLES={manual:'품질매뉴얼',procedure:'품질절차서',instruction:'품질지침서'};
 const PREFIX={manual:'QM',procedure:'QP',instruction:'QI'};
 const STATUS={source:'기준자료 · 미승인',correction:'현재본',draft:'개정 초안',submitted:'결재 중',active:'승인본',obsolete:'이전본',rejected:'반려',cancelled:'개정 취소'};
 const REV_FIELDS='id,doc_key,revision,status,approval_id,effective_date,reason,lock_version,document_title,created_by,created_at,updated_at';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const result=async query=>{const r=await query;if(r.error)throw r.error;return r.data;};
 function api(){const x=B?.context();if(!x?.user||!x?.api||S.identity&&S.identity!==x.user.id)throw Error('로그인이 변경되었습니다. 문서를 다시 열어 주세요.');if(!B.can(S.kind,'view'))throw Error('문서 열람 권한을 확인해 주세요.');return x.api;}
 const can=a=>!!B?.can(S.kind,a);
 const writable=()=>!!((S.editCurrent&&S.followCurrent&&!workingFor(S.source?.doc_key)||S.editDraft&&S.row?.status==='draft'&&!S.row.approval_id)&&!S.approvalPending&&can('view')&&can('update')&&!S.disposed);
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
   $('reloadDocument').hidden=state!=='error';
   if(state==='error'){recovery();say((/QW_CONFLICT/.test(e.message)?'서버본이 변경되었습니다. 더보기에서 입력을 백업한 뒤 서버본을 다시 열어 주세요.\n':'저장 재시도를 눌러 주세요.\n')+e.message);}
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
 const linkedApproval=()=>showingCurrent()&&workingFor(S.source?.doc_key)?.approval_id||S.row?.approval_id;
 const liveToc=()=>!S.correctionHistory&&(S.followCurrent||S.editDraft)&&S.source?.doc_key.endsWith('-00');
 function applyToc(area){if(liveToc())return C.bindToc(area,Object.fromEntries(S.effective.map(r=>[r.doc_key,r])));return 0;}
 const displayCode=(key,n)=>key+' (REV.'+String(n??0).padStart(2,'0')+')';
 function updateMeta(){
  if(S.disposed||!S.source)return;
  const m=metadata(),work=workingFor(m.key),working=['draft','submitted'].includes(m.status),editing=S.editCurrent||S.editDraft;
  const linked=linkedApproval();
  $('code').textContent=displayCode(m.key,m.revision);$('title').textContent=m.title;
  $('meta').textContent=[S.editCurrent?'번호 유지 정정':STATUS[m.status],m.effectiveDate&&'시행 '+m.effectiveDate,showingCurrent()&&work&&(work.approval_id||work.status==='submitted'?'결재 진행 중':'개정 초안 있음')].filter(Boolean).join(' · ');
  const locked=!editable()||S.loading;
  $('formatTools').disabled=locked||S.mode!=='edit';$('paragraphTools').disabled=locked||S.mode!=='edit';
  $('formatTools').hidden=!editing||S.mode!=='edit';$('paragraphTools').hidden=$('formatTools').hidden;
  $('reason').disabled=locked;$('reviewed').disabled=locked;$('save').disabled=locked;
  $('newDraft').hidden=editing||!can('update')||(!work&&!can('create'))||!!work&&(work.status!=='draft'||!!work.approval_id);
  $('newDraft').disabled=S.actionBusy||S.loading||$('newDraft').hidden;
  $('save').hidden=!editing;$('approve').hidden=!S.editDraft||!B?.canApprove?.();$('approve').disabled=locked||S.editCurrent||$('approve').hidden;
  $('viewDraft').hidden=!showingCurrent()||!work||!(work.approval_id||work.status==='submitted');
  $('viewDraft').disabled=S.loading||S.actionBusy;
  $('currentDocument').hidden=showingCurrent()&&!S.editCurrent;
  $('currentDocument').disabled=S.actionBusy||S.loading||S.approvalPending;
  $('correct').hidden=!can('update')||!!work||editing;
  $('correct').disabled=S.actionBusy||S.loading;
  $('finishCorrection').hidden=!S.editCurrent;$('finishCorrection').disabled=S.actionBusy||S.loading;
  const archiveUpload=can('upload')&&(showingCurrent()&&!S.editCurrent||editable());
  $('upload').hidden=!archiveUpload;$('upload').disabled=S.actionBusy||S.loading||!archiveUpload;
  $('cancelRevision').hidden=!can('update')||!(working||work)||!S.followCurrent&&!S.editDraft;
  $('cancelRevision').disabled=S.actionBusy||S.loading||S.approvalPending;
  $('refreshStatus').disabled=S.actionBusy;
  $('documentTab').disabled=S.actionBusy||S.loading;$('matchingTab').disabled=S.actionBusy||S.loading;$('matchFields').disabled=S.actionBusy||S.loading;
  $('importButton').disabled=S.actionBusy||S.loading;$('retry').disabled=S.actionBusy||S.loading;
  $('approvalList').hidden=!linked||!B?.canApprove?.('view');$('approvalList').disabled=S.loading||S.approvalPending;
  $('legacyFiles').hidden=S.kind==='manual'||!B?.legacyFiles;
  $('manualOriginalPdf').hidden=S.kind!=='manual';$('manualOriginalHwp').hidden=S.kind!=='manual';
  $('previewMode').hidden=!editing||S.mode==='preview';$('editMode').hidden=!editing||S.mode==='edit';
  $('previewMode').disabled=S.actionBusy||S.loading;$('editMode').disabled=locked;
  $('backup').disabled=S.loading;$('print').disabled=S.loading||S.actionBusy||S.overflow;
  $('historyMenu').disabled=S.loading;
  $('reviewSubmit').disabled=locked;
  $('reviewClose').disabled=S.actionBusy;
  $('editorPages').querySelectorAll('.editable').forEach(n=>n.contentEditable=String(!locked));
 }
 function renderToc(){
  const query=$('search').value.trim().toLowerCase();
  const items=S.sources.filter(d=>!query||(displayCode(d.doc_key,effectiveFor(d.doc_key)?.revision??activeFor(d.doc_key)?.revision??d.base_revision)+' '+(effectiveFor(d.doc_key)?.title||d.title)).toLowerCase().includes(query));
  $('toc').innerHTML=items.map(d=>{const a=activeFor(d.doc_key),e=effectiveFor(d.doc_key),selected=d.doc_key===S.source?.doc_key;return `<button type="button" data-key="${esc(d.doc_key)}"${selected?' class="active" aria-current="true"':''}><strong>${esc(displayCode(d.doc_key,e?.revision??a?.revision??d.base_revision))}</strong><span>${esc(e?.title||d.title)}</span></button>`;}).join('');
  $('toc').querySelectorAll('button').forEach(b=>b.onclick=run(async()=>{await openDocument(b.dataset.key);if(window.matchMedia('(max-width:640px)').matches)setToc(false);}));
 }
 const notObsolete=key=>parent.DF_DOCUMENT_REVISIONS?.get(key)?.status!=='obsolete';
 const knownSource=r=>r.kind===S.kind&&notObsolete(r.doc_key);
 const loadSources=()=>result(api().from('quality_workspace_sources').select('doc_key,kind,title,base_revision,source_sha256').eq('kind',S.kind).order('doc_key'));
 const loadCatalog=()=>result(api().from('quality_workspace_revisions').select(REV_FIELDS).like('doc_key','DFEN-'+PREFIX[S.kind]+'-%').in('status',['active','draft','submitted']));
 async function refresh(){
  const [sources,catalog,effective]=await Promise.all([loadSources(),loadCatalog(),result(api().rpc('df_qw_current_index')),parent.DF_DOCUMENT_REVISIONS?.refresh()]);
  if(S.disposed||!can('view'))return;
  S.sources=sources.filter(knownSource);S.catalog=catalog;S.effective=effective.filter(knownSource);
  renderToc();$('editorPages').querySelectorAll('.editable').forEach(applyToc);S.previewValid=false;
 }
 async function flush(){if(S.mapDirty)throw Error('매칭 탭의 입력을 먼저 저장하거나 되돌려 주세요.');if(S.composing)throw Error('한글 입력을 마친 뒤 다시 시도하세요.');if(queue.dirty()||queue.running)await queue.flush();}
 async function openDocument(key,revisionId,{draft=false}={}){
  const src=S.sources.find(r=>r.doc_key===key&&r.kind===S.kind);
  if(!src)throw Error('문서 목록에서 해당 문서를 찾을 수 없습니다.');
  if(!revisionId&&!notObsolete(key))throw Error('폐지된 문서입니다.');
  if(S.loading)return;
  if(S.actionBusy||S.approvalPending)throw Error('문서 처리가 끝난 뒤 이동해 주세요.');
  if(queue.error)throw queue.error;
  S.loading=true;updateMeta();$('retryLoad').hidden=true;$('saveState').textContent='불러오는 중…';
  try{
   await flush();
   const [revisions,current]=await Promise.all([
    result(api().from('quality_workspace_revisions').select(REV_FIELDS).eq('doc_key',key).order('created_at',{ascending:false})),
    result(api().rpc('df_qw_current',{p_key:key}))
   ]);
   if(S.disposed||!can('view'))return;
   const active=revisions.find(x=>x.status==='active')||null;
   let selected=revisionId==='source'?null:revisionId?revisions.find(x=>x.id===revisionId):draft?revisions.find(x=>x.status==='draft'&&!x.approval_id):active;
   if((revisionId&&revisionId!=='source'||draft)&&!selected)throw Error('해당 개정본을 찾을 수 없습니다.');
   let stored=current.payload;
   if(revisionId==='source')stored=(await result(api().from('quality_workspace_sources').select('payload').eq('doc_key',key).single())).payload;
   else if(selected&&(revisionId||draft)){
    const full=await result(api().from('quality_workspace_revisions').select('*').eq('id',selected.id).single());
    if(draft&&(full.status!=='draft'||full.approval_id))throw Error('결재에 연결된 초안은 수정할 수 없습니다.');
    selected=full;stored=full.payload;
   }
   if(S.disposed||!can('view'))return;
   let payload=C.payload(stored);
   if(!selected||draft)payload=(await window.DFQualityNativeFormat.restore(payload,key)).payload;
   if(S.disposed||!can('view'))return;
   S.current=current;S.effective=S.effective.filter(x=>x.doc_key!==key).concat(current);
   S.editCurrent=false;S.editDraft=draft;S.correctionHistory=null;
   S.source=src;S.row=selected;S.history=revisions;S.payload=payload;S.range=null;
   S.previewValid=false;S.overflow=false;S.followCurrent=!revisionId&&!draft;S.mode='preview';
   S.catalog=S.catalog.filter(r=>r.doc_key!==key).concat(revisions.filter(r=>['active','draft','submitted'].includes(r.status)));
   queue.reset(selected?.lock_version||0);
   $('reason').value=selected?.reason||'';$('reviewed').checked=S.payload.layoutReviewed;
   $('reviewPanel').hidden=!S.payload.issues.length;
   $('issues').innerHTML='<ul>'+S.payload.issues.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>';
   $('issueCount').textContent='('+S.payload.issues.length+')';
   $('empty').hidden=true;$('retry').hidden=true;$('reloadDocument').hidden=true;$('saveState').textContent='';say('');
   $('editorPages').replaceChildren();$('printPages').replaceChildren();$('pageCount').textContent='';
   S.tab='document';showTab();renderToc();
   if(draft){
    S.mode='edit';renderEditor();setMode('edit');S.undo=[];recordUndo();
    let recovered;try{recovered=JSON.parse(sessionStorage.getItem(backupKey())||'null');}catch(_){}
    if(recovered&&confirm('저장하지 못한 입력이 있습니다. 이 화면에 복구할까요?')){
     S.payload=C.payload(recovered.payload);$('reason').value=String(recovered.reason||'');$('reviewed').checked=false;renderEditor();changed({internal:true});
     if(recovered.version!==selected.lock_version){clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 복구본과 서버 저장본이 다릅니다. 백업 후 대조해 주세요.');queue.onState('error',queue.error);}
    }
   }else await preview();
   if(S.disposed)return;
   B.selectionChanged?.(window,key);
   if($('filesPanel').open)loadFiles().catch(error);
   if($('historyPanel').open)renderHistory();
  }catch(e){if(!S.source)$('retryLoad').hidden=false;throw e;}
  finally{S.loading=false;if($('saveState').textContent==='불러오는 중…')$('saveState').textContent='';updateMeta();}
 }
 function renderEditor(){
  $('editorPages').innerHTML='';const m=metadata();
  S.payload.sections.forEach((s,i)=>{
   const p=document.createElement('article');p.className='paper source-segment';p.style.width=s.page.width+'pt';p.style.minHeight=s.page.height+'pt';p.style.padding=`${s.page.top}pt ${s.page.right}pt ${s.page.bottom}pt ${s.page.left}pt`;
   p.innerHTML=`<div class="draft-label">${esc(STATUS[m.status])}</div><div class="paper-header">${C.bindHeader(s.header,m,'—','—')}</div><div class="editable" role="textbox" aria-multiline="true" aria-label="${esc(S.source.title)} 본문 ${i+1}" spellcheck="false"></div><div class="paper-footer">${C.bindHeader(s.footer,m,'—','—')}</div><div class="page-footline"><span>${esc(m.key)} · Rev.${String(m.revision).padStart(2,'0')}</span><span>쪽수는 인쇄 미리보기에서 자동 계산</span></div>`;
   const e=p.querySelector('.editable');e.innerHTML=s.html;window.DFQualityTables.repairNumbers(e);applyToc(e);e.contentEditable=String(editable()&&!S.loading);
   e.addEventListener('input',()=>{if(!S.composing)changed();});e.addEventListener('compositionstart',()=>{S.composing=true;clearTimeout(queue.timer);});e.addEventListener('compositionend',()=>{S.composing=false;changed();});
   e.addEventListener('paste',event=>{if(!editable())return;event.preventDefault();const html=event.clipboardData.getData('text/html');const plain=event.clipboardData.getData('text/plain');document.execCommand('insertHTML',false,html?C.sanitize(html):esc(plain).replace(/\n/g,'<br>'));changed();});
   e.addEventListener('drop',event=>event.preventDefault());$('editorPages').append(p);
  });fit();
 }
 function setMode(mode){
  if(!S.source)return;
  if(mode==='preview'&&S.mode==='edit')S.payload=collect().payload;
  if(mode==='edit'&&S.mode==='preview')renderEditor();S.mode=mode;
  $('editMode').setAttribute('aria-pressed',String(mode==='edit'));$('previewMode').setAttribute('aria-pressed',String(mode==='preview'));
  $('editorPages').hidden=mode!=='edit';$('printPages').hidden=mode!=='preview';updateMeta();fit();
 }
 function fit(){
  const val=$('zoom').value,width=$('canvas').clientWidth-24,scale=val==='fit'?Math.min(1,Math.max(.25,width/(210*96/25.4))):Number(val)/100;
  $('editorPages').style.zoom=scale;$('printPages').style.zoom=scale;
 }
 async function draft(){
  if(!S.source||S.loading||S.actionBusy||!can('update')||S.editCurrent||S.editDraft)return;
  await flush();
  if(S.loading||S.actionBusy||S.editCurrent||S.editDraft||S.disposed)return;
  const key=S.source.doc_key,work=workingFor(key);
  if(work){
   if(work.status!=='draft'||work.approval_id)throw Error('결재에 연결된 문서입니다.');
   await openDocument(key,undefined,{draft:true});return;
  }
  if(!can('create'))throw Error('개정 초안을 만들 권한이 없습니다.');
  const active=S.history.find(x=>x.status==='active');
  const base=active?null:Number(effectiveFor(key)?.revision??S.source.base_revision);
  if(base!==null&&(!Number.isInteger(base)||base<0||base>9998))throw Error('문서 매칭에서 기준 개정번호를 확인해 주세요.');
  S.actionBusy=true;updateMeta();
  try{await result(api().rpc('df_qw_new_draft',{p_key:key,p_base_revision:base}));}
  catch(e){setTimeout(()=>syncStatus(true).catch(syncFailure),0);throw e;}
  finally{S.actionBusy=false;updateMeta();}
  if(!S.disposed)await openDocument(key,undefined,{draft:true});
 }
 async function startCorrection(){
  if(!S.source||S.loading||S.actionBusy||!can('update'))return;
  if(workingFor(S.source.doc_key))throw Error('진행 중인 개정 초안에서 수정할 수 있습니다. 현재 번호를 유지하려면 개정을 취소한 뒤 수정하세요.');
  await flush();if(!showingCurrent())await openDocument(S.source.doc_key);
  $('moreMenu').open=false;S.overflow=false;S.editCurrent=true;queue.reset(S.current.lock_version);$('reason').value='본문·서식 수정 (개정번호 유지)';
  const repaired=await window.DFQualityNativeFormat.restore(S.payload,S.source.doc_key);S.payload=repaired.payload;setMode('edit');S.undo=[];recordUndo();
  let saved;try{saved=JSON.parse(sessionStorage.getItem(backupKey())||'null');}catch(_){}
  if(saved&&confirm('저장하지 못한 수정 내용이 있습니다. 화면에 복구할까요?')){
   S.payload=C.payload(saved.payload);$('reason').value=saved.reason||'복구한 수정 내용';renderEditor();changed();
   if(saved.version!==S.current.lock_version){clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 복구본과 서버의 수정 이력이 다릅니다. 백업 후 대조하세요.');queue.onState('error',queue.error);}
  }
  if(!queue.error)say('');
 }
 function showTab(){
  const matching=S.tab==='matching';$('matchingPanel').hidden=!matching;$('documentPanel').hidden=matching;

 }
 async function setTab(tab){
  await flush();S.tab=tab;showTab();if(tab==='matching')await loadMatching();else{await syncStatus(true);if(S.mode==='preview'&&!S.previewValid)await preview();}
 }
 async function loadMatching(){
  await flush();if(S.loading||S.actionBusy)return;
  S.actionBusy=true;$('matchRefresh').disabled=true;updateMeta();
  try{
   await refresh();S.matchSources=(await result(api().from('quality_workspace_sources').select('*').eq('kind',S.kind).order('doc_key'))).filter(knownSource);
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
  $('matchSummary').textContent=`${docs.length}개 · 목차 확인 ${broken.length}개 · 원본 표기 차이 ${differences}개`;
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
  $('matchLock').textContent=working?'진행 중인 개정 초안이 있습니다. 초안 수정 또는 개정 취소 후 매칭을 변경하세요.':'';
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
  const row=S.editDraft&&S.row?.status==='draft'?S.row:workingFor(S.source?.doc_key);
  if(S.actionBusy||!row||!can('update'))return;
  if(S.approvalPending)throw Error('열린 결재창을 닫고 최신 상태를 확인한 뒤 취소하세요.');
  const reason=prompt('개정안과 연결된 미승인 결재를 취소합니다. 취소 사유를 입력해 주세요.','');
  if(reason===null)return;if(!reason.trim())throw Error('취소 사유를 입력하세요.');
  const key=S.source.doc_key,localKey=backupKey();S.actionBusy=true;updateMeta();
  try{
   await flush();
   const data=await result(api().rpc('df_qw_cancel',{p_id:row.id,p_expected:S.editDraft&&S.row?.id===row.id?queue.version:row.lock_version,p_reason:reason.trim()}));
   const cancelled=Array.isArray(data)?data[0]:data;if(!cancelled||cancelled.status!=='cancelled')throw Error('취소 결과를 확인하지 못했습니다. 최신 상태를 확인하세요.');
   S.row=cancelled;queue.reset(cancelled.lock_version);S.approvalPending=false;try{if(localKey&&S.editDraft)sessionStorage.removeItem(localKey);}catch(_){}
   await refresh();S.actionBusy=false;await openDocument(key);$('moreMenu').open=false;
   $('saveState').textContent='개정 취소 완료';
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
  const key=S.source?.doc_key,revision=S.row?.id;
  const rows=await result(api().from('quality_workspace_files').select('*').eq('kind',S.kind).order('created_at',{ascending:false}));
  if(S.disposed||!can('view')||S.source?.doc_key!==key||S.row?.id!==revision)return;
  $('files').innerHTML='';for(const f of rows.filter(x=>!x.revision_id||x.revision_id===revision)){
   const b=document.createElement('button');b.textContent=f.name+' · '+(f.size/1024).toFixed(0)+' KB · 원본 내려받기';b.onclick=run(async()=>{const blob=await result(api().storage.from('quality-workspace-originals').download(f.path));download(f.name,blob,blob.type);});$('files').append(b);
  }
 }
 function renderHistory(){
  $('history').innerHTML='<button data-revision="source">원본 기반 기준자료 보기</button>'+S.history.map(r=>`<button data-revision="${esc(r.id)}">Rev.${String(r.revision).padStart(2,'0')} · ${esc(STATUS[r.status])} · ${esc(new Date(r.created_at).toLocaleString('ko-KR'))}</button>`).join('');
  $('history').querySelectorAll('button').forEach(b=>b.onclick=run(()=>openDocument(S.source.doc_key,b.dataset.revision)));
  const historyKey=S.source.doc_key;
  result(api().from('quality_workspace_correction_history').select('id,event,created_at').eq('doc_key',historyKey).order('id',{ascending:false}).limit(40)).then(rows=>{
   if(S.disposed||!can('view')||S.source?.doc_key!==historyKey)return;
   for(const r of rows){const b=document.createElement('button');b.textContent=(r.event==='before'?'수정 전':r.event==='matching'?'매칭 정정':'번호 유지 수정')+' · '+new Date(r.created_at).toLocaleString('ko-KR');b.onclick=run(async()=>{
    await flush();const x=await result(api().from('quality_workspace_correction_history').select('*').eq('id',r.id).single());await openDocument(historyKey,'source');
    S.correctionHistory=x.state;S.payload=C.payload(x.state.payload);S.previewValid=false;$('reason').value=x.state.reason||'';await preview();updateMeta();
   });$('history').append(b);}
  }).catch(error);
  $('snapshots').innerHTML='';if(!S.row)return;
  const revision=S.row.id;
  result(api().from('quality_workspace_snapshots').select('id,revision_id,lock_version,event,created_at').eq('revision_id',revision).order('created_at',{ascending:false}).limit(30)).then(rows=>{
   if(S.disposed||!can('view')||S.row?.id!==revision)return;
   for(const r of rows){const b=document.createElement('button');b.textContent='저장시점 '+new Date(r.created_at).toLocaleString('ko-KR')+' · '+r.event+' · 백업';b.onclick=run(async()=>{const x=await result(api().from('quality_workspace_snapshots').select('*').eq('id',r.id).single());download(S.source.doc_key+'_snapshot_'+r.id+'.qw.json',JSON.stringify({format:'dreamforen.quality.backup.v1',doc_key:S.source.doc_key,payload:x.payload,reason:x.reason,serverVersion:x.lock_version}));});$('snapshots').append(b);}
  }).catch(error);
 }
 async function approval(){
  if(S.actionBusy||!S.editDraft||!editable()||!B.canApprove?.())return;
  if(!$('reviewed').checked||!$('reason').value.trim())throw Error('개정 사유와 인쇄 확인을 입력해 주세요.');
  S.actionBusy=true;updateMeta();
  const input=$('reviewDialog');$('reviewError').hidden=true;
  try{
   await queue.flush(true);
   await preview();
   if(S.overflow){input.close();throw Error('인쇄 영역을 넘는 항목을 수정해 주세요.');}
   // The existing database link checks the saved draft ID and lock version.
   S.approvalPending=true;input.close();
   await B.approval({doc_type:'general',locked:true,title:displayCode(S.source.doc_key,S.row.revision)+' '+metadata().title+' 개정 승인',
    content:`DF-QW:${S.row.id}:${S.row.lock_version}\n문서번호: ${S.source.doc_key}\n개정번호: ${S.row.revision}\n개정사유: ${S.row.reason}\n본문·인쇄 확인: 완료`},null,S.kind);
   say('');
  }catch(e){S.approvalPending=false;throw e;}
  finally{
   S.actionBusy=false;updateMeta();
   if(!B.approvalBusy?.())setTimeout(()=>syncStatus(true).catch(syncFailure),0);
  }
 }
 async function preview(){
  if(!S.source)return;await flush();
  if(S.mode==='edit')S.payload=collect().payload;
  const meta=metadata(),key=S.source.doc_key,body=S.payload;
  const rendered=await window.DFQualityPrint.render({documents:[{meta,payload:body,label:STATUS[meta.status]}],records:Object.fromEntries(S.effective.map(r=>[r.doc_key,r])),live:liveToc()});
  if(S.disposed||!can('view')||S.source?.doc_key!==key)return;
  $('printPages').replaceChildren(...rendered.pages);S.previewValid=true;S.overflow=rendered.overflow;
  for(const row of $('printPages').querySelectorAll('[data-qw-toc-target]')){row.tabIndex=0;row.setAttribute('role','link');row.setAttribute('aria-label',row.dataset.qwTocTarget);}
  $('pageCount').textContent=rendered.pages.length+'쪽';setMode('preview');
  if(S.overflow)say('인쇄 영역을 넘는 표나 문단이 있습니다.');
 }
 async function printBook(){
  if(S.loading||S.actionBusy||!can('view'))return;
  $('moreMenu').open=false;
  await flush();S.actionBusy=true;updateMeta();
  $('saveState').textContent='인쇄본 준비 중…';
  try{
   const index=(await result(api().rpc('df_qw_current_index'))).filter(knownSource).sort((a,b)=>a.doc_key.localeCompare(b.doc_key));
   if(!index.length)throw Error('인쇄할 문서가 없습니다.');
   const loaded=[];
   for(let start=0;start<index.length;start+=4){
    loaded.push(...await Promise.all(index.slice(start,start+4).map(r=>result(api().rpc('df_qw_current',{p_key:r.doc_key})))));
    if(S.disposed||!can('view'))return;
   }
   const documents=[];
   for(const r of loaded){
    let payload=C.payload(r.payload);
    if(r.status==='source')payload=(await window.DFQualityNativeFormat.restore(payload,r.doc_key)).payload;
    const status=r.has_correction?'correction':r.status;
    documents.push({payload,meta:{key:r.doc_key,title:r.title,originalTitle:S.sources.find(s=>s.doc_key===r.doc_key)?.title||r.title,revision:r.revision,status,effectiveDate:r.effective_date},label:STATUS[status]});
   }
   const rendered=await window.DFQualityPrint.render({documents,records:Object.fromEntries(loaded.map(r=>[r.doc_key,r])),live:true});
   if(S.disposed||!can('view'))return;
   const latest=(await result(api().rpc('df_qw_current_index'))).filter(knownSource).sort((a,b)=>a.doc_key.localeCompare(b.doc_key));
   if(JSON.stringify(loaded.map(currentStamp))!==JSON.stringify(latest.map(currentStamp)))throw Error('문서가 변경되었습니다. 전체 인쇄를 다시 눌러 주세요.');
   if(rendered.overflow)throw Error('인쇄 영역을 넘는 항목이 있습니다. 개별 문서의 미리보기를 확인해 주세요.');
   if(S.disposed||!can('view'))return;
   const target=$('printPages'),previous=[...target.childNodes],valid=S.previewValid,overflow=S.overflow;
   try{
    target.replaceChildren(...rendered.pages);S.previewValid=true;S.overflow=false;
    window.print();
   }finally{target.replaceChildren(...previous);S.previewValid=valid;S.overflow=overflow;}
  }finally{if(!S.disposed){S.actionBusy=false;$('saveState').textContent='';updateMeta();}}
 }
 function setToc(open){
  $('tocBody').hidden=!open;$('toggleToc').setAttribute('aria-expanded',String(open));$('toggleToc').textContent=open?'접기':'펼치기';
 }
 async function initialDocument(key){
  const first=S.sources.find(x=>x.doc_key===key)||S.sources[0];
  if(first){await openDocument(first.doc_key);return;}
  $('empty').hidden=false;$('title').textContent='등록된 문서가 없습니다';$('saveState').textContent='';
  $('retryLoad').hidden=true;renderToc();
 }
 function bind(){
  $('search').oninput=renderToc;$('toggleToc').onclick=()=>setToc($('tocBody').hidden);
  $('retryLoad').onclick=run(async()=>{await refresh();await initialDocument(S.requestedKey);});
  $('printBook').onclick=run(printBook);
  $('reloadDocument').onclick=run(async()=>{
   if(!S.source||!queue.error||S.loading||S.actionBusy)return;
   if(!confirm('현재 입력을 비우고 서버 저장본을 다시 열까요? 필요한 내용은 먼저 백업해 주세요.'))return;
   const key=S.source.doc_key;
   try{sessionStorage.removeItem(backupKey());}catch(_){}
   queue.reset(queue.version);$('moreMenu').open=false;
   await refresh();await initialDocument(key);
  });
  $('currentDocument').onclick=run(()=>openDocument(S.source.doc_key));
  $('viewDraft').onclick=run(()=>{const work=workingFor(S.source?.doc_key);if(work)return openDocument(work.doc_key,work.id);});
  $('filesMenu').onclick=run(async()=>{
   $('moreMenu').open=false;$('filesPanel').hidden=false;$('filesPanel').open=true;
   $('manualOriginalPdf').hidden=S.kind!=='manual';$('manualOriginalHwp').hidden=S.kind!=='manual';
   $('legacyFiles').hidden=S.kind==='manual';$('upload').hidden=!can('upload');
   await loadFiles();$('filesPanel').scrollIntoView?.({block:'nearest'});
  });
  $('historyMenu').onclick=()=>{if(!S.source)return;$('moreMenu').open=false;$('historyPanel').hidden=false;$('historyPanel').open=true;renderHistory();$('historyPanel').scrollIntoView?.({block:'nearest'});};
  for(const id of ['historyPanel','filesPanel'])$(id).addEventListener('toggle',()=>{if(!$(id).open)$(id).hidden=true;});

  $('documentTab').onclick=run(()=>setTab('document'));$('matchingTab').onclick=run(()=>{$('moreMenu').open=false;return setTab('matching');});
  $('correct').onclick=run(startCorrection);$('finishCorrection').onclick=run(async()=>{await flush();S.editCurrent=false;await openDocument(S.source.doc_key);$('moreMenu').open=false;$('saveState').textContent='저장 완료';});
  $('matchRefresh').onclick=run(loadMatching);$('matchReset').onclick=run(async()=>{S.mapDirty=false;await chooseMatch(S.matchKey);});$('matchSave').onclick=run(saveMatching);
  $('matchEdit').onclick=run(async()=>{await flush();await openDocument(S.matchKey);await startCorrection();});
  for(const id of ['matchTitle','matchRevision','matchReason'])$(id).oninput=()=>S.mapDirty=true;
  $('matchBody').onchange=run(async()=>{S.mapDirty=true;await previewMatchBody();});
  $('newDraft').onclick=run(draft);$('save').onclick=run(async()=>{if(S.composing)throw Error('한글 입력을 마친 뒤 저장해 주세요.');await queue.flush(true);});$('retry').onclick=run(()=>queue.retry());$('backup').onclick=run(backup);
  $('cancelRevision').onclick=run(cancelRevision);$('refreshStatus').onclick=run(()=>syncStatus(true));
  $('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=run(async e=>{try{await importFile(e.target.files[0]);}finally{e.target.value='';}});
  $('reason').oninput=()=>{if(S.editDraft&&editable()){queue.change();recovery();}};
  $('reviewed').onchange=()=>changed({review:true});
  $('approve').onclick=()=>{
   if(!editable()||!S.editDraft)return;
   $('reviewError').hidden=true;if(!$('reviewDialog').open)$('reviewDialog').showModal();
  };
  $('reviewSubmit').onclick=()=>approval().catch(e=>{
   const alertBox=$('reviewError');alertBox.textContent=e.message||e;alertBox.hidden=false;error(e);
  });
  $('reviewDialog').addEventListener('cancel',e=>{if(S.actionBusy)e.preventDefault();});
  $('approvalList').onclick=run(async()=>{
   await flush();
   const linked=linkedApproval();
   if(linked)await B.approval({},linked,S.kind);
  });
  $('legacyFiles').onclick=run(async()=>{await flush();B.legacyFiles?.(S.kind);});
  $('editMode').onclick=()=>{S.previewValid=false;S.overflow=false;say('');setMode('edit');};$('previewMode').onclick=run(preview);$('zoom').onchange=fit;window.addEventListener('resize',fit);
  const jumpToc=run(async e=>{const row=e.target.closest?.('[data-qw-toc-target]');if(row&&liveToc()){e.preventDefault();await openDocument(row.dataset.qwTocTarget);}});
  $('printPages').onclick=jumpToc;$('printPages').onkeydown=e=>{if(e.key==='Enter'||e.key===' ')jumpToc(e);};
  $('print').onclick=run(async()=>{await preview();if(S.overflow)throw Error('인쇄 영역 초과 항목을 먼저 수정하세요.');window.print();});
  $('upload').onchange=run(async e=>{
   const file=e.target.files[0];if(!file||$('upload').disabled)return;
   S.actionBusy=true;updateMeta();
   try{await flush();await uploadFile(file,S.kind,S.editDraft?S.row?.id||null:null);await loadFiles();say('파일을 저장했습니다.',true);}
   finally{e.target.value='';S.actionBusy=false;updateMeta();}
  });
  $('refreshHistory').onclick=run(async()=>{if(!S.source)return;const key=S.source.doc_key;const history=await result(api().from('quality_workspace_revisions').select(REV_FIELDS).eq('doc_key',key).order('created_at',{ascending:false}));if(S.source?.doc_key===key){S.history=history;renderHistory();}});$('back').onclick=run(async()=>{await flush();await B?.leave();});
  document.addEventListener('selectionchange',rememberSelection);
  document.querySelectorAll('[data-command]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=run(()=>command(b.dataset.command));});
  document.querySelectorAll('[data-align]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=run(()=>styleParagraph({textAlign:b.dataset.align}));});
  $('font').onchange=run(()=>command('fontName',$('font').value));$('size').onchange=run(fontSize);$('color').onchange=run(()=>command('foreColor',$('color').value));
  $('applyPara').onclick=run(()=>{const left=Number($('indentLeft').value),first=Number($('indentFirst').value),line=Number($('line').value);if(left<0||left>80||first<-left||first>80||line<80||line>300)throw Error('내어쓰기 폭은 왼쪽 여백 이내로, 줄간격은 80~300%로 입력하세요.');styleParagraph({marginLeft:left+'mm',textIndent:first+'mm',lineHeight:String(line/100)});});
  $('undo').onclick=run(()=>restoreUndo(false));$('redo').onclick=run(()=>restoreUndo(true));
  $('pageBreak').onclick=run(()=>command('insertHTML','<div data-page-break="1"><br></div><p><br></p>'));
  window.DFQualityTables.install({validate:selection,getTable:()=>{const n=S.range?.startContainer;return (n?.nodeType===1?n:n?.parentElement)?.closest('table');},onChange:()=>changed()});
  $('table').onclick=run(()=>{const n=prompt('행 × 열 (예: 3x3)','3x3');if(n===null)return;const m=n.match(/^(\d{1,2})\s*[x×]\s*(\d{1,2})$/);if(!m||+m[1]<1||+m[1]>20||+m[2]<1||+m[2]>12)throw Error('최대 20행 × 12열로 입력하세요.');command('insertHTML','<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tbody>'+Array.from({length:+m[1]},()=>'<tr>'+Array.from({length:+m[2]},()=>'<td style="border:1px solid #333;padding:4pt"><p><br></p></td>').join('')+'</tr>').join('')+'</tbody></table><p><br></p>');});
  $('margins').onclick=run(()=>{if(!editable())return;const p=S.payload.sections[0].page;for(const input of $('marginDialog').querySelectorAll('input'))input.value=(p[input.name]*25.4/72).toFixed(1);$('marginDialog').showModal();});
  $('applyMargins').onclick=e=>{const values={};for(const n of $('marginDialog').querySelectorAll('input')){if(!n.checkValidity()){e.preventDefault();n.reportValidity();return;}values[n.name]=Number(n.value)*72/25.4;}S.payload=collect().payload;S.payload.sections.forEach(s=>Object.assign(s.page,values));renderEditor();changed();};
  window.addEventListener('beforeunload',e=>{if(queue.dirty()||queue.running||S.mapDirty){recovery();e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if(S.tab==='matching'){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();run(saveMatching)();}return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(editable()&&!S.loading)run(()=>queue.flush(true))();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();$('print').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&editable()){e.preventDefault();restoreUndo(e.shiftKey);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&editable()){e.preventDefault();restoreUndo(true);}});
  window.addEventListener('beforeprint',()=>document.body.classList.toggle('qw-print-blocked',!S.previewValid||S.overflow));
  window.addEventListener('afterprint',()=>document.body.classList.remove('qw-print-blocked'));
 }
 const catalogStamp=rows=>JSON.stringify(rows.map(r=>[r.id,r.doc_key,r.status,r.revision,r.lock_version,r.approval_id]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
 const currentStamp=e=>JSON.stringify(e&&[e.doc_key,e.basis_id,e.basis_version,e.lock_version,e.revision,e.title]);
 function syncFailure(){if(!S.disposed){$('refreshStatus').textContent='상태 확인 재시도';$('refreshStatus').classList.add('sync-stale');$('refreshStatus').title='연결이 끊겨 최신 결재 상태를 확인하지 못했습니다.';}}
 async function syncStatus(force=false){
  if(S.disposed||S.loading||S.actionBusy||queue.running||!force&&(document.hidden||B?.isVisible?.()===false))return;
  if(S.syncing){if(force)S.syncAgain=true;return S.syncing;}
  S.syncing=(async()=>{
   const id=S.row?.id,key=S.source?.doc_key,stamp=JSON.stringify(S.effective.map(currentStamp)),reviewing=S.approvalPending&&B.approvalBusy?.();
   const [sources,rows,selected,effective]=await Promise.all([
    loadSources(),loadCatalog(),
    id?result(api().from('quality_workspace_revisions').select(REV_FIELDS).eq('id',id).maybeSingle()):null,
    result(api().rpc('df_qw_current_index'))
   ]);
   if(S.disposed||!can('view')||S.loading||S.actionBusy||queue.running||S.row?.id!==id||S.source?.doc_key!==key)return;
   if(selected&&selected.lock_version<S.row.lock_version)return;
   S.sources=sources.filter(knownSource);S.catalog=rows;S.effective=effective.filter(knownSource);renderToc();
   if(key&&!notObsolete(key)){
    if(queue.dirty()||S.composing){clearTimeout(queue.timer);queue.error=Error('문서가 폐지되었습니다. 입력 내용을 백업해 주세요.');queue.onState('error',queue.error);updateMeta();return;}
    if(S.sources.length)await openDocument(S.sources[0].doc_key);
    else{
     S.source=null;S.row=null;S.payload=null;S.editCurrent=false;S.editDraft=false;
     $('editorPages').replaceChildren();$('printPages').replaceChildren();$('print').disabled=true;
     for(const id of ['newDraft','save','approve','correct','backup','historyMenu'])$(id).disabled=true;
     $('code').textContent='';$('meta').textContent='';await initialDocument();
    }
    return;
   }
   $('refreshStatus').textContent='최신 상태 확인';$('refreshStatus').classList.remove('sync-stale');$('refreshStatus').title='';
   const changed=!!id&&(!selected||selected.lock_version!==S.row.lock_version||selected.status!==S.row.status||selected.approval_id!==S.row.approval_id);
   const switched=showingCurrent()&&(activeFor(key)?.id||null)!==(id||null);
   const corrected=!!key&&showingCurrent()&&currentStamp(S.current)!==currentStamp(effectiveFor(key));
   if(S.mapDirty||reviewing&&B.approvalBusy?.()){updateMeta();return;}
   if(changed||switched||corrected){
    if(queue.dirty()||S.composing){
     clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 서버 저장본 또는 결재 상태가 변경되었습니다. 입력을 백업한 뒤 새로고침하세요.');queue.onState('error',queue.error);
     updateMeta();return;
    }
    if(key){
     const tab=S.tab,editing=S.editCurrent,editingDraft=S.editDraft&&selected?.status==='draft'&&!selected.approval_id;
     S.approvalPending=false;
     if(S.followCurrent||S.editDraft)await openDocument(key,undefined,{draft:editingDraft});
     else await openDocument(key,id&&!selected?undefined:id||'source');
     if(editing&&!workingFor(key))await startCorrection();
     S.tab=tab;showTab();
    }
   }else{
    if(S.approvalPending&&!B.approvalBusy?.()){S.approvalPending=false;say('');}
    updateMeta();
   }
   if(S.tab==='matching'&&S.matchSources){if((S.currentTocBooks||[]).some(b=>currentStamp(b)!==currentStamp(effectiveFor(b.doc_key))))await loadMatching();else renderMatching();}
   if(liveToc()&&stamp!==JSON.stringify(S.effective.map(currentStamp))&&!S.composing){
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
  const ctx=B?.context(),identityChanged=!ctx?.user||ctx.user.id!==S.identity,revoked=!B.can(S.kind,'view');
  if(!identityChanged&&ctx.profile?.role!=='admin'&&ctx.permissionStatus&&ctx.permissionStatus!=='ready'){
   clearTimeout(queue.timer);updateMeta();$('saveState').textContent='권한 확인 중 · 입력 보존';return;
  }
  if(identityChanged||revoked){
   dispose();queue.saved=queue.sequence;queue.error=null;
   for(const id of ['editorPages','printPages','issues','history','snapshots','files','toc','matchRows','matchPreview'])$(id).replaceChildren();
   S.payload=null;S.source=null;S.row=null;S.current=null;S.effective=[];S.matchSources=[];S.matchCurrent=null;S.matchCopy=null;S.mapDirty=false;$('matchDetail').hidden=true;S.undo=[];S.redo=[];$('reason').value='';$('code').textContent='문서 닫힘';$('title').textContent='문서를 다시 열어 주세요';$('meta').textContent='';$('saveState').textContent='계정·권한 확인 필요';
   for(const id of ['save','newDraft','correct','finishCorrection','matchSave','matchEdit','approve','cancelRevision','print','upload','reviewed'])$(id).disabled=true;$('formatTools').disabled=true;$('paragraphTools').disabled=true;
   say(identityChanged?'로그아웃 또는 계정 변경으로 문서를 닫았습니다. 문서를 다시 열어 주세요.':'조회 권한이 변경되어 문서를 닫았습니다.');return;
  }
  updateMeta();
  if(queue.dirty()&&!queue.error&&editable())queue.flush().catch(()=>{});
 }
 window.DFQualityWorkspace={getKind:()=>S.kind,getKey:()=>S.source?.doc_key,flush,
  isPending:()=>!S.disposed&&!!(queue.dirty()||queue.running||S.actionBusy||S.mapDirty||S.composing||S.approvalPending&&B?.approvalBusy?.()),
  permissionChanged,sync:()=>syncStatus(true),dispose};
 async function start(){
  const args=new URLSearchParams(location.search);
  S.kind=Object.hasOwn(TITLES,args.get('kind'))?args.get('kind'):'manual';
  S.requestedKey=args.get('key');
  $('bookTitle').textContent=TITLES[S.kind];document.title=TITLES[S.kind];
  if(window.matchMedia('(max-width:1080px)').matches)$('zoom').value='fit';
  bind();
  if(!B)throw Error('업무 사이트의 품질문서 메뉴에서 열어 주세요.');
  if(!window.DFQualityNativeFormat||!window.DFQualityPrint)throw Error('문서 서식을 불러오지 못했습니다. 새로고침해 주세요.');
  const ctx=B.context();S.identity=ctx.user?.id;if(!S.identity||!can('view'))throw Error('로그인 또는 문서 열람 권한을 확인해 주세요.');
  $('importButton').hidden=!Object.keys(TITLES).some(k=>B.can(k,'create')&&B.can(k,'upload'));
  await refresh();if(S.disposed)return;
  await initialDocument(S.requestedKey);if(S.disposed)return;
  if(args.get('tab')==='matching'&&S.source)await setTab('matching');
  else if(args.get('edit')==='1'&&workingFor(S.source?.doc_key)?.status==='draft'&&!workingFor(S.source?.doc_key)?.approval_id&&can('update'))await openDocument(S.source.doc_key,undefined,{draft:true});
  const update=()=>syncStatus(true).catch(syncFailure);
  S.poll=setInterval(()=>syncStatus().catch(syncFailure),10000);
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  S.client=api();if(typeof S.client.channel==='function')try{
   S.channel=S.client.channel('quality-workspace-'+S.identity+'-'+Date.now()).on('postgres_changes',{event:'*',schema:'public',table:'quality_workspace_revisions'},update).subscribe();
  }catch(_){}
 }
 start().catch(e=>{if(!S.disposed){error(e);$('saveState').textContent='';$('retryLoad').hidden=false;}});
})();
