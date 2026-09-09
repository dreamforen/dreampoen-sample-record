/* DREAMFOREN QMS · v120.28.1 */
(function(){
  'use strict';
  const SOURCE='./assets/quality_manual_rev02.json?v=12028100', DOC_NO='DFEN-QM-00';
  let manual=null, dbRows=[], currentDb=null, editing=false;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const admin=()=>{try{return String(dfCloudProfile?.role||'').toLowerCase()==='admin'}catch(_){return false}};
  const client=()=>{try{return dfSupabase}catch(_){return null}};
  const userId=()=>{try{return dfCloudUser?.id||null}catch(_){return null}};
  const msg=(text,type='')=>{const e=$('dfQmsMessage');if(e){e.className='df-qms-message '+type;e.textContent=text}};
  const revNum=v=>Number(String(v||'0').replace(/\D/g,''))||0;
  const nextRev=v=>String(revNum(v)+1).padStart(2,'0');
  const clone=v=>JSON.parse(JSON.stringify(v));

  async function source(){
    if(window.DF_QUALITY_MANUAL_SOURCE?.sections?.length)return clone(window.DF_QUALITY_MANUAL_SOURCE);
    const r=await fetch(SOURCE,{cache:'no-store'});if(!r.ok)throw Error(`QMS_SOURCE_HTTP_${r.status}`);const data=await r.json();if(!data?.sections?.length)throw Error('QMS_SOURCE_INVALID');return data
  }
  function parseContent(row){try{const x=JSON.parse(row?.content||'');return x?.schema?.startsWith('dreampoen-qms')?x:null}catch(_){return null}}
  async function load(){
    msg('품질매뉴얼을 불러오는 중입니다.');
    try{
      const base=await source(); manual=base; dbRows=[]; currentDb=null;
      const db=client();
      if(db&&userId()){
        const {data,error}=await db.from('quality_documents').select('*').eq('category','quality_manual').eq('doc_no',DOC_NO).order('updated_at',{ascending:false});
        if(!error){dbRows=data||[];const draft=dbRows.find(x=>x.status==='draft'),active=dbRows.find(x=>x.status==='active');currentDb=draft||active||null;const saved=parseContent(currentDb);if(saved)manual=saved}
        else{window.DF_DIAG?.warn('QMS-MANUAL','DB 승인본 조회 실패 · 내장 기준본으로 계속',`${error.code||'DB_ERROR'} · ${error.message||error}`)}
      }
      render();
      msg(currentDb?(currentDb.status==='draft'?`Rev.${currentDb.version} 개정 초안을 표시합니다.`:`Rev.${currentDb.version} 승인본을 표시합니다.`):'HWP에서 변환한 기준본을 표시합니다. 관리자 등록 전에는 원본이 변경되지 않습니다.','ok');
    }catch(e){const detail=e?.message||String(e);msg('품질매뉴얼 원본을 불러오지 못했습니다. 오류진단 로그의 QMS-MANUAL 항목을 확인해주세요.','bad');window.DF_DIAG?.error('QMS-MANUAL','품질매뉴얼 원본 불러오기 실패',`${detail} · source=${SOURCE} · embedded=${!!window.DF_QUALITY_MANUAL_SOURCE}`)}
  }
  function render(){
    if(!manual)return; const m=manual.metadata||{}, hist=manual.revision_history||[], status=currentDb?.status||'source', rev=currentDb?.version||m.cover_revision||'02';
    $('dfQmsSummary').innerHTML=`<div><span>문서번호</span><strong>${esc(m.doc_no||DOC_NO)}</strong></div><div><span>문서명</span><strong>${esc(m.title||'품질 매뉴얼')}</strong></div><div><span>현재 표시본</span><strong>Rev.${esc(rev)}</strong></div><div><span>문서상태</span><strong class="state-${esc(status)}">${status==='active'?'승인·시행':status==='draft'?'개정 작성중':'HWP 기준본'}</strong></div><div><span>최초 제정</span><strong>${esc(m.first_issued||'-')}</strong></div>`;
    $('dfQmsHistory').innerHTML=hist.map(x=>`<tr><td><b>${esc(x.revision)}</b></td><td>${esc(x.date)}</td><td>${esc(x.scope)}</td><td>${esc(x.reason)}</td></tr>`).join('');
    $('dfQmsToc').innerHTML=(manual.sections||[]).map(s=>`<a href="#qms-${esc(s.code)}" data-qms-link="${esc(s.code)}"><span>${esc(s.number)}</span>${esc(s.title)}</a>`).join('');
    $('dfQmsPaper').innerHTML=`<section class="df-qms-cover"><p>${esc(m.company)}</p><h2>${esc(m.title)}</h2><div>${esc(m.doc_no||DOC_NO)}</div><strong>Rev.${esc(rev)}</strong><small>최초 제정일 ${esc(m.first_issued||'-')}</small></section><div class="df-qms-warning"><b>원본 확인사항</b>${esc(manual.source_warning||'')}</div>${(manual.sections||[]).map(sectionHtml).join('')}`;
    $('dfQmsRegister').hidden=!admin()||!!dbRows.length; $('dfQmsRevise').hidden=!admin()||!dbRows.some(x=>x.status==='active')||!!dbRows.some(x=>x.status==='draft');$('dfQmsApprove').hidden=!admin()||currentDb?.status!=='draft';
    editing=currentDb?.status==='draft'&&admin();
  }
  function sectionHtml(s){
    return `<section class="df-qms-chapter" id="qms-${esc(s.code)}" data-qms-code="${esc(s.code)}"><header><div><span>${esc(s.number)}</span><h2>${esc(s.title)}</h2></div><small>${esc(s.code)}</small></header><div class="df-qms-body">${(s.paragraphs||[]).map((p,i)=>`<p>${esc(p)}</p>`).join('')}</div>${editing?'<button type="button" class="df-qms-edit df-admin-only" data-qms-edit>이 장 편집</button>':''}</section>`;
  }
  async function registerBase(){
    if(!admin()||!manual||!confirm('현재 HWP 기준본을 Rev.02 승인본으로 DB에 등록할까요?\n원본의 Rev.03 이력 표기는 확인사항으로 유지됩니다.'))return;
    const db=client();if(!db)return msg('DB 연결을 확인해주세요.','bad');
    const payload={category:'quality_manual',doc_no:DOC_NO,title:'품질 매뉴얼',version:'02',status:'active',content:JSON.stringify(manual),file_name:'01. 품질 매뉴얼 Rev.02.hwp',mime_type:'application/x-hwp',file_size:0,created_by:userId(),updated_by:userId(),updated_at:new Date().toISOString()};
    const {error}=await db.from('quality_documents').insert(payload);if(error)return msg('DB 기준본 등록 실패 · '+error.message,'bad');await load()
  }
  async function startRevision(){
    if(!admin())return;const active=dbRows.find(x=>x.status==='active');if(!active)return msg('먼저 승인된 기준본이 필요합니다.','bad');
    const version=nextRev(active.version);if(!confirm(`Rev.${version} 개정 초안을 시작할까요?\n초안 저장 중에는 기존 승인본이 유지됩니다.`))return;
    const data=clone(parseContent(active)||manual);data.metadata={...data.metadata,working_revision:version};
    const {error}=await client().from('quality_documents').insert({category:'quality_manual',doc_no:DOC_NO,title:'품질 매뉴얼',version,status:'draft',content:JSON.stringify(data),file_name:active.file_name||'',mime_type:active.mime_type||'',file_size:active.file_size||0,created_by:userId(),updated_by:userId(),updated_at:new Date().toISOString()});
    if(error)return msg('개정 초안 생성 실패 · '+error.message,'bad');await load()
  }
  async function approveRevision(){
    if(!admin()||currentDb?.status!=='draft')return;const reason=manual?.metadata?.last_change_reason||'';
    if(!reason)return alert('각 장 편집에서 이번 변경 사유를 먼저 입력해주세요.');
    if(typeof window.dfApprovalOpenForQuality!=='function')return alert('내부결재 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    window.dfApprovalOpenForQuality(currentDb,manual)
  }
  function editSection(code){
    if(!editing)return;const s=manual.sections.find(x=>x.code===code);if(!s)return;
    let modal=$('dfQmsEditModal');if(!modal){modal=document.createElement('div');modal.id='dfQmsEditModal';modal.className='company-modal-backdrop';document.body.appendChild(modal)}
    modal.hidden=false;modal.style.display='flex';modal.innerHTML=`<div class="company-modal df-qms-editor"><div class="company-modal-head"><div><h2>${esc(s.number)} ${esc(s.title)}</h2><small>${esc(s.code)} · Rev.${esc(currentDb.version)} 초안</small></div><button type="button" class="company-modal-close">×</button></div><label>본문 <textarea id="dfQmsEditText">${esc((s.paragraphs||[]).join('\n'))}</textarea></label><label>이번 변경 사유 <input id="dfQmsEditReason" placeholder="예: 현장평가 보완사항 반영"></label><div class="df-qms-editor-actions"><button type="button" class="company-btn secondary" data-close>취소</button><button type="button" class="company-btn primary" data-save>초안 저장</button></div></div>`;
    const close=()=>{modal.hidden=true;modal.style.display='none'};modal.querySelector('.company-modal-close').onclick=close;modal.querySelector('[data-close]').onclick=close;
    modal.querySelector('[data-save]').onclick=async()=>{s.paragraphs=$('dfQmsEditText').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);const reason=$('dfQmsEditReason').value.trim();manual.metadata.last_change_reason=reason;const {error}=await client().from('quality_documents').update({content:JSON.stringify(manual),updated_by:userId(),updated_at:new Date().toISOString()}).eq('id',currentDb.id);if(error)return alert('초안 저장 실패\n'+error.message);close();render();msg(`Rev.${currentDb.version} 초안을 저장했습니다. Rev 번호는 승인 전까지 증가하지 않습니다.`,'ok')}
  }
  function printManual(){window.print()}
  function search(){const q=$('dfQmsSearch').value.trim().toLowerCase();document.querySelectorAll('.df-qms-chapter').forEach(el=>{el.hidden=!!q&&!el.textContent.toLowerCase().includes(q)});document.querySelectorAll('[data-qms-link]').forEach(a=>{const section=document.getElementById('qms-'+a.dataset.qmsLink);a.hidden=!!section?.hidden})}
  window.dfQualityManualOpen=()=>{window.v62ShowOnly?.('quality-manual');load()};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-doc-category="quality_manual"]');if(b){e.preventDefault();e.stopImmediatePropagation();window.dfQualityManualOpen()}},{capture:true});
  document.addEventListener('DOMContentLoaded',()=>{
    $('dfQmsBack')?.addEventListener('click',()=>window.v62ShowOnly?.('quality'));$('dfQmsPrint')?.addEventListener('click',printManual);$('dfQmsRegister')?.addEventListener('click',registerBase);$('dfQmsRevise')?.addEventListener('click',startRevision);$('dfQmsApprove')?.addEventListener('click',approveRevision);$('dfQmsSearch')?.addEventListener('input',search);$('dfQmsPaper')?.addEventListener('click',e=>{const s=e.target.closest('[data-qms-code]');if(e.target.closest('[data-qms-edit]'))editSection(s?.dataset.qmsCode)});
  },{once:true});
})();
