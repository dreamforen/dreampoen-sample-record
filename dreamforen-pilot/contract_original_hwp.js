/* Exact-source HWP text editor. The original CFB streams and document styles remain authoritative. */
(function(root){
  'use strict';
  const MIME='application/x-hwp',MAX_FILE=4*1024*1024,MAX_SECTION=8*1024*1024,MAX_TEXT=4096;
  const sources={
    contract:{file:'standard_contract.hwp',sha256:'43fbe2fdee4fd30615bc7bc5d1dd4ef6668e2fe7f31f72cc4ffa0e764cce8553'},
    plan:{file:'task_plan.hwp',sha256:'f8ebbd55d201c49bceb2ed9f382380444cda58dea2b22caf1bbb05cba4e4d2c9'},
    notice:{file:'contract_notice.hwp',sha256:'d38c6a69f84292c56bf6014c24f017b80ccefc36d0b32762a9e87eda77eeaffd'}
  },cache=new Map();
  const fail=m=>{throw Error(m);},u8=b=>b instanceof Uint8Array?b:new Uint8Array(b),copy=b=>Uint8Array.from(b);
  const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
  function typeKey(type){const key=({standard_contract:'contract',task_plan:'plan',contract_notice:'notice'})[type]||type;if(!sources[key])fail('지원하지 않는 계약 원본입니다.');return key;}
  function lib(){const c=root.XLSX?.CFB;if(!c?.read||!c?.write||!c.utils?._inflateRaw||!c.utils?._deflateRaw)fail('한글 원본 편집 구성요소를 불러오지 못했습니다. 새로고침해주세요.');return c;}
  function find(cfb,suffix){const i=cfb.FullPaths.findIndex(p=>p.endsWith('/'+suffix));return i<0?null:{index:i,path:cfb.FullPaths[i],entry:cfb.FileIndex[i]};}
  function inflate(bytes){const input=copy(bytes);input.l=0;const out=u8(lib().utils._inflateRaw(input));if(out.byteLength>MAX_SECTION)fail('원본 본문이 허용 크기를 초과합니다.');return out;}
  function deflate(bytes){return u8(lib().utils._deflateRaw(bytes));}
  function utf16(bytes){if(bytes.length%2)fail('한글 본문의 문자 길이가 올바르지 않습니다.');return new TextDecoder('utf-16le',{fatal:true}).decode(bytes);}
  function encode(s){const out=new Uint8Array(s.length*2),v=view(out);for(let i=0;i<s.length;i++)v.setUint16(i*2,s.charCodeAt(i),true);return out;}
  function record(tag,level,payload){const large=payload.length>=4095,out=new Uint8Array(payload.length+(large?8:4)),v=view(out);v.setUint32(0,(tag|(level<<10)|((large?4095:payload.length)<<20))>>>0,true);if(large)v.setUint32(4,payload.length,true);out.set(payload,large?8:4);return out;}
  function records(bytes){const out=[];let offset=0;while(offset<bytes.length){if(offset+4>bytes.length)fail('한글 본문 레코드가 잘렸습니다.');const start=offset,h=view(bytes).getUint32(offset,true),tag=h&1023,level=(h>>>10)&1023;let size=h>>>20;offset+=4;if(size===4095){if(offset+4>bytes.length)fail('한글 확장 레코드가 잘렸습니다.');size=view(bytes).getUint32(offset,true);offset+=4;}if(size>MAX_SECTION||offset+size>bytes.length)fail('한글 본문 레코드 길이를 확인해주세요.');out.push({tag,level,payload:bytes.slice(offset,offset+size),raw:bytes.slice(start,offset+size)});offset+=size;}return out;}
  function visible(raw){let out='';for(let i=0;i<raw.length;){const n=raw.charCodeAt(i);if(n>=32){out+=raw[i++];continue;}if(n===13){i++;continue;}if(n===10){out+='\n';i++;continue;}if(n===9){out+='\t';i+=8;continue;}if(n===24){out+='-';i++;continue;}if(n===25||n===26||n===31){out+=' ';i++;continue;}if(n===0){i++;continue;}i+=8;}return out;}
  function parseSection(bytes,name,offsetIndex){
    const rs=records(bytes),paragraphs=[],byLevel=new Map();
    rs.forEach((r,index)=>{
      if(r.tag===66){if(r.payload.length<22)fail('문단 머리정보가 올바르지 않습니다.');const h=view(r.payload),p={index:offsetIndex+paragraphs.length,section:name,sectionIndex:paragraphs.length,level:r.level,headerRecord:index,textRecords:[],charRecords:[],lineRecords:[],rangeRecords:[],charCount:h.getUint32(0,true)&0x7fffffff,paraShapeId:h.getUint16(8,true),styleId:r.payload[10]};paragraphs.push(p);byLevel.set(r.level,p);for(const l of [...byLevel.keys()])if(l>r.level)byLevel.delete(l);return;}
      const p=byLevel.get(r.level-1);if(!p)return;
      if(r.tag===67)p.textRecords.push(index);if(r.tag===68)p.charRecords.push(index);if(r.tag===69)p.lineRecords.push(index);if(r.tag===70)p.rangeRecords.push(index);
    });
    paragraphs.forEach(p=>{
      p.rawText=p.textRecords.map(i=>utf16(rs[i].payload)).join('');p.text=visible(p.rawText);p.editable=p.textRecords.length<=1&&(!p.rawText||/^[^\u0000-\u0009\u000b-\u000c\u000e-\u001f]*\r$/.test(p.rawText))&&!/[\r\n]/.test(p.rawText.slice(0,-1));
      p.charShapes=p.charRecords.flatMap(i=>{const b=rs[i].payload;if(b.length%8)fail('문단 글자모양 정보가 올바르지 않습니다.');return Array.from({length:b.length/8},(_,j)=>({position:view(b).getUint32(j*8,true),id:view(b).getUint32(j*8+4,true)}));});
      p.lineSegments=p.lineRecords.flatMap(i=>{const b=rs[i].payload;if(b.length%36)fail('문단 줄정보가 올바르지 않습니다.');const names=['textPos','verticalPos','lineHeight','textHeight','baseline','spacing','columnStart','segmentWidth','flags'];return Array.from({length:b.length/36},(_,j)=>Object.fromEntries(names.map((n,k)=>[n,view(b).getInt32(j*36+k*4,true)])));});
      if(!p.charShapes.length)p.editable=false;
    });
    return {name,records:rs,paragraphs};
  }
  const ALIGNMENTS={justify:0,left:1,right:2,center:3};
  const SPACING_RANGES={charWidth:[50,200,1],letterSpacing:[-30,50,1],lineHeight:[80,300,1],textIndent:[-72,144,200],marginLeft:[0,144,200],marginRight:[0,144,200],spaceBefore:[0,72,200],spaceAfter:[0,72,200]};
  // Native ParaShape distances in these pinned HWP originals are doubled HWPUNIT: 200 per pt.
  const PARA_DISTANCES={marginLeft:4,marginRight:8,textIndent:12,spaceBefore:16,spaceAfter:20};
  const fontKey=name=>String(name||'').normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase();
  function docInfo(cfb,flags){
    const file=find(cfb,'DocInfo');if(!file)fail('한글 원본 서식정보가 없습니다.');
    const bytes=u8(file.entry.content),rs=records(flags&1?inflate(bytes):bytes),mapping=rs.find(r=>r.tag===17);
    if(!mapping||mapping.payload.length<56)fail('한글 원본의 서식 개수정보를 확인해주세요.');
    const counts=Array.from({length:mapping.payload.length/4},(_,i)=>view(mapping.payload).getUint32(i*4,true));
    const fontRecords=rs.filter(r=>r.tag===19),charRecords=rs.filter(r=>r.tag===21),paraRecords=rs.filter(r=>r.tag===25),groups=[];let offset=0;
    for(let language=0;language<7;language++){
      const count=counts[language+1];if(offset+count>fontRecords.length)fail('원본 언어별 글꼴 수를 확인해주세요.');
      groups.push(fontRecords.slice(offset,offset+count).map((r,id)=>{const len=view(r.payload).getUint16(1,true);if(3+len*2>r.payload.length)fail('원본 글꼴 이름을 확인해주세요.');return {id,record:r,name:utf16(r.payload.slice(3,3+len*2))};}));offset+=count;
    }
    if(offset!==fontRecords.length||counts[9]!==charRecords.length||counts[13]!==paraRecords.length)fail('원본 글꼴·글자·문단 서식 개수가 일치하지 않습니다.');
    if(charRecords.some(r=>r.payload.length<68)||paraRecords.some(r=>r.payload.length<28))fail('원본 글자·문단 서식 구조를 확인해주세요.');
    return {file,records:rs,mapping,counts,groups,charRecords,paraRecords,addedFonts:Array.from({length:7},()=>[]),addedChars:[],addedParas:[],changed:false};
  }
  function charFormat(di,id){
    const r=di.charRecords[id]||di.addedChars[id-di.charRecords.length];if(!r)fail('문단 글자서식 참조를 찾지 못했습니다.');
    const b=r.payload,v=view(b),fontRefs=Array.from({length:7},(_,i)=>v.getUint16(i*2,true)),property=v.getUint32(46,true),font=(di.groups[0][fontRefs[0]]||di.addedFonts[0][fontRefs[0]-di.groups[0].length]);
    return {id,fontFamily:font?.name||'',fontSize:v.getUint32(42,true)/100,bold:!!(property&2),italic:!!(property&1),underline:!!(property&12),fontRefs,charWidth:b[14],letterSpacing:v.getInt8(21),charWidths:Array.from(b.slice(14,21)),letterSpacings:Array.from({length:7},(_,i)=>v.getInt8(21+i))};
  }
  function paraFormat(di,id){
    const r=di.paraRecords[id]||di.addedParas[id-di.paraRecords.length];if(!r)fail('문단 정렬서식 참조를 찾지 못했습니다.');
    const v=view(r.payload),align=(v.getUint32(0,true)>>>2)&7,modern=r.payload.length>=54,mode=modern?v.getUint32(46,true)&31:v.getUint32(0,true)&3;
    return {id,textAlign:Object.keys(ALIGNMENTS).find(key=>ALIGNMENTS[key]===align)||'justify',lineHeight:mode===0?(modern?v.getUint32(50,true):v.getInt32(24,true)):null,lineHeightMode:['percent','fixed','spaceOnly','minimum'][mode]||'unknown',...Object.fromEntries(Object.entries(PARA_DISTANCES).map(([key,offset])=>[key,v.getInt32(offset,true)/200]))};
  }
  function parse(bytes){
    const cfb=lib().read(bytes,{type:'array'}),header=find(cfb,'FileHeader');if(!header||header.entry.content.length<40)fail('HWP 원본 머리정보가 없습니다.');
    const h=u8(header.entry.content);if(new TextDecoder().decode(h.slice(0,17))!=='HWP Document File')fail('HWP 5 원본을 확인해주세요.');const flags=view(h).getUint32(36,true);if(flags&6)fail('암호 또는 배포용 한글 원본은 편집할 수 없습니다.');
    const sectionFiles=cfb.FullPaths.map((path,index)=>({path,index})).filter(x=>/\/BodyText\/Section\d+$/.test(x.path)).sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}));if(!sectionFiles.length)fail('한글 본문이 없습니다.');
    let index=0;const sections=sectionFiles.map(file=>{const bytes=u8(cfb.FileIndex[file.index].content),s=parseSection(flags&1?inflate(bytes):bytes,file.path,index);index+=s.paragraphs.length;return s;});return {cfb,flags,sections,paragraphs:sections.flatMap(s=>s.paragraphs),docInfo:docInfo(cfb,flags)};
  }
  function publicInfo(doc,type,sha256){
    const di=doc.docInfo,charStyles=di.charRecords.map((_,id)=>charFormat(di,id)),paragraphStyles=di.paraRecords.map((_,id)=>paraFormat(di,id));
    return {type,sha256,fontOptions:[...new Map(di.groups.flat().map(font=>[fontKey(font.name),font.name])).values()],charStyles,paragraphStyles,
      paragraphs:doc.paragraphs.map(p=>({index:p.index,section:p.section,sectionIndex:p.sectionIndex,level:p.level,text:p.text,rawText:p.rawText,editable:p.editable,rawEditable:true,charShapes:p.charShapes.map(x=>({...x})),lineSegments:p.lineSegments.map(x=>({...x})),paraShapeId:p.paraShapeId,styleId:p.styleId,charCount:p.charCount,format:{...charStyles[p.charShapes[0]?.id||0],...Object.fromEntries(Object.entries(paragraphStyles[p.paraShapeId]||{}).filter(([key])=>key!=='id'))}}))};
  }
  async function source(type){
    const key=typeKey(type);if(!cache.has(key))cache.set(key,(async()=>{const spec=sources[key],url=new URL('assets/contract_docs/originals/'+spec.file+'?v=445',root.location?.href||'https://localhost/');const response=await root.fetch(url.href);if(!response.ok)fail('계약 원본을 불러오지 못했습니다 ('+response.status+').');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MAX_FILE)fail('계약 원본 파일이 너무 큽니다.');const digest=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(digest!==spec.sha256)fail('첨부 원본과 다른 계약 양식입니다. 원본 파일을 다시 배포해주세요.');const doc=parse(bytes);return {bytes,type:key,sha256:digest,info:publicInfo(doc,key,digest)};})().catch(e=>{cache.delete(key);throw e;}));return cache.get(key);
  }
  async function inspect(type){const s=await source(type);return JSON.parse(JSON.stringify(s.info));}
  function diff(a,b){
    let prefix=0;while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;let suffix=0;while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
    const x=a.slice(prefix,a.length-suffix),y=b.slice(prefix,b.length-suffix);if(!x.length&&!y.length)return [];
    if((x.length+1)*(y.length+1)>4e6)fail('한 문단의 수정량이 너무 큽니다. 입력 내용을 줄여주세요.');
    const width=y.length+1,dp=new Uint16Array((x.length+1)*width);for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)dp[i*width+j]=x[i]===y[j]?dp[(i+1)*width+j+1]+1:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
    let i=0,j=0,pending=null;const edits=[];const flush=()=>{if(pending){edits.push(pending);pending=null;}};
    while(i<x.length||j<y.length){if(i<x.length&&j<y.length&&x[i]===y[j]){flush();i++;j++;continue;}if(!pending)pending={start:prefix+i,end:prefix+i,text:''};if(j<y.length&&(i>=x.length||dp[i*width+j+1]>=dp[(i+1)*width+j]))pending.text+=y[j++];else{pending.end=prefix+(++i);}}
    flush();return edits;
  }
  function mapped(pos,edits,right=false){let delta=0;for(const e of edits){if(pos<e.start)return pos+delta;if(pos<e.end)return e.start+delta+(right?e.text.length:0);delta+=e.text.length-(e.end-e.start);}return pos+delta;}
  function styleRuns(original,edits){
    const styleAt=p=>{let id=original[0].id;for(const run of original)if(run.position<=p)id=run.id;return id;};
    const runs=original.filter(run=>!edits.some(e=>run.position>e.start&&run.position<e.end)).map(run=>({position:mapped(run.position,edits),id:run.id}));
    let delta=0;for(const e of edits){if(e.text.length)runs.push({position:e.start+delta,id:styleAt(e.start)});delta+=e.text.length-(e.end-e.start);}
    runs.sort((a,b)=>a.position-b.position);const unique=new Map();for(const run of runs)unique.set(run.position,run.id);const out=[];for(const [position,id]of unique){if(!out.length||out[out.length-1].id!==id)out.push({position,id});}if(!out.length||out[0].position!==0)out.unshift({position:0,id:styleAt(0)});return out;
  }
  function rawParts(raw){
    const controls=[],segments=[];let start=0,i=0;
    while(i<raw.length){const n=raw.charCodeAt(i);if(n>=32){i++;continue;}if(i>start)segments.push({start,end:i,text:raw.slice(start,i)});const width=[0,10,13,24,25,26,30,31].includes(n)?1:8;if(i+width>raw.length)fail('원본 문단 제어정보를 확인해주세요.');controls.push(raw.slice(i,i+width));i+=width;start=i;}
    if(i>start)segments.push({start,end:i,text:raw.slice(start,i)});return {controls,segments};
  }
  function desiredText(p,change){
    const original=p.rawText?p.rawText.slice(0,-1):'';
    if(typeof change==='string')return change;
    const replacements=Array.isArray(change)?change:change?.replacements;
    if(!Array.isArray(replacements)||replacements.length>100)fail('원본 문단 수정값을 확인해주세요.');
    let text=original;
    for(const replacement of replacements){const needle=replacement.find??replacement.from,replaced=replacement.replace??replacement.to;
      if(typeof needle!=='string'||!needle||/[\u0000-\u001f]/.test(needle)||typeof replaced!=='string'||/[\u0000-\u001f]/.test(replaced))fail('문단의 일반 문자만 찾아 바꿀 수 있습니다.');
      let count=0;const parts=rawParts(text),edits=[];
      for(const segment of parts.segments){let pos=segment.text.indexOf(needle);while(pos>=0){edits.push({start:segment.start+pos,end:segment.start+pos+needle.length,text:replaced});count++;if(replacement.all===false)break;pos=segment.text.indexOf(needle,pos+needle.length);}if(count&&replacement.all===false)break;}
      if(!count)fail('원본에서 바꿀 문자를 찾지 못했습니다: '+needle);
      for(const edit of edits.reverse())text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
    }
    return text;
  }
  function setParagraph(section,p,change){
    const old=p.rawText?p.rawText.slice(0,-1):'',newText=desiredText(p,change);
    if(newText.length>MAX_TEXT||/[\u007f]/.test(newText)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(newText))fail('입력값은 올바른 한 문단의 문자만 사용할 수 있습니다.');
    if(JSON.stringify(rawParts(old).controls)!==JSON.stringify(rawParts(newText).controls))fail('원본 문단의 표·그림·고정 간격 제어문자는 변경할 수 없습니다.');
    if(old===newText)return null;
    if(p.textRecords.length>1||p.charRecords.length!==1)fail('여러 문자 레코드가 있는 문단은 직접 교체할 수 없습니다.');
    const edits=diff(old,newText),runs=styleRuns(p.charShapes,edits),rs=section.records;
    const header=copy(rs[p.headerRecord].payload),hv=view(header);hv.setUint32(0,(hv.getUint32(0,true)&0x80000000)|(newText.length+1),true);hv.setUint16(12,runs.length,true);hv.setUint16(16,0,true);rs[p.headerRecord].replacement=header;
    const chars=new Uint8Array(runs.length*8),cv=view(chars);runs.forEach((run,i)=>{cv.setUint32(i*8,run.position,true);cv.setUint32(i*8+4,run.id,true);});rs[p.charRecords[0]].replacement=chars;
    if(p.textRecords.length)rs[p.textRecords[0]].replacement=encode(newText+'\r');else rs[p.headerRecord].insertAfter=record(67,p.level+1,encode(newText+'\r'));
    for(const i of p.lineRecords)rs[i].remove=true;
    for(const i of p.rangeRecords){const bytes=copy(rs[i].payload);if(bytes.length%12)fail('문단 범위정보를 확인해주세요.');const v=view(bytes);for(let j=0;j<bytes.length;j+=12){v.setUint32(j,mapped(v.getUint32(j,true),edits),true);v.setUint32(j+4,mapped(v.getUint32(j+4,true),edits,true),true);}rs[i].replacement=bytes;}
    p.text=visible(newText);p.rawText=newText+'\r';return newText;
  }
  function stylePatch(raw){
    if(raw===null||raw===undefined)return {};
    if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('글꼴 수정값을 확인해주세요.');
    const allowed=new Set(['fontFamily','fontSize','bold','italic','underline','textAlign',...Object.keys(SPACING_RANGES)]),out={};
    for(const [key,value]of Object.entries(raw)){
      if(!allowed.has(key))fail('지원하지 않는 글꼴 수정값입니다: '+key);
      if(key==='fontFamily'){
        if(typeof value!=='string'||!value.trim()||value.length>100||/[\u0000-\u001f\u007f]/.test(value))fail('글꼴 이름을 확인해주세요.');out[key]=value.trim();
      }else if(key==='fontSize'){
        if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>200||Math.round(value*100)<=0)fail('글자 크기는 0보다 크고 200pt 이하로 입력해주세요.');out[key]=Math.round(value*100)/100;
      }else if(Object.prototype.hasOwnProperty.call(SPACING_RANGES,key)){
        const [minimum,maximum,scale]=SPACING_RANGES[key];if(typeof value!=='number'||!Number.isFinite(value)||value<minimum||value>maximum)fail('문단·글자 간격 값의 범위를 확인해주세요: '+key);out[key]=Math.round(value*scale)/scale||0;
      }else if(key==='textAlign'){
        if(!Object.prototype.hasOwnProperty.call(ALIGNMENTS,value))fail('문단 정렬을 확인해주세요.');out[key]=value;
      }else{if(typeof value!=='boolean')fail('글자 속성은 켜기 또는 끄기로 지정해주세요.');out[key]=value;}
    }
    return out;
  }
  function equalBytes(a,b){return a.length===b.length&&a.every((n,i)=>n===b[i]);}
  function fontId(di,language,name,sourceFontId){
    const existing=di.groups[language].concat(di.addedFonts[language]),found=existing.find(font=>fontKey(font.name)===fontKey(name));if(found)return found.id;
    const id=existing.length;if(id>=65535)fail('문서에 등록 가능한 글꼴 수를 초과했습니다.');
    const base=di.groups[language][sourceFontId]||di.groups[language][0];if(!base)fail('원본의 기본 글꼴을 찾지 못했습니다.');
    const old=base.record.payload,length=view(old).getUint16(1,true),encoded=encode(name),bytes=new Uint8Array(old.length-length*2+encoded.length);
    bytes[0]=old[0];view(bytes).setUint16(1,name.length,true);bytes.set(encoded,3);bytes.set(old.slice(3+length*2),3+encoded.length);
    di.addedFonts[language].push({id,name,record:{tag:19,level:base.record.level,payload:bytes}});di.changed=true;return id;
  }
  function cloneChar(di,id,patch){
    const source=di.charRecords[id]||di.addedChars[id-di.charRecords.length];if(!source)fail('원본 글자모양 참조를 찾지 못했습니다.');
    const bytes=copy(source.payload),v=view(bytes);
    if(patch.fontFamily!==undefined)for(let language=0;language<7;language++)v.setUint16(language*2,fontId(di,language,patch.fontFamily,v.getUint16(language*2,true)),true);
    if(patch.fontSize!==undefined)v.setUint32(42,Math.round(patch.fontSize*100),true);
    for(let language=0;language<7;language++){if(patch.charWidth!==undefined)v.setUint8(14+language,patch.charWidth);if(patch.letterSpacing!==undefined)v.setInt8(21+language,patch.letterSpacing);}
    let property=v.getUint32(46,true);if(patch.bold!==undefined)property=patch.bold?property|2:property&~2;if(patch.italic!==undefined)property=patch.italic?property|1:property&~1;if(patch.underline!==undefined)property=patch.underline?(property&~12)|4:property&~12;v.setUint32(46,property>>>0,true);
    const all=di.charRecords.concat(di.addedChars),found=all.findIndex(r=>equalBytes(r.payload,bytes));if(found>=0)return found;
    if(all.length>=65535)fail('문서에 등록 가능한 글자모양 수를 초과했습니다.');di.addedChars.push({tag:21,level:source.level,payload:bytes});di.changed=true;return all.length;
  }
  function clonePara(di,id,patch){
    if(patch.textAlign===undefined&&patch.lineHeight===undefined&&!Object.keys(PARA_DISTANCES).some(key=>patch[key]!==undefined))return id;
    const source=di.paraRecords[id]||di.addedParas[id-di.paraRecords.length];if(!source)fail('원본 문단모양 참조를 찾지 못했습니다.');
    const bytes=copy(source.payload),v=view(bytes);let property=v.getUint32(0,true);
    if(patch.textAlign!==undefined)property=((property&~28)|(ALIGNMENTS[patch.textAlign]<<2))>>>0;
    for(const [key,offset]of Object.entries(PARA_DISTANCES))if(patch[key]!==undefined)v.setInt32(offset,Math.round(patch[key]*200),true);
    if(patch.lineHeight!==undefined){property&=~3;v.setInt32(24,patch.lineHeight,true);if(bytes.length>=54){v.setUint32(46,v.getUint32(46,true)&~31,true);v.setUint32(50,patch.lineHeight,true);}}
    v.setUint32(0,property>>>0,true);
    const all=di.paraRecords.concat(di.addedParas),found=all.findIndex(r=>equalBytes(r.payload,bytes));if(found>=0)return found;
    if(all.length>=65535)fail('문서에 등록 가능한 문단모양 수를 초과했습니다.');di.addedParas.push({tag:25,level:source.level,payload:bytes});di.changed=true;return all.length;
  }
  function formatParagraph(doc,p,raw){
    const patch=stylePatch(raw);if(!Object.keys(patch).length)return false;
    if(!p.editable&&!p.text.trim())fail('표·그림 위치를 관리하는 문단에는 글꼴을 적용할 수 없습니다.');
    if(p.charRecords.length!==1)fail('여러 글자모양 레코드가 있는 문단에는 글꼴을 적용할 수 없습니다.');
    const section=doc.sections.find(s=>s.name===p.section),rs=section.records,chars=rs[p.charRecords[0]],current=chars.replacement||chars.payload,runs=[];
    for(let i=0;i<current.length;i+=8)runs.push({position:view(current).getUint32(i,true),id:view(current).getUint32(i+4,true)});
    const updated=runs.map(run=>({...run,id:cloneChar(doc.docInfo,run.id,patch)})),oldHeader=rs[p.headerRecord].replacement||rs[p.headerRecord].payload,oldParaId=view(oldHeader).getUint16(8,true),newParaId=clonePara(doc.docInfo,oldParaId,patch);
    if(newParaId===oldParaId&&updated.every((run,i)=>run.id===runs[i].id))return false;
    const bytes=new Uint8Array(updated.length*8),cv=view(bytes);updated.forEach((run,i)=>{cv.setUint32(i*8,run.position,true);cv.setUint32(i*8+4,run.id,true);});chars.replacement=bytes;
    const header=copy(oldHeader),hv=view(header);hv.setUint16(8,newParaId,true);hv.setUint16(12,updated.length,true);hv.setUint16(16,0,true);rs[p.headerRecord].replacement=header;for(const index of p.lineRecords)rs[index].remove=true;return true;
  }
  function writeDocInfo(doc){
    const di=doc.docInfo;if(!di.changed)return;
    const counts=copy(di.mapping.payload),v=view(counts);for(let i=0;i<7;i++)v.setUint32((i+1)*4,di.groups[i].length+di.addedFonts[i].length,true);v.setUint32(9*4,di.charRecords.length+di.addedChars.length,true);v.setUint32(13*4,di.paraRecords.length+di.addedParas.length,true);
    const additions=new Map(),put=(r,items)=>{if(items.length)additions.set(r,[...(additions.get(r)||[]),...items]);};
    for(let i=0;i<7;i++){const base=di.groups[i].at(-1);if(!base&&di.addedFonts[i].length)fail('원본 언어별 글꼴 위치를 찾지 못했습니다.');if(base)put(base.record,di.addedFonts[i].map(f=>f.record));}
    put(di.charRecords.at(-1),di.addedChars);put(di.paraRecords.at(-1),di.addedParas);
    const body=concat(di.records.flatMap(r=>[r===di.mapping?record(r.tag,r.level,counts):r.raw,...(additions.get(r)||[]).map(n=>record(n.tag,n.level,n.payload))]));
    di.file.entry.content=doc.flags&1?deflate(body):body;di.file.entry.size=di.file.entry.content.length;
  }
  function concat(list){const n=list.reduce((s,x)=>s+x.length,0),out=new Uint8Array(n);let offset=0;for(const b of list){out.set(b,offset);offset+=b.length;}return out;}
  async function generate(type,changes={},options={}){
    const src=await source(type);if(!changes||Array.isArray(changes)||typeof changes!=='object')fail('계약 원본의 수정값을 확인해주세요.');const doc=parse(src.bytes),expected=new Map();let changed=false;
    for(const [index,value]of Object.entries(changes)){if(!/^\d+$/.test(index)||!doc.paragraphs[Number(index)])fail('원본 문단 위치를 찾지 못했습니다: '+index);const p=doc.paragraphs[Number(index)],section=doc.sections.find(s=>s.name===p.section);const result=setParagraph(section,p,value);if(result!==null){changed=true;expected.set(Number(index),result+'\r');}}
    if(!options||typeof options!=='object'||Array.isArray(options))fail('문서 서식 옵션을 확인해주세요.');const styles=options.styles||{};if(!styles||typeof styles!=='object'||Array.isArray(styles))fail('문서 서식 수정값을 확인해주세요.');
    for(const [index,patch]of Object.entries(styles)){if(!/^\d+$/.test(index)||!doc.paragraphs[Number(index)])fail('글꼴을 적용할 문단 위치를 찾지 못했습니다: '+index);changed=formatParagraph(doc,doc.paragraphs[Number(index)],patch)||changed;}
    if(!changed)return new Blob([src.bytes],{type:MIME});
    writeDocInfo(doc);
    for(const section of doc.sections){if(!section.records.some(r=>r.replacement||r.remove||r.insertAfter))continue;const body=concat(section.records.flatMap(r=>r.remove?[]:[r.replacement?record(r.tag,r.level,r.replacement):r.raw,...(r.insertAfter?[r.insertAfter]:[])]));const file=find(doc.cfb,section.name.replace(/^Root Entry\//,''));if(!file)fail('원본 본문 경로를 확인해주세요.');file.entry.content=doc.flags&1?deflate(body):body;file.entry.size=file.entry.content.length;}
    // Generated files must not carry a stale image of the specimen customer.
    const preview=find(doc.cfb,'PrvImage');if(preview)lib().utils.cfb_del(doc.cfb,preview.path);
    const summary=find(doc.cfb,'\u0005HwpSummaryInformation');if(summary)lib().utils.cfb_del(doc.cfb,summary.path);
    const previewText=find(doc.cfb,'PrvText'),text=encode(doc.paragraphs.map(p=>p.text).join('\r\n'));
    if(previewText){previewText.entry.content=text;previewText.entry.size=text.length;}else lib().utils.cfb_add(doc.cfb,'PrvText',text);
    lib().utils.cfb_gc(doc.cfb);
    const bytes=u8(lib().write(doc.cfb,{type:'array'}));const check=parse(bytes);
    for(const [index,patch]of Object.entries(styles)){
      const p=check.paragraphs[Number(index)],requested=stylePatch(patch);
      for(const run of p.charShapes){const actual=charFormat(check.docInfo,run.id);for(const key of ['fontFamily','fontSize','bold','italic','underline','charWidth','letterSpacing'])if(requested[key]!==undefined&&(key==='fontFamily'?fontKey(actual[key])!==fontKey(requested[key]):actual[key]!==requested[key]))fail('생성한 한글 문서의 글꼴을 확인하지 못했습니다.');
        if(requested.charWidth!==undefined&&!actual.charWidths.every(value=>value===requested.charWidth)||requested.letterSpacing!==undefined&&!actual.letterSpacings.every(value=>value===requested.letterSpacing))fail('생성한 한글 문서의 언어별 글자 간격을 확인하지 못했습니다.');
      }
      const actual=paraFormat(check.docInfo,p.paraShapeId);for(const key of ['textAlign','lineHeight',...Object.keys(PARA_DISTANCES)])if(requested[key]!==undefined&&actual[key]!==requested[key])fail('생성한 한글 문서의 문단 간격을 확인하지 못했습니다.');
    }
    if(check.paragraphs.length!==doc.paragraphs.length)fail('생성한 한글 문서의 문단 수가 원본과 다릅니다.');for(const [index,value]of expected)if(check.paragraphs[index].rawText!==value)fail('생성한 한글 문서의 입력값을 확인하지 못했습니다.');return new Blob([bytes],{type:MIME});
  }
  root.DF_CONTRACT_ORIGINAL_HWP=Object.freeze({load:inspect,inspect,generate,mimeType:MIME});
})(typeof window!=='undefined'?window:globalThis);
