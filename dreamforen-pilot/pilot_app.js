/* Pilot UI only — does not replace business handlers or add server mutations. */
(function(window,document){'use strict';
 const app=window.DF_PILOT;if(!app)return;
 let promptEvent=null,registration=null,edited=false,updating=false,reloadApproved=false;
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
 const pending=()=>window.DF_COMPANY_STORAGE?.pending?.().filter(j=>!j.receiptReviewOnly).length||0;
 const icon='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
 const dialog=document.createElement('dialog');dialog.id='dfPilotDialog';
 dialog.innerHTML=`<div class="pilot-sheet"><header><span class="pilot-eyebrow">DREAMFOREN · PILOT 01</span><button type="button" data-pilot-close aria-label="앱 안내 닫기">✕</button></header>
 <div class="pilot-identity"><img src="pilot-icons/icon-192.png" alt="드림포이엔"><div><h2>드림포이엔 시험앱</h2><p>내 휴대폰에서 먼저 확인하는 업무 앱</p></div></div>
 <div class="pilot-state"><span data-pilot-network></span><span data-pilot-mode></span><span data-pilot-pending></span></div>
 <section><h3>홈 화면에 설치하기</h3><p data-pilot-instructions></p><button type="button" class="pilot-primary" data-pilot-install hidden>휴대폰에 앱 설치</button></section>
 <section class="pilot-scope-note"><h3>업무 자료는 그대로 이어집니다.</h3><p>기존 계정으로 로그인하세요. 이 앱에서 저장한 업무 자료는 같은 서버를 사용하는 PC와 모바일 웹에도 반영됩니다.</p><p>앱의 로그인과 임시저장 공간은 별도로 보관합니다.</p></section>
 <section><div class="pilot-section-title"><h3>앱 업데이트</h3><small>v${app.version}</small></div><p data-pilot-update-status>열어 둔 화면을 자동으로 다시 시작하지 않습니다.</p>
 <div class="pilot-actions"><button type="button" data-pilot-check>업데이트 확인</button><button type="button" data-pilot-apply hidden>저장 확인 후 적용</button></div></section>
 <p class="pilot-message" data-pilot-message role="status" aria-live="polite"></p></div>`;
 document.body.appendChild(dialog);
 const q=s=>dialog.querySelector(s),message=s=>{q('[data-pilot-message]').textContent=s;};
 function sync(){
  q('[data-pilot-network]').textContent=navigator.onLine?'● 온라인':'○ 오프라인';
  q('[data-pilot-mode]').textContent=standalone()?'앱으로 실행 중':'브라우저로 실행 중';
  q('[data-pilot-pending]').textContent='미전송 '+pending()+'건';
  q('[data-pilot-instructions]').textContent=standalone()?'홈 화면에서 설치한 앱으로 실행하고 있습니다.':/iPad|iPhone|iPod/.test(navigator.userAgent)?
   '아이폰에서는 Safari로 이 주소를 열고, 공유 버튼 → 홈 화면에 추가 → 추가를 선택해 주세요.':
   '갤럭시에서는 Chrome으로 이 주소를 열고, 오른쪽 위 ⋮ 메뉴 → 홈 화면에 추가 또는 앱 설치를 선택해 주세요.';
  q('[data-pilot-install]').hidden=standalone()||!promptEvent;
  const waiting=registration?.waiting;q('[data-pilot-apply]').hidden=!waiting;
  if(waiting)q('[data-pilot-update-status]').textContent='새 버전이 준비되었습니다. 작성 내용을 저장한 뒤 적용해 주세요.';
 }
 function open(){sync();message('');if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}else dialog.setAttribute('open','');}
 function close(){typeof dialog.close==='function'?dialog.close():dialog.removeAttribute('open');}
 q('[data-pilot-close]').onclick=close;
 dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
 function addButton(parent,cls){if(!parent||parent.querySelector('.'+cls))return;const b=document.createElement('button');b.type='button';b.className=cls;b.innerHTML=icon+'<span>앱 안내</span>';b.onclick=e=>{e.stopPropagation();open();};parent.appendChild(b);}
 function mount(){
  addButton(document.getElementById('dfMobileNavBar'),'pilot-nav-button');
  const auth=document.querySelector('.df-auth-logo');if(auth&&!document.getElementById('dfPilotLoginRow')){
   const row=document.createElement('div');row.id='dfPilotLoginRow';row.innerHTML='<span class="pilot-label">개인 시험용</span>';addButton(row,'pilot-login-button');auth.insertAdjacentElement('afterend',row);
  }
  const sidebar=document.querySelector('.df-sidebar-brand');addButton(sidebar,'pilot-desktop-button');
 }
 mount();new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('input',e=>{if(!dialog.contains(e.target))edited=true;},true);
 document.addEventListener('change',e=>{if(!dialog.contains(e.target))edited=true;},true);
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;sync();});
 window.addEventListener('appinstalled',()=>{promptEvent=null;sync();message('앱을 설치했습니다. 홈 화면의 드림포이엔 시험 아이콘으로 열어 주세요.');});
 q('[data-pilot-install]').onclick=async()=>{const event=promptEvent;if(!event)return;promptEvent=null;await event.prompt();await event.userChoice;sync();};
 async function register(){
  if(!window.isSecureContext||!('serviceWorker' in navigator)){q('[data-pilot-update-status]').textContent='앱 설치는 HTTPS 주소에서 지원하는 브라우저로 열어 주세요.';return;}
  try{
   registration=await navigator.serviceWorker.register(new URL('pilot_sw.js',app.root),{scope:new URL(app.root).pathname,updateViaCache:'none'});
   registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',sync);});sync();
  }catch(_){q('[data-pilot-update-status]').textContent='설치 준비를 마치지 못했습니다. 연결을 확인한 뒤 업데이트 확인을 눌러 주세요.';}
 }
 q('[data-pilot-check]').onclick=async()=>{
  if(updating)return;updating=true;message('새 버전을 확인하고 있습니다.');
  try{if(!navigator.onLine)throw Error('인터넷에 연결한 뒤 다시 확인해 주세요.');if(!registration)await register();await registration?.update();sync();if(!registration?.waiting)message('업데이트를 확인했습니다. 새 버전이 준비되면 적용 버튼이 표시됩니다.');else message('새 버전이 준비되었습니다.');}
  catch(error){message(error.message);}finally{updating=false;}
 };
 q('[data-pilot-apply]').onclick=async()=>{
  if(!registration?.waiting||updating)return;
  if(pending()){message('미전송 자료가 있습니다. 온라인 저장과 전송 완료를 확인한 뒤 적용해 주세요.');return;}
  if(edited&&!window.confirm('이 화면에서 입력한 내용이 있습니다.\n필요한 내용의 저장이 완료되었나요?\n확인하면 이 시험앱 화면만 새 버전으로 다시 엽니다.'))return;
  updating=true;
  try{const storage=window.DF_COMPANY_STORAGE;if(storage?.status?.().active)await storage.flush();if(pending())throw Error('미전송 자료를 먼저 확인해 주세요.');reloadApproved=true;registration.waiting.postMessage({type:'PILOT_ACTIVATE'});message('저장을 확인했습니다. 이 앱의 새 버전을 적용하고 있습니다.');}
  catch(error){updating=false;message(error.message);}
 };
 navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(reloadApproved){reloadApproved=false;window.location.reload();}});
 window.addEventListener('online',sync);window.addEventListener('offline',sync);window.addEventListener('df:storage-state',sync);
 // Only check for software updates on resume. Never reload or send business records here.
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)registration?.update().catch(()=>{});});
 register();sync();
 window.DF_PILOT_UI=Object.freeze({open,version:app.version});
})(window,document);
