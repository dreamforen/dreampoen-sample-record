/* DREAMFOREN QMS SECTION CONTROL · v120.37.18.1 · full-page document editor */
(function(){
  'use strict';
  const PDF='assets/quality_manual_rev02.pdf';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const st={sections:[],revisions:[],mode:'original',selected:null,editor:null,autoTimer:null};
  const db=()=>{try{return dfSupabase}catch(_){return null}};
  const me=()=>{try{return dfCloudUser?.id||''}catch(_){return ''}};
  const admin=()=>{try{return String(dfCloudProfile?.role||'')==='admin'||dfCloudProfile?.access_permissions?.quality_edit===true}catch(_){return false}};
  const baseSection=code=>window.DF_QMS_EMBEDDED_MANUAL?.sections?.find(x=>x.code===code);
  const message=(x,type='ok')=>{const e=$('dfQmsMessage');if(e){e.textContent=x;e.className='df-qms-message '+type}};
  const revisionNumber=v=>Number(String(v||'0').replace(/\D/g,''))||0;
  const sourceRevision=s=>String(Math.max(3,revisionNumber(s?.current_revision))).padStart(2,'0');
  const nextRev=v=>String(revisionNumber(v)+1).padStart(2,'0');
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

  async function load(){
    st.sections=[];st.revisions=[];
    try{
      const a=await db().from('quality_manual_sections').select('*').eq('active',true).order('section_code');
      if(a.error)throw a.error;
      st.sections=(a.data||[]).map(s=>({...s,current_revision:sourceRevision(s)}));
      const ids=st.sections.map(x=>x.id);
      if(ids.length){
        const r=await db().from('quality_section_revisions').select('*').in('section_id',ids).order('created_at',{ascending:false});
        if(r.error)throw r.error;
        st.revisions=r.data||[];
      }
      message('수정완료본과 장별 개정상태를 불러왔습니다.','ok');
    }catch(e){
      message('장별 개정관리 DB 설치가 필요합니다. 기준 PDF는 그대로 열람할 수 있습니다. · 23_v12029_quality_sections_leave.sql','bad');
      window.DF_DIAG?.error('QMS-SECTION','장별 개정관리 조회 실패',e.message||String(e));
    }
    render();
  }

  function allHistory(){
    const original=(window.DF_QMS_EMBEDDED_MANUAL?.revision_history||[]).map(x=>({revision:x.revision,date:x.date,scope:x.scope,reason:x.reason,source:'기준본'}));
    const managed=st.revisions.map(x=>{const s=st.sections.find(y=>y.id===x.section_id);return{revision:x.revision,date:String(x.approved_at||x.created_at||'').slice(0,10),scope:`${s?.section_no||''} ${s?.title||'장별 개정'}`.trim(),reason:`${x.change_reason||'변경사유 미입력'} · ${x.status==='active'?'승인본':x.status==='obsolete'?'구본':x.status==='submitted'?'결재중':x.status==='rejected'?'반려':'자동저장 초안'}`,source:'장별'}});
    return [...managed,...original];
  }
  function renderHistory(){
    const history=allHistory();
    if($('dfQmsHistory'))$('dfQmsHistory').innerHTML=history.map(x=>`<tr><td><b>Rev.${esc(x.revision)}</b></td><td>${esc(x.date||'-')}</td><td>${esc(x.scope)}</td><td>${esc(x.reason)} <small>(${esc(x.source)})</small></td></tr>`).join('')||'<tr><td colspan="4">누적 개정이력이 없습니다.</td></tr>';
  }
  function summary(){
    const active=st.revisions.filter(x=>x.status==='active').length;
    const draft=st.revisions.filter(x=>x.status==='draft'||x.status==='submitted').length;
    $('dfQmsSummary').innerHTML=`<div><span>기준 문서</span><strong>2025 검토·수정완료본</strong></div><div><span>전체 장</span><strong>${st.sections.length||20}개</strong></div><div><span>장별 승인본</span><strong>${active}개</strong></div><div><span>개정 진행</span><strong>${draft}개</strong></div><div><span>기준 개정</span><strong>Rev.03</strong></div>`;
    renderHistory();
  }
  function sectionRows(s){
    const rs=st.revisions.filter(x=>x.section_id===s.id);
    return {rs,current:rs.find(x=>x.status==='active'),draft:rs.find(x=>x.status==='draft'||x.status==='submitted')};
  }
  function render(){
    summary();
    const rev=document.querySelector('.df-qms-revision'),work=document.querySelector('.df-qms-workspace'),toc=$('dfQmsToc'),paper=$('dfQmsPaper');
    $('dfQmsRegister').hidden=true;$('dfQmsRevise').hidden=true;$('dfQmsApprove').hidden=true;
    $('dfQmsOriginalMode').className='company-btn '+(st.mode==='original'?'primary':'secondary');
    $('dfQmsSectionMode').className='company-btn '+(st.mode==='sections'?'primary':'secondary');
    if(st.mode==='original'){
      rev.hidden=true;work.style.gridTemplateColumns='1fr';document.querySelector('.df-qms-toc').hidden=true;
      paper.className='df-qms-paper df-qms-pdf-paper';
      paper.innerHTML=`<div class="df-qms-pdf-tools"><b>품질 매뉴얼 · 2025 검토·수정완료본</b><a class="company-btn secondary" href="${PDF}" target="_blank">새 창에서 열기</a></div><iframe class="df-qms-pdf-frame" src="${PDF}#page=1&view=FitH" title="품질 매뉴얼 수정완료본 PDF"></iframe>`;
      return;
    }
    rev.hidden=false;work.style.gridTemplateColumns='260px minmax(0,1fr)';document.querySelector('.df-qms-toc').hidden=false;paper.className='df-qms-paper df-qms-section-paper';
    toc.innerHTML=st.sections.map(s=>`<button type="button" data-qms-section="${esc(s.id)}"><span>${esc(s.section_no)}</span>${esc(s.title)}</button>`).join('')||'<p>SQL 설치 후 장별 목록이 표시됩니다.</p>';
    paper.innerHTML=st.sections.map(card).join('')||'<div class="df-doc-empty"><b>장별 관리 DB가 아직 준비되지 않았습니다.</b><br>기준 PDF 보기에서는 현재 문서를 그대로 확인할 수 있습니다.</div>';
    select(st.selected||st.sections[0]?.id);
  }
  function card(s){
    const {current,draft}=sectionRows(s);
    const shown=draft||current;
    const rev=shown?.revision||sourceRevision(s);
    return `<article class="df-qms-section-card" data-section-card="${esc(s.id)}"><header><div><span>${esc(s.section_no)}</span><h2>${esc(s.title)}</h2></div><b>${esc(s.section_code)}</b></header><div class="df-qms-section-status"><span>표시 개정<strong>Rev.${esc(rev)}</strong></span><span>기준 PDF<strong>${s.pdf_start_page}${s.pdf_end_page>s.pdf_start_page?'~'+s.pdf_end_page:''}쪽</strong></span><span>개정상태<strong>${draft?(draft.status==='submitted'?'결재 진행중':'자동저장 초안'):'최신본'}</strong></span></div><div class="df-qms-section-actions"><button class="company-btn secondary" data-source-page="${s.pdf_start_page}">기준 PDF</button><button class="company-btn secondary" data-document-view>문서 보기·인쇄</button>${admin()?(draft?.status==='submitted'?'<button class="company-btn secondary" disabled>결재 진행중</button>':`<button class="company-btn primary" data-section-edit>${draft?'계속 편집':'문서 편집'}</button>${draft?.status==='draft'?'<button class="company-btn danger" data-draft-delete="'+esc(draft.id)+'">초안 삭제</button>':''}`):''}</div>${draft?`<div class="df-qms-draft-note">Rev.${esc(draft.revision)} · ${esc(draft.change_reason||'변경 사유 입력 전')}</div>`:''}</article>`;
  }
  function select(id){
    st.selected=id;
    document.querySelectorAll('[data-section-card]').forEach(x=>x.classList.toggle('selected',x.dataset.sectionCard===id));
    document.querySelectorAll('[data-qms-section]').forEach(x=>x.classList.toggle('active',x.dataset.qmsSection===id));
    renderHistory();
  }
  function sourcePage(page){window.open(`${PDF}#page=${page}&view=FitH`,'_blank','noopener')}

  function plainToHtml(text){
    return String(text||'').split(/\n\s*\n|\n/).map(v=>v.trim()).filter(Boolean).map(v=>{
      const heading=/^(적용 ?범위|목 ?적|책임과 권한|용어의 정의|관련 문서|일반사항|관리 기준|시험 후 관리|데이터 관리)$/.test(v)||(/^\d+(?:\.\d+)+\s/.test(v));
      return heading?`<h3>${esc(v)}</h3>`:`<p>${esc(v)}</p>`;
    }).join('');
  }
  function baseHtml(s){return plainToHtml((baseSection(s.section_code)?.paragraphs||[]).join('\n'))}
  function readContent(raw,s,revision){
    if(raw){
      try{const x=JSON.parse(raw);if(x?.schema==='dreampoen-qms-rich-v1')return{html:x.html||'',title:x.title||s.title,section_no:x.section_no||s.section_no,effective_date:x.effective_date||today(),revision:x.revision||revision}}
      catch(_){/* legacy plain text */}
      if(/^\s*</.test(raw))return{html:raw,title:s.title,section_no:s.section_no,effective_date:today(),revision};
      return{html:plainToHtml(raw),title:s.title,section_no:s.section_no,effective_date:today(),revision};
    }
    return{html:baseHtml(s),title:s.title,section_no:s.section_no,effective_date:today(),revision};
  }
  function sanitizeHtml(html){
    const doc=new DOMParser().parseFromString(`<div>${html||''}</div>`,'text/html');
    const allowed=new Set(['P','DIV','SPAN','BR','STRONG','B','EM','I','U','S','H2','H3','H4','OL','UL','LI','TABLE','THEAD','TBODY','TR','TH','TD','BLOCKQUOTE','FONT']);
    const styles=new Set(['text-align','margin-left','text-indent','font-size','font-family','font-weight','font-style','text-decoration','color','line-height']);
    [...doc.body.querySelectorAll('*')].forEach(el=>{
      if(el===doc.body.firstElementChild)return;
      if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);return}
      [...el.attributes].forEach(a=>{if(a.name!=='style'&&!['color','face','size'].includes(a.name))el.removeAttribute(a.name)});
      if(el.hasAttribute('style')){
        const keep=[];
        for(const name of styles){const value=el.style.getPropertyValue(name);if(value&&!/url|expression|javascript/i.test(value))keep.push(`${name}:${value}`)}
        if(keep.length)el.setAttribute('style',keep.join(';'));else el.removeAttribute('style');
      }
    });
    return doc.body.firstElementChild?.innerHTML||'';
  }
  function latestFor(s){const {current,draft}=sectionRows(s);return draft||current||null}

  function editorTemplate(s,row,revision,readonly){
    const data=readContent(row?.content,s,revision),reason=row?.change_reason||'';
    return `<section id="dfQmsDocumentEditor" class="df-qms-document-editor${readonly?' is-readonly':''}" aria-label="품질 매뉴얼 문서 ${readonly?'보기':'편집'}"><header class="df-qms-editor-top"><div><button type="button" class="df-qms-editor-back" data-editor-close>← 품질 매뉴얼</button><small>${readonly?'문서 열람·인쇄':'한글 문서형 편집'}</small><h1>${esc(s.section_no)} ${esc(s.title)}</h1></div><div class="df-qms-editor-top-actions"><span id="dfQmsSaveState">${readonly?'읽기 전용':row?'저장된 초안':'수정 시 자동 저장'}</span><button type="button" class="company-btn secondary" data-editor-print>인쇄 / PDF</button>${readonly?'':`<button type="button" class="company-btn secondary" data-editor-save>지금 저장</button><button type="button" class="company-btn primary" data-editor-submit>저장 후 결재상신</button>`}</div></header>${readonly?'':toolbar()}<div class="df-qms-editor-layout"><aside class="df-qms-editor-meta"><h2>문서 정보</h2><label>항목 번호<input id="dfQmsEditSectionNo" value="${esc(data.section_no)}" ${readonly?'readonly':''}></label><label>목차 제목<input id="dfQmsEditTitle" value="${esc(data.title)}" ${readonly?'readonly':''}></label><label>문서번호<input value="${esc(s.section_code)}" readonly></label><label>개정번호<input id="dfQmsEditRevision" value="Rev.${esc(revision)}" readonly></label><label>시행 예정일<input id="dfQmsEditDate" type="date" value="${esc(data.effective_date)}" ${readonly?'readonly':''}></label>${readonly?'':`<label>변경 사유<textarea id="dfQmsSectionReason" placeholder="변경 위치와 사유를 입력하세요.">${esc(reason)}</textarea></label><p>본문·문서정보를 바꾸면 자동으로 초안에 저장됩니다. 결재 승인 후 최신본이 됩니다.</p>`}<button type="button" class="company-btn secondary" data-editor-source>기준 PDF ${s.pdf_start_page}${s.pdf_end_page>s.pdf_start_page?'~'+s.pdf_end_page:''}쪽</button></aside><main class="df-qms-editor-canvas"><article class="df-qms-edit-page" id="dfQmsEditPage"><header class="df-qms-page-header"><div class="df-qms-page-brand">DREAMFOREN<br><small>주식회사 드림포이엔</small></div><div class="df-qms-page-doc-title">품질 매뉴얼</div><dl><div><dt>문서번호</dt><dd>${esc(s.section_code)}</dd></div><div><dt>개정번호</dt><dd data-live-revision>Rev.${esc(revision)}</dd></div></dl></header><section class="df-qms-page-section-title"><span id="dfQmsLiveSectionNo">${esc(data.section_no)}</span><h2 id="dfQmsLiveTitle">${esc(data.title)}</h2></section><div id="dfQmsSectionContent" class="df-qms-rich-content" contenteditable="${readonly?'false':'true'}" spellcheck="false">${sanitizeHtml(data.html)}</div><footer class="df-qms-page-footer"><span>주식회사 드림포이엔 품질경영시스템</span><b>${esc(s.section_code)}</b><span data-live-revision>Rev.${esc(revision)}</span><span id="dfQmsLiveDate">${esc(data.effective_date)}</span></footer></article></main></div></section>`;
  }
  function toolbar(){
    return `<div class="df-qms-format-toolbar" id="dfQmsFormatToolbar"><select data-format="block" aria-label="문단 모양"><option value="p">본문</option><option value="h2">큰 제목</option><option value="h3">중간 제목</option><option value="h4">작은 제목</option></select><select data-format="font" aria-label="글꼴"><option value="Malgun Gothic">맑은 고딕</option><option value="Batang">바탕</option><option value="Dotum">돋움</option><option value="Gulim">굴림</option></select><select data-format="size" aria-label="글자 크기"><option value="2">9pt</option><option value="3" selected>10.5pt</option><option value="4">12pt</option><option value="5">14pt</option><option value="6">18pt</option><option value="7">24pt</option></select><span class="df-qms-tool-separator"></span><button type="button" data-cmd="bold" title="굵게"><b>가</b></button><button type="button" data-cmd="italic" title="기울임"><i>가</i></button><button type="button" data-cmd="underline" title="밑줄"><u>가</u></button><label class="df-qms-color-tool" title="글자색"><span>A</span><input type="color" value="#111111" data-format="color"></label><span class="df-qms-tool-separator"></span><button type="button" data-cmd="justifyLeft" title="왼쪽 정렬">≡</button><button type="button" data-cmd="justifyCenter" title="가운데 정렬">≡</button><button type="button" data-cmd="justifyRight" title="오른쪽 정렬">≡</button><button type="button" data-cmd="justifyFull" title="양쪽 정렬">☰</button><span class="df-qms-tool-separator"></span><button type="button" data-cmd="insertOrderedList" title="번호 목록">1.</button><button type="button" data-cmd="insertUnorderedList" title="글머리표">•</button><button type="button" data-cmd="outdent" title="내어쓰기">←</button><button type="button" data-cmd="indent" title="들여쓰기">→</button><select data-format="line" aria-label="줄 간격"><option value="1.4">줄 140%</option><option value="1.6">줄 160%</option><option value="1.8" selected>줄 180%</option><option value="2">줄 200%</option></select><button type="button" data-cmd="removeFormat" title="서식 지우기">서식 지움</button></div>`;
  }

  function openDocument(s,readonly=false){
    if(!s)return;
    const rows=sectionRows(s),row=readonly?latestFor(s):rows.draft?.status==='draft'?rows.draft:null;
    const baseline=rows.current?.revision||sourceRevision(s),revision=row?.revision||(readonly?baseline:nextRev(baseline));
    const host=$('dfViewQualityManual');
    $('dfQmsDocumentEditor')?.remove();host.insertAdjacentHTML('beforeend',editorTemplate(s,row,revision,readonly));
    document.querySelector('.df-qms-shell').hidden=true;host.classList.add('df-qms-editor-open');
    st.editor={s,row,revision,readonly,dirty:false,saving:false,queued:false};bindEditor();
    if(!readonly)$('dfQmsSectionContent')?.focus();
  }
  function updateLiveChrome(){
    const no=$('dfQmsEditSectionNo')?.value||st.editor?.s.section_no||'',title=$('dfQmsEditTitle')?.value||st.editor?.s.title||'',date=$('dfQmsEditDate')?.value||today();
    if($('dfQmsLiveSectionNo'))$('dfQmsLiveSectionNo').textContent=no;if($('dfQmsLiveTitle'))$('dfQmsLiveTitle').textContent=title;if($('dfQmsLiveDate'))$('dfQmsLiveDate').textContent=date;
    const h=$('dfQmsDocumentEditor')?.querySelector('.df-qms-editor-top h1');if(h)h.textContent=`${no} ${title}`.trim();
  }
  function saveState(text,type='normal'){const e=$('dfQmsSaveState');if(e){e.textContent=text;e.className=type}}
  function markDirty(){if(!st.editor||st.editor.readonly)return;st.editor.dirty=true;updateLiveChrome();saveState('변경사항 확인 중','pending');clearTimeout(st.autoTimer);st.autoTimer=setTimeout(()=>saveDraft(false,true),1000)}
  function applyLineHeight(value){
    const sel=window.getSelection();if(!sel?.rangeCount)return;let el=sel.anchorNode?.nodeType===1?sel.anchorNode:sel.anchorNode?.parentElement;
    while(el&&el!==$('dfQmsSectionContent')&&!/^(P|DIV|H2|H3|H4|LI|BLOCKQUOTE)$/.test(el.tagName))el=el.parentElement;
    if(el&&el!==$('dfQmsSectionContent'))el.style.lineHeight=value;else $('dfQmsSectionContent').style.lineHeight=value;
  }
  function bindEditor(){
    const ed=$('dfQmsDocumentEditor'),content=$('dfQmsSectionContent');ed.querySelector('[data-editor-close]').onclick=closeEditor;ed.querySelector('[data-editor-print]').onclick=printEditor;ed.querySelector('[data-editor-source]').onclick=()=>sourcePage(st.editor.s.pdf_start_page);if(st.editor.readonly)return;
    ed.querySelector('[data-editor-save]').onclick=()=>saveDraft(false,false);ed.querySelector('[data-editor-submit]').onclick=()=>saveDraft(true,false);
    [content,$('dfQmsEditSectionNo'),$('dfQmsEditTitle'),$('dfQmsEditDate'),$('dfQmsSectionReason')].forEach(x=>x?.addEventListener('input',markDirty));
    content.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveDraft(false,false)}});
    const bar=$('dfQmsFormatToolbar');bar.addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});
    bar.addEventListener('click',e=>{const b=e.target.closest('[data-cmd]');if(!b)return;content.focus();document.execCommand(b.dataset.cmd,false,null);markDirty()});
    bar.addEventListener('change',e=>{const x=e.target,f=x.dataset.format;if(!f)return;content.focus();if(f==='block')document.execCommand('formatBlock',false,x.value);if(f==='font')document.execCommand('fontName',false,x.value);if(f==='size')document.execCommand('fontSize',false,x.value);if(f==='color')document.execCommand('foreColor',false,x.value);if(f==='line')applyLineHeight(x.value);markDirty()});
  }
  async function saveDraft(submit=false,automatic=false){
    const e=st.editor;if(!e||e.readonly)return;if(submit&&!$('dfQmsSectionReason').value.trim())return alert('결재상신 전에 변경 사유를 입력해주세요.');if(e.saving){e.queued=true;return}if(!e.dirty&&!submit){if(!automatic)saveState('이미 저장되어 있습니다.','saved');return}
    e.saving=true;e.queued=false;saveState(automatic?'자동 저장 중':'저장 중','pending');
    const html=sanitizeHtml($('dfQmsSectionContent').innerHTML),title=$('dfQmsEditTitle').value.trim()||e.s.title,sectionNo=$('dfQmsEditSectionNo').value.trim()||e.s.section_no,reason=$('dfQmsSectionReason').value.trim(),effectiveDate=$('dfQmsEditDate').value||today();
    const content=JSON.stringify({schema:'dreampoen-qms-rich-v1',html,title,section_no:sectionNo,revision:e.revision,effective_date:effectiveDate});
    try{
      let row=e.row;
      if(row){const q=await db().from('quality_section_revisions').update({content,change_reason:reason,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','draft').select().single();if(q.error)throw q.error;row=q.data}
      else{const q=await db().from('quality_section_revisions').insert({section_id:e.s.id,revision:e.revision,status:'draft',content,change_reason:reason,created_by:me()}).select().single();if(q.error)throw q.error;row=q.data}
      if(title!==e.s.title||sectionNo!==e.s.section_no){const q=await db().from('quality_manual_sections').update({title,section_no:sectionNo,updated_at:new Date().toISOString()}).eq('id',e.s.id);if(q.error)throw q.error;e.s.title=title;e.s.section_no=sectionNo}
      e.row=row;const ix=st.revisions.findIndex(x=>x.id===row.id);if(ix>=0)st.revisions[ix]=row;else st.revisions.unshift(row);
      const unchanged=html===sanitizeHtml($('dfQmsSectionContent').innerHTML)&&title===$('dfQmsEditTitle').value.trim()&&sectionNo===$('dfQmsEditSectionNo').value.trim()&&reason===$('dfQmsSectionReason').value.trim();e.dirty=!unchanged;saveState(e.dirty?'추가 변경사항 있음':'자동 저장됨','saved');
      if(submit){await closeEditor(true);if(typeof window.dfApprovalOpenPreset!=='function')throw Error('내부결재 모듈을 불러오지 못했습니다.');window.dfApprovalOpenPreset({doc_type:'quality_document',title:`${sectionNo} ${title} Rev.${e.revision} 개정 승인`,content:`문서번호: ${e.s.section_code}\n개정대상: ${sectionNo} ${title}\n개정번호: Rev.${e.revision}\n시행 예정일: ${effectiveDate}\n변경사유: ${reason}`,quality_section_revision_id:row.id,locked:true})}
    }catch(err){saveState('저장 실패','error');alert('장별 개정 저장 실패\n'+(err.message||err));window.DF_DIAG?.error('QMS-SECTION','장별 개정 저장 실패',err.message||String(err))}
    finally{e.saving=false;if(e.queued||e.dirty){clearTimeout(st.autoTimer);st.autoTimer=setTimeout(()=>saveDraft(false,true),800)}}
  }
  async function closeEditor(skipSave=false){
    const e=st.editor;if(!e)return;clearTimeout(st.autoTimer);if(!skipSave&&e.dirty&&!e.readonly){await saveDraft(false,false);if(e.dirty)return}$('dfQmsDocumentEditor')?.remove();document.querySelector('.df-qms-shell').hidden=false;$('dfViewQualityManual').classList.remove('df-qms-editor-open');st.editor=null;await load();
  }
  function printEditor(){document.body.classList.add('df-qms-document-printing');window.print();setTimeout(()=>document.body.classList.remove('df-qms-document-printing'),500)}
  async function deleteDraft(s,id){if(!admin()||!id)return;if(!confirm(`${s.section_no} ${s.title}의 개정 초안을 삭제할까요?\n현재 승인본과 기준 PDF는 그대로 유지됩니다.`))return;const q=await db().from('quality_section_revisions').delete().eq('id',id).eq('status','draft');if(q.error)return alert('초안 삭제 실패\n'+q.error.message);message(`${s.section_no} ${s.title} 초안을 삭제했습니다.`,'ok');await load()}

  window.dfQmsSectionOpen=()=>{window.v62ShowOnly?.('quality-manual');load()};
  document.addEventListener('click',e=>{const back=e.target.closest('#dfDocBack');if(back){e.preventDefault();e.stopImmediatePropagation();window.v62ShowOnly?.('quality')}},{capture:true});
  document.addEventListener('DOMContentLoaded',()=>{
    $('dfQmsOriginalMode').onclick=()=>{st.mode='original';render()};$('dfQmsSectionMode').onclick=()=>{st.mode='sections';render()};$('dfQmsPrint').onclick=()=>sourcePage(1);
    $('dfQmsSearch').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('[data-section-card]').forEach(x=>x.hidden=!!q&&!x.textContent.toLowerCase().includes(q));document.querySelectorAll('[data-qms-section]').forEach(x=>x.hidden=!!q&&!x.textContent.toLowerCase().includes(q))});
    $('dfQmsToc').addEventListener('click',e=>{const b=e.target.closest('[data-qms-section]');if(b){select(b.dataset.qmsSection);document.querySelector(`[data-section-card="${b.dataset.qmsSection}"]`)?.scrollIntoView({behavior:'smooth',block:'center'})}});
    $('dfQmsPaper').addEventListener('click',e=>{const c=e.target.closest('[data-section-card]'),s=st.sections.find(x=>x.id===c?.dataset.sectionCard);if(!s)return;const del=e.target.closest('[data-draft-delete]');if(del)deleteDraft(s,del.dataset.draftDelete);else if(e.target.closest('[data-source-page]'))sourcePage(s.pdf_start_page);else if(e.target.closest('[data-document-view]'))openDocument(s,true);else if(e.target.closest('[data-section-edit]'))openDocument(s,false);else select(s.id)});
  },{once:true});
})();
