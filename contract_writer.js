/* Contract originals: one exact-ID document package and a separate cumulative ledger. */
(function(root){
 'use strict';
 const TABLE='contract_document_packages',SCHEMA='dreamforen-contract-writer-v1',LEDGER_SCHEMA='dreamforen-contract-ledger-v1',LEDGER_NO='DFEN-CD-LEDGER-ALL',TEMPLATE_SCHEMA='dreamforen-contract-template-v1',TEMPLATE_NO='DFEN-CD-TEMPLATE-DEFAULTS';
 const TYPES={contract:'표준계약서',plan:'과업수행계획서',notice:'계약체결사실통보서',ledger:'측정대행 계약체결 현황'};
 const emptyDocuments=()=>({contract:{},plan:{},notice:{}});
 const emptyTemplate=()=>({id:null,updated:null,pendingId:null,pendingSave:null,data:null,loaded:false});
 const emptyLedger=()=>({cells:{},appendRows:{},newSheets:[],links:{}});
 const state={dialogSerial:0,savedContractId:'',pickerSelectedId:'',pickerApplying:false,pickerYear:'all',pickerQuery:'',pickerStatus:'all',pickerSort:'expiry',mode:'package',template:emptyTemplate(),templateReturn:null,templatePending:false,active:false,owner:'',client:null,formType:'contract',year:'all',query:'',scope:'active',packages:[],contracts:[],loaded:false,loading:false,busy:false,dirty:false,currentId:null,currentUpdated:null,pendingId:null,data:null,baseline:null,pendingSave:null,revision:0,readSerial:0,editorSerial:0,editor:null,status:'',error:false,selectedContract:'',ledger:{id:null,updated:null,pendingId:null,data:emptyLedger(),baseline:emptyLedger(),dirty:false,loaded:false,sheet:'',inspect:null}};
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 const actor=()=>{try{return typeof dfCloudUser!=='undefined'?String(dfCloudUser?.id||''):'';}catch(_){return '';}};
 const api=()=>{try{return typeof dfSupabase!=='undefined'?dfSupabase:null;}catch(_){return null;}};
 const profile=()=>{try{return typeof dfCloudProfile!=='undefined'?dfCloudProfile:null;}catch(_){return null;}};
 const can=action=>!!actor()&&(root.DFMenuPermissions?root.DFMenuPermissions.can('contract',action,profile()?.role==='admin'):typeof dfMenuCan==='function'?dfMenuCan('contract',action,profile()?.role==='admin'):profile()?.role==='admin');
 const now=()=>new Date().toISOString();
 const kst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const today=()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),v=type=>parts.find(p=>p.type===type).value;return v('year')+'-'+v('month')+'-'+v('day');};
 const uuid=()=>root.crypto.randomUUID();
 const model=()=>{if(!root.DF_CONTRACT_FORM_MODEL)throw Error('계약서식 구성요소를 불러오지 못했습니다. 새로고침해주세요.');return root.DF_CONTRACT_FORM_MODEL;};
 const deleted=row=>row?.data?.deleted===true;
 const ledgerRow=row=>row?.document_no===LEDGER_NO||row?.data?.schema===LEDGER_SCHEMA;
 const templateRow=row=>row?.document_no===TEMPLATE_NO||row?.data?.schema===TEMPLATE_SCHEMA;
 const editAction=()=>state.mode==='template'?(state.template.id?'update':'create'):(state.currentId?'update':'create');
 const common=()=>state.data?.common||{};
 const context=(who=state.owner,client=state.client,action='view')=>{if(!who||actor()!==who||api()!==client)throw Error('로그인 연결이 변경되었습니다. 계약작성을 다시 열어주세요.');if(!can(action))throw Error('계약작성 '+({view:'조회',create:'작성',update:'수정',delete:'삭제'}[action]||action)+' 권한을 확인해주세요.');return client;};
 const canonical=v=>{const normalize=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(normalize):Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])]))):x;return JSON.stringify(normalize(v));};
 function blankData(){return {schema:SCHEMA,editor_version:446,common:{},documents:emptyDocuments(),styles:emptyDocuments(),linked_contract_id:'',linked_contract_no:'',deleted:false};}
 function documentMaps(value){const out=emptyDocuments();for(const type of Object.keys(out))if(value?.[type]&&typeof value[type]==='object'&&!Array.isArray(value[type]))out[type]=clone(value[type]);return out;}
 function migrateDocuments(data){const documents=documentMaps(data?.documents);if(Number(data?.editor_version||0)<446&&Object.keys(documents.notice).length){const ids=root.DF_CONTRACT_FORM_LAYOUT?.legacyNoticeIds;if(!ids)throw Error('계약 서식 구성을 불러오지 못했습니다. 새로고침해주세요.');documents.notice=Object.fromEntries(Object.entries(documents.notice).map(([key,value])=>[Object.prototype.hasOwnProperty.call(ids,key)?String(ids[key]):key,value]));}return documents;}
 function templateData(row){const data=row?.data&&typeof row.data==='object'&&!Array.isArray(row.data)?clone(row.data):{};return {...data,schema:TEMPLATE_SCHEMA,editor_version:446,common:data.common&&typeof data.common==='object'&&!Array.isArray(data.common)?data.common:{},documents:migrateDocuments(data),styles:documentMaps(data.styles)};}
 function freshPackage(){const data=blankData(),defaults=state.template.data;if(defaults){data.common=clone(defaults.common);delete data.common.contract_id;data.documents=documentMaps(defaults.documents);data.styles=documentMaps(defaults.styles);}return data;}
 function normalize(row){
  const original=row?.data&&typeof row.data==='object'&&!Array.isArray(row.data)?clone(row.data):{},c=original.schema===SCHEMA&&original.common&&typeof original.common==='object'?clone(original.common):{...original};
  delete c.documents;delete c.styles;delete c.editor_version;delete c.schema;delete c.deleted;
  if(original.schema!==SCHEMA&&!c.client_name&&row?.client_name)c.client_name=row.client_name;if(c.contract_amount===undefined&&c.amount!==undefined)c.contract_amount=String(c.amount);
  for(const key of ['contract_date','start_date','end_date'])if(!c[key]&&row?.[key])c[key]=row[key];
  return {...original,schema:SCHEMA,editor_version:446,common:c,documents:migrateDocuments(original),styles:documentMaps(original.styles),linked_contract_id:String(original.linked_contract_id||c.contract_id||''),linked_contract_no:String(original.linked_contract_no||c.contract_no||''),deleted:original.deleted===true};
 }
 function setStatus(message,error=false){state.status=String(message||'');state.error=error;const box=$('dfcwStatus');if(box){box.textContent=state.status;box.classList.toggle('error',error);}}
 function flushEditor(){state.editor?.flushPending?.();}
 function markDirty(){state.dirty=true;state.revision++;setStatus('미저장');renderMeta();}
 function busy(value,token){if(!value&&token&&token!==state.busyToken)return;state.busyToken=value?Symbol('contract-operation'):null;state.busy=value;state.editor?.setEditable?.(!value&&can(editAction())&&!state.data?.deleted);renderControls();return state.busyToken;}
 function page(){return $('dfcdPage');}
 function ensure(){
  if(page())return page();const view=$('dfViewContract');if(!view)return null;
  const p=document.createElement('section');p.id='dfcdPage';p.className='dfcw-page';p.hidden=true;p.style.display='none';
  p.innerHTML='<header class="dfcw-heading"><h1>계약작성</h1><span id="dfcwStatus" role="status" aria-live="polite"></span></header><nav class="dfcw-tabs" aria-label="계약 서식">'+Object.entries(TYPES).map(([key,title])=>'<button type="button" data-cw-type="'+key+'">'+title+'</button>').join('')+'</nav><div class="dfcw-tools"><button type="button" id="dfcwNew">새 작성</button><button type="button" id="dfcwSaved">저장내용</button><button type="button" id="dfcwTemplate">빈 양식 편집</button><button type="button" id="dfcwTemplateSave" class="primary" hidden>기본 양식 저장</button><button type="button" id="dfcwDraft">임시저장</button><button type="button" id="dfcwSave" class="primary">저장</button><button type="button" id="dfcwDelete">삭제</button><button type="button" id="dfcwPrint">인쇄·PDF</button><button type="button" id="dfcwDownload">HWP 다운로드</button><button type="button" id="dfcwDownloadSet">한글 3종 다운로드</button><button type="button" id="dfcwRefresh">새로고침</button></div><div class="dfcw-layout"><aside class="dfcw-rail"><div class="dfcw-list-filters"><select id="dfcwYear" aria-label="작성연도"></select><select id="dfcwScope" aria-label="문서 상태"><option value="active">작성자료</option><option value="deleted">삭제자료</option></select><input type="search" id="dfcwSearch" placeholder="계약번호 · 업체명"></div><div id="dfcwRecordList"></div></aside><section class="dfcw-workspace"><div class="dfcw-contract-select" id="dfcwContractBar"><label>계약현황<button type="button" id="dfcwContractPicker">계약현황 선택</button><select id="dfcwContract" aria-label="계약현황" hidden></select></label><label>계약번호<input id="dfcwContractNo" placeholder="계약번호"></label></div><div id="dfcwLedgerTools" class="dfcw-ledger-tools" hidden><select id="dfcwSheet" aria-label="월별 시트"></select><button type="button" id="dfcwAddRow">행 추가</button><button type="button" id="dfcwAddCurrent">현재 계약 추가</button><input type="number" id="dfcwNewYear" min="1900" max="9999" aria-label="추가 연도"><select id="dfcwNewMonth" aria-label="추가 월">'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'월</option>').join('')+'</select><button type="button" id="dfcwAddMonth">월 추가</button></div><div id="dfcwEditor" class="dfcw-editor"></div></section></div>';
  view.append(p);
  p.querySelectorAll('[data-cw-type]').forEach(button=>button.onclick=()=>run(()=>changeType(button.dataset.cwType)));
  $('dfcwSaved').onclick=()=>run(()=>openSaved());$('dfcwContractPicker').onclick=()=>run(openContractPicker);$('dfcwTemplate').onclick=()=>run(toggleTemplate);$('dfcwTemplateSave').onclick=()=>run(saveTemplate);$('dfcwNew').onclick=()=>run(newRecord);$('dfcwDraft').onclick=()=>run(()=>saveCurrent('draft'));$('dfcwSave').onclick=()=>run(()=>saveCurrent('complete'));
  $('dfcwDelete').onclick=()=>run(toggleDeleted);$('dfcwPrint').onclick=()=>run(printCurrent);$('dfcwDownload').onclick=()=>run(()=>state.formType==='ledger'?downloadLedger():downloadHwp(state.formType));$('dfcwDownloadSet').onclick=()=>run(downloadSet);$('dfcwRefresh').onclick=()=>run(refresh);
  $('dfcwSearch').oninput=e=>{state.query=e.target.value;renderList();};$('dfcwYear').onchange=e=>{state.year=e.target.value;renderList();};$('dfcwScope').onchange=e=>{state.scope=e.target.value;renderList();};
  $('dfcwRecordList').onclick=e=>{const button=e.target.closest('[data-cw-record]');if(button)run(()=>selectRecord(button.dataset.cwRecord));};
  $('dfcwContract').onchange=e=>run(()=>chooseContract(e.target.value));
  $('dfcwContractNo').oninput=e=>{if(state.busy||!can(editAction())||state.data?.deleted)return;state.data.common.contract_no=e.target.value;markDirty();};
  $('dfcwSheet').onchange=e=>{state.ledger.sheet=e.target.value;renderLedger();navigationChanged(true);};$('dfcwAddRow').onclick=()=>run(addLedgerRow);$('dfcwAddCurrent').onclick=()=>run(addCurrentContract);$('dfcwAddMonth').onclick=()=>run(addMonth);
  $('dfcwNewYear').value=today().slice(0,4);$('dfcwNewMonth').value=String(Number(today().slice(5,7)));
  return p;
 }
 async function run(task){const who=actor(),client=api();try{return await task();}catch(error){if(actor()===who&&api()===client)setStatus(error.message||error,true);return null;}}
 function renderControls(){
  if(!page())return;const ledger=state.formType==='ledger',template=state.mode==='template',writable=can(ledger?(state.ledger.id?'update':'create'):editAction())&&!(state.data?.deleted&&!ledger);
  page().querySelectorAll('button,input,select').forEach(el=>{if(!el.closest('.dfcw-formatbar'))el.disabled=state.busy;});
  for(const id of ['dfcwSave','dfcwDraft']){$(id).disabled=state.busy||!writable;$(id).hidden=template;}
  $('dfcwTemplate').hidden=ledger;$('dfcwTemplate').disabled=state.busy||!can('view');$('dfcwTemplate').textContent=template?'문서 작성으로':'빈 양식 편집';$('dfcwTemplateSave').hidden=!template;$('dfcwTemplateSave').disabled=state.busy||!writable;
  $('dfcwNew').hidden=template;$('dfcwSaved').hidden=template;page().querySelector('[data-cw-type=ledger]').disabled=state.busy||template;page().querySelector('.dfcw-rail').hidden=true;page().querySelector('.dfcw-layout').classList.add('dfcw-single-layout');
  $('dfcwNew').disabled=state.busy||!can('create')||ledger;
  $('dfcwDelete').hidden=ledger||template;$('dfcwDelete').disabled=state.busy||!state.currentId||!can('delete');$('dfcwDelete').textContent=state.data?.deleted?'복원':'삭제';
  $('dfcwDownloadSet').hidden=ledger;$('dfcwDownload').textContent=ledger?'Excel 다운로드':'HWP 다운로드';$('dfcwPrint').hidden=ledger;
  for(const id of ['dfcwContract','dfcwContractPicker','dfcwContractNo'])$(id).disabled=state.busy||!can(editAction())||state.data?.deleted;
  for(const id of ['dfcwAddRow','dfcwAddCurrent','dfcwAddMonth','dfcwNewYear','dfcwNewMonth'])$(id).disabled=state.busy||!writable;
  $('dfcwRefresh').disabled=state.busy||state.loading;
  $('dfcwEditor')?.querySelectorAll('[data-cw-cell]').forEach(el=>el.disabled=state.busy||!writable);
 }
 function renderMeta(){
  if(!page())return;page().querySelectorAll('[data-cw-type]').forEach(b=>{b.classList.toggle('active',b.dataset.cwType===state.formType);b.setAttribute('aria-pressed',String(b.dataset.cwType===state.formType));});
  $('dfcwContractBar').hidden=state.formType==='ledger'||state.mode==='template';$('dfcwLedgerTools').hidden=state.formType!=='ledger';
  if(document.activeElement!==$('dfcwContractNo'))$('dfcwContractNo').value=common().contract_no||state.data?.linked_contract_no||'';
  renderControls();
 }
 function renderContracts(){
  if(!$('dfcwContract'))return;const select=$('dfcwContract'),id=state.data?.linked_contract_id||state.selectedContract||'';
  select.innerHTML='<option value="">연결하지 않음</option>'+state.contracts.map(row=>'<option value="'+esc(row.id)+'">'+esc([row.contract_no,row.requester_name||row.target_name].filter(Boolean).join(' · '))+'</option>').join('');
  if(id&&!state.contracts.some(row=>String(row.id)===id))select.insertAdjacentHTML('beforeend','<option value="'+esc(id)+'">'+esc(state.data?.linked_contract_no||'기존 연결 계약')+'</option>');select.value=id;const selected=state.contracts.find(row=>String(row.id)===String(id));$('dfcwContractPicker').textContent=selected?[selected.contract_no,selected.requester_name||selected.target_name].filter(Boolean).join(' · '):id?(state.data?.linked_contract_no||'기존 계약 선택됨'):'계약현황 선택';
 }
 function recordYear(row){return String(row.contract_date||row.data?.common?.contract_date||row.created_at||'').slice(0,4);}
 function renderList(){
  if(!$('dfcwRecordList'))return;const years=new Set([today().slice(0,4),...state.packages.map(recordYear).filter(y=>/^\d{4}$/.test(y))]);
  $('dfcwYear').innerHTML='<option value="all">전체 연도</option>'+[...years].sort().reverse().map(y=>'<option value="'+y+'">'+y+'년</option>').join('');$('dfcwYear').value=state.year;
  const q=state.query.trim().toLowerCase(),rows=state.packages.filter(row=>(state.scope==='deleted'?deleted(row):!deleted(row))&&(state.year==='all'||recordYear(row)===state.year)&&(!q||[row.document_no,row.client_name,row.package_name,row.data?.linked_contract_no,row.data?.common?.contract_no].join(' ').toLowerCase().includes(q))).sort((a,b)=>String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at))||String(b.id).localeCompare(String(a.id)));
  $('dfcwRecordList').innerHTML=rows.map(row=>'<button type="button" class="dfcw-record '+(row.id===state.currentId?'selected':'')+'" data-cw-record="'+esc(row.id)+'"><strong>'+esc(row.data?.linked_contract_no||row.data?.common?.contract_no||row.document_no)+'</strong><span>'+esc(row.client_name||row.package_name||'업체명 미입력')+'</span><small>'+esc(row.contract_date||String(row.updated_at||'').slice(0,10))+'</small></button>').join('')||'<p class="dfcw-empty">작성자료가 없습니다.</p>';if($('dfcwSavedDialog')&&!$('dfcwSavedDialog').hidden)renderSavedDialog();
 }
 function dialog(id,title){
  if($(id))return $(id);const overlay=document.createElement('div');overlay.id=id;overlay.className='dfcw-dialog';overlay.hidden=true;overlay.innerHTML='<section class="dfcw-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="'+id+'Title"><header><h2 id="'+id+'Title">'+title+'</h2><button type="button" data-cw-dialog-close aria-label="닫기">×</button></header><div class="dfcw-dialog-body"></div></section>';document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay||e.target.closest('[data-cw-dialog-close]'))closeDialog(overlay);};overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDialog(overlay);}if(e.key==='Tab'){const focusable=[...overlay.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&!el.hidden);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};return overlay;
 }
 function showDialog(overlay){overlay.returnFocus=document.activeElement;overlay.hidden=false;overlay.querySelector('input,select,button')?.focus();}
 function closeDialog(overlay){if(!overlay)return;overlay.hidden=true;if(overlay.returnFocus?.isConnected)overlay.returnFocus.focus();}
 function closeDialogs(){state.dialogSerial++;for(const id of ['dfcwSavedDialog','dfcwContractDialog'])closeDialog($(id));}
 function savedRows(){const q=state.query.trim().toLowerCase();return state.packages.filter(row=>(state.scope==='deleted'?deleted(row):!deleted(row))&&(!state.savedContractId||String(row.data?.linked_contract_id||row.data?.common?.contract_id||'')===state.savedContractId)&&(state.year==='all'||recordYear(row)===state.year)&&(!q||[row.document_no,row.client_name,row.package_name,row.data?.linked_contract_no,row.data?.common?.contract_no].join(' ').toLowerCase().includes(q))).sort((a,b)=>String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at))||String(b.id).localeCompare(String(a.id)));}
 function renderSavedDialog(){
  const overlay=$('dfcwSavedDialog');if(!overlay)return;const year=$('dfcwSavedYear'),years=new Set([today().slice(0,4),...state.packages.map(recordYear).filter(y=>/^\d{4}$/.test(y))]);year.innerHTML='<option value="all">전체 연도</option>'+[...years].sort().reverse().map(y=>'<option value="'+y+'">'+y+'년</option>').join('');year.value=state.year;$('dfcwSavedScope').value=state.scope;if(document.activeElement!==$('dfcwSavedSearch'))$('dfcwSavedSearch').value=state.query;
  const linked=state.contracts.find(row=>String(row.id)===state.savedContractId);$('dfcwSavedContract').hidden=!state.savedContractId;$('dfcwSavedContract').textContent=linked?[linked.contract_no,linked.requester_name||linked.target_name].filter(Boolean).join(' · '):'선택 계약';
  const rows=savedRows();$('dfcwSavedRows').innerHTML=rows.length?'<table class="dfcw-saved-table"><colgroup><col style="width:30%"><col style="width:40%"><col style="width:20%"><col style="width:10%"></colgroup><thead><tr><th>계약번호</th><th>업체명</th><th>저장일</th><th></th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+esc(row.data?.linked_contract_no||row.data?.common?.contract_no||row.document_no)+'</td><td>'+esc(row.client_name||row.package_name||'업체명 미입력')+'</td><td>'+esc(String(row.updated_at||row.created_at||'').slice(0,10))+'</td><td><button type="button" data-cw-saved="'+esc(row.id)+'">열기</button></td></tr>').join('')+'</tbody></table>':'<p class="dfcw-dialog-empty">'+esc(state.loading?'불러오는 중…':state.error?state.status:'저장내용이 없습니다.')+'</p>';
 }
 async function openSaved(options={}){
  ensure();bindIdentity();context();const who=state.owner,client=state.client;state.savedContractId=String(options.contractId||'');if(options.contractId&&options.query===undefined){state.query='';state.scope='active';}if(options.query!==undefined)state.query=String(options.query);if(options.year!==undefined)state.year=String(options.year);
  const overlay=dialog('dfcwSavedDialog','저장내용');if(!$('dfcwSavedRows')){overlay.querySelector('.dfcw-dialog-body').innerHTML='<div class="dfcw-dialog-filters"><select id="dfcwSavedYear" aria-label="저장연도"></select><select id="dfcwSavedScope" aria-label="저장 상태"><option value="active">작성자료</option><option value="deleted">삭제자료</option></select><input type="search" id="dfcwSavedSearch" placeholder="업체명 · 계약번호" aria-label="저장내용 검색"><button type="button" id="dfcwSavedAll">전체 계약</button></div><div id="dfcwSavedContract" class="dfcw-filter-tag" hidden></div><div id="dfcwSavedRows"></div>';$('dfcwSavedYear').onchange=e=>{state.year=e.target.value;renderList();};$('dfcwSavedScope').onchange=e=>{state.scope=e.target.value;renderList();};$('dfcwSavedSearch').oninput=e=>{state.query=e.target.value;renderList();};$('dfcwSavedAll').onclick=()=>{state.savedContractId='';renderSavedDialog();};$('dfcwSavedRows').onclick=e=>{const b=e.target.closest('[data-cw-saved]');if(b)run(()=>openSavedRecord(b.dataset.cwSaved));};}
  showDialog(overlay);renderSavedDialog();if(!state.loaded){await loadPackages();context(who,client);renderSavedDialog();}return true;
 }
 function visibleContractModal(){const modal=$('contractModal');return modal&&!modal.hidden&&modal.style.display!=='none'?modal:null;}
 function nativeContractBusy(modal){return !!modal&&(root.DFContractEditor?.busy?.()||modal.querySelector('#contractEditCancel')?.disabled||[...modal.querySelectorAll('button')].some(button=>button.disabled&&/저장\s*중/.test(button.textContent)));}
 function nativeContractDirty(modal){
  return [...(modal?.querySelectorAll('input,select,textarea')||[])].some(el=>{
   if(el.disabled||el.readOnly||['hidden','button','submit','reset','search','file'].includes(el.type))return false;
   if(el.tagName==='SELECT'){const options=[...el.options],defaults=options.filter(o=>o.defaultSelected);if(!el.multiple&&!defaults.length&&options.length)defaults.push(options.find(o=>!o.disabled)||options[0]);return canonical([...el.selectedOptions].map(o=>o.value))!==canonical(defaults.map(o=>o.value));}
   if(el.type==='checkbox'||el.type==='radio')return el.checked!==el.defaultChecked;return el.value!==el.defaultValue;
  });
 }
 async function openSavedRecord(id){
  if(state.busy)return false;const who=state.owner,client=state.client,native=visibleContractModal();
  if(nativeContractBusy(native))throw Error('계약 저장이 끝난 뒤 저장내용을 열어주세요.');
  if(nativeContractDirty(native)&&!root.confirm('열려 있는 계약의 저장하지 않은 수정을 취소하고 저장내용을 열까요?'))return false;
  if(state.mode==='template'&&!await leaveTemplate())return false;context(who,client);if(open()===false)return false;const selected=await selectRecord(id);context(who,client);
  if(selected&&native&&visibleContractModal()===native){
   if(nativeContractBusy(native))throw Error('계약 저장이 끝난 뒤 저장내용을 열어주세요.');
   if(typeof root.dfV69CloseContractModal!=='function')throw Error('계약 수정창을 닫은 뒤 저장내용을 다시 열어주세요.');root.dfV69CloseContractModal();
   if(visibleContractModal()===native)return false;
  }
  if(selected)closeDialog($('dfcwSavedDialog'));return selected;
 }
 function contractDay(value){const text=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const [y,m,d]=text.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return date.toISOString().slice(0,10)===text?date.getTime():null;}
 function contractPickerStatus(row,asOf=today()){
  const source=String(row?.source_status||'').trim().replace(/\s+/g,''),end=contractDay(row?.end_date),signed=contractDay(row?.contract_date||row?.start_date),start=contractDay(row?.start_date||row?.contract_date),day=contractDay(asOf),unknown={key:'unknown',label:'상태 확인'};
  if(/중지|정지/.test(source))return {key:'stopped',label:'중지'};
  if(/취소|해지|종결|종료/.test(source))return {key:'ended',label:/취소/.test(source)?'취소':/해지/.test(source)?'해지':'종료'};
  if(/만료/.test(source))return {key:'expired',label:'만료'};
  if(!['계약진행','입력완료'].includes(source))return source?{key:'ended',label:source}:unknown;
  if(end===null||day===null||start!==null&&end<start)return unknown;
  if(signed!==null&&signed>day)return {key:'future',label:'계약예정'};
  if(end<day)return {key:'expired',label:'만료'};
  const days=Math.ceil((end-day)/86400000),termStart=signed??start,termDays=termStart===null?null:Math.ceil((end-termStart)/86400000);
  if(days<=60&&(termDays===null||termDays>60))return {key:'expiring',label:'만료예정',days};return {key:'active',label:'계약중'};
 }
 function compareContractNumbers(a,b,direction=1){const number=row=>{const value=String(row?.contract_no??'').trim();return /^(?:-|—|없음)$/.test(value)?'':value;},left=number(a),right=number(b);if(!left||!right)return left?-1:right?1:0;return left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'})*direction;}
 function contractPickerRows(){
  const q=state.pickerQuery.trim().toLowerCase(),asOf=today(),ranks={expiring:0,expired:1,active:2,future:3,unknown:4,stopped:5,ended:6};return state.contracts.filter(row=>(state.pickerYear==='all'||String(row.contract_date||row.start_date||'').slice(0,4)===state.pickerYear)&&(state.pickerStatus==='all'||contractPickerStatus(row,asOf).key===state.pickerStatus)&&(!q||[row.contract_no,row.requester_name,row.target_name,row.contract_name].join(' ').toLowerCase().includes(q))).sort((a,b)=>{
   if(state.pickerSort==='number-desc'||state.pickerSort==='number-asc'){const numberOrder=compareContractNumbers(a,b,state.pickerSort==='number-asc'?1:-1);if(numberOrder)return numberOrder;}const sa=contractPickerStatus(a,asOf),sb=contractPickerStatus(b,asOf),rank=ranks[sa.key]-ranks[sb.key];if(rank)return rank;const ea=contractDay(a.end_date),eb=contractDay(b.end_date);if(ea!==eb){if(ea===null)return 1;if(eb===null)return -1;return sa.key==='expired'?eb-ea:ea-eb;}return String(b.contract_no||'').localeCompare(String(a.contract_no||''),undefined,{numeric:true})||String(a.id).localeCompare(String(b.id));
  });
 }
 function contractAmount(row){if(row?.amount===null||row?.amount===undefined||String(row.amount).trim()==='')return '—';const value=Number(row.amount);return Number.isFinite(value)?value.toLocaleString('ko-KR')+'원':'—';}
 function renderPickerSelection(){
  if(!$('dfcwPickerSelected'))return;for(const id of ['dfcwPickerYear','dfcwPickerSearch','dfcwPickerStatus','dfcwPickerSort'])if($(id))$(id).disabled=state.busy||state.pickerApplying;const selected=contractPickerRows().find(row=>String(row.id)===state.pickerSelectedId);if(!selected)state.pickerSelectedId='';
  $('dfcwPickerSelected').textContent=selected?[selected.contract_no,selected.requester_name||selected.target_name].filter(Boolean).join(' · '):'선택한 계약 없음';$('dfcwPickerApply').disabled=state.busy||state.pickerApplying||!selected||!can(editAction());$('dfcwPickerClear').disabled=state.busy||state.pickerApplying;
  $('dfcwPickerRows').querySelectorAll('[data-cw-contract]').forEach(row=>{const checked=row.dataset.cwContract===state.pickerSelectedId;row.classList.toggle('selected',checked);row.setAttribute('aria-selected',String(checked));const radio=row.querySelector('input');if(radio){radio.checked=checked;radio.disabled=state.busy||state.pickerApplying;}});
 }
 function selectContractCandidate(id){if(state.busy||state.pickerApplying)return false;if(!contractPickerRows().some(row=>String(row.id)===String(id)))return false;state.pickerSelectedId=String(id);renderPickerSelection();return true;}
 function renderContractDialog(){
  const year=$('dfcwPickerYear');if(!year)return;const years=new Set(state.contracts.map(row=>String(row.contract_date||row.start_date||'').slice(0,4)).filter(y=>/^\d{4}$/.test(y)));year.innerHTML='<option value="all">전체 연도</option>'+[...years].sort().reverse().map(y=>'<option value="'+y+'">'+y+'년</option>').join('');year.value=state.pickerYear;const rows=contractPickerRows();
  $('dfcwPickerRows').innerHTML=rows.length?'<table class="dfcw-contract-table"><colgroup><col style="width:7%"><col style="width:26%"><col style="width:15%"><col style="width:13%"><col style="width:17%"><col style="width:22%"></colgroup><thead><tr><th>순번</th><th>업체명</th><th>계약번호</th><th>상태</th><th>계약금액</th><th>기간</th></tr></thead><tbody>'+rows.map((row,i)=>{const status=contractPickerStatus(row);return '<tr tabindex="0" data-cw-contract="'+esc(row.id)+'"><td><label><input type="radio" name="dfcw-contract-choice" value="'+esc(row.id)+'" aria-label="'+esc((row.requester_name||row.target_name||'')+' '+(row.contract_no||'')+' 선택')+'"><span>'+(i+1)+'</span></label></td><td>'+esc(row.requester_name||row.target_name)+'</td><td>'+esc(row.contract_no)+'</td><td><span class="dfcw-contract-status '+status.key+'"'+(status.days!==undefined?' title="D-'+status.days+'"':'')+'>'+esc(status.label)+'</span></td><td class="dfcw-contract-amount">'+esc(contractAmount(row))+'</td><td>'+esc([row.start_date,row.end_date].filter(Boolean).join(' ~ ')||'—')+'</td></tr>';}).join('')+'</tbody></table>':'<p class="dfcw-dialog-empty">계약현황이 없습니다.</p>';renderPickerSelection();
 }
 async function applyContractPicker(id){
  if(id===undefined){id=state.pickerSelectedId;if(!id)return false;}if(state.busy||state.pickerApplying)return false;if(id&&!contractPickerRows().some(row=>String(row.id)===String(id)))return false;const who=state.owner,client=state.client;context(who,client);state.pickerApplying=true;renderPickerSelection();const pending=chooseContract(id),operation=busy(true);
  try{const selected=await pending;context(who,client);if(selected)closeDialog($('dfcwContractDialog'));return selected;}finally{busy(false,operation);if(actor()===who&&api()===client){state.pickerApplying=false;renderPickerSelection();}}
 }
 async function openContractPicker(){
  if(state.busy||state.mode==='template'||state.formType==='ledger')return false;context();const who=state.owner,client=state.client,serial=++state.dialogSerial;await loadContracts();context(who,client);if(serial!==state.dialogSerial||!state.active||state.mode==='template'||state.formType==='ledger')return false;const overlay=dialog('dfcwContractDialog','계약현황');if(!$('dfcwPickerRows')){
   overlay.querySelector('.dfcw-dialog-body').innerHTML='<div class="dfcw-dialog-filters"><select id="dfcwPickerYear" aria-label="계약연도"></select><select id="dfcwPickerStatus" aria-label="계약상태"><option value="all">전체 상태</option><option value="expiring">만료예정</option><option value="expired">만료</option><option value="active">계약중</option><option value="stopped">중지</option><option value="ended">종료·취소·해지</option><option value="future">계약예정</option><option value="unknown">상태 확인</option></select><select id="dfcwPickerSort" aria-label="계약현황 정렬"><option value="expiry">만료예정 우선</option><option value="number-desc">계약번호 최신순</option><option value="number-asc">계약번호 오래된순</option></select><input type="search" id="dfcwPickerSearch" placeholder="업체명 · 계약번호" aria-label="계약현황 검색"></div><div id="dfcwPickerRows"></div>';
   const footer=document.createElement('footer');footer.innerHTML='<span id="dfcwPickerSelected" role="status">선택한 계약 없음</span><button type="button" id="dfcwPickerClear">연결 해제</button><button type="button" id="dfcwPickerApply" class="primary" disabled>선택한 계약 불러오기</button>';overlay.querySelector('.dfcw-dialog-panel').append(footer);
   $('dfcwPickerYear').onchange=e=>{state.pickerYear=e.target.value;renderContractDialog();};$('dfcwPickerStatus').onchange=e=>{state.pickerStatus=e.target.value;renderContractDialog();};$('dfcwPickerSort').onchange=e=>{state.pickerSort=e.target.value;renderContractDialog();};$('dfcwPickerSearch').oninput=e=>{state.pickerQuery=e.target.value;renderContractDialog();};$('dfcwPickerClear').onclick=()=>run(()=>applyContractPicker(''));$('dfcwPickerApply').onclick=()=>run(()=>applyContractPicker());
   $('dfcwPickerRows').onclick=e=>{const row=e.target.closest('[data-cw-contract]');if(row)selectContractCandidate(row.dataset.cwContract);};$('dfcwPickerRows').onchange=e=>{const row=e.target.closest('[data-cw-contract]');if(row)selectContractCandidate(row.dataset.cwContract);};$('dfcwPickerRows').onkeydown=e=>{const row=e.target.closest('[data-cw-contract]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectContractCandidate(row.dataset.cwContract);}};
  }
  state.pickerSelectedId=String(state.data?.linked_contract_id||'');$('dfcwPickerSearch').value=state.pickerQuery;$('dfcwPickerStatus').value=state.pickerStatus;$('dfcwPickerSort').value=state.pickerSort;renderContractDialog();showDialog(overlay);return true;
 }
 function resetPackage(){state.mode='package';state.templateReturn=null;state.templatePending=!state.template.loaded;state.currentId=null;state.currentUpdated=null;state.pendingId=uuid();state.pendingSave=null;state.data=freshPackage();state.baseline=clone(state.data);state.selectedContract='';state.dirty=false;state.revision++;}
 function confirmPackageChange(){flushEditor();return !state.busy&&(!state.dirty||root.confirm('저장하지 않은 계약문서를 취소할까요?'));}
 async function newRecord(){if(state.mode==='template')return false;if(state.busy||!can('create')||!confirmPackageChange())return false;resetPackage();renderContracts();renderList();renderMeta();await mountEditor();navigationChanged();setStatus('새 계약문서');return true;}
 async function selectRecord(id,options={}){
  if(state.mode==='template')return false;if(state.busy||!options.force&&!confirmPackageChange())return false;const row=state.packages.find(r=>String(r.id)===String(id));if(!row)throw Error('저장된 계약문서를 찾지 못했습니다. 새로고침해주세요.');
  state.templatePending=false;state.currentId=row.id;state.currentUpdated=row.updated_at||null;state.pendingId=null;state.pendingSave=null;state.data=normalize(row);state.baseline=clone(state.data);state.selectedContract=state.data.linked_contract_id;state.dirty=false;state.revision++;
  if(state.formType==='ledger')state.formType='contract';renderContracts();renderList();renderMeta();await mountEditor();navigationChanged(options.restore===true);setStatus(state.data.deleted?'삭제자료':'저장된 계약문서');return true;
 }
 async function chooseContract(id){
  if(state.mode==='template'||state.busy||!can(editAction())||state.data?.deleted){renderContracts();return false;}
  if(!confirmPackageChange()){renderContracts();return false;}
  if(!id){state.data.linked_contract_id='';state.data.linked_contract_no='';state.data.common.contract_id='';state.selectedContract='';markDirty();renderContracts();return true;}
  const row=state.contracts.find(r=>String(r.id)===String(id));if(!row){renderContracts();throw Error('선택한 계약을 찾지 못했습니다. 새로고침해주세요.');}
  const saved=state.packages.filter(r=>!deleted(r)&&String(r.data?.linked_contract_id||r.data?.common?.contract_id||'')===String(id)).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  if(saved)return selectRecord(saved.id,{force:true});
  resetPackage();state.data.common={...state.data.common,...model().fromContract(clone(row))};state.data.linked_contract_id=String(row.id);state.data.linked_contract_no=String(row.contract_no||'');state.selectedContract=String(row.id);markDirty();renderContracts();renderMeta();await mountEditor();navigationChanged();return true;
 }
 async function readAll(client,table,columns,valid=()=>true){const who=state.owner,all=[];for(let from=0;;from+=500){context(who,client);if(!valid())return null;const result=await client.from(table).select(columns).order(table===TABLE?'updated_at':'contract_date',{ascending:false}).order('id').range(from,from+499);context(who,client);if(!valid())return null;if(result.error)throw result.error;all.push(...(result.data||[]));if((result.data||[]).length<500)return all;}}
 async function loadContracts(){
  try{if(typeof dfV68ContractState!=='undefined'&&dfV68ContractState?.loaded&&Array.isArray(dfV68ContractState.rows)){state.contracts=clone(dfV68ContractState.rows);renderContracts();return;}}catch(_){}
  const who=state.owner,client=state.client,rows=await readAll(client,'contracts','id,contract_no,contract_name,requester_name,requester_address,requester_biz_no,target_name,target_address,target_biz_no,amount,contract_date,start_date,end_date,source_status,authority,extra_data');context(who,client);state.contracts=rows;renderContracts();
 }
 function takeLedger(row){
  const raw=row?.data?.ledger||{},data={...emptyLedger(),...clone(raw)};for(const k of ['cells','appendRows','links'])if(!data[k]||typeof data[k]!=='object'||Array.isArray(data[k]))data[k]={};if(!Array.isArray(data.newSheets))data.newSheets=[];
  state.ledger.extra=clone(row?.data||{});state.ledger.id=row?.id||null;state.ledger.updated=row?.updated_at||null;state.ledger.pendingId=row?null:(state.ledger.pendingId||uuid());state.ledger.data=data;state.ledger.baseline=clone(data);state.ledger.loaded=true;state.ledger.dirty=false;
 }
 function takeTemplate(row){
  if(row&&(row.document_no!==TEMPLATE_NO||row.data?.schema!==TEMPLATE_SCHEMA))throw Error('기본 양식 저장자료가 다른 형식입니다. 현재 입력은 유지했습니다.');
  state.template.id=row?.id||null;state.template.updated=row?.updated_at||null;state.template.pendingId=row?null:(state.template.pendingId||uuid());state.template.pendingSave=null;state.template.data=templateData(row);state.template.loaded=true;
 }
 async function toggleTemplate(){
  if(state.busy)return false;if(state.mode==='template')return leaveTemplate();flushEditor();const who=state.owner,client=state.client;context(who,client);const operation=busy(true);
  try{
   if(!state.template.loaded){await loadPackages();context(who,client);if(!state.template.loaded)throw Error('기본 양식을 불러오지 못했습니다. 새로고침 후 다시 열어주세요.');}
   state.templateReturn={currentId:state.currentId,currentUpdated:state.currentUpdated,pendingId:state.pendingId,pendingSave:clone(state.pendingSave),data:clone(state.data),baseline:clone(state.baseline),selectedContract:state.selectedContract,dirty:state.dirty,formType:state.formType,templatePending:state.templatePending};
   state.mode='template';state.templatePending=false;state.currentId=null;state.currentUpdated=null;state.pendingId=null;state.pendingSave=null;state.data=clone(state.template.data);state.baseline=clone(state.data);state.selectedContract='';state.dirty=false;if(state.formType==='ledger')state.formType='contract';state.revision++;
   renderContracts();renderList();renderMeta();await mountEditor();context(who,client);setStatus('기본 양식 편집');navigationChanged();return true;
  }finally{busy(false,operation);}
 }
 async function leaveTemplate(options={}){
  if(state.mode!=='template')return true;if(state.busy)return false;flushEditor();if(!options.discard&&state.dirty&&!root.confirm('저장하지 않은 기본 양식 수정을 취소할까요?'))return false;
  const saved=state.templateReturn;state.mode='package';state.templateReturn=null;if(saved)Object.assign(state,clone(saved));else resetPackage();state.revision++;
  renderContracts();renderList();renderMeta();if(state.formType==='ledger')await showLedger();else await mountEditor();setStatus(state.dirty?'미저장':'계약문서');navigationChanged();return true;
 }
 function templatePayload(){
  const data={...clone(state.data),schema:TEMPLATE_SCHEMA,editor_version:446,common:clone(common()),documents:documentMaps(state.data.documents),styles:documentMaps(state.data.styles),saved_by:state.owner};delete data.common.contract_id;delete data.linked_contract_id;delete data.linked_contract_no;delete data.deleted;
  return {document_no:TEMPLATE_NO,package_name:'계약 기본 양식',client_name:'주식회사 드림포이엔',contract_date:null,start_date:null,end_date:null,status:'draft',data,updated_at:now()};
 }
 async function saveTemplate(){
  if(state.busy||state.mode!=='template')return;const action=state.template.id?'update':'create';context(state.owner,state.client,action);flushEditor();const payload=templatePayload(),operation=busy(true);setStatus('기본 양식 저장 중…');
  try{await commit(payload,'template',action);renderMeta();setStatus('기본 양식 저장 완료');navigationChanged(true);return state.template.id;}finally{busy(false,operation);}
 }
 async function refreshTemplate(){
  if(state.busy)return false;flushEditor();if(state.dirty&&!root.confirm('저장하지 않은 기본 양식 수정을 취소하고 새로고침할까요?'))return false;const who=state.owner,client=state.client,dirty=state.dirty,wasLoaded=state.template.loaded,operation=busy(true);state.template.loaded=false;
  try{const loaded=await loadPackages();context(who,client);if(!loaded){state.dirty=dirty;state.template.loaded=wasLoaded;renderMeta();return false;}state.data=clone(state.template.data);state.baseline=clone(state.data);state.dirty=false;await mountEditor();context(who,client);renderMeta();setStatus('기본 양식');return true;}finally{busy(false,operation);}
 }
 async function loadPackages(){
  const who=state.owner,client=state.client,serial=++state.readSerial;state.loading=true;renderControls();
  try{const rows=await readAll(client,TABLE,'*',()=>serial===state.readSerial);context(who,client);if(serial!==state.readSerial||!rows)return false;state.packages=rows.filter(r=>!ledgerRow(r)&&!templateRow(r));const ledger=rows.find(ledgerRow);if(!state.ledger.dirty)takeLedger(ledger);if(state.mode!=='template'||!state.template.loaded)takeTemplate(rows.find(templateRow));if(state.mode==='package'&&state.templatePending&&!state.currentId&&!state.dirty){state.data=freshPackage();state.baseline=clone(state.data);state.templatePending=false;if(state.active&&state.formType!=='ledger')await mountEditor();context(who,client);if(serial!==state.readSerial)return false;}state.loaded=true;renderList();if(state.formType==='ledger')await renderLedger();return true;}
  catch(error){if(serial===state.readSerial&&actor()===who&&api()===client){const missing=/42P01|does not exist|schema cache|contract_document_packages/i.test(String(error.code||'')+' '+String(error.message||''));setStatus(missing?'계약문서 저장소 설치가 필요합니다. SQL_v120_37_12_contract_documents.sql을 적용해주세요.':error.message||error,true);}return false;}
  finally{if(serial===state.readSerial){state.loading=false;renderControls();}}
 }
 async function refresh(){if(state.busy)return;flushEditor();if(state.mode==='template')return refreshTemplate();if((state.dirty||state.ledger.dirty)&&!root.confirm('저장하지 않은 변경사항을 취소하고 새로고침할까요?'))return;state.dirty=false;state.ledger.dirty=false;await loadPackages();await loadContracts();if(state.currentId){const row=state.packages.find(r=>r.id===state.currentId);if(row)await selectRecord(row.id,{force:true});}else if(state.formType!=='ledger')await mountEditor();}
 function packagePayload(mode){
  const c=clone(common()),data={...clone(state.data),schema:SCHEMA,common:c,saved_by:state.owner,deleted:state.data?.deleted===true};
  const pending=state.pendingId||(state.pendingId=uuid()),existing=state.packages.find(r=>r.id===state.currentId);
  const no=existing?.document_no||state.pendingSave?.payload?.document_no||'DFEN-CD-'+today().replace(/-/g,'')+'-'+pending.replace(/-/g,'').slice(0,12).toUpperCase();
  return {document_no:no,package_name:[c.contract_no||c.client_name||'새 계약','계약문서'].join(' '),client_name:String(c.client_name||'미입력 계약업체'),contract_date:c.contract_date||null,start_date:c.start_date||null,end_date:c.end_date||null,status:mode==='complete'?'complete':'draft',data,updated_at:now()};
 }
 async function commit(payload,kind,permission){
  const who=state.owner,client=context(who,state.client,permission),ledger=kind==='ledger',template=kind==='template',slot=ledger?state.ledger:template?state.template:null,id=slot?(slot.id||slot.pendingId||(slot.pendingId=uuid())):(state.currentId||state.pendingId||(state.pendingId=uuid()));
  let existing=slot?slot.id:state.currentId,updated=slot?slot.updated:state.currentUpdated,recovered=null;
  const pending=slot?slot.pendingSave:state.pendingSave;
  if(!existing&&pending?.attempted){
    const found=await client.from(TABLE).select('*').eq('id',id).maybeSingle();context(who,client,permission);if(found.error)throw found.error;
    if(found.data){if(found.data.created_by!==who||found.data.document_no!==pending.payload.document_no||canonical(found.data.data)!==canonical(pending.payload.data))throw Error('이전 저장 결과가 변경되었습니다. 현재 입력을 유지했으니 저장자료를 확인해주세요.');
      existing=found.data.id;updated=found.data.updated_at||null;const identical=canonical(found.data.data)===canonical(payload.data)&&['document_no','package_name','client_name','contract_date','start_date','end_date','status'].every(k=>(found.data[k]??null)===(payload[k]??null));if(identical)recovered=found;else{permission='update';context(who,client,permission);}if(slot){slot.id=existing;slot.updated=updated;}else{state.currentId=existing;state.currentUpdated=updated;}
    }
  }
  if(!existing){const request={attempted:true,payload:clone(payload)};if(slot)slot.pendingSave=request;else state.pendingSave=request;}
  let result=recovered;if(!result){let query;if(existing){query=client.from(TABLE).update(payload).eq('id',id);query=updated?query.eq('updated_at',updated):query.is('updated_at',null);}else query=client.from(TABLE).insert({...payload,id,created_by:who});try{result=await query.select('*').maybeSingle();}catch(error){result={error};}}
  context(who,client,permission);
  if(result.error){const found=await client.from(TABLE).select('*').eq('id',id).maybeSingle();context(who,client,permission);if(!found.error&&found.data&&(existing||found.data.created_by===who)&&found.data.document_no===payload.document_no&&canonical(found.data.data)===canonical(payload.data))result=found;else throw result.error;}
  if(!result.data?.id)throw Error('다른 곳에서 변경된 문서이거나 저장 권한이 바뀌었습니다. 입력 내용은 유지했습니다.');
  const row=result.data;state.readSerial++;state.loading=false;state.revision++;
  if(ledger){state.ledger.id=row.id;state.ledger.updated=row.updated_at||null;state.ledger.pendingId=null;state.ledger.pendingSave=null;state.ledger.baseline=clone(state.ledger.data);state.ledger.dirty=false;}
  else if(template){takeTemplate(row);state.data=clone(state.template.data);state.baseline=clone(state.data);state.dirty=false;}
  else{const at=state.packages.findIndex(r=>r.id===row.id);if(at<0)state.packages.push(row);else state.packages[at]=row;state.currentId=row.id;state.currentUpdated=row.updated_at||null;state.pendingId=null;state.pendingSave=null;state.data=normalize(row);state.baseline=clone(state.data);state.dirty=false;}
  return row;
 }
 async function saveCurrent(mode='draft'){
  if(state.busy)return;if(state.mode==='template')return saveTemplate();if(state.formType==='ledger')return saveLedger();const action=editAction();context(state.owner,state.client,action);flushEditor();
  if(state.data?.deleted)throw Error('삭제자료를 먼저 복원해주세요.');if(mode==='complete'&&!String(common().client_name||'').trim())throw Error('계약업체명을 입력하거나 임시저장해주세요.');
  const payload=packagePayload(mode),operation=busy(true);setStatus('저장 중…');
  try{await commit(payload,'package',action);renderList();renderMeta();setStatus('저장 완료');navigationChanged(true);return state.currentId;}finally{busy(false,operation);}
 }
 async function toggleDeleted(){
  if(state.mode==='template'||state.busy||!state.currentId)return;context(state.owner,state.client,'delete');flushEditor();const next=!state.data.deleted;if(!root.confirm(next?'선택한 계약문서를 삭제자료로 옮길까요?':'선택한 계약문서를 복원할까요?'))return;
  const old=state.data.deleted;state.data.deleted=next;const payload=packagePayload('draft'),operation=busy(true);
  try{await commit(payload,'package','delete');state.scope=next?'deleted':'active';$('dfcwScope').value=state.scope;renderList();renderMeta();setStatus(next?'삭제자료로 이동했습니다.':'복원했습니다.');}catch(error){state.data.deleted=old;throw error;}finally{busy(false,operation);}
 }
 async function mountEditor(){
  if(!state.active||state.formType==='ledger')return;const serial=++state.editorSerial,who=state.owner,client=state.client,type=state.formType,host=$('dfcwEditor');state.editor?.destroy?.();state.editor=null;host.replaceChildren();
  if(!root.DF_CONTRACT_FORM_EDITOR?.mount)throw Error('계약 편집기를 불러오지 못했습니다. 새로고침해주세요.');
  const editable=!state.busy&&can(editAction())&&!state.data?.deleted;
  let editor;try{editor=await root.DF_CONTRACT_FORM_EDITOR.mount(host,{type,common:clone(common()),overrides:clone(state.data.documents[type]||{}),styles:clone(state.data.styles[type]||{}),editable,onChange:change=>{
    if(serial!==state.editorSerial||actor()!==who||api()!==client||state.busy||!can(editAction())||state.data?.deleted)return;
    if(change.overrides)state.data.documents[type]=clone(change.overrides);else if(change.index!==undefined)state.data.documents[type][String(change.index)]=String(change.text??'');
    if(change.styles&&typeof change.styles==='object'&&!Array.isArray(change.styles))state.data.styles[type]=clone(change.styles);
    if(change.commonPatch&&typeof change.commonPatch==='object')Object.assign(state.data.common,clone(change.commonPatch));markDirty();
  }});}catch(error){if(serial!==state.editorSerial||actor()!==who||api()!==client||!state.active||state.formType!==type)return;throw error;}
  if(serial!==state.editorSerial||actor()!==who||api()!==client||!state.active||state.formType!==type){editor?.destroy?.();return;}
  state.editor=editor;editor.setEditable?.(!state.busy&&editable);renderMeta();
 }
 async function changeType(type){if(!TYPES[type]||state.busy||state.mode==='template'&&type==='ledger')return false;if(state.formType===type)return true;flushEditor();state.formType=type;state.editorSerial++;state.editor?.destroy?.();state.editor=null;renderMeta();if(type==='ledger')await showLedger();else await mountEditor();navigationChanged();return true;}
 function filename(type,ext){const c=common(),name=[c.contract_no||state.data?.linked_contract_no,c.client_name,TYPES[type]].filter(Boolean).join('_').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');return (name||TYPES[type])+'.'+ext;}
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function hwpBlob(type){context();const who=state.owner,client=state.client,changes=await model().buildChanges(type,clone(common()),clone(state.data.documents[type]||{})),blob=await root.DF_CONTRACT_ORIGINAL_HWP.generate(type,changes,{styles:clone(state.data.styles[type]||{})});context(who,client);return blob;}
 async function downloadHwp(type){if(state.busy)return;flushEditor();const operation=busy(true);try{download(await hwpBlob(type),filename(type,'hwp'));setStatus('한글 파일을 만들었습니다.');}finally{busy(false,operation);}}
 async function downloadSet(){if(state.busy)return;if(!root.JSZip)throw Error('압축 구성요소를 불러오지 못했습니다.');flushEditor();const operation=busy(true);try{const zip=new root.JSZip();for(const type of ['contract','plan','notice'])zip.file(filename(type,'hwp'),await (await hwpBlob(type)).arrayBuffer());const who=state.owner,client=state.client,blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});context(who,client);download(blob,filename('contract','zip').replace('_표준계약서.zip','_계약문서3종.zip'));setStatus('한글 3종을 만들었습니다.');}finally{busy(false,operation);}}
 function printCurrent(){if(state.busy||state.formType==='ledger')return;if(!state.editor?.html)throw Error('인쇄할 문서를 불러오는 중입니다.');context();flushEditor();const win=root.open('about:blank','_blank');if(!win)throw Error('인쇄 창을 열 수 없습니다. 팝업을 허용해주세요.');const html=state.editor.html();win.document.open();win.document.write(html);win.document.close();const print=()=>{if(win.document.fonts?.ready)win.document.fonts.ready.then(()=>win.print());else win.print();};if(win.document.readyState==='complete')print();else win.addEventListener('load',print,{once:true});}
 function ledgerDirty(){state.ledger.dirty=true;state.revision++;setStatus('미저장');renderControls();}
 const letters='ABCDEFG';
 function point(address){const m=String(address).match(/^([A-Z]+)(\d+)$/);if(!m)return null;let col=0;for(const c of m[1])col=col*26+c.charCodeAt(0)-64;return {col,row:Number(m[2])};}
 function sheetView(name){
  const original=state.ledger.inspect?.sheets||[],request=state.ledger.data.newSheets.find(s=>s.name===name),base=original.find(s=>s.name===(request?.template||name));if(!base)return null;
  const sheet=clone(base);sheet.name=name;sheet.cells=sheet.cells||[];let last=Math.max(15,...sheet.rows.map(r=>r.number),...sheet.cells.map(c=>point(c.address)?.row||0));
  if(request){sheet.cells.forEach(c=>{const p=point(c.address);if(p?.row>=5&&p.row<=15&&p.col<=7)c.value=null;if(c.address==='A1')c.value=request.title;});(request.rows||[]).forEach((row,i)=>row.forEach((v,c)=>{const address=letters[c]+(5+i),cell=sheet.cells.find(x=>x.address===address);if(cell)cell.value=v;else sheet.cells.push({...clone(base.cells.find(x=>x.address===letters[c]+'5')||{}),address,value:v});}));}
  last=Math.max(last,4+(request?.rows?.length||0));const additions=state.ledger.data.appendRows[name]||[],template=sheet.cells.filter(c=>point(c.address)?.row===Math.max(...sheet.rows.map(r=>r.number))); 
  additions.forEach((row,i)=>row.forEach((v,c)=>{const inherited=clone(template.find(x=>point(x.address)?.col===c+1)||{});sheet.cells.push({...inherited,address:letters[c]+(last+i+1),value:v});}));last+=additions.length;
  for(const [address,value]of Object.entries(state.ledger.data.cells[name]||{})){const cell=sheet.cells.find(c=>c.address===address);if(cell)cell.value=value;else sheet.cells.push({address,value});}
  sheet.lastRow=last;return sheet;
 }
 function allSheetNames(){return [...(state.ledger.inspect?.sheets||[]).map(s=>s.name),...state.ledger.data.newSheets.map(s=>s.name)];}
 async function showLedger(){
  state.editorSerial++;state.editor?.destroy?.();state.editor=null;const who=state.owner,client=state.client;
  if(!state.ledger.inspect){setStatus('계약체결 현황을 불러오는 중…');const result=await root.DFContractOriginalExcel.inspect();context(who,client);state.ledger.inspect=result;}
  if(!state.active||state.formType!=='ledger')return;
  if(!state.ledger.sheet||!allSheetNames().includes(state.ledger.sheet)){const m=Number(today().slice(5,7));state.ledger.sheet=allSheetNames().find(name=>name===m+'월')||allSheetNames().at(-1)||'';}
  renderLedger();setStatus(state.ledger.dirty?'미저장':'');
 }
 function color(value,fallback){if(value?.rgb&&/^[0-9a-f]{6,8}$/i.test(value.rgb))return '#'+value.rgb.slice(-6);return fallback;}
 function cellStyle(cell){
  const f=cell.font||{},a=cell.alignment||{},b=cell.border||{},fill=cell.fill||{},css=['font-family:'+JSON.stringify(f.name||'맑은 고딕')+',sans-serif','font-size:'+(Number(f.size)||11)+'pt','font-weight:'+(f.bold?700:400),'font-style:'+(f.italic?'italic':'normal'),'text-align:'+(a.horizontal==='center'?'center':a.horizontal==='right'?'right':'left'),'vertical-align:'+(a.vertical==='top'?'top':a.vertical==='bottom'?'bottom':'middle'),'color:'+color(f.color,'#000'),'background:'+color(fill.fgColor,'transparent')];
  for(const side of ['left','right','top','bottom'])if(b[side]?.style){const style=b[side].style;css.push('border-'+side+':'+(/medium|thick/i.test(style)?'1.5px':'1px')+' '+(/dashed|dotted/.test(style)?style:'solid')+' '+color(b[side].color,'#000'));}return css.join(';');
 }
 function renderLedger(){
  if(!state.active||state.formType!=='ledger'||!state.ledger.inspect)return;
  const names=allSheetNames();if(!names.includes(state.ledger.sheet))state.ledger.sheet=names.at(-1)||'';
  $('dfcwSheet').innerHTML=names.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');$('dfcwSheet').value=state.ledger.sheet;
  const sheet=sheetView(state.ledger.sheet),host=$('dfcwEditor');if(!sheet){host.innerHTML='<p class="dfcw-empty">월별 시트를 선택해주세요.</p>';return;}
  const starts=new Map(),covered=new Set();for(const merge of sheet.merges||[]){const [start,end]=merge.split(':').map(point);if(!start||!end||start.col>7)continue;starts.set(letters[start.col-1]+start.row,{rows:end.row-start.row+1,cols:Math.min(7,end.col)-start.col+1});for(let r=start.row;r<=end.row;r++)for(let c=start.col;c<=Math.min(7,end.col);c++)if(r!==start.row||c!==start.col)covered.add(letters[c-1]+r);}
  const map=new Map(sheet.cells.map(c=>[c.address,c])),editable=!state.busy&&can(state.ledger.id?'update':'create');
  const columns=letters.split('').map((_,i)=>{const native=sheet.columns.find(c=>c.min<=i+1&&c.max>=i+1);return Math.max(25,(native?.width||sheet.defaultColumnWidth||8.43)*7+5);});
  const width=columns.reduce((a,b)=>a+b,0);
  let rows='';for(let r=1;r<=sheet.lastRow;r++){const height=Number(sheet.rowHeights[r]||sheet.defaultRowHeight||15);rows+='<tr style="height:'+height+'pt">';for(let c=1;c<=7;c++){const address=letters[c-1]+r;if(covered.has(address))continue;const cell=map.get(address)||{},span=starts.get(address),v=cell.value===null||cell.value===undefined?'':cell.value;rows+='<td style="'+esc(cellStyle(cell))+'"'+(span?' rowspan="'+span.rows+'" colspan="'+span.cols+'"':'')+'><textarea data-cw-cell="'+address+'" aria-label="'+esc(sheet.name+' '+address)+'" style="'+esc(cellStyle(cell))+';min-height:'+Math.max(15,height-3)+'pt" '+(editable?'':'disabled')+'>'+esc(v)+'</textarea></td>';}rows+='</tr>';}
  host.innerHTML='<div class="dfcw-grid-scroll"><table class="dfcw-native-grid" style="width:'+width+'px"><colgroup>'+columns.map(w=>'<col style="width:'+w+'px">').join('')+'</colgroup><tbody>'+rows+'</tbody></table></div>';
  host.oninput=e=>{const address=e.target.dataset.cwCell;if(!address||state.busy||!can(state.ledger.id?'update':'create'))return;const name=state.ledger.sheet;state.ledger.data.cells[name]||={};const source=map.get(address)?.value;const v=e.target.value;state.ledger.data.cells[name][address]=typeof source==='number'&&/^[-+]?\d+(\.\d+)?$/.test(v)?Number(v):v;ledgerDirty();};renderMeta();
 }
 function firstBlankRow(sheet){const values=new Map(sheet.cells.map(c=>[c.address,c.value]));for(let r=5;r<=sheet.lastRow;r++)if(letters.split('').every(c=>!String(values.get(c+r)??'').trim()))return r;return 0;}
 function continuationSheet(){
  const base=state.ledger.sheet.replace(/\(\d+\)$/,''),original=sheetView(state.ledger.sheet),title=String(original?.cells.find(c=>c.address==='A1')?.value||'측정대행업자 계약체결 현황');
  const request=state.ledger.data.newSheets.find(s=>s.name===state.ledger.sheet),template=state.ledger.inspect.sheets.find(s=>s.name===(request?.template||state.ledger.sheet))||state.ledger.inspect.sheets.find(s=>s.name==='11월')||state.ledger.inspect.sheets.at(-1);if(!template)throw Error('원본 월별 양식을 찾지 못했습니다.');
  for(let n=2;n<=121;n++){const suffix='('+n+')',name=base.slice(0,31-suffix.length)+suffix;if(allSheetNames().includes(name)){const existing=sheetView(name);if(firstBlankRow(existing)){state.ledger.sheet=name;return existing;}continue;}
   if(state.ledger.data.newSheets.length>=120)throw Error('추가 시트는 120개까지 작성할 수 있습니다.');state.ledger.data.newSheets.push({name,template:template.name,title,rows:[]});state.ledger.sheet=name;return sheetView(name);
  }throw Error('추가할 월별 시트를 확인해주세요.');
 }
 function addLedgerRow(){if(state.busy||!can(state.ledger.id?'update':'create'))return;let sheet=sheetView(state.ledger.sheet);if(!sheet)return;let row=firstBlankRow(sheet);if(!row){sheet=continuationSheet();row=firstBlankRow(sheet);ledgerDirty();renderLedger();}setStatus(row+'행에 입력해주세요.');$('dfcwEditor').querySelector('[data-cw-cell="A'+row+'"]')?.focus();}
 function ledgerRecordValues(){
  const c=common(),linked=state.contracts.find(r=>String(r.id)===String(state.data?.linked_contract_id));
  return [String(c.jurisdiction||linked?.authority||c.notice_authority||''),'주식회사 드림포이엔',String(c.business_field||linked?.extra_data?.business_field||linked?.extra_data?.field||linked?.field||'대기'),String(c.business_grade||linked?.extra_data?.business_grade||linked?.extra_data?.grade||linked?.grade||''),String(c.client_name||''),[c.start_date,c.end_date].filter(Boolean).join(' ~ '),String(c.status_note||'')];
 }
 function addCurrentContract(){
  if(state.busy||!can(state.ledger.id?'update':'create'))return;const c=common(),contractId=String(state.data?.linked_contract_id||''),packageId=String(state.currentId||'');if(!contractId&&!packageId)throw Error('연결 계약을 선택하거나 계약문서를 저장한 후 추가해주세요.');if(!String(c.client_name||'').trim())throw Error('추가할 계약업체명을 입력해주세요.');
  const key=contractId?'contract:'+contractId:'package:'+packageId,prior=state.ledger.data.links[key];if(prior){state.ledger.sheet=prior.sheet;renderLedger();setStatus('이미 추가된 계약입니다. '+prior.sheet+' '+prior.row+'행');return;}
  let name=state.ledger.sheet,sheet=sheetView(name);if(!sheet)throw Error('월별 시트를 선택해주세요.');const values=ledgerRecordValues();
  let row=firstBlankRow(sheet);if(!row){sheet=continuationSheet();name=state.ledger.sheet;row=firstBlankRow(sheet);}
  state.ledger.data.cells[name]||={};values.forEach((value,i)=>state.ledger.data.cells[name][letters[i]+row]=value);
  state.ledger.data.links[key]={contract_id:contractId,package_id:packageId,sheet:name,row};ledgerDirty();renderLedger();setStatus('현재 계약을 추가했습니다. 저장해주세요.');
 }
 function addMonth(){
  if(state.busy||!can(state.ledger.id?'update':'create'))return;const year=Number($('dfcwNewYear').value),month=Number($('dfcwNewMonth').value);if(!Number.isInteger(year)||year<1900||year>9999||month<1||month>12)throw Error('추가할 연도와 월을 확인해주세요.');
  const existing=allSheetNames().find(name=>{const sheet=sheetView(name),title=String(sheet?.cells.find(c=>c.address==='A1')?.value||''),ym=title.match(/(\d{4})\s*[.년/-]\s*(\d{1,2})/),named=name.match(/^(\d{4})[.]([0-9]{1,2})월/);return (ym&&Number(ym[1])===year&&Number(ym[2])===month)||(named&&Number(named[1])===year&&Number(named[2])===month);});if(existing){state.ledger.sheet=existing;renderLedger();return;}
  const name=year+'.'+String(month).padStart(2,'0')+'월';if(allSheetNames().includes(name)){state.ledger.sheet=name;renderLedger();return;}if(state.ledger.data.newSheets.length>=120)throw Error('추가 시트는 120개까지 작성할 수 있습니다.');
  const template=state.ledger.inspect.sheets.find(s=>s.name==='11월')||state.ledger.inspect.sheets.at(-1);if(!template)throw Error('복사할 원본 월별 시트를 찾지 못했습니다.');
  const last=new Date(year,month,0).getDate(),mm=String(month).padStart(2,'0');state.ledger.data.newSheets.push({name,template:template.name,title:'측정대행업자 계약체결 현황('+year+'.'+mm+'.01~'+year+'.'+mm+'.'+last+')',rows:[]});state.ledger.sheet=name;ledgerDirty();renderLedger();navigationChanged(true);
 }
 function ledgerPayload(){return {document_no:LEDGER_NO,package_name:'측정대행 계약체결 현황',client_name:'주식회사 드림포이엔',contract_date:null,start_date:null,end_date:null,status:'draft',data:{...clone(state.ledger.extra||{}),schema:LEDGER_SCHEMA,ledger:clone(state.ledger.data),saved_by:state.owner},updated_at:now()};}
 async function saveLedger(){if(state.busy)return;const action=state.ledger.id?'update':'create';context(state.owner,state.client,action);const payload=ledgerPayload(),operation=busy(true);setStatus('저장 중…');try{await commit(payload,'ledger',action);setStatus('누적 현황 저장 완료');renderMeta();return state.ledger.id;}finally{busy(false,operation);}}
 async function downloadLedger(){if(state.busy)return;const operation=busy(true);try{const who=state.owner,client=state.client,blob=await root.DFContractOriginalExcel.generate(clone(state.ledger.data));context(who,client);download(blob,'측정대행_계약체결현황_'+today()+'.xlsx');setStatus('Excel 파일을 만들었습니다.');}finally{busy(false,operation);}}
 function navigationChanged(replace=false){if(!state.active)return;root.DF_NAVIGATION_GUARD?.changed?.({replace});}
 function resetIdentity(){
  closeDialogs();for(const id of ['dfcwSavedDialog','dfcwContractDialog'])$(id)?.remove();state.savedContractId='';state.pickerSelectedId='';state.pickerApplying=false;state.pickerYear='all';state.pickerQuery='';state.pickerStatus='all';state.pickerSort='expiry';
  state.mode='package';state.template=emptyTemplate();state.templateReturn=null;state.templatePending=false;state.editorSerial++;state.readSerial++;state.editor?.destroy?.();state.editor=null;state.packages=[];state.contracts=[];state.loaded=false;state.loading=false;state.busy=false;state.busyToken=null;state.currentId=null;state.currentUpdated=null;state.pendingId=null;state.pendingSave=null;state.data=null;state.baseline=null;state.dirty=false;state.selectedContract='';state.ledger={id:null,updated:null,pendingId:null,data:emptyLedger(),baseline:emptyLedger(),dirty:false,loaded:false,sheet:'',inspect:state.ledger.inspect};$('dfcwEditor')?.replaceChildren();
 }
 function bindIdentity(){const who=actor(),client=api();if(!who||!client)throw Error('로그인 및 DB 연결을 확인해주세요.');if(who!==state.owner||client!==state.client){resetIdentity();state.owner=who;state.client=client;resetPackage();}context(who,client);}
 function rollbackDrafts(){
  if(state.mode==='template'){state.data=clone(state.baseline||templateData());state.dirty=false;if(state.templateReturn?.dirty){state.templateReturn.data=clone(state.templateReturn.baseline||blankData());state.templateReturn.dirty=false;state.templateReturn.selectedContract=state.templateReturn.data.linked_contract_id||'';}}
  if(state.dirty){state.data=clone(state.baseline||blankData());state.dirty=false;state.selectedContract=state.data.linked_contract_id||'';}
  if(state.ledger.dirty){state.ledger.data=clone(state.ledger.baseline||emptyLedger());state.ledger.dirty=false;}
 }
 function confirmLeave(){if(state.busy)return false;flushEditor();if(!state.dirty&&!state.ledger.dirty&&!state.templateReturn?.dirty)return true;if(!root.confirm('저장하지 않은 계약작성 내용을 취소하고 이동할까요?'))return false;rollbackDrafts();return true;}
 function hide(){closeDialogs();state.active=false;state.editorSerial++;state.editor?.destroy?.();state.editor=null;if(page()){page().hidden=true;page().style.display='none';}}
 function show(){
  if(!can('view')){setStatus('계약작성 조회 권한을 확인해주세요.',true);return false;}ensure();bindIdentity();state.active=true;const p=page(),was=p.hidden;p.hidden=false;p.style.display='';const ledger=$('dfViewContract')?.querySelector('.contract-page');if(ledger){ledger.hidden=true;ledger.style.display='none';}
  renderContracts();renderList();renderMeta();if(was||!state.editor){if(state.formType==='ledger')run(showLedger);else run(mountEditor);}
  if(!state.loaded&&!state.loading){run(loadPackages);run(loadContracts);}return true;
 }
 function selectTab(tab,options={}){
  const p=ensure(),previous=p&&!p.hidden?'documents':'ledger';if(tab==='documents'){if(!show())return false;}else{hide();const ledger=$('dfViewContract')?.querySelector('.contract-page');if(ledger){ledger.hidden=false;ledger.style.display='';}if(previous!=='ledger')root.dfV68LoadContracts?.();}
  if(previous!==(tab==='documents'?'documents':'ledger'))root.dispatchEvent(new CustomEvent('df-contract-documents-tab-change',{detail:{tab:tab==='documents'?'documents':'ledger'}}));return true;
 }
 function open(){if(typeof root.dfContractNavigate==='function')return root.dfContractNavigate('documents');const route=root.v62ShowOnly;route?.('contract');return selectTab('documents');}
 const navigation={
  capture(){return {key:'contract-writing',data:{tab:'documents',formType:state.formType,packageId:state.currentId||null,templateMode:state.mode==='template',year:state.year,contractId:state.data?.linked_contract_id||null}};},
  canLeave(){return !state.busy;},confirmLeave,
  async restore(snapshot){
   const data=snapshot?.data||{};bindIdentity();const who=state.owner,client=state.client;if(TYPES[data.formType])state.formType=data.formType;state.year=data.year===undefined?'all':String(data.year);show();
   if(!state.loaded)await loadPackages();context(who,client);
   if(data.templateMode){if(state.mode!=='template')await toggleTemplate();return;}if(state.mode==='template')await leaveTemplate({discard:true});
   if(data.packageId){const row=state.packages.find(r=>String(r.id)===String(data.packageId));if(row){const type=state.formType;await selectRecord(row.id,{force:true,restore:true});if(type==='ledger')await changeType('ledger');return;}}
   if(data.contractId){if(!state.contracts.length)await loadContracts();const row=state.contracts.find(r=>String(r.id)===String(data.contractId));if(row&&!state.currentId){state.data.common={...state.data.common,...model().fromContract(row)};state.data.linked_contract_id=String(row.id);state.data.linked_contract_no=String(row.contract_no||'');state.selectedContract=String(row.id);state.baseline=clone(state.data);}}
   renderContracts();renderList();renderMeta();if(state.formType==='ledger')await showLedger();else await mountEditor();
  }
 };
 root.DF_CONTRACT_WRITER={open,show,hide,selectTab,openSaved,navigation,state,_test:{compareContractNumbers,contractPickerStatus,contractAmount,applyContractPicker,selectContractCandidate,contractPickerRows,nativeContractDirty,nativeContractBusy,openContractPicker,openSavedRecord,savedRows,normalize,blankData,freshPackage,toggleTemplate,leaveTemplate,saveTemplate,refreshTemplate,templatePayload,sheetView,packagePayload,ledgerPayload,loadPackages,loadContracts,saveCurrent,saveLedger,selectRecord,chooseContract,newRecord,changeType,addMonth,addLedgerRow,addCurrentContract,commit,context,rollbackDrafts}};
 function init(){ensure();root.dfContractDocumentsOpen=open;root.dfContractDocumentsSelectTab=selectTab;}
 document.addEventListener('df:menu-permissions-changed',event=>{if(actor()!==state.owner||api()!==state.client||event.detail?.signedOut||state.owner&&!can('view')){hide();resetIdentity();state.owner='';state.client=null;renderContracts();renderList();}});
 root.addEventListener('beforeunload',event=>{if(state.active&&!state.busy)flushEditor();if(state.active&&(state.busy||state.dirty||state.ledger.dirty||state.templateReturn?.dirty)){event.preventDefault();event.returnValue='';}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
