/* DREAMPOEN · exact original half-year form, native editable HWPX text. */
(function (global) {
  'use strict';
  const VERSION='391',MIME='application/hwp+zip',REPORT_TITLE='반기별 자가측정 결과보고서';
  const TEMPLATES=[{"id":"industrial_small","title":"공업사 5개 미만","path":"assets/halfyear_forms/industrial_small.hwpx","sha256":"a2bf28d46e71ad835a97af5a92daf05028ffc696bbdac9bacbe8e3f2054e01bf","blocksPerPage":4,"resultsPerBlock":2,"large":false,"rows":[22],"cols":[16],"source_sha256":"6c35c8c45f52f99307845ffc690fc1ae42aa6aeb5099d8ecd296258c73716505"},{"id":"industrial_large","title":"공업사 5개 이상","path":"assets/halfyear_forms/industrial_large.hwpx","sha256":"c9e25f76e29c89daab1b3b7ed82245bc5c6249a9fdd7b71aaafbf7555c40d8eb","blocksPerPage":8,"resultsPerBlock":2,"large":true,"rows":[15,18],"cols":[16,11],"source_sha256":"1fcf354a6b472fcadc98e1d3423c62f1d17d48205fae4c79b4189bddf681baf5"},{"id":"boiler_small","title":"보일러면제-산소보정 5개미만","path":"assets/halfyear_forms/boiler_small.hwpx","sha256":"4863499438af33b460e2890d07632d5ff4ddc9c57814f298fe994b33f1be5d02","blocksPerPage":4,"resultsPerBlock":3,"large":false,"rows":[26],"cols":[14],"source_sha256":"bbdd04b8fb81b00d8b0d3d0319dd677df496062948e7e0bb9f80db2dd7bedbe0"},{"id":"boiler_large","title":"보일러면제-5개이상(1)","path":"assets/halfyear_forms/boiler_large.hwpx","sha256":"efd3acbfab5044ca4e31a3a6a87109a284a2f4e27224719208df4da592cd3655","blocksPerPage":10,"resultsPerBlock":3,"large":true,"rows":[15,32],"cols":[16,11],"source_sha256":"89b7f639b58e8a11bb85b89b2b640818a2d20bc56adb80186df7326b116433a4"}];
  const cached=new Map();
  const value=v=>v===undefined||v===null?'':String(v),clean=v=>value(v).trim();
  const fail=message=>{throw new Error(message);};
  const local=n=>n.name.split(':').pop(),children=(n,name)=>(n?.children||[]).filter(c=>local(c)===name),first=(n,name)=>children(n,name)[0];
  function descendants(n,name){return (n?.children||[]).flatMap(c=>(local(c)===name?[c]:[]).concat(descendants(c,name)));}
  function decode(s){return s.replace(/&#x([\da-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v)).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
  function xmlText(s){return value(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r\n?|\n/g,'<hp:lineBreak/>');}
  function attr(n,key){if(!n)return '';const m=n.open.match(new RegExp('\\b'+key+'="([^\"]*)"'));return m?decode(m[1]):'';}
  function parse(xml){
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('외부 XML 선언이 있는 문서는 사용할 수 없습니다.');
    const checked=/xmlns:hp=/.test(xml)?xml:'<check xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">'+xml+'</check>';
    const doc=new global.DOMParser().parseFromString(checked,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)fail('반기보고서 HWPX XML 구조가 올바르지 않습니다.');
    const root={name:'#document',children:[],start:0,end:xml.length},stack=[root];
    const re=/<(?:!--[\s\S]*?--|\?[^]*?\?|!\[CDATA\[[\s\S]*?\]\]|\/?[\w:.-]+(?:"[^"]*"|'[^']*'|[^'">])*)>/g;let m;
    while((m=re.exec(xml))){const token=m[0];if(/^<\?|^<!/.test(token))continue;if(/^<\//.test(token)){const n=stack.pop();if(!n||n===root)fail('HWPX 태그가 손상되었습니다.');n.closeStart=m.index;n.end=re.lastIndex;continue;}const n={name:token.match(/^<([\w:.-]+)/)[1],open:token,start:m.index,openEnd:re.lastIndex,closeStart:re.lastIndex,end:re.lastIndex,self:/\/\s*>$/.test(token),children:[],parent:stack[stack.length-1]};n.parent.children.push(n);if(!n.self)stack.push(n);}
    if(stack.length!==1)fail('HWPX 태그 경계가 올바르지 않습니다.');return root;
  }
  const raw=(n,xml)=>xml.slice(n.start,n.end);
  function applyEdits(xml,edits){edits.sort((a,b)=>b.start-a.start||b.end-a.end);let edge=xml.length+1;for(const e of edits){if(e.end>edge)fail('HWPX 수정 구간이 겹칩니다.');xml=xml.slice(0,e.start)+e.text+xml.slice(e.end);edge=e.start;}return xml;}
  function replaceAttr(tag,key,v){const re=new RegExp('\\b'+key+'="[^\"]*"');if(!re.test(tag))fail('HWPX 속성을 찾지 못했습니다: '+key);return tag.replace(re,key+'="'+v+'"');}
  function editor(xml,fontId,oneLineId){
    const tree=parse(xml),edits=[],modified=new Set();
    function edit(start,end,text){edits.push({start,end,text});}
    function paragraph(p,next){
      const ts=descendants(p,'t');
      // Preserve a specimen's mixed 8pt/7pt runs when its wording already matches.
      // Flattening these runs made the compact instrument name inherit 8pt.
      const current=ts.map(t=>decode(xml.slice(t.openEnd,t.closeStart).replace(/<hp:lineBreak\s*\/>/g,'\n'))).join('');
      if(current===value(next)){modified.add(p);return;}
      if(ts.length){ts.forEach((t,i)=>{if(t.children.some(c=>local(c)!=='lineBreak'))fail('원본 입력칸에 지원하지 않는 문자가 있습니다.');if(t.self)edit(t.start,t.end,t.open.replace(/\/>$/, '>')+(i?'':xmlText(next))+'</'+t.name+'>');else edit(t.openEnd,t.closeStart,i?'':xmlText(next));});}
      else{const run=first(p,'run');if(!run)fail('입력칸 글자모양을 찾지 못했습니다.');if(run.self)edit(run.start,run.end,run.open.replace(/\/>$/, '>')+'<hp:t>'+xmlText(next)+'</hp:t></'+run.name+'>');else edit(run.closeStart,run.closeStart,'<hp:t>'+xmlText(next)+'</hp:t>');}
      modified.add(p);
    }
    function cell(n,next,styleCell=n,fontPoint,oneLine=false){
      const list=first(n,'subList'),sourceList=first(styleCell,'subList'),ps=children(sourceList,'p');
      if(!list||!ps.length)fail('입력칸 문단을 찾지 못했습니다.');
      const lines=value(next).replace(/\r\n?/g,'\n').split('\n'),count=Math.min(lines.length,ps.length);
      // Reuse the specimen's paragraph/font references instead of the placeholder
      // rows' unrelated fonts. Never copy its cell dimensions, margins or borders.
      let content=ps.slice(0,Math.max(1,count)).map((p,i)=>{
        const fragment=raw(p,xml),part=editor(fragment),sourceP=part.tree.children[0];
        part.paragraph(sourceP,i===count-1?lines.slice(i).join('\n'):(lines[i]||''));
        return part.finish();
      }).join('');
      if(fontPoint!==undefined){
        if(typeof fontId!=='function')fail('입력값 글자 크기 설정을 불러오지 못했습니다.');
        content=content.replace(/<hp:run\b[^>]*>/g,tag=>replaceAttr(tag,'charPrIDRef',fontId(attr({open:tag},'charPrIDRef'),fontPoint)));
      }
      if(oneLine){
        if(typeof oneLineId!=='function')fail('농도 문단의 한 줄 입력 설정을 불러오지 못했습니다.');
        content=content.replace(/<hp:p\b[^>]*>/g,tag=>replaceAttr(tag,'paraPrIDRef',oneLineId(attr({open:tag},'paraPrIDRef'))));
      }
      edit(list.openEnd,list.closeStart,content);
      if(styleCell!==n&&attr(sourceList,'vertAlign')!==attr(list,'vertAlign'))edit(list.start,list.openEnd,replaceAttr(list.open,'vertAlign',attr(sourceList,'vertAlign')));
    }
    function finish(){for(const p of modified)for(const ls of children(p,'linesegarray'))edit(ls.start,ls.end,'');return applyEdits(xml,edits);}
    return {tree,edit,paragraph,cell,finish};
  }
  // Only newly inserted body-cell values use these sizes. Existing static runs
  // retain their original references and styles, including unit superscripts.
  function fontRegistry(xml){
    const e=editor(xml),properties=descendants(e.tree,'charProperties')[0];
    if(!properties)fail('원본 글자모양 표를 찾지 못했습니다.');
    const originals=children(properties,'charPr'),styles=new Map(originals.map(n=>[attr(n,'id'),n])),made=new Map(),added=[];
    if(styles.size!==originals.length)fail('원본 글자모양 번호가 중복됩니다.');
    let next=Math.max(-1,...originals.map(n=>Number(attr(n,'id'))))+1;
    const paraProperties=descendants(e.tree,'paraProperties')[0];
    if(!paraProperties)fail('원본 문단모양 표를 찾지 못했습니다.');
    const paraOriginals=children(paraProperties,'paraPr'),paraStyles=new Map(paraOriginals.map(n=>[attr(n,'id'),n])),paraMade=new Map(),paraAdded=[];
    if(paraStyles.size!==paraOriginals.length)fail('원본 문단모양 번호가 중복됩니다.');
    let paraNext=Math.max(-1,...paraOriginals.map(n=>Number(attr(n,'id'))))+1;
    function id(base,point){
      if(![7,8,9].includes(point)||!styles.has(base))fail('입력값 글자모양을 확인해주세요.');
      const source=styles.get(base),height=point*100;
      if(Number(attr(source,'height'))===height)return base;
      const key=base+':'+point;if(made.has(key))return made.get(key);
      const assigned=String(next++),fragment=raw(source,xml);
      const open=replaceAttr(replaceAttr(source.open,'id',assigned),'height',height);
      added.push(open+fragment.slice(source.open.length));made.set(key,assigned);return assigned;
    }
    function oneLineId(base){
      if(!paraStyles.has(base))fail('농도 문단모양을 찾지 못했습니다.');
      const source=paraStyles.get(base),breaking=first(source,'breakSetting');
      if(!breaking)fail('농도 문단의 줄 나눔 설정을 찾지 못했습니다.');
      if(attr(breaking,'lineWrap')==='SQUEEZE')return base;
      if(paraMade.has(base))return paraMade.get(base);
      const assigned=String(paraNext++),fragment=raw(source,xml);
      // Clone only the concentration paragraph style. Hancom's paragraph
      // "한 줄로 입력" is SQUEEZE; table/cell wrapping stays unchanged.
      paraAdded.push(applyEdits(fragment,[
        {start:0,end:source.open.length,text:replaceAttr(source.open,'id',assigned)},
        {start:breaking.start-source.start,end:breaking.openEnd-source.start,text:replaceAttr(breaking.open,'lineWrap','SQUEEZE')}
      ]));
      paraMade.set(base,assigned);return assigned;
    }
    function finish(){
      if(!added.length&&!paraAdded.length)return xml;
      if(added.length){e.edit(properties.start,properties.openEnd,replaceAttr(properties.open,'itemCnt',originals.length+added.length));e.edit(properties.closeStart,properties.closeStart,added.join(''));}
      if(paraAdded.length){e.edit(paraProperties.start,paraProperties.openEnd,replaceAttr(paraProperties.open,'itemCnt',paraOriginals.length+paraAdded.length));e.edit(paraProperties.closeStart,paraProperties.closeStart,paraAdded.join(''));}
      return e.finish();
    }
    return {id,oneLineId,finish};
  }
  function dateValid(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s;}
  function classNumber(v){const s=clean(v);return /^[1-5](?:\s*종)?$/.test(s)?s[0]:'';}
  function facilityClassText(v){const s=clean(v),n=classNumber(s);return n?n+'종':['면제','설치면제'].includes(s)?s:'';}
  function shortDate(v){const s=clean(v);return s? s.slice(2).replace(/-/g,'.') : '';}
  function dateWords(v){const s=clean(v);if(!s)return '년       월       일';const [y,m,d]=s.split('-');return y+' 년    '+m+' 월    '+d+' 일';}
  // Presentation only: keep the calculation value and its decimal precision intact.
  // Do not coerce blanks into zero or repair an invalid numeric string silently.
  function formatDailyFlow(v){
    const s=clean(v);if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return s;
    const parts=s.replace(/,/g,'').split('.');parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
    return parts.join('.');
  }
  const own=(o,key)=>!!o&&Object.prototype.hasOwnProperty.call(o,key);
  function nonnegativeNumber(v){
    if(!['number','string'].includes(typeof v))return null;
    const s=clean(v).replace(/,/g,'');
    if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  }
  function oxygenStandard(v){const n=nonnegativeNumber(v);return n!==null&&n<21?n:null;}
  function correctedResult(r){return !!r&&(r.oxygen_correction===true||r.flow_basis==='after');}
  function resultFlowLabel(m,r){
    const flow=r&&r.daily_flow!==undefined&&r.daily_flow!==null?r.daily_flow:m?.daily_flow;
    return formatDailyFlow(flow);
  }
  function resultValueLabel(m,r){
    const text=clean(r?.value),explicit=own(r,'value_oxygen_correction');
    const corrected=explicit?r.value_oxygen_correction===true:r?.source_correction===true;
    const standard=oxygenStandard(explicit?r.value_oxygen_standard:r?.oxygen_standard??m?.standard_oxygen);
    // Issued concentration text is immutable. Existing suffixes, detection-limit
    // wording, signs and decimal precision are never rewritten or inferred.
    if(!corrected||standard===null||!/^[+-]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)$/.test(text))return text;
    return text+'('+standard+')';
  }
  function flowPresentationKey(m,r){
    const explicit=own(r,'flow_basis')||own(r,'oxygen_correction');
    const basis=explicit?(r.flow_basis||(r.oxygen_correction===true?'after':r.oxygen_correction===false?'before':'')):'legacy';
    return JSON.stringify([resultFlowLabel(m,r),basis]);
  }
  function selected(id){const key=clean(id)||'industrial_small',item=TEMPLATES.find(t=>t.id===key);if(!item)fail('선택한 반기보고서 양식을 찾지 못했습니다. 양식을 다시 선택해 주세요.');return item;}
  function templates(){return TEMPLATES.map(t=>({...t}));}
  function info(id){const t=selected(id);return {...t,url:new URL(t.path+'?v='+VERSION,global.location?.href||'https://localhost/').href};}
  function paginate(measurements=[],id){
    const t=selected(id),blocks=[];
    for(const m of measurements){
      const results=Array.isArray(m.results)?m.results:[];
      if(!results.length){blocks.push({...m,results:[]});continue;}
      let current=[];
      for(const r of results){
        // Industrial blocks retain their shared two-result flow cell. Boiler
        // gas flow cells are split in the generated XML, so all three results
        // stay together even when SOx and NOx have different oxygen bases.
        const shared=t.resultsPerBlock===2?current[0]:null;
        if(current.length===t.resultsPerBlock||shared&&flowPresentationKey(m,shared)!==flowPresentationKey(m,r)){
          blocks.push({...m,results:current});current=[];
        }
        current.push(r);
      }
      if(current.length)blocks.push({...m,results:current});
    }
    const pages=[];for(let i=0;i<blocks.length;i+=t.blocksPerPage)pages.push(blocks.slice(i,i+t.blocksPerPage));return pages.length?pages:[[]];
  }
  function validate(data={}){
    const issues=[],warnings=[];if(clean(data?.template_id)&&!TEMPLATES.some(t=>t.id===clean(data.template_id)))issues.push('선택한 양식을 확인해 주세요.');if(!data||typeof data!=='object'||Array.isArray(data))return {valid:false,issues:['반기보고서 입력값을 확인해 주세요.']};
    if(clean(data.year)&&!/^\d{4}$/.test(clean(data.year)))issues.push('보고 연도는 네 자리로 입력해 주세요.');
    if(clean(data.half)&&!['1','2'].includes(clean(data.half)))issues.push('상반기 또는 하반기를 선택해 주세요.');
    if(clean(data.business_class)&&!classNumber(data.business_class))issues.push('사업장 분류는 1~5종으로 입력해 주세요.');
    if(clean(data.submit_date)&&!dateValid(clean(data.submit_date)))issues.push('제출일을 확인해 주세요.');
    if(data.measurements!==undefined&&(!Array.isArray(data.measurements)||data.measurements.length>2000))issues.push('측정자료는 2,000건 이내로 생성해 주세요.');
    const measurements=Array.isArray(data.measurements)?data.measurements:[];
    if(clean(data.address).length>160)warnings.push('사업장 주소가 길어 고정 양식의 미리보기를 확인해 주세요.');
    for(const [i,m] of measurements.entries()){
      if(!m||typeof m!=='object'||Array.isArray(m)){issues.push((i+1)+'번째 측정자료를 확인해 주세요.');continue;}
      if(clean(m.facility_name).length>100)warnings.push((i+1)+'번째 배출구 시설명이 길어 고정 양식의 미리보기를 확인해 주세요.');
      if(clean(m.facility_class)&&!facilityClassText(m.facility_class))issues.push((i+1)+'번째 배출구 종별을 확인해 주세요.');
      if(clean(m.measurement_date)&&!dateValid(clean(m.measurement_date)))issues.push((i+1)+'번째 측정일을 확인해 주세요.');
      if(dateValid(clean(m.measurement_date))&&/^\d{4}$/.test(clean(data.year))&&['1','2'].includes(clean(data.half))){const dt=clean(m.measurement_date);if(dt.slice(0,4)!==clean(data.year)||(Number(dt.slice(5,7))<=6?'1':'2')!==clean(data.half))issues.push((i+1)+'번째 측정일이 선택한 반기에 포함되지 않습니다.');}
      if(m.results!==undefined&&(!Array.isArray(m.results)||m.results.length>200))issues.push((i+1)+'번째 측정항목 목록을 확인해 주세요.');
      for(const r of Array.isArray(m.results)?m.results:[]){
        if(!r||typeof r!=='object'||Array.isArray(r)){issues.push('측정항목 입력값을 확인해 주세요.');continue;}
        const label=clean(r.item)||'측정항목',metadata=own(r,'flow_basis')||own(r,'oxygen_correction');
        if(clean(r.item)&&!clean(r.unit))issues.push(clean(r.item)+'의 농도 단위를 확인해 주세요.');
        if(clean(r.method).length>250)warnings.push((i+1)+'번째 배출구의 '+label+' 분석방법 문구가 길어 미리보기를 확인해 주세요.');
        if(metadata){
          if(own(r,'flow_basis')&&!['before','after'].includes(r.flow_basis)||own(r,'oxygen_correction')&&typeof r.oxygen_correction!=='boolean')issues.push(label+'의 산소보정 유량 기준을 확인해 주세요.');
          if(r.oxygen_correction===true&&r.flow_basis==='before'||r.oxygen_correction===false&&r.flow_basis==='after')issues.push(label+'의 산소보정 선택과 유량 기준이 다릅니다.');
          if(correctedResult(r)&&oxygenStandard(r.oxygen_standard)===null)issues.push(label+'의 표준산소농도를 0 이상 21 미만으로 확인해 주세요.');
          const flow=r.daily_flow!==undefined&&r.daily_flow!==null?r.daily_flow:m.daily_flow;
          if(nonnegativeNumber(flow)===null)issues.push(label+'의 일일유량을 0 이상의 숫자로 확인해 주세요.');
        }
      }
    }
    function checkText(v){if(v===null||v===undefined)return;if(typeof v==='string'){if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)||v.length>10000)issues.push('지원하지 않는 문자 또는 너무 긴 입력값이 있습니다.');}else if(Array.isArray(v))v.forEach(checkText);else if(typeof v==='object')Object.values(v).forEach(checkText);}
    checkText(data);
    return {valid:issues.length===0,issues:[...new Set(issues)],warnings:[...new Set(warnings)]};
  }
  function methodLines(v){
    const s=clean(v).replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[\t \u00a0\u3000]+/g,' ').trim()).join('\n');if(!s||s.includes('\n')||!s.endsWith(')'))return s;
    // A trailing instrument name has its own smaller paragraph in the original.
    // Work backwards so nested parentheses inside an instrument remain intact.
    let depth=0;for(let i=s.length-1;i>=0;i--){if(s[i]===')')depth++;else if(s[i]==='('&&!--depth){const label=s.slice(0,i).trimEnd();return label?label+'\n'+s.slice(i):s;}}
    return s;
  }
  function findCell(table,row,col){const cells=children(table,'tr').flatMap(tr=>children(tr,'tc')).filter(tc=>+attr(first(tc,'cellAddr'),'rowAddr')===row&&+attr(first(tc,'cellAddr'),'colAddr')===col);if(cells.length!==1)fail('원본 표의 입력칸을 찾지 못했습니다: '+row+','+col);return cells[0];}
  function splitBoilerGasFlows(xml,config){
    if(!config.id.startsWith('boiler'))return xml;
    const e=editor(xml),tables=descendants(e.tree,'tbl'),table=tables[config.large?1:0];
    if(tables.length!==config.rows.length||!table||+attr(table,'rowCnt')!==config.rows[config.large?1:0]||+attr(table,'colCnt')!==config.cols[config.large?1:0])fail('보일러 원본 표 구조를 확인해주세요.');
    const firstRow=config.large?2:9,itemCol=config.large?6:9,flowCol=config.large?9:12;
    for(let i=0;i<config.blocksPerPage;i++){
      const row=firstRow+i*3+1,cell=findCell(table,row,flowCol),span=first(cell,'cellSpan'),size=first(cell,'cellSz');
      const topSize=first(findCell(table,row,itemCol),'cellSz'),bottomSize=first(findCell(table,row+1,itemCol),'cellSz');
      const topHeight=+attr(topSize,'height'),bottomHeight=+attr(bottomSize,'height'),height=+attr(size,'height');
      if(+attr(span,'rowSpan')!==2||+attr(span,'colSpan')!==1||!Number.isInteger(topHeight)||!Number.isInteger(bottomHeight)||topHeight<=0||bottomHeight<=0||height!==topHeight+bottomHeight)fail('보일러 가스 유량칸의 병합 높이를 확인해주세요.');
      const targetRow=children(table,'tr').find(tr=>children(tr,'tc').some(tc=>+attr(first(tc,'cellAddr'),'rowAddr')===row+1));
      if(!targetRow||children(targetRow,'tc').some(tc=>+attr(first(tc,'cellAddr'),'colAddr')===flowCol))fail('보일러 질소산화물 유량칸 위치를 확인해주세요.');
      function halfCell(target,height){
        const fragment=raw(cell,xml),part=editor(fragment),root=part.tree.children[0],addr=first(root,'cellAddr'),span=first(root,'cellSpan'),size=first(root,'cellSz');
        part.edit(addr.start,addr.openEnd,replaceAttr(addr.open,'rowAddr',target));
        part.edit(span.start,span.openEnd,replaceAttr(span.open,'rowSpan',1));
        part.edit(size.start,size.openEnd,replaceAttr(size.open,'height',height));
        return part.finish();
      }
      e.edit(cell.start,cell.end,halfCell(row,topHeight));
      // Method text deliberately retains its original two-row cell: its two
      // font-sized paragraphs need more height than an individual gas row.
      const next=children(targetRow,'tc').find(tc=>+attr(first(tc,'cellAddr'),'colAddr')>flowCol);
      const insert=next?next.start:targetRow.closeStart;
      e.edit(insert,insert,halfCell(row+1,bottomHeight));
    }
    return e.finish();
  }
  function specimenText(cell,xml){return children(first(cell,'subList'),'p').map(p=>descendants(p,'t').map(t=>decode(xml.slice(t.openEnd,t.closeStart).replace(/<hp:lineBreak\s*\/>/g,'\n'))).join('')).join('\n');}
  const unitKey=v=>clean(v).normalize('NFKC').replace(/\s|\^/g,'').toLowerCase();
  function combined(values){return [...new Set(values.map(clean).filter(Boolean))].join('\n');}
  const resultFlow=resultFlowLabel;
  function pageXml(xml,data,blocks,config,fontId,oneLineId){
    const e=editor(xml,fontId,oneLineId),tables=descendants(e.tree,'tbl');
    if(tables.length!==config.rows.length||tables.some((t,i)=>+attr(t,'rowCnt')!==config.rows[i]||+attr(t,'colCnt')!==config.cols[i]))fail('선택한 원본 양식의 표 구조가 다릅니다.');
    const small=!config.large,boiler=config.id.startsWith('boiler'),main=tables[0];
    const set=(table,row,col,text,styleRow=row,fontPoint,oneLine=false)=>e.cell(findCell(table,row,col),text,findCell(table,styleRow,col),fontPoint,oneLine);
    const right=small&&boiler?11:13;
    set(main,2,4,clean(data.company_name));set(main,3,4,clean(data.representative));set(main,3,right,clean(data.manager));set(main,4,4,clean(data.address));set(main,4,right,clean(data.phone));
    const kind=classNumber(data.business_class);set(main,5,4,[1,2,3,4,5].map(n=>'['+(String(n)===kind?'■':' ')+']'+n+'종').join(' '));
    set(main,5,right,[clean(data.year),clean(data.year)?'년도':'',clean(data.half)==='1'?'상반기':clean(data.half)==='2'?'하반기':''].filter(Boolean).join(' '));
    const footer=small?(boiler?21:17):10;
    set(main,footer+1,0,dateWords(data.submit_date));set(main,footer+2,0,'제출인       '+(data.submitter_mode==='manual'?clean(data.submitter):''));set(main,footer+3,0,clean(data.authority));
    const table=small?main:tables[1],firstRow=small?9:2,rpb=config.resultsPerBlock;
    const cols=small?{type:2,agency:3,facility:6,kind:7,date:8,item:boiler?9:10,value:boiler?10:11,unit:boiler?11:12,flow:boiler?12:14,method:boiler?13:15}:{type:1,agency:2,facility:3,kind:4,date:5,item:6,value:7,unit:8,flow:9,method:10};
    if(!small){set(table,firstRow,cols.type,combined(blocks.map(m=>m.measurement_type)),firstRow,9);set(table,firstRow,cols.agency,combined(blocks.map(m=>m.agency_name)),firstRow,9);}
    for(let i=0;i<config.blocksPerPage;i++){
      const row=firstRow+i*rpb,m=blocks[i]||{},results=m.results||[];
      if(small){set(table,row,cols.type,clean(m.measurement_type),firstRow,9);set(table,row,cols.agency,clean(m.agency_name),firstRow,9);}
      set(table,row,cols.facility,clean(m.facility_name),firstRow,9);set(table,row,cols.kind,facilityClassText(m.facility_class),firstRow,9);set(table,row,cols.date,shortDate(m.measurement_date),firstRow,9);
      for(let j=0;j<rpb;j++){
        const r=results[j]||{},source=firstRow+j,label=clean(r.item).replace(/\s/g,'')==='총탄화수소'?'THC':clean(r.item);
        set(table,row+j,cols.item,label,source,8);set(table,row+j,cols.value,resultValueLabel(m,r),source,9,true);
        const unitSource=unitKey(r.unit)==='ppm'?firstRow+1:firstRow;
        set(table,row+j,cols.unit,clean(r.unit),unitSource,8);
      }
      if(boiler){
        for(let j=0;j<rpb;j++)set(table,row+j,cols.flow,results[j]?resultFlow(m,results[j]):'',firstRow+j,9);
        set(table,row,cols.method,methodLines(results[0]?.method),firstRow,7);
        set(table,row+1,cols.method,combined(results.slice(1).map(r=>methodLines(r.method))),firstRow+1,7);
      }else{
        set(table,row,cols.flow,combined(results.map(r=>resultFlow(m,r))),firstRow,9);
        for(let j=0;j<rpb;j++)set(table,row+j,cols.method,methodLines(results[j]?.method),firstRow+j,7);
      }
    }
    return e.finish();
  }
  function documentXml(xml,data,pages,config,fontId,oneLineId){
    const filled=pages.map(blocks=>pageXml(xml,data,blocks,config,fontId,oneLineId));
    const shell=parse(filled[0]).children.find(n=>local(n)==='sec'),parts=[];
    if(config.large){
      const cover=children(shell,'p')[0];parts.push(raw(cover,filled[0]));
      filled.forEach((text,i)=>{
        const sec=parse(text).children.find(n=>local(n)==='sec'),ps=children(sec,'p').slice(1),chunk=[];
        for(const [j,p] of ps.entries()){
          const fragment=raw(p,text),part=editor(fragment),root=part.tree.children[0];
          if(j===0)part.paragraph(root,config.id==='industrial_large'?'<별지-'+(i+1)+'>':'<별지'+(i+1)+'>');
          if(j===ps.length-1)part.paragraph(root,i===filled.length-1?'<끝>':'');
          let result=part.finish();const cache=children(root,'linesegarray').map(n=>raw(n,fragment)).join('');if(cache&&[0,ps.length-1].includes(j))result=result.replace(/<\/hp:p>$/,cache+'</hp:p>');chunk.push(result);
        }
        parts.push(chunk.join(''));
      });
    }else{
      filled.forEach((text,i)=>{
        const sec=parse(text).children.find(n=>local(n)==='sec'),p=children(sec,'p')[0];
        if(!i){parts.push(raw(p,text));return;}
        const fragment=raw(p,text),part=editor(fragment),root=part.tree.children[0],setup=first(root,'run');
        if(!descendants(setup,'secPr').length)fail('원본 쪽 설정을 찾지 못했습니다.');part.edit(setup.start,setup.end,'');part.edit(root.start,root.openEnd,replaceAttr(root.open,'pageBreak','1'));parts.push(part.finish());
      });
    }
    let result=filled[0].slice(0,shell.openEnd)+parts.join('')+filled[0].slice(shell.closeStart),counter=0;
    result=result.replace(/<hp:tbl\b[^>]*>/g,tag=>replaceAttr(tag,'id',38600000+counter++));let paragraphCounter=0;result=result.replace(/<hp:p\b[^>]*>/g,tag=>replaceAttr(tag,'id',paragraphCounter++));parse(result);return result;
  }
  async function hash(bytes){if(!global.crypto?.subtle)fail('원본 확인을 위해 HTTPS에서 열어 주세요.');return Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');}
  async function templateBytes(id){const t=selected(id);if(!cached.has(t.id))cached.set(t.id,(async()=>{const response=await global.fetch(info(t.id).url,{cache:'no-cache'});if(!response.ok)fail('선택한 반기보고서 원본 파일을 불러오지 못했습니다. assets 폴더를 확인해 주세요.');return response.arrayBuffer();})().catch(e=>{cached.delete(t.id);throw e;}));return cached.get(t.id);}
  async function generate(data={},options={}){
    const checked=validate(data);if(!checked.valid)fail(checked.issues.join('\n'));
    if(!global.JSZip||!global.DOMParser)fail('HWPX 처리 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    const config=selected(data.template_id),bytes=options.templateBytes||await templateBytes(config.id);if(await hash(bytes)!==config.sha256)fail('반기보고서 원본이 이번 배포 파일과 다릅니다. 지정된 원본 양식을 다시 올려 주세요.');
    const zip=await global.JSZip.loadAsync(bytes,{checkCRC32:true});if(!zip.file('mimetype')||clean(await zip.file('mimetype').async('string'))!==MIME)fail('HWPX 문서 형식이 아닙니다.');
    const original=await zip.file('Contents/section0.xml').async('string'),fonts=fontRegistry(await zip.file('Contents/header.xml').async('string')),prepared=splitBoilerGasFlows(original,config),pages=paginate(data.measurements||[],config.id),generated=documentXml(prepared,data,pages,config,fonts.id,fonts.oneLineId);zip.file('Contents/section0.xml',generated);zip.file('Contents/header.xml',fonts.finish());
    // A previous customer's thumbnail must never appear as the newly generated report.
    zip.remove('Preview/PrvImage.png');
    const doc=new global.DOMParser().parseFromString(generated,'application/xml');const texts=Array.from(doc.getElementsByTagNameNS('*','p')).filter(p=>!p.getElementsByTagNameNS('*','tbl').length).map(p=>p.textContent);zip.file('Preview/PrvText.txt',texts.join('\r\n'));
    const hpf=zip.file('Contents/content.hpf');if(hpf){let meta=await hpf.async('string');const title=xmlText([clean(data.company_name),clean(data.year),clean(data.half)==='1'?'상반기':clean(data.half)==='2'?'하반기':'',REPORT_TITLE].filter(Boolean).join(' '));meta=meta.replace(/<opf:title(?:\s*\/>|>[\s\S]*?<\/opf:title>)/,'<opf:title>'+title+'</opf:title>');meta=meta.replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*(<\/opf:meta>)/,(_,a,b)=>a+new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+b);zip.file('Contents/content.hpf',meta);}
    const ordered=new global.JSZip();ordered.file('mimetype',MIME,{compression:'STORE'});for(const [name,file] of Object.entries(zip.files)){if(name==='mimetype'||file.dir)continue;ordered.file(name,await file.async('uint8array'),{binary:true});}
    return ordered.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE',compressionOptions:{level:6}});
  }
  global.DF_HALFYEAR_HWPX=Object.freeze({version:VERSION,templates,info,validate,paginate,formatDailyFlow,resultFlowLabel,resultValueLabel,generate});
})(typeof window!=='undefined'?window:globalThis);
