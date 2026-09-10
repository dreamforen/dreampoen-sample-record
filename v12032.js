/* DREAMFOREN v120.32.0 · SAMPLE EXPORT / CALC PRINT / MOBILE */
(function(){
  'use strict';
  const VERSION='v120.32.2';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function syncCloneValues(source,clone){
    const src=[...source.querySelectorAll('input,select,textarea')],dst=[...clone.querySelectorAll('input,select,textarea')];
    src.forEach((el,i)=>{const out=dst[i];if(!out)return;if(el.tagName==='SELECT')out.value=el.value;else if(el.tagName==='TEXTAREA')out.textContent=el.value;else if(el.type==='checkbox'||el.type==='radio')el.checked?out.setAttribute('checked',''):out.removeAttribute('checked');else out.setAttribute('value',el.value)});
  }
  function calculationPreview(printNow=false){
    const source=document.querySelector('#calcLabSheet .calc-lab-paper');if(!source)return alert('시료채취 계산 영역을 찾지 못했습니다.');
    const copy=source.cloneNode(true);syncCloneValues(source,copy);copy.querySelectorAll('button,.no-print').forEach(el=>el.remove());
    const receipt=$('receiptNo')?.value?.trim()||'시료채취',company=$('company')?.value?.trim()||'',facility=$('facility')?.value?.trim()||'';
    const title=[receipt,company,facility,'시료채취계산'].filter(Boolean).join('_'),css=new URL('style.css?v=12032200',location.href).href;
    const w=window.open('','_blank');if(!w)return alert('미리보기를 열려면 팝업을 허용해주세요.');
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${css}"><style>html,body{margin:0;background:#dfe5e8;font-family:"Malgun Gothic",sans-serif}.df-calc-preview-bar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 16px;background:#173d59;color:#fff}.df-calc-preview-bar button{border:0;border-radius:7px;padding:8px 16px;font-weight:800;cursor:pointer}.df-calc-preview-sheet{width:210mm;min-height:297mm;margin:10px auto;background:#fff;box-sizing:border-box;padding:12mm}.calc-lab-paper{max-width:none!important;padding:0!important;box-shadow:none!important}@media(max-width:850px){.df-calc-preview-sheet{width:100%;min-height:0;margin:0;padding:14px}.df-calc-preview-bar{font-size:12px}}@media print{html,body{background:#fff!important}.df-calc-preview-bar{display:none!important}.df-calc-preview-sheet,.df-calc-preview-sheet *{visibility:visible!important}.df-calc-preview-sheet{display:block!important;position:static!important;width:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important}.calc-lab-paper{display:block!important;visibility:visible!important;position:static!important}@page{size:A4 portrait;margin:12mm}}</style></head><body><div class="df-calc-preview-bar"><b>시료채취 계산 미리보기</b><button onclick="window.print()">인쇄 / PDF</button></div><main class="df-calc-preview-sheet">${copy.outerHTML}</main></body></html>`);
    w.document.close();if(printNow)setTimeout(()=>{w.focus();w.print()},650);
  }
  function bindPrintButtons(){const preview=$('btnPrint');if(preview){const b=preview.cloneNode(true);preview.replaceWith(b);b.textContent='계산 미리보기';b.onclick=()=>calculationPreview(false)}const print=$('btnCalcPrint');if(print){const b=print.cloneNode(true);print.replaceWith(b);b.onclick=()=>calculationPreview(true)}}
  function analysisFileBase(receiptFallback=''){
    const sel=$('analysisRecordSelect'),row=(sel?._records||[]).find(r=>String(r.id)===String(sel.value))||{};
    const f=row.fields||row.data?.fields||{};
    const safe=v=>String(v||'').trim().replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,' ');
    return [safe(f.receiptNo||receiptFallback),safe(f.company),safe(f.facility)].filter(Boolean).join('_')||'시료분석자료';
  }
  function printAnalysisNamed(){
    try{window.calcDust?.()}catch(_){}
    const old=document.title;document.title=analysisFileBase();document.body.classList.add('analysis-printing');window.print();
    setTimeout(()=>{document.body.classList.remove('analysis-printing');document.title=old},500);
  }
  function bindAnalysisPrint(){const old=$('analysisPrintBtn');if(old){const b=old.cloneNode(true);old.replaceWith(b);b.onclick=printAnalysisNamed}}
  function prepareStickyActions(){
    const row=document.querySelector('#dfViewSample .v85-action-row'),toolbar=document.querySelector('#dfViewSample .v85-sheet-toolbar');
    if(!row||!toolbar||row.dataset.v12032)return;
    row.dataset.v12032='1';row.classList.add('df-sample-sticky-actions');toolbar.parentNode.insertBefore(row,toolbar);
    const marker=document.createElement('div');marker.className='df-sample-sticky-marker';row.parentNode.insertBefore(marker,row);
    const floating=row.cloneNode(true);floating.removeAttribute('data-v12032');floating.querySelectorAll('[id]').forEach(el=>{const target=el.id;el.removeAttribute('id');el.dataset.stickyTarget=target});
    floating.classList.add('df-sample-floating-actions');floating.hidden=true;document.body.appendChild(floating);
    floating.addEventListener('click',e=>{const b=e.target.closest('[data-sticky-target]');if(!b)return;document.getElementById(b.dataset.stickyTarget)?.click()});
    const update=()=>{
      const sample=$('dfViewSample'),visible=sample&&!sample.hidden&&getComputedStyle(sample).display!=='none';
      const passed=marker.getBoundingClientRect().top<0;
      floating.hidden=!(visible&&passed);
      document.body.classList.toggle('df-sample-actions-floating',visible&&passed);
    };
    addEventListener('scroll',update,{passive:true});addEventListener('resize',update,{passive:true});update();
  }
  function mobileRepair(){if(innerWidth<=900){document.body.classList.remove('df-sidebar-collapsed');document.documentElement.style.maxWidth='100%'}}
  function bind(){prepareStickyActions();setTimeout(()=>{bindPrintButtons();bindAnalysisPrint()},50);mobileRepair();addEventListener('resize',mobileRepair,{passive:true});$('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · PRINT & MOBILE FIX');$('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);window.DF_DIAG?.info('SYSTEM','v120.32.2 계산 인쇄·모바일 메뉴 보정 완료')}
  window.dfSampleCalculationPreview=calculationPreview;
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})();
