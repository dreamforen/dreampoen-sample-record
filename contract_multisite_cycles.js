/* DREAMFOREN Beta 396: explicitly grouped factories retain their own facility cycles. */
(function(global){
  'use strict';
  const TABLE='dreampoen_contract_facility_cycles';
  const FIELDS=['monthly_1','monthly_2','quarterly_1','halfyear_1','yearly_1','other_cycle'];
  const LABELS=['월1','월2','분기','반기','연1','기타'];
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const online=c=>clean(global.DFContractSites?.online(c)||c?.OnlineId||c?.id);
  const local=c=>clean(c?.Id||c?.legacy_id||c?.id);
  const facilityName=f=>String(f?.FacilityName||f?.PreventionFacility||'시설');
  const siteName=c=>String(c?.Name||c?.name||'사업장');
  const sourceCompanies=()=>{
    const rows=typeof companyState!=='undefined'&&Array.isArray(companyState?.db?.Companies)?companyState.db.Companies:
      (typeof dfV75SourceCompanies==='function'?dfV75SourceCompanies():[]);
    return (rows||[]).filter(c=>c&&!c.ContractOnly);
  };
  const opted=r=>r?.extra_data?.site_group_version===1&&Array.isArray(r.extra_data.additional_site_company_ids);
  const siteSignature=sites=>sites.map(online).sort().join('|');
  const rowSignature=r=>JSON.stringify([r?.id??null,r?.updated_at??null,clean(r?.company_legacy_id),
    clean(r?.facility_key),clean(r?.facility_legacy_id),...FIELDS.map(k=>!!r?.[k]),String(r?.other_label??''),String(r?.note??'')]);
  const valuesSignature=r=>JSON.stringify([...FIELDS.map(k=>!!r?.[k]),String(r?.note??'')]);

  function checkMembership(contract,sites,knownLinks){
    if(!opted(contract)||sites.length<2)throw Error('여러 공장의 연결을 저장한 뒤 계약창을 다시 열어주세요.');
    const extra=contract.extra_data,additions=extra.additional_site_company_ids.map(clean);
    const primary=global.DFContractSites.explicitRef(contract,knownLinks);
    if(!primary||!sites[0]||(primary.kind==='id'?online(sites[0]):local(sites[0]))!==primary.value){
      throw Error('대표 공장의 연결을 확인할 수 없습니다. 계약창을 다시 열어주세요.');
    }
    const ids=new Set(additions);
    if(ids.size!==additions.length||sites.length!==additions.length+1||
      additions.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
        id===online(sites[0])||!sites.slice(1).some(c=>online(c)===id))){
      throw Error('선택된 공장 중 연결을 확인할 수 없는 공장이 있습니다. 공장 연결을 확인한 뒤 다시 열어주세요.');
    }
  }

  // Only exact stored IDs are accepted here. A display name never identifies a factory or facility.
  function buildEntries(contract,sites,rows,knownLinks){
    checkMembership(contract,sites,knownLinks);
    const siteIds=new Set(),companyIds=new Set(),facilityIds=new Map(),entries=[];
    const existing=(rows||[]).filter(r=>clean(r.contract_id)===clean(contract.id));
    for(const c of sites){
      const cid=local(c),oid=online(c);
      if(!cid||!oid||siteIds.has(oid)||companyIds.has(cid))throw Error('공장 연결 ID가 중복되거나 없습니다. 계약창을 다시 열어주세요.');
      siteIds.add(oid);companyIds.add(cid);
      for(const f of c.Facilities||[]){
        const fid=local(f);
        if(!fid)throw Error(siteName(c)+'의 시설 ID가 없습니다. 시설정보를 확인해주세요.');
        if(facilityIds.has(fid))throw Error('여러 공장의 시설 ID가 겹칩니다. 기존 측정주기는 변경하지 않았습니다.');
        facilityIds.set(fid,cid);
        const matches=existing.filter(r=>clean(r.company_legacy_id)===cid&&
          (clean(r.facility_key)===fid||clean(r.facility_legacy_id)===fid));
        if(matches.length>1)throw Error(siteName(c)+'의 같은 시설에 측정주기 행이 여러 개 있습니다. 기존 행을 확인해주세요.');
        const saved=matches[0]||null,fkey=clean(saved?.facility_key)||fid;
        if(existing.some(r=>(clean(r.facility_key)===fkey||clean(r.facility_legacy_id)===fid)&&clean(r.company_legacy_id)!==cid)){
          throw Error('시설 ID가 다른 공장의 기존 측정주기와 겹칩니다. 기존 행을 덮어쓰지 않았습니다.');
        }
        if(entries.some(e=>e.key===fkey))throw Error('공장별 측정주기의 저장 ID가 겹칩니다. 기존 행을 확인해주세요.');
        const baseline={...saved};
        entries.push({company:c,facility:f,key:fkey,baseline:saved?baseline:null,
          baselineSignature:rowSignature(saved),valuesSignature:valuesSignature(saved),element:null});
      }
    }
    return entries;
  }

  function readValues(entry){
    const el=entry.element,out={};
    FIELDS.forEach(k=>out[k]=!!el.querySelector('[data-cycle="'+k+'"]').checked);
    out.note=el.querySelector('[data-cycle-note]').value;
    return out;
  }
  function payloadFor(contract,entry,values){
    return {contract_id:contract.id,company_legacy_id:local(entry.company),company_name:siteName(entry.company),
      facility_key:entry.key,facility_legacy_id:local(entry.facility),facility_name:facilityName(entry.facility),
      ...values,other_label:String(entry.baseline?.other_label??''),
      migration_source:'contract_manual_multisite_396',updated_at:new Date().toISOString()};
  }
  function rowHtml(entry,index){
    const s=entry.baseline||{},f=entry.facility;
    return '<div class="v1203-cycle-row" data-multisite-cycle-row="'+index+'" data-fkey="'+esc(entry.key)+'" data-fid="'+esc(local(f))+'" data-company-id="'+esc(local(entry.company))+'">'+
      '<div class="v1203-cycle-cell v1203-cycle-fac"><strong title="'+esc(facilityName(f))+'">'+esc(facilityName(f))+'</strong><small>'+esc(f.EmissionFacility||'')+'</small></div>'+
      FIELDS.map((k,i)=>'<div class="v1203-cycle-cell v1203-cycle-check"><input type="checkbox" data-cycle="'+k+'" '+(s[k]?'checked':'')+' title="'+LABELS[i]+'"></div>').join('')+
      '<div class="v1203-cycle-cell v1203-cycle-note"><input data-cycle-note value="'+esc(s.note??'')+'" aria-label="'+esc(facilityName(f))+' 비고 / 참고사항"></div></div>';
  }
  function headerHtml(){return '<div class="v1203-cycle-row header"><div class="v1203-cycle-cell">시설</div>'+LABELS.map(x=>'<div class="v1203-cycle-cell">'+x+'</div>').join('')+'<div class="v1203-cycle-cell">비고 / 참고사항</div></div>';}

  async function mount({contract,section,sites,rows,reload}){
    if(!section||!contract?.id||!opted(contract))return null;
    let entries;
    try{entries=buildEntries(contract,sites||[],rows||[]);}
    catch(e){section.innerHTML='<div class="v1203-cycle-section-head"><h3>공장별 시설 측정주기</h3></div><div class="v1203-cycle-empty" role="status">'+esc(e.message)+'</div>';return null;}
    const doc=section.ownerDocument,token={};section._dfMultisiteCycleToken=token;
    const initialSites=sites.map(c=>({online:online(c),local:local(c)}));
    let busy=false;
    section.innerHTML='<div class="v1203-cycle-section-head"><div><h3>공장별 시설 측정주기</h3></div><span class="v1203-cycle-badge">공장 '+sites.length+'개 · 시설 '+entries.length+'개</span></div>'+
      '<div class="v1203-cycle-actions" role="tablist" aria-label="공장 선택">'+sites.map((c,i)=>'<button type="button" class="company-btn '+(i?'secondary':'primary')+'" role="tab" data-multisite-cycle-tab="'+i+'" aria-selected="'+(!i)+'">'+esc(siteName(c))+'</button>').join('')+'</div>'+
      sites.map((c,i)=>{
        const own=entries.filter(e=>local(e.company)===local(c));
        return '<section role="tabpanel" data-multisite-cycle-panel="'+i+'" '+(i?'hidden':'')+'><div class="v1203-cycle-section-head"><div><h3>'+esc(siteName(c))+'</h3><p>'+esc(c.Address||c.address||'')+'</p></div><span class="v1203-cycle-badge">시설 '+own.length+'개</span></div>'+
          (own.length?'<div class="v1203-cycle-list">'+headerHtml()+own.map(e=>rowHtml(e,entries.indexOf(e))).join('')+'</div>':'<div class="v1203-cycle-empty">등록된 시설이 없습니다.</div>')+'</section>';
      }).join('')+'<div class="v1203-cycle-actions"><span data-multisite-cycle-status role="status"></span><button type="button" class="company-btn primary" data-multisite-cycle-save>측정주기 저장</button></div>';
    entries.forEach((e,i)=>{e.element=section.querySelector('[data-multisite-cycle-row="'+i+'"]');});
    const tabs=[...section.querySelectorAll('[data-multisite-cycle-tab]')];
    tabs.forEach(tab=>tab.addEventListener('click',()=>{
      const selected=tab.dataset.multisiteCycleTab;
      tabs.forEach(t=>{const on=t===tab;t.classList.toggle('primary',on);t.classList.toggle('secondary',!on);t.setAttribute('aria-selected',String(on));});
      section.querySelectorAll('[data-multisite-cycle-panel]').forEach(panel=>panel.hidden=panel.dataset.multisiteCyclePanel!==selected);
    }));
    const saveButton=section.querySelector('[data-multisite-cycle-save]'),status=section.querySelector('[data-multisite-cycle-status]');
    const canSave=typeof dfMenuCan==='function'?dfMenuCan('contract','update',typeof dfV68IsAdmin==='function'&&dfV68IsAdmin()):true;
    if(!canSave)section.querySelectorAll('input,[data-multisite-cycle-save]').forEach(el=>el.disabled=true);
    function stillOpen(){return section.isConnected&&section._dfMultisiteCycleToken===token;}
    function selectionChanged(){return doc.getElementById('dfContractSiteSection')?.dataset.siteChanged==='true';}
    async function save(){
      if(busy||!stillOpen())return false;
      if(typeof dfMenuRequire!=='function'||!dfMenuRequire('contract','update',typeof dfV68IsAdmin==='function'&&dfV68IsAdmin()))return false;
      if(global.DFContractFacilities?.beforeCycleSave(section)===false)return false;
      const dirty=entries.filter(entry=>!entry.element.hidden).map(entry=>({entry,values:readValues(entry)})).filter(x=>valuesSignature(x.values)!==x.entry.valuesSignature);
      if(!dirty.length){status.textContent='변경된 측정주기가 없습니다.';return true;}
      const controls=[...section.querySelectorAll('button,input')].map(el=>({el,disabled:el.disabled}));
      busy=true;controls.forEach(x=>x.el.disabled=true);saveButton.textContent='저장 중...';status.textContent='';
      let written=false;
      try{
        if(selectionChanged())throw Error('공장 연결이 변경되었습니다. 계약을 먼저 저장한 뒤 측정주기를 설정해주세요.');
        const snapshot=await global.DFContractSites.snapshot(true);
        const latest=(snapshot.contracts||[]).find(r=>clean(r.id)===clean(contract.id));
        if(!latest||!opted(latest))throw Error('계약의 공장 연결이 변경되었습니다. 계약창을 다시 열어주세요.');
        const freshSites=global.DFContractSites.resolveAll(latest,sourceCompanies(),snapshot.links);
        if(!freshSites.length||online(freshSites[0])!==initialSites[0].online||
          siteSignature(freshSites)!==siteSignature(sites)||
          initialSites.some(c=>!freshSites.some(f=>online(f)===c.online&&local(f)===c.local))){
          throw Error('계약의 공장 연결이 변경되었습니다. 계약창을 다시 열어주세요.');
        }
        const current=await dfSupabase.from(TABLE).select('*').eq('contract_id',contract.id);
        if(current.error)throw current.error;
        const freshEntries=buildEntries(latest,freshSites,current.data||[],snapshot.links);
        for(const {entry} of dirty){
          const fresh=freshEntries.find(e=>local(e.company)===local(entry.company)&&local(e.facility)===local(entry.facility));
          if(!fresh||fresh.key!==entry.key)throw Error('시설 연결이 변경되었습니다. 계약창을 다시 열어주세요.');
          if(fresh.baselineSignature!==entry.baselineSignature)throw Error('다른 곳에서 측정주기가 변경되었습니다. 계약창을 다시 열어 최신 내용을 확인해주세요.');
        }
        if(!stillOpen()||selectionChanged())throw Error('계약창 또는 공장 연결이 변경되어 저장을 중단했습니다.');
        const result=await dfSupabase.from(TABLE).upsert(dirty.map(x=>payloadFor(contract,x.entry,x.values)),{onConflict:'contract_id,facility_key'});
        if(result.error)throw result.error;
        written=true;status.textContent='공장별 측정주기를 저장했습니다.';
        await global.dfV1205LoadCompanyCycles?.();
        if(stillOpen()&&typeof reload==='function')await reload();
        return true;
      }catch(e){
        const message=(written?'측정주기는 저장됐습니다. 계약창을 다시 열어 확인해주세요.\n':'측정주기 저장 실패\n')+(e.message||e);
        if(stillOpen())status.textContent=message;
        global.DF_DIAG?.error('CONTRACT-MULTISITE-CYCLE',message,e?.message||String(e));
        global.alert?.(message);
        return false;
      }finally{
        busy=false;
        if(stillOpen()){controls.forEach(x=>x.el.disabled=x.disabled);saveButton.textContent='측정주기 저장';}
      }
    }
    saveButton.addEventListener('click',()=>save());
    global.DFContractFacilities?.mount({contract,section,sites,appendFacility:(company,facility)=>{
      const index=sites.findIndex(c=>online(c)===online(company));if(index<0)throw Error('설비의 소속 공장을 확인해주세요.');
      const panel=section.querySelector('[data-multisite-cycle-panel="'+index+'"]');let list=panel.querySelector('.v1203-cycle-list');
      if(!list){list=doc.createElement('div');list.className='v1203-cycle-list';list.innerHTML=headerHtml();panel.querySelector('.v1203-cycle-empty')?.remove();panel.append(list);}
      const entry={company,facility,key:local(facility),baseline:null,baselineSignature:rowSignature(null),valuesSignature:valuesSignature(null),element:null};
      entries.push(entry);list.insertAdjacentHTML('beforeend',rowHtml(entry,entries.length-1));entry.element=list.lastElementChild;
      const badge=panel.querySelector('.v1203-cycle-badge');if(badge)badge.textContent='시설 '+company.Facilities.length+'개';
      const total=section.querySelector('.v1203-cycle-badge');if(total)total.textContent='공장 '+sites.length+'개 · 시설 '+entries.length+'개';
      return entry.element;
    }});
    return {save};
  }
  global.DFContractMultiCycles={mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=global.DFContractMultiCycles;
})(typeof window!=='undefined'?window:globalThis);
