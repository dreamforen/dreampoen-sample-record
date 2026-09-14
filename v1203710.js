/* DREAMFOREN v120.37.10 · MOBILE PDF CANVAS PREVIEW */
(function(){
  'use strict';
  if(window.__DF_V1203710_MOBILE_PDF__)return;
  window.__DF_V1203710_MOBILE_PDF__=true;

  const VERSION='v120.37.10';
  const SCRIPT_BASE=new URL('.',document.currentScript?.src||location.href);
  const PDF_CORE=new URL('assets/pdf.min.mjs?v=120371000',SCRIPT_BASE).href;
  const PDF_WORKER=new URL('assets/pdf.worker.min.mjs?v=120371000',SCRIPT_BASE).href;
  const originalPreview=window.dfV71PreviewCompanyDocument;
  const originalClose=window.dfV71CloseCompanyFilePreview;
  let modulePromise=null;
  let active=null;
  let resizeTimer=0;

  function isPdf(d){
    const mime=String(d?.mime_type||'').toLowerCase();
    const name=String(d?.file_name||'').toLowerCase();
    return mime==='application/pdf'||name.endsWith('.pdf');
  }
  function needsCanvasPreview(){
    const ua=String(navigator.userAgent||'');
    return /Android|iPhone|iPad|iPod|SamsungBrowser|Mobile/i.test(ua)
      || window.matchMedia?.('(max-width: 900px)').matches
      || navigator.pdfViewerEnabled===false;
  }
  function cancelActive(){
    const state=active;
    active=null;
    if(!state)return;
    state.runId++;
    try{state.renderTask?.cancel()}catch(_){ }
    try{state.loadingTask?.destroy()}catch(_){ }
    state.body?.classList.remove('df-pdfjs-active');
  }
  async function loadPdfModule(){
    if(!modulePromise){
      modulePromise=import(PDF_CORE).then(pdfjs=>{
        pdfjs.GlobalWorkerOptions.workerSrc=PDF_WORKER;
        return pdfjs;
      }).catch(error=>{modulePromise=null;throw error});
    }
    return modulePromise;
  }
  function layout(){
    return '<div class="df-mobile-pdf-shell">'
      +'<div class="df-mobile-pdf-toolbar">'
      +'<div class="df-mobile-pdf-pages"><button type="button" data-pdf-prev>이전</button><strong data-pdf-page>1 / 1</strong><button type="button" data-pdf-next>다음</button></div>'
      +'<div class="df-mobile-pdf-zoom"><button type="button" data-pdf-zoom-out aria-label="축소">−</button><button type="button" data-pdf-fit>화면 맞춤</button><button type="button" data-pdf-zoom-in aria-label="확대">＋</button></div>'
      +'</div>'
      +'<div class="df-mobile-pdf-stage" data-pdf-stage><div class="df-mobile-pdf-loading">PDF를 불러오는 중입니다.</div></div>'
      +'<div class="df-mobile-pdf-status" data-pdf-status role="status">잠시만 기다려주세요.</div>'
      +'</div>';
  }
  function status(state,text,bad=false){
    const el=state.body.querySelector('[data-pdf-status]');
    if(el){el.textContent=text;el.classList.toggle('bad',bad)}
  }
  function updateControls(state){
    const total=state.pdf?.numPages||1;
    const label=state.body.querySelector('[data-pdf-page]');
    const prev=state.body.querySelector('[data-pdf-prev]');
    const next=state.body.querySelector('[data-pdf-next]');
    if(label)label.textContent=`${state.pageNo} / ${total}`;
    if(prev)prev.disabled=state.pageNo<=1;
    if(next)next.disabled=state.pageNo>=total;
  }
  function nextFrame(){return new Promise(resolve=>requestAnimationFrame(()=>resolve()))}
  async function renderPage(state){
    if(active!==state||!state.pdf)return;
    const runId=++state.runId;
    try{
      try{state.renderTask?.cancel()}catch(_){ }
      status(state,`${state.pageNo}페이지를 표시하는 중입니다.`);
      updateControls(state);
      const page=await state.pdf.getPage(state.pageNo);
      await nextFrame();
      if(active!==state||runId!==state.runId)return;
      const stage=state.body.querySelector('[data-pdf-stage]');
      const base=page.getViewport({scale:1});
      const available=Math.max(260,(stage?.clientWidth||window.innerWidth||360)-20);
      const fit=Math.min(2.2,Math.max(.3,available/base.width));
      const cssScale=fit*state.zoom;
      const pixelRatio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
      const viewport=page.getViewport({scale:cssScale*pixelRatio});
      const canvas=document.createElement('canvas');
      canvas.className='df-mobile-pdf-canvas';
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      canvas.style.width=`${Math.ceil(viewport.width/pixelRatio)}px`;
      canvas.style.height=`${Math.ceil(viewport.height/pixelRatio)}px`;
      stage.replaceChildren(canvas);
      const context=canvas.getContext('2d',{alpha:false});
      state.renderTask=page.render({canvasContext:context,viewport,background:'rgb(255,255,255)'});
      await state.renderTask.promise;
      if(active!==state||runId!==state.runId)return;
      updateControls(state);
      status(state,`${state.pdf.numPages}페이지 · 손가락으로 위아래 이동할 수 있습니다.`);
    }catch(error){
      if(error?.name==='RenderingCancelledException'||active!==state)return;
      throw error;
    }
  }
  function bindControls(state){
    const q=selector=>state.body.querySelector(selector);
    q('[data-pdf-prev]').onclick=()=>{if(state.pageNo>1){state.pageNo--;state.zoom=1;renderPage(state).catch(error=>showFailure(state,error))}};
    q('[data-pdf-next]').onclick=()=>{if(state.pageNo<state.pdf.numPages){state.pageNo++;state.zoom=1;renderPage(state).catch(error=>showFailure(state,error))}};
    q('[data-pdf-zoom-out]').onclick=()=>{state.zoom=Math.max(.65,state.zoom-.2);renderPage(state).catch(error=>showFailure(state,error))};
    q('[data-pdf-fit]').onclick=()=>{state.zoom=1;renderPage(state).catch(error=>showFailure(state,error))};
    q('[data-pdf-zoom-in]').onclick=()=>{state.zoom=Math.min(2.6,state.zoom+.2);renderPage(state).catch(error=>showFailure(state,error))};
  }
  function showFailure(state,error){
    if(active!==state)return;
    const stage=state.body.querySelector('[data-pdf-stage]');
    if(stage)stage.innerHTML='<div class="company-file-preview-unsupported"><b>모바일 PDF 미리보기를 준비하지 못했습니다.</b><br>위의 [새 창 열기]를 눌러 확인해주세요.</div>';
    status(state,'PDF 표시 실패 · 새 창 열기를 이용해주세요.',true);
    window.DF_DIAG?.warn('MOBILE-PDF-PREVIEW','PDF 직접 미리보기 실패',error?.message||String(error));
  }
  async function canvasPreview(d){
    cancelActive();
    let modalShown=false;
    let state=null;
    try{
      const url=await window.dfV71SignedCompanyDocUrl(d);
      const modal=document.getElementById('companyFilePreviewModal');
      const body=document.getElementById('companyFilePreviewBody');
      if(!modal||!body)throw Error('미리보기 화면을 찾지 못했습니다.');
      document.getElementById('companyFilePreviewTitle').textContent=d.file_name||'파일 미리보기';
      document.getElementById('companyFilePreviewMeta').textContent=`${d.doc_type||'기타'} · ${Math.max(1,Math.round(Number(d.file_size||0)/1024)).toLocaleString()} KB`;
      document.getElementById('companyFileOpenNew').href=url;
      body.classList.add('df-pdfjs-active');
      body.innerHTML=layout();
      modal.hidden=false;
      modalShown=true;
      state={body,url,pdf:null,loadingTask:null,renderTask:null,pageNo:1,zoom:1,runId:0};
      active=state;
      const pdfjs=await loadPdfModule();
      if(active!==state)return;
      state.loadingTask=pdfjs.getDocument({url});
      state.pdf=await state.loadingTask.promise;
      if(active!==state){try{state.pdf.destroy()}catch(_){ }return}
      bindControls(state);
      updateControls(state);
      await renderPage(state);
      window.DF_DIAG?.info('MOBILE-PDF-PREVIEW','모바일 PDF 직접 미리보기 완료',`${d.file_name||'PDF'} · ${state.pdf.numPages}페이지`);
    }catch(error){
      if(state&&active!==state)return;
      if(modalShown&&active)showFailure(active,error);
      else alert('파일 열람 실패\n'+(error?.message||error));
    }
  }

  if(typeof originalPreview==='function'){
    window.dfV71PreviewCompanyDocument=function(d){
      if(isPdf(d)&&needsCanvasPreview())return canvasPreview(d);
      cancelActive();
      return originalPreview.apply(this,arguments);
    };
  }
  if(typeof originalClose==='function'){
    window.dfV71CloseCompanyFilePreview=function(){
      cancelActive();
      return originalClose.apply(this,arguments);
    };
  }
  window.addEventListener('orientationchange',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{if(active){active.zoom=1;renderPage(active).catch(error=>showFailure(active,error))}},180);
  });

  window.DF_MOBILE_PDF_PREVIEW={version:VERSION,needsCanvasPreview,close:cancelActive};
  function applyVersion(){
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · MOBILE PDF PREVIEW`;
    if(foot)foot.textContent=VERSION;
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',applyVersion,{once:true}):applyVersion();
})();
