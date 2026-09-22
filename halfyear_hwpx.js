/* DREAMPOEN · exact original half-year form, native editable HWPX text. */
(function (global) {
  'use strict';
  const VERSION='120373400',MIME='application/hwp+zip';
  const TEMPLATE={title:'반기별 자가측정 결과보고서',path:'assets/halfyear_report_template.hwpx',sha256:'224dfeb2575f93699c7064bb7722778012c9da221de1662827a3783a297e7d3f',blocksPerPage:4,resultsPerBlock:2};
  let cached;
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
  function editor(xml){
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
    function cell(n,next,styleCell=n){
      const list=first(n,'subList'),sourceList=first(styleCell,'subList'),ps=children(sourceList,'p');
      if(!list||!ps.length)fail('입력칸 문단을 찾지 못했습니다.');
      const lines=value(next).replace(/\r\n?/g,'\n').split('\n'),count=Math.min(lines.length,ps.length);
      // Reuse the specimen's paragraph/font references instead of the placeholder
      // rows' unrelated fonts. Never copy its cell dimensions, margins or borders.
      const content=ps.slice(0,Math.max(1,count)).map((p,i)=>{
        const fragment=raw(p,xml),part=editor(fragment),sourceP=part.tree.children[0];
        part.paragraph(sourceP,i===count-1?lines.slice(i).join('\n'):(lines[i]||''));
        return part.finish();
      }).join('');
      edit(list.openEnd,list.closeStart,content);
      if(styleCell!==n&&attr(sourceList,'vertAlign')!==attr(list,'vertAlign'))edit(list.start,list.openEnd,replaceAttr(list.open,'vertAlign',attr(sourceList,'vertAlign')));
    }
    function finish(){for(const p of modified)for(const ls of children(p,'linesegarray'))edit(ls.start,ls.end,'');const sec=tree.children.find(n=>local(n)==='sec');for(const p of children(sec,'p'))for(const ls of children(p,'linesegarray'))edit(ls.start,ls.end,'');return applyEdits(xml,edits);}
    return {tree,edit,paragraph,cell,finish};
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
  function info(){return {...TEMPLATE,url:new URL(TEMPLATE.path+'?v='+VERSION,global.location?.href||'https://localhost/').href};}
  function paginate(measurements=[]){
    const blocks=[];for(const m of measurements){const results=Array.isArray(m.results)?m.results:[];if(!results.length)blocks.push({...m,results:[]});else for(let i=0;i<results.length;i+=2)blocks.push({...m,results:results.slice(i,i+2)});}
    const pages=[];for(let i=0;i<blocks.length;i+=4)pages.push(blocks.slice(i,i+4));return pages.length?pages:[[]];
  }
  function validate(data={}){
    const issues=[];if(!data||typeof data!=='object'||Array.isArray(data))return {valid:false,issues:['반기보고서 입력값을 확인해 주세요.']};
    if(clean(data.year)&&!/^\d{4}$/.test(clean(data.year)))issues.push('보고 연도는 네 자리로 입력해 주세요.');
    if(clean(data.half)&&!['1','2'].includes(clean(data.half)))issues.push('상반기 또는 하반기를 선택해 주세요.');
    if(clean(data.business_class)&&!classNumber(data.business_class))issues.push('사업장 분류는 1~5종으로 입력해 주세요.');
    if(clean(data.submit_date)&&!dateValid(clean(data.submit_date)))issues.push('제출일을 확인해 주세요.');
    if(data.measurements!==undefined&&(!Array.isArray(data.measurements)||data.measurements.length>2000))issues.push('측정자료는 2,000건 이내로 생성해 주세요.');
    const measurements=Array.isArray(data.measurements)?data.measurements:[];
    for(const [i,m] of measurements.entries()){
      if(!m||typeof m!=='object'||Array.isArray(m)){issues.push((i+1)+'번째 측정자료를 확인해 주세요.');continue;}
      if(clean(m.facility_class)&&!facilityClassText(m.facility_class))issues.push((i+1)+'번째 배출구 종별을 확인해 주세요.');
      if(clean(m.measurement_date)&&!dateValid(clean(m.measurement_date)))issues.push((i+1)+'번째 측정일을 확인해 주세요.');
      if(dateValid(clean(m.measurement_date))&&/^\d{4}$/.test(clean(data.year))&&['1','2'].includes(clean(data.half))){const dt=clean(m.measurement_date);if(dt.slice(0,4)!==clean(data.year)||(Number(dt.slice(5,7))<=6?'1':'2')!==clean(data.half))issues.push((i+1)+'번째 측정일이 선택한 반기에 포함되지 않습니다.');}
      if(m.results!==undefined&&(!Array.isArray(m.results)||m.results.length>200))issues.push((i+1)+'번째 측정항목 목록을 확인해 주세요.');
      for(const r of Array.isArray(m.results)?m.results:[]){if(!r||typeof r!=='object'||Array.isArray(r)){issues.push('측정항목 입력값을 확인해 주세요.');continue;}if(clean(r.item)&&!clean(r.unit))issues.push(clean(r.item)+'의 농도 단위를 확인해 주세요.');}
    }
    function checkText(v){if(v===null||v===undefined)return;if(typeof v==='string'){if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)||v.length>10000)issues.push('지원하지 않는 문자 또는 너무 긴 입력값이 있습니다.');}else if(Array.isArray(v))v.forEach(checkText);else if(typeof v==='object')Object.values(v).forEach(checkText);}
    checkText(data);
    return {valid:issues.length===0,issues:[...new Set(issues)]};
  }
  function methodLines(v){
    const s=clean(v).replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[\t \u00a0\u3000]+/g,' ').trim()).join('\n');if(!s||s.includes('\n')||!s.endsWith(')'))return s;
    // A trailing instrument name has its own smaller paragraph in the original.
    // Work backwards so nested parentheses inside an instrument remain intact.
    let depth=0;for(let i=s.length-1;i>=0;i--){if(s[i]===')')depth++;else if(s[i]==='('&&!--depth){const label=s.slice(0,i).trimEnd();return label?label+'\n'+s.slice(i):s;}}
    return s;
  }
  function findCell(table,row,col){const cells=children(table,'tr').flatMap(tr=>children(tr,'tc')).filter(tc=>+attr(first(tc,'cellAddr'),'rowAddr')===row&&+attr(first(tc,'cellAddr'),'colAddr')===col);if(cells.length!==1)fail('원본 표의 입력칸을 찾지 못했습니다: '+row+','+col);return cells[0];}
  function specimenText(cell,xml){return children(first(cell,'subList'),'p').map(p=>descendants(p,'t').map(t=>decode(xml.slice(t.openEnd,t.closeStart).replace(/<hp:lineBreak\s*\/>/g,'\n'))).join('')).join('\n');}
  const unitKey=v=>clean(v).normalize('NFKC').replace(/\s|\^/g,'').toLowerCase();
  function pageXml(xml,data,blocks,pageIndex){
    const e=editor(xml),sec=e.tree.children.find(n=>local(n)==='sec'),ps=children(sec,'p'),tables=descendants(e.tree,'tbl');
    if(ps.length!==1||tables.length!==1||attr(tables[0],'rowCnt')!=='22'||attr(tables[0],'colCnt')!=='16')fail('반기보고서 원본 표 구조가 다릅니다.');
    const table=tables[0],set=(row,col,text,sourceRow=row)=>e.cell(findCell(table,row,col),text,findCell(table,sourceRow,col));
    // The new specimen uses different spacing for mg/S㎥ (-15%) and ppm (-4%).
    // Choose it by unit, not by analyte position (a gas result may be the first row).
    const unitStyles=new Map(),methodSpecimens=new Map(),methodsByRow=new Map();
    let useTHCLabel=false;
    for(let row=9;row<=16;row++){
      const unit=specimenText(findCell(table,row,12),xml),method=specimenText(findCell(table,row,15),xml);
      if(clean(unit)&&!unitStyles.has(unitKey(unit)))unitStyles.set(unitKey(unit),row);
      if(clean(method)){const specimen={text:method,row},key=method.replace(/\s/g,'');methodsByRow.set(row,specimen);if(!methodSpecimens.has(key))methodSpecimens.set(key,specimen);}
      if(clean(specimenText(findCell(table,row,10),xml)).toUpperCase()==='THC')useTHCLabel=true;
    }
    set(2,4,clean(data.company_name));set(3,4,clean(data.representative));set(3,13,clean(data.manager));set(4,4,clean(data.address));set(4,13,clean(data.phone));
    // A filled slot retains its own approved paragraph/run structure. Other slots
    // reuse the first approved spelling; they never inherit a blank row's style.
    function methodSpecimen(v,row){const key=clean(v).replace(/\s/g,''),own=methodsByRow.get(row);return own&&own.text.replace(/\s/g,'')===key?own:methodSpecimens.get(key)||{text:methodLines(v),row:9};}
    const itemLabel=v=>useTHCLabel&&clean(v).replace(/\s/g,'')==='총탄화수소'?'THC':clean(v);
    const kind=classNumber(data.business_class);set(5,4,[1,2,3,4,5].map(n=>'['+(String(n)===kind?'■':' ')+']'+n+'종').join(' '));
    set(5,13,[clean(data.year),clean(data.year)?'년도':'',clean(data.half)==='1'?'상반기':clean(data.half)==='2'?'하반기':''].filter(Boolean).join(' '));
    for(let i=0;i<4;i++){
      const row=9+i*2,m=blocks[i]||{},results=m.results||[];
      const standard=blocks[i]?9:row;
      set(row,2,clean(m.measurement_type),standard);set(row,3,clean(m.agency_name),standard);set(row,6,clean(m.facility_name),standard);set(row,7,facilityClassText(m.facility_class),standard);set(row,8,shortDate(m.measurement_date),standard);set(row,14,formatDailyFlow(m.daily_flow),standard);
      for(let j=0;j<2;j++){const r=results[j]||{},source=results[j]?9+j:row+j,unitSource=unitStyles.get(unitKey(r.unit))??source,method=methodSpecimen(r.method,row+j);set(row+j,10,itemLabel(r.item),source);set(row+j,11,clean(r.value),source);set(row+j,12,clean(r.unit),unitSource);set(row+j,15,method.text,results[j]?method.row:row+j);}
    }
    set(18,0,dateWords(data.submit_date));set(19,0,'제출인       '+clean(data.submitter));set(20,0,clean(data.authority));
    if(pageIndex){const p=ps[0],setup=first(p,'run');if(!descendants(setup,'secPr').length)fail('원본 쪽 설정을 찾지 못했습니다.');e.edit(setup.start,setup.end,'');e.edit(p.start,p.openEnd,replaceAttr(replaceAttr(p.open,'pageBreak','1'),'id',pageIndex));e.edit(table.start,table.openEnd,replaceAttr(table.open,'id',Number(attr(table,'id'))+pageIndex));}
    return e.finish();
  }
  async function hash(bytes){if(!global.crypto?.subtle)fail('원본 확인을 위해 HTTPS에서 열어 주세요.');return Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');}
  async function templateBytes(){if(!cached)cached=(async()=>{const response=await global.fetch(info().url,{cache:'no-cache'});if(!response.ok)fail('반기보고서 원본 HWPX 파일을 불러오지 못했습니다. assets 폴더를 확인해 주세요.');return response.arrayBuffer();})().catch(e=>{cached=undefined;throw e;});return cached;}
  async function generate(data={},options={}){
    const checked=validate(data);if(!checked.valid)fail(checked.issues.join('\n'));
    if(!global.JSZip||!global.DOMParser)fail('HWPX 처리 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    const bytes=options.templateBytes||await templateBytes();if(await hash(bytes)!==TEMPLATE.sha256)fail('반기보고서 원본이 이번 배포 파일과 다릅니다. 지정된 원본 양식을 다시 올려 주세요.');
    const zip=await global.JSZip.loadAsync(bytes,{checkCRC32:true});if(!zip.file('mimetype')||clean(await zip.file('mimetype').async('string'))!==MIME)fail('HWPX 문서 형식이 아닙니다.');
    const original=await zip.file('Contents/section0.xml').async('string'),pages=paginate(data.measurements||[]),filled=pages.map((p,i)=>pageXml(original,data,p,i));
    const tree=parse(filled[0]),sec=tree.children.find(n=>local(n)==='sec'),body=filled.map(x=>{const s=parse(x).children.find(n=>local(n)==='sec');return x.slice(s.openEnd,s.closeStart);}).join('');
    const generated=filled[0].slice(0,sec.openEnd)+body+filled[0].slice(sec.closeStart);parse(generated);zip.file('Contents/section0.xml',generated);
    // A previous customer's thumbnail must never appear as the newly generated report.
    zip.remove('Preview/PrvImage.png');
    const doc=new global.DOMParser().parseFromString(generated,'application/xml');const texts=Array.from(doc.getElementsByTagNameNS('*','p')).filter(p=>!p.getElementsByTagNameNS('*','tbl').length).map(p=>p.textContent);zip.file('Preview/PrvText.txt',texts.join('\r\n'));
    const hpf=zip.file('Contents/content.hpf');if(hpf){let meta=await hpf.async('string');const title=xmlText([clean(data.company_name),clean(data.year),clean(data.half)==='1'?'상반기':clean(data.half)==='2'?'하반기':'',TEMPLATE.title].filter(Boolean).join(' '));meta=meta.replace(/<opf:title(?:\s*\/>|>[\s\S]*?<\/opf:title>)/,'<opf:title>'+title+'</opf:title>');meta=meta.replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*(<\/opf:meta>)/,(_,a,b)=>a+new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+b);zip.file('Contents/content.hpf',meta);}
    const ordered=new global.JSZip();ordered.file('mimetype',MIME,{compression:'STORE'});for(const [name,file] of Object.entries(zip.files)){if(name==='mimetype'||file.dir)continue;ordered.file(name,await file.async('uint8array'),{binary:true});}
    return ordered.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE',compressionOptions:{level:6}});
  }
  global.DF_HALFYEAR_HWPX=Object.freeze({version:VERSION,info,validate,paginate,formatDailyFlow,generate});
})(typeof window!=='undefined'?window:globalThis);
