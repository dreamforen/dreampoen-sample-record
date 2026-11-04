/* Beta 3.96: optional, explicit additional factories under one contract. */
(function(global){
  'use strict';
  const states=new WeakMap(),MAX_SITES=50;
  const clean=v=>String(v??'').trim();
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
  const online=c=>clean(c?.OnlineId||c?.id);
  const active=c=>!!c&&!c.ContractOnly&&c.active!==false&&c.Active!==false;
  const norm=v=>clean(v).normalize('NFKC').toLowerCase().replace(/[\s\-_/().,\[\]]+/g,'');
  const label=c=>[c?.name??c?.Name,c?.biz_no??c?.BizNo,c?.address??c?.Address].map(clean).filter(Boolean).join(' · ');
  function changed(section,state){
    state.edited=true;section.dataset.siteChanged='true';
    const cycle=section.ownerDocument.getElementById('v1203ContractCycleSection');
    cycle?.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  }
  function mount({section,existing,rows=[],can=false,primarySelect}){
    if(!section||!primarySelect)return;
    section.querySelector('[data-additional-sites]')?.remove();
    const doc=section.ownerDocument,extra=existing?.extra_data||{},enabled=extra.site_group_version===1;
    const raw=enabled?extra.additional_site_company_ids:undefined;
    const entries=Array.isArray(raw)?raw.map(value=>({value})):raw===undefined?[]:[{value:raw}];
    const state={entries,edited:false,can,enabled};states.set(section,state);
    const details=doc.createElement('details');details.className='contract-editor-section';details.dataset.additionalSites='';
    const summary=doc.createElement('summary');summary.textContent='추가 공장 연결';details.appendChild(summary);
    const searchLabel=doc.createElement('label');searchLabel.textContent='공장 검색';
    const search=doc.createElement('input');search.type='search';search.placeholder='공장명 · 사업자번호 · 주소';search.dataset.additionalSearch='';search.disabled=!can;searchLabel.appendChild(search);details.appendChild(searchLabel);
    const selectLabel=doc.createElement('label');selectLabel.textContent='추가할 공장';
    const select=doc.createElement('select');select.dataset.additionalSelect='';select.disabled=!can;selectLabel.appendChild(select);details.appendChild(selectLabel);
    const add=doc.createElement('button');add.type='button';add.className='company-btn secondary';add.dataset.additionalAdd='';add.textContent='공장 추가';details.appendChild(add);
    const list=doc.createElement('div');list.dataset.additionalList='';details.appendChild(list);
    const note=doc.createElement('p');note.dataset.additionalNote='';note.setAttribute('role','status');details.appendChild(note);
    section.appendChild(details);
    const chosen=()=>new Set(state.entries.filter(e=>typeof e.value==='string').map(e=>clean(e.value)));
    const primaryId=()=>{
      const selected=clean(primarySelect.value);
      if(selected)return selected;
      return online(global.DFContractSites?.resolve(existing,rows));
    };
    function drawOptions(){
      const selected=select.value,q=norm(search.value),used=chosen(),primary=primaryId();select.replaceChildren();
      const empty=doc.createElement('option');empty.value='';empty.textContent='공장을 선택하세요';select.appendChild(empty);
      const seen=new Set();
      for(const c of rows){const id=online(c);if(!active(c)||!uuid(id)||id===primary||used.has(id)||seen.has(id)||q&&!norm(label(c)).includes(q))continue;seen.add(id);const option=doc.createElement('option');option.value=id;option.textContent=label(c);select.appendChild(option);}
      select.value=selected;if(!select.value)select.value='';add.disabled=!can||!select.value||state.entries.length>=MAX_SITES;
    }
    function draw(){
      list.replaceChildren();let invalid=0;
      for(const entry of state.entries){
        const id=typeof entry.value==='string'?clean(entry.value):'',c=uuid(id)?rows.find(x=>online(x)===id&&active(x)):null;
        const row=doc.createElement('article');row.className='contract-editor-section';row.dataset.additionalEntry='';
        const title=doc.createElement('strong');title.textContent=c?clean(c.name??c.Name):'연결 확인 필요';row.appendChild(title);
        const meta=doc.createElement('p');meta.textContent=c?label(c):'등록되지 않았거나 비활성화된 공장입니다. ID: '+(id||'유효하지 않은 ID');row.appendChild(meta);
        if(!c)invalid++;
        const remove=doc.createElement('button');remove.type='button';remove.className='company-btn secondary';remove.dataset.additionalRemove='';remove.textContent='연결 제외';remove.disabled=!can;
        remove.addEventListener('click',()=>{if(!can)return;state.entries=state.entries.filter(x=>x!==entry);changed(section,state);draw();});row.appendChild(remove);list.appendChild(row);
      }
      summary.textContent='추가 공장 연결'+(invalid?' · 연결 확인 필요 '+invalid+'개':'');
      note.textContent=invalid?'확인이 필요한 공장 '+invalid+'개 · 연결을 수정하려면 해당 공장을 제외한 뒤 다시 선택해주세요.':state.entries.length?'추가 공장 '+state.entries.length+'개 · 계약 저장 시 적용됩니다.':'추가 연결된 공장이 없습니다.';
      drawOptions();
    }
    search.addEventListener('input',drawOptions);select.addEventListener('change',()=>{add.disabled=!can||!select.value||state.entries.length>=MAX_SITES;});
    add.addEventListener('click',()=>{
      if(!can||!select.value||state.entries.length>=MAX_SITES)return;
      const id=select.value,c=rows.find(x=>online(x)===id&&active(x));
      if(!uuid(id)||!c||id===primaryId()||chosen().has(id))return;
      state.entries.push({value:id});changed(section,state);select.value='';draw();
    });
    primarySelect.addEventListener('change',()=>{if(state.enabled||state.entries.length)changed(section,state);draw();});
    draw();return details;
  }
  function collect({section,current,primary,rows=[]}){
    const state=states.get(section);if(!state?.edited||!state.can)return null;
    const primaryId=online(primary),ids=[],seen=new Set();
    for(const entry of state.entries){
      const id=typeof entry.value==='string'?clean(entry.value):'';
      if(!uuid(id))throw Error('추가 공장에 유효하지 않은 ID가 있습니다. 해당 연결을 제외한 뒤 다시 선택해주세요.');
      const c=rows.find(c=>online(c)===id&&active(c));
      if(!c)throw Error('추가 공장이 삭제되었거나 비활성화되었습니다. 계약창을 다시 열어 연결을 확인해주세요.');
      if(id===primaryId||seen.has(id))continue;seen.add(id);ids.push(id);
    }
    if(ids.length>MAX_SITES)throw Error('추가 공장은 최대 '+MAX_SITES+'개까지 연결할 수 있습니다.');
    return {site_group_version:1,additional_site_company_ids:ids};
  }
  global.DFContractMultiSites=Object.freeze({mount,collect});
  if(typeof module!=='undefined'&&module.exports)module.exports=global.DFContractMultiSites;
})(typeof window!=='undefined'?window:globalThis);
