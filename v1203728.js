// ==========================================================
// DREAMFOREN v120.37.16.8
// 로그인 완료 후 계약업체 목록 재동기화
// - 초기 화면이 로그인보다 먼저 열려 2026-09-01 안전목록이 남는 순서 오류를 보정한다.
// - 기존 업체 pull이 끝난 뒤 현재 contracts 기준 목록을 한 번만 다시 구성한다.
// - 계약/업체/시설 DB와 저장 규칙은 변경하지 않는다.
// ==========================================================
(function dfV12037168ContractLoginSync(){
  'use strict';

  const VERSION='v120.37.16.8';
  const VERSION_LABEL=`ONLINE ${VERSION} · CONTRACT LOGIN SYNC ACTIVE`;
  let refreshPromise=null;
  let refreshQueued=false;
  let versionObserver=null;

  function authenticated(){
    try{return !!(dfSupabase&&dfCloudUser);}
    catch(_){return false;}
  }

  function renderDownstream(){
    try{if(typeof companyRender==='function')companyRender();}
    catch(error){window.DF_DIAG?.warn('CONTRACT-LOGIN-SYNC-RENDER','업체현황 다시 표시 실패',error?.message||String(error));}
    try{if(typeof syncSampleCompanySelectors==='function')syncSampleCompanySelectors(true);}
    catch(error){window.DF_DIAG?.warn('CONTRACT-LOGIN-SYNC-SAMPLE','시료채취 업체목록 다시 표시 실패',error?.message||String(error));}
    try{if(typeof scheduleRenderAll==='function')scheduleRenderAll();}
    catch(error){window.DF_DIAG?.warn('CONTRACT-LOGIN-SYNC-SCHEDULE','일정 업체목록 다시 표시 실패',error?.message||String(error));}
  }

  async function rebuildContractCompanies(reason='login'){
    if(!authenticated())return {ok:false,skipped:'not-authenticated'};
    if(typeof dfV73BuildCompanyStatusFromContracts!=='function')return {ok:false,skipped:'builder-unavailable'};
    if(refreshPromise){
      refreshQueued=true;
      return refreshPromise;
    }

    refreshPromise=(async()=>{
      try{
        const result=await dfV73BuildCompanyStatusFromContracts();
        renderDownstream();
        window.DF_DIAG?.info(
          'CONTRACT-LOGIN-SYNC-12037168',
          '로그인 후 현재계약 업체목록 재구성 완료',
          `${reason} / ${Number(result?.count||0)}개 / ${result?.source||'contracts'}`
        );
        return result||{ok:true};
      }catch(error){
        window.DF_DIAG?.warn(
          'CONTRACT-LOGIN-SYNC-12037168',
          '로그인 후 계약업체 목록 재구성 실패 · 기존 목록 유지',
          error?.message||String(error)
        );
        return {ok:false,error};
      }
    })().finally(()=>{
      refreshPromise=null;
      if(refreshQueued){
        refreshQueued=false;
        setTimeout(()=>rebuildContractCompanies('queued-refresh'),0);
      }
    });
    return refreshPromise;
  }

  function patchOnlineBootstrap(){
    if(window.dfV12037168BootstrapPatched)return true;
    if(typeof dfV68OnlineBootstrap!=='function')return false;

    const baseBootstrap=dfV68OnlineBootstrap;
    dfV68OnlineBootstrap=async function dfV12037168BootstrapAndRebuild(){
      let result;
      try{
        result=await baseBootstrap.apply(this,arguments);
      }finally{
        // 업체 마스터 pull이 끝난 뒤 실행해야 새 계약의 실제 업체 UUID와
        // 계약-업체 직접연결을 함께 사용할 수 있다.
        if(authenticated())await rebuildContractCompanies('online-bootstrap');
      }
      return result;
    };

    window.dfV12037168BootstrapPatched=true;
    return true;
  }

  function replaceVersionNode(id){
    const current=document.getElementById(id);
    if(!current||current.dataset.v12037168Owner==='1')return current;
    const replacement=current.cloneNode(true);
    replacement.dataset.v12037168Owner='1';
    current.replaceWith(replacement);
    return replacement;
  }

  function applyVersion(){
    const side=document.getElementById('dfBuildVersionStatic');
    const footer=document.getElementById('dfFooterVersion');
    if(side){
      if(side.textContent!==VERSION_LABEL)side.textContent=VERSION_LABEL;
      side.title='이 문구가 보이면 로그인 후 계약업체 재동기화 수정본이 적용된 상태입니다.';
      side.style.fontWeight='700';
    }
    if(footer&&footer.textContent!==VERSION)footer.textContent=VERSION;
    if(document.documentElement)document.documentElement.dataset.dreamforenVersion=VERSION;
    window.DF_ACTIVE_BUILD=VERSION;
  }

  function ownVersionDisplay(){
    replaceVersionNode('dfBuildVersionStatic');
    replaceVersionNode('dfFooterVersion');
    applyVersion();
    if(versionObserver||typeof MutationObserver==='undefined')return;
    const targets=['dfBuildVersionStatic','dfFooterVersion'].map(id=>document.getElementById(id)).filter(Boolean);
    versionObserver=new MutationObserver(applyVersion);
    targets.forEach(target=>versionObserver.observe(target,{childList:true,characterData:true,subtree:true}));
  }

  function init(){
    patchOnlineBootstrap();
    ownVersionDisplay();
    [180,700,1600,3200].forEach(wait=>setTimeout(()=>{
      patchOnlineBootstrap();
      applyVersion();
    },wait));
    window.DF_DIAG?.info(
      'CONTRACT-LOGIN-SYNC-12037168',
      '로그인 후 계약업체 재동기화 패치 준비 완료',
      '업체 pull 완료 → 현재계약 재구성 → 업체현황·네비게이션 공통목록 갱신'
    );
  }

  window.dfV1203728RefreshContractCompanies=rebuildContractCompanies;
  window.dfV1203728PatchOnlineBootstrap=patchOnlineBootstrap;
  window.dfV1203728ApplyVersion=applyVersion;

  patchOnlineBootstrap();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
