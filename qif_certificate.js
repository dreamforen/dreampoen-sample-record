/* DREAMFOREN v120.37.20.0
 * DFEN-QIF-01-02 (00) 자격인정서
 * 원본 세로 A4 양식 기반 웹 작성·직인·연도별 보관·기존파일 업로드
 */
(function dfQif0102Certificate(){
  "use strict";

  var VERSION="v120.37.20.0";
  var TABLE="qif_01_02_records";
  var FILE_TABLE="qif_01_02_files";
  var FOLDER_TABLE="qpf_form_folders";
  var FILE_BUCKET="quality-documents";
  var MAX_FILE_SIZE=50*1024*1024;
  var FOLDER_NUMBER=102;
  var state={
    active:false,
    year:new Date().getFullYear(),
    records:[],
    files:[],
    current:null,
    query:"",
    dirty:false,
    loading:false,
    saving:false,
    fileLoading:false,
    fileBusy:false,
    fileError:"",
    loadToken:0,
    fileLoadToken:0,
    fitView:true,
    fitScale:1,
    fitFrame:0,
    resizeObserver:null
  };

  function byId(id){return document.getElementById(id);}
  function clean(value){return String(value==null?"":value).trim();}
  function escapeHtml(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(character){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character];
    });
  }
  function escapeAttr(value){return escapeHtml(value).replace(/\r?\n/g,"&#10;");}
  function database(){try{return typeof dfSupabase!=="undefined"?dfSupabase:null;}catch(ignore){return null;}}
  function currentUser(){try{return typeof dfCloudUser!=="undefined"?dfCloudUser:null;}catch(ignore){return null;}}
  function currentProfile(){try{return typeof dfCloudProfile!=="undefined"?dfCloudProfile:null;}catch(ignore){return null;}}
  function legacyEdit(){
    var profile=currentProfile();
    var role=clean(profile&&profile.role).toLowerCase();
    var permission=profile&&profile.access_permissions&&profile.access_permissions.quality_edit;
    return !!profile&&(role==="admin"||role==="관리자"||permission===true||permission==="true");
  }
  function canAction(action){return window.DFMenuPermissions?window.DFMenuPermissions.can("certificate",action,legacyEdit()):legacyEdit();}
  function canEdit(){return canAction(state.current&&state.current.id?"update":"create");}
  function diagnostic(level,message,detail){
    try{if(window.DF_DIAG&&typeof window.DF_DIAG[level]==="function")window.DF_DIAG[level]("QIF-01-02",message,detail||"");}catch(ignore){}
  }
  function cloneRecord(record){return JSON.parse(JSON.stringify(record||{}));}
  function isoDate(value){
    var match=clean(value).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    return match?match[1]+"-"+String(Number(match[2])).padStart(2,"0")+"-"+String(Number(match[3])).padStart(2,"0"):"";
  }
  function koreanDate(value){
    var date=isoDate(value);
    if(!date)return "";
    var parts=date.split("-");
    return Number(parts[0])+" 년     "+Number(parts[1])+" 월     "+Number(parts[2])+" 일";
  }
  function dotDate(value){
    var date=isoDate(value);
    return date?date.replace(/-/g,"."):"";
  }
  function formatModified(value){
    if(!value)return "—";
    var date=new Date(value);
    if(Number.isNaN(date.getTime()))return "—";
    return date.toLocaleString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"numeric",minute:"2-digit",hour12:true}).replace(/\. /g,"-").replace(/\.$/,"");
  }
  function formatBytes(value){
    var bytes=Number(value)||0;
    if(bytes<1024)return bytes+" B";
    if(bytes<1024*1024)return (bytes/1024).toFixed(bytes<10240?1:0)+" KB";
    return (bytes/(1024*1024)).toFixed(bytes<10*1024*1024?1:0)+" MB";
  }
  function blankRecord(){
    return {
      id:null,
      record_year:state.year,
      certificate_no:"",
      employee_name:"",
      department:"",
      position_title:"",
      qualification:"",
      recognition_field:"",
      sub_field:"",
      detailed_items:"",
      issue_date:"",
      issuer_name:"주식회사 드림포이엔 대표이사",
      seal_visible:true,
      created_at:"",
      updated_at:""
    };
  }
  function normalizeRecord(record){
    var output=Object.assign(blankRecord(),record||{});
    output.record_year=Number(output.record_year)||state.year;
    output.issue_date=isoDate(output.issue_date);
    output.seal_visible=output.seal_visible!==false;
    return output;
  }
  function migrationMessage(error){
    var message=error&&error.message||String(error||"");
    if(/qif_01_02|schema cache|PGRST205|42P01|does not exist/i.test(message))return "자격인정서 DB 업데이트가 필요합니다. 34_v12037200_qif_01_02_certificate.sql 파일을 실행해주세요.";
    return message||"자료를 불러오지 못했습니다.";
  }
  function setStatus(message,kind){
    var element=byId("qicMessage");
    if(!element)return;
    element.textContent=message||"";
    element.className=kind||"";
  }
  function setFileStatus(message,kind){
    var element=byId("qicFileMessage");
    if(!element)return;
    element.textContent=message||"";
    element.className="qic-file-message"+(kind?" "+kind:"");
  }
  function setHeader(){
    var title=byId("dfDocTitle"),description=byId("dfDocDescription"),back=byId("dfDocBack");
    if(title)title.textContent="DFEN-QIF-01-02 (00) 자격인정서";
    if(description)description.textContent="원본 세로 A4 양식 작성 · 직인 기본 삽입 · 직원별·연도별 작성 및 기존파일 보관";
    if(back)back.textContent="← 작성용 품질문서";
  }
  function fillYearOptions(){
    var select=byId("qicYear");
    if(!select)return;
    var current=new Date().getFullYear(),years=[];
    for(var year=current-10;year<=current+5;year++)years.push(year);
    if(years.indexOf(state.year)<0)years.push(state.year);
    years.sort(function(a,b){return b-a;});
    select.innerHTML=years.map(function(year){return '<option value="'+year+'"'+(year===state.year?' selected':'')+'>'+year+'년</option>';}).join("");
  }
  function ensurePane(){
    var root=byId("dfQualityFormWorkspace");
    if(!root)return null;
    var pane=byId("qifCertificatePane");
    if(pane)return pane;
    pane=document.createElement("section");
    pane.id="qifCertificatePane";
    pane.className="qic-pane";
    pane.hidden=true;
    pane.innerHTML=[
      '<div class="qic-toolbar">',
        '<label>작성 연도<select id="qicYear"></select></label>',
        '<label class="qic-search-label">성명·자격·인정분야 검색<input id="qicSearch" type="search" placeholder="성명 · 부서 · 자격 · 인정분야"></label>',
        '<button type="button" class="qpf-button" id="qicReload">새로고침</button>',
        '<button type="button" class="qpf-button" id="qicNew">+ 새 인정서</button>',
        '<button type="button" class="qpf-button primary" id="qicSave">저장</button>',
        '<button type="button" class="qpf-button danger" id="qicDelete">삭제</button>',
        '<span class="qpf-toolbar-separator" aria-hidden="true"></span>',
        '<button type="button" class="qpf-button" id="qicPreview">미리보기</button>',
        '<button type="button" class="qpf-button" id="qicPrint">인쇄</button>',
        '<button type="button" class="qpf-button active" id="qicFitView" aria-pressed="true">화면 맞춤</button>',
      '</div>',
      '<div class="qic-status"><span id="qicMessage"></span><span id="qicMeta"></span></div>',
      '<div id="qicReadonlyNotice" class="qpf-readonly-notice" hidden>열람 전용 계정입니다. 작성·수정·삭제·파일 업로드는 “품질문서 수정·업로드” 권한이 필요합니다.</div>',
      '<div class="qic-layout">',
        '<aside class="qic-side-stack">',
          '<section class="qic-file-panel">',
            '<div class="qic-record-head"><strong>연도별 업로드 자료</strong><span id="qicFileCount"></span></div>',
            '<div id="qicDropZone" class="qic-drop-zone" tabindex="0" role="button" aria-label="기존 자격인정서 파일 업로드">',
              '<b>파일을 여기에 끌어놓기</b>',
              '<small>또는 클릭하여 여러 파일 선택 · 파일당 최대 50MB</small>',
              '<button type="button" class="qpf-button" id="qicUploadButton">파일 선택</button>',
              '<input id="qicFileInput" type="file" multiple hidden>',
            '</div>',
            '<div id="qicFileMessage" class="qic-file-message"></div>',
            '<div id="qicFileList" class="qic-file-list"></div>',
          '</section>',
          '<section class="qic-record-panel">',
            '<div class="qic-record-head"><strong>웹 작성자료</strong><span id="qicRecordCount"></span></div>',
            '<div id="qicRecordList" class="qic-record-list"></div>',
          '</section>',
        '</aside>',
        '<main class="qic-form-panel"><div class="qic-form-scroll"><div id="qicFormHost"></div></div></main>',
      '</div>'
    ].join("");
    root.appendChild(pane);
    bindEvents();
    fillYearOptions();
    return pane;
  }
  function updatePermissionUi(){
    var editable=canEdit();
    [["qicNew","create"],["qicSave",state.current&&state.current.id?"update":"create"],["qicDelete","delete"]].forEach(function(pair){var button=byId(pair[0]);if(button)button.disabled=!canAction(pair[1]);});
    var uploadable=canAction("upload");
    var uploadButton=byId("qicUploadButton"),fileInput=byId("qicFileInput"),dropZone=byId("qicDropZone");
    if(uploadButton)uploadButton.disabled=!uploadable||state.fileBusy;
    if(fileInput)fileInput.disabled=!uploadable||state.fileBusy;
    if(dropZone){dropZone.classList.toggle("disabled",!uploadable||state.fileBusy);dropZone.setAttribute("aria-disabled",String(!uploadable||state.fileBusy));}
    var notice=byId("qicReadonlyNotice");
    if(notice)notice.hidden=editable;
  }
  function filteredRecords(){
    var query=clean(state.query).toLowerCase();
    return state.records.filter(function(record){
      if(!query)return true;
      return [record.certificate_no,record.employee_name,record.department,record.position_title,record.qualification,record.recognition_field,record.sub_field,record.detailed_items].join(" ").toLowerCase().indexOf(query)>=0;
    });
  }
  function renderRecordList(){
    var host=byId("qicRecordList"),count=byId("qicRecordCount");
    if(!host)return;
    var records=filteredRecords();
    if(count)count.textContent=records.length+"건";
    host.innerHTML=records.length?records.map(function(record){
      var selected=state.current&&record.id===state.current.id;
      return [
        '<button type="button" class="qic-record-item',selected?' selected':'','" data-qic-record="',escapeAttr(record.id),'">',
          '<strong>',escapeHtml(record.employee_name||"성명 미입력"),'</strong>',
          '<span>',escapeHtml([record.qualification,record.recognition_field].filter(Boolean).join(" · ")||"자격 내용 미입력"),'</span>',
          '<small>',escapeHtml((record.certificate_no?"제 "+record.certificate_no+" 호 · ":"")+(dotDate(record.issue_date)||"발행일 미입력")),'</small>',
        '</button>'
      ].join("");
    }).join(""):'<div class="qic-file-empty">선택한 연도에 작성된 자격인정서가 없습니다.</div>';
  }
  function editor(record,field,type,printMode,options){
    options=options||{};
    var value=record[field]||"";
    if(printMode){
      if(type==="date")value=koreanDate(value);
      return '<span class="qic-print-value">'+escapeHtml(value).replace(/\r?\n/g,"<br>")+'</span>';
    }
    if(type==="textarea")return '<textarea class="qic-field-textarea" data-qic-field="'+field+'" aria-label="'+escapeAttr(options.label||field)+'">'+escapeHtml(value)+'</textarea>';
    return '<input class="qic-field-input" data-qic-field="'+field+'" type="'+(type||"text")+'" value="'+escapeAttr(value)+'" aria-label="'+escapeAttr(options.label||field)+'">';
  }
  function formHtml(record,printMode){
    record=normalizeRecord(record);
    return [
      '<div class="qic-form-stage">',
        '<article class="qic-a4-sheet"><div class="qic-sheet-inner">',
          '<img class="qic-logo" src="assets/dreamforen_ci.jpg" alt="드림포이엔">',
          '<div class="qic-number"><span>제</span>',editor(record,"certificate_no","text",printMode,{label:"인정서 번호"}),'<span>호</span></div>',
          '<h2 class="qic-title">자격 인정서</h2>',
          '<div class="qic-field-row qic-name"><span class="qic-field-label">성 명 :</span>',editor(record,"employee_name","text",printMode,{label:"성명"}),'</div>',
          '<div class="qic-field-row qic-department"><span class="qic-field-label">부서명 :</span>',editor(record,"department","text",printMode,{label:"부서명"}),'</div>',
          '<div class="qic-field-row qic-position"><span class="qic-field-label">직 급 :</span>',editor(record,"position_title","text",printMode,{label:"직급"}),'</div>',
          '<div class="qic-field-row qic-qualification"><span class="qic-field-label">자 격 :</span>',editor(record,"qualification","text",printMode,{label:"자격"}),'</div>',
          '<div class="qic-field-row qic-recognition"><span class="qic-field-label">인정분야 :</span>',editor(record,"recognition_field","text",printMode,{label:"인정분야"}),'</div>',
          '<div class="qic-field-row qic-subfield"><span class="qic-field-label">세부분야 :</span>',editor(record,"sub_field","text",printMode,{label:"세부분야"}),'</div>',
          '<div class="qic-field-row qic-details"><span class="qic-field-label">세부항목 :</span>',editor(record,"detailed_items","textarea",printMode,{label:"세부항목"}),'</div>',
          '<div class="qic-certification-text">위 사람은 상기 자격이 인정되었기에 이 증서를 수여합니다.</div>',
          '<div class="qic-issue-date">',printMode?editor(record,"issue_date","date",true,{label:"발행일"}):'<input data-qic-field="issue_date" type="date" value="'+escapeAttr(record.issue_date)+'" aria-label="발행일">','</div>',
          '<div class="qic-issuer">',escapeHtml(record.issuer_name||"주식회사 드림포이엔 대표이사"),'</div>',
          '<span class="qic-seal-label">(직인)</span>',
          record.seal_visible?'<img class="qic-seal" src="assets/qualification_seal.jpg" alt="주식회사 드림포이엔 직인">':'',
          '<footer class="qic-footer"><span>DFEN-QIF-01-02</span><span>Rev. 00</span><i></i><span>A4(210×297mm)</span></footer>',
        '</div></article>',
      '</div>'
    ].join("");
  }
  function scheduleFit(){
    cancelAnimationFrame(state.fitFrame);
    state.fitFrame=requestAnimationFrame(applyFit);
  }
  function applyFit(){
    var host=byId("qicFormHost"),scroll=document.querySelector("#qifCertificatePane .qic-form-scroll");
    if(!host||!scroll)return;
    var stage=host.querySelector(".qic-form-stage"),sheet=host.querySelector(".qic-a4-sheet");
    if(!stage||!sheet)return;
    sheet.style.transform="none";
    var naturalWidth=sheet.offsetWidth||794,naturalHeight=sheet.offsetHeight||1123;
    var available=Math.max(250,scroll.clientWidth-20);
    var scale=state.fitView?Math.min(1,available/naturalWidth):1;
    state.fitScale=scale;
    sheet.style.transformOrigin="top left";
    sheet.style.transform="scale("+scale+")";
    stage.style.width=(naturalWidth*scale)+"px";
    stage.style.height=(naturalHeight*scale)+"px";
    var button=byId("qicFitView");
    if(button){button.classList.toggle("active",state.fitView);button.setAttribute("aria-pressed",String(state.fitView));button.textContent=state.fitView?"화면 맞춤":"원본 크기";}
  }
  function renderForm(){
    updatePermissionUi();
    var host=byId("qicFormHost"),meta=byId("qicMeta");
    if(!host)return;
    if(!state.current)state.current=blankRecord();
    host.innerHTML=formHtml(state.current,false);
    host.querySelectorAll("[data-qic-field]").forEach(function(input){input.disabled=!canEdit();});
    if(meta){
      var source=state.current.id?"저장자료":"새 문서";
      meta.innerHTML=escapeHtml(source+" · "+state.year+"년")+(state.dirty?' <span class="qic-dirty-mark">· 저장 전 변경사항</span>':'');
    }
    scheduleFit();
  }
  function selectRecord(id){
    var record=state.records.find(function(item){return String(item.id)===String(id);});
    if(!record)return;
    if(!confirmDiscard())return;
    state.current=cloneRecord(record);
    state.dirty=false;
    renderRecordList();
    renderForm();
    setStatus("저장된 자격인정서를 불러왔습니다.","ok");
  }
  function newRecord(){
    if(!canAction("create"))return window.alert("품질문서 수정 권한이 없습니다.");
    if(!confirmDiscard())return;
    state.current=blankRecord();
    state.dirty=false;
    renderRecordList();
    renderForm();
    setStatus("새 자격인정서를 작성하세요.","");
  }
  function confirmDiscard(){return !state.dirty||window.confirm("저장하지 않은 변경사항이 있습니다.\n변경사항을 버리고 이동할까요?");}
  function handleInput(target){
    var field=target&&target.dataset&&target.dataset.qicField;
    if(!field||!state.current||!canEdit())return;
    state.current[field]=target.value;
    state.dirty=true;
    var meta=byId("qicMeta");
    if(meta&&!meta.querySelector(".qic-dirty-mark"))meta.insertAdjacentHTML("beforeend",' <span class="qic-dirty-mark">· 저장 전 변경사항</span>');
  }
  async function loadRecords(options){
    options=options||{};
    var db=database(),user=currentUser(),token=++state.loadToken;
    if(!db||!user){
      state.records=[];
      if(!state.current)state.current=blankRecord();
      state.dirty=false;
      renderRecordList();
      renderForm();
      if(!options.quiet)setStatus("로그인 후 작성자료를 확인할 수 있습니다.","warn");
      return;
    }
    state.loading=true;
    if(!options.quiet)setStatus("자격인정서를 불러오는 중입니다…","");
    try{
      var result=await db.from(TABLE).select("*").eq("record_year",state.year).is("archived_at",null).order("issue_date",{ascending:false,nullsFirst:false}).order("updated_at",{ascending:false});
      if(result.error)throw result.error;
      if(token!==state.loadToken)return;
      state.records=(result.data||[]).map(normalizeRecord);
      if(options.keepId){
        var selected=state.records.find(function(item){return String(item.id)===String(options.keepId);});
        if(selected)state.current=cloneRecord(selected);
      }
      if(!state.current||state.current.record_year!==state.year)state.current=state.records.length?cloneRecord(state.records[0]):blankRecord();
      state.dirty=false;
      renderRecordList();renderForm();
      if(!options.quiet)setStatus(state.records.length?state.records.length+"건을 불러왔습니다.":"작성된 자격인정서가 없습니다.",state.records.length?"ok":"");
    }catch(error){
      if(token!==state.loadToken)return;
      console.error("[QIF-01-02-LOAD]",error);
      state.records=[];state.current=blankRecord();state.dirty=false;renderRecordList();renderForm();
      setStatus(migrationMessage(error),"bad");
    }finally{if(token===state.loadToken)state.loading=false;}
  }
  async function saveCurrent(){
    if(state.saving)return;
    if(!canEdit())return window.alert("품질문서 수정 권한이 없습니다.");
    var db=database(),user=currentUser(),record=state.current;
    if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    if(!record)return;
    if(!clean(record.employee_name))return window.alert("성명을 입력해주세요.");
    var payload={
      record_year:state.year,
      certificate_no:clean(record.certificate_no),
      employee_name:clean(record.employee_name),
      department:clean(record.department),
      position_title:clean(record.position_title),
      qualification:clean(record.qualification),
      recognition_field:clean(record.recognition_field),
      sub_field:clean(record.sub_field),
      detailed_items:clean(record.detailed_items),
      issue_date:isoDate(record.issue_date)||null,
      issuer_name:clean(record.issuer_name)||"주식회사 드림포이엔 대표이사",
      seal_visible:record.seal_visible!==false,
      updated_by:user.id
    };
    state.saving=true;setStatus("저장하는 중입니다…","");
    try{
      var result;
      if(record.id){
        var query=db.from(TABLE).update(payload).eq("id",record.id).is("archived_at",null);
        if(record.updated_at)query=query.eq("updated_at",record.updated_at);
        result=await query.select("*");
        if(result.error)throw result.error;
        if(!result.data||result.data.length!==1){await loadRecords({quiet:true});return window.alert("다른 사용자가 먼저 수정했습니다. 최신 자료를 불러왔습니다.");}
        record=result.data[0];
      }else{
        payload.created_by=user.id;
        result=await db.from(TABLE).insert(payload).select("*").single();
        if(result.error)throw result.error;
        record=result.data;
      }
      state.current=normalizeRecord(record);state.dirty=false;
      await touchFolder();
      await loadRecords({quiet:true,keepId:record.id});
      setStatus("자격인정서를 저장했습니다.","ok");
    }catch(error){console.error("[QIF-01-02-SAVE]",error);setStatus("저장 실패 · "+migrationMessage(error),"bad");window.alert("저장하지 못했습니다.\n\n"+migrationMessage(error));}
    finally{state.saving=false;}
  }
  async function deleteCurrent(){
    if(!canAction("delete"))return window.alert("품질문서 수정 권한이 없습니다.");
    var record=state.current;
    if(!record||!record.id){newRecord();return;}
    if(!window.confirm('"'+(record.employee_name||"성명 미입력")+'" 자격인정서를 삭제할까요?\n업로드 보관파일에는 영향을 주지 않습니다.'))return;
    var db=database(),user=currentUser();
    if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    try{
      var query=db.from(TABLE).update({archived_at:new Date().toISOString(),archived_by:user.id,updated_by:user.id}).eq("id",record.id).is("archived_at",null);
      if(record.updated_at)query=query.eq("updated_at",record.updated_at);
      var result=await query.select("id");
      if(result.error)throw result.error;
      if(!result.data||result.data.length!==1){await loadRecords({quiet:true});return window.alert("다른 사용자가 먼저 수정했습니다. 최신 자료를 불러왔습니다.");}
      state.current=null;state.dirty=false;await touchFolder();await loadRecords({quiet:false});setStatus("자격인정서를 삭제했습니다.","ok");
    }catch(error){window.alert("삭제하지 못했습니다.\n\n"+migrationMessage(error));}
  }
  async function touchFolder(){
    var db=database(),user=currentUser();if(!db||!user)return;
    try{var result=await db.from(FOLDER_TABLE).update({updated_by:user.id}).eq("document_number",FOLDER_NUMBER);if(result.error)throw result.error;}catch(error){diagnostic("warn","폴더 수정일 갱신 보류",error&&error.message||error);}
  }
  function safeStorageFileName(name){return (clean(name).normalize("NFKC").replace(/[^0-9A-Za-z._-]+/g,"_").replace(/^_+|_+$/g,"")||"document").slice(-150);}
  function storageId(){try{if(window.crypto&&typeof window.crypto.randomUUID==="function")return window.crypto.randomUUID();}catch(ignore){}return Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,12);}
  function renderFileList(){
    var host=byId("qicFileList"),count=byId("qicFileCount");if(!host)return;
    if(count)count.textContent=state.files.length+"건";
    if(state.fileLoading){host.innerHTML='<div class="qic-file-empty">파일 목록을 불러오는 중입니다…</div>';return;}
    if(state.fileError){host.innerHTML='<div class="qic-file-empty bad">'+escapeHtml(state.fileError)+'</div>';return;}
    host.innerHTML=state.files.length?state.files.map(function(file){return [
      '<article class="qic-file-item" data-qic-file-id="',escapeAttr(file.id),'">',
        '<div class="qic-file-info" title="',escapeAttr(file.file_name),'"><strong>',escapeHtml(file.file_name),'</strong><small>',escapeHtml(formatBytes(file.file_size)),' · ',escapeHtml(formatModified(file.updated_at||file.created_at)),'</small></div>',
        '<div class="qic-file-actions"><button type="button" data-qic-file-preview>미리보기</button><button type="button" data-qic-file-download>받기</button>',(canAction("update")?'<button type="button" data-qic-file-rename>이름</button>':"")+(canAction("delete")?'<button type="button" class="danger" data-qic-file-delete>삭제</button>':""),'</div>',
      '</article>'
    ].join("");}).join(""):'<div class="qic-file-empty">선택한 연도에 업로드된 기존 자료가 없습니다.</div>';
  }
  async function loadFiles(){
    var db=database(),user=currentUser();state.fileError="";
    if(!db||!user){state.files=[];renderFileList();setFileStatus("로그인 후 연도별 기존 자료를 확인할 수 있습니다.","warn");return;}
    state.fileLoading=true;var token=++state.fileLoadToken;renderFileList();setFileStatus("연도별 업로드 자료를 불러오는 중입니다…","");
    try{
      var result=await db.from(FILE_TABLE).select("*").eq("record_year",state.year).is("archived_at",null).order("updated_at",{ascending:false});
      if(result.error)throw result.error;if(token!==state.fileLoadToken)return;
      state.files=result.data||[];setFileStatus(state.files.length?"현재 연도의 기존 자료입니다.":"파일을 끌어놓으면 선택한 연도로 보관됩니다.",state.files.length?"ok":"");
    }catch(error){if(token!==state.fileLoadToken)return;console.error("[QIF-01-02-FILE-LOAD]",error);state.files=[];state.fileError=migrationMessage(error);setFileStatus(state.fileError,"bad");}
    finally{if(token===state.fileLoadToken){state.fileLoading=false;renderFileList();}}
  }
  async function uploadFiles(fileList){
    if(state.fileBusy)return;if(!canAction("upload"))return window.alert("품질문서 업로드 권한이 없습니다.");
    var db=database(),user=currentUser();if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    var incoming=Array.prototype.slice.call(fileList||[]).filter(function(file){return file&&file.name;});if(!incoming.length)return;
    var oversized=incoming.filter(function(file){return Number(file.size)>MAX_FILE_SIZE;});
    var files=incoming.filter(function(file){return Number(file.size)<=MAX_FILE_SIZE;});
    if(oversized.length)window.alert("파일당 최대 용량은 50MB입니다.\n다음 파일은 제외됩니다.\n\n"+oversized.map(function(file){return file.name;}).join("\n"));
    if(!files.length)return;
    var uploadYear=state.year,succeeded=0,failures=[];state.fileBusy=true;updatePermissionUi();
    try{
      for(var index=0;index<files.length;index+=1){
        var file=files[index];setFileStatus((index+1)+"/"+files.length+" 업로드 중 · "+file.name,"");
        var path="qif-01-02/"+uploadYear+"/"+storageId()+"_"+safeStorageFileName(file.name);
        try{
          var uploaded=await db.storage.from(FILE_BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});if(uploaded.error)throw uploaded.error;
          var saved=await db.from(FILE_TABLE).insert({record_year:uploadYear,file_name:file.name,storage_path:path,mime_type:file.type||"application/octet-stream",file_size:Number(file.size)||0,created_by:user.id,updated_by:user.id}).select("*").single();
          if(saved.error){try{await db.storage.from(FILE_BUCKET).remove([path]);}catch(ignore){}throw saved.error;}succeeded+=1;
        }catch(error){failures.push(file.name+" · "+(error&&error.message||error));diagnostic("error","기존자료 업로드 실패",file.name+" / "+(error&&error.message||error));}
      }
      if(succeeded)await touchFolder();if(uploadYear===state.year)await loadFiles();
      if(failures.length){setFileStatus(succeeded+"개 업로드 완료 · "+failures.length+"개 실패","warn");window.alert("일부 파일을 업로드하지 못했습니다.\n\n"+failures.join("\n"));}
      else setFileStatus(succeeded+"개 파일을 "+uploadYear+"년에 업로드했습니다.","ok");
    }finally{state.fileBusy=false;var input=byId("qicFileInput");if(input)input.value="";updatePermissionUi();}
  }
  async function fileBlob(file){
    var db=database();if(!db||!file)throw new Error("파일 정보를 확인하지 못했습니다.");
    var result=await db.storage.from(FILE_BUCKET).download(file.storage_path);if(result.error)throw result.error;return result.data;
  }
  async function previewFile(file){
    var preview=window.DF_QUALITY_FILE_PREVIEW;if(!preview||typeof preview.open!=="function")return window.alert("업로드 자료 미리보기 모듈을 불러오지 못했습니다. qpf_forms.js 파일을 확인해주세요.");
    setFileStatus("미리보기를 준비하는 중입니다 · "+file.file_name,"");
    var ok=await preview.open({name:file.file_name,mime:file.mime_type,size:file.file_size,load:function(){return fileBlob(file);}});
    setFileStatus(ok?"미리보기를 열었습니다 · "+file.file_name:"미리보기를 열지 못했습니다 · "+file.file_name,ok?"ok":"bad");
  }
  async function downloadFile(file){
    setFileStatus("파일을 내려받는 중입니다 · "+file.file_name,"");
    try{var blob=await fileBlob(file),url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=file.file_name||"자격인정서";anchor.style.display="none";document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);setFileStatus("파일을 내려받았습니다 · "+file.file_name,"ok");}
    catch(error){setFileStatus("다운로드 실패 · "+(error&&error.message||error),"bad");window.alert("파일을 내려받지 못했습니다.\n\n"+(error&&error.message||error));}
  }
  async function renameFile(file){
    if(!canAction("update"))return window.alert("품질문서 수정 권한이 없습니다.");var next=window.prompt("목록에 표시할 파일명을 입력해주세요.",file.file_name||"");if(next==null)return;next=clean(next);if(!next)return window.alert("파일명을 입력해주세요.");if(next.length>255)return window.alert("파일명은 255자 이내로 입력해주세요.");if(next===file.file_name)return;
    var db=database(),user=currentUser();if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    try{var query=db.from(FILE_TABLE).update({file_name:next,updated_by:user.id}).eq("id",file.id).is("archived_at",null);if(file.updated_at)query=query.eq("updated_at",file.updated_at);var result=await query.select("*");if(result.error)throw result.error;if(!result.data||result.data.length!==1){await loadFiles();return window.alert("다른 사용자가 먼저 파일정보를 수정했습니다. 최신 목록을 불러왔습니다.");}await touchFolder();await loadFiles();setFileStatus("파일명을 수정했습니다.","ok");}
    catch(error){window.alert("파일명을 수정하지 못했습니다.\n\n"+migrationMessage(error));}
  }
  async function deleteFile(file){
    if(!canAction("delete"))return window.alert("품질문서 수정 권한이 없습니다.");if(!window.confirm('"'+file.file_name+'" 파일을 삭제할까요?\n웹 작성 자격인정서에는 영향을 주지 않습니다.'))return;
    var db=database(),user=currentUser();if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    try{var query=db.from(FILE_TABLE).update({archived_at:new Date().toISOString(),archived_by:user.id,updated_by:user.id}).eq("id",file.id).is("archived_at",null);if(file.updated_at)query=query.eq("updated_at",file.updated_at);var result=await query.select("id");if(result.error)throw result.error;if(!result.data||result.data.length!==1){await loadFiles();return window.alert("다른 사용자가 먼저 파일정보를 수정했습니다. 최신 목록을 불러왔습니다.");}var removed=await db.storage.from(FILE_BUCKET).remove([file.storage_path]);if(removed.error)diagnostic("warn","보관파일 정리 지연",file.storage_path+" / "+removed.error.message);await touchFolder();await loadFiles();setFileStatus("업로드 자료를 삭제했습니다.","ok");}
    catch(error){window.alert("업로드 자료를 삭제하지 못했습니다.\n\n"+migrationMessage(error));}
  }
  async function switchYear(value){
    var next=Number(value);if(!next||next===state.year)return;
    if(!confirmDiscard()){byId("qicYear").value=String(state.year);return;}
    state.year=next;state.query="";byId("qicSearch").value="";state.current=null;state.records=[];state.files=[];state.dirty=false;renderRecordList();renderFileList();renderForm();await Promise.all([loadRecords({quiet:false}),loadFiles()]);
  }
  function toggleFitView(){state.fitView=!state.fitView;scheduleFit();}
  function openPrint(autoPrint){
    if(!state.current)return;
    var baseHref;try{baseHref=new URL(".",document.baseURI).href;}catch(ignore){baseHref="";}
    var cssHref;try{cssHref=new URL("qif_certificate.css?v=120372000",document.baseURI).href;}catch(ignore){cssHref="qif_certificate.css?v=120372000";}
    var record=cloneRecord(state.current),title="DFEN-QIF-01-02 (00) 자격인정서 "+(record.employee_name||"새 문서");
    var html=['<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="',escapeAttr(baseHref),'"><title>',escapeHtml(title),'</title><link rel="stylesheet" href="',escapeAttr(cssHref),'"></head><body class="qic-print-window">','<div class="qic-print-tools"><b>',escapeHtml(title),'</b><button type="button" onclick="window.print()">인쇄 / PDF</button></div>','<main class="qic-print-document">',formHtml(record,true),'</main>',autoPrint?'<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});<\/script>':'','</body></html>'].join("");
    var popup=window.open("","_blank","noopener,noreferrer");
    if(!popup)return window.alert("미리보기 창이 차단되었습니다. 브라우저의 팝업 차단을 해제해주세요.");
    popup.document.open();popup.document.write(html);popup.document.close();
  }
  async function reloadAll(){await Promise.all([loadRecords({quiet:false}),loadFiles()]);}
  function bindEvents(){
    var pane=byId("qifCertificatePane");if(!pane||pane.dataset.bound==="1")return;pane.dataset.bound="1";
    pane.addEventListener("click",function(event){
      var fileItem=event.target.closest("[data-qic-file-id]");
      if(fileItem){var file=state.files.find(function(item){return String(item.id)===String(fileItem.dataset.qicFileId);});if(!file)return;if(event.target.closest("[data-qic-file-preview]")){previewFile(file);return;}if(event.target.closest("[data-qic-file-download]")){downloadFile(file);return;}if(event.target.closest("[data-qic-file-rename]")){renameFile(file);return;}if(event.target.closest("[data-qic-file-delete]")){deleteFile(file);return;}}
      var recordButton=event.target.closest("[data-qic-record]");if(recordButton){selectRecord(recordButton.dataset.qicRecord);return;}
    });
    byId("qicYear").addEventListener("change",function(event){switchYear(event.target.value);});
    byId("qicSearch").addEventListener("input",function(event){state.query=event.target.value;renderRecordList();});
    byId("qicReload").addEventListener("click",function(){if(confirmDiscard())reloadAll();});
    byId("qicNew").addEventListener("click",newRecord);byId("qicSave").addEventListener("click",saveCurrent);byId("qicDelete").addEventListener("click",deleteCurrent);
    byId("qicPreview").addEventListener("click",function(){openPrint(false);});byId("qicPrint").addEventListener("click",function(){openPrint(true);});byId("qicFitView").addEventListener("click",toggleFitView);
    byId("qicUploadButton").addEventListener("click",function(){if(canAction("upload")&&!state.fileBusy)byId("qicFileInput").click();});
    byId("qicFileInput").addEventListener("change",function(event){uploadFiles(event.target.files);});
    var dropZone=byId("qicDropZone");
    dropZone.addEventListener("click",function(event){if(event.target.closest("#qicUploadButton"))return;if(canAction("upload")&&!state.fileBusy)byId("qicFileInput").click();});
    dropZone.addEventListener("keydown",function(event){if((event.key==="Enter"||event.key===" ")&&canAction("upload")&&!state.fileBusy){event.preventDefault();byId("qicFileInput").click();}});
    ["dragenter","dragover"].forEach(function(name){dropZone.addEventListener(name,function(event){event.preventDefault();if(canAction("upload")&&!state.fileBusy)dropZone.classList.add("dragging");});});
    ["dragleave","drop"].forEach(function(name){dropZone.addEventListener(name,function(event){event.preventDefault();dropZone.classList.remove("dragging");});});
    dropZone.addEventListener("drop",function(event){if(canAction("upload")&&!state.fileBusy)uploadFiles(event.dataTransfer&&event.dataTransfer.files);});
    byId("qicFormHost").addEventListener("input",function(event){handleInput(event.target);});byId("qicFormHost").addEventListener("change",function(event){handleInput(event.target);});
    var scroll=document.querySelector("#qifCertificatePane .qic-form-scroll");
    if(typeof ResizeObserver!=="undefined"&&scroll){state.resizeObserver=new ResizeObserver(scheduleFit);state.resizeObserver.observe(scroll);}else window.addEventListener("resize",scheduleFit);
  }
  function open(){
    var pane=ensurePane();
    if(!pane||!window.DF_QPF_FORMS){window.alert("작성용 품질문서 화면을 준비하지 못했습니다. qpf_forms.js 파일을 확인해주세요.");return;}
    window.DF_QPF_FORMS.open();window.DF_QPF_FORMS.state.view="qif-certificate";
    var folders=byId("qpfFolderPane"),ledger=byId("qpfLedgerPane");if(folders)folders.hidden=true;if(ledger)ledger.hidden=true;
    pane.hidden=false;state.active=true;setHeader();fillYearOptions();updatePermissionUi();reloadAll();
  }
  function close(options){options=options||{};var pane=byId("qifCertificatePane");if(pane)pane.hidden=true;state.active=false;if(!options.silent){state.current=null;state.records=[];state.files=[];state.dirty=false;}}
  function init(){
    ensurePane();
    window.DF_QIF_0102={version:VERSION,open:open,close:close,confirmDiscard:confirmDiscard,reload:reloadAll,uploadFiles:uploadFiles,print:function(){openPrint(false);},state:state};
    diagnostic("info","자격인정서 모듈 준비 완료","세로 A4 1쪽 / 직인 / 연도별 보관 / 업로드 미리보기");
  }

  document.addEventListener('df:menu-permissions-changed',function(){
    updatePermissionUi();
    document.querySelectorAll('#qicFormHost [data-qic-field],#qicFormHost [data-qic-score]').forEach(function(input){input.disabled=!canEdit();});
    if(state.active)renderFileList();
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

