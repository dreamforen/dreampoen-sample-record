/* Beta 441: an extension is a new contract, linked to the same registered sites.
   The source contract, facilities, schedules, reports and accounting are never written here. */
(function(global){
  'use strict';
  const KEY='contract_renewal_v441',TABLE='dreampoen_contract_facility_cycles';
  const FLAGS=['monthly_1','monthly_2','quarterly_1','halfyear_1','yearly_1','other_cycle'];
  const BASE=['contract_name','field','grade','amount','authority','requester_name','requester_address','requester_biz_no','target_name','target_address','target_biz_no'];
  const EXTRA=['amount_basis','contact_name','contact_phone','memo','custom_fields','site_company_id','manual_company_legacy_id','site_link_version','site_group_version','additional_site_company_ids','contract_facilities_v397'];
  const clean=v=>String(v??'').trim(),clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const stable=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])):v??null);
  const online=c=>clean(c?.OnlineId||c?.id),local=c=>clean(c?.legacy_id||c?.Id||c?.id);
  const actor=()=>typeof dfCloudUser==='undefined'?'':clean(dfCloudUser?.id);
  const client=()=>typeof dfSupabase==='undefined'?null:dfSupabase;
  const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const can=action=>{try{return !!actor()&&!!dfMenuCan('contract',action,dfV68IsAdmin());}catch(_){return false;}};
  const active=c=>!!c&&!c.ContractOnly&&c.active!==false&&c.Active!==false;
  const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>Object.prototype.hasOwnProperty.call(o||{},k)).map(k=>[k,clone(o[k])]));
  let mounted=null;

  function date(value){
    const text=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
    const d=new Date(text+'T00:00:00.000Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===text?d:null;
  }
  function period(end,now=today()){
    const d=date(end)||date(now);if(!d)throw Error('계약기간을 확인해주세요.');
    if(date(end))d.setUTCDate(d.getUTCDate()+1);
    const start=d.toISOString().slice(0,10);d.setUTCFullYear(d.getUTCFullYear()+1);d.setUTCDate(d.getUTCDate()-1);
    return {start_date:start,end_date:d.toISOString().slice(0,10),needs_review:!date(end)||d.toISOString().slice(0,10)<now};
  }
  function renewable(r,now=today()){
    if(!r?.id||/취소|해지/.test(clean(r.source_status)))return false;
    return !!(date(r.end_date)&&r.end_date<now)||/종결|만료/.test(clean(r.source_status));
  }
  function cycleTuple(r){
    return [clean(r.company_legacy_id),String(r.company_name??''),clean(r.facility_key),clean(r.facility_legacy_id),String(r.facility_name??''),FLAGS.reduce((n,k,i)=>n+(r[k]?1<<i:0),0),String(r.other_label??''),String(r.note??'')];
  }
  function cycleRow(t,contractId){
    if(!Array.isArray(t)||t.length!==8||!clean(t[0])||!clean(t[2])||!Number.isInteger(t[5])||t[5]<0||t[5]>63)throw Error('연장 계약의 측정주기 보관내용을 확인해주세요.');
    return {contract_id:contractId,company_legacy_id:t[0],company_name:t[1],facility_key:t[2],facility_legacy_id:t[3],facility_name:t[4],...Object.fromEntries(FLAGS.map((k,i)=>[k,!!(t[5]&(1<<i))])),other_label:t[6],note:t[7]};
  }
  const tuples=rows=>(rows||[]).map(cycleTuple).sort((a,b)=>a[2].localeCompare(b[2]));
  const sourceSignature=r=>stable({id:r.id,updated_at:r.updated_at??null,...pick(r,BASE),contract_no:r.contract_no,start_date:r.start_date,end_date:r.end_date,source_status:r.source_status,extra_data:pick(r.extra_data,EXTRA)});
  const binding=r=>stable(pick(r?.extra_data,['site_company_id','manual_company_legacy_id','site_group_version','additional_site_company_ids','contract_facilities_v397']));

  function validateSites(source,rows,links=[]){
    const ref=global.DFContractSites?.explicitRef(source,links);
    if(!ref)throw Error('기존 계약의 사업장 연결을 먼저 저장한 뒤 연장해주세요.');
    const primary=(rows||[]).find(c=>(ref.kind==='id'?online(c):local(c))===clean(ref.value));
    if(!active(primary))throw Error('기존 연결 사업장이 비활성 상태이거나 조회되지 않습니다. 사업장 연결을 확인한 뒤 연장해주세요.');
    const extra=source.extra_data||{},ids=extra.site_group_version===1?extra.additional_site_company_ids||[]:[];
    if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!clean(id))||new Set(ids).size!==ids.length||ids.includes(online(primary)))throw Error('기존 계약의 추가 사업장 연결을 확인해주세요.');
    const additional=ids.map(id=>(rows||[]).find(c=>online(c)===id));
    if(additional.some(c=>!active(c)))throw Error('추가 연결 사업장 중 비활성 상태이거나 조회되지 않는 사업장이 있습니다. 연결을 확인한 뒤 연장해주세요.');
    const sites=[primary,...additional];
    if(new Set(sites.map(local)).size!==sites.length)throw Error('연결 사업장의 원본 ID가 중복되어 연장하지 않았습니다.');
    return {primary,additional,sites};
  }
  function validateCycles(rows,sites,facilities){
    const keys=new Set();
    for(const row of rows||[]){
      const key=clean(row.facility_key),cid=clean(row.company_legacy_id),company=sites.find(c=>local(c)===cid||online(c)===cid);
      if(!company||!key||keys.has(key))throw Error('기존 측정주기의 사업장·시설 연결이 중복되거나 확인되지 않습니다.');keys.add(key);
      const aliases=new Set([key,clean(row.facility_legacy_id)].filter(Boolean));
      const hits=(facilities||[]).filter(f=>clean(f.company_id)===online(company)&&[clean(f.id),clean(f.legacy_id)].some(id=>aliases.has(id)));
      if(hits.length!==1)throw Error('기존 측정주기의 시설 ID를 확인할 수 없습니다. 시설 연결을 확인한 뒤 연장해주세요.');
    }
  }
  function prepare(source,{today:now=today(),cycles=[],primary,additional=[],actor:who=actor()}={}){
    if(!source?.id||!primary||!online(primary))throw Error('기존 계약과 연결 사업장을 확인해주세요.');
    const p=period(source.end_date,now),extra=pick(source.extra_data,EXTRA),seed=pick(source,BASE);
    extra.site_company_id=online(primary);extra.manual_company_legacy_id=local(primary);extra.site_link_version=2;
    if(additional.length||extra.site_group_version===1){extra.site_group_version=1;extra.additional_site_company_ids=additional.map(online);}
    const rows=tuples(cycles);
    if(rows.length>1500||stable(rows).length>250000)throw Error('시설별 측정주기가 많아 자동 연장 범위를 초과했습니다. 기존 계약을 유지한 채 별도로 확인해주세요.');
    extra[KEY]={version:1,source_contract_id:clean(source.id),source_contract_no:clean(source.contract_no),source_updated_at:source.updated_at??null,source_signature:sourceSignature(source),source_start_date:source.start_date??null,source_end_date:source.end_date??null,prepared_at:new Date().toISOString(),prepared_by:who,primary_company_id:online(primary),additional_company_ids:additional.map(online),cycle_status:rows.length?'pending':'copied',cycles:rows,period_review:p.needs_review};
    Object.assign(seed,{contract_no:'',source_status:'계약진행',contract_date:now,start_date:p.start_date,end_date:p.end_date,source_file:'웹 계약연장',registered_date:now,source_year:Number(now.slice(0,4)),source_half:Number(now.slice(5,7))<=6?'상반기':'하반기',extra_data:extra});
    return seed;
  }
  function metadata(seed){
    const m=seed?.extra_data?.[KEY];
    if(!m||m.version!==1||!clean(m.source_contract_id)||!clean(m.primary_company_id)||!Array.isArray(m.additional_company_ids)||!Array.isArray(m.cycles))throw Error('계약연장 원본 정보를 확인해주세요. 계약창을 다시 열어주세요.');
    if(m.cycles.length>1500||stable(m.cycles).length>250000)throw Error('계약연장 측정주기 정보를 확인해주세요.');
    m.cycles.forEach(t=>cycleRow(t,''));return m;
  }
  const request=(query,label)=>global.DFContractSites?.request?global.DFContractSites.request(query,label):Promise.resolve(query);
  async function one(api,id){
    const q=await request(api.from('contracts').select('*').eq('id',id).maybeSingle(),'계약연장 원본 확인');
    if(q.error)throw q.error;if(!q.data||clean(q.data.id)!==id)throw Error('원본 계약이 삭제되었거나 조회되지 않습니다.');return q.data;
  }
  async function all(build,label,max=Infinity){
    const out=[];for(let from=0;;from+=1000){
      const q=await request(build().range(from,from+999),label);if(q.error)throw q.error;
      if(!Array.isArray(q.data))throw Error(label+' 응답을 확인해주세요.');out.push(...q.data);
      if(out.length>max)throw Error(label+' 자료가 자동 처리 범위를 초과했습니다.');if(q.data.length<1000)return out;
    }
  }
  const cycleList=(api,id)=>all(()=>api.from(TABLE).select('*').eq('contract_id',id).order('facility_key',{ascending:true}),'시설별 측정주기 확인',1500);
  async function sourceData(api,id){
    const results=await Promise.allSettled([one(api,id),all(()=>api.from('companies').select('id,legacy_id,name,biz_no,address,active').order('id',{ascending:true}),'연결 사업장 확인'),all(()=>api.from('contract_company_links').select('contract_id,company_id').eq('contract_id',id).order('company_id',{ascending:true}),'계약 사업장 연결 확인'),cycleList(api,id)]);
    const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    const [source,companies,links,cycles]=results.map(r=>r.value),sites=validateSites(source,companies,links);
    const facilities=await all(()=>api.from('facilities').select('id,legacy_id,company_id').in('company_id',sites.sites.map(online)).order('id',{ascending:true}),'연결 시설 확인');
    validateCycles(cycles,sites.sites,facilities);
    const selections=source.extra_data?.contract_facilities_v397?.sites;
    if(selections){
      for(const [id,selected] of Object.entries(selections)){
        if(!sites.sites.some(c=>online(c)===id)||!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(fid=>!facilities.some(f=>clean(f.company_id)===id&&[clean(f.id),clean(f.legacy_id)].includes(clean(fid)))))throw Error('기존 계약의 선택 설비 연결을 확인한 뒤 연장해주세요.');
      }
    }
    return {source,cycles,...sites};
  }
  function guard(api,who,action){if(api!==client()||!who||who!==actor()||!can(action))throw Error('로그인 또는 계약 권한이 변경되어 연장을 중단했습니다.');}
  function sameSource(data,m){
    if(sourceSignature(data.source)!==m.source_signature||stable(tuples(data.cycles))!==stable(m.cycles)||online(data.primary)!==m.primary_company_id||stable(data.additional.map(online))!==stable(m.additional_company_ids))throw Error('원본 계약·연결 또는 측정주기가 변경되었습니다. 원본 계약창을 다시 열어 연장해주세요.');
  }
  async function beforeSave(seed,payload,company){
    const api=client(),who=actor(),m=metadata(seed);guard(api,who,'create');
    if(seed?.id||payload?.id||m.prepared_by!==who)throw Error('다시 로그인한 경우 원본 계약에서 연장을 다시 열어주세요.');
    if(online(company)!==m.primary_company_id||binding(payload)!==binding(seed))throw Error('계약 연장은 기존 사업장·설비 연결을 그대로 사용합니다. 연결 변경은 연장 저장 후 계약 수정에서 진행해주세요.');
    if(clean(payload.contract_no)&&clean(payload.contract_no)===m.source_contract_no)throw Error('연장 계약은 새 계약번호로 저장해주세요. 번호를 비우면 자동 생성됩니다.');
    if(!date(payload.start_date)||!date(payload.end_date)||payload.start_date>payload.end_date)throw Error('연장할 과업 시작일·종료일을 확인해주세요.');
    const data=await sourceData(api,m.source_contract_id);guard(api,who,'create');sameSource(data,m);
  }
  function formSignature(body){return stable([...body.querySelectorAll('[id^="ct_"],#contractCustomList input')].map(el=>[el.id||(el.getAttribute('data-contract-custom-key')!==null?'key':'value'),el.type==='checkbox'?el.checked:el.value]));}
  function assertMount(ctx,signature){
    if(mounted!==ctx||!ctx.body.isConnected||ctx.body.closest('#contractModal')?.hidden||ctx.input!==ctx.body.querySelector('#ct_contract_no')||signature!==formSignature(ctx.body))throw Error('계약창의 내용이 변경되었습니다. 현재 내용을 확인한 뒤 다시 연장해주세요.');
  }
  async function open(source){
    const ctx=mounted;if(!ctx||ctx.busy||!source?.id||!renewable(source)||!can('create'))return null;
    const api=client(),who=actor(),signature=formSignature(ctx.body);ctx.busy=true;if(ctx.renewButton)ctx.renewButton.disabled=true;
    try{
      if(signature!==ctx.initial&&!global.confirm('현재 입력 중인 변경사항을 닫고, 마지막 저장된 계약을 기준으로 연장할까요?'))return null;
      const data=await sourceData(api,clean(source.id));guard(api,who,'create');assertMount(ctx,signature);
      if(!renewable(data.source))throw Error('현재 계약은 만료된 계약이 아닙니다. 최신 계약기간을 확인해주세요.');
      const fresh=await one(api,clean(source.id));guard(api,who,'create');assertMount(ctx,signature);
      if(sourceSignature(fresh)!==sourceSignature(data.source))throw Error('원본 계약이 변경되었습니다. 계약창을 다시 열어주세요.');
      const seed=prepare(data.source,{cycles:data.cycles,primary:data.primary,additional:data.additional,actor:who});
      dfV70OpenContractEditor(null,{seed});return seed;
    }catch(e){global.alert('계약 연장 확인\n'+clean(e.message));return null;}
    finally{ctx.busy=false;if(ctx.renewButton?.isConnected)ctx.renewButton.disabled=!can('create');}
  }

  async function afterSaved(saved,seed){
    const result={contract:saved,warnings:[]};
    try{
      const api=client(),who=actor(),m=metadata(seed),action=seed?.id?'update':'create';guard(api,who,action);
      if(!saved?.id||clean(saved.id)===m.source_contract_id)throw Error('연장 계약 ID를 확인하지 못했습니다.');
      const data=await sourceData(api,m.source_contract_id);guard(api,who,action);sameSource(data,m);
      const target=await one(api,clean(saved.id));guard(api,who,action);
      const current=metadata(target);
      if(current.source_contract_id!==m.source_contract_id||current.source_signature!==m.source_signature||stable(current.cycles)!==stable(m.cycles)||binding(target)!==binding(seed))throw Error('연장 계약의 원본·사업장 연결이 변경되었습니다. 최신 계약을 다시 열어 확인해주세요.');
      if(current.cycle_status==='copied'){result.contract=target;return result;}
      const existing=await cycleList(api,clean(saved.id));guard(api,who,action);
      const byKey=new Map();for(const row of existing){const key=clean(row.facility_key);if(byKey.has(key))throw Error('새 계약의 측정주기 연결이 중복되어 다시 반영하지 않았습니다.');byKey.set(key,row);}
      const missing=[];
      for(const t of m.cycles){
        const previous=byKey.get(t[2]);
        if(previous&&stable(cycleTuple(previous))!==stable(t))throw Error('새 계약에서 이미 수정한 측정주기가 있어 덮어쓰지 않았습니다. 계약의 시설별 측정주기를 확인해주세요.');
        if(!previous)missing.push({...cycleRow(t,clean(saved.id)),migration_source:'contract_renewal_441',updated_at:new Date().toISOString()});
      }
      if(missing.length){
        guard(api,who,action);
        const inserted=await request(api.from(TABLE).insert(missing).select('*'),'연장 측정주기 반영');
        guard(api,who,action);
        if(inserted.error&&inserted.error.code!=='23505')throw inserted.error;
        const verified=await cycleList(api,clean(saved.id));guard(api,who,action);
        if(m.cycles.some(t=>verified.filter(r=>clean(r.facility_key)===t[2]&&stable(cycleTuple(r))===stable(t)).length!==1))throw Error('측정주기 반영 결과를 확인하지 못했습니다.');
      }
      // Compare-and-swap prevents a retry from overwriting a later edit of the new contract.
      const latest=await one(api,clean(saved.id));guard(api,who,action);
      if(stable(latest)!==stable(target))throw Error('연장 계약이 다른 곳에서 변경되어 완료 표시를 보류했습니다.');
      const extra={...latest.extra_data,[KEY]:{...current,cycle_status:'copied',copied_at:new Date().toISOString()}};
      const q=await request(api.from('contracts').update({extra_data:extra}).eq('id',clean(saved.id)).eq('updated_at',latest.updated_at).select('*').maybeSingle(),'연장 측정주기 완료 표시');
      guard(api,who,action);if(q.error)throw q.error;if(!q.data?.id)throw Error('계약이 변경되어 완료 표시를 보류했습니다.');result.contract=q.data;
    }catch(e){result.warnings.push('연장 계약은 저장되었습니다. 측정주기 확인: '+clean(e.message)+' 새 계약의 “측정주기 다시 반영”에서 확인해주세요.');}
    return result;
  }
  function lockSeedLinks(ctx){
    const section=ctx.body.querySelector('#dfContractSiteSection');if(!section)return;
    section.querySelectorAll('input,select,button').forEach(el=>{if(!el.disabled)el.disabled=true;});
  }
  function mount(seed,body){
    mounted?.observer?.disconnect();
    if(!body)return;const ctx={seed,body,input:body.querySelector('#ct_contract_no'),initial:formSignature(body),busy:false};mounted=ctx;
    const actions=body.querySelector('.contract-editor-actions');if(!actions)return;
    const add=(text,attribute,handler)=>{const b=body.ownerDocument.createElement('button');b.type='button';b.className='company-btn secondary';b.setAttribute(attribute,'');b.textContent=text;b.addEventListener('click',handler);actions.prepend(b);return b;};
    if(renewable(seed)&&can('create'))ctx.renewButton=add('계약 연장','data-contract-renew',()=>open(seed));
    if(seed?.extra_data?.[KEY]){
      const m=seed.extra_data[KEY],note=body.ownerDocument.createElement('div');note.className='contract-doc-note';note.dataset.contractRenewalInfo='';
      note.textContent=(seed.id?'연장 원본: ':'계약 연장 · ')+(m.source_contract_no||'기존 계약');
      if(!seed.id){note.textContent+=' · 새 계약으로 저장';if(m.period_review)note.textContent+=' · 기간 확인';
        const input=body.querySelector('#ct_contract_no');if(input)input.placeholder='새 계약번호 자동 생성';
        lockSeedLinks(ctx);
        if(global.MutationObserver){ctx.observer=new MutationObserver(()=>lockSeedLinks(ctx));ctx.observer.observe(body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});}
      }
      actions.before(note);
      if(seed.id&&m.cycle_status!=='copied'&&can('update')){
        const retry=add('측정주기 다시 반영','data-contract-renewal-retry',async()=>{
          if(ctx.busy||mounted!==ctx)return;
          if(formSignature(body)!==ctx.initial){global.alert('입력 중인 계약 변경사항을 먼저 저장한 뒤 다시 열어주세요.');return;}
          ctx.busy=true;retry.disabled=true;
          try{const r=await afterSaved(seed,seed);if(r.warnings.length)global.alert(r.warnings.join('\n'));else {global.alert('연장 계약의 측정주기를 반영했습니다.');global.DFContractSites?.invalidateReads?.();if(mounted===ctx&&body.isConnected)dfV70OpenContractEditor(r.contract);}}
          finally{ctx.busy=false;if(retry.isConnected)retry.disabled=!can('update');}
        });
      }
    }
  }
  global.DFContractRenewal=Object.freeze({mount,open,prepare,beforeSave,afterSaved,_test:Object.freeze({renewable,period,cycleTuple,cycleRow,validateSites,validateCycles,formSignature,sourceSignature,binding})});
})(window);
