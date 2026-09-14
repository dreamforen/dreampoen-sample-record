/* DREAMFOREN v120.37.13 · 계약문서 원본 글꼴/스크롤/삭제 보완 */
'use strict';

(function dfContractDocuments(){
  const TABLE='contract_document_packages';
  const VERSION='v120.37.13';
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
  function monthCount(a,b){if(!a||!b)return '';const s=new Date(a+'T00:00:00'),e=new Date(b+'T00:00:00');if(Number.isNaN(s)||Number.isNaN(e)||e<s)return '';return (e.getFullYear()-s.getFullYear())*12+e.getMonth()-s.getMonth()+1}
  function defaultData(){
    const d=today(),year=d.slice(0,4);
    return {
      package_name:'',document_no:makeDocumentNo(),status:'draft',receipt_no:'',receipt_date:'',management_agency:'',
      client_name:'',client_short_name:'',client_address:'',client_representative:'',client_biz_no:'',client_phone:'',
      service_name:'대기자가측정 위탁용역',contract_date:d,start_date:d,end_date:`${year}-12-31`,duration_months:'',site_address:'',
      contract_amount:'',amount_korean:'',vat_mode:'별도',contract_guarantee:'',advance_payment:'',penalty_rate:'',signing_date:d,
      plan_year_month:d.slice(0,7),team_text:'측정팀 2인/1조',facilities:[{emission:'',prevention:'',cycle:'반기 1회',items:'먼지, THC',quantity:'1'}],
      equipment:clone(DEFAULT_EQUIPMENT),notice_items_cycle:'',notice_analysis_fee:'',notice_remark:'',notice_authority:'시·도지사 / 대도시 시장',
      jurisdiction:'안양',business_field:'대기',business_grade:'5종',status_note:''
    };
  }
  function normalizeData(row){
    const source=row?.data&&typeof row.data==='object'?row.data:row||{};
    const out={...defaultData(),...clone(source)};
    ['package_name','document_no','status','client_name','contract_date','start_date','end_date'].forEach(k=>{if(row?.[k]!==undefined&&row?.[k]!==null)out[k]=row[k]});
    out.facilities=Array.isArray(source.facilities)&&source.facilities.length?clone(source.facilities):defaultData().facilities;
    out.equipment=Array.isArray(source.equipment)?clone(source.equipment):clone(DEFAULT_EQUIPMENT);
    out.duration_months=out.duration_months||monthCount(out.start_date,out.end_date);
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
      <header class="dfcd-head"><div><h1>계약문서 작성</h1><p>표준계약서·과업수행계획서·계약체결사실통보서·계약체결 현황을 한 세트로 작성하고 누적 관리합니다.<br>기존 계약관리·업체현황 자료와는 연결되지 않습니다.</p></div><div class="dfcd-head-actions"><button type="button" class="company-btn secondary" id="dfcdExportVisible">현재 목록 현황 Excel</button><button type="button" class="company-btn primary" id="dfcdNew">+ 문서세트 작성</button></div></header>
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
    byId('dfContractNav')?.addEventListener('click',()=>{if(!page.hidden)setTimeout(()=>loadPackages(false),120)});
    window.dfContractDocumentsOpen=()=>{try{window.v62ShowOnly?.('contract')}catch(_){}switchContractTab('documents')};
    window.DF_DIAG?.info('CONTRACT-DOCS-1203712','독립 계약문서 탭 준비 완료','기존 계약·업체현황 무연동');
  }
  function switchContractTab(name){
    const view=byId('dfViewContract'),ledger=view?.querySelector('.contract-page'),page=byId('dfcdPage');if(!ledger||!page)return;
    const docs=name==='documents';ledger.hidden=docs;ledger.style.display=docs?'none':'';page.hidden=!docs;page.style.display=docs?'block':'none';
    byId('dfcdContractTabs')?.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.dfcdContractTab===name));
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
    host.innerHTML=`<table class="dfcd-table"><colgroup><col style="width:74px"><col style="width:230px"><col style="width:92px"><col style="width:176px"><col style="width:105px"><col style="width:176px"><col style="width:110px"><col style="width:252px"></colgroup><thead><tr><th>상태</th><th>관리명 / 업체명</th><th>계약일</th><th>과업기간</th><th>계약금액</th><th>문서번호</th><th>최근 수정</th><th>관리</th></tr></thead><tbody>${visiblePackages.map(row=>{
      const d=normalizeData(row),complete=d.status==='complete';return `<tr><td><span class="dfcd-badge ${complete?'complete':''}">${complete?'작성완료':'작성중'}</span></td><td class="dfcd-title-cell"><strong>${esc(d.package_name||d.client_name)}</strong><small>${esc(d.client_name||'-')} · ${esc(d.service_name||'-')}</small></td><td class="dfcd-date">${esc(dateText(d.contract_date))}</td><td class="dfcd-date">${esc(dateText(d.start_date))} ~ ${esc(dateText(d.end_date))}</td><td class="dfcd-money">${d.contract_amount?esc(moneyText(d.contract_amount)):'-'}</td><td>${esc(d.document_no||'-')}</td><td class="dfcd-date">${esc(String(row.updated_at||row.created_at||'').slice(0,10)||'-')}</td><td><div class="dfcd-actions"><button type="button" data-dfcd-edit="${attr(row.id)}">수정</button><button type="button" class="primary" data-dfcd-preview="${attr(row.id)}">미리보기</button><button type="button" data-dfcd-print="${attr(row.id)}">인쇄</button><button type="button" class="danger" data-dfcd-delete="${attr(row.id)}">삭제</button></div></td></tr>`}).join('')}</tbody></table>`;
  }
  function findPackage(id){return packages.find(x=>String(x.id)===String(id))}
  function handleListAction(e){
    const edit=e.target.closest('[data-dfcd-edit]'),preview=e.target.closest('[data-dfcd-preview]'),print=e.target.closest('[data-dfcd-print]'),del=e.target.closest('[data-dfcd-delete]');
    if(edit)return openEditor(findPackage(edit.dataset.dfcdEdit));
    if(preview)return openPreview(normalizeData(findPackage(preview.dataset.dfcdPreview)));
    if(print)return printDocuments(normalizeData(findPackage(print.dataset.dfcdPrint)),['contract','plan','notice','status']);
    if(del)return deletePackage(del.dataset.dfcdDelete);
  }
  function openOriginals(){
    const old=byId('dfcdOriginalModal');if(old)old.remove();const wrap=document.createElement('div');wrap.id='dfcdOriginalModal';wrap.className='dfcd-modal-backdrop';wrap.innerHTML=`<div class="dfcd-modal" style="width:min(620px,100%)"><div class="dfcd-modal-head"><div><h2>고정 원본양식</h2><p>제공받은 작성본을 그대로 보관하며, 출력에서는 예시값을 입력값으로 교체합니다.</p></div><button class="dfcd-close" type="button">×</button></div><div class="dfcd-editor-body"><div class="dfcd-form-card" style="padding:16px;display:grid;gap:9px"><a class="company-btn secondary" href="${asset('templates/standard_contract.pdf')}" target="_blank" rel="noopener">측정대행표준계약서 PDF</a><a class="company-btn secondary" href="${asset('templates/task_plan.pdf')}" target="_blank" rel="noopener">과업수행계획서 PDF</a><a class="company-btn secondary" href="${asset('templates/contract_notice.pdf')}" target="_blank" rel="noopener">계약체결사실통보서 PDF</a><a class="company-btn secondary" href="${asset('templates/contract_status_template.xlsx')}" download>측정대행 계약체결 현황 Excel</a></div></div></div>`;document.body.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('.dfcd-close'))wrap.remove()});
  }

  function inputValue(d,key){return attr(d[key]??'')}
  function selected(v,x){return String(v)===String(x)?' selected':''}
  function openEditor(row=null,{duplicate=false}={}){
    if(editorModal)editorModal.remove();let d=normalizeData(row||defaultData()),rowId=row?.id||'';
    if(duplicate){rowId='';d.document_no=makeDocumentNo();d.package_name=(d.package_name||d.client_name)+' 복사본';d.status='draft'}
    editorModal=document.createElement('div');editorModal.className='dfcd-modal-backdrop';editorModal.innerHTML=`<div class="dfcd-modal"><div class="dfcd-modal-head"><div><h2>${rowId?'계약문서 세트 수정':'새 계약문서 세트 작성'}</h2><p>공통정보 한 번 입력 → 3종 문서와 계약현황에 일괄 반영</p></div><button class="dfcd-close" type="button">×</button></div><form id="dfcdEditorForm" data-row-id="${attr(rowId)}"><div class="dfcd-editor-body">
      <details open><summary>1. 관리정보 및 공통 계약정보</summary><div class="dfcd-detail-inner"><div class="dfcd-form-grid">
        <label class="span2">관리명<input name="package_name" value="${inputValue(d,'package_name')}" placeholder="예: ㈜가나다 2026 계약문서"></label><label>문서번호<input name="document_no" value="${inputValue(d,'document_no')}" required></label><label>작성상태<select name="status"><option value="draft"${selected(d.status,'draft')}>작성중</option><option value="complete"${selected(d.status,'complete')}>작성완료</option></select></label>
        <label class="span2">측정대행 의뢰기관(업체명)<input name="client_name" value="${inputValue(d,'client_name')}" required></label><label class="span2">본문용 업체 약칭<input name="client_short_name" value="${inputValue(d,'client_short_name')}" placeholder="긴 업체명은 짧게 입력"></label>
        <label class="span4">의뢰기관 사업장 주소<input name="client_address" value="${inputValue(d,'client_address')}"></label><label>대표자<input name="client_representative" value="${inputValue(d,'client_representative')}"></label><label>사업자등록번호<input name="client_biz_no" value="${inputValue(d,'client_biz_no')}"></label><label class="span2">전화번호<input name="client_phone" value="${inputValue(d,'client_phone')}"></label>
        <label class="span2">용역명<input name="service_name" value="${inputValue(d,'service_name')}" required></label><label>계약일<input name="contract_date" type="date" value="${inputValue(d,'contract_date')}" required></label><label>서명·통보일<input name="signing_date" type="date" value="${inputValue(d,'signing_date')}"></label>
        <label>착수일<input name="start_date" type="date" value="${inputValue(d,'start_date')}"></label><label>완수일<input name="end_date" type="date" value="${inputValue(d,'end_date')}"></label><label>완수기간(개월)<input name="duration_months" type="number" min="0" value="${inputValue(d,'duration_months')}"></label><label>과업계획서 연월<input name="plan_year_month" type="month" value="${inputValue(d,'plan_year_month')}"></label>
        <label class="span4">측정대상 사업장 소재지<input name="site_address" value="${inputValue(d,'site_address')}"></label>
        <label>계약금액<input name="contract_amount" inputmode="numeric" value="${inputValue(d,'contract_amount')}" placeholder="숫자만 입력"></label><label>한글 금액(선택)<input name="amount_korean" value="${inputValue(d,'amount_korean')}" placeholder="비우면 자동 변환"></label><label>VAT 표기<select name="vat_mode"><option value="별도"${selected(d.vat_mode,'별도')}>VAT 별도</option><option value="포함"${selected(d.vat_mode,'포함')}>VAT 포함</option></select></label><label>계약보증금<input name="contract_guarantee" value="${inputValue(d,'contract_guarantee')}"></label>
        <label>선금<input name="advance_payment" value="${inputValue(d,'advance_payment')}"></label><label>지체상금률<input name="penalty_rate" value="${inputValue(d,'penalty_rate')}"></label><label>접수번호<input name="receipt_no" value="${inputValue(d,'receipt_no')}"></label><label>접수일<input name="receipt_date" type="date" value="${inputValue(d,'receipt_date')}"></label><label class="span2">측정대행계약 관리기관명<input name="management_agency" value="${inputValue(d,'management_agency')}"></label>
      </div><p class="dfcd-help">긴 업체명은 ‘본문용 업체 약칭’을 짧게 지정하면 과업수행계획서의 고정 문단 안에 안정적으로 들어갑니다.</p></div></details>
      <details open><summary>2. 과업 시설 및 측정내용</summary><div class="dfcd-detail-inner"><div class="dfcd-repeat-head"><strong>측정시설</strong><button type="button" id="dfcdAddFacility">+ 시설 추가</button></div><div class="dfcd-repeat-wrap"><table class="dfcd-repeat"><thead><tr><th>배출시설</th><th>방지시설</th><th style="width:110px">측정주기</th><th>측정항목</th><th style="width:70px">수량</th><th style="width:38px"></th></tr></thead><tbody id="dfcdFacilityRows"></tbody></table></div><div class="dfcd-form-grid" style="margin-top:12px"><label class="span2">측정 인원<input name="team_text" value="${inputValue(d,'team_text')}"></label><label class="span2">통보서 측정항목·주기(선택)<input name="notice_items_cycle" value="${inputValue(d,'notice_items_cycle')}" placeholder="비우면 시설내용으로 자동 작성"></label></div></div></details>
      <details><summary>3. 과업 장비현황</summary><div class="dfcd-detail-inner"><div class="dfcd-repeat-head"><strong>최대 8대가 원본 1쪽 표에 표시됩니다.</strong><button type="button" id="dfcdAddEquipment">+ 장비 추가</button></div><div class="dfcd-repeat-wrap"><table class="dfcd-repeat"><thead><tr><th>장비명</th><th>제조사</th><th>모델명</th><th>비고</th><th style="width:38px"></th></tr></thead><tbody id="dfcdEquipmentRows"></tbody></table></div></div></details>
      <details><summary>4. 통보서 및 계약체결 현황 항목</summary><div class="dfcd-detail-inner"><div class="dfcd-form-grid"><label>측정항목별 분석수수료 단가<input name="notice_analysis_fee" value="${inputValue(d,'notice_analysis_fee')}"></label><label>관할기관<input name="jurisdiction" value="${inputValue(d,'jurisdiction')}"></label><label>분야<input name="business_field" value="${inputValue(d,'business_field')}"></label><label>종별<input name="business_grade" value="${inputValue(d,'business_grade')}"></label><label class="span2">통보 대상기관<input name="notice_authority" value="${inputValue(d,'notice_authority')}"></label><label class="span2">계약현황 비고<input name="status_note" value="${inputValue(d,'status_note')}"></label><label class="span4">체결사실통보서 비고<input name="notice_remark" value="${inputValue(d,'notice_remark')}"></label></div></div></details>
    </div><div class="dfcd-modal-actions">${rowId?'<button type="button" class="company-btn danger" id="dfcdDelete">삭제</button><button type="button" class="company-btn secondary" id="dfcdDuplicate">복사본 만들기</button>':''}<button type="button" class="company-btn secondary" id="dfcdPreviewDraft">작성내용 미리보기</button><button type="button" class="company-btn secondary dfcd-cancel">취소</button><button type="submit" class="company-btn primary">저장</button><button type="button" class="company-btn primary" id="dfcdSavePreview">저장 후 미리보기</button></div></form></div>`;
    document.body.appendChild(editorModal);renderFacilityRows(d.facilities);renderEquipmentRows(d.equipment);
    const form=byId('dfcdEditorForm');
    editorModal.addEventListener('click',e=>{if(e.target===editorModal||e.target.closest('.dfcd-close,.dfcd-cancel'))closeEditor()});
    byId('dfcdAddFacility').onclick=()=>{const current=collectFacilityRows();current.push({emission:'',prevention:'',cycle:'',items:'',quantity:'1'});renderFacilityRows(current)};
    byId('dfcdAddEquipment').onclick=()=>{const current=collectEquipmentRows();if(current.length>=8)return alert('원본 장비표에는 최대 8대까지 표시됩니다.');current.push({name:'',maker:'',model:'',note:''});renderEquipmentRows(current)};
    byId('dfcdFacilityRows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-row]');if(!b)return;const list=collectFacilityRows();list.splice(Number(b.dataset.removeRow),1);renderFacilityRows(list.length?list:[{emission:'',prevention:'',cycle:'',items:'',quantity:'1'}])});
    byId('dfcdEquipmentRows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-equipment]');if(!b)return;const list=collectEquipmentRows();list.splice(Number(b.dataset.removeEquipment),1);renderEquipmentRows(list)});
    ['start_date','end_date'].forEach(name=>form.elements[name].addEventListener('change',()=>{form.elements.duration_months.value=monthCount(form.elements.start_date.value,form.elements.end_date.value)}));
    form.addEventListener('submit',async e=>{e.preventDefault();await saveEditor(false)});
    byId('dfcdPreviewDraft').onclick=()=>{const data=collectEditorData();if(validateData(data))openPreview(data)};
    byId('dfcdSavePreview').onclick=()=>saveEditor(true);
    byId('dfcdDelete')?.addEventListener('click',()=>deletePackage(rowId));
    byId('dfcdDuplicate')?.addEventListener('click',()=>openEditor(row,{duplicate:true}));
  }
  function closeEditor(){editorModal?.remove();editorModal=null}
  function renderFacilityRows(list){const host=byId('dfcdFacilityRows');if(!host)return;host.innerHTML=(list||[]).map((x,i)=>`<tr data-facility-row><td><input data-key="emission" value="${attr(x.emission||'')}"></td><td><input data-key="prevention" value="${attr(x.prevention||'')}"></td><td><input data-key="cycle" value="${attr(x.cycle||'')}"></td><td><input data-key="items" value="${attr(x.items||'')}"></td><td><input data-key="quantity" value="${attr(x.quantity||'')}"></td><td><button type="button" class="remove" data-remove-row="${i}" aria-label="행 삭제">×</button></td></tr>`).join('')}
  function renderEquipmentRows(list){const host=byId('dfcdEquipmentRows');if(!host)return;host.innerHTML=(list||[]).slice(0,8).map((x,i)=>`<tr data-equipment-row><td><input data-key="name" value="${attr(x.name||'')}"></td><td><input data-key="maker" value="${attr(x.maker||'')}"></td><td><input data-key="model" value="${attr(x.model||'')}"></td><td><input data-key="note" value="${attr(x.note||'')}"></td><td><button type="button" class="remove" data-remove-equipment="${i}" aria-label="행 삭제">×</button></td></tr>`).join('')}
  function collectRepeat(selector,keys){return [...document.querySelectorAll(selector)].map(row=>Object.fromEntries(keys.map(k=>[k,String(row.querySelector(`[data-key="${k}"]`)?.value||'').trim()]))) }
  function collectFacilityRows(){return collectRepeat('#dfcdFacilityRows [data-facility-row]',['emission','prevention','cycle','items','quantity'])}
  function collectEquipmentRows(){return collectRepeat('#dfcdEquipmentRows [data-equipment-row]',['name','maker','model','note'])}
  function collectEditorData(){
    const form=byId('dfcdEditorForm'),fd=new FormData(form),d=defaultData();
    for(const [k,v] of fd.entries())d[k]=String(v).trim();
    d.facilities=collectFacilityRows().filter(x=>Object.values(x).some(Boolean));d.equipment=collectEquipmentRows().filter(x=>Object.values(x).some(Boolean));
    d.contract_amount=String(d.contract_amount||'').replace(/[^0-9]/g,'');d.duration_months=d.duration_months||monthCount(d.start_date,d.end_date);
    d.client_short_name=d.client_short_name||d.client_name;d.site_address=d.site_address||d.client_address;d.package_name=d.package_name||`${d.client_name} 계약문서`;
    d.plan_year_month=d.plan_year_month||(d.contract_date||today()).slice(0,7);d.signing_date=d.signing_date||d.contract_date||today();
    if(!d.notice_items_cycle)d.notice_items_cycle=d.facilities.map(x=>[x.items,x.cycle].filter(Boolean).join(' / ')).filter(Boolean).join(', ');
    return d;
  }
  function validateData(d){if(!d.client_name)return alert('측정대행 의뢰기관(업체명)을 입력해주세요.'),false;if(!d.service_name)return alert('용역명을 입력해주세요.'),false;if(!d.contract_date)return alert('계약일을 입력해주세요.'),false;return true}
  async function saveEditor(openAfter){
    const data=collectEditorData();if(!validateData(data))return null;const client=db(),user=cloudUser();if(!client||!user)return alert('로그인 및 DB 연결을 확인해주세요.');
    const form=byId('dfcdEditorForm'),id=form.dataset.rowId,payload={document_no:data.document_no,package_name:data.package_name,client_name:data.client_name,contract_date:data.contract_date||null,start_date:data.start_date||null,end_date:data.end_date||null,status:data.status,data,updated_at:stamp()};
    try{
      let result;if(id)result=await client.from(TABLE).update(payload).eq('id',id).select().single();else result=await client.from(TABLE).insert({...payload,created_by:user.id}).select().single();
      if(result.error)throw result.error;closeEditor();loaded=false;await loadPackages(true);setMessage(`‘${data.package_name}’ 문서세트를 저장했습니다.`,'ok');if(openAfter)openPreview(normalizeData(result.data||data));return result.data;
    }catch(e){const msg=String(e?.message||e);alert((/does not exist|schema cache|42P01/i.test(msg)?'전용 SQL을 먼저 실행해주세요.\n':'저장하지 못했습니다.\n')+msg);return null}
  }
  async function deletePackage(id){
    if(!id||!confirm('이 계약문서 세트를 삭제할까요?\n삭제한 작성용 문서세트는 복구할 수 없습니다.\n기존 계약관리·업체현황 자료에는 영향이 없습니다.'))return;
    const client=db();if(!client)return alert('DB 연결을 확인해주세요.');
    try{
      const {error}=await client.from(TABLE).delete().eq('id',id);if(error)throw error;
      closeEditor();loaded=false;await loadPackages(true);setMessage('계약문서 세트를 삭제했습니다.','ok');
    }catch(e){alert('삭제하지 못했습니다.\n'+(e?.message||e))}
  }

  function openPreview(data,type='contract'){
    previewModal?.remove();previewData=normalizeData(data);previewType=type;previewModal=document.createElement('div');previewModal.className='dfcd-modal-backdrop';previewModal.innerHTML=`<div class="dfcd-modal dfcd-preview-modal"><div class="dfcd-modal-head"><div><h2>${esc(previewData.package_name||previewData.client_name)}</h2><p>원본 A4 위에 입력값만 표시됩니다. 인쇄 화면에서 ‘PDF로 저장’도 가능합니다.</p></div><button class="dfcd-close" type="button">×</button></div><div class="dfcd-preview-toolbar"><div class="dfcd-preview-tabs"><button type="button" data-preview-type="contract">표준계약서</button><button type="button" data-preview-type="plan">과업수행계획서</button><button type="button" data-preview-type="notice">체결사실통보서</button><button type="button" data-preview-type="status">계약체결 현황</button></div><a class="company-btn secondary" id="dfcdOriginalLink" target="_blank" rel="noopener">원본양식</a><button type="button" class="company-btn secondary" id="dfcdExcelOne">현황 Excel</button><button type="button" class="company-btn secondary" id="dfcdPrintCurrent">현재 문서 인쇄</button><button type="button" class="company-btn primary" id="dfcdPrintAll">전체 4종 인쇄</button></div><div class="dfcd-preview-stage" id="dfcdPreviewStage"></div></div>`;document.body.appendChild(previewModal);
    previewModal.addEventListener('click',e=>{if(e.target===previewModal||e.target.closest('.dfcd-close')){previewModal.remove();previewModal=null;return}const b=e.target.closest('[data-preview-type]');if(b){previewType=b.dataset.previewType;renderPreview()}});
    byId('dfcdPrintCurrent').onclick=()=>printDocuments(previewData,[previewType]);byId('dfcdPrintAll').onclick=()=>printDocuments(previewData,['contract','plan','notice','status']);byId('dfcdExcelOne').onclick=()=>exportStatusExcel([previewData]);renderPreview();
  }
  function renderPreview(){
    const host=byId('dfcdPreviewStage');if(!host||!previewData)return;host.innerHTML=`<div class="dfcd-print-root">${renderDocument(previewType,previewData)}</div>`;
    requestAnimationFrame(()=>{const root=host.querySelector('.dfcd-print-root');if(!root)return;const natural=595*96/72,available=Math.max(280,host.clientWidth-20),scale=Math.min(1,available/natural);root.style.width='595pt';root.style.zoom=String(scale)});
    previewModal?.querySelectorAll('[data-preview-type]').forEach(b=>b.classList.toggle('active',b.dataset.previewType===previewType));
    const link=byId('dfcdOriginalLink'),map={contract:'templates/standard_contract.pdf',plan:'templates/task_plan.pdf',notice:'templates/contract_notice.pdf',status:'templates/contract_status_template.xlsx'};if(link){link.href=asset(map[previewType]);if(previewType==='status')link.setAttribute('download','');else link.removeAttribute('download')}
  }
  function renderDocument(type,d){if(type==='contract')return renderContract(d);if(type==='plan')return renderPlan(d);if(type==='notice')return renderNotice(d);if(type==='status')return renderStatus([d]);return ''}
  function printDocuments(data,types){
    const d=normalizeData(data),body=types.map(t=>renderDocument(t,d)).join(''),w=window.open('about:blank','_blank');if(!w)return alert('인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해주세요.');
    const css=new URL('contractdocs.css?v=120371300',location.href).href;w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.package_name||d.client_name)} 계약문서</title><link rel="stylesheet" href="${css}"></head><body class="dfcd-print-only"><div class="dfcd-print-root">${body}</div><script>(()=>{const go=()=>setTimeout(()=>window.print(),250);const imgs=[...document.images];if(!imgs.length)return go();Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(go)})()<\/script></body></html>`);w.document.close();
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
  function amountWords(d){return d.amount_korean||(String(d.contract_amount||'').trim()?`${koreanNumber(d.contract_amount)}원정`:'')}
  function shortName(d){return d.client_short_name||d.client_name||''}
  function hasFinal(name){const chars=[...String(name||'')].reverse(),h=chars.find(c=>{const n=c.charCodeAt(0);return n>=0xac00&&n<=0xd7a3});return h?((h.charCodeAt(0)-0xac00)%28)!==0:false}
  const topic=n=>n+(hasFinal(n)?'은':'는');
  const withP=n=>n+(hasFinal(n)?'과':'와');
  function inline(x,y,w,text){return layer(x-1,y-1,w+2,15,text,{size:12,min:6.4,align:'center'})}

  function renderContract(d){
    const c=parts(d.contract_date),s=parts(d.start_date),e=parts(d.end_date),sign=parts(d.signing_date),layers=[];
    layers.push(layer(318,112,40,15,d.receipt_no,{mask:false,size:9,min:6.5,align:'center'}),layer(389,112,44,15,dateText(d.receipt_date)==='-'?'':dateText(d.receipt_date),{mask:false,size:9,min:5.8,align:'center'}),layer(180,138,100,16,d.management_agency,{mask:false,size:10,min:6.5,align:'center'}));
    layers.push(layer(119,189,160,16,d.client_name,{mask:false,size:10,min:6.5}),layer(151,207,128,34,d.client_address,{mask:false,size:10,min:6.2,top:true}),layer(151,228,128,15,d.client_representative,{mask:false,size:10,min:7}),layer(168,247,111,15,d.client_biz_no,{mask:false,size:10,min:6.5}),layer(88,282,191,20,d.client_phone,{mask:false,size:10,min:7,align:'center'}));
    layers.push(layer(119,314,411,17,d.service_name,{mask:false,size:10,min:7}),layer(121,334,24,17,c.y,{mask:false,size:10,min:8,align:'right'}),layer(160,334,25,17,c.m,{mask:false,size:10,min:8,align:'right'}),layer(200,334,25,17,c.d,{mask:false,size:10,min:8,align:'right'}),layer(401,334,25,17,d.duration_months,{mask:false,size:10,min:8,align:'center'}));
    layers.push(layer(121,354,24,17,s.y,{mask:false,size:10,min:8,align:'right'}),layer(160,354,25,17,s.m,{mask:false,size:10,min:8,align:'right'}),layer(200,354,25,17,s.d,{mask:false,size:10,min:8,align:'right'}),layer(337,354,24,17,e.y,{mask:false,size:10,min:8,align:'right'}),layer(376,354,25,17,e.m,{mask:false,size:10,min:8,align:'right'}),layer(416,354,20,17,e.d,{mask:false,size:10,min:8,align:'right'}));
    const numericAmount=String(d.contract_amount||'').trim()?money(d.contract_amount).toLocaleString('ko-KR'):'';
    layers.push(layer(186,373,344,17,d.site_address,{mask:false,size:10,min:6.5}),layer(147,393,38,17,amountWords(d),{mask:false,size:10,min:4.6,align:'center'}),layer(196,393,64,17,numericAmount,{mask:false,size:10,min:6,align:'right'}));
    if(d.vat_mode!=='별도')layers.push(layer(269,393,49,17,`*VAT ${d.vat_mode}`,{size:9,min:6.2,align:'center'}));
    layers.push(layer(132,413,398,17,d.contract_guarantee,{mask:false,size:10,min:6.5}),layer(132,432,398,17,d.advance_payment,{mask:false,size:10,min:6.5}),layer(132,452,398,17,d.penalty_rate,{mask:false,size:10,min:6.5}));
    layers.push(layer(369,659,26,17,sign.y,{mask:false,size:10,min:8,align:'right'}),layer(429,659,26,17,sign.m,{mask:false,size:10,min:8,align:'right'}),layer(479,659,26,17,sign.d,{mask:false,size:10,min:8,align:'right'}));
    layers.push(layer(151,678,155,17,d.client_name,{mask:false,size:10,min:6.5}),layer(151,698,155,40,d.client_address,{mask:false,size:10,min:6.2,top:true}),layer(148,739,48,17,d.client_representative,{mask:false,size:10,min:7,align:'center'}));
    return page('standard_contract-1.png',layers,'측정대행표준계약서','dfcd-contract-paper');
  }
  function renderPlan(d){
    const n=shortName(d),ym=String(d.plan_year_month||d.contract_date||today()).slice(0,7).split('-'),year=ym[0]||'',month=String(Number(ym[1]||1)),fee=d.notice_analysis_fee||d.contract_amount||'',pages=[];
    pages.push(page('task_plan-1.png',[layer(92,238,417,29,`[용역명 : ${year.slice(2)}년 ${n} ${d.service_name}]`,{size:17,min:8.5,align:'center',bold:true}),layer(251,449,94,31,`${year}. ${month}`,{size:22,min:14,align:'center',bold:true})],'과업수행계획서 표지','dfcd-plan-paper dfcd-plan-cover'));
    const p2=[];p2.push(layer(132,123,210,18,d.service_name,{size:12,min:7.5,bold:true}));
    p2.push(inline(68.64,184.08,79.32,topic(n)),inline(155.04,184.08,79.2,n+'의'),inline(329.16,203.28,79.2,n+'의'),inline(163.92,280.08,67.32,n));
    p2.push(layer(132,297,300,17,d.site_address||d.client_address,{size:12,min:6.8}),layer(150,316,181,17,`${period(d.start_date)} ∼ ${period(d.end_date)}`,{size:12,min:7.5}),layer(150,374,180,17,n,{size:12,min:7}));
    const fac=(d.facilities||[]).slice(0,3),join=k=>fac.map(x=>x[k]||'').filter(Boolean).join('\n');
    p2.push(layer(58,439,141,39,join('emission'),{size:11,min:6.4,align:'center'}),layer(201,439,128,39,join('prevention'),{size:11,min:6.4,align:'center'}),layer(331,439,76,39,join('cycle'),{size:11,min:6.4,align:'center'}),layer(409,439,68,39,join('items'),{size:11,min:6.2,align:'center'}),layer(479,439,41,39,join('quantity'),{size:11,min:6.4,align:'center'}));
    p2.push(layer(132,508,112,17,d.team_text,{size:12,min:7.2}));
    const eq=(d.equipment||[]).slice(0,8);for(let i=0;i<8;i++){const y=569.5+i*22.4,x=eq[i]||{};p2.push(layer(117,y,125,20,x.name||'',{size:10,min:6.2,align:'center'}),layer(243,y,108,20,x.maker||'',{size:10,min:6.2,align:'center'}),layer(352,y,98,20,x.model||'',{size:10,min:6.2,align:'center'}),layer(451,y,69,20,x.note||'',{size:10,min:6.2,align:'center'}))}
    pages.push(page('task_plan-2.png',p2,'과업수행계획서 1쪽','dfcd-plan-paper'));
    pages.push(page('task_plan-3.png',[inline(395.52,260.88,73.2,n+'의'),inline(190.8,299.28,73.2,withP(n))],'과업수행계획서 2쪽','dfcd-plan-paper'));
    pages.push(page('task_plan-4.png',[layer(194,97,53,16,fee?money(fee).toLocaleString('ko-KR'):'',{size:12,min:6.8,align:'center'}),inline(176.4,195.12,73.2,n+'의'),inline(86.64,303.12,73.2,n+'의'),inline(286.56,360.72,95.04,n+'로부터'),inline(357.96,456.72,73.2,n+'의'),inline(149.52,475.92,73.2,withP(n)),inline(350.76,475.92,73.2,n+'의'),inline(447.36,533.52,62.28,n),inline(88.2,552.72,73.32,n+'의'),inline(211.56,610.32,73.2,topic(n))],'과업수행계획서 3쪽','dfcd-plan-paper'));
    pages.push(page('task_plan-5.png',[inline(92.16,99.12,63.94,n+','),inline(142.56,195.12,73.32,n+'의'),inline(474.6,425.52,63.82,n+',')],'과업수행계획서 4쪽','dfcd-plan-paper'));
    return pages.join('');
  }
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
