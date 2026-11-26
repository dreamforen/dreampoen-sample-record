/* Report-only, read-only models. Never write or replace the company/contract cache. */
(function(global){
  'use strict';
  const text=v=>String(v??'').trim();
  const aliases=row=>Array.from(new Set([row?.Id,row?.OnlineId,row?.id,row?.legacy_id].map(text).filter(Boolean)));
  const unique=rows=>rows.length===1?rows[0]:null;
  const name=v=>text(v).normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[‐‑–—]/g,'-');
  const companyName=v=>name(v).replace(/주식회사|\(주\)|㈜/g,'');
  const fields=row=>row?.measurement_data?.data?.fields||{};
  function aliasIndex(rows){
    const index=new Map();
    rows.forEach((row,position)=>{const entry={row,position};for(const key of aliases(row)){const list=index.get(key);if(list)list.push(entry);else index.set(key,[entry]);}});
    return index;
  }
  function indexedMatch(index,id,legacy){
    const positions=new Map();for(const entry of [...(index.get(text(id))||[]),...(text(legacy)?index.get(text(legacy))||[]:[])])positions.set(entry.position,entry.row);return unique(Array.from(positions.values()));
  }
  function models(snapshot,locals=[]){
    if(!snapshot)return locals;
    const owned=new Map(),localIndex=aliasIndex(locals);
    for(const row of snapshot.facilities||[]){
      const key=text(row.company_id);if(!owned.has(key))owned.set(key,[]);owned.get(key).push(row);
    }
    return (snapshot.companies||[]).filter(r=>r.active!==false).map(row=>{
      const local=indexedMatch(localIndex,row.id,row.legacy_id)||{},facilityIndex=aliasIndex(local.Facilities||[]);
      const facilities=(owned.get(text(row.id))||[]).map(f=>{
        const prior=indexedMatch(facilityIndex,f.id,f.legacy_id)||{};
        return Object.assign({},prior,{Id:f.legacy_id||f.id,OnlineId:f.id,Active:f.active!==false,
          FacilityName:text(f.name||f.facility_name),PreventionFacility:text(f.prevention_facility||f.name||f.facility_name),EmissionFacility:text(f.emission_facility),
          StackHeight:f.stack_height??'',StackShape:text(f.stack_shape),Diameter:f.diameter??'',StackW:f.stack_w??f.stack_width??'',StackH:f.stack_h??'',
          HalfyearProfile:f.halfyear_profile||{},FormerFacilityNames:Array.isArray(f.extra_data?.FormerFacilityNames)?f.extra_data.FormerFacilityNames:[]});
      });
      const out=Object.assign({},local,{Id:row.legacy_id||row.id,OnlineId:row.id,Name:text(row.name),Grade:text(row.grade),Active:true,HalfyearProfile:row.halfyear_profile||{},Facilities:facilities});
      const optional={address:'Address',representative:'Representative',environment_manager:'EnvironmentManager',phone:'Phone',industry:'Industry',updated_at:'UpdatedAt'};
      for(const [key,target] of Object.entries(optional))if(Object.prototype.hasOwnProperty.call(row,key))out[target]=text(row[key]);
      return out;
    });
  }
  function company(companies,row){
    const f=fields(row),key=text(row?.company_id||f.companyDbId),label=companyName(row?.company_name||f.company);
    return unique(companies.filter(c=>key?aliases(c).includes(key):!!label&&[c.Name,c.HalfyearProfile?.company_name].some(v=>companyName(v)===label)));
  }
  function facility(c,row){
    if(!c)return null;
    const f=fields(row),key=text(row?.facility_id||f.facilityDbId),label=name(row?.facility_name||f.facility||row?.form_data?.request?.stack_name);
    return unique((c.Facilities||[]).filter(x=>x.Active!==false&&(key?aliases(x).includes(key):!!label&&[x.FacilityName,x.PreventionFacility,...(x.FormerFacilityNames||[])].some(v=>name(v)===label))));
  }
  // One immutable read/render operation can reuse these indexes. No cross-operation cache.
  function resolver(companies){
    const companyIds=aliasIndex(companies),companyNames=new Map(),facilityIndexes=new WeakMap();
    function add(index,key,row){if(!key)return;const list=index.get(key);if(list)list.push(row);else index.set(key,[row]);}
    for(const c of companies)for(const key of new Set([c.Name,c.HalfyearProfile?.company_name].map(companyName).filter(Boolean)))add(companyNames,key,c);
    function resolveCompany(row){const f=fields(row),key=text(row?.company_id||f.companyDbId),label=companyName(row?.company_name||f.company);return unique(key?(companyIds.get(key)||[]).map(entry=>entry.row):companyNames.get(label)||[]);}
    function resolveFacility(c,row){
      if(!c||typeof c!=='object')return null;
      let index=facilityIndexes.get(c);
      if(!index){const active=(c.Facilities||[]).filter(x=>x.Active!==false),ids=aliasIndex(active),names=new Map();for(const x of active)for(const key of new Set([x.FacilityName,x.PreventionFacility,...(x.FormerFacilityNames||[])].map(name).filter(Boolean)))add(names,key,x);index={ids,names};facilityIndexes.set(c,index);}
      const f=fields(row),key=text(row?.facility_id||f.facilityDbId),label=name(row?.facility_name||f.facility||row?.form_data?.request?.stack_name);
      return unique(key?(index.ids.get(key)||[]).map(entry=>entry.row):index.names.get(label)||[]);
    }
    return Object.freeze({company:resolveCompany,facility:resolveFacility});
  }
  function completion(companies,source,report){
    const c=company(companies,source),f=facility(c,source),sf=fields(source);
    if(!c)throw Error('원본 채취기록의 업체 ID를 업체현황에서 확인해주세요.');
    if(!f)throw Error('원본 채취기록의 시설 ID를 해당 업체현황에서 확인해주세요. 삭제되었거나 중복된 시설은 자동 연결하지 않습니다.');
    const cid=text(report.company_id),fid=text(report.facility_id);
    if(cid&&!aliases(c).includes(cid))throw Error('성적서와 원본 채취기록의 업체 ID가 다릅니다. 기존 연결을 확인해주세요.');
    if(fid&&!aliases(f).includes(fid))throw Error('성적서와 원본 채취기록의 시설 ID가 다릅니다. 기존 연결을 확인해주세요.');
    if((!cid||!fid)&&(!text(source.company_id||sf.companyDbId)||!text(source.facility_id||sf.facilityDbId)))throw Error('성적서 연결값이 비어 있고 원본 채취기록의 업체·시설 ID가 없어 자동 복원할 수 없습니다. 업체현황에서 연결을 확인해주세요.');
    return {company_id:cid||text(c.Id),facility_id:fid||text(f.Id)};
  }
  global.DF_REPORT_CONNECTIONS=Object.freeze({models,aliases,company,facility,resolver,completion});
})(window);
