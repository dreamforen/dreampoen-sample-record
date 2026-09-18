/* DREAMFOREN v120.37.19.6
 * DFEN-QIF-01-01 (01) 시험담당자 자격 평가표
 * 분석팀 1쪽 / 채취팀 2쪽 세로 A4 원본 양식 기반 웹 작성·연도별 보관·기존파일 업로드
 */
(function dfQif0101Qualification(){
  "use strict";

  var VERSION="v120.37.19.6";
  var TABLE="qif_01_01_records";
  var FILE_TABLE="qif_01_01_files";
  var FOLDER_TABLE="qpf_form_folders";
  var FILE_BUCKET="quality-documents";
  var MAX_FILE_SIZE=50*1024*1024;
  var FOLDER_NUMBER=101;
  var ANALYSIS_ITEMS=[
    {id:"a01",group:"theory",groupLabel:"이 론",label:"검량선의 이해도",max:10},
    {id:"a02",group:"theory",groupLabel:"이 론",label:"내부정도관리의 이해도",max:10},
    {id:"a03",group:"theory",groupLabel:"이 론",label:"시료채취량과 결과값의 이해도",max:10},
    {id:"a04",group:"theory",groupLabel:"이 론",label:"희석의 이해도",max:10},
    {id:"a05",group:"practice",groupLabel:"실 기",label:"검량선 직선성 (0.98이상)",max:10},
    {id:"a06",group:"practice",groupLabel:"실 기",label:"검량선의 검증 (10%이내)<br>- 초기 검증 1 Point선정 후 결과 값<br>- 중간 검증 1 Point선정 후 결과 값",max:10,multiline:true},
    {id:"a07",group:"practice",groupLabel:"실 기",label:"내부정도관리 실시",max:10},
    {id:"a08",group:"practice",groupLabel:"실 기",label:"결과의 산출",max:10},
    {id:"a09",group:"practice",groupLabel:"실 기",label:"Run Record 작성 확인",max:10},
    {id:"a10",group:"practice",groupLabel:"실 기",label:"결과의 보고",max:10}
  ];
  var SAMPLING_ITEMS=[
    {id:"s01",group:"ready",groupLabel:"1. 측정 준비<br>( 10점 )",label:"안전장비 착용 방법 숙지",max:5},
    {id:"s02",group:"ready",groupLabel:"1. 측정 준비<br>( 10점 )",label:"각 안전장비 (안전모, 안전화, 각반 등) 의 역할 이해",max:5},
    {id:"s03",group:"equipment",groupLabel:"2. 측정 장비<br>점검<br>( 30점 )",label:"임핀저 및 연결관 상태 확인",max:5},
    {id:"s04",group:"equipment",groupLabel:"2. 측정 장비<br>점검<br>( 30점 )",label:"샘플러 정상 작동 및 수평 확인",max:5},
    {id:"s05",group:"equipment",groupLabel:"2. 측정 장비<br>점검<br>( 30점 )",label:"펌프 오일 체크 및 상태 확인",max:5},
    {id:"s06",group:"equipment",groupLabel:"2. 측정 장비<br>점검<br>( 30점 )",label:"저울의 설치 및 수평 확인",max:5},
    {id:"s07",group:"equipment",groupLabel:"2. 측정 장비<br>점검<br>( 30점 )",label:"프로브 동·정압 라인 및 방향 확인",max:5},
    {id:"s08",group:"equipment",groupLabel:"2. 측정 장비<br>점검<br>( 30점 )",label:"노즐 결합 및 방향 확인",max:5},
    {id:"s09",group:"leak",groupLabel:"3. 누출 확인<br>( 20점 )",label:"샘플러 유량계 및 유량 지시 값 멈춤 확인",max:5},
    {id:"s10",group:"leak",groupLabel:"3. 누출 확인<br>( 20점 )",label:"임핀저 버블링 확인",max:5},
    {id:"s11",group:"leak",groupLabel:"3. 누출 확인<br>( 20점 )",label:"누출 시 대응방법 숙지",max:10},
    {id:"s12",group:"sampling",groupLabel:"4. 채취 과정<br>( 30점 )",label:"가스분석기 작동 및 5분 간격 3회 출력 확인",max:5},
    {id:"s13",group:"sampling",groupLabel:"4. 채취 과정<br>( 30점 )",label:"사각 및 원형 굴뚝에 따른 측정점 산정",max:2},
    {id:"s14",group:"sampling",groupLabel:"4. 채취 과정<br>( 30점 )",label:"측정점 산정에 따른 측정공 길이와 프로브 삽입 위치에 따른 이해도",max:5,multiline:true},
    {id:"s15",group:"sampling",groupLabel:"4. 채취 과정<br>( 30점 )",label:"프로브 삽입 및 수평 상태 확인",max:2},
    {id:"s16",group:"sampling",groupLabel:"4. 채취 과정<br>( 30점 )",label:"프로브 가열 (120 ± 14 ℃) 숙지",max:3},
    {id:"s17",group:"sampling",groupLabel:"4. 채취 과정<br>( 30점 )",label:"임핀저 및 연결관 연결상태 버블링 확인",max:3},
    {id:"s18",group:"sampling",groupLabel:"4. 채취 과정<br>( 30점 )",label:"분석 시료별 변경되는 시간 및 과정에 대한 이해",max:10,multiline:true},
    {id:"s19",group:"recovery-a",groupLabel:"5. 시료 회수<br>및 정리<br>( 10점 )",label:"여과지 삽입 및 해체 숙련도",max:2},
    {id:"s20",group:"recovery-b",groupLabel:"5. 시료 회수<br>및 정리<br>( 10점 )",label:"먼지 여지 적정법에 따른 이해도",max:2},
    {id:"s21",group:"recovery-b",groupLabel:"5. 시료 회수<br>및 정리<br>( 10점 )",label:"시료 채취 기록부의 작성 및 숙련도",max:3},
    {id:"s22",group:"recovery-b",groupLabel:"5. 시료 회수<br>및 정리<br>( 10점 )",label:"시료 인수인계 과정의 정확도",max:3}
  ];
  var state={
    active:false,
    team:"analysis",
    year:new Date().getFullYear(),
    records:[],
    files:[],
    current:null,
    query:"",
    resultFilter:"all",
    dirty:false,
    loading:false,
    fileLoading:false,
    fileBusy:false,
    fileError:"",
    saving:false,
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
    return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function escapeAttr(value){return escapeHtml(value).replace(/\r?\n/g,"&#10;");}
  function database(){try{return typeof dfSupabase!=="undefined"?dfSupabase:null;}catch(ignore){return null;}}
  function currentUser(){try{return typeof dfCloudUser!=="undefined"?dfCloudUser:null;}catch(ignore){return null;}}
  function currentProfile(){try{return typeof dfCloudProfile!=="undefined"?dfCloudProfile:null;}catch(ignore){return null;}}
  function canEdit(){
    var profile=currentProfile();
    var role=clean(profile&&profile.role).toLowerCase();
    var permission=profile&&profile.access_permissions&&profile.access_permissions.quality_edit;
    return !!profile&&(role==="admin"||role==="관리자"||permission===true||permission==="true");
  }
  function itemsFor(team){return team==="sampling"?SAMPLING_ITEMS:ANALYSIS_ITEMS;}
  function teamLabel(team){return team==="sampling"?"채취팀":"분석팀";}
  function defaultEmployeeTeam(team){return team==="analysis"?"분석팀":"";}
  function diagnostic(level,message,detail){
    try{
      if(window.DF_DIAG&&typeof window.DF_DIAG[level]==="function")window.DF_DIAG[level]("QIF-01-01",message,detail||"");
    }catch(ignore){}
  }
  function setStatus(message,kind){
    var el=byId("qifMessage");
    if(!el)return;
    el.textContent=message||"";
    el.className=kind||"";
  }
  function migrationMessage(error){
    var message=error&&error.message||String(error||"");
    if(/qif_01_01_files/i.test(message)){
      return "연도별 업로드 DB 업데이트가 필요합니다. 33_v12037195_qif_01_01_files.sql 파일을 실행해주세요.";
    }
    if(/qif_01_01|does not exist|schema cache|PGRST205|42P01/i.test(message)){
      return "시험담당자 자격 평가표 DB 업데이트가 필요합니다. 32_v12037194_qif_01_01_qualification.sql 파일을 실행해주세요.";
    }
    return message||"자료를 불러오지 못했습니다.";
  }
  function isoDate(value){
    var match=clean(value).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if(!match)return "";
    return match[1]+"-"+String(Number(match[2])).padStart(2,"0")+"-"+String(Number(match[3])).padStart(2,"0");
  }
  function dotDate(value){
    var iso=isoDate(value);
    return iso?iso.replace(/-/g,"."):"";
  }
  function koreanDate(value){
    var iso=isoDate(value);
    if(!iso)return "";
    var parts=iso.split("-");
    return parts[0]+"년  "+parts[1]+"월  "+parts[2]+"일";
  }
  function formatModified(value){
    if(!value)return "—";
    var date=new Date(value);
    if(Number.isNaN(date.getTime()))return "—";
    return date.toLocaleString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  }
  function formatBytes(value){
    var bytes=Number(value)||0;
    if(bytes<1024)return bytes+" B";
    if(bytes<1024*1024)return (bytes/1024).toFixed(bytes<10240?1:0)+" KB";
    return (bytes/1024/1024).toFixed(bytes<10*1024*1024?1:0)+" MB";
  }
  function cloneRecord(record){
    var copy=Object.assign({},record||{});
    copy.scores=Object.assign({},record&&record.scores||{});
    return copy;
  }
  function blankRecord(team){
    return {
      id:null,
      _new:true,
      team_type:team,
      record_year:state.year,
      employee_team:defaultEmployeeTeam(team),
      employee_name:"",
      hire_date:"",
      birth_date:"",
      evaluation_period:"",
      approval_primary:"",
      approval_technical:"",
      scores:{},
      total_score:0,
      result_status:"draft",
      opinion:"",
      evaluation_date:"",
      evaluator_name:team==="analysis"?"하 준 명":"",
      updated_at:""
    };
  }
  function normalizedRecord(raw){
    var record=cloneRecord(raw);
    record._new=!record.id;
    record.team_type=record.team_type==="sampling"?"sampling":"analysis";
    record.record_year=Number(record.record_year)||state.year;
    record.employee_team=clean(record.employee_team);
    record.employee_name=clean(record.employee_name);
    record.hire_date=isoDate(record.hire_date);
    record.birth_date=isoDate(record.birth_date);
    record.evaluation_period=clean(record.evaluation_period);
    record.approval_primary=clean(record.approval_primary);
    record.approval_technical=clean(record.approval_technical);
    record.opinion=String(record.opinion||"");
    record.evaluation_date=isoDate(record.evaluation_date);
    record.evaluator_name=clean(record.evaluator_name);
    record.scores=record.scores&&typeof record.scores==="object"?Object.assign({},record.scores):{};
    recalculate(record);
    return record;
  }
  function recalculate(record){
    var items=itemsFor(record.team_type);
    var total=0,filled=0;
    items.forEach(function(item){
      var raw=record.scores[item.id];
      if(raw===""||raw==null)return;
      var value=Number(raw);
      if(!Number.isFinite(value))return;
      value=Math.max(0,Math.min(item.max,value));
      record.scores[item.id]=value;
      total+=value;
      filled+=1;
    });
    record.total_score=Math.round(total*100)/100;
    record.result_status=filled===items.length?(record.total_score>=80?"pass":"fail"):"draft";
    return record;
  }
  function confirmDiscard(){
    return !state.dirty||window.confirm("저장하지 않은 시험담당자 자격 평가표 변경사항이 있습니다.\n변경사항을 버리고 이동할까요?");
  }
  function markDirty(){
    state.dirty=true;
    if(state.current)state.current._dirty=true;
    setStatus("저장하지 않은 변경사항이 있습니다.","warn");
  }

  function fillYearOptions(){
    var select=byId("qifYear");
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
  function ensurePane(){
    var root=byId("dfQualityFormWorkspace");
    if(!root)return null;
    var pane=byId("qifQualificationPane");
    if(pane)return pane;
    pane=document.createElement("section");
    pane.id="qifQualificationPane";
    pane.className="qif-pane";
    pane.hidden=true;
    pane.innerHTML=[
      '<div class="qif-toolbar">',
        '<label>작성 연도<select id="qifYear"></select></label>',
        '<div class="qif-team-switch" role="group" aria-label="평가표 구분">',
          '<button type="button" data-qif-team="analysis">분석팀</button>',
          '<button type="button" data-qif-team="sampling">채취팀</button>',
        '</div>',
        '<label class="qif-search-label">직원·평가기간 검색<input id="qifSearch" type="search" placeholder="성명 · 소속 · 평가기간"></label>',
        '<label>상태<select id="qifResultFilter"><option value="all">전체</option><option value="pass">합격</option><option value="fail">불합격</option><option value="draft">작성 중</option></select></label>',
        '<button type="button" class="qpf-button" id="qifReload">새로고침</button>',
        '<button type="button" class="qpf-button" id="qifNew">+ 새 평가표</button>',
        '<button type="button" class="qpf-button primary" id="qifSave">저장</button>',
        '<button type="button" class="qpf-button danger" id="qifDelete">삭제</button>',
        '<span class="qpf-toolbar-separator" aria-hidden="true"></span>',
        '<button type="button" class="qpf-button" id="qifPreview">미리보기</button>',
        '<button type="button" class="qpf-button" id="qifPrint">인쇄</button>',
        '<button type="button" class="qpf-button active" id="qifFitView" aria-pressed="true">화면 맞춤</button>',
      '</div>',
      '<div class="qif-status"><span id="qifMessage"></span><span id="qifMeta"></span></div>',
      '<div id="qifReadonlyNotice" class="qpf-readonly-notice" hidden>열람 전용 계정입니다. 작성·수정·삭제·파일 업로드는 “품질문서 수정·업로드” 권한이 필요합니다.</div>',
      '<div class="qif-layout">',
        '<aside class="qif-side-stack">',
          '<section class="qif-file-panel">',
            '<div class="qif-record-head"><strong id="qifFileHeading">연도별 업로드 자료</strong><span id="qifFileCount"></span></div>',
            '<div id="qifDropZone" class="qif-drop-zone" tabindex="0" role="button" aria-label="기존 품질문서 파일 업로드">',
              '<b>파일을 여기에 끌어놓기</b>',
              '<small>또는 클릭하여 여러 파일 선택 · 파일당 최대 50MB</small>',
              '<button type="button" class="qpf-button" id="qifUploadButton">파일 선택</button>',
              '<input id="qifFileInput" type="file" multiple hidden>',
            '</div>',
            '<div id="qifFileMessage" class="qif-file-message"></div>',
            '<div id="qifFileList" class="qif-file-list"></div>',
          '</section>',
          '<section class="qif-record-panel">',
            '<div class="qif-record-head"><strong>웹 작성자료</strong><span id="qifRecordCount"></span></div>',
            '<div id="qifRecordList" class="qif-record-list"></div>',
          '</section>',
        '</aside>',
        '<main class="qif-form-panel"><div class="qif-form-scroll"><div id="qifFormHost"></div></div></main>',
      '</div>'
    ].join("");
    root.appendChild(pane);
    bindEvents();
    fillYearOptions();
    return pane;
  }
  function setHeader(){
    var title=byId("dfDocTitle");
    var description=byId("dfDocDescription");
    var back=byId("dfDocBack");
    if(title)title.textContent="DFEN-QIF-01-01 (01) 시험담당자 자격 평가표";
    if(description)description.textContent="분석팀·채취팀 원본 양식 작성 · 세로 A4 · 직원별·연도별 작성 및 기존파일 보관";
    if(back)back.textContent="← 작성용 품질문서";
  }
  function updatePermissionUi(){
    var editable=canEdit();
    ["qifNew","qifSave","qifDelete"].forEach(function(id){var button=byId(id);if(button)button.disabled=!editable;});
    var uploadButton=byId("qifUploadButton");
    if(uploadButton)uploadButton.disabled=!editable||state.fileBusy;
    var fileInput=byId("qifFileInput");
    if(fileInput)fileInput.disabled=!editable||state.fileBusy;
    var dropZone=byId("qifDropZone");
    if(dropZone){
      dropZone.classList.toggle("disabled",!editable||state.fileBusy);
      dropZone.setAttribute("aria-disabled",String(!editable||state.fileBusy));
    }
    var notice=byId("qifReadonlyNotice");
    if(notice)notice.hidden=editable;
  }
  function updateTeamUi(){
    document.querySelectorAll("#qifQualificationPane [data-qif-team]").forEach(function(button){
      var active=button.dataset.qifTeam===state.team;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
  }
  function filteredRecords(){
    var query=clean(state.query).toLowerCase();
    return state.records.filter(function(record){
      if(state.resultFilter!=="all"&&record.result_status!==state.resultFilter)return false;
      if(!query)return true;
      return [record.employee_name,record.employee_team,record.evaluation_period,record.evaluation_date,record.evaluator_name]
        .join(" ").toLowerCase().indexOf(query)>=0;
    });
  }
  function resultLabel(status){
    return status==="pass"?"합격":status==="fail"?"불합격":"작성 중";
  }
  function renderRecordList(){
    var host=byId("qifRecordList");
    if(!host)return;
    var records=filteredRecords();
    host.innerHTML=records.length?records.map(function(record){
      var selected=state.current&&record.id===state.current.id;
      return [
        '<button type="button" class="qif-record-item',selected?' selected':'','" data-qif-record="',escapeAttr(record.id),'">',
          '<span class="qif-record-title"><b>',escapeHtml(record.employee_name||"성명 미입력"),'</b><em class="',escapeAttr(record.result_status),'">',resultLabel(record.result_status),'</em></span>',
          '<span>',escapeHtml(record.employee_team||teamLabel(record.team_type)),' · ',escapeHtml(record.evaluation_date?dotDate(record.evaluation_date):(record.evaluation_period||"평가일 미입력")),'</span>',
          '<small>',escapeHtml(String(record.total_score||0)),' / 100점 · 수정 ',escapeHtml(formatModified(record.updated_at)),'</small>',
        '</button>'
      ].join("");
    }).join(""):'<div class="qif-record-empty">해당 조건의 작성자료가 없습니다.</div>';
    var count=byId("qifRecordCount");
    if(count)count.textContent=records.length+"건";
    var meta=byId("qifMeta");
    if(meta)meta.textContent=state.year+"년 · "+teamLabel(state.team)+" · 전체 "+state.records.length+"건";
  }
  function setFileStatus(message,kind){
    var el=byId("qifFileMessage");
    if(!el)return;
    el.textContent=message||"";
    el.className="qif-file-message "+(kind||"");
  }
  function renderFileList(){
    var host=byId("qifFileList");
    if(!host)return;
    var heading=byId("qifFileHeading");
    if(heading)heading.textContent=state.year+"년 "+teamLabel(state.team)+" 업로드 자료";
    var count=byId("qifFileCount");
    if(count)count.textContent=state.files.length+"개";
    if(state.fileLoading){
      host.innerHTML='<div class="qif-file-empty">업로드 자료를 불러오는 중입니다…</div>';
      return;
    }
    if(state.fileError){
      host.innerHTML='<div class="qif-file-empty bad">'+escapeHtml(state.fileError)+'</div>';
      return;
    }
    host.innerHTML=state.files.length?state.files.map(function(file){
      return [
        '<article class="qif-file-item" data-qif-file-id="',escapeAttr(file.id),'">',
          '<div class="qif-file-info" title="',escapeAttr(file.file_name),'">',
            '<strong>',escapeHtml(file.file_name),'</strong>',
            '<small>',escapeHtml(formatBytes(file.file_size)),' · ',escapeHtml(formatModified(file.updated_at||file.created_at)),'</small>',
          '</div>',
          '<div class="qif-file-actions">',
            '<button type="button" data-qif-file-download>받기</button>',
            canEdit()?'<button type="button" data-qif-file-rename>이름</button><button type="button" class="danger" data-qif-file-delete>삭제</button>':"",
          '</div>',
        '</article>'
      ].join("");
    }).join(""):'<div class="qif-file-empty">선택한 연도·팀에 업로드된 기존 자료가 없습니다.</div>';
  }
  function safeStorageFileName(name){
    var safe=clean(name).normalize("NFKC").replace(/[^0-9A-Za-z._-]+/g,"_").replace(/^_+|_+$/g,"");
    return (safe||"document").slice(-150);
  }
  function storageId(){
    try{
      if(window.crypto&&typeof window.crypto.randomUUID==="function")return window.crypto.randomUUID();
    }catch(ignore){}
    return Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,12);
  }
  async function loadFiles(){
    var db=database(),user=currentUser();
    state.fileError="";
    if(!db||!user){
      state.files=[];
      renderFileList();
      setFileStatus("로그인 후 연도별 기존 자료를 확인할 수 있습니다.","warn");
      return;
    }
    state.fileLoading=true;
    var token=++state.fileLoadToken;
    renderFileList();
    setFileStatus("연도별 업로드 자료를 불러오는 중입니다…","");
    try{
      var result=await db.from(FILE_TABLE).select("*")
        .eq("record_year",state.year)
        .eq("team_type",state.team)
        .is("archived_at",null)
        .order("updated_at",{ascending:false});
      if(result.error)throw result.error;
      if(token!==state.fileLoadToken)return;
      state.files=result.data||[];
      setFileStatus(state.files.length?"현재 연도·팀의 기존 자료입니다.":"파일을 끌어놓으면 선택한 연도·팀으로 보관됩니다.",state.files.length?"ok":"");
    }catch(error){
      if(token!==state.fileLoadToken)return;
      console.error("[QIF-01-01-FILE-LOAD]",error);
      state.files=[];
      state.fileError=migrationMessage(error);
      setFileStatus(state.fileError,"bad");
    }finally{
      if(token===state.fileLoadToken){
        state.fileLoading=false;
        renderFileList();
      }
    }
  }
  async function uploadFiles(fileList){
    if(state.fileBusy)return;
    if(!canEdit())return window.alert("품질문서 수정·업로드 권한이 없습니다.");
    var db=database(),user=currentUser();
    if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    var incoming=Array.prototype.slice.call(fileList||[]).filter(function(file){return file&&file.name;});
    if(!incoming.length)return;
    var oversized=incoming.filter(function(file){return Number(file.size)>MAX_FILE_SIZE;});
    var files=incoming.filter(function(file){return Number(file.size)<=MAX_FILE_SIZE;});
    if(oversized.length){
      window.alert("파일당 최대 용량은 50MB입니다.\n다음 파일은 제외됩니다.\n\n"+oversized.map(function(file){return file.name;}).join("\n"));
    }
    if(!files.length)return;
    var uploadYear=state.year,uploadTeam=state.team;
    var succeeded=0,failures=[];
    state.fileBusy=true;
    updatePermissionUi();
    try{
      for(var index=0;index<files.length;index+=1){
        var file=files[index];
        setFileStatus((index+1)+"/"+files.length+" 업로드 중 · "+file.name,"");
        var path="qif-01-01/"+uploadYear+"/"+uploadTeam+"/"+storageId()+"_"+safeStorageFileName(file.name);
        try{
          var uploaded=await db.storage.from(FILE_BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
          if(uploaded.error)throw uploaded.error;
          var saved=await db.from(FILE_TABLE).insert({
            record_year:uploadYear,
            team_type:uploadTeam,
            file_name:file.name,
            storage_path:path,
            mime_type:file.type||"application/octet-stream",
            file_size:Number(file.size)||0,
            created_by:user.id,
            updated_by:user.id
          }).select("*").single();
          if(saved.error){
            try{await db.storage.from(FILE_BUCKET).remove([path]);}catch(ignore){}
            throw saved.error;
          }
          succeeded+=1;
        }catch(error){
          failures.push(file.name+" · "+(error&&error.message||error));
          diagnostic("error","기존자료 업로드 실패",file.name+" / "+(error&&error.message||error));
        }
      }
      if(succeeded)await touchFolder();
      if(uploadYear===state.year&&uploadTeam===state.team)await loadFiles();
      if(failures.length){
        setFileStatus(succeeded+"개 업로드 완료 · "+failures.length+"개 실패","warn");
        window.alert("일부 파일을 업로드하지 못했습니다.\n\n"+failures.join("\n"));
      }else{
        setFileStatus(succeeded+"개 파일을 "+uploadYear+"년 "+teamLabel(uploadTeam)+"에 업로드했습니다.","ok");
      }
    }finally{
      state.fileBusy=false;
      var input=byId("qifFileInput");
      if(input)input.value="";
      updatePermissionUi();
    }
  }
  async function downloadFile(file){
    var db=database();
    if(!db||!file)return;
    setFileStatus("파일을 내려받는 중입니다 · "+file.file_name,"");
    try{
      var result=await db.storage.from(FILE_BUCKET).download(file.storage_path);
      if(result.error)throw result.error;
      var url=URL.createObjectURL(result.data);
      var anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=file.file_name||"품질문서";
      anchor.style.display="none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},30000);
      setFileStatus("파일을 내려받았습니다 · "+file.file_name,"ok");
    }catch(error){
      setFileStatus("다운로드 실패 · "+(error&&error.message||error),"bad");
      window.alert("파일을 내려받지 못했습니다.\n\n"+(error&&error.message||error));
    }
  }
  async function renameFile(file){
    if(!canEdit())return window.alert("품질문서 수정 권한이 없습니다.");
    var next=window.prompt("목록에 표시할 파일명을 입력해주세요.",file.file_name||"");
    if(next==null)return;
    next=clean(next);
    if(!next)return window.alert("파일명을 입력해주세요.");
    if(next.length>255)return window.alert("파일명은 255자 이내로 입력해주세요.");
    if(next===file.file_name)return;
    var db=database(),user=currentUser();
    if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    try{
      var query=db.from(FILE_TABLE).update({file_name:next,updated_by:user.id}).eq("id",file.id).is("archived_at",null);
      if(file.updated_at)query=query.eq("updated_at",file.updated_at);
      var result=await query.select("*");
      if(result.error)throw result.error;
      if(!result.data||result.data.length!==1){
        await loadFiles();
        return window.alert("다른 사용자가 먼저 파일정보를 수정했습니다. 최신 목록을 불러왔습니다.");
      }
      await touchFolder();
      await loadFiles();
      setFileStatus("파일명을 수정했습니다.","ok");
    }catch(error){
      window.alert("파일명을 수정하지 못했습니다.\n\n"+migrationMessage(error));
    }
  }
  async function deleteFile(file){
    if(!canEdit())return window.alert("품질문서 수정 권한이 없습니다.");
    if(!window.confirm('"'+file.file_name+'" 파일을 삭제할까요?\n웹 작성 평가표에는 영향을 주지 않습니다.'))return;
    var db=database(),user=currentUser();
    if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    try{
      var query=db.from(FILE_TABLE).update({
        archived_at:new Date().toISOString(),archived_by:user.id,updated_by:user.id
      }).eq("id",file.id).is("archived_at",null);
      if(file.updated_at)query=query.eq("updated_at",file.updated_at);
      var result=await query.select("id");
      if(result.error)throw result.error;
      if(!result.data||result.data.length!==1){
        await loadFiles();
        return window.alert("다른 사용자가 먼저 파일정보를 수정했습니다. 최신 목록을 불러왔습니다.");
      }
      var removed=await db.storage.from(FILE_BUCKET).remove([file.storage_path]);
      if(removed.error)diagnostic("warn","보관파일 정리 지연",file.storage_path+" / "+removed.error.message);
      await touchFolder();
      await loadFiles();
      setFileStatus("업로드 자료를 삭제했습니다.","ok");
    }catch(error){
      window.alert("업로드 자료를 삭제하지 못했습니다.\n\n"+migrationMessage(error));
    }
  }
  function editor(record,field,type,printMode,options){
    options=options||{};
    var value=record[field]||"";
    if(printMode){
      var output=type==="date"?dotDate(value):String(value||"");
      if(options.koreanDate)output=koreanDate(value);
      return '<span class="qif-print-value '+(options.className||"")+'">'+escapeHtml(output).replace(/\r?\n/g,"<br>")+"</span>";
    }
    return '<input class="qif-cell-input '+(options.className||"")+'" type="'+(type||"text")+'" data-qif-field="'+field+'" value="'+escapeAttr(value)+'"'+(options.placeholder?' placeholder="'+escapeAttr(options.placeholder)+'"':"")+(canEdit()?"":" disabled")+'>';
  }
  function scoreEditor(record,item,printMode){
    var value=record.scores[item.id];
    value=value==null?"":value;
    if(printMode)return '<span class="qif-print-value qif-score-value">'+escapeHtml(value)+"</span>";
    return '<input class="qif-score-input" type="number" min="0" max="'+item.max+'" step="1" inputmode="numeric" data-qif-score="'+item.id+'" value="'+escapeAttr(value)+'" aria-label="'+escapeAttr(item.label.replace(/<br>/g," "))+' 점수"'+(canEdit()?"":" disabled")+'>';
  }
  function approvalTable(record,printMode){
    var primary=record.team_type==="sampling"?"측정책임자":"분석책임자";
    return [
      '<table class="qif-approval"><tbody><tr>',
        '<th class="qif-approval-label" rowspan="2"><span>결</span><span>재</span></th>',
        '<th>',primary,'</th><th>기술책임자</th>',
      '</tr><tr>',
        '<td>',editor(record,"approval_primary","text",printMode),'</td>',
        '<td>',editor(record,"approval_technical","text",printMode),'</td>',
      '</tr></tbody></table>'
    ].join("");
  }
  function pageHeader(record,printMode){
    var title=record.team_type==="sampling"?"시험담당자 자격 평가표 (채취팀)":"시험담당자 자격 평가표 [분석팀]";
    return [
      '<header class="qif-doc-header">',
        '<img class="qif-logo" src="assets/dreamforen_ci.jpg" alt="드림포이엔">',
        '<h2>',title,'</h2>',
        approvalTable(record,printMode),
      '</header>'
    ].join("");
  }
  function personalTable(record,printMode){
    return [
      '<section class="qif-personal-block">',
        '<h3><span></span>인적사항</h3>',
        '<table class="qif-personal"><tbody>',
          '<tr><th>소 속</th><td>',editor(record,"employee_team","text",printMode),'</td><th>성 명</th><td>',editor(record,"employee_name","text",printMode),'</td></tr>',
          '<tr><th>입 사 일</th><td>',editor(record,"hire_date","date",printMode),'</td><th>생년월일</th><td>',editor(record,"birth_date","date",printMode),'</td></tr>',
          '<tr><th>평가기간</th><td colspan="3">',editor(record,"evaluation_period","text",printMode),'</td></tr>',
        '</tbody></table>',
      '</section>'
    ].join("");
  }
  function groupRows(items,record,printMode,options){
    options=options||{};
    var counts={};
    items.forEach(function(item){counts[item.group]=(counts[item.group]||0)+1;});
    var seen={};
    return items.map(function(item){
      var groupCell="";
      if(!seen[item.group]){
        seen[item.group]=true;
        var groupLabel=item.groupLabel;
        groupCell='<td class="qif-group-cell" rowspan="'+counts[item.group]+'">'+groupLabel+"</td>";
      }
      return [
        '<tr class="',item.multiline?'qif-item-multiline':'qif-item-compact','">',
          groupCell,
          '<td class="qif-item-label">',item.label,'</td>',
          '<td class="qif-max-score">',item.max,'</td>',
          '<td class="qif-score-cell">',scoreEditor(record,item,printMode),'</td>',
        '</tr>'
      ].join("");
    }).join("");
  }
  function evaluationTable(items,record,printMode,options){
    options=options||{};
    return [
      '<table class="qif-evaluation ',options.className||'','"><colgroup><col class="qif-col-group"><col class="qif-col-item"><col class="qif-col-max"><col class="qif-col-score"></colgroup>',
      options.header===false?"":'<thead><tr><th>구분</th><th>항목</th><th>배점</th><th>점수</th></tr></thead>',
      '<tbody>',groupRows(items,record,printMode,options),'</tbody></table>'
    ].join("");
  }
  function totalRow(record){
    return [
      '<table class="qif-total-table"><tbody><tr>',
        '<th colspan="2">합 계<br><small>(80점 이상 합격)</small></th>',
        '<td class="qif-total-max">100</td>',
        '<td id="qifTotalScore">',escapeHtml(record.total_score||0),'</td>',
      '</tr></tbody></table>'
    ].join("");
  }
  function resultTable(record,printMode){
    return [
      '<table class="qif-result-table"><tbody>',
        '<tr><th>평가의견</th><td colspan="3">',editor(record,"opinion","text",printMode),'</td></tr>',
        '<tr><th>평가일자</th><td>',editor(record,"evaluation_date","date",printMode,{koreanDate:true}),'</td><th>평가자</th><td class="qif-evaluator-cell">',editor(record,"evaluator_name","text",printMode),'<span>(인)</span></td></tr>',
      '</tbody></table>'
    ].join("");
  }
  function pageFooter(){
    return [
      '<footer class="qif-form-footer"><span>DFEN-QI-01-01</span><span>Rev. 01</span><i></i><span>A4(210×297mm)</span></footer>'
    ].join("");
  }
  function analysisForm(record,printMode){
    return [
      '<article class="qif-a4-sheet qif-analysis-sheet">',
        '<div class="qif-sheet-inner">',
          pageHeader(record,printMode),
          personalTable(record,printMode),
          '<section class="qif-evaluation-block"><h3><span></span>평가항목</h3>',
            evaluationTable(ANALYSIS_ITEMS,record,printMode,{className:"qif-analysis-evaluation"}),
            totalRow(record),
          '</section>',
          '<section class="qif-result-block">',resultTable(record,printMode),'</section>',
          pageFooter(),
        '</div>',
      '</article>'
    ].join("");
  }
  function samplingForm(record,printMode){
    var first=SAMPLING_ITEMS.slice(0,19);
    var second=SAMPLING_ITEMS.slice(19);
    return [
      '<article class="qif-a4-sheet qif-sampling-sheet qif-sampling-page-one">',
        '<div class="qif-sheet-inner">',
          pageHeader(record,printMode),
          personalTable(record,printMode),
          '<section class="qif-evaluation-block"><h3><span></span>평가항목</h3>',
            evaluationTable(first,record,printMode,{className:"qif-sampling-evaluation"}),
          '</section>',
          pageFooter(),
        '</div>',
      '</article>',
      '<article class="qif-a4-sheet qif-sampling-sheet qif-sampling-page-two">',
        '<div class="qif-sheet-inner">',
          '<section class="qif-continuation-block">',
            evaluationTable(second,record,printMode,{className:"qif-sampling-continuation",header:false}),
            totalRow(record),
            resultTable(record,printMode),
          '</section>',
          pageFooter(),
        '</div>',
      '</article>'
    ].join("");
  }
  function formHtml(record,printMode){
    return record.team_type==="sampling"?samplingForm(record,printMode):analysisForm(record,printMode);
  }
  function wrapScreenPages(){
    var host=byId("qifFormHost");
    if(!host)return;
    Array.prototype.slice.call(host.children).forEach(function(sheet){
      if(!sheet.classList||!sheet.classList.contains("qif-a4-sheet"))return;
      var wrapper=document.createElement("div");
      wrapper.className="qif-screen-page";
      host.insertBefore(wrapper,sheet);
      wrapper.appendChild(sheet);
    });
  }
  function updateFitButton(){
    var button=byId("qifFitView");
    if(!button)return;
    button.classList.toggle("active",state.fitView);
    button.setAttribute("aria-pressed",String(state.fitView));
    button.textContent=state.fitView?"화면 맞춤 ✓":"화면 맞춤";
    button.title=state.fitView?"A4를 화면 폭에 맞춰 표시 중입니다. 클릭하면 원본 100% 크기로 봅니다.":"원본 100% 크기입니다. 클릭하면 화면 폭에 맞춥니다.";
  }
  function fitFormToPanel(){
    state.fitFrame=0;
    var host=byId("qifFormHost"),scroll=document.querySelector("#qifQualificationPane .qif-form-scroll");
    if(!host||!scroll)return;
    var wrappers=host.querySelectorAll(".qif-screen-page");
    if(!wrappers.length)return;
    var first=wrappers[0].querySelector(".qif-a4-sheet");
    if(!first)return;
    var naturalWidth=first.offsetWidth||794;
    var naturalHeight=first.offsetHeight||1123;
    var available=scroll.clientWidth;
    try{
      var style=window.getComputedStyle(scroll);
      available-=parseFloat(style.paddingLeft)||0;
      available-=parseFloat(style.paddingRight)||0;
    }catch(ignore){}
    var scale=state.fitView&&available>0?Math.min(1,Math.max(.36,(available-2)/naturalWidth)):1;
    state.fitScale=scale;
    Array.prototype.forEach.call(wrappers,function(wrapper){
      var sheet=wrapper.querySelector(".qif-a4-sheet");
      if(!sheet)return;
      var width=sheet.offsetWidth||naturalWidth;
      var height=sheet.offsetHeight||naturalHeight;
      wrapper.style.width=Math.ceil(width*scale)+"px";
      wrapper.style.height=Math.ceil(height*scale)+"px";
      sheet.style.transform="scale("+scale+")";
      sheet.style.transformOrigin="left top";
    });
    updateFitButton();
  }
  function scheduleFit(){
    if(state.fitFrame)return;
    var request=window.requestAnimationFrame||function(callback){return setTimeout(callback,16);};
    state.fitFrame=request(fitFormToPanel);
  }
  function toggleFitView(){
    state.fitView=!state.fitView;
    updateFitButton();
    scheduleFit();
  }
  function renderForm(){
    var host=byId("qifFormHost");
    if(!host)return;
    if(!state.current)state.current=blankRecord(state.team);
    recalculate(state.current);
    host.innerHTML=formHtml(state.current,false);
    wrapScreenPages();
    updateComputed();
    scheduleFit();
  }
  function updateComputed(){
    if(!state.current)return;
    recalculate(state.current);
    var total=byId("qifTotalScore");
    if(total)total.textContent=String(state.current.total_score||0);
    var meta=byId("qifMeta");
    if(meta)meta.textContent=state.year+"년 · "+teamLabel(state.team)+" · 전체 "+state.records.length+"건 · 현재 "+resultLabel(state.current.result_status)+" "+state.current.total_score+"/100점";
  }
  function render(){
    updateTeamUi();
    renderRecordList();
    renderFileList();
    renderForm();
    updatePermissionUi();
    updateFitButton();
  }

  async function reloadAll(){
    await Promise.all([loadRecords(),loadFiles()]);
  }

  async function loadRecords(options){
    options=options||{};
    var db=database(),user=currentUser();
    if(!db||!user){
      state.records=[];
      state.current=blankRecord(state.team);
      state.dirty=false;
      render();
      setStatus("온라인 DB에 로그인하면 연도별 작성자료를 불러옵니다.","warn");
      return;
    }
    state.loading=true;
    var token=++state.loadToken;
    setStatus("작성자료를 불러오는 중입니다…","");
    try{
      var result=await db.from(TABLE).select("*")
        .eq("record_year",state.year)
        .eq("team_type",state.team)
        .is("archived_at",null)
        .order("evaluation_date",{ascending:false,nullsFirst:false})
        .order("updated_at",{ascending:false});
      if(result.error)throw result.error;
      if(token!==state.loadToken)return;
      state.records=(result.data||[]).map(normalizedRecord);
      var selectedId=options.selectId||state.current&&state.current.id;
      var selected=selectedId&&state.records.find(function(record){return record.id===selectedId;});
      state.current=selected?cloneRecord(selected):(state.records.length?cloneRecord(state.records[0]):blankRecord(state.team));
      state.dirty=false;
      render();
      setStatus("연도별 작성자료를 불러왔습니다.","ok");
    }catch(error){
      if(token!==state.loadToken)return;
      console.error("[QIF-01-01-LOAD]",error);
      state.records=[];
      state.current=blankRecord(state.team);
      state.dirty=false;
      render();
      setStatus(migrationMessage(error),"bad");
    }finally{
      if(token===state.loadToken)state.loading=false;
    }
  }
  async function touchFolder(){
    var db=database(),user=currentUser();
    if(!db||!user)return;
    try{
      await db.from(FOLDER_TABLE).update({updated_by:user.id}).eq("document_number",FOLDER_NUMBER);
    }catch(ignore){}
  }
  function payloadFor(record){
    recalculate(record);
    var year=Number(String(record.evaluation_date||"").slice(0,4))||state.year;
    return {
      record_year:year,
      team_type:record.team_type,
      employee_team:clean(record.employee_team),
      employee_name:clean(record.employee_name),
      hire_date:record.hire_date||null,
      birth_date:record.birth_date||null,
      evaluation_period:clean(record.evaluation_period),
      approval_primary:clean(record.approval_primary),
      approval_technical:clean(record.approval_technical),
      scores:record.scores||{},
      total_score:Number(record.total_score)||0,
      result_status:record.result_status,
      opinion:String(record.opinion||""),
      evaluation_date:record.evaluation_date||null,
      evaluator_name:clean(record.evaluator_name),
      updated_by:currentUser().id
    };
  }
  async function saveCurrent(){
    if(state.saving)return;
    if(!canEdit())return window.alert("품질문서 수정 권한이 없습니다.");
    if(!state.current)return;
    if(!clean(state.current.employee_name))return window.alert("평가 대상자 성명을 입력해주세요.");
    var db=database(),user=currentUser();
    if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    state.saving=true;
    var button=byId("qifSave");
    if(button)button.disabled=true;
    setStatus("자격 평가표를 저장하는 중입니다…","");
    try{
      var payload=payloadFor(state.current);
      var result;
      if(state.current.id){
        var update=db.from(TABLE).update(payload).eq("id",state.current.id).is("archived_at",null);
        if(state.current.updated_at)update=update.eq("updated_at",state.current.updated_at);
        result=await update.select("*");
        if(result.error)throw result.error;
        if(!result.data||result.data.length!==1){
          await loadRecords();
          return window.alert("다른 사용자가 먼저 이 평가표를 수정했습니다. 최신 자료를 다시 불러왔습니다.");
        }
        state.current=normalizedRecord(result.data[0]);
      }else{
        payload.created_by=user.id;
        result=await db.from(TABLE).insert(payload).select("*").single();
        if(result.error)throw result.error;
        state.current=normalizedRecord(result.data);
      }
      state.dirty=false;
      await touchFolder();
      var savedYear=state.current.record_year;
      var savedTeam=state.current.team_type;
      var savedId=state.current.id;
      state.year=savedYear;
      state.team=savedTeam;
      fillYearOptions();
      state.files=[];
      renderFileList();
      await Promise.all([loadRecords({selectId:savedId}),loadFiles()]);
      setStatus("자격 평가표를 저장했습니다.","ok");
    }catch(error){
      console.error("[QIF-01-01-SAVE]",error);
      setStatus("저장 실패: "+migrationMessage(error),"bad");
      window.alert("자격 평가표를 저장하지 못했습니다.\n기존 자료는 변경되지 않았습니다.\n\n"+migrationMessage(error));
    }finally{
      state.saving=false;
      updatePermissionUi();
    }
  }
  async function deleteCurrent(){
    if(!canEdit())return window.alert("품질문서 수정 권한이 없습니다.");
    if(!state.current||!state.current.id)return window.alert("아직 저장되지 않은 새 평가표입니다.");
    if(!window.confirm((state.current.employee_name||"선택한 직원")+"의 자격 평가표를 삭제할까요?\n삭제한 자료는 일반 목록에서만 숨겨지고 DB에는 보관됩니다."))return;
    var db=database(),user=currentUser();
    if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    try{
      var update=db.from(TABLE).update({archived_at:new Date().toISOString(),archived_by:user.id,updated_by:user.id})
        .eq("id",state.current.id).is("archived_at",null);
      if(state.current.updated_at)update=update.eq("updated_at",state.current.updated_at);
      var result=await update.select("id");
      if(result.error)throw result.error;
      if(!result.data||result.data.length!==1){
        await loadRecords();
        return window.alert("다른 사용자가 먼저 수정했습니다. 최신 자료를 다시 불러왔습니다.");
      }
      state.current=null;
      state.dirty=false;
      await touchFolder();
      await loadRecords();
      setStatus("선택한 평가표를 목록에서 삭제했습니다.","ok");
    }catch(error){
      window.alert("삭제하지 못했습니다.\n\n"+migrationMessage(error));
    }
  }
  function newRecord(){
    if(!confirmDiscard())return;
    state.current=blankRecord(state.team);
    state.dirty=false;
    render();
    setStatus(teamLabel(state.team)+" 새 평가표를 작성합니다.","ok");
  }
  function selectRecord(id){
    if(!confirmDiscard())return;
    var record=state.records.find(function(item){return item.id===id;});
    if(!record)return;
    state.current=cloneRecord(record);
    state.dirty=false;
    render();
  }
  async function switchTeam(team){
    if(team!== "analysis"&&team!=="sampling"||team===state.team)return;
    if(state.fileBusy)return window.alert("파일 업로드가 끝난 뒤 팀을 변경해주세요.");
    if(!confirmDiscard())return;
    state.team=team;
    state.current=null;
    state.query="";
    state.resultFilter="all";
    var search=byId("qifSearch");if(search)search.value="";
    var filter=byId("qifResultFilter");if(filter)filter.value="all";
    state.files=[];
    renderFileList();
    await Promise.all([loadRecords(),loadFiles()]);
  }
  async function switchYear(year){
    year=Number(year);
    if(!year||year===state.year)return;
    if(state.fileBusy){
      byId("qifYear").value=String(state.year);
      return window.alert("파일 업로드가 끝난 뒤 연도를 변경해주세요.");
    }
    if(!confirmDiscard()){byId("qifYear").value=String(state.year);return;}
    state.year=year;
    state.current=null;
    state.query="";
    var search=byId("qifSearch");if(search)search.value="";
    state.files=[];
    renderFileList();
    await Promise.all([loadRecords(),loadFiles()]);
  }
  function handleFormInput(target,finalize){
    if(!state.current||!canEdit())return;
    var field=target.dataset&&target.dataset.qifField;
    var scoreId=target.dataset&&target.dataset.qifScore;
    if(field){
      state.current[field]=target.value;
      markDirty();
      return;
    }
    if(scoreId){
      var item=itemsFor(state.current.team_type).find(function(candidate){return candidate.id===scoreId;});
      if(!item)return;
      if(target.value==="")delete state.current.scores[scoreId];
      else{
        var value=Number(target.value);
        if(finalize){
          value=Math.max(0,Math.min(item.max,Number.isFinite(value)?value:0));
          target.value=String(value);
        }
        state.current.scores[scoreId]=Number.isFinite(value)?value:"";
      }
      markDirty();
      updateComputed();
    }
  }
  function openPrint(autoPrint){
    if(!state.current)return;
    var popup=window.open("about:blank","_blank");
    if(!popup)return window.alert("미리보기 창이 차단되었습니다.\n브라우저 주소창에서 팝업을 허용해주세요.");
    var baseHref;
    try{baseHref=new URL(".",document.baseURI).href;}catch(ignore){baseHref="";}
    var cssHref;
    try{cssHref=new URL("qif_qualification.css?v=120371960",document.baseURI).href;}catch(ignore){cssHref="qif_qualification.css?v=120371960";}
    var record=cloneRecord(state.current);
    var title="DFEN-QIF-01-01 (01) "+teamLabel(record.team_type)+" "+(record.employee_name||"새 평가표");
    var html=[
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<base href="',escapeAttr(baseHref),'"><title>',escapeHtml(title),'</title>',
      '<link rel="stylesheet" href="',escapeAttr(cssHref),'"></head><body class="qif-print-window">',
      '<div class="qif-print-tools"><b>',escapeHtml(title),'</b><button type="button" onclick="window.print()">인쇄 / PDF</button></div>',
      '<main class="qif-print-document">',formHtml(record,true),'</main>',
      autoPrint?'<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});<\/script>':"",
      '</body></html>'
    ].join("");
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }
  function bindEvents(){
    var pane=byId("qifQualificationPane");
    if(!pane||pane.dataset.bound==="1")return;
    pane.dataset.bound="1";
    pane.addEventListener("click",function(event){
      var fileItem=event.target.closest("[data-qif-file-id]");
      if(fileItem){
        var file=state.files.find(function(item){return String(item.id)===String(fileItem.dataset.qifFileId);});
        if(!file)return;
        if(event.target.closest("[data-qif-file-download]")){downloadFile(file);return;}
        if(event.target.closest("[data-qif-file-rename]")){renameFile(file);return;}
        if(event.target.closest("[data-qif-file-delete]")){deleteFile(file);return;}
      }
      var teamButton=event.target.closest("[data-qif-team]");
      if(teamButton){switchTeam(teamButton.dataset.qifTeam);return;}
      var recordButton=event.target.closest("[data-qif-record]");
      if(recordButton){selectRecord(recordButton.dataset.qifRecord);return;}
    });
    byId("qifYear").addEventListener("change",function(event){switchYear(event.target.value);});
    byId("qifSearch").addEventListener("input",function(event){state.query=event.target.value;renderRecordList();});
    byId("qifResultFilter").addEventListener("change",function(event){state.resultFilter=event.target.value;renderRecordList();});
    byId("qifReload").addEventListener("click",function(){if(confirmDiscard())reloadAll();});
    byId("qifNew").addEventListener("click",newRecord);
    byId("qifSave").addEventListener("click",saveCurrent);
    byId("qifDelete").addEventListener("click",deleteCurrent);
    byId("qifPreview").addEventListener("click",function(){openPrint(false);});
    byId("qifPrint").addEventListener("click",function(){openPrint(true);});
    byId("qifFitView").addEventListener("click",toggleFitView);
    byId("qifUploadButton").addEventListener("click",function(){if(canEdit()&&!state.fileBusy)byId("qifFileInput").click();});
    byId("qifFileInput").addEventListener("change",function(event){uploadFiles(event.target.files);});
    var dropZone=byId("qifDropZone");
    dropZone.addEventListener("click",function(event){
      if(event.target.closest("#qifUploadButton"))return;
      if(canEdit()&&!state.fileBusy)byId("qifFileInput").click();
    });
    dropZone.addEventListener("keydown",function(event){
      if((event.key==="Enter"||event.key===" ")&&canEdit()&&!state.fileBusy){event.preventDefault();byId("qifFileInput").click();}
    });
    ["dragenter","dragover"].forEach(function(name){
      dropZone.addEventListener(name,function(event){event.preventDefault();if(canEdit()&&!state.fileBusy)dropZone.classList.add("dragging");});
    });
    ["dragleave","drop"].forEach(function(name){
      dropZone.addEventListener(name,function(event){event.preventDefault();dropZone.classList.remove("dragging");});
    });
    dropZone.addEventListener("drop",function(event){if(canEdit()&&!state.fileBusy)uploadFiles(event.dataTransfer&&event.dataTransfer.files);});
    byId("qifFormHost").addEventListener("input",function(event){handleFormInput(event.target,false);});
    byId("qifFormHost").addEventListener("change",function(event){handleFormInput(event.target,true);});
    var formScroll=document.querySelector("#qifQualificationPane .qif-form-scroll");
    if(typeof ResizeObserver!=="undefined"&&formScroll){
      state.resizeObserver=new ResizeObserver(scheduleFit);
      state.resizeObserver.observe(formScroll);
    }else window.addEventListener("resize",scheduleFit);
  }
  function open(){
    var pane=ensurePane();
    if(!pane||!window.DF_QPF_FORMS){
      window.alert("작성용 품질문서 화면을 준비하지 못했습니다. qpf_forms.js 파일을 확인해주세요.");
      return;
    }
    window.DF_QPF_FORMS.open();
    window.DF_QPF_FORMS.state.view="qif-qualification";
    var folders=byId("qpfFolderPane"),ledger=byId("qpfLedgerPane");
    if(folders)folders.hidden=true;
    if(ledger)ledger.hidden=true;
    pane.hidden=false;
    state.active=true;
    setHeader();
    fillYearOptions();
    updatePermissionUi();
    reloadAll();
  }
  function close(options){
    options=options||{};
    var pane=byId("qifQualificationPane");
    if(pane)pane.hidden=true;
    state.active=false;
    if(!options.silent){
      state.current=null;
      state.records=[];
      state.files=[];
      state.dirty=false;
    }
  }
  function init(){
    ensurePane();
    window.DF_QIF_0101={
      version:VERSION,
      open:open,
      close:close,
      confirmDiscard:confirmDiscard,
      reload:reloadAll,
      uploadFiles:uploadFiles,
      print:function(){openPrint(false);},
      state:state,
      templates:{analysis:ANALYSIS_ITEMS.slice(),sampling:SAMPLING_ITEMS.slice()}
    };
    diagnostic("info","시험담당자 자격 평가표 모듈 준비 완료","분석팀 1쪽 / 채취팀 2쪽 / 세로 A4");
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
