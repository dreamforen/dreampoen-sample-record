/* 발행 세금계산서 조회·출력. 매출·수금 원장과 별도로 동작합니다. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const actor=()=>typeof dfCloudUser!=='undefined'&&!document.body.classList.contains('df-auth-locked')?String(dfCloudUser?.id||''):'';
  const client=()=>typeof dfSupabase!=='undefined'?dfSupabase:null;
  const popupWindows=new Set();
  let owner='',db=null,version=0,access=null,accessRequest=null,accessAt=0,sub=null,signedOut=false,sessionUser='';
  let dialog,viewVersion=0,queryVersion=0,searchTimer=0,syncBusy=false,staffVersion=0,page=1,total=0,configured=false;
  const approval=/^[A-Za-z0-9]{24}$/;
  const button=(title,cls='')=>{
    const b=document.createElement('button');b.type='button';b.textContent=title;b.className=cls;return b;
  };
  const won=value=>{try{return BigInt(value).toLocaleString('ko-KR')+'원';}catch{return '—';}};
  const when=value=>{
    const date=new Date(value);
    return value&&Number.isFinite(+date)?date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}):'';
  };
  function message(text,bad=false){
    const line=$('dfIssuedMessage');if(!line)return;
    line.textContent=text||'';line.classList.toggle('bad',bad);
  }
  function displayAccess(){
    const visible=!!(access?.allowed&&owner&&db===client()&&owner===actor()&&!signedOut);
    for(const id of ['dfIssuedInvoiceNav','dfIssuedInvoiceOpen'])if($(id))$(id).hidden=!visible;
    for(const id of ['dfIssuedSync','dfIssuedStaff'])if($(id))$(id).hidden=!visible||!access.admin;
    if(!visible&&dialog?.open)dialog.close();
  }
  function clearDisplay(){
    viewVersion++;queryVersion++;staffVersion++;clearTimeout(searchTimer);
    $('dfIssuedRows')?.replaceChildren();$('dfIssuedStaffList')?.replaceChildren();
    if($('dfIssuedStaffPane'))$('dfIssuedStaffPane').hidden=true;
    if($('dfIssuedSearch'))$('dfIssuedSearch').value='';
    if($('dfIssuedMonth'))$('dfIssuedMonth').value='';
    if($('dfIssuedSyncInfo'))$('dfIssuedSyncInfo').textContent='';
    if($('dfIssuedMode'))$('dfIssuedMode').hidden=true;
    message('');
    if($('dfIssuedTotal'))$('dfIssuedTotal').textContent='0건';
    if($('dfIssuedPage'))$('dfIssuedPage').textContent='1 / 1';
    for(const id of ['dfIssuedPrev','dfIssuedNext','dfIssuedSync'])if($(id))$(id).disabled=true;
    page=1;total=0;configured=false;syncBusy=false;
  }
  function closePopups(){
    for(const pop of popupWindows){try{if(!pop.closed)pop.close();}catch{}}
    popupWindows.clear();
  }
  function reset(){
    version++;accessAt=0;access=null;accessRequest=null;
    closePopups();clearDisplay();displayAccess();
  }
  function adopt(){
    const api=client();
    if(api!==db){
      sub?.unsubscribe?.();db=api;signedOut=false;sessionUser='';owner='';reset();
      const subscribed=api?.auth?.onAuthStateChange?.((event,session)=>{
        if(db!==api)return;
        if(event==='SIGNED_OUT'){
          signedOut=true;sessionUser='';owner='';reset();
        }else if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='USER_UPDATED'){
          signedOut=!session?.user;sessionUser=String(session?.user?.id||'');
          if(!session?.user||owner&&session.user.id!==owner){owner='';reset();}
          setTimeout(checkAccess,0);
        }
      });
      sub=subscribed?.data?.subscription;
    }
    const id=!signedOut&&(!sessionUser||sessionUser===actor())?actor():'';
    if(id!==owner){owner=id;reset();}
  }
  const current=(v,api)=>v===version&&api===client()&&db===api&&owner===actor()&&!!owner&&!signedOut;
  async function checkAccess(force=false){
    adopt();if(!owner||!db)return false;
    if(accessRequest)return accessRequest;
    if(!force&&Date.now()-accessAt<60000)return access?.allowed===true;
    const v=version,api=db;
    accessRequest=(async()=>{
      try{
        const {data,error}=await api.rpc('df_erp_issued_access');
        if(!current(v,api))return false;
        access=error?null:{allowed:data?.allowed===true,admin:data?.admin===true};
      }catch{if(current(v,api))access=null;}
      if(!current(v,api))return false;
      accessAt=Date.now();accessRequest=null;
      if(!access?.allowed){closePopups();clearDisplay();}
      displayAccess();return access?.allowed===true;
    })();
    return accessRequest;
  }
  function errorText(error, fallback){
    const code=String(error?.code||'');
    if(code==='ACCESS_DENIED'||code==='AUTH_HTTP_401'||code==='AUTH_HTTP_403')return '세금계산서 출력 권한을 확인해 주세요.';
    if(code==='POPBILL_NOT_CONFIGURED')return '홈택스 수집 연결 설정이 필요합니다.';
    if(code==='INVOICE_NOT_FOUND')return '수집 목록에서 계산서를 찾을 수 없습니다. 다시 조회해 주세요.';
    if(code==='COLLECTION_LEASE_EXPIRED')return '수집이 진행 중입니다. 잠시 후 다시 확인해 주세요.';
    if(/^[A-Z][A-Z0-9_-]{2,60}$/.test(code))return fallback+' ('+code+')';
    return fallback;
  }
  async function invoke(api,body){
    const {data,error}=await api.functions.invoke('erp-issued-invoices',{body});
    if(error){
      let code='';
      try{code=(await error.context?.json?.())?.error;}catch{}
      if(!code&&error.context?.status===404)code='FUNCTION_NOT_DEPLOYED';
      if(!code&&error.context?.status===401)code='ACCESS_DENIED';
      throw Object.assign(new Error('invoice request'),{code});
    }
    if(data?.error)throw Object.assign(new Error('invoice request'),{code:data.error});
    return data;
  }
  function render(data){
    configured=data.configured===true;
    total=Math.max(0,Number(data.total)||0);
    $('dfIssuedMode').hidden=data.mode!=='test';
    const info=data.sync||{},date=when(info.last_success);
    $('dfIssuedSyncInfo').textContent=!configured?'홈택스 수집 연결 대기':[
      date?'최근 수집 '+date:'수집 이력 없음',info.pending?'가져오는 중':'',info.error?'최근 확인 오류 '+String(info.error):'',
    ].filter(Boolean).join(' · ');
    $('dfIssuedSync').disabled=!configured||syncBusy;
    $('dfIssuedTotal').textContent=total.toLocaleString('ko-KR')+'건';
    $('dfIssuedPage').textContent=page+' / '+Math.max(1,Math.ceil(total/50));
    $('dfIssuedPrev').disabled=page<=1;
    $('dfIssuedNext').disabled=page>=Math.ceil(total/50);
    const showLedger=data.show_ledger===true;
    $('dfIssuedLedgerHead').hidden=!showLedger;
    const list=$('dfIssuedRows'),frag=document.createDocumentFragment();
    for(const row of Array.isArray(data.rows)?data.rows:[]){
      if(!approval.test(String(row.approval_no||'')))continue;
      const tr=document.createElement('tr');
      const cell=(label,value,cls='')=>{
        const td=document.createElement('td');td.dataset.label=label;td.textContent=value||'—';td.className=cls;tr.append(td);return td;
      };
      cell('발행일',row.issue_date,'issued-date');
      const company=cell('공급받는 업체',row.customer_name,'issued-company');
      if(row.customer_biz){const sm=document.createElement('small');sm.textContent=row.customer_biz;company.append(sm);}
      const item=cell('품목',row.item_name);
      if(row.is_modified){const tag=document.createElement('small');tag.className='issued-tag';tag.textContent='수정 계산서';item.append(tag);}
      cell('합계금액',won(row.total_amount),'issued-money');
      cell('승인번호',row.approval_no,'issued-approval');
      if(showLedger)cell('ERP 원장',row.erp_recorded?'등록됨':'미등록','issued-ledger');
      const actions=cell('출력','');actions.textContent='';actions.className='issued-actions';
      for(const [label,action]of [['미리보기','preview'],['인쇄 / PDF','print']]){
        const b=button(label,action==='print'?'issued-primary':'');b.dataset.issuedAction=action;b.dataset.approval=row.approval_no;actions.append(b);
      }
      frag.append(tr);
    }
    if(!frag.childNodes.length){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=showLedger?7:6;td.className='issued-empty';td.textContent=configured?'조회된 발행 계산서가 없습니다.':'관리자가 수집 연결을 설정하면 계산서가 표시됩니다.';tr.append(td);frag.append(tr);
    }
    list.replaceChildren(frag);
  }
  async function load(options={}){
    const v=version,api=db,request=++queryVersion;
    if(!current(v,api)||!dialog.open||!access?.allowed)return;
    if(!options.quiet){$('dfIssuedRows').replaceChildren();message('불러오는 중…');}
    try{
      const data=await invoke(api,{action:'list',month:$('dfIssuedMonth').value,search:$('dfIssuedSearch').value,page});
      if(!current(v,api)||!dialog.open||request!==queryVersion)return;
      if(page>1&&page>Math.ceil((data.total||0)/50)){page=Math.max(1,Math.ceil((data.total||0)/50));return load(options);}
      render(data);if(!options.quiet)message('');return true;
    }catch(err){
      if(!current(v,api)||!dialog.open||request!==queryVersion)return;
      $('dfIssuedRows').replaceChildren();
      $('dfIssuedSync').disabled=true;
      message(errorText(err,'발행 계산서를 불러오지 못했습니다.'),true);
      if(err.code==='ACCESS_DENIED')void checkAccess(true);
    }
  }
  async function open(){
    window.DF_MOBILE_NAVIGATION?.close(false);
    if(!await checkAccess(true))return;
    if(!dialog.open){clearDisplay();dialog.showModal();}
    void load();
  }
  async function printOrPreview(control){
    const {issuedAction:action,approval:number}=control.dataset,v=version,api=db;
    if(!access?.allowed||!current(v,api)||!approval.test(number))return;
    // Open during the click, then request the provider's short-lived link.
    const pop=window.open('about:blank','_blank','popup,width=930,height=765');
    if(!pop){message('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.',true);return;}
    for(const old of popupWindows)if(old.closed)popupWindows.delete(old);
    popupWindows.add(pop);control.disabled=true;
    try{
      pop.opener=null;
      pop.document.title='발행 세금계산서';
      pop.document.body.textContent='계산서를 불러오는 중입니다…';
      const result=await invoke(api,{action,approval:number});
      if(!current(v,api)||pop.closed){pop.close();return;}
      const url=new URL(result.url);
      if(url.protocol!=='https:'||url.port||url.username||url.password||!(url.hostname==='popbill.com'||url.hostname.endsWith('.popbill.com')))throw Error('link');
      pop.location.replace(url.href);message('');
    }catch(err){
      pop.close();popupWindows.delete(pop);
      if(current(v,api))message(errorText(err,'계산서를 열지 못했습니다. 다시 시도해 주세요.'),true);
    }finally{control.disabled=false;}
  }
  async function sync(){
    const v=version,api=db,view=viewVersion;
    const sameView=()=>current(v,api)&&view===viewVersion&&dialog.open;
    if(!access?.admin||!configured||syncBusy||!current(v,api))return;
    syncBusy=true;$('dfIssuedSync').disabled=true;message('홈택스에 발행 자료 수집을 요청하는 중…');
    try{
      for(let i=0;i<4;i++){
        const data=await invoke(api,{action:'sync'});
        if(!sameView())return;
        if(data.state==='ok'){if(await load({quiet:true})&&sameView())message('발행 자료를 업데이트했어요.');return;}
        if(data.state==='idle'){if(await load({quiet:true})&&sameView())message('이미 확인 중이거나 방금 확인했어요.');return;}
        if(i<3)await new Promise(resolve=>setTimeout(resolve,9000));
        if(!sameView())return;
      }
      if(await load({quiet:true})&&sameView())message('수집 요청을 접수했어요. 잠시 후 다시 확인해 주세요.');
    }catch(err){if(sameView())message(errorText(err,'수집을 완료하지 못했습니다.'),true);}
    finally{if(sameView()){syncBusy=false;$('dfIssuedSync').disabled=!configured;}}
  }
  async function staff(){
    const pane=$('dfIssuedStaffPane'),list=$('dfIssuedStaffList'),v=version,api=db,request=++staffVersion;
    if(!access?.admin||!current(v,api))return;
    pane.hidden=!pane.hidden;list.replaceChildren();
    if(pane.hidden)return;
    list.textContent='직원을 불러오는 중…';
    try{
      const {data,error}=await api.rpc('df_erp_issued_staff');
      if(!current(v,api)||request!==staffVersion||pane.hidden)return;
      if(error)throw error;
      list.replaceChildren();
      for(const person of Array.isArray(data)?data:[]){
        const label=document.createElement('label'),box=document.createElement('input');
        box.type='checkbox';box.checked=person.allowed===true;
        box.addEventListener('change',async()=>{
          const allow=box.checked;
          if(!current(v,api)||!access?.admin){box.checked=!allow;return;}
          box.disabled=true;
          try{
            const {error}=await api.rpc('df_erp_issued_grant',{p_employee:person.id,p_allow:allow});
            if(error)throw error;
            if(current(v,api))message(allow?'출력 권한을 허용했어요.':'출력 권한을 해제했어요.');
          }catch{box.checked=!allow;if(current(v,api))message('출력 권한을 저장하지 못했습니다.',true);}
          finally{box.disabled=false;}
        });
        label.append(box,document.createTextNode(person.name));list.append(label);
      }
      if(!list.childNodes.length)list.textContent='출력 권한을 설정할 직원이 없습니다.';
    }catch{if(current(v,api)&&request===staffVersion)list.textContent='직원 목록을 불러오지 못했습니다.';}
  }

  function init(){
    if(!$('dfIssuedInvoiceNav')||dialog)return;
    dialog=document.createElement('dialog');dialog.id='dfIssuedInvoiceDialog';dialog.className='df-issued-dialog';
    dialog.setAttribute('aria-labelledby','dfIssuedTitle');
    dialog.innerHTML=`
      <header class="issued-head">
        <div><h2 id="dfIssuedTitle">발행 세금계산서</h2><p id="dfIssuedSyncInfo"></p></div>
        <div class="issued-buttons">
          <button type="button" id="dfIssuedSync" hidden>지금 가져오기</button>
          <button type="button" id="dfIssuedStaff" hidden>직원 출력 권한</button>
          <button type="button" id="dfIssuedClose" aria-label="닫기">닫기</button>
        </div>
      </header>
      <section id="dfIssuedStaffPane" class="issued-staff" hidden aria-label="직원 출력 권한">
        <b>직원 출력 권한</b><p>체크하면 발행 계산서 조회·인쇄를 허용합니다.</p><div id="dfIssuedStaffList"></div>
      </section>
      <div id="dfIssuedMode" class="issued-test" hidden>테스트 환경 · 실제 발행 자료와 분리됩니다.</div>
      <div class="issued-filters">
        <label>발행월 <input type="month" id="dfIssuedMonth" aria-label="발행월"></label>
        <button type="button" id="dfIssuedAll">전체 월</button>
        <input type="search" id="dfIssuedSearch" placeholder="업체명 · 품목 · 승인번호" maxlength="100" aria-label="계산서 검색">
        <button type="button" id="dfIssuedRefresh">조회</button>
      </div>
      <div class="issued-table-wrap">
        <table class="issued-table"><thead><tr><th>발행일</th><th>공급받는 업체</th><th>품목</th><th>합계금액</th><th>승인번호</th><th id="dfIssuedLedgerHead" hidden>ERP 원장</th><th>출력</th></tr></thead>
        <tbody id="dfIssuedRows"></tbody></table>
      </div>
      <footer class="issued-foot">
        <span id="dfIssuedTotal">0건</span>
        <p id="dfIssuedMessage" role="status" aria-live="polite"></p>
        <div class="issued-buttons"><button type="button" id="dfIssuedPrev" disabled>이전</button><span id="dfIssuedPage">1 / 1</span><button type="button" id="dfIssuedNext" disabled>다음</button></div>
      </footer>`;
    document.body.append(dialog);
    for(const id of ['dfIssuedInvoiceNav','dfIssuedInvoiceOpen'])$(id)?.addEventListener('click',open);
    $('dfIssuedClose').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{if(!dialog.open)clearDisplay();});
    $('dfIssuedRefresh').addEventListener('click',()=>load());
    $('dfIssuedMonth').addEventListener('change',()=>{page=1;load();});
    $('dfIssuedAll').addEventListener('click',()=>{$('dfIssuedMonth').value='';page=1;load();});
    $('dfIssuedSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;load();},240);});
    $('dfIssuedPrev').addEventListener('click',()=>{if(page>1){page--;load();}});
    $('dfIssuedNext').addEventListener('click',()=>{if(page<Math.ceil(total/50)){page++;load();}});
    $('dfIssuedSync').addEventListener('click',sync);
    $('dfIssuedStaff').addEventListener('click',staff);
    $('dfIssuedRows').addEventListener('click',e=>{const b=e.target.closest('button[data-issued-action]');if(b)void printOrPreview(b);});
    document.addEventListener('df:menu-permissions-changed',event=>{
      if(event.detail?.signedOut){signedOut=true;sessionUser='';owner='';reset();}
      else setTimeout(checkAccess,0);
    });
    new MutationObserver(()=>{void checkAccess();}).observe(document.body,{attributes:true,attributeFilter:['class']});
    window.addEventListener('focus',()=>{void checkAccess();});
    window.addEventListener('pagehide',()=>reset());
    window.addEventListener('pageshow',()=>{void checkAccess();});
    setInterval(()=>{if(!document.hidden)void checkAccess();},1500);
    void checkAccess();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
