/* DREAMFOREN v120.37.19.0 · UI STATE / EMPLOYEE / PASSWORD */
(function dfV12037190UiStateAndEmployees(){
  'use strict';

  const VERSION='v120.37.19.0';
  const STATE_KEY='dreampoen_ui_filter_state_v12037190';
  const byId=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const collator=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});

  const VIEW_IDS={
    home:'dfViewHome',approval:'dfViewApproval',contract:'dfViewContract',bid:'dfViewBid',
    billing:'dfViewBilling','sales-quotes':'dfViewSalesQuotes','sales-statements':'dfViewSalesStatements',
    'sales-prices':'dfViewSalesPrices','sales-history':'dfViewSalesHistory','sales-settings':'dfViewSalesSettings',
    company:'dfViewCompany',schedule:'dfViewSchedule','schedule-add':'dfViewScheduleAdd',
    navigation:'dfViewNavigation',quality:'dfViewQuality','doc-hub':'dfViewDocHub',
    'quality-manual':'dfViewQualityManual',organization:'dfViewOrganization',sample:'dfViewSample',
    analysis:'dfViewAnalysis','lab-hub':'dfViewLabHub','filter-ledger':'dfViewFilterLedger',
    repository:'dfViewRepository',employees:'dfViewEmployees'
  };
  const ID_TO_VIEW=Object.fromEntries(Object.entries(VIEW_IDS).map(([view,id])=>[id,view]));
  const TRACKED_IDS=new Set([
    'analysisTodayOnly','analysisRecordDate','analysisRecordSearch','analysisRecordSort','analysisRecordLimit',
    'companySearch','companyTrackYear','companyContractFilterState',
    'contractYear','contractStatus','contractSearch',
    'dfApprovalSearch','dfApprovalStatus','dfApprovalType','dfBidSearch','dfBidYear','bidStatus',
    'dfDocSearch','dfDocStatus','dfErpYear','dfErpFilter','dfErpSearch','dfErpSort',
    'dfFilterYear','dfFilterTeam','dfFilterSearch','dfFilterStatus',
    'dfQmsSearch','dfRepositoryDate','dfRepositoryTeam','dfRepositorySearch','dfRepositorySort','dfRepositoryLimit',
    'dfSalesQuoteSearch','dfSalesQuoteStatus','dfSalesStatementSearch','dfSalesStatementStatus',
    'navigationCompanySearch','scheduleYear','scheduleMonth',
    'qpfFolderSearch','qpfLedgerSearch','qpfYear','dfcdMonth','dfcdSearch','dfcdStatus','dfcdSort',
    'dfEmployeesSearch','dfEmployeeStatusFilter','dfEmployeeTeamFilter','dfEmployeeSort'
  ]);
  const OUTPUT_WORDS=/(다운로드|내려받|백업|엑셀|excel|pdf|인쇄|미리보기|출력|export|download|print)/i;
  const CLEAR_WORDS=/(전체보기|초기화|조건지우기|검색지우기|clear|reset)/i;
  let restoring=false;
  let pendingRestore=null;

  function readState(){
    try{
      const parsed=JSON.parse(sessionStorage.getItem(STATE_KEY)||'{}');
      return parsed&&typeof parsed==='object'?parsed:{views:{}};
    }catch(_){return {views:{}}}
  }

  function writeState(state){
    try{sessionStorage.setItem(STATE_KEY,JSON.stringify(state))}catch(_){ }
  }

  function activeView(){
    for(const [view,id] of Object.entries(VIEW_IDS)){
      const section=byId(id);
      if(section&&!section.hidden&&getComputedStyle(section).display!=='none')return view;
    }
    const active=document.querySelector('.df-nav-item.active[data-view]');
    if(active?.dataset.view)return active.dataset.view;
    try{return sessionStorage.getItem('dreampoen_current_view_v1101')||''}catch(_){return ''}
  }

  function viewForControl(control){
    const section=control?.closest?.('.df-view[id]');
    return ID_TO_VIEW[section?.id]||activeView()||'global';
  }

  function controlValue(control){
    if(!control)return null;
    if(control.type==='checkbox'||control.type==='radio')return {kind:'checked',value:!!control.checked};
    return {kind:'value',value:String(control.value??'')};
  }

  function saveControl(control){
    if(restoring||!control?.id||!TRACKED_IDS.has(control.id))return;
    const view=viewForControl(control),state=readState();
    state.views=state.views||{};
    state.views[view]=state.views[view]||{values:{}};
    state.views[view].values=state.views[view].values||{};
    state.views[view].values[control.id]=controlValue(control);
    state.views[view].updatedAt=new Date().toISOString();
    writeState(state);
  }

  function saveView(view=activeView()){
    if(!view)return null;
    const root=byId(VIEW_IDS[view])||document,state=readState(),values={};
    root.querySelectorAll('input[id],select[id],textarea[id]').forEach(control=>{
      if(TRACKED_IDS.has(control.id))values[control.id]=controlValue(control);
    });
    state.views=state.views||{};
    state.views[view]={values,updatedAt:new Date().toISOString()};
    writeState(state);
    return {view,values,scrollX:window.scrollX,scrollY:window.scrollY};
  }

  function dispatchFor(control){
    return control.tagName==='INPUT'&&(control.type==='search'||control.type==='text')?'input':'change';
  }

  function restoreValues(values,{dispatch=true}={}){
    if(!values)return [];
    const changed=[];
    restoring=true;
    try{
      Object.entries(values).forEach(([id,saved])=>{
        const control=byId(id);if(!control||!saved)return;
        if(saved.kind==='checked'){
          const next=!!saved.value;
          if(control.checked!==next){control.checked=next;changed.push(control)}
        }else{
          const next=String(saved.value??'');
          const optionMissing=control.tagName==='SELECT'&&next&&![...control.options].some(option=>option.value===next);
          if(!optionMissing&&String(control.value??'')!==next){control.value=next;changed.push(control)}
        }
      });
      if(dispatch)changed.forEach(control=>control.dispatchEvent(new Event(dispatchFor(control),{bubbles:true})));
    }finally{restoring=false}
    return changed;
  }

  function restoreView(view,{dispatch=true}={}){
    const saved=readState().views?.[view];
    return restoreValues(saved?.values,{dispatch});
  }

  function restoreSnapshot(snapshot,{route=false}={}){
    if(!snapshot)return;
    const current=activeView();
    if(route&&snapshot.view&&current!==snapshot.view&&typeof window.v62ShowOnly==='function'){
      window.v62ShowOnly(snapshot.view);
    }
    restoreValues(snapshot.values,{dispatch:true});
    if(snapshot.view==='repository'&&typeof window.dfRepositoryRender==='function')window.dfRepositoryRender();
  }

  function scheduleRestore(snapshot,{analysisPrint=false}={}){
    const delays=analysisPrint?[1100,2200,4200,7000]:[60,360,1200,3000,6000];
    pendingRestore={snapshot,notBefore:Date.now()+(analysisPrint?900:30)};
    delays.forEach(delay=>setTimeout(()=>restoreSnapshot(snapshot,{route:true}),delay));
    setTimeout(()=>{if(pendingRestore?.snapshot===snapshot)pendingRestore=null},7800);
  }

  function actionSignature(element){
    if(!element)return '';
    return [element.id,element.className,element.textContent,
      ...Object.keys(element.dataset||{}),...Object.values(element.dataset||{})].join(' ');
  }

  function isOutputAction(element){
    if(!element||element.closest('#dfPasswordModal'))return false;
    return element.hasAttribute('download')||OUTPUT_WORDS.test(actionSignature(element));
  }

  function bindStatePreservation(){
    document.addEventListener('change',event=>saveControl(event.target),true);
    document.addEventListener('input',event=>{
      if(event.target?.type==='search'&&TRACKED_IDS.has(event.target.id))saveControl(event.target);
    },true);
    document.addEventListener('click',event=>{
      const action=event.target.closest?.('button,a');if(!action)return;
      const signature=actionSignature(action);
      if(CLEAR_WORDS.test(signature))setTimeout(()=>saveView(activeView()),80);
      if(!isOutputAction(action))return;
      const snapshot=saveView(activeView());if(!snapshot)return;
      scheduleRestore(snapshot,{analysisPrint:!!action.closest('[data-repo-down-analysis]')});
    },true);

    const baseRouter=window.v62ShowOnly;
    if(typeof baseRouter==='function'&&!baseRouter._dfV12037190){
      const wrapped=function(view){
        const before=activeView();if(before)saveView(before);
        const result=baseRouter.apply(this,arguments);
        setTimeout(()=>restoreView(view,{dispatch:true}),20);
        return result;
      };
      wrapped._dfV12037190=true;
      window.v62ShowOnly=wrapped;
    }

    const baseMeasurementDownload=window.dfRepositoryDownloadMeasurementExcel;
    if(typeof baseMeasurementDownload==='function'&&!baseMeasurementDownload._dfV12037190){
      const wrappedDownload=async function(){
        const snapshot=saveView(activeView());
        try{return await baseMeasurementDownload.apply(this,arguments)}
        finally{restoreSnapshot(snapshot,{route:true})}
      };
      wrappedDownload._dfV12037190=true;
      window.dfRepositoryDownloadMeasurementExcel=wrappedDownload;
    }

    window.addEventListener('focus',()=>{
      if(pendingRestore&&Date.now()>=pendingRestore.notBefore)restoreSnapshot(pendingRestore.snapshot,{route:true});
    });
    window.addEventListener('pageshow',()=>setTimeout(()=>restoreView(activeView(),{dispatch:true}),80));
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&pendingRestore&&Date.now()>=pendingRestore.notBefore)restoreSnapshot(pendingRestore.snapshot,{route:true});
    });
  }

  const ACCESS=[
    ['home','홈'],['billing','매출·수금 ERP'],['company','업체현황'],['schedule','일정관리'],
    ['navigation','네비게이션'],['quality','품질문서'],['quality_edit','품질문서 수정·업로드'],
    ['organization','품질·조직도'],['quality_manual','품질매뉴얼'],['quality_procedure','품질절차서'],
    ['quality_instruction','품질지침서'],['quality_form','작성용 품질문서'],
    ['sample','시료채취팀 · 시료채취기록지'],['lab_hub','시료분석팀 대분류'],
    ['lab_analysis','시료 분석'],['filter_ledger','먼지 여지관리대장'],['reagent_ledger','시약관리대장'],
    ['repository','드림포이엔 자료실'],['notice','공지사항'],['method','법률변경'],['board','기타게시판']
  ];
  const TITLES=['대표이사','사장','이사','부장','차장','과장','대리','주임','사원'];
  const TEAMS=['관리','사무실','1팀','2팀','LAB'];
  let employeeRows=[];
  const employeeOpenIds=new Set();

  function currentUser(){try{return typeof dfCloudUser!=='undefined'?dfCloudUser:null}catch(_){return null}}
  function currentProfile(){try{return typeof dfCloudProfile!=='undefined'?dfCloudProfile:null}catch(_){return null}}
  function client(){try{return typeof dfSupabase!=='undefined'?dfSupabase:null}catch(_){return null}}
  function sensitive(key){return key==='billing'||key==='quality_edit'}

  function optionHtml(values,current,emptyLabel='미지정'){
    const list=[...values];
    if(current&&!list.includes(current))list.unshift(current);
    return `<option value="">${esc(emptyLabel)}</option>`+list.map(value=>
      `<option value="${esc(value)}" ${String(current||'')===value?'selected':''}>${esc(value)}</option>`
    ).join('');
  }

  function roleOptions(current){
    return [['staff','직원'],['admin','관리자']].map(([value,label])=>
      `<option value="${value}" ${String(current||'staff')===value?'selected':''}>${label}</option>`
    ).join('');
  }

  function updateEmployeeTeamFilter(rows){
    const select=byId('dfEmployeeTeamFilter');if(!select)return;
    const old=select.value||'all';
    const teams=[...new Set(rows.map(row=>text(row.team)).filter(Boolean))].sort(collator.compare);
    select.innerHTML='<option value="all">전체 소속</option>'+teams.map(team=>`<option value="${esc(team)}">${esc(team)}</option>`).join('');
    select.value=[...select.options].some(option=>option.value===old)?old:'all';
  }

  function employeeCompare(mode){
    return (a,b)=>{
      const name=()=>collator.compare(text(a.name||a.email),text(b.name||b.email));
      if(mode==='team_name')return collator.compare(text(a.team)||'zzzz',text(b.team)||'zzzz')||name();
      if(mode==='role_name')return collator.compare(a.role==='admin'?'0':'1',b.role==='admin'?'0':'1')||name();
      return name();
    };
  }

  function employeeCard(row){
    const user=currentUser(),self=String(row.id)===String(user?.id),permissions=row.access_permissions||row.board_permissions||{};
    const checked=key=>sensitive(key)?permissions[key]===true:(row.active?permissions[key]!==false:permissions[key]===true);
    const status=row.active?'사용중':'승인대기';
    const open=!row.active||employeeOpenIds.has(String(row.id));
    const resetLabel=self?'내 비밀번호 변경':'재설정 메일 보내기';
    const resetAttr=self?'data-emp-own-password':'data-emp-reset-password';
    return `<details class="df-employee-card df-employee-person-card ${row.active?'active':'pending'}" data-employee-id="${esc(row.id)}" ${open?'open':''}>
      <summary class="df-employee-person-summary">
        <span class="df-employee-person-main"><strong>${esc(row.name||'이름 없음')}</strong><small>${esc(row.email||row.id)}</small></span>
        <span class="df-employee-person-badges"><i class="status">${status}</i>${self?'<i class="self">내 계정</i>':''}<i>${esc(row.job_title||'직급 미지정')}</i><i>${esc(row.team||'소속 미지정')}</i><i>${row.role==='admin'?'관리자':'직원'}</i></span>
        <span class="df-employee-open-label">설정 열기</span>
      </summary>
      <div class="df-employee-card-body">
        <div class="df-employee-basic-grid">
          <div class="df-employee-field"><label>권한</label><select data-emp-role ${self?'disabled':''}>${roleOptions(row.role)}</select></div>
          <div class="df-employee-field"><label>소속</label><select data-emp-team>${optionHtml(TEAMS,row.team)}</select></div>
          <div class="df-employee-field"><label>직급</label><select data-emp-title>${optionHtml(TITLES,row.job_title)}</select></div>
        </div>
        <details class="df-access-details" ${!row.active?'open':''}>
          <summary>${row.active?'메뉴별 열람·수정 권한':'승인과 함께 허용할 메뉴 선택'}</summary>
          <div class="df-access-grid">${ACCESS.map(([key,label])=>`<label class="${sensitive(key)?'df-quality-edit-access':''}"><input type="checkbox" data-access="${key}" ${checked(key)?'checked':''}> ${label}${sensitive(key)?'<small> (별도 권한)</small>':''}</label>`).join('')}</div>
        </details>
        <div class="df-password-guidance">비밀번호는 관리자에게 표시되지 않습니다. 본인은 직접 변경하고, 분실 시 등록 이메일로 재설정합니다.</div>
        <div class="df-employee-actions">
          <button type="button" data-emp-save>설정 저장</button>
          ${row.active?`<button type="button" class="disable" data-emp-disable ${self?'disabled':''}>사용중지</button>`:'<button type="button" class="approve" data-emp-approve>선택 권한으로 승인</button>'}
          <button type="button" class="password" ${resetAttr}="${esc(row.id)}">${resetLabel}</button>
        </div>
      </div>
    </details>`;
  }

  function employeeGroup(key,label,rows){
    if(!rows.length)return '';
    return `<section class="df-employee-group" data-employee-group="${key}"><h2>${label}<span>${rows.length}명</span></h2><div class="df-employee-group-list">${rows.map(employeeCard).join('')}</div></section>`;
  }

  function renderEmployees(rows=employeeRows){
    employeeRows=Array.isArray(rows)?rows.slice():[];
    const list=byId('dfEmployeesList');if(!list)return;
    updateEmployeeTeamFilter(employeeRows);
    const pending=employeeRows.filter(row=>!row.active).length,active=employeeRows.filter(row=>!!row.active).length;
    if(byId('dfEmployeesTotal'))byId('dfEmployeesTotal').textContent=String(employeeRows.length);
    if(byId('dfEmployeesPending'))byId('dfEmployeesPending').textContent=String(pending);
    if(byId('dfEmployeesActive'))byId('dfEmployeesActive').textContent=String(active);
    const badge=byId('dfEmployeePendingBadge');if(badge){badge.textContent=String(pending);badge.hidden=!pending}

    const query=text(byId('dfEmployeesSearch')?.value).toLocaleLowerCase('ko');
    const status=byId('dfEmployeeStatusFilter')?.value||'all';
    const team=byId('dfEmployeeTeamFilter')?.value||'all';
    const sort=byId('dfEmployeeSort')?.value||'name_asc';
    const filtered=employeeRows.filter(row=>{
      if(status==='active'&&!row.active)return false;
      if(status==='pending'&&row.active)return false;
      if(team!=='all'&&text(row.team)!==team)return false;
      const hay=[row.name,row.email,row.team,row.job_title,row.role==='admin'?'관리자':'직원'].map(text).join(' ').toLocaleLowerCase('ko');
      return !query||hay.includes(query);
    }).sort(employeeCompare(sort));

    const result=byId('dfEmployeesFilterResult');
    if(result)result.innerHTML=`전체 <strong>${employeeRows.length}</strong>명 중 <strong>${filtered.length}</strong>명 표시 · 이름을 누르면 권한 설정이 열립니다.`;
    if(!filtered.length){list.innerHTML='<div class="df-employees-empty">조건에 맞는 직원이 없습니다.</div>';return}
    const pendingRows=filtered.filter(row=>!row.active),activeRows=filtered.filter(row=>!!row.active);
    list.innerHTML=employeeGroup('pending','승인대기',pendingRows)+employeeGroup('active','사용중 직원',activeRows);
    list.querySelectorAll('[data-employee-id]').forEach(card=>{
      const id=card.dataset.employeeId;
      card.addEventListener('toggle',()=>card.open?employeeOpenIds.add(id):employeeOpenIds.delete(id));
      card.querySelector('[data-emp-save]')?.addEventListener('click',()=>window.dfEmployeesSaveCard?.(card,id,false));
      card.querySelector('[data-emp-approve]')?.addEventListener('click',()=>window.dfEmployeesSaveCard?.(card,id,true));
      card.querySelector('[data-emp-disable]')?.addEventListener('click',()=>window.dfEmployeesDisable?.(id));
      card.querySelector('[data-emp-own-password]')?.addEventListener('click',()=>openPasswordModal());
      card.querySelector('[data-emp-reset-password]')?.addEventListener('click',event=>sendResetMail(id,event.currentTarget));
    });
  }

  function bindEmployeeUi(){
    if(typeof window.dfEmployeesRender==='function')window.dfEmployeesRender=renderEmployees;
    ['dfEmployeeStatusFilter','dfEmployeeTeamFilter','dfEmployeeSort'].forEach(id=>byId(id)?.addEventListener('change',()=>renderEmployees()));
    let searchTimer=0;
    byId('dfEmployeesSearch')?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderEmployees(),70)});
    byId('dfEmployeesClear')?.addEventListener('click',()=>{
      if(byId('dfEmployeesSearch'))byId('dfEmployeesSearch').value='';
      if(byId('dfEmployeeStatusFilter'))byId('dfEmployeeStatusFilter').value='all';
      if(byId('dfEmployeeTeamFilter'))byId('dfEmployeeTeamFilter').value='all';
      if(byId('dfEmployeeSort'))byId('dfEmployeeSort').value='name_asc';
      renderEmployees();saveView('employees');
    });
  }

  function passwordModal(){
    let modal=byId('dfPasswordModal');if(modal)return modal;
    modal=document.createElement('div');
    modal.id='dfPasswordModal';modal.className='company-modal-backdrop';modal.hidden=true;
    modal.innerHTML=`<div class="company-modal df-password-modal" role="dialog" aria-modal="true" aria-labelledby="dfPasswordModalTitle">
      <div class="company-modal-head"><div><h2 id="dfPasswordModalTitle">내 비밀번호 변경</h2><small id="dfPasswordModalSub">현재 로그인한 본인 계정의 비밀번호만 변경합니다.</small></div><button type="button" class="company-modal-close" data-password-close>×</button></div>
      <div class="df-password-form">
        <label>새 비밀번호<input type="password" id="dfNewPassword" minlength="6" autocomplete="new-password" placeholder="6자 이상"></label>
        <label>새 비밀번호 확인<input type="password" id="dfNewPasswordConfirm" minlength="6" autocomplete="new-password" placeholder="한 번 더 입력"></label>
        <label class="df-password-show"><input type="checkbox" id="dfPasswordShow"> 비밀번호 표시</label>
        <div class="df-password-note">비밀번호는 시스템 관리자에게도 표시되지 않습니다. 변경 후에는 새 비밀번호로 로그인하세요.</div>
        <div class="df-password-message" id="dfPasswordMessage"></div>
        <div class="df-doc-editor-actions"><button type="button" class="company-btn secondary" data-password-close>취소</button><button type="button" class="company-btn primary" id="dfPasswordSave">비밀번호 변경</button></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-password-close]').forEach(button=>button.addEventListener('click',closePasswordModal));
    modal.addEventListener('click',event=>{if(event.target===modal)closePasswordModal()});
    byId('dfPasswordShow').addEventListener('change',event=>{
      const type=event.target.checked?'text':'password';byId('dfNewPassword').type=type;byId('dfNewPasswordConfirm').type=type;
    });
    byId('dfPasswordSave').addEventListener('click',savePassword);
    byId('dfNewPasswordConfirm').addEventListener('keydown',event=>{if(event.key==='Enter')savePassword()});
    return modal;
  }

  function passwordMessage(message,type=''){
    const box=byId('dfPasswordMessage');if(!box)return;
    box.textContent=message||'';box.className='df-password-message'+(type?' '+type:'');
  }

  function openPasswordModal({recovery=false}={}){
    const modal=passwordModal();
    byId('dfPasswordModalTitle').textContent=recovery?'비밀번호 재설정':'내 비밀번호 변경';
    byId('dfPasswordModalSub').textContent=recovery?'재설정할 새 비밀번호를 입력하세요.':'현재 로그인한 본인 계정의 비밀번호만 변경합니다.';
    byId('dfNewPassword').value='';byId('dfNewPasswordConfirm').value='';byId('dfPasswordShow').checked=false;
    byId('dfNewPassword').type='password';byId('dfNewPasswordConfirm').type='password';passwordMessage('');
    modal.hidden=false;modal.style.display='flex';setTimeout(()=>byId('dfNewPassword')?.focus(),30);
  }

  function closePasswordModal(){
    const modal=byId('dfPasswordModal');if(modal){modal.hidden=true;modal.style.display='none'}
  }

  async function savePassword(){
    const supabase=client(),password=byId('dfNewPassword')?.value||'',confirmPassword=byId('dfNewPasswordConfirm')?.value||'';
    if(!supabase)return passwordMessage('온라인 로그인 연결을 확인해주세요.','bad');
    if(password.length<6)return passwordMessage('새 비밀번호를 6자 이상 입력해주세요.','bad');
    if(password!==confirmPassword)return passwordMessage('비밀번호 확인이 일치하지 않습니다.','bad');
    const button=byId('dfPasswordSave');button.disabled=true;button.textContent='변경 중...';passwordMessage('안전하게 변경하는 중입니다.');
    try{
      const {error}=await supabase.auth.updateUser({password});if(error)throw error;
      passwordMessage('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.','ok');
      try{
        const url=new URL(location.href);url.hash='';url.searchParams.delete('code');url.searchParams.delete('type');
        history.replaceState(null,document.title,url.pathname+url.search);
      }catch(_){ }
      setTimeout(closePasswordModal,1200);
    }catch(error){passwordMessage('비밀번호 변경 실패: '+(error.message||error),'bad')}
    finally{button.disabled=false;button.textContent='비밀번호 변경'}
  }

  async function sendResetMail(id,button){
    const row=employeeRows.find(item=>String(item.id)===String(id)),supabase=client();
    if(!row?.email)return alert('등록된 이메일이 없어 재설정 메일을 보낼 수 없습니다.');
    if(!supabase)return alert('온라인 로그인 연결을 확인해주세요.');
    if(!confirm(`${row.name||'선택 직원'}에게 비밀번호 재설정 메일을 보낼까요?\n\n${row.email}\n\n※ 이 주소가 로그인 이메일과 같아야 합니다.`))return;
    button.disabled=true;const old=button.textContent;button.textContent='메일 전송 중...';
    try{
      const redirectTo=/^https?:$/.test(location.protocol)?location.origin+location.pathname:undefined;
      const options=redirectTo?{redirectTo}:undefined;
      const {error}=await supabase.auth.resetPasswordForEmail(row.email,options);if(error)throw error;
      alert(`${row.name||'직원'}님의 등록 이메일로 재설정 안내를 보냈습니다.\n메일의 링크에서 새 비밀번호를 설정하면 됩니다.`);
    }catch(error){alert('재설정 메일 전송 실패\n'+(error.message||error))}
    finally{button.disabled=false;button.textContent=old}
  }

  function ensureProfilePasswordButton(){
    const modal=byId('dfProfileModal'),actions=modal?.querySelector('.df-doc-editor-actions');if(!modal||!actions)return;
    if(!byId('dfProfileLoginEmail')){
      const contact=byId('dfProfileEmail')?.closest('label');
      const label=document.createElement('label');label.innerHTML='로그인 이메일<input id="dfProfileLoginEmail" readonly>';
      if(contact)contact.before(label);else modal.querySelector('.df-profile-form')?.prepend(label);
    }
    if(byId('dfProfileLoginEmail'))byId('dfProfileLoginEmail').value=currentUser()?.email||'';
    if(!byId('dfProfilePasswordChange')){
      const button=document.createElement('button');button.type='button';button.className='company-btn secondary';button.id='dfProfilePasswordChange';button.textContent='비밀번호 변경';
      button.addEventListener('click',()=>openPasswordModal());
      const save=byId('dfProfileSave');save?actions.insertBefore(button,save):actions.appendChild(button);
    }
    const note=modal.querySelector('.df-profile-note');
    if(note&&!note.dataset.passwordNote){note.dataset.passwordNote='1';note.insertAdjacentHTML('beforeend','<br>비밀번호는 위 <b>비밀번호 변경</b>에서 본인이 직접 바꿀 수 있습니다.')}
  }

  function bindPasswordRecovery(){
    let hooked=false,attempts=0;
    const recoveryInUrl=()=>/(?:[?#&]type=recovery\b)/i.test(location.href);
    const timer=setInterval(()=>{
      attempts+=1;const supabase=client();
      if(supabase&&!hooked){
        hooked=true;
        supabase.auth.onAuthStateChange(event=>{
          if(event==='PASSWORD_RECOVERY')setTimeout(()=>openPasswordModal({recovery:true}),0);
        });
        if(recoveryInUrl())setTimeout(()=>openPasswordModal({recovery:true}),450);
      }
      if(hooked||attempts>40)clearInterval(timer);
    },250);
  }

  function bindProfileEnhancement(){
    document.addEventListener('click',event=>{
      if(event.target.closest?.('#dfProfileOpen'))setTimeout(ensureProfilePasswordButton,0);
    },true);
    const observer=new MutationObserver(()=>ensureProfilePasswordButton());
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · UI STATE & STAFF`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    bindStatePreservation();bindEmployeeUi();bindProfileEnhancement();bindPasswordRecovery();
    restoreView(activeView(),{dispatch:false});applyVersion();
    [180,800,1900,2800].forEach(delay=>setTimeout(applyVersion,delay));
    window.DF_UI_STATE={version:VERSION,save:saveView,restore:restoreView,capture:()=>saveView(activeView())};
    window.DF_PASSWORD={open:openPasswordModal};
    window.DF_DIAG?.info('UI-STATE-STAFF-12037190','다운로드 필터 보존·직원 접기·비밀번호 변경 준비 완료','DB 구조 변경 없음');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
