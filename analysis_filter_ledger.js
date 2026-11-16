/* Show the original ledger inside Analysis, without a second editor or route. */
(function(){
  'use strict';
  const by=id=>document.getElementById(id);
  const actor=()=>typeof dfCloudUser==='undefined'?'':String(dfCloudUser?.id||'');
  const profile=()=>typeof dfCloudProfile==='undefined'?null:dfCloudProfile;
  function permitted(module,action){
    const p=profile(),access=p?.access_permissions||p?.board_permissions||{};
    const legacy=access[module==='analysis'?'lab_analysis':'filter_ledger']!==false;
    return !!actor()&&!!p&&p.active!==false&&!p.retired_at&&!document.body.classList.contains('df-auth-locked')&&
      (window.DFMenuPermissions?.can(module,action,legacy)??legacy);
  }
  const canOpen=()=>permitted('analysis','view')&&permitted('filter-ledger','view');
  const canEdit=()=>permitted('filter-ledger','update')||permitted('filter-ledger','create');
  function init(){
    const trigger=by('analysisFilterLedgerOpen'),dialog=by('analysisFilterLedgerDialog'),mount=by('analysisFilterLedgerMount');
    const view=by('dfViewFilterLedger'),page=view?.querySelector('.df-filter-page');
    const save=by('analysisFilterLedgerSave'),status=by('analysisFilterLedgerStatus'),closeButton=by('analysisFilterLedgerClose');
    if(!page||!trigger||!dialog||!mount||!save||!closeButton||!status)return;
    let owner='',request=0,loading=false;
    function message(text){status.textContent=text;}
    function busy(){
      const standardSave=by('dfFilterLabApply');
      return window.dfFilterWriteInProgress?.()||standardSave?.disabled&&standardSave.textContent==='저장·반영 중';
    }
    function returned(){
      if(mount.contains(page))view.appendChild(page);
      owner='';request++;loading=false;mount.inert=false;
      trigger.setAttribute('aria-expanded','false');
      if(!trigger.hidden&&!document.body.classList.contains('df-auth-locked'))trigger.focus({preventScroll:true});
    }
    function close(force=false){
      if(!dialog.open)return;
      if(!force&&busy()){message('여지 무게 저장이 끝난 뒤 닫아주세요.');return;}
      dialog.close();returned();
    }
    function permissions(event){
      const allowed=canOpen();
      trigger.hidden=!allowed;
      if(dialog.open&&(event?.detail?.signedOut||owner!==actor()||!allowed)){close(true);return;}
      if(dialog.open){
        dialog.classList.toggle('is-readonly',!canEdit());
        save.hidden=!canEdit();
      }
    }
    async function open(){
      if(dialog.open||!canOpen()||window.DF_NAVIGATION_GUARD?.getActive()!=='analysis')return;
      if(typeof dialog.showModal!=='function'||typeof window.dfFilterReload!=='function'){
        alert('작성용 품질문서에서 먼지여지대장을 열어주세요.');return;
      }
      owner=actor();const id=++request;
      mount.appendChild(page);
      try{dialog.showModal();}catch(_){returned();return;}
      trigger.setAttribute('aria-expanded','true');
      dialog.scrollTop=0;permissions();
      loading=true;mount.inert=true;save.disabled=true;
      message('대장 불러오는 중…');
      let ok;
      try{ok=await window.dfFilterReload();}catch(_){ok=false;}
      if(!dialog.open||id!==request||owner!==actor())return;
      loading=false;mount.inert=false;save.disabled=false;
      if(ok!==false){
        window.dfFilterRenderAnnualPage?.();
        message(window.dfFilterHasDrafts?.()?'저장하지 않은 여지 입력이 있어요.':canEdit()?'':'조회 전용');
      }else message('대장을 불러오지 못했습니다. 대장의 새로고침을 눌러주세요.');
    }
    trigger.addEventListener('click',open);
    closeButton.addEventListener('click',()=>close());
    dialog.addEventListener('close',()=>{if(!dialog.open&&mount.contains(page))returned();});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    save.addEventListener('click',()=>{
      if(loading||busy()||!canOpen()||!canEdit())return;
      const standardSave=by('dfFilterLabApply');
      if(!standardSave?.disabled)standardSave?.click();
    });
    // The same inputs stay mounted in one copy. Prevent edits for view-only
    // accounts while keeping team, year and search controls available.
    for(const type of ['beforeinput','keydown','paste','drop'])mount.addEventListener(type,event=>{
      if(event.target.closest?.('[data-annual-field],[data-f]')&&!canEdit()&&
         (type!=='keydown'||event.key==='Backspace'||event.key==='Delete'||event.key?.length===1&&!event.ctrlKey&&!event.metaKey))event.preventDefault();
    });
    document.addEventListener('df:menu-permissions-changed',permissions);
    new MutationObserver(()=>permissions()).observe(document.body,{attributes:true,attributeFilter:['class']});
    window.DF_ANALYSIS_FILTER_LEDGER=Object.freeze({isOpen:()=>dialog.open,close:()=>close()});
    permissions();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
