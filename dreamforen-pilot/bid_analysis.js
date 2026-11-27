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
      actual_estimated_price:s.meta.actual_estimated_price,notice_no:value(modal,'bidNoticeNo'),pricing_method:value(modal,'bidPricingMethod')};
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
    const ownKey=M.effectiveGroupKey(record),groups=M.groupOptions(records,record),ownGroup=groups.find(g=>g.key===ownKey);
    s.groupSelection=(memo.meta.bid_group_id||(ownGroup?.members.length>1?ownKey:''));
    s.individualGroup=(ownGroup?.members.length>1?'bid-'+crypto.randomUUID():(ownKey||'bid-'+crypto.randomUUID()));
    states.set(modal,s);modal.dataset.bidAnalysis='annual';
    const memoInput=modal.querySelector('#bidMemo');if(memoInput){memoInput.value=memo.text;memoInput.closest('label').hidden=true;}
    const conditions=modal.querySelector('[data-bid-field-group="1"] .df-bid-form-grid')||form;
    const results=modal.querySelector('[data-bid-field-group="2"] .df-bid-form-grid')||form;
    conditions.insertAdjacentHTML('beforeend','<label>낙찰금액 산정방식<select id="bidPricingMethod"><option value="floor">예정가격 × 하한율 · 최저가</option><option value="other">다른 낙찰방식 · 별도 검토</option></select></label><label>나라장터 공고번호<input id="bidNoticeNo" placeholder="공고번호 또는 공고 URL" maxlength="300"></label>');
    const legacyLinks=[...memo.text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)].map(x=>M.safeUrl(x[0].startsWith('www.')?'https://'+x[0]:x[0])).filter(Boolean);
    const shortcut=Object.prototype.hasOwnProperty.call(memo.meta,'shortcut_url')?memo.meta.shortcut_url:(legacyLinks[0]||'');
    results.insertAdjacentHTML('beforeend','<label class="wide">바로가기 주소<div class="df-bid-shortcut"><input id="bidShortcutUrl" type="url" placeholder="https://" aria-label="바로가기 주소"><a data-bid-shortcut-link target="_blank" rel="noopener noreferrer">열기</a></div></label>');
    modal.querySelector('#bidShortcutUrl').value=shortcut;
    modal.querySelector('#bidShortcutUrl').addEventListener('input',()=>{if(writable(modal,s))update(modal);});
    modal.querySelector('#bidNoticeNo').value=memo.meta.notice_no||M.noticeNo(record.memo);
    modal.querySelector('#bidPricingMethod').value=memo.meta.pricing_method==='other'?'other':'floor';
    const section=document.createElement('details');section.className='df-bid-annual';section.setAttribute('aria-label','연도별 입찰금액');
    section.innerHTML='<summary>연도별 금액 <span data-bid-annual-count></span></summary><div class="df-bid-annual-head"><span>금액: VAT 포함 · 원</span><button type="button" class="company-btn secondary" data-bid-annual-add>+ 연도 추가</button></div><div class="df-bid-annual-rows" data-bid-annual-rows></div><p class="df-bid-annual-message" data-bid-annual-message role="status" aria-live="polite"></p>';
    form.insertBefore(section,form.querySelector(':scope > .df-doc-editor-actions'));
    section.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT')e.preventDefault();});
    section.querySelector('[data-bid-annual-add]').onclick=()=>{if(!writable(modal,s)||s.annual.length>=M.MAX_HISTORY)return;addRow(modal,s);drawRows(modal);update(modal);s.form.dispatchEvent(new Event('input',{bubbles:true}));section.querySelector('[data-bid-annual-row]:last-child input')?.focus();};
    const group=document.createElement('section');group.className='df-bid-group';
    group.innerHTML='<label>업체 묶기<select id="bidGroup" aria-label="업체 묶기"></select></label><details class="df-bid-group-history"><summary>누적 입찰 이력 <span data-bid-group-count></span></summary><div class="df-bid-history-scroll" data-bid-group-history></div></details>';
    form.insertBefore(group,form.querySelector(':scope > .df-doc-editor-actions'));
    drawGroups(modal);
    modal.querySelector('#bidGroup').onchange=()=>{if(!writable(modal,s))return;s.groupSelection=value(modal,'bidGroup');update(modal);s.form.dispatchEvent(new Event('input',{bubbles:true}));};
    ids.forEach(id=>{const node=modal.querySelector('#'+id);if(node){node.addEventListener('input',()=>update(modal));node.addEventListener('change',()=>update(modal));}});
    const overview=form.querySelector('.df-bid-overview'),heading=form.querySelector('.df-bid-overview-bid h3');if(heading)heading.hidden=true;
    if(overview){overview.setAttribute('aria-label','투찰 예상금액');overview.querySelector('[data-bid-overview-analysis]')?.remove();}
    if(!s.annual.length)addRow(modal,s);
    drawRows(modal);update(modal);
  }
  function serializeMemo(modal,plain){
    const s=states.get(modal);if(!s)return plain;
    return M.writeMemo(plain,{...s.meta,annual_history:annualPayload(s,value(modal,'bidRate')),bid_group_id:s.groupSelection||s.individualGroup,shortcut_url:M.safeUrl(value(modal,'bidShortcutUrl')),notice_no:M.noticeNo(value(modal,'bidNoticeNo')),
      pricing_method:value(modal,'bidPricingMethod')});
  }
  function validation(modal){
    const s=states.get(modal);if(!s)return '';
    const annual=M.analyzeAnnual(current(modal),s.annual);if(annual.errors.length)return annual.errors[0].message;
    const shortcut=value(modal,'bidShortcutUrl').trim();if(shortcut&&!M.safeUrl(shortcut))return '바로가기 주소는 http 또는 https 주소로 입력해주세요.';
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
      node.querySelector('[data-annual-remove]').onclick=()=>{if(!writable(modal,s))return;s.annual.splice(i,1);drawRows(modal);update(modal);s.form.dispatchEvent(new Event('input',{bubbles:true}));};
    });
  }
  function drawGroups(modal){
    const s=states.get(modal),select=modal.querySelector('#bidGroup');if(!select)return;
    const options=M.groupOptions(s.records,s.record).filter(g=>g.key!==s.individualGroup||g.key===s.groupSelection);
    select.innerHTML='<option value="">묶지 않음</option>'+options.map(g=>'<option value="'+esc(g.key)+'">'+esc(g.label)+(g.count>1?' · '+g.count+'건':'')+'</option>').join('');
    if(s.groupSelection&&!options.some(g=>g.key===s.groupSelection))select.insertAdjacentHTML('beforeend','<option value="'+esc(s.groupSelection)+'">기존 업체 묶음</option>');
    select.value=s.groupSelection;
  }
  function drawInherited(modal,combined){
    const s=states.get(modal),manualYears=new Set(s.annual.filter(x=>String(x.base_amount??'').trim()||String(x.winning_amount??'').trim()).map(x=>M.number(x.year)));
    let box=s.form.querySelector('[data-bid-inherited]');if(!box){box=document.createElement('div');box.dataset.bidInherited='';box.className='df-bid-inherited';s.form.querySelector('[data-bid-annual-rows]').after(box);}
    const rows=combined.annualRows.filter(x=>!manualYears.has(Number(x.year)));
    box.hidden=!rows.length;box.innerHTML=rows.length?'<div class="df-bid-inherited-title">연결된 과거 금액</div><div class="df-bid-history-scroll"><table><thead><tr><th>연도</th><th>기초금액</th><th>낙찰금액</th><th>추정 사정률</th></tr></thead><tbody>'+rows.map(row=>{const r=M.analyzeAnnual(current(modal),[row]).rows[0];return '<tr><td>'+esc(row.year)+'</td><td>'+money(combined.provenance.find(x=>Number(x.year)===Number(row.year))?.display_base_amount??row.base_amount)+'</td><td>'+money(row.winning_amount)+'</td><td>'+(r?.assessment!==null&&r?.assessment!==undefined?r.assessment.toFixed(4)+'%':'—')+'</td></tr>';}).join('')+'</tbody></table></div>':'';
  }
  function update(modal){
    const s=states.get(modal);if(!s)return;
    const target=current(modal),groupKey=s.groupSelection||s.individualGroup;
    const combined=M.combineAnnual(target,s.records,s.annual,groupKey),manual=M.analyzeAnnual(target,s.annual);
    const result=manual.errors.length?manual:M.analyzeAnnual(target,combined.annualRows);s.result=result;
    const recommendation=modal.querySelector('#bidRecommend');
    modal.querySelector('#dfBidDecisionSupport')?.remove();
    recommendation.innerHTML='<div class="df-bid-prediction-line"><span>작성자료 기준 투찰 예상금액</span><strong class="df-bid-recommend-amount">'+money(result.recommended)+'</strong><span class="df-bid-prediction-tax">VAT 포함</span><button type="button" class="company-btn secondary" data-bid-apply-analysis>투찰금액에 적용</button></div><div class="df-bid-prediction-meta">입력자료 '+result.count+'건 · 평균 추정 사정률 '+(result.averageAssessment===null?'—':result.averageAssessment.toFixed(4)+'%')+'</div>';
    const apply=recommendation.querySelector('[data-bid-apply-analysis]');apply.disabled=!writable(modal,s)||result.recommended===null;
    apply.onclick=()=>{if(!writable(modal,s)||result.recommended===null)return;const own=modal.querySelector('#bidOurs');own.value=own.type==='number'?String(result.recommended):result.recommended.toLocaleString('ko-KR');own.dispatchEvent(new Event('input',{bubbles:true}));};
    const link=modal.querySelector('[data-bid-shortcut-link]'),url=M.safeUrl(value(modal,'bidShortcutUrl'));link.hidden=!url;if(url)link.href=url;else link.removeAttribute('href');
    modal.querySelector('#bidShortcutUrl').disabled=!writable(modal,s);
    modal.querySelector('#bidGroup').disabled=!writable(modal,s);
    const past=s.form.querySelector('[data-bid-group-history]');
    s.form.querySelector('[data-bid-group-count]').textContent=combined.history.length+'건';
    past.innerHTML=combined.history.length?'<table><thead><tr><th>입찰</th><th>우리 투찰금액</th><th>낙찰금액</th></tr></thead><tbody>'+combined.history.map(row=>'<tr><td>'+esc(row.title)+'<small>'+esc(row.deadline?.slice(0,10)||'')+'</small></td><td>'+money(M.number(row.our_bid_amount)||null)+'</td><td>'+money(M.number(row.winning_amount)||null)+'</td></tr>').join('')+'</tbody></table>':'<p class="df-bid-history-empty">누적된 입찰이 없습니다.</p>';
    s.form.querySelector('[data-bid-annual-count]').textContent=result.count+'건';
    drawInherited(modal,combined);
    const message=s.form.querySelector('[data-bid-annual-message]');
    message.textContent=result.message||'';message.hidden=!result.message;
    s.form.querySelectorAll('[data-bid-annual-row]').forEach(node=>{
      const i=Number(node.dataset.bidAnnualRow),row=manual.rows.find(x=>x.index===i),error=manual.errors.find(x=>x.index===i);
      node.querySelector('[data-annual-assessment]').textContent=row?.assessment!==null&&row?.assessment!==undefined?row.assessment.toFixed(4)+'%':'—';
      node.querySelector('[data-annual-error]').textContent=error?.message||'';
      node.querySelectorAll('[data-annual-key]').forEach(el=>{el.disabled=!writable(modal,s);if(error)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid');});
      node.querySelector('[data-annual-remove]').disabled=!writable(modal,s);
    });
    s.form.querySelector('[data-bid-annual-add]').disabled=!writable(modal,s)||s.annual.length>=M.MAX_HISTORY;
  }
  function refresh(modal,records){const s=states.get(modal);if(!s)return;if(Array.isArray(records)){s.records=records;drawGroups(modal);}update(modal);}
  root.DFBidAnalysis={mount,update,refresh,serializeMemo,validation,current};
})(window);
