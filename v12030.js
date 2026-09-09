/* DREAMFOREN UI / PRINT STABILITY · v120.30.0 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function validDate(value){
    const d=String(value||'').replace(/\D/g,'').slice(0,8);
    if(d.length!==8)return '';
    const iso=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`,x=new Date(iso+'T00:00:00');
    return !Number.isNaN(x.getTime())&&x.getFullYear()===+d.slice(0,4)&&x.getMonth()+1===+d.slice(4,6)&&x.getDate()===+d.slice(6)?iso:'';
  }
  function maskDate(value){const d=String(value||'').replace(/\D/g,'').slice(0,8);return d.length<=4?d:d.length<=6?`${d.slice(0,4)}-${d.slice(4)}`:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`}
  function prepareLeaveDates(root=document){
    ['dfLeaveStart','dfLeaveEnd'].forEach(id=>{const input=root.querySelector?.('#'+id);if(!input||input.dataset.digitsDate==='1')return;input.dataset.digitsDate='1';input.type='text';input.inputMode='numeric';input.maxLength=10;input.placeholder='YYYYMMDD';input.addEventListener('input',()=>{input.value=maskDate(input.value);input.onchange?.()});input.addEventListener('blur',()=>{const iso=validDate(input.value);input.classList.toggle('invalid',!!input.value&&!iso);if(iso)input.value=iso})});
  }

  function ledgerHtml(autoPrint){
    const source=$('dfFilterExcelWeb');if(!source){alert('원통여지관리대장을 먼저 불러와주세요.');return ''}
    const clone=source.cloneNode(true);clone.querySelectorAll('input').forEach(input=>{const span=document.createElement('span');span.textContent=input.value;input.replaceWith(span)});clone.querySelectorAll('button').forEach(x=>x.remove());
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>원통여지관리대장</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111;font-family:"Malgun Gothic",sans-serif}.toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#173b55;color:#fff}.toolbar button{border:0;border-radius:7px;padding:8px 14px;background:#fff;color:#173b55;font-weight:800;cursor:pointer}.page{width:190mm;min-height:277mm;margin:10px auto;padding:0;background:#fff}.df-filter-excel-web{width:100%}.df-excel-ledger-head{height:18mm;display:grid;grid-template-columns:14mm 1fr auto;align-items:center;border:1px solid #222;border-bottom:2px solid #222;padding:1mm 2mm}.df-excel-logo{width:12mm;height:12mm;object-fit:contain}.df-excel-ledger-head h2{text-align:center;font-size:16pt;margin:0}.df-excel-ledger-head>span{font-size:8pt;font-weight:700}.df-excel-ledger-head table{display:none}.df-excel-ledger-table{width:100%;table-layout:fixed;border-collapse:collapse}.df-excel-ledger-table th{width:19mm}.df-excel-ledger-table th,.df-excel-ledger-table td{height:7.2mm;border:1px solid #222;padding:.4mm;text-align:center;font-size:7.5pt}.df-excel-ledger-table strong,.df-excel-ledger-table small,.df-excel-ledger-table span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.df-excel-ledger-table small{font-size:6.5pt}@media print{.toolbar{display:none}.page{width:auto;min-height:0;margin:0}}</style></head><body><div class="toolbar"><b>${autoPrint?'원통여지관리대장 인쇄':'원통여지관리대장 미리보기'}</b><button onclick="window.print()">인쇄</button></div><main class="page">${clone.outerHTML}</main>${autoPrint?'<script>onload=()=>setTimeout(()=>print(),250)<\/script>':''}</body></html>`;
  }
  function openLedger(autoPrint=false){const html=ledgerHtml(autoPrint);if(!html)return;const w=window.open('about:blank','_blank');if(!w)return alert('팝업 차단을 해제해주세요.');w.document.open();w.document.write(html);w.document.close()}

  document.addEventListener('click',e=>{
    const button=e.target.closest('#dfFilterPreview,#dfFilterPrint');if(!button)return;
    e.preventDefault();e.stopImmediatePropagation();openLedger(button.id==='dfFilterPrint');
  },true);
  new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)prepareLeaveDates(n)}))).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{prepareLeaveDates();if($('dfFooterVersion'))$('dfFooterVersion').textContent='v120.30.0';window.DF_DIAG?.info('UI-PRINT-12030','결재 날짜·팝업 여백·여지대장 미리보기/인쇄 보정 완료')},{once:true});
})();
