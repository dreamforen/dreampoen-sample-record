// ==========================================================
// DREAMFOREN v120.37.16.5
// 계약-업체명 불일치 복구 + 여지 사전무게 입력/4자리 표시 + 버전표시 고정
// - 계약의 직접 연결 업체에서 name 한 칸만 동기화한다.
// - 현재계약들의 업체명이 서로 충돌하면 자동 변경하지 않는다.
// - 기존 여지/LAB 자동연동·계산·인쇄 구조는 변경하지 않는다.
// ==========================================================
(function dfV12037164ContractAndFilterSync(){
  'use strict';

  const VERSION='v120.37.16.5';
  const VERSION_LABEL=`ONLINE ${VERSION} · REPOSITORY + FILTER REFRESH`;
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

  let activeExistingContract=null;
  let versionObserver=null;
  let reconcileRunning=false;
  let reconcileDone=false;

  function canonicalCompanyName(contract){
    return clean(contract?.target_name)||clean(contract?.requester_name);
  }

  function findLocalCompany(companyId){
    const id=clean(companyId);
    if(!id)return null;
    try{
      const pools=[];
      if(typeof companyState!=='undefined'&&Array.isArray(companyState?.db?.Companies))pools.push(companyState.db.Companies);
      if(typeof companyState!=='undefined'&&Array.isArray(companyState?.contractCompanies))pools.push(companyState.contractCompanies);
      for(const list of pools){
        const hit=list.find(company=>clean(company?.OnlineId)===id||clean(company?.Id)===id);
        if(hit)return hit;
      }
    }catch(_){/* 업체목록이 아직 로드되지 않은 경우 */}
    return null;
  }

  function updateLocalCompanyName(companyId,name){
    if(typeof window.dfV1203723UpdateLocalCompanyName==='function'){
      return window.dfV1203723UpdateLocalCompanyName(companyId,name);
    }
    const company=findLocalCompany(companyId);
    if(!company)return 0;
    company.Name=clean(name);
    return 1;
  }

  // 업체 마스터의 이름만 변경한다. 주소·사업자번호·시설·측정이력은 보내지 않는다.
  async function enforceCompanyName(companyId,name,{force=false}={}){
    const id=clean(companyId),next=clean(name);
    if(!id||!next||typeof dfSupabase==='undefined'||!dfSupabase)return false;
    const local=findLocalCompany(id);
    if(!force&&local&&clean(local.Name)===next)return false;
    const result=await dfSupabase.from('companies').update({name:next}).eq('id',id);
    if(result.error)throw result.error;
    updateLocalCompanyName(id,next);
    window.DF_DIAG?.info('CONTRACT-COMPANY-NAME-12037164','계약 사업장명과 업체현황 이름 일치 완료',`${id} / ${next}`);
    return true;
  }

  function patchContractSave(){
    if(window.dfV12037164ContractSavePatched)return true;
    if(typeof dfV70SaveContract!=='function'||typeof dfV94EnsureContractCompany!=='function')return false;

    const baseEnsure=dfV94EnsureContractCompany;
    const baseSave=dfV70SaveContract;

    dfV94EnsureContractCompany=async function dfV12037164EnsureAndEnforceName(payload){
      const previousName=canonicalCompanyName(activeExistingContract);
      const nextName=canonicalCompanyName(payload);
      const companyId=await baseEnsure.apply(this,arguments);
      // 신규 계약은 기존의 업체 생성/연결 규칙만 사용한다. 기존 계약 수정일 때만
      // 연결 업체의 이름을 확정해 다른 동명 업체를 잘못 바꾸지 않는다.
      // 이미 계약 쪽만 먼저 바뀐 자료는 이전/현재 이름이 같으므로 로컬 캐시와
      // 무관하게 name 한 칸을 다시 저장해 과거 불일치까지 확실히 복구한다.
      if(activeExistingContract&&companyId&&nextName){
        await enforceCompanyName(companyId,nextName,{force:previousName===nextName});
      }
      return companyId;
    };

    dfV70SaveContract=async function dfV12037164SaveWithCompanyName(existing=null){
      activeExistingContract=existing||null;
      try{return await baseSave.apply(this,arguments);}
      finally{activeExistingContract=null;}
    };

    window.dfV12037164ContractSavePatched=true;
    return true;
  }

  function contractIsCurrent(contract){
    try{
      if(typeof dfV73ContractIsCurrent==='function')return dfV73ContractIsCurrent(contract);
    }catch(_){/* 독립 검사 환경 호환 */}
    return ['계약진행','입력완료'].includes(clean(contract?.source_status));
  }

  function newestContract(contracts){
    return contracts.slice().sort((a,b)=>{
      const av=clean(a?.updated_at)||clean(a?.contract_date)||clean(a?.registered_date);
      const bv=clean(b?.updated_at)||clean(b?.contract_date)||clean(b?.registered_date);
      return bv.localeCompare(av);
    })[0]||null;
  }

  // 이미 계약 쪽만 먼저 바뀐 과거 불일치를 복구한다.
  // 직접 연결 + 현재계약 + 동일 업체의 계약명이 모두 같은 경우에만 안전하게 반영한다.
  async function reconcileDirectContractCompanyNames(){
    if(reconcileRunning||reconcileDone)return {updated:0,conflicts:0,skipped:true};
    if(typeof dfSupabase==='undefined'||!dfSupabase||typeof dfV68FetchAll!=='function')return {updated:0,conflicts:0,skipped:true};
    if(typeof dfV68IsAdmin==='function'&&!dfV68IsAdmin())return {updated:0,conflicts:0,skipped:true};

    let contracts=[];
    try{
      if(typeof dfV68ContractState!=='undefined'&&Array.isArray(dfV68ContractState?.rows))contracts=dfV68ContractState.rows;
    }catch(_){/* 아직 계약목록이 없는 경우 */}
    contracts=contracts.filter(contract=>clean(contract?.id)&&contractIsCurrent(contract)&&canonicalCompanyName(contract));
    if(!contracts.length)return {updated:0,conflicts:0,skipped:true};

    reconcileRunning=true;
    try{
      const [links,companies]=await Promise.all([
        dfV68FetchAll('contract_company_links','contract_id,company_id'),
        dfV68FetchAll('companies','id,name')
      ]);
      const contractById=new Map(contracts.map(contract=>[clean(contract.id),contract]));
      const companyById=new Map((companies||[]).map(company=>[clean(company.id),company]));
      const grouped=new Map();

      (links||[]).forEach(link=>{
        const contract=contractById.get(clean(link.contract_id));
        const companyId=clean(link.company_id);
        if(!contract||!companyId)return;
        if(!grouped.has(companyId))grouped.set(companyId,[]);
        grouped.get(companyId).push(contract);
      });

      let updated=0,conflicts=0;
      for(const [companyId,linkedContracts] of grouped){
        const names=linkedContracts.map(canonicalCompanyName).filter(Boolean);
        const normalized=new Set(names.map(norm).filter(Boolean));
        if(normalized.size!==1){
          conflicts++;
          window.DF_DIAG?.warn('CONTRACT-COMPANY-NAME-CONFLICT','같은 업체에 연결된 현재계약 이름이 달라 자동수정 생략',`${companyId} / ${names.join(' | ')}`);
          continue;
        }
        const chosen=canonicalCompanyName(newestContract(linkedContracts));
        const current=clean(companyById.get(companyId)?.name);
        if(!chosen||current===chosen)continue;
        if(await enforceCompanyName(companyId,chosen,{force:true}))updated++;
      }

      reconcileDone=true;
      if(updated){
        try{if(typeof companyRender==='function')companyRender();}catch(_){/* 업체 화면 미진입 */}
        window.DF_DIAG?.info('CONTRACT-COMPANY-RECONCILE-12037164','기존 계약·업체명 불일치 자동복구 완료',`${updated}개 업체 / 충돌 생략 ${conflicts}개`);
      }
      return {updated,conflicts,skipped:false};
    }catch(error){
      window.DF_DIAG?.warn('CONTRACT-COMPANY-RECONCILE-12037164','기존 계약·업체명 자동확인 실패 · 계약 저장 시 다시 반영',error?.message||String(error));
      return {updated:0,conflicts:0,skipped:true,error};
    }finally{
      reconcileRunning=false;
    }
  }

  function patchContractLoad(){
    if(window.dfV12037164ContractLoadPatched)return true;
    if(typeof dfV68LoadContracts!=='function')return false;
    const baseLoad=dfV68LoadContracts;
    dfV68LoadContracts=async function dfV12037164LoadAndReconcile(){
      const result=await baseLoad.apply(this,arguments);
      if(!activeExistingContract&&!reconcileDone&&!reconcileRunning){
        setTimeout(()=>reconcileDirectContractCompanyNames(),0);
      }
      return result;
    };
    window.dfV12037164ContractLoadPatched=true;
    return true;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side&&side.textContent!==VERSION_LABEL)side.textContent=VERSION_LABEL;
    if(footer&&footer.textContent!==VERSION)footer.textContent=VERSION;
  }

  function watchVersion(){
    if(versionObserver||typeof MutationObserver==='undefined')return;
    const targets=[byId('dfBuildVersionStatic'),byId('dfFooterVersion')].filter(Boolean);
    if(!targets.length)return;
    versionObserver=new MutationObserver(applyVersion);
    targets.forEach(target=>versionObserver.observe(target,{childList:true,characterData:true,subtree:true}));
  }

  function ensureFilterStyle(){
    if(byId('dfV12037164FilterStyle'))return;
    const style=document.createElement('style');
    style.id='dfV12037164FilterStyle';
    style.textContent=`
      .df-excel-ledger-table tr[data-ledger-row="place"] td strong,
      .df-excel-ledger-table tr[data-ledger-row="filter"] td input,
      .df-excel-ledger-table tr[data-ledger-row="filter"] td span,
      .df-excel-ledger-table tr[data-ledger-row="before"] td input,
      .df-excel-ledger-table tr[data-ledger-row="before"] td span,
      .df-excel-ledger-table tr[data-ledger-row="after"] td input,
      .df-excel-ledger-table tr[data-ledger-row="after"] td span,
      .df-excel-ledger-table tr[data-ledger-row="diff"] td span{
        font-size:clamp(11px,.82vw,14px)!important;
        font-variant-numeric:tabular-nums;
      }
      .df-filter-preweight-help{
        margin:-6px 0 12px;padding:8px 12px;border:1px solid #d4e0e7;border-radius:8px;
        background:#f7fafc;color:#456273;font-size:12px;line-height:1.45;
      }
    `;
    document.head?.appendChild(style);
  }

  function ensureFilterGuide(){
    const bar=byId('dfFilterAnnualBar');
    if(!bar)return false;
    const button=byId('dfFilterPageAdd');
    if(button&&!button.disabled&&button.textContent!=='+ 사전 여지 페이지')button.textContent='+ 사전 여지 페이지';
    if(!byId('dfFilterPreweightHelp')){
      const help=document.createElement('div');
      help.id='dfFilterPreweightHelp';
      help.className='df-filter-preweight-help';
      help.textContent='팀과 연도를 선택한 뒤 빈칸에 여지번호·채취 전 무게를 입력하고, “변경 저장·LAB 반영”을 한 번 누르면 저장됩니다.';
      bar.insertAdjacentElement('afterend',help);
    }
    if(button&&!button.dataset.v12037164Watch&&typeof MutationObserver!=='undefined'){
      button.dataset.v12037164Watch='1';
      new MutationObserver(()=>ensureFilterGuide()).observe(button,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    }
    return true;
  }

  function init(){
    patchContractSave();
    patchContractLoad();
    ensureFilterStyle();
    ensureFilterGuide();
    applyVersion();
    watchVersion();
    [180,700,1600,3200,6000].forEach(wait=>setTimeout(()=>{
      patchContractSave();
      patchContractLoad();
      ensureFilterGuide();
      applyVersion();
      watchVersion();
    },wait));
    window.DF_DIAG?.info('CONTRACT-FILTER-12037164','계약 업체명·여지 사전무게·4자리 표시 보정 준비 완료','업체 name 열만 동기화 / 기존 자동연동·인쇄 유지');
  }

  window.dfV1203724CanonicalCompanyName=canonicalCompanyName;
  window.dfV1203724EnforceCompanyName=enforceCompanyName;
  window.dfV1203724ReconcileNames=reconcileDirectContractCompanyNames;
  window.dfV1203724PatchContractSave=patchContractSave;
  window.dfV1203724PatchContractLoad=patchContractLoad;
  window.dfV1203724ApplyVersion=applyVersion;

  patchContractSave();
  patchContractLoad();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
