/* Original HWPX report templates: preserve source XML and replace mapped text only. */
(function (global) {
  'use strict';
  var VERSION = 1, NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
  var SIMPLE = [
    ['sampling.weather','날씨','날씨'],['sampling.temperature','기온','기온'],
    ['sampling.humidity','습도','습도'],['sampling.pressure','기압','기압'],
    ['sampling.wind_direction','풍향','풍향'],['sampling.wind_speed','풍속','풍속'],
    ['sampling.standard_oxygen','표준산소농도','표준산소농도','%'],
    ['sampling.measured_oxygen','실측산소농도','실측산소농도','%'],
    ['sampling.flow_before','배출가스유량(산소보정 전)','배출가스유량산소보정전','S㎥/분'],
    ['sampling.flow_after','배출가스유량(산소보정 후)','배출가스유량산소보정후','S㎥/분'],
    ['sampling.moisture','수분량','수분량','%'],['sampling.gas_temperature','배출가스온도','배출가스온도','℃'],
    ['sampling.gas_velocity','배출가스 유속','배출가스유속','m/s'],['sampling.other','기타','기타']
  ];
  var OPTIONAL = [
    ['requester.company','사업장명','상호사업장명','right'],['requester.address','사업장소재지','사업장소재지주소','right'],
    ['requester.representative','대표자','대표자의뢰인','right'],['requester.environment_engineer','환경기술인','환경기술인','right'],
    ['general.industry','업종','업종','right'],['general.facility_type','시설 종류','시설종류','right'],['general.grade','사업장 종별','사업장종별','right'],
    ['request.purpose','측정용도','측정용도','right'],['request.stack_name','굴뚝 명칭','굴뚝명칭','below'],
    ['request.height','굴뚝 높이','높이측정공','below','m'],['request.diameter','굴뚝 안지름','안지름측정공','below','m'],
    ['request.stack_type','굴뚝 종별','굴뚝종별','below'],['request.items','의뢰항목','의뢰항목','right']
  ];
  var OPTIONS = [
    {key:'receipt_no',label:'발급번호 / 접수번호'},
    {key:'sampling.date',label:'채취일'},{key:'sampling.time',label:'채취시간'},
    {key:'sampling.samplers.0',label:'시료채취자 1'},{key:'sampling.samplers.1',label:'시료채취자 2'},
    {key:'sampling.samplers.2',label:'시료채취자 3'},
    {key:'analysis_period',label:'분석기간'},{key:'issue_date',label:'발행일'},
    {key:'analyst',label:'분석기술인'},{key:'technical_manager',label:'책임기술인'},
    {key:'opinion',label:'종합의견'}
  ].concat(SIMPLE.map(function(s){return {key:s[0],label:s[1]};}),OPTIONAL.map(function(s){return {key:s[0],label:s[1],optional:true};}),
    ['limit','result','time','method','memo'].map(function(k,i){return {key:'result.'+k,label:['허용기준','측정분석값','측정시간','측정분석방법','비고'][i],requiresAnalyte:true};}));
  function fail(message){throw new Error(message);}
  function clean(v){return v===undefined||v===null?'':String(v).trim();}
  function norm(v){return clean(v).replace(/[\s()（）:：,，·._\-]/g,'').toLowerCase();}
  function analyte(v){var s=norm(v).replace(/mg\/?s?[㎥³3]|ppm|ppb|%/g,'');if(/매연|링겔만|ringelmann/.test(s))return '매연';if(/총탄화수소|totalhydrocarbon|^thc$/.test(s))return '총탄화수소';return s.replace(/thc/g,'');}
  function resultUnit(v){
    if(v&&typeof v==='object'){var direct=clean(v.unit);if(direct)return direct;v=v.item||v.name||'';}
    var matches=clean(v).match(/\(([^()]*)\)\s*$/);return matches?clean(matches[1]):'';
  }
  function unitKind(v){
    var s=clean(v).replace(/\s+/g,'').toLowerCase();
    if(!s)return '';
    if(/ppm/.test(s))return 'ppm';if(/ppb/.test(s))return 'ppb';
    if(/(?:mg|㎎)\/?s?(?:㎥|m3|m³)/i.test(s))return 'mass';
    if(/%|％/.test(s))return 'percent';return s;
  }
  function resultLabel(row){
    var item=clean(row&& (row.item||row.name));if(!item)return '';
    if(/\([^()]*\)\s*$/.test(item))return item;
    var unit=resultUnit(row);return unit?item+'('+unit+')':item;
  }
  function local(n){return n.name.split(':').pop();}
  function attr(n,key){var m=n.open.match(new RegExp('\\b'+key+'\\s*=\\s*["\x27]([^"\x27]*)["\x27]'));return m?decode(m[1]):'';}
  function decode(s){return s.replace(/&#x([\da-f]+);/gi,function(_,v){return String.fromCodePoint(parseInt(v,16));}).replace(/&#(\d+);/g,function(_,v){return String.fromCodePoint(+v);}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
  function escape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function children(n,name){return n.children.filter(function(x){return local(x)===name;});}
  function descendants(n,name){var a=[];n.children.forEach(function(x){if(local(x)===name)a.push(x);a=a.concat(descendants(x,name));});return a;}
  function textOf(n,xml){return descendants(n,'t').map(function(t){return decode(xml.slice(t.openEnd,t.closeStart).replace(/<[^>]*>/g,''));}).join('');}
  function parse(xml){
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('외부 엔터티가 포함된 XML은 지원하지 않습니다.');
    var dom=new global.DOMParser().parseFromString(xml,'application/xml');
    if(dom.getElementsByTagName('parsererror').length)fail('HWPX XML 구조가 손상되어 있습니다.');
    var root={name:'#document',children:[],start:0,end:xml.length},stack=[root],re=/<(?:!--[\s\S]*?--|\?[^]*?\?|!\[CDATA\[[\s\S]*?\]\]|\/?[\w:.-]+(?:"[^"]*"|'[^']*'|[^'">])*)>/g,m;
    while((m=re.exec(xml))){var token=m[0];if(/^<\?|^<!/.test(token))continue;if(/^<\//.test(token)){var node=stack.pop();node.closeStart=m.index;node.end=re.lastIndex;continue;}var name=token.match(/^<([\w:.-]+)/)[1],self=/\/\s*>$/.test(token),parent=stack[stack.length-1];var n={name:name,open:token,start:m.index,openEnd:re.lastIndex,closeStart:re.lastIndex,end:re.lastIndex,self:self,children:[],parent:parent};parent.children.push(n);if(!self)stack.push(n);}
    if(stack.length!==1)fail('HWPX 태그 경계가 올바르지 않습니다.');return root;
  }
  function slice(n,xml){return xml.slice(n.start,n.end);}
  function first(n,name){return children(n,name)[0];}
  function paraTexts(cell,xml){var sub=first(cell.node,'subList');return sub?children(sub,'p').map(function(p){return textOf(p,xml);}):[];}
  function cellData(tc,tableIndex,xml){var a=first(tc,'cellAddr'),s=first(tc,'cellSpan');if(!a||!s)fail('셀 주소나 병합 정보를 찾지 못했습니다.');var row=+attr(a,'rowAddr'),col=+attr(a,'colAddr');return {node:tc,row:row,col:col,rowSpan:+attr(s,'rowSpan'),colSpan:+attr(s,'colSpan'),tableIndex:tableIndex,cellId:(tableIndex?'t'+tableIndex:'')+'r'+row+'c'+col,value:textOf(tc,xml),unit:'',protected:true,region:'fixed'};}
  function at(cells,row,col){return cells.filter(function(c){return c.row===row&&c.col===col;});}
  function byLabel(cells,label){return cells.filter(function(c){var n=norm(c.value);return n===label||n.indexOf(label)===0&&/^(기온|습도|기압|풍속)$/.test(label);});}
  function right(cells,c){return at(cells,c.row,c.col+c.colSpan);}
  function below(cells,c){return at(cells,c.row+c.rowSpan,c.col);}
  function unitOf(value){var m=String(value).match(/(?:S?[㎥³]|Sm3|m3)\s*\/\s*(?:분|min)|m\s*\/\s*s|℃|%/i);return m?m[0]:'';}
  function issue(code,message){return {code:code,message:message};}
  function inspectPage(p,sectionName,paragraphIndex,xml,setup){
    var tables=descendants(p,'tbl'),main=tables.filter(function(t){return +attr(t,'rowCnt')>=25&&norm(textOf(t,xml)).indexOf('대기측정기록부')>=0;});
    if(!main.length)return null;
    var issues=[],warnings=[],mapping=[],required=[],all=[];
    if(main.length!==1)issues.push(issue('multiple-main-tables','한 문단에 성적서 본표가 여러 개 있습니다. 한 성적서씩 저장해 주세요.'));
    tables=[main[0]].concat(tables.filter(function(t){return t!==main[0];}));
    tables.forEach(function(t,ti){children(t,'tr').forEach(function(tr){children(tr,'tc').forEach(function(tc){all.push(cellData(tc,ti,xml));});});});
    var cells=all.filter(function(c){return c.tableIndex===0;}),byId={};all.forEach(function(c){byId[c.cellId]=c;});
    var fixedSummary={prevention:[],operation:[]};
    function candidate(c){if(!c)return;c.protected=false;c.region='variable';if(!required.some(function(r){return r.cellId===c.cellId;}))required.push({field:'__unmapped',cellId:c.cellId});}
    function unique(list,field){if(list.length!==1){issues.push(issue('mapping:'+field,field+' 칸을 한 곳으로 확정하지 못했습니다. 연결 칸을 직접 확인해 주세요.'));return null;}return list[0];}
    function add(field,c,extra){if(!c)return;c.protected=false;c.region='variable';var m=Object.assign({field:field,cellId:c.cellId},extra||{});mapping.push(m);required=required.filter(function(r){return !(r.field==='__unmapped'&&r.cellId===c.cellId);});required.push({field:field,cellId:c.cellId,paragraphIndex:m.paragraphIndex,analyte:m.analyte,part:m.part});if(m.unit)c.unit=m.unit;}
    var weatherBand=byLabel(cells,'현장기상')[0],gasBand=byLabel(cells,'배출가스')[0];
    if(weatherBand)cells.filter(function(c){return c.row===weatherBand.row+1&&c.col>=weatherBand.col+weatherBand.colSpan;}).forEach(candidate);
    if(gasBand)cells.filter(function(c){return (c.row===gasBand.row+1||c.row===gasBand.row+3)&&c.col>=gasBand.col+gasBand.colSpan;}).forEach(candidate);
    function under(s){var label=unique(byLabel(cells,s[2]),s[0]);if(!label)return;var c=unique(below(cells,label),s[0]);add(s[0],c,{unit:unitOf(c&&c.value||'')||s[3]||''});}
    SIMPLE.forEach(under);
    OPTIONAL.forEach(function(s){var labels=byLabel(cells,s[2]);if(labels.length===1){var targets=(s[3]==='right'?right:below)(cells,labels[0]);if(targets.length===1)add(s[0],targets[0],{unit:s[4]||''});else warnings.push(s[1]+' 칸은 자동 연결하지 못했습니다.');}});
    [['sampling.date','채취일'],['sampling.time','채취시간'],['analysis_period','분석기간'],['analyst','분석기술인'],['technical_manager','책임기술인']].forEach(function(s){var l=unique(byLabel(cells,s[1]),s[0]);if(l)add(s[0],unique(right(cells,l),s[0]));});
    var sampler=unique(byLabel(cells,'시료채취자'),'sampling.samplers');
    if(sampler){var samplers=cells.filter(function(c){return c.col===sampler.col+sampler.colSpan&&c.row>=sampler.row&&c.row<sampler.row+sampler.rowSpan;}).sort(function(a,b){return a.row-b.row;});if(!samplers.length||samplers.length>3)issues.push(issue('sampling.samplers','시료채취자 칸은 1~3개인 양식만 지원합니다.'));samplers.forEach(function(c,i){add('sampling.samplers.'+i,c);});}
    var opinion=cells.filter(function(c){return /종합의견/.test(norm(c.value));});if(opinion.length===1)add('opinion',unique(right(cells,opinion[0]),'opinion'));else issues.push(issue('mapping:opinion','종합의견 칸을 찾지 못했습니다.'));
    var receipt=all.filter(function(c){return /발급번호|\$발급번호\$/.test(c.value);});add('receipt_no',unique(receipt,'receipt_no'));
    var footers=cells.filter(function(c){return c.value.indexOf('위와 같이 측정분석결과')>=0;});
    if(footers.length===1){var dateParas=paraTexts(footers[0],xml).map(function(t,i){return {t:t,i:i};}).filter(function(q){return /^\s*(?:\d{4})?\s*년\s*(?:\d{1,2})?\s*월\s*(?:\d{1,2})?\s*일\s*$/.test(q.t);});if(dateParas.length===1)add('issue_date',footers[0],{paragraphIndex:dateParas[0].i});else issues.push(issue('mapping:issue_date','발행일 문단을 확정하지 못했습니다.'));}else issues.push(issue('mapping:issue_date','성적서 하단 발행일 칸을 찾지 못했습니다.'));
    var resultHead=unique(byLabel(cells,'측정항목'),'result-header'),period=byLabel(cells,'분석기간')[0],resultRows=[],resultSlots=[];
    if(resultHead&&period){
      var heads={};[['limit','허용기준'],['result','측정분석값'],['time','측정시간'],['method','측정분석방법'],['memo','비고']].forEach(function(s){var hs=cells.filter(function(c){return c.row===resultHead.row&&norm(c.value).indexOf(s[1])===0;});heads[s[0]]=unique(hs,'result.'+s[0]);});
      resultRows=cells.filter(function(c){return c.col===resultHead.col&&c.row>resultHead.row&&c.row<period.row;});
      var known={};resultRows.forEach(function(item){var name=clean(item.value).replace(/\([^)]*(?:ppm|ppb|mg|㎥|%)\)/gi,'').trim(),a=analyte(name),rowCells=cells.filter(function(c){return c.row>=item.row&&c.row<item.row+item.rowSpan&&c.col>item.col;}),hasValues=rowCells.some(function(c){return clean(c.value)&&clean(c.value)!=='~';}),blank=!name&&!hasValues,runtimeMappings=[],slotValid=true;
        if(!blank){if(!a||/\$/.test(a)){issues.push(issue('unknown-analyte:'+item.cellId,'측정항목 이름이 없는 결과 행에 값이 있습니다. 한글 원본에 정확한 항목명을 입력한 뒤 다시 등록해 주세요.'));a='';}if(a&&known[a])issues.push(issue('duplicate-analyte:'+a,'원본에 같은 측정항목이 중복되어 있습니다: '+name));known[a]=true;}
        ['limit','result','time','method','memo'].forEach(function(key){var h=heads[key];if(!h){slotValid=false;return;}var candidates=rowCells.filter(function(c){return c.col>=h.col&&c.col<h.col+h.colSpan;});
          if(key==='time'){var ts=candidates.filter(function(c){return clean(c.value)!=='~'&&!(c.col!==h.col&&!clean(c.value));}).sort(function(a,b){return a.row-b.row||a.col-b.col;});if(ts.length===2){if(blank){runtimeMappings.push({field:'result.time',cellId:ts[0].cellId,part:'start'});runtimeMappings.push({field:'result.time',cellId:ts[1].cellId,part:'end'});}else{add('result.time',ts[0],{analyte:name,part:'start'});add('result.time',ts[1],{analyte:name,part:'end'});}}else if(ts.length===1){if(blank)runtimeMappings.push({field:'result.time',cellId:ts[0].cellId,part:'range'});else add('result.time',ts[0],{analyte:name,part:'range'});}else{slotValid=false;if(!blank)issues.push(issue('result-time:'+item.cellId,'측정시간 칸을 확정하지 못했습니다: '+name));}
          }else if(blank){if(candidates.length===1)runtimeMappings.push({field:'result.'+key,cellId:candidates[0].cellId});else slotValid=false;}
          else add('result.'+key,unique(candidates,'result.'+key+':'+name),{analyte:name});
        });
        if(!blank||slotValid)resultSlots.push({id:item.cellId,itemCell:item,originalName:name,analyte:a,unit:resultUnit(item.value),runtimeMappings:runtimeMappings});
      });
    }
    var prevent=byLabel(cells,'방지시설').filter(function(c){return c.col===1;})[0],oper=cells.filter(function(c){return norm(c.value).indexOf('시설가동상황')>=0;})[0];
    if(prevent){cells.filter(function(c){return c.row>=prevent.row&&c.row<prevent.row+prevent.rowSpan;}).forEach(function(c){c.protected=true;c.region='prevention';fixedSummary.prevention.push({cellId:c.cellId,value:paraTexts(c,xml).join('\n')});});}else issues.push(issue('fixed-prevention','방지시설 고정 영역을 확인하지 못했습니다.'));
    if(oper){cells.filter(function(c){return c.row>=oper.row&&c.row<oper.row+oper.rowSpan;}).forEach(function(c){c.protected=true;c.region='operation';fixedSummary.operation.push({cellId:c.cellId,value:paraTexts(c,xml).join('\n')});});}else issues.push(issue('fixed-operation','시설가동상황 고정 영역을 확인하지 못했습니다.'));
    var fixedPlaceholders=all.filter(function(c){return c.protected&&/\$[^$]+\$/.test(c.value);});if(fixedPlaceholders.length)issues.push(issue('unfinished-template','고정 영역에 아직 채우지 않은 양식 표시가 있습니다. 실제 작성된 성적서를 올려 주세요.'));
    var fl=byLabel(cells,'굴뚝명칭')[0],facility=fl&&below(cells,fl)[0],companyLabel=byLabel(cells,'상호사업장명')[0],company=companyLabel&&right(cells,companyLabel)[0];
    if(!descendants(p,'secPr').length&&!setup)issues.push(issue('section-setup','선택한 성적서의 쪽 설정을 안전하게 가져올 수 없습니다.'));
    if(!descendants(p,'pic').length)warnings.push('새로 생성하는 성적서에는 회사 직인이 자동으로 삽입됩니다.');
    warnings.push('수정 전 미리보기 이미지는 제거합니다. 한글에서 다시 저장하면 새 미리보기가 생성됩니다.');
    var facilityDisplay=facility?paraTexts(facility,xml).join(' ').trim():'';
    return {id:sectionName+'#p'+paragraphIndex,sectionName:sectionName,paragraphIndex:paragraphIndex,title:(company?company.value:'성적서')+' · '+(facilityDisplay||'시설 확인 필요'),companyName:company?company.value:'',facilityName:facilityDisplay,fields:all.map(function(c){return {key:c.cellId,label:(c.tableIndex?'머리말 ':'')+(c.row+1)+'행 '+(c.col+1)+'열',value:paraTexts(c,xml).join('\n'),cellId:c.cellId,unit:c.unit,protected:c.protected,region:c.region,paragraphs:paraTexts(c,xml)};}),mapping:mapping,warnings:warnings,blockingIssues:issues,fixedSummary:fixedSummary,_node:p,_cells:all,_required:required,_setup:setup,_xml:xml,_resultSlots:resultSlots};
  }
  async function fingerprint(bytes){if(!global.crypto||!global.crypto.subtle)fail('원본 확인 기능을 사용할 수 없습니다. HTTPS 화면에서 다시 열어 주세요.');var result=await global.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(result)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}
  async function load(bytes){
    if(!global.JSZip||!global.DOMParser)fail('HWPX 처리 구성요소를 불러오지 못했습니다.');
    if(!global.DF_REPORT_BRANDING||typeof global.DF_REPORT_BRANDING.repairKnownExternalSeal!=='function')fail('성적서 워터마크·회사 직인 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    if(bytes.byteLength>30*1024*1024)fail('30MB 이하의 HWPX 원본을 올려 주세요.');
    var zip=await global.JSZip.loadAsync(bytes,{checkCRC32:true}),fp=await fingerprint(bytes),pages=[],issues=[],warnings=[];
    if(!zip.file('mimetype')||clean(await zip.file('mimetype').async('string'))!=='application/hwp+zip')fail('HWPX 문서 형식이 아닙니다.');
    // Repair known company-seal links in this working copy only; registered source bytes and their fingerprint stay unchanged.
    await global.DF_REPORT_BRANDING.repairKnownExternalSeal(zip);
    var manifest=zip.file('Contents/content.hpf');if(!manifest)fail('HWPX 패키지 목록이 없습니다.');var manifestXml=await manifest.async('string'),md=parse(manifestXml);
    descendants(md,'item').forEach(function(item){var href=attr(item,'href');if(attr(item,'isEmbeded')==='0'||/^(?:[a-z]+:|\\\\|\/)/i.test(href))issues.push(issue('external-resource','원본의 외부 그림/파일을 문서 안에 포함하여 한글에서 다시 저장해 주세요: '+href.split(/[\\/]/).pop()));else if(href&&!zip.file(href))issues.push(issue('missing-resource','원본에 필요한 파일이 없습니다: '+href));});
    var sections=Object.keys(zip.files).filter(function(name){return /^Contents\/section\d+\.xml$/.test(name);}).sort(function(a,b){return +a.match(/(\d+)\.xml$/)[1]-+b.match(/(\d+)\.xml$/)[1];});
    if(sections.length!==1)issues.push(issue('multiple-sections','여러 구역으로 나뉜 문서는 아직 지원하지 않습니다. 해당 시설 성적서만 새 HWPX 파일로 저장해 주세요.'));
    for(var i=0;i<sections.length;i++){var name=sections[i],xml=await zip.file(name).async('string');if(xml.length>15000000)fail('문서 XML이 너무 큽니다. 성적서를 시설별로 나누어 올려 주세요.');var tree=parse(xml),sec=tree.children.filter(function(n){return local(n)==='sec';})[0];if(!sec)fail('HWPX 본문 구역이 없습니다.');var ps=children(sec,'p'),setup='';if(ps[0]){var run=children(ps[0],'run').find(function(r){return children(r,'secPr').length;});if(run&&run.children.every(function(n){return local(n)==='secPr'||local(n)==='ctrl';}))setup=slice(run,xml);}ps.forEach(function(p,j){var page=inspectPage(p,name,j,xml,setup);if(page){page._section=sec;pages.push(page);}});}
    if(!pages.length)issues.push(issue('unsupported','대기 측정기록부 표를 찾지 못했습니다. 업체·시설별 실제 성적서 HWPX를 올려 주세요.'));
    return {version:VERSION,fingerprint:fp,pages:pages,fieldOptions:OPTIONS,warnings:warnings,blockingIssues:issues,_zip:zip,_manifestXml:manifestXml};
  }
  function publicInspection(info){return {version:info.version,fingerprint:info.fingerprint,pages:info.pages.map(function(p){var o={};Object.keys(p).forEach(function(k){if(k[0]!=='_')o[k]=p[k];});return o;}),fieldOptions:OPTIONS.map(function(o){return Object.assign({},o);}),warnings:info.warnings,blockingIssues:info.blockingIssues};}
  async function inspect(bytes){return publicInspection(await load(bytes));}
  function targetKey(m){return m.cellId+':'+(m.paragraphIndex===undefined?'all':m.paragraphIndex);}
  function semanticKey(m){return m.field+':'+analyte(m.analyte||'')+':'+(m.part||'');}
  function validate(info,config){
    var issues=info.blockingIssues.slice(),page=info.pages.find(function(p){return p.id===config.pageId;});
    if(config.version!==VERSION||config.fingerprint!==info.fingerprint)issues.push(issue('fingerprint','등록한 원본과 현재 파일이 다릅니다. 원본을 다시 등록해 주세요.'));
    if(!config.confirmed)issues.push(issue('unconfirmed','변경 칸 연결을 확인한 뒤 등록해 주세요.'));
    if(!page){issues.push(issue('page','등록한 성적서 페이지를 찾지 못했습니다.'));return {valid:false,issues:issues};}
    var mapping=Array.isArray(config.mapping)?config.mapping:[],ids={},semantics={},cellMap={};page._cells.forEach(function(c){cellMap[c.cellId]=c;});
    page.blockingIssues.forEach(function(i){if(!/^mapping:/.test(i.code))issues.push(i);});
    mapping.forEach(function(m){var c=cellMap[m.cellId],key=targetKey(m);if(!OPTIONS.some(function(o){return o.key===m.field;}))issues.push(issue('field','지원하지 않는 연결 항목입니다: '+m.field));if(!c||c.protected)issues.push(issue('protected','고정 영역 또는 존재하지 않는 칸은 연결할 수 없습니다: '+m.cellId));if(ids[key])issues.push(issue('duplicate-target','하나의 칸에 여러 값이 연결되어 있습니다: '+m.cellId));ids[key]=true;
      var expected=page.mapping.find(function(x){return targetKey(x)===key;});
      if(expected&&(expected.field!==m.field||analyte(expected.analyte||'')!==analyte(m.analyte||'')||(expected.part||'')!==(m.part||'')))issues.push(issue('semantic-mismatch','원본의 칸 제목·측정항목과 연결 값이 다릅니다: '+m.cellId));
      if(expected&&m.unit!==undefined&&(expected.unit||'')!==m.unit)issues.push(issue('unit-mismatch','원본 단위를 변경할 수 없습니다: '+m.cellId));
      if(m.paragraphIndex!==undefined&&(!Number.isInteger(m.paragraphIndex)||m.paragraphIndex<0||!c||m.paragraphIndex>=paraTexts(c,page._xml).length))issues.push(issue('paragraph','문단 위치가 올바르지 않습니다: '+m.cellId));
      if(c&&page.mapping.some(function(x){return x.cellId===c.cellId&&x.field==='issue_date';})&&(m.field!=='issue_date'||m.paragraphIndex!==page.mapping.find(function(x){return x.cellId===c.cellId&&x.field==='issue_date';}).paragraphIndex))issues.push(issue('footer','발행일 칸은 날짜 문단만 연결할 수 있습니다.'));
      if(m.field.indexOf('result.')===0&&(!analyte(m.analyte)||/\$/.test(m.analyte)))issues.push(issue('analyte','결과 칸의 측정항목 이름을 입력해 주세요: '+m.cellId));
      if(m.field==='result.time'&&!/^(start|end|range)$/.test(m.part||''))issues.push(issue('time-part','측정시간의 시작/종료 구분을 확인해 주세요.'));
      var sk=semanticKey(m);if(semantics[sk])issues.push(issue('ambiguous','같은 항목이 여러 칸에 중복 연결되어 있습니다: '+m.field));semantics[sk]=true;
    });
    page._required.forEach(function(r){if(!mapping.some(function(m){return targetKey(m)===targetKey(r);})){issues.push(issue('unmapped','과거 값이 남지 않도록 이 칸을 연결해 주세요: '+r.cellId));}});
    ['receipt_no','sampling.date','sampling.time','issue_date','analysis_period','opinion'].concat(SIMPLE.map(function(s){return s[0];})).forEach(function(f){if(!mapping.some(function(m){return m.field===f;}))issues.push(issue('missing-field','필수 변경 항목을 연결해 주세요: '+(OPTIONS.find(function(o){return o.key===f;})||{}).label));});
    return {valid:!issues.length,issues:issues,page:page};
  }
  async function validateConfig(bytes,config){var v=validate(await load(bytes),config||{});return {valid:v.valid,issues:v.issues};}
  function path(obj,key){return key.split('.').reduce(function(v,k){return v===undefined||v===null?undefined:v[k];},obj);}
  function date(v){var m=clean(v).match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);return m?[m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')]:null;}
  function times(v,fallback){var s=clean(v),clocks=s.match(/\d{1,2}:\d{2}/g)||[],d=date(s)||date(fallback);return {date:d?d.join('-'):'',start:clocks[0]||'',end:clocks[1]||''};}
  function scalar(v){if(v&&typeof v==='object')return clean(v.name||v.Name||v.full_name||'');return clean(v);}
  function assignResultSlots(page,config,form){
    var rows=(form.results||[]).filter(function(r){return clean(r&&(r.item||r.name));}),seen={};
    rows.forEach(function(r){var key=analyte(r.item||r.name);if(seen[key])fail('현재 자료에 같은 측정항목이 중복되어 있습니다: '+(r.item||r.name));seen[key]=true;});
    var slots=(page._resultSlots||[]).slice().sort(function(a,b){return a.itemCell.row-b.itemCell.row||a.itemCell.col-b.itemCell.col;});
    if(rows.length>slots.length)fail('원본 결과행은 '+slots.length+'개인데 입력한 측정항목은 '+rows.length+'개입니다. 결과행이 '+rows.length+'개 이상인 원본을 등록해 주세요.');
    var assigned={},usedRows=new Set(),usedSlots=new Set();
    slots.forEach(function(slot){var row=rows.find(function(r){return !usedRows.has(r)&&analyte(r.item||r.name)===slot.analyte;});if(row){assigned[slot.id]=row;usedRows.add(row);usedSlots.add(slot.id);}});
    rows.filter(function(r){return !usedRows.has(r);}).forEach(function(row){var kind=unitKind(resultUnit(row)),available=slots.filter(function(slot){return !usedSlots.has(slot.id);}),slot=(kind&&available.find(function(s){return unitKind(s.unit)===kind;}))||available[0];if(!slot)return;assigned[slot.id]=row;usedRows.add(row);usedSlots.add(slot.id);});
    var runtime=(config.mapping||[]).map(function(m){var copy=Object.assign({},m);if(copy.field.indexOf('result.')!==0)return copy;var slot=slots.find(function(s){return s.analyte&&s.analyte===analyte(copy.analyte);});if(slot){copy._resultRowSet=true;copy._resultRow=assigned[slot.id]||null;}return copy;});
    slots.filter(function(slot){return !slot.analyte;}).forEach(function(slot){(slot.runtimeMappings||[]).forEach(function(m){runtime.push(Object.assign({},m,{_resultRowSet:true,_resultRow:assigned[slot.id]||null}));});});
    return {mapping:runtime,slots:slots.map(function(slot){var row=assigned[slot.id]||null,rowUnit=resultUnit(row);return {slot:slot,row:row,relabel:!!row&&(analyte(row.item||row.name)!==slot.analyte||!!rowUnit&&unitKind(rowUnit)!==unitKind(slot.unit))};})};
  }
  function valueFor(m,form){var v;if(m.field.indexOf('result.')===0){var r;if(m._resultRowSet)r=m._resultRow||{};else{var matches=(form.results||[]).filter(function(x){return analyte(x.item||x.name)===analyte(m.analyte);});if(matches.length>1)fail('현재 자료에 같은 측정항목이 중복되어 있습니다: '+m.analyte);r=matches[0]||{};}v=r[m.field.slice(7)];if(m.field==='result.time'){var t=times(v,path(form,'sampling.date'));return {time:t,part:m.part};}}else{v=path(form,m.field);if(m.field==='analyst')v=v===undefined?form.analysis_engineer:v;if(m.field==='technical_manager')v=v===undefined?form.responsible_engineer:v;}
    return scalar(v);
  }
  function formatted(value,m,old){
    if(value&&typeof value==='object'&&value.time){var t=value.time,stamp=function(clock){return clock?(t.date?t.date+' ':'')+clock:'';};if(value.part==='start')return stamp(t.start);if(value.part==='end')return stamp(t.end);return t.start?stamp(t.start)+(t.end?' ~ '+stamp(t.end):''):'';}
    value=scalar(value);
    if(m.field==='receipt_no'){var r=old.match(/^(\s*발급번호\s*[:：]?\s*)/);return (r?r[1]:'')+value;}
    if(m.field==='issue_date'){var d=date(value);return d?d[0]+' 년 '+d[1]+' 월 '+d[2]+' 일':'     년     월     일';}
    if(m.field==='sampling.date'){var dd=date(value);return dd?(/\./.test(old)?dd.join('.')+'.':dd.join('-')):'';}
    if(/^sampling\.samplers\.|^(analyst|technical_manager)$/.test(m.field)){var match=old.match(/^(\s*).*?([ \t]*\((?:서명|인)\)[ \t]*)$/);return (match?match[1]:'')+value+(match?match[2]:'  (서명)');}
    var unit=unitOf(old)||m.unit||'';
    if(unit){var idx=old.lastIndexOf(unit),prefix=idx>=0?old.slice(0,idx):'',sp=(prefix.match(/\s+$/)||[' '])[0],lead=(prefix.match(/^\s*/)||[''])[0];value=value.replace(new RegExp(unit.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$'),'').trim();return lead+value+sp+unit;}
    return value;
  }
  function patchParagraph(p,value,xml){
    var ts=descendants(p,'t');if(ts.some(function(t){return t.children.length;}))fail('줄바꿈 개체가 섞인 값 칸은 한글에서 단순 텍스트로 정리해 주세요.');
    if(!ts.length){if(!value)return [];var runs=children(p,'run');if(!runs.length)fail('값을 넣을 글자 영역이 없습니다.');var run=runs[runs.length-1];if(run.self)return [{start:run.start,end:run.end,text:run.open.replace(/\/\s*>$/, '>')+'<hp:t>'+escape(value)+'</hp:t></'+run.name+'>'}];return [{start:run.closeStart,end:run.closeStart,text:'<hp:t>'+escape(value)+'</hp:t>'}];}
    return ts.map(function(t,i){if(t.self)return {start:t.start,end:t.end,text:t.open.replace(/\/\s*>$/,'>')+escape(i?'':value)+'</'+t.name+'>'};return {start:t.openEnd,end:t.closeStart,text:escape(i?'':value)};});
  }
  function patchCell(c,m,value,xml){
    var sub=first(c.node,'subList'),ps=sub?children(sub,'p'):[];if(!ps.length)fail('문단이 없는 값 칸입니다: '+c.cellId);var patches=[];
    if(m.paragraphIndex!==undefined){var p=ps[m.paragraphIndex];return patchParagraph(p,formatted(value,m,textOf(p,xml)),xml);}
    var old=ps.map(function(p){return textOf(p,xml);}),text=formatted(value,m,old.join('\n')),parts=[];
    if(old.join('').replace(/\s/g,'')===text.replace(/\s/g,''))return [];
    if(m.field==='result.time'&&m.part==='range'&&ps.length>=2&&value.time){var tm=value.time;parts=[tm.start?(tm.date?tm.date+' ':'')+tm.start:'',tm.end?(tm.date?tm.date+' ':'')+tm.end:''];}
    else if(ps.length>1&&m.field==='result.method'&&text){var split=text.match(/^(.*?)\s*(\([^]*\))$/);parts=split?[split[1].trim(),split[2]]:[text];}
    else parts=text.split(/\r?\n/);
    if(ps.length>1&&parts.length===1&&text&&OPTIONAL.some(function(s){return s[0]===m.field;})){
      var remaining=text,weight=old.reduce(function(sum,s){return sum+s.length;},0);parts=[];
      for(var pi=0;pi<ps.length-1;pi++){var desired=weight?Math.round(text.length*old[pi].length/weight):Math.round(remaining.length/(ps.length-pi)),spaces=[];remaining.replace(/\s+/g,function(s,index){if(index>0)spaces.push(index);return s;});if(!spaces.length)break;var cut=spaces.reduce(function(best,n){return Math.abs(n-desired)<Math.abs(best-desired)?n:best;},spaces[0]);parts.push(remaining.slice(0,cut));remaining=remaining.slice(cut).trim();}parts.push(remaining);
    }
    if(parts.length>ps.length)fail('원본 칸의 줄 수보다 값이 깁니다. 한글에서 원본 양식을 조정해 주세요: '+c.cellId);
    ps.forEach(function(p,i){patches=patches.concat(patchParagraph(p,parts[i]||'',xml));});return patches;
  }
  function applyPatches(xml,patches){patches.sort(function(a,b){return b.start-a.start;});var last=xml.length+1;patches.forEach(function(p){if(p.end>last)fail('연결 칸이 겹칩니다.');xml=xml.slice(0,p.start)+p.text+xml.slice(p.end);last=p.start;});return xml;}
  async function generate(bytes,config,form){
    var info=await load(bytes),v=validate(info,config||{});if(!v.valid)fail(v.issues.map(function(i){return i.message;}).join('\n'));var page=v.page,xml=page._xml,patches=[],cellMap={};page._cells.forEach(function(c){cellMap[c.cellId]=c;});form=form||{};
    var assigned=assignResultSlots(page,config,form);
    assigned.slots.forEach(function(entry){var label=entry.row?(entry.relabel?resultLabel(entry.row):clean(entry.slot.itemCell.value)):'';patches=patches.concat(patchCell(entry.slot.itemCell,{field:'result.item'},label,xml));});
    assigned.mapping.forEach(function(m){patches=patches.concat(patchCell(cellMap[m.cellId],m,valueFor(m,form),xml));});
    var original=page._node,body=xml.slice(original.start,original.end),localPatches=patches.map(function(p){return {start:p.start-original.start,end:p.end-original.start,text:p.text};});body=applyPatches(body,localPatches);
    if(!descendants(original,'secPr').length){var afterOpen=body.indexOf('>')+1;body=body.slice(0,afterOpen)+page._setup+body.slice(afterOpen);}
    var section=page._section;xml=xml.slice(0,section.openEnd)+body+xml.slice(section.closeStart);parse(xml);
    var zip=info._zip;zip.file(page.sectionName,xml);
    Object.keys(zip.files).filter(function(n){return /^Contents\/section\d+\.xml$/.test(n)&&n!==page.sectionName;}).forEach(function(n){zip.remove(n);});
    var manifest=info._manifestXml,mt=parse(manifest),removed={};var mp=[];descendants(mt,'item').forEach(function(n){var href=attr(n,'href');if(/^Contents\/section\d+\.xml$/.test(href)&&href!==page.sectionName){removed[attr(n,'id')]=true;mp.push({start:n.start,end:n.end,text:''});}});descendants(mt,'itemref').forEach(function(n){if(removed[attr(n,'idref')])mp.push({start:n.start,end:n.end,text:''});});if(mp.length)zip.file('Contents/content.hpf',applyPatches(manifest,mp));
    var rdf=zip.file('META-INF/container.rdf');if(rdf&&Object.keys(removed).length){var rx=await rdf.async('string'),rt=parse(rx),rp=[];descendants(rt,'Description').forEach(function(n){var raw=slice(n,rx);if(/Contents\/section\d+\.xml/.test(raw)&&raw.indexOf(page.sectionName)<0)rp.push({start:n.start,end:n.end,text:''});});if(rp.length)zip.file('META-INF/container.rdf',applyPatches(rx,rp));}
    zip.remove('Preview/PrvImage.png');var generated=parse(xml),text=descendants(generated,'t').map(function(n){return decode(xml.slice(n.openEnd,n.closeStart));}).join('\n');zip.file('Preview/PrvText.txt',text);
    var ordered=new global.JSZip();ordered.file('mimetype','application/hwp+zip',{compression:'STORE'});for(var name of Object.keys(zip.files)){if(name==='mimetype'||zip.files[name].dir)continue;ordered.file(name,await zip.file(name).async('uint8array'));}
    return ordered.generateAsync({type:'blob',mimeType:'application/hwp+zip',compression:'DEFLATE'});
  }
  global.DF_REPORT_TEMPLATE_ENGINE={version:VERSION,inspect:inspect,validateConfig:validateConfig,generate:generate,fieldOptions:OPTIONS,_test:{parse:parse,applyPatches:applyPatches,analyte:analyte,formatted:formatted,resultUnit:resultUnit,unitKind:unitKind,resultLabel:resultLabel,assignResultSlots:assignResultSlots}};
})(typeof window!=='undefined'?window:globalThis);
