/* Beta3.1: receipt-scoped HWPX originals for reference / short-term reports. */
(function(global){'use strict';
 const BUCKET='quality-documents',TABLE='measurement_reports';let options={};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),clone=v=>JSON.parse(JSON.stringify(v));
 const engine=()=>{if(!global.DF_REPORT_TEMPLATE_ENGINE)throw Error('HWPX 양식 처리 모듈을 불러오지 못했습니다.');return global.DF_REPORT_TEMPLATE_ENGINE;};
 const active=()=>options.wizard?.();
 function isReference(form){return form?.report_mode==='reference';}
 function context(identity,write=false){const db=options.database?.(),user=options.currentUser?.();if(!db||!user||identity&&user.id!==identity)throw Error('로그인 정보를 확인한 뒤 다시 열어주세요.');options.needAction('view');if(write){options.needAction(active()?.report?'update':'create');options.needAction('upload');}return {db,user};}
 function valid(form,report){const ref=form?.reference_template;return !!(isReference(form)&&ref&&ref.version===1&&ref.receipt_no===form.receipt_no&&ref.report_id===(report?.id||ref.report_id)&&ref.config?.mode==='reference'&&ref.config.fingerprint===ref.fingerprint&&/^report-writer\/reports\/[0-9]{4}\/[0-9a-f-]+\/template_[0-9a-f-]+\.hwpx$/i.test(ref.storage_path)&&ref.storage_path.split('/')[3]===ref.report_id);}
 function meta(form){const w=active(),ref=form?.reference_template;return {linked:valid(form,w?.form===form?w.report:null),name:ref?.file_name,variableFields:ref?.config?.mapping?.map(m=>m.field)||[],error:ref?'저장된 참고용 양식의 접수번호를 확인해주세요.':'이 접수 건에 사용할 성적서 HWPX 양식을 업로드해주세요.'};}
 function panel(form){
  const w=active(),ref=form.reference_template,pending=w?.referencePending,page=pending?.info.pages.find(p=>p.id===pending.pageId);
  const refs=ref?.referenceFields||[],values=form.reference_cells||{};
  return `<section class="rhx-template-linked rhx-reference"><div><span class="rhx-template-eyebrow">참고용(단기) · 접수별 양식</span><b>${esc(ref?.file_name||'성적서 양식을 업로드해주세요.')}</b><p>시설 등록 없이 기본사항을 직접 입력합니다. 측정·분석값은 이 접수번호의 자료에서 가져옵니다.</p><p>셀 병합과 양식 모양은 원본을 유지하며, 입력한 내용은 이 성적서에만 저장됩니다.</p></div><div class="rhx-actions"><button class="rhx-btn" id="rhxReferenceChoose" ${w?.busy?'disabled':''}>${ref?'양식 변경':'HWPX 양식 업로드'}</button>${ref?'<button class="rhx-btn" id="rhxReferenceDownload">원본 양식 받기</button>':''}<input type="file" id="rhxReferenceInput" accept=".hwpx" hidden></div>${pending?`<div class="rhx-reference-review"><h3>업로드 양식 확인</h3><p>${esc(pending.file.name)}</p><label>사용할 성적서 페이지 <select id="rhxReferencePage">${pending.info.pages.map(p=>`<option value="${esc(p.id)}" ${p.id===pending.pageId?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label>${page?`<p>기본·측정 항목 ${page.mapping.length}개 연결 · 결과 칸은 현재 측정항목으로 갱신됩니다.</p><details><summary>연결 항목과 기존 값 확인</summary><div class="rhx-fixed-grid">${page.mapping.map(m=>{const f=page.fields.find(f=>f.cellId===m.cellId);return `<div><span>${esc(pending.info.fieldOptions.find(x=>x.key===m.field)?.label||m.field)} ${esc(m.analyte||'')}</span><b>${esc(f?.value||'빈칸')}</b></div>`;}).join('')}</div></details>`:''}<p>다른 현장의 기본정보·측정값은 가져오지 않습니다. 아래 입력값으로 생성할 양식인지 확인해주세요.</p><label><input type="checkbox" id="rhxReferenceConfirm"> 사용할 양식과 연결 항목을 확인했습니다.</label><div class="rhx-actions"><button class="rhx-btn primary" id="rhxReferenceRegister" ${w.busy?'disabled':''}>이 접수의 양식으로 저장</button><button class="rhx-btn" id="rhxReferenceCancel" ${w.busy?'disabled':''}>선택 취소</button></div></div>`:''}${ref&&refs.length?`<details class="rhx-reference-cells" open><summary>방지시설 · 시설가동상황 직접 입력</summary><p>해당하지 않는 칸은 ‘해당 없음’으로 입력하세요. 원본의 해당 칸에 그대로 반영합니다.</p><div class="rhx-field-grid">${refs.map(f=>`<label><span>${esc(f.label)}</span><textarea data-reference-cell="${esc(f.cellId)}" rows="${Math.min(3,Math.max(1,f.paragraphs))}" ${w?.busy?'disabled':''}>${esc(values[f.cellId]||'')}</textarea></label>`).join('')}</div></details>`:''}</section>`;
 }
 function run(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>alert(e.message||String(e)));}
 async function inspectFile(file){
  const w=active();if(!w||w.busy||!file)return;context(null,true);if(!/\.hwpx$/i.test(file.name)||file.size>30*1024*1024)throw Error('30MB 이하의 HWPX 성적서 양식을 선택해주세요.');
  w.busy=true;options.render();try{const bytes=await file.arrayBuffer(),info=await engine().inspect(bytes,{mode:'reference'});if(active()!==w)return;if(info.blockingIssues.length)throw Error(info.blockingIssues.map(x=>x.message).join('\n'));if(!info.pages.length)throw Error('성적서 페이지를 찾지 못했습니다.');w.referencePending={file,bytes,info,pageId:info.pages[0].id};}finally{w.busy=false;if(active()===w)options.render();}
 }
 async function register(){
  const w=active(),pending=w?.referencePending;if(!w||w.busy||!pending)return;if(!document.getElementById('rhxReferenceConfirm')?.checked)throw Error('사용할 양식과 연결 항목을 확인해주세요.');const {db,user}=context(null,true),identity=user.id;
  const page=pending.info.pages.find(p=>p.id===pending.pageId),config={version:engine().version,mode:'reference',fingerprint:pending.info.fingerprint,pageId:page?.id,mapping:clone(page?.mapping||[]),confirmed:true};
  w.busy=true;options.render();let path,uploaded=false,ref;const oldRef=clone(w.form.reference_template||null),oldCells=clone(w.form.reference_cells||{});
  try{
   const checked=await engine().validateConfig(pending.bytes,config);if(!checked.valid)throw Error(checked.issues.map(x=>x.message).join('\n'));
   context(identity,true);const report=await options.persist();if(active()!==w)throw Error('성적서 화면이 변경되었습니다. 다시 열어주세요.');
   path='report-writer/reports/'+report.report_year+'/'+report.id+'/template_'+crypto.randomUUID()+'.hwpx';
   const upload=await db.storage.from(BUCKET).upload(path,pending.file,{contentType:'application/hwp+zip',upsert:false});if(upload.error){const check=await db.storage.from(BUCKET).download(path);if(check.error)throw upload.error;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await check.data.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==pending.info.fingerprint)throw upload.error;}uploaded=true;context(identity,true);
   ref={version:1,report_id:report.id,receipt_no:w.form.receipt_no,storage_path:path,file_name:pending.file.name,fingerprint:pending.info.fingerprint,config,referenceFields:clone(page.referenceFields||[])};
   w.form.reference_template=ref;w.form.reference_cells={};(ref.referenceFields||[]).forEach(f=>{w.form.reference_cells[f.cellId]=oldRef?.fingerprint===ref.fingerprint&&Object.hasOwn(oldCells,f.cellId)?oldCells[f.cellId]:'';});
   await options.persist();w.referencePending=null;
  }catch(error){
   if(uploaded){
    let found;try{context(identity);found=await db.from(TABLE).select('*').eq('id',w.report.id).maybeSingle();}catch{}
    if(!found||found.error){throw Error('양식 등록 응답을 확인하지 못했습니다. 입력값을 유지했습니다. 화면을 새로 열어 등록 여부를 확인해주세요.');}
    if(found.data?.form_data?.reference_template?.storage_path===path){w.report=found.data;options.recovered?.(found.data);w.referencePending=null;}
    else{w.form.reference_template=oldRef;w.form.reference_cells=oldCells;const cleanup=await db.storage.from(BUCKET).remove([path]);if(cleanup.error)throw Error('양식 연결에 실패했습니다. 업로드 파일 정리가 필요합니다: '+path+'\n'+error.message);throw error;}
   }else throw error;
  }finally{w.busy=false;if(active()===w)options.render();}
 }
 async function generate(form){const w=active(),ref=form.reference_template;if(!valid(form,w?.form===form?w.report:null))throw Error('현재 접수번호의 참고용 양식을 다시 연결해주세요.');const {db,user}=context(),r=await db.storage.from(BUCKET).download(ref.storage_path);if(r.error)throw r.error;context(user.id);return engine().generate(await r.data.arrayBuffer(),ref.config,form);}
 function bind(){
  const w=active();if(!isReference(w?.form))return;const $=id=>document.getElementById(id);
  if($('rhxReferenceChoose'))$('rhxReferenceChoose').onclick=()=>{if(!w.busy)$('rhxReferenceInput').click();};
  if($('rhxReferenceInput'))$('rhxReferenceInput').onchange=run(e=>inspectFile(e.target.files?.[0]));
  if($('rhxReferencePage'))$('rhxReferencePage').onchange=e=>{if(!w.busy){w.referencePending.pageId=e.target.value;options.render();}};
  if($('rhxReferenceRegister'))$('rhxReferenceRegister').onclick=run(register);
  if($('rhxReferenceCancel'))$('rhxReferenceCancel').onclick=()=>{if(!w.busy){w.referencePending=null;options.render();}};
  if($('rhxReferenceDownload'))$('rhxReferenceDownload').onclick=run(async()=>{const {db,user}=context(),ref=w.form.reference_template,r=await db.storage.from(BUCKET).download(ref.storage_path);if(r.error)throw r.error;context(user.id);options.download(r.data,ref.file_name);});
  document.querySelectorAll('[data-reference-cell]').forEach(el=>{el.oninput=()=>{if(!w.busy)w.form.reference_cells[el.dataset.referenceCell]=el.value;};});
 }
 global.DF_REPORT_REFERENCE={configure:x=>options=x,isReference,meta,panel,bind,generate,valid};
})(window);
