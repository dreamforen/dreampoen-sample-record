/* Beta 3.50: private attachments and local previews, scoped to bid_records. */
(function(){
 'use strict';
 const BUCKET='bid-attachments',MAX=50*1024*1024,CATS={notice:'입찰공고문',eligibility:'입찰자격',cost:'산출내역',other:'기타자료'},sessions=new WeakMap();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uid=()=>{try{return dfCloudUser?.id||'';}catch(_){return '';}};
 const db=()=>{try{return dfSupabase;}catch(_){return null;}};
 const can=action=>{try{return dfMenuCan('bid',action,dfCloudProfile?.role==='admin');}catch(_){return false;}};
 let latestEditor=null;
 const active=a=>Array.isArray(a)?a.filter(f=>f&&typeof f.id==='string'&&!f.deleted_at):[];
 const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.ceil(n/1024)+' KB';
 function assertActor(s){if(!s||!s.actor||uid()!==s.actor)throw Error('로그인 계정이 바뀌었습니다. 다시 열어주세요.');}
 function assertEdit(s){assertActor(s);if(!can(s.persisted?'update':'create')||!can('upload'))throw Error('입찰 작성·수정 및 파일 업로드 권한을 확인해주세요.');}
 function message(s,text){if(s.box.isConnected)s.box.querySelector('[data-files-message]').textContent=text;}
 function merged(s){return s.existing.concat(s.pending.map(e=>e.meta)).filter(f=>!f.deleted_at&&!s.removed.has(f.id));}
 function draw(s){
  if(sessions.get(s.modal)!==s||!s.box.isConnected)return;
  const files=merged(s).filter(f=>!f.preview_for),edit=can(s.persisted?'update':'create')&&can('upload');
  s.box.querySelector('[data-bid-files-list]').innerHTML=Object.entries(CATS).map(([key,label])=>{
   const rows=files.filter(f=>f.category===key);return `<section class="df-bid-file-category"><h4>${label}<span>${rows.length}</span></h4>${rows.length?rows.map(f=>{
    const pending=s.pending.find(e=>e.meta.id===f.id),pdf=merged(s).some(x=>x.preview_for===f.id),ext=(f.file_name||'').split('.').pop().toLowerCase();
    return `<div class="df-bid-file-row"><div><strong>${esc(f.file_name)}</strong><small>${size(f.file_size)}${pending?' · 저장 대기':''}${pdf?' · PDF 미리보기':''}</small></div><div class="df-bid-file-actions"><button type="button" data-file-preview="${esc(f.id)}">미리보기</button><button type="button" data-file-download="${esc(f.id)}">다운로드</button>${edit?`<button type="button" data-file-remove="${esc(f.id)}">삭제</button>${['hwp','doc','hwpx','docx','xls','xlsx','xlsm','csv'].includes(ext)?`<button type="button" data-file-pdf="${esc(f.id)}">PDF 미리보기 등록</button>`:''}`:''}</div></div>`;
   }).join(''):'<p>등록된 자료가 없습니다.</p>'}</section>`;
  }).join('');
  s.box.querySelector('[data-files-drop]').hidden=!edit;s.box.querySelector('[data-files-category]').disabled=!edit||s.busy||s.saving;
  s.box.querySelectorAll('button,input').forEach(el=>el.disabled=s.busy||s.saving);
 }
 function add(s,files,previewFor=null){
  try{assertEdit(s);if(s.busy||s.saving)return;
   if(previewFor&&(files.length!==1||!files[0].name.toLowerCase().endsWith('.pdf')))throw Error('미리보기용 PDF 파일 한 개를 선택해주세요.');
   for(const file of files){
    if(!file.size||file.size>MAX)throw Error(file.name+': 파일당 50MB 이하로 등록해주세요.');
    if(s.existing.length+s.pending.length>=200)throw Error('한 입찰에 첨부자료는 이력을 포함해 200개까지 보관할 수 있습니다.');
    const parent=previewFor&&merged(s).find(f=>f.id===previewFor);if(previewFor&&!parent)throw Error('원본 파일을 먼저 확인해주세요.');
    const category=parent?.category||s.box.querySelector('[data-files-category]').value;
    if(s.pending.some(e=>!s.removed.has(e.meta.id)&&e.meta.category===category&&e.file.name===file.name&&e.file.size===file.size&&e.file.lastModified===file.lastModified&&e.meta.preview_for===(previewFor||undefined)))continue;
    if(previewFor)for(const previous of merged(s).filter(f=>f.preview_for===previewFor))s.removed.add(previous.id);
    const meta={id:crypto.randomUUID(),category,file_name:file.name.slice(0,500),file_size:file.size,mime_type:file.type||'',uploaded_by:s.actor,uploaded_at:new Date().toISOString()};
    if(previewFor)meta.preview_for=previewFor;s.pending.push({file,meta,uploaded:false});
   }
   message(s,'선택한 파일은 저장할 때 함께 업로드됩니다.');draw(s);
  }catch(e){message(s,e.message);draw(s);}
 }
 function mount(modal,record){
  const form=modal.querySelector('.df-bid-form');if(!form)return;
  const box=document.createElement('fieldset');box.className='df-bid-files';box.innerHTML=`<legend>첨부자료</legend><div class="df-bid-files-toolbar"><label>자료 구분<select data-files-category>${Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><small>공고문·한글·엑셀·사진 등 · 파일당 50MB</small></div><div data-files-drop class="df-bid-files-drop" tabindex="0" role="button" aria-label="입찰 첨부파일 선택 또는 끌어놓기"><strong>파일을 끌어놓거나 클릭하여 선택</strong><small>여러 파일을 한 번에 추가할 수 있습니다.</small></div><input type="file" multiple data-files-input data-df-drop="off" hidden><input type="file" accept=".pdf,application/pdf" data-files-pdf-input data-df-drop="off" hidden><p data-files-message role="status"></p><div data-bid-files-list></div>`;
  form.insertBefore(box,form.querySelector('#bidRecommend'));
  const s={modal,box,record,id:record.id||crypto.randomUUID(),persisted:!!record.id,actor:uid(),existing:structuredClone(record.attachments||[]),pending:[],removed:new Set(),busy:false,saving:false};sessions.set(modal,s);latestEditor=s;
  const input=box.querySelector('[data-files-input]'),drop=box.querySelector('[data-files-drop]'),pdfInput=box.querySelector('[data-files-pdf-input]');let pdfFor=null;
  input.onchange=()=>{add(s,[...input.files]);input.value='';};pdfInput.onchange=async()=>{const target=pdfFor,selected=[...pdfInput.files];add(s,selected,target);pdfInput.value='';pdfFor=null;if(selected.length&&previewTarget?.s===s&&previewTarget.original.id===target&&merged(s).some(f=>f.preview_for===target))await preview(s,previewTarget.original);};s.pickPdf=id=>{assertEdit(s);if(s.busy||s.saving)return;pdfFor=id;pdfInput.click();};
  drop.onclick=()=>{if(!s.busy&&!s.saving)input.click();};drop.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();if(!s.busy&&!s.saving)input.click();}};
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();if(!s.busy)drop.classList.add('dragging');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();drop.classList.remove('dragging');add(s,[...e.dataTransfer.files]);});
  box.onclick=async e=>{const b=e.target.closest('[data-file-preview],[data-file-download],[data-file-remove],[data-file-pdf]');if(!b||s.busy||s.saving)return;
   const id=b.dataset.filePreview||b.dataset.fileDownload||b.dataset.fileRemove||b.dataset.filePdf,f=merged(s).find(f=>f.id===id);if(!f)return;
   try{assertActor(s);if(b.dataset.fileRemove){assertEdit(s);s.removed.add(id);for(const child of merged(s).filter(x=>x.preview_for===id))s.removed.add(child.id);message(s,'저장하면 첨부목록에서 삭제됩니다.');draw(s);return;}
    if(b.dataset.filePdf){s.pickPdf(id);return;}
    if(b.dataset.filePreview){await preview(s,f);return;}
    await download(await blobFor(s,f),f.file_name);
   }catch(error){message(s,error.message);}
  };
  draw(s);return s;
 }
 async function upload(s){
  assertEdit(s);
  for(const e of s.pending.filter(e=>!s.removed.has(e.meta.id))){
   assertActor(s);if(e.uploaded)continue;
   const ext=(/\.[a-z0-9]{1,10}$/i.exec(e.file.name)||[''])[0].toLowerCase();e.meta.storage_path=s.actor+'/'+s.id+'/'+e.meta.id+ext;
   message(s,e.meta.file_name+' 업로드 중…');
   const r=await db().storage.from(BUCKET).upload(e.meta.storage_path,e.file,{contentType:e.file.type||'application/octet-stream',upsert:false});
   if(r.error&&!/duplicate|already exists|409/i.test(r.error.message||''))throw Error(e.meta.file_name+' 업로드 실패: '+r.error.message);
   assertActor(s);e.uploaded=true;
  }
 }
 async function initial(s){
  if(!s)return [];assertActor(s);if(!s.pending.length)return [];
  s.busy=true;draw(s);try{await upload(s);return s.pending.filter(e=>!s.removed.has(e.meta.id)).map(e=>structuredClone(e.meta));}finally{s.busy=false;draw(s);}
 }
 async function save(s,id,isNew=false){
  if(!s)return;assertActor(s);s.id=id;
  if(isNew){s.persisted=true;s.existing=s.pending.filter(e=>!s.removed.has(e.meta.id)).map(e=>structuredClone(e.meta));s.record.attachments=structuredClone(s.existing);s.pending=[];s.removed.clear();draw(s);return;}
  if(!s.pending.some(e=>!s.removed.has(e.meta.id))&&!s.removed.size)return;
  s.busy=true;draw(s);
  try{await upload(s);
   for(let attempt=0;attempt<3;attempt++){
    assertActor(s);const q=await db().from('bid_records').select('id,attachments,updated_at').eq('id',id).single();if(q.error)throw q.error;
    const attachments=structuredClone(q.data.attachments||[]),now=new Date().toISOString();
    for(const f of attachments)if(s.removed.has(f.id))f.deleted_at=now;
    for(const e of s.pending)if(!s.removed.has(e.meta.id)&&!attachments.some(f=>f.id===e.meta.id))attachments.push(structuredClone(e.meta));
    const r=await db().from('bid_records').update({attachments,updated_at:now,updated_by:s.actor}).eq('id',id).eq('updated_at',q.data.updated_at).select('id,attachments').maybeSingle();
    if(r.error)throw r.error;if(!r.data)continue;
    assertActor(s);s.existing=r.data.attachments;s.record.attachments=structuredClone(s.existing);s.pending=[];s.removed.clear();message(s,'첨부자료를 저장했습니다.');return;
   }
   throw Error('다른 사용자가 첨부자료를 수정했습니다. 다시 저장해주세요.');
  }catch(e){message(s,e.message);throw Error('입찰 내용은 저장됐지만 첨부자료 저장은 완료되지 않았습니다. '+e.message+' 다시 저장하면 남은 파일부터 이어집니다.');}
  finally{s.busy=false;draw(s);}
 }
 async function blobFor(s,f){
  assertActor(s);const pending=s.pending.find(e=>e.meta.id===f.id);if(pending)return pending.file;
  const r=await db().storage.from(BUCKET).download(f.storage_path);if(r.error)throw r.error;assertActor(s);return r.data;
 }
 async function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
 let previewClose=null,previewTarget=null;
 async function preview(s,original,contentOnly=false){
  assertActor(s);if(previewClose)previewClose();const pdf=merged(s).find(f=>f.preview_for===original.id),f=pdf||original;
  const modal=document.createElement('div');modal.className='company-modal-backdrop';modal.id='dfBidFilePreview';modal.innerHTML=`<div class="company-modal df-bid-preview-modal" role="dialog" aria-modal="true" aria-labelledby="dfBidFilePreviewTitle"><div class="company-modal-head"><div><h2 id="dfBidFilePreviewTitle">${esc(original.file_name)}</h2><small>${pdf?'등록된 PDF 미리보기':'첨부파일 미리보기'}</small></div><button type="button" class="company-modal-close" aria-label="미리보기 닫기">×</button></div><div class="df-bid-preview-tools"><button type="button" data-preview-download>원본 다운로드</button></div><div data-preview-body role="status">미리보기를 불러오는 중입니다.</div></div>`;
  const opener=document.activeElement;modal.style.zIndex=String(Math.max(140001,(parseInt(getComputedStyle(s.modal).zIndex,10)||0)+1));document.body.append(modal);modal.hidden=false;modal.style.display='flex';const body=modal.querySelector('[data-preview-body]');let closed=false,urls=[],rendered=null;
  const close=()=>{closed=true;rendered?.destroy?.();urls.forEach(u=>URL.revokeObjectURL(u));modal.remove();if(opener?.isConnected)opener.focus();document.removeEventListener('keydown',keydown);if(previewClose===close){previewClose=null;previewTarget=null;}};
  const keydown=e=>{if(e.key==='Escape'){e.stopPropagation();close();}};previewClose=close;previewTarget={s,original};document.addEventListener('keydown',keydown);modal.querySelector('.company-modal-close').onclick=close;modal.querySelector('.company-modal-close').focus();
  modal.querySelector('[data-preview-download]').onclick=async()=>{try{await download(await blobFor(s,original),original.file_name);}catch(e){if(!closed)body.textContent=e.message;}};
  const extOriginal=(original.file_name||'').split('.').pop().toLowerCase(),office=['hwp','hwpx','doc','docx','xls','xlsx','xlsm','csv'].includes(extOriginal);
  if(office&&!pdf){
   const tools=modal.querySelector('.df-bid-preview-tools'),toggle=document.createElement('button');toggle.type='button';toggle.textContent=contentOnly?'양식 미리보기 안내':'내용만 보기';toggle.onclick=()=>preview(s,original,!contentOnly);tools.append(toggle);
   const editable=can(s.persisted?'update':'create')&&can('upload');
   if(editable){const upload=document.createElement('button');upload.type='button';upload.textContent='PDF 미리보기 등록';upload.onclick=()=>{try{s.pickPdf(original.id);}catch(e){body.textContent=e.message;}};tools.append(upload);}
   if(!contentOnly){body.innerHTML=`<section class="df-bid-preview-guide"><span>원본 양식 미리보기</span><h3>PDF를 등록하면 문서 양식 그대로 볼 수 있습니다.</h3><p>한글·엑셀의 표, 사진, 글꼴과 페이지 배치를 웹에서 동일하게 재현하기 어렵습니다.</p><ol><li>한글·엑셀에서 문서를 열고 <strong>PDF로 저장</strong>해주세요.</li><li>${editable?'위의 <strong>PDF 미리보기 등록</strong>으로 해당 PDF를 선택해주세요.':'입찰 수정·업로드 권한이 있는 직원에게 PDF 등록을 요청해주세요.'}</li><li>입찰 창에서 <strong>저장</strong>하면 다음 접속에서도 PDF로 미리봅니다.</li></ol><p>원본 파일은 그대로 보관되며, PDF로 자동 변환하는 기능은 제공하지 않습니다.</p><small>‘내용만 보기’는 간이 보기이며 원본 양식과 다릅니다.</small></section>`;return;}
   modal.querySelector('.company-modal-head small').textContent='내용만 보기 · 원본 양식과 다릅니다';
  }
  const url=blob=>{const u=URL.createObjectURL(blob);urls.push(u);return u;};
  try{
   const blob=await blobFor(s,f);if(closed)return;assertActor(s);const ext=f.file_name.split('.').pop().toLowerCase(),bytes=new Uint8Array(await blob.slice(0,1024).arrayBuffer());if(closed)return;assertActor(s);body.textContent='';
   if(ext==='pdf'){
    if(!new TextDecoder().decode(bytes).includes('%PDF-'))throw Error('PDF 파일 형식을 확인해주세요.');
    const frame=document.createElement('iframe');frame.title=f.file_name;frame.src=url(new Blob([blob],{type:'application/pdf'}));body.append(frame);
   }else if(/^(png|jpe?g|gif|webp|bmp)$/.test(ext)){
    const sig=String.fromCharCode(...bytes.slice(0,12)),mime=bytes[0]===137&&sig.slice(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':sig.startsWith('GIF8')?'image/gif':sig.startsWith('RIFF')&&sig.slice(8)==='WEBP'?'image/webp':sig.startsWith('BM')?'image/bmp':'';
    if(!mime)throw Error('이미지 파일 형식을 확인해주세요.');const img=document.createElement('img');img.alt=original.file_name;img.src=url(new Blob([blob],{type:mime}));body.append(img);
   }else if(ext==='hwpx'){
    if(!window.DF_HWPX_PREVIEW)throw Error('한글 미리보기 구성요소를 불러오지 못했습니다. 새로고침해주세요.');
    rendered=await DF_HWPX_PREVIEW.render(blob,{name:f.file_name});if(closed){rendered.destroy?.();return;}body.append(rendered.element);
   }else if(/^(xlsx?|xlsm|csv)$/.test(ext)){
    if(!window.XLSX)throw Error('엑셀 미리보기 구성요소를 불러오지 못했습니다.');
    const wb=XLSX.read(new Uint8Array(await blob.arrayBuffer()),{type:'array',sheetRows:501,cellHTML:false,cellStyles:false,bookVBA:false});if(closed)return;
    const select=document.createElement('select'),table=document.createElement('div'),note=document.createElement('p');note.textContent='시트 내용 미리보기 · 최대 500행 / 80열 · 원본 서식과 일부 다를 수 있습니다.';
    wb.SheetNames.forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;select.append(o);});
    const paint=()=>{const rows=XLSX.utils.sheet_to_json(wb.Sheets[select.value],{header:1,raw:false,defval:''}).slice(0,500);table.replaceChildren();const t=document.createElement('table');for(const row of rows){const tr=document.createElement('tr');for(const value of row.slice(0,80)){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}t.append(tr);}table.append(t);};select.onchange=paint;body.append(select,note,table);paint();
   }else if(ext==='hwp'){
    if(!window.XLSX?.CFB)throw Error('한글 내용 미리보기 구성요소를 불러오지 못했습니다.');
    const cfb=XLSX.CFB.read(new Uint8Array(await blob.arrayBuffer()),{type:'array'}),item=cfb.FileIndex.find(x=>x.name==='PrvText');if(closed)return;
    if(!item?.content?.length)throw Error('이 한글 파일에는 내용 미리보기가 없습니다. 원본과 함께 PDF 미리보기를 등록해주세요.');
    const note=document.createElement('p');note.textContent='한글 내용 미리보기입니다. 표·사진 등 원본 모양은 PDF 미리보기를 등록하면 확인할 수 있습니다.';const pre=document.createElement('pre');pre.textContent=new TextDecoder('utf-16le').decode(new Uint8Array(item.content).slice(0,2*1024*1024)).replace(/\u0000/g,'');body.append(note,pre);
   }else if(ext==='docx'){
    const zip=await JSZip.loadAsync(blob),entry=zip.file('word/document.xml');if(!entry||!entry._data||entry._data.uncompressedSize>16*1024*1024)throw Error('Word 내용 미리보기 범위를 초과했습니다. PDF 미리보기를 등록해주세요.');
    const xml=await entry.async('string');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('이 문서는 웹 미리보기를 지원하지 않습니다.');const doc=new DOMParser().parseFromString(xml,'application/xml');if(closed)return;
    const note=document.createElement('p');note.textContent='Word 내용 미리보기 · 원본 서식은 PDF 미리보기로 확인할 수 있습니다.';const pre=document.createElement('pre');pre.textContent=[...doc.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('')).join('\n');body.append(note,pre);
   }else if(/^(txt|json|md)$/.test(ext)){
    const pre=document.createElement('pre');pre.textContent=await blob.slice(0,2*1024*1024).text();if(!closed)body.append(pre);
   }else throw Error('이 형식은 원본 다운로드로 확인해주세요. 한글·Word 문서는 PDF 미리보기를 함께 등록할 수 있습니다.');
  }catch(e){if(!closed)body.textContent=e.message;}
 }
 document.addEventListener('df:menu-permissions-changed',()=>{if(previewClose)previewClose();if(latestEditor&&latestEditor.actor!==uid()){latestEditor.pending=[];latestEditor.existing=[];latestEditor.modal.remove();latestEditor=null;}else if(latestEditor)draw(latestEditor);});
 window.DFBidFiles={mount,editor:modal=>sessions.get(modal),recordId:s=>s?.id,lock:(s,value)=>{if(s){s.saving=value;draw(s);}},initial,save,count:a=>active(a).filter(f=>!f.preview_for).length,_test:{add,merged,preview,legacyCategories:CATS}};
})();
