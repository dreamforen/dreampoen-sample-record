/* DREAMFOREN Beta 370 · Excel 원시입력 미리보기. 파일·서버·기존 일지를 변경하지 않습니다. */
(function(root){
  "use strict";
  var HEADERS=["종류","용량(mL)","관리번호","M1(g)","M2(g)","물온도(℃)","재질","팽창계수","허용오차(mL)","교정일","담당자","사용저울","온도계","비고"];
  var PREFIX={"피펫":"PP","뷰렛":"BT","부피플라스크":"VF","메스실린더":"MC"};
  var NUMERIC={nominal:[0,10000000],m1:[0,10000000],m2:[0,10000000],temp:[0,100],beta:[0,0.01],tolerance:[0,10000000]};
  var LABEL={kind:"종류",nominal:"용량",code:"관리번호",material:"재질",beta:"팽창계수",mode:"수용·출용",tolerance:"허용오차",m1:"M1",m2:"M2",temp:"물 온도",note:"비고",calibration_date:"교정일"};
  var ALIASES={kind:["종류","초자종류","초자명","품명"],nominal:["용량ml","정격용량ml","정격용량","용량","부피ml"],code:["관리번호","관리코드","초자번호"],m1:["m1g","m1"],m2:["m2g","m2"],temp:["물온도c","물의온도c","물온도","물의온도","온도c"],material:["재질"],beta:["팽창계수","부피팽창계수"],tolerance:["허용오차ml","허용오차","최대허용오차","최대허용오차ml"],date:["교정일","교정일자","점검일","점검일자"],operator:["담당자","점검자","교정자"],balance_code:["사용저울","저울","저울관리번호"],thermometer_code:["온도계","사용온도계","온도계관리번호"],note:["비고","특이사항"],mode:["수용출용","수용출용구분","구분"]};
  var HEADER_KEYS=Object.create(null);Object.keys(ALIASES).forEach(function(k){ALIASES[k].forEach(function(s){HEADER_KEYS[s]=k;});});
  function txt(v){return v===null||v===undefined?"":String(v).trim();}
  function blank(v){return txt(v)==="";}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function norm(v){return txt(v).toLowerCase().replace(/℃|°\s*c/g,"c").replace(/[\s()\[\]{}<>_·\-\/\\]/g,"");}
  function issue(source,field,message){return {source:source||null,sheet:source&&source.sheet||"",row:source&&source.row||null,field:field,message:message};}
  function decimal(value){
    if(blank(value))return "";
    if(typeof value!=="number"&&typeof value!=="string")return null;
    var s=txt(value);
    if(s.indexOf(",")>=0){if(!/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s))return null;s=s.replace(/,/g,"");}
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)||!Number.isFinite(Number(s)))return null;
    // Excel numeric cells use IEEE doubles. String(number) removes XML serialization noise.
    if(typeof value==="number")s=String(value);
    var sign="";if(s[0]==="-"||s[0]==="+"){if(s[0]==="-")sign="-";s=s.slice(1);}
    var exp=s.toLowerCase().split("e"),parts=exp[0].split("."),digits=parts.join(""),point=parts[0].length+Number(exp[1]||0);
    if(Math.abs(Number(exp[1]||0))>100)return null;
    if(point<=0)s="0."+"0".repeat(-point)+digits;
    else if(point>=digits.length)s=digits+"0".repeat(point-digits.length);
    else s=digits.slice(0,point)+"."+digits.slice(point);
    parts=s.split(".");parts[0]=parts[0].replace(/^0+(?=\d)/,"")||"0";
    if(parts[1])parts[1]=parts[1].replace(/0+$/,"");
    s=parts[0]+(parts[1]?"."+parts[1]:"");return s==="0"?"0":sign+s;
  }
  function kindOf(value){
    var s=norm(value);
    if(/피펫|pipet/.test(s))return "피펫";
    if(/뷰렛|buret/.test(s))return "뷰렛";
    if(/실린더|cylinder/.test(s))return "메스실린더";
    if(/플라스크|flask/.test(s))return "부피플라스크";
    return "";
  }
  function nominalIn(value){var m=txt(value).match(/(\d+(?:\.\d+)?)\s*(?:m\s*l|㎖)/i);return m?decimal(m[1]):"";}
  function cell(sheet,address){return sheet&&sheet[address]||null;}
  function meaningful(c){return !!c&&(!blank(c.v)||!blank(c.f));}
  function read(sheet,address,source,field,errors){
    var c=cell(sheet,address);if(!c)return "";
    if(!blank(c.f)){errors.push(issue(source,field,address+": 수식 대신 원시 입력값을 넣어주세요."));return "";}
    if(c.t==="e"){errors.push(issue(source,field,address+": Excel 오류 값을 확인해주세요."));return "";}
    return c.v===null||c.v===undefined?"":c.v;
  }
  function column(n){var s="";for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
  function position(a){var m=txt(a).replace(/\$/g,"").match(/^([A-Z]+)([1-9]\d*)$/i);if(!m)return null;var n=0;for(var i=0;i<m[1].length;i++)n=n*26+m[1].toUpperCase().charCodeAt(i)-64;return {row:Number(m[2]),col:n};}
  function bounds(sheet){
    var maxRow=0,maxCol=0,cells=0;
    Object.keys(sheet||{}).forEach(function(a){if(a[0]==="!")return;var p=position(a);if(p){maxRow=Math.max(maxRow,p.row);maxCol=Math.max(maxCol,p.col);cells++;}});
    [sheet&&sheet["!ref"],sheet&&sheet["!fullref"]].forEach(function(ref){if(!ref)return;var p=position(txt(ref).split(":").pop());if(p){maxRow=Math.max(maxRow,p.row);maxCol=Math.max(maxCol,p.col);}});
    return {rows:maxRow,cols:maxCol,cells:cells};
  }
  function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<"2000-01-01"||s>"2100-12-31")return false;var d=new Date(s+"T00:00:00Z");return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
  function dateValue(v,date1904){
    if(blank(v))return "";var s;
    if(Object.prototype.toString.call(v)==="[object Date]"){if(isNaN(v.getTime()))return null;s=v.toISOString().slice(0,10);}
    else if(typeof v==="number"){
      if(!Number.isFinite(v)||v<0||v>80000)return null;
      var serial=Math.floor(v),epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
      if(!date1904&&serial<60)epoch=Date.UTC(1899,11,31);
      s=new Date(epoch+serial*86400000).toISOString().slice(0,10);
    }else{
      var m=txt(v).match(/^(\d{4})\s*(?:[-/.]|년)\s*(\d{1,2})\s*(?:[-/.]|월)\s*(\d{1,2})\s*(?:일|\.)?$/);
      if(!m)return null;s=m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
    }
    return validDate(s)?s:null;
  }
  function headerAt(sheet,end){
    for(var r=1;r<=Math.min(30,end.rows);r++){
      var map=Object.create(null),duplicates=[];
      for(var c=0;c<Math.min(100,end.cols);c++){
        var x=cell(sheet,column(c)+r);if(!x||!blank(x.f))continue;
        var key=HEADER_KEYS[norm(x.v)];if(!key)continue;
        if(Object.prototype.hasOwnProperty.call(map,key))duplicates.push(key);else map[key]=c;
      }
      if(Object.prototype.hasOwnProperty.call(map,"kind")&&Object.prototype.hasOwnProperty.call(map,"nominal"))return {row:r,map:map,duplicates:duplicates};
    }
    return null;
  }
  function legacyShape(sheet){return norm(cell(sheet,"A6")&&cell(sheet,"A6").v)==="순번"&&norm(cell(sheet,"C6")&&cell(sheet,"C6").v)==="m1g"&&norm(cell(sheet,"D6")&&cell(sheet,"D6").v)==="m2g";}
  function normalized(raw,source,errors,date1904){
    var row={source:source,kind:kindOf(raw.kind),nominal:decimal(raw.nominal),name:"",code:txt(raw.code),codeInferred:blank(raw.code),ordinal:raw.ordinal||null,material:txt(raw.material),beta:"",mode:txt(raw.mode),tolerance:"",m1:"",m2:"",temp:"",note:txt(raw.note),date:"",operator:txt(raw.operator),balance_code:txt(raw.balance_code),thermometer_code:txt(raw.thermometer_code)};
    // A label may supply an omitted capacity, but never replace a mistyped explicit capacity.
    if(blank(raw.nominal))row.nominal=nominalIn(raw.kind);
    if(!row.kind)errors.push(issue(source,"kind","피펫·뷰렛·부피플라스크·메스실린더 중 종류를 확인해주세요."));
    if(row.nominal===null||row.nominal===""||row.nominal.length>80||Number(row.nominal)<=0||Number(row.nominal)>10000000)errors.push(issue(source,"nominal","용량은 80자 이내의 0보다 큰 숫자로 입력해주세요."));
    var labelNominal=nominalIn(raw.kind);if(!blank(raw.nominal)&&labelNominal&&row.nominal&&labelNominal!==row.nominal)errors.push(issue(source,"nominal","종류에 표시된 용량과 용량 열의 값이 다릅니다."));
    ["beta","tolerance","m1","m2","temp"].forEach(function(k){row[k]=decimal(raw[k]);if(row[k]===null){errors.push(issue(source,k,LABEL[k]+" 숫자를 확인해주세요."));row[k]="";}else if(row[k].length>80)errors.push(issue(source,k,LABEL[k]+" 숫자는 80자 이내로 입력해주세요."));else if(row[k]!==""&&(Number(row[k])<NUMERIC[k][0]||Number(row[k])>NUMERIC[k][1]))errors.push(issue(source,k,LABEL[k]+" 범위를 확인해주세요."));});
    if(row.m1!==""&&row.m2!==""&&Number(row.m2)<=Number(row.m1))errors.push(issue(source,"m2","M2는 M1보다 커야 합니다."));
    var date=dateValue(raw.date,date1904);if(date===null)errors.push(issue(source,"date","교정일을 2000~2100년의 날짜로 입력해주세요."));else row.date=date;
    [["code",60],["material",80],["note",1000],["operator",100],["balance_code",100],["thermometer_code",100]].forEach(function(x){if(row[x[0]].length>x[1])errors.push(issue(source,x[0],(LABEL[x[0]]||x[0])+"는 "+x[1]+"자 이내로 입력해주세요."));});
    if(row.mode&&row.mode!=="수용"&&row.mode!=="출용")errors.push(issue(source,"mode","수용 또는 출용으로 입력해주세요."));
    row.name=(row.nominal||"")+" mL "+row.kind;
    return row;
  }
  function parseWorkbook(book,options){
    options=options||{};var errors=[],warnings=[],rows=[],recognized=[],ignored=[],totalCells=0,scannedRows=0;
    var maxRows=Number.isInteger(options.maxRows)&&options.maxRows>0?Math.min(options.maxRows,2000):2000;
    if(!book||!Array.isArray(book.SheetNames)||!book.Sheets)return {ok:false,rows:[],groups:[],errors:[issue(null,"workbook","Excel 파일 구조를 확인해주세요.")],warnings:[]};
    if(book.SheetNames.length>30)return {ok:false,rows:[],groups:[],errors:[issue(null,"sheets","Excel 시트는 30개 이하로 나누어 업로드해주세요.")],warnings:[]};
    var date1904=!!(book.Workbook&&book.Workbook.WBProps&&(book.Workbook.WBProps.date1904===true||book.Workbook.WBProps.date1904===1||book.Workbook.WBProps.date1904==="1"||book.Workbook.WBProps.date1904==="true"));
    book.SheetNames.forEach(function(sheetName){
      var sheet=book.Sheets[sheetName],end=bounds(sheet),sheetSource={sheet:sheetName,row:null,fileName:txt(options.fileName),format:""};totalCells+=end.cells;
      if(end.rows>2000||end.cols>100||totalCells>200000){errors.push(issue(sheetSource,"rows","시트 범위가 큽니다. 2,000행·100열 이내로 나누어주세요."));return;}
      var header=headerAt(sheet,end),legacy=legacyShape(sheet);
      if(header){
        recognized.push(sheetName);
        if(header.duplicates.length){errors.push(issue(Object.assign({},sheetSource,{row:header.row}),"sheets","같은 항목의 제목 열이 중복되었습니다."));return;}
        for(var r=header.row+1;r<=end.rows;r++){
          var keys=Object.keys(header.map),has=keys.some(function(k){return meaningful(cell(sheet,column(header.map[k])+r));});if(!has)continue;
          var source={sheet:sheetName,row:r,fileName:txt(options.fileName),format:"flat"};
          if(++scannedRows>maxRows){errors.push(issue(source,"rows","입력 자료가 "+maxRows+"행을 넘습니다. 파일을 나누어주세요."));break;}
          var before=errors.length,raw={};keys.forEach(function(k){raw[k]=options.annualMode&&k==="date"?"":read(sheet,column(header.map[k])+r,source,k,errors);});
          var n=normalized(raw,source,errors,date1904);n.invalid=errors.length>before;rows.push(n);
        }
      }else if(legacy){
        var label=cell(sheet,"B4")&&cell(sheet,"B4").v;if(!kindOf(label)&&blank(label)){ignored.push(sheetName);return;}
        recognized.push(sheetName);
        for(var j=8;j<=end.rows;j++){
          // Only original M1/M2/temperature inputs create records. Formula-only result rows do not.
          if(!["C","D","F","G"].some(function(c){return meaningful(cell(sheet,c+j));}))continue;
          var src={sheet:sheetName,row:j,fileName:txt(options.fileName),format:"legacy"};
          if(++scannedRows>maxRows){errors.push(issue(src,"rows","입력 자료가 "+maxRows+"행을 넘습니다. 파일을 나누어주세요."));break;}
          var startErrors=errors.length,ordinal=read(sheet,"A"+j,src,"ordinal",errors),f=read(sheet,"F"+j,src,"temp",errors),g=read(sheet,"G"+j,src,"temp",errors),fd=decimal(f),gd=decimal(g),temp="";
          if(!blank(g)&&blank(f))errors.push(issue(src,"temp","온도의 정수부 F열을 확인해주세요."));
          if(fd===null||gd===null)errors.push(issue(src,"temp","물 온도의 F열·G열 숫자를 확인해주세요."));
          else if(gd!==""&&fd!==""&&!Number.isInteger(Number(fd)))errors.push(issue(src,"temp","F열에는 온도의 정수부, G열에는 소수부를 입력해주세요."));
          else if(gd!==""&&(Number(gd)<0||Number(gd)>=1))errors.push(issue(src,"temp","온도의 소수부 G열은 0 이상 1 미만으로 입력해주세요."));
          else if(fd!=="")temp=gd===""||gd==="0"?fd:decimal(fd+"."+(gd.split(".")[1]||"0"));
          var ord=decimal(ordinal);if(ord!==""&&(ord===null||!Number.isSafeInteger(Number(ord))||Number(ord)<1||Number(ord)>100000))errors.push(issue(src,"ordinal","순번은 1 이상의 정수로 입력해주세요."));
          var materialLabel=txt(read(sheet,"B6",src,"material",errors)),materialMatch=materialLabel.match(/[（(]([^()（）]+)[)）]/);
          var rawLegacy={kind:read(sheet,"B4",src,"kind",errors),nominal:nominalIn(label),ordinal:ord===""||ord===null?null:Number(ord),m1:read(sheet,"C"+j,src,"m1",errors),m2:read(sheet,"D"+j,src,"m2",errors),temp:temp,beta:read(sheet,"B"+j,src,"beta",errors),tolerance:read(sheet,"J"+j,src,"tolerance",errors),material:materialMatch?materialMatch[1]:"",date:options.annualMode?"":read(sheet,"E4",src,"date",errors),operator:read(sheet,"H4",src,"operator",errors),note:read(sheet,"N"+j,src,"note",errors)};
          var nLegacy=normalized(rawLegacy,src,errors,date1904);nLegacy.invalid=errors.length>startErrors;rows.push(nLegacy);
        }
      }else ignored.push(sheetName);
    });
    // Stable physical-item numbers make reupload a comparison, rather than another set of items.
    var counters={},reserved={};rows.forEach(function(row){if(row.kind&&row.nominal){var group=row.kind+"|"+row.nominal;if(row.ordinal)reserved[group+"|"+row.ordinal]=true;}});
    rows.forEach(function(row){
      if(!row.code&&row.kind&&row.nominal){var group=row.kind+"|"+row.nominal,n=row.ordinal;if(!n){n=(counters[group]||0)+1;while(reserved[group+"|"+n])n++;counters[group]=n;reserved[group+"|"+n]=true;row.ordinal=n;}row.code=PREFIX[row.kind]+"-"+row.nominal+"-"+String(n).padStart(2,"0");}
    });
    var groupsMap={},groups=[];rows.forEach(function(row){var key=row.date||"";if(!groupsMap[key]){groupsMap[key]={date:key,rows:[],metadata:{},metadataConflicts:[]};groups.push(groupsMap[key]);}groupsMap[key].rows.push(row);});
    groups.forEach(function(group){["operator","balance_code","thermometer_code"].forEach(function(k){var values=Array.from(new Set(group.rows.map(function(r){return r[k];}).filter(Boolean)));group.metadata[k]=values.length===1?values[0]:"";if(values.length>1)group.metadataConflicts.push({field:k,values:values});});});
    if(ignored.length)warnings.push({field:"sheets",sheets:ignored,message:"입력 양식이 아닌 시트 "+ignored.length+"개를 제외했습니다."});
    if(rows.some(function(r){return r.codeInferred;}))warnings.push({field:"code",message:"관리번호가 빈 행은 종류·용량·순번으로 번호를 추정했습니다. 적용 전 확인해주세요."});
    if(groups.length>1)warnings.push({field:"date",message:"교정일이 여러 개입니다. 각 교정일을 유지해 분석기간에 함께 반영합니다."});
    if(!rows.length&&!errors.length)errors.push(issue(null,"rows",recognized.length?"입력된 초자 자료가 없습니다.":"지원하는 초자 교정 입력 양식을 찾지 못했습니다."));
    return {ok:errors.length===0,rows:rows,groups:groups,errors:errors,warnings:warnings,recognizedSheets:recognized,ignoredSheets:ignored};
  }
  function same(a,b,key){return NUMERIC[key]?decimal(a)===decimal(b):txt(a)===txt(b);}
  function itemProblems(item,source){
    var errors=[];
    [["name",120],["code",60],["kind",40],["material",80]].forEach(function(x){if(!txt(item[x[0]])||txt(item[x[0]]).length>x[1])errors.push(issue(source,x[0],(LABEL[x[0]]||"초자명")+"을 확인해주세요."));});
    if(item.mode!=="수용"&&item.mode!=="출용")errors.push(issue(source,"mode","수용·출용을 확인해주세요."));
    Object.keys(NUMERIC).forEach(function(k){var v=decimal(item[k]),b=NUMERIC[k];if((k==="nominal"&&(v===""||Number(v)<=0))||v===null||v!==null&&v.length>80||v!==""&&(Number(v)<b[0]||Number(v)>b[1]))errors.push(issue(source,k,LABEL[k]+" 숫자와 범위를 확인해주세요."));});
    if(!blank(item.m1)&&!blank(item.m2)&&Number(item.m2)<=Number(item.m1))errors.push(issue(source,"m2","M2는 M1보다 커야 합니다."));
    if(txt(item.note).length>1000)errors.push(issue(source,"note","비고는 1,000자 이내로 입력해주세요."));
    if(!blank(item.calibration_date)&&(typeof item.calibration_date!=="string"||item.calibration_date!==txt(item.calibration_date)||!validDate(item.calibration_date)))errors.push(issue(source,"calibration_date","초자별 교정일을 2000~2100년의 실제 날짜로 입력해주세요."));
    return errors;
  }
  function newImportItem(row,existing,options){
    var data=root.DF_QI_CAL_DATA,model=root.DF_QI_CAL_MODEL,types=data&&data.types||[],known=types.find(function(t){return t.kind===row.kind&&Number(t.nominal_ml)===Number(row.nominal);}),kindDefault=types.find(function(t){return t.kind===row.kind;});
    var id=options.uuidFactory?options.uuidFactory():model&&model.uuid?model.uuid():root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():null;
    if(!id)throw Error("안전한 초자 식별번호를 만들 수 없습니다.");
    return {id:id,typeId:known?known.id:"custom:"+row.kind+"|"+row.nominal,name:row.name,kind:row.kind,nominal:row.nominal,code:row.code,material:row.material||(known?known.material:""),beta:row.beta,mode:row.mode||(kindDefault?kindDefault.mode:""),tolerance:row.tolerance,criteriaConfirmed:false,calibration_date:blank(row.date)?"":row.date,m1:row.m1,m2:row.m2,temp:row.temp,densityOverride:"",densityReason:"",note:row.note,photos:[null,null]};
  }
  function plan(rows,existingItems,criteria,options){
    options=options||{};var errors=[],candidates=[],summary={add:0,fill:0,skip:0,conflict:0},existing=Array.isArray(existingItems)?existingItems:[];
    if(!Array.isArray(rows)||rows.length>2000)return {ok:false,candidates:[],summary:summary,errors:[issue(null,"rows","가져올 입력 행을 확인해주세요.")]};
    if(existing.some(function(item){return !item||typeof item!=="object"||Array.isArray(item);}))return {ok:false,candidates:[],summary:summary,errors:[issue(null,"items","기존 초자 목록을 확인해주세요.")]};
    var incomingCounts=Object.create(null),byCode=Object.create(null);rows.forEach(function(r){var c=txt(r&&r.code);incomingCounts[c]=(incomingCounts[c]||0)+1;});existing.forEach(function(item,index){var c=txt(item&&item.code);if(!byCode[c])byCode[c]=[];byCode[c].push({item:item,index:index});});
    rows.forEach(function(row,index){
      row=row||{};var candidate={index:index,source:clone(row.source||{}),row:clone(row),action:"conflict",item:null,existingId:null,existingIndex:null,changedFields:[],conflicts:[],reason:"",codeInferred:!!row.codeInferred};
      var matches=byCode[txt(row.code)]||[];
      function conflict(field,message,current,incoming){candidate.conflicts.push({field:field,label:LABEL[field]||field,message:message,current:current===undefined?"":current,incoming:incoming===undefined?"":incoming});}
      if(row.invalid)conflict("row","Excel 입력 오류를 먼저 수정해주세요.");
      if(!txt(row.code))conflict("code","관리번호를 확인해주세요.");
      if(incomingCounts[txt(row.code)]>1)conflict("code","파일 안에서 관리번호가 중복되었습니다.");
      if(matches.length>1)conflict("code","기존 일지에 같은 관리번호가 여러 개 있습니다.");
      if(matches.length===1){
        var prior=matches[0].item;candidate.existingId=prior.id;candidate.existingIndex=matches[0].index;
        if(prior.kind!==row.kind||!same(prior.nominal,row.nominal,"nominal"))conflict("code","기존 관리번호의 종류·용량과 다릅니다.",prior.kind+" "+prior.nominal,row.kind+" "+row.nominal);
        var next=clone(prior);
        ["material","beta","mode","tolerance","m1","m2","temp","note"].forEach(function(k){
          if(blank(row[k]))return;
          if(blank(prior[k])){next[k]=row[k];candidate.changedFields.push(k);}
          else if(!same(prior[k],row[k],k))conflict(k,"기존 "+LABEL[k]+" 값과 다릅니다.",prior[k],row[k]);
        });
        if(!blank(row.date)){
          if(typeof row.date!=="string"||row.date!==txt(row.date)||!validDate(row.date))conflict("calibration_date","Excel 교정일의 실제 날짜를 확인해주세요.",prior.calibration_date,row.date);
          else if(blank(prior.calibration_date)){next.calibration_date=row.date;candidate.changedFields.push("calibration_date");}
          else if(prior.calibration_date!==row.date)conflict("calibration_date","기존 교정일과 다릅니다.",prior.calibration_date,row.date);
        }
        if(!candidate.conflicts.length){
          if(candidate.changedFields.length){if(candidate.changedFields.some(function(k){return ["material","beta","mode","tolerance","nominal"].indexOf(k)>=0;}))next.criteriaConfirmed=false;itemProblems(next,row.source).forEach(function(e){conflict(e.field,e.message);});candidate.action=candidate.conflicts.length?"conflict":"fill";candidate.item=next;}
          else{candidate.action="skip";candidate.item=clone(prior);}
        }
      }else if(matches.length===0&&!candidate.conflicts.length){
        try{var added=newImportItem(row,existing,options);itemProblems(added,row.source).forEach(function(e){conflict(e.field,e.message);});candidate.item=added;candidate.action=candidate.conflicts.length?"conflict":"add";}catch(e){conflict("id",e.message);}
      }
      if(candidate.conflicts.length){candidate.action="conflict";candidate.item=null;candidate.reason=candidate.conflicts.map(function(x){return x.message;}).join(" ");}
      else candidate.reason={add:"새 초자 추가",fill:"기존 빈 입력만 채움",skip:"기존 자료와 동일"}[candidate.action];
      if(candidate.item&&root.DF_QI_CAL_MODEL&&criteria)candidate.result=root.DF_QI_CAL_MODEL.calculate(candidate.item,criteria);
      summary[candidate.action]++;candidates.push(candidate);
    });
    if(existing.length+summary.add>500)errors.push(issue(null,"items","기존 초자와 합쳐 500개를 넘습니다. 가져올 행을 줄여주세요."));
    return {ok:errors.length===0,candidates:candidates,summary:summary,errors:errors};
  }
  root.DF_QI_CAL_IMPORT=Object.freeze({version:378,headers:Object.freeze(HEADERS),parseWorkbook:parseWorkbook,plan:plan,decimal:decimal,dateValue:dateValue});
})(typeof globalThis!=="undefined"?globalThis:typeof self!=="undefined"?self:this);
