/* DREAMFOREN v120.37.9 · PC/MOBILE PREVIEW & RESOURCE STABILITY */
(function(){
  'use strict';
  if(window.__DF_V120379_SAFE_OPEN__)return;
  window.__DF_V120379_SAFE_OPEN__=true;

  const VERSION='v120.37.9';
  const nativeOpen=window.open.bind(window);
  let activeState=null;

  function stripPopupFlags(features){
    return String(features||'').split(',').map(x=>x.trim()).filter(x=>x&&!/^no(?:opener|referrer)(?:=|$)/i.test(x)).join(',');
  }
  function titleFromHtml(html){
    const m=String(html||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if(!m)return '문서 미리보기';
    const box=document.createElement('textarea');box.innerHTML=m[1].replace(/<[^>]*>/g,'');
    return box.value.trim()||'문서 미리보기';
  }
  function ensureModal(){
    let root=document.getElementById('dfSafePreviewBackdrop');
    if(!root){
      root=document.createElement('div');
      root.id='dfSafePreviewBackdrop';
      root.hidden=true;
      root.innerHTML='<section id="dfSafePreviewCard" role="dialog" aria-modal="true" aria-labelledby="dfSafePreviewTitle"><header><div><strong id="dfSafePreviewTitle">문서 미리보기</strong><small id="dfSafePreviewStatus">브라우저가 새 창을 막아 현재 화면에서 열었습니다.</small></div><nav><button type="button" id="dfSafePreviewNew">새 창</button><button type="button" id="dfSafePreviewPrint">인쇄 / PDF</button><button type="button" id="dfSafePreviewClose" aria-label="미리보기 닫기">닫기</button></nav></header><iframe id="dfSafePreviewFrame" title="문서 미리보기"></iframe></section>';
      document.body.appendChild(root);
      root.addEventListener('click',e=>{if(e.target===root)closeActive()});
      document.getElementById('dfSafePreviewClose').onclick=closeActive;
      document.getElementById('dfSafePreviewNew').onclick=openActiveInNewWindow;
      document.getElementById('dfSafePreviewPrint').onclick=printActive;
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)closeActive()});
    }
    return root;
  }
  function showState(state){
    const root=ensureModal();
    activeState=state;state.root=root;state.frame=root.querySelector('#dfSafePreviewFrame');
    root.querySelector('#dfSafePreviewTitle').textContent=state.title||'문서 미리보기';
    root.querySelector('#dfSafePreviewStatus').textContent='브라우저가 새 창을 막아 현재 화면에서 열었습니다.';
    root.hidden=false;document.body.classList.add('df-safe-preview-open');
    requestAnimationFrame(()=>root.querySelector('#dfSafePreviewClose')?.focus());
  }
  function renderHtml(state){
    if(state.closed)return;
    showState(state);state.title=titleFromHtml(state.html);
    state.root.querySelector('#dfSafePreviewTitle').textContent=state.title;
    state.root.querySelector('#dfSafePreviewPrint').hidden=false;
    state.frame.removeAttribute('src');state.frame.srcdoc=state.html;
  }
  function renderUrl(state,url){
    if(state.closed)return;
    state.url=String(url||'');showState(state);
    state.root.querySelector('#dfSafePreviewPrint').hidden=true;
    state.frame.removeAttribute('srcdoc');state.frame.referrerPolicy='no-referrer';state.frame.src=state.url;
  }
  function closeState(state){
    if(!state||state.closed)return;
    state.closed=true;
    if(activeState===state){
      if(state.root){state.root.hidden=true;const frame=state.root.querySelector('#dfSafePreviewFrame');frame.removeAttribute('src');frame.removeAttribute('srcdoc')}
      activeState=null;
      document.body.classList.remove('df-safe-preview-open');
    }
  }
  function closeActive(){closeState(activeState)}
  function printActive(){
    const state=activeState;if(!state||state.closed)return;
    try{state.frame.contentWindow.focus();state.frame.contentWindow.print()}
    catch(e){alert('이 파일은 내부 화면에서 바로 인쇄할 수 없습니다. “새 창”을 눌러 파일의 인쇄 버튼을 이용해주세요.')}
  }
  function openActiveInNewWindow(){
    const state=activeState;if(!state||state.closed)return;
    let popup=null;
    try{popup=nativeOpen('about:blank','_blank','') }catch(_){popup=null}
    if(!popup)return alert('새 창이 차단되었습니다. 주소창의 팝업 허용을 켠 뒤 다시 눌러주세요.');
    try{popup.opener=null}catch(_){}
    if(state.url){try{popup.location.replace(state.url)}catch(_){popup.location.href=state.url}}
    else{popup.document.open();popup.document.write(state.html||'');popup.document.close()}
    closeState(state);
  }
  function fallbackWindow(initialUrl){
    const state={title:'문서 미리보기',html:'',url:'',closed:false,root:null,frame:null};
    const doc={
      open(){state.html='';state.url='';return doc},
      write(...parts){state.html+=parts.join('')},
      close(){if(state.html)renderHtml(state)}
    };
    const locationApi={
      replace:url=>renderUrl(state,url),
      assign:url=>renderUrl(state,url)
    };
    Object.defineProperty(locationApi,'href',{get:()=>state.url||'about:blank',set:url=>renderUrl(state,url)});
    const api={
      document:doc,
      location:locationApi,
      focus(){state.root?.querySelector('#dfSafePreviewClose')?.focus()},
      print(){if(activeState!==state)showState(state);printActive()},
      close(){closeState(state)}
    };
    Object.defineProperty(api,'closed',{get:()=>state.closed});
    if(initialUrl&&initialUrl!=='about:blank')renderUrl(state,initialUrl);else showState(state);
    return api;
  }
  function safeOpen(url='',target='_blank',features=''){
    let popup=null;
    try{
      popup=nativeOpen('about:blank',target||'_blank',stripPopupFlags(features));
      if(popup&&!popup.closed){
        try{popup.opener=null}catch(_){}
        if(url&&url!=='about:blank')try{popup.location.replace(String(url))}catch(_){popup.location.href=String(url)}
        return popup;
      }
    }catch(e){window.DF_DIAG?.warn('PREVIEW','새 창 열기 실패 · 내부 미리보기 사용',e?.message||String(e))}
    window.DF_DIAG?.warn('PREVIEW','팝업 차단 감지 · 내부 미리보기로 전환',String(url||'about:blank'));
    return fallbackWindow(url);
  }

  window.open=safeOpen;
  window.DF_PREVIEW={version:VERSION,nativeOpen,open:safeOpen,close:closeActive};

  function applyVersion(){
    const side=document.getElementById('dfBuildVersionStatic'),foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · PC/MOBILE STABILITY`;
    if(foot)foot.textContent=VERSION;
    window.DF_DIAG?.info('SYSTEM','v120.37.9 PC·모바일 미리보기 및 누락 리소스 안정화 적용');
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',applyVersion,{once:true}):applyVersion();
})();
