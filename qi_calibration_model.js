/* DREAMFOREN Beta 368 · 초자 내부교정 계산/검증. 권한·저장소·서버 접근 없음. */
(function(root){
  "use strict";
  var DATA=root.DF_QI_CAL_DATA;
  if(!DATA)throw new Error("교정 기본설정을 먼저 불러와주세요.");
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var DECIMAL=/^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
  var BOUNDS={nominal:[0,10000000],m1:[0,10000000],m2:[0,10000000],temp:[0,100],beta:[0,0.01],tolerance:[0,10000000],densityOverride:[0.0012,1.1]};
  var NUMERIC_KEYS=Object.keys(BOUNDS);
  var LABELS={nominal:"정격 용량",m1:"M1",m2:"M2",temp:"물 온도",beta:"부피팽창계수",tolerance:"허용오차",densityOverride:"물의 밀도"};
  function text(value){return value===null||value===undefined?"":String(value).trim();}
  function blank(value){return value===null||value===undefined||text(value)==="";}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function number(value){
    if(blank(value)||typeof value!=="string"&&typeof value!=="number")return null;
    var s=text(value);if(!DECIMAL.test(s))return null;
    var n=Number(s);return Number.isFinite(n)?n:null;
  }
  function within(key,value){
    var n=number(value),b=BOUNDS[key];
    return n!==null&&n>=b[0]&&n<=b[1]&&((key!=="nominal"&&key!=="densityOverride")||n>b[0]);
  }
  function uuid(){
    var c=root.crypto;
    if(c&&typeof c.randomUUID==="function")return c.randomUUID();
    if(c&&typeof c.getRandomValues==="function"){
      var bytes=new Uint8Array(16);c.getRandomValues(bytes);bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;
      var h=Array.from(bytes,function(v){return v.toString(16).padStart(2,"0");}).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
    }
    throw new Error("안전한 교정 식별번호를 만들 수 없습니다. HTTPS로 다시 열어주세요.");
  }
  function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
  function defaultCriteria(){
    return {version:368,reference_temperature_c:DATA.constants.reference_temperature_c,air_density_g_cm3:DATA.constants.air_density_g_cm3,weight_density_g_cm3:DATA.constants.weight_density_g_cm3,density_version:DATA.density_version,density_table:clone(DATA.density)};
  }
  function criteriaFor(value){
    if(!value)return defaultCriteria();
    var c=value.criteria||value.data&&value.data.criteria||value;
    return c;
  }
  function validCriteria(value){
    return !!value&&Number(value.version)===368&&value.reference_temperature_c===20&&value.air_density_g_cm3===0.0012&&value.weight_density_g_cm3===8&&typeof value.density_version==="string"&&value.density_table&&typeof value.density_table==="object"&&!Array.isArray(value.density_table);
  }
  function densityAt(temp,criteria){
    var n=number(temp),c=criteriaFor(criteria);
    if(n===null||!validCriteria(c))return null;
    // A lookup must use exactly a tenth degree. Never round/extrapolate an unsupported reading.
    var fraction=text(temp).split(".")[1]||"";if(fraction.replace(/0+$/,"").length>1)return null;
    var v=c.density_table[n.toFixed(1)];return within("densityOverride",v)?Number(v):null;
  }
  function issue(field,message){return {field:field,message:message};}
  function itemIssues(item){
    var errors=[];
    if(!item||typeof item!=="object"||Array.isArray(item))return [issue("item","초자 항목이 올바르지 않습니다.")];
    if(!UUID.test(text(item.id)))errors.push(issue("id","초자 식별번호가 올바르지 않습니다."));
    [["name",160,"초자명"],["code",80,"관리번호"],["kind",40,"종류"],["material",80,"재질"]].forEach(function(def){if(!text(item[def[0]])||text(item[def[0]]).length>def[1])errors.push(issue(def[0],def[2]+"을 확인해주세요."));});
    if(item.mode!=="수용"&&item.mode!=="출용")errors.push(issue("mode","수용·출용 구분을 확인해주세요."));
    if(typeof item.criteriaConfirmed!=="boolean")errors.push(issue("criteriaConfirmed","기준 확인 상태가 올바르지 않습니다."));
    NUMERIC_KEYS.forEach(function(key){
      if(blank(item[key])){
        if(key==="nominal")errors.push(issue(key,"정격 용량을 입력해주세요."));
        else if(item.criteriaConfirmed&&(key==="beta"||key==="tolerance"))errors.push(issue(key,LABELS[key]+"를 입력한 뒤 기준을 확인해주세요."));
      }else if(!within(key,item[key]))errors.push(issue(key,LABELS[key]+"의 숫자와 범위를 확인해주세요."));
    });
    var m1=number(item.m1),m2=number(item.m2);
    if(m1!==null&&m2!==null&&m2<=m1)errors.push(issue("m2","M2는 M1보다 커야 합니다."));
    if(!blank(item.densityOverride)&&text(item.densityReason).length<2)errors.push(issue("densityReason","밀도를 직접 입력한 근거를 두 글자 이상 적어주세요."));
    if(text(item.densityReason).length>500)errors.push(issue("densityReason","밀도 확인 근거는 500자 이내로 입력해주세요."));
    if(text(item.note).length>1000)errors.push(issue("note","비고는 1,000자 이내로 입력해주세요."));
    return errors;
  }
  function calculate(item,criteria){
    item=item||{};var c=criteriaFor(criteria),errors=itemIssues(item);
    // Identity/description validation belongs to save validation, not the numerical result.
    var numericErrors=errors.filter(function(e){return NUMERIC_KEYS.indexOf(e.field)>=0||e.field==="densityReason"||item.criteriaConfirmed===true&&(e.field==="material"||e.field==="mode");});
    var r={status:"draft",label:"미작성",rho:null,mass:null,volume:null,error:null,tolerance:number(item.tolerance),pass:null,complete:false,issues:numericErrors,densitySource:blank(item.densityOverride)?"table":"manual",calculation_version:368};
    if(!validCriteria(c)){r.label="계산기준 확인";return r;}
    var manual=!blank(item.densityOverride);
    r.rho=manual?number(item.densityOverride):densityAt(item.temp,c);
    if(numericErrors.length){r.label=numericErrors.some(function(e){return e.field==="tolerance"&&blank(item.tolerance);})?"기준 미입력":"확인 필요";return r;}
    if(["m1","m2","temp"].some(function(k){return blank(item[k]);}))return r;
    if(r.rho===null||!within("densityOverride",r.rho)){r.label="밀도 확인";return r;}
    if(blank(item.beta)){r.label="기준 미입력";return r;}
    var m1=number(item.m1),m2=number(item.m2),t=number(item.temp),beta=number(item.beta),nominal=number(item.nominal);
    if(m1===null||m2===null||t===null||beta===null||nominal===null||m2<=m1){r.label="확인 필요";return r;}
    r.mass=m2-m1;
    r.volume=r.mass*(1-c.air_density_g_cm3/c.weight_density_g_cm3)/(r.rho-c.air_density_g_cm3)*(1+beta*(c.reference_temperature_c-t));
    r.error=nominal-r.volume;
    if(!Number.isFinite(r.volume)||r.volume<=0||!Number.isFinite(r.error)){r.volume=null;r.error=null;r.label="확인 필요";return r;}
    if(blank(item.tolerance)){r.label="기준 미입력";return r;}
    if(item.criteriaConfirmed!==true){r.label="기준 확인";return r;}
    // Verdict uses unrounded values; display rounding must never turn a failure into a pass.
    r.pass=Math.abs(r.error)<=r.tolerance;r.status=r.pass?"pass":"fail";r.label=r.pass?"적합":"부적합";r.complete=true;return r;
  }
  function newItem(type,existing){
    if(typeof type==="string")type=DATA.types.find(function(t){return t.id===type;});
    if(!type)throw new Error("초자 종류를 선택해주세요.");
    existing=Array.isArray(existing)?existing:[];
    var prefix={"부피플라스크":"VF","피펫":"PP","뷰렛":"BT","메스실린더":"MC"}[type.kind]||"GL",n=1,code;
    do{code=prefix+"-"+type.nominal_ml+"-"+String(n++).padStart(2,"0");}while(existing.some(function(x){return text(x.code)===code;}));
    return {id:uuid(),typeId:type.id,name:type.name,kind:type.kind,nominal:String(type.nominal_ml),code:code,material:type.material,beta:blank(type.beta)?"":String(type.beta),mode:type.mode,tolerance:blank(type.tolerance_ml)?"":String(type.tolerance_ml),criteriaConfirmed:false,m1:"",m2:"",temp:"",densityOverride:"",densityReason:"",note:"",photos:[null,null]};
  }
  function resetMeasurements(items){
    if(!Array.isArray(items))items=items&&items.items||[];
    return items.map(function(item){var copy=clone(item);copy.m1="";copy.m2="";copy.temp="";copy.densityOverride="";copy.densityReason="";copy.note="";copy.photos=[null,null];return copy;});
  }
  function createSession(options){
    options=options||{};var items=[];
    if(Array.isArray(options.items))items=resetMeasurements(options.items);
    else DATA.types.forEach(function(type){items.push(newItem(type,items));});
    var sessionDate=today();
    return {id:uuid(),date:sessionDate,end_date:sessionDate,operator:"",reviewer:"",balance:"",thermometer:"",calculation_version:368,criteria:defaultCriteria(),items:items};
  }
  function validDate(value){
    var s=text(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<"2000-01-01"||s>"2100-12-31")return false;
    var d=new Date(s+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
  }
  function validateSession(draft){
    var errors=[],items=draft&&draft.items,counts={pass:0,fail:0,draft:0},results=[];
    if(!draft||typeof draft!=="object"||Array.isArray(draft))return {ok:false,errors:[{itemId:null,field:"session",message:"교정일지가 올바르지 않습니다."}],counts:counts,status:"draft",results:[]};
    var date=draft.date===undefined?draft.calibration_date:draft.date;
    if(!validDate(date))errors.push({itemId:null,field:"date",message:"분석 시작일을 확인해주세요."});
    var end=draft.calibration_end_date===undefined?(draft.end_date===undefined?date:draft.end_date):draft.calibration_end_date;
    if(!validDate(end))errors.push({itemId:null,field:"calibration_end_date",message:"분석 종료일을 확인해주세요."});
    else if(validDate(date)&&end<date)errors.push({itemId:null,field:"calibration_end_date",message:"분석 종료일은 시작일보다 빠를 수 없습니다."});
    [["operator",draft.operator,100,"담당자"],["reviewer",draft.reviewer,100,"검토자"],["balance",draft.balance===undefined?draft.balance_code:draft.balance,100,"사용 저울"],["thermometer",draft.thermometer===undefined?draft.thermometer_code:draft.thermometer,100,"온도계"]].forEach(function(x){if(text(x[1]).length>x[2])errors.push({itemId:null,field:x[0],message:x[3]+"는 100자 이내로 입력해주세요."});});
    if(!Array.isArray(items)||items.length<1||items.length>500){errors.push({itemId:null,field:"items",message:"초자는 1개 이상 500개 이하로 작성해주세요."});items=[];}
    var ids=new Set(),codes=new Set(),photoIds=new Set(),c=criteriaFor(draft.criteria||draft.data&&draft.data.criteria);
    if(!validCriteria(c))errors.push({itemId:null,field:"criteria",message:"교정 계산기준을 확인해주세요."});
    items.forEach(function(item){
      var id=item&&item.id||null;
      itemIssues(item).forEach(function(e){errors.push({itemId:id,field:e.field,message:e.message});});
      if(item&&typeof item==="object"){
        if(ids.has(item.id))errors.push({itemId:id,field:"id",message:"초자 식별번호가 중복되었습니다."});else ids.add(item.id);
        if(codes.has(text(item.code)))errors.push({itemId:id,field:"code",message:"관리번호가 중복되었습니다."});else codes.add(text(item.code));
        if(!Array.isArray(item.photos)||item.photos.length!==2)errors.push({itemId:id,field:"photos",message:"사진은 측정 전·후 두 칸으로 저장해주세요."});
        else item.photos.forEach(function(photo,slot){
          if(photo===null)return;
          var invalid=!photo||typeof photo!=="object"||Array.isArray(photo)||!UUID.test(text(photo.id))||!text(photo.path)||text(photo.path).length>500||!text(photo.name)||text(photo.name).length>255||!["image/jpeg","image/png","image/webp","image/avif","image/gif"].includes(photo.mime)||!Number.isSafeInteger(photo.size)||photo.size<1||photo.size>20*1024*1024||!/^[0-9a-f]{64}$/i.test(text(photo.sha256));
          if(invalid)errors.push({itemId:id,field:"photos",slot:slot,message:"첨부 사진의 원본정보를 확인해주세요."});
          else if(photoIds.has(photo.id))errors.push({itemId:id,field:"photos",slot:slot,message:"같은 사진 식별번호가 중복되었습니다."});else photoIds.add(photo.id);
        });
      }
      var r=calculate(item,c);results.push({itemId:id,result:r});counts[r.status]++;
    });
    var complete=items.length>0&&counts.draft===0&&!errors.length;
    return {ok:errors.length===0,errors:errors,counts:counts,status:complete?"complete":"draft",results:results};
  }
  function confirmCriteria(item){
    var next=clone(item);next.criteriaConfirmed=true;
    var errors=itemIssues(next).filter(function(e){return ["nominal","beta","tolerance","material","mode"].includes(e.field);});
    return {ok:errors.length===0,item:errors.length?clone(item):next,errors:errors};
  }
  function updateCriteria(item,changes){
    var next=Object.assign(clone(item),clone(changes||{}));
    if(["nominal","beta","tolerance","material","mode"].some(function(k){return Object.prototype.hasOwnProperty.call(changes||{},k)&&String(changes[k])!==String(item[k]);}))next.criteriaConfirmed=false;
    return next;
  }
  function format(value,digits){return Number.isFinite(value)?value.toFixed(digits===undefined?4:digits):"—";}
  root.DF_QI_CAL_MODEL=Object.freeze({version:368,number:number,uuid:uuid,today:today,calculate:calculate,densityAt:densityAt,defaultCriteria:defaultCriteria,newItem:newItem,createSession:createSession,resetMeasurements:resetMeasurements,validateSession:validateSession,confirmCriteria:confirmCriteria,updateCriteria:updateCriteria,format:format});
})(typeof window!=="undefined"?window:globalThis);
