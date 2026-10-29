/* Beta 3.54: schedule-only current-contract search. Read requests only. */
(function(){
 'use strict';
 const style=document.createElement('style');style.id='dfScheduleCompanySearchStyle';style.textContent='#scheduleCompanySmartList .df-schedule-search-info{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;font-size:11px;color:#667f90;border-bottom:1px solid #dce5eb}#scheduleCompanySmartList .df-schedule-search-info button{font:inherit;white-space:nowrap;padding:4px 6px;border:1px solid #c3d1db;border-radius:4px;background:#fff;color:#365e78;cursor:pointer}#scheduleCompanySmartList .smart-pick-option.keyboard-active{background:#edf5fb;color:#174f79}';document.head.append(style);
 const text=v=>String(v??'').trim(),norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/주식회사|유한회사|\(주\)|\(유\)/g,'').replace(/[\s\-_/().,\[\]]+/g,'');
 const uid=()=>typeof dfCloudUser==='undefined'?'':text(dfCloudUser?.id),client=()=>typeof dfSupabase==='undefined'?null:dfSupabase;
 const permitted=()=>{try{return !!dfMenuCan('contract','view',dfV68IsAdmin());}catch(_){return false;}};
 const base=()=>typeof companyState==='undefined'?[]:companyState.db?.Companies||[];
 const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let cache=null,flight=null,serial=0,errorText='',active=-1,allowLocal=true;
 const localUser=uid(),localPrivate=permitted();
 const input=()=>document.getElementById('scheduleAddCompany'),list=()=>document.getElementById('scheduleCompanySmartList');
 function valid(s){return !!s&&!!uid()&&s.user===uid()&&s.client===client()&&s.private===permitted();}
 function models(rows){const old=base(),byOnline=new Map(old.map(c=>[text(c.OnlineId||c.Id),c]));return rows.map(r=>({...byOnline.get(text(r.id)),Id:text(r.legacy_id||r.id),OnlineId:text(r.id),Name:text(r.name),Address:text(r.address),BizNo:text(r.biz_no),Active:r.active!==false,ContractOnly:false}));}
 function roster(s){
  if(!valid(s))return [];
  const all=s.companies||base(),enabled=all.filter(c=>c&&c.Active!==false&&c.active!==false&&!c.ContractOnly),out=[],seen=new Set();
  if(!s.private)return enabled.filter(c=>s.ids.has(text(c.OnlineId||c.Id)));
  const resolve=DFContractSites.resolver(enabled,s.links),current=(s.contracts||[]).filter(dfV73ContractIsCurrent);
  for(const r of current){
   const ref=DFContractSites.explicitRef(r,s.links);
   if(ref&&all.some(c=>(ref.kind==='id'?text(c.OnlineId||c.Id):text(c.Id))===ref.value&&(c.Active===false||c.active===false)))continue;
   const c=resolve(r)||dfV73ContractToCompany(r),key=text(c.OnlineId||c.Id);if(!key||seen.has(key)||!text(c.Name))continue;seen.add(key);out.push(c);
  }
  return out;
 }
 function local(){
  if(!allowLocal||uid()!==localUser||permitted()!==localPrivate||!uid()||!client()||errorText)return null;
  if(permitted())return typeof dfV68ContractState!=='undefined'&&dfV68ContractState.loaded?{user:uid(),client:client(),private:true,contracts:dfV68ContractState.rows,links:undefined}:null;
  const s=typeof companyState==='undefined'?null:companyState.operationalScope;
  return s?.user===uid()?{user:uid(),client:client(),private:false,ids:s.ids}:null;
 }
 function companies(){return roster(valid(cache)?cache:local());}
 function items(){return companies().map(c=>({id:text(c.Id),label:c.Name,sub:[c.Address,c.BizNo,c.ContractOnly?'계약 '+(c.ContractNo||'')+' · 업체정보 연결 확인':''].filter(Boolean).join(' · '),raw:c}));}
 function matching(query){const q=norm(query);return items().filter(x=>!q||[x.label,x.raw.Address,x.raw.BizNo].some(v=>norm(v).includes(q)));}
 function resolveSelection(){
  const id=text(document.getElementById('scheduleAddCompanyId')?.value),rows=companies();
  if(id){const hits=rows.filter(c=>text(c.Id)===id||text(c.OnlineId)===id);if(hits.length===1)return hits[0];}
  const q=norm(input()?.value);if(!q)return null;const hits=rows.filter(c=>norm(c.Name)===q);return hits.length===1?hits[0]:null;
 }
 function pick(id){const c=companies().find(c=>text(c.Id)===text(id));if(!c){refresh(true);return false;}scheduleAddOnCompany({raw:c});input()?.setAttribute('aria-expanded','false');active=-1;return true;}
 function render(){
  const el=input(),box=list();if(!el||!box)return;active=-1;
  const rows=matching(el.value),loading=valid(flight),known=valid(cache)||!!local();
  const summary=errorText?errorText:loading?'현재 계약업체를 확인하는 중…':known?`현재 계약업체 검색 결과 ${rows.length}개${valid(cache)&&cache.missing?' · 업체 연결정보 '+cache.missing+'건 확인 필요':''}`:'계약업체 목록을 불러오는 중…';
  box.innerHTML=`<div class="df-schedule-search-info"><span role="status">${esc(summary)}</span><button type="button" data-schedule-search-refresh ${loading?'disabled':''}>다시 조회</button></div>`+(errorText?'':rows.map(x=>`<button type="button" class="smart-pick-option" data-smart-id="${esc(x.id)}" role="option" aria-selected="false"><strong>${esc(x.label)}</strong>${x.sub?`<span>${esc(x.sub)}</span>`:''}</button>`).join(''))+(!errorText&&!loading&&known&&!rows.length?'<div class="smart-pick-empty">일치하는 현재 계약업체가 없습니다.</div>':'');
  box.hidden=false;el.setAttribute('aria-expanded','true');box.querySelector('[data-schedule-search-refresh]').onclick=()=>refresh(true);
  for(const b of box.querySelectorAll('[data-smart-id]'))b.onclick=()=>pick(b.dataset.smartId);
 }
 function redraw(){const el=input(),box=list();if(el&&box&&(document.activeElement===el||box.contains(document.activeElement)||!box.hidden))render();}
 async function refresh(force=false){
  const api=client(),user=uid(),privateView=permitted();if(!api||!user){redraw();return false;}
  if(valid(flight))return flight.promise;
  if(!force&&valid(cache)&&Date.now()-cache.at<15000){redraw();return true;}
  const job={client:api,user,private:privateView,serial:++serial,promise:null};flight=job;errorText='';redraw();
  job.promise=(async()=>{
   try{
    // Staff retain the existing operational-scope RPC; never request private contracts for them.
    const scopePromise=privateView?DFContractSites.snapshot(true):DFContractSites.request(api.rpc('df_measurement_company_scope'),'일정 계약업체 조회');
    const [scope,rows]=await DFContractSites.request(Promise.all([scopePromise,dfV68FetchAll('companies','id,legacy_id,name,biz_no,address,active','name')]),'일정 업체 검색',15000);
    if(job.serial!==serial||!valid(job))return false;
    if(!Array.isArray(rows)||rows.some(r=>!r||!text(r.id)))throw Error('업체 목록 응답을 확인해주세요.');
    if(privateView&&(!Array.isArray(scope?.contracts)||!Array.isArray(scope?.links)))throw Error('계약 목록 응답을 확인해주세요.');
    if(!privateView&&(scope.error||!Array.isArray(scope.data)||scope.data.some(r=>typeof r?.company_id!=='string')))throw scope.error||Error('계약업체 범위 응답을 확인해주세요.');
    const idsFound=new Set(rows.map(r=>text(r.id)));
    cache={client:api,user,private:privateView,at:Date.now(),companies:models(rows),missing:privateView?0:scope.data.filter(r=>!idsFound.has(r.company_id)).length,...(privateView?{contracts:scope.contracts,links:scope.links}:{ids:new Set(scope.data.map(r=>r.company_id))})};
    errorText='';return true;
   }catch(e){if(job.serial===serial&&valid(job)){cache=null;errorText='현재 계약업체 조회에 실패했습니다. 다시 조회해주세요.';window.DF_DIAG?.warn('SCHEDULE-COMPANY-SEARCH','계약업체 검색 조회 실패',e.code||e.message||String(e));}return false;}
   finally{if(flight===job){flight=null;redraw();}}
  })();return job.promise;
 }
 function bind(){
  const el=input(),box=list();if(!el||!box||el.dataset.dfContractSearchBound)return;el.dataset.dfContractSearchBound='1';
  el.placeholder='계약업체명 · 주소 · 사업자번호 검색';el.setAttribute('aria-controls',box.id);el.setAttribute('aria-autocomplete','list');
  el.addEventListener('focus',()=>{render();refresh();});
  el.addEventListener('input',()=>{const hidden=document.getElementById('scheduleAddCompanyId');if(hidden)hidden.value='';render();if(!valid(flight))refresh();});
  el.addEventListener('keydown',e=>{
   if(e.isComposing||e.keyCode===229){if(e.key==='Enter')e.stopImmediatePropagation();return;}
   if(box.hidden&&(e.key==='ArrowDown'||e.key==='ArrowUp'))render();
   const buttons=[...box.querySelectorAll('[data-smart-id]')];
   if((e.key==='ArrowDown'||e.key==='ArrowUp')&&buttons.length){e.preventDefault();e.stopImmediatePropagation();active=e.key==='ArrowDown'?Math.min(active+1,buttons.length-1):Math.max(active-1,0);buttons.forEach((b,i)=>{b.classList.toggle('keyboard-active',i===active);b.setAttribute('aria-selected',String(i===active));});buttons[active]?.scrollIntoView?.({block:'nearest'});}
   else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();box.hidden=true;el.setAttribute('aria-expanded','false');active=-1;}
   else if(e.key==='Enter'){
    e.preventDefault();const chosen=!box.hidden&&active>=0?buttons[active]:!resolveSelection()&&buttons.length===1?buttons[0]:null;
    if(chosen)pick(chosen.dataset.smartId);
    if(!resolveSelection()){e.stopImmediatePropagation();render();const msg=document.createElement('div');msg.className='smart-pick-empty';msg.textContent='검색 결과에서 현재 계약업체를 선택해주세요. 같은 이름이면 주소를 확인해주세요.';box.prepend(msg);}
   }
  },true);
 }
 function invalidate(){allowLocal=false;serial++;cache=null;flight=null;errorText='';active=-1;const box=list();if(box){box.replaceChildren();box.hidden=true;}const hidden=document.getElementById('scheduleAddCompanyId');if(hidden)hidden.value='';if(document.activeElement===input())refresh(true);}
 document.addEventListener('df:menu-permissions-changed',invalidate);
 window.DFScheduleCompanySearch=Object.freeze({normalize:norm,companies,items,resolve:resolveSelection,refresh,render,bind});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
