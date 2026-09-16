// ==========================================================
// DREAMFOREN v120.37.16.0
// 가스상 측정항목 매연 추가 + LAB 링겔만 매연 농도표 별도자료 표시
// 기존 시료채취 포인트·저장·계산·인쇄 로직은 변경하지 않는다.
// ==========================================================
(function dfV12037160SmokeAttachment(){
  'use strict';

  const VERSION='v120.37.16.0';
  const byId=id=>document.getElementById(id);
  const isSmoke=value=>/매연|링겔만/i.test(String(value||'').replace(/\s/g,''));

  function patchCanon(){
    if(window.dfV12037160CanonPatched||typeof dfV100Canon!=='function')return;
    const baseCanon=dfV100Canon;
    dfV100Canon=function dfV160CanonSmoke(name){
      return isSmoke(name)?'매연':baseCanon.apply(this,arguments);
    };
    window.dfV12037160CanonPatched=true;
  }

  function ensureSmokeOption(){
    const select=byId('gasItemSelect');
    if(!select)return false;
    const previous=select.value;
    let option=[...select.options].find(item=>item.value==='매연');
    if(!option){
      option=document.createElement('option');
      option.value='매연';
      option.textContent='매연';
    }
    const sulfur=[...select.options].find(item=>item.value==='황산화물');
    if(sulfur&&sulfur.nextElementSibling!==option)select.insertBefore(option,sulfur.nextSibling);
    else if(!option.parentElement)select.appendChild(option);
    if([...select.options].some(item=>item.value===previous))select.value=previous;
    return sulfur?.nextElementSibling===option;
  }

  function smokeCardMarkup(){
    return `<section class="analysis-card gas-analysis-card thc-attachment-card smoke-attachment-card" data-smoke-attachment-card><div class="analysis-card-title"><strong>매연</strong><em>링겔만 매연 농도표</em></div><div class="thc-attachment-message"><strong>별도 자료 첨부</strong><span>매연은 링겔만 매연 농도표를 별도 첨부합니다.</span></div></section>`;
  }

  function replaceSmokePendingCard(){
    const box=byId('analysisPendingCards');
    if(!box)return false;
    let changed=false;
    box.querySelectorAll('.analysis-pending-card').forEach(card=>{
      const name=card.querySelector('b')?.textContent||'';
      if(!isSmoke(name))return;
      const holder=document.createElement('div');
      holder.innerHTML=smokeCardMarkup();
      card.replaceWith(holder.firstElementChild);
      changed=true;
    });
    return changed;
  }

  function patchPendingRenderer(){
    if(window.dfV12037160PendingPatched||typeof renderPendingAnalysisCards!=='function')return;
    const baseRender=renderPendingAnalysisCards;
    renderPendingAnalysisCards=function dfV160RenderSmokeAttachment(record){
      const result=baseRender.apply(this,arguments);
      replaceSmokePendingCard();
      if(typeof dfV1133NumberLabCards==='function')setTimeout(()=>dfV1133NumberLabCards(),0);
      return result;
    };
    window.dfV12037160PendingPatched=true;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · SMOKE + RINGELMANN ATTACHMENT`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    patchCanon();
    patchPendingRenderer();
    ensureSmokeOption();
    replaceSmokePendingCard();
    applyVersion();
    [180,700,1600].forEach(wait=>setTimeout(()=>{
      ensureSmokeOption();
      replaceSmokePendingCard();
      applyVersion();
    },wait));
    window.DF_DIAG?.info('SMOKE-RINGELMANN-12037160','매연 측정항목·LAB 별도자료 준비 완료','황산화물 다음 매연 / 링겔만 매연 농도표 / 기존 포인트 유지');
  }

  window.dfV1203720EnsureSmokeOption=ensureSmokeOption;
  window.dfV1203720SmokeCardMarkup=smokeCardMarkup;
  window.dfV1203720ReplaceSmokePendingCard=replaceSmokePendingCard;

  patchCanon();
  patchPendingRenderer();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
