/* Annual amount entry. Calculation stays local; data uses the existing bid save. */
(function(root){
  'use strict';
  const M=root.DFBidAnalysisModel,states=new WeakMap();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v===null||v===undefined?'—':Math.round(v).toLocaleString('ko-KR')+'원';
  const value=(modal,id)=>modal.querySelector('#'+id)?.value||'';
  const ids=['bidTitle','bidAgency','bidDeadline','bidBase','bidVat','bidRate','bidRange','bidOurs','bidWinner','bidStatus','bidActualEstimate','bidNoticeNo','bidPricingMethod'];
  function canEdit(action){try{return typeof dfMenuCan==='function'&&dfMenuCan('bid',action,typeof dfCloudProfile!=='undefined'&&dfCloudProfile?.role==='admin');}catch(_){return false;}}
  const writable=(modal,s)=>canEdit(s.record.id?'update':'create')&&modal.dataset.bidSaving!=='1';
  function annualPayload(s,rate){
    return s.annual.filter(x=>String(x.base_amount??'').trim()||String(x.winning_amount??'').trim()).map(x=>({year:M.number(x.year),base_amount:M.number(x.base_amount),winning_amount:M.number(x.winning_amount),lower_rate:String(x.lower_rate??'').trim()?M.number(x.lower_rate):M.number(rate)}));
  }
  function current(modal){
    const s=states.get(modal),x={...s.record,title:value(modal,'bidTitle'),agency:value(modal,'bidAgency'),deadline:value(modal,'bidDeadline'),
      base_amount:value(modal,'bidBase'),vat_mode:value(modal,'bidVat'),lower_rate:value(modal,'bidRate'),range_percent:value(modal,'bidRange'),
      our_bid_amount:value(modal,'bidOurs'),winning_amount:value(modal,'bidWinner'),status:value(modal,'bidStatus'),
      actual_estimated_price:value(modal,'bidActualEstimate'),notice_no:value(modal,'bidNoticeNo'),pricing_method:value(modal,'bidPricingMethod')};
    x.memo=serializeMemo(modal,value(modal,'bidMemo'));return x;
  }
  function nextYear(modal,s){
    const fromDate=Number(value(modal,'bidDeadline').slice(0,4));
    const thisYear=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()));
    let year=(fromDate>=1900&&fromDate<=9999?fromDate:thisYear)-1;
    const used=new Set(s.annual.map(x=>Number(x.year)));
    while(used.has(year)&&year>1900)year--;
    return Math.max(1900,year);
  }
  function addRow(modal,s){
    s.annual.push({year:nextYear(modal,s),base_amount:'',winning_amount:'',lower_rate:value(modal,'bidRate')});
  }
  function mount(modal,record={},records=[]){
    if(!modal?.querySelector('.df-bid-form'))return;
    const form=modal.querySelector('.df-bid-form'),memo=M.readMemo(record.memo),previous=states.get(modal);
    if(previous?.form===form){previous.records=records;return update(modal);}
    const s={form,record,records,meta:memo.meta,annual:Array.isArray(memo.meta.annual_history)?memo.meta.annual_history.map(x=>({...x})).sort((a,b)=>Number(b.year)-Number(a.year)):[]};
    states.set(modal,s);modal.dataset.bidAnalysis='annual';
    const memoInput=modal.querySelector('#bidMemo');if(memoInput)memoInput.value=memo.text;
    const conditions=modal.querySelector('[data-bid-field-group="1"] .df-bid-form-grid')||form;
    const results=modal.querySelector('[data-bid-field-group="2"] .df-bid-form-grid')||form;
    conditions.insertAdjacentHTML('beforeend','<label>낙찰금액 산정방식<select id="bidPricingMethod"><option value="floor">예정가격 × 하한율 · 최저가</option><option value="other">다른 낙찰방식 · 별도 검토</option></select></label><label>나라장터 공고번호<input id="bidNoticeNo" placeholder="공고번호 또는 공고 URL" maxlength="300"></label>');
    results.insertAdjacentHTML('beforeend','<label>실제 예정가격 (개찰 후)<input id="bidActualEstimate" type="text" inputmode="numeric" placeholder="미확정이면 비워두세요"></label>');
    modal.querySelector('#bidNoticeNo').value=memo.meta.notice_no||M.noticeNo(record.memo);
    modal.querySelector('#bidActualEstimate').value=memo.meta.actual_estimated_price?Number(memo.meta.actual_estimated_price).toLocaleString('ko-KR'):'';
    modal.querySelector('#bidPricingMethod').value=memo.meta.pricing_method==='other'?'other':'floor';
    const actual=modal.querySelector('#bidActualEstimate');
    actual.addEventListener('focus',()=>{actual.value=actual.value.replace(/,/g,'');});
    actual.addEventListener('blur',()=>{const n=M.number(actual.value);if(n!==null)actual.value=n.toLocaleString('ko-KR');});
    const section=document.createElement('section');section.className='df-bid-annual';section.setAttribute('aria-label','연도별 입찰금액');
    section.innerHTML='<div class="df-bid-annual-head"><h3>연도별 금액</h3><span>금액: VAT 포함 · 원</span><button type="button" class="company-btn secondary" data-bid-annual-add>+ 연도 추가</button></div><div class="df-bid-annual-rows" data-bid-annual-rows></div><p class="df-bid-annual-message" data-bid-annual-message role="status" aria-live="polite"></p>';
    form.insertBefore(section,form.querySelector(':scope > .df-doc-editor-actions'));
    section.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT')e.preventDefault();});
    section.querySelector('[data-bid-annual-add]').onclick=()=>{if(!writable(modal,s)||s.annual.length>=M.MAX_HISTORY)return;addRow(modal,s);drawRows(modal);update(modal);section.querySelector('[data-bid-annual-row]:last-child input')?.focus();};
    ids.forEach(id=>{const node=modal.querySelector('#'+id);if(node){node.addEventListener('input',()=>update(modal));node.addEventListener('change',()=>update(modal));}});
    const heading=form.querySelector('.df-bid-overview-bid h3');if(heading)heading.textContent='예측금액';
    if(!s.annual.length)addRow(modal,s);
    drawRows(modal);update(modal);
  }
  function serializeMemo(modal,plain){
    const s=states.get(modal);if(!s)return plain;
    return M.writeMemo(plain,{...s.meta,annual_history:annualPayload(s,value(modal,'bidRate')),notice_no:M.noticeNo(value(modal,'bidNoticeNo')),
      actual_estimated_price:M.number(value(modal,'bidActualEstimate')),pricing_method:value(modal,'bidPricingMethod')});
  }
  function validation(modal){
    const s=states.get(modal);if(!s)return '';
    const annual=M.analyzeAnnual(current(modal),s.annual);if(annual.errors.length)return annual.errors[0].message;
    const input=value(modal,'bidActualEstimate'),actual=M.number(input),base=M.baseAmount(current(modal)),range=M.number(value(modal,'bidRange'));
    if(input&&(!(actual>0)||!base||range===null||actual<base*(1-range/100)-1||actual>base*(1+range/100)+1))return '실제 예정가격이 기초금액 ± 예가 범위 안에 있는지 확인해주세요.';
    if(value(modal,'bidNoticeNo').trim()&&!M.noticeNo(value(modal,'bidNoticeNo')))return '나라장터 공고번호 또는 나라장터 공고 URL을 확인해주세요.';
    return '';
  }
  function drawRows(modal){
    const s=states.get(modal),enabled=writable(modal,s),list=s.form.querySelector('[data-bid-annual-rows]');
    list.innerHTML=s.annual.map((row,i)=>'<div class="df-bid-annual-row" data-bid-annual-row="'+i+'">'+
      [['year','연도','numeric'],['base_amount','기초금액','numeric'],['winning_amount','낙찰금액','numeric'],['lower_rate','하한율 (%)','decimal']].map(([key,label,mode])=>{
        let val=row[key]??'';if(['base_amount','winning_amount'].includes(key)){const n=M.number(val);if(n!==null)val=n.toLocaleString('ko-KR');}
        return '<label class="df-bid-annual-'+key+'">'+label+'<input type="text" inputmode="'+mode+'" data-annual-key="'+key+'" aria-label="'+(i+1)+'행 '+label+'" value="'+esc(val)+'" '+(enabled?'':'disabled')+'></label>';
      }).join('')+'<div class="df-bid-annual-assessment"><span>추정 사정률</span><strong data-annual-assessment>—</strong></div><button type="button" class="company-btn secondary" data-annual-remove aria-label="'+(i+1)+'행 삭제" '+(enabled?'':'disabled')+'>삭제</button><small data-annual-error></small></div>').join('');
    list.querySelectorAll('[data-bid-annual-row]').forEach(node=>{
      const i=Number(node.dataset.bidAnnualRow);
      node.querySelectorAll('[data-annual-key]').forEach(input=>{
        const key=input.dataset.annualKey;
        input.addEventListener('input',()=>{if(!writable(modal,s))return;s.annual[i][key]=input.value;update(modal);});
        input.addEventListener('change',()=>{if(!writable(modal,s))return;s.annual[i][key]=input.value;update(modal);});
        if(['base_amount','winning_amount'].includes(key)){
          input.addEventListener('focus',()=>{input.value=input.value.replace(/,/g,'');});
          input.addEventListener('blur',()=>{const n=M.number(input.value);if(n!==null)input.value=n.toLocaleString('ko-KR');});
        }
      });
      node.querySelector('[data-annual-remove]').onclick=()=>{if(!writable(modal,s))return;s.annual.splice(i,1);drawRows(modal);update(modal);};
    });
  }
  function update(modal){
    const s=states.get(modal);if(!s)return;
    const target=current(modal),result=M.analyzeAnnual(target,s.annual);s.result=result;
    const recommendation=modal.querySelector('#bidRecommend');let decision=modal.querySelector('#dfBidDecisionSupport');
    if(!decision){decision=document.createElement('div');decision.id='dfBidDecisionSupport';decision.className='df-bid-decision-support';(s.form.querySelector('[data-bid-overview-analysis]')||s.form).append(decision);}
    recommendation.innerHTML='<b class="df-bid-recommend-amount">'+money(result.recommended)+'</b><span class="df-bid-recommend-range">VAT 포함 총액</span><button type="button" class="company-btn secondary" data-bid-apply-analysis>우리 투찰금액에 넣기</button>';
    const apply=recommendation.querySelector('[data-bid-apply-analysis]');apply.disabled=!writable(modal,s)||result.recommended===null;
    apply.onclick=()=>{if(!writable(modal,s)||result.recommended===null)return;const own=modal.querySelector('#bidOurs');own.value=own.type==='number'?String(result.recommended):result.recommended.toLocaleString('ko-KR');own.dispatchEvent(new Event('input',{bubbles:true}));};
    decision.innerHTML='<h3>입력자료 기준</h3><dl class="df-bid-analysis-metrics"><div><dt>연도별 자료</dt><dd>'+result.count+'건</dd></div><div><dt>평균 추정 사정률</dt><dd>'+(result.averageAssessment===null?'—':result.averageAssessment.toFixed(4)+'%')+'</dd></div></dl><small>낙찰금액·하한율 기준 환산</small>';
    const message=s.form.querySelector('[data-bid-annual-message]');
    message.textContent=result.message||'';message.hidden=!result.message;
    s.form.querySelectorAll('[data-bid-annual-row]').forEach(node=>{
      const i=Number(node.dataset.bidAnnualRow),row=result.rows.find(x=>x.index===i),error=result.errors.find(x=>x.index===i);
      node.querySelector('[data-annual-assessment]').textContent=row?.assessment!==null&&row?.assessment!==undefined?row.assessment.toFixed(4)+'%':'—';
      node.querySelector('[data-annual-error]').textContent=error?.message||'';
      node.querySelectorAll('[data-annual-key]').forEach(el=>{el.disabled=!writable(modal,s);if(error)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid');});
      node.querySelector('[data-annual-remove]').disabled=!writable(modal,s);
    });
    s.form.querySelector('[data-bid-annual-add]').disabled=!writable(modal,s)||s.annual.length>=M.MAX_HISTORY;
  }
  function refresh(modal,records){const s=states.get(modal);if(!s)return;if(Array.isArray(records))s.records=records;update(modal);}
  root.DFBidAnalysis={mount,update,refresh,serializeMemo,validation,current};
})(window);
