/* 공정시험법 전용 목록·본문. 기존 품질문서와 결재 자료는 읽거나 수정하지 않습니다. */
(function(global,document){
 'use strict';
 const ROUTE='official-test-methods',VIEW='dfViewOfficialTestMethods';
 const S={rows:[],selected:'',query:'',domain:'',status:'active',tab:'body',font:16,ready:false,loading:false,opened:false,actor:'',client:null,epoch:0,paint:0,urls:[],viewer:null,blob:null,dialog:null,dirty:false,busy:false,flight:null};
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
 function filtered(){const q=S.query.toLocaleLowerCase('ko');return S.rows.filter(row=>{const d=decoded(row);return (!S.domain||d.domain===S.domain)&&(S.status==='all'||d.status===S.status)&&(!q||[d.docNo,d.title,d.body,d.note].some(value=>String(value).toLocaleLowerCase('ko').includes(q)));}).sort((a,b)=>String(a.doc_no||'').localeCompare(String(b.doc_no||''),'ko',{numeric:true})||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));}
 function remember(){global.DF_NAVIGATION_GUARD?.changed?.({replace:true});}
 function init(){
  const host=$('dfOfficialTestMethodsHost');if(!host||host.dataset.ready)return;
  host.dataset.ready='1';host.className='df-otm';
  host.innerHTML=`<header class="df-otm-head"><div class="df-otm-heading"><button type="button" class="company-btn secondary" data-otm-back>품질문서</button><h1>공정시험법</h1></div><div class="df-otm-head-actions"><button type="button" class="company-btn secondary" data-otm-refresh>새로고침</button><button type="button" class="company-btn primary" data-otm-new>문서 등록</button></div></header><div id="dfOtmMessage" class="df-otm-message" role="status" aria-live="polite" hidden></div><div class="df-otm-layout"><aside class="df-otm-sidebar"><div class="df-otm-search"><input id="dfOtmSearch" type="search" aria-label="공정시험법 검색" placeholder="시험법 번호 · 문서명 · 본문 검색"></div><div class="df-otm-filters"><select id="dfOtmDomain" aria-label="분야"><option value="">전체 분야</option>${M().DOMAINS.map(value=>`<option>${esc(value)}</option>`).join('')}</select><select id="dfOtmStatus" aria-label="문서 상태"><option value="active">사용중</option><option value="all">전체 상태</option><option value="draft">작성중</option><option value="obsolete">이전본</option></select></div><div id="dfOtmCount" class="df-otm-list-count"></div><nav id="dfOtmList" class="df-otm-list" aria-label="공정시험법 목록"></nav></aside><main id="dfOtmReader" class="df-otm-reader" aria-live="polite"></main></div>`;
  host.addEventListener('click',event=>{
   const b=event.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-otm-back')){if(!close())return;if(!global.DF_NAVIGATION_GUARD?.backTo('quality','root'))global.v62ShowOnly?.('quality',{replace:true});}
   else if(b.hasAttribute('data-otm-refresh'))refresh();
   else if(b.hasAttribute('data-otm-new'))editor();
   else if(b.dataset.otmId){S.selected=b.dataset.otmId;S.tab='body';renderList();renderReader();remember();}
   else if(b.dataset.otmTab){S.tab=b.dataset.otmTab;renderReader();remember();}
   else if(b.hasAttribute('data-otm-edit'))editor(selected());
   else if(b.hasAttribute('data-otm-replace'))editor(selected(),true);
   else if(b.hasAttribute('data-otm-delete'))removeSelected();
   else if(b.hasAttribute('data-otm-download'))download(selected());
   else if(b.hasAttribute('data-otm-print'))printSelected();
   else if(b.dataset.otmHistory!==undefined)previewHistory(Number(b.dataset.otmHistory));
   else if(b.dataset.otmHistoryDownload!==undefined){const row=selected(),history=decoded(row).history[Number(b.dataset.otmHistoryDownload)];if(history)download({...row,...history});}
   else if(b.dataset.otmFont){S.font=Math.max(12,Math.min(24,S.font+Number(b.dataset.otmFont)));const article=$('dfOtmReader')?.querySelector('.df-otm-document');article?.style.setProperty('--df-otm-body-size',S.font+'px');}
  });
  $('dfOtmSearch').addEventListener('input',event=>{S.query=event.target.value.trim();paintFiltered();});
  $('dfOtmDomain').addEventListener('change',event=>{S.domain=event.target.value;paintFiltered();});
  $('dfOtmStatus').addEventListener('change',event=>{S.status=event.target.value;paintFiltered();});
 }
 function updateActions(){const host=$('dfOfficialTestMethodsHost');if(!host)return;host.querySelector('[data-otm-new]').hidden=!can('create');host.querySelector('[data-otm-new]').disabled=!S.ready||S.loading;host.querySelector('[data-otm-refresh]').disabled=S.loading;}
 function paintFiltered(){const list=filtered();if(!list.some(row=>String(row.id)===S.selected)){S.selected=String(list[0]?.id||'');S.tab='body';}renderList();renderReader();remember();}
 function renderList(){
  $('dfOtmSearch').value=S.query;$('dfOtmDomain').value=S.domain;$('dfOtmStatus').value=S.status;
  const rows=filtered();$('dfOtmCount').textContent=`${rows.length}개 문서 · 전체 ${S.rows.length}개`;
  $('dfOtmList').innerHTML=rows.map(row=>{const d=decoded(row);return `<button type="button" class="df-otm-entry ${String(row.id)===S.selected?'selected':''}" data-otm-id="${esc(row.id)}" aria-current="${String(row.id)===S.selected?'true':'false'}"><span class="df-otm-entry-code">${esc(d.docNo||'번호 미등록')}</span><strong>${esc(d.title)}</strong><span class="df-otm-entry-meta">${esc(d.domain)}${d.effectiveDate?' · '+esc(d.effectiveDate):''} · ${esc(statusName(d.status))}</span></button>`;}).join('')||`<div class="df-otm-empty">${S.loading?'문서를 불러오는 중입니다.':S.rows.length?'검색 결과가 없습니다.':'등록된 공정시험법이 없습니다.'}</div>`;
 }
 function bodyHtml(body){
  const paragraphs=String(body||'').replace(/\r\n?/g,'\n').split('\n');let heading=0;
  return paragraphs.map(line=>{const text=line.trim();if(!text)return '<p aria-hidden="true">&nbsp;</p>';if(/^(?:제\s*\d+\s*[장절조]|\d+(?:\.\d+){0,3}[.)]?\s+|[가-하][.)]\s+)/.test(text)&&text.length<100)return `<h3 class="df-otm-body-heading" id="dfOtmSection${++heading}">${esc(text)}</h3>`;return `<p>${esc(line)}</p>`;}).join('');
 }
 function renderReader(){
  disposePreview();const host=$('dfOtmReader'),row=selected();if(!host)return;
  if(!row){host.innerHTML='<div class="df-otm-empty">'+(S.ready?'왼쪽에서 문서를 선택하거나 새 문서를 등록하세요.':'공정시험법을 불러오는 중입니다.')+'</div>';return;}
  const d=decoded(row);if(S.tab==='body'&&!clean(d.body)&&row.storage_path)S.tab='file';
  const fileAllowed=!!row.storage_path,meta=[d.docNo,d.version&&'개정 '+d.version,d.effectiveDate&&'시행 '+d.effectiveDate,statusName(d.status)].filter(Boolean);
  host.innerHTML=`<article class="df-otm-document" style="--df-otm-body-size:${S.font}px"><header class="df-otm-document-head"><div class="df-otm-doc-kicker">${esc(d.domain)} · 공정시험법</div><h2>${esc(d.title)}</h2><div class="df-otm-doc-meta">${meta.map(esc).join(' · ')}</div>${d.sourceUrl&&/^https?:\/\//i.test(d.sourceUrl)?`<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">출처 확인</a>`:''}</header><nav class="df-otm-tabs" aria-label="문서 보기"><button type="button" data-otm-tab="body" aria-selected="${S.tab==='body'}">본문</button><button type="button" data-otm-tab="file" aria-selected="${S.tab==='file'}" ${fileAllowed?'':'disabled'}>원본 파일</button><button type="button" data-otm-tab="history" aria-selected="${S.tab==='history'}">이전 파일 ${d.history.length}</button></nav><div class="df-otm-tools"><div><button type="button" class="company-btn secondary" data-otm-font="-1" aria-label="본문 글자 줄이기">가−</button><button type="button" class="company-btn secondary" data-otm-font="1" aria-label="본문 글자 키우기">가＋</button></div><div>${fileAllowed?'<button type="button" class="company-btn secondary" data-otm-download>원본 다운로드</button>':''}<button type="button" class="company-btn secondary" data-otm-print>인쇄 / PDF</button>${can('update')?'<button type="button" class="company-btn secondary" data-otm-edit>수정</button>':''}${can('update')&&can('upload')?'<button type="button" class="company-btn secondary" data-otm-replace>파일 교체</button>':''}${can('delete')?'<button type="button" class="company-btn secondary danger" data-otm-delete>삭제</button>':''}</div></div><section class="df-otm-content" id="dfOtmContent"></section>${d.note?`<details class="df-otm-note"><summary>비고</summary><p>${esc(d.note).replace(/\n/g,'<br>')}</p></details>`:''}</article>`;
  const content=$('dfOtmContent');
  if(S.tab==='body')content.innerHTML=d.body?`<div class="df-otm-body-text">${bodyHtml(d.body)}</div>`:'<div class="df-otm-empty">본문을 직접 입력하거나 수정 화면에서 파일의 본문을 가져올 수 있습니다.</div>';
  else if(S.tab==='file')showFile(row,content);
  else content.innerHTML=d.history.length?`<ul class="df-otm-history">${d.history.slice().reverse().map((file,index)=>`<li><div><strong>${esc(file.file_name)}</strong><span>개정 ${esc(file.version||'0')} · ${esc(String(file.replaced_at||'').slice(0,10))}</span></div><div><button type="button" class="company-btn secondary" data-otm-history="${d.history.length-1-index}">보기</button><button type="button" class="company-btn secondary" data-otm-history-download="${d.history.length-1-index}">다운로드</button></div></li>`).join('')}</ul>`:'<div class="df-otm-empty">교체한 이전 파일이 없습니다.</div>';
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
  init();if(S.actor!==me.userId||S.client!==me.client){close(true);S.actor=me.userId;S.client=me.client;S.rows=[];S.selected='';S.query='';S.domain='';S.status='active';}
  S.opened=true;await refresh();
 }
 function go(){if(global.v62ShowOnly?.(ROUTE)===false)return;if(!global.DF_NAVIGATION_GUARD)open();}
 function close(force=false){if(!force&&!discard())return false;S.opened=false;S.epoch++;S.loading=false;S.ready=false;S.flight=null;disposePreview();closeEditor(true);return true;}
 function discard(){return !S.busy&&(!S.dirty||global.confirm('저장하지 않은 문서 입력을 닫을까요?'));}
 function closeEditor(force=false){if(!force&&!discard())return false;const dialog=S.dialog;S.dialog=null;S.dirty=false;S.busy=false;if(dialog){dialog.close?.();dialog.remove();}return true;}
 function editor(row=null,replace=false){
  if(!S.ready||S.busy||!can(row?'update':'create'))return;if(S.dialog&&!closeEditor())return;
  const initial=row?decoded(row):{title:'',docNo:'',version:'0',status:'active',domain:S.domain||'대기',effectiveDate:'',sourceUrl:'',body:'',note:''};let chosen=null;
  const dialog=document.createElement('dialog');dialog.className='df-otm-editor';dialog.setAttribute('aria-labelledby','dfOtmEditorTitle');
  dialog.innerHTML=`<form><header><h2 id="dfOtmEditorTitle">${row?'공정시험법 수정':'공정시험법 등록'}</h2><button type="button" class="company-btn secondary" data-otm-editor-close aria-label="닫기">닫기</button></header><div class="df-otm-editor-grid"><label>시험법 번호<input name="docNo" maxlength="100" placeholder="예: ES 01114.c" value="${esc(initial.docNo)}"></label><label>분야<select name="domain">${M().DOMAINS.map(v=>`<option ${v===initial.domain?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>개정번호<input name="version" maxlength="80" value="${esc(initial.version)}"></label><label>시행일<input name="effectiveDate" type="date" value="${esc(initial.effectiveDate)}"></label><label class="wide">문서명<input name="title" required maxlength="300" value="${esc(initial.title)}"></label><label>상태<select name="status">${['active','draft','obsolete'].map(v=>`<option value="${v}" ${v===initial.status?'selected':''}>${statusName(v)}</option>`).join('')}</select></label><label>출처 주소<input name="sourceUrl" type="url" maxlength="2048" placeholder="https://www.law.go.kr/..." value="${esc(initial.sourceUrl)}"></label><div class="df-otm-dropzone wide" ${can('upload')?'':'hidden'} tabindex="0" role="button" aria-label="원본 파일 선택 또는 끌어놓기"><strong>원본 파일 선택 · 끌어놓기</strong><span id="dfOtmChosenFile">${esc(row?.file_name||'PDF · HWP · HWPX · DOCX · TXT · 이미지 / 최대 50MB')}</span><input type="file" id="dfOtmEditorFile" data-df-drop="off" accept=".pdf,.hwp,.hwpx,.docx,.txt,.png,.jpg,.jpeg" hidden><button type="button" class="company-btn secondary" data-otm-extract>파일에서 본문 가져오기</button></div><label class="wide">본문<textarea name="body" rows="18" placeholder="본문을 직접 입력하거나 파일에서 가져올 수 있습니다.">${esc(initial.body)}</textarea></label><label class="wide">비고<textarea name="note" rows="2" maxlength="4000">${esc(initial.note)}</textarea></label></div><footer class="df-otm-editor-actions"><span class="df-otm-form-status" role="status" aria-live="polite"></span><button type="button" class="company-btn secondary" data-otm-editor-close>취소</button><button type="submit" class="company-btn primary">저장</button></footer></form>`;
  S.dialog=dialog;S.dirty=false;document.body.append(dialog);const form=dialog.querySelector('form'),status=dialog.querySelector('.df-otm-form-status'),input=dialog.querySelector('input[type=file]'),zone=dialog.querySelector('.df-otm-dropzone');
  const report=(text,bad=false)=>{status.textContent=text||'';status.classList.toggle('bad',bad);};
  function choose(file){try{if(!file)return;M().validateFile(file);chosen=file;dialog.querySelector('#dfOtmChosenFile').textContent=file.name;if(!form.elements.title.value)form.elements.title.value=file.name.replace(/\.[^.]+$/,'');if(!form.elements.docNo.value){const match=file.name.match(/ES\s*\d+(?:\.\d+)?[a-z]?/i);if(match)form.elements.docNo.value=match[0];}S.dirty=true;report('');}catch(error){report(error.message,true);}}
  dialog.addEventListener('input',()=>{S.dirty=true;});dialog.addEventListener('change',()=>{S.dirty=true;});
  dialog.querySelectorAll('[data-otm-editor-close]').forEach(b=>b.onclick=()=>closeEditor());dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
  zone.addEventListener('click',event=>{if(event.target!==input&&!event.target.closest('[data-otm-extract]')&&!S.busy)input.click();});zone.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target===zone){event.preventDefault();input.click();}});
  zone.addEventListener('dragover',event=>{event.preventDefault();if(can('upload')&&!S.busy)zone.classList.add('is-dragging');});zone.addEventListener('dragleave',()=>zone.classList.remove('is-dragging'));zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('is-dragging');if(S.busy||!can('upload'))return;if(event.dataTransfer.files.length!==1)return report('파일은 하나씩 선택해주세요.',true);choose(event.dataTransfer.files[0]);});input.onchange=()=>{choose(input.files[0]);input.value='';};
  dialog.querySelector('[data-otm-extract]').onclick=async event=>{
   event.stopPropagation();if(S.busy)return;const t=ticket();S.busy=true;const controls=Array.from(dialog.querySelectorAll('button,input,select,textarea')),disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);report('파일 본문을 읽는 중입니다.');
   try{const file=chosen||(row?await repo().file(row):null);if(!file)throw Error('먼저 원본 파일을 선택해주세요.');const text=await extractText(file,chosen?.name||row.file_name);if(!valid(t)||S.dialog!==dialog)return;if(!text.trim())throw Error('가져올 본문이 없습니다.');if(new TextEncoder().encode(text).length>1024*1024)throw Error('본문이 길어 원본 파일 보기로 이용해주세요.');form.elements.body.value=text;S.dirty=true;report('본문을 가져왔습니다. 내용을 확인한 뒤 저장해주세요.');}catch(error){if(valid(t)&&S.dialog===dialog)report(error.message,true);}finally{if(S.dialog===dialog){S.busy=false;controls.forEach((el,i)=>el.disabled=disabled[i]);}}
  };
  form.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')event.preventDefault();});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(S.busy)return;const t=ticket(),values=Object.fromEntries(new FormData(form).entries());S.busy=true;const controls=Array.from(form.querySelectorAll('button,input,select,textarea')),disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);report('저장 중입니다.');
   try{if(!row&&!chosen&&!clean(values.body))throw Error('원본 파일을 선택하거나 본문을 입력해주세요.');const saved=await repo().save({row,values,file:chosen});if(!valid(t)||S.dialog!==dialog)return;S.rows=S.rows.filter(r=>r.id!==saved.id).concat(saved);S.selected=String(saved.id);S.status='all';if(!filtered().some(r=>String(r.id)===S.selected)){S.query='';S.domain='';}S.tab='body';S.dirty=false;closeEditor(true);renderList();renderReader();say('공정시험법을 저장했습니다.');remember();}catch(error){if(valid(t)&&S.dialog===dialog)report([error.message,error.cleanupWarning].filter(Boolean).join(' '),true);}finally{if(S.dialog===dialog){S.busy=false;controls.forEach((el,i)=>el.disabled=disabled[i]);}}
  });
  dialog.showModal();if(replace)input.click();else form.elements.title.focus();
 }
 async function removeSelected(){
  const row=selected();if(!row||!S.ready||S.loading||S.busy||!can('delete')||!global.confirm('“'+row.title+'” 문서와 보관된 이전 파일을 삭제할까요? 삭제 후 되돌릴 수 없습니다.'))return;
  const t=ticket();S.busy=true;try{const result=await repo().remove(row);if(!valid(t))return;S.rows=S.rows.filter(r=>r.id!==row.id);S.selected='';paintFiltered();say(result.cleanupWarning||'문서를 삭제했습니다.',!!result.cleanupWarning);}catch(error){if(valid(t))say(error.message,true);}finally{S.busy=false;}
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
 const navigation={capture(){return {key:S.selected||'root',data:{selected:S.selected,query:S.query,domain:S.domain,status:S.status,tab:S.tab,font:S.font}};},canLeave:discard,async restore(value){const state=value?.data||value||{};await open();if(!S.ready)return;S.selected=clean(state.selected);S.query=clean(state.query);S.domain=M().DOMAINS.includes(state.domain)?state.domain:'';S.status=['all','active','draft','obsolete'].includes(state.status)?state.status:'active';S.tab=['body','file','history'].includes(state.tab)?state.tab:'body';S.font=Math.max(12,Math.min(24,Number(state.font)||16));paintFiltered();}};
 document.addEventListener('click',event=>{if(event.target.closest('[data-official-test-methods-open]')){event.preventDefault();go();}});
 document.addEventListener('df:menu-permissions-changed',()=>{const me=session();if(me.userId!==S.actor||me.client!==S.client||!can('view')){close(true);S.rows=[];S.selected='';const host=$('dfOtmReader');if(host)host.replaceChildren();const list=$('dfOtmList');if(list)list.replaceChildren();}else updateActions();});
 global.addEventListener('beforeunload',event=>{if(S.opened&&(S.dirty||S.busy)){event.preventDefault();event.returnValue='';}});
 global.DF_OFFICIAL_TEST_METHODS=Object.freeze({open,close,confirmDiscard:discard,navigation,state:S,_test:{bodyHtml,extractText,filtered,editor,renderReader,renderList,refresh}});
})(window,document);
