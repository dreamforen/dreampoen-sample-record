/* Beta 3.9.4: one notice table with integrated personal notification state. */
/* Beta 3.49: personal persistent selection deletion. */
/* Beta 3.47: G2B linked notices, source-scoped agency links. */
/* Beta 3.21 — company bid monitoring UI. Server keys never enter this file. */
(function(){
  'use strict';
  const M=window.DFBidModel,esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const $=id=>document.getElementById(id),money=v=>v==null?'미정':Math.round(Number(v)).toLocaleString('ko-KR')+'원';
  let actor='',generation=0,tab='records',page=1,total=0,rows=[],events=[],config=null,inflight=null,initial=true,seen=new Set(),noticesLoading=false,noticesAgain=false,lastStatus=null;
  let noticeMode='all',displayRows=[],noticeCache=new Map(),unreadTotal=0;
  function user(){try{return dfCloudUser?.id||'';}catch(_){return '';}}
  function client(){try{return dfSupabase;}catch(_){return null;}}
  function admin(){try{return dfCloudProfile?.role==='admin'&&dfCloudProfile?.active===true;}catch(_){return false;}}
  function can(){try{return typeof dfMenuCan==='function'?dfMenuCan('bid','view',admin()):admin();}catch(_){return false;}}
  function message(text){if($('dfBidWatchMessage'))$('dfBidWatchMessage').textContent=text;}
  async function rpc(name,args={}){const r=await client().rpc(name,args);if(r.error)throw r.error;return r.data;}
  function organizeModal(modal){
    const form=modal.querySelector('.df-bid-form');if(!form)return;
    let overview=form.querySelector(':scope > .df-bid-overview');
    if(!overview){overview=document.createElement('div');overview.className='df-bid-overview';overview.setAttribute('aria-label','투찰금액과 원인분석');overview.innerHTML='<div class="df-bid-overview-cell df-bid-overview-bid"><h3>투찰금액 · 산정내용</h3></div><div class="df-bid-overview-cell" data-bid-overview-analysis></div>';form.prepend(overview);}
    const recommendation=modal.querySelector('#bidRecommend'),analysis=modal.querySelector('#dfBidDecisionSupport');
    if(recommendation)overview.querySelector('.df-bid-overview-bid').append(recommendation);
    if(analysis)overview.querySelector('[data-bid-overview-analysis]').append(analysis);
    const groups=[['기본정보',['bidTitle','bidAgency','bidDeadline','bidStatus']],['금액·산정조건',['bidEstimate','bidBase','bidVat','bidRate','bidRange','bidCount']],['투찰·결과',['bidOurs','bidWinner','bidMemo']]];
    const anchor=form.querySelector(':scope > .df-doc-editor-actions');
    groups.forEach(([title,ids],index)=>{let f=form.querySelector('[data-bid-field-group="'+index+'"]');if(!f){f=document.createElement('fieldset');f.dataset.bidFieldGroup=String(index);const legend=document.createElement('legend'),grid=document.createElement('div');legend.textContent=title;grid.className='df-bid-form-grid';f.append(legend,grid);form.insertBefore(f,anchor);}const grid=f.querySelector('.df-bid-form-grid');ids.forEach(id=>{const label=modal.querySelector('#'+id)?.closest('label');if(label)grid.append(label);});});
    modal.querySelector('#bidDeadline')?.setAttribute('aria-label','입찰마감시간 (한국시간)');
    const small=modal.querySelector('.company-modal-head small');if(small)small.textContent='금액: 원 단위 · 마감시간: 한국시간';
  }
  let rowSelection=new Set(),mutationBusy=false,inboxEpoch=0,noticeEpoch=0;
  const eventLabel=x=>({new:'새 공고',changed:'변경 공고',cancelled:'취소 공고',deadline:'마감 임박'}[x]||'입찰 알림');
  const knownNotice=id=>rows.find(x=>x.id===id)||noticeCache.get(id);
  function canonicalNoticeId(id){
    let current=id;const visited=new Set();
    while(current&&!visited.has(current)&&visited.size<8){visited.add(current);const n=knownNotice(current),next=n?.content?.duplicate_of||n?.duplicate_of;if(typeof next!=='string'||!next||!knownNotice(next))break;current=next;}
    return current||id;
  }
  function eventsFor(id){return events.filter(x=>canonicalNoticeId(x.notice_id)===id).slice().sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0));}
  function tableEntries(){
    if(noticeMode==='all')return rows.map(n=>({key:'notice:'+n.id,notice:n,events:eventsFor(n.id)}));
    const grouped=new Map();
    for(const event of events){if(noticeMode==='unread'&&event.read)continue;const id=event.notice_id?canonicalNoticeId(event.notice_id):'',key=id?'notice:'+id:'event:'+event.id;let item=grouped.get(key);if(!item){item={key,notice:id?knownNotice(id):null,noticeId:id,events:[]};grouped.set(key,item);}item.events.push(event);}
    const search=($('dfBidNoticeSearch')?.value||'').trim().toLocaleLowerCase();
    return [...grouped.values()].map(item=>({...item,events:item.events.slice().sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0))})).filter(item=>!search||[(item.notice?.title||item.events[0]?.title||''),item.notice?.agency||'',...item.events.map(x=>x.message||'')].join(' ').toLocaleLowerCase().includes(search)).sort((a,b)=>(Date.parse(b.events[0]?.created_at)||0)-(Date.parse(a.events[0]?.created_at)||0));
  }
  function selectionUI(){
    const valid=new Set(displayRows.map(x=>x.key));for(const key of rowSelection)if(!valid.has(key))rowSelection.delete(key);
    document.querySelectorAll('[data-bid-select-row]').forEach(el=>{el.checked=rowSelection.has(el.dataset.bidSelectRow);el.disabled=mutationBusy;});
    const all=$('dfBidNoticeSelectAll');if(all){all.checked=displayRows.length>0&&rowSelection.size===displayRows.length;all.indeterminate=rowSelection.size>0&&rowSelection.size<displayRows.length;all.disabled=mutationBusy||!displayRows.length;}
    const button=$('dfBidNoticeDelete');if(button){button.disabled=mutationBusy||!rowSelection.size;button.textContent=noticeMode==='all'?'선택 공고 삭제':'선택 알림 삭제';}
    if($('dfBidNoticeSelected'))$('dfBidNoticeSelected').textContent=rowSelection.size+'건 선택';
    if($('dfBidReadAll'))$('dfBidReadAll').disabled=mutationBusy||unreadTotal<=0;
  }
  async function freshInbox(){const pending=inflight;if(pending)await pending.catch(()=>{});await refresh();}
  async function dismissSelected(){
    if(mutationBusy||!can())return;const chosen=displayRows.filter(x=>rowSelection.has(x.key)),kind=noticeMode==='all'?'notices':'events',ids=[...new Set(kind==='notices'?chosen.map(x=>x.notice?.id).filter(Boolean):chosen.flatMap(x=>x.events.map(e=>e.id)))];if(!ids.length)return;
    const label=kind==='events'?'알림':'맞춤공고';if(!confirm('선택한 '+label+' '+ids.length+'건을 내 목록에서 삭제할까요?'))return;
    const uid=user(),g=generation;mutationBusy=true;inboxEpoch++;noticeEpoch++;selectionUI();
    try{
      const r=await rpc('df_bid_watch_dismiss',{p_kind:kind,p_ids:ids});if(uid!==user()||g!==generation)return;
      rowSelection.clear();message(label+' '+Number(r.deleted||0)+'건을 내 목록에서 삭제했습니다.');
      if(r.ids?.length){const b=document.createElement('button');b.type='button';b.className='company-btn secondary';b.textContent='되돌리기';$('dfBidWatchMessage').append(' ',b);
        b.onclick=async()=>{if(mutationBusy||uid!==user()||g!==generation)return;mutationBusy=true;b.disabled=true;inboxEpoch++;noticeEpoch++;selectionUI();try{await rpc('df_bid_watch_restore',{p_kind:kind,p_ids:r.ids});if(uid!==user()||g!==generation)return;message(label+' 삭제를 되돌렸습니다.');await freshInbox();if(kind==='notices')await loadNotices();}catch(_){if(uid===user())message('복원을 완료하지 못했습니다. 연결 상태를 확인해주세요.');}finally{mutationBusy=false;selectionUI();}};
      }
      await freshInbox();if(kind==='notices')await loadNotices();
    }catch(_){if(uid===user()&&g===generation)message('선택 삭제를 완료하지 못했습니다. 58번 SQL 적용 여부와 연결 상태를 확인해주세요.');}
    finally{mutationBusy=false;selectionUI();}
  }

  function setTab(next){
    tab=next;document.querySelectorAll('[data-bid-tab]').forEach(b=>{const active=b.dataset.bidTab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    document.querySelectorAll('.df-bid-panel').forEach(p=>p.hidden=p.dataset.bidPanel!==tab);$('dfBidNew').hidden=tab!=='records';
    if(tab==='notices'){loadNotices();refresh();}if(tab==='settings')loadSettings();
  }
  function reset(){generation++;inboxEpoch++;noticeEpoch++;rowSelection.clear();displayRows=[];noticeCache.clear();unreadTotal=0;mutationBusy=false;actor=user();rows=[];events=[];config=null;lastStatus=null;page=1;initial=true;seen=new Set();inflight=null;$('dfBidUnread')&&( $('dfBidUnread').hidden=true );$('dfBidNavUnread')?.remove();if($('dfBidNoticeList'))$('dfBidNoticeList').innerHTML='';if($('dfBidWatchSettings'))$('dfBidWatchSettings').innerHTML='';const modal=$('dfBidNoticeModal');if(modal){modal.hidden=true;modal.style.display='none';}}
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
    events=Array.isArray(data.events)?data.events:[];unreadTotal=Number(data.unread||0);badge(unreadTotal);renderNotices();
    const fresh=events.filter(x=>!x.read&&!seen.has(x.id));events.forEach(x=>seen.add(x.id));
    if(!initial&&fresh.length&&window.Notification?.permission==='granted')new Notification('드림포이엔 입찰 알림',{body:fresh.slice(0,3).map(x=>x.title).join('\n'),tag:'df-bid-watch-'+actor});
    initial=false;
  }
  async function loadEventNotices(nextEvents,uid,g,epoch){
    const cache=new Map(rows.map(n=>[n.id,n]));
    const fetchIds=async ids=>{for(let offset=0;offset<ids.length;offset+=50){try{const q=await client().from('bid_watch_notices').select('*').in('id',ids.slice(offset,offset+50));if(q.error)continue;for(const n of q.data||[])if(n&&typeof n.id==='string')cache.set(n.id,n);}catch(_){}}};
    const ids=[...new Set(nextEvents.map(x=>x.notice_id).filter(id=>typeof id==='string'&&id))];
    await fetchIds(ids.filter(id=>!cache.has(id)));
    const links=[...new Set([...cache.values()].map(n=>n.content?.duplicate_of||n.duplicate_of).filter(id=>typeof id==='string'&&id&&!cache.has(id)))];await fetchIds(links);
    if(g===generation&&uid===user()&&epoch===inboxEpoch)noticeCache=cache;
  }
  async function refresh(){
    if(!user()||!client()||!can()||!$('dfBidWatchStatus'))return;
    if(user()!==actor)reset();if(inflight)return inflight;
    const g=generation,uid=actor,epoch=inboxEpoch;
    const task=(async()=>{try{const [s,data]=await Promise.all([rpc('df_bid_watch_status'),rpc('df_bid_watch_inbox',{p_limit:50})]);if(g!==generation||uid!==user()||epoch!==inboxEpoch)return;await loadEventNotices(data.events||[],uid,g,epoch);if(g!==generation||uid!==user()||epoch!==inboxEpoch)return;status(s);renderInbox(data);if($('dfBidWatchMessage').textContent==='입찰현황은 기존 기능으로 계속 이용할 수 있습니다.')message('');}catch(e){if(g===generation&&uid===user()&&epoch===inboxEpoch){$('dfBidWatchStatus').textContent=['PGRST202','42883'].includes(e.code)?'알림 연결 전 · 배포자료의 62번 SQL과 서버 기능을 적용해주세요.':'알림 조회에 실패했습니다. 연결 상태와 입찰 조회 권한을 확인해주세요.';message('입찰현황은 기존 기능으로 계속 이용할 수 있습니다.');}}})();
    inflight=task;try{await task;}finally{if(inflight===task)inflight=null;}
  }
  async function loadNotices(){
    if(!can())return;if(noticesLoading){noticesAgain=true;return;}const uid=user(),g=generation,epoch=noticeEpoch;noticesLoading=true;
    try{const data=await rpc('df_bid_watch_notices',{p_search:$('dfBidNoticeSearch').value,p_state:$('dfBidNoticeState').value,p_page:page,p_size:25});if(g!==generation||uid!==user()||epoch!==noticeEpoch)return;total=Number(data.total||0);const maxPage=Math.max(1,Math.ceil(total/25));if(page>maxPage){page=maxPage;noticesAgain=true;return;}rows=data.rows||[];renderNotices();}catch(_){if(g!==generation||uid!==user()||epoch!==noticeEpoch)return;rows=[];rowSelection.clear();selectionUI();$('dfBidNoticeList').innerHTML='<div class="df-bid-watch-help">맞춤공고 연결 후 검색 결과가 표시됩니다.</div>';}finally{noticesLoading=false;if(noticesAgain){noticesAgain=false;loadNotices();}}
  }
  function renderNotices(){
    if(!$('dfBidNoticeList'))return;displayRows=tableEntries();
    const recent=noticeMode!=='all',limitNote=noticeMode==='unread'?'최근 알림 50건 중 미확인':noticeMode==='recent'?'최근 알림 50건':'맞춤공고 '+total+'건 · 알림 최근 50건 기준';
    const alertCell=item=>{const latest=item.events[0],unread=item.events.filter(e=>!e.read).length;if(!latest)return '<span class="df-bid-alert-none">—</span>';return '<div class="df-bid-alert-cell"><span class="df-bid-alert-badge" data-kind="'+esc(latest.event_type)+'">'+esc(eventLabel(latest.event_type))+'</span>'+(unread?'<span class="df-bid-alert-unread">미확인 '+unread+'</span>':'<span class="df-bid-alert-read">확인</span>')+'<small>'+esc(M.formatKst(latest.created_at))+(item.events.length>1?' · 알림 '+item.events.length+'건':'')+'</small></div>';};
    $('dfBidNoticeList').innerHTML=`<div class="df-bid-table-wrap"><table class="df-bid-table df-bid-notice-table"><caption>${esc(limitNote)}${recent?' · 공고별 '+displayRows.length+'건':''} · 한국시간 기준</caption><colgroup><col style="width:35px"><col style="width:74px"><col><col style="width:130px"><col style="width:125px"><col style="width:105px"><col style="width:110px"><col style="width:170px"></colgroup><thead><tr><th><input class="df-bid-select" id="dfBidNoticeSelectAll" type="checkbox" aria-label="현재 목록 전체 선택"></th><th>상태</th><th>공고명</th><th>발주기관</th><th>입찰마감</th><th>추정가격</th><th>참가 가능 지역</th><th>알림</th></tr></thead><tbody>${displayRows.map(item=>{const x=item.notice,latest=item.events[0],title=x?.title||latest?.title||'입찰 알림',cancelled=x?.cancelled,unread=item.events.some(e=>!e.read),state=!x?'원문 확인':cancelled?'취소':['kogas','g2b_unified'].includes(x.content?.source)&&x.content?.cancellation_source_state==='unknown'?'상태 확인':x.deadline&&Date.parse(x.deadline)<=Date.now()?'마감':'공고';return `<tr data-bid-entry="${esc(item.key)}" class="${unread?'df-bid-row-unread':''}"><td><input class="df-bid-select" type="checkbox" data-bid-select-row="${esc(item.key)}" aria-label="${esc(title)} 선택"></td><td><span class="df-bid-public-state ${cancelled?'lost':'open'}">${state}</span></td><td class="bid-title"><button class="df-bid-title-button" data-bid-open-entry="${esc(item.key)}">${esc(title)}</button>${x?.ai_status==='ok'?'<small class="df-bid-notice-summary">'+(x.ai_summary?.relevance===false?'관련도 낮음':'AI 요약')+'</small>':''}${!x&&latest?.message?'<small class="df-bid-notice-summary">'+esc(latest.message)+'</small>':''}</td><td>${esc(x?.agency||'—')}</td><td class="bid-date">${x?esc(M.formatKst(x.deadline)):'—'}</td><td class="bid-amount">${x?money(x.estimated_price):'—'}</td><td>${esc(x?(x.regions||[]).join(', ')||'원문 확인':'—')}</td><td>${alertCell(item)}</td></tr>`;}).join('')||'<tr><td colspan="8" class="df-bid-empty">'+(recent?'표시할 알림이 없습니다.':'조건에 맞는 맞춤공고가 없습니다.')+'</td></tr>'}</tbody></table></div>`;
    $('dfBidNoticePage').textContent=recent?'최근 알림 50건 기준':`${page} / ${Math.max(1,Math.ceil(total/25))} 페이지`;$('dfBidNoticePrev').disabled=recent||page<=1;$('dfBidNoticeNext').disabled=recent||page*25>=total;
    if($('dfBidNoticeState'))$('dfBidNoticeState').disabled=recent;selectionUI();
  }
  function openEventSummary(item){
    const latest=item.events[0];if(!latest)return false;let modal=$('dfBidNoticeModal');if(!modal){modal=document.createElement('div');modal.id='dfBidNoticeModal';modal.className='company-modal-backdrop';document.body.append(modal);}modal.hidden=false;modal.style.display='flex';
    const url=M.safeUrl(latest.detail_url);modal.innerHTML=`<div class="company-modal" role="dialog" aria-modal="true" aria-labelledby="dfBidNoticeTitle"><div class="company-modal-head"><h2 id="dfBidNoticeTitle">${esc(latest.title||'입찰 알림')}</h2><button class="company-modal-close" aria-label="닫기">×</button></div><div class="df-bid-notice-body"><div class="df-bid-alert-history">${item.events.map(e=>'<article><strong>'+esc(eventLabel(e.event_type))+'</strong><time>'+esc(M.formatKst(e.created_at))+'</time><p>'+esc(e.message||'')+'</p></article>').join('')}</div><p>공고 상세정보는 현재 조회되지 않습니다.</p>${url?'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">공고 원문 열기 ↗</a></p>':''}<button type="button" class="company-btn secondary" data-notice-close>닫기</button></div></div>`;const close=()=>{modal.hidden=true;modal.style.display='none';};modal.querySelector('.company-modal-close').onclick=close;modal.querySelector('[data-notice-close]').onclick=close;return true;
  }
  async function openEntry(key){
    if(mutationBusy||!can())return;const item=displayRows.find(x=>x.key===key);if(!item)return;const uid=user(),g=generation;
    const opened=item.notice?.id?await openNotice(item.notice.id):openEventSummary(item);if(!opened||uid!==user()||g!==generation)return;
    const ids=item.events.filter(x=>!x.read).map(x=>x.id);if(!ids.length)return;
    try{await rpc('df_bid_watch_read',{p_ids:ids,p_all:false});if(uid===user()&&g===generation)await refresh();}catch(_){if(uid===user()&&g===generation)message('알림 읽음 상태를 저장하지 못했습니다. 다시 확인해주세요.');}
  }
  async function openNotice(id){
    const uid=user(),g=generation;let n=knownNotice(id);if(!n){try{const r=await client().from('bid_watch_notices').select('*').eq('id',id).maybeSingle();n=r.data;}catch(_){} }
    if(uid!==user()||g!==generation||!can())return false;if(!n){message('현재 공고를 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');return false;}
    let modal=$('dfBidNoticeModal');if(!modal){modal=document.createElement('div');modal.id='dfBidNoticeModal';modal.className='company-modal-backdrop';document.body.append(modal);}
    modal.hidden=false;modal.style.display='flex';const ai=n.ai_status==='ok'&&M.validSummary(n.ai_summary)?n.ai_summary:null,url=M.noticeUrl?M.noticeUrl(n):M.safeUrl(n.detail_url);
    modal.innerHTML=`<div class="company-modal" role="dialog" aria-modal="true" aria-labelledby="dfBidNoticeTitle"><div class="company-modal-head"><h2 id="dfBidNoticeTitle">${esc(n.title)}</h2><button class="company-modal-close" aria-label="닫기">×</button></div><div class="df-bid-notice-body"><dl><dt>발주기관</dt><dd>${esc(n.agency)}</dd><dt>공고번호</dt><dd>${esc(n.notice_no)}${n.content?.source==='kogas'||n.content?.source==='g2b_unified'&&!n.revision?'':' · '+esc(n.revision)+'차'}</dd><dt>마감일시</dt><dd>${esc(M.formatKst(n.deadline))}</dd>${['kogas','g2b_unified'].includes(n.content?.source)&&n.content?.cancellation_source_state==='unknown'?'<dt>취소 여부</dt><dd>원문 확인 필요'+(n.cancelled?' · 기존 취소 상태 유지':'')+'</dd>':''}<dt>추정가격</dt><dd>${money(n.estimated_price)}</dd><dt>참가 가능 지역</dt><dd>${esc((n.regions||[]).join(', ')||'공고 원문 확인')}</dd><dt>면허·업종</dt><dd>${esc((n.licenses||[]).join(', ')||'공고 원문 확인')}</dd></dl><div class="df-bid-ai-summary"><h3>${ai?'AI 공고 요약 · 관련도 '+ai.score+'점':(['kogas','g2b_unified'].includes(n.content?.source)?'공고정보':'공고정보 · AI 요약 대기')}</h3><p>${esc(ai?.summary||(n.content?.source==='g2b_unified'?'나라장터 통합목록의 연계 공고입니다. 공고문·참가 조건은 해당 기관 사이트에서 확인해주세요.':n.content?.source==='kogas'?'한국가스공사 공고입니다. 금액·참가 자격·첨부파일은 원문에서 확인해주세요.':'맞춤 검색어에 해당하는 공고입니다. AI 연결 후 요약이 반영됩니다.'))}</p>${ai?'<p>'+esc(ai.reason)+'</p><ul>'+ai.checkpoints.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p>'+esc(ai.eligibility_note)+'</p>':''}<small>공고정보와 면허·지역 목록을 기준으로 정리했습니다. 첨부 문서의 세부조건은 원문에서 확인해주세요.</small></div>${url?'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+(n.content?.source==='g2b_unified'?(url==='https://www.g2b.go.kr/'?'나라장터에서 공고 찾기 ↗':'공고 기관 사이트 열기 ↗'):url.startsWith('https://www.kogas.or.kr/')?'한국가스공사 공고 찾기 ↗':'공고 원문 열기 ↗')+'</a></p>':''}<div class="df-bid-settings-actions"><button class="company-btn primary" id="dfBidNoticeRegister">이 공고로 입찰 추가</button><button class="company-btn secondary" data-notice-close>닫기</button></div></div></div>`;
    const history=eventsFor(id);if(history.length){const box=document.createElement('section');box.className='df-bid-alert-history';box.innerHTML='<h3>알림 이력</h3>'+history.map(e=>'<article><strong>'+esc(eventLabel(e.event_type))+'</strong><time>'+esc(M.formatKst(e.created_at))+'</time><p>'+esc(e.message||'')+'</p></article>').join('');modal.querySelector('.df-bid-ai-summary').before(box);}
    const close=()=>{modal.hidden=true;modal.style.display='none';};modal.querySelector('.company-modal-close').onclick=close;modal.querySelector('[data-notice-close]').onclick=close;
    $('dfBidNoticeRegister').onclick=()=>{if(n.cancelled)return alert('취소된 공고입니다. 원문을 확인해주세요.');close();window.dfBidOpen?.({title:n.title,agency:n.agency,deadline:n.deadline,estimated_price:n.estimated_price,base_amount:n.base_amount,lower_rate:n.lower_rate,memo:[url,ai?.summary].filter(Boolean).join('\n')});};return true;
  }
  async function scan(){
    if(!admin())return;const b=$('dfBidWatchScan');b.disabled=true;b.textContent='확인 중…';message('서버에서 나라장터 공고를 확인합니다.');
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
    root.insertAdjacentHTML('beforeend',`<div class="df-bid-panel" id="dfBidPanel-notices" data-bid-panel="notices" role="tabpanel" aria-labelledby="dfBidTab-notices" hidden><div class="df-bid-watch-status" id="dfBidWatchStatus">공고·AI 연결 상태 확인 전</div><p class="df-bid-inline-message" id="dfBidWatchMessage" role="status"></p><div class="df-bid-toolbar"><input id="dfBidNoticeSearch" type="search" placeholder="맞춤공고명 · 기관 검색"><select id="dfBidNoticeMode" aria-label="공고와 알림 조회"><option value="all">전체 공고</option><option value="recent">최근 알림</option><option value="unread">미확인 알림</option></select><select id="dfBidNoticeState"><option value="open">진행 공고</option><option value="all">전체 공고</option><option value="closed">마감 공고</option><option value="cancelled">취소 공고</option></select><button class="company-btn secondary" id="dfBidNoticeRefresh">새로고침</button><span class="df-bid-selected" id="dfBidNoticeSelected">0건 선택</span><button class="company-btn secondary" id="dfBidNoticeDelete" disabled>선택 공고 삭제</button><button class="company-btn secondary" id="dfBidReadAll">모두 읽음</button></div><div id="dfBidNoticeList"></div><div class="df-bid-pagination"><button id="dfBidNoticePrev">이전</button><span id="dfBidNoticePage">1 / 1 페이지</span><button id="dfBidNoticeNext">다음</button></div></div><div class="df-bid-panel" id="dfBidPanel-settings" data-bid-panel="settings" role="tabpanel" aria-labelledby="dfBidTab-settings" hidden><div id="dfBidWatchSettings"></div></div>`);
    tabs.addEventListener('click',e=>{const b=e.target.closest('[data-bid-tab]');if(b)setTab(b.dataset.bidTab);});tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...tabs.querySelectorAll('[data-bid-tab]')],i=buttons.findIndex(b=>b.dataset.bidTab===tab),n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;setTab(buttons[n].dataset.bidTab);buttons[n].focus();});
    tabs.after($('dfBidWatchMessage'));
    let debounce;$('dfBidNoticeSearch').oninput=()=>{noticeEpoch++;rowSelection.clear();selectionUI();clearTimeout(debounce);debounce=setTimeout(()=>{page=1;if(noticeMode==='all')loadNotices();else renderNotices();},250);};$('dfBidNoticeState').onchange=()=>{noticeEpoch++;rowSelection.clear();page=1;loadNotices();};$('dfBidNoticePrev').onclick=()=>{noticeEpoch++;rowSelection.clear();page=Math.max(1,page-1);loadNotices();};$('dfBidNoticeNext').onclick=()=>{if(page*25<total){noticeEpoch++;rowSelection.clear();page++;loadNotices();}};$('dfBidNoticeRefresh').onclick=()=>{refresh();if(noticeMode==='all')loadNotices();};
    $('dfBidNoticeMode').onchange=()=>{noticeMode=$('dfBidNoticeMode').value;noticeEpoch++;rowSelection.clear();if(noticeMode==='all')loadNotices();renderNotices();};
    $('dfBidNoticeList').onclick=e=>{const b=e.target.closest('[data-bid-open-entry]');if(b)openEntry(b.dataset.bidOpenEntry);};
    $('dfBidNoticeDelete').onclick=dismissSelected;
    $('dfBidNoticeList').onchange=e=>{if(mutationBusy)return;if(e.target.id==='dfBidNoticeSelectAll'){rowSelection=new Set(e.target.checked?displayRows.map(x=>x.key):[]);}else if(e.target.hasAttribute('data-bid-select-row')){const id=e.target.dataset.bidSelectRow;e.target.checked?rowSelection.add(id):rowSelection.delete(id);}selectionUI();};
    $('dfBidReadAll').onclick=async()=>{if(mutationBusy||!can())return;const uid=user(),g=generation;mutationBusy=true;inboxEpoch++;selectionUI();try{await rpc('df_bid_watch_read',{p_ids:[],p_all:true});if(uid===user()&&g===generation)await freshInbox();}catch(_){if(uid===user()&&g===generation)message('읽음 상태를 저장하지 못했습니다.');}finally{mutationBusy=false;selectionUI();}};
    document.querySelector('[data-view="bid"]')?.addEventListener('click',()=>setTimeout(refresh,100));document.addEventListener('df:menu-permissions-changed',()=>{if(user()!==actor)reset();if(can())refresh();else{reset();badge(0);}});setTab('records');
    setInterval(()=>{if(user()!==actor)reset();refresh();},60000);setTimeout(refresh,1800);
  }
  window.DFBidWatch={refresh,organizeModal,monitoring:()=>!!(lastStatus?.enabled&&lastStatus?.schedule_active&&lastStatus?.source_connected)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();


