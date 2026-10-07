/* Beta 3.21 — company bid monitoring UI. Server keys never enter this file. */
(function(){
  'use strict';
  const M=window.DFBidModel,esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const $=id=>document.getElementById(id),money=v=>v==null?'미정':Math.round(Number(v)).toLocaleString('ko-KR')+'원';
  let actor='',generation=0,tab='records',page=1,total=0,rows=[],events=[],config=null,inflight=null,initial=true,seen=new Set(),noticesLoading=false,noticesAgain=false,lastStatus=null;
  function user(){try{return dfCloudUser?.id||'';}catch(_){return '';}}
  function client(){try{return dfSupabase;}catch(_){return null;}}
  function admin(){try{return dfCloudProfile?.role==='admin'&&dfCloudProfile?.active===true;}catch(_){return false;}}
  function can(){try{return typeof dfMenuCan==='function'?dfMenuCan('bid','view',admin()):admin();}catch(_){return false;}}
  function message(text){if($('dfBidWatchMessage'))$('dfBidWatchMessage').textContent=text;}
  async function rpc(name,args={}){const r=await client().rpc(name,args);if(r.error)throw r.error;return r.data;}
  function organizeModal(modal){
    const form=modal.querySelector('.df-bid-form');if(!form||form.querySelector('fieldset'))return;
    const groups=[['기본정보',['bidTitle','bidAgency','bidDeadline','bidStatus']],['금액·산정조건',['bidEstimate','bidBase','bidVat','bidRate','bidRange','bidCount']],['투찰·결과',['bidOurs','bidWinner','bidMemo']]];
    const anchor=form.querySelector('#bidRecommend');groups.forEach(([title,ids])=>{const f=document.createElement('fieldset'),legend=document.createElement('legend'),grid=document.createElement('div');legend.textContent=title;grid.className='df-bid-form-grid';f.append(legend,grid);form.insertBefore(f,anchor);ids.forEach(id=>{const label=modal.querySelector('#'+id)?.closest('label');if(label)grid.append(label);});});
    modal.querySelector('#bidDeadline')?.setAttribute('aria-label','입찰마감시간 (한국시간)');
    const small=modal.querySelector('.company-modal-head small');if(small)small.textContent='금액: 원 단위 · 마감시간: 한국시간';
  }
  function setTab(next){
    tab=next;document.querySelectorAll('[data-bid-tab]').forEach(b=>{const active=b.dataset.bidTab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    document.querySelectorAll('.df-bid-panel').forEach(p=>p.hidden=p.dataset.bidPanel!==tab);$('dfBidNew').hidden=tab!=='records';
    if(tab==='notices'){loadNotices();refresh();}if(tab==='settings')loadSettings();
  }
  function reset(){generation++;actor=user();rows=[];events=[];config=null;lastStatus=null;page=1;initial=true;seen=new Set();inflight=null;$('dfBidUnread')&&( $('dfBidUnread').hidden=true );$('dfBidNavUnread')?.remove();if($('dfBidNoticeList'))$('dfBidNoticeList').innerHTML='';if($('dfBidNotifications'))$('dfBidNotifications').innerHTML='';if($('dfBidWatchSettings'))$('dfBidWatchSettings').innerHTML='';const modal=$('dfBidNoticeModal');if(modal){modal.hidden=true;modal.style.display='none';}}
  function badge(count){
    const b=$('dfBidUnread');if(b){b.textContent=count;b.hidden=!count;}
    const nav=$('dfBidNav');if(nav){let n=$('dfBidNavUnread');if(!n){n=document.createElement('span');n.id='dfBidNavUnread';n.className='df-bid-pill';nav.append(n);}n.textContent=count;n.hidden=!count;n.setAttribute('aria-label','읽지 않은 입찰 알림 '+count+'건');}
  }
  function status(s){
    lastStatus=s;
    const box=$('dfBidWatchStatus');if(!box)return;
    const running=s.enabled&&s.schedule_active&&s.source_connected;
    const label=!s.enabled?'자동 확인 꺼짐':!s.source_connected?'공고 API 연결 필요':!s.schedule_active?'예약 실행 연결 필요':s.status==='error'?'최근 확인 오류':s.status==='running'?'공고 확인 중':'매시간 자동 확인';
    box.dataset.tone=s.status==='error'?'error':running?'ok':'';
    const ai=s.ai_status==='ok'?'AI 요약 연결됨':s.ai_status==='disabled'?'AI 요약 꺼짐':s.ai_status==='error'?'AI 요약 재확인 필요':'AI 연결 필요';
    box.innerHTML=`<div><strong>${esc(label)}</strong><span> · ${esc(ai)}</span><small> · 최근 성공 ${esc(s.last_success?M.formatKst(s.last_success):'없음')}</small>${s.last_error?'<span> · '+esc(s.last_error)+'</span>':''}</div><button class="company-btn secondary" id="dfBidWatchScan" ${admin()?'':'hidden'}>지금 확인</button>`;
    $('dfBidWatchScan')?.addEventListener('click',scan);
  }
  function renderInbox(data){
    events=data.events||[];badge(Number(data.unread||0));
    $('dfBidNotifications').innerHTML=events.map(x=>`<div class="df-bid-notification ${x.read?'':'unread'}"><div><span>${esc(({new:'새 공고',changed:'변경 공고',cancelled:'취소 공고',deadline:'마감 임박'}[x.event_type]||'입찰 알림')+' · '+x.title)}</span><small>${esc(x.message)} · ${esc(M.formatKst(x.created_at))}</small></div><button data-bid-event="${esc(x.id)}">${x.read?'열기':'확인'}</button></div>`).join('')||'<div class="df-bid-watch-help" style="padding:10px">새 공고·변경·마감 알림이 여기에 쌓입니다.</div>';
    const fresh=events.filter(x=>!x.read&&!seen.has(x.id));events.forEach(x=>seen.add(x.id));
    if(!initial&&fresh.length&&window.Notification?.permission==='granted')new Notification('드림포이엔 입찰 알림',{body:fresh.slice(0,3).map(x=>x.title).join('\n'),tag:'df-bid-watch-'+actor});
    initial=false;
  }
  async function refresh(){
    if(!user()||!client()||!can()||!$('dfBidWatchStatus'))return;
    if(user()!==actor)reset();if(inflight)return inflight;
    const g=generation,uid=actor;
    const task=(async()=>{try{const [s,data]=await Promise.all([rpc('df_bid_watch_status'),rpc('df_bid_watch_inbox',{p_limit:50})]);if(g!==generation||uid!==user())return;status(s);renderInbox(data);if($('dfBidWatchMessage').textContent==='입찰현황은 기존 기능으로 계속 이용할 수 있습니다.')message('');}catch(e){if(g===generation){$('dfBidWatchStatus').textContent=['PGRST202','42883'].includes(e.code)?'알림 연결 전 · 배포자료의 62번 SQL과 서버 기능을 적용해주세요.':'알림 조회에 실패했습니다. 연결 상태와 입찰 조회 권한을 확인해주세요.';message('입찰현황은 기존 기능으로 계속 이용할 수 있습니다.');}}})();
    inflight=task;try{await task;}finally{if(inflight===task)inflight=null;}
  }
  async function loadNotices(){
    if(!can())return;if(noticesLoading){noticesAgain=true;return;}const uid=user(),g=generation;noticesLoading=true;
    try{const data=await rpc('df_bid_watch_notices',{p_search:$('dfBidNoticeSearch').value,p_state:$('dfBidNoticeState').value,p_page:page,p_size:25});if(g!==generation||uid!==user())return;rows=data.rows||[];total=Number(data.total||0);renderNotices();}catch(_){$('dfBidNoticeList').innerHTML='<div class="df-bid-watch-help">맞춤공고 연결 후 검색 결과가 표시됩니다.</div>';}finally{noticesLoading=false;if(noticesAgain){noticesAgain=false;loadNotices();}}
  }
  function renderNotices(){
    $('dfBidNoticeList').innerHTML=`<div class="df-bid-table-wrap"><table class="df-bid-table"><caption>맞춤공고 ${total}건 · 한국시간 기준</caption><colgroup><col style="width:77px"><col><col style="width:135px"><col style="width:127px"><col style="width:110px"><col style="width:125px"><col style="width:75px"></colgroup><thead><tr><th>상태</th><th>공고명</th><th>발주기관</th><th>입찰마감</th><th>추정가격</th><th>참가 가능 지역</th><th>요약</th></tr></thead><tbody>${rows.map(x=>`<tr><td><span class="df-bid-public-state ${x.cancelled?'lost':'open'}">${x.cancelled?'취소':x.deadline&&Date.parse(x.deadline)<=Date.now()?'마감':'공고'}</span></td><td class="bid-title"><button class="df-bid-title-button" data-bid-notice="${esc(x.id)}">${esc(x.title)}</button></td><td>${esc(x.agency)}</td><td class="bid-date">${esc(M.formatKst(x.deadline))}</td><td class="bid-amount">${money(x.estimated_price)}</td><td>${esc((x.regions||[]).join(', ')||'원문 확인')}</td><td><button class="df-bid-title-button" data-bid-notice="${esc(x.id)}">${x.ai_status==='ok'?(x.ai_summary?.relevance===false?'관련도 낮음':'AI 요약'):'공고정보'}</button></td></tr>`).join('')||'<tr><td colspan="7" class="df-bid-empty">조건에 맞는 맞춤공고가 없습니다.</td></tr>'}</tbody></table></div>`;
    $('dfBidNoticePage').textContent=`${page} / ${Math.max(1,Math.ceil(total/25))} 페이지`;$('dfBidNoticePrev').disabled=page<=1;$('dfBidNoticeNext').disabled=page*25>=total;
  }
  async function openNotice(id){
    let n=rows.find(x=>x.id===id);if(!n){try{const r=await client().from('bid_watch_notices').select('*').eq('id',id).maybeSingle();n=r.data;}catch(_){} }
    if(!n)return message('현재 공고를 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');
    let modal=$('dfBidNoticeModal');if(!modal){modal=document.createElement('div');modal.id='dfBidNoticeModal';modal.className='company-modal-backdrop';document.body.append(modal);}
    modal.hidden=false;modal.style.display='flex';const ai=n.ai_status==='ok'&&M.validSummary(n.ai_summary)?n.ai_summary:null,url=M.safeUrl(n.detail_url);
    modal.innerHTML=`<div class="company-modal" role="dialog" aria-modal="true" aria-labelledby="dfBidNoticeTitle"><div class="company-modal-head"><h2 id="dfBidNoticeTitle">${esc(n.title)}</h2><button class="company-modal-close" aria-label="닫기">×</button></div><div class="df-bid-notice-body"><dl><dt>발주기관</dt><dd>${esc(n.agency)}</dd><dt>공고번호</dt><dd>${esc(n.notice_no)} · ${esc(n.revision)}차</dd><dt>마감일시</dt><dd>${esc(M.formatKst(n.deadline))}</dd><dt>추정가격</dt><dd>${money(n.estimated_price)}</dd><dt>참가 가능 지역</dt><dd>${esc((n.regions||[]).join(', ')||'공고 원문 확인')}</dd><dt>면허·업종</dt><dd>${esc((n.licenses||[]).join(', ')||'공고 원문 확인')}</dd></dl><div class="df-bid-ai-summary"><h3>${ai?'AI 공고 요약 · 관련도 '+ai.score+'점':'공고정보 · AI 요약 대기'}</h3><p>${esc(ai?.summary||'맞춤 검색어에 해당하는 공고입니다. AI 연결 후 요약이 반영됩니다.')}</p>${ai?'<p>'+esc(ai.reason)+'</p><ul>'+ai.checkpoints.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p>'+esc(ai.eligibility_note)+'</p>':''}<small>공고정보와 면허·지역 목록을 기준으로 정리했습니다. 첨부 문서의 세부조건은 원문에서 확인해주세요.</small></div>${url?'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">나라장터 공고 원문 열기 ↗</a></p>':''}<div class="df-bid-settings-actions"><button class="company-btn primary" id="dfBidNoticeRegister">이 공고로 입찰 추가</button><button class="company-btn secondary" data-notice-close>닫기</button></div></div></div>`;
    const close=()=>{modal.hidden=true;modal.style.display='none';};modal.querySelector('.company-modal-close').onclick=close;modal.querySelector('[data-notice-close]').onclick=close;
    $('dfBidNoticeRegister').onclick=()=>{if(n.cancelled)return alert('취소된 공고입니다. 원문을 확인해주세요.');close();window.dfBidOpen?.({title:n.title,agency:n.agency,deadline:n.deadline,estimated_price:n.estimated_price,base_amount:n.base_amount,lower_rate:n.lower_rate,memo:[url,ai?.summary].filter(Boolean).join('\n')});};
  }
  async function scan(){
    if(!admin())return;const b=$('dfBidWatchScan');b.disabled=true;b.textContent='확인 중…';message('서버에서 공고와 AI 요약을 확인합니다.');
    try{const r=await client().functions.invoke('bid-watch',{body:{action:'scan'}});if(r.error)throw r.error;message(r.data?.message||'확인이 완료되었습니다.');await refresh();if(tab==='notices')await loadNotices();}catch(_){message('서버 연결 상태와 인증키를 확인해주세요. 알림설정에 연결 순서가 안내되어 있습니다.');}finally{if(b.isConnected){b.disabled=false;b.textContent='지금 확인';}}
  }
  async function loadSettings(){
    const box=$('dfBidWatchSettings');if(!admin()){box.innerHTML='<p class="df-bid-watch-help">자동 확인 조건은 관리자가 설정합니다.</p>';return;}
    if(config){renderSettings();return;}box.textContent='설정을 불러오는 중입니다.';const uid=user(),g=generation;
    try{const r=await client().from('bid_watch_settings').select('*').eq('id',1).single();if(r.error)throw r.error;if(g!==generation||uid!==user())return;config=r.data;renderSettings();}catch(_){box.innerHTML='<p class="df-bid-watch-help">62번 SQL 적용 후 검색어·지역·알림 설정을 저장할 수 있습니다.</p>';}
  }
  function renderSettings(){
    const s=config,field=(id,label,value,wide=false)=>`<label class="${wide?'wide':''}">${label}<input id="${id}" value="${esc(value)}"></label>`,check=(id,label,on)=>`<label class="df-bid-check"><input type="checkbox" id="${id}" ${on?'checked':''}>${label}</label>`;
    $('dfBidWatchSettings').innerHTML=`<form id="dfBidSettingsForm" class="df-bid-settings"><fieldset><legend>자동 확인</legend><div class="df-bid-settings-grid">${check('bwEnabled','매시간 맞춤공고 확인',s.enabled)}${check('bwAI','AI 관련도·요약 사용',s.ai_enabled)}${field('bwKeywords','포함 검색어 (쉼표로 구분)',s.keywords.join(', '),true)}${field('bwExclude','제외 검색어 (쉼표로 구분)',s.excluded_keywords.join(', '),true)}${field('bwRegions','참가 가능 지역 (비우면 전국)',s.regions.join(', '),true)}${field('bwMin','최소 추정가격 (원)',s.min_amount??'')}${field('bwMax','최대 추정가격 (원)',s.max_amount??'')}<label class="wide">회사 업무·보유 자격 (AI 요약에 참고)<textarea id="bwCompany" rows="3">${esc(s.company_profile)}</textarea></label></div></fieldset><fieldset><legend>알림</legend><div class="df-bid-settings-grid">${check('bwNew','새 공고 알림',s.notify_new)}${check('bwChange','변경·취소 알림',s.notify_changed)}${check('bwDue','24시간 이내 마감 알림',s.notify_deadline)}${check('bwEmail','이메일도 함께 받기',s.email_enabled)}${field('bwRecipients','수신 이메일 (쉼표로 구분)',s.email_to.join(', '),true)}</div><p class="df-bid-watch-help">웹 알림은 이 메뉴에 누적됩니다. 이메일은 발송 서비스 연결 후 웹을 닫아도 받을 수 있습니다.</p></fieldset><div class="df-bid-settings-actions"><button type="submit" class="company-btn primary" id="dfBidSettingsSave">설정 저장</button><button type="button" class="company-btn secondary" id="dfBidBrowserNotify">브라우저 알림 켜기</button></div><p class="df-bid-watch-help">처음 연결: 62번 SQL → 서버 함수·인증키 등록 → 예약 실행 SQL → 자동 확인 켜기. 검색어를 벗어난 공고와 민간 입찰은 수집 범위에 포함되지 않습니다.</p></form>`;
    ['bwMin','bwMax'].forEach(id=>{ $(id).type='number';$(id).min='0'; });
    $('dfBidSettingsForm').onsubmit=async e=>{e.preventDefault();const split=id=>[...new Set($(id).value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean))],amount=id=>$(id).value.trim()===''?null:Number($(id).value);const next={enabled:$('bwEnabled').checked,ai_enabled:$('bwAI').checked,keywords:split('bwKeywords'),excluded_keywords:split('bwExclude'),regions:split('bwRegions'),company_profile:$('bwCompany').value.trim(),min_amount:amount('bwMin'),max_amount:amount('bwMax'),notify_new:$('bwNew').checked,notify_changed:$('bwChange').checked,notify_deadline:$('bwDue').checked,email_enabled:$('bwEmail').checked,email_to:split('bwRecipients')};
      if(!next.keywords.length)return message('포함 검색어를 하나 이상 입력해주세요.');if(next.min_amount!=null&&next.max_amount!=null&&next.min_amount>next.max_amount)return message('최소 금액은 최대 금액보다 작아야 합니다.');if(next.email_enabled&&!next.email_to.length)return message('수신 이메일을 입력해주세요.');
      $('dfBidSettingsSave').disabled=true;try{config=await rpc('df_bid_watch_save',{p_config:next});message('검색 조건과 알림 설정을 저장했습니다.');await refresh();}catch(_){message('설정 저장에 실패했습니다. 검색어 수·이메일 형식·관리자 권한을 확인해주세요.');}finally{$('dfBidSettingsSave').disabled=false;}
    };
    $('dfBidBrowserNotify').onclick=async()=>{if(!window.Notification)return message('이 브라우저는 알림을 지원하지 않습니다.');const p=await Notification.requestPermission();message(p==='granted'?'브라우저 알림을 켰습니다. 웹이 열려 있을 때 새 알림을 표시합니다.':'브라우저 알림 허용 상태를 확인해주세요.');};
  }
  function init(){
    const root=document.querySelector('#dfViewBid .df-bid-page');if(!root||$('dfBidTabs'))return;actor=user();
    const tabs=document.createElement('div');tabs.id='dfBidTabs';tabs.className='df-bid-tabs';tabs.setAttribute('role','tablist');tabs.innerHTML=[['records','입찰현황'],['notices','AI 맞춤공고'],['settings','알림설정']].map(([id,label])=>`<button type="button" role="tab" id="dfBidTab-${id}" aria-controls="dfBidPanel-${id}" data-bid-tab="${id}">${label}${id==='notices'?'<span id="dfBidUnread" class="df-bid-pill" hidden></span>':''}</button>`).join('');root.querySelector('.df-bid-head').after(tabs);
    const records=document.createElement('div');records.className='df-bid-panel';records.id='dfBidPanel-records';records.dataset.bidPanel='records';records.setAttribute('role','tabpanel');records.setAttribute('aria-labelledby','dfBidTab-records');[...root.children].filter(x=>x.matches('.df-bid-summary,.df-bid-toolbar,.df-bid-list')).forEach(x=>records.append(x));root.append(records);
    root.insertAdjacentHTML('beforeend',`<div class="df-bid-panel" id="dfBidPanel-notices" data-bid-panel="notices" role="tabpanel" aria-labelledby="dfBidTab-notices" hidden><div class="df-bid-watch-status" id="dfBidWatchStatus">공고·AI 연결 상태 확인 전</div><p class="df-bid-inline-message" id="dfBidWatchMessage" role="status"></p><div class="df-bid-toolbar"><input id="dfBidNoticeSearch" type="search" placeholder="맞춤공고명 · 기관 검색"><select id="dfBidNoticeState"><option value="open">진행 공고</option><option value="all">전체 공고</option><option value="closed">마감 공고</option><option value="cancelled">취소 공고</option></select><button class="company-btn secondary" id="dfBidNoticeRefresh">새로고침</button></div><div id="dfBidNoticeList"></div><div class="df-bid-pagination"><button id="dfBidNoticePrev">이전</button><span id="dfBidNoticePage">1 / 1 페이지</span><button id="dfBidNoticeNext">다음</button></div><div class="df-bid-inbox"><div class="df-bid-inbox-head"><h2>최근 알림</h2><button class="company-btn secondary" id="dfBidReadAll">모두 읽음</button></div><div id="dfBidNotifications"></div></div></div><div class="df-bid-panel" id="dfBidPanel-settings" data-bid-panel="settings" role="tabpanel" aria-labelledby="dfBidTab-settings" hidden><div id="dfBidWatchSettings"></div></div>`);
    tabs.addEventListener('click',e=>{const b=e.target.closest('[data-bid-tab]');if(b)setTab(b.dataset.bidTab);});tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...tabs.querySelectorAll('[data-bid-tab]')],i=buttons.findIndex(b=>b.dataset.bidTab===tab),n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;setTab(buttons[n].dataset.bidTab);buttons[n].focus();});
    tabs.after($('dfBidWatchMessage'));
    let debounce;$('dfBidNoticeSearch').oninput=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{page=1;loadNotices();},250);};$('dfBidNoticeState').onchange=()=>{page=1;loadNotices();};$('dfBidNoticePrev').onclick=()=>{page=Math.max(1,page-1);loadNotices();};$('dfBidNoticeNext').onclick=()=>{if(page*25<total){page++;loadNotices();}};$('dfBidNoticeRefresh').onclick=()=>{refresh();loadNotices();};
    $('dfBidNoticeList').onclick=e=>{const b=e.target.closest('[data-bid-notice]');if(b)openNotice(b.dataset.bidNotice);};$('dfBidNotifications').onclick=async e=>{const b=e.target.closest('[data-bid-event]');if(!b)return;const item=events.find(x=>x.id===b.dataset.bidEvent);try{await rpc('df_bid_watch_read',{p_ids:[item.id],p_all:false});await refresh();if(item.notice_id)await openNotice(item.notice_id);else message(item.message);}catch(_){message('읽음 상태를 저장하지 못했습니다.');}};
    $('dfBidReadAll').onclick=async()=>{try{await rpc('df_bid_watch_read',{p_ids:[],p_all:true});await refresh();}catch(_){message('읽음 상태를 저장하지 못했습니다.');}};
    document.querySelector('[data-view="bid"]')?.addEventListener('click',()=>setTimeout(refresh,100));document.addEventListener('df:menu-permissions-changed',()=>{if(user()!==actor)reset();if(can())refresh();else badge(0);});setTab('records');
    setInterval(()=>{if(user()!==actor)reset();refresh();},60000);setTimeout(refresh,1800);
  }
  window.DFBidWatch={refresh,organizeModal,monitoring:()=>!!(lastStatus?.enabled&&lastStatus?.schedule_active&&lastStatus?.source_connected)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
