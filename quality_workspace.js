(function(){'use strict';
 const $=id=>document.getElementById(id),C=window.DFQualityCore,B=parent!==window?parent.DFQualityBridge:null;
 const S={sources:[],source:null,row:null,payload:null,history:[],kind:'manual',mode:'edit',range:null,loading:false,composing:false,disposed:false,previewValid:false,overflow:false,identity:null};
 const STATUS={source:'검토 기준자료 · 미승인',draft:'작성 중 · 미승인',submitted:'결재 중 · 수정 잠금',active:'승인본',obsolete:'구본',rejected:'반려 / 취소'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const result=async query=>{const r=await query;if(r.error)throw r.error;return r.data;};
 function api(){const x=B?.context();if(!x?.user||!x?.api||S.identity&&S.identity!==x.user.id)throw Error('로그인이 변경되었습니다. 다시 로그인하고 작업실을 열어주세요.');return x.api;}
 const can=a=>!!B?.can(S.kind,a);
 const editable=()=>!!(S.row?.status==='draft'&&!S.row.approval_id&&!S.approvalPending&&can('update')&&!S.disposed);
 function say(message,good=false){$('message').textContent=message;$('message').hidden=!message;$('message').classList.toggle('good',good);}
 function error(e){say(String(e?.message||e));}
 const run=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(error);
 const backupKey=()=>S.row&&'df-qw:'+S.identity+':'+S.row.id;
 function collect(){
  const p=C.clone(S.payload);if(S.mode==='edit')Array.from($('editorPages').querySelectorAll('.editable')).forEach((n,i)=>p.sections[i].html=C.sanitize(n.innerHTML));
  p.layoutReviewed=$('reviewed').checked;return {payload:C.payload(p),reason:$('reason').value};
 }
 function recovery(){if(!S.row)return;try{sessionStorage.setItem(backupKey(),JSON.stringify({format:'dreamforen.quality.recovery.v1',key:S.source.doc_key,version:queue.version,...collect()}));}catch(_){say('이 브라우저에 임시 복구본을 남길 수 없습니다. 서버 저장 상태를 확인하고 백업을 내려받으세요.');}}
 const queue=new C.SaveQueue({
  get:collect,
  save:async(value,expected,checkpoint)=>{
   if(!editable())throw Error('현재 문서를 수정할 권한이 없거나 결재로 잠겼습니다.');
   const row=await result(api().rpc('df_qw_save',{p_id:S.row.id,p_expected:expected,p_payload:value.payload,p_reason:value.reason,p_checkpoint:checkpoint}));
   return Array.isArray(row)?row[0]:row;
  },
  onState(state,e){
   const text={dirty:'변경됨 · 저장 대기',saving:'서버 저장 중…',saved:'서버 저장 완료',error:'저장 실패 · 입력은 화면에 보존됨'};
   $('saveState').textContent=text[state]||state;$('saveState').classList.toggle('error',state==='error');$('retry').hidden=state!=='error';
   if(state==='error'){recovery();say((/QW_CONFLICT/.test(e.message)?'동시편집 충돌: 다른 사용자의 저장본을 덮어쓰지 않았습니다. 현재 입력을 백업한 뒤 목차에서 문서를 다시 여세요.\n':'자동 재시도를 멈췄습니다. 연결과 권한을 확인한 뒤 저장 재시도를 눌러주세요.\n')+e.message);}
   if(state==='saved')try{sessionStorage.removeItem(backupKey());}catch(_){}
  },
  onSaved(row){S.row=row;updateMeta();}
 });
 function changed({review=false}={}){
  if(!editable())return;
  if(!review)$('reviewed').checked=false;
  S.previewValid=false;recordUndo();queue.change();recovery();
 }
 function recordUndo(){
  const value=JSON.stringify(collect());S.undo=S.undo||[];if(S.undo.at(-1)!==value)S.undo.push(value);S.redo=[];
  while(S.undo.length>30||(S.undo.length>2&&S.undo.reduce((n,x)=>n+x.length,0)>8000000))S.undo.shift();
 }
 function restoreUndo(redo=false){
  if(!editable())return;let value;
  if(redo){if(!S.redo?.length)return;value=S.redo.pop();S.undo.push(value);}
  else{if(!S.undo||S.undo.length<2)return;S.redo=S.redo||[];S.redo.push(S.undo.pop());value=S.undo.at(-1);}
  const state=JSON.parse(value);S.payload=C.payload(state.payload);$('reason').value=state.reason;$('reviewed').checked=false;S.mode='edit';renderEditor();setMode('edit');S.previewValid=false;queue.change();recovery();
 }
 function metadata(){return {key:S.source.doc_key,revision:S.row?.revision??S.source.base_revision,status:S.row?.status||'source',effectiveDate:S.row?.effective_date||null};}
 function updateMeta(){
  if(!S.source)return;const m=metadata();$('code').textContent=m.key+' · Rev.'+String(m.revision).padStart(2,'0');$('title').textContent=S.source.title;
  $('meta').textContent=STATUS[m.status]+(S.row?.approval_id?' · 결재문서 연결됨':'')+(m.effectiveDate?' · 시행일 '+m.effectiveDate:' · 시행일은 승인 시 반영');
  $('modeStatus').textContent=STATUS[m.status]+' · 개정번호는 새 초안 생성 시 한 번만 증가';
  $('formatTools').disabled=!editable()||S.mode!=='edit';$('paragraphTools').disabled=!editable()||S.mode!=='edit';
  $('reason').disabled=!editable();$('reviewed').disabled=!editable();$('save').disabled=!editable();
  $('newDraft').disabled=!can('create')||['draft','submitted'].includes(S.row?.status);
  $('approve').disabled=!editable()||!B; $('upload').disabled=!can('upload')||!!(S.row&&!editable());
  $('approvalList').hidden=!S.row?.approval_id&&!S.approvalPending;
  $('print').disabled=false;
  $('editorPages').querySelectorAll('.editable').forEach(n=>n.contentEditable=String(editable()));
 }
 function renderToc(){
  const query=$('search').value.trim().toLowerCase();const items=S.sources.filter(d=>d.kind===S.kind&&(!query||(d.doc_key+' '+d.title).toLowerCase().includes(query)));
  $('toc').innerHTML=items.map(d=>`<button type="button" data-key="${esc(d.doc_key)}" class="${d.doc_key===S.source?.doc_key?'active':''}"><small>${esc(d.doc_key)}</small>${esc(d.title)}</button>`).join('')||'<p>등록된 문서가 없습니다.</p>';
  $('toc').querySelectorAll('button').forEach(b=>b.onclick=run(()=>openDocument(b.dataset.key)));
 }
 async function refresh(){
  S.sources=await result(api().from('quality_workspace_sources').select('doc_key,kind,title,base_revision,source_sha256').order('doc_key'));
  renderToc();
 }
 async function flush(){if(S.composing)throw Error('한글 입력을 마친 뒤 다시 시도하세요.');if(queue.dirty()||queue.running)await queue.flush();}
 async function openDocument(key,revisionId){
  if(S.loading)return;
  if(queue.error){if(!confirm('저장하지 못한 입력이 있습니다. 백업 내려받기를 먼저 하세요. 현재 화면 입력을 버리고 서버 자료를 다시 불러올까요?'))return;queue.error=null;queue.saved=queue.sequence;}
  await flush();S.loading=true;
  try{
   const src=await result(api().from('quality_workspace_sources').select('*').eq('doc_key',key).single());
   const revisions=await result(api().from('quality_workspace_revisions').select('id,doc_key,revision,status,approval_id,effective_date,reason,lock_version,created_at,updated_at').eq('doc_key',key).order('created_at',{ascending:false}));
   let selected=revisionId==='source'?null:revisionId?revisions.find(x=>x.id===revisionId):revisions.find(x=>['draft','submitted'].includes(x.status))||revisions.find(x=>x.status==='active')||null;
   if(revisionId&&revisionId!=='source'&&!selected)throw Error('해당 개정본을 찾을 수 없습니다.');
   if(selected)selected=await result(api().from('quality_workspace_revisions').select('*').eq('id',selected.id).single());
   S.source=src;S.kind=src.kind;S.row=selected;S.history=revisions;S.payload=C.payload(selected?.payload||src.payload);S.range=null;S.previewValid=false;S.approvalPending=false;
   let repaired=null;
   // Approved/submitted records keep their stored appearance. A new draft can receive repairs.
   if(!selected||selected.status==='draft'&&!selected.approval_id){repaired=await window.DFQualityNativeFormat.restore(S.payload,key);S.payload=repaired.payload;}
   queue.reset(selected?.lock_version||0);$('reason').value=selected?.reason||'';$('reviewed').checked=S.payload.layoutReviewed;
   $('kind').value=S.kind;$('empty').hidden=true;$('issues').innerHTML='<ul>'+S.payload.issues.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>';
   $('issueCount').textContent='· '+S.payload.issues.length+'개 확인사항';
   $('saveState').textContent=selected?'서버 자료 불러옴':'원본 기반 기준자료';$('retry').hidden=true;say('');
   renderToc();S.mode='edit';renderEditor();setMode('edit');updateMeta();S.undo=[];recordUndo();await loadFiles();renderHistory();
   const fontNote=document.createElement('p');fontNote.textContent='원본 글꼴: '+S.payload.fonts.join(', ')+'. 이 PC에 없는 글꼴은 대체 글꼴로 표시되므로 인쇄 전 확인하세요.';$('issues').append(fontNote);
   if(selected&&editable()){
    let recovered;try{recovered=JSON.parse(sessionStorage.getItem(backupKey())||'null');}catch(_){}
    if(recovered&&confirm('이 브라우저에 저장하지 못한 복구본이 있습니다. 서버 자료 위에 바로 저장하지 않고 화면에 복구할까요?')){
     repaired=await window.DFQualityNativeFormat.restore(C.payload(recovered.payload),key);S.payload=repaired.payload;$('reason').value=String(recovered.reason||'');$('reviewed').checked=false;renderEditor();changed();
     // A recovery from an older server version must not overwrite another editor.
     if(recovered.version!==selected.lock_version){clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 복구본과 서버 저장 버전이 다릅니다. 백업 후 변경사항을 대조하세요.');queue.onState('error',queue.error);}
    }
   }
   if(repaired?.changed&&!queue.error){
    say('원본의 표·번호 들여쓰기·문단 간격을 보완했습니다. 인쇄 미리보기에서 원본과 대조해 주세요.',true);
    if(editable()&&!queue.error){queue.change();await queue.flush(true);}
   }
  }finally{S.loading=false;}
 }
 function renderEditor(){
  $('editorPages').innerHTML='';const m=metadata();
  S.payload.sections.forEach((s,i)=>{
   const p=document.createElement('article');p.className='paper source-segment';p.style.width=s.page.width+'pt';p.style.minHeight=s.page.height+'pt';p.style.padding=`${s.page.top}pt ${s.page.right}pt ${s.page.bottom}pt ${s.page.left}pt`;
   p.innerHTML=`<div class="draft-label">${esc(STATUS[m.status])} · 편집 구역 ${i+1}</div><div class="paper-header">${C.bindHeader(s.header,m,'—','—')}</div><div class="editable" role="textbox" aria-multiline="true" aria-label="${esc(S.source.title)} 본문 ${i+1}" spellcheck="false"></div><div class="paper-footer">${C.bindHeader(s.footer,m,'—','—')}</div><div class="page-footline"><span>${esc(m.key)} · Rev.${String(m.revision).padStart(2,'0')}</span><span>쪽수는 인쇄 미리보기에서 자동 계산</span></div>`;
   const e=p.querySelector('.editable');e.innerHTML=s.html;e.contentEditable=String(editable());
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
  if(!S.source||!can('create'))return;await flush();
  const active=S.history.find(x=>x.status==='active');let base=null;
  if(!active){const value=prompt('원본의 기준 개정번호를 확인해 주세요. 다음 개정번호의 미승인 초안을 만듭니다.\n머리말·꼬리말이 서로 다르면 승인된 관리대장을 기준으로 입력하세요.',String(S.source.base_revision));if(value===null)return;if(!/^\d{1,4}$/.test(value))throw Error('0~9998의 정수를 입력하세요.');base=Number(value);}
  const r=await result(api().rpc('df_qw_new_draft',{p_key:S.source.doc_key,p_base_revision:base}));await openDocument(S.source.doc_key,(Array.isArray(r)?r[0]:r).id);
 }
 function rememberSelection(){
  const selection=window.getSelection();if(!selection?.rangeCount)return;const r=selection.getRangeAt(0),node=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;
  if(!node?.closest('.editable'))return;S.range=r.cloneRange();const cs=getComputedStyle(node),paragraph=node.closest('p,li,h1,h2,h3,h4');
  if(cs.fontSize)$('size').value=(parseFloat(cs.fontSize)*72/96).toFixed(1);const family=cs.fontFamily.split(',')[0].replace(/["']/g,'').trim();
  if(family){if(!Array.from($('font').options).some(x=>x.value===family))$('font').add(new Option(family,family));$('font').value=family;}
  if(paragraph){const p=getComputedStyle(paragraph);$('indentLeft').value=(parseFloat(p.marginLeft||0)*25.4/96).toFixed(1);$('indentFirst').value=(parseFloat(p.textIndent||0)*25.4/96).toFixed(1);if(parseFloat(p.lineHeight)&&parseFloat(p.fontSize))$('line').value=Math.round(parseFloat(p.lineHeight)/parseFloat(p.fontSize)*100);}
 }
 function selection(){if(!editable()||S.mode!=='edit')throw Error('개정 초안의 편집 모드에서 사용하세요.');if(!S.range||!S.range.startContainer.isConnected)throw Error('본문에서 적용할 위치나 글자를 먼저 선택하세요.');const s=window.getSelection();s.removeAllRanges();s.addRange(S.range);return s;}
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
   if(!editable()||pack.doc_key!==S.source.doc_key)throw Error('백업과 같은 문서의 개정 초안을 먼저 열어주세요.');
   if(!confirm('현재 초안 본문을 선택한 백업으로 바꿀까요? 기존 서버 상태는 저장시점 이력에 먼저 보존됩니다.'))return;
   await queue.flush(true);S.payload=C.payload(pack.payload);$('reason').value=String(pack.reason||'');$('reviewed').checked=false;S.mode='edit';setMode('edit');renderEditor();changed();return;
  }
  if(pack.format!=='dreamforen.quality.import.v1'||!Array.isArray(pack.documents)||pack.documents.length>100||!Array.isArray(pack.originals)||pack.originals.length>10)throw Error('제공된 기준문서 가져오기 파일을 선택하세요.');
  const cleaned=pack.documents.map(d=>{if(!/^DFEN-Q[MPI]-\d{2}$/.test(d.key)||!['manual','procedure','instruction'].includes(d.kind)||!B.can(d.kind,'create')||!B.can(d.kind,'upload'))throw Error('문서번호와 작성·등록 권한을 확인하세요.');return {...d,payload:C.payload(d.payload)};});
  if(!confirm(`${cleaned.length}개 기준문서와 ${pack.originals.length}개 원본을 등록합니다. 기존 기준자료를 덮어쓰거나 승인하지 않습니다. 진행할까요?`))return;
  $('importButton').disabled=true;
  try{
   for(const o of pack.originals){const bytes=Uint8Array.from(atob(o.data),c=>c.charCodeAt(0));if(bytes.length!==o.size)throw Error('원본 크기 불일치');await uploadFile(new File([bytes],o.name),o.kind,null,o.sha256);}
   let count=0;for(const d of cleaned){$('saveState').textContent=`기준자료 등록 중 ${++count}/${cleaned.length}`;await result(api().rpc('df_qw_import_source',{p_key:d.key,p_title:d.title,p_base:d.baseRevision,p_payload:d.payload,p_sha:d.sourceSha256}));}
   await refresh();say('기준자료와 원본 등록 완료. 목차에서 문서를 선택하고 개정 초안을 만드세요.',true);$('saveState').textContent='기준자료 등록 완료';
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
  $('snapshots').innerHTML='';if(!S.row)return;
  result(api().from('quality_workspace_snapshots').select('id,revision_id,lock_version,event,created_at').eq('revision_id',S.row.id).order('created_at',{ascending:false}).limit(30)).then(rows=>{
   for(const r of rows){const b=document.createElement('button');b.textContent='저장시점 '+new Date(r.created_at).toLocaleString('ko-KR')+' · '+r.event+' · 백업';b.onclick=run(async()=>{const x=await result(api().from('quality_workspace_snapshots').select('*').eq('id',r.id).single());download(S.source.doc_key+'_snapshot_'+r.id+'.qw.json',JSON.stringify({format:'dreamforen.quality.backup.v1',doc_key:S.source.doc_key,payload:x.payload,reason:x.reason,serverVersion:x.lock_version}));});$('snapshots').append(b);}
  }).catch(error);
 }
 async function approval(){
  await queue.flush(true);if(!editable())throw Error('결재를 요청할 초안을 확인하세요.');
  if(!$('reviewed').checked||!$('reason').value.trim())throw Error('원본 대조 확인과 개정사유를 먼저 입력하세요.');
  if(!S.previewValid)await preview();if(S.overflow)throw Error('인쇄 영역 초과 항목을 먼저 수정하세요.');
  if(!confirm('현재 저장본을 기존 내부결재에 연결합니다. 기안이 저장되면 본문 편집이 잠기며, 승인 후 시행본으로 반영됩니다. 계속할까요?'))return;
  B.approval({doc_type:'general',locked:true,title:`${S.source.doc_key} ${S.source.title} Rev.${String(S.row.revision).padStart(2,'0')} 개정 승인`,content:`DF-QW:${S.row.id}:${S.row.lock_version}\n[첫 줄은 문서 연결정보이므로 수정하지 마세요.]\n문서번호: ${S.source.doc_key}\n개정번호: ${S.row.revision}\n개정사유: ${S.row.reason}\n\n품질문서 작업실에서 연결된 저장본을 검토하세요. 원본 대조 확인: 완료\n이 연결 이후의 내용 변경은 잠기며, 기존 결재선의 최종 승인 후에만 시행됩니다.`});
  S.approvalPending=true;updateMeta();
  say('기존 결재창에서 결재선을 확인하고 저장 또는 상신하세요. 돌아온 뒤 「개정이력 → 새로고침」으로 상태를 확인하세요.',true);
 }
 // Pagination and print preview share exactly the same DOM, without modifying editable source.
 async function preview(){
  if(!S.source)return;await flush();if(S.mode==='edit')S.payload=collect().payload;await document.fonts.ready;
  const measure=document.createElement('div');measure.style.cssText='position:absolute;left:-20000px;top:0;width:210mm;visibility:hidden;';document.body.append(measure);
  const meta=metadata(),pages=[];S.overflow=false;
  try{
   for(const section of S.payload.sections){
    let page,body,space;
    function addPage(){
     if(pages.length>=200)throw Error('200쪽을 초과했습니다. 문서 내용을 확인하세요.');
     page=document.createElement('article');page.className='paper print-paper';const p=section.page;
     page.style.padding=`${p.top}pt ${p.right}pt ${p.bottom}pt ${p.left}pt`;
     page.innerHTML=`<div class="draft-label">${esc(STATUS[meta.status])}</div><div class="paper-header">${C.bindHeader(section.header,meta,1,1)}</div><div class="print-body"></div><div class="paper-footer">${C.bindHeader(section.footer,meta,1,1)}</div><div class="page-footline"><span>${esc(meta.key)} · Rev.${String(meta.revision).padStart(2,'0')} · ${meta.effectiveDate||'승인 전'}</span><span class="page-number"></span></div>`;
     measure.append(page);body=page.querySelector('.print-body');
     const h=page.querySelector('.paper-header'),f=page.querySelector('.paper-footer');h.style.minHeight=p.header+'pt';f.style.minHeight=p.footer+'pt';
     const heights=Array.from(page.children).filter(n=>n!==body).reduce((a,n)=>a+n.getBoundingClientRect().height,0);
     space=(841.89-p.top-p.bottom)*96/72-heights-2;body.style.height=Math.max(60,space)+'px';pages.push({page,section});
    }
    function fits(n){body.append(n);const yes=body.scrollHeight<=body.clientHeight+1;return yes;}
    function oversized(n){n.classList.add('oversize');S.overflow=true;}
    function append(node){
     if(node.nodeType!==1)return;if(node.hasAttribute('data-page-break')){if(body.childNodes.length)addPage();return;}
     const had=body.childNodes.length;if(fits(node))return;node.remove();
     if(node.tagName==='TABLE'){
      // Keep rowspan-connected rows together; never cut a merged cell silently.
      const rows=Array.from(node.querySelectorAll(':scope > tbody > tr,:scope > tr')),groups=[];let end=-1;
      rows.forEach((r,i)=>{if(i>end){groups.push([]);end=i;}groups.at(-1).push(r);for(const cell of r.cells)end=Math.max(end,i+(cell.rowSpan||1)-1);});
      if(groups.length>1){
       let table=null,tb=null;for(const group of groups){
        if(!table){table=node.cloneNode(false);const cols=node.querySelector(':scope > colgroup');if(cols)table.append(cols.cloneNode(true));tb=document.createElement('tbody');table.append(tb);body.append(table);}
        group.forEach(r=>tb.append(r));if(body.scrollHeight>body.clientHeight+1){group.forEach(r=>r.remove());if(!tb.children.length)table.remove();if(body.children.length)addPage();table=node.cloneNode(false);const cols=node.querySelector(':scope > colgroup');if(cols)table.append(cols.cloneNode(true));tb=document.createElement('tbody');table.append(tb);group.forEach(r=>tb.append(r));body.append(table);if(body.scrollHeight>body.clientHeight+1)oversized(table);}
       }return;
      }
     }
     if(had){addPage();if(fits(node))return;node.remove();}
     if(node.tagName==='P'&&node.textContent.length>1){
      // Split long paragraphs at an actual measured text offset, retaining inline formatting.
      let remaining=node;
      while(remaining.textContent.length>1){
       body.append(remaining);if(body.scrollHeight<=body.clientHeight+1)return;remaining.remove();
       const texts=[];const walker=document.createTreeWalker(remaining,4);let t;while(t=walker.nextNode())texts.push(t);
       const length=remaining.textContent.length;let lo=1,hi=length-1,best=0;
       function split(at){let count=0,last=texts.at(-1),offset=last.length;for(const n of texts){if(count+n.length>=at){last=n;offset=at-count;break;}count+=n.length;}const r=document.createRange();r.selectNodeContents(remaining);r.setEnd(last,offset);const left=remaining.cloneNode(false);left.append(r.cloneContents());r.selectNodeContents(remaining);r.setStart(last,offset);const right=remaining.cloneNode(false);right.append(r.cloneContents());right.style.textIndent='0';return [left,right];}
       while(lo<=hi){const mid=(lo+hi)>>1,[left]=split(mid);body.append(left);const ok=body.scrollHeight<=body.clientHeight+1;left.remove();if(ok){best=mid;lo=mid+1;}else hi=mid-1;}
       if(!best){body.append(remaining);oversized(remaining);return;}
       // Avoid splitting a UTF-16 surrogate pair.
       const ch=remaining.textContent.charCodeAt(best-1);if(ch>=0xD800&&ch<=0xDBFF)best--;
       if(best<1){body.append(remaining);oversized(remaining);return;}
       const [left,right]=split(best);body.append(left);remaining=right;addPage();
      }body.append(remaining);return;
     }
     body.append(node);oversized(node);
    }
    addPage();const content=document.createElement('div');content.innerHTML=C.sanitize(section.html);for(const node of Array.from(content.childNodes))append(node);
   }
   pages.forEach(({page,section},i)=>{
    page.querySelector('.paper-header').innerHTML=C.bindHeader(section.header,meta,i+1,pages.length);page.querySelector('.paper-footer').innerHTML=C.bindHeader(section.footer,meta,i+1,pages.length);
    page.querySelector('.page-number').textContent=(i+1)+' / '+pages.length;
   });
   $('printPages').replaceChildren(...pages.map(x=>x.page));S.previewValid=true;$('pageCount').textContent=pages.length+'쪽';setMode('preview');
   if(S.overflow)say('인쇄 영역을 초과한 표 또는 개체가 있습니다(주황색 테두리). 글자 크기·여백·행 높이를 조정한 뒤 다시 확인하세요. 잘리는 인쇄를 막기 위해 인쇄와 결재 요청을 잠갔습니다.');
   $('print').disabled=S.overflow;
  }finally{measure.remove();}
 }
 function bind(){
  $('kind').onchange=run(async()=>{await flush();S.kind=$('kind').value;renderToc();const first=S.sources.find(x=>x.kind===S.kind);if(first)await openDocument(first.doc_key);});$('search').oninput=renderToc;
  $('newDraft').onclick=run(draft);$('save').onclick=run(()=>queue.flush(true));$('retry').onclick=run(()=>queue.retry());$('backup').onclick=run(backup);
  $('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=run(async e=>{try{await importFile(e.target.files[0]);}finally{e.target.value='';}});
  $('reason').oninput=()=>changed();$('reviewed').onchange=()=>changed({review:true});$('approve').onclick=run(approval);
  $('approvalList').onclick=run(async()=>{await flush();B.approvalList();});
  $('editMode').onclick=()=>setMode('edit');$('previewMode').onclick=run(preview);$('zoom').onchange=fit;window.addEventListener('resize',fit);
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
  window.addEventListener('beforeunload',e=>{if(queue.dirty()||queue.running){recovery();e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(editable())run(()=>queue.flush(true))();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();$('print').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&editable()){e.preventDefault();restoreUndo(e.shiftKey);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&editable()){e.preventDefault();restoreUndo(true);}});
  window.addEventListener('beforeprint',()=>{if(!S.previewValid||S.overflow){$('printPages').hidden=true;$('printPages').textContent='인쇄 미리보기를 먼저 확인하세요. 인쇄 대화상자를 취소해 주세요.';}});
 }
 async function syncStatus(){
  if(!S.row||S.loading||S.disposed||queue.running||document.hidden)return;
  const id=S.row.id,r=await result(api().from('quality_workspace_revisions').select('id,lock_version,status,approval_id,effective_date').eq('id',id).single());
  if(S.row?.id!==id||r.lock_version<S.row.lock_version)return;
  if(r.lock_version!==S.row.lock_version||r.status!==S.row.status||r.approval_id!==S.row.approval_id){
   if(queue.dirty()){clearTimeout(queue.timer);queue.error=Error('QW_CONFLICT: 서버 저장본 또는 결재 상태가 변경되었습니다. 입력을 백업한 뒤 새로고침하세요.');queue.onState('error',queue.error);return;}
   await openDocument(S.source.doc_key,id);
  }
 }
 function permissionChanged(){
  const ctx=B?.context(),identityChanged=!ctx?.user||ctx.user.id!==S.identity,revoked=S.source&&!B.can(S.kind,'view');
  if(!identityChanged&&ctx.profile?.role!=='admin'&&ctx.permissionStatus&&ctx.permissionStatus!=='ready'){
   clearTimeout(queue.timer);updateMeta();$('saveState').textContent='권한 확인 중 · 입력 보존';return;
  }
  if(identityChanged||revoked){
   S.disposed=true;queue.dispose();queue.saved=queue.sequence;queue.error=null;
   for(const id of ['editorPages','printPages','issues','history','snapshots','files','toc'])$(id).replaceChildren();
   S.payload=null;S.source=null;S.row=null;S.undo=[];S.redo=[];$('reason').value='';$('code').textContent='문서 닫힘';$('title').textContent='작업실을 다시 열어주세요';$('meta').textContent='';$('saveState').textContent='계정·권한 확인 필요';
   for(const id of ['save','newDraft','approve','print','upload','reviewed'])$(id).disabled=true;$('formatTools').disabled=true;$('paragraphTools').disabled=true;
   try{for(let i=sessionStorage.length-1;i>=0;i--){const k=sessionStorage.key(i);if(k.startsWith('df-qw:'+S.identity+':'))sessionStorage.removeItem(k);}}catch(_){}
   say(identityChanged?'로그아웃 또는 계정 변경으로 문서를 닫았습니다. 작업실을 다시 열어주세요.':'조회 권한이 변경되어 문서를 닫았습니다.');return;
  }
  updateMeta();
  if(queue.dirty()&&!queue.error&&editable())queue.flush().catch(()=>{});
 }
 window.DFQualityWorkspace={flush,isPending:()=>queue.dirty()||!!queue.running,permissionChanged};
 async function start(){
  bind();if(!B)throw Error('로그인한 업무 사이트의 품질문서 메뉴에서 작업실을 여세요.');if(!window.DFQualityNativeFormat)throw Error('품질문서 서식 파일을 불러오지 못했습니다. 새 파일 5개가 모두 올라갔는지 확인하고 Ctrl+Shift+R로 새로고침해 주세요.');const ctx=B.context();S.identity=ctx.user?.id;if(!S.identity)throw Error('로그인이 필요합니다.');
  S.kind=['manual','procedure','instruction'].find(k=>B.can(k,'view'))||'manual';$('kind').value=S.kind;
  for(const o of $('kind').options)o.disabled=!B.can(o.value,'view');
  $('importButton').hidden=!['manual','procedure','instruction'].some(k=>B.can(k,'create')&&B.can(k,'upload'));
  await refresh();$('saveState').textContent='문서 목록 불러옴';if(S.sources.length)await openDocument(S.sources.find(x=>x.kind===S.kind)?.doc_key||S.sources[0].doc_key);
  setInterval(()=>syncStatus().catch(()=>{}),15000);window.addEventListener('focus',()=>syncStatus().catch(()=>{}));
 }
 start().catch(e=>{error(/quality_workspace|schema cache|does not exist/i.test(e.message)?'품질문서 작업실 DB 설치 확인이 필요합니다. 제공된 quality_workspace_43.sql만 실행하세요. 이전 버전 SQL은 다시 실행하지 마세요.':e);$('saveState').textContent='연결 확인 필요';});
})();
