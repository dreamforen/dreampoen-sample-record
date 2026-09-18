/* DREAMFOREN v120.37.20.0
 * 작성용 품질문서 폴더 + DFEN-QPF-17-04 (01) 웹 대장
 * 기존 문서/일정 저장 흐름과 분리된 추가 모듈입니다.
 */
(function dfQpfFormsModule(){
  "use strict";

  var VERSION="v120.37.20.0";
  var ENTRY_TABLE="qpf_17_04_entries";
  var SIGNATURE_TABLE="qpf_17_04_signatures";
  var FOLDER_TABLE="qpf_form_folders";
  var PAGE_SIZE=24;
  var SCHEDULE_SYNC_FROM="2026-09-17";
  var FIELD_DEFS=[
    {key:"measurement_no",label:"측정<br>번호",weight:28},
    {key:"measurement_date",label:"측정일",weight:23,type:"date"},
    {key:"sample_receipt_date",label:"시료<br>접수일",weight:23,type:"date"},
    {key:"request_org",label:"측정대행<br>의뢰기관",weight:52,long:true},
    {key:"target_site",label:"측정대상<br>사업장",weight:52,long:true},
    {key:"facility",label:"측정시설",weight:68,long:true},
    {key:"measurement_items",label:"측정항목",weight:62,long:true},
    {key:"handover_person",label:"인계자",weight:22},
    {key:"receiver_person",label:"인수자",weight:22},
    {key:"analysis_manager",label:"분석<br>책임자",weight:25},
    {key:"technical_manager",label:"기술<br>책임자",weight:25},
    {key:"dispatch_date",label:"발송일",weight:25,type:"date"},
    {key:"note",label:"비고",weight:30,long:true}
  ];
  var FIELDS=FIELD_DEFS.map(function(item){return item.key;});
  var state={
    active:false,
    view:"folders",
    year:new Date().getFullYear(),
    rows:[],
    signature:{id:null,writer:"",technical_manager:"",_dirty:false,_loadedUpdatedAt:""},
    page:0,
    query:"",
    missingDispatchOnly:false,
    folderQuery:"",
    folderRows:[],
    folderSortKey:"name",
    folderSortDirection:"asc",
    folderLoading:false,
    selectedKey:"",
    loading:false,
    saving:false,
    syncing:false,
    importing:false,
    loadSequence:0,
    renderSequence:0
  };
  var originalOpenDocumentHub=null;
  var originalDocumentLoad=null;
  var syncPromises={};

  function byId(id){return document.getElementById(id);}
  function text(value){return String(value==null?"":value).trim();}
  function escapeHtml(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function escapeAttr(value){return escapeHtml(value).replace(/\r?\n/g,"&#10;");}
  function database(){
    try{return typeof dfSupabase!=="undefined"?dfSupabase:null;}catch(ignore){return null;}
  }
  function profile(){
    try{return typeof dfCloudProfile!=="undefined"?dfCloudProfile:null;}catch(ignore){return null;}
  }
  function user(){
    try{return typeof dfCloudUser!=="undefined"?dfCloudUser:null;}catch(ignore){return null;}
  }
  function canEdit(){
    var p=profile();
    return !!p&&(p.role==="admin"||p.access_permissions&&p.access_permissions.quality_edit===true);
  }
  function uuid(){
    try{
      if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==="function")return globalThis.crypto.randomUUID();
    }catch(ignore){}
    return "qpf-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);
  }
  function diagnostic(level,message,detail){
    try{
      var diag=window.DF_DIAG;
      if(diag&&typeof diag[level]==="function")diag[level]("QPF-17-04",message,detail||"");
    }catch(ignore){}
  }
  function normalizeCompany(value){
    return text(value).normalize("NFKC").toLowerCase()
      .replace(/주식회사|유한회사|㈜|\(주\)/g,"")
      .replace(/[^0-9a-z가-힣]/g,"");
  }
  function isDeletedRepository(row){
    var data=row&&row.measurement_data||{};
    return data.deleted===true||data._deleted===true;
  }
  function rowHasData(row){
    return FIELDS.some(function(key){return text(row&&row[key])!=="";});
  }
  function makeRow(seed){
    var row={
      _key:uuid(),
      _new:true,
      _dirty:false,
      _loadedUpdatedAt:"",
      record_year:state.year,
      source_type:"manual",
      source_key:null,
      schedule_id:null,
      sort_order:Date.now()
    };
    FIELDS.forEach(function(key){row[key]="";});
    Object.assign(row,seed||{});
    return row;
  }
  function hydrateRow(raw){
    var row=makeRow(raw||{});
    row._new=false;
    row._dirty=false;
    row._loadedUpdatedAt=raw&&raw.updated_at||"";
    row._key="db:"+row.id;
    return row;
  }
  function findRow(key){
    return state.rows.find(function(row){return row._key===key;})||null;
  }
  function nextSortOrder(){
    var max=state.rows.reduce(function(value,row){
      return Math.max(value,Number(row.sort_order)||0);
    },0);
    return Math.max(Date.now(),max+1);
  }
  function hasDirty(){
    return state.signature._dirty||state.rows.some(function(row){return row._dirty;});
  }
  function setStatus(message,kind){
    var el=byId("qpfLedgerMessage");
    if(!el)return;
    el.textContent=message||"";
    el.className=kind||"";
  }
  function migrationMessage(error){
    var msg=error&&error.message||String(error||"");
    if(/qpf_17_04|does not exist|schema cache|PGRST205|42P01/i.test(msg)){
      return "대장 DB 업데이트가 필요합니다. 31_v12037170_qpf_17_04_ledger.sql 최신본을 다시 실행해주세요.";
    }
    return msg||"온라인 대장을 불러오지 못했습니다.";
  }
  function setHeader(titleValue,descriptionValue,backLabel){
    var titleEl=byId("dfDocTitle");
    var descEl=byId("dfDocDescription");
    var backEl=byId("dfDocBack");
    if(titleEl)titleEl.textContent=titleValue;
    if(descEl)descEl.textContent=descriptionValue;
    if(backEl)backEl.textContent=backLabel;
  }

  function ensureWorkspace(){
    var page=document.querySelector("#dfViewDocHub .df-doc-page");
    if(!page)return null;
    var root=byId("dfQualityFormWorkspace");
    if(root)return root;
    root=document.createElement("div");
    root.id="dfQualityFormWorkspace";
    root.className="qpf-workspace";
    root.hidden=true;
    root.innerHTML=[
      '<section id="qpfFolderPane" class="qpf-pane">',
        '<div class="qpf-folder-toolbar">',
          '<label>문서번호 · 양식명 검색<input id="qpfFolderSearch" type="search" placeholder="예: DFEN-QIF-01-01 또는 시험담당자"></label>',
          '<button type="button" class="qpf-button" id="qpfFolderReload">새로고침</button>',
        '</div>',
        '<div class="qpf-folder-summary"><span><strong>품질문서</strong> 작성양식 폴더</span><span id="qpfFolderCount"></span></div>',
        '<div id="qpfFolderGrid" class="qpf-folder-list"></div>',
      '</section>',
      '<section id="qpfLedgerPane" class="qpf-pane" hidden>',
        '<div class="qpf-ledger-toolbar" aria-label="대장 관리 도구">',
          '<label>작성 연도<select id="qpfYear"></select></label>',
          '<label class="qpf-search-label">대장 검색<input id="qpfLedgerSearch" type="search" placeholder="측정번호 · 업체 · 시설 · 항목 · 담당자 검색"></label>',
          '<button type="button" class="qpf-button" id="qpfMissingDispatch" aria-pressed="false">발송일 누락만</button>',
          '<button type="button" class="qpf-button" id="qpfReload">새로고침</button>',
          '<button type="button" class="qpf-button" id="qpfScheduleSync">9/17 이후 완료 일정</button>',
          '<span class="qpf-toolbar-separator" aria-hidden="true"></span>',
          '<button type="button" class="qpf-button" id="qpfExcelImport">Excel 원본 업로드</button>',
          '<input id="qpfExcelFile" type="file" accept=".xlsx,.xls,.xlsm" hidden>',
          '<button type="button" class="qpf-button" id="qpfAddRow">+ 행 추가</button>',
          '<button type="button" class="qpf-button primary" id="qpfSave">저장</button>',
          '<button type="button" class="qpf-button danger" id="qpfArchive">선택 행 삭제</button>',
          '<span class="qpf-toolbar-separator" aria-hidden="true"></span>',
          '<button type="button" class="qpf-button" id="qpfPreview">현재 쪽 미리보기</button>',
          '<button type="button" class="qpf-button" id="qpfPrint">현재 쪽 인쇄</button>',
          '<button type="button" class="qpf-button" id="qpfPreviewAll">전체 미리보기</button>',
        '</div>',
        '<div class="qpf-ledger-status"><span id="qpfLedgerMessage"></span><span id="qpfLedgerMeta"></span></div>',
        '<div id="qpfReadonlyNotice" class="qpf-readonly-notice" hidden>열람 전용 계정입니다. 작성·수정은 “품질문서 수정·업로드” 권한이 필요합니다.</div>',
        '<div class="qpf-form-scroll"><div id="qpfFormPage" class="qpf-form-page"></div></div>',
        '<div class="qpf-pagination">',
          '<button type="button" class="qpf-button" id="qpfPrevPage">← 이전</button>',
          '<span class="qpf-page-label" id="qpfPageLabel"><input id="qpfPageInput" type="number" min="1" value="1" inputmode="numeric" aria-label="이동할 페이지"><span id="qpfPageTotal">/ 1쪽</span></span>',
          '<button type="button" class="qpf-button" id="qpfGoPage">이동</button>',
          '<button type="button" class="qpf-button" id="qpfNextPage">다음 →</button>',
        '</div>',
        '<p class="qpf-ledger-help">Excel 원본은 제목·헤더·빈 서식행을 제외한 실제 자료와 발송일을 그대로 반영합니다. 2026-09-16까지 담당자 4개 열은 보존하며, 2026-09-17 이후 일정 생성행의 담당자 4개 칸은 직접 작성합니다. 현재 쪽 인쇄는 항상 24행 한 장만 출력합니다.</p>',
      '</section>'
    ].join("");
    page.appendChild(root);
    fillYearOptions();
    bindWorkspaceEvents();
    renderFolders();
    return root;
  }

  function fillYearOptions(){
    var select=byId("qpfYear");
    if(!select)return;
    var current=new Date().getFullYear();
    var years=[];
    for(var year=current-10;year<=current+5;year++)years.push(year);
    if(years.indexOf(state.year)<0)years.push(state.year);
    years.sort(function(a,b){return b-a;});
    select.innerHTML=years.map(function(year){
      return '<option value="'+year+'"'+(year===state.year?" selected":"")+'>'+year+"년</option>";
    }).join("");
  }

  function defaultDocument(number){
    if(Number(number)===101){
      return {
        number:101,
        code:"DFEN-QIF-01-01 (01)",
        displayName:"DFEN-QIF-01-01 (01) 시험담당자 자격 평가표",
        title:"시험담당자 자격 평가표",
        available:true,
        updatedAt:""
      };
    }
    if(Number(number)===102){
      return {
        number:102,
        code:"DFEN-QIF-01-02 (00)",
        displayName:"DFEN-QIF-01-02 (00) 자격인정서",
        title:"자격인정서",
        available:true,
        updatedAt:""
      };
    }
    var suffix=String(number).padStart(2,"0");
    var baseCode="DFEN-QPF-17-"+suffix;
    var revision=number===4?" (01)":"";
    var code=baseCode+revision;
    var title=number===4?"시료접수 및 성적서 발송대장":"양식명 등록 예정";
    return {
      number:number,
      code:code,
      displayName:code+" "+title,
      title:title,
      available:number===4,
      updatedAt:""
    };
  }
  function qualityDocuments(){
    var metadata={};
    state.folderRows.forEach(function(row){metadata[Number(row.document_number)]=row;});
    var docs=[];
    for(var number=1;number<=30;number++){
      var doc=defaultDocument(number);
      var saved=metadata[number];
      if(saved){
        doc.code=saved.document_code||doc.code;
        doc.displayName=saved.display_name||doc.displayName;
        doc.updatedAt=saved.updated_at||"";
      }
      docs.push(doc);
    }
    [101,102].forEach(function(number){
      var qifDocument=defaultDocument(number);
      var saved=metadata[number];
      if(saved){
        qifDocument.code=saved.document_code||qifDocument.code;
        qifDocument.displayName=saved.display_name||qifDocument.displayName;
        qifDocument.updatedAt=saved.updated_at||"";
      }
      docs.push(qifDocument);
    });
    return docs;
  }

  function formatKoreanDateTime(value){
    if(!value)return "—";
    var date=new Date(value);
    if(Number.isNaN(date.getTime()))return "—";
    return date.toLocaleString("ko-KR",{
      year:"numeric",month:"2-digit",day:"2-digit",hour:"numeric",minute:"2-digit",hour12:true
    }).replace(/\. /g,"-").replace(/\.$/,"");
  }
  function folderSortValue(doc,key){
    if(key==="modified")return doc.updatedAt||"";
    if(key==="code")return doc.code||"";
    if(key==="type")return "파일 폴더";
    if(key==="status")return doc.available?"사용 가능":"양식 대기";
    return doc.displayName||"";
  }
  function folderSortButton(key,label){
    var active=state.folderSortKey===key;
    var arrow=active?(state.folderSortDirection==="asc"?" ▲":" ▼"):"";
    return '<button type="button" data-qpf-folder-sort="'+key+'">'+label+arrow+'</button>';
  }

  function renderFolders(){
    var grid=byId("qpfFolderGrid");
    if(!grid)return;
    var query=text(state.folderQuery).toLowerCase();
    var docs=qualityDocuments().filter(function(doc){
      return !query||(doc.code+" "+doc.displayName+" "+doc.title).toLowerCase().indexOf(query)>=0;
    });
    var direction=state.folderSortDirection==="desc"?-1:1;
    var sortKey=state.folderSortKey;
    docs.sort(function(a,b){
      var primary=String(folderSortValue(a,sortKey)).localeCompare(String(folderSortValue(b,sortKey)),"ko",{numeric:true});
      return primary?primary*direction:(a.number-b.number);
    });
    var rows=docs.map(function(doc){
      var stateLabel=doc.available?"사용 가능":"양식 대기";
      var rename=canEdit()?'<button type="button" class="qpf-folder-rename" data-qpf-rename="'+doc.number+'">이름 변경</button>':"";
      return [
        '<tr class="',doc.available?'available':'','" data-qpf-doc="',doc.number,'">',
          '<td class="qpf-folder-name-cell"><div class="qpf-folder-name-wrap"><span class="qpf-folder-icon" aria-hidden="true"></span>',
            '<button type="button" class="qpf-folder-open" data-qpf-open="',doc.number,'">',escapeHtml(doc.displayName),'</button></div></td>',
          '<td class="qpf-folder-code">',escapeHtml(doc.code),'</td>',
          '<td class="qpf-folder-modified">',escapeHtml(formatKoreanDateTime(doc.updatedAt)),'</td>',
          '<td>파일 폴더</td>',
          '<td><span class="qpf-folder-status ',doc.available?'ready':'waiting','">',stateLabel,'</span></td>',
          '<td class="qpf-folder-actions">',rename,'</td>',
        '</tr>'
      ].join("");
    }).join("");
    grid.innerHTML=docs.length?[
      '<table class="qpf-folder-table"><thead><tr>',
        '<th>',folderSortButton("name","이름"),'</th>',
        '<th>',folderSortButton("code","문서번호"),'</th>',
        '<th>',folderSortButton("modified","수정한 날짜"),'</th>',
        '<th>',folderSortButton("type","유형"),'</th>',
        '<th>',folderSortButton("status","상태"),'</th>',
        '<th><span class="sr-only">관리</span></th>',
      '</tr></thead><tbody>',rows,'</tbody></table>'
    ].join(""):'<div class="qpf-folder-empty">검색 결과가 없습니다.</div>';
    var count=byId("qpfFolderCount");
    if(count){
      var allDocs=qualityDocuments();
      count.textContent="전체 "+allDocs.length+"개 · 사용 가능 "+allDocs.filter(function(doc){return doc.available;}).length+"개 · 표시 "+docs.length+"개";
    }
  }

  async function loadFolderMetadata(options){
    options=options||{};
    if(state.folderLoading)return;
    var db=database();
    if(!db||!user())return;
    state.folderLoading=true;
    try{
      var result=await db.from(FOLDER_TABLE).select("*").order("document_number",{ascending:true});
      if(result.error)throw result.error;
      state.folderRows=result.data||[];
      renderFolders();
    }catch(error){
      diagnostic("warn","품질문서 폴더 정보 불러오기 보류",error&&error.message||error);
      if(!options.quiet)window.alert("폴더 정보를 불러오지 못했습니다.\nSQL 업데이트 적용 여부를 확인해주세요.\n\n"+migrationMessage(error));
    }finally{
      state.folderLoading=false;
    }
  }

  async function touchFolderModified(){
    var db=database();
    if(!db||!user())return;
    try{
      var result=await db.from(FOLDER_TABLE).update({updated_by:user().id}).eq("document_number",4);
      if(result.error)throw result.error;
    }catch(error){
      diagnostic("warn","폴더 수정일 갱신 보류",error&&error.message||error);
    }
  }

  async function renameFolder(number){
    if(!canEdit())return window.alert("품질문서 수정 권한이 없습니다.");
    var doc=qualityDocuments().find(function(item){return item.number===Number(number);});
    if(!doc)return;
    var next=window.prompt("폴더명을 입력해주세요.\n문서번호는 별도 열에 그대로 유지됩니다.",doc.displayName);
    if(next==null)return;
    next=text(next);
    if(!next)return window.alert("폴더명은 비워둘 수 없습니다.");
    if(next.length>160)return window.alert("폴더명은 160자 이내로 입력해주세요.");
    var db=database();
    if(!db||!user())return window.alert("온라인 DB에 로그인해주세요.");
    try{
      var existing=state.folderRows.find(function(row){return Number(row.document_number)===doc.number;});
      var payload={display_name:next,updated_by:user().id};
      var result;
      if(existing){
        var update=db.from(FOLDER_TABLE).update(payload).eq("document_number",doc.number);
        if(existing.updated_at)update=update.eq("updated_at",existing.updated_at);
        else update=update.is("updated_at",null);
        result=await update.select("*");
        if(result.error)throw result.error;
        if(!result.data||result.data.length!==1){
          await loadFolderMetadata({quiet:true});
          return window.alert("다른 사용자가 먼저 폴더명을 수정했습니다. 최신 이름을 다시 불러왔습니다.");
        }
      }else{
        result=await db.from(FOLDER_TABLE).insert({
          document_number:doc.number,document_code:doc.code,display_name:next,form_status:doc.available?"ready":"waiting",updated_by:user().id
        }).select("*");
        if(result.error)throw result.error;
      }
      await loadFolderMetadata({quiet:true});
    }catch(error){
      window.alert("폴더명 수정에 실패했습니다. 기존 이름은 유지됩니다.\n\n"+migrationMessage(error));
    }
  }

  function activateMode(){
    state.active=true;
    var root=ensureWorkspace();
    var page=document.querySelector("#dfViewDocHub .df-doc-page");
    if(page)page.classList.add("qpf-mode");
    if(root)root.hidden=false;
  }
  function deactivateMode(){
    state.active=false;
    var root=byId("dfQualityFormWorkspace");
    var page=document.querySelector("#dfViewDocHub .df-doc-page");
    if(root)root.hidden=true;
    if(page)page.classList.remove("qpf-mode");
    var back=byId("dfDocBack");
    if(back)back.textContent="← 목록";
  }
  function openFolderList(){
    activateMode();
    if(window.DF_QIF_0101&&typeof window.DF_QIF_0101.close==="function")window.DF_QIF_0101.close({silent:true});
    if(window.DF_QIF_0102&&typeof window.DF_QIF_0102.close==="function")window.DF_QIF_0102.close({silent:true});
    state.view="folders";
    var folder=byId("qpfFolderPane");
    var ledger=byId("qpfLedgerPane");
    if(folder)folder.hidden=false;
    if(ledger)ledger.hidden=true;
    setHeader("작성용 품질문서","품질양식을 문서번호별 폴더에서 작성하고 연도별로 보관합니다.","← 품질문서");
    renderFolders();
    loadFolderMetadata({quiet:true});
    if(typeof window.v62ShowOnly==="function")window.v62ShowOnly("doc-hub");
  }
  function confirmDiscard(){
    return !hasDirty()||window.confirm("저장하지 않은 변경사항이 있습니다.\n변경사항을 버리고 이동할까요?");
  }
  function leaveQualityForms(){
    if(!confirmDiscard())return;
    deactivateMode();
    if(typeof window.v62ShowOnly==="function")window.v62ShowOnly("quality");
  }
  function backFromQualityForms(){
    if(state.view==="qif-qualification"){
      if(window.DF_QIF_0101&&typeof window.DF_QIF_0101.confirmDiscard==="function"&&!window.DF_QIF_0101.confirmDiscard())return;
      if(window.DF_QIF_0101&&typeof window.DF_QIF_0101.close==="function")window.DF_QIF_0101.close({silent:true});
      openFolderList();
      return;
    }
    if(state.view==="qif-certificate"){
      if(window.DF_QIF_0102&&typeof window.DF_QIF_0102.confirmDiscard==="function"&&!window.DF_QIF_0102.confirmDiscard())return;
      if(window.DF_QIF_0102&&typeof window.DF_QIF_0102.close==="function")window.DF_QIF_0102.close({silent:true});
      openFolderList();
      return;
    }
    if(state.view==="ledger"){
      if(!confirmDiscard())return;
      state.rows=[];
      state.signature={id:null,writer:"",technical_manager:"",_dirty:false,_loadedUpdatedAt:""};
      openFolderList();
      return;
    }
    leaveQualityForms();
  }

  async function openLedger(){
    if(!confirmDiscard())return;
    activateMode();
    state.view="ledger";
    state.query="";
    state.missingDispatchOnly=false;
    state.page=0;
    state.selectedKey="";
    var folder=byId("qpfFolderPane");
    var ledger=byId("qpfLedgerPane");
    if(folder)folder.hidden=true;
    if(ledger)ledger.hidden=false;
    var search=byId("qpfLedgerSearch");
    if(search)search.value="";
    var activeDoc=qualityDocuments().find(function(doc){return doc.number===4;})||defaultDocument(4);
    setHeader(activeDoc.displayName,"시료접수 및 성적서 발송대장 · 날짜 최신순 · Excel 원본 업로드 · 2026-09-17 이후 일정연동","← 작성용 품질문서");
    updatePermissionUi();
    var loaded=await loadRows();
    if(loaded&&canEdit()){
      var result=await syncCompletedSchedules(state.year,{quiet:true,refresh:false});
      if(result&&result.changed)await loadRows({keepStatus:true});
    }
  }

  function updatePermissionUi(){
    var editable=canEdit();
    ["qpfAddRow","qpfSave","qpfArchive","qpfScheduleSync","qpfExcelImport"].forEach(function(id){
      var el=byId(id);
      if(el)el.disabled=!editable;
    });
    var notice=byId("qpfReadonlyNotice");
    if(notice)notice.hidden=editable;
  }

  function rowDateKey(row){
    return text(row&&row.measurement_date)||text(row&&row.sample_receipt_date)||text(row&&row.dispatch_date)||"0000-00-00";
  }
  function sortRowsNewestFirst(rows){
    return rows.slice().sort(function(a,b){
      var byDate=rowDateKey(b).localeCompare(rowDateKey(a));
      if(byDate)return byDate;
      var byNumber=text(b.measurement_no).localeCompare(text(a.measurement_no),"ko",{numeric:true});
      if(byNumber)return byNumber;
      var bySort=(Number(b.sort_order)||0)-(Number(a.sort_order)||0);
      if(bySort)return bySort;
      return text(b.created_at).localeCompare(text(a.created_at));
    });
  }
  function filteredRows(){
    var query=text(state.query).toLowerCase();
    var countable=state.rows.filter(function(row){return rowHasData(row)||row._new||row._dirty;});
    var rows=query?countable.filter(function(row){
      var values=FIELDS.map(function(key){return row[key];});
      values.push(row.source_type==="schedule"?"일정완료":row.source_type==="excel"?"Excel 원본":"직접작성");
      return values.some(function(value){return String(value==null?"":value).toLowerCase().indexOf(query)>=0;});
    }):countable;
    if(state.missingDispatchOnly){
      rows=rows.filter(function(row){return !text(row.dispatch_date);});
    }
    return sortRowsNewestFirst(rows);
  }

  function colgroupHtml(){
    var total=FIELD_DEFS.reduce(function(sum,item){return sum+item.weight;},0);
    return "<colgroup>"+FIELD_DEFS.map(function(item){
      return '<col style="width:'+(item.weight/total*100).toFixed(4)+'%">';
    }).join("")+"</colgroup>";
  }
  function inputHtml(row,field,disabled){
    var value=row?row[field.key]||"":"";
    if(field.type==="date"){
      return '<input type="date" data-qpf-field="'+field.key+'" value="'+escapeAttr(String(value).slice(0,10))+'"'+(disabled?" disabled":"")+">";
    }
    return '<input type="text" data-qpf-field="'+field.key+'" value="'+escapeAttr(value)+'" title="'+escapeAttr(value)+'"'+(disabled?" disabled":"")+'>';
  }
  function rowHtml(row,slot,disabled){
    var key=row?row._key:"blank:"+state.renderSequence+":"+slot;
    var classes=[];
    if(!row)classes.push("qpf-blank-row");
    if(row&&row.source_type==="schedule")classes.push("schedule-source");
    if(row&&rowHasData(row)&&!text(row.dispatch_date))classes.push("missing-dispatch");
    if(row&&state.selectedKey===row._key)classes.push("selected");
    return '<tr class="'+classes.join(" ")+'" data-qpf-row="'+escapeAttr(key)+'">'+FIELD_DEFS.map(function(field){
      return "<td>"+inputHtml(row,field,disabled)+"</td>";
    }).join("")+"</tr>";
  }
  function signatureHtml(disabled){
    return [
      '<table class="qpf-signature-table" aria-label="결재란">',
        "<thead><tr><th>작성자</th><th>책임기술자</th></tr></thead>",
        "<tbody><tr>",
          '<td><input id="qpfSignatureWriter" value="'+escapeAttr(state.signature.writer)+'"'+(disabled?" disabled":"")+' aria-label="작성자"></td>',
          '<td><input id="qpfSignatureTechnical" value="'+escapeAttr(state.signature.technical_manager)+'"'+(disabled?" disabled":"")+' aria-label="책임기술자"></td>',
        "</tr></tbody>",
      "</table>"
    ].join("");
  }
  function renderLedger(){
    var host=byId("qpfFormPage");
    if(!host)return;
    state.renderSequence+=1;
    var rows=filteredRows();
    var pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    state.page=Math.min(Math.max(0,state.page),pageCount-1);
    var start=state.page*PAGE_SIZE;
    var pageRows=rows.slice(start,start+PAGE_SIZE);
    var body=[];
    for(var index=0;index<PAGE_SIZE;index++){
      body.push(rowHtml(pageRows[index]||null,index,!canEdit()));
    }
    host.innerHTML=[
      '<div class="qpf-form-heading"><h2>시료 접수 및 발송 대장</h2>',
        signatureHtml(!canEdit()),
      "</div>",
      '<table class="qpf-ledger-table">',
        colgroupHtml(),
        "<thead><tr>",FIELD_DEFS.map(function(field){return "<th>"+field.label+"</th>";}).join(""),"</tr></thead>",
        "<tbody>",body.join(""),"</tbody>",
      "</table>"
    ].join("");
    var pageInput=byId("qpfPageInput");
    var pageTotal=byId("qpfPageTotal");
    if(pageInput){pageInput.value=String(state.page+1);pageInput.max=String(pageCount);}
    if(pageTotal)pageTotal.textContent="/ "+pageCount+"쪽";
    var missingButton=byId("qpfMissingDispatch");
    if(missingButton){
      missingButton.classList.toggle("active",state.missingDispatchOnly);
      missingButton.setAttribute("aria-pressed",state.missingDispatchOnly?"true":"false");
    }
    var prev=byId("qpfPrevPage");
    var next=byId("qpfNextPage");
    if(prev)prev.disabled=state.page<=0;
    if(next)next.disabled=state.page>=pageCount-1;
    updateMeta(rows.length,pageCount);
  }
  function updateMeta(filteredCount,pageCount){
    var meta=byId("qpfLedgerMeta");
    if(!meta)return;
    var dirty=state.rows.filter(function(row){return row._dirty;}).length+(state.signature._dirty?1:0);
    var actualRows=state.rows.filter(function(row){return rowHasData(row);});
    var actualCount=actualRows.length;
    var missingDispatch=actualRows.filter(function(row){return !text(row.dispatch_date);}).length;
    meta.textContent=state.year+"년 · 실제자료 "+actualCount+"건 · 발송일 누락 "+missingDispatch+"건 · 표시 "+filteredCount+"건 · "+(state.page+1)+"/"+pageCount+"쪽"+(dirty?" · 미저장 "+dirty+"건":"");
  }
  function rerenderSelection(){
    document.querySelectorAll("#qpfFormPage tr[data-qpf-row]").forEach(function(tr){
      tr.classList.toggle("selected",tr.dataset.qpfRow===state.selectedKey);
    });
  }

  function materializeBlank(tr){
    var key=tr&&tr.dataset.qpfRow||"";
    if(key.indexOf("blank:")!==0)return findRow(key);
    var row=makeRow({_dirty:true,sort_order:nextSortOrder()});
    state.rows.push(row);
    tr.dataset.qpfRow=row._key;
    tr.classList.remove("qpf-blank-row");
    state.selectedKey=row._key;
    rerenderSelection();
    return row;
  }
  function handleFormInput(event){
    var target=event.target;
    if(target.id==="qpfSignatureWriter"){
      state.signature.writer=target.value;
      state.signature._dirty=true;
      updateMeta(filteredRows().length,Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE)));
      return;
    }
    if(target.id==="qpfSignatureTechnical"){
      state.signature.technical_manager=target.value;
      state.signature._dirty=true;
      updateMeta(filteredRows().length,Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE)));
      return;
    }
    var field=target.dataset&&target.dataset.qpfField;
    if(!field||!canEdit())return;
    var tr=target.closest("tr[data-qpf-row]");
    var row=materializeBlank(tr);
    if(!row)return;
    row[field]=target.value;
    row._dirty=true;
    if(tr)tr.classList.toggle("missing-dispatch",rowHasData(row)&&!text(row.dispatch_date));
    updateMeta(filteredRows().length,Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE)));
    if(field==="dispatch_date"&&state.missingDispatchOnly){
      setTimeout(renderLedger,0);
    }
  }

  function goToPage(){
    var input=byId("qpfPageInput");
    var pageCount=Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE));
    var requested=Math.floor(Number(input&&input.value));
    if(!Number.isFinite(requested))requested=state.page+1;
    state.page=Math.min(pageCount-1,Math.max(0,requested-1));
    renderLedger();
  }

  async function fetchAllRows(table,select,configure){
    var db=database();
    var output=[];
    for(var offset=0;;offset+=1000){
      var query=db.from(table).select(select);
      if(typeof configure==="function")query=configure(query);
      query=query.range(offset,offset+999);
      var result=await query;
      if(result.error)throw result.error;
      output=output.concat(result.data||[]);
      if((result.data||[]).length<1000)break;
    }
    return output;
  }

  async function loadRows(options){
    options=options||{};
    var db=database();
    if(!db||!user()){
      setStatus("온라인 DB 로그인 후 대장을 사용할 수 있습니다.","bad");
      renderLedger();
      return false;
    }
    if(hasDirty()&&!options.force){
      if(!window.confirm("저장하지 않은 변경사항이 있습니다.\n서버 최신본을 다시 불러올까요?"))return false;
    }
    var sequence=++state.loadSequence;
    state.loading=true;
    if(!options.keepStatus)setStatus("온라인 대장을 불러오는 중입니다.","warn");
    try{
      var results=await Promise.all([
        fetchAllRows(ENTRY_TABLE,"*",function(query){
          return query.eq("record_year",state.year).is("archived_at",null)
            .order("measurement_date",{ascending:false})
            .order("sample_receipt_date",{ascending:false})
            .order("sort_order",{ascending:false})
            .order("id",{ascending:true});
        }),
        db.from(SIGNATURE_TABLE).select("*").eq("record_year",state.year).maybeSingle()
      ]);
      if(sequence!==state.loadSequence)return false;
      if(results[1].error)throw results[1].error;
      state.rows=sortRowsNewestFirst((results[0]||[]).map(hydrateRow));
      var signature=results[1].data||{};
      state.signature={
        id:signature.id||null,
        writer:signature.writer||"",
        technical_manager:signature.technical_manager||"",
        _dirty:false,
        _loadedUpdatedAt:signature.updated_at||""
      };
      state.page=0;
      state.selectedKey="";
      renderLedger();
      if(!options.keepStatus)setStatus("온라인 최신본을 불러왔습니다.","ok");
      diagnostic("info","대장 불러오기 완료",state.year+"년 / "+state.rows.length+"건");
      return true;
    }catch(error){
      console.error("[QPF-17-04-LOAD]",error);
      setStatus(migrationMessage(error),"bad");
      diagnostic("error","대장 불러오기 실패",error&&error.message||error);
      state.rows=[];
      state.signature={id:null,writer:"",technical_manager:"",_dirty:false,_loadedUpdatedAt:""};
      renderLedger();
      return false;
    }finally{
      if(sequence===state.loadSequence)state.loading=false;
    }
  }

  function entryPayload(row){
    var payload={
      record_year:state.year,
      measurement_date:text(row.measurement_date)||null,
      sample_receipt_date:text(row.sample_receipt_date)||null,
      dispatch_date:text(row.dispatch_date)||null,
      sort_order:Number(row.sort_order)||nextSortOrder(),
      updated_by:user().id
    };
    FIELDS.forEach(function(key){
      if(["measurement_date","sample_receipt_date","dispatch_date"].indexOf(key)<0)payload[key]=String(row[key]==null?"":row[key]);
    });
    return payload;
  }
  function applySavedRow(row,saved){
    var key=row._key;
    Object.assign(row,saved||{});
    row._key=key;
    row._new=false;
    row._dirty=false;
    row._loadedUpdatedAt=saved&&saved.updated_at||row.updated_at||"";
  }

  async function saveSignature(){
    if(!state.signature._dirty)return {saved:false};
    var db=database();
    var payload={
      record_year:state.year,
      writer:state.signature.writer||"",
      technical_manager:state.signature.technical_manager||"",
      updated_by:user().id
    };
    if(state.signature.id){
      var query=db.from(SIGNATURE_TABLE).update(payload).eq("id",state.signature.id);
      if(state.signature._loadedUpdatedAt)query=query.eq("updated_at",state.signature._loadedUpdatedAt);
      var result=await query.select("*");
      if(result.error)throw result.error;
      if(!result.data||result.data.length!==1)return {conflict:true};
      var saved=result.data[0];
      state.signature.id=saved.id;
      state.signature._dirty=false;
      state.signature._loadedUpdatedAt=saved.updated_at||"";
      return {saved:true};
    }
    var inserted=await db.from(SIGNATURE_TABLE).insert(Object.assign({},payload,{created_at:new Date().toISOString()})).select("*").single();
    if(inserted.error){
      if(inserted.error.code==="23505")return {conflict:true};
      throw inserted.error;
    }
    state.signature.id=inserted.data.id;
    state.signature._dirty=false;
    state.signature._loadedUpdatedAt=inserted.data.updated_at||"";
    return {saved:true};
  }

  async function saveAll(){
    if(!canEdit())return window.alert("작성·수정 권한이 없습니다.");
    if(state.saving)return;
    var db=database();
    if(!db||!user())return window.alert("온라인 DB에 로그인해주세요.");
    state.saving=true;
    var saveButton=byId("qpfSave");
    if(saveButton){saveButton.disabled=true;saveButton.textContent="저장 중...";}
    var savedCount=0;
    var conflicts=0;
    var errors=[];
    setStatus("변경사항을 안전하게 저장하는 중입니다.","warn");
    try{
      var dirtyRows=state.rows.filter(function(row){return row._dirty;});
      for(var index=0;index<dirtyRows.length;index++){
        var row=dirtyRows[index];
        if(row._new&&!rowHasData(row)){
          row._dirty=false;
          continue;
        }
        try{
          var payload=entryPayload(row);
          if(row._new){
            payload.source_type=row.source_type||"manual";
            payload.source_key=row.source_key||null;
            payload.schedule_id=row.schedule_id||null;
            payload.created_by=user().id;
            var inserted=await db.from(ENTRY_TABLE).insert(payload).select("*").single();
            if(inserted.error)throw inserted.error;
            applySavedRow(row,inserted.data);
            savedCount+=1;
          }else{
            var update=db.from(ENTRY_TABLE).update(payload).eq("id",row.id).is("archived_at",null);
            if(row._loadedUpdatedAt)update=update.eq("updated_at",row._loadedUpdatedAt);
            var updated=await update.select("*");
            if(updated.error)throw updated.error;
            if(!updated.data||updated.data.length!==1){
              conflicts+=1;
              continue;
            }
            applySavedRow(row,updated.data[0]);
            savedCount+=1;
          }
        }catch(error){
          errors.push((row.measurement_no||"새 행")+": "+(error.message||error));
        }
      }
      try{
        var signatureResult=await saveSignature();
        if(signatureResult.saved)savedCount+=1;
        if(signatureResult.conflict)conflicts+=1;
      }catch(signatureError){
        errors.push("결재란: "+(signatureError.message||signatureError));
      }
      state.rows=state.rows.filter(function(row){return !(row._new&&!rowHasData(row)&&!row._dirty);});
      if(savedCount)await touchFolderModified();
      renderLedger();
      if(conflicts||errors.length){
        var parts=[];
        if(savedCount)parts.push("저장 "+savedCount+"건");
        if(conflicts)parts.push("동시수정 충돌 "+conflicts+"건");
        if(errors.length)parts.push("오류 "+errors.length+"건");
        setStatus(parts.join(" · ")+" — 충돌 행은 덮어쓰지 않았습니다.","bad");
        diagnostic("warn","부분 저장 또는 충돌",parts.join(" / ")+" / "+errors.join(" | "));
        window.alert("일부 변경사항을 안전하게 보류했습니다.\n다른 기기에서 먼저 수정된 행은 덮어쓰지 않았습니다.\n\n"+parts.join(" · ")+(errors.length?"\n"+errors.slice(0,5).join("\n"):""));
      }else{
        setStatus("변경사항 저장 완료 ✓","ok");
        diagnostic("info","대장 저장 완료",state.year+"년 / "+savedCount+"건");
      }
    }finally{
      state.saving=false;
      if(saveButton){saveButton.disabled=!canEdit();saveButton.textContent="저장";}
    }
  }

  function addRow(){
    if(!canEdit())return;
    state.query="";
    var search=byId("qpfLedgerSearch");
    if(search)search.value="";
    var row=makeRow({_dirty:true,sort_order:nextSortOrder()});
    state.rows.push(row);
    state.page=Math.max(0,Math.ceil(filteredRows().length/PAGE_SIZE)-1);
    state.selectedKey=row._key;
    renderLedger();
    setTimeout(function(){
      var tr=document.querySelector('#qpfFormPage tr[data-qpf-row="'+row._key+'"]');
      var input=tr&&tr.querySelector("[data-qpf-field]");
      if(input)input.focus();
    },0);
  }

  async function archiveSelected(){
    if(!canEdit())return;
    var row=findRow(state.selectedKey);
    if(!row)return window.alert("삭제할 행을 먼저 눌러 선택해주세요.");
    if(!window.confirm("선택한 행을 화면에서 삭제할까요?\n안전한 복구를 위해 서버에는 보관 처리되며 일정·자료실 원본은 변경되지 않습니다."))return;
    if(row._new){
      state.rows=state.rows.filter(function(item){return item!==row;});
      state.selectedKey="";
      renderLedger();
      return;
    }
    try{
      var db=database();
      var payload={archived_at:new Date().toISOString(),archived_by:user().id,updated_by:user().id};
      var query=db.from(ENTRY_TABLE).update(payload).eq("id",row.id).is("archived_at",null);
      if(row._loadedUpdatedAt)query=query.eq("updated_at",row._loadedUpdatedAt);
      var result=await query.select("id");
      if(result.error)throw result.error;
      if(!result.data||result.data.length!==1){
        setStatus("다른 기기에서 먼저 수정된 행이라 삭제하지 않았습니다. 새로고침 후 확인해주세요.","bad");
        return;
      }
      state.rows=state.rows.filter(function(item){return item!==row;});
      state.selectedKey="";
      await touchFolderModified();
      renderLedger();
      setStatus("선택 행을 화면에서 삭제했습니다. 복구용 원본은 보존됩니다.","ok");
    }catch(error){
      setStatus("행 삭제 실패: "+migrationMessage(error),"bad");
    }
  }

  var IMPORT_HEADER_ALIASES={
    measurement_no:["측정번호"],
    measurement_date:["측정일"],
    sample_receipt_date:["시료접수일"],
    request_org:["측정대행의뢰기관","측정의뢰기관","의뢰기관"],
    target_site:["측정대상사업장","측정대상업체","대상사업장"],
    facility:["측정시설","시설"],
    measurement_items:["측정항목","측정항목명"],
    handover_person:["인계자"],
    receiver_person:["인수자"],
    analysis_manager:["분석책임자"],
    technical_manager:["기술책임자","책임기술자"],
    dispatch_date:["발송일","성적서발송일"],
    note:["비고"]
  };
  function normalizeImportHeader(value){
    return text(value).normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]/g,"");
  }
  function importHeaderMap(row){
    var normalized=(row||[]).map(normalizeImportHeader);
    var map={};
    for(var fieldIndex=0;fieldIndex<FIELDS.length;fieldIndex++){
      var key=FIELDS[fieldIndex];
      var aliases=(IMPORT_HEADER_ALIASES[key]||[]).map(normalizeImportHeader);
      var index=normalized.findIndex(function(value){return aliases.indexOf(value)>=0;});
      if(index<0)return null;
      map[key]=index;
    }
    var people=[map.handover_person,map.receiver_person,map.analysis_manager,map.technical_manager];
    if(new Set(people).size!==4)return null;
    return map;
  }
  function pad2(value){return String(value).padStart(2,"0");}
  function isoDateParts(year,month,day){
    year=Number(year);month=Number(month);day=Number(day);
    if(year<100)year+=2000;
    var date=new Date(year,month-1,day);
    if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return "";
    return year+"-"+pad2(month)+"-"+pad2(day);
  }
  function excelDateToIso(value){
    if(value==null||value==="")return "";
    if(value instanceof Date&&!Number.isNaN(value.getTime())){
      return isoDateParts(value.getFullYear(),value.getMonth()+1,value.getDate());
    }
    if(typeof value==="number"&&Number.isFinite(value)){
      try{
        var parsed=window.XLSX&&XLSX.SSF&&XLSX.SSF.parse_date_code(value);
        if(parsed)return isoDateParts(parsed.y,parsed.m,parsed.d);
      }catch(ignore){}
    }
    var source=text(value);
    if(/^\d{5}(\.\d+)?$/.test(source)){
      try{
        var serial=XLSX.SSF.parse_date_code(Number(source));
        if(serial)return isoDateParts(serial.y,serial.m,serial.d);
      }catch(ignoreSerial){}
    }
    var match=source.match(/^(\d{2,4})[^0-9]+(\d{1,2})[^0-9]+(\d{1,2})/);
    return match?isoDateParts(match[1],match[2],match[3]):"";
  }
  function importCellText(value){
    if(value==null)return "";
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return excelDateToIso(value);
    return String(value).replace(/\r\n?/g,"\n").trim();
  }
  function importRowYear(row){
    var date=row.measurement_date||row.sample_receipt_date||row.dispatch_date||"";
    if(/^\d{4}-/.test(date))return Number(date.slice(0,4));
    var number=text(row.measurement_no).match(/^(20\d{2})/);
    return number?Number(number[1]):state.year;
  }
  function extractWorkbookRows(workbook){
    var names=workbook&&workbook.SheetNames||[];
    var ordered=names.slice().sort(function(a,b){
      if(a==="출력시트")return -1;
      if(b==="출력시트")return 1;
      return 0;
    });
    var best=null;
    ordered.forEach(function(sheetName){
      var sheet=workbook.Sheets[sheetName];
      var matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true,blankrows:true});
      var map=null;
      var rows=[];
      var headerRows=0;
      var excludedYears=0;
      for(var rowIndex=0;rowIndex<matrix.length;rowIndex++){
        var source=matrix[rowIndex]||[];
        var detected=importHeaderMap(source);
        if(detected){map=detected;headerRows+=1;continue;}
        if(!map)continue;
        if(normalizeImportHeader(source[0])==="시료접수및발송대장")continue;
        var payload={source_row:rowIndex+1};
        FIELDS.forEach(function(key){
          var value=source[map[key]];
          payload[key]=["measurement_date","sample_receipt_date","dispatch_date"].indexOf(key)>=0?excelDateToIso(value):importCellText(value);
        });
        if(!FIELDS.some(function(key){return text(payload[key])!=="";}))continue;
        var year=importRowYear(payload);
        if(year!==state.year){excludedYears+=1;continue;}
        rows.push(payload);
      }
      var candidate={sheetName:sheetName,rows:rows,headerRows:headerRows,excludedYears:excludedYears};
      if(headerRows&&(best==null||candidate.rows.length>best.rows.length))best=candidate;
    });
    return best;
  }
  function importIdentity(row){
    var number=text(row&&row.measurement_no);
    if(number)return "number:"+number;
    return "continuation:"+[
      text(row&&row.measurement_date).slice(0,10),
      text(row&&row.sample_receipt_date).slice(0,10),
      text(row&&row.request_org),text(row&&row.target_site),
      text(row&&row.facility),text(row&&row.measurement_items)
    ].join("|");
  }
  function attachExpectedVersions(rows){
    var queues={};
    state.rows.filter(function(row){return row.source_type!=="schedule"&&!row._new&&rowHasData(row);})
      .sort(function(a,b){
        var source=(b.source_type==="excel"?1:0)-(a.source_type==="excel"?1:0);
        if(source)return source;
        return text(b.updated_at).localeCompare(text(a.updated_at));
      }).forEach(function(row){
        var key=importIdentity(row);
        (queues[key]||(queues[key]=[])).push(row);
      });
    return rows.map(function(row){
      var output=Object.assign({},row);
      var queue=queues[importIdentity(row)]||[];
      var existing=queue.shift();
      if(existing){
        output.expected_id=existing.id;
        output.expected_updated_at=existing._loadedUpdatedAt||existing.updated_at||"";
      }
      return output;
    });
  }
  async function importExcelFile(file){
    if(!canEdit())return window.alert("Excel 업로드 권한이 없습니다.");
    if(state.importing)return;
    if(hasDirty())return window.alert("Excel 업로드 전에 현재 변경사항을 먼저 저장해주세요.");
    if(!file)return;
    if(!window.XLSX)return window.alert("Excel 읽기 모듈을 불러오지 못했습니다. 페이지를 새로고침해주세요.");
    state.importing=true;
    var button=byId("qpfExcelImport");
    if(button){button.disabled=true;button.textContent="Excel 확인 중...";}
    setStatus("Excel에서 실제 자료행과 담당자 4개 열을 확인하는 중입니다.","warn");
    try{
      var workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      var extracted=extractWorkbookRows(workbook);
      if(!extracted||!extracted.headerRows){
        throw new Error("인계자·인수자·분석책임자·기술책임자가 분리된 13열 출력시트를 찾지 못했습니다.");
      }
      if(!extracted.rows.length)throw new Error(state.year+"년에 해당하는 실제 자료행이 없습니다.");
      var pages=Math.ceil(extracted.rows.length/PAGE_SIZE);
      var dispatchCount=extracted.rows.filter(function(row){return !!text(row.dispatch_date);}).length;
      var missingDispatch=extracted.rows.length-dispatchCount;
      var message=[
        "시트: "+extracted.sheetName,
        "실제 자료: "+extracted.rows.length.toLocaleString("ko-KR")+"건 ("+pages+"쪽)",
        "발송일: "+dispatchCount.toLocaleString("ko-KR")+"건 / 누락 "+missingDispatch.toLocaleString("ko-KR")+"건",
        "담당자: 인계자 / 인수자 / 분석책임자 / 기술책임자 개별 열 확인",
        "일정·자료실과 매칭하지 않고 대장 원본값으로 반영합니다.",
        "동일 측정번호의 기존 대장행은 중복 생성을 막기 위해 원본값으로 갱신합니다.",
        "다른 사용자의 동시 수정이 감지되면 전체 업로드를 취소합니다."
      ];
      if(extracted.excludedYears)message.push("다른 연도 "+extracted.excludedYears+"건은 제외됩니다.");
      if(!window.confirm(message.join("\n")+"\n\n계속할까요?")){
        setStatus("Excel 업로드를 취소했습니다.","warn");
        return;
      }
      if(button)button.textContent="업로드 중...";
      setStatus(extracted.rows.length.toLocaleString("ko-KR")+"건을 안전하게 반영하는 중입니다.","warn");
      var db=database();
      if(!db||!user())throw new Error("온라인 DB에 로그인해주세요.");
      var importRows=attachExpectedVersions(extracted.rows);
      var result=await db.rpc("qpf_17_04_import_excel",{p_year:state.year,p_rows:importRows});
      if(result.error)throw result.error;
      var summary=result.data||{};
      var inserted=Number(summary.inserted)||0;
      var updated=Number(summary.updated)||0;
      await loadRows({force:true,keepStatus:true});
      var actualRows=state.rows.filter(function(row){return rowHasData(row);}).length;
      var currentPages=Math.max(1,Math.ceil(actualRows/PAGE_SIZE));
      setStatus("Excel 반영 완료 · 신규 "+inserted+"건 · 갱신 "+updated+"건 · 현재 "+actualRows+"건 / "+currentPages+"쪽","ok");
      diagnostic("info","Excel 원본 업로드 완료",file.name+" / 신규 "+inserted+" / 갱신 "+updated);
    }catch(error){
      console.error("[QPF-17-04-EXCEL]",error);
      setStatus("Excel 업로드 실패: "+migrationMessage(error),"bad");
      window.alert("Excel 업로드를 완료하지 못했습니다. 기존 대장 데이터는 그대로 유지됩니다.\n\n"+migrationMessage(error));
    }finally{
      state.importing=false;
      if(button){button.disabled=!canEdit();button.textContent="Excel 원본 업로드";}
      var input=byId("qpfExcelFile");
      if(input)input.value="";
    }
  }

  function repositoryItems(repositoryRow){
    var record=repositoryRow&&repositoryRow.measurement_data||{};
    var data=record.data||{};
    var fields=data.fields||{};
    var items=[];
    function add(value){
      value=text(value);
      if(value&&items.indexOf(value)<0)items.push(value);
    }
    if(data.recordType==="dust"||data.recordType==="combo")add("먼지");
    if(data.recordType==="metal"||data.recordType==="combo"){
      var metals=Array.isArray(data.metalItems)&&data.metalItems.length?data.metalItems:(fields.metalAnalyte?[fields.metalAnalyte]:[]);
      metals.forEach(add);
    }
    (data.gasRows||[]).forEach(function(gas){add(gas&& (gas.item||gas.name||gas.pollutant));});
    if(!items.length){
      var type=repositoryRow&&repositoryRow.record_type;
      if(type==="dust")add("먼지");
      if(type==="metal")add("중금속");
      if(type==="combo"){add("먼지");add("중금속");}
    }
    return items.join(", ");
  }
  function scheduleCompanies(schedule,companyMap){
    var extra=schedule.extra_data||{};
    var names=[];
    if(Array.isArray(extra.companies))extra.companies.forEach(function(name){if(text(name))names.push(text(name));});
    if(!names.length&&text(extra.company))names.push(text(extra.company));
    var ids=[];
    if(Array.isArray(extra.company_ids))ids=ids.concat(extra.company_ids);
    if(schedule.company_id)ids.push(schedule.company_id);
    ids.forEach(function(id){
      var name=companyMap[String(id)];
      if(name&&!names.some(function(existing){return normalizeCompany(existing)===normalizeCompany(name);})){
        names.push(name);
      }
    });
    return names.length?names:[""];
  }
  function scheduleBase(schedule,company,index,repository){
    var date=String(schedule.schedule_date||"").slice(0,10);
    return {
      record_year:Number(date.slice(0,4))||state.year,
      source_type:"schedule",
      source_key:"schedule:"+schedule.id+":company:"+(index+1)+":base",
      schedule_id:String(schedule.id),
      measurement_no:repository&&repository.receipt_no||"",
      measurement_date:repository&&repository.measure_date||date||null,
      sample_receipt_date:repository&&repository.measure_date||date||null,
      request_org:company||repository&&repository.company_name||"",
      target_site:repository&&repository.company_name||company||"",
      facility:repository&&repository.facility_name||"",
      measurement_items:repositoryItems(repository),
      handover_person:"",
      receiver_person:"",
      analysis_manager:"",
      technical_manager:"",
      dispatch_date:null,
      note:"일정완료 자동생성",
      sort_order:Date.parse(date)||Date.now(),
      created_by:user()&&user().id||null,
      updated_by:user()&&user().id||null
    };
  }
  function safeReceiptKey(value){
    return encodeURIComponent(text(value)||"record").replace(/%/g,"_").slice(0,180);
  }
  function patchBlankFields(existing,candidate){
    var patch={};
    ["measurement_no","measurement_date","sample_receipt_date","request_org","target_site","facility","measurement_items"].forEach(function(key){
      if(!text(existing[key])&&text(candidate[key]))patch[key]=candidate[key];
    });
    return patch;
  }
  function scheduleSyncStart(year){
    year=Number(year);
    var cutoffYear=Number(SCHEDULE_SYNC_FROM.slice(0,4));
    if(year<cutoffYear)return "";
    return year===cutoffYear?SCHEDULE_SYNC_FROM:year+"-01-01";
  }
  function isEligibleSchedule(schedule){
    var extra=schedule&&schedule.extra_data||{};
    var deleted=extra.deleted===true||String(extra.deleted||"").toLowerCase()==="true";
    return !!schedule&&String(schedule.schedule_date||"").slice(0,10)>=SCHEDULE_SYNC_FROM&&
      (schedule.completed===true||schedule.status==="completed")&&
      /측정/.test(schedule.schedule_type||"")&&!deleted;
  }

  async function syncCompletedSchedules(year,options){
    options=options||{};
    year=Number(year)||state.year;
    if(!canEdit())return {changed:false,skipped:true};
    var eligibleStart=scheduleSyncStart(year);
    if(!eligibleStart){
      if(!options.quiet)setStatus(year+"년 자료는 Excel 원본으로 관리하며 일정 자동연동 대상이 아닙니다.","ok");
      return {changed:false,skipped:true};
    }
    if(syncPromises[year])return syncPromises[year];
    var promise=(async function(){
      var db=database();
      if(!db||!user())return {changed:false,skipped:true};
      state.syncing=true;
      if(!options.quiet)setStatus(year+"년 완료 일정을 확인하는 중입니다.","warn");
      var created=0;
      var restored=0;
      var archived=0;
      var enriched=0;
      var conflicts=0;
      try{
        var start=eligibleStart;
        var end=year+"-12-31";
        var results=await Promise.all([
          fetchAllRows("schedules","id,company_id,schedule_date,status,schedule_type,employee,completed,extra_data,updated_at",function(query){
            return query.gte("schedule_date",start).lte("schedule_date",end).order("schedule_date",{ascending:true});
          }),
          fetchAllRows("dreampoen_repository","receipt_no,measure_date,company_name,facility_name,record_type,measurement_data,hidden,updated_at",function(query){
            return query.gte("measure_date",start).lte("measure_date",end).order("measure_date",{ascending:true});
          }),
          fetchAllRows(ENTRY_TABLE,"*",function(query){
            return query.eq("record_year",year).order("sort_order",{ascending:true});
          }),
          fetchAllRows("companies","id,name",function(query){return query.order("name",{ascending:true});})
        ]);
        var schedules=results[0].filter(isEligibleSchedule);
        var eligibleScheduleIds=new Set(schedules.map(function(schedule){return String(schedule.id);}));
        var repositories=results[1].filter(function(row){return !row.hidden&&!isDeletedRepository(row);});
        var existingRows=results[2];
        var companyMap={};
        results[3].forEach(function(company){companyMap[String(company.id)]=company.name||"";});
        var existingByKey={};
        existingRows.forEach(function(row){if(row.source_key)existingByKey[row.source_key]=row;});

        // 완료/확정 취소 또는 일정 삭제 시, 해당 일정에서 자동생성된 행만 보관 처리합니다.
        // Excel 업로드 및 수기 작성 행은 이 정리 대상에 절대 포함하지 않습니다.
        for(var eIndex=0;eIndex<existingRows.length;eIndex++){
          var stale=existingRows[eIndex];
          if(stale.source_type!=="schedule"||stale.archived_at||!stale.schedule_id||eligibleScheduleIds.has(String(stale.schedule_id)))continue;
          var archivedAt=new Date().toISOString();
          var archiveQuery=db.from(ENTRY_TABLE).update({
            archived_at:archivedAt,
            archived_by:user().id,
            updated_by:user().id
          }).eq("id",stale.id).is("archived_at",null);
          if(stale.updated_at)archiveQuery=archiveQuery.eq("updated_at",stale.updated_at);
          var archiveResult=await archiveQuery.select("*");
          if(archiveResult.error)throw archiveResult.error;
          if(archiveResult.data&&archiveResult.data.length===1){
            archived+=1;
            stale=archiveResult.data[0];
            existingRows[eIndex]=stale;
            if(stale.source_key)existingByKey[stale.source_key]=stale;
          }else conflicts+=1;
        }

        async function restoreScheduleRow(row){
          if(!row||!row.archived_at)return row;
          var restoreQuery=db.from(ENTRY_TABLE).update({
            archived_at:null,
            archived_by:null,
            updated_by:user().id
          }).eq("id",row.id);
          if(row.updated_at)restoreQuery=restoreQuery.eq("updated_at",row.updated_at);
          var restoreResult=await restoreQuery.select("*");
          if(restoreResult.error)throw restoreResult.error;
          if(restoreResult.data&&restoreResult.data.length===1){
            restored+=1;
            if(row.source_key)existingByKey[row.source_key]=restoreResult.data[0];
            return restoreResult.data[0];
          }
          conflicts+=1;
          return row;
        }

        for(var sIndex=0;sIndex<schedules.length;sIndex++){
          var schedule=schedules[sIndex];
          var companies=scheduleCompanies(schedule,companyMap);
          for(var cIndex=0;cIndex<companies.length;cIndex++){
            var company=companies[cIndex];
            var matches=repositories.filter(function(repository){
              return String(repository.measure_date||"").slice(0,10)===String(schedule.schedule_date||"").slice(0,10)&&
                normalizeCompany(repository.company_name)===normalizeCompany(company);
            }).sort(function(a,b){return String(a.receipt_no||"").localeCompare(String(b.receipt_no||""),"ko");});
            var first=matches[0]||null;
            var base=scheduleBase(schedule,company,cIndex,first);
            var existing=existingByKey[base.source_key];
            if(!existing){
              var baseInsert=await db.from(ENTRY_TABLE).insert(base).select("*").single();
              if(baseInsert.error){
                if(baseInsert.error.code==="23505"){
                  conflicts+=1;
                }else throw baseInsert.error;
              }else{
                existingByKey[base.source_key]=baseInsert.data;
                existing=baseInsert.data;
                created+=1;
              }
            }else if(existing.archived_at){
              existing=await restoreScheduleRow(existing);
            }
            if(existing&&!existing.archived_at&&first){
              var blankPatch=patchBlankFields(existing,base);
              if(Object.keys(blankPatch).length){
                blankPatch.updated_by=user().id;
                var baseUpdate=db.from(ENTRY_TABLE).update(blankPatch).eq("id",existing.id);
                if(existing.updated_at)baseUpdate=baseUpdate.eq("updated_at",existing.updated_at);
                var updateResult=await baseUpdate.select("*");
                if(updateResult.error)throw updateResult.error;
                if(updateResult.data&&updateResult.data.length===1){
                  existingByKey[base.source_key]=updateResult.data[0];
                  enriched+=1;
                }else conflicts+=1;
              }
            }
            for(var rIndex=1;rIndex<matches.length;rIndex++){
              var repository=matches[rIndex];
              var detail=scheduleBase(schedule,company,cIndex,repository);
              detail.source_key="schedule:"+schedule.id+":company:"+(cIndex+1)+":repo:"+safeReceiptKey(repository.receipt_no);
              detail.sort_order=(Number(base.sort_order)||Date.now())+rIndex;
              if(existingByKey[detail.source_key]){
                if(existingByKey[detail.source_key].archived_at)await restoreScheduleRow(existingByKey[detail.source_key]);
                continue;
              }
              var detailInsert=await db.from(ENTRY_TABLE).insert(detail).select("*").single();
              if(detailInsert.error){
                if(detailInsert.error.code==="23505")conflicts+=1;
                else throw detailInsert.error;
              }else{
                existingByKey[detail.source_key]=detailInsert.data;
                created+=1;
              }
            }
          }
        }
        var changed=created+restored+archived+enriched>0;
        if(changed)await touchFolderModified();
        var message="2026-09-17 이후 일정 확인 · 신규 "+created+"건 · 재완료 복원 "+restored+"건 · 취소 정리 "+archived+"건 · 빈 항목 보완 "+enriched+"건";
        if(conflicts)message+=" · 동시처리 "+conflicts+"건은 덮어쓰지 않음";
        if(state.active&&state.view==="ledger")setStatus(message,conflicts?"warn":"ok");
        diagnostic("info","완료 일정 연동",year+"년 / "+message);
        if(options.refresh!==false&&state.active&&state.view==="ledger"&&!hasDirty())await loadRows({force:true,keepStatus:true});
        return {changed:changed,created:created,restored:restored,archived:archived,enriched:enriched,conflicts:conflicts};
      }catch(error){
        console.error("[QPF-17-04-SCHEDULE-SYNC]",error);
        var message=migrationMessage(error);
        if(state.active&&state.view==="ledger")setStatus("일정 연동 보류: "+message,"bad");
        diagnostic("error","완료 일정 연동 실패",error&&error.message||error);
        if(!options.quiet)window.alert("완료 일정 연동에 실패했습니다.\n기존 일정과 대장 데이터는 변경하지 않았습니다.\n\n"+message);
        return {changed:false,error:error};
      }finally{
        state.syncing=false;
      }
    })();
    syncPromises[year]=promise;
    promise.finally(function(){if(syncPromises[year]===promise)delete syncPromises[year];});
    return promise;
  }

  function printableRows(){
    return filteredRows();
  }
  function printCell(value){
    return escapeHtml(value||"").replace(/\r?\n/g,"<br>");
  }
  function printRowHtml(row){
    return "<tr>"+FIELD_DEFS.map(function(field){
      return '<td><div class="cell"><span>'+printCell(row&&row[field.key])+"</span></div></td>";
    }).join("")+"</tr>";
  }
  function printSignatureHtml(){
    return [
      '<table class="sign"><thead><tr><th>작성자</th><th>책임기술자</th></tr></thead>',
      "<tbody><tr><td>",printCell(state.signature.writer),"</td><td>",printCell(state.signature.technical_manager),"</td></tr></tbody></table>"
    ].join("");
  }
  function printPagesHtml(rows,pageOffset,totalPages){
    var pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    var output=[];
    pageOffset=Number(pageOffset)||0;
    totalPages=Math.max(1,Number(totalPages)||pages);
    for(var page=0;page<pages;page++){
      var slice=rows.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE);
      var body=[];
      for(var index=0;index<PAGE_SIZE;index++)body.push(printRowHtml(slice[index]||null));
      output.push([
        '<section class="sheet">',
          '<header><h1>시료 접수 및 발송 대장</h1>',printSignatureHtml(),"</header>",
          '<table class="ledger">',colgroupHtml(),
            "<thead><tr>",FIELD_DEFS.map(function(field){return "<th>"+field.label+"</th>";}).join(""),"</tr></thead>",
            "<tbody>",body.join(""),"</tbody>",
          "</table>",
          '<div class="page-no">',pageOffset+page+1," / ",totalPages,"쪽</div>",
        "</section>"
      ].join(""));
    }
    return output.join("");
  }
  function openPrint(autoPrint,scope){
    var popup=window.open("about:blank","_blank");
    if(!popup)return window.alert("인쇄 미리보기가 차단되었습니다.\n브라우저 주소창에서 팝업을 허용해주세요.");
    var allRows=printableRows();
    var pageCount=Math.max(1,Math.ceil(allRows.length/PAGE_SIZE));
    var currentPage=Math.min(pageCount-1,Math.max(0,state.page));
    var isAll=scope==="all";
    var rows=isAll?allRows:allRows.slice(currentPage*PAGE_SIZE,currentPage*PAGE_SIZE+PAGE_SIZE);
    var pageOffset=isAll?0:currentPage;
    var scopeLabel=isAll?"전체 "+pageCount+"쪽":"현재 "+(currentPage+1)+" / "+pageCount+"쪽";
    var html=[
      "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">",
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
      "<title>DFEN-QPF-17-04 (01) 시료접수 및 성적서 발송대장 ",state.year,"년</title>",
      "<style>",
      "@page{size:A4 landscape;margin:5mm 6mm 13mm}",
      "*{box-sizing:border-box}html,body{margin:0;background:#dfe3dc;color:#000;font-family:\"Malgun Gothic\",\"맑은 고딕\",sans-serif}",
      ".tools{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:9px 14px;background:#263822;color:#fff;font-size:12px}",
      ".tools button{border:0;border-radius:7px;background:#729a43;color:#fff;padding:8px 16px;font-weight:800;cursor:pointer}",
      ".sheet{position:relative;width:285mm;height:190mm;margin:7mm auto 14mm;background:#fff;padding-bottom:8mm;break-inside:avoid;page-break-inside:avoid;break-after:page;page-break-after:always;overflow:hidden}",
      ".sheet:last-child{break-after:auto;page-break-after:auto}",
      "header{position:relative;height:25mm;display:flex;align-items:center;justify-content:center;border:0.5mm solid #000;border-bottom:0}",
      "h1{margin:0;padding:0 62mm 0 12mm;font-size:19pt;letter-spacing:.08em;text-align:center}",
      ".sign{position:absolute;right:2mm;top:2mm;width:52mm;height:20mm;border-collapse:collapse;table-layout:fixed}",
      ".sign th,.sign td{border:.25mm solid #000;text-align:center;padding:0;font-size:7pt}",
      ".sign th{height:6mm;background:#eee}.sign td{height:13mm;font-size:8pt}",
      ".ledger{width:100%;height:157mm;border-collapse:collapse;table-layout:fixed;border:.5mm solid #000}",
      ".ledger th,.ledger td{border:.25mm solid #000;text-align:center;vertical-align:middle;padding:0;overflow:hidden;word-break:break-all}",
      ".ledger thead th{height:10mm;background:#d9d9d9;font-size:6.4pt;line-height:1.2;word-break:keep-all}",
      ".ledger tbody tr,.ledger tbody td{height:6.1mm;max-height:6.1mm;break-inside:avoid;page-break-inside:avoid}",
      ".ledger .cell{height:5.85mm;max-height:5.85mm;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:.2mm .35mm;font-size:5.7pt;line-height:1.12}",
      ".ledger .cell span{display:block;width:100%;max-height:5.2mm;overflow:hidden;text-align:center}",
      ".page-no{position:absolute;right:1mm;bottom:2mm;font-size:7pt;color:#333}",
      "@media print{html,body{background:#fff}.tools{display:none}.sheet{width:285mm;height:190mm;margin:0;padding-bottom:8mm;break-after:page;page-break-after:always;print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet:last-child{break-after:auto;page-break-after:auto}}",
      "</style></head><body>",
      '<div class="tools"><b>DFEN-QPF-17-04 (01) · ',state.year,'년 · ',scopeLabel,' · ',rows.length,'건</b><button type="button" onclick="window.print()">인쇄 / PDF</button></div>',
      printPagesHtml(rows,pageOffset,pageCount),
      autoPrint?'<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});</script>':"",
      "</body></html>"
    ].join("");
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  function bindWorkspaceEvents(){
    var root=byId("dfQualityFormWorkspace");
    if(!root||root.dataset.bound==="1")return;
    root.dataset.bound="1";
    byId("qpfFolderSearch").addEventListener("input",function(event){
      state.folderQuery=event.target.value;
      renderFolders();
    });
    byId("qpfFolderReload").addEventListener("click",function(){loadFolderMetadata({quiet:false});});
    byId("qpfFolderGrid").addEventListener("click",function(event){
      var sort=event.target.closest("[data-qpf-folder-sort]");
      if(sort){
        var key=sort.dataset.qpfFolderSort;
        if(state.folderSortKey===key)state.folderSortDirection=state.folderSortDirection==="asc"?"desc":"asc";
        else{state.folderSortKey=key;state.folderSortDirection="asc";}
        renderFolders();
        return;
      }
      var rename=event.target.closest("[data-qpf-rename]");
      if(rename){renameFolder(Number(rename.dataset.qpfRename));return;}
      var open=event.target.closest("[data-qpf-open]");
      if(!open)return;
      if(open.dataset.qpfOpen==="101"){
        if(window.DF_QIF_0101&&typeof window.DF_QIF_0101.open==="function")window.DF_QIF_0101.open();
        else window.alert("시험담당자 자격 평가표 모듈을 불러오지 못했습니다. qif_qualification.js 파일을 확인해주세요.");
        return;
      }
      if(open.dataset.qpfOpen==="102"){
        if(window.DF_QIF_0102&&typeof window.DF_QIF_0102.open==="function")window.DF_QIF_0102.open();
        else window.alert("자격인정서 모듈을 불러오지 못했습니다. qif_certificate.js 파일을 확인해주세요.");
        return;
      }
      if(open.dataset.qpfOpen!=="4"){
        window.alert("이 문서는 원본 양식이 등록되면 같은 폴더 방식으로 활성화됩니다.");
        return;
      }
      openLedger();
    });
    byId("qpfYear").addEventListener("change",async function(event){
      var next=Number(event.target.value);
      if(next===state.year)return;
      if(!confirmDiscard()){
        event.target.value=String(state.year);
        return;
      }
      state.year=next;
      state.query="";
      state.missingDispatchOnly=false;
      state.page=0;
      var search=byId("qpfLedgerSearch");
      if(search)search.value="";
      var loaded=await loadRows({force:true});
      if(loaded&&canEdit()){
        var result=await syncCompletedSchedules(state.year,{quiet:true,refresh:false});
        if(result&&result.changed)await loadRows({force:true,keepStatus:true});
      }
    });
    byId("qpfLedgerSearch").addEventListener("input",function(event){
      state.query=event.target.value;
      state.page=0;
      renderLedger();
    });
    byId("qpfMissingDispatch").addEventListener("click",function(){
      state.missingDispatchOnly=!state.missingDispatchOnly;
      state.page=0;
      renderLedger();
    });
    byId("qpfReload").addEventListener("click",function(){loadRows();});
    byId("qpfScheduleSync").addEventListener("click",function(){
      if(hasDirty())return window.alert("완료 일정을 가져오기 전에 현재 변경사항을 먼저 저장해주세요.");
      syncCompletedSchedules(state.year,{quiet:false,refresh:true});
    });
    byId("qpfExcelImport").addEventListener("click",function(){
      if(hasDirty())return window.alert("Excel 업로드 전에 현재 변경사항을 먼저 저장해주세요.");
      byId("qpfExcelFile").click();
    });
    byId("qpfExcelFile").addEventListener("change",function(event){
      importExcelFile(event.target.files&&event.target.files[0]);
    });
    byId("qpfAddRow").addEventListener("click",addRow);
    byId("qpfSave").addEventListener("click",saveAll);
    byId("qpfArchive").addEventListener("click",archiveSelected);
    byId("qpfPreview").addEventListener("click",function(){openPrint(false,"current");});
    byId("qpfPrint").addEventListener("click",function(){openPrint(true,"current");});
    byId("qpfPreviewAll").addEventListener("click",function(){openPrint(false,"all");});
    byId("qpfPrevPage").addEventListener("click",function(){if(state.page>0){state.page-=1;renderLedger();}});
    byId("qpfNextPage").addEventListener("click",function(){
      var pages=Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE));
      if(state.page<pages-1){state.page+=1;renderLedger();}
    });
    byId("qpfGoPage").addEventListener("click",goToPage);
    byId("qpfPageInput").addEventListener("change",goToPage);
    byId("qpfPageInput").addEventListener("keydown",function(event){
      if(event.key==="Enter"){event.preventDefault();goToPage();}
    });
    byId("qpfFormPage").addEventListener("input",handleFormInput);
    byId("qpfFormPage").addEventListener("click",function(event){
      var tr=event.target.closest("tr[data-qpf-row]");
      if(!tr)return;
      var key=tr.dataset.qpfRow;
      if(key.indexOf("blank:")===0){
        state.selectedKey="";
      }else state.selectedKey=key;
      rerenderSelection();
    });
  }

  function installDocumentHubHooks(){
    if(!originalOpenDocumentHub&&typeof window.dfOpenDocumentHub==="function"){
      originalOpenDocumentHub=window.dfOpenDocumentHub;
      window.dfOpenDocumentHub=function(category){
        if(category==="quality_form"){
          openFolderList();
          return;
        }
        deactivateMode();
        return originalOpenDocumentHub.apply(this,arguments);
      };
    }
    if(!originalDocumentLoad&&typeof window.dfV12011DocLoad==="function"){
      originalDocumentLoad=window.dfV12011DocLoad;
      window.dfV12011DocLoad=function(){
        if(state.active)return Promise.resolve();
        return originalDocumentLoad.apply(this,arguments);
      };
    }
    document.addEventListener("click",function(event){
      var qualityButton=event.target.closest&&event.target.closest('[data-doc-category="quality_form"]');
      if(qualityButton){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openFolderList();
        return;
      }
      if(state.active&&event.target.closest&&event.target.closest("#dfDocBack")){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        backFromQualityForms();
      }
    },true);
  }

  function queueScheduleSync(year){
    if(!canEdit())return;
    setTimeout(function(){syncCompletedSchedules(year,{quiet:true,refresh:true});},500);
  }
  function installScheduleHooks(){
    try{
      if(typeof dfV1123SaveScheduleStatus==="function"&&!dfV1123SaveScheduleStatus.__qpf1704Wrapped){
        var statusBase=dfV1123SaveScheduleStatus;
        var statusWrapped=async function(){
          var selected=null;
          try{selected=typeof scheduleSelected==="function"?scheduleSelected():null;}catch(ignore){}
          var result=await statusBase.apply(this,arguments);
          if(result===true&&selected&&/측정/.test(selected.Type||"")){
            queueScheduleSync(Number(String(selected.Date||"").slice(0,4))||new Date().getFullYear());
          }
          return result;
        };
        statusWrapped.__qpf1704Wrapped=true;
        dfV1123SaveScheduleStatus=statusWrapped;
      }
      if(typeof scheduleAddSave==="function"&&!scheduleAddSave.__qpf1704Wrapped){
        var addBase=scheduleAddSave;
        var addWrapped=async function(){
          var date=byId("scheduleAddDate")&&byId("scheduleAddDate").value||"";
          var type=byId("scheduleAddType")&&byId("scheduleAddType").value||"";
          var result=await addBase.apply(this,arguments);
          if(result!==false&&/측정/.test(type)){
            queueScheduleSync(Number(String(date).slice(0,4))||new Date().getFullYear());
          }
          return result;
        };
        addWrapped.__qpf1704Wrapped=true;
        scheduleAddSave=addWrapped;
      }
    }catch(error){
      diagnostic("warn","일정 후처리 연결 보류",error&&error.message||error);
    }
  }

  function applyVersion(){
    var side=byId("dfBuildVersionStatic");
    var footer=byId("dfFooterVersion");
    if(side)side.textContent="ONLINE "+VERSION+" · QPF WEB FORMS";
    if(footer)footer.textContent=VERSION;
  }
  function init(){
    ensureWorkspace();
    installDocumentHubHooks();
    installScheduleHooks();
    applyVersion();
    [200,900,1900,2800].forEach(function(delay){setTimeout(applyVersion,delay);});
    window.DF_QPF_FORMS={
      version:VERSION,
      open:openFolderList,
      open1704:openLedger,
      reload:loadRows,
      sync:function(year){return syncCompletedSchedules(year||state.year,{quiet:false,refresh:true});},
      print:function(){openPrint(false,"current");},
      printAll:function(){openPrint(false,"all");},
      helpers:{
        normalizeCompany:normalizeCompany,
        repositoryItems:repositoryItems,
        scheduleCompanies:scheduleCompanies,
        colgroupHtml:colgroupHtml,
        pageSize:PAGE_SIZE,
        fieldKeys:FIELDS.slice()
      },
      state:state
    };
    diagnostic("info","작성용 품질문서 모듈 준비 완료",VERSION);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();

/* DREAMFOREN v120.37.20.0
 * 품질문서 업로드 파일 공통 미리보기
 * PDF·이미지·HWP 내장 미리보기·Excel 첫 시트·텍스트를 지원합니다.
 */
(function dfQualityFilePreviewModule(){
  "use strict";

  var VERSION="v120.37.20.0";
  var activeUrl="";
  var activeBlob=null;
  var activeName="";

  function byId(id){return document.getElementById(id);}
  function clean(value){return String(value==null?"":value).trim();}
  function escapeHtml(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(character){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character];
    });
  }
  function extension(name){
    var match=clean(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?match[1]:"";
  }
  function formatBytes(value){
    var bytes=Number(value)||0;
    if(bytes<1024)return bytes+" B";
    if(bytes<1024*1024)return (bytes/1024).toFixed(bytes<10240?1:0)+" KB";
    return (bytes/(1024*1024)).toFixed(bytes<10*1024*1024?1:0)+" MB";
  }
  function revokeUrl(){
    if(activeUrl){try{URL.revokeObjectURL(activeUrl);}catch(ignore){}activeUrl="";}
  }
  function setObjectUrl(blob){
    revokeUrl();
    activeUrl=URL.createObjectURL(blob);
    return activeUrl;
  }
  function ensureModal(){
    var modal=byId("dfQualityFilePreview");
    if(modal)return modal;
    modal=document.createElement("div");
    modal.id="dfQualityFilePreview";
    modal.className="df-quality-file-preview";
    modal.hidden=true;
    modal.innerHTML=[
      '<div class="df-quality-preview-backdrop" data-df-preview-close></div>',
      '<section class="df-quality-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="dfQualityPreviewTitle">',
        '<header><div><strong id="dfQualityPreviewTitle">업로드 자료 미리보기</strong><small id="dfQualityPreviewMeta"></small></div>',
        '<div class="df-quality-preview-actions"><button type="button" id="dfQualityPreviewDownload">파일 받기</button><button type="button" id="dfQualityPreviewClose" aria-label="미리보기 닫기">닫기</button></div></header>',
        '<div id="dfQualityPreviewBody" class="df-quality-preview-body"></div>',
      '</section>'
    ].join("");
    document.body.appendChild(modal);
    modal.addEventListener("click",function(event){if(event.target.closest("[data-df-preview-close]"))close();});
    byId("dfQualityPreviewClose").addEventListener("click",close);
    byId("dfQualityPreviewDownload").addEventListener("click",downloadActive);
    document.addEventListener("keydown",function(event){
      if(event.key==="Escape"&&!modal.hidden)close();
    });
    return modal;
  }
  function setBody(html,className){
    var body=byId("dfQualityPreviewBody");
    if(!body)return;
    body.className="df-quality-preview-body"+(className?" "+className:"");
    body.innerHTML=html;
  }
  function setLoading(message){
    setBody('<div class="df-quality-preview-state"><span class="df-quality-preview-spinner"></span><b>'+escapeHtml(message||"미리보기를 준비하는 중입니다…")+'</b></div>',"loading");
  }
  function setError(message){
    setBody('<div class="df-quality-preview-state bad"><b>미리보기를 열지 못했습니다.</b><span>'+escapeHtml(message||"알 수 없는 오류")+'</span><small>파일 받기 버튼으로 원본을 확인할 수 있습니다.</small></div>',"error");
  }
  function close(){
    var modal=byId("dfQualityFilePreview");
    if(modal)modal.hidden=true;
    document.body.classList.remove("df-quality-preview-open");
    revokeUrl();
    activeBlob=null;
    activeName="";
  }
  function downloadActive(){
    if(!activeBlob)return;
    var url=URL.createObjectURL(activeBlob);
    var anchor=document.createElement("a");
    anchor.href=url;
    anchor.download=activeName||"품질문서";
    anchor.style.display="none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},30000);
  }
  function sniffImageMime(bytes){
    if(bytes&&bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return "image/png";
    if(bytes&&bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
    if(bytes&&bytes.length>=6&&String.fromCharCode.apply(null,Array.prototype.slice.call(bytes,0,6)).indexOf("GIF8")===0)return "image/gif";
    return "";
  }
  async function renderHwp(blob){
    if(!window.XLSX||!window.XLSX.CFB)throw new Error("HWP 미리보기 구성요소를 불러오지 못했습니다.");
    var bytes=new Uint8Array(await blob.arrayBuffer());
    var cfb=window.XLSX.CFB.read(bytes,{type:"array"});
    var entry=null;
    if(typeof window.XLSX.CFB.find==="function"){
      entry=window.XLSX.CFB.find(cfb,"/PrvImage")||window.XLSX.CFB.find(cfb,"PrvImage");
    }
    if(!entry&&cfb&&cfb.FileIndex){
      var paths=cfb.FullPaths||[];
      for(var index=0;index<cfb.FileIndex.length;index+=1){
        if(/(?:^|\/)PrvImage\/?$/i.test(String(paths[index]||cfb.FileIndex[index]&&cfb.FileIndex[index].name||""))){entry=cfb.FileIndex[index];break;}
      }
    }
    var content=entry&&(entry.content||entry.data);
    if(!content||!content.length)throw new Error("이 HWP 파일에는 문서 미리보기 이미지가 포함되어 있지 않습니다.");
    var previewBytes=content instanceof Uint8Array?content:new Uint8Array(content);
    var mime=sniffImageMime(previewBytes);
    if(!mime)throw new Error("HWP 미리보기 이미지 형식을 확인하지 못했습니다.");
    var url=setObjectUrl(new Blob([previewBytes],{type:mime}));
    setBody('<div class="df-quality-preview-page"><img src="'+url+'" alt="'+escapeHtml(activeName)+' 미리보기"></div>',"document");
  }
  async function renderSpreadsheet(blob){
    if(!window.XLSX||typeof window.XLSX.read!=="function")throw new Error("Excel 미리보기 구성요소를 불러오지 못했습니다.");
    var workbook=window.XLSX.read(await blob.arrayBuffer(),{type:"array",cellDates:true});
    var sheetName=workbook.SheetNames&&workbook.SheetNames[0];
    if(!sheetName)throw new Error("표시할 시트를 찾지 못했습니다.");
    var rows=window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:false,defval:""});
    var clipped=rows.length>250;
    rows=rows.slice(0,250).map(function(row){return Array.prototype.slice.call(row||[],0,40);});
    var width=rows.reduce(function(max,row){return Math.max(max,row.length);},0);
    if(!rows.length||!width){setBody('<div class="df-quality-preview-state"><b>빈 시트입니다.</b></div>',"sheet");return;}
    var table=rows.map(function(row,rowIndex){
      var cells=[];
      for(var column=0;column<width;column+=1){
        var tag=rowIndex===0?"th":"td";
        cells.push("<"+tag+">"+escapeHtml(row[column])+"</"+tag+">");
      }
      return "<tr>"+cells.join("")+"</tr>";
    }).join("");
    setBody('<div class="df-quality-preview-sheet-head"><b>'+escapeHtml(sheetName)+'</b><span>첫 시트'+(clipped?" · 최대 250행까지 표시":"")+'</span></div><div class="df-quality-preview-sheet-wrap"><table>'+table+'</table></div>',"sheet");
  }
  async function renderText(blob){
    var textValue=await blob.text();
    if(textValue.length>1000000)textValue=textValue.slice(0,1000000)+"\n\n… 미리보기는 1MB까지만 표시됩니다.";
    setBody('<pre>'+escapeHtml(textValue)+'</pre>',"text");
  }
  async function renderBlob(blob,name,mime){
    var ext=extension(name);
    mime=clean(mime||blob.type).toLowerCase();
    if(mime.indexOf("image/")===0||/^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)){
      var imageUrl=setObjectUrl(blob);
      setBody('<div class="df-quality-preview-image"><img src="'+imageUrl+'" alt="'+escapeHtml(name)+'"></div>',"image");
      return;
    }
    if(mime==="application/pdf"||ext==="pdf"){
      var pdfUrl=setObjectUrl(blob);
      setBody('<iframe src="'+pdfUrl+'#toolbar=1&navpanes=0" title="'+escapeHtml(name)+' 미리보기"></iframe>',"pdf");
      return;
    }
    if(ext==="hwp"){
      await renderHwp(blob);
      return;
    }
    if(/^(xls|xlsx|xlsm|xlsb|csv|tsv)$/.test(ext)){
      await renderSpreadsheet(blob);
      return;
    }
    if(mime.indexOf("text/")===0||/^(txt|log|json|xml|md|csv)$/.test(ext)){
      await renderText(blob);
      return;
    }
    if(mime.indexOf("video/")===0){
      var videoUrl=setObjectUrl(blob);
      setBody('<video src="'+videoUrl+'" controls></video>',"media");
      return;
    }
    if(mime.indexOf("audio/")===0){
      var audioUrl=setObjectUrl(blob);
      setBody('<audio src="'+audioUrl+'" controls></audio>',"media");
      return;
    }
    setBody('<div class="df-quality-preview-state"><b>이 파일 형식은 브라우저 화면 미리보기를 지원하지 않습니다.</b><span>'+escapeHtml(name)+'</span><small>상단의 파일 받기 버튼으로 원본을 확인해주세요.</small></div>',"unsupported");
  }
  async function open(options){
    options=options||{};
    var modal=ensureModal();
    var name=clean(options.name)||"품질문서";
    activeName=name;
    activeBlob=null;
    revokeUrl();
    byId("dfQualityPreviewTitle").textContent=name;
    byId("dfQualityPreviewMeta").textContent=[clean(options.mime),formatBytes(options.size)].filter(Boolean).join(" · ");
    byId("dfQualityPreviewDownload").disabled=true;
    modal.hidden=false;
    document.body.classList.add("df-quality-preview-open");
    setLoading(name+" 파일을 불러오는 중입니다…");
    try{
      var blob=options.blob;
      if(!blob&&typeof options.load==="function")blob=await options.load();
      if(!blob)throw new Error("파일 데이터를 불러오지 못했습니다.");
      activeBlob=blob;
      byId("dfQualityPreviewDownload").disabled=false;
      await renderBlob(blob,name,options.mime);
      return true;
    }catch(error){
      console.error("[QUALITY-FILE-PREVIEW]",error);
      setError(error&&error.message||error);
      return false;
    }
  }

  window.DF_QUALITY_FILE_PREVIEW={version:VERSION,open:open,close:close};
})();

/* DREAMFOREN v120.37.20.0
 * 전체 파일 업로드 공통 드래그앤드롭 연결
 * 기존 input[type=file]의 change 처리를 그대로 사용하여 기능 충돌을 막습니다.
 */
(function dfGlobalFileDropModule(){
  "use strict";

  var VERSION="v120.37.20.0";
  var RULES=[
    {inputId:"dfErpInvoiceFiles",selectors:["#dfErpInvoicePick"]},
    {inputId:"dfErpPaymentFiles",selectors:["#dfErpPaymentPick"]},
    {inputId:"dfDocFile",selectors:["#dfDocUpload"]},
    {inputId:"excelImportFile",selectors:["#btnExcelImport"]},
    {inputId:"qpfExcelFile",selectors:["#qpfExcelImport"]},
    {inputId:"qifFileInput",selectors:["#qifDropZone"]},
    {inputId:"qicFileInput",selectors:["#qicDropZone"]},
    {inputId:"dfBoardFiles",selectors:["#dfBoardFileField"]},
    {inputId:"dfApFormFiles",selectors:[".df-approval-files"]},
    {inputId:"companyDocFileInput",selectors:["[data-company-doc-upload]"]}
  ];
  var WATCH_SELECTOR="input[type=\"file\"],#dfErpInvoicePick,#dfErpPaymentPick,#dfDocUpload,#btnExcelImport,#qpfExcelImport,#dfBoardFileField,.df-approval-files,[data-company-doc-upload]";
  var refreshTimer=0;
  var dragDepth=0;
  var activeZone=null;
  var toastTimer=0;

  function hasFilePayload(event){
    var transfer=event&&event.dataTransfer;
    if(!transfer)return false;
    var types=Array.prototype.slice.call(transfer.types||[]);
    return types.indexOf("Files")>=0||!!(transfer.files&&transfer.files.length);
  }
  function ruleForInput(input){
    for(var index=0;index<RULES.length;index++){
      if(RULES[index].inputId===input.id)return RULES[index];
    }
    return null;
  }
  function clearOrphanZones(){
    document.querySelectorAll("[data-df-drop-input]").forEach(function(zone){
      if(!document.getElementById(zone.dataset.dfDropInput||"")){
        zone.classList.remove("df-file-drop-target","df-file-drop-active");
        delete zone.dataset.dfDropInput;
      }
    });
  }
  function markZone(zone,input){
    if(!zone||!input||!input.id)return;
    zone.classList.add("df-file-drop-target");
    zone.dataset.dfDropInput=input.id;
    if(!zone.getAttribute("title"))zone.setAttribute("title","클릭하거나 파일을 끌어놓아 업로드할 수 있습니다.");
  }
  function enhanceInput(input){
    if(!input||input.type!=="file")return;
    if(!input.id)input.id="dfDropFileInput"+Date.now()+Math.random().toString(36).slice(2,7);
    var rule=ruleForInput(input);
    var zones=[];
    if(rule){
      rule.selectors.forEach(function(selector){
        document.querySelectorAll(selector).forEach(function(zone){
          if(zones.indexOf(zone)<0)zones.push(zone);
        });
      });
    }
    if(!zones.length){
      var label=input.closest&&input.closest("label");
      if(label)zones.push(label);
      else if(!input.hidden&&input.parentElement)zones.push(input.parentElement);
    }
    zones.forEach(function(zone){markZone(zone,input);});
    input.dataset.dfDropReady="1";
  }
  function refreshAll(){
    clearOrphanZones();
    document.querySelectorAll("input[type=\"file\"]").forEach(enhanceInput);
  }
  function scheduleRefresh(){
    if(refreshTimer)return;
    refreshTimer=setTimeout(function(){refreshTimer=0;refreshAll();},0);
  }
  function zoneFromTarget(target){
    var element=target&&target.nodeType===1?target:target&&target.parentElement;
    if(!element||!element.closest)return null;
    var zone=element.closest("[data-df-drop-input]");
    if(!zone||zone.hidden||zone.closest("[hidden]"))return null;
    return zone;
  }
  function inputFromZone(zone){
    return zone&&document.getElementById(zone.dataset.dfDropInput||"");
  }
  function accepts(input,file){
    var accept=String(input&&input.getAttribute("accept")||"").trim().toLowerCase();
    if(!accept)return true;
    var name=String(file&&file.name||"").toLowerCase();
    var mime=String(file&&file.type||"").toLowerCase();
    return accept.split(",").some(function(raw){
      var token=raw.trim();
      if(!token)return false;
      if(token.charAt(0)===".")return name.slice(-token.length)===token;
      if(token.slice(-2)==="/*")return mime.indexOf(token.slice(0,-1))===0;
      return !!mime&&mime===token;
    });
  }
  function showToast(message,isError){
    var toast=document.getElementById("dfGlobalDropToast");
    if(!toast){
      toast=document.createElement("div");
      toast.id="dfGlobalDropToast";
      toast.className="df-file-drop-toast";
      toast.setAttribute("role","status");
      toast.setAttribute("aria-live","polite");
      document.body.appendChild(toast);
    }
    toast.textContent=message;
    toast.classList.toggle("bad",!!isError);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){toast.classList.remove("show");},3200);
  }
  function setInputFiles(input,files){
    var transfer=new DataTransfer();
    files.forEach(function(file){transfer.items.add(file);});
    input.value="";
    input.files=transfer.files;
    input.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function deliver(input,files,zone){
    files=Array.prototype.slice.call(files||[]);
    if(!input||input.disabled){showToast("현재 권한에서는 이 파일을 업로드할 수 없습니다.",true);return false;}
    if(!files.length){showToast("업로드할 파일을 찾지 못했습니다.",true);return false;}
    var valid=files.filter(function(file){return accepts(input,file);});
    var rejected=files.filter(function(file){return !accepts(input,file);});
    if(!valid.length){
      showToast("허용되지 않는 파일 형식입니다: "+rejected.map(function(file){return file.name;}).join(", "),true);
      return false;
    }
    var skipped=0;
    if(!input.multiple&&valid.length>1){skipped=valid.length-1;valid=valid.slice(0,1);}
    if(zone&&zone.hasAttribute("data-company-doc-upload"))input.dataset.docType=zone.getAttribute("data-company-doc-upload")||"기타";
    try{
      setInputFiles(input,valid);
    }catch(error){
      console.error("[DF-FILE-DROP]",error);
      showToast("이 브라우저에서 끌어놓기 업로드를 처리하지 못했습니다. 파일 선택 버튼을 이용해주세요.",true);
      return false;
    }
    var message=valid.length+"개 파일을 업로드 영역에 전달했습니다.";
    if(rejected.length)message+=" 형식이 맞지 않는 "+rejected.length+"개 파일은 제외했습니다.";
    if(skipped)message+=" 이 영역은 한 번에 1개만 가능해 나머지는 제외했습니다.";
    showToast(message,false);
    try{
      if(window.DF_DIAG&&typeof window.DF_DIAG.info==="function")window.DF_DIAG.info("FILE-DROP","끌어놓기 업로드",input.id+" / "+valid.length+"개");
    }catch(ignore){}
    return true;
  }
  function setActiveZone(zone){
    if(activeZone===zone)return;
    if(activeZone)activeZone.classList.remove("df-file-drop-active");
    activeZone=zone;
    if(activeZone)activeZone.classList.add("df-file-drop-active");
  }
  function resetDrag(){
    dragDepth=0;
    setActiveZone(null);
    if(document.body)document.body.classList.remove("df-file-dragging");
  }
  function ensureGuide(){
    if(document.getElementById("dfGlobalDropGuide"))return;
    var guide=document.createElement("div");
    guide.id="dfGlobalDropGuide";
    guide.className="df-file-drop-guide";
    guide.innerHTML="<strong>파일 업로드</strong><span>초록색으로 표시된 업로드 버튼 또는 첨부파일 칸에 놓으세요.</span>";
    document.body.appendChild(guide);
  }
  function init(){
    ensureGuide();
    refreshAll();
    document.addEventListener("dragenter",function(event){
      if(!hasFilePayload(event))return;
      event.preventDefault();
      dragDepth+=1;
      document.body.classList.add("df-file-dragging");
      setActiveZone(zoneFromTarget(event.target));
    });
    document.addEventListener("dragover",function(event){
      if(!hasFilePayload(event))return;
      event.preventDefault();
      var zone=zoneFromTarget(event.target);
      setActiveZone(zone);
      if(event.dataTransfer)event.dataTransfer.dropEffect=zone?"copy":"none";
    });
    document.addEventListener("dragleave",function(event){
      if(!hasFilePayload(event)&&!document.body.classList.contains("df-file-dragging"))return;
      dragDepth=Math.max(0,dragDepth-1);
      if(dragDepth===0||(event.clientX===0&&event.clientY===0))resetDrag();
    });
    document.addEventListener("drop",function(event){
      if(!hasFilePayload(event))return;
      event.preventDefault();
      var zone=zoneFromTarget(event.target);
      var input=inputFromZone(zone);
      var files=event.dataTransfer&&event.dataTransfer.files;
      resetDrag();
      if(!zone||!input){
        showToast("파일을 초록색 업로드 버튼 또는 첨부파일 칸 위에 놓아주세요.",true);
        return;
      }
      event.stopPropagation();
      deliver(input,files,zone);
    },true);
    window.addEventListener("dragend",resetDrag);
    window.addEventListener("blur",resetDrag);
    if(typeof MutationObserver==="function"){
      new MutationObserver(function(records){
        var relevant=records.some(function(record){
          return Array.prototype.some.call(record.addedNodes||[],function(node){
            return node&&node.nodeType===1&&(
              node.matches&&node.matches(WATCH_SELECTOR)||node.querySelector&&node.querySelector(WATCH_SELECTOR)
            );
          });
        });
        if(relevant)scheduleRefresh();
      }).observe(document.documentElement,{childList:true,subtree:true});
    }
    try{
      if(window.DF_DIAG&&typeof window.DF_DIAG.info==="function")window.DF_DIAG.info("FILE-DROP","전체 업로드 끌어놓기 준비 완료",VERSION);
    }catch(ignore){}
  }

  window.DF_FILE_DROP={
    version:VERSION,
    refresh:refreshAll,
    helpers:{accepts:accepts,deliver:deliver}
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
