/* DREAMFOREN v120.37.21.0
 * 성적서작성
 * 1. 성적서: 첨부 HWPX 대기 측정기록부 양식 기반
 * 2. 반기별자가측정결과보고서: 업체별 작성 가능 여부와 반기 자료 관리
 * 기존 일정·시료채취·LAB·자료실 원본은 조회만 하며 별도 테이블에 저장합니다.
 */
(function dfReportWriterModule(){
  "use strict";

  var VERSION="v120.37.21.0";
  var REPORT_TABLE="measurement_reports";
  var METHOD_TABLE="measurement_report_methods";
  var HALF_TABLE="half_year_reports";
  var HALF_FILE_TABLE="half_year_report_files";
  var FILE_BUCKET="quality-documents";
  var MAX_FILE_SIZE=50*1024*1024;
  var FILTER_KEY="dreampoen_report_writer_filters_v12037210";
  var HALF_FILTER_KEY="dreampoen_half_year_filters_v12037210";
  var METHOD_DEFAULT={
    id:"default-dust",
    item_key:"먼지",
    method_name:"반자동식 측정법",
    instrument_name:"입자상 굴뚝시료채취장치",
    display_text:"반자동식 측정법 (입자상 굴뚝시료채취장치)",
    active:true,
    sort_order:10,
    local:true
  };
  var state={
    year:new Date().getFullYear(),
    query:"",
    filter:"all",
    sources:[],
    reports:[],
    methods:[METHOD_DEFAULT],
    selectedCompany:"",
    current:null,
    loaded:false,
    loading:false,
    error:"",
    fitObserver:null,
    fitFrame:0
  };
  var half={
    year:new Date().getFullYear(),
    period:new Date().getMonth()<6?1:2,
    query:"",
    filter:"all",
    sources:[],
    reports:[],
    records:[],
    files:[],
    selectedCompany:"",
    current:null,
    loaded:false,
    loading:false,
    error:"",
    fileBusy:false
  };

  function byId(id){return document.getElementById(id);}
  function clean(value){return String(value==null?"":value).trim();}
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function attr(value){return esc(value).replace(/\r?\n/g,"&#10;");}
  function clone(value){return JSON.parse(JSON.stringify(value==null?{}:value));}
  function num(value){var n=parseFloat(String(value==null?"":value).replace(/,/g,""));return Number.isFinite(n)?n:null;}
  function average(values){var list=(values||[]).map(num).filter(Number.isFinite);return list.length?list.reduce(function(a,b){return a+b;},0)/list.length:null;}
  function sum(values){return (values||[]).map(num).filter(Number.isFinite).reduce(function(a,b){return a+b;},0);}
  function fixed(value,digits){return Number.isFinite(value)?Number(value).toFixed(digits):"";}
  function isoDate(value){var m=clean(value).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);return m?m[1]+"-"+String(Number(m[2])).padStart(2,"0")+"-"+String(Number(m[3])).padStart(2,"0"):"";}
  function yearOf(value,fallback){var date=isoDate(value);return date?Number(date.slice(0,4)):(Number(fallback)||new Date().getFullYear());}
  function norm(value){return clean(value).toLowerCase().replace(/주식회사|\(주\)|㈜/g,"").replace(/[\s\-_/().,\[\]]+/g,"");}
  function safeFileName(value){return clean(value).replace(/[\\/:*?"<>|#%]+/g,"_").slice(0,180)||"file";}
  function storageId(){return Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);}
  function database(){try{return typeof dfSupabase!=="undefined"?dfSupabase:null;}catch(ignore){return null;}}
  function currentUser(){try{return typeof dfCloudUser!=="undefined"?dfCloudUser:null;}catch(ignore){return null;}}
  function currentProfile(){try{return typeof dfCloudProfile!=="undefined"?dfCloudProfile:null;}catch(ignore){return null;}}
  function canUse(){
    var p=currentProfile(),role=clean(p&&p.role).toLowerCase(),access=p&&(p.access_permissions||p.board_permissions||{});
    return !!p&&(role==="admin"||role==="관리자"||access.repository!==false);
  }
  function diag(level,message,detail){try{if(window.DF_DIAG&&typeof window.DF_DIAG[level]==="function")window.DF_DIAG[level]("REPORT-WRITER",message,detail||"");}catch(ignore){}}
  function loadStoredFilters(){
    try{
      var a=JSON.parse(sessionStorage.getItem(FILTER_KEY)||"null")||{};
      if(Number(a.year))state.year=Number(a.year);state.query=clean(a.query);state.filter=clean(a.filter)||"all";
      var b=JSON.parse(sessionStorage.getItem(HALF_FILTER_KEY)||"null")||{};
      if(Number(b.year))half.year=Number(b.year);if(Number(b.period)===1||Number(b.period)===2)half.period=Number(b.period);half.query=clean(b.query);half.filter=clean(b.filter)||"all";
    }catch(ignore){}
  }
  function saveFilters(){
    try{
      sessionStorage.setItem(FILTER_KEY,JSON.stringify({year:state.year,query:state.query,filter:state.filter}));
      sessionStorage.setItem(HALF_FILTER_KEY,JSON.stringify({year:half.year,period:half.period,query:half.query,filter:half.filter}));
    }catch(ignore){}
  }
  function migrationMessage(error){
    var message=error&&error.message||String(error||"");
    if(/measurement_reports|measurement_report_methods|half_year_reports|half_year_report_files|schema cache|PGRST205|42P01|does not exist/i.test(message))return "성적서작성 DB 업데이트가 필요합니다. 35_v12037210_report_writer.sql 파일을 먼저 실행해주세요.";
    return message||"온라인 자료를 불러오지 못했습니다.";
  }
  async function fetchPages(table,columns,decorate){
    var db=database();if(!db)throw new Error("온라인 DB에 연결되어 있지 않습니다.");
    var output=[];
    for(var from=0;;from+=1000){
      var query=db.from(table).select(columns);
      if(typeof decorate==="function")query=decorate(query);
      var result=await query.range(from,from+999);
      if(result.error)throw result.error;
      var rows=result.data||[];output.push.apply(output,rows);
      if(rows.length<1000)break;
    }
    return output;
  }
  function sourceCompanies(){
    try{
      var rows=typeof dfV75SourceCompanies==="function"?dfV75SourceCompanies():((typeof companyState!=="undefined"&&companyState&&companyState.db&&companyState.db.Companies)||[]);
      return (rows||[]).filter(function(row){return row&&row.Active!==false;});
    }catch(ignore){return [];}
  }
  function sourceData(row){return row&&row.measurement_data&&row.measurement_data.data||null;}
  function sourceFields(row){var data=sourceData(row);return data&&data.fields||{};}
  function sourceDeleted(row){return !!(row&&row.measurement_data&&(row.measurement_data.deleted===true||row.measurement_data._deleted===true));}
  function sourceReceipt(row){return clean(row&&row.receipt_no||sourceFields(row).receiptNo);}
  function sourceCompanyName(row){return clean(row&&row.company_name||sourceFields(row).company);}
  function sourceFacilityName(row){return clean(row&&row.facility_name||sourceFields(row).facility);}
  function findCompany(rowOrName){
    var rows=sourceCompanies(),fields=typeof rowOrName==="string"?{}:sourceFields(rowOrName),name=typeof rowOrName==="string"?rowOrName:sourceCompanyName(rowOrName);
    var id=clean(fields.companyDbId);
    return rows.find(function(c){return id&&String(c.Id)===id;})||rows.find(function(c){return norm(c.Name)===norm(name);})||rows.find(function(c){var a=norm(c.Name),b=norm(name);return a.length>=4&&b.length>=4&&(a.indexOf(b)>=0||b.indexOf(a)>=0);})||null;
  }
  function findFacility(company,row){
    var fields=sourceFields(row),id=clean(fields.facilityDbId),name=sourceFacilityName(row),facilities=company&&Array.isArray(company.Facilities)?company.Facilities:[];
    return facilities.find(function(f){return id&&String(f.Id)===id;})||facilities.find(function(f){return [f.FacilityName,f.PreventionFacility].some(function(v){return norm(v)===norm(name);});})||facilities.find(function(f){return [f.FacilityName,f.PreventionFacility].some(function(v){var a=norm(v),b=norm(name);return a.length>=4&&b.length>=4&&(a.indexOf(b)>=0||b.indexOf(a)>=0);});})||null;
  }
  function canon(name){
    var n=clean(name).replace(/\s/g,"");
    if(/먼지/i.test(n))return "먼지";
    if(/총탄화수소|THC/i.test(n))return "총탄화수소";
    if(/질소산화물|NOX/i.test(n))return "질소산화물";
    if(/황산화물|SOX/i.test(n))return "황산화물";
    if(/일산화탄소|CO(?!2)/i.test(n))return "일산화탄소";
    if(/염화수소/i.test(n))return "염화수소";
    if(/플루오린|불소/i.test(n))return "플루오린화합물";
    if(/암모니아/i.test(n))return "암모니아";
    if(/황화수소/i.test(n))return "황화수소";
    if(/사이안화수소|시안화수소/i.test(n))return "사이안화수소";
    if(/브로민|브롬/i.test(n))return "브로민화합물";
    if(/폼알데하이드|포름알데하이드/i.test(n))return "폼알데하이드";
    if(/구리/i.test(n))return "구리화합물";
    if(/크로뮴|크롬/i.test(n))return "크로뮴화합물";
    if(/니켈/i.test(n))return "니켈화합물";
    if(/아연/i.test(n))return "아연화합물";
    if(/납/i.test(n))return "납화합물";
    if(/비소/i.test(n))return "비소화합물";
    if(/베릴륨/i.test(n))return "베릴륨";
    if(/카드뮴/i.test(n))return "카드뮴화합물";
    return clean(name);
  }
  function sourceItems(row){
    var data=sourceData(row)||{},fields=data.fields||{},items=[];
    function add(value){value=clean(value);if(value&&!items.some(function(x){return canon(x)===canon(value);}))items.push(value);}
    if(data.recordType==="dust"||data.recordType==="combo")add("먼지");
    if(data.recordType==="metal"||data.recordType==="combo"){
      var metals=Array.isArray(data.metalItems)&&data.metalItems.length?data.metalItems:(fields.metalAnalyte?[fields.metalAnalyte]:[]);
      metals.forEach(add);
    }
    (data.gasRows||[]).forEach(function(g){add(g.item||g.name||g.pollutant);});
    return items;
  }
  function atmMmHg(fields){
    var pa=num(fields&&fields.locationPressure);if(pa===null)pa=num(fields&&fields.pressure);
    if(pa!==null&&pa>800)pa*=0.750061683;
    return pa;
  }
  function stackMetrics(row){
    var data=sourceData(row)||{},fields=data.fields||{},points=data.recordType==="combo"?(data.comboDustPoints||data.points||[]):(data.points||[]);
    var moist=average(data.moist)||0,o2=average(data.o2vals),co2=average(data.co2vals)||0,pa=atmMmHg(fields);
    var temp=average(points.map(function(p){return p.temp;})),staticPressure=average(points.map(function(p){return p.static;})),dynamic=average(points.map(function(p){return p.dynamic;}));
    var n2=100-(o2||0)-co2,md=.32*(o2||0)+.44*co2+.28*n2,ms=md*(1-moist/100)+(moist/100)*18.01;
    var pStack=(pa||0)+(staticPressure||0)/13.6,r0=(1/(22.4*100))*((28*n2+44*co2+32*(o2||0))*(100-moist)/100+18*moist);
    var density=temp!==null&&pa!==null?r0*273/(273+temp)*pStack/760:null,pitot=num(fields.pitot)||0;
    var velocity=density>0&&dynamic!==null&&dynamic>=0?pitot*Math.sqrt(2*9.81*dynamic/density):null;
    var shape=clean(fields.stackShape)||"round",diameter=num(fields.diameter),w=num(fields.stackW),h=num(fields.stackH);
    var area=shape==="round"&&diameter!==null?Math.PI*Math.pow(diameter,2)/4:(w!==null&&h!==null?w*h:null);
    var flow=area!==null&&velocity!==null&&temp!==null&&pa!==null?area*velocity*273/(273+temp)*pStack/760*(1-moist/100)*60:null;
    var std=num(fields.stdO2),corrected=flow!==null&&std!==null&&std<21&&o2!==null&&o2<21?flow*(21-o2)/(21-std):null;
    return {moist:moist,o2:o2,co2:co2,pa:pa,temp:temp,velocity:velocity,flow:flow,corrected:corrected};
  }
  function dustDefaults(row){
    var data=sourceData(row)||{},fields=data.fields||{},points=data.recordType==="combo"?(data.comboDustPoints||data.points||[]):(data.points||[]);
    var vmLiters=sum(points.map(function(p){return p.volume;})),vm=vmLiters>0?vmLiters/1000:null;
    var meterIn=average(points.map(function(p){return p.meterIn;})),meterOut=average(points.map(function(p){return p.meterOut;})),thetaValues=[meterIn,meterOut].filter(Number.isFinite),theta=thetaValues.length?thetaValues.reduce(function(a,b){return a+b;},0)/thetaValues.length:null;
    var pa=atmMmHg(fields),moist=average(data.moist)||0,o2=average(data.o2vals)||0,co2=average(data.co2vals)||0,n2=100-o2-co2,mdGas=.32*o2+.44*co2+.28*n2,ms=mdGas*(1-moist/100)+(moist/100)*18.01;
    var pitot=num(fields.pitot)||0,nozzle=num(fields.nozzleCm)||0,staticAvg=average(points.map(function(p){return p.static;}))||0,pStack=(pa||0)+staticAvg/13.6,team=clean(data.selectedTeam)||"2",oc=47.6;
    try{if(typeof EQUIPMENT!=="undefined"&&EQUIPMENT&&EQUIPMENT[team]&&Number(EQUIPMENT[team].orificeCoeff))oc=Number(EQUIPMENT[team].orificeCoeff);}catch(ignore){}
    var diffs=[];
    points.forEach(function(p){
      var temp=num(p.temp),dynamic=num(p.dynamic),mi=num(p.meterIn),mo=num(p.meterOut);
      if([temp,dynamic,mi,mo,pa].some(function(v){return v===null;})||!ms||!nozzle||!pitot)return;
      var tm=273+(mi+mo)/2,ts=273+temp,dh=8.009/100000*Math.pow(pitot,2)*oc*(tm*pStack*mdGas)/(ts*pa*ms)*Math.pow(1-moist/100,2)*Math.pow(nozzle*10,4)*dynamic;
      if(Number.isFinite(dh))diffs.push(dh);
    });
    return {vm:vm,theta:theta,pa:pa,deltaH:diffs.length?average(diffs):null};
  }
  var VOC_MW={"벤젠":78.11,"염화비닐":62.5,"디클로로메탄":84.93,"클로로포름":119.38,"1,2-디클로로에탄":98.96,"사염화탄소":153.82,"트리클로로에틸렌":131.39,"테트라클로에틸렌":165.83,"에틸벤젠":106.17,"스타이렌":104.15,"1,3-부타디엔":54.09,"아크릴로니트릴":53.06,"아닐린":93.13};
  function labValuesFor(row,item){
    var lab=row&&row.analysis_data&&row.analysis_data.values&&row.analysis_data.values.lab||{},key=canon(item),keys=Object.keys(lab);
    var exact=keys.find(function(k){return canon(k)===key;})||keys.find(function(k){return canon(k.split(":").slice(-1)[0])===key;});
    return exact?lab[exact]:null;
  }
  function analysisResult(row,item){
    var key=canon(item),values=row&&row.analysis_data&&row.analysis_data.values||{},data=sourceData(row)||{},fields=data.fields||{};
    if(key==="먼지"){
      var before=num(values.dustWeightBefore),after=num(values.dustWeightAfter),d=dustDefaults(row);
      if([before,after,d.vm,d.theta,d.pa,d.deltaH].some(function(v){return v===null;})||d.vm<=0)return "";
      var md=(after-before)*1000,standardVolume=d.vm*(273/(273+d.theta))*((d.pa+d.deltaH/13.6)/760),result=standardVolume>0?md/standardVolume:null;
      var correction=values.dustCorrection===true,o2=average(data.o2vals),std=num(fields.stdO2);
      if(correction&&result!==null&&o2!==null&&std!==null&&o2<21&&std<21)result=result*(21-std)/(21-o2);
      return fixed(result,1);
    }
    if(key==="총탄화수소")return "";
    var v=labValuesFor(row,item);if(!v)return "";
    function n(name){return num(v[name]);}
    var result=null;
    if(["질소산화물","황산화물","일산화탄소"].indexOf(key)>=0){
      var readings=[n("v1"),n("v2"),n("v3")];if(readings.every(Number.isFinite))result=average(readings);
      if(result!==null&&v.correction===true){var measured=average(data.o2vals),standard=num(fields.stdO2);if(measured!==null&&standard!==null&&measured<21&&standard<21)result=result*(21-standard)/(21-measured);}
      return fixed(result,1);
    }
    if(key.indexOf("화합물")>=0&&["구리화합물","크로뮴화합물","니켈화합물","아연화합물","납화합물","비소화합물","카드뮴화합물"].indexOf(key)>=0||key==="베릴륨"){
      if([n("a"),n("b"),n("V"),n("Vs")].every(Number.isFinite)&&n("Vs")>0)result=(n("a")-n("b"))*n("V")/n("Vs");
      return fixed(result,3);
    }
    if(Object.prototype.hasOwnProperty.call(VOC_MW,key)){
      if([n("ms"),n("mb"),n("Vs")].every(Number.isFinite)&&n("Vs")>0)result=(n("ms")-n("mb"))/n("Vs")*22.4/VOC_MW[key];
      return fixed(result,3);
    }
    if(key==="폼알데하이드"){
      if([n("a"),n("b"),n("V"),n("Vs")].every(Number.isFinite)&&n("Vs")>0)result=(2*n("a")-n("b"))*n("V")/n("Vs")*22.4/30.026*0.1429;
      return fixed(result,3);
    }
    if([n("a"),n("b"),n("Vs")].every(Number.isFinite)&&n("Vs")>0){
      if(key==="암모니아")result=(n("a")-n("b"))*25/n("Vs");
      else if(key==="황화수소")result=(n("a")-n("b"))*10/n("Vs")*22.4/32.06;
      else if(key==="사이안화수소")result=(n("a")-n("b"))*10/n("Vs")*22.4/26.017;
      else if(key==="브로민화합물")result=(n("a")-n("b"))*100/n("Vs")*22.4/79.904;
      else if(key==="염화수소")result=(n("a")-n("b"))*100/n("Vs")*22.4/35.453;
      else if(key==="플루오린화합물"){var volume=n("V");if(Number.isFinite(volume))result=(n("a")-n("b"))*volume/n("Vs")*22.4/18.998;}
    }
    return fixed(result,3);
  }
  function itemUnit(item){
    var key=canon(item),massItems=["먼지","구리화합물","크로뮴화합물","니켈화합물","아연화합물","납화합물","비소화합물","카드뮴화합물","베릴륨"];
    return massItems.indexOf(key)>=0?"mg/S㎥":"ppm";
  }
  function itemLimit(facility,item){
    var cycles=facility&&Array.isArray(facility.ItemCycles)?facility.ItemCycles:[];
    var match=cycles.find(function(row){return canon(row.Item)===canon(item);});
    return clean(match&&match.Limit);
  }
  function itemTime(row,item){
    var data=sourceData(row)||{},fields=data.fields||{},date=clean(fields.measureDate||row.measure_date);
    if(canon(item)==="먼지")return [date+" "+clean(fields.particleStart||fields.totalStart),date+" "+clean(fields.particleEnd||fields.totalEnd)].filter(clean).join("\n");
    var gas=(data.gasRows||[]).find(function(g){return canon(g.item||g.name)===canon(item);});
    return gas?[date+" "+clean(gas.start),date+" "+clean(gas.end)].filter(clean).join("\n"):[date+" "+clean(fields.totalStart),date+" "+clean(fields.totalEnd)].filter(clean).join("\n");
  }
  function defaultMethod(item){
    var key=canon(item),rows=state.methods.filter(function(row){return row.active!==false&&(canon(row.item_key)===key||clean(row.item_key)==="*");}).sort(function(a,b){return Number(a.sort_order||0)-Number(b.sort_order||0);});
    return rows.length?clean(rows[0].display_text||[rows[0].method_name,rows[0].instrument_name&&"("+rows[0].instrument_name+")"].filter(Boolean).join(" ")):"";
  }
  function analysisReady(row){
    var items=sourceItems(row);if(!sourceData(row))return false;if(!items.length)return true;
    return items.every(function(item){return clean(analysisResult(row,item))!=="";});
  }
  function reportForReceipt(receipt,reports){
    var list=(reports||state.reports).filter(function(r){return clean(r.source_receipt_no||r.report_no)===clean(receipt)&&!r.archived_at;});
    return list.sort(function(a,b){return clean(b.updated_at).localeCompare(clean(a.updated_at));})[0]||null;
  }
  function blankForm(year,company){
    company=company||{};
    return {
      receipt_no:"",
      requester:{company:clean(company.Name),address:clean(company.Address),representative:clean(company.Representative),environment_engineer:clean(company.EnvironmentManager)},
      general:{industry:clean(company.Industry),facility_type:"",grade:clean(company.Grade)?clean(company.Grade).replace(/종$/,"")+"종":""},
      request:{purpose:"자가측정용",stack_name:"",height:"",diameter:"",stack_type:"",items:""},
      sampling:{weather:"",temperature:"",humidity:"",pressure:"",wind_direction:"",wind_speed:"",standard_oxygen:"",measured_oxygen:"",flow_before:"",flow_after:"",moisture:"",gas_temperature:"",gas_velocity:"",other:"",prevention_rows:[{name:"",target:"",efficiency:"확인불가"}],date:"",time:"",samplers:[]},
      operation:{emission_facility:"",prevention_facility:"",fuel:[{amount:""}],product:[{amount:""}],incineration:[{amount:""}],material:[{amount:"",type:"",unit:""}]},
      results:[{item:"",limit:"",result:"",time:"",method:"",memo:""}],
      analysis_period:"",analysis_engineer:"",responsible_engineer:"",opinion:"배출허용기준 이내",issue_date:"",
      issuer:{company:"드림포이엔",address:"경기 안양시 만안구 덕천로152번길 25 (안양동) 비동 2005호",phone:"031-420-2156",representative:"하준명"},
      watermark_visible:true,seal_visible:true,year:Number(year)||new Date().getFullYear()
    };
  }
  function draftFromSource(row){
    var fields=sourceFields(row),company=findCompany(row)||{},facility=findFacility(company,row)||{},metrics=stackMetrics(row),form=blankForm(yearOf(row&&row.measure_date,state.year),company);
    var items=sourceItems(row),diameter="";
    if(clean(facility.StackShape||fields.stackShape)==="round")diameter=clean(facility.Diameter||fields.diameter);else if(clean(facility.StackW||fields.stackW)||clean(facility.StackH||fields.stackH))diameter=[clean(facility.StackW||fields.stackW),clean(facility.StackH||fields.stackH)].filter(Boolean).join(" × ");
    form.receipt_no=sourceReceipt(row);
    form.requester.company=sourceCompanyName(row)||form.requester.company;
    form.general.facility_type=clean(facility.EmissionFacility);
    form.request.stack_name=sourceFacilityName(row)||clean(facility.FacilityName||facility.PreventionFacility);
    form.request.height=clean(facility.StackHeight||company.StackHeight||"");
    form.request.diameter=diameter;
    form.request.items=items.join(", ");
    form.sampling.weather=clean(fields.weather);
    form.sampling.temperature=clean(fields.airTemp);
    form.sampling.humidity=clean(fields.humidity);
    form.sampling.pressure=fixed(metrics.pa,0);
    form.sampling.wind_direction=clean(fields.windDir);
    form.sampling.wind_speed=clean(fields.windSpeed);
    form.sampling.standard_oxygen=clean(fields.stdO2);
    form.sampling.measured_oxygen=fixed(metrics.o2,1);
    form.sampling.flow_before=fixed(metrics.flow,1);
    form.sampling.flow_after=fixed(metrics.corrected,1);
    form.sampling.moisture=fixed(metrics.moist,1);
    form.sampling.gas_temperature=fixed(metrics.temp,1);
    form.sampling.gas_velocity=fixed(metrics.velocity,2);
    form.sampling.prevention_rows=[{name:clean(facility.PreventionFacility||sourceFacilityName(row)),target:items.join(", "),efficiency:"확인불가"}];
    form.sampling.date=isoDate(fields.measureDate||row.measure_date);
    form.sampling.time=[clean(fields.totalStart||fields.particleStart),clean(fields.totalEnd||fields.particleEnd)].filter(Boolean).join(" ~ ");
    form.sampling.samplers=[clean(fields.manager1),clean(fields.manager2)].filter(Boolean);
    form.operation.emission_facility=clean(facility.EmissionFacility);
    form.operation.prevention_facility=clean(facility.PreventionFacility||sourceFacilityName(row));
    form.results=items.map(function(item){return {item:item+(itemUnit(item)?"("+itemUnit(item)+")":""),limit:itemLimit(facility,item),result:analysisResult(row,item),time:itemTime(row,item),method:defaultMethod(item),memo:""};});
    if(!form.results.length)form.results=[{item:"",limit:"",result:"",time:"",method:"",memo:""}];
    return form;
  }
  function normalizeForm(form,year,company){
    var out=Object.assign(blankForm(year,company),clone(form||{}));
    out.requester=Object.assign(blankForm(year,company).requester,out.requester||{});
    out.general=Object.assign(blankForm(year,company).general,out.general||{});
    out.request=Object.assign(blankForm(year,company).request,out.request||{});
    out.sampling=Object.assign(blankForm(year,company).sampling,out.sampling||{});
    out.operation=Object.assign(blankForm(year,company).operation,out.operation||{});
    out.issuer=Object.assign(blankForm(year,company).issuer,out.issuer||{});
    out.sampling.prevention_rows=Array.isArray(out.sampling.prevention_rows)&&out.sampling.prevention_rows.length?out.sampling.prevention_rows:[{name:"",target:"",efficiency:"확인불가"}];
    out.sampling.samplers=Array.isArray(out.sampling.samplers)?out.sampling.samplers:[];
    ["fuel","product","incineration","material"].forEach(function(key){if(!Array.isArray(out.operation[key])||!out.operation[key].length)out.operation[key]=[key==="material"?{amount:"",type:"",unit:""}:{amount:""}];});
    out.results=Array.isArray(out.results)&&out.results.length?out.results:[{item:"",limit:"",result:"",time:"",method:"",memo:""}];
    out.issue_date=isoDate(out.issue_date);
    return out;
  }
  async function loadSources(year){
    var start=year+"-01-01",end=year+"-12-31";
    var rows=await fetchPages("dreampoen_repository","receipt_no,measure_date,company_name,facility_name,record_type,measurement_data,analysis_data,hidden,updated_at",function(query){return query.gte("measure_date",start).lte("measure_date",end).order("measure_date",{ascending:false}).order("receipt_no",{ascending:true});});
    return rows.filter(function(row){return !sourceDeleted(row)&&row.hidden!==true&&sourceData(row);});
  }
  async function loadReports(year){
    return fetchPages(REPORT_TABLE,"*",function(query){return query.eq("report_year",year).is("archived_at",null).order("measurement_date",{ascending:false}).order("updated_at",{ascending:false});});
  }
  async function loadMethods(){
    var rows=await fetchPages(METHOD_TABLE,"*",function(query){return query.eq("active",true).order("sort_order",{ascending:true}).order("item_key",{ascending:true});});
    var all=[METHOD_DEFAULT].concat(rows||[]),seen=new Set();
    return all.filter(function(row){var key=canon(row.item_key)+"|"+clean(row.display_text);if(seen.has(key))return false;seen.add(key);return true;});
  }
  async function loadReportData(force){
    if(state.loading)return;if(state.loaded&&!force){renderReportList();return;}
    state.loading=true;state.error="";renderReportLoading("자료실·시료채취·분석값을 안전하게 조회하고 있습니다.");
    try{
      var sourceResult=await Promise.allSettled([loadSources(state.year),loadReports(state.year),loadMethods()]);
      if(sourceResult[0].status==="fulfilled")state.sources=sourceResult[0].value;else throw sourceResult[0].reason;
      if(sourceResult[1].status==="fulfilled")state.reports=sourceResult[1].value;else state.error=migrationMessage(sourceResult[1].reason);
      if(sourceResult[2].status==="fulfilled")state.methods=sourceResult[2].value;else state.methods=[METHOD_DEFAULT];
      state.loaded=true;renderReportList();
      diag("info","성적서작성 자료 조회 완료","원본 "+state.sources.length+"건 / 작성본 "+state.reports.length+"건");
    }catch(error){state.error=migrationMessage(error);renderReportFailure(state.error);diag("error","성적서작성 조회 실패",error&&error.message||error);}
    finally{state.loading=false;}
  }

  function companyKeyFromSource(row){var company=findCompany(row),name=sourceCompanyName(row);return clean(company&&company.Id)||"name:"+norm(name);}
  function companyKeyFromReport(row){return clean(row&&row.company_id)||"name:"+norm(row&&row.company_name);}
  function reportGroups(){
    var map=new Map();
    function ensure(key,name,company){
      if(!map.has(key))map.set(key,{key:key,name:clean(name)||"업체명 미입력",company:company||null,sources:[],reports:[]});
      var group=map.get(key);if(!group.company&&company)group.company=company;return group;
    }
    state.sources.forEach(function(row){var company=findCompany(row),key=companyKeyFromSource(row);ensure(key,sourceCompanyName(row)||company&&company.Name,company).sources.push(row);});
    state.reports.forEach(function(row){var company=findCompany(row.company_name),key=companyKeyFromReport(row);ensure(key,row.company_name,company).reports.push(row);});
    return Array.from(map.values()).map(function(group){
      var saved=new Set(group.reports.map(function(r){return clean(r.source_receipt_no||r.report_no);})),ready=0,waiting=0;
      group.sources.forEach(function(row){if(analysisReady(row))ready+=1;else waiting+=1;});
      group.savedCount=saved.size;group.readyCount=ready;group.waitCount=waiting;
      return group;
    }).filter(function(group){
      var text=[group.name,group.company&&group.company.Address,group.sources.map(sourceFacilityName).join(" ")].join(" ").toLowerCase();
      var query=state.query.toLowerCase();
      if(query&&text.indexOf(query)<0)return false;
      if(state.filter==="ready"&&group.readyCount===0)return false;
      if(state.filter==="waiting"&&group.waitCount===0)return false;
      if(state.filter==="saved"&&group.savedCount===0)return false;
      return true;
    }).sort(function(a,b){return a.name.localeCompare(b.name,"ko",{numeric:true,sensitivity:"base"});});
  }
  function allReportGroups(){
    var query=state.query,filter=state.filter;state.query="";state.filter="all";var groups=reportGroups();state.query=query;state.filter=filter;return groups;
  }
  function yearOptions(selected){
    var current=new Date().getFullYear(),years=[];for(var y=current-8;y<=current+3;y++)years.push(y);if(years.indexOf(Number(selected))<0)years.push(Number(selected));
    return years.sort(function(a,b){return b-a;}).map(function(y){return '<option value="'+y+'"'+(y===Number(selected)?' selected':'')+'>'+y+'년</option>';}).join("");
  }
  function reportStatusLabel(status){return status==="issued"?"발급완료":status==="review"?"검토중":"작성중";}
  function reportStatusClass(status){return status==="issued"?"saved":status==="review"?"wait":"missing";}
  function renderReportLoading(message){var root=byId("dfMeasurementReportApp");if(root)root.innerHTML='<div class="df-report-loading">'+esc(message||"불러오는 중입니다.")+'</div>';}
  function renderReportFailure(message){
    var root=byId("dfMeasurementReportApp");if(!root)return;
    root.innerHTML='<div class="rpt-page"><div class="rpt-head"><div><h1>성적서</h1><p>기존 자료는 변경하지 않고 별도 성적서 작성자료만 관리합니다.</p></div><button class="rpt-btn" id="rptRetry">다시 확인</button></div><div class="rpt-empty">'+esc(message)+'</div></div>';
    byId("rptRetry").onclick=function(){state.loaded=false;loadReportData(true);};
  }
  function renderReportList(){
    var root=byId("dfMeasurementReportApp");if(!root)return;
    if(state.selectedCompany){renderCompanyFolder();return;}
    var groups=reportGroups(),all=allReportGroups(),sourceCount=state.sources.length,ready=state.sources.filter(analysisReady).length,waiting=sourceCount-ready;
    root.innerHTML=[
      '<div class="rpt-page">',
        '<header class="rpt-head"><div><h1>성적서</h1><p>업체별 폴더에서 접수번호를 선택하면 대기 측정기록부 양식으로 작성합니다. 기존 시료채취·분석·일정 자료는 읽기만 합니다.</p></div><div class="rpt-head-actions"><button class="rpt-btn" id="rptMethodSettings">측정방법 환경설정</button><button class="rpt-btn" id="rptRefresh">새로고침</button></div></header>',
        '<div class="rpt-toolbar">',
          '<label>작성 연도<select id="rptYear">',yearOptions(state.year),'</select></label>',
          '<label>작성 가능 여부<select id="rptFilter"><option value="all">전체</option><option value="ready">자동작성 가능</option><option value="waiting">분석값 확인 필요</option><option value="saved">작성본 있음</option></select></label>',
          '<label class="wide">업체 찾기<input id="rptSearch" type="search" value="',attr(state.query),'" placeholder="업체명 · 주소 · 시설명 검색"></label>',
          '<button class="rpt-btn" id="rptClear">전체보기</button>',
        '</div>',
        state.error?'<div class="rpt-message warn">'+esc(state.error)+'</div>':'<div class="rpt-message">접수번호가 있는 시료채취기록만 자동연동하며 저장은 별도 성적서 테이블에만 합니다.</div>',
        '<section class="rpt-summary"><article><span>업체 폴더</span><strong>',all.length,'</strong></article><article><span>대상 접수건</span><strong>',sourceCount,'</strong></article><article class="ready"><span>분석값 자동작성 가능</span><strong>',ready,'</strong></article><article class="wait"><span>분석값 확인 필요</span><strong>',waiting,'</strong></article></section>',
        '<div class="rpt-folder-list">',groups.length?groups.map(function(group){
          var badge=group.waitCount?'<span class="rpt-badge wait">분석 확인 '+group.waitCount+'건</span>':'<span class="rpt-badge ready">자동작성 가능</span>';
          return '<button class="rpt-folder" data-rpt-company="'+attr(group.key)+'"><span class="rpt-folder-icon">▰</span><span class="rpt-folder-main"><strong>'+esc(group.name)+'</strong><span>'+esc(group.company&&group.company.Address||"업체현황 주소 미등록")+'</span><small>접수 '+group.sources.length+'건 · 웹 작성본 '+group.savedCount+'건</small></span><span class="rpt-folder-state">'+badge+'<small>업체명순</small></span></button>';
        }).join(""):'<div class="rpt-empty">선택한 조건에 해당하는 업체가 없습니다.</div>','</div>',
      '</div>'
    ].join("");
    byId("rptFilter").value=state.filter;
    byId("rptYear").onchange=function(e){state.year=Number(e.target.value);state.selectedCompany="";state.loaded=false;saveFilters();loadReportData(true);};
    byId("rptFilter").onchange=function(e){state.filter=e.target.value;saveFilters();renderReportList();};
    byId("rptSearch").oninput=function(e){state.query=e.target.value;saveFilters();renderReportList();var input=byId("rptSearch");if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}};
    byId("rptClear").onclick=function(){state.query="";state.filter="all";saveFilters();renderReportList();};
    byId("rptRefresh").onclick=function(){state.loaded=false;loadReportData(true);};
    byId("rptMethodSettings").onclick=openMethodSettings;
    root.querySelectorAll("[data-rpt-company]").forEach(function(button){button.onclick=function(){state.selectedCompany=button.dataset.rptCompany;renderCompanyFolder();};});
  }
  function selectedReportGroup(){return allReportGroups().find(function(group){return group.key===state.selectedCompany;})||null;}
  function renderCompanyFolder(){
    var root=byId("dfMeasurementReportApp"),group=selectedReportGroup();if(!root)return;if(!group){state.selectedCompany="";renderReportList();return;}
    var linked=group.sources.slice().sort(function(a,b){return clean(b.measure_date).localeCompare(clean(a.measure_date))||sourceReceipt(a).localeCompare(sourceReceipt(b),"ko",{numeric:true});});
    var manual=group.reports.filter(function(report){return !clean(report.source_receipt_no)||!linked.some(function(row){return sourceReceipt(row)===clean(report.source_receipt_no);});});
    var rows=linked.map(function(row){
      var receipt=sourceReceipt(row),saved=reportForReceipt(receipt,group.reports),ready=analysisReady(row),status=saved?'<span class="rpt-badge '+reportStatusClass(saved.status)+'">'+reportStatusLabel(saved.status)+'</span>':ready?'<span class="rpt-badge ready">자동작성 가능</span>':'<span class="rpt-badge wait">분석값 확인 필요</span>';
      return '<div class="rpt-record-row" data-rpt-source="'+attr(receipt)+'"><strong>'+esc(row.measure_date||"-")+'</strong><span><b>'+esc(receipt||"접수번호 없음")+'</b></span><span>'+esc(sourceFacilityName(row)||"시설명 미입력")+'</span>'+status+'<small>'+esc(sourceItems(row).join(", ")||"측정항목 없음")+'</small><div class="rpt-record-actions"><button class="rpt-btn '+(saved?"":"primary")+'" data-rpt-open="'+attr(saved&&saved.id||"")+'">'+(saved?"열기":"작성")+'</button></div></div>';
    });
    manual.forEach(function(report){
      rows.push('<div class="rpt-record-row" data-rpt-manual="'+attr(report.id)+'"><strong>'+esc(report.measurement_date||report.issue_date||"-")+'</strong><span><b>'+esc(report.report_no||"수기 문서")+'</b></span><span>'+esc(report.facility_name||"시설명 미입력")+'</span><span class="rpt-badge '+reportStatusClass(report.status)+'">'+reportStatusLabel(report.status)+'</span><small>수기 작성본</small><div class="rpt-record-actions"><button class="rpt-btn" data-rpt-open="'+attr(report.id)+'">열기</button></div></div>');
    });
    root.innerHTML=[
      '<div class="rpt-page"><header class="rpt-company-head"><div><button class="rpt-btn" id="rptFolderBack">← 업체 목록</button><h2>▰ ',esc(group.name),'</h2><p>',esc(group.company&&group.company.Address||"업체현황 주소 미등록"),'</p></div><div class="rpt-head-actions"><button class="rpt-btn primary" id="rptBlankNew">+ 빈 성적서 작성</button><button class="rpt-btn" id="rptFolderRefresh">새로고침</button></div></header>',
      '<div class="rpt-record-list"><div class="rpt-record-row header"><span>측정일</span><span>발급/접수번호</span><span>시설</span><span>상태</span><span>측정항목</span><span>작성</span></div>',rows.length?rows.join(""):'<div class="rpt-empty">이 업체의 접수자료가 없습니다. 빈 성적서 작성은 가능합니다.</div>','</div></div>'
    ].join("");
    byId("rptFolderBack").onclick=function(){state.selectedCompany="";renderReportList();};
    byId("rptFolderRefresh").onclick=function(){state.loaded=false;loadReportData(true);};
    byId("rptBlankNew").onclick=function(){openReportEditor(null,null,group);};
    root.querySelectorAll(".rpt-record-row[data-rpt-source]").forEach(function(rowElement){
      rowElement.querySelector("[data-rpt-open]").onclick=function(){
        var receipt=rowElement.dataset.rptSource,source=group.sources.find(function(row){return sourceReceipt(row)===receipt;}),id=this.dataset.rptOpen,report=group.reports.find(function(row){return String(row.id)===String(id);});
        openReportEditor(report,source,group);
      };
    });
    root.querySelectorAll(".rpt-record-row[data-rpt-manual] [data-rpt-open]").forEach(function(button){button.onclick=function(){var report=group.reports.find(function(row){return String(row.id)===String(button.dataset.rptOpen);});openReportEditor(report,null,group);};});
  }
  function currentReportForm(){return state.current&&state.current.form_data||null;}
  function makeCurrent(report,source,group){
    var company=group&&group.company||source&&findCompany(source)||report&&findCompany(report.company_name)||{},form=report?normalizeForm(report.form_data,report.report_year,company):(source?draftFromSource(source):blankForm(state.year,company));
    return {
      id:report&&report.id||null,
      source_receipt_no:report&&report.source_receipt_no||source&&sourceReceipt(source)||"",
      company_id:report&&report.company_id||clean(company&&company.Id)||null,
      company_name:report&&report.company_name||form.requester.company||group&&group.name||"",
      facility_id:report&&report.facility_id||clean(sourceFields(source).facilityDbId)||null,
      facility_name:report&&report.facility_name||source&&sourceFacilityName(source)||form.request.stack_name||"",
      measurement_date:isoDate(report&&report.measurement_date||source&&source.measure_date||form.sampling.date),
      report_year:Number(report&&report.report_year)||state.year,
      status:clean(report&&report.status)||"draft",
      issue_date:isoDate(report&&report.issue_date||form.issue_date),
      form_data:form,
      created_at:report&&report.created_at||"",
      updated_at:report&&report.updated_at||"",
      dirty:false
    };
  }
  function openReportEditor(report,source,group){state.current=makeCurrent(report,source,group);renderReportEditor();}

  function getPath(object,path){return clean(path).split(".").reduce(function(value,key){return value==null?undefined:value[key];},object);}
  function setPath(object,path,value){var parts=clean(path).split("."),target=object;parts.slice(0,-1).forEach(function(key){if(target[key]==null)target[key]=/^\d+$/.test(parts[parts.indexOf(key)+1])?[]:{};target=target[key];});target[parts[parts.length-1]]=value;}
  function printValue(value,opts){
    opts=opts||{};var cls="rpt-print-value"+(opts.left?" rpt-left":"")+(opts.sign?" rpt-sign-value":"");
    return '<span class="'+cls+'">'+esc(value).replace(/\r?\n/g,"<br>")+'</span>';
  }
  function field(form,path,printMode,opts){
    opts=opts||{};var value=getPath(form,path);if(value==null)value="";
    if(printMode)return printValue(value,opts);
    var type=opts.type||"text",className=opts.className||"";
    if(type==="textarea")return '<textarea class="'+attr(className)+'" data-rpt-field="'+attr(path)+'" aria-label="'+attr(opts.label||path)+'">'+esc(value)+'</textarea>';
    if(type==="date")return '<input class="'+attr(className)+'" data-rpt-field="'+attr(path)+'" type="date" value="'+attr(isoDate(value))+'" aria-label="'+attr(opts.label||path)+'">';
    return '<input class="'+attr(className)+'" data-rpt-field="'+attr(path)+'" type="'+attr(type)+'" value="'+attr(value)+'" aria-label="'+attr(opts.label||path)+'"'+(opts.readonly?' readonly':'')+'>';
  }
  function methodOptions(item,current){
    var key=canon(String(item||"").replace(/\([^)]*\)\s*$/,"")),rows=state.methods.filter(function(row){return row.active!==false&&(canon(row.item_key)===key||clean(row.item_key)==="*");});
    if(current&&!rows.some(function(row){return clean(row.display_text)===clean(current);}))rows.unshift({display_text:current});
    return '<option value="">선택</option>'+rows.map(function(row){var value=clean(row.display_text||[row.method_name,row.instrument_name&&"("+row.instrument_name+")"].filter(Boolean).join(" "));return '<option value="'+attr(value)+'"'+(value===clean(current)?' selected':'')+'>'+esc(value)+'</option>';}).join("")+'<option value="__custom__">직접 입력…</option>';
  }
  function resultMethod(form,index,printMode){
    var row=form.results[index]||{};if(printMode)return printValue(row.method);
    return '<select class="rpt-method-select" data-rpt-field="results.'+index+'.method" data-rpt-method-custom="1">'+methodOptions(row.item,row.method)+'</select>';
  }
  function preventionRows(form,printMode){
    return '<div class="rpt-prevention-head"><b>명 칭</b><b>대 상 물 질</b><b>방 지 효 율</b><i></i></div>'+form.sampling.prevention_rows.map(function(row,index){
      return '<div class="rpt-prevention-item">'+field(form,"sampling.prevention_rows."+index+".name",printMode,{label:"방지시설 명칭"})+field(form,"sampling.prevention_rows."+index+".target",printMode,{label:"대상물질"})+field(form,"sampling.prevention_rows."+index+".efficiency",printMode,{label:"방지효율"})+(printMode?"":'<button type="button" class="rpt-remove rpt-no-print" data-rpt-action="remove-prevention" data-index="'+index+'" title="방지시설 행 삭제">×</button>')+'</div>';
    }).join("");
  }
  function amountItems(form,key,printMode){
    return form.operation[key].map(function(row,index){
      return '<div class="rpt-mini-item">'+field(form,"operation."+key+"."+index+".amount",printMode,{label:key+" 사용량"})+(printMode?"":'<button type="button" class="rpt-remove rpt-no-print" data-rpt-action="remove-operation" data-group="'+key+'" data-index="'+index+'">×</button>')+'</div>';
    }).join("");
  }
  function materialItems(form,printMode){
    return form.operation.material.map(function(row,index){
      return '<div class="rpt-mini-item material">'+field(form,"operation.material."+index+".amount",printMode,{label:"원료투입량"})+field(form,"operation.material."+index+".type",printMode,{label:"원료 종류"})+field(form,"operation.material."+index+".unit",printMode,{label:"단위"})+(printMode?"":'<button type="button" class="rpt-remove rpt-no-print" data-rpt-action="remove-operation" data-group="material" data-index="'+index+'">×</button>')+'</div>';
    }).join("");
  }
  function resultRows(form,printMode){
    return form.results.map(function(row,index){
      return '<tr class="rpt-result-row"><td>'+field(form,"results."+index+".item",printMode,{label:"측정항목"})+'</td><td>'+field(form,"results."+index+".limit",printMode,{label:"허용기준"})+'</td><td>'+field(form,"results."+index+".result",printMode,{label:"측정분석값"})+'</td><td>'+field(form,"results."+index+".time",printMode,{type:"textarea",label:"측정시간"})+'</td><td>'+resultMethod(form,index,printMode)+'</td><td class="rpt-dynamic-cell">'+field(form,"results."+index+".memo",printMode,{label:"비고"})+(printMode?"":'<button type="button" class="rpt-row-delete rpt-no-print" data-rpt-action="remove-result" data-index="'+index+'" title="측정항목 삭제">×</button>')+'</td></tr>';
    }).join("");
  }
  function samplerText(form){return (form.sampling.samplers||[]).map(function(name){return clean(name)+" (서명)";}).join("\n");}
  function sheetHtml(form,printMode){
    form=normalizeForm(form,form.year||state.year,findCompany(form.requester&&form.requester.company));
    return [
      '<div class="rpt-sheet-stage"><article class="rpt-a4-sheet"><div class="rpt-a4-inner">',
        form.watermark_visible?'<img class="rpt-watermark" src="assets/report_watermark.png" alt="">':'',
        '<div class="rpt-page-content">',
          '<div class="rpt-topline"><span>1-1. 대기분야 측정기록부</span><span class="rpt-issue-number"><b>발급번호:</b>',field(form,"receipt_no",printMode,{label:"발급번호",readonly:!!clean(state.current&&state.current.source_receipt_no)}),'</span></div>',
          '<div class="rpt-form-border"><div class="rpt-form-title">대기 측정기록부</div>',
            '<table class="rpt-block rpt-client-general"><colgroup><col style="width:7.2mm"><col style="width:30mm"><col style="width:55mm"><col style="width:7.2mm"><col style="width:27mm"><col></colgroup><tbody>',
              '<tr><th rowspan="4" class="rpt-section-label">①<br>의<br>뢰<br>인</th><th class="rpt-row-label">상 호(사업장명)</th><td class="rpt-left">',field(form,"requester.company",printMode,{label:"상호",left:true}),'</td><th rowspan="4" class="rpt-section-label">②<br>일<br>반<br>현<br>황</th><th class="rpt-row-label">업 종</th><td>',field(form,"general.industry",printMode,{label:"업종"}),'</td></tr>',
              '<tr><th class="rpt-row-label">사업장소재지(주소)</th><td class="rpt-left">',field(form,"requester.address",printMode,{label:"주소",left:true}),'</td><th class="rpt-row-label">시설 종류</th><td>',field(form,"general.facility_type",printMode,{label:"시설 종류"}),'</td></tr>',
              '<tr><th class="rpt-row-label">대표자(의뢰인)</th><td>',field(form,"requester.representative",printMode,{label:"대표자"}),'</td><th class="rpt-row-label">사업장 종별</th><td>',field(form,"general.grade",printMode,{label:"사업장 종별"}),'</td></tr>',
              '<tr><th class="rpt-row-label">환경기술인</th><td>',field(form,"requester.environment_engineer",printMode,{label:"환경기술인"}),'</td><th></th><td></td></tr>',
            '</tbody></table>',
            '<table class="rpt-block"><colgroup><col style="width:7.2mm"><col></colgroup><tbody><tr><th class="rpt-section-label">③<br>의<br>뢰<br>내<br>용</th><td class="rpt-no-pad"><table class="rpt-inner"><tbody>',
              '<tr class="rpt-request-purpose"><th style="width:30mm" class="rpt-row-label">측 정 용 도</th><td colspan="4">',field(form,"request.purpose",printMode,{label:"측정 용도"}),'</td></tr>',
              '<tr class="rpt-request-stack-head"><th rowspan="2" class="rpt-row-label">굴뚝</th><th>굴뚝 명칭</th><th>높이(측정공)</th><th>안지름(측정공)</th><th>굴뚝 종별</th></tr>',
              '<tr class="rpt-request-stack-value"><td>',field(form,"request.stack_name",printMode,{label:"굴뚝 명칭"}),'</td><td>',field(form,"request.height",printMode,{label:"굴뚝 높이"}),'</td><td>',field(form,"request.diameter",printMode,{label:"굴뚝 안지름"}),'</td><td>',field(form,"request.stack_type",printMode,{label:"굴뚝 종별"}),'</td></tr>',
              '<tr class="rpt-request-items"><th class="rpt-row-label">의 뢰 항 목</th><td colspan="4">',field(form,"request.items",printMode,{label:"의뢰 항목"}),'</td></tr>',
            '</tbody></table></td></tr></tbody></table>',
            '<table class="rpt-block"><colgroup><col style="width:7.2mm"><col></colgroup><tbody><tr><th class="rpt-section-label">④<br>시<br>료<br>채<br>취</th><td class="rpt-no-pad"><table class="rpt-inner"><tbody>',
              '<tr class="rpt-weather-row"><th style="width:30mm" class="rpt-row-label">현 장 기 상</th><th>날씨</th><th>기온(℃)</th><th>습도(%)</th><th>기압(mmHg)</th><th>풍향</th><th>풍속(m/s)</th></tr>',
              '<tr class="rpt-weather-row"><td></td><td>',field(form,"sampling.weather",printMode,{label:"날씨"}),'</td><td>',field(form,"sampling.temperature",printMode,{label:"기온"}),'</td><td>',field(form,"sampling.humidity",printMode,{label:"습도"}),'</td><td>',field(form,"sampling.pressure",printMode,{label:"기압"}),'</td><td>',field(form,"sampling.wind_direction",printMode,{label:"풍향"}),'</td><td>',field(form,"sampling.wind_speed",printMode,{label:"풍속"}),'</td></tr>',
              '<tr class="rpt-gas-head"><th rowspan="4" class="rpt-row-label">배 출 가 스</th><th colspan="2">표준산소농도</th><th>실측산소농도</th><th>배출가스유량(산소보정 전)</th><th colspan="2">배출가스유량(산소보정 후)</th></tr>',
              '<tr class="rpt-gas-value"><td colspan="2">',field(form,"sampling.standard_oxygen",printMode,{label:"표준산소농도"}),'</td><td>',field(form,"sampling.measured_oxygen",printMode,{label:"실측산소농도"}),'</td><td>',field(form,"sampling.flow_before",printMode,{label:"산소보정 전 유량"}),'</td><td colspan="2">',field(form,"sampling.flow_after",printMode,{label:"산소보정 후 유량"}),'</td></tr>',
              '<tr class="rpt-gas-head"><th colspan="2">수분량</th><th>배출가스온도</th><th>배출가스 유속</th><th colspan="2">기타</th></tr>',
              '<tr class="rpt-gas-value"><td colspan="2">',field(form,"sampling.moisture",printMode,{label:"수분량"}),'</td><td>',field(form,"sampling.gas_temperature",printMode,{label:"배출가스 온도"}),'</td><td>',field(form,"sampling.gas_velocity",printMode,{label:"배출가스 유속"}),'</td><td colspan="2">',field(form,"sampling.other",printMode,{label:"기타"}),'</td></tr>',
              '<tr class="rpt-prevention-row"><th class="rpt-row-label">방 지 시 설</th><td colspan="6" class="rpt-dynamic-cell"><div class="rpt-prevention-list">',preventionRows(form,printMode),'</div>',printMode?"":'<button type="button" class="rpt-cell-add rpt-no-print" data-rpt-action="add-prevention" title="방지시설 칸 추가">＋</button>','</td></tr>',
              '<tr class="rpt-sampling-row"><th class="rpt-row-label">채 취 일 시</th><th>채취일</th><td>',field(form,"sampling.date",printMode,{type:"date",label:"채취일"}),'</td><th>채취시간</th><td>',field(form,"sampling.time",printMode,{label:"채취시간"}),'</td><th>시료채취자</th><td>',printMode?printValue(samplerText(form),{sign:true}):'<textarea data-rpt-samplers="1" aria-label="시료채취자">'+esc((form.sampling.samplers||[]).join("\n"))+'</textarea>','</td></tr>',
            '</tbody></table></td></tr></tbody></table>',
            '<table class="rpt-block"><colgroup><col style="width:7.2mm"><col></colgroup><tbody><tr><th class="rpt-section-label">⑤<br>시<br>설<br>가<br>동<br>상<br>황</th><td class="rpt-no-pad"><table class="rpt-inner"><tbody>',
              '<tr><th style="width:19%" rowspan="2">배출시설 명칭</th><th colspan="6">측정당시 시간당 사용(생산)량</th><th style="width:15%" rowspan="2">방지시설 명칭</th></tr>',
              '<tr><th style="width:12%">연료사용량</th><th style="width:12%">제품생산량</th><th style="width:12%">소각량</th><th style="width:12%">원료투입량</th><th style="width:10%">종류</th><th style="width:8%">단위</th></tr>',
              '<tr class="rpt-operation-row"><td>',field(form,"operation.emission_facility",printMode,{type:"textarea",label:"배출시설 명칭"}),'</td>',
              '<td class="rpt-dynamic-cell"><div class="rpt-mini-list">',amountItems(form,"fuel",printMode),'</div>',printMode?"":'<button class="rpt-cell-add rpt-no-print" type="button" data-rpt-action="add-operation" data-group="fuel">＋</button>','</td>',
              '<td class="rpt-dynamic-cell"><div class="rpt-mini-list">',amountItems(form,"product",printMode),'</div>',printMode?"":'<button class="rpt-cell-add rpt-no-print" type="button" data-rpt-action="add-operation" data-group="product">＋</button>','</td>',
              '<td class="rpt-dynamic-cell"><div class="rpt-mini-list">',amountItems(form,"incineration",printMode),'</div>',printMode?"":'<button class="rpt-cell-add rpt-no-print" type="button" data-rpt-action="add-operation" data-group="incineration">＋</button>','</td>',
              '<td colspan="3" class="rpt-dynamic-cell"><div class="rpt-mini-list">',materialItems(form,printMode),'</div>',printMode?"":'<button class="rpt-cell-add rpt-no-print" type="button" data-rpt-action="add-operation" data-group="material">＋</button>','</td>',
              '<td>',field(form,"operation.prevention_facility",printMode,{type:"textarea",label:"방지시설 명칭"}),'</td></tr>',
            '</tbody></table></td></tr></tbody></table>',
            '<table class="rpt-block"><colgroup><col style="width:7.2mm"><col></colgroup><tbody><tr><th class="rpt-section-label">⑥<br>측<br>정<br>분<br>석<br>결<br>과</th><td class="rpt-no-pad"><table class="rpt-inner"><tbody>',
              '<tr class="rpt-results-head"><th style="width:16%">측정항목</th><th style="width:12%">허용 기준</th><th style="width:12%">측정분석값</th><th style="width:18%">측정시간</th><th style="width:30%">측정분석방법(기기명)</th><th style="width:12%">비고</th></tr>',
              resultRows(form,printMode),
              printMode?"":'<tr class="rpt-no-print"><td colspan="6"><button type="button" class="rpt-inline-add" data-rpt-action="add-result">＋ 측정항목 셀 추가</button></td></tr>',
              '<tr class="rpt-analysis-sign"><th>분석기간</th><td colspan="2">',field(form,"analysis_period",printMode,{label:"분석기간"}),'</td><th>분석기술인</th><td colspan="2">',field(form,"analysis_engineer",printMode,{label:"분석기술인"}),'</td></tr>',
              '<tr class="rpt-analysis-sign"><th></th><td colspan="2"></td><th>책임기술인</th><td colspan="2">',field(form,"responsible_engineer",printMode,{label:"책임기술인"}),'</td></tr>',
            '</tbody></table></td></tr></tbody></table>',
            '<table class="rpt-block"><colgroup><col style="width:7.2mm"><col style="width:30mm"><col></colgroup><tbody><tr class="rpt-opinion-row"><th class="rpt-section-label">⑦</th><th class="rpt-row-label">종 합 의 견</th><td>',field(form,"opinion",printMode,{label:"종합 의견"}),'</td></tr></tbody></table>',
            '<div class="rpt-declaration"><div class="rpt-declaration-text">위와 같이 측정분석결과를 사실대로 기록합니다.</div><div class="rpt-bottom-date">',field(form,"issue_date",printMode,{type:"date",label:"발행일"}),'</div><div class="rpt-issuer-grid"><b>상호</b><div class="rpt-company-info">',esc(form.issuer.company),'</div><div></div><b>소재지 및 연락처</b><div class="rpt-company-info">',esc(form.issuer.address),'<br>',esc(form.issuer.phone),'</div><div></div><b>대표자 성명</b><div class="rpt-company-info">',esc(form.issuer.representative),'</div><div class="rpt-representative"><span class="rpt-seal-label">(서명 또는 인)</span>',form.seal_visible?'<img class="rpt-seal" src="assets/qualification_seal.jpg" alt="주식회사 드림포이엔 직인">':'','</div></div><div class="rpt-footnote">※ 의뢰사항과 관련이 없는 문은 해당 없음으로 기재합니다.</div></div>',
          '</div>',
        '</div>',
      '</div></article></div>'
    ].join("");
  }

  function setReportMessage(message,kind){var element=byId("rptEditorMessage");if(element){element.textContent=message||"";element.className="rpt-message"+(kind?" "+kind:"");}}
  function renderReportEditor(){
    var root=byId("dfMeasurementReportApp"),current=state.current;if(!root||!current)return;
    var form=current.form_data,sourceText=current.source_receipt_no?"접수번호 "+current.source_receipt_no+" · 시료채취/LAB 원본은 읽기 전용":"수기 작성본 · 기존 원본과 연결하지 않음";
    root.innerHTML=[
      '<div class="rpt-editor"><header class="rpt-editor-head"><div><button class="rpt-btn" id="rptEditorBack">← ',state.selectedCompany?"업체 폴더":"업체 목록",'</button><h1>대기 측정기록부 성적서</h1><p>',esc(current.company_name||form.requester.company||"업체명 미입력"),' · ',esc(current.facility_name||form.request.stack_name||"시설명 미입력"),'</p></div>',
      '<div class="rpt-editor-actions"><label class="rpt-editor-status">문서 상태<select id="rptEditorStatus"><option value="draft">작성중</option><option value="review">검토중</option><option value="issued">발급완료</option></select></label><label class="rpt-editor-status"><input type="checkbox" id="rptWatermarkToggle"',form.watermark_visible!==false?' checked':'','> 워터마크</label><label class="rpt-editor-status"><input type="checkbox" id="rptSealToggle"',form.seal_visible!==false?' checked':'','> 직인</label><button class="rpt-btn" id="rptEditorMethods">측정방법 설정</button><button class="rpt-btn" id="rptEditorPreview">미리보기</button><button class="rpt-btn" id="rptEditorPrint">인쇄 / PDF</button><button class="rpt-btn primary" id="rptEditorSave">저장</button>',current.id?'<button class="rpt-btn danger" id="rptEditorArchive">삭제</button>':'','</div></header>',
      '<div class="rpt-source-note"><span><b>연동 기준</b> · ',esc(sourceText),'</span><span id="rptEditorMeta">',esc(current.updated_at?"마지막 수정 "+new Date(current.updated_at).toLocaleString("ko-KR"):"저장 전"),'</span></div>',
      '<div id="rptEditorMessage" class="rpt-message">회색 입력칸은 모두 수정할 수 있습니다. 방지시설·가동상황·측정항목은 각 ＋ 버튼으로 개별 칸을 추가하세요.</div>',
      '<section class="rpt-sheet-panel"><div class="rpt-sheet-scroll"><div id="rptSheetHost"></div></div></section></div>'
    ].join("");
    byId("rptEditorStatus").value=current.status||"draft";
    renderEditorSheet();
    byId("rptEditorBack").onclick=function(){if(current.dirty&&!window.confirm("저장하지 않은 변경사항이 있습니다. 업체 폴더로 돌아갈까요?"))return;state.current=null;if(state.selectedCompany)renderCompanyFolder();else renderReportList();};
    byId("rptEditorStatus").onchange=function(e){current.status=e.target.value;markDirty();};
    byId("rptWatermarkToggle").onchange=function(e){form.watermark_visible=!!e.target.checked;markDirty();renderEditorSheet();};
    byId("rptSealToggle").onchange=function(e){form.seal_visible=!!e.target.checked;markDirty();renderEditorSheet();};
    byId("rptEditorMethods").onclick=openMethodSettings;
    byId("rptEditorPreview").onclick=function(){openReportPrint(false);};
    byId("rptEditorPrint").onclick=function(){openReportPrint(true);};
    byId("rptEditorSave").onclick=saveCurrentReport;
    if(byId("rptEditorArchive"))byId("rptEditorArchive").onclick=archiveCurrentReport;
  }
  function markDirty(){if(!state.current)return;state.current.dirty=true;var meta=byId("rptEditorMeta");if(meta)meta.innerHTML='<span class="rpt-dirty-mark">● 저장하지 않은 변경</span>';}
  function renderEditorSheet(){
    var host=byId("rptSheetHost"),current=state.current;if(!host||!current)return;
    host.innerHTML=sheetHtml(current.form_data,false);
    host.querySelectorAll("[data-rpt-field]").forEach(function(element){
      var handler=function(){
        var value=element.type==="checkbox"?!!element.checked:element.value;
        if(element.dataset.rptMethodCustom&&value==="__custom__"){
          var custom=window.prompt("측정분석방법(기기명)을 입력해주세요.",getPath(current.form_data,element.dataset.rptField)||"");
          if(custom==null){renderEditorSheet();return;}
          value=clean(custom);var option=document.createElement("option");option.value=value;option.textContent=value;element.insertBefore(option,element.lastElementChild);element.value=value;
        }
        setPath(current.form_data,element.dataset.rptField,value);
        if(element.dataset.rptField==="receipt_no"){current.source_receipt_no=current.source_receipt_no||clean(value);}
        if(element.dataset.rptField==="requester.company")current.company_name=clean(value);
        if(element.dataset.rptField==="request.stack_name")current.facility_name=clean(value);
        if(element.dataset.rptField==="sampling.date")current.measurement_date=isoDate(value);
        if(element.dataset.rptField==="issue_date")current.issue_date=isoDate(value);
        markDirty();
      };
      element.addEventListener("input",handler);element.addEventListener("change",handler);
    });
    var samplers=host.querySelector("[data-rpt-samplers]");
    if(samplers)samplers.addEventListener("input",function(){current.form_data.sampling.samplers=samplers.value.split(/\r?\n|,/).map(clean).filter(Boolean);markDirty();});
    host.querySelectorAll("[data-rpt-action]").forEach(function(button){button.onclick=function(){mutateForm(button.dataset.rptAction,button);};});
    scheduleSheetFit();
  }
  function ensureOne(list,fallback){if(!Array.isArray(list)||!list.length)list.push(fallback);}
  function mutateForm(action,button){
    var form=currentReportForm();if(!form)return;
    if(action==="add-prevention")form.sampling.prevention_rows.push({name:"",target:"",efficiency:"확인불가"});
    if(action==="remove-prevention"){form.sampling.prevention_rows.splice(Number(button.dataset.index),1);ensureOne(form.sampling.prevention_rows,{name:"",target:"",efficiency:"확인불가"});}
    if(action==="add-operation"){var group=button.dataset.group;form.operation[group].push(group==="material"?{amount:"",type:"",unit:""}:{amount:""});}
    if(action==="remove-operation"){var key=button.dataset.group;form.operation[key].splice(Number(button.dataset.index),1);ensureOne(form.operation[key],key==="material"?{amount:"",type:"",unit:""}:{amount:""});}
    if(action==="add-result")form.results.push({item:"",limit:"",result:"",time:"",method:"",memo:""});
    if(action==="remove-result"){form.results.splice(Number(button.dataset.index),1);ensureOne(form.results,{item:"",limit:"",result:"",time:"",method:"",memo:""});}
    markDirty();renderEditorSheet();
  }
  function scheduleSheetFit(){
    cancelAnimationFrame(state.fitFrame);
    state.fitFrame=requestAnimationFrame(function(){
      var scroll=document.querySelector("#dfMeasurementReportApp .rpt-sheet-scroll"),stage=document.querySelector("#dfMeasurementReportApp .rpt-sheet-stage"),sheet=document.querySelector("#dfMeasurementReportApp .rpt-a4-sheet");
      if(!scroll||!stage||!sheet)return;
      var inner=sheet.querySelector(".rpt-a4-inner"),content=sheet.querySelector(".rpt-page-content");
      if(inner&&content){
        content.style.transform="none";content.style.width="100%";
        var needed=content.scrollHeight,availableHeight=inner.clientHeight;
        if(needed>availableHeight){var contentScale=availableHeight/needed;content.style.transformOrigin="top left";content.style.transform="scale("+contentScale+")";content.style.width=(100/contentScale)+"%";}
      }
      sheet.style.transform="none";var width=sheet.offsetWidth,height=sheet.offsetHeight,available=Math.max(280,scroll.clientWidth-24),scale=Math.min(1,available/width);
      sheet.style.transform="scale("+scale+")";stage.style.width=Math.ceil(width*scale)+"px";stage.style.height=Math.ceil(height*scale)+"px";
      if(state.fitObserver)state.fitObserver.disconnect();
      if(typeof ResizeObserver!=="undefined"){state.fitObserver=new ResizeObserver(scheduleSheetFit);state.fitObserver.observe(scroll);}
    });
  }
  function payloadForCurrent(){
    var current=state.current,form=normalizeForm(current.form_data,current.report_year,findCompany(current.company_name));
    if(clean(current.source_receipt_no))form.receipt_no=clean(current.source_receipt_no);
    current.form_data=form;current.company_name=clean(form.requester.company||current.company_name);current.facility_name=clean(form.request.stack_name||current.facility_name);current.measurement_date=isoDate(form.sampling.date||current.measurement_date);current.issue_date=isoDate(form.issue_date);current.report_year=yearOf(current.measurement_date||current.issue_date,current.report_year||state.year);
    return {
      source_receipt_no:clean(current.source_receipt_no)||null,
      report_no:clean(form.receipt_no),
      company_id:clean(current.company_id)||null,
      company_name:current.company_name,
      facility_id:clean(current.facility_id)||null,
      facility_name:current.facility_name,
      measurement_date:current.measurement_date||null,
      report_year:current.report_year,
      status:current.status||"draft",
      issue_date:current.issue_date||null,
      form_data:form,
      updated_by:currentUser()&&currentUser().id||null,
      updated_at:new Date().toISOString()
    };
  }
  async function saveCurrentReport(){
    var db=database(),user=currentUser(),current=state.current;if(!current)return;if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    var payload=payloadForCurrent();if(!payload.company_name)return window.alert("상호(사업장명)를 입력해주세요.");if(!payload.report_no)return window.alert("발급번호가 될 접수번호를 입력해주세요.");
    var button=byId("rptEditorSave");if(button){button.disabled=true;button.textContent="저장 중";}
    setReportMessage("성적서를 별도 작성자료에 저장하고 있습니다.","");
    try{
      var result;
      if(current.id)result=await db.from(REPORT_TABLE).update(payload).eq("id",current.id).is("archived_at",null).select("*").single();
      else{payload.created_by=user.id;result=await db.from(REPORT_TABLE).insert(payload).select("*").single();}
      if(result.error)throw result.error;
      state.current=makeCurrent(result.data,state.sources.find(function(row){return sourceReceipt(row)===clean(result.data.source_receipt_no);}),selectedReportGroup());
      state.current.dirty=false;state.reports=state.reports.filter(function(row){return String(row.id)!==String(result.data.id);});state.reports.push(result.data);
      setReportMessage("저장했습니다. 기존 시료채취·분석·일정 데이터는 변경하지 않았습니다.","ok");renderReportEditor();
    }catch(error){setReportMessage("저장 실패 · "+migrationMessage(error),"bad");window.alert("성적서를 저장하지 못했습니다.\n\n"+migrationMessage(error));}
    finally{if(button){button.disabled=false;button.textContent="저장";}}
  }
  async function archiveCurrentReport(){
    var current=state.current,db=database(),user=currentUser();if(!current||!current.id||!db||!user)return;
    if(!window.confirm("이 성적서 작성본을 목록에서 삭제할까요?\n시료채취·LAB·자료실 원본은 삭제되지 않습니다."))return;
    try{
      var result=await db.from(REPORT_TABLE).update({archived_at:new Date().toISOString(),archived_by:user.id,updated_by:user.id}).eq("id",current.id).is("archived_at",null).select("id");
      if(result.error)throw result.error;
      state.reports=state.reports.filter(function(row){return String(row.id)!==String(current.id);});state.current=null;renderCompanyFolder();
    }catch(error){window.alert("작성본을 삭제하지 못했습니다.\n\n"+migrationMessage(error));}
  }
  function openReportPrint(autoPrint){
    var current=state.current;if(!current)return;
    var baseHref="",cssHref="report_writer.css?v=120372100";try{baseHref=new URL(".",document.baseURI).href;cssHref=new URL(cssHref,document.baseURI).href;}catch(ignore){}
    var title=(current.form_data.receipt_no||"성적서")+" "+(current.form_data.requester.company||"");
    var fitScript='<script>function fitReport(){document.querySelectorAll(".rpt-a4-sheet").forEach(function(sheet){var inner=sheet.querySelector(".rpt-a4-inner"),content=sheet.querySelector(".rpt-page-content");if(!inner||!content)return;content.style.transform="none";content.style.width="100%";var need=content.scrollHeight,have=inner.clientHeight;if(need>have){var s=have/need;content.style.transformOrigin="top left";content.style.transform="scale("+s+")";content.style.width=(100/s)+"%";}});}window.addEventListener("load",function(){setTimeout(function(){fitReport();'+(autoPrint?"window.print();":"")+'},450);});window.addEventListener("beforeprint",fitReport);<\/script>';
    var html=['<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="',attr(baseHref),'"><title>',esc(title),'</title><link rel="stylesheet" href="',attr(cssHref),'"></head><body class="rpt-print-window"><div class="rpt-print-tools"><b>',esc(title),'</b><button type="button" onclick="window.print()">인쇄 / PDF</button></div><main class="rpt-print-document">',sheetHtml(current.form_data,true),'</main>',fitScript,'</body></html>'].join("");
    var popup=window.open("","_blank");if(!popup)return window.alert("미리보기 창이 차단되었습니다. 브라우저 팝업을 허용해주세요.");
    popup.document.open();popup.document.write(html);popup.document.close();
  }

  function methodRowHtml(row,index){
    return '<div class="rpt-method-row" data-method-index="'+index+'"><input data-method-field="item_key" value="'+attr(row.item_key||"")+'" placeholder="예: 먼지"><input data-method-field="method_name" value="'+attr(row.method_name||"")+'" placeholder="측정방법"><input data-method-field="instrument_name" value="'+attr(row.instrument_name||"")+'" placeholder="기기명"><button class="rpt-btn danger" data-method-delete="'+index+'">삭제</button></div>';
  }
  function openMethodSettings(){
    var old=byId("rptMethodModal");if(old)old.remove();
    var modal=document.createElement("div");modal.id="rptMethodModal";modal.className="rpt-method-modal";modal._rows=state.methods.filter(function(row){return !row.local;}).map(clone);
    modal.innerHTML='<div class="rpt-method-card"><header class="rpt-method-head"><div><h2>측정방법 환경설정</h2><p>측정항목별 방법과 기기명을 등록하면 성적서 결과행에서 선택할 수 있습니다.</p></div><button class="rpt-method-close" data-method-close>×</button></header><div class="rpt-method-body"><div class="rpt-method-row header"><span>측정항목</span><span>측정방법</span><span>기기명</span><span></span></div><div id="rptMethodRows"></div></div><footer class="rpt-method-foot"><button class="rpt-btn" id="rptMethodAdd">+ 측정방법 추가</button><div class="rpt-method-actions"><button class="rpt-btn" data-method-close>닫기</button><button class="rpt-btn primary" id="rptMethodSave">설정 저장</button></div></footer></div>';
    document.body.appendChild(modal);
    function draw(){
      byId("rptMethodRows").innerHTML=modal._rows.length?modal._rows.map(methodRowHtml).join(""):'<div class="rpt-empty">등록된 사용자 측정방법이 없습니다. 기본 먼지 측정법은 계속 제공됩니다.</div>';
      modal.querySelectorAll("[data-method-index]").forEach(function(element){
        element.querySelectorAll("[data-method-field]").forEach(function(input){input.oninput=function(){modal._rows[Number(element.dataset.methodIndex)][input.dataset.methodField]=input.value;};});
      });
      modal.querySelectorAll("[data-method-delete]").forEach(function(button){button.onclick=function(){var index=Number(button.dataset.methodDelete),row=modal._rows[index];if(row&&row.id)row._deleted=true;else modal._rows.splice(index,1);draw();};});
    }
    draw();
    modal.querySelectorAll("[data-method-close]").forEach(function(button){button.onclick=function(){modal.remove();};});
    byId("rptMethodAdd").onclick=function(){modal._rows.push({item_key:"",method_name:"",instrument_name:"",display_text:"",active:true,sort_order:(modal._rows.length+1)*10});draw();};
    byId("rptMethodSave").onclick=function(){saveMethodSettings(modal);};
    modal.onclick=function(event){if(event.target===modal)modal.remove();};
  }
  async function saveMethodSettings(modal){
    var db=database(),user=currentUser();if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    var rows=modal._rows||[],button=byId("rptMethodSave");if(button){button.disabled=true;button.textContent="저장 중";}
    try{
      for(var index=0;index<rows.length;index+=1){
        var row=rows[index];
        if(row._deleted){if(row.id){var disabled=await db.from(METHOD_TABLE).update({active:false,updated_by:user.id}).eq("id",row.id);if(disabled.error)throw disabled.error;}continue;}
        var item=clean(row.item_key),method=clean(row.method_name),instrument=clean(row.instrument_name);if(!item||!method)continue;
        var display=[method,instrument&&"("+instrument+")"].filter(Boolean).join(" ");
        var payload={item_key:item,method_name:method,instrument_name:instrument,display_text:display,active:true,sort_order:Number(row.sort_order)||((index+1)*10),updated_by:user.id};
        var saved=await db.from(METHOD_TABLE).upsert(payload,{onConflict:"item_key,display_text"});if(saved.error)throw saved.error;
      }
      state.methods=await loadMethods();modal.remove();if(state.current)renderEditorSheet();window.alert("측정방법 환경설정을 저장했습니다.");
    }catch(error){window.alert("측정방법을 저장하지 못했습니다.\n\n"+migrationMessage(error));}
    finally{if(button){button.disabled=false;button.textContent="설정 저장";}}
  }

  function inHalf(date,period){var d=isoDate(date),month=Number(d.slice(5,7));return !!d&&(period===1?month>=1&&month<=6:month>=7&&month<=12);}
  async function loadHalfRecords(year,period){return fetchPages(HALF_TABLE,"*",function(query){return query.eq("report_year",year).eq("half_year",period).is("archived_at",null).order("company_name",{ascending:true});});}
  async function loadHalfData(force){
    if(half.loading)return;if(half.loaded&&!force){renderHalfList();return;}
    half.loading=true;half.error="";renderHalfLoading("업체별 반기 측정자료와 성적서 작성상태를 확인하고 있습니다.");
    try{
      var settled=await Promise.allSettled([loadSources(half.year),loadReports(half.year),loadHalfRecords(half.year,half.period)]);
      if(settled[0].status!=="fulfilled")throw settled[0].reason;
      half.sources=settled[0].value.filter(function(row){return inHalf(row.measure_date,half.period);});
      half.reports=settled[1].status==="fulfilled"?settled[1].value:[];
      half.records=settled[2].status==="fulfilled"?settled[2].value:[];
      if(settled[2].status!=="fulfilled")half.error=migrationMessage(settled[2].reason);
      half.loaded=true;renderHalfList();
    }catch(error){half.error=migrationMessage(error);renderHalfFailure(half.error);diag("error","반기보고서 조회 실패",error&&error.message||error);}
    finally{half.loading=false;}
  }
  function halfCompanyKeySource(row){return companyKeyFromSource(row);}
  function halfCompanyKeyRecord(row){return clean(row.company_id)||"name:"+norm(row.company_name);}
  function halfGroups(unfiltered){
    var map=new Map();
    function ensure(key,name,company){if(!map.has(key))map.set(key,{key:key,name:clean(name)||"업체명 미입력",company:company||null,sources:[],record:null});var group=map.get(key);if(!group.company&&company)group.company=company;return group;}
    half.sources.forEach(function(row){var c=findCompany(row);ensure(halfCompanyKeySource(row),sourceCompanyName(row)||c&&c.Name,c).sources.push(row);});
    half.records.forEach(function(row){var c=findCompany(row.company_name);ensure(halfCompanyKeyRecord(row),row.company_name,c).record=row;});
    return Array.from(map.values()).map(function(group){
      group.ready=group.sources.length>0&&group.sources.every(analysisReady);
      group.savedReports=group.sources.filter(function(row){return !!reportForReceipt(sourceReceipt(row),half.reports);}).length;
      return group;
    }).filter(function(group){
      if(unfiltered)return true;
      var text=[group.name,group.company&&group.company.Address,group.sources.map(sourceFacilityName).join(" ")].join(" ").toLowerCase();
      if(half.query&&text.indexOf(half.query.toLowerCase())<0)return false;
      if(half.filter==="ready"&&!group.ready)return false;
      if(half.filter==="waiting"&&(group.ready||!group.sources.length))return false;
      if(half.filter==="saved"&&!group.record)return false;
      return true;
    }).sort(function(a,b){return a.name.localeCompare(b.name,"ko",{numeric:true,sensitivity:"base"});});
  }
  function renderHalfLoading(message){var root=byId("dfHalfYearReportApp");if(root)root.innerHTML='<div class="df-report-loading">'+esc(message||"불러오는 중입니다.")+'</div>';}
  function renderHalfFailure(message){
    var root=byId("dfHalfYearReportApp");if(!root)return;
    root.innerHTML='<div class="rpt-page"><header class="rpt-head"><div><h1>반기별 자가측정결과보고서</h1><p>업체별 반기 자료를 정리합니다.</p></div><button class="rpt-btn" id="hyrRetry">다시 확인</button></header><div class="rpt-empty">'+esc(message)+'</div></div>';
    byId("hyrRetry").onclick=function(){half.loaded=false;loadHalfData(true);};
  }
  function renderHalfList(){
    var root=byId("dfHalfYearReportApp");if(!root)return;
    if(half.selectedCompany){renderHalfEditor();return;}
    var groups=halfGroups(false),all=halfGroups(true),ready=all.filter(function(g){return g.ready;}).length,waiting=all.filter(function(g){return g.sources.length&&!g.ready;}).length;
    root.innerHTML=[
      '<div class="rpt-page"><header class="rpt-head"><div><h1>반기별 자가측정결과보고서</h1><p>업체명순으로 반기 대상 접수자료와 성적서 완성도를 확인하고, 업체별 보고자료를 작성·보관합니다.</p></div><div class="rpt-head-actions"><button class="rpt-btn" id="hyrRefresh">새로고침</button></div></header>',
      '<div class="rpt-toolbar"><label>연도<select id="hyrYear">',yearOptions(half.year),'</select></label><label>반기<select id="hyrPeriod"><option value="1">상반기 (1~6월)</option><option value="2">하반기 (7~12월)</option></select></label><label>작성 가능 여부<select id="hyrFilter"><option value="all">전체</option><option value="ready">작성 가능</option><option value="waiting">분석값 확인 필요</option><option value="saved">작성본 있음</option></select></label><label class="wide">업체 찾기<input id="hyrSearch" type="search" value="',attr(half.query),'" placeholder="업체명 · 주소 · 시설명 검색"></label><button class="rpt-btn" id="hyrClear">전체보기</button></div>',
      half.error?'<div class="rpt-message warn">'+esc(half.error)+'</div>':'<div class="rpt-message">반기 보고자료는 별도 테이블에 저장되며 기존 성적서·자료실 원본은 변경하지 않습니다.</div>',
      '<section class="rpt-summary"><article><span>업체 폴더</span><strong>',all.length,'</strong></article><article><span>반기 대상 접수건</span><strong>',half.sources.length,'</strong></article><article class="ready"><span>작성 가능 업체</span><strong>',ready,'</strong></article><article class="wait"><span>분석값 확인 업체</span><strong>',waiting,'</strong></article></section>',
      '<div class="hyr-company-list">',groups.length?groups.map(function(group){
        var status=group.record?'<span class="rpt-badge saved">'+(group.record.status==="complete"?"작성완료":"작성중")+'</span>':group.ready?'<span class="rpt-badge ready">작성 가능</span>':group.sources.length?'<span class="rpt-badge wait">분석값 확인 필요</span>':'<span class="rpt-badge missing">대상자료 없음</span>';
        return '<button class="rpt-folder" data-hyr-company="'+attr(group.key)+'"><span class="rpt-folder-icon">▰</span><span class="rpt-folder-main"><strong>'+esc(group.name)+'</strong><span>'+esc(group.company&&group.company.Address||"업체현황 주소 미등록")+'</span><small>반기 접수 '+group.sources.length+'건 · 성적서 '+group.savedReports+'/'+group.sources.length+'건</small></span><span class="rpt-folder-state">'+status+'<small>업체명순</small></span></button>';
      }).join(""):'<div class="rpt-empty">선택한 반기에 측정자료가 없습니다.</div>','</div></div>'
    ].join("");
    byId("hyrPeriod").value=String(half.period);byId("hyrFilter").value=half.filter;
    byId("hyrYear").onchange=function(e){half.year=Number(e.target.value);half.loaded=false;half.selectedCompany="";saveFilters();loadHalfData(true);};
    byId("hyrPeriod").onchange=function(e){half.period=Number(e.target.value);half.loaded=false;half.selectedCompany="";saveFilters();loadHalfData(true);};
    byId("hyrFilter").onchange=function(e){half.filter=e.target.value;saveFilters();renderHalfList();};
    byId("hyrSearch").oninput=function(e){half.query=e.target.value;saveFilters();renderHalfList();var input=byId("hyrSearch");if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}};
    byId("hyrClear").onclick=function(){half.query="";half.filter="all";saveFilters();renderHalfList();};
    byId("hyrRefresh").onclick=function(){half.loaded=false;loadHalfData(true);};
    root.querySelectorAll("[data-hyr-company]").forEach(function(button){button.onclick=function(){half.selectedCompany=button.dataset.hyrCompany;openHalfGroup();};});
  }
  function selectedHalfGroup(){return halfGroups(true).find(function(group){return group.key===half.selectedCompany;})||null;}
  function halfRowFromSource(row){
    var saved=reportForReceipt(sourceReceipt(row),half.reports),results=saved&&saved.form_data&&Array.isArray(saved.form_data.results)?saved.form_data.results:sourceItems(row).map(function(item){return {item:item,result:analysisResult(row,item)};});
    return {measurement_date:isoDate(row.measure_date),receipt_no:sourceReceipt(row),facility_name:sourceFacilityName(row),items:sourceItems(row).join(", "),results:results.map(function(result){return [clean(result.item).replace(/\([^)]*\)\s*$/,""),clean(result.result)].filter(Boolean).join(" ");}).join(" / "),status:saved?reportStatusLabel(saved.status):(analysisReady(row)?"작성 가능":"분석값 확인"),memo:""};
  }
  function halfBlankForm(group){
    var company=group&&group.company||{},start=half.year+"-"+(half.period===1?"01-01":"07-01"),end=half.year+"-"+(half.period===1?"06-30":"12-31");
    return {company_name:group&&group.name||clean(company.Name),company_address:clean(company.Address),representative:clean(company.Representative),period_start:start,period_end:end,rows:(group&&group.sources||[]).slice().sort(function(a,b){return clean(a.measure_date).localeCompare(clean(b.measure_date));}).map(halfRowFromSource),prepared_by:"",issue_date:"",memo:""};
  }
  function normalizeHalfRecord(record,group){
    var form=Object.assign(halfBlankForm(group),clone(record&&record.form_data||{}));if(!Array.isArray(form.rows))form.rows=[];form.issue_date=isoDate(record&&record.issue_date||form.issue_date);
    return {id:record&&record.id||null,company_id:record&&record.company_id||clean(group&&group.company&&group.company.Id)||null,company_name:record&&record.company_name||form.company_name||group&&group.name||"",report_year:Number(record&&record.report_year)||half.year,half_year:Number(record&&record.half_year)||half.period,status:clean(record&&record.status)||"draft",issue_date:form.issue_date,form_data:form,updated_at:record&&record.updated_at||"",dirty:false};
  }
  function openHalfGroup(){var group=selectedHalfGroup();if(!group){half.selectedCompany="";renderHalfList();return;}half.current=normalizeHalfRecord(group.record,group);half.files=[];renderHalfEditor();if(half.current.id)loadHalfFiles();}
  function renderHalfEditor(){
    var root=byId("dfHalfYearReportApp"),group=selectedHalfGroup(),current=half.current;if(!root||!group||!current){half.selectedCompany="";renderHalfList();return;}
    var form=current.form_data;
    root.innerHTML=[
      '<div class="rpt-page"><header class="rpt-editor-head"><div><button class="rpt-btn" id="hyrBack">← 업체 목록</button><h1>',esc(group.name),' · ',half.year,'년 ',half.period===1?"상반기":"하반기",'</h1><p>접수자료를 업체별로 모아 반기 결과보고 자료를 작성합니다.</p></div><div class="rpt-editor-actions"><label class="rpt-editor-status">상태<select id="hyrStatus"><option value="draft">작성중</option><option value="complete">작성완료</option></select></label><button class="rpt-btn" id="hyrPreview">미리보기</button><button class="rpt-btn" id="hyrPrint">인쇄 / PDF</button><button class="rpt-btn primary" id="hyrSave">저장</button>',current.id?'<button class="rpt-btn danger" id="hyrArchive">삭제</button>':'','</div></header>',
      '<div id="hyrMessage" class="rpt-message">원본 연동값도 이 화면에서 수정할 수 있으며, 수정값은 반기 보고자료에만 저장됩니다.</div>',
      '<section class="hyr-editor"><div class="hyr-editor-grid"><label>업체명<input data-hyr-field="company_name" value="',attr(form.company_name),'"></label><label>대표자<input data-hyr-field="representative" value="',attr(form.representative),'"></label><label>기간 시작<input type="date" data-hyr-field="period_start" value="',attr(form.period_start),'"></label><label>기간 종료<input type="date" data-hyr-field="period_end" value="',attr(form.period_end),'"></label><label class="wide">주소<input data-hyr-field="company_address" value="',attr(form.company_address),'"></label><label>작성자<input data-hyr-field="prepared_by" value="',attr(form.prepared_by),'"></label><label>작성일<input type="date" data-hyr-field="issue_date" value="',attr(form.issue_date),'"></label><label class="wide">비고<textarea data-hyr-field="memo">',esc(form.memo),'</textarea></label></div>',
      '<div class="hyr-table-wrap"><table class="hyr-table"><thead><tr><th>측정일</th><th>접수번호</th><th>시설명</th><th>측정항목</th><th>결과</th><th>상태</th><th>비고</th><th>삭제</th></tr></thead><tbody id="hyrRows">',halfRowsHtml(form),'</tbody></table></div><button class="rpt-btn" id="hyrAddRow" style="margin-top:8px">+ 행 추가</button>',
      '<div id="hyrDropZone" class="hyr-drop-zone',current.id?"":" disabled",'" tabindex="0"><b>',current.id?"기존 반기자료 파일을 여기에 끌어놓기":"먼저 보고자료를 저장하면 파일 업로드를 사용할 수 있습니다.",'</b><br><small>여러 파일 동시 업로드 · 파일당 최대 50MB</small><input id="hyrFileInput" type="file" multiple hidden></div><div id="hyrFileList" class="hyr-file-list"></div></section></div>'
    ].join("");
    byId("hyrStatus").value=current.status;
    root.querySelectorAll("[data-hyr-field]").forEach(function(input){input.oninput=input.onchange=function(){setPath(form,input.dataset.hyrField,input.value);current.dirty=true;if(input.dataset.hyrField==="issue_date")current.issue_date=isoDate(input.value);};});
    bindHalfRows();
    byId("hyrBack").onclick=function(){if(current.dirty&&!window.confirm("저장하지 않은 변경사항이 있습니다. 업체 목록으로 돌아갈까요?"))return;half.current=null;half.selectedCompany="";renderHalfList();};
    byId("hyrStatus").onchange=function(e){current.status=e.target.value;current.dirty=true;};
    byId("hyrAddRow").onclick=function(){form.rows.push({measurement_date:"",receipt_no:"",facility_name:"",items:"",results:"",status:"",memo:""});renderHalfEditor();};
    byId("hyrPreview").onclick=function(){openHalfPrint(false);};byId("hyrPrint").onclick=function(){openHalfPrint(true);};byId("hyrSave").onclick=saveHalfRecord;
    if(byId("hyrArchive"))byId("hyrArchive").onclick=archiveHalfRecord;
    bindHalfDrop();renderHalfFileList();
  }
  function halfRowsHtml(form){
    return form.rows.map(function(row,index){return '<tr data-hyr-row="'+index+'"><td><input type="date" data-hyr-row-field="measurement_date" value="'+attr(row.measurement_date)+'"></td><td><input data-hyr-row-field="receipt_no" value="'+attr(row.receipt_no)+'"></td><td><input data-hyr-row-field="facility_name" value="'+attr(row.facility_name)+'"></td><td><textarea data-hyr-row-field="items">'+esc(row.items)+'</textarea></td><td><textarea data-hyr-row-field="results">'+esc(row.results)+'</textarea></td><td><input data-hyr-row-field="status" value="'+attr(row.status)+'"></td><td><input data-hyr-row-field="memo" value="'+attr(row.memo)+'"></td><td><button class="rpt-btn danger" data-hyr-row-delete="'+index+'">삭제</button></td></tr>';}).join("")||'<tr><td colspan="8">반기 측정자료가 없습니다. 행 추가로 직접 작성할 수 있습니다.</td></tr>';
  }
  function bindHalfRows(){
    var form=half.current.form_data,root=byId("dfHalfYearReportApp");if(!root)return;
    root.querySelectorAll("[data-hyr-row]").forEach(function(tr){var index=Number(tr.dataset.hyrRow);tr.querySelectorAll("[data-hyr-row-field]").forEach(function(input){input.oninput=input.onchange=function(){form.rows[index][input.dataset.hyrRowField]=input.value;half.current.dirty=true;};});});
    root.querySelectorAll("[data-hyr-row-delete]").forEach(function(button){button.onclick=function(){form.rows.splice(Number(button.dataset.hyrRowDelete),1);renderHalfEditor();};});
  }
  async function saveHalfRecord(){
    var current=half.current,db=database(),user=currentUser();if(!current||!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    var form=current.form_data;if(!clean(form.company_name))return window.alert("업체명을 입력해주세요.");
    var payload={company_id:clean(current.company_id)||null,company_name:clean(form.company_name),report_year:half.year,half_year:half.period,status:current.status||"draft",issue_date:isoDate(form.issue_date)||null,form_data:form,updated_by:user.id,updated_at:new Date().toISOString()},button=byId("hyrSave");
    if(button){button.disabled=true;button.textContent="저장 중";}
    try{
      var result;if(current.id)result=await db.from(HALF_TABLE).update(payload).eq("id",current.id).is("archived_at",null).select("*").single();else{payload.created_by=user.id;result=await db.from(HALF_TABLE).insert(payload).select("*").single();}
      if(result.error)throw result.error;
      var group=selectedHalfGroup();half.current=normalizeHalfRecord(result.data,group);half.records=half.records.filter(function(row){return String(row.id)!==String(result.data.id);});half.records.push(result.data);if(group)group.record=result.data;
      renderHalfEditor();await loadHalfFiles();var message=byId("hyrMessage");if(message){message.textContent="반기 보고자료를 저장했습니다. 기존 성적서와 자료실 원본은 변경하지 않았습니다.";message.className="rpt-message ok";}
    }catch(error){window.alert("반기 보고자료를 저장하지 못했습니다.\n\n"+migrationMessage(error));}
    finally{if(button){button.disabled=false;button.textContent="저장";}}
  }
  async function archiveHalfRecord(){
    var current=half.current,db=database(),user=currentUser();if(!current||!current.id||!db||!user)return;if(!window.confirm("이 업체의 반기 보고자료 작성본을 삭제할까요?\n원본 성적서와 자료실에는 영향이 없습니다."))return;
    try{var result=await db.from(HALF_TABLE).update({archived_at:new Date().toISOString(),archived_by:user.id,updated_by:user.id}).eq("id",current.id).is("archived_at",null);if(result.error)throw result.error;half.records=half.records.filter(function(row){return String(row.id)!==String(current.id);});half.current=null;half.selectedCompany="";renderHalfList();}catch(error){window.alert("삭제하지 못했습니다.\n\n"+migrationMessage(error));}
  }
  function halfPrintPages(){
    var form=half.current.form_data,rows=form.rows||[],chunks=[];for(var i=0;i<Math.max(rows.length,1);i+=16)chunks.push(rows.slice(i,i+16));if(!chunks.length)chunks=[[]];
    return chunks.map(function(chunk,page){
      return '<article class="hyr-print-sheet"><h1>반기별 자가측정결과보고서</h1><table class="hyr-print-meta"><tr><th>업체명</th><td>'+esc(form.company_name)+'</td><th>대표자</th><td>'+esc(form.representative)+'</td></tr><tr><th>주소</th><td colspan="3">'+esc(form.company_address)+'</td></tr><tr><th>대상기간</th><td>'+esc(form.period_start)+' ~ '+esc(form.period_end)+'</td><th>페이지</th><td>'+(page+1)+' / '+chunks.length+'</td></tr></table><table class="hyr-print-table"><thead><tr><th>측정일</th><th>접수번호</th><th>시설명</th><th>측정항목</th><th>결과</th><th>비고</th></tr></thead><tbody>'+chunk.map(function(row){return '<tr><td>'+esc(row.measurement_date)+'</td><td>'+esc(row.receipt_no)+'</td><td>'+esc(row.facility_name)+'</td><td>'+esc(row.items)+'</td><td>'+esc(row.results)+'</td><td>'+esc(row.memo)+'</td></tr>';}).join("")+'</tbody></table><div class="hyr-print-foot">'+esc(form.memo||"")+'<br><br>'+esc(form.issue_date||"")+' &nbsp; 작성자 '+esc(form.prepared_by||"")+'</div></article>';
    }).join("");
  }
  function openHalfPrint(autoPrint){
    if(!half.current)return;var baseHref="",cssHref="report_writer.css?v=120372100";try{baseHref=new URL(".",document.baseURI).href;cssHref=new URL(cssHref,document.baseURI).href;}catch(ignore){}
    var title=half.current.form_data.company_name+" "+half.year+" "+(half.period===1?"상반기":"하반기");
    var html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="'+attr(baseHref)+'"><title>'+esc(title)+'</title><link rel="stylesheet" href="'+attr(cssHref)+'"></head><body class="rpt-print-window"><div class="rpt-print-tools"><b>'+esc(title)+'</b><button onclick="window.print()">인쇄 / PDF</button></div><main class="rpt-print-document">'+halfPrintPages()+'</main>'+(autoPrint?'<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});<\/script>':'')+'</body></html>';
    var popup=window.open("","_blank");if(!popup)return window.alert("미리보기 창이 차단되었습니다.");popup.document.open();popup.document.write(html);popup.document.close();
  }

  function bindHalfDrop(){
    var zone=byId("hyrDropZone"),input=byId("hyrFileInput");if(!zone||!input)return;
    zone.onclick=function(event){if(event.target===input)return;if(!half.current.id)return window.alert("파일 업로드 전에 반기 보고자료를 먼저 저장해주세요.");input.click();};
    input.onchange=function(){uploadHalfFiles(input.files);};
    ["dragenter","dragover"].forEach(function(type){zone.addEventListener(type,function(event){event.preventDefault();event.stopPropagation();if(half.current.id)zone.classList.add("dragging");});});
    ["dragleave","drop"].forEach(function(type){zone.addEventListener(type,function(event){event.preventDefault();event.stopPropagation();zone.classList.remove("dragging");if(type==="drop"&&half.current.id)uploadHalfFiles(event.dataTransfer&&event.dataTransfer.files);});});
  }
  async function loadHalfFiles(){
    var db=database(),current=half.current;if(!db||!current||!current.id){half.files=[];renderHalfFileList();return;}
    try{half.files=await fetchPages(HALF_FILE_TABLE,"*",function(query){return query.eq("report_id",current.id).is("archived_at",null).order("updated_at",{ascending:false});});}catch(error){half.files=[];var message=byId("hyrMessage");if(message){message.textContent=migrationMessage(error);message.className="rpt-message warn";}}renderHalfFileList();
  }
  function renderHalfFileList(){
    var host=byId("hyrFileList");if(!host)return;
    host.innerHTML=half.files.length?half.files.map(function(file){return '<div class="hyr-file-item" data-hyr-file="'+attr(file.id)+'"><span><strong>'+esc(file.file_name)+'</strong><small>'+Math.max(1,Math.round(Number(file.file_size||0)/1024))+' KB</small></span><span><button class="rpt-btn" data-hyr-preview>미리보기</button><button class="rpt-btn" data-hyr-download>받기</button><button class="rpt-btn danger" data-hyr-file-delete>삭제</button></span></div>';}).join(""):'';
    host.querySelectorAll("[data-hyr-file]").forEach(function(element){var file=half.files.find(function(row){return String(row.id)===String(element.dataset.hyrFile);});element.querySelector("[data-hyr-preview]").onclick=function(){previewHalfFile(file);};element.querySelector("[data-hyr-download]").onclick=function(){downloadHalfFile(file);};element.querySelector("[data-hyr-file-delete]").onclick=function(){deleteHalfFile(file);};});
  }
  async function uploadHalfFiles(fileList){
    if(half.fileBusy||!half.current||!half.current.id)return;var db=database(),user=currentUser();if(!db||!user)return window.alert("온라인 DB에 로그인해주세요.");
    var files=Array.prototype.slice.call(fileList||[]).filter(function(file){return file&&file.name&&Number(file.size)<=MAX_FILE_SIZE;});if(!files.length)return window.alert("업로드할 파일이 없거나 50MB를 초과했습니다.");
    half.fileBusy=true;
    try{
      for(var i=0;i<files.length;i+=1){
        var file=files[i],path="report-writer/half-year/"+half.current.id+"/"+storageId()+"_"+safeFileName(file.name);
        var uploaded=await db.storage.from(FILE_BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});if(uploaded.error)throw uploaded.error;
        var saved=await db.from(HALF_FILE_TABLE).insert({report_id:half.current.id,file_name:file.name,storage_path:path,mime_type:file.type||"application/octet-stream",file_size:Number(file.size)||0,created_by:user.id,updated_by:user.id});if(saved.error){await db.storage.from(FILE_BUCKET).remove([path]);throw saved.error;}
      }
      await loadHalfFiles();
    }catch(error){window.alert("파일 업로드에 실패했습니다.\n\n"+migrationMessage(error));}
    finally{half.fileBusy=false;var input=byId("hyrFileInput");if(input)input.value="";}
  }
  async function halfFileBlob(file){var db=database(),result=await db.storage.from(FILE_BUCKET).download(file.storage_path);if(result.error)throw result.error;return result.data;}
  async function previewHalfFile(file){try{var preview=window.DF_QUALITY_FILE_PREVIEW;if(!preview||typeof preview.open!=="function")throw new Error("파일 미리보기 모듈을 불러오지 못했습니다.");await preview.open({name:file.file_name,mime:file.mime_type,size:file.file_size,load:function(){return halfFileBlob(file);}});}catch(error){window.alert("미리보기를 열지 못했습니다.\n\n"+(error.message||error));}}
  async function downloadHalfFile(file){try{var blob=await halfFileBlob(file),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file.file_name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);}catch(error){window.alert("파일을 받지 못했습니다.\n\n"+(error.message||error));}}
  async function deleteHalfFile(file){
    if(!window.confirm('"'+file.file_name+'" 파일을 삭제할까요?'))return;var db=database(),user=currentUser();
    try{var result=await db.from(HALF_FILE_TABLE).update({archived_at:new Date().toISOString(),archived_by:user.id,updated_by:user.id}).eq("id",file.id).is("archived_at",null);if(result.error)throw result.error;await db.storage.from(FILE_BUCKET).remove([file.storage_path]);await loadHalfFiles();}catch(error){window.alert("파일을 삭제하지 못했습니다.\n\n"+migrationMessage(error));}
  }

  function openReports(){if(!canUse()){renderReportFailure("드림포이엔 자료실 열람 권한이 필요합니다.");return;}loadReportData(false);}
  function openHalfYear(){if(!canUse()){renderHalfFailure("드림포이엔 자료실 열람 권한이 필요합니다.");return;}loadHalfData(false);}
  function health(){
    var issues=[];["dfViewMeasurementReports","dfViewHalfYearReports","dfMeasurementReportApp","dfHalfYearReportApp"].forEach(function(id){if(!byId(id))issues.push(id+" 없음");});
    return {version:VERSION,ok:issues.length===0,issues:issues,reportSources:state.sources.length,halfSources:half.sources.length};
  }
  function init(){
    loadStoredFilters();
    window.DF_REPORT_WRITER={version:VERSION,openReports:openReports,openHalfYear:openHalfYear,health:health,_test:{draftFromSource:draftFromSource,sheetHtml:sheetHtml,analysisResult:analysisResult,stackMetrics:stackMetrics,blankForm:blankForm}};
    diag("info","성적서작성 모듈 준비 완료","기존 자료 조회 전용 · 별도 작성자료 저장");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
