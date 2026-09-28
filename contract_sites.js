/* DREAMFOREN Beta 2: contracts identify measurement sites by stable company IDs. */
(function(global){
  'use strict';
  const clean=v=>String(v??'').trim();
  const name=v=>clean(v).normalize('NFKC').toLowerCase().replace(/주식회사|\(주\)|㈜/g,'').replace(/[\s\-_/().,\[\]]+/g,'');
  const biz=v=>clean(v).replace(/\D/g,'');
  const address=v=>clean(v).normalize('NFKC').toLowerCase().replace(/경기도/g,'경기').replace(/\s|[,()]/g,'');
  const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let links=new Map(),editing=null,saving=false;
  let membership=null,readCache=null,readFlight=null,readGeneration=0;
  const jobs=new Map();
  function invalidate(){membership=null;}
  function invalidateReads(){readGeneration++;readCache=null;readFlight=null;invalidate();}
  function once(key,work){
    if(jobs.has(key))return jobs.get(key);
    const pending=Promise.resolve().then(work).finally(()=>{if(jobs.get(key)===pending)jobs.delete(key);});
    jobs.set(key,pending);return pending;
  }
  async function request(query,label='온라인 조회',timeout=15000){
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    if(controller&&typeof query.abortSignal==='function')query=query.abortSignal(controller.signal);
    let timer;
    try{return await Promise.race([Promise.resolve(query),new Promise((_,reject)=>{timer=setTimeout(()=>{
      const error=Error(label+' 응답이 지연되어 대기를 종료했습니다. 새로고침하여 처리 결과를 확인해주세요.');error.code='DF_TIMEOUT';
      reject(error);controller?.abort();
    },timeout);})]);}finally{clearTimeout(timer);}
  }
  function snapshot(force=false){
    const client=dfSupabase,user=clean(typeof dfCloudUser==='undefined'?'':dfCloudUser?.id);
    if(readFlight&&readFlight.client===client&&readFlight.user===user)return readFlight.promise;
    if(!force&&readCache&&readCache.client===client&&readCache.user===user&&Date.now()-readCache.at<5000)return Promise.resolve(readCache.data);
    const generation=readGeneration,flight={client,user,promise:null};
    flight.promise=Promise.all([dfV68FetchAll('contracts','*','contract_date'),dfV68FetchAll('contract_company_links','contract_id,company_id')]).then(([contracts,rows])=>{
      if(generation!==readGeneration)return snapshot();
      const data={contracts,links:rows};
      if(generation===readGeneration){setLinks(rows);readCache={client,user,data,at:Date.now()};}
      return data;
    }).finally(()=>{if(readFlight===flight)readFlight=null;});
    readFlight=flight;return flight.promise;
  }
  function refreshViews(){return once('refresh-views',async()=>{
    await new Promise(resolve=>setTimeout(resolve,0));
    invalidate();companyRender();syncSampleCompanySelectors(true);scheduleRenderAll();
  });}
  function site(row){
    const contract=row&&('target_name'in row||'requester_name'in row);
    const target=contract&&!!clean(row.target_name);
    return contract?{name:clean(target?row.target_name:row.requester_name),biz:biz(target?row.target_biz_no:row.requester_biz_no),address:address(target?row.target_address:row.requester_address)}:
      {name:clean(row?.name??row?.Name),biz:biz(row?.biz_no??row?.BizNo),address:address(row?.address??row?.Address)};
  }
  const online=c=>clean(c?.OnlineId||c?.id);
  const legacy=c=>clean(c?.legacy_id||c?.Id);
  const active=c=>!!c&&!c.ContractOnly&&c.active!==false&&c.Active!==false;
  function same(a,b){if(!a||!b)return false;if(online(a)&&online(b))return online(a)===online(b);return !!legacy(a)&&legacy(a)===legacy(b);}
  function compatible(a,b){
    const x=site(a),y=site(b);
    return !!name(x.name)&&name(x.name)===name(y.name)&&!(x.biz&&y.biz&&x.biz!==y.biz)&&!(x.address&&y.address&&x.address!==y.address);
  }
  function auto(contract,companies){
    const candidates=(companies||[]).filter(c=>active(c)&&compatible(contract,c));
    return {company:candidates.length===1?candidates[0]:null,candidates,state:candidates.length===1?'matched':candidates.length?'ambiguous':'unmatched'};
  }
  function explicitRef(r,knownLinks){
    const extra=r?.extra_data||{};
    if(clean(extra.site_company_id))return {kind:'id',value:clean(extra.site_company_id)};
    if(clean(extra.manual_company_legacy_id))return {kind:'legacy',value:clean(extra.manual_company_legacy_id)};
    const id=knownLinks instanceof Map?knownLinks.get(clean(r?.id)):Array.isArray(knownLinks)?knownLinks.find(l=>clean(l.contract_id)===clean(r?.id))?.company_id:links.get(clean(r?.id));
    return id?{kind:'id',value:clean(id)}:null;
  }
  function resolve(r,companies,knownLinks){
    const ref=explicitRef(r,knownLinks);
    if(ref){const c=(companies||[]).find(c=>(ref.kind==='id'?online(c):legacy(c))===ref.value);return c&&active(c)?c:null;}
    return auto(r,companies).company;
  }
  // Build once per list operation; never scan every company for every contract check.
  function resolver(companies,knownLinks){
    const ids=new Map(),legacies=new Map(),names=new Map();
    const linkMap=Array.isArray(knownLinks)?new Map(knownLinks.map(r=>[clean(r.contract_id),clean(r.company_id)])):knownLinks||links;
    for(const c of companies||[]){
      if(!active(c))continue;
      if(online(c)&&!ids.has(online(c)))ids.set(online(c),c);
      if(legacy(c)&&!legacies.has(legacy(c)))legacies.set(legacy(c),c);
      const s=site(c),key=name(s.name);if(!key)continue;
      if(!names.has(key))names.set(key,[]);names.get(key).push({c,s});
    }
    return r=>{
      const ref=explicitRef(r,linkMap);if(ref)return (ref.kind==='id'?ids:legacies).get(ref.value)||null;
      const s=site(r),candidates=(names.get(name(s.name))||[]).filter(x=>!(s.biz&&x.s.biz&&s.biz!==x.s.biz)&&!(s.address&&x.s.address&&s.address!==x.s.address));
      return candidates.length===1?candidates[0].c:null;
    };
  }
  function isCurrent(c,contracts,companies,predicate){
    if(!membership||membership.contracts!==contracts||membership.companies!==companies||membership.links!==links){
      const hit=resolver(companies),ids=new Set(),legacies=new Set();
      for(const r of contracts||[]){if(!predicate(r))continue;const x=hit(r);if(x){if(online(x))ids.add(online(x));if(legacy(x))legacies.add(legacy(x));}}
      const next={contracts,companies,links,ids,legacies};membership=next;
      // Share within a render only; edits and the next event must see fresh values.
      setTimeout(()=>{if(membership===next)membership=null;},0);
    }
    return online(c)?membership.ids.has(online(c)):membership.legacies.has(legacy(c));
  }
  function setLinks(rows){links=new Map((rows||[]).map(r=>[clean(r.contract_id),clean(r.company_id)]));invalidate();}
  async function loadLinks(force=false){return (await snapshot(force)).links;}
  function forgetContract(id){links.delete(clean(id));invalidateReads();}
  function matches(c,r,companies){return same(c,resolve(r,companies?.length?companies:[c]));}
  function findCompany(c,rows){
    if(clean(c?.OnlineId))return rows.find(r=>online(r)===clean(c.OnlineId)&&active(r))||null;
    const found=clean(c?.Id)&&rows.find(r=>(online(r)===clean(c.Id)||legacy(r)===clean(c.Id))&&active(r));
    if(found)return found;
    if(c?.ContractOnly){
      const contract=typeof dfV68ContractState!=='undefined'?dfV68ContractState.rows.find(r=>clean(r.id)===clean(c.ContractId)):null;
      return contract?resolve(contract,rows):null;
    }
    if(clean(c?.Id))return null;
    return auto(c,rows).company;
  }
  function related(payload,rows){const p=site(payload);return rows.filter(c=>active(c)&&((p.biz&&p.biz===site(c).biz)||name(p.name)===name(site(c).name)));}
  function choose(payload,rows,choice='',existing=null,rename=false,contracts=[]){
    if(choice==='__new__')return {create:true};
    let c=choice?rows.find(c=>online(c)===choice&&active(c)):resolve(existing||payload,rows);
    if(!c&&!choice&&!explicitRef(existing||payload))c=auto(payload,rows).company;
    if(choice&&!c)throw Error('선택한 사업장을 찾을 수 없습니다. 계약창을 다시 열어주세요.');
    if(!c&&explicitRef(existing||payload)&&!choice)throw Error('기존 연결 사업장을 찾지 못했습니다. 연결 사업장을 직접 선택해주세요.');
    if(!c){if(related(payload,rows).length)throw Error('사업자번호 또는 이름이 같은 사업장이 있습니다. 연결 사업장을 선택하거나 새 사업장으로 분리 등록해주세요.');return {create:true};}
    const p=site(payload),s=site(c),old=existing?resolve(existing,rows):null;
    if(p.biz&&s.biz&&p.biz!==s.biz)throw Error('선택한 사업장과 사업자번호가 다릅니다. 연결 사업장을 다시 선택해주세요.');
    let renameTo='';
    if(name(p.name)!==name(s.name)){
      if(!rename||!existing||!same(old,c))throw Error('계약의 사업장명과 연결된 사업장명이 다릅니다. 공장이 다르면 새 사업장으로 분리하고, 같은 사업장의 상호 변경이면 상호 변경 반영을 체크해주세요.');
      const oldName=name(site(existing).name),currentName=name(s.name);
      const hit=resolver(rows);
      const conflicts=contracts.filter(r=>clean(r.id)!==clean(existing.id)&&same(hit(r),c)&&!([oldName,currentName,name(p.name)].includes(name(site(r).name))));
      if(conflicts.length)throw Error('다른 이름의 계약도 이 사업장에 연결되어 있습니다. 상호를 덮어쓰지 않고 계약별 연결 사업장을 먼저 구분해주세요.');
      renameTo=p.name;
    }
    return {company:c,renameTo};
  }
  async function createCompany(payload){
    const p=site(payload);if(!p.name)throw Error('사업장명을 입력해주세요.');
    const target=!!clean(payload.target_name),row={legacy_id:`company-web-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,name:p.name,address:clean(target?payload.target_address:payload.requester_address),biz_no:clean(target?payload.target_biz_no:payload.requester_biz_no),grade:payload.grade||'',cycle:'',measurement_items:[],measurement_history:[],tracking:{},active:true,extra_data:{CreatedFrom:'contract',CreatedAt:new Date().toISOString()}};
    const q=await request(dfSupabase.from('companies').insert(row).select('id,legacy_id,name,biz_no,address,active').single(),'사업장 등록');if(q.error)throw q.error;return q.data;
  }
  async function ensureCompany(payload){
    if(!dfSupabase||!dfCloudUser)return null;
    const rows=await dfV68FetchAll('companies','id,legacy_id,name,biz_no,address,active');
    const decision=choose(payload,rows);
    return online(decision.company||await createCompany(payload));
  }
  function linkExtra(extra,c){return {...(extra||{}),site_company_id:online(c),manual_company_legacy_id:legacy(c)||online(c),site_link_version:2,manual_company_linked_at:new Date().toISOString()};}
  async function linkTable(contractId,c){
    try{
      const q=await request(dfSupabase.from('contract_company_links').upsert({contract_id:contractId,company_id:online(c),linked_by:dfCloudUser.id,linked_at:new Date().toISOString()},{onConflict:'contract_id'}),'사업장 연결');
      if(!q.error)links.set(clean(contractId),online(c));return q.error;
    }catch(e){return e;}finally{invalidateReads();}
  }
  async function persistLink(contract,c){
    if(!dfMenuRequire('contract','update',dfV68IsAdmin()))throw Error('사업장 연결 수정 권한이 없습니다.');
    if(!contract?.id||!online(c))throw Error('계약과 연결 사업장을 다시 선택해주세요.');
    const fresh=await request(dfSupabase.from('contracts').select('*').eq('id',contract.id).single(),'계약 조회');if(fresh.error)throw fresh.error;
    const extra=linkExtra(fresh.data.extra_data,c);
    const q=await request(dfSupabase.from('contracts').update({extra_data:extra}).eq('id',contract.id),'사업장 연결 저장');if(q.error)throw q.error;invalidateReads();
    contract.extra_data=extra;
    const error=await linkTable(contract.id,c);
    if(error)global.DF_DIAG?.warn('CONTRACT-SITE-LINK','계약의 사업장 연결은 저장됨 · 연결표 갱신 재시도 필요',error.message);
    return error;
  }
  function controls(){const root=document.getElementById('dfContractSiteSection');return root?{root,select:root.querySelector('select'),rename:root.querySelector('[data-site-rename]'),note:root.querySelector('[data-site-note]')}:null;}
  async function mount(existing){
    const body=document.getElementById('contractModalBody');if(!body)return;
    const state={existing,ready:false};editing=state;
    const section=document.createElement('section');section.id='dfContractSiteSection';section.className='contract-editor-section df-contract-site-section';
    section.innerHTML='<h3>연결 사업장</h3><p>사업자번호가 같아도 공장별로 각각 등록합니다. 연결 변경은 계약 저장 후 적용됩니다.</p><label>사업장 검색<input type="search" data-site-search placeholder="사업장명 · 사업자번호 · 주소"></label><label>연결할 사업장<select disabled><option value="">사업장 불러오는 중…</option></select></label><label class="df-site-rename"><input type="checkbox" data-site-rename> 같은 사업장의 상호 변경을 업체현황에 반영</label><p data-site-note role="status"></p>';
    body.querySelector('.contract-editor-actions')?.before(section);
    try{
      const [rows]=await Promise.all([dfV68FetchAll('companies','id,legacy_id,name,biz_no,address,active'),loadLinks()]);
      if(editing!==state||!section.isConnected)return;
      state.rows=rows;state.ready=true;
      const c=resolve(existing,rows),select=section.querySelector('select'),search=section.querySelector('[data-site-search]');
      const can=dfMenuCan('contract',existing?.id?'update':'create',dfV68IsAdmin());
      const label=c=>`${c.name} · ${c.biz_no||'사업자번호 없음'} · ${c.address||'주소 없음'}`;
      const draw=()=>{const selected=select.value,q=name(search.value);select.innerHTML='<option value="">자동 확인 (사업장명·주소 대조)</option><option value="__new__">+ 새 사업장으로 분리 등록</option>'+rows.filter(c=>active(c)&&(online(c)===selected||!q||name(label(c)).includes(q))).map(c=>`<option value="${esc(online(c))}">${esc(label(c))}</option>`).join('');select.value=selected;};
      draw();select.value=c?online(c):'';search.oninput=draw;
      section.querySelectorAll('input,select').forEach(el=>el.disabled=!can);
      if(!existing)section.querySelector('.df-site-rename').hidden=true;
      const hit=resolver(rows);
      const refresh=()=>{const x=rows.find(c=>online(c)===select.value),p=dfV70CollectContractForm(existing),similar=related(p,rows),note=section.querySelector('[data-site-note]');
        const shared=x?(typeof dfV68ContractState!=='undefined'?dfV68ContractState.rows:[]).filter(r=>clean(r.id)!==clean(existing?.id)&&same(hit(r),x)&&name(site(r).name)!==name(site(p).name)):[];
        note.textContent=select.value==='__new__'?'새 사업장에 계약을 연결합니다. 기존 사업장의 시설·측정이력은 이동하지 않습니다.':x?`연결 사업장: ${label(x)}${name(site(p).name)!==name(site(x).name)?' / 계약의 사업장명과 다릅니다. 연결을 확인해주세요.':''}${shared.length?' / 다른 이름의 계약 '+shared.length+'건도 연결되어 있습니다. 공장별로 구분해주세요.':''}`:similar.length?'동일 번호·이름의 사업장이 있습니다. 대상 공장을 선택하거나 새 사업장으로 분리해주세요.':'일치하는 사업장이 있으면 연결하고, 없으면 새 사업장을 등록합니다.';};
      select.onchange=()=>{section.dataset.siteChanged='true';section.querySelector('[data-site-rename]').checked=false;refresh();const cycle=document.getElementById('v1203ContractCycleSection');if(cycle)cycle.querySelectorAll('button,input').forEach(el=>el.disabled=true);};
      ['ct_target_name','ct_target_biz_no','ct_target_address','ct_requester_name'].forEach(id=>document.getElementById(id)?.addEventListener('input',refresh));refresh();
    }catch(e){if(editing===state){section.querySelector('[data-site-note]').textContent='사업장 연결을 불러오지 못했습니다. 계약창을 다시 열어주세요. '+e.message;}}
  }
  async function save(existing){
    if(saving)return;
    if(!dfSupabase||!dfCloudUser||!dfMenuRequire('contract',existing?.id?'update':'create',dfV68IsAdmin()))return;
    const ui=controls();if(!editing?.ready||!ui){alert('사업장 연결을 먼저 불러와야 합니다. 계약창을 다시 열어주세요.');return;}
    const state=editing,choice=ui.select.value,rename=ui.rename.checked;
    const payload=dfV70CollectContractForm(existing);if(!site(payload).name){alert('의뢰기관명 또는 측정대상 사업장을 입력해주세요.');return;}
    saving=true;const button=document.getElementById('contractEditSave');if(button)button.disabled=true;
    let saved=null,created=null;
    try{
      const [rows,currentSnapshot]=await Promise.all([dfV68FetchAll('companies','id,legacy_id,name,biz_no,address,active'),snapshot(true)]);
      const contracts=currentSnapshot.contracts;
      if(editing!==state||!ui.root.isConnected||document.getElementById('contractModal')?.hidden)throw Error('계약창이 변경되어 저장을 중단했습니다.');
      const current=existing?.id?contracts.find(r=>clean(r.id)===clean(existing.id)):null;
      if(existing?.id&&!current)throw Error('계약이 삭제되었거나 조회되지 않습니다. 계약목록을 새로고침해주세요.');
      if(current&&existing.updated_at&&current.updated_at!==existing.updated_at)throw Error('다른 곳에서 계약이 변경되었습니다. 계약창을 다시 열어 최신 내용으로 수정해주세요.');
      const decision=choose(payload,rows,choice,current,rename,contracts.filter(r=>typeof dfV73ContractIsCurrent!=='function'||dfV73ContractIsCurrent(r)));
      const c=decision.company||(created=await createCompany(payload));
      if(created&&editing===state){state.rows.push(created);const option=document.createElement('option');option.value=online(c);option.textContent=c.name+' · '+(c.address||'주소 없음');ui.select.appendChild(option);ui.select.value=online(c);}
      payload.extra_data=linkExtra({...current?.extra_data,...payload.extra_data},c);
      const q=await request((current?dfSupabase.from('contracts').update(payload).eq('id',current.id):dfSupabase.from('contracts').insert(payload)).select('*').single(),'계약 저장');if(q.error)throw q.error;saved=q.data;invalidateReads();
      const warnings=[];const linkError=await linkTable(saved.id,c);if(linkError)warnings.push('계약의 연결은 저장됐지만 연결표 갱신에 실패했습니다. 다음 저장 시 다시 반영됩니다.');
      if(decision.renameTo){try{const rename=await request(dfSupabase.from('companies').update({name:decision.renameTo}).eq('id',online(c)),'사업장 상호 저장');if(rename.error)throw rename.error;}catch(e){warnings.push('사업장 상호 반영을 확인하지 못했습니다. 계약을 다시 열어 상호를 확인해주세요.');}}
      dfV68ContractState.loaded=false;dfV68ContractState.selectedId=saved.id;
      if(editing===state){dfV69CloseContractModal();editing=null;}
      try{if(await dfV70RefreshCompaniesOnline(false)===false)throw Error('refresh failed');await dfV68LoadContracts();}catch(e){warnings.push('화면 새로고침에 실패했습니다. 새로고침 후 저장 내용을 확인해주세요.');}
      alert((current?'계약내용과 연결 사업장을 수정했습니다.':'새 계약과 연결 사업장을 저장했습니다.')+(warnings.length?'\n'+warnings.join('\n'):''));
      return saved;
    }catch(e){alert((saved?'계약은 저장됐지만 후속 처리 중 오류가 발생했습니다.\n':'계약 저장 실패\n')+e.message+(created&&!saved?'\n새 사업장은 등록됐습니다. 선택된 사업장으로 다시 저장하면 됩니다.':''));}
    finally{saving=false;if(button)button.disabled=false;}
  }
  async function review(){
    if(!dfMenuRequire('contract','view',dfV68IsAdmin()))return;
    await dfV68LoadContracts(true);const rows=await dfV68FetchAll('companies','id,legacy_id,name,biz_no,address,active');await loadLinks();
    const contracts=dfV68ContractState.rows.filter(dfV73ContractIsCurrent);
    let modal=document.getElementById('dfContractSiteReview');if(!modal){modal=document.createElement('div');modal.id='dfContractSiteReview';modal.className='company-modal-backdrop';document.body.appendChild(modal);}
    modal.hidden=false;modal.style.display='flex';
    const hit=resolver(rows),groups=new Map();
    const records=contracts.map(r=>{const c=hit(r),s=site(r);if(c){const key=online(c)||legacy(c);if(!groups.has(key))groups.set(key,new Set());groups.get(key).add(name(s.name));}return {r,c,s,issue:!c||!compatible(r,c)};});
    records.forEach(x=>{if(x.c&&groups.get(online(x.c)||legacy(x.c)).size>1)x.issue=true;});
    records.sort((a,b)=>Number(b.issue)-Number(a.issue));
    modal.innerHTML=`<div class="company-modal df-site-review-panel"><div class="company-modal-head"><h2>계약별 사업장 연결 확인</h2><button type="button" class="company-modal-close">×</button></div><p>현재계약 ${records.length}건 · 연결 확인 필요 ${records.filter(x=>x.issue).length}건</p><input type="search" placeholder="계약번호 · 사업장명 · 사업자번호 · 주소 검색"><div class="df-site-review-list">${records.map(({r,c,issue,s})=>`<article data-site-contract="${esc(r.id)}" data-site-search-text="${esc(name([r.contract_no,s.name,s.biz,s.address,c?.name,c?.address].join(' ')))}"><div><strong>${esc(s.name)}</strong><small>${esc(r.contract_no)} · ${esc(s.biz)} · ${esc(r.target_address||r.requester_address)}</small><span>연결: ${esc(c?.name||'미연결')} · ${esc(c?.address||'')}</span><b>${issue?'연결 확인 필요':'사업장 연결됨'}</b></div><button type="button" class="company-btn secondary">연결 수정</button></article>`).join('')}</div></div>`;
    modal.querySelector('.company-modal-close').onclick=()=>{modal.hidden=true;modal.style.display='none';};
    modal.querySelector('input').oninput=e=>modal.querySelectorAll('[data-site-contract]').forEach(el=>el.hidden=!el.dataset.siteSearchText.includes(name(e.target.value)));
    modal.querySelectorAll('[data-site-contract]').forEach(el=>el.querySelector('button').onclick=()=>{modal.hidden=true;modal.style.display='none';dfV70OpenContractEditor(contracts.find(r=>clean(r.id)===el.dataset.siteContract));});
  }
  function init(){const host=document.getElementById('v12012ContractDiff');if(host&&!document.getElementById('dfContractSiteReviewBtn')){const b=document.createElement('button');b.type='button';b.id='dfContractSiteReviewBtn';b.className='company-btn secondary';b.textContent='사업장 연결 확인';b.onclick=()=>review().catch(e=>alert('사업장 연결 조회 실패\n'+e.message));host.after(b);}}
  global.DFContractSites={site,name,biz,address,online,legacy,same,compatible,auto,resolve,resolver,isCurrent,invalidate,invalidateReads,once,request,snapshot,refreshViews,forgetContract,matches,findCompany,setLinks,loadLinks,explicitRef,choose,ensureCompany,linkExtra,persistLink,mount,save,review};
  if(typeof module!=='undefined'&&module.exports)module.exports=global.DFContractSites;
  if(global.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,500),{once:true});else init();}
})(typeof window!=='undefined'?window:globalThis);
