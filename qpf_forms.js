/* DREAMFOREN v120.37.17.0
 * 작성용 품질문서 폴더 + DFEN-QPF-17-04 (01) 웹 대장
 * 기존 문서/일정 저장 흐름과 분리된 추가 모듈입니다.
 */
(function dfQpfFormsModule(){
  "use strict";

  var VERSION="v120.37.17.0";
  var ENTRY_TABLE="qpf_17_04_entries";
  var SIGNATURE_TABLE="qpf_17_04_signatures";
  var PAGE_SIZE=24;
  var FIELD_DEFS=[
    {key:"measurement_no",label:"측정<br>번호",weight:26.9},
    {key:"measurement_date",label:"측정일",weight:21.7,type:"date"},
    {key:"sample_receipt_date",label:"시료<br>접수일",weight:21.7,type:"date"},
    {key:"request_org",label:"측정대행<br>의뢰기관",weight:60.5,long:true},
    {key:"target_site",label:"측정대상<br>사업장",weight:60.5,long:true},
    {key:"facility",label:"측정시설",weight:83,long:true},
    {key:"measurement_items",label:"측정항목",weight:74.4,long:true},
    {key:"handover_person",label:"인계자",weight:11},
    {key:"receiver_person",label:"인수자",weight:11},
    {key:"analysis_manager",label:"분석<br>책임자",weight:17.5},
    {key:"technical_manager",label:"기술<br>책임자",weight:17.1},
    {key:"dispatch_date",label:"발송일",weight:20.5,type:"date"},
    {key:"note",label:"비고",weight:29.7,long:true}
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
    folderQuery:"",
    selectedKey:"",
    loading:false,
    saving:false,
    syncing:false,
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
      return "대장 DB 준비가 필요합니다. 31_v12037170_qpf_17_04_ledger.sql을 먼저 실행해주세요.";
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
          '<label>문서번호 · 양식명 검색<input id="qpfFolderSearch" type="search" placeholder="예: DFEN-QPF-17-04 또는 시료접수"></label>',
        '</div>',
        '<div class="qpf-folder-summary"><span><strong>DFEN-QPF-17</strong> 작성양식 폴더</span><span id="qpfFolderCount"></span></div>',
        '<div id="qpfFolderGrid" class="qpf-folder-grid"></div>',
      '</section>',
      '<section id="qpfLedgerPane" class="qpf-pane" hidden>',
        '<div class="qpf-ledger-toolbar" aria-label="대장 관리 도구">',
          '<label>작성 연도<select id="qpfYear"></select></label>',
          '<label class="qpf-search-label">대장 검색<input id="qpfLedgerSearch" type="search" placeholder="측정번호 · 업체 · 시설 · 항목 · 담당자 검색"></label>',
          '<button type="button" class="qpf-button" id="qpfReload">새로고침</button>',
          '<button type="button" class="qpf-button" id="qpfScheduleSync">완료 일정 가져오기</button>',
          '<span class="qpf-toolbar-separator" aria-hidden="true"></span>',
          '<button type="button" class="qpf-button" id="qpfAddRow">+ 행 추가</button>',
          '<button type="button" class="qpf-button primary" id="qpfSave">저장</button>',
          '<button type="button" class="qpf-button danger" id="qpfArchive">선택 행 제외</button>',
          '<span class="qpf-toolbar-separator" aria-hidden="true"></span>',
          '<button type="button" class="qpf-button" id="qpfPreview">미리보기</button>',
          '<button type="button" class="qpf-button" id="qpfPrint">인쇄</button>',
        '</div>',
        '<div class="qpf-ledger-status"><span id="qpfLedgerMessage"></span><span id="qpfLedgerMeta"></span></div>',
        '<div id="qpfReadonlyNotice" class="qpf-readonly-notice" hidden>열람 전용 계정입니다. 작성·수정은 “품질문서 수정·업로드” 권한이 필요합니다.</div>',
        '<div class="qpf-form-scroll"><div id="qpfFormPage" class="qpf-form-page"></div></div>',
        '<div class="qpf-pagination">',
          '<button type="button" class="qpf-button" id="qpfPrevPage">← 이전</button>',
          '<span class="qpf-page-label" id="qpfPageLabel">1 / 1</span>',
          '<button type="button" class="qpf-button" id="qpfNextPage">다음 →</button>',
        '</div>',
        '<p class="qpf-ledger-help">행을 누르면 선택됩니다. 완료된 측정일정은 중복 없이 자동 연결되며, 자동 연결은 이미 작성한 값을 덮어쓰지 않습니다. 관리 버튼과 선택 표시는 인쇄되지 않습니다.</p>',
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

  function qualityDocuments(){
    var docs=[];
    for(var number=1;number<=30;number++){
      var suffix=String(number).padStart(2,"0");
      docs.push({
        number:number,
        code:"DFEN-QPF-17-"+suffix+(number===4?" (01)":""),
        title:number===4?"시료접수 및 성적서 발송대장":"양식명 등록 예정",
        available:number===4
      });
    }
    return docs;
  }

  function renderFolders(){
    var grid=byId("qpfFolderGrid");
    if(!grid)return;
    var query=text(state.folderQuery).toLowerCase();
    var docs=qualityDocuments().filter(function(doc){
      return !query||(doc.code+" "+doc.title).toLowerCase().indexOf(query)>=0;
    });
    grid.innerHTML=docs.map(function(doc){
      var cls="qpf-folder-card"+(doc.available?" available":"");
      var stateLabel=doc.available?"작성 · 검색 · 일정연동 · 인쇄":"양식 등록 예정";
      return [
        '<button type="button" class="',cls,'" data-qpf-doc="',doc.number,'" aria-disabled="',doc.available?"false":"true",'">',
          '<span class="qpf-folder-icon" aria-hidden="true"></span>',
          '<span class="qpf-folder-text">',
            '<span class="qpf-folder-code">',escapeHtml(doc.code),'</span>',
            '<span class="qpf-folder-title">',escapeHtml(doc.title),'</span>',
            '<span class="qpf-folder-state">',stateLabel,'</span>',
          '</span>',
        '</button>'
      ].join("");
    }).join("")||'<div class="qpf-folder-empty">검색 결과가 없습니다.</div>';
    var count=byId("qpfFolderCount");
    if(count)count.textContent="전체 30개 · 사용 가능 1개 · 검색 "+docs.length+"개";
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
    state.view="folders";
    var folder=byId("qpfFolderPane");
    var ledger=byId("qpfLedgerPane");
    if(folder)folder.hidden=false;
    if(ledger)ledger.hidden=true;
    setHeader("작성용 품질문서","DFEN-QPF-17-01부터 17-30까지 양식을 폴더별로 작성·관리합니다.","← 품질문서");
    renderFolders();
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
    state.page=0;
    state.selectedKey="";
    var folder=byId("qpfFolderPane");
    var ledger=byId("qpfLedgerPane");
    if(folder)folder.hidden=true;
    if(ledger)ledger.hidden=false;
    var search=byId("qpfLedgerSearch");
    if(search)search.value="";
    setHeader("DFEN-QPF-17-04 (01)","시료접수 및 성적서 발송대장 · 연도별 작성·검색·일정완료 자동연동","← 작성용 품질문서");
    updatePermissionUi();
    var loaded=await loadRows();
    if(loaded&&canEdit()){
      var result=await syncCompletedSchedules(state.year,{quiet:true,refresh:false});
      if(result&&result.changed)await loadRows({keepStatus:true});
    }
  }

  function updatePermissionUi(){
    var editable=canEdit();
    ["qpfAddRow","qpfSave","qpfArchive","qpfScheduleSync"].forEach(function(id){
      var el=byId(id);
      if(el)el.disabled=!editable;
    });
    var notice=byId("qpfReadonlyNotice");
    if(notice)notice.hidden=editable;
  }

  function filteredRows(){
    var query=text(state.query).toLowerCase();
    if(!query)return state.rows.slice();
    return state.rows.filter(function(row){
      var values=FIELDS.map(function(key){return row[key];});
      values.push(row.source_type==="schedule"?"일정완료":"직접작성");
      return values.some(function(value){return String(value==null?"":value).toLowerCase().indexOf(query)>=0;});
    });
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
    return '<textarea data-qpf-field="'+field.key+'" rows="2"'+(disabled?" disabled":"")+'>'+escapeHtml(value)+"</textarea>";
  }
  function rowHtml(row,slot,disabled){
    var key=row?row._key:"blank:"+state.renderSequence+":"+slot;
    var classes=[];
    if(!row)classes.push("qpf-blank-row");
    if(row&&row.source_type==="schedule")classes.push("schedule-source");
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
    var pageLabel=byId("qpfPageLabel");
    if(pageLabel)pageLabel.textContent=(state.page+1)+" / "+pageCount;
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
    meta.textContent=state.year+"년 · 전체 "+state.rows.length+"건 · 검색 "+filteredCount+"건 · "+(state.page+1)+"/"+pageCount+"쪽"+(dirty?" · 미저장 "+dirty+"건":"");
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
    updateMeta(filteredRows().length,Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE)));
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
            .order("sort_order",{ascending:true}).order("created_at",{ascending:true});
        }),
        db.from(SIGNATURE_TABLE).select("*").eq("record_year",state.year).maybeSingle()
      ]);
      if(sequence!==state.loadSequence)return false;
      if(results[1].error)throw results[1].error;
      state.rows=(results[0]||[]).map(hydrateRow);
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
    state.page=Math.max(0,Math.ceil(state.rows.length/PAGE_SIZE)-1);
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
    if(!row)return window.alert("대장에서 제외할 행을 먼저 눌러 선택해주세요.");
    if(!window.confirm("선택한 행을 대장에서 제외할까요?\n행 원본은 서버에 보존되며 일정·자료실 원본은 변경되지 않습니다."))return;
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
        setStatus("다른 기기에서 먼저 수정된 행이라 제외하지 않았습니다. 새로고침 후 확인해주세요.","bad");
        return;
      }
      state.rows=state.rows.filter(function(item){return item!==row;});
      state.selectedKey="";
      renderLedger();
      setStatus("선택 행을 대장에서 제외했습니다. 원본은 보존됩니다.","ok");
    }catch(error){
      setStatus("행 제외 실패: "+migrationMessage(error),"bad");
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
      handover_person:schedule.employee||"",
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
    ["measurement_no","measurement_date","sample_receipt_date","request_org","target_site","facility","measurement_items","handover_person"].forEach(function(key){
      if(!text(existing[key])&&text(candidate[key]))patch[key]=candidate[key];
    });
    return patch;
  }

  async function syncCompletedSchedules(year,options){
    options=options||{};
    year=Number(year)||state.year;
    if(!canEdit())return {changed:false,skipped:true};
    if(syncPromises[year])return syncPromises[year];
    var promise=(async function(){
      var db=database();
      if(!db||!user())return {changed:false,skipped:true};
      state.syncing=true;
      if(!options.quiet)setStatus(year+"년 완료 일정을 확인하는 중입니다.","warn");
      var created=0;
      var enriched=0;
      var conflicts=0;
      try{
        var start=year+"-01-01";
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
        var schedules=results[0].filter(function(schedule){
          var extra=schedule.extra_data||{};
          return (schedule.completed===true||schedule.status==="completed")&&/측정/.test(schedule.schedule_type||"")&&extra.deleted!==true;
        });
        var repositories=results[1].filter(function(row){return !row.hidden&&!isDeletedRepository(row);});
        var existingRows=results[2];
        var companyMap={};
        results[3].forEach(function(company){companyMap[String(company.id)]=company.name||"";});
        var existingByKey={};
        existingRows.forEach(function(row){if(row.source_key)existingByKey[row.source_key]=row;});

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
            }else if(!existing.archived_at&&first){
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
              if(existingByKey[detail.source_key])continue;
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
        var changed=created+enriched>0;
        var message="완료 일정 확인 완료 · 신규 "+created+"건 · 빈 항목 보완 "+enriched+"건";
        if(conflicts)message+=" · 동시처리 "+conflicts+"건은 덮어쓰지 않음";
        if(state.active&&state.view==="ledger")setStatus(message,conflicts?"warn":"ok");
        diagnostic("info","완료 일정 연동",year+"년 / "+message);
        if(options.refresh!==false&&state.active&&state.view==="ledger"&&!hasDirty())await loadRows({force:true,keepStatus:true});
        return {changed:changed,created:created,enriched:enriched,conflicts:conflicts};
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
      return "<td>"+printCell(row&&row[field.key])+"</td>";
    }).join("")+"</tr>";
  }
  function printSignatureHtml(){
    return [
      '<table class="sign"><thead><tr><th>작성자</th><th>책임기술자</th></tr></thead>',
      "<tbody><tr><td>",printCell(state.signature.writer),"</td><td>",printCell(state.signature.technical_manager),"</td></tr></tbody></table>"
    ].join("");
  }
  function printPagesHtml(rows){
    var pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    var output=[];
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
        "</section>"
      ].join(""));
    }
    return output.join("");
  }
  function openPrint(autoPrint){
    var popup=window.open("about:blank","_blank");
    if(!popup)return window.alert("인쇄 미리보기가 차단되었습니다.\n브라우저 주소창에서 팝업을 허용해주세요.");
    var rows=printableRows();
    var html=[
      "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">",
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
      "<title>DFEN-QPF-17-04 (01) 시료접수 및 성적서 발송대장 ",state.year,"년</title>",
      "<style>",
      "@page{size:A4 landscape;margin:6mm}",
      "*{box-sizing:border-box}html,body{margin:0;background:#dfe3dc;color:#000;font-family:\"Malgun Gothic\",\"맑은 고딕\",sans-serif}",
      ".tools{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:9px 14px;background:#263822;color:#fff;font-size:12px}",
      ".tools button{border:0;border-radius:7px;background:#729a43;color:#fff;padding:8px 16px;font-weight:800;cursor:pointer}",
      ".sheet{width:285mm;height:198mm;margin:7mm auto;background:#fff;page-break-after:always;overflow:hidden}",
      ".sheet:last-child{page-break-after:auto}",
      "header{position:relative;height:25mm;display:flex;align-items:center;justify-content:center;border:0.5mm solid #000;border-bottom:0}",
      "h1{margin:0;padding:0 62mm 0 12mm;font-size:19pt;letter-spacing:.08em;text-align:center}",
      ".sign{position:absolute;right:2mm;top:2mm;width:52mm;height:20mm;border-collapse:collapse;table-layout:fixed}",
      ".sign th,.sign td{border:.25mm solid #000;text-align:center;padding:0;font-size:7pt}",
      ".sign th{height:6mm;background:#eee}.sign td{height:13mm;font-size:8pt}",
      ".ledger{width:100%;height:173mm;border-collapse:collapse;table-layout:fixed;border:.5mm solid #000}",
      ".ledger th,.ledger td{border:.25mm solid #000;text-align:center;vertical-align:middle;padding:.3mm;overflow:hidden;word-break:break-all}",
      ".ledger thead th{height:11mm;background:#d9d9d9;font-size:6.4pt;line-height:1.2;word-break:keep-all}",
      ".ledger tbody td{height:6.72mm;font-size:5.7pt;line-height:1.15}",
      "@media print{html,body{background:#fff}.tools{display:none}.sheet{width:285mm;height:198mm;margin:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}}",
      "</style></head><body>",
      '<div class="tools"><b>DFEN-QPF-17-04 (01) · ',state.year,'년 · ',rows.length,'건</b><button type="button" onclick="window.print()">인쇄 / PDF</button></div>',
      printPagesHtml(rows),
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
    byId("qpfFolderGrid").addEventListener("click",function(event){
      var card=event.target.closest("[data-qpf-doc]");
      if(!card)return;
      if(card.dataset.qpfDoc!=="4"){
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
    byId("qpfReload").addEventListener("click",function(){loadRows();});
    byId("qpfScheduleSync").addEventListener("click",function(){
      if(hasDirty())return window.alert("완료 일정을 가져오기 전에 현재 변경사항을 먼저 저장해주세요.");
      syncCompletedSchedules(state.year,{quiet:false,refresh:true});
    });
    byId("qpfAddRow").addEventListener("click",addRow);
    byId("qpfSave").addEventListener("click",saveAll);
    byId("qpfArchive").addEventListener("click",archiveSelected);
    byId("qpfPreview").addEventListener("click",function(){openPrint(false);});
    byId("qpfPrint").addEventListener("click",function(){openPrint(true);});
    byId("qpfPrevPage").addEventListener("click",function(){if(state.page>0){state.page-=1;renderLedger();}});
    byId("qpfNextPage").addEventListener("click",function(){
      var pages=Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE));
      if(state.page<pages-1){state.page+=1;renderLedger();}
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
    setTimeout(function(){syncCompletedSchedules(year,{quiet:true,refresh:false});},500);
  }
  function installScheduleHooks(){
    try{
      if(typeof dfV1123SaveScheduleStatus==="function"&&!dfV1123SaveScheduleStatus.__qpf1704Wrapped){
        var statusBase=dfV1123SaveScheduleStatus;
        var statusWrapped=async function(){
          var selected=null;
          try{selected=typeof scheduleSelected==="function"?scheduleSelected():null;}catch(ignore){}
          var result=await statusBase.apply(this,arguments);
          if(result===true&&selected&&selected.Completed&&/측정/.test(selected.Type||"")){
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
          var status=byId("scheduleAddStatus")&&byId("scheduleAddStatus").value||"";
          var type=byId("scheduleAddType")&&byId("scheduleAddType").value||"";
          var result=await addBase.apply(this,arguments);
          if(status==="completed"&&/측정/.test(type)){
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
      print:function(){openPrint(false);},
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
