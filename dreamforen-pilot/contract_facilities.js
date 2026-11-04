/* Beta 3.9.7: contract-only facility lists. Company/facility/cycle/schedule/sample data are never written here. */
(function(global){
  'use strict';
  const KEY='contract_facilities_v397',REVISION_PATH='extra_data->'+KEY+'->>revision';
  const states=new WeakMap();let active=null;
  const clean=v=>String(v??'').trim(),clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const online=c=>clean(global.DFContractSites?.online(c)||c?.OnlineId||c?.id);
  const local=c=>clean(c?.Id||c?.legacy_id||c?.id);
  const fid=f=>clean(f?.OnlineId||f?.id||f?.Id||f?.legacy_id);
  const label=f=>clean(f?.FacilityName||f?.PreventionFacility||f?.facility_name||f?.name||'설비');
  const stable=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])):v??null);
  const equal=(a,b)=>stable(a)===stable(b);
  function read(contract){
    const value=contract?.extra_data?.[KEY];
    if(value==null)return null;
    if(!value||value.version!==1||!value.sites||typeof value.sites!=='object'||Array.isArray(value.sites))throw Error('저장된 계약 설비목록의 형식을 확인해주세요. 기존 목록은 변경하지 않았습니다.');
    for(const [site,ids] of Object.entries(value.sites)){
      if(!site||!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string'||!clean(id)||id.length>250)||new Set(ids).size!==ids.length)throw Error('저장된 계약 설비 연결을 확인해주세요.');
    }
    if(value.revision!=null&&(typeof value.revision!=='string'||!value.revision))throw Error('계약 설비목록의 저장 버전을 확인해주세요.');
    return value;
  }
  function selected(contract,company){
    const doc=read(contract),id=online(company);
    return doc&&own(doc.sites,id)?[...doc.sites[id]]:(company.Facilities||[]).map(fid);
  }
  function build(contract,lists,revision){
    const previous=read(contract),sites={...(previous?.sites||{})};
    for(const {company,ids} of lists){
      const id=online(company);
      if(!id||ids.some(x=>typeof x!=='string'||!clean(x))||new Set(ids).size!==ids.length)throw Error('계약 설비 ID가 중복되거나 없습니다.');
      sites[id]=[...ids];
    }
    return {...(previous||{}),version:1,revision,sites};
  }
  const siteSignature=sites=>stable(sites.map(c=>[online(c),local(c)]));
  function binding(contract,links){
    return stable({primary:global.DFContractSites.explicitRef(contract,links),version:contract.extra_data?.site_group_version??null,additional:contract.extra_data?.additional_site_company_ids??null});
  }
  const companies=()=>typeof companyState==='undefined'?[]:companyState.db?.Companies||[];
  const user=()=>typeof dfCloudUser==='undefined'?'':clean(dfCloudUser?.id);
  const client=()=>typeof dfSupabase==='undefined'?null:dfSupabase;
  const canEdit=()=>{try{return !!user()&&dfMenuCan('contract','update',dfV68IsAdmin());}catch(_){return false;}};
  const revision=()=>global.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  async function registeredFacilities(api,siteIds){
    const data=[];for(let from=0;;from+=1000){
      const result=await global.DFContractSites.request(api.from('facilities').select('id,legacy_id,company_id').in('company_id',siteIds).order('id',{ascending:true}).range(from,from+999),'등록 설비 확인');
      if(result.error)throw result.error;if(!Array.isArray(result.data))throw Error('등록 설비 응답을 확인해주세요.');
      data.push(...result.data);if(result.data.length<1000)return {data,error:null};
    }
  }


  function mountInternal({contract,section,sites}){
    if(!contract?.id||!section||!Array.isArray(sites)||!sites.length)return null;
    if(states.has(section))return states.get(section).controller;
    active?.dispose?.();
    const doc=section.ownerDocument;
    const initial=clone(read(contract));
    const state={contract,section,sites:[],initial,busy:false,dirty:false,user:user(),error:'',disposed:false};
    states.set(section,state);active=state;
    const sourceRows=[...section.querySelectorAll('.v1203-cycle-row[data-fid]')];
    const sourceSignature=siteSignature(sites),initialBinding=binding(contract);
    for(let i=0;i<sites.length;i++){
      const company=sites[i],panel=section.querySelector('[data-multisite-cycle-panel="'+i+'"]')||section;
      const source=company.Facilities||[],keys=new Set(),entries=[];
      const chosen=new Set(selected(contract,company));
      for(const f of source){
        const id=fid(f);if(!id||keys.has(id))throw Error('설비 ID가 없거나 중복되어 계약목록을 수정할 수 없습니다.');keys.add(id);
        const row=sourceRows.find(el=>clean(el.dataset.fid)===local(f)&&(!el.dataset.companyId||clean(el.dataset.companyId)===local(company)));
        if(!row)throw Error('설비 표시를 확인할 수 없습니다. 계약창을 다시 열어주세요.');
        entries.push({facility:f,id,row,display:row.style.display});
      }
      const site={company,panel,source,entries,chosen,missing:[],initialIds:[...chosen]};state.sites.push(site);
      const toolbar=doc.createElement('div');toolbar.className='v1203-cycle-actions';toolbar.dataset.contractFacilitiesToolbar=online(company);toolbar.style.flexWrap='wrap';
      const count=doc.createElement('small');count.dataset.contractFacilitiesCount='';toolbar.append(count);site.count=count;
      const addButton=doc.createElement('button');addButton.type='button';addButton.className='company-btn secondary';addButton.dataset.contractFacilityAdd='';addButton.textContent='설비 추가';toolbar.append(addButton);
      const head=panel.querySelector('.v1203-cycle-section-head');if(head)head.after(toolbar);else panel.prepend(toolbar);
      const picker=doc.createElement('div');picker.className='contract-editor-section contract-editor-grid';picker.hidden=true;picker.style.display='none';picker.dataset.contractFacilityPicker='';
      const search=doc.createElement('input');search.type='search';search.placeholder='등록 설비 검색';search.setAttribute('aria-label','등록 설비 검색');picker.append(search);
      const select=doc.createElement('select');select.setAttribute('aria-label','추가할 등록 설비');picker.append(select);
      const add=doc.createElement('button');add.type='button';add.className='company-btn primary';add.textContent='추가';add.dataset.contractFacilityPickSave='';picker.append(add);
      const close=doc.createElement('button');close.type='button';close.className='company-btn secondary';close.textContent='닫기';picker.append(close);toolbar.after(picker);
      function options(){
        select.replaceChildren();const q=clean(search.value).toLowerCase(),available=entries.filter(e=>!site.chosen.has(e.id)&&(!q||[label(e.facility),e.facility.EmissionFacility,e.id].join(' ').toLowerCase().includes(q)));
        for(const e of available){const o=doc.createElement('option');o.value=e.id;o.textContent=[label(e.facility),e.facility.EmissionFacility].filter(Boolean).join(' · ');select.append(o);}
        if(!available.length){const o=doc.createElement('option');o.value='';o.textContent='추가할 등록 설비가 없습니다';select.append(o);}
        add.disabled=!available.length||!editable();
      }
      site.options=options;
      addButton.addEventListener('click',()=>{if(!interact())return;picker.hidden=!picker.hidden;picker.style.display=picker.hidden?'none':'grid';if(!picker.hidden){options();search.focus();}});
      search.addEventListener('input',options);close.addEventListener('click',()=>{picker.hidden=true;picker.style.display='none';});
      add.addEventListener('click',()=>{if(!interact()||!select.value)return;site.chosen.add(select.value);change();options();});
      for(const e of entries){
        const remove=doc.createElement('button');remove.type='button';remove.className='company-btn secondary';remove.textContent='삭제';remove.dataset.contractFacilityRemove=e.id;remove.style.cssText='height:24px;font-size:11px;line-height:18px;padding:2px 8px;margin-top:4px';
        remove.addEventListener('click',()=>{if(!interact())return;if(!global.confirm('이 설비를 해당 계약 목록에서 제외할까요?\n업체현황의 설비 원본과 기존 측정기록·주기는 유지됩니다.'))return;site.chosen.delete(e.id);change();});
        (e.row.querySelector('.v1203-cycle-fac')||e.row.firstElementChild).append(remove);
      }
      for(const id of chosen){if(keys.has(id))continue;
        const row=doc.createElement('div');row.className='contract-editor-section';row.dataset.contractFacilityMissing=id;
        const text=doc.createElement('span');text.textContent='등록정보 확인 필요 · '+id;row.append(text);
        const remove=doc.createElement('button');remove.type='button';remove.className='company-btn secondary';remove.textContent='삭제';remove.dataset.contractFacilityRemove=id;row.append(remove);
        remove.addEventListener('click',()=>{if(!interact())return;site.chosen.delete(id);change();});
        panel.append(row);site.missing.push({id,row});
      }
      const empty=doc.createElement('div');empty.className='v1203-cycle-empty';empty.textContent='계약에 포함된 설비가 없습니다.';empty.dataset.contractFacilitiesEmpty='';panel.append(empty);site.empty=empty;
    }
    const actions=doc.createElement('div');actions.className='v1203-cycle-actions';actions.dataset.contractFacilityActions='';actions.style.flexWrap='wrap';
    const message=doc.createElement('small');message.setAttribute('role','status');message.setAttribute('aria-live','polite');actions.append(message);
    const saveButton=doc.createElement('button');saveButton.type='button';saveButton.className='company-btn primary';saveButton.textContent='설비목록 저장';saveButton.dataset.contractFacilitiesSave='';actions.append(saveButton);section.append(actions);
    const periodButtons=()=>[...section.querySelectorAll('#v1203CycleSave,[data-multisite-cycle-save]')];
    const pendingSite=()=>doc.getElementById('dfContractSiteSection')?.dataset.siteChanged==='true';
    const periodSaving=()=>periodButtons().some(b=>b.disabled&&/저장\s*중/.test(b.textContent));
    const editable=()=>!state.disposed&&state.user===user()&&canEdit()&&!pendingSite();
    function interact(){
      if(!editable()||state.busy)return false;
      if(periodSaving()||doc.getElementById('contractEditSave')?.disabled){state.error='저장이 끝난 뒤 설비목록을 수정해주세요.';paint();return false;}
      return true;
    }
    const hasMissing=()=>state.sites.some(s=>s.missing.some(e=>s.chosen.has(e.id)));
    const listChanged=()=>state.sites.some(s=>!equal([...s.chosen].sort(),s.initialIds.slice().sort()));
    function paint(){
      if(state.disposed)return;
      const allowed=editable(),visible=state.sites.reduce((n,s)=>n+s.entries.filter(e=>s.chosen.has(e.id)).length,0);
      for(const site of state.sites){
        let n=0;for(const e of site.entries){const selected=site.chosen.has(e.id);e.row.hidden=!selected;e.row.style.display=selected?e.display:'none';if(selected)n++;}
        for(const e of site.missing){e.row.hidden=!site.chosen.has(e.id);e.row.style.display=e.row.hidden?'none':'';}
        site.count.textContent='계약 설비 '+n+'개 · 등록 설비 '+site.entries.length+'개';site.empty.hidden=n>0;
      }
      for(const el of section.querySelectorAll('[data-contract-facilities-toolbar] button,[data-contract-facility-picker] button,[data-contract-facility-picker] input,[data-contract-facility-picker] select,[data-contract-facility-remove]')){el.disabled=!allowed||state.busy;}
      for(const p of periodButtons())if(!periodSaving())p.disabled=!allowed||state.busy||state.dirty||visible===0;
      saveButton.hidden=!canEdit();saveButton.disabled=!allowed||state.busy||hasMissing()||!(state.dirty||!state.initial);saveButton.textContent=state.busy?'저장 중…':'설비목록 저장';
      message.textContent=state.error||(pendingSite()?'사업장 변경을 먼저 계약에 저장해주세요.':hasMissing()?'등록정보가 없는 설비를 확인하거나 계약 목록에서 제외해주세요.':state.dirty?'설비목록을 저장해주세요.':state.initial?'저장된 계약 설비목록':'필요한 설비를 선택해 목록을 저장할 수 있습니다.');
    }
    function change(){state.error='';state.dirty=listChanged();paint();}
    function stillOpen(){return !state.disposed&&section.isConnected&&states.get(section)===state;}
    async function save(){
      if(!interact()||hasMissing()||(!state.dirty&&state.initial))return false;
      const api=client(),identity=user();if(!api||!identity)return false;
      const mainButton=doc.getElementById('contractEditSave'),mainDisabled=mainButton?.disabled;
      state.busy=true;state.error='';if(mainButton)mainButton.disabled=true;paint();let written=false;
      try{
        const requests=[api.from('contracts').select('*').eq('id',contract.id).maybeSingle(),api.from('contract_company_links').select('contract_id,company_id').eq('contract_id',contract.id),dfV68FetchAll('companies','id,legacy_id,name,biz_no,address,active'),registeredFacilities(api,sites.map(online))];
        const [current,links,freshCompanies,facilities]=await global.DFContractSites.request(Promise.all(requests),'계약 설비 확인');
        for(const r of [current,links,facilities])if(r.error)throw r.error;
        if(!stillOpen()||api!==client()||identity!==user()||!canEdit()||pendingSite())throw Error('계약창 또는 로그인·연결 정보가 변경되어 저장을 중단했습니다.');
        const fresh=current.data;if(!fresh)throw Error('계약이 삭제되었거나 조회되지 않습니다. 새 계약에서 다시 설정해주세요.');
        if(!equal(read(fresh),state.initial)||!equal(fresh.extra_data,contract.extra_data)||clean(fresh.updated_at)!==clean(contract.updated_at))throw Error('다른 곳에서 계약이 변경되었습니다. 작성 중인 목록은 유지됩니다. 계약창을 다시 열어주세요.');
        const freshSites=global.DFContractSites.resolveAll(fresh,freshCompanies,links.data||[]);
        if(binding(fresh,links.data||[])!==initialBinding||siteSignature(freshSites)!==sourceSignature)throw Error('계약의 연결 사업장이 변경되었습니다. 계약창을 다시 열어주세요.');
        const lists=state.sites.map(s=>({company:s.company,ids:[...s.chosen]}));
        for(const {company,ids} of lists)for(const id of ids){
          const hits=(facilities.data||[]).filter(f=>clean(f.company_id)===online(company)&&(clean(f.id)===id||clean(f.legacy_id)===id));
          if(hits.length!==1)throw Error('등록 설비가 변경되었거나 다른 사업장에 연결되어 있습니다. 목록을 다시 확인해주세요.');
        }
        const next=build(fresh,lists,revision()),extra={...(fresh.extra_data||{}),[KEY]:next};
        let query=api.from('contracts').update({extra_data:extra}).eq('id',contract.id);
        query=fresh.updated_at==null?query.is('updated_at',null):query.eq('updated_at',fresh.updated_at);
        const oldRevision=read(fresh)?.revision;query=oldRevision==null?query.is(REVISION_PATH,null):query.eq(REVISION_PATH,oldRevision);
        const saved=await global.DFContractSites.request(query.select('*').maybeSingle(),'계약 설비목록 저장');
        if(saved.error)throw saved.error;if(!saved.data)throw Error('동시에 계약이 변경되었거나 저장 권한을 확인할 수 없습니다. 계약창을 다시 열어주세요.');written=true;
        if(!stillOpen()||api!==client()||identity!==user())throw Error('로그인이 변경되었습니다. 저장 결과는 계약창을 다시 열어 확인해주세요.');
        if(!equal(read(saved.data),next))throw Error('저장 결과가 요청한 설비목록과 다릅니다. 계약창을 다시 열어 확인해주세요.');
        contract.extra_data=clone(saved.data.extra_data);contract.updated_at=saved.data.updated_at;
        if(typeof dfV68ContractState!=='undefined'){
          const cached=dfV68ContractState.rows?.find(r=>clean(r.id)===clean(contract.id));if(cached){cached.extra_data=clone(saved.data.extra_data);cached.updated_at=saved.data.updated_at;}
        }
        state.initial=clone(next);state.sites.forEach(s=>s.initialIds=[...s.chosen]);state.dirty=false;state.error='설비목록을 저장했습니다.';global.DFContractSites.invalidateReads();return true;
      }catch(e){state.error=(written?'저장 결과를 다시 확인해주세요. ':'저장하지 못했습니다. ')+(e.message||e);global.DF_DIAG?.warn('CONTRACT-FACILITY-LIST',state.error);return false;}
      finally{state.busy=false;if(mainButton)mainButton.disabled=!!mainDisabled||!canEdit();if(stillOpen())paint();}
    }
    const onChange=e=>{if(e.target?.closest?.('#dfContractSiteSection'))queueMicrotask(()=>{if(stillOpen())paint();});};
    const onPermission=()=>{if(stillOpen())paint();else state.dispose();};
    const body=doc.getElementById('contractModalBody'),mainSave=doc.getElementById('contractEditSave');
    const onMainSave=event=>{if(state.busy||state.dirty){event.preventDefault();event.stopImmediatePropagation();state.error='설비목록 저장을 먼저 눌러주세요.';paint();saveButton.focus();}};
    body?.addEventListener('change',onChange,true);doc.addEventListener('df:menu-permissions-changed',onPermission);mainSave?.addEventListener('click',onMainSave,true);
    state.dispose=()=>{state.disposed=true;body?.removeEventListener('change',onChange,true);doc.removeEventListener('df:menu-permissions-changed',onPermission);mainSave?.removeEventListener('click',onMainSave,true);};
    state.controller={save,selected:()=>state.sites.map(s=>({company_id:online(s.company),facility_ids:[...s.chosen]})),hasDraft:()=>state.dirty};
    saveButton.addEventListener('click',()=>save());paint();return state.controller;
  }
  function mount(options){
    try{return mountInternal(options);}catch(error){
      const section=options?.section;if(!section)return null;
      states.get(section)?.dispose?.();states.set(section,{invalid:true});
      const message=section.ownerDocument.createElement('p');message.setAttribute('role','status');message.textContent=error.message||String(error);section.append(message);
      section.querySelectorAll('input,button,select').forEach(el=>el.disabled=true);
      section.querySelectorAll('.v1203-cycle-row[data-fid]').forEach(el=>{el.hidden=true;el.style.display='none';});
      return null;
    }
  }
  function beforeCycleSave(section){
    const state=states.get(section);if(!state)return true;
    if(state.disposed||state.user!==user()){global.alert?.('계약창을 다시 열어주세요.');return false;}
    if(state.invalid){global.alert?.('계약 설비목록을 확인한 뒤 계약창을 다시 열어주세요.');return false;}
    if(state.busy||state.dirty){global.alert?.('설비목록을 먼저 저장해주세요.');return false;}
    return true;
  }
  global.DFContractFacilities=Object.freeze({KEY,read,selected,build,mount,beforeCycleSave});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.DFContractFacilities;
})(typeof window!=='undefined'?window:globalThis);
