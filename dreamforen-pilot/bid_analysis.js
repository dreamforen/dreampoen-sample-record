/* One analysis result drives both recommendation and decision support. */
(function(root){
  'use strict';
  const M=root.DFBidAnalysisModel,states=new WeakMap();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v===null||v===undefined?'—':Math.round(v).toLocaleString('ko-KR')+'원';
  const value=(modal,id)=>modal.querySelector('#'+id)?.value||'';
  const ids=['bidTitle','bidAgency','bidDeadline','bidBase','bidVat','bidRate','bidRange','bidOurs','bidWinner','bidStatus','bidActualEstimate','bidNoticeNo','bidPricingMethod'];
  function current(modal){
    const s=states.get(modal),x={...s.record,title:value(modal,'bidTitle'),agency:value(modal,'bidAgency'),deadline:value(modal,'bidDeadline'),
      base_amount:value(modal,'bidBase'),vat_mode:value(modal,'bidVat'),lower_rate:value(modal,'bidRate'),range_percent:value(modal,'bidRange'),
      our_bid_amount:value(modal,'bidOurs'),winning_amount:value(modal,'bidWinner'),status:value(modal,'bidStatus'),
      actual_estimated_price:value(modal,'bidActualEstimate'),notice_no:value(modal,'bidNoticeNo'),pricing_method:value(modal,'bidPricingMethod')};
    x.memo=M.writeMemo(value(modal,'bidMemo'),{...s.meta,history:s.history,notice_no:x.notice_no,pricing_method:x.pricing_method,actual_estimated_price:M.number(x.actual_estimated_price)});
    return x;
  }
  function mount(modal,record={},records=[]){
    if(!modal?.querySelector('.df-bid-form'))return;
    const form=modal.querySelector('.df-bid-form'),memo=M.readMemo(record.memo),previous=states.get(modal);
    if(previous?.form===form){previous.records=records;return update(modal);}
    const s={form,record,records,meta:memo.meta,history:Array.isArray(memo.meta.history)?memo.meta.history.slice(0,M.MAX_HISTORY):[],busy:false};
    states.set(modal,s);modal.dataset.bidAnalysis='1';
    const memoInput=modal.querySelector('#bidMemo');if(memoInput)memoInput.value=memo.text;
    const conditions=modal.querySelector('[data-bid-field-group="1"] .df-bid-form-grid')||form;
    const results=modal.querySelector('[data-bid-field-group="2"] .df-bid-form-grid')||form;
    conditions.insertAdjacentHTML('beforeend','<label>낙찰금액 산정방식<select id="bidPricingMethod"><option value="floor">예정가격 × 하한율 · 최저가</option><option value="other">다른 낙찰방식 · 별도 검토</option></select></label><label>나라장터 공고번호<input id="bidNoticeNo" placeholder="공고번호 또는 공고 URL" maxlength="300"></label>');
    results.insertAdjacentHTML('beforeend','<label>실제 예정가격 (개찰 후)<input id="bidActualEstimate" type="text" inputmode="numeric" placeholder="미확정이면 비워두세요"></label>');
    modal.querySelector('#bidNoticeNo').value=memo.meta.notice_no||M.noticeNo(record.memo);
    modal.querySelector('#bidActualEstimate').value=memo.meta.actual_estimated_price?Number(memo.meta.actual_estimated_price).toLocaleString('ko-KR'):'';
    modal.querySelector('#bidPricingMethod').value=memo.meta.pricing_method==='other'?'other':'floor';
    const actualInput=modal.querySelector('#bidActualEstimate');
    actualInput.addEventListener('focus',()=>{actualInput.value=actualInput.value.replace(/,/g,'');});
    actualInput.addEventListener('blur',()=>{const n=M.number(actualInput.value);if(n!==null)actualInput.value=n.toLocaleString('ko-KR');});
    const section=document.createElement('section');section.className='df-bid-analysis-details';section.setAttribute('aria-label','투찰 분석 근거');
    section.innerHTML='<div data-bid-analysis-risk role="status" aria-live="polite"></div><details open><summary>예정가격에 따른 하한선 비교</summary><p class="df-bid-analysis-help" data-bid-scenario-note></p><div class="df-bid-analysis-scroll" data-bid-analysis-scenarios></div></details><details><summary>계산에 사용한 개찰자료 <span data-bid-history-count></span></summary><div data-bid-analysis-evidence></div></details><details><summary>개찰자료 등록</summary><p class="df-bid-analysis-help">저장된 완료 입찰과 등록한 개찰자료에서 같은 기관·유사 용역·같은 하한율 및 예가 범위를 자동으로 골라 계산합니다. 우리 회사가 써낸 금액은 평균에 사용하지 않습니다.</p><div class="df-bid-analysis-actions"><button type="button" class="company-btn secondary" data-bid-history-template>CSV 양식 받기</button><label class="company-btn secondary df-bid-analysis-upload">CSV·엑셀·JSON 등록<input type="file" accept=".csv,.xlsx,.xls,.json" data-bid-history-file></label><span data-bid-import-count></span></div><p class="df-bid-analysis-help">기초금액·낙찰금액·실제 예정가격은 모두 부가세 포함 총액 기준으로 등록하세요. 자료는 입찰의 저장 버튼을 누르면 함께 보관됩니다.</p><p class="df-bid-analysis-help">현재 자료원: 저장된 개찰결과 + 기본 공개 참고자료. 나라장터 개찰결과의 신규 자동수집은 별도 서버 연결이 필요합니다.</p><p data-bid-import-message role="status"></p><div data-bid-import-list></div></details>';
    form.insertBefore(section,form.querySelector(':scope > .df-doc-editor-actions'));
    ids.forEach(id=>{const node=modal.querySelector('#'+id);if(node){node.addEventListener('input',()=>update(modal));node.addEventListener('change',()=>update(modal));}});
    section.querySelector('[data-bid-history-template]').onclick=()=>downloadTemplate();
    section.querySelector('[data-bid-history-file]').onchange=async e=>{const file=e.target.files[0];if(!file)return;await importFile(modal,file);e.target.value='';};
    drawImports(modal);update(modal);
  }
  function serializeMemo(modal,plain){
    const s=states.get(modal);if(!s)return plain;
    return M.writeMemo(plain,{...s.meta,history:s.history,notice_no:M.noticeNo(value(modal,'bidNoticeNo')),
      actual_estimated_price:M.number(value(modal,'bidActualEstimate')),pricing_method:value(modal,'bidPricingMethod')});
  }
  function validation(modal){
    const s=states.get(modal);if(!s)return '';
    if(s.busy)return '개찰자료를 읽고 있습니다. 완료 후 저장해주세요.';
    const input=value(modal,'bidActualEstimate'),actual=M.number(input),base=M.baseAmount(current(modal)),range=M.number(value(modal,'bidRange'));
    if(input&&(!(actual>0)||!base||range===null||actual<base*(1-range/100)-1||actual>base*(1+range/100)+1))return '실제 예정가격이 기초금액 ± 예가 범위 안에 있는지 확인해주세요.';
    if(value(modal,'bidNoticeNo').trim()&&!M.noticeNo(value(modal,'bidNoticeNo')))return '나라장터 공고번호 또는 나라장터 공고 URL을 확인해주세요.';
    return '';
  }
  function update(modal){
    const s=states.get(modal);if(!s)return;
    const target=current(modal),result=M.analyze(target,s.records,root.DFBidPublicHistory||[]);s.result=result;
    const recommendation=modal.querySelector('#bidRecommend');let decision=modal.querySelector('#dfBidDecisionSupport');
    if(!decision){decision=document.createElement('div');decision.id='dfBidDecisionSupport';decision.className='df-bid-decision-support';(s.form.querySelector('[data-bid-overview-analysis]')||s.form).append(decision);}
    if(!result.valid){
      recommendation.innerHTML='<b class="df-bid-recommend-amount">분석 조건 확인</b><small>'+esc(result.message)+'</small>';
      decision.innerHTML='<h3>자동 분석</h3><p>적용 가능한 낙찰방식과 공고 조건을 입력해주세요.</p>';
      s.form.querySelector('[data-bid-analysis-risk]').textContent=result.message;
      s.form.querySelector('[data-bid-analysis-scenarios]').replaceChildren();s.form.querySelector('[data-bid-analysis-evidence]').replaceChildren();s.form.querySelector('[data-bid-history-count]').textContent='';return;
    }
    const label=result.count?'비교자료 기준 검토금액':'사정률 100% 기준 하한금액';
    recommendation.innerHTML='<span class="df-bid-analysis-kicker">'+label+'</span><b class="df-bid-recommend-amount">'+money(result.recommended)+'</b><span class="df-bid-recommend-range">'+esc(result.method)+'<br>기초금액 대비 '+result.ratio.toFixed(4)+'% · VAT 포함 총액</span><small>'+esc(result.warnings[0])+'</small><button type="button" class="company-btn secondary" data-bid-apply-analysis>우리 투찰금액에 넣기</button>';
    const apply=recommendation.querySelector('[data-bid-apply-analysis]');
    apply.disabled=!canEdit(target.id?'update':'create');apply.onclick=()=>{if(!canEdit(target.id?'update':'create')||modal.dataset.bidSaving==='1')return;const own=modal.querySelector('#bidOurs');own.value=own.type==='number'?String(result.recommended):result.recommended.toLocaleString('ko-KR');own.dispatchEvent(new Event('input',{bubbles:true}));};
    const own=M.number(target.our_bid_amount),gap=own>0&&M.number(target.winning_amount)>0?own-M.number(target.winning_amount):null;
    let cause=own>0?(result.actualEstimate?result.ownOutcome.label:'입력한 투찰금액의 하한 충족 조건을 계산했습니다.'):'검토금액을 입력한 뒤 사정률별 하한 충족 여부를 비교할 수 있습니다.';
    if(gap!==null)cause+=' 최종 낙찰금액과 '+money(Math.abs(gap))+' '+(gap>0?'높은':gap<0?'낮은':'같은')+' 금액입니다.';
    if(gap!==null&&!result.actualEstimate)cause+=' 실제 예정가격이 없어 하한미달 여부는 판정할 수 없습니다.';
    decision.innerHTML='<h3>하한선 분석</h3><p>'+esc(cause)+'</p><dl class="df-bid-analysis-metrics"><div><dt>계산에 사용한 개찰자료</dt><dd>'+result.count+'건 · '+esc(result.sampleLabel)+'</dd></div><div><dt>기초금액 × '+result.rate+'%</dt><dd>'+money(result.neutral)+'</dd></div><div><dt>'+(own>0?'우리 금액이 통과하는 최대 사정률':'검토금액이 통과하는 최대 사정률')+'</dt><dd>'+(own>0?result.maxOwnAssessment:result.maxRecommendedAssessment).toFixed(4)+'%</dd></div></dl><small>사정률 = 예정가격 ÷ 기초금액. 하한 충족은 낙찰을 보장하지 않습니다.</small>';
    const risk=s.form.querySelector('[data-bid-analysis-risk]');risk.dataset.tone=result.ownOutcome.code==='below'||result.ownOutcome.code==='above'?'warning':'info';
    risk.innerHTML=(own>0?'<strong>'+money(own)+'</strong>은 사정률 <strong>'+result.maxOwnAssessment.toFixed(4)+'% 이하</strong>에서 하한선을 충족합니다. ':'')+'예정가격과 참가자격을 충족한 업체 중 최저가가 선정됩니다. '+esc(result.warnings.slice(1).join(' '));
    s.form.querySelector('[data-bid-scenario-note]').textContent=(own>0?'우리 투찰금액 ':'검토금액 ')+money(result.chosen)+' 기준 · 실제 추첨결과의 확률표가 아닙니다.';
    s.form.querySelector('[data-bid-analysis-scenarios]').innerHTML='<table class="df-bid-analysis-table"><caption class="sr-only">사정률별 예정가격 및 투찰 하한선</caption><thead><tr><th>사정률</th><th>예정가격</th><th>하한금액 ('+result.rate+'%)</th><th>가격조건</th></tr></thead><tbody>'+result.scenarios.map(x=>'<tr><td>'+x.assessment.toFixed(1)+'%</td><td>'+money(x.estimate)+'</td><td>'+money(x.floor)+'</td><td><span class="df-bid-analysis-state" data-state="'+esc(x.code)+'">'+esc(x.label)+'</span></td></tr>').join('')+'</tbody></table>';
    s.form.querySelector('[data-bid-history-count]').textContent='· '+result.count+'건';
    s.form.querySelector('[data-bid-analysis-evidence]').innerHTML=result.count?'<p class="df-bid-analysis-help">선정 기준: '+(result.selection.tier===1?'같은 기관 · 연도를 제외한 동일 용역':'같은 기관 · 유사 용역')+' · 같은 하한율·예가 범위 · 완료자료. 각 낙찰금액을 이번 기초금액으로 환산해 단순평균하고 100원 단위로 반올림합니다.</p><div class="df-bid-analysis-scroll"><table class="df-bid-analysis-table"><thead><tr><th>개찰자료</th><th>기초금액 (VAT 포함)</th><th>낙찰금액</th><th>실제 사정률</th><th>이번 기초금액 환산</th></tr></thead><tbody>'+result.rows.map(x=>'<tr><td>'+esc(x.title)+'<small>'+esc(x.agency)+' · '+esc(x.deadline.slice(0,10))+'</small>'+(M.safeUrl(x.source_url)?'<a href="'+esc(M.safeUrl(x.source_url))+'" target="_blank" rel="noopener noreferrer">'+esc(x.source_label)+'</a>':'<small>'+esc(x.source_label)+'</small>')+'</td><td>'+money(x.base)+'</td><td>'+money(x.win)+'</td><td>'+(x.assessment===null?'미등록':x.assessment.toFixed(4)+'%')+'</td><td>'+money(result.base*x.winRatio)+'</td></tr>').join('')+'</tbody></table></div><p class="df-bid-analysis-help">공개 참고자료는 2026-11-25 확인 자료입니다. 누적 입찰·낙찰 건수에는 포함하지 않습니다.</p>':'<p class="df-bid-analysis-help">조건이 맞는 완료 개찰자료가 없습니다. 낙찰금액·하한율·예가 범위를 등록하면 이후 자동으로 비교합니다.</p>';
  }
  function canEdit(action){try{return typeof dfMenuCan==='function'&&dfMenuCan('bid',action,typeof dfCloudProfile!=='undefined'&&dfCloudProfile?.role==='admin');}catch(_){return false;}}
  function refresh(modal,records){const s=states.get(modal);if(!s)return;if(Array.isArray(records))s.records=records;update(modal);}
  function drawImports(modal){
    const s=states.get(modal),count=s.form.querySelector('[data-bid-import-count]'),list=s.form.querySelector('[data-bid-import-list]');
    count.textContent='이 입찰에 등록된 참고자료 '+s.history.length+'건';
    const writable=canEdit(s.record.id?'update':'create');
    list.innerHTML=s.history.map((x,i)=>'<div class="df-bid-import-row"><span>'+esc(x.title)+' · '+money(x.winning_amount)+'</span><button type="button" class="company-btn secondary" data-remove-history="'+i+'" '+(writable?'':'disabled')+'>제외</button></div>').join('');
    list.querySelectorAll('[data-remove-history]').forEach(b=>{b.onclick=()=>{if(!canEdit(s.record.id?'update':'create')||modal.dataset.bidSaving==='1')return;s.history.splice(Number(b.dataset.removeHistory),1);drawImports(modal);update(modal);};});
    const file=s.form.querySelector('[data-bid-history-file]');if(file)file.disabled=!writable;
  }
  const columns={title:['title','입찰명','공고명','용역명'],agency:['agency','발주기관','수요기관'],deadline:['deadline','개찰일','개찰일시','마감일'],base_amount:['base_amount','기초금액'],winning_amount:['winning_amount','낙찰금액','1순위금액'],lower_rate:['lower_rate','낙찰하한율','하한율'],range_percent:['range_percent','예가범위','예가범위%'],actual_estimated_price:['actual_estimated_price','예정가격','실제예정가격'],notice_no:['notice_no','공고번호'],source_url:['source_url','출처URL','출처'],source_label:['source_label','출처명']};
  function mapRows(rows){return rows.filter(row=>Object.values(row).some(v=>String(v??'').trim())).map(row=>{const cleaned=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/^\uFEFF/,'').trim(),v])),out={};for(const [key,aliases]of Object.entries(columns)){out[key]=aliases.map(a=>cleaned[a]).find(v=>v!==undefined&&v!=='');}out.vat_mode='included';return out;});}
  async function importFile(modal,file){
    const s=states.get(modal),message=s.form.querySelector('[data-bid-import-message]');if(!canEdit(s.record.id?'update':'create')||s.busy||modal.dataset.bidSaving==='1')return;
    s.busy=true;message.textContent='개찰자료를 읽고 있습니다.';
    try{
      if(file.size>2*1024*1024)throw Error('2MB 이하의 개찰자료를 선택해주세요.');
      let rows;
      if(/\.json$/i.test(file.name)){const data=JSON.parse(await file.text());rows=Array.isArray(data)?data:data.history;}
      else{if(!root.XLSX)throw Error('엑셀 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');const bytes=await file.arrayBuffer(),wb=root.XLSX.read(bytes,{type:'array',cellDates:false,sheetRows:M.MAX_HISTORY+2});rows=mapRows(root.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{raw:false,defval:''}));}
      const incoming=M.cleanHistory(rows);
      const combined=[...s.history,...incoming],map=new Map();for(const row of combined)map.set(row.notice_no||M.agencyKey(row.agency)+'|'+M.titleKey(row.title)+'|'+row.deadline.slice(0,10),row);
      if(map.size>M.MAX_HISTORY)throw Error('이 입찰에 참고자료를 200건까지 등록할 수 있습니다.');
      if(states.get(modal)!==s||!s.form.isConnected)return;
      s.history=[...map.values()];drawImports(modal);update(modal);message.textContent=incoming.length+'건을 읽었습니다. 입찰을 저장하면 참고자료도 함께 저장됩니다.';
    }catch(e){message.textContent='등록하지 못했습니다. '+e.message;}finally{s.busy=false;}
  }
  function downloadTemplate(){
    const csv='\uFEFF입찰명,발주기관,개찰일,기초금액,낙찰금액,낙찰하한율,예가범위,예정가격,공고번호,출처URL\r\n';
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='bid_history_template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  root.DFBidAnalysis={mount,update,refresh,serializeMemo,validation,current,importFile};
})(window);
