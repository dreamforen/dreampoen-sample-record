/* DREAMFOREN v120.37.22.2
 * 성적서 HWPX 간편작성 · 업체 폴더 자세히 보기 · 수정본 버전보관
 * 기존 일정/시료채취/LAB/자료실 원본은 조회만 합니다.
 */
(function dfMeasurementReportHwpx(){
  "use strict";

  var VERSION="v120.37.24.0";
  var SOURCE_TABLE="dreampoen_repository";
  var REPORT_TABLE="measurement_reports";
  var FILE_TABLE="measurement_report_files";
  var BUCKET="quality-documents";
  var TEMPLATE_URL="assets/measurement_report_template.hwpx?v=120372202";
  var SEAL_URL="assets/qualification_seal.jpg?v=120372202";
  var FILTER_KEY="dreampoen_report_hwpx_filters_v12037220";
  var MAX_FILE_SIZE=50*1024*1024;
  var MAX_ONE_PAGE_LINES=4;
  var legacy=null;
  var state={
    year:new Date().getFullYear(),query:"",sources:[],reports:[],files:[],selectedCompany:"",
    wizard:null,loaded:false,loading:false,error:"",previewUrl:"",uploadBusy:false
  };

  function templateManager(){return window.DF_REPORT_TEMPLATES||null;}
  function templateMeta(form){if(state&&state.wizard&&state.wizard.form===form&&state.wizard.templateError)return {linked:false,error:state.wizard.templateError};var manager=templateManager();return manager?manager.formMeta(form):{linked:false,error:"기준 양식 구성요소를 불러오지 못했습니다."};}
  function templateSection(group){var manager=templateManager();return manager?manager.renderSection(group):'<section class="rhx-section"><header><div><h2>시설별 기준 양식</h2><p>기준 양식 구성요소를 불러오지 못했습니다. 화면을 새로고침해주세요.</p></div></header></section>';}
  function linkedTemplateHtml(form){
    var meta=templateMeta(form);
    if(!meta.linked)return '<section class="rhx-template-linked missing"><div><b>이 시설의 기준 양식을 먼저 등록해주세요.</b><p>'+esc(meta.error||"업체 폴더의 ‘시설별 기준 양식’에서 전분기·전년도 HWPX를 등록하면 자동 연결됩니다.")+'</p></div><button class="rhx-btn" id="rhxGoTemplate">기준 양식 등록</button></section>';
    var fields=meta.fixedSummary||[];
    return '<section class="rhx-template-linked"><div><span class="rhx-template-eyebrow">연결된 시설 양식</span><b>'+esc(meta.name||"등록된 HWPX")+'</b><p>'+esc(meta.facilityName||"")+' · 원료·연료사용량, 방지시설과 셀 병합·분할은 이 파일을 기준으로 유지합니다.</p></div><span class="rhx-state done">자동 연결</span>'+(fields.length?'<details><summary>양식에 보관된 고정값 확인</summary><div class="rhx-fixed-grid">'+fields.map(function(f){return '<div><span>'+esc(f.label||"원본 고정값")+'</span><b>'+esc(f.value||"—")+'</b></div>';}).join("")+'</div></details>':'')+'</section>';
  }
  function activeSpecs(form){var meta=templateMeta(form);if(!meta.linked)return FIELD_SPECS;var fields=meta.variableFields||[];return FIELD_SPECS.filter(function(spec){return fields.indexOf(spec[0])>=0;});}
  function byId(id){return document.getElementById(id);}
  function clean(value){return String(value==null?"":value).trim();}
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function attr(value){return esc(value).replace(/\r?\n/g,"&#10;");}
  function clone(value){return JSON.parse(JSON.stringify(value==null?{}:value));}
  function num(value){var n=parseFloat(String(value==null?"":value).replace(/,/g,""));return Number.isFinite(n)?n:null;}
  function isoDate(value){var m=clean(value).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);return m?m[1]+"-"+String(Number(m[2])).padStart(2,"0")+"-"+String(Number(m[3])).padStart(2,"0"):"";}
  function yearOf(value,fallback){var d=isoDate(value);return d?Number(d.slice(0,4)):(Number(fallback)||new Date().getFullYear());}
  function norm(value){return clean(value).toLowerCase().replace(/주식회사|\(주\)|㈜/g,"").replace(/[\s\-_/().,\[\]]+/g,"");}
  function safeName(value){return clean(value).replace(/[\\/:*?"<>|#%]+/g,"_").replace(/\s+/g," ").slice(0,150)||"document";}
  function storageId(){return Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);}
  function fileExtension(value){var match=clean(value).match(/\.([a-z0-9]{1,10})$/i);return match?"."+match[1].toLowerCase():"";}
  function reportStoragePath(report,fileName){return "report-writer/reports/"+Number(report&&report.report_year||state.year)+"/"+clean(report&&report.id)+"/"+storageId()+fileExtension(fileName);}
  function database(){try{return typeof dfSupabase!=="undefined"?dfSupabase:null;}catch(ignore){return null;}}
  function currentUser(){try{return typeof dfCloudUser!=="undefined"?dfCloudUser:null;}catch(ignore){return null;}}
  function currentProfile(){try{return typeof dfCloudProfile!=="undefined"?dfCloudProfile:null;}catch(ignore){return null;}}
  function canUse(){var p=currentProfile(),role=clean(p&&p.role).toLowerCase(),a=p&&(p.access_permissions||p.board_permissions||{});return !!p&&(role==="admin"||role==="관리자"||a.repository!==false);}
  function diag(level,message,detail){try{if(window.DF_DIAG&&typeof window.DF_DIAG[level]==="function")window.DF_DIAG[level]("REPORT-HWPX",message,detail||"");}catch(ignore){}}
  function migrationMessage(error){var message=error&&error.message||String(error||"");if(/measurement_report_files|measurement_reports|schema cache|PGRST205|42P01|does not exist/i.test(message))return "성적서 HWPX 저장 DB 업데이트가 필요합니다. 배포본의 35_v12037210_report_writer.sql 파일을 다시 실행해주세요.";return message||"온라인 자료를 불러오지 못했습니다.";}
  function formatDateTime(value){if(!value)return "-";try{return new Date(value).toLocaleString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}catch(ignore){return clean(value)||"-";}}
  function formatBytes(value){var n=Number(value)||0;if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(n<10240?1:0)+" KB";return (n/1048576).toFixed(n<10485760?1:0)+" MB";}
  function debounce(fn,delay){var timer=0;return function(){var args=arguments,ctx=this;clearTimeout(timer);timer=setTimeout(function(){fn.apply(ctx,args);},delay||180);};}

  function loadFilters(){try{var v=JSON.parse(sessionStorage.getItem(FILTER_KEY)||"null")||{};if(Number(v.year))state.year=Number(v.year);state.query=clean(v.query);}catch(ignore){}}
  function saveFilters(){try{sessionStorage.setItem(FILTER_KEY,JSON.stringify({year:state.year,query:state.query}));}catch(ignore){}}
  async function fetchPages(table,columns,decorate){
    var db=database();if(!db)throw new Error("온라인 DB에 연결되어 있지 않습니다.");var rows=[];
    for(var from=0;;from+=1000){var query=db.from(table).select(columns);if(decorate)query=decorate(query);var result=await query.range(from,from+999);if(result.error)throw result.error;var part=result.data||[];rows.push.apply(rows,part);if(part.length<1000)break;}
    return rows;
  }

  function sourceData(row){return row&&row.measurement_data&&row.measurement_data.data||null;}
  function sourceFields(row){var d=sourceData(row);return d&&d.fields||{};}
  function sourceReceipt(row){return clean(row&&row.receipt_no||sourceFields(row).receiptNo);}
  function sourceCompany(row){return clean(row&&row.company_name||sourceFields(row).company);}
  function sourceFacility(row){return clean(row&&row.facility_name||sourceFields(row).facility);}
  function sourceDeleted(row){return !!(row&&row.measurement_data&&(row.measurement_data.deleted===true||row.measurement_data._deleted===true));}
  function sourceCompanies(){try{var rows=typeof dfV75SourceCompanies==="function"?dfV75SourceCompanies():((typeof companyState!=="undefined"&&companyState&&companyState.db&&companyState.db.Companies)||[]);return (rows||[]).filter(function(row){return row&&row.Active!==false;});}catch(ignore){return [];}}
  function findCompany(rowOrName){
    var rows=sourceCompanies(),fields=typeof rowOrName==="string"?{}:sourceFields(rowOrName),name=typeof rowOrName==="string"?rowOrName:sourceCompany(rowOrName),id=clean((typeof rowOrName==="object"&&rowOrName&&rowOrName.company_id)||fields.companyDbId);
    if(id)return rows.find(function(c){return String(c.Id)===id;})||null;var matches=rows.filter(function(c){return norm(c.Name)===norm(name);});return matches.length===1?matches[0]:null;
  }
  function findFacility(company,row){
    var fields=sourceFields(row),id=clean(fields.facilityDbId),name=sourceFacility(row),facilities=company&&Array.isArray(company.Facilities)?company.Facilities:[];
    return facilities.find(function(f){return id&&String(f.Id)===id;})||facilities.find(function(f){return [f.FacilityName,f.PreventionFacility].some(function(v){return norm(v)===norm(name);});})||null;
  }
  function sourceItems(row){
    var d=sourceData(row)||{},f=d.fields||{},items=[];
    function add(v){v=clean(v);if(v&&!items.some(function(x){return canon(x)===canon(v);}))items.push(v);}
    if(d.recordType==="dust"||d.recordType==="combo")add("먼지");
    if(d.recordType==="metal"||d.recordType==="combo")((Array.isArray(d.metalItems)&&d.metalItems.length)?d.metalItems:(f.metalAnalyte?[f.metalAnalyte]:[])).forEach(add);
    (d.gasRows||[]).forEach(function(g){add(g.item||g.name||g.pollutant);});return items;
  }
  function canon(value){
    var n=clean(value).replace(/\s/g,"");
    if(/먼지/i.test(n))return "먼지";if(/총탄화수소|THC/i.test(n))return "총탄화수소";if(/질소산화물|NOX/i.test(n))return "질소산화물";if(/황산화물|SOX/i.test(n))return "황산화물";if(/일산화탄소|CO(?!2)/i.test(n))return "일산화탄소";
    if(/염화수소/i.test(n))return "염화수소";if(/플루오린|불소/i.test(n))return "플루오린화합물";if(/암모니아/i.test(n))return "암모니아";if(/황화수소/i.test(n))return "황화수소";if(/사이안화수소|시안화수소/i.test(n))return "사이안화수소";if(/브로민|브롬/i.test(n))return "브로민화합물";if(/폼알데하이드|포름알데하이드|HCHO/i.test(n))return "폼알데하이드";
    if(/구리/i.test(n))return "구리화합물";if(/크로뮴|크롬/i.test(n))return "크로뮴화합물";if(/니켈/i.test(n))return "니켈화합물";if(/아연/i.test(n))return "아연화합물";if(/납/i.test(n))return "납화합물";if(/비소/i.test(n))return "비소화합물";if(/베릴륨/i.test(n))return "베릴륨";if(/카드뮴/i.test(n))return "카드뮴화합물";return clean(value).replace(/\([^)]*\)\s*$/g,"");
  }
  function resultUnit(item){
    var raw=clean(item),m=raw.match(/\(([^)]+)\)\s*$/);if(m)return clean(m[1]);
    var key=canon(item),mass=["먼지","구리화합물","크로뮴화합물","니켈화합물","아연화합물","납화합물","비소화합물","카드뮴화합물","베릴륨"],gas=["총탄화수소","질소산화물","황산화물","일산화탄소","염화수소","플루오린화합물","암모니아","황화수소","사이안화수소","브로민화합물","폼알데하이드"];
    if(mass.indexOf(key)>=0)return "mg/S㎥";
    if(gas.indexOf(key)>=0)return "ppm";
    return "";
  }
  function hasAnyUnit(value){return /(mg\s*\/\s*S|㎎|mg|ppm|ppb|%|％|℃|mmHg|m\/s|㎥|m3|Sm3|S㎥|Nm3|N㎥|kg(?:\/?h)?|g(?:\/?h)?|t(?:\/?h)?|톤(?:\/?h)?|L(?:\/?min|\/h)?|개\/?h|\bm\b)/i.test(clean(value));}
  function hasExpectedUnit(value,unit){
    var v=clean(value),u=clean(unit);if(!v||!u)return false;
    if(u==="m")return /(?:^|\s|\d)m\s*$/i.test(v)&&!/m\s*\/\s*s/i.test(v);
    if(u==="%")return /[%％]/.test(v);
    if(u==="℃")return /℃|°\s*c/i.test(v);
    if(u==="mmHg")return /mm\s*hg/i.test(v);
    if(u==="m/s")return /m\s*\/\s*s/i.test(v);
    if(/^S㎥\//.test(u))return /(?:S\s*(?:㎥|m3)|Sm3)\s*\/(?:min|분)/i.test(v);
    return v.toLowerCase().indexOf(u.toLowerCase())>=0;
  }
  function withUnit(value,unit,keepUnitWhenBlank){var v=clean(value),u=clean(unit);if(!u)return v;if(!v)return keepUnitWhenBlank?u:"";if(hasExpectedUnit(v,u)||hasAnyUnit(v))return v;return v+" "+u;}
  function itemWithUnit(item,unit){var base=canon(item)||clean(item),u=clean(unit)||resultUnit(item);if(!base)return "";if(/\([^)]*\)\s*$/.test(clean(item)))return clean(item);return u?base+"("+u+")":base;}
  function clockText(value){
    var raw=clean(value),normalized=raw.replace(/\s*시\s*/g,":").replace(/\s*분\s*/g,":").replace(/\s*초\s*$/g,""),match=normalized.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?$/),hour,minute,second=null;
    if(match){hour=Number(match[1]);minute=Number(match[2]);if(match[3]!=null)second=Number(match[3]);}
    else{match=normalized.match(/(?:^|\D)(\d{3,6})$/);if(!match)return raw;var digits=match[1];if(digits.length!==3&&digits.length!==4&&digits.length!==6)return raw;hour=Number(digits.slice(0,digits.length===3?1:2));minute=Number(digits.slice(digits.length===6?2:(digits.length===3?1:2),digits.length===6?4:digits.length));if(digits.length===6)second=Number(digits.slice(4));}
    if(hour>23||minute>59||(second!==null&&second>59))return raw;
    return String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0")+(second!==null?":"+String(second).padStart(2,"0"):"");
  }
  function compactResultTime(value,fallbackDate){
    var raw=clean(value).replace(/\r/g,"");if(!raw)return "";
    var stamps=[],stampRe=/(\d{4})[-./](\d{1,2})[-./](\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?|\d{3,4})/g,match;
    while((match=stampRe.exec(raw)))stamps.push({date:match[1]+"."+String(Number(match[2])).padStart(2,"0")+"."+String(Number(match[3])).padStart(2,"0"),time:clockText(match[4])});
    if(stamps.length>=2&&stamps[0].date===stamps[1].date)return stamps[0].date+" "+stamps[0].time+" ~ "+stamps[1].time;
    if(stamps.length===1)return stamps[0].date+" "+stamps[0].time;
    var times=raw.match(/(?:^|[\s~])\d{1,2}\s*:?\s*\d{2}(?=$|[\s~])/g)||[];times=times.map(function(v){return clockText(v);}).filter(Boolean);
    if(times.length>=2){var day=isoDate(fallbackDate);return (day?day.replace(/-/g,".")+" ":"")+times[0]+" ~ "+times[1];}
    return raw.replace(/\s*~\s*/g," ~ ").replace(/[ \t]+/g," ").replace(/\n+/g," / ").trim();
  }
  function formatMethod(value,allowBreak){var text=clean(value).replace(/\s+/g," ").replace(/\s*\(\s*/g," (").replace(/\s*\)\s*/g,")");if(allowBreak&&text.length>18&&/ \(/.test(text))text=text.replace(/ \(/,"\n(");return text;}
  function samplerSignature(name){name=clean(name).replace(/\s*\(서명\)\s*$/g,"");return name?name+" (서명)":"(서명)";}
  function getPath(object,path){return clean(path.split(".").reduce(function(v,key){return v==null?"":v[key];},object));}
  function setPath(object,path,value){var keys=path.split("."),target=object;keys.slice(0,-1).forEach(function(key){if(!target[key]||typeof target[key]!=="object")target[key]={};target=target[key];});target[keys[keys.length-1]]=value;}
  function ensureArrays(form){
    form=form||{};form.requester=form.requester||{};form.general=form.general||{};form.request=form.request||{};form.sampling=form.sampling||{};form.operation=form.operation||{};form.issuer=form.issuer||{};
    form.sampling.prevention_rows=Array.isArray(form.sampling.prevention_rows)&&form.sampling.prevention_rows.length?form.sampling.prevention_rows:[{name:"",target:"",efficiency:"확인불가"}];
    form.sampling.samplers=Array.isArray(form.sampling.samplers)?form.sampling.samplers:clean(form.sampling.samplers).split(/[,\n]/).map(clean).filter(Boolean);
    ["fuel","product","incineration"].forEach(function(key){var rows=Array.isArray(form.operation[key])?form.operation[key]:[];form.operation[key]=rows.length?rows.map(function(row){return typeof row==="object"?Object.assign({amount:"",unit:""},row):{amount:clean(row),unit:""};}):[{amount:"",unit:""}];});
    var materials=Array.isArray(form.operation.material)?form.operation.material:[];form.operation.material=materials.length?materials.map(function(row){return Object.assign({amount:"",type:"",unit:""},row||{});}):[{amount:"",type:"",unit:""}];
    form.results=Array.isArray(form.results)&&form.results.length?form.results:[{item:"",unit:"",limit:"",result:"",time:"",method:"",memo:""}];
    form.results=form.results.map(function(row){row=Object.assign({item:"",unit:"",limit:"",result:"",time:"",method:"",memo:""},row||{});if(!clean(row.unit))row.unit=resultUnit(row.item);return row;});
    return form;
  }
  function draftFromSource(row){
    var api=legacy&&legacy._test;if(api&&typeof api.draftFromSource==="function")return ensureArrays(clone(api.draftFromSource(row)));
    var company=findCompany(row)||{},facility=findFacility(company,row)||{},f=sourceFields(row),date=isoDate(row&&row.measure_date||f.measureDate),items=sourceItems(row);
    return ensureArrays({receipt_no:sourceReceipt(row),requester:{company:sourceCompany(row),address:clean(company.Address),representative:clean(company.Representative),environment_engineer:clean(company.EnvironmentManager)},general:{industry:clean(company.Industry),facility_type:"",grade:clean(company.Grade)},request:{purpose:"자가측정용",stack_name:sourceFacility(row),height:clean(facility.StackHeight),diameter:clean(facility.Diameter||facility.DimensionRaw),stack_type:clean(facility.StackShape),items:items.join(", ")},sampling:{weather:clean(f.weather),temperature:clean(f.airTemp),humidity:clean(f.humidity),pressure:clean(f.locationPressure||f.pressure),wind_direction:clean(f.windDir),wind_speed:clean(f.windSpeed),standard_oxygen:clean(f.stdO2),measured_oxygen:"",flow_before:"",flow_after:"",moisture:"",gas_temperature:"",gas_velocity:"",other:"",prevention_rows:[{name:clean(facility.PreventionFacility||sourceFacility(row)),target:items.join(", "),efficiency:"확인불가"}],date:date,time:[clean(f.totalStart),clean(f.totalEnd)].filter(Boolean).join(" ~ "),samplers:[]},operation:{emission_facility:clean(facility.EmissionFacility),prevention_facility:clean(facility.PreventionFacility||sourceFacility(row))},results:items.map(function(item){return {item:item,unit:resultUnit(item),limit:"",result:"",time:"",method:"",memo:""};}),analysis_period:"",issue_date:"",issuer:{company:"드림포이엔",address:"경기 안양시 만안구 덕천로152번길 25 (안양동) 비동 2005호",phone:"031-420-2156",representative:"하준명"}});
  }

  function reportForReceipt(receipt){return state.reports.filter(function(row){return !row.archived_at&&clean(row.source_receipt_no||row.report_no)===clean(receipt);}).sort(function(a,b){return clean(b.updated_at).localeCompare(clean(a.updated_at));})[0]||null;}
  function filesForReport(reportId){return state.files.filter(function(row){return !row.archived_at&&String(row.report_id)===String(reportId);}).sort(function(a,b){return Number(b.version_no||0)-Number(a.version_no||0)||clean(b.updated_at).localeCompare(clean(a.updated_at));});}
  function latestFile(reportId){return filesForReport(reportId)[0]||null;}
  function sourceKey(row){var c=findCompany(row);return clean(sourceFields(row).companyDbId)||clean(c&&c.Id)||"name:"+norm(sourceCompany(row));}
  function reportKey(row){return clean(row&&row.company_id)||"name:"+norm(row&&row.company_name);}
  function companyGroups(){
    var map=new Map();function ensure(key,name,company){var normalized=norm(name),uniqueName=sourceCompanies().filter(function(c){return norm(c.Name)===normalized;}).length===1,matches=Array.from(map.values()).filter(function(group){return normalized&&norm(group.name)===normalized&&(group.key===key||(uniqueName&&(group.key.indexOf("name:")===0||key.indexOf("name:")===0)));}),same=matches.length===1?matches[0]:null;if(same){if(!same.company&&company)same.company=company;return same;}if(!map.has(key))map.set(key,{key:key,name:clean(name)||"업체명 미입력",company:company||null,sources:[],reports:[],files:[]});var g=map.get(key);if(!g.company&&company)g.company=company;return g;}
    state.sources.forEach(function(row){var c=findCompany(row);ensure(sourceKey(row),sourceCompany(row)||c&&c.Name,c).sources.push(row);});
    state.reports.forEach(function(row){var c=findCompany(row);ensure(reportKey(row),row.company_name,c).reports.push(row);});
    state.files.forEach(function(file){var report=state.reports.find(function(row){return String(row.id)===String(file.report_id);});if(report){var c=findCompany(report);ensure(reportKey(report),report.company_name,c).files.push(file);}});
    return Array.from(map.values()).map(function(g){
      g.sources.sort(function(a,b){return clean(b.measure_date).localeCompare(clean(a.measure_date))||sourceReceipt(a).localeCompare(sourceReceipt(b),"ko",{numeric:true});});
      var dates=g.files.map(function(x){return x.updated_at||x.created_at;}).concat(g.reports.map(function(x){return x.updated_at;}),g.sources.map(function(x){return x.updated_at||x.measure_date;})).filter(Boolean).sort();g.modified=dates.length?dates[dates.length-1]:"";
      g.unwritten=g.sources.filter(function(s){return !reportForReceipt(sourceReceipt(s));}).length;return g;
    }).sort(function(a,b){return a.name.localeCompare(b.name,"ko",{numeric:true,sensitivity:"base"});});
  }
  function selectedGroup(){return companyGroups().find(function(g){return g.key===state.selectedCompany;})||null;}
  function yearOptions(year){var now=new Date().getFullYear(),values=[];for(var y=Math.max(now+2,year);y>=Math.min(2022,year);y--)values.push('<option value="'+y+'"'+(y===year?' selected':'')+'>'+y+'년</option>');return values.join("");}

  async function loadData(force){
    var root=byId("dfMeasurementReportApp");if(!root)return;if(state.loading)return;if(state.loaded&&!force){render();return;}state.loading=true;state.error="";
    root.innerHTML='<div class="rhx-loading"><span></span><b>업체별 접수자료와 HWPX 파일을 불러오는 중입니다.</b></div>';
    try{
      var start=state.year+"-01-01",end=state.year+"-12-31";
      var settled=await Promise.allSettled([
        fetchPages(SOURCE_TABLE,"receipt_no,measure_date,company_name,facility_name,record_type,measurement_data,analysis_data,hidden,updated_at",function(q){return q.gte("measure_date",start).lte("measure_date",end).order("measure_date",{ascending:false}).order("receipt_no",{ascending:true});}),
        fetchPages(REPORT_TABLE,"*",function(q){return q.eq("report_year",state.year).is("archived_at",null).order("updated_at",{ascending:false});}),
        fetchPages(FILE_TABLE,"*",function(q){return q.eq("report_year",state.year).is("archived_at",null).order("updated_at",{ascending:false});}),
        templateManager()?templateManager().load():Promise.resolve([])
      ]);
      if(settled[0].status!=="fulfilled")throw settled[0].reason;state.sources=(settled[0].value||[]).filter(function(row){return !row.hidden&&!sourceDeleted(row);});
      if(settled[1].status!=="fulfilled")throw settled[1].reason;state.reports=settled[1].value||[];
      if(settled[2].status!=="fulfilled")throw settled[2].reason;state.files=settled[2].value||[];
      state.loaded=true;diag("info","HWPX 성적서 자료 조회 완료","접수 "+state.sources.length+"건 / 작성본 "+state.reports.length+"건 / 파일 "+state.files.length+"건");render();
    }catch(error){state.error=migrationMessage(error);root.innerHTML='<div class="rhx-error"><b>성적서 자료를 불러오지 못했습니다.</b><p>'+esc(state.error)+'</p><button class="rhx-btn" id="rhxRetry">다시 시도</button></div>';if(byId("rhxRetry"))byId("rhxRetry").onclick=function(){state.loaded=false;loadData(true);};diag("error","HWPX 성적서 조회 실패",error&&error.message||error);}
    finally{state.loading=false;}
  }

  function render(){if(state.wizard)return renderWizard();if(state.selectedCompany)return renderCompanyFolder();renderFolderList();}
  function renderFolderList(){
    var root=byId("dfMeasurementReportApp");if(!root)return;var all=companyGroups(),q=norm(state.query),groups=all.filter(function(g){return !q||norm([g.name,g.company&&g.company.Address,g.sources.map(sourceFacility).join(" ")].join(" ")).indexOf(q)>=0;});
    var totalSources=all.reduce(function(n,g){return n+g.sources.length;},0),totalFiles=all.reduce(function(n,g){return n+g.files.length;},0);
    root.innerHTML=[
      '<div class="rhx-page"><header class="rhx-titlebar"><div><h1>성적서작성</h1><p>접수자료를 선택하고 누락값만 입력한 뒤, 원본 양식 그대로 HWPX를 생성합니다.</p></div><button class="rhx-btn" id="rhxRefresh">새로고침</button></header>',
      '<div class="rhx-commandbar"><label>연도<select id="rhxYear">',yearOptions(state.year),'</select></label><label class="rhx-search">업체 찾기<input id="rhxSearch" type="search" value="',attr(state.query),'" placeholder="업체명 · 주소 · 시설명"></label><button class="rhx-btn" id="rhxSearchClear">전체보기</button><div class="rhx-counts"><span>업체 <b>',all.length,'</b></span><span>접수 <b>',totalSources,'</b></span><span>저장파일 <b>',totalFiles,'</b></span></div></div>',
      '<div class="rhx-explorer"><div class="rhx-explorer-head rhx-folder-columns"><span>이름</span><span>접수자료</span><span>저장파일</span><span>작성상태</span><span>수정한 날짜</span></div><div class="rhx-explorer-body">',
      groups.length?groups.map(function(g){var done=g.sources.length-g.unwritten,status=g.unwritten?'<span class="rhx-state wait">미작성 '+g.unwritten+'건</span>':'<span class="rhx-state done">작성자료 있음</span>';return '<button type="button" class="rhx-folder-row rhx-folder-columns" data-rhx-company="'+attr(g.key)+'"><span class="rhx-name"><i class="rhx-folder-icon"></i><span><b>'+esc(g.name)+'</b><small>'+esc(g.company&&g.company.Address||"업체현황 주소 미등록")+'</small></span></span><span>'+g.sources.length+'건</span><span>'+g.files.length+'개</span><span>'+status+(done?'<small> 작성본 '+done+'건</small>':'')+'</span><span>'+esc(formatDateTime(g.modified))+'</span></button>';}).join(""):'<div class="rhx-empty">조건에 맞는 업체 폴더가 없습니다.</div>',
      '</div></div><footer class="rhx-helpbar">업체 폴더는 업체명 가나다순으로 정렬됩니다. 기존 일정·시료채취·LAB 자료는 변경하지 않습니다.</footer></div>'
    ].join("");
    byId("rhxYear").onchange=function(e){state.year=Number(e.target.value);state.selectedCompany="";state.loaded=false;saveFilters();loadData(true);};
    byId("rhxSearch").oninput=debounce(function(e){state.query=e.target.value;saveFilters();renderFolderList();},140);
    byId("rhxSearchClear").onclick=function(){state.query="";saveFilters();renderFolderList();};byId("rhxRefresh").onclick=function(){state.loaded=false;loadData(true);};
    root.querySelectorAll("[data-rhx-company]").forEach(function(button){button.onclick=function(){state.selectedCompany=button.dataset.rhxCompany;renderCompanyFolder();};});
  }

  function sourceStatus(row,report){
    if(!report)return '<span class="rhx-state wait">작성 전</span>';var files=filesForReport(report.id),latest=files[0];if(!latest)return '<span class="rhx-state active">입력 저장</span>';if(report.status==="issued")return '<span class="rhx-state done">발급완료</span>';if(latest.file_role==="revised")return '<span class="rhx-state revised">수정본 보관</span>';return '<span class="rhx-state generated">HWPX 생성</span>';
  }
  function renderCompanyFolder(){
    var root=byId("dfMeasurementReportApp"),g=selectedGroup();if(!root||!g){state.selectedCompany="";renderFolderList();return;}
    var files=g.files.slice().sort(function(a,b){return clean(b.updated_at||b.created_at).localeCompare(clean(a.updated_at||a.created_at));});
    root.innerHTML=[
      '<div class="rhx-page"><header class="rhx-titlebar"><div class="rhx-breadcrumb"><button class="rhx-back" id="rhxFolderBack">← 업체 폴더</button><h1><i class="rhx-folder-icon open"></i>',esc(g.name),'</h1><p>',esc(g.company&&g.company.Address||"업체현황 주소 미등록"),'</p></div><button class="rhx-btn" id="rhxFolderRefresh">새로고침</button></header>',
      templateSection(g),
      '<section class="rhx-section"><header><div><h2>접수자료</h2><p>작성할 접수번호를 선택하면 자동입력값을 제외한 누락항목만 표시됩니다.</p></div></header><div class="rhx-detail-table"><div class="rhx-detail-head rhx-source-columns"><span>측정일</span><span>접수번호 / 발급번호</span><span>시설명</span><span>측정항목</span><span>상태</span><span>수정한 날짜</span><span>작업</span></div>',
      g.sources.length?g.sources.map(function(row){var receipt=sourceReceipt(row),report=reportForReceipt(receipt),latest=report&&latestFile(report.id);return '<div class="rhx-detail-row rhx-source-columns"><span>'+esc(row.measure_date||"-")+'</span><span><b>'+esc(receipt||"접수번호 없음")+'</b><small>발급번호 동일 적용</small></span><span>'+esc(sourceFacility(row)||"시설명 미입력")+'</span><span>'+esc(sourceItems(row).join(", ")||"항목 미입력")+'</span><span>'+sourceStatus(row,report)+'</span><span>'+esc(formatDateTime(latest&&latest.updated_at||report&&report.updated_at||row.updated_at))+'</span><span class="rhx-actions"><button class="rhx-btn primary" data-rhx-write="'+attr(receipt)+'">'+(report?"누락값 확인":"작성")+'</button>'+(report?'<button class="rhx-btn" data-rhx-upload-for="'+attr(report.id)+'">수정본 업로드</button>':'')+'</span></div>';}).join(""):'<div class="rhx-empty">이 연도의 접수자료가 없습니다.</div>',
      '</div></section>',
      '<section class="rhx-section"><header><div><h2>저장된 성적서 파일</h2><p>자동생성본과 한글에서 수정해 올린 파일을 버전별로 보관합니다.</p></div><label class="rhx-upload-pick">연결 접수<select id="rhxUploadReport"><option value="">선택</option>',g.reports.map(function(r){return '<option value="'+attr(r.id)+'">'+esc(r.report_no||r.source_receipt_no||"접수번호 없음")+'</option>';}).join(""),'</select></label></header>',
      '<div class="rhx-drop" id="rhxDropZone"><input id="rhxFileInput" type="file" accept=".hwpx,.hwp,.pdf" multiple hidden><strong>수정한 HWPX 파일을 여기에 끌어놓으세요.</strong><span>또는 클릭하여 파일 선택 · HWPX/HWP/PDF · 파일당 최대 50MB</span></div>',
      '<div class="rhx-detail-table"><div class="rhx-detail-head rhx-file-columns"><span>파일 이름</span><span>접수번호</span><span>구분</span><span>버전</span><span>크기</span><span>수정한 날짜</span><span>작업</span></div>',
      files.length?files.map(function(file){var report=state.reports.find(function(r){return String(r.id)===String(file.report_id);});return '<div class="rhx-detail-row rhx-file-columns"><span class="rhx-file-name"><i class="rhx-doc-icon">한</i><b>'+esc(file.file_name)+'</b></span><span>'+esc(file.source_receipt_no||report&&report.report_no||"-")+'</span><span>'+(file.file_role==="generated"?'<span class="rhx-state generated">자동생성</span>':file.file_role==="pdf"?'<span class="rhx-state active">PDF</span>':'<span class="rhx-state revised">한글 수정본</span>')+'</span><span>v'+Number(file.version_no||1)+'</span><span>'+formatBytes(file.file_size)+'</span><span>'+esc(formatDateTime(file.updated_at||file.created_at))+'</span><span class="rhx-actions"><button class="rhx-btn" data-rhx-preview-file="'+attr(file.id)+'">미리보기</button><button class="rhx-btn" data-rhx-print-file="'+attr(file.id)+'">인쇄</button><button class="rhx-btn" data-rhx-download-file="'+attr(file.id)+'">다운로드</button><button class="rhx-icon-btn danger" data-rhx-archive-file="'+attr(file.id)+'" title="목록에서 삭제">×</button></span></div>';}).join(""):'<div class="rhx-empty">저장된 성적서 파일이 없습니다.</div>',
      '</div></section></div>'
    ].join("");
    byId("rhxFolderBack").onclick=function(){state.selectedCompany="";renderFolderList();};byId("rhxFolderRefresh").onclick=function(){state.loaded=false;loadData(true);};
    root.querySelectorAll("[data-rhx-write]").forEach(function(b){b.onclick=function(){openWizard(b.dataset.rhxWrite);};});
    root.querySelectorAll("[data-rhx-upload-for]").forEach(function(b){b.onclick=function(){byId("rhxUploadReport").value=b.dataset.rhxUploadFor;byId("rhxFileInput").click();};});
    root.querySelectorAll("[data-rhx-preview-file]").forEach(function(b){b.onclick=function(){openFilePreview(findFile(b.dataset.rhxPreviewFile),false);};});
    root.querySelectorAll("[data-rhx-print-file]").forEach(function(b){b.onclick=function(){openFilePreview(findFile(b.dataset.rhxPrintFile),true);};});
    root.querySelectorAll("[data-rhx-download-file]").forEach(function(b){b.onclick=function(){downloadStoredFile(findFile(b.dataset.rhxDownloadFile));};});
    root.querySelectorAll("[data-rhx-archive-file]").forEach(function(b){b.onclick=function(){archiveFile(findFile(b.dataset.rhxArchiveFile));};});bindDrop();if(templateManager())templateManager().bindSection(root,g);
  }

  function findFile(id){return state.files.find(function(file){return String(file.id)===String(id);})||null;}
  function openWizard(receipt){
    var source=state.sources.find(function(row){return sourceReceipt(row)===clean(receipt);});if(!source)return window.alert("접수자료를 찾지 못했습니다.");var report=reportForReceipt(receipt),form=report?ensureArrays(clone(report.form_data)):draftFromSource(source);
    form.receipt_no=sourceReceipt(source);
    // Legacy defaults are not an approved analysis opinion or staff assignment.
    if(!form.template_ref){form.opinion="";form.analyst="";form.technical_manager="";}
    var manager=templateManager(),template=manager&&manager.resolveForm(source,form);
    if(template)manager.applyToForm(form,template,source);
    state.wizard={source:source,report:report,form:form,showAll:false,busy:false,templateError:form.template_ref&&!template?"저장된 양식과 현재 접수자료의 업체·시설이 일치하는지 확인해주세요. 이전 양식을 임의로 바꾸지 않았습니다.":""};renderWizard();
  }

  var FIELD_SPECS=[
    ["requester.company","의뢰인","상호(사업장명)","text"],["requester.address","의뢰인","사업장 소재지", "text"],["requester.representative","의뢰인","대표자(의뢰인)","text"],["requester.environment_engineer","의뢰인","환경기술인","text"],
    ["general.industry","일반현황","업종","text"],["general.facility_type","일반현황","시설 종류","text"],["general.grade","일반현황","사업장 종별","text"],
    ["request.purpose","의뢰내용","측정용도","text"],["request.stack_name","의뢰내용","굴뚝 명칭","text"],["request.height","의뢰내용","높이","text","m"],["request.diameter","의뢰내용","안지름","text","m"],["request.stack_type","의뢰내용","굴뚝 종별","text"],["request.items","의뢰내용","의뢰 항목","text"],
    ["sampling.weather","시료채취","날씨","text"],["sampling.temperature","시료채취","기온","text","℃"],["sampling.humidity","시료채취","습도","text","%"],["sampling.pressure","시료채취","기압","text","mmHg"],["sampling.wind_direction","시료채취","풍향","text"],["sampling.wind_speed","시료채취","풍속","text","m/s"],
    ["sampling.standard_oxygen","배출가스","표준산소농도","text","%"],["sampling.measured_oxygen","배출가스","실측산소농도","text","%"],["sampling.flow_before","배출가스","유량(보정 전)","text","S㎥/분"],["sampling.flow_after","배출가스","유량(보정 후)","text","S㎥/분"],["sampling.moisture","배출가스","수분량","text","%"],["sampling.gas_temperature","배출가스","배출가스온도","text","℃"],["sampling.gas_velocity","배출가스","배출가스 유속","text","m/s"],["sampling.other","배출가스","기타","text"],
    ["sampling.date","채취정보","채취일","date"],["sampling.time","채취정보","채취시간","text"],["analysis_period","발행정보","분석기간","text"],["issue_date","발행정보","성적서 작성일","date"],["analyst","발행정보","분석기술인","text"],["technical_manager","발행정보","책임기술인","text"],["opinion","발행정보","종합의견","text"]
  ];
  function missingSpecs(form){return activeSpecs(form).filter(function(spec){return !getPath(form,spec[0]);});}
  function renderMissingFields(form,showAll){
    var specs=showAll?activeSpecs(form):missingSpecs(form);if(!specs.length)return '<div class="rhx-complete-note">기본정보·현장정보 자동입력이 완료되었습니다.</div>';
    var sections={};specs.forEach(function(spec){if(!sections[spec[1]])sections[spec[1]]=[];sections[spec[1]].push(spec);});
    return Object.keys(sections).map(function(title){return '<div class="rhx-field-group"><h3>'+esc(title)+'</h3><div class="rhx-field-grid">'+sections[title].map(function(spec){var value=getPath(form,spec[0]),unit=spec[4]||"";return '<label><span>'+esc(spec[2])+(unit?' <em>'+esc(unit)+'</em>':'')+'</span><input data-rhx-field="'+attr(spec[0])+'" type="'+(spec[3]||"text")+'" value="'+attr(value)+'" placeholder="'+(unit?"숫자만 입력해도 단위 자동 적용":"입력")+'"></label>';}).join("")+'</div></div>';}).join("");
  }
  function renderPreventionRows(rows){return rows.map(function(row,index){return '<div class="rhx-repeat-row prevention" data-rhx-prevention="'+index+'"><input data-key="name" value="'+attr(row.name)+'" placeholder="방지시설 명칭"><input data-key="target" value="'+attr(row.target)+'" placeholder="대상물질"><input data-key="efficiency" value="'+attr(row.efficiency)+'" placeholder="방지효율"><button class="rhx-icon-btn danger" data-remove-prevention="'+index+'">×</button></div>';}).join("");}
  function renderOperationRows(form,key,title){var rows=form.operation[key]||[];return '<div class="rhx-operation-card" data-operation-group="'+key+'"><header><b>'+esc(title)+'</b><button class="rhx-mini-add" data-add-operation="'+key+'">+ 추가</button></header>'+rows.map(function(row,index){return '<div class="rhx-operation-line" data-operation-row="'+index+'"><input data-key="amount" value="'+attr(row.amount)+'" placeholder="사용(생산)량"><input data-key="unit" value="'+attr(row.unit)+'" placeholder="단위(선택)"><button class="rhx-icon-btn danger" data-remove-operation="'+key+':'+index+'">×</button></div>';}).join("")+'</div>';}
  function renderMaterialRows(form){return '<div class="rhx-operation-card material"><header><b>원료투입량</b><button class="rhx-mini-add" data-add-material>+ 추가</button></header>'+form.operation.material.map(function(row,index){return '<div class="rhx-material-line" data-material-row="'+index+'"><input data-key="amount" value="'+attr(row.amount)+'" placeholder="투입량"><input data-key="type" value="'+attr(row.type)+'" placeholder="종류"><input data-key="unit" value="'+attr(row.unit)+'" placeholder="단위(선택)"><button class="rhx-icon-btn danger" data-remove-material="'+index+'">×</button></div>';}).join("")+'</div>';}
  function renderResultRows(rows){return rows.map(function(row,index){return '<div class="rhx-result-row" data-result-row="'+index+'"><input data-key="item" value="'+attr(canon(row.item)||row.item)+'" placeholder="측정항목"><input data-key="unit" value="'+attr(row.unit||resultUnit(row.item))+'" placeholder="단위 필수"><input data-key="limit" value="'+attr(row.limit)+'" placeholder="허용기준"><input data-key="result" value="'+attr(row.result)+'" placeholder="분석값"><textarea data-key="time" placeholder="측정시간">'+esc(row.time)+'</textarea><textarea data-key="method" placeholder="측정분석방법(기기명)">'+esc(row.method)+'</textarea><input data-key="memo" value="'+attr(row.memo)+'" placeholder="비고"><button class="rhx-icon-btn danger" data-remove-result="'+index+'">×</button></div>';}).join("");}
  function unitIssues(form){
    var issues=[];(form.results||[]).forEach(function(row,index){if(clean(row.item)&&!clean(row.unit)&&!resultUnit(row.item))issues.push("측정항목 "+(index+1)+"의 단위");});return issues;
  }
  function onePageIssues(form){if(templateMeta(form).linked)return [];var issues=[];if(form.sampling.prevention_rows.length>MAX_ONE_PAGE_LINES)issues.push("방지시설은 1페이지 기준 최대 "+MAX_ONE_PAGE_LINES+"개입니다.");if(form.results.length>MAX_ONE_PAGE_LINES)issues.push("측정항목은 1페이지 기준 최대 "+MAX_ONE_PAGE_LINES+"개입니다.");["fuel","product","incineration","material"].forEach(function(key){if((form.operation[key]||[]).length>MAX_ONE_PAGE_LINES)issues.push("시설가동상황의 한 항목은 1페이지 기준 최대 "+MAX_ONE_PAGE_LINES+"줄입니다.");});return issues;}
  function renderWizard(){
    var root=byId("dfMeasurementReportApp"),w=state.wizard;if(!root||!w)return;var form=ensureArrays(w.form),missing=missingSpecs(form),units=unitIssues(form),pageIssues=onePageIssues(form),source=w.source;
    root.innerHTML=[
      '<div class="rhx-page rhx-wizard"><header class="rhx-titlebar"><div><button class="rhx-back" id="rhxWizardBack">← ',esc(selectedGroup()&&selectedGroup().name||"업체 폴더"),'</button><h1>HWPX 성적서 만들기</h1><p>',esc(sourceReceipt(source)),' · ',esc(sourceCompany(source)),' · ',esc(sourceFacility(source)),'</p></div><div class="rhx-wizard-actions"><button class="rhx-btn" id="rhxSaveDraft">입력값 저장</button><button class="rhx-btn primary strong" id="rhxGenerate">HWPX 생성·저장·다운로드</button></div></header>',
      linkedTemplateHtml(form),
      '<div class="rhx-flow"><span class="done">1 접수자료 선택</span><i>›</i><span class="active">2 누락값 입력</span><i>›</i><span>3 HWPX 자동생성</span><i>›</i><span>4 수정본 재업로드</span></div>',
      '<section class="rhx-summary-line"><div><b>자동입력 확인</b><span>업체현황·시료채취·LAB에서 가져온 값은 그대로 사용하고 비어 있는 값만 입력하세요.</span></div><div><span class="rhx-chip good">자동입력 '+(activeSpecs(form).length-missing.length)+'개</span><span class="rhx-chip '+(missing.length?'warn':'good')+'">누락 '+missing.length+'개</span><span class="rhx-chip '+(units.length?'bad':'good')+'">단위 '+(units.length?'확인 '+units.length+'개':'정상')+'</span></div></section>',
      (units.length||pageIssues.length?'<div class="rhx-validation">'+units.concat(pageIssues).map(function(x){return '<span>• '+esc(x)+'</span>';}).join("")+'</div>':''),
      '<section class="rhx-form-section"><header><div><h2>누락된 기본정보</h2><p>단위가 표시된 항목은 숫자만 입력해도 HWPX 생성 시 단위가 자동으로 붙습니다.</p></div><label class="rhx-switch"><input id="rhxShowAll" type="checkbox"'+(w.showAll?' checked':'')+'> 자동입력값도 모두 보기</label></header><div id="rhxMissingFields">',renderMissingFields(form,w.showAll),'</div></section>',
      '<section class="rhx-form-section"><header><div><h2>시료채취자</h2><p>새 접수자료의 채취자와 서명란을 적용합니다.</p></div></header><div class="rhx-field-grid two"><label><span>시료채취자 <em>쉼표로 구분</em></span><input id="rhxSamplers" value="'+attr(form.sampling.samplers.join(", "))+'" placeholder="예: 하준명, 배해성"></label></div></section>',
      '<section class="rhx-form-section"><header><div><h2>측정분석결과</h2><p>등록된 양식의 측정항목 칸에 연결됩니다. 양식에 없는 항목은 누락시키지 않고 확인을 요청합니다.</p></div><button class="rhx-btn" id="rhxAddResult">+ 측정항목 추가</button></header><div class="rhx-result-head"><span>측정항목</span><span>단위</span><span>허용기준</span><span>측정값</span><span>측정시간</span><span>측정분석방법</span><span>비고</span><span></span></div><div id="rhxResultRows">',renderResultRows(form.results),'</div></section>',
      '<section class="rhx-unit-policy"><b>단위 보존 기준</b><span>기온 ℃ · 습도/산소/수분 % · 기압 mmHg · 유속 m/s · 유량 S㎥/분 · 높이/안지름 m · 먼지/중금속 mg/S㎥ · 가스상 ppm</span></section>',
      '<div class="rhx-bottom-actions"><button class="rhx-btn" id="rhxWizardCancel">취소</button><button class="rhx-btn" id="rhxSaveDraft2">입력값 저장</button><button class="rhx-btn primary strong" id="rhxGenerate2">HWPX 생성·저장·다운로드</button></div></div>'
    ].join("");bindWizard();
  }
  function bindWizard(){
    var root=byId("dfMeasurementReportApp"),w=state.wizard,form=w.form;if(!root)return;
    function updateField(e){setPath(form,e.target.dataset.rhxField,e.target.value);}
    root.querySelectorAll("[data-rhx-field]").forEach(function(input){input.oninput=updateField;input.onchange=updateField;});
    root.querySelectorAll("[data-rhx-prevention]").forEach(function(row){row.querySelectorAll("[data-key]").forEach(function(input){input.oninput=function(){form.sampling.prevention_rows[Number(row.dataset.rhxPrevention)][input.dataset.key]=input.value;};});});
    root.querySelectorAll("[data-operation-group]").forEach(function(card){var key=card.dataset.operationGroup;card.querySelectorAll("[data-operation-row]").forEach(function(row){row.querySelectorAll("[data-key]").forEach(function(input){input.oninput=function(){form.operation[key][Number(row.dataset.operationRow)][input.dataset.key]=input.value;};});});});
    root.querySelectorAll("[data-material-row]").forEach(function(row){row.querySelectorAll("[data-key]").forEach(function(input){input.oninput=function(){form.operation.material[Number(row.dataset.materialRow)][input.dataset.key]=input.value;};});});
    root.querySelectorAll("[data-result-row]").forEach(function(row){row.querySelectorAll("[data-key]").forEach(function(input){input.oninput=function(){var item=form.results[Number(row.dataset.resultRow)];item[input.dataset.key]=input.value;if(input.dataset.key==="item"&&!clean(item.unit))item.unit=resultUnit(input.value);};});});
    byId("rhxSamplers").oninput=function(e){form.sampling.samplers=e.target.value.split(/[,\n]/).map(clean).filter(Boolean);};
    byId("rhxShowAll").onchange=function(e){w.showAll=!!e.target.checked;renderWizard();};
    if(byId("rhxAddPrevention"))byId("rhxAddPrevention").onclick=function(){form.sampling.prevention_rows.push({name:"",target:"",efficiency:"확인불가"});renderWizard();};
    root.querySelectorAll("[data-remove-prevention]").forEach(function(b){b.onclick=function(){form.sampling.prevention_rows.splice(Number(b.dataset.removePrevention),1);if(!form.sampling.prevention_rows.length)form.sampling.prevention_rows.push({name:"",target:"",efficiency:"확인불가"});renderWizard();};});
    root.querySelectorAll("[data-add-operation]").forEach(function(b){b.onclick=function(){form.operation[b.dataset.addOperation].push({amount:"",unit:""});renderWizard();};});
    root.querySelectorAll("[data-remove-operation]").forEach(function(b){b.onclick=function(){var p=b.dataset.removeOperation.split(":"),key=p[0],index=Number(p[1]);form.operation[key].splice(index,1);if(!form.operation[key].length)form.operation[key].push({amount:"",unit:""});renderWizard();};});
    byId("rhxAddResult").onclick=function(){form.results.push({item:"",unit:"",limit:"",result:"",time:"",method:"",memo:""});renderWizard();};
    root.querySelectorAll("[data-remove-result]").forEach(function(b){b.onclick=function(){form.results.splice(Number(b.dataset.removeResult),1);if(!form.results.length)form.results.push({item:"",unit:"",limit:"",result:"",time:"",method:"",memo:""});renderWizard();};});
    byId("rhxWizardBack").onclick=byId("rhxWizardCancel").onclick=function(){state.wizard=null;renderCompanyFolder();};
    ["rhxSaveDraft","rhxSaveDraft2"].forEach(function(id){byId(id).onclick=function(){saveWizard(false);};});["rhxGenerate","rhxGenerate2"].forEach(function(id){byId(id).onclick=function(){saveWizard(true);};});
    var linked=templateMeta(form).linked;
    ["rhxGenerate","rhxGenerate2"].forEach(function(id){var button=byId(id);if(button){button.disabled=!linked||w.busy;if(!linked)button.title="시설별 기준 양식을 등록한 뒤 생성할 수 있습니다.";}});
    if(byId("rhxGoTemplate"))byId("rhxGoTemplate").onclick=function(){state.wizard=null;renderCompanyFolder();var panel=root.querySelector(".rhxt-section");if(panel)panel.scrollIntoView({block:"start"});};
    var addMaterial=byId("rhxAddMaterial");if(addMaterial)addMaterial.onclick=function(){form.operation.material.push({amount:"",type:"",unit:""});renderWizard();};
    root.querySelectorAll("[data-add-material]").forEach(function(b){b.onclick=function(){form.operation.material.push({amount:"",type:"",unit:""});renderWizard();};});
    root.querySelectorAll("[data-remove-material]").forEach(function(b){b.onclick=function(){form.operation.material.splice(Number(b.dataset.removeMaterial),1);if(!form.operation.material.length)form.operation.material.push({amount:"",type:"",unit:""});renderWizard();};});
  }

  function reportPayload(w){var form=ensureArrays(w.form),source=w.source,company=findCompany(source)||{},facility=findFacility(company,source)||{};form.receipt_no=sourceReceipt(source);return {source_receipt_no:sourceReceipt(source),report_no:sourceReceipt(source),company_id:clean(company.Id)||null,company_name:clean(form.requester.company||sourceCompany(source)),facility_id:clean(facility.Id)||null,facility_name:clean(form.request.stack_name||sourceFacility(source)),measurement_date:isoDate(form.sampling.date||source.measure_date)||null,report_year:yearOf(form.sampling.date||source.measure_date,state.year),status:w.report&&w.report.status||"draft",issue_date:isoDate(form.issue_date)||null,form_data:form,updated_by:currentUser()&&currentUser().id||null,updated_at:new Date().toISOString()};}
  async function persistReport(){
    var w=state.wizard,db=database(),user=currentUser();if(!w||!db||!user)throw new Error("온라인 DB에 로그인해주세요.");var payload=reportPayload(w),result;
    if(w.report&&w.report.id)result=await db.from(REPORT_TABLE).update(payload).eq("id",w.report.id).is("archived_at",null).select("*").single();else{payload.created_by=user.id;result=await db.from(REPORT_TABLE).insert(payload).select("*").single();}
    if(result.error)throw result.error;w.report=result.data;state.reports=state.reports.filter(function(row){return String(row.id)!==String(result.data.id);});state.reports.push(result.data);return result.data;
  }
  async function saveWizard(generate){
    var w=state.wizard;if(!w||w.busy)return;if(generate&&(!templateMeta(w.form).linked||!templateManager().validateAssociation(w.source,templateManager().getById(w.form.template_ref.id))))return window.alert("현재 접수자료와 업체·시설이 일치하는 기준 양식을 먼저 연결해주세요.");var units=unitIssues(w.form),pageIssues=onePageIssues(w.form);if(units.length)return window.alert("다음 단위를 입력해주세요.\n\n"+units.join("\n"));if(generate&&pageIssues.length)return window.alert("1페이지 유지를 위해 항목 수를 확인해주세요.\n\n"+pageIssues.join("\n"));if(!clean(w.form.requester.company))return window.alert("상호(사업장명)를 입력해주세요.");
    w.busy=true;toggleWizardBusy(true,generate?"HWPX 생성 중":"저장 중");
    try{var blob=generate?await generateHwpx(w.form):null;var report=await persistReport();if(!generate){window.alert("입력값을 저장했습니다. 기존 접수·LAB 원본은 변경하지 않았습니다.");renderWizard();return;}var file=await storeGeneratedFile(report,blob);downloadBlob(blob,file.file_name);state.wizard=null;await loadData(true);window.alert("원본 양식의 HWPX를 생성하고 웹에 v"+file.version_no+"으로 저장했습니다.\n다운로드한 파일은 한글에서 자유롭게 수정할 수 있습니다.");}
    catch(error){window.alert((generate?"HWPX 생성·저장 실패":"입력값 저장 실패")+"\n\n"+migrationMessage(error));}
    finally{w.busy=false;toggleWizardBusy(false);}
  }
  function toggleWizardBusy(busy,text){["rhxSaveDraft","rhxSaveDraft2","rhxGenerate","rhxGenerate2"].forEach(function(id){var b=byId(id);if(b)b.disabled=busy||((id==="rhxGenerate"||id==="rhxGenerate2")&&!templateMeta(state.wizard&&state.wizard.form).linked);});if(busy){var b=byId("rhxGenerate");if(b)b.textContent=text;}else{var g=byId("rhxGenerate"),g2=byId("rhxGenerate2");if(g)g.textContent="HWPX 생성·저장·다운로드";if(g2)g2.textContent="HWPX 생성·저장·다운로드";}}

  function splitBalanced(rows,slots){var out=Array.from({length:slots},function(){return [];});var count=rows.length,per=Math.ceil(count/slots);rows.forEach(function(row,index){out[Math.min(slots-1,Math.floor(index/per))].push(row);});return out;}
  function joinLines(rows,key,transform){return rows.map(function(row){var v=clean(row&&row[key]);return transform?transform(v,row):v;}).join("\n");}
  function operationLines(rows){return (rows||[]).filter(function(row){return clean(row&&row.amount);}).map(function(row){return withUnit(row.amount,row.unit,false);}).join("\n");}
  function mapTemplateValues(form){
    form=ensureArrays(form);var prevention=splitBalanced(form.sampling.prevention_rows,2),results=splitBalanced(form.results,2),materials=form.operation.material.filter(function(row){return clean(row&&row.amount)||clean(row&&row.type);}),issuer=form.issuer||{},date=isoDate(form.issue_date),dateKo=date?Number(date.slice(0,4))+" 년 "+Number(date.slice(5,7))+" 월 "+Number(date.slice(8,10))+" 일":"2026 년 00 월 00 일";
    var map={
      "상호_사업장명":form.requester.company,"업종":form.general.industry,"사업장소재지(주소)":form.requester.address,"시설 종류":form.general.facility_type,"대표자(의뢰인)":form.requester.representative,"사업장 종별":form.general.grade,"환경기술인":form.requester.environment_engineer,
      "측정용도":form.request.purpose,"굴뚝 명칭":form.request.stack_name,"높이":withUnit(form.request.height,"m",true),"안지름":withUnit(form.request.diameter,"m",true),"굴뚝 종별":form.request.stack_type,"의 뢰 항 목":form.request.items,
      "날씨":form.sampling.weather,"기온":withUnit(form.sampling.temperature,"℃",true),"습도":withUnit(form.sampling.humidity,"%",true),"기압":withUnit(form.sampling.pressure,"mmHg",true),"풍향":form.sampling.wind_direction,"풍속":withUnit(form.sampling.wind_speed,"m/s",true),
      "표준산소농도":withUnit(form.sampling.standard_oxygen,"%",true),"실측산소농도":withUnit(form.sampling.measured_oxygen,"%",true),"수분량":withUnit(form.sampling.moisture,"%",true),"배출가스온도":withUnit(form.sampling.gas_temperature,"℃",true),"배출가스 유속":withUnit(form.sampling.gas_velocity,"m/s",true),"기타":form.sampling.other,
      "방지시설 명칭1":joinLines(prevention[0],"name"),"방지시설 대상물질1":joinLines(prevention[0],"target"),"방지시설방지효율1":joinLines(prevention[0],"efficiency",function(v){return withUnit(v,"%",true);}),"방지시설 명칭2":joinLines(prevention[1],"name"),"방지시설 대상물질2":joinLines(prevention[1],"target"),"방지시설방지효율2":joinLines(prevention[1],"efficiency",function(v){return withUnit(v,"%",true);}),
      "채취일":form.sampling.date,"시료채취자1":samplerSignature(form.sampling.samplers[0]),"시료채취자2":samplerSignature(form.sampling.samplers[1]),"채취시간":compactResultTime(form.sampling.time,""),
      "배출시설 명칭":form.operation.emission_facility,"연료사용량":operationLines(form.operation.fuel),"제품생산량":operationLines(form.operation.product),"소각량":operationLines(form.operation.incineration),"원료투입량":joinLines(materials,"amount"),"종류":joinLines(materials,"type"),"단위":joinLines(materials,"unit"),"방지시설":form.operation.prevention_facility,
      "측정항목1":joinLines(results[0],"item",function(v,row){return itemWithUnit(v,row.unit);}),"허용기준1":joinLines(results[0],"limit"),"측정분석값1":joinLines(results[0],"result"),"측정시간1":joinLines(results[0],"time",function(v){return compactResultTime(v,form.sampling.date);}),"측정분석방법1":joinLines(results[0],"method",function(v){return formatMethod(v,results[0].length===1);}),"비고1":joinLines(results[0],"memo"),
      "측정항목2":joinLines(results[1],"item",function(v,row){return itemWithUnit(v,row.unit);}),"허용기준2":joinLines(results[1],"limit"),"측정분석값2":joinLines(results[1],"result"),"측정시간2":joinLines(results[1],"time",function(v){return compactResultTime(v,form.sampling.date);}),"측정분석방법2":joinLines(results[1],"method",function(v){return formatMethod(v,results[1].length===1);}),"비고2":joinLines(results[1],"memo"),
      "분석기간":form.analysis_period,"상호":issuer.company||"드림포이엔","소재지 및 연락처1":issuer.address||"경기 안양시 만안구 덕천로152번길 25 (안양동) 비동 2005호","소재지 및 연락처2":issuer.phone||"031-420-2156","대표자 성명":issuer.representative||"하준명","발급번호":form.receipt_no
    };
    map.__cell={"배출가스유량(산소보정전)":withUnit(form.sampling.flow_before,"S㎥/분",true),"배출가스유량(산소보정후)":withUnit(form.sampling.flow_after,"S㎥/분",true)};map.__dateKo=dateKo;return map;
  }
  function xmlEscape(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c];});}
  function inlineXml(value){return String(value==null?"":value).split(/\r?\n/).map(xmlEscape).join('</hp:t><hp:lineBreak/><hp:t>');}
  function regexEscape(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
  function setNamedCell(xml,name,value){
    var re=new RegExp('(<hp:tc\\b[^>]*\\bname="'+regexEscape(name)+'"[^>]*>)([\\s\\S]*?)(</hp:tc>)');
    return xml.replace(re,function(all,start,body,end){var first=true,replaced=body.replace(/<hp:t(?:\s[^>]*)?>[\s\S]*?<\/hp:t>/g,function(){if(!first)return "";first=false;return '<hp:t>'+inlineXml(value)+'</hp:t>';});replaced=replaced.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,"");return start+replaced+end;});
  }
  function replacePlaceholder(xml,key,value){
    var token="$"+key+"$",paragraph=/<hp:p\b[\s\S]*?<\/hp:p>/g;
    return xml.replace(paragraph,function(block){if(block.indexOf(token)<0)return block;return block.split(token).join(inlineXml(value)).replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,"");});
  }
  function replacePreviewText(text,map){Object.keys(map).forEach(function(key){if(key.indexOf("__")===0)return;text=text.split("$"+key+"$").join(clean(map[key]));});[map.__cell["배출가스유량(산소보정전)"],map.__cell["배출가스유량(산소보정후)"]].forEach(function(value){text=text.replace("$배출가스유량$",clean(value));});text=text.replace(/\$측(?=>)/g,clean(map["측정분석방법2"]));return text.replace(/2026\s*년\s*00\s*월\s*00\s*일/g,map.__dateKo);}
  async function embedCompanySeal(zip){
    var sealResponse=await fetch(SEAL_URL,{cache:"no-store"});if(!sealResponse.ok)throw new Error("회사 직인 원본을 불러오지 못했습니다. assets/qualification_seal.jpg 파일을 확인해주세요.");
    zip.file("BinData/image2.jpg",await sealResponse.arrayBuffer());var manifest=zip.file("Contents/content.hpf");if(!manifest)throw new Error("HWPX 원본양식에서 Contents/content.hpf를 찾지 못했습니다.");
    var content=await manifest.async("string"),item='<opf:item id="image2" href="BinData/image2.jpg" media-type="image/jpg" isEmbeded="1"/>';
    if(/<opf:item\b[^>]*\bid="image2"[^>]*\/>/.test(content))content=content.replace(/<opf:item\b[^>]*\bid="image2"[^>]*\/>/,item);else content=content.replace("</opf:manifest>",item+"</opf:manifest>");
    zip.file("Contents/content.hpf",content);
  }
  async function generateHwpx(form){
    var manager=templateManager();if(!manager)throw new Error("기준 양식 구성요소를 불러오지 못했습니다.");
    return manager.generate(form,form.template_ref,state.wizard&&state.wizard.form===form?state.wizard.source:null);
  }

  async function nextVersion(reportId){var versions=state.files.filter(function(file){return String(file.report_id)===String(reportId);}).map(function(file){return Number(file.version_no)||0;});return (versions.length?Math.max.apply(Math,versions):0)+1;}
  function generatedFileName(report,version){return safeName(report.report_no||report.source_receipt_no)+"_"+safeName(report.company_name)+"_"+safeName(report.facility_name)+"_성적서_v"+version+".hwpx";}
  async function uploadFileRecord(report,blob,fileName,role,mime,formSnapshot){
    var db=database(),user=currentUser();if(!db||!user)throw new Error("온라인 DB에 로그인해주세요.");var version=await nextVersion(report.id),path=reportStoragePath(report,fileName),upload=await db.storage.from(BUCKET).upload(path,blob,{contentType:mime||blob.type||"application/octet-stream",upsert:false});if(upload.error)throw upload.error;
    var payload={report_id:report.id,source_receipt_no:report.source_receipt_no||report.report_no,company_id:report.company_id,company_name:report.company_name,report_year:report.report_year,file_name:fileName,storage_path:path,file_role:role,version_no:version,form_snapshot:formSnapshot||null,mime_type:mime||blob.type||"application/octet-stream",file_size:Number(blob.size)||0,created_by:user.id,updated_by:user.id},saved=await db.from(FILE_TABLE).insert(payload).select("*").single();if(saved.error){await db.storage.from(BUCKET).remove([path]);throw saved.error;}state.files.unshift(saved.data);return saved.data;
  }
  async function storeGeneratedFile(report,blob){var version=await nextVersion(report.id),name=generatedFileName(report,version);return uploadFileRecord(report,blob,name,"generated","application/hwp+zip",clone(report.form_data||{}));}
  function downloadBlob(blob,name){var url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name||"성적서.hwpx";a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);}

  function bindDrop(){
    var zone=byId("rhxDropZone"),input=byId("rhxFileInput"),select=byId("rhxUploadReport");if(!zone||!input)return;
    zone.onclick=function(event){if(event.target===input||event.target===select)return;if(!select.value)return window.alert("먼저 연결할 접수번호를 선택해주세요.");input.click();};input.onchange=function(){uploadRevisions(input.files,select.value);};
    ["dragenter","dragover"].forEach(function(type){zone.addEventListener(type,function(e){e.preventDefault();e.stopPropagation();zone.classList.add("dragging");});});["dragleave","drop"].forEach(function(type){zone.addEventListener(type,function(e){e.preventDefault();e.stopPropagation();zone.classList.remove("dragging");if(type==="drop"){if(!select.value)return window.alert("먼저 연결할 접수번호를 선택해주세요.");uploadRevisions(e.dataTransfer&&e.dataTransfer.files,select.value);}});});
  }
  async function uploadRevisions(fileList,reportId){
    if(state.uploadBusy)return;var report=state.reports.find(function(r){return String(r.id)===String(reportId);});if(!report)return window.alert("연결할 접수번호를 선택해주세요.");var files=Array.prototype.slice.call(fileList||[]).filter(function(file){return file&&file.name&&/\.(hwpx|hwp|pdf)$/i.test(file.name)&&Number(file.size)<=MAX_FILE_SIZE;});if(!files.length)return window.alert("HWPX, HWP 또는 PDF 파일을 선택해주세요. 파일당 최대 50MB입니다.");state.uploadBusy=true;
    try{for(var i=0;i<files.length;i++){var f=files[i],ext=(f.name.split(".").pop()||"").toLowerCase(),role=ext==="pdf"?"pdf":"revised";await uploadFileRecord(report,f,f.name,role,f.type||(ext==="hwpx"?"application/hwp+zip":"application/octet-stream"));}await loadData(true);window.alert("수정파일을 새 버전으로 저장했습니다. 이전 파일도 그대로 보관됩니다.");}catch(error){window.alert("수정파일 업로드 실패\n\n"+migrationMessage(error));}finally{state.uploadBusy=false;var input=byId("rhxFileInput");if(input)input.value="";}
  }
  async function storedBlob(file){var db=database();if(!db||!file)throw new Error("파일 정보를 찾지 못했습니다.");var result=await db.storage.from(BUCKET).download(file.storage_path);if(result.error)throw result.error;return result.data;}
  function reportForFile(file){return state.reports.find(function(r){return String(r.id)===String(file&&file.report_id);})||null;}
  async function currentDownloadBlob(file){return storedBlob(file);}
  async function downloadStoredFile(file){try{var blob=await currentDownloadBlob(file);downloadBlob(blob,file.file_name);}catch(error){window.alert("파일을 받지 못했습니다.\n\n"+(error.message||error));}}
  async function openFilePreview(file,autoPrint){
    if(!file)return;try{
      // Preview the stored document itself; a generic HTML form cannot represent facility merges.
      var blob=await storedBlob(file),ext=(file.file_name.split(".").pop()||"").toLowerCase();if(ext==="hwpx")return openHwpxImagePreview(file,blob,autoPrint);if(autoPrint&&ext==="pdf"){var url=URL.createObjectURL(blob),w=window.open(url,"_blank");if(!w)window.alert("인쇄 창이 차단되었습니다.");setTimeout(function(){URL.revokeObjectURL(url);},60000);return;}
      var preview=window.DF_QUALITY_FILE_PREVIEW;if(!preview||typeof preview.open!=="function")throw new Error("파일 미리보기 모듈을 불러오지 못했습니다.");await preview.open({name:file.file_name,mime:file.mime_type,size:file.file_size,blob:blob});
    }catch(error){window.alert("미리보기를 열지 못했습니다.\n\n"+(error.message||error));}
  }
  function previewForm(raw){
    var form=ensureArrays(clone(raw||{}));
    form.request.height=withUnit(form.request.height,"m",true);form.request.diameter=withUnit(form.request.diameter,"m",true);
    [["temperature","℃"],["humidity","%"],["pressure","mmHg"],["wind_speed","m/s"],["standard_oxygen","%"],["measured_oxygen","%"],["flow_before","S㎥/분"],["flow_after","S㎥/분"],["moisture","%"],["gas_temperature","℃"],["gas_velocity","m/s"]].forEach(function(pair){form.sampling[pair[0]]=withUnit(form.sampling[pair[0]],pair[1],true);});
    form.sampling.prevention_rows.forEach(function(row){row.efficiency=withUnit(row.efficiency,"%",true);});
    ["fuel","product","incineration"].forEach(function(key){form.operation[key].forEach(function(row){row.amount=withUnit(row.amount,row.unit,false);});});
    form.results.forEach(function(row){row.item=itemWithUnit(row.item,row.unit);});return form;
  }
  function openGeneratedPreview(report,snapshot,autoPrint){var css="report_writer.css?v=120372100",base="";try{base=new URL(".",document.baseURI).href;css=new URL(css,document.baseURI).href;}catch(ignore){}var title=(report.report_no||"성적서")+" "+(report.company_name||""),html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="'+attr(base)+'"><title>'+esc(title)+'</title><link rel="stylesheet" href="'+attr(css)+'"></head><body class="rpt-print-window"><div class="rpt-print-tools"><b>'+esc(title)+'</b><button onclick="window.print()">인쇄 / PDF</button></div><main class="rpt-print-document">'+legacy._test.sheetHtml(previewForm(snapshot),true)+'</main>'+(autoPrint?'<script>addEventListener("load",function(){setTimeout(function(){print()},500)})<\/script>':'')+'</body></html>';var w=window.open("","_blank");if(!w)return window.alert("미리보기 창이 차단되었습니다.");w.document.write(html);w.document.close();}
  async function openHwpxImagePreview(file,blob,autoPrint){
    if(!window.JSZip)throw new Error("HWPX 미리보기 구성요소를 불러오지 못했습니다.");var zip=await window.JSZip.loadAsync(await blob.arrayBuffer()),entry=zip.file("Preview/PrvImage.png");if(!entry)throw new Error("이 HWPX에는 한글 미리보기 이미지가 없습니다. 파일을 한글에서 열어 저장한 뒤 다시 올려주세요.");var imageBlob=await entry.async("blob"),url=URL.createObjectURL(imageBlob);revokePreview();state.previewUrl=url;
    var old=byId("rhxPreviewModal");if(old)old.remove();var modal=document.createElement("div");modal.id="rhxPreviewModal";modal.className="rhx-preview-modal";modal.innerHTML='<div class="rhx-preview-card"><header><div><b>'+esc(file.file_name)+'</b><small>HWPX에 저장된 문서 미리보기 이미지입니다.</small></div><nav><button class="rhx-btn" id="rhxPreviewDownload">다운로드</button><button class="rhx-btn" id="rhxPreviewPrint">인쇄</button><button class="rhx-btn" id="rhxPreviewClose">닫기</button></nav></header><div class="rhx-preview-body"><img src="'+attr(url)+'" alt="'+attr(file.file_name)+'"></div></div>';document.body.appendChild(modal);byId("rhxPreviewClose").onclick=function(){modal.remove();revokePreview();};byId("rhxPreviewDownload").onclick=function(){downloadBlob(blob,file.file_name);};byId("rhxPreviewPrint").onclick=function(){printImage(url,file.file_name);};modal.onclick=function(e){if(e.target===modal){modal.remove();revokePreview();}};if(autoPrint)setTimeout(function(){printImage(url,file.file_name);},350);
  }
  function printImage(url,title){var w=window.open("","_blank");if(!w)return window.alert("인쇄 창이 차단되었습니다.");w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;background:#fff}img{display:block;width:210mm;height:297mm;object-fit:contain;margin:0 auto}</style></head><body><img src="'+attr(url)+'"><script>addEventListener("load",function(){setTimeout(function(){print()},250)})<\/script></body></html>');w.document.close();}
  function revokePreview(){if(state.previewUrl){try{URL.revokeObjectURL(state.previewUrl);}catch(ignore){}state.previewUrl="";}}
  async function archiveFile(file){if(!file||!window.confirm('"'+file.file_name+'" 파일을 목록에서 삭제할까요?\n원본 접수자료와 다른 버전은 유지됩니다.'))return;var db=database(),user=currentUser();try{var result=await db.from(FILE_TABLE).update({archived_at:new Date().toISOString(),archived_by:user&&user.id,updated_by:user&&user.id}).eq("id",file.id).is("archived_at",null);if(result.error)throw result.error;state.files=state.files.filter(function(row){return String(row.id)!==String(file.id);});renderCompanyFolder();}catch(error){window.alert("파일을 삭제하지 못했습니다.\n\n"+migrationMessage(error));}}

  function openReports(){if(!canUse()){var root=byId("dfMeasurementReportApp");if(root)root.innerHTML='<div class="rhx-error"><b>드림포이엔 자료실 열람 권한이 필요합니다.</b></div>';return;}loadData(false);}
  function health(){return {version:VERSION,ok:!!byId("dfMeasurementReportApp"),sources:state.sources.length,reports:state.reports.length,files:state.files.length};}
  function init(){loadFilters();legacy=window.DF_REPORT_WRITER||{};
    if(templateManager())templateManager().configure({database:database,currentUser:currentUser,companies:sourceCompanies,downloadBlob:downloadBlob,onChanged:function(){render();}});window.DF_REPORT_WRITER=Object.assign({},legacy,{version:VERSION,openReports:openReports,healthHwpx:health,_hwpxTest:{mapTemplateValues:mapTemplateValues,unitIssues:unitIssues,onePageIssues:onePageIssues,setNamedCell:setNamedCell,replacePlaceholder:replacePlaceholder,generateHwpx:generateHwpx,embedCompanySeal:embedCompanySeal,currentDownloadBlob:currentDownloadBlob,compactResultTime:compactResultTime,formatMethod:formatMethod,withUnit:withUnit,resultUnit:resultUnit,reportStoragePath:reportStoragePath}});diag("info","HWPX 간편 성적서 모듈 준비 완료","시설별 원본 양식 자동 연결 · 셀 병합 보존 · 저장 파일 버전 유지");}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();

