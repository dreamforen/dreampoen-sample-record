/* DREAMFOREN INTERNAL APPROVAL · v120.37.29 · original form workflow */
(function(){
  'use strict';
  const BUCKET='approval-files';
  const state={docs:[],steps:[],files:[],logs:[],profiles:[],summary:'all',preset:null};
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const me=()=>{try{return dfCloudUser?.id||''}catch(_){return ''}}, admin=()=>{try{return String(dfCloudProfile?.role||'').toLowerCase()==='admin'}catch(_){return false}}, db=()=>{try{return dfSupabase}catch(_){return null}};
  const can=action=>window.DFMenuPermissions?.can('approval',action,true)??true;
  const requireAction=action=>{if(can(action))return true;alert('내부결재 '+({create:'작성',update:'수정·결재',upload:'업로드',delete:'삭제'}[action]||action)+' 권한이 없습니다.');return false};
  const canDraft=d=>!d?can('create'):d.requester_id===me()&&d.status==='draft'&&(can('create')||can('update'));
  const TYPES={general:'일반기안',quality_manual:'품질매뉴얼',quality_document:'품질문서',purchase:'구매·지출',leave:'휴가·근태',contract:'견적·계약',analysis:'시험·분석'};
  const STATUS={draft:'임시저장',submitted:'결재요청',in_review:'검토중',approved:'최종승인',rejected:'반려',cancelled:'상신취소'};
  const msg=(text,type='')=>{const e=$('dfApprovalMessage');if(e){e.className='df-approval-message '+type;e.textContent=text}};
  const person=id=>state.profiles.find(x=>x.id===id)||{};
  const fmtDate=v=>v?new Date(v).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'-';
  const safeName=v=>String(v||'file').replace(/[^0-9A-Za-z가-힣._-]/g,'_');

  async function load(){
    if(!db()||!me())return;msg('내부결재 문서를 불러오는 중입니다.');
    try{
      let p=await db().rpc('df_approval_people');
      if(p.error&&admin())p=await db().from('profiles').select('id,name,email,job_title,team,role').eq('active',true).order('name');
      if(p.error)throw p.error;state.profiles=(p.data||[]).map(x=>({job_title:'',...x}));
      let d=await db().from('approval_documents').select('*').is('deleted_at',null).order('created_at',{ascending:false});
      if(d.error&&/deleted_at|42703|schema cache/i.test(d.error.message||''))d=await db().from('approval_documents').select('*').order('created_at',{ascending:false});
      if(d.error)throw d.error;state.docs=d.data||[];
      const ids=state.docs.map(x=>x.id);state.steps=[];state.files=[];state.logs=[];
      if(ids.length){
        const [s,f,l]=await Promise.all([db().from('approval_steps').select('*').in('document_id',ids).order('step_order'),db().from('approval_attachments').select('*').in('document_id',ids),db().from('approval_audit_logs').select('*').in('document_id',ids).order('created_at')]);
        if(s.error)throw s.error;if(f.error)throw f.error;if(l.error)throw l.error;state.steps=s.data||[];state.files=f.data||[];state.logs=l.data||[];
      }
      render();msg('결재문서를 최신 상태로 불러왔습니다.','ok');window.DF_DIAG?.info('INTERNAL-APPROVAL','내부결재 동기화 완료',`문서 ${state.docs.length}건 / 내 결재대기 ${pendingMine().length}건`)
    }catch(e){msg(/approval_documents|schema cache|does not exist/i.test(e.message||'')?'내부결재 DB 설치가 필요합니다. ZIP의 22_v12028_internal_approval.sql을 먼저 실행해주세요.':'내부결재 불러오기 실패 · '+(e.message||e),'bad');$('dfApprovalList').innerHTML='<div class="df-doc-empty">내부결재 자료를 표시할 수 없습니다.</div>';window.DF_DIAG?.error('INTERNAL-APPROVAL','내부결재 불러오기 실패',e.message||String(e))}
  }
  const docSteps=id=>state.steps.filter(x=>x.document_id===id).sort((a,b)=>a.step_order-b.step_order);
  const pendingMine=()=>state.steps.filter(x=>x.approver_id===me()&&x.status==='pending');
  function render(){
    if($('dfApprovalNew'))$('dfApprovalNew').hidden=!can('create');
    const pendingIds=new Set(pendingMine().map(x=>x.document_id));
    $('dfApprovalCountAll').textContent=state.docs.length;$('dfApprovalCountPending').textContent=pendingIds.size;$('dfApprovalCountMine').textContent=state.docs.filter(x=>x.requester_id===me()).length;$('dfApprovalCountApproved').textContent=state.docs.filter(x=>x.status==='approved').length;$('dfApprovalCountRejected').textContent=state.docs.filter(x=>x.status==='rejected').length;
    const badge=$('dfApprovalNavBadge');if(badge){badge.textContent=pendingIds.size;badge.hidden=!pendingIds.size}
    const st=$('dfApprovalStatus')?.value||'all',type=$('dfApprovalType')?.value||'all',q=($('dfApprovalSearch')?.value||'').trim().toLowerCase();
    let rows=state.docs.filter(d=>(st==='all'||d.status===st)&&(type==='all'||d.doc_type===type));
    if(state.summary==='pending')rows=rows.filter(d=>pendingIds.has(d.id));else if(state.summary==='mine')rows=rows.filter(d=>d.requester_id===me());else if(state.summary==='approved')rows=rows.filter(d=>d.status==='approved');else if(state.summary==='rejected')rows=rows.filter(d=>d.status==='rejected');
    if(q)rows=rows.filter(d=>`${d.approval_no} ${d.title} ${person(d.requester_id).name||''}`.toLowerCase().includes(q));
    $('dfApprovalList').innerHTML=rows.length?rows.map(card).join(''):'<div class="df-doc-empty">조건에 맞는 결재문서가 없습니다.</div>';
  }
  function card(d){
    const steps=docSteps(d.id),done=steps.filter(x=>x.status==='approved').length,who=person(d.requester_id),pending=steps.find(x=>x.status==='pending');
    return `<article class="df-approval-card status-${esc(d.status)}" data-ap-id="${esc(d.id)}"><div class="df-approval-card-main"><div class="df-approval-card-top"><span class="df-approval-state">${esc(STATUS[d.status]||d.status)}</span><span>${esc(TYPES[d.doc_type]||d.doc_type)}</span><small>${esc(d.approval_no)}</small></div><h2>${esc(d.title)}</h2><p>기안자 ${esc(who.name||'직원')} · ${esc(who.job_title||who.team||'직급 미지정')} · ${fmtDate(d.created_at)}</p></div><div class="df-approval-progress"><b>${done}/${steps.length}</b><span>${pending?`현재 ${esc(person(pending.approver_id).name||'결재자')} 검토`:(d.status==='approved'?'결재 완료':d.status==='rejected'?'반려 처리':'결재선 '+steps.length+'단계')}</span></div><button type="button" class="company-btn secondary" data-ap-open>상세보기</button></article>`;
  }
  function approverOptions(selected=''){return '<option value="">선택 안 함</option>'+state.profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name||p.email)} · ${esc(p.job_title||p.team||'직급 미지정')}</option>`).join('')}
  const FORM_MARKER='DF_APPROVAL_FORM_V1\n';
  const templates=()=>window.DFApprovalTemplates;
  function decodeForm(content){
    if(!String(content||'').startsWith(FORM_MARKER))return null;
    try{const p=JSON.parse(content.slice(FORM_MARKER.length));if(p.version!==1||!['annual_leave','expense'].includes(p.template)||!p.data||typeof p.data!=='object'||Array.isArray(p.data))return null;if(p.template==='expense'&&p.data.items!==undefined&&(!Array.isArray(p.data.items)||p.data.items.some(row=>!row||typeof row!=='object'||Array.isArray(row))))return null;return p}catch(_){return null}
  }
  function readableContent(d){const p=decodeForm(d.content);if(p)return `${p.template==='annual_leave'?'연차신청서':'지출결의서'} · ${d.title||''}`;return String(d.content||'').startsWith(FORM_MARKER)?'저장된 양식을 표시할 수 없습니다. 새로고침 후 다시 확인해주세요.':d.content||''}
  function formContext(d,steps=[],logs=[]){return {requester:person(d?.requester_id||me()),document:d||{},logs,steps:steps.map(s=>{
    const audit=logs.filter(l=>l.action==='approved'&&Number(l.detail?.step)===Number(s.step_order)&&l.actor_id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
    return {...s,approver:person(s.approver_id),actor:s.status==='approved'&&audit?person(audit.actor_id):null};
  })}}
  const formOptions=()=>templates()?.options||[{id:'annual_leave',label:'연차신청서',docType:'leave',stepNames:['팀장','대표이사']},{id:'expense',label:'지출품의서 (원본: 지출결의서)',docType:'purchase',stepNames:['부서장','대표']}];
  const formOption=kind=>formOptions().find(x=>x.id===kind);
  function showFormPreview(kind,payload,context){
    if(!templates())return alert('양식 파일을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');
    const w=window.open('about:blank','_blank');if(!w)return alert('미리보기 팝업을 허용해주세요.');
    w.document.write(templates().printHtml(kind,payload,context));w.document.close();
  }
  async function startForm(preset=null){if(!requireAction('create'))return;if(!db()||!me())return alert('로그인 후 기안할 수 있습니다.');if(!state.profiles.length){await load();if(!state.profiles.length)return}openForm(null,preset)}
  function openForm(existing=null,preset=null){
    if(!canDraft(existing))return alert('기안 작성·수정 권한을 확인해주세요.');
    const own=existing?.requester_id===me(),editable=!existing||existing.status==='draft'&&own;if(!editable)return openDetail(existing.id);
    let m=$('dfApprovalFormModal');if(!m){m=document.createElement('div');m.id='dfApprovalFormModal';m.className='company-modal-backdrop';document.body.appendChild(m)}
    const stored=decodeForm(existing?.content),data={quality_document_id:existing?.quality_document_id,quality_revision:existing?.quality_revision,quality_section_revision_id:existing?.quality_section_revision_id,leave_request_id:existing?.leave_request_id,...preset},initialKind=stored?.template||data.template||'',oldSteps=existing?docSteps(existing.id):[];
    if(initialKind&&!templates())return alert('원본 양식 파일을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');
    const editor={doc:existing,id:existing?.id||crypto.randomUUID(),preset:data,kind:initialKind,payload:stored?.data||null,cache:{},files:[],busy:false,steps:oldSteps};
    m._dfApprovalEditor=editor;m.hidden=false;m.style.display='flex';m.onclick=null;
    m.innerHTML=`<div class="company-modal df-approval-form"><div class="company-modal-head"><div><h2>${existing?'기안문 수정':'새 기안 작성'}</h2><small>양식을 선택하고 원본 문서에 입력한 뒤 결재선을 지정합니다.</small></div><button class="company-modal-close" data-close>×</button></div><div class="df-approval-form-grid"><label>기안 양식<select id="dfApTemplate" ${existing||data.locked?'disabled':''}><option value="">일반기안 / 기존 문서</option>${formOptions().map(o=>`<option value="${esc(o.id)}" ${o.id===initialKind?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label><label id="dfApTypeWrap">문서종류<select id="dfApFormType" ${data.locked?'disabled':''}>${Object.entries(TYPES).map(([v,l])=>`<option value="${v}" ${v===(data.doc_type||existing?.doc_type||'general')?'selected':''}>${l}</option>`).join('')}</select></label><label class="wide">제목<input id="dfApFormTitle" value="${esc(data.title||existing?.title||'')}"></label><label class="wide" id="dfApContentWrap">기안내용<textarea id="dfApFormContent" placeholder="요청사항과 검토할 내용을 입력하세요.">${esc(stored?'':data.content||existing?.content||'')}</textarea></label></div><div id="dfApLeaveBalance" class="df-leave-balance" hidden></div><div id="dfApOriginalForm"></div><section class="df-approval-line-edit"><h3>결재선</h3><div id="dfApStepInputs"></div><small>선택하지 않은 단계는 건너뜁니다. 동일인을 중복 지정할 수 없습니다. 양식의 결재란에는 실제 승인자와 승인일이 표시됩니다.</small></section><div class="df-approval-files" id="dfApDropZone" tabindex="0" role="button" aria-label="첨부파일 선택 또는 파일 끌어놓기">첨부파일 <small>이곳에 파일을 끌어놓거나 선택하세요 · 파일당 20MB 이하</small><input id="dfApFormFiles" type="file" multiple><div id="dfApExistingFiles"></div><div id="dfApFileNames"></div></div><div class="df-approval-form-actions"><button class="company-btn secondary" data-close>취소</button><button class="company-btn secondary" data-preview>원본 미리보기 / 인쇄</button><button class="company-btn secondary" data-save>임시저장</button><button class="company-btn primary" data-submit>결재 상신</button></div></div>`;
    const close=()=>{if(editor.busy)return;m.hidden=true;m.style.display='none';state.preset=null};m.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
    const refreshBalance=async()=>{const target=$('dfApLeaveBalance');target.hidden=editor.kind!=='annual_leave';if(target.hidden)return;const year=new Date().getFullYear();target.textContent=year+'년 잔여연차 확인 중…';try{const r=await db().rpc('df_leave_balance',{p_employee:me(),p_year:year});if(r.error)throw r.error;if(m._dfApprovalEditor===editor&&editor.kind==='annual_leave')target.textContent=year+'년 잔여연차 '+Number(r.data?.[0]?.balance||0)+'일 · 최종승인된 휴가만 사용연차와 일정에 반영됩니다.'}catch(_){target.textContent='잔여연차를 불러오지 못했습니다. 직원관리의 연차현황에서 확인해주세요.'}};
    const paintKind=()=>{
      $('dfApTypeWrap').hidden=!!editor.kind;$('dfApContentWrap').hidden=!!editor.kind;m.querySelector('[data-preview]').hidden=!editor.kind;
      const ctx=formContext(editor.doc||{requester_id:me()},editor.steps,[]),option=formOption(editor.kind);
      if(editor.kind){editor.payload=editor.payload||templates().create(editor.kind,ctx);$('dfApOriginalForm').innerHTML=templates().editor(editor.kind,editor.payload,ctx);templates().bind?.($('dfApOriginalForm').querySelector('[data-dfa-editor]'));if(!$('dfApFormTitle').value.trim())$('dfApFormTitle').value=option?.label||''}else $('dfApOriginalForm').innerHTML='';
      const names=option?.stepNames||['1차 검토','2차 검토','최종 승인'];$('dfApStepInputs').innerHTML=names.map((name,i)=>{const old=editor.kind?editor.steps.find(s=>s.step_name===name):editor.steps[i];return `<label>${esc(name)}<select data-ap-step data-step-name="${esc(name)}">${approverOptions(old?.approver_id)}</select></label>`}).join('');
    };
    $('dfApTemplate').onchange=e=>{if(e.target.value&&!templates()){e.target.value=editor.kind;return alert('원본 양식 파일을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.')}const oldLabel=formOption(editor.kind)?.label;if($('dfApFormTitle').value===oldLabel)$('dfApFormTitle').value='';if(editor.kind)editor.cache[editor.kind]=templates().collect(editor.kind,$('dfApOriginalForm'),editor.payload);editor.kind=e.target.value;editor.payload=editor.cache[editor.kind]||null;paintKind();refreshBalance()};paintKind();refreshBalance();
    function drawFiles(){
      $('dfApExistingFiles').textContent=(state.files.filter(f=>f.document_id===editor.doc?.id).map(f=>'저장됨: '+f.file_name)).join(' · ');
      $('dfApFileNames').innerHTML=editor.files.length?editor.files.map((f,i)=>`<div>${esc(f.file.name)} ${f.done?'(저장됨)':`<button type="button" class="company-btn secondary" data-remove-file="${i}">제외</button>`}</div>`).join(''):'선택된 파일이 없습니다.';
      $('dfApFileNames').querySelectorAll('[data-remove-file]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(editor.busy)return;editor.files.splice(Number(b.dataset.removeFile),1);drawFiles()});
    }
    const addFiles=files=>{if(editor.busy||!requireAction('upload'))return;for(const f of files){if(f.size>20*1024*1024){alert(f.name+' 파일은 20MB 이하만 가능합니다.');continue}if(!editor.files.some(x=>x.file.name===f.name&&x.file.size===f.size&&x.file.lastModified===f.lastModified))editor.files.push({file:f,id:crypto.randomUUID(),done:false})}drawFiles()};
    $('dfApFormFiles').onchange=e=>{addFiles([...e.target.files]);e.target.value=''};
    const drop=$('dfApDropZone');drop.onclick=e=>{if(e.target===drop||e.target.tagName==='SMALL')$('dfApFormFiles').click()};drop.onkeydown=e=>{if(e.target===drop&&['Enter',' '].includes(e.key)){e.preventDefault();$('dfApFormFiles').click()}};
    ['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('dragover')}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('dragover')}));drop.addEventListener('drop',e=>addFiles([...e.dataTransfer.files]));drawFiles();
    m.querySelector('[data-preview]').onclick=()=>{const layout=templates().validateLayout?.($('dfApOriginalForm'))||[];if(layout.length)return alert(layout.join('\n'));const payload=templates().collect(editor.kind,$('dfApOriginalForm'),editor.payload);showFormPreview(editor.kind,payload,formContext(editor.doc||{requester_id:me(),status:'draft',title:$('dfApFormTitle').value},[],[]))};
    m.querySelector('[data-save]').onclick=()=>saveForm(editor,false,m,drawFiles);m.querySelector('[data-submit]').onclick=()=>saveForm(editor,true,m,drawFiles);
  }
  async function uploadFormFiles(editor,drawFiles){
    if(editor.files.some(x=>!x.done)&&!can('upload'))throw Error('내부결재 업로드 권한이 없습니다.');
    for(const entry of editor.files){if(entry.done)continue;const file=entry.file,path=entry.path||`${editor.doc.id}/${entry.id}_${safeName(file.name)}`;entry.path=path;
      if(!entry.uploaded){const up=await db().storage.from(BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream'});if(up.error&&!/duplicate|already exists|409/i.test(up.error.message||''))throw up.error;entry.uploaded=true}
      const f=await db().from('approval_attachments').insert({id:entry.id,document_id:editor.doc.id,file_name:file.name,storage_path:path,mime_type:file.type||'',file_size:file.size,uploaded_by:me()});
      if(f.error){const check=await db().from('approval_attachments').select('id').eq('id',entry.id).maybeSingle();if(check.error||!check.data)throw f.error}entry.done=true;drawFiles();
    }
  }
  async function saveTemplate(editor,title,content,steps,submit=false){
    const args={p_document:editor.id,p_expected_updated_at:editor.doc?.updated_at||null,p_title:title,p_content:content,p_steps:steps.map(s=>({step_name:s.step_name,approver_id:s.approver_id})),p_submit:submit};
    const r=await db().rpc('df_approval_save_template_draft',args);
    if(r.error){
      if(/function.*df_approval_save_template_draft|schema cache|PGRST202/i.test((r.error.code||'')+' '+(r.error.message||'')))throw Error('원본 결재양식 SQL(40_v1203729_approval_form_draft.sql)을 먼저 실행해주세요. 작성 내용은 유지됩니다.');
      const recovered=await db().from('approval_documents').select('*').eq('id',editor.id).eq('requester_id',me()).maybeSingle();
      const row=recovered.data;
      if(!recovered.error&&row&&row.title===title&&row.content===content&&(!editor.doc||row.updated_at!==editor.doc.updated_at)&&((submit&&['submitted','in_review','approved'].includes(row.status))||(!submit&&row.status==='draft'))){
        const line=await db().from('approval_steps').select('*').eq('document_id',row.id).order('step_order');
        if(!line.error&&JSON.stringify((line.data||[]).map(s=>({step_name:s.step_name,approver_id:s.approver_id})))===JSON.stringify(args.p_steps)){editor.doc=row;return row}
      }
      throw r.error;
    }
    const doc=Array.isArray(r.data)?r.data[0]:r.data;if(!doc?.id)throw Error('저장 결과를 확인할 수 없습니다. 입력을 유지한 채 다시 시도해주세요.');editor.doc=doc;return doc;
  }
  async function saveForm(editor,submit,modal,drawFiles){
    if(!canDraft(editor.doc))return alert('기안 작성·수정 권한이 없습니다.');
    if(editor.files.some(x=>!x.done)&&!requireAction('upload'))return;
    if(editor.busy)return;
    const title=$('dfApFormTitle').value.trim(),selects=[...modal.querySelectorAll('[data-ap-step]')],chosen=selects.map(x=>x.value).filter(Boolean),steps=selects.filter(x=>x.value).map((x,i)=>({step_order:i+1,step_name:x.dataset.stepName,approver_id:x.value,status:'waiting'}));
    if(!title)return alert('제목을 입력해주세요.');if(submit&&!chosen.length)return alert('결재자를 한 명 이상 지정해주세요.');if(new Set(chosen).size!==chosen.length)return alert('같은 결재자를 중복 지정할 수 없습니다.');
    let content=$('dfApFormContent').value.trim(),doc_type=editor.preset.doc_type||$('dfApFormType').value;
    if(editor.kind){const layout=templates().validateLayout?.($('dfApOriginalForm'))||[];if(layout.length)return alert(layout.join('\n'));editor.payload=templates().collect(editor.kind,$('dfApOriginalForm'),editor.payload);const errors=templates().validate(editor.kind,editor.payload,submit)||[];if(errors.length)return alert(errors.join('\n'));content=FORM_MARKER+JSON.stringify({version:1,template:editor.kind,data:editor.payload});doc_type=formOption(editor.kind).docType}
    editor.busy=true;const buttons=[...modal.querySelectorAll('button,input,select,textarea')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);const btn=modal.querySelector(submit?'[data-submit]':'[data-save]'),label=btn.textContent;btn.textContent=submit?'상신 중...':'저장 중...';
    try{
    if(submit&&editor.kind==='annual_leave'){const p=editor.payload;if(['연차','월차','반차','annual','half_am','half_pm'].includes(p.leaveType)){const balance=await db().rpc('df_leave_balance',{p_employee:me(),p_year:Number(String(p.startDate).slice(0,4))});if(!balance.error&&balance.data?.length&&Number(p.days)>Number(balance.data[0].balance)&&!confirm('현재 잔여연차 '+balance.data[0].balance+'일보다 신청일수 '+p.days+'일이 많습니다. 그래도 상신할까요?'))return}}
      if(editor.kind){await saveTemplate(editor,title,content,steps,false)}
      else{
        if(editor.doc){let q=db().from('approval_documents').update({title,content,doc_type,updated_at:new Date().toISOString()}).eq('id',editor.doc.id).eq('requester_id',me()).eq('status','draft');if(editor.doc.updated_at)q=q.eq('updated_at',editor.doc.updated_at);const u=await q.select().single();if(u.error)throw u.error;if(!u.data)throw Error('다른 화면에서 문서가 변경되었습니다. 현재 입력을 확인해주세요.');editor.doc=u.data;const del=await db().from('approval_steps').delete().eq('document_id',editor.doc.id);if(del.error)throw del.error}
        else{const preset=editor.preset,ins=await db().rpc('df_approval_create_draft',{p_title:title,p_content:content,p_doc_type:doc_type,p_quality_document_id:preset.quality_document_id||null,p_quality_revision:preset.quality_revision||null,p_quality_section_revision_id:preset.quality_section_revision_id||null,p_leave_request_id:preset.leave_request_id||null});if(ins.error)throw ins.error;editor.doc=Array.isArray(ins.data)?ins.data[0]:ins.data;if(!editor.doc?.id)throw Error('결재문서 생성 결과를 확인할 수 없습니다.');editor.id=editor.doc.id}
        if(steps.length){const line=await db().from('approval_steps').insert(steps.map(s=>({...s,document_id:editor.doc.id})));if(line.error)throw line.error}
      }
      await uploadFormFiles(editor,drawFiles);
      if(editor.kind&&submit)await saveTemplate(editor,title,content,steps,true);
      else if(!editor.kind){
        const preset=editor.preset,leaveId=editor.doc.leave_request_id||preset.leave_request_id;
        if(leaveId){const lr=await db().from('leave_requests').update({approval_document_id:editor.doc.id,updated_at:new Date().toISOString()}).eq('id',leaveId).eq('employee_id',me()).eq('status','draft');if(lr.error)throw lr.error}
        if(preset.quality_section_revision_id&&submit){const qr=await db().from('quality_section_revisions').update({status:'submitted',updated_at:new Date().toISOString()}).eq('id',preset.quality_section_revision_id);if(qr.error)throw qr.error}
        if(submit){const r=await db().rpc('df_approval_submit',{p_document:editor.doc.id});if(r.error)throw r.error}
      }
      modal.hidden=true;modal.style.display='none';state.preset=null;await load();msg(submit?'결재 상신이 완료되었습니다.':'기안문을 임시저장했습니다.','ok');
    }catch(e){alert((submit?'결재 상신':'임시저장')+' 실패\n'+(e.message||e)+'\n작성 내용은 현재 화면에 유지됩니다.');window.DF_DIAG?.error('INTERNAL-APPROVAL',submit?'결재 상신 실패':'임시저장 실패',e.message||String(e))}
    finally{editor.busy=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);btn.textContent=label}
  }
  async function openDetail(id){
    const d=state.docs.find(x=>x.id===id);if(!d)return;const steps=docSteps(id),files=state.files.filter(x=>x.document_id===id),logs=state.logs.filter(x=>x.document_id===id),pending=steps.find(x=>x.status==='pending'),canAct=pending&&(pending.approver_id===me()||admin())&&can('update');
    let m=$('dfApprovalDetailModal');if(!m){m=document.createElement('div');m.id='dfApprovalDetailModal';m.className='company-modal-backdrop';document.body.appendChild(m)}m.hidden=false;m.style.display='flex';
    m.innerHTML=`<div class="company-modal df-approval-detail"><div class="company-modal-head"><div><h2>${esc(d.title)}</h2><small>${esc(d.approval_no)} · ${esc(TYPES[d.doc_type]||d.doc_type)}</small></div><button class="company-modal-close" data-close>×</button></div><div class="df-approval-detail-meta"><span>상태 <b>${esc(STATUS[d.status]||d.status)}</b></span><span>기안자 <b>${esc(person(d.requester_id).name||'-')}</b></span><span>기안일 <b>${fmtDate(d.created_at)}</b></span>${d.quality_revision?`<span>연결 문서 <b>품질매뉴얼 Rev.${esc(d.quality_revision)}</b></span>`:''}</div>${decodeForm(d.content)&&templates()?`<section class="df-approval-original-view">${templates().render(decodeForm(d.content).template,decodeForm(d.content).data,formContext(d,steps,logs))}</section>`:`<section class="df-approval-content"><h3>기안내용</h3><div>${esc(readableContent(d)).replace(/\n/g,'<br>')}</div></section>`}<section class="df-approval-line"><h3>결재선</h3><div>${steps.map(s=>`<article class="${esc(s.status)}"><small>${esc(s.step_name)}</small><strong>${esc(person(s.approver_id).name||'결재자')}</strong><span>${esc(person(s.approver_id).job_title||person(s.approver_id).team||'')}</span><b>${s.status==='approved'?'승인':s.status==='rejected'?'반려':s.status==='pending'?'결재대기':'대기'}</b>${s.acted_at?`<time>${fmtDate(s.acted_at)}</time>`:''}${s.opinion?`<p>${esc(s.opinion)}</p>`:''}</article>`).join('')}</div></section><section class="df-approval-attachment"><h3>첨부파일</h3>${files.length?files.map(f=>`<button type="button" data-file-id="${esc(f.id)}">📎 ${esc(f.file_name)} <small>${(Number(f.file_size||0)/1024/1024).toFixed(2)}MB</small></button>`).join(''):'<p>첨부파일이 없습니다.</p>'}</section><section class="df-approval-audit"><h3>처리이력</h3>${logs.map(l=>`<p><time>${fmtDate(l.created_at)}</time><b>${esc(person(l.actor_id).name||'사용자')}</b><span>${l.action==='submitted'?'결재 상신':l.action==='approved'?'승인':l.action==='rejected'?'반려':esc(l.action)}</span></p>`).join('')||'<p>처리이력이 없습니다.</p>'}</section>${canAct?`<section class="df-approval-decision"><textarea id="dfApOpinion" placeholder="승인 또는 반려 의견을 입력하세요."></textarea><button class="company-btn danger" data-reject>반려</button><button class="company-btn primary" data-approve>승인</button></section>`:''}<div class="df-approval-detail-actions">${admin()?'<button class="company-btn danger" data-delete>관리자 삭제</button>':''}${canDraft(d)?'<button class="company-btn primary" data-edit>기안 수정</button>':''}<button class="company-btn secondary" data-print>인쇄 / PDF</button><button class="company-btn secondary" data-close>닫기</button></div></div>`;
    templates()?.fit?.(m);
    const close=()=>{m.hidden=true;m.style.display='none'};m.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);m.onclick=null;m.querySelector('[data-edit]')?.addEventListener('click',()=>{close();openForm(d)});m.querySelector('[data-delete]')?.addEventListener('click',()=>removeDoc(d,m));m.querySelector('[data-print]').onclick=()=>printDoc(d,steps,logs);m.querySelector('[data-approve]')?.addEventListener('click',()=>act(d,'approve',m));m.querySelector('[data-reject]')?.addEventListener('click',()=>act(d,'reject',m));m.querySelectorAll('[data-file-id]').forEach(b=>b.onclick=()=>openFile(files.find(x=>x.id===b.dataset.fileId)));
  }
  async function removeDoc(d,modal){
    if(!admin())return alert('관리자만 결재문서를 삭제할 수 있습니다.');
    if(!confirm(`결재문서 ${d.approval_no}를 삭제할까요?\n연차 결재라면 일정과 사용 연차도 함께 원상복구됩니다.\n삭제이력은 감사용으로 보존됩니다.`))return;
    try{const r=await db().rpc('df_approval_admin_delete',{p_document:d.id,p_reason:'관리자 화면 삭제'});if(r.error)throw r.error;modal.hidden=true;modal.style.display='none';await load();msg('결재문서를 삭제했습니다. 관련 일정·연차도 안전하게 정리했습니다.','ok')}
    catch(e){alert('결재문서 삭제 실패\n'+(e.message||e));window.DF_DIAG?.error('INTERNAL-APPROVAL','관리자 결재문서 삭제 실패',e.message||String(e))}
  }
  async function act(d,action,modal){if(!requireAction('update'))return;const opinion=$('dfApOpinion')?.value.trim()||'';if(action==='reject'&&!opinion)return alert('반려 사유를 입력해주세요.');if(!confirm(action==='approve'?'이 결재단계를 승인할까요?':'이 문서를 반려할까요?'))return;try{const r=await db().rpc('df_approval_act',{p_document:d.id,p_action:action,p_opinion:opinion});if(r.error)throw r.error;modal.hidden=true;modal.style.display='none';await load();msg(action==='approve'?'승인 처리가 완료되었습니다.':'반려 처리되었습니다.',action==='approve'?'ok':'warn')}catch(e){alert('결재 처리 실패\n'+(e.message||e));window.DF_DIAG?.error('INTERNAL-APPROVAL','승인·반려 처리 실패',e.message||String(e))}}
  async function openFile(file){if(!file)return;const r=await db().storage.from(BUCKET).createSignedUrl(file.storage_path,600);if(r.error)return alert('첨부파일 열기 실패\n'+r.error.message);window.open(r.data.signedUrl,'_blank','noopener')}
  function printDoc(d,steps,logs){const payload=decodeForm(d.content);if(payload){if(!templates())return alert('원본 양식 파일을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');return showFormPreview(payload.template,payload.data,formContext(d,steps,logs))}const w=window.open('about:blank','_blank');if(!w)return alert('팝업 차단을 해제해주세요.');w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(d.approval_no)}</title><style>@page{size:A4 portrait;margin:16mm}*{box-sizing:border-box}body{font-family:'Malgun Gothic',sans-serif;color:#172f43;margin:0}header{border-bottom:3px solid #183c57;padding-bottom:12px}header h1{font-size:24px;margin:6px 0}.meta{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid #aaa;margin:15px 0}.meta span{padding:7px;border:1px solid #ddd;font-size:11px}.line{display:flex;justify-content:flex-end;margin:15px 0}.line div{width:32mm;height:27mm;border:1px solid #777;text-align:center;padding:4px;font-size:10px}.line b{display:block;margin:5px}.content{min-height:130mm;border:1px solid #aaa;padding:12px;line-height:1.7;font-size:11px}.history{margin-top:14px;font-size:9px}.history p{margin:3px 0}button{position:fixed;right:12px;top:12px}@media print{button{display:none}}</style></head><body><button onclick="print()">인쇄 / PDF</button><header><small>DREAMFOREN INTERNAL APPROVAL</small><h1>${esc(d.title)}</h1><b>${esc(d.approval_no)}</b></header><div class="line">${steps.map(s=>`<div>${esc(s.step_name)}<b>${esc(person(s.approver_id).name||'')}</b>${s.status==='approved'?'승인':s.status==='rejected'?'반려':STATUS[d.status]||''}<br>${s.acted_at?esc(String(s.acted_at).slice(0,10)):''}</div>`).join('')}</div><div class="meta"><span>문서종류 <b>${esc(TYPES[d.doc_type]||d.doc_type)}</b></span><span>기안자 <b>${esc(person(d.requester_id).name||'-')}</b></span><span>기안일 <b>${fmtDate(d.created_at)}</b></span><span>상태 <b>${esc(STATUS[d.status]||d.status)}</b></span></div><section class="content">${esc(readableContent(d)).replace(/\n/g,'<br>')}</section><section class="history"><b>처리이력</b>${logs.map(l=>`<p>${fmtDate(l.created_at)} · ${esc(person(l.actor_id).name||'사용자')} · ${esc(l.action)}</p>`).join('')}</section></body></html>`);w.document.close()}
  window.dfApprovalOpenForQuality=(row,manual)=>{
    state.preset={doc_type:'quality_manual',title:`품질 매뉴얼 Rev.${row.version} 개정 승인`,content:`문서번호: DFEN-QM-00\n개정번호: Rev.${row.version}\n개정사유: ${manual?.metadata?.last_change_reason||'개정 내용 검토'}\n\n품질매뉴얼 개정 초안을 검토하고 승인하여 주시기 바랍니다.`,quality_document_id:row.id,quality_revision:row.version,locked:true};
    load().then(()=>{const duplicate=state.docs.find(x=>x.quality_document_id===row.id&&['submitted','in_review','approved'].includes(x.status));if(duplicate)openDetail(duplicate.id);else openForm(null,state.preset)})
  };
  window.dfApprovalOpenTemplate=kind=>startForm({template:kind});
  window.dfApprovalOpenPreset=preset=>{
    state.preset=preset||{};load().then(()=>{const duplicate=state.docs.find(x=>((preset.quality_section_revision_id&&x.quality_section_revision_id===preset.quality_section_revision_id)||(preset.leave_request_id&&x.leave_request_id===preset.leave_request_id))&&['submitted','in_review','approved'].includes(x.status));if(duplicate)openDetail(duplicate.id);else openForm(null,state.preset)})
  };
  document.addEventListener('df:menu-permissions-changed',()=>{if($('dfApprovalNew'))$('dfApprovalNew').hidden=!can('create')});
  document.addEventListener('DOMContentLoaded',()=>{
    $('dfApprovalRefresh')?.addEventListener('click',load);$('dfApprovalNew')?.addEventListener('click',()=>startForm());['dfApprovalStatus','dfApprovalType'].forEach(id=>$(id)?.addEventListener('change',render));$('dfApprovalSearch')?.addEventListener('input',render);document.querySelectorAll('[data-ap-summary]').forEach(b=>b.onclick=()=>{state.summary=b.dataset.apSummary;document.querySelectorAll('[data-ap-summary]').forEach(x=>x.classList.toggle('active',x===b));render()});$('dfApprovalList')?.addEventListener('click',e=>{const card=e.target.closest('[data-ap-id]');if(card&&e.target.closest('[data-ap-open]'))openDetail(card.dataset.apId)});document.querySelector('[data-view="approval"]')?.addEventListener('click',()=>setTimeout(load,30));setTimeout(()=>{if(me())load()},1500);
  },{once:true});
})();


