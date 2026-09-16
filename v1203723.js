// ==========================================================
// DREAMFOREN v120.37.16.3
// 계약 업체명 → 연결된 업체현황 이름 동기화
// - 기존 계약의 측정대상 사업장명을 바꿀 때 연결된 업체 마스터의 이름만 갱신한다.
// - 사업자번호·주소·시설·측정이력 등 다른 업체정보는 변경하지 않는다.
// - 계약의 직접 연결을 우선하며, 과거 미연결 계약은 변경 전 정보로 안전하게 찾는다.
// ==========================================================
(function dfV12037163ContractCompanyNameSync(){
  'use strict';

  const VERSION='v120.37.16.3';
  let activeExistingContract=null;
  const byId=id=>document.getElementById(id);
  const clean=value=>String(value??'').trim();
  const norm=value=>{
    try{
      if(typeof dfV68NormName==='function')return dfV68NormName(value);
    }catch(_){/* 독립 검사 환경 호환 */}
    return clean(value).toLowerCase()
      .replace(/주식회사|\(주\)|㈜/g,'')
      .replace(/[\s\-_/().,\[\]]+/g,'');
  };
  const biz=value=>{
    try{
      if(typeof dfV68Biz==='function')return dfV68Biz(value);
    }catch(_){/* 독립 검사 환경 호환 */}
    return clean(value).replace(/\D/g,'');
  };

  // 업체현황의 대표 이름은 측정대상 사업장명을 우선한다.
  // 이름이 실제로 변경된 저장에서만 값을 반환해 다른 계약수정이 업체명을 건드리지 않게 한다.
  function desiredCompanyName(payload,existing){
    if(!existing)return '';
    const oldTarget=clean(existing.target_name);
    const newTarget=clean(payload?.target_name);
    const oldRequester=clean(existing.requester_name);
    const newRequester=clean(payload?.requester_name);

    if(newTarget!==oldTarget)return newTarget||newRequester;
    if(!oldTarget&&newRequester!==oldRequester)return newRequester;
    return '';
  }

  async function directlyLinkedCompanyId(contractId){
    const id=clean(contractId);
    if(!id||typeof dfSupabase==='undefined'||!dfSupabase)return '';
    try{
      const query=await dfSupabase.from('contract_company_links')
        .select('company_id')
        .eq('contract_id',id)
        .maybeSingle();
      if(query.error)throw query.error;
      return clean(query.data?.company_id);
    }catch(error){
      window.DF_DIAG?.warn(
        'CONTRACT-NAME-SYNC-LINK',
        '계약 직접연결 조회 실패 · 기존 업체정보로 계속 확인',
        error?.message||String(error)
      );
      return '';
    }
  }

  async function companyIdFromPreviousContract(existing){
    if(!existing||typeof dfV68FetchAll!=='function')return '';
    try{
      const rows=await dfV68FetchAll('companies','id,legacy_id,name,biz_no');
      // 측정대상 사업장명이 있으면 의뢰기관 사업자번호를 대신 사용하지 않는다.
      // 대상 사업장 번호가 비어 있는 과거 자료는 변경 전 대상 사업장명으로 찾는다.
      const oldBiz=biz(existing.target_name?existing.target_biz_no:existing.requester_biz_no);
      const oldNames=[existing.target_name,existing.requester_name].map(norm).filter(Boolean);
      let hit=oldBiz?rows.find(row=>biz(row.biz_no)===oldBiz):null;
      if(!hit&&oldNames.length)hit=rows.find(row=>oldNames.includes(norm(row.name)));
      return clean(hit?.id);
    }catch(error){
      window.DF_DIAG?.warn(
        'CONTRACT-NAME-SYNC-LEGACY',
        '변경 전 계약정보로 업체 확인 실패 · 기본 연결로 계속',
        error?.message||String(error)
      );
      return '';
    }
  }

  function updateLocalCompanyName(companyId,name){
    const id=clean(companyId),next=clean(name);
    if(!id||!next)return 0;
    const collections=[];
    try{
      if(Array.isArray(companyState?.db?.Companies))collections.push(companyState.db.Companies);
      if(Array.isArray(companyState?.contractCompanies))collections.push(companyState.contractCompanies);
    }catch(_){/* 로컬 업체자료가 아직 준비되지 않은 경우 */}
    let changed=0;
    const seen=new Set();
    collections.forEach(list=>list.forEach(company=>{
      if(!company||seen.has(company))return;
      if(clean(company.OnlineId)!==id&&clean(company.Id)!==id)return;
      seen.add(company);
      company.Name=next;
      changed++;
    }));
    return changed;
  }

  async function syncLinkedCompanyName(companyId,name){
    const id=clean(companyId),next=clean(name);
    if(!id||!next)return id;
    if(typeof dfSupabase==='undefined'||!dfSupabase)return id;

    const result=await dfSupabase.from('companies').update({name:next}).eq('id',id);
    if(result.error)throw result.error;
    updateLocalCompanyName(id,next);
    window.DF_DIAG?.info(
      'CONTRACT-NAME-SYNC',
      '계약 업체명을 연결된 업체현황에 반영',
      `${id} / ${next}`
    );
    return id;
  }

  function patchContractSave(){
    if(window.dfV12037163ContractNamePatched)return true;
    if(typeof dfV70SaveContract!=='function'||typeof dfV94EnsureContractCompany!=='function')return false;

    const baseEnsure=dfV94EnsureContractCompany;
    const baseSave=dfV70SaveContract;

    dfV94EnsureContractCompany=async function dfV12037163EnsureAndSyncName(payload){
      const existing=activeExistingContract;
      if(!existing)return baseEnsure.apply(this,arguments);

      let companyId=await directlyLinkedCompanyId(existing.id);
      if(!companyId)companyId=await companyIdFromPreviousContract(existing);
      if(!companyId)companyId=await baseEnsure.apply(this,arguments);

      const nextName=desiredCompanyName(payload,existing);
      if(companyId&&nextName)await syncLinkedCompanyName(companyId,nextName);
      return companyId;
    };

    dfV70SaveContract=async function dfV12037163SaveWithExistingContract(existing=null){
      activeExistingContract=existing||null;
      try{return await baseSave.apply(this,arguments);}
      finally{activeExistingContract=null;}
    };

    window.dfV12037163ContractNamePatched=true;
    return true;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · CONTRACT NAME SYNC`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    patchContractSave();
    applyVersion();
    [180,700,1600].forEach(wait=>setTimeout(()=>{
      patchContractSave();
      applyVersion();
    },wait));
  }

  window.dfV1203723DesiredCompanyName=desiredCompanyName;
  window.dfV1203723DirectCompanyId=directlyLinkedCompanyId;
  window.dfV1203723PreviousCompanyId=companyIdFromPreviousContract;
  window.dfV1203723UpdateLocalCompanyName=updateLocalCompanyName;
  window.dfV1203723SyncLinkedCompanyName=syncLinkedCompanyName;
  window.dfV1203723PatchContractSave=patchContractSave;

  patchContractSave();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
