/* DREAMFOREN v120.37.25.0 · 원본 HWPX 계약문서 작성 */
'use strict';
  const permit=action=>window.DFMenuPermissions?window.DFMenuPermissions.can('contract',action,true):true;
  const requireAction=action=>{if(permit(action))return true;alert('계약문서 '+({create:'작성',update:'수정',delete:'삭제'}[action]||action)+' 권한이 없습니다.');return false;};

(function dfContractDocuments(){
  const TABLE='contract_document_packages';
  const VERSION='v120.37.25.0';
  const ASSET_ROOT='assets/contract_docs/';
  const PROVIDER={
    name:'주식회사 드림포이엔',
    noticeName:'드림포이엔',
    representative:'하준명',
    bizNo:'529-88-02491',
    registrationNo:'대기(제 20호)',
    phone:'031-420-2156',
    contractPhone:'031-420-2156 ~ 8',
    address:'경기도 안양시 만안구 덕천로 152번길 25, B동 2005호',
    noticeAddress:'경기 안양시 만안구 덕천로152번길 25 (안양동) 비동 2005호'
  };
  const DEFAULT_EQUIPMENT=[
    {name:'입자상 샘플러',maker:'APEX Instruments',model:'KXC-572-O',note:''},
    {name:'입자상 샘플러',maker:'토탈코리아',model:'JEUS-500',note:''},
    {name:'휴대용가스분석기',maker:'MRU',model:'Optima 7',note:''},
    {name:'휴대용가스분석기',maker:'MRU',model:'Optima 7K',note:''},
    {name:'수분량 자동측정기',maker:'Junray',model:'HM-100',note:''},
    {name:'수분량 자동측정기',maker:'Junray',model:'HM-100',note:''},
    {name:'총탄화수소 측정기',maker:'LDARtools',model:'4200',note:''},
    {name:'총탄화수소 측정기',maker:'Junray',model:'FID6000',note:''}
  ];
  let packages=[];
  let visiblePackages=[];
  let loaded=false;
  let activeSummary='all';
  let editorModal=null;
  let previewModal=null;
  let previewData=null;
  let previewType='contract';
  let editorDataSeed=null;
  let documentBusy=false;

  const byId=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr=esc;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const today=()=>new Date().toISOString().slice(0,10);
  const money=v=>Number(String(v??0).replace(/[^0-9.-]/g,''))||0;
  const moneyText=v=>money(v).toLocaleString('ko-KR')+'원';
  const dateText=v=>String(v||'').slice(0,10)||'-';
  const stamp=()=>new Date().toISOString();
  function db(){try{return dfSupabase||null}catch(_){return null}}
  function cloudUser(){try{return dfCloudUser||null}catch(_){return null}}
  function cloudProfile(){try{return dfCloudProfile||null}catch(_){return null}}
  function asset(path){return new URL(ASSET_ROOT+path,location.href).href}
  function makeDocumentNo(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `DFEN-CD-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`}
  function monthCount(a,b){if(!a||!b)return '';const s=new Date(a+'T00:00:00'),e=new Date(b+'T00:00:00');if(Number.isNaN(+s)||Number.isNaN(+e)||e<s)return '';return (e.getFullYear()-s.getFullYear())*12+e.getMonth()-s.getMonth()}
  function defaultData(){
    const d=today(),year=d.slice(0,4);
    return {
      package_name:'',document_no:makeDocumentNo(),status:'draft',receipt_no:'',receipt_date:'',management_agency:'',
      client_name:'',client_short_name:'',client_address:'',client_representative:'',client_biz_no:'',client_phone:'',
      service_name:'대기자가측정 위탁용역',contract_date:d,start_date:d,end_date:`${year}-12-31`,duration_months:'',site_address:'',
      contract_amount:'',amount_korean:'',vat_mode:'별도',contract_guarantee:'',advance_payment:'',penalty_rate:'',signing_date:d,
      contract_management_required:'yes',fee_basis:'반기 측정',plan_payment_terms:'측정완료 후 성적서 발행 시',
      plan_year_month:d.slice(0,7),team_text:'측정팀 2인/1조',facilities:[{emission:'',prevention:'',cycle:'반기 1회',items:'먼지, THC',quantity:'1'}],
      equipment:clone(DEFAULT_EQUIPMENT),notice_items_cycle:'',notice_analysis_fee:'',notice_remark:'',notice_authority:'시·도지사 / 대도시 시장',
      jurisdiction:'안양',business_field:'대기',business_grade:'5종',status_note:''
    };
  }
  function normalizeData(row){
    const source=row?.data&&typeof row.data==='object'?row.data:row||{};
    const out={...defaultData(),...clone(source)};
    ['package_name','document_no','status','client_name','contract_date','start_date','end_date'].forEach(k=>{if(row?.[k]!==undefined&&row?.[k]!==null)out[k]=row[k]});
    out.facilities=Array.isArray(source.facilities)?clone(source.facilities):defaultData().facilities;
    out.equipment=Array.isArray(source.equipment)?clone(source.equipment):clone(DEFAULT_EQUIPMENT);
    if(String(out.duration_months??'').trim()==='')out.duration_months=monthCount(out.start_date,out.end_date);
    return out;
  }
  function setMessage(text,type=''){
    const el=byId('dfcdNotice');if(!el)return;el.textContent=text;el.className='dfcd-notice'+(type?' '+type:'');
  }

  function init(){
    const view=byId('dfViewContract'),ledger=view?.querySelector('.contract-page');
    if(!view||!ledger||byId('dfcdContractTabs'))return;
    const tabs=document.createElement('div');tabs.id='dfcdContractTabs';tabs.className='dfcd-contract-tabs';tabs.innerHTML=`<button type="button" class="active" data-dfcd-contract-tab="ledger">계약 현황</button><button type="button" data-dfcd-contract-tab="documents">계약문서 작성</button>`;
    const page=document.createElement('div');page.id='dfcdPage';page.className='dfcd-page';page.hidden=true;page.innerHTML=`
      <header class="dfcd-head"><div><h1>계약문서 작성 <span class="dfcd-version">${VERSION}</span></h1><p>입력한 내용으로 표준계약서와 과업수행계획서 HWPX를 만듭니다.<br>원본의 표·서식·본문을 유지하며, 내려받은 한글 파일에서 수정하고 인쇄할 수 있습니다.</p></div><div class="dfcd-head-actions"><button type="button" class="company-btn secondary" id="dfcdExportVisible">현재 목록 현황 Excel</button><button type="button" class="company-btn primary" data-df-menu-module="contract" data-df-menu-action="create" data-df-menu-legacy="true" id="dfcdNew">+ 문서세트 작성</button></div></header>
      <div class="dfcd-notice" id="dfcdNotice">계약문서 전용 DB를 확인하고 있습니다.</div>
      <section class="dfcd-summary"><button type="button" class="active" data-dfcd-summary="all"><span>전체 문서세트</span><strong id="dfcdCountAll">0</strong></button><button type="button" data-dfcd-summary="draft"><span>작성중</span><strong id="dfcdCountDraft">0</strong></button><button type="button" data-dfcd-summary="complete"><span>작성완료</span><strong id="dfcdCountComplete">0</strong></button></section>
      <div class="dfcd-toolbar"><input id="dfcdSearch" type="search" placeholder="관리명 · 업체명 · 문서번호 · 용역명 검색"><select id="dfcdStatus"><option value="all">전체 상태</option><option value="draft">작성중</option><option value="complete">작성완료</option></select><select id="dfcdSort"><option value="updated_desc">최신 수정순</option><option value="created_desc">최신 등록순</option><option value="created_asc">오래된 등록순</option><option value="name_asc">이름순</option><option value="contract_desc">최근 계약일순</option></select><select id="dfcdMonth"><option value="all">전체 월</option>${Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${i+1}월</option>`).join('')}</select><button type="button" class="company-btn secondary" id="dfcdRefresh">새로고침</button><button type="button" class="company-btn secondary" id="dfcdOriginals">원본양식</button></div>
      <div class="dfcd-list" id="dfcdList"><div class="dfcd-empty">문서 목록을 준비하고 있습니다.</div></div>`;
    view.insertBefore(tabs,ledger);view.appendChild(page);
    tabs.addEventListener('click',e=>{const b=e.target.closest('[data-dfcd-contract-tab]');if(b)switchContractTab(b.dataset.dfcdContractTab)});
    byId('dfcdNew').addEventListener('click',()=>openEditor());
    byId('dfcdRefresh').addEventListener('click',()=>loadPackages(true));
    byId('dfcdExportVisible').addEventListener('click',()=>exportStatusExcel(visiblePackages));
    byId('dfcdOriginals').addEventListener('click',openOriginals);
    ['dfcdSearch','dfcdStatus','dfcdSort','dfcdMonth'].forEach(id=>byId(id).addEventListener(id==='dfcdSearch'?'input':'change',renderList));
    page.querySelector('.dfcd-summary').addEventListener('click',e=>{const b=e.target.closest('[data-dfcd-summary]');if(!b)return;activeSummary=b.dataset.dfcdSummary;byId('dfcdStatus').value=activeSummary;renderList()});
    byId('dfcdList').addEventListener('click',handleListAction);
    window.dfContractDocumentsOpen=()=>{if(typeof window.dfContractNavigate==='function')return window.dfContractNavigate('documents');try{window.v62ShowOnly?.('contract')}catch(_){}switchContractTab('documents')};
    window.dfContractDocumentsSelectTab=switchContractTab;
    window.DF_DIAG?.info('CONTRACT-DOCS-1203712','독립 계약문서 탭 준비 완료','기존 계약·업체현황 무연동');
  }
  function switchContractTab(name){
    const view=byId('dfViewContract'),ledger=view?.querySelector('.contract-page'),page=byId('dfcdPage');if(!ledger||!page)return;
    const docs=name==='documents';ledger.hidden=docs;ledger.style.display=docs?'none':'';page.hidden=!docs;page.style.display=docs?'block':'none';
    byId('dfcdContractTabs')?.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.dfcdContractTab===name));
    window.dispatchEvent(new CustomEvent('df-contract-documents-tab-change',{detail:{tab:docs?'documents':'ledger'}}));
    if(docs)loadPackages(false);else if(typeof window.dfV68LoadContracts==='function')window.dfV68LoadContracts();
  }

  async function loadPackages(force=false){
    if(loaded&&!force){renderList();return}
    const client=db(),user=cloudUser();
    if(!client||!user){setMessage('로그인 연결을 기다리고 있습니다. 잠시 후 새로고침을 눌러주세요.');return}
    setMessage('계약문서 전용 DB에서 목록을 불러오는 중입니다.');
    try{
      const {data,error}=await client.from(TABLE).select('*').order('updated_at',{ascending:false});
      if(error)throw error;
      packages=Array.isArray(data)?data:[];loaded=true;setMessage(`독립 문서세트 ${packages.length}건을 불러왔습니다. 기존 계약·업체현황과 연결되지 않습니다.`,'ok');renderList();
    }catch(e){
      const msg=String(e?.message||e);setMessage(msg.includes(TABLE)||/does not exist|schema cache|42P01/i.test(msg)?'전용 DB 설치가 필요합니다. SQL_v120_37_12_contract_documents.sql을 Supabase에서 한 번 실행해주세요.':'문서 목록을 불러오지 못했습니다: '+msg,'bad');
      packages=[];visiblePackages=[];renderList();
    }
  }
  function filterAndSort(){
    const q=String(byId('dfcdSearch')?.value||'').trim().toLowerCase(),status=byId('dfcdStatus')?.value||'all',month=byId('dfcdMonth')?.value||'all',sort=byId('dfcdSort')?.value||'updated_desc';
    activeSummary=status;
    const list=packages.filter(row=>{
      const d=normalizeData(row),hay=[d.package_name,d.client_name,d.document_no,d.service_name,d.client_address,d.site_address].join(' ').toLowerCase();
      return (!q||hay.includes(q))&&(status==='all'||d.status===status)&&(month==='all'||String(d.contract_date||'').slice(5,7)===month);
    });
    list.sort((a,b)=>{
      const da=normalizeData(a),dbb=normalizeData(b);
      if(sort==='created_desc')return String(b.created_at||'').localeCompare(String(a.created_at||''));
      if(sort==='created_asc')return String(a.created_at||'').localeCompare(String(b.created_at||''));
      if(sort==='name_asc')return String(da.client_name||da.package_name).localeCompare(String(dbb.client_name||dbb.package_name),'ko');
      if(sort==='contract_desc')return String(dbb.contract_date||'').localeCompare(String(da.contract_date||''));
      return String(b.updated_at||'').localeCompare(String(a.updated_at||''));
    });
    return list;
  }
  function renderList(){
    const counts={all:packages.length,draft:0,complete:0};packages.forEach(x=>{const s=normalizeData(x).status;if(counts[s]!==undefined)counts[s]++});
    byId('dfcdCountAll').textContent=counts.all;byId('dfcdCountDraft').textContent=counts.draft;byId('dfcdCountComplete').textContent=counts.complete;
    byId('dfcdContractTabs')?.querySelectorAll('[data-dfcd-summary]');
    document.querySelectorAll('[data-dfcd-summary]').forEach(b=>b.classList.toggle('active',b.dataset.dfcdSummary===(byId('dfcdStatus')?.value||'all')));
    visiblePackages=filterAndSort();const host=byId('dfcdList');if(!host)return;
    if(!visiblePackages.length){host.innerHTML=`<div class="dfcd-empty">${packages.length?'검색 조건에 맞는 문서세트가 없습니다.':'저장된 계약문서 세트가 없습니다. 위의 ‘문서세트 작성’으로 시작해주세요.'}</div>`;return}
    host.innerHTML=`<table class="dfcd-table"><colgroup><col style="width:74px"><col style="width:230px"><col style="width:92px"><col style="width:176px"><col style="width:105px"><col style="width:176px"><col style="width:110px"><col style="width:304px"></colgroup><thead><tr><th>상태</th><th>관리명 / 업체명</th><th>계약일</th><th>과업기간</th><th>계약금액</th><th>문서번호</th><th>최근 수정</th><th>관리</th></tr></thead><tbody>${visiblePackages.map(row=>{
      const d=normalizeData(row),complete=d.status==='complete';return `<tr><td><span class="dfcd-badge ${complete?'complete':''}">${complete?'작성완료':'작성중'}</span></td><td class="dfcd-title-cell"><strong>${esc(d.package_name||d.client_name)}</strong><small>${esc(d.client_name||'-')} · ${esc(d.service_name||'-')}</small></td><td class="dfcd-date">${esc(dateText(d.contract_date))}</td><td class="dfcd-date">${esc(dateText(d.start_date))} ~ ${esc(dateText(d.end_date))}</td><td class="dfcd-money">${String(d.contract_amount??'').trim()?esc(moneyText(d.contract_amount)):'-'}</td><td>${esc(d.document_no||'-')}</td><td class="dfcd-date">${esc(String(row.updated_at||row.created_at||'').slice(0,10)||'-')}</td><td><div class="dfcd-actions"><button type="button" data-df-menu-module="contract" data-df-menu-action="update" data-df-menu-legacy="true" data-dfcd-edit="${attr(row.id)}">수정</button><button type="button" class="primary" data-dfcd-preview="${attr(row.id)}">내용 확인</button><button type="button" data-dfcd-hwpx="${attr(row.id)}">HWPX 2종</button><button type="button" class="danger" data-df-menu-module="contract" data-df-menu-action="delete" data-df-menu-legacy="true" data-dfcd-delete="${attr(row.id)}">삭제</button></div></td></tr>`}).join('')}</tbody></table>`;
  }
  function findPackage(id){return packages.find(x=>String(x.id)===String(id))}
  function handleListAction(e){
    const edit=e.target.closest('[data-dfcd-edit]'),preview=e.target.closest('[data-dfcd-preview]'),hwpx=e.target.closest('[data-dfcd-hwpx]'),del=e.target.closest('[data-dfcd-delete]');
    if(edit)return openEditor(findPackage(edit.dataset.dfcdEdit));
    if(preview)return openPreview(normalizeData(findPackage(preview.dataset.dfcdPreview)));
    if(hwpx)return downloadHwpx(normalizeData(findPackage(hwpx.dataset.dfcdHwpx)),['contract','plan'],hwpx);
    if(del)return deletePackage(del.dataset.dfcdDelete);
  }
  function openOriginals(){
    const old=byId('dfcdOriginalModal');if(old)old.remove();const wrap=document.createElement('div');wrap.id='dfcdOriginalModal';wrap.className='dfcd-modal-backdrop';wrap.innerHTML=`<div class="dfcd-modal dfcd-original-modal"><div class="dfcd-modal-head"><div><h2>원본양식</h2><p>표준계약서와 과업수행계획서는 제공하신 HWPX를 그대로 사용합니다.</p></div><button class="dfcd-close" type="button" aria-label="닫기">×</button></div><div class="dfcd-editor-body"><div class="dfcd-original-links"><a class="company-btn secondary" href="${asset('templates/standard_contract.hwpx')}" download="측정대행표준계약서_원본.hwpx">측정대행표준계약서 HWPX</a><a class="company-btn secondary" href="${asset('templates/task_plan.hwpx')}" download="과업수행계획서_원본.hwpx">과업수행계획서 HWPX</a><a class="company-btn secondary" href="${asset('templates/contract_notice.pdf')}" target="_blank" rel="noopener">계약체결사실통보서 PDF</a><a class="company-btn secondary" href="${asset('templates/contract_status_template.xlsx')}" download>측정대행 계약체결 현황 Excel</a></div></div></div>`;document.body.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('.dfcd-close'))wrap.remove()});
  }

  function inputValue(d,key){return attr(d[key]??'')}
  function selected(v,x){return String(v)===String(x)?' selected':''}
  function openEditor(row=null,{duplicate=false}={}){
    if(!requireAction(row?.id&&!duplicate?'update':'create'))return;
    if(editorModal)editorModal.remove();let d=normalizeData(row||defaultData()),rowId=row?.id||'';
    if(duplicate){rowId='';d.document_no=makeDocumentNo();d.package_name=(d.package_name||d.client_name)+' 복사본';d.status='draft'}
    editorDataSeed=clone(d);
    editorModal=document.createElement('div');editorModal.className='dfcd-modal-backdrop';editorModal.innerHTML=`<div class="dfcd-modal"><div class="dfcd-modal-head"><div><h2>${rowId?'계약문서 세트 수정':'새 계약문서 세트 작성'}</h2><p>공통정보 입력 → 원본 HWPX 생성 → 한글에서 최종 확인·인쇄</p></div><button class="dfcd-close" type="button">×</button></div><form id="dfcdEditorForm" data-row-id="${attr(rowId)}"><div class="dfcd-editor-body">
      <details open><summary>1. 관리정보 및 공통 계약정보</summary><div class="dfcd-detail-inner"><div class="dfcd-form-grid">
        <label class="span2">관리명<input name="package_name" value="${inputValue(d,'package_name')}" placeholder="예: ㈜가나다 2026 계약문서"></label><label>문서번호<input name="document_no" value="${inputValue(d,'document_no')}" required></label><label>작성상태<select name="status"><option value="draft"${selected(d.status,'draft')}>작성중</option><option value="complete"${selected(d.status,'complete')}>작성완료</option></select></label>
        <label class="span2">측정대행 의뢰기관(업체명)<input name="client_name" value="${inputValue(d,'client_name')}" required></label><label class="span2">본문용 업체 약칭<input name="client_short_name" value="${inputValue(d,'client_short_name')}" placeholder="긴 업체명은 짧게 입력"></label>
        <label class="span4">의뢰기관 사업장 주소<input name="client_address" value="${inputValue(d,'client_address')}"></label><label>대표자<input name="client_representative" value="${inputValue(d,'client_representative')}"></label><label>사업자등록번호<input name="client_biz_no" value="${inputValue(d,'client_biz_no')}"></label><label class="span2">전화번호<input name="client_phone" value="${inputValue(d,'client_phone')}"></label>
        <label class="span2">용역명<input name="service_name" value="${inputValue(d,'service_name')}" required></label><label>계약일<input name="contract_date" type="date" value="${inputValue(d,'contract_date')}" required></label><label>서명·통보일<input name="signing_date" type="date" value="${inputValue(d,'signing_date')}"></label>
        <label>착수일<input name="start_date" type="date" value="${inputValue(d,'start_date')}"></label><label>완수일<input name="end_date" type="date" value="${inputValue(d,'end_date')}"></label><label>완수기간(개월)<input name="duration_months" type="number" min="0" value="${inputValue(d,'duration_months')}"></label><label>과업계획서 연월<input name="plan_year_month" type="month" value="${inputValue(d,'plan_year_month')}"></label>
        <label class="span4">측정대상 사업장 소재지<input name="site_address" value="${inputValue(d,'site_address')}"></label>
        <label>계약금액<input name="contract_amount" inputmode="numeric" value="${inputValue(d,'contract_amount')}" placeholder="숫자만 입력"></label><label>한글 금액(선택)<input name="amount_korean" value="${inputValue(d,'amount_korean')}" placeholder="비우면 자동 변환"></label><label>VAT 표기<select name="vat_mode"><option value="별도"${selected(d.vat_mode,'별도')}>VAT 별도</option><option value="포함"${selected(d.vat_mode,'포함')}>VAT 포함</option></select></label><label>계약보증금<input name="contract_guarantee" value="${inputValue(d,'contract_guarantee')}"></label>
        <label>계약관리 대상<select name="contract_management_required"><option value="yes"${selected(d.contract_management_required,'yes')}>여</option><option value="no"${selected(d.contract_management_required,'no')}>부</option></select></label><label>금액 기준<input name="fee_basis" value="${inputValue(d,'fee_basis')}" placeholder="예: 반기 측정"></label><label class="span2">측정수수료 청구 시점<input name="plan_payment_terms" value="${inputValue(d,'plan_payment_terms')}" placeholder="측정완료 후 성적서 발행 시"></label><label>선금<input name="advance_payment" value="${inputValue(d,'advance_payment')}"></label><label>지체상금률<input name="penalty_rate" value="${inputValue(d,'penalty_rate')}"></label><label>접수번호<input name="receipt_no" value="${inputValue(d,'receipt_no')}"></label><label>접수일<input name="receipt_date" type="date" value="${inputValue(d,'receipt_date')}"></label><label class="span2">측정대행계약 관리기관명<input name="management_agency" value="${inputValue(d,'management_agency')}"></label>
      </div><p class="dfcd-help">업체명·주소·계약기간은 두 한글 문서에 함께 들어갑니다. 금액 기준은 계약서와 과업수행계획서에 동일하게 반영합니다. 원본에 있던 예시 업체·날짜·금액은 입력값으로 교체합니다.</p></div></details>
      <details open><summary>2. 과업 시설 및 측정내용</summary><div class="dfcd-detail-inner"><div class="dfcd-repeat-head"><strong>측정시설</strong><button type="button" id="dfcdAddFacility">+ 시설 추가</button></div><div class="dfcd-repeat-wrap"><table class="dfcd-repeat"><thead><tr><th>배출시설</th><th>방지시설</th><th style="width:110px">측정주기</th><th>측정항목</th><th style="width:70px">수량</th><th style="width:38px"></th></tr></thead><tbody id="dfcdFacilityRows"></tbody></table></div><div class="dfcd-form-grid" style="margin-top:12px"><label class="span2">측정 인원<input name="team_text" value="${inputValue(d,'team_text')}"></label><label class="span2">통보서 측정항목·주기(선택)<input name="notice_items_cycle" value="${inputValue(d,'notice_items_cycle')}" placeholder="비우면 시설내용으로 자동 작성"></label></div></div></details>
      <details><summary>3. 과업 장비현황</summary><div class="dfcd-detail-inner"><div class="dfcd-repeat-head"><strong>원본 장비표에 입력한 순서대로 반영합니다.</strong><button type="button" id="dfcdAddEquipment">+ 장비 추가</button></div><div class="dfcd-repeat-wrap"><table class="dfcd-repeat"><thead><tr><th>장비명</th><th>제조사</th><th>모델명</th><th>비고</th><th style="width:38px"></th></tr></thead><tbody id="dfcdEquipmentRows"></tbody></table></div></div></details>
      <details><summary>4. 통보서 및 계약체결 현황 항목</summary><div class="dfcd-detail-inner"><div class="dfcd-form-grid"><label>측정항목별 분석수수료 단가<input name="notice_analysis_fee" value="${inputValue(d,'notice_analysis_fee')}"></label><label>관할기관<input name="jurisdiction" value="${inputValue(d,'jurisdiction')}"></label><label>분야<input name="business_field" value="${inputValue(d,'business_field')}"></label><label>종별<input name="business_grade" value="${inputValue(d,'business_grade')}"></label><label class="span2">통보 대상기관<input name="notice_authority" value="${inputValue(d,'notice_authority')}"></label><label class="span2">계약현황 비고<input name="status_note" value="${inputValue(d,'status_note')}"></label><label class="span4">체결사실통보서 비고<input name="notice_remark" value="${inputValue(d,'notice_remark')}"></label></div></div></details>
    </div><div class="dfcd-modal-actions">${rowId?'<button type="button" class="company-btn danger" data-df-menu-module="contract" data-df-menu-action="delete" data-df-menu-legacy="true" id="dfcdDelete">삭제</button><button type="button" class="company-btn secondary" data-df-menu-module="contract" data-df-menu-action="create" data-df-menu-legacy="true" id="dfcdDuplicate">복사본 만들기</button>':''}<button type="button" class="company-btn secondary" id="dfcdPreviewDraft">입력내용 확인</button><button type="button" class="company-btn secondary" id="dfcdDownloadDraft">HWPX 2종 다운로드</button><button type="button" class="company-btn secondary dfcd-cancel">취소</button><button type="submit" class="company-btn primary" data-df-menu-module="contract" data-df-menu-action="${rowId?'update':'create'}" data-df-menu-legacy="true">저장</button><button type="button" class="company-btn primary" data-df-menu-module="contract" data-df-menu-action="${rowId?'update':'create'}" data-df-menu-legacy="true" id="dfcdSavePreview">저장 후 확인</button></div></form></div>`;
    document.body.appendChild(editorModal);renderFacilityRows(d.facilities);renderEquipmentRows(d.equipment);
    const form=byId('dfcdEditorForm');
    editorModal.addEventListener('click',e=>{if(e.target===editorModal||e.target.closest('.dfcd-close,.dfcd-cancel'))closeEditor()});
    byId('dfcdAddFacility').onclick=()=>{const current=collectFacilityRows();if(current.length>=100)return alert('시설은 최대 100개까지 입력할 수 있습니다.');current.push({emission:'',prevention:'',cycle:'',items:'',quantity:'1'});renderFacilityRows(current)};
    byId('dfcdAddEquipment').onclick=()=>{const current=collectEquipmentRows();if(current.length>=100)return alert('장비는 최대 100대까지 입력할 수 있습니다.');current.push({name:'',maker:'',model:'',note:''});renderEquipmentRows(current)};
    byId('dfcdFacilityRows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-row]');if(!b)return;const list=collectFacilityRows();list.splice(Number(b.dataset.removeRow),1);renderFacilityRows(list)});
    byId('dfcdEquipmentRows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-equipment]');if(!b)return;const list=collectEquipmentRows();list.splice(Number(b.dataset.removeEquipment),1);renderEquipmentRows(list)});
    ['start_date','end_date'].forEach(name=>form.elements[name].addEventListener('change',()=>{form.elements.duration_months.value=monthCount(form.elements.start_date.value,form.elements.end_date.value)}));
    form.addEventListener('submit',async e=>{e.preventDefault();await saveEditor(false)});
    byId('dfcdPreviewDraft').onclick=()=>{const data=collectEditorData();if(validateData(data))openPreview(data)};
    byId('dfcdSavePreview').onclick=()=>saveEditor(true);
    byId('dfcdDownloadDraft').onclick=e=>{const data=collectEditorData();if(validateData(data))downloadHwpx(data,['contract','plan'],e.currentTarget)};
    byId('dfcdDelete')?.addEventListener('click',()=>deletePackage(rowId));
    byId('dfcdDuplicate')?.addEventListener('click',()=>openEditor(row,{duplicate:true}));
  }
  function closeEditor(){editorModal?.remove();editorModal=null;editorDataSeed=null}
  function renderFacilityRows(list){const host=byId('dfcdFacilityRows');if(!host)return;host.innerHTML=(list||[]).map((x,i)=>`<tr data-facility-row><td><textarea data-key="emission" rows="2">${esc(x.emission||'')}</textarea></td><td><textarea data-key="prevention" rows="2">${esc(x.prevention||'')}</textarea></td><td><input data-key="cycle" value="${attr(x.cycle||'')}"></td><td><textarea data-key="items" rows="2">${esc(x.items||'')}</textarea></td><td><input data-key="quantity" value="${attr(x.quantity||'')}"></td><td><button type="button" class="remove" data-remove-row="${i}" aria-label="행 삭제">×</button></td></tr>`).join('')}
  function renderEquipmentRows(list){const host=byId('dfcdEquipmentRows');if(!host)return;host.innerHTML=(list||[]).map((x,i)=>`<tr data-equipment-row><td><input data-key="name" value="${attr(x.name||'')}"></td><td><input data-key="maker" value="${attr(x.maker||'')}"></td><td><input data-key="model" value="${attr(x.model||'')}"></td><td><textarea data-key="note" rows="2">${esc(x.note||'')}</textarea></td><td><button type="button" class="remove" data-remove-equipment="${i}" aria-label="행 삭제">×</button></td></tr>`).join('')}
  function collectRepeat(selector,keys){return [...document.querySelectorAll(selector)].map(row=>Object.fromEntries(keys.map(k=>[k,String(row.querySelector(`[data-key="${k}"]`)?.value||'').trim()]))) }
  function collectFacilityRows(){return collectRepeat('#dfcdFacilityRows [data-facility-row]',['emission','prevention','cycle','items','quantity'])}
  function collectEquipmentRows(){return collectRepeat('#dfcdEquipmentRows [data-equipment-row]',['name','maker','model','note'])}
  function collectEditorData(){
    const form=byId('dfcdEditorForm'),fd=new FormData(form),d={...defaultData(),...clone(editorDataSeed||{})};
    for(const [k,v] of fd.entries())d[k]=String(v).trim();
    d.facilities=collectFacilityRows().filter(x=>Object.values(x).some(Boolean));d.equipment=collectEquipmentRows().filter(x=>Object.values(x).some(Boolean));
    d.contract_amount=String(d.contract_amount??'').replace(/[,\s]/g,'');if(String(d.duration_months??'').trim()==='')d.duration_months=monthCount(d.start_date,d.end_date);
    d.client_short_name=d.client_short_name||d.client_name;d.site_address=d.site_address||d.client_address;d.package_name=d.package_name||`${d.client_name} 계약문서`;
    d.plan_year_month=d.plan_year_month||(d.contract_date||today()).slice(0,7);d.signing_date=d.signing_date||d.contract_date||today();
    if(!d.notice_items_cycle)d.notice_items_cycle=d.facilities.map(x=>[x.items,x.cycle].filter(Boolean).join(' / ')).filter(Boolean).join(', ');
    return d;
  }
  function validateData(d){if(!/^\d*$/.test(String(d.contract_amount??'').replace(/[,\s]/g,'')))return alert('계약금액은 0 이상의 정수로 입력해주세요. 소수점·음수·문자는 사용할 수 없습니다.'),false;if(!d.client_name)return alert('측정대행 의뢰기관(업체명)을 입력해주세요.'),false;if(!d.service_name)return alert('용역명을 입력해주세요.'),false;if(!d.contract_date)return alert('계약일을 입력해주세요.'),false;return true}
  async function saveEditor(openAfter){
    if(!requireAction(byId('dfcdEditorForm')?.dataset.rowId?'update':'create'))return null;
    const data=collectEditorData();if(!validateData(data))return null;const client=db(),user=cloudUser();if(!client||!user)return alert('로그인 및 DB 연결을 확인해주세요.');
    const form=byId('dfcdEditorForm'),id=form.dataset.rowId,payload={document_no:data.document_no,package_name:data.package_name,client_name:data.client_name,contract_date:data.contract_date||null,start_date:data.start_date||null,end_date:data.end_date||null,status:data.status,data,updated_at:stamp()};
    try{
      let result;if(id)result=await client.from(TABLE).update(payload).eq('id',id).select().single();else result=await client.from(TABLE).insert({...payload,created_by:user.id}).select().single();
      if(result.error)throw result.error;closeEditor();loaded=false;await loadPackages(true);setMessage(`‘${data.package_name}’ 문서세트를 저장했습니다.`,'ok');if(openAfter)openPreview(normalizeData(result.data||data));return result.data;
    }catch(e){const msg=String(e?.message||e);alert((/does not exist|schema cache|42P01/i.test(msg)?'전용 SQL을 먼저 실행해주세요.\n':'저장하지 못했습니다.\n')+msg);return null}
  }
  async function deletePackage(id){
    if(!requireAction('delete'))return;
    if(!id||!confirm('이 계약문서 세트를 삭제할까요?\n삭제한 작성용 문서세트는 복구할 수 없습니다.\n기존 계약관리·업체현황 자료에는 영향이 없습니다.'))return;
    const client=db();if(!client)return alert('DB 연결을 확인해주세요.');
    try{
      const {error}=await client.from(TABLE).delete().eq('id',id);if(error)throw error;
      closeEditor();loaded=false;await loadPackages(true);setMessage('계약문서 세트를 삭제했습니다.','ok');
    }catch(e){alert('삭제하지 못했습니다.\n'+(e?.message||e))}
  }

  function isHwpxType(type){return type==='contract'||type==='plan'}
  function safeFilename(value){return String(value||'계약문서').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,100)||'계약문서'}
  function saveBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  async function downloadHwpx(data,types=['contract','plan'],button=null){
    if(documentBusy)return;const engine=window.DF_CONTRACT_HWPX;
    if(!engine)return alert('한글 문서 생성 기능을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    const selectedTypes=types.filter(isHwpxType);if(!selectedTypes.length)return;
    const d=normalizeData(data),oldText=button?.textContent,oldDisabled=button?.disabled;documentBusy=true;if(button){button.disabled=true;button.textContent='한글 파일 생성 중…'}
    try{
      for(const type of selectedTypes){const result=engine.validate(type,d);if(!result.valid)throw Error(result.issues.join('\n'))}
      const files=[];for(const type of selectedTypes){const blob=await engine.generate(type,d);files.push({blob,name:safeFilename(d.client_name)+'_'+engine.info(type).title+'.hwpx'})}
      if(files.length===1)saveBlob(files[0].blob,files[0].name);
      else {if(!window.JSZip)throw Error('압축 기능을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');const zip=new window.JSZip();for(const file of files)zip.file(file.name,await file.blob.arrayBuffer());saveBlob(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),safeFilename(d.package_name||d.client_name)+'_계약문서_HWPX.zip')}
      setMessage('입력한 내용으로 HWPX를 내려받았습니다. 한글에서 최종 확인 후 인쇄해주세요.','ok');
    }catch(e){alert('한글 문서를 만들지 못했습니다.\n'+(e?.message||e))}
    finally{documentBusy=false;if(button){button.disabled=!!oldDisabled;button.textContent=oldText}}
  }
  function openPreview(data,type='contract'){
    previewModal?.remove();previewData=normalizeData(data);previewType=type;previewModal=document.createElement('div');previewModal.className='dfcd-modal-backdrop';previewModal.innerHTML=`<div class="dfcd-modal dfcd-preview-modal"><div class="dfcd-modal-head"><div><h2>${esc(previewData.package_name||previewData.client_name)}</h2><p id="dfcdPreviewDescription"></p></div><button class="dfcd-close" type="button" aria-label="닫기">×</button></div><div class="dfcd-preview-toolbar"><div class="dfcd-preview-tabs"><button type="button" data-preview-type="contract">표준계약서</button><button type="button" data-preview-type="plan">과업수행계획서</button><button type="button" data-preview-type="notice">체결사실통보서</button><button type="button" data-preview-type="status">계약체결 현황</button></div><a class="company-btn secondary" id="dfcdOriginalLink" target="_blank" rel="noopener">원본양식</a><button type="button" class="company-btn secondary" id="dfcdExcelOne">현황 Excel</button><button type="button" class="company-btn secondary" id="dfcdPrintCurrent">현재 문서 인쇄</button><button type="button" class="company-btn secondary" id="dfcdDownloadCurrent">현재 HWPX 다운로드</button><button type="button" class="company-btn primary" id="dfcdDownloadBoth">HWPX 2종 다운로드</button></div><div class="dfcd-preview-stage" id="dfcdPreviewStage"></div></div>`;document.body.appendChild(previewModal);
    previewModal.addEventListener('click',e=>{if(e.target===previewModal||e.target.closest('.dfcd-close')){previewModal.remove();previewModal=null;return}const b=e.target.closest('[data-preview-type]');if(b){previewType=b.dataset.previewType;renderPreview()}});
    byId('dfcdPrintCurrent').onclick=()=>printDocuments(previewData,[previewType]);byId('dfcdDownloadCurrent').onclick=e=>downloadHwpx(previewData,[previewType],e.currentTarget);byId('dfcdDownloadBoth').onclick=e=>downloadHwpx(previewData,['contract','plan'],e.currentTarget);byId('dfcdExcelOne').onclick=()=>exportStatusExcel([previewData]);renderPreview();
  }
  function summaryPairs(pairs){return `<dl class="dfcd-review-fields">${pairs.map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${String(value??'').trim()?esc(value):'<span class="dfcd-review-empty">미입력</span>'}</dd></div>`).join('')}</dl>`}
  function reviewTable(labels,rows){return `<div class="dfcd-review-table-wrap"><table class="dfcd-review-table"><thead><tr>${labels.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x||'—')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${labels.length}">등록된 항목이 없습니다.</td></tr>`}</tbody></table></div>`}
  function renderHwpxReview(type,d){
    const engine=window.DF_CONTRACT_HWPX,check=engine?.validate(type,d),issues=check&&!check.valid?check.issues:[],contract=type==='contract';
    const common=[['의뢰기관',d.client_name],['대표자',d.client_representative],['사업장 주소',d.client_address],['사업자등록번호',d.client_biz_no],['전화번호',d.client_phone],['용역명',d.service_name],['계약일',d.contract_date],['서명일',d.signing_date],['착수일',d.start_date],['완수일',d.end_date],['완수기간',String(d.duration_months??'').trim()!==''?d.duration_months+'개월':''],['측정대상 소재지',d.site_address||d.client_address]];
    const financial=[['계약금액',String(d.contract_amount??'').trim()?moneyText(d.contract_amount):''],['한글 금액',amountWords(d)],['부가세',d.vat_mode],['금액 기준',d.fee_basis],['계약보증금',d.contract_guarantee],['선금',d.advance_payment],['지체상금률',d.penalty_rate]];
    return `<section class="dfcd-hwpx-review"><div class="dfcd-review-heading"><span class="dfcd-format-tag">HWPX</span><div><h3>${contract?'측정대행표준계약서':'과업수행계획서'} · 입력내용 확인</h3><p>문서 배치 미리보기가 아닌 입력값 확인 화면입니다. 실제 원본 양식은 내려받은 한글 파일에서 확인해주세요.</p></div></div>${issues.length?`<div class="dfcd-review-validation"><strong>다운로드 전 확인해주세요</strong><ul>${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}<section class="dfcd-review-card"><h4>공통 계약정보</h4>${summaryPairs(common)}</section>${contract?`<section class="dfcd-review-card"><h4>계약금액 및 관리정보</h4>${summaryPairs([...financial,['계약관리 대상',d.contract_management_required==='no'?'부':'여'],['접수번호',d.receipt_no],['접수일',d.receipt_date],['계약관리기관',d.management_agency]])}</section>`:`<section class="dfcd-review-card"><h4>과업수행 정보</h4>${summaryPairs([['본문용 업체명',d.client_short_name||d.client_name],['계획서 연월',d.plan_year_month],['측정 인원',d.team_text],['측정수수료',String(d.contract_amount??'').trim()?moneyText(d.contract_amount):''],['금액 기준',d.fee_basis],['부가세',d.vat_mode],['측정수수료 청구 시점',d.plan_payment_terms]])}</section><section class="dfcd-review-card"><h4>측정시설 <span>${(d.facilities||[]).length}개</span></h4>${reviewTable(['배출시설','방지시설','측정주기','측정항목','수량'],(d.facilities||[]).map(x=>[x.emission,x.prevention,x.cycle,x.items,x.quantity]))}</section><section class="dfcd-review-card"><h4>장비현황 <span>${(d.equipment||[]).length}대</span></h4>${reviewTable(['장비명','제조사','모델명','비고'],(d.equipment||[]).map(x=>[x.name,x.maker,x.model,x.note]))}</section>`}<p class="dfcd-review-footnote">입력한 시설·장비 수에 따라 표의 행이 추가됩니다. 긴 내용과 추가된 행의 페이지 나눔은 한글에서 최종 확인해주세요.</p></section>`;
  }
  function renderPreview(){
    const host=byId('dfcdPreviewStage');if(!host||!previewData)return;const hwpx=isHwpxType(previewType);host.classList.toggle('dfcd-review-stage',hwpx);host.innerHTML=hwpx?renderHwpxReview(previewType,previewData):`<div class="dfcd-print-root">${renderDocument(previewType,previewData)}</div>`;
    if(!hwpx)requestAnimationFrame(()=>{const root=host.querySelector('.dfcd-print-root');if(!root)return;const natural=595*96/72,available=Math.max(280,host.clientWidth-20),scale=Math.min(1,available/natural);root.style.width='595pt';root.style.zoom=String(scale)});
    previewModal?.querySelectorAll('[data-preview-type]').forEach(b=>b.classList.toggle('active',b.dataset.previewType===previewType));
    byId('dfcdPreviewDescription').textContent=hwpx?'원본 HWPX의 편집 가능한 글자로 작성됩니다. 다운로드 후 한글에서 최종 확인·인쇄해주세요.':'기존 문서 미리보기 및 인쇄';
    byId('dfcdDownloadCurrent').hidden=!hwpx;byId('dfcdPrintCurrent').hidden=hwpx;byId('dfcdExcelOne').hidden=previewType!=='status';
    const link=byId('dfcdOriginalLink'),map={contract:'templates/standard_contract.hwpx',plan:'templates/task_plan.hwpx',notice:'templates/contract_notice.pdf',status:'templates/contract_status_template.xlsx'};if(link){link.href=asset(map[previewType]);if(hwpx||previewType==='status')link.setAttribute('download','');else link.removeAttribute('download')}
  }
  function renderDocument(type,d){if(type==='notice')return renderNotice(d);if(type==='status')return renderStatus([d]);return ''}
  function printDocuments(data,types){
    if(types.some(isHwpxType)){alert('표준계약서와 과업수행계획서는 HWPX를 내려받아 한글에서 인쇄해주세요.');return}
    const d=normalizeData(data),body=types.map(t=>renderDocument(t,d)).join('');if(!body)return;const w=window.open('about:blank','_blank');if(!w)return alert('인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해주세요.');
    const css=new URL('contractdocs.css?v=120372500',location.href).href;w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.package_name||d.client_name)} 계약문서</title><link rel="stylesheet" href="${css}"></head><body class="dfcd-print-only"><div class="dfcd-print-root">${body}</div><script>(()=>{const go=()=>setTimeout(()=>window.print(),250);const imgs=[...document.images];if(!imgs.length)return go();Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(go)})()<\/script></body></html>`);w.document.close();
  }

  function fitSize(text,width,max=8.5,min=5.2){const len=[...String(text||'')].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?.55:1),0);if(!len)return max;return Math.max(min,Math.min(max,width/(len*.92)))}
  function layer(x,y,w,h,text,opts={}){const size=opts.fit===false?(opts.size||8.5):fitSize(text,w-2,opts.size||8.5,opts.min||5.2),classes=['dfcd-layer'];if(opts.mask!==false)classes.push('mask');if(opts.align==='center')classes.push('center');if(opts.align==='right')classes.push('right');if(opts.top)classes.push('top');if(opts.gray)classes.push('gray');const style=`left:${x}pt;top:${y}pt;width:${w}pt;height:${h}pt;font-size:${size}pt;font-weight:${opts.bold?700:400};${opts.background?`background:${opts.background};`:''}`;return `<span class="${classes.join(' ')}" style="${style}">${esc(text??'').replace(/\n/g,'<br>')}</span>`}
  function page(bg,layers,label,extra=''){return `<section class="dfcd-print-page ${extra}" aria-label="${attr(label)}"><img class="dfcd-print-bg" src="${asset('backgrounds/'+bg)}" alt=""><div>${layers.join('')}</div></section>`}
  function parts(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?{y:m[1],m:String(Number(m[2])),d:String(Number(m[3]))}:{y:'',m:'',d:''}}
  function period(v){const p=parts(v);return p.y?`${p.y}. ${String(p.m).padStart(2,'0')}. ${String(p.d).padStart(2,'0')}.`:''}
  function koreanNumber(value){
    let n=Math.floor(Math.abs(money(value)));if(!n)return '영';const digit=['','일','이','삼','사','오','육','칠','팔','구'],small=['','십','백','천'],big=['','만','억','조','경'];let out='',group=0;
    while(n>0){let chunk=n%10000,part='';for(let i=0;i<4;i++){const d=chunk%10;if(d)part=(d===1&&i>0?'':digit[d])+small[i]+part;chunk=Math.floor(chunk/10)}if(part)out=part+big[group]+out;n=Math.floor(n/10000);group++}return out;
  }
  function amountWords(d){return d.amount_korean||(String(d.contract_amount??'').trim()?`${koreanNumber(d.contract_amount)}원정`:'')}
  function shortName(d){return d.client_short_name||d.client_name||''}
  function hasFinal(name){const chars=[...String(name||'')].reverse(),h=chars.find(c=>{const n=c.charCodeAt(0);return n>=0xac00&&n<=0xd7a3});return h?((h.charCodeAt(0)-0xac00)%28)!==0:false}
  const topic=n=>n+(hasFinal(n)?'은':'는');
  const withP=n=>n+(hasFinal(n)?'과':'와');
  function inline(x,y,w,text){return layer(x-1,y-1,w+2,15,text,{size:12,min:6.4,align:'center'})}

  function renderNotice(d){
    const layers=[],sign=parts(d.signing_date||d.contract_date),items=d.notice_items_cycle||(d.facilities||[]).map(x=>[x.items,x.cycle].filter(Boolean).join(' / ')).join(', '),fee=d.notice_analysis_fee?money(d.notice_analysis_fee).toLocaleString('ko-KR'):'',authority=String(d.notice_authority||'').replace(/\s*\/\s*/g,'\n');
    layers.push(layer(109,281,79,39,d.client_name,{size:9.3,min:5.2,align:'center'}),layer(189,281,94,39,d.site_address||d.client_address,{size:9.3,min:5,align:'center'}),layer(284,281,61,39,items,{size:9.3,min:4.8,align:'center'}),layer(346,281,52,39,fee,{size:9.3,min:5.2,align:'center'}),layer(399,281,60,39,dateText(d.start_date)==='-'?'':dateText(d.start_date),{size:9.3,min:5.4,align:'center'}),layer(460,281,75,39,dateText(d.end_date)==='-'?'':dateText(d.end_date),{size:9.3,min:5.4,align:'center'}),layer(536,281,29,39,d.notice_remark,{size:9.3,min:4.8,align:'center'}));
    layers.push(layer(478,369,79,18,sign.y?`${sign.y}년 ${String(sign.m).padStart(2,'0')}월 ${String(sign.d).padStart(2,'0')}일`:'',{size:9.3,min:6.2,align:'center'}),layer(376,398,40,17,PROVIDER.representative,{size:9.3,min:7,align:'center'}),layer(82,413,80,35,authority,{size:12,min:6.8,align:'center',bold:true}));
    return page('contract_notice-1.png',layers,'측정대행계약 체결사실 통보서','dfcd-notice-paper');
  }
  function statusRow(d){return {jurisdiction:d.jurisdiction||'',provider:PROVIDER.name,field:d.business_field||'',grade:d.business_grade||'',company:d.client_name||'',period:[dateText(d.start_date),dateText(d.end_date)].filter(x=>x!=='-').join(' ~ '),note:d.status_note||''}}
  function renderStatus(list){
    const docs=list.map(normalizeData),first=docs[0]||defaultData(),ym=String(first.contract_date||today()).slice(0,7),[y,m]=ym.split('-'),last=new Date(Number(y),Number(m),0).getDate(),title=`측정대행업자 계약체결 현황(${y}.${m}.01~${y}.${m}.${String(last).padStart(2,'0')})`,rows=docs.slice(0,11).map(statusRow);while(rows.length<11)rows.push(statusRow(defaultData()));
    return `<section class="dfcd-print-page dfcd-status-paper" aria-label="측정대행 계약체결 현황"><h1 class="dfcd-status-title">${esc(title)}</h1><table class="dfcd-status-table"><colgroup><col><col><col><col><col><col><col></colgroup><thead><tr><th rowspan="2">관할기관</th><th rowspan="2">측정대행업체</th><th colspan="3">계약상대자</th><th rowspan="2">계약기간</th><th rowspan="2">비고</th></tr><tr><th>분야</th><th>종별</th><th>사업장명</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i<docs.length?esc(r.jurisdiction):''}</td><td>${i<docs.length?esc(r.provider):''}</td><td>${i<docs.length?esc(r.field):''}</td><td>${i<docs.length?esc(r.grade):''}</td><td>${i<docs.length?esc(r.company):''}</td><td>${i<docs.length?esc(r.period):''}</td><td>${i<docs.length?esc(r.note):''}</td></tr>`).join('')}</tbody></table></section>`;
  }

  function deepCopy(v){try{return structuredClone(v)}catch(_){try{return JSON.parse(JSON.stringify(v))}catch(__){return v}}}
  function copyTemplateSheet(source,workbook,name){
    const ws=workbook.addWorksheet(name);for(let c=1;c<=7;c++){const a=source.getColumn(c),b=ws.getColumn(c);b.width=a.width;b.hidden=a.hidden}
    for(let r=1;r<=15;r++){const sr=source.getRow(r),tr=ws.getRow(r);tr.height=sr.height;for(let c=1;c<=7;c++){const sc=sr.getCell(c),tc=tr.getCell(c);tc.value=sc.value;tc.style=deepCopy(sc.style);if(sc.numFmt)tc.numFmt=sc.numFmt;if(sc.alignment)tc.alignment=deepCopy(sc.alignment);if(sc.border)tc.border=deepCopy(sc.border);if(sc.fill)tc.fill=deepCopy(sc.fill);if(sc.font)tc.font=deepCopy(sc.font)}}
    ['A1:G1','A3:A4','B3:B4','C3:E3','F3:F4','G3:G4'].forEach(range=>ws.mergeCells(range));ws.pageSetup=deepCopy(source.pageSetup||{});ws.pageMargins=deepCopy(source.pageMargins||{});return ws;
  }
  async function exportStatusExcel(list){
    const docs=(list||[]).map(normalizeData);if(!docs.length)return alert('Excel로 내보낼 계약문서가 없습니다.');if(!window.ExcelJS)return alert('Excel 기능을 불러오지 못했습니다. 인터넷 연결 후 다시 시도해주세요.');
    try{
      setMessage('원본 계약체결 현황 양식으로 Excel을 만드는 중입니다.');const res=await fetch(asset('templates/contract_status_template.xlsx')+'?v=120371300');if(!res.ok)throw Error(`원본양식 불러오기 실패 (${res.status})`);const sourceBook=new ExcelJS.Workbook();await sourceBook.xlsx.load(await res.arrayBuffer());const template=sourceBook.worksheets[0];if(!template)throw Error('원본 Excel 시트를 찾지 못했습니다.');
      const groups=new Map();docs.forEach(d=>{const key=String(d.contract_date||today()).slice(0,7);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(d)});const out=new ExcelJS.Workbook();out.creator='DREAMFOREN';out.created=new Date();
      [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([ym,group])=>{const [y,m]=ym.split('-'),last=new Date(Number(y),Number(m),0).getDate();for(let offset=0,part=1;offset<group.length;offset+=11,part++){const chunk=group.slice(offset,offset+11),name=`${y}.${Number(m)}월${part>1?'('+part+')':''}`.slice(0,31),ws=copyTemplateSheet(template,out,name);ws.getCell('A1').value=`측정대행업자 계약체결 현황(${y}.${m}.01~${y}.${m}.${String(last).padStart(2,'0')})`;for(let r=5;r<=15;r++)for(let c=1;c<=7;c++)ws.getCell(r,c).value=null;chunk.forEach((d,i)=>{const r=5+i,x=statusRow(d),vals=[x.jurisdiction,x.provider,x.field,x.grade,x.company,x.period,x.note];vals.forEach((v,c)=>ws.getCell(r,c+1).value=v)});ws.pageSetup={...ws.pageSetup,paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:G15'}}});
      const buf=await out.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=`측정대행_계약체결현황_${today()}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);setMessage(`현재 조건의 ${docs.length}건을 원본 Excel 양식으로 내려받았습니다.`,'ok');
    }catch(e){setMessage('계약체결 현황 Excel 생성 실패: '+(e?.message||e),'bad');alert('계약체결 현황 Excel을 만들지 못했습니다.\n'+(e?.message||e))}
  }

  document.addEventListener('DOMContentLoaded',init,{once:true});
})();


