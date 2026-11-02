/* DREAMFOREN Beta 3.67 · focused reconciliation of bank rows and verified manual receipts. */
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number(value||0).toLocaleString('ko-KR')+'원';
  const sameReason='은행 원본과 수기 입금이 같은 실제 입금임을 확인',separateReason='은행 원본이 수기 기록과 별도인 실제 입금임을 확인';
  function isHeld(payment){const marker=payment?.import_meta?.manual_receipt_review;return marker?.version===367&&marker.status==='pending';}
  const count=payments=>(payments||[]).filter(isHeld).length;
  const canResolveSame=(candidate,bank)=>candidate?.can_resolve_same!==false&&candidate?.payment?.status==='matched'&&!!candidate.payment.matched_customer_key&&Number(candidate.payment.amount)===Number(bank.amount)&&(candidate.payment.payment_date===bank.payment_date||candidate.can_resolve_same===true);
  const validContext=value=>!!value&&typeof value.snapshot==='string'&&Array.isArray(value.rows)&&value.rows.every(row=>row?.bank&&typeof row.bank.unique_key==='string'&&Array.isArray(row.candidates)&&row.candidates.every(candidate=>candidate?.payment&&typeof candidate.payment.unique_key==='string'));
  const message=error=>error?.code==='PGRST202'?'수기입금 대조 기능이 준비되지 않았습니다. 90번 SQL 적용 여부를 확인해주세요.':error?.message||String(error);
  async function open(options){
    const {openModal,client,actorId,requireAction,load,setStatus,state}=options||{};
    if(typeof openModal!=='function'||!client?.rpc||typeof actorId!=='function'||typeof requireAction!=='function'||typeof load!=='function')throw Error('수기입금 대조 화면의 연결을 확인해주세요.');
    if(!requireAction('view'))return null;
    const actor=actorId();if(!actor)return null;
    const {modal,close}=openModal('dfErpManualBankReviewModal','<div class="company-modal df-erp-entry-modal"><div class="company-modal-head"><div><h2>수기입금 대조</h2><small>직접 등록한 입금과 은행 원본을 확인합니다.</small></div><button type="button" class="company-modal-close" aria-label="대조 닫기">×</button></div><div class="company-modal-body" role="status">최신 입금 내역을 불러오는 중…</div></div>');
    const token={};modal._erpManualBankToken=token;
    let busy=false,changed=false,finished=false,context=null,lockedControls=null;
    const drafts=new Map();
    const current=()=>actor===actorId()&&(!options.getClient||options.getClient()===client)&&modal._erpManualBankToken===token&&!modal.hidden;
    const notify=(text,bad=false)=>{if(typeof setStatus==='function')setStatus(text,bad);};
    const finish=async()=>{if(busy||finished)return;finished=true;close();if(changed&&currentIdentity()&&typeof options.onResolved==='function'){try{await options.onResolved();}catch(error){notify('대조 결과는 저장됐습니다. ERP 화면을 다시 열어주세요.',true);}}};
    const currentIdentity=()=>actor===actorId()&&(!options.getClient||options.getClient()===client);
    modal._erpRequestClose=()=>{if(!busy)void finish();};
    const assertCurrent=()=>{if(!current())throw Error('로그인 또는 화면 연결이 바뀌었습니다. 대조 화면을 다시 열어주세요.');};
    function notice(text,bad=false){const box=modal.querySelector('[data-review-status]')||modal.querySelector('.company-modal-body');if(box){box.textContent=text;box.style.color=bad?'#a73f32':'';}}
    function captureDrafts(){modal.querySelectorAll('[data-review-form]').forEach(form=>{drafts.set(form.closest('[data-bank-key]').dataset.bankKey,{fingerprint:form._erpReviewFingerprint,decision:form.elements.decision.value,manual:form.elements.manual.value,reason:form.elements.reason.value});});}
    function lockAll(){lockedControls=[...modal.querySelectorAll('input,select,textarea,button')].map(control=>({control,disabled:control.disabled}));lockedControls.forEach(({control})=>control.disabled=true);}
    function unlockAll(){if(lockedControls){lockedControls.forEach(({control,disabled})=>{if(control.isConnected)control.disabled=disabled;});lockedControls=null;}root.DFMenuPermissions?.apply?.(modal);}
    async function fetchContext(){
      const result=await client.rpc('df_erp_manual_bank_review_context_v367',{});if(result.error)throw result.error;assertCurrent();
      if(!validContext(result.data))throw Error('대조할 입금 내역을 확인하지 못했습니다. 최신 자료를 다시 불러와주세요.');
      context=result.data;render();
    }
    function render(){
      if(!current())return;
      const rows=context.rows;
      const card=modal.querySelector('.company-modal');
      card.innerHTML=`<div class="company-modal-head"><div><h2>수기입금 대조</h2><small>확인이 필요한 은행 입금 ${rows.length.toLocaleString()}건</small></div><button type="button" class="company-modal-close" aria-label="대조 닫기">×</button></div><div style="padding:16px 20px"><p style="margin:0 0 12px;line-height:1.65">통장 원본과 직접 등록한 입금을 대조해 선택해주세요. 확인이 끝난 입금은 이 목록에서 사라집니다.</p><p data-review-status role="status" aria-live="polite" style="margin:0 0 12px"></p><button type="button" class="company-btn secondary" data-review-refresh>최신 대조 내역 불러오기</button></div><div class="erp-modal-scroll" style="padding-top:0">${rows.map((row,index)=>{
        const bank=row.bank;
        const candidates=row.candidates;
        const eligible=candidates.filter(candidate=>canResolveSame(candidate,bank));
        return `<article data-bank-key="${esc(bank.unique_key)}" style="padding:14px 0;border-top:1px solid #dce7ee"><h3 style="font-size:13px;margin:0 0 8px">은행 입금 ${index+1} · ${esc(bank.payment_date)} · ${money(bank.amount)}</h3><p style="margin:0 0 5px;overflow-wrap:anywhere">입금자 <b>${esc(bank.depositor_name||'미표시')}</b>${bank.bank_name?' · '+esc(bank.bank_name):''}</p>${bank.description?`<p style="margin:0 0 5px;overflow-wrap:anywhere">${esc(bank.description)}</p>`:''}<small style="display:block;color:#8194a0;overflow-wrap:anywhere">원본 ${esc(bank.source_file||'은행 업로드')}</small><div style="margin:12px 0;padding:10px 12px;background:#f5f8fa;border-radius:7px"><b>비교할 수기 입금 ${candidates.length}건 · 연결 가능 ${eligible.length}건</b>${candidates.map(candidate=>{const p=candidate.payment;return `<p style="margin:8px 0 0;line-height:1.55;overflow-wrap:anywhere">${esc(candidate.customer_name||'업체 확인 필요')}<br>${esc(p.payment_date)} · ${money(p.amount)} · ${esc(p.depositor_name||'입금자 미표시')}${!canResolveSame(candidate,bank)?`<br><span style="color:#9c6d45">${esc(candidate.unavailable_reason||'현재 같은 입금으로 연결할 수 없습니다. 날짜·금액·기존 연결을 확인해주세요.')}</span>`:''}</p>`;}).join('')||'<p style="margin:8px 0 0">현재 연결 가능한 수기 입금이 없습니다. 최신 내역을 확인한 뒤 실제 별도 입금인지 판단해주세요.</p>'}</div><form data-review-form class="df-erp-entry-form" style="padding:0;gap:10px"><label class="wide">대조 결과<select name="decision" required><option value="">선택해주세요</option><option value="same" ${!eligible.length?'disabled':''}>같은 입금 → 기존 수기기록에 연결</option><option value="separate">별도 실제 입금 → 추가 반영 허용</option></select></label><label class="wide" data-review-manual-label hidden>연결할 수기 입금<select name="manual" disabled><option value="">수기 입금 선택</option>${candidates.map(candidate=>{const p=candidate.payment;return `<option value="${esc(p.unique_key)}" ${!canResolveSame(candidate,bank)?'disabled':''}>${esc(candidate.customer_name||'업체 확인 필요')} · ${esc(p.payment_date)} · ${money(p.amount)} · ${esc(p.depositor_name||'입금자 미표시')}${!canResolveSame(candidate,bank)?' · 연결 확인 필요':''}</option>`;}).join('')}</select></label><label class="wide">대조 메모 <small>(선택)</small><textarea name="reason" rows="2" maxlength="1000" placeholder="입금자명 차이 등 확인한 내용을 적어주세요."></textarea></label><p class="wide" role="status" data-row-status style="margin:0"></p><div class="wide"><button type="submit" class="company-btn primary" data-df-menu-module="billing" data-df-menu-action="update" data-df-menu-legacy="true">선택한 대조 결과 저장</button></div></form></article>`;
      }).join('')||'<div class="df-doc-empty">대조할 입금이 없습니다.</div>'}</div>`;
      card.querySelector('.company-modal-close').onclick=()=>modal._erpRequestClose();
      lockedControls=null;
      const refresh=card.querySelector('[data-review-refresh]');
      refresh.onclick=async()=>{if(busy)return;captureDrafts();busy=true;lockAll();try{assertCurrent();await fetchContext();}catch(error){if(current())notice(message(error),true);}finally{busy=false;unlockAll();}};
      card.querySelectorAll('[data-review-form]').forEach(form=>bindForm(form,rows.find(row=>row.bank.unique_key===form.closest('[data-bank-key]').dataset.bankKey)));
      root.DFMenuPermissions?.apply?.(modal);
    }
    function bindForm(form,row){
      const decision=form.elements.decision,manual=form.elements.manual,reason=form.elements.reason,submit=form.querySelector('[type="submit"]'),errorBox=form.querySelector('[data-row-status]');
      let request=null,serverConfirmed=false;
      const selectedCandidate=()=>row.candidates.find(candidate=>candidate.payment.unique_key===manual.value);
      const needsDateReason=()=>decision.value==='same'&&!!selectedCandidate()&&(selectedCandidate().payment.payment_date!==row.bank.payment_date||selectedCandidate().reason_required===true);
      const update=()=>{const same=decision.value==='same';form.querySelector('[data-review-manual-label]').hidden=!same;manual.disabled=!same;manual.required=same;const required=needsDateReason();reason.required=required;reason.minLength=required?5:0;reason.closest('label').querySelector('small').textContent=required?'(날짜 차이 확인 사유 5자 이상 필수)':'(선택)';errorBox.textContent='';};
      decision.onchange=manual.onchange=update;update();
      form._erpReviewFingerprint=JSON.stringify(row);
      const draft=drafts.get(row.bank.unique_key);
      if(draft){reason.value=draft.reason;if(draft.fingerprint===form._erpReviewFingerprint){decision.value=draft.decision;manual.value=draft.manual;update();}else if(draft.decision||draft.manual)errorBox.textContent='대조 대상의 상태가 바뀌었습니다. 메모는 유지했으니 대조 결과와 연결할 입금을 다시 선택해주세요.';}
      form.addEventListener('invalid',event=>{event.preventDefault();const field=[...form.elements].find(x=>x.willValidate&&!x.validity.valid)||event.target;errorBox.textContent=field.name==='manual'?'연결할 수기 입금을 선택해주세요.':field.name==='reason'?'입금일이 다른 이유를 5자 이상 직접 입력해주세요.':'대조 결과를 선택해주세요.';field.focus();},true);
      form.onsubmit=async event=>{
        event.preventDefault();if(busy||submit.disabled)return;
        try{
          assertCurrent();if(!requireAction('update'))return;
          const selected=decision.value;
          if(!['same','separate'].includes(selected))throw Error('대조 결과를 선택해주세요.');
          const manualKey=selected==='same'?manual.value:null;
          if(selected==='same'&&!row.candidates.some(x=>x.payment.unique_key===manualKey&&canResolveSame(x,row.bank)))throw Error('현재 연결할 수기 입금을 선택해주세요.');
          const enteredReason=reason.value.trim();
          if(needsDateReason()&&(enteredReason.length<5||enteredReason===sameReason||enteredReason===separateReason))throw Error('입금일이 다른 이유를 5자 이상 직접 입력해주세요.');
          const note=enteredReason||(selected==='same'?sameReason:separateReason);
          const values={p_bank_key:row.bank.unique_key,p_manual_key:manualKey,p_decision:selected,p_expected_snapshot:context.snapshot,p_reason:note};
          const signature=JSON.stringify(values);
          if(!request||request.signature!==signature)request={signature,id:root.crypto.randomUUID()};
          captureDrafts();busy=true;lockAll();errorBox.textContent='대조 결과 저장 중…';
          const result=await client.rpc('df_erp_resolve_manual_bank_v367',{...values,p_request_id:request.id});if(result.error)throw result.error;serverConfirmed=true;
          assertCurrent();
          if(!validContext(result.data?.context)||result.data?.bank?.unique_key!==row.bank.unique_key)throw Error('저장 응답을 다시 확인해야 합니다. 최신 내역을 불러와주세요.');
          changed=true;context=result.data.context;
          if(state?.payments){const saved=result.data.bank;state.payments=state.payments.filter(x=>x.unique_key!==saved.unique_key).concat(saved);}
          const refreshed=await load();assertCurrent();
          notify(refreshed?'수기입금 대조를 저장했습니다.':'대조 결과는 저장됐습니다. 최신 원장 조회를 위해 새로고침해주세요.',!refreshed);
          busy=false;
          if(!context.rows.length){await finish();return;}
          render();notice(`대조 결과를 저장했습니다. 남은 입금 ${context.rows.length}건을 확인해주세요.`);
        }catch(error){
          if(current()){
            errorBox.textContent=serverConfirmed?'서버에 저장됐습니다. 같은 처리를 반복하지 말고 최신 대조 내역을 불러와주세요.':message(error);
            if(!serverConfirmed){unlockAll();update();errorBox.textContent=message(error);}
            else{const refresh=modal.querySelector('[data-review-refresh]'),closeButton=modal.querySelector('.company-modal-close');if(refresh)refresh.disabled=false;if(closeButton)closeButton.disabled=false;}
          }
        }finally{busy=false;}
      };
    }
    try{await fetchContext();}catch(error){if(current())notice(message(error),true);}
    return modal;
  }
  root.DFErpManualBank=Object.freeze({isHeld,count,open});
})(typeof window!=='undefined'?window:globalThis);
