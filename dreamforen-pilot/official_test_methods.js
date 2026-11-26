/* 공정시험법 전용 목록·본문. 기존 품질문서와 결재 자료는 읽거나 수정하지 않습니다. */
(function(global,document){
 'use strict';
 const ROUTE='official-test-methods',VIEW='dfViewOfficialTestMethods';
 const S={rows:[],selected:'',query:'',domain:'',status:'all',tab:'file',font:16,ready:false,loading:false,opened:false,actor:'',client:null,epoch:0,paint:0,urls:[],viewer:null,blob:null,dialog:null,dirty:false,busy:false,flight:null};
 const $=id=>document.getElementById(id),M=()=>global.DFOfficialTestMethodModel;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clean=value=>String(value??'').trim(),statusName=value=>({active:'사용중',draft:'작성중',obsolete:'이전본'}[value]||'사용중');
 function session(){try{return {client:typeof dfSupabase!=='undefined'?dfSupabase:null,userId:typeof dfCloudUser!=='undefined'?dfCloudUser?.id||'':''};}catch(_){return {client:null,userId:''};}}
 function legacy(action){try{return action==='view'||dfCloudProfile?.role==='admin'||dfCloudProfile?.access_permissions?.quality_edit===true;}catch(_){return action==='view';}}
 function can(action){const me=session();try{if(typeof dfCloudProfile!=='undefined'&&dfCloudProfile?.active===false)return false;}catch(_){}return !!me.userId&&!!me.client&&(typeof global.dfMenuCan==='function'?global.dfMenuCan('doc-hub',action,()=>legacy(action)):legacy(action));}
 const repo=()=>M().repository({getSession:session,can});
 function ticket(){return {epoch:S.epoch,actor:S.actor,client:S.client};}
 function valid(t){const me=session();return S.opened&&t.epoch===S.epoch&&t.actor===me.userId&&t.client===me.client&&can('view');}
 function say(message,bad=false){const el=$('dfOtmMessage');if(el){el.textContent=message||'';el.hidden=!message;el.classList.toggle('bad',!!bad);}}
 function disposePreview(){S.paint++;S.viewer?.destroy?.();S.viewer=null;S.blob=null;S.urls.forEach(url=>URL.revokeObjectURL(url));S.urls=[];}
 function url(blob){const result=URL.createObjectURL(blob);S.urls.push(result);return result;}
 function selected(){return S.rows.find(row=>String(row.id)===S.selected)||null;}
 function decoded(row){return M().decode(row);}
 function filtered(){const q=S.query.toLocaleLowerCase('ko');return S.rows.filter(row=>{const d=decoded(row);return !q||[d.docNo,d.title,row.file_name,d.body,d.note].some(value=>String(value||'').toLocaleLowerCase('ko').includes(q));}).sort((a,b)=>String(a.title||a.file_name||'').localeCompare(String(b.title||b.file_name||''),'ko',{numeric:true})||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));}
 function remember(){global.DF_NAVIGATION_GUARD?.changed?.({replace:true});}
 function init(){
  const host=$('dfOfficialTestMethodsHost');if(!host||host.dataset.ready)return;
  host.dataset.ready='1';host.className='df-otm';
  host.innerHTML=`<header class="df-otm-head"><div class="df-otm-heading"><button type="button" class="company-btn secondary" data-otm-back aria-label="품질문서 목록으로 뒤로가기">뒤로가기</button><h1>공정시험법</h1></div><div class="df-otm-head-actions"><button type="button" class="company-btn secondary" data-otm-refresh>새로고침</button><button type="button" class="company-btn secondary danger" data-otm-delete-all>전체삭제</button></div></header><div class="df-otm-upload" id="dfOtmUpload" data-df-drop-input="dfOtmFiles" data-df-drop-trigger="dfOtmFiles" role="button" tabindex="0" aria-label="공정시험법 PDF 파일 선택 또는 끌어놓기"><div><strong>공정시험법 PDF를 여기에 끌어놓으세요</strong><span>파일명으로 바로 등록 · 여러 파일 선택 가능 · 파일당 50MB 이하</span></div><span class="df-otm-pick-wrap"><button type="button" class="company-btn primary" data-otm-pick>PDF 업로드</button><input id="dfOtmFiles" type="file" accept=".pdf,application/pdf" multiple data-df-drop="off" tabindex="-1" aria-label="공정시험법 PDF 파일 선택"></span></div><div id="dfOtmMessage" class="df-otm-message" role="status" aria-live="polite" hidden></div><div class="df-otm-layout"><aside class="df-otm-sidebar"><div class="df-otm-search"><input id="dfOtmSearch" type="search" aria-label="공정시험법 검색" placeholder="파일명 · 문서 검색"></div><div id="dfOtmCount" class="df-otm-list-count"></div><nav id="dfOtmList" class="df-otm-list" aria-label="공정시험법 목록"></nav></aside><main id="dfOtmReader" class="df-otm-reader" aria-live="polite"></main></div>`;
  host.addEventListener('click',event=>{
   const b=event.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-otm-back')){if(!discard())return;const navigate=global.DF_NAVIGATION_GUARD?.navigate||global.v62ShowOnly;if(navigate&&navigate('quality',{replace:true})!==false)close();}
   else if(b.hasAttribute('data-otm-refresh')){if(!S.busy)refresh();}
   else if(b.hasAttribute('data-otm-delete-all'))removeAll();
   else if(b.dataset.otmId){S.selected=b.dataset.otmId;S.tab='file';renderList();renderReader();remember();}
   else if(b.dataset.otmTab){S.tab=b.dataset.otmTab;renderReader();remember();}
   else if(b.hasAttribute('data-otm-delete'))removeSelected();
   else if(b.hasAttribute('data-otm-download'))download(selected());
   else if(b.hasAttribute('data-otm-print'))printSelected();
   else if(b.dataset.otmHistory!==undefined)previewHistory(Number(b.dataset.otmHistory));
   else if(b.dataset.otmHistoryDownload!==undefined){const row=selected(),history=decoded(row).history[Number(b.dataset.otmHistoryDownload)];if(history)download({...row,...history});}
   else if(b.dataset.otmFont){S.font=Math.max(12,Math.min(24,S.font+Number(b.dataset.otmFont)));const article=$('dfOtmReader')?.querySelector('.df-otm-document');article?.style.setProperty('--df-otm-body-size',S.font+'px');}
  });
  const zone=$('dfOtmUpload'),input=$('dfOtmFiles');
  function pick(){if(S.ready&&!S.loading&&!S.busy&&can('create')&&can('upload'))input.click();}
  zone.addEventListener('click',event=>{if(event.target!==input)pick();});
  zone.addEventListener('keydown',event=>{if(event.target===zone&&(event.key==='Enter'||event.key===' ')){event.preventDefault();pick();}});
  zone.addEventListener('dragover',event=>{event.preventDefault();if(S.ready&&!S.loading&&!S.busy&&can('create')&&can('upload'))zone.classList.add('is-dragging');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('is-dragging'));
  zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('is-dragging');uploadFiles(event.dataTransfer?.files);});
  input.onchange=()=>{const files=Array.from(input.files||[]);input.value='';uploadFiles(files);};
  $('dfOtmSearch').addEventListener('input',event=>{S.query=event.target.value.trim();paintFiltered();});
 }
 function updateActions(){
  const host=$('dfOfficialTestMethodsHost');if(!host||!host.dataset.ready)return;const zone=$('dfOtmUpload'),input=$('dfOtmFiles'),pick=host.querySelector('[data-otm-pick]'),all=host.querySelector('[data-otm-delete-all]'),refreshButton=host.querySelector('[data-otm-refresh]');if(!zone||!input||!pick||!all||!refreshButton)return;const writable=can('create')&&can('upload'),blocked=!S.ready||S.loading||S.busy;
  zone.hidden=!writable;zone.setAttribute('aria-disabled',String(blocked));zone.tabIndex=blocked?-1:0;
  input.disabled=blocked||!writable;pick.disabled=blocked||!writable;
  all.hidden=!can('delete');all.disabled=blocked||!S.rows.length;
  refreshButton.disabled=S.loading||S.busy;
  host.querySelectorAll('[data-otm-delete]').forEach(button=>button.disabled=blocked||!can('delete'));
 }
 function paintFiltered(){const list=filtered();if(!list.some(row=>String(row.id)===S.selected)){S.selected=String(list[0]?.id||'');S.tab='file';}renderList();renderReader();remember();}
 function renderList(){
  $('dfOtmSearch').value=S.query;const rows=filtered();$('dfOtmCount').textContent=`${rows.length}개 파일 · 전체 ${S.rows.length}개`;
  $('dfOtmList').innerHTML=rows.map(row=>{const d=decoded(row);return `<button type="button" class="df-otm-entry ${String(row.id)===S.selected?'selected':''}" data-otm-id="${esc(row.id)}" aria-current="${String(row.id)===S.selected?'true':'false'}"><strong>${esc(d.title||row.file_name||'공정시험법')}</strong><span class="df-otm-entry-meta">${esc(row.file_name||d.docNo||'기존 본문 자료')}</span></button>`;}).join('')||`<div class="df-otm-empty">${S.loading?'파일을 불러오는 중입니다.':S.rows.length?'검색 결과가 없습니다.':'등록된 공정시험법 PDF가 없습니다.'}</div>`;
  updateActions();
 }
 function bodyHtml(body){
  const paragraphs=String(body||'').replace(/\r\n?/g,'\n').split('\n');let heading=0;
  return paragraphs.map(line=>{const text=line.trim();if(!text)return '<p aria-hidden="true">&nbsp;</p>';if(/^(?:제\s*\d+\s*[장절조]|\d+(?:\.\d+){0,3}[.)]?\s+|[가-하][.)]\s+)/.test(text)&&text.length<100)return `<h3 class="df-otm-body-heading" id="dfOtmSection${++heading}">${esc(text)}</h3>`;return `<p>${esc(line)}</p>`;}).join('');
 }
 function renderReader(){
  disposePreview();const host=$('dfOtmReader'),row=selected();if(!host)return;
  if(!row){host.innerHTML='<div class="df-otm-empty">'+(S.ready?'상단에 PDF를 올리거나 왼쪽에서 파일을 선택하세요.':'공정시험법을 불러오는 중입니다.')+'</div>';updateActions();return;}
  const d=decoded(row),fileAllowed=!!row.storage_path;if(S.tab==='file'&&!fileAllowed)S.tab='body';if(S.tab==='body'&&!clean(d.body)&&fileAllowed)S.tab='file';
  const tabs=(fileAllowed&&clean(d.body))||d.history.length;
  host.innerHTML=`<article class="df-otm-document" style="--df-otm-body-size:${S.font}px"><header class="df-otm-document-head"><h2>${esc(d.title||row.file_name||'공정시험법')}</h2>${row.file_name?`<div class="df-otm-doc-meta">${esc(row.file_name)}</div>`:''}</header>${tabs?`<nav class="df-otm-tabs" aria-label="문서 보기">${fileAllowed?`<button type="button" data-otm-tab="file" aria-selected="${S.tab==='file'}">원본 파일</button>`:''}${clean(d.body)?`<button type="button" data-otm-tab="body" aria-selected="${S.tab==='body'}">기존 본문</button>`:''}${d.history.length?`<button type="button" data-otm-tab="history" aria-selected="${S.tab==='history'}">이전 파일 ${d.history.length}</button>`:''}</nav>`:''}<div class="df-otm-tools"><div>${S.tab==='body'?'<button type="button" class="company-btn secondary" data-otm-font="-1" aria-label="본문 글자 줄이기">가−</button><button type="button" class="company-btn secondary" data-otm-font="1" aria-label="본문 글자 키우기">가＋</button>':''}</div><div>${fileAllowed?'<button type="button" class="company-btn secondary" data-otm-download>원본 다운로드</button>':''}<button type="button" class="company-btn secondary" data-otm-print>인쇄 / PDF</button>${can('delete')?'<button type="button" class="company-btn secondary danger" data-otm-delete>삭제</button>':''}</div></div><section class="df-otm-content" id="dfOtmContent"></section></article>`;
  const content=$('dfOtmContent');
  if(S.tab==='body')content.innerHTML=d.body?`<div class="df-otm-body-text">${bodyHtml(d.body)}</div>`:'<div class="df-otm-empty">본문이 없습니다. 원본 파일로 확인해주세요.</div>';
  else if(S.tab==='file')showFile(row,content);
  else content.innerHTML=d.history.length?`<ul class="df-otm-history">${d.history.slice().reverse().map((file,index)=>`<li><div><strong>${esc(file.file_name)}</strong><span>개정 ${esc(file.version||'0')} · ${esc(String(file.replaced_at||'').slice(0,10))}</span></div><div><button type="button" class="company-btn secondary" data-otm-history="${d.history.length-1-index}">보기</button><button type="button" class="company-btn secondary" data-otm-history-download="${d.history.length-1-index}">다운로드</button></div></li>`).join('')}</ul>`:'<div class="df-otm-empty">이전 파일이 없습니다.</div>';
  updateActions();
 }
 async function showFile(row,host){
  const t=ticket(),paint=S.paint;host.classList.add('df-otm-preview');host.innerHTML='<div class="df-otm-empty">원본 파일을 불러오는 중입니다.</div>';
  try{
   const blob=await repo().file(row);if(!valid(t)||paint!==S.paint||!host.isConnected)return;S.blob=blob;host.replaceChildren();
   const extension=clean(row.file_name).split('.').pop().toLowerCase();
   if(extension==='pdf'){
    const frame=document.createElement('iframe');frame.className='df-otm-pdf';frame.title=row.file_name+' 미리보기';frame.src=url(new Blob([blob],{type:'application/pdf'}));host.append(frame);
   }else if(['png','jpg','jpeg'].includes(extension)){
    const image=document.createElement('img');image.className='df-otm-image';image.alt=row.file_name;image.src=url(blob);host.append(image);
   }else if(extension==='hwpx'){
    if(!global.DF_HWPX_PREVIEW?.render)throw Error('HWPX 미리보기를 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');
    const viewer=await global.DF_HWPX_PREVIEW.render(blob,{name:row.file_name});if(!valid(t)||paint!==S.paint){viewer.destroy();return;}S.viewer=viewer;host.append(viewer.element);
   }else if(extension==='hwp'){
    if(!global.XLSX?.CFB)throw Error('한글 파일을 미리볼 수 없습니다. 원본 다운로드를 이용해주세요.');
    const cfb=global.XLSX.CFB.read(new Uint8Array(await blob.arrayBuffer()),{type:'array'});if(!valid(t)||paint!==S.paint)return;
    const entry=cfb.FileIndex.find(item=>item.name==='PrvImage'),bytes=new Uint8Array(entry?.content||[]);
    const mime=bytes[0]===137&&bytes[1]===80?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===66&&bytes[1]===77?'image/bmp':'';
    const note=document.createElement('p');note.textContent='한글 내장 미리보기 · 전체 문서는 원본 다운로드로 확인하세요.';host.append(note);
    if(mime){const image=document.createElement('img');image.className='df-otm-image';image.alt=row.file_name+' 첫 페이지';image.src=url(new Blob([bytes],{type:mime}));host.append(image);}
    else{const entry=cfb.FileIndex.find(item=>item.name==='PrvText');if(!entry?.content?.length)throw Error('내장 미리보기가 없는 한글 파일입니다. 원본 다운로드를 이용해주세요.');const pre=document.createElement('pre');pre.className='df-otm-hwp-text';pre.textContent=new TextDecoder('utf-16le').decode(new Uint8Array(entry.content)).replace(/\u0000/g,'');host.append(pre);}
   }else{
    const text=await extractText(blob,row.file_name);if(!valid(t)||paint!==S.paint)return;
    const pre=document.createElement('pre');pre.className='df-otm-hwp-text';pre.textContent=text||'본문을 확인할 수 없습니다. 원본 다운로드를 이용해주세요.';host.append(pre);
   }
  }catch(error){if(valid(t)&&paint===S.paint){host.replaceChildren();const message=document.createElement('div');message.className='df-otm-empty';message.textContent=error.message||'미리보기를 열지 못했습니다. 원본 다운로드를 이용해주세요.';host.append(message);}}
 }
 async function extractText(blob,name){
  const extension=clean(name).split('.').pop().toLowerCase();
  if(extension==='txt')return blob.text();
  if(extension==='hwp')throw Error('HWP 파일의 전체 본문은 한글에서 복사해 넣거나 HWPX·PDF 파일로 가져와주세요. 원본 HWP는 그대로 보관됩니다.');
  if(extension==='pdf'){
   const pdfjs=await import(new URL('assets/pdf.min.mjs',document.baseURI).href);pdfjs.GlobalWorkerOptions.workerSrc=new URL('assets/pdf.worker.min.mjs',document.baseURI).href;
   const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())});let pdf;
   try{pdf=await task.promise;if(pdf.numPages>500)throw Error('본문 가져오기는 500쪽 이하 문서에서 사용할 수 있습니다.');const texts=[];for(let page=1;page<=pdf.numPages;page++){const content=await(await pdf.getPage(page)).getTextContent();texts.push(content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));if(texts.join('').length>1024*1024)throw Error('본문이 길어 원본 파일 보기로 이용해주세요.');}const result=texts.join('\n\n');if(!result.trim())throw Error('이미지로 저장된 PDF입니다. 원본 파일로 보거나 본문을 직접 입력해주세요.');return result;}finally{await pdf?.destroy?.();}
  }
  if(['hwpx','docx'].includes(extension)){
   if(!global.JSZip)throw Error('문서 읽기 기능을 불러오지 못했습니다.');const zip=await global.JSZip.loadAsync(blob),names=Object.keys(zip.files).filter(name=>extension==='hwpx'?/^Contents\/section\d+\.xml$/.test(name):name==='word/document.xml').sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));let total=0;const out=[];
   for(const name of names){const item=zip.file(name),size=item?._data?.uncompressedSize;if(size>8*1024*1024)throw Error('본문을 직접 입력하거나 원본 파일을 이용해주세요.');const text=await item.async('string');total+=text.length;if(total>8*1024*1024)throw Error('본문이 긴 문서입니다. 원본 파일로 이용해주세요.');const xml=new DOMParser().parseFromString(text,'application/xml');if(xml.querySelector('parsererror'))throw Error('문서 본문을 읽을 수 없습니다.');const paragraphs=Array.from(xml.getElementsByTagNameNS('*','p'));out.push(...paragraphs.map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(t=>t.textContent).join('')));}
   return out.join('\n');
  }
  throw Error('본문 가져오기는 PDF·HWPX·DOCX·TXT에서 사용할 수 있습니다.');
 }
 async function refresh(){
  init();const t=ticket();if(S.loading&&S.flight)return S.flight;S.loading=true;S.ready=false;updateActions();say('공정시험법을 불러오는 중입니다.');
  const flight=(async()=>{try{const rows=await repo().list();if(!valid(t))return;S.rows=rows;S.ready=true;const list=filtered();if(!list.some(row=>String(row.id)===S.selected))S.selected=String(list[0]?.id||'');renderList();renderReader();say('');}catch(error){if(valid(t))say(error.message||'공정시험법을 불러오지 못했습니다.',true);}finally{if(valid(t)){S.loading=false;updateActions();}if(S.flight===flight)S.flight=null;}})();S.flight=flight;return flight;
 }
 async function open(){
  const me=session();if(!me.userId||!me.client||!can('view'))return;
  init();if(S.actor!==me.userId||S.client!==me.client){close(true);S.actor=me.userId;S.client=me.client;S.rows=[];S.selected='';S.query='';S.domain='';S.status='all';}
  S.opened=true;await refresh();
 }
 function go(){if(global.v62ShowOnly?.(ROUTE)===false)return;if(!global.DF_NAVIGATION_GUARD)open();}
 function close(force=false){if(!force&&!discard())return false;S.opened=false;S.epoch++;S.loading=false;S.ready=false;S.flight=null;disposePreview();S.dirty=false;S.busy=false;updateActions();return true;}
 function discard(){if(S.busy){say('파일 처리 중입니다. 완료된 뒤 이동해주세요.',true);return false;}return true;}
 function batchMessage(result,total,action){
  const done=action==='등록'?result.saved.length:result.deleted.length,failed=result.failed.length;
  const parts=[`${action} ${done}개 / 전체 ${total}개`];
  if(failed)parts.push('실패 '+failed+'개: '+result.failed.slice(0,5).map(item=>(item.name||item.title||item.id)+' ('+(item.error?.message||'처리 실패')+')').join(', '));
  if(result.stopped)parts.push('권한 또는 로그인이 변경되어 남은 작업을 중단했습니다.');
  if(result.warnings.length)parts.push([...new Set(result.warnings)].join(' '));
  if(action==='삭제'&&S.rows.length)parts.push(`현재 남아 있는 공정시험법 ${S.rows.length}개`);
  return parts.join(' · ');
 }
 async function uploadFiles(files){
  const entries=Array.from(files||[]);if(!entries.length)return;if(S.busy){say('다른 파일을 처리 중입니다. 완료된 뒤 다시 올려주세요.',true);return;}if(!S.ready||S.loading){say('목록을 불러오는 중입니다. 완료된 뒤 파일을 다시 선택해주세요.',true);return;}if(!can('create')||!can('upload')){say('공정시험법 등록·업로드 권한을 확인해주세요.',true);return;}
  const t=ticket();S.busy=true;updateActions();say('PDF 파일을 확인하는 중입니다.');
  try{
   const result=await repo().uploadPdfs(entries,{onProgress:value=>{if(valid(t))say(`PDF 업로드 ${value.done}/${value.total} · ${value.name}`);}});
   if(!valid(t))return;S.rows=S.rows.concat(result.saved).filter((row,index,all)=>all.findIndex(item=>item.id===row.id)===index);
   if(result.saved.length){S.selected=String(result.saved.at(-1).id);S.query='';S.tab='file';}
   await refresh();if(valid(t))say(batchMessage(result,entries.length,'등록'),!!result.failed.length||!!result.warnings.length||result.stopped);
  }catch(error){if(valid(t))say([error.message,error.cleanupWarning].filter(Boolean).join(' '),true);}
  finally{if(valid(t)){S.busy=false;updateActions();}}
 }
 async function removeAll(){
  if(!S.ready||S.loading||S.busy||!can('delete')||!S.rows.length)return;
  const rows=S.rows.slice();if(!global.confirm(`공정시험법 전체 ${rows.length}개와 보관된 파일을 삭제할까요?\n검색 조건과 관계없이 전체 공정시험법이 대상입니다. 다른 품질문서는 삭제하지 않습니다.\n삭제 후 되돌릴 수 없습니다.`))return;
  const t=ticket();S.busy=true;updateActions();
  try{
   const result=await repo().removeAll(rows,{onProgress:value=>{if(valid(t))say(`공정시험법 삭제 ${value.done}/${value.total}`);}});
   if(!valid(t))return;S.rows=S.rows.filter(row=>!result.deleted.includes(String(row.id)));S.selected='';
   await refresh();if(valid(t))say(batchMessage(result,rows.length,'삭제'),!!result.failed.length||!!result.warnings.length||result.stopped);
  }catch(error){if(valid(t))say(error.message||'전체삭제를 완료하지 못했습니다.',true);}
  finally{if(valid(t)){S.busy=false;updateActions();}}
 }
 async function removeSelected(){
  const row=selected();if(!row||!S.ready||S.loading||S.busy||!can('delete')||!global.confirm('“'+row.title+'” 문서와 보관된 이전 파일을 삭제할까요? 삭제 후 되돌릴 수 없습니다.'))return;
  const t=ticket();S.busy=true;updateActions();try{const result=await repo().remove(row);if(!valid(t))return;S.rows=S.rows.filter(r=>r.id!==row.id);S.selected='';paintFiltered();say(result.cleanupWarning||'문서를 삭제했습니다.',!!result.cleanupWarning);}catch(error){if(valid(t))say(error.message,true);}finally{if(valid(t)){S.busy=false;updateActions();}}
 }
 async function download(row){if(!row||!can('view'))return;const t=ticket();try{const blob=await repo().file(row);if(!valid(t))return;const href=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=href;anchor.download=row.file_name||'공정시험법';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);}catch(error){if(valid(t))say(error.message,true);}}
 function previewHistory(index){const row=selected(),item=decoded(row).history[index];if(!item)return;disposePreview();const content=$('dfOtmContent');content.innerHTML=`<h3>${esc(item.file_name)} · 개정 ${esc(item.version||'0')}</h3>`;const host=document.createElement('section');host.className='df-otm-preview';content.append(host);showFile({...row,...item},host);}
 async function printSelected(){
  const row=selected();if(!row||!S.ready)return;const d=decoded(row);
  if(S.tab==='file'&&S.viewer?.print)return S.viewer.print();
  if(S.tab==='file'&&/\.pdf$/i.test(row.file_name||'')){
   const popup=global.open('about:blank','_blank');if(!popup)return say('팝업을 허용해주세요.',true);const t=ticket();try{const blob=S.blob||await repo().file(row);if(!valid(t)){popup.close();return;}const href=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));popup.location.replace(href);setTimeout(()=>URL.revokeObjectURL(href),300000);}catch(error){popup.close();if(valid(t))say(error.message,true);}return;
  }
  if(!clean(d.body))return say('본문을 입력하거나 원본 파일을 내려받아 인쇄해주세요.',true);
  const popup=global.open('about:blank','_blank');if(!popup)return say('팝업을 허용해주세요.',true);
  popup.document.open();popup.addEventListener('load',()=>{popup.focus();popup.print();},{once:true});popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>body{font-family:"Malgun Gothic",sans-serif;color:#172d43;font-size:11pt;line-height:1.8}h1{font-size:20pt}h3{break-after:avoid}p{margin:4px 0;white-space:pre-wrap}.meta{font-size:9pt;color:#5b7080;border-bottom:1px solid #9aafbb;padding-bottom:12px}@page{size:A4;margin:18mm}</style></head><body><h1>${esc(d.title)}</h1><div class="meta">${esc([d.docNo,'개정 '+d.version,d.effectiveDate&&'시행 '+d.effectiveDate].filter(Boolean).join(' · '))}</div>${bodyHtml(d.body)}</body></html>`);popup.document.close();
 }
 const navigation={capture(){return {key:S.selected||'root',data:{selected:S.selected,query:S.query,domain:S.domain,status:S.status,tab:S.tab,font:S.font}};},canLeave:discard,async restore(value){const state=value?.data||value||{};await open();if(!S.ready)return;S.selected=clean(state.selected);S.query=clean(state.query);S.domain=M().DOMAINS.includes(state.domain)?state.domain:'';S.status='all';S.tab=['body','file','history'].includes(state.tab)?state.tab:'file';S.font=Math.max(12,Math.min(24,Number(state.font)||16));paintFiltered();}};
 document.addEventListener('click',event=>{if(event.target.closest('[data-official-test-methods-open]')){event.preventDefault();go();}});
 document.addEventListener('df:menu-permissions-changed',()=>{const me=session();if(me.userId!==S.actor||me.client!==S.client||!can('view')){close(true);S.rows=[];S.selected='';const host=$('dfOtmReader');if(host)host.replaceChildren();const list=$('dfOtmList');if(list)list.replaceChildren();}else updateActions();});
 global.addEventListener('beforeunload',event=>{if(S.opened&&(S.dirty||S.busy)){event.preventDefault();event.returnValue='';}});
 global.DF_OFFICIAL_TEST_METHODS=Object.freeze({open,close,confirmDiscard:discard,navigation,state:S,_test:{bodyHtml,extractText,filtered,uploadFiles,removeAll,renderReader,renderList,refresh}});
})(window,document);
