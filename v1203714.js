// ==========================================================
// DREAMFOREN v120.37.14
// 먼지 여지관리대장 연도별 관리 + 현재 양식 그대로 자동 다페이지 출력
// - 기존 LAB/여지대장 자동연동과 저장 로직은 변경하지 않는다.
// - 현재 5열 x 7단(페이지당 35건) 양식을 페이지마다 그대로 반복한다.
// ==========================================================
(function dfV1203714FilterLedgerAnnualPages(){
  'use strict';

  const VERSION='v120.37.14';
  const PAGE_CAPACITY=35;
  const YEAR_STORE_KEY='dreampoen_filter_ledger_year_v1203714';
  const CURRENT_YEAR=String(new Date().getFullYear());
  const knownYears=new Set([CURRENT_YEAR]);
  let hasUndated=false;
  let pageIndex=0;
  let renderTimer=0;

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  function rawRows(){
    return [...document.querySelectorAll('#dfFilterTbody tr[data-filter-receipt]')];
  }

  function yearOfRow(row){
    const text=String(row?.cells?.[0]?.textContent||'').trim();
    return text.match(/^(\d{4})/)?.[1]||'undated';
  }

  function selectedYear(){
    return document.getElementById('dfFilterYear')?.value||CURRENT_YEAR;
  }

  function yearLabel(value=selectedYear()){
    return value==='undated'?'연도 미지정':`${value}년`;
  }

  function selectedRows(){
    const year=selectedYear();
    return rawRows().filter(row=>yearOfRow(row)===year);
  }

  function collectYears(){
    rawRows().forEach(row=>{
      const year=yearOfRow(row);
      if(year==='undated')hasUndated=true;
      else knownYears.add(year);
    });
  }

  function rebuildYearOptions(){
    const select=document.getElementById('dfFilterYear');
    if(!select)return;
    collectYears();
    const previous=select.value||localStorage.getItem(YEAR_STORE_KEY)||CURRENT_YEAR;
    const years=[...knownYears].filter(x=>/^\d{4}$/.test(x)).sort((a,b)=>Number(b)-Number(a));
    select.innerHTML=years.map(year=>`<option value="${year}">${year}년</option>`).join('')+
      (hasUndated?'<option value="undated">연도 미지정</option>':'');
    if([...select.options].some(option=>option.value===previous))select.value=previous;
    else if([...select.options].some(option=>option.value===CURRENT_YEAR))select.value=CURRENT_YEAR;
    else if(select.options.length)select.selectedIndex=0;
  }

  function rowData(row,slot){
    const filter=row?.querySelector('[data-f="filter_no"]')?.value||'';
    const before=row?.querySelector('[data-f="before_weight"]')?.value||'';
    const after=row?.querySelector('[data-f="after_weight"]')?.value||'';
    const receipt=row?.dataset?.filterReceipt||'';
    const spare=row?.dataset?.filterSpare==='1';
    const company=spare?'':row?.cells?.[2]?.querySelector('strong')?.textContent||'';
    const facility=spare?'':row?.cells?.[2]?.querySelector('small')?.textContent||'';
    const diff=before!==''&&after!==''?(Number(after)-Number(before)).toFixed(4):'';
    return {slot,row,filter,before,after,receipt,company,facility,diff,spare,has:!!row};
  }

  function ledgerInnerMarkup(pageRows,editableMode=true){
    const rawTeam=document.getElementById('dfFilterTeam')?.selectedOptions?.[0]?.textContent||'';
    const team=/전체/.test(rawTeam)?'':rawTeam;
    const writer=document.getElementById('dfFilterWriter')?.value||'';
    const approver=document.getElementById('dfFilterApprover')?.value||'';
    const cells=Array.from({length:PAGE_CAPACITY},(_,slot)=>rowData(pageRows[slot],slot));
    const line=(label,key,block,editable=false)=>`<tr><th>${label}</th>${block.map(cell=>{
      if(editable&&cell.has&&editableMode){
        return `<td><input data-annual-slot="${cell.slot}" data-annual-receipt="${esc(cell.receipt)}" data-annual-field="${key}" value="${esc(cell[key])}" ${key!=='filter'?'inputmode="decimal"':''}></td>`;
      }
      if(editable&&cell.has)return `<td><span>${esc(cell[key])}</span></td>`;
      if(key==='place'){
        const place=cell.spare?'':cell.company||cell.receipt;
        return `<td><strong title="${esc(place)}">${esc(place)}</strong><small title="${esc(cell.facility)}">${esc(cell.facility)}</small></td>`;
      }
      const marker=key==='diff'?` data-annual-diff-slot="${cell.slot}"`:'';
      return `<td><span${marker}>${esc(cell[key])}</span></td>`;
    }).join('')}</tr>`;

    return `<div class="df-excel-ledger-head"><img class="df-excel-logo" src="assets/dreamforen-logo.jpg" alt="드림포이엔 로고"><h2>원통여지관리대장</h2><span>${esc(team)}</span><table><tr><th>작성자</th><th>책임기술자</th></tr><tr><td>${esc(writer)} (서명)</td><td>${esc(approver)} (서명)</td></tr></table></div><div class="df-excel-blocks">${Array.from({length:7},(_,group)=>{
      const block=cells.slice(group*5,group*5+5);
      return `<table class="df-excel-ledger-table">${line('여지번호','filter',block,true)}${line('지점명','place',block)}${line('무게 전(g)','before',block,true)}${line('무게 후(g)','after',block,true)}${line('전후 무게 차(g)','diff',block)}</table>`;
    }).join('')}</div>`;
  }

  function bindPageInputs(box){
    box.querySelectorAll('[data-annual-field]').forEach(input=>{
      input.addEventListener('input',()=>{
        const receipt=input.dataset.annualReceipt;
        const row=rawRows().find(candidate=>String(candidate.dataset.filterReceipt)===String(receipt));
        const targetField={filter:'filter_no',before:'before_weight',after:'after_weight'}[input.dataset.annualField];
        const target=row?.querySelector(`[data-f="${targetField}"]`);
        if(target){
          target.value=input.value;
          target.dispatchEvent(new Event('input',{bubbles:true}));
        }
        if(input.dataset.annualField==='before'||input.dataset.annualField==='after'){
          const slot=input.dataset.annualSlot;
          const before=box.querySelector(`[data-annual-slot="${slot}"][data-annual-field="before"]`)?.value??'';
          const after=box.querySelector(`[data-annual-slot="${slot}"][data-annual-field="after"]`)?.value??'';
          const diff=box.querySelector(`[data-annual-diff-slot="${slot}"]`);
          if(diff)diff.textContent=before!==''&&after!==''?(Number(after)-Number(before)).toFixed(4):'';
        }
      });
    });
  }

  function updateNavigation(total,totalPages){
    const summary=document.getElementById('dfFilterAnnualSummary');
    const jump=document.getElementById('dfFilterPageJump');
    const pageTotal=document.getElementById('dfFilterPageTotal');
    const previous=document.getElementById('dfFilterPagePrev');
    const next=document.getElementById('dfFilterPageNext');
    if(summary)summary.textContent=`${yearLabel()} · ${totalPages}페이지 · 페이지당 ${PAGE_CAPACITY}칸`;
    if(jump){jump.value=String(pageIndex+1);jump.max=String(totalPages);}
    if(pageTotal)pageTotal.textContent=String(totalPages);
    if(previous)previous.disabled=pageIndex<=0;
    if(next)next.disabled=pageIndex>=totalPages-1;
  }

  function renderPage(){
    renderTimer=0;
    const box=document.getElementById('dfFilterExcelWeb');
    if(!box)return;
    rebuildYearOptions();
    const rows=selectedRows();
    const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_CAPACITY));
    pageIndex=Math.max(0,Math.min(pageIndex,totalPages-1));
    const pageRows=rows.slice(pageIndex*PAGE_CAPACITY,(pageIndex+1)*PAGE_CAPACITY);
    box.innerHTML=ledgerInnerMarkup(pageRows);
    box.dataset.annualYear=selectedYear();
    box.dataset.annualPage=String(pageIndex+1);
    bindPageInputs(box);
    updateNavigation(rows.length,totalPages);
  }

  function scheduleRender(delay=90){
    clearTimeout(renderTimer);
    renderTimer=setTimeout(renderPage,delay);
  }

  function printablePageMarkup(pageRows){
    return `<div class="df-filter-excel-web">${ledgerInnerMarkup(pageRows,false)}</div>`;
  }

  function safeFilePart(value){
    return String(value||'').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'')||'전체팀';
  }

  function printDocumentMarkup(rows,team,autoPrint=false){
    const pageCount=Math.ceil(rows.length/PAGE_CAPACITY);
    const pages=Array.from({length:pageCount},(_,index)=>rows.slice(index*PAGE_CAPACITY,(index+1)*PAGE_CAPACITY));
    const title=`원통여지관리대장_${safeFilePart(yearLabel())}_${safeFilePart(team)}`;
    const pageHtml=pages.map(part=>`<section class="df-annual-print-page">${printablePageMarkup(part)}</section>`).join('');
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="${esc(document.baseURI)}"><title>${esc(title)}</title><style>
      @page{size:A4 portrait;margin:12mm}
      *{box-sizing:border-box}
      html,body{margin:0;color:#111;font-family:"Malgun Gothic",sans-serif}
      body{background:#e8edf1}
      .preview-tools{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#eef3f6;border-bottom:1px solid #ccd7df}
      .preview-tools strong{color:#173d59;font-size:13px}
      .preview-tools button{border:0;border-radius:7px;background:#28658d;color:#fff;padding:9px 16px;font-weight:700;cursor:pointer}
      .df-annual-print-page{width:210mm;min-height:297mm;margin:14px auto;padding:12mm;background:#fff;box-shadow:0 3px 18px #0002;page-break-after:always;break-after:page}
      .df-annual-print-page:last-child{page-break-after:auto;break-after:auto}
      .df-filter-excel-web{width:100%;background:#fff}
      .df-excel-ledger-head{height:54px;display:grid;grid-template-columns:48px minmax(260px,1fr) auto 200px;align-items:center;border:1px solid #222;border-bottom:2px solid #222;padding:2px 5px}
      .df-excel-logo{width:40px;height:40px;object-fit:contain}
      .df-excel-ledger-head h2{text-align:center;font-size:20px;margin:0}
      .df-excel-ledger-head>span{margin-right:8px;font-size:11px;font-weight:700}
      .df-excel-ledger-head table{display:table!important;width:200px;border-collapse:collapse}
      .df-excel-ledger-head th,.df-excel-ledger-head td{width:100px;height:21px;border:1px solid #222;text-align:center;font-size:9px}
      .df-excel-ledger-table{width:100%;table-layout:fixed;border-collapse:collapse}
      .df-excel-ledger-table th{width:94px}
      .df-excel-ledger-table th,.df-excel-ledger-table td{height:27px;border:1px solid #222;padding:2px;text-align:center;font-size:9px;background:#fff}
      .df-excel-ledger-table span,.df-excel-ledger-table strong,.df-excel-ledger-table small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .df-excel-ledger-table small{font-size:8px;margin-top:1px}
      @media print{
        body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .preview-tools{display:none}
        .df-annual-print-page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
      }
    </style></head><body><div class="preview-tools"><strong>${esc(yearLabel())} · ${esc(team)} · ${pageCount}페이지 · 페이지당 ${PAGE_CAPACITY}칸</strong><button type="button" onclick="print()">인쇄 · PDF 저장</button></div>${pageHtml}${autoPrint?'<script>onload=()=>setTimeout(()=>print(),300)<\/script>':''}</body></html>`;
  }

  function annualPrint(autoPrint=false){
    const rows=selectedRows();
    if(!rows.length)return alert(`${yearLabel()}에 출력할 먼지 여지자료가 없습니다.`);
    const team=document.getElementById('dfFilterTeam')?.selectedOptions?.[0]?.textContent||'전체 팀';
    const win=window.open('about:blank','_blank');
    if(!win)return alert('인쇄 미리보기가 차단되었습니다. 브라우저 주소창의 팝업 허용을 눌러주세요.');
    win.document.write(printDocumentMarkup(rows,team,autoPrint));
    win.document.close();
    window.DF_DIAG?.info('FILTER-ANNUAL-PRINT',autoPrint?'연도별 전체 인쇄/PDF 실행':'연도별 전체 미리보기 실행',`${yearLabel()} / ${team} / ${rows.length}건 / ${Math.ceil(rows.length/PAGE_CAPACITY)}페이지`);
  }

  function ensureControls(){
    const toolbar=document.querySelector('.df-filter-page .df-filter-toolbar');
    if(!toolbar||document.getElementById('dfFilterAnnualBar'))return;
    const bar=document.createElement('div');
    bar.id='dfFilterAnnualBar';
    bar.className='df-filter-annual-bar';
    bar.innerHTML=`<label for="dfFilterYear"><b>관리 연도</b><select id="dfFilterYear" aria-label="먼지 여지관리대장 관리 연도"></select></label><span id="dfFilterAnnualSummary" class="df-filter-annual-summary"></span><div class="df-filter-page-actions"><button type="button" id="dfFilterPageAdd" class="company-btn primary">+ 여분 페이지</button><div class="df-filter-page-nav"><button type="button" id="dfFilterPagePrev" class="company-btn secondary">이전</button><label class="df-filter-page-position" title="페이지 번호를 직접 입력할 수 있습니다."><input type="number" id="dfFilterPageJump" min="1" value="1" inputmode="numeric" aria-label="이동할 페이지"><span>/</span><strong id="dfFilterPageTotal">1</strong></label><button type="button" id="dfFilterPageNext" class="company-btn secondary">다음</button></div></div>`;
    toolbar.insertAdjacentElement('afterend',bar);
    rebuildYearOptions();
    const select=document.getElementById('dfFilterYear');
    select.addEventListener('change',()=>{
      pageIndex=0;
      localStorage.setItem(YEAR_STORE_KEY,select.value);
      document.getElementById('dfFilterTeam')?.dispatchEvent(new Event('change',{bubbles:true}));
      scheduleRender(140);
    });
    document.getElementById('dfFilterPagePrev').addEventListener('click',()=>{if(pageIndex>0){pageIndex--;renderPage()}});
    document.getElementById('dfFilterPageNext').addEventListener('click',()=>{
      const pages=Math.max(1,Math.ceil(selectedRows().length/PAGE_CAPACITY));
      if(pageIndex<pages-1){pageIndex++;renderPage()}
    });
    const jump=document.getElementById('dfFilterPageJump');
    const goToPage=()=>{
      const pages=Math.max(1,Math.ceil(selectedRows().length/PAGE_CAPACITY));
      const requested=Math.min(pages,Math.max(1,Number(jump.value)||1));
      pageIndex=requested-1;
      renderPage();
    };
    jump.addEventListener('change',goToPage);
    jump.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();goToPage();jump.blur();}});
    document.getElementById('dfFilterPageAdd').addEventListener('click',()=>{
      if(typeof window.dfFilterAddSparePage==='function')window.dfFilterAddSparePage();
      else alert('여분 페이지 기능을 준비하는 중입니다. 잠시 후 다시 눌러주세요.');
    });
  }

  function init(){
    ensureControls();
    const body=document.getElementById('dfFilterTbody');
    if(body&&!body.dataset.annualPageWatch){
      body.dataset.annualPageWatch='1';
      // 행 목록이 실제로 교체될 때만 페이지를 다시 그린다.
      // 입력 중 상태문구처럼 행 내부 텍스트가 바뀌는 것까지 감시하면
      // 매 키 입력마다 화면용 input이 재생성되어 포커스가 끊긴다.
      new MutationObserver(()=>{collectYears();scheduleRender(110)}).observe(body,{childList:true});
    }
    ['dfFilterTeam','dfFilterStatus'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{pageIndex=0;scheduleRender(120)}));
    document.getElementById('dfFilterSearch')?.addEventListener('input',()=>{pageIndex=0;scheduleRender(120)});
    document.getElementById('dfFilterRefresh')?.addEventListener('click',()=>scheduleRender(450));
    const printButton=document.getElementById('dfFilterPrint');
    if(printButton){printButton.textContent='인쇄·PDF';printButton.title='선택한 연도의 전체 페이지를 인쇄하거나 PDF로 저장합니다.'}
    const previewButton=document.getElementById('dfFilterPreview');
    if(previewButton)previewButton.title='선택한 연도의 전체 페이지를 미리 봅니다.';
    const sideVersion=document.getElementById('dfBuildVersionStatic');
    if(sideVersion)sideVersion.textContent=`ONLINE ${VERSION} · FILTER LEDGER ANNUAL PAGES + CONTRACT DOCS + WEATHER`;
    const footer=document.getElementById('dfFooterVersion');
    if(footer)footer.textContent=VERSION;
    window.dfFilterAnnualPrint=annualPrint;
    window.dfFilterGetAnnualState=()=>({year:selectedYear(),total:selectedRows().length,pages:Math.max(1,Math.ceil(selectedRows().length/PAGE_CAPACITY)),pageCapacity:PAGE_CAPACITY});
    window.dfFilterGoLastPage=()=>{pageIndex=Math.max(0,Math.ceil(selectedRows().length/PAGE_CAPACITY)-1);renderPage();};
    window.dfFilterRenderAnnualPage=renderPage;
    [160,600,1300].forEach(delay=>setTimeout(()=>{ensureControls();collectYears();scheduleRender(70)},delay));
    window.DF_DIAG?.info('FILTER-ANNUAL-1203714','먼지 여지관리대장 연도별 다페이지 출력 준비 완료',`현재 양식 유지 / 페이지당 ${PAGE_CAPACITY}건 / 자동연동 변경 없음`);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
