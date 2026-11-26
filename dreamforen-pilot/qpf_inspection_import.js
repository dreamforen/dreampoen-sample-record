/* DFEN-QPF-04-03 (01): read inspection fields from the full HWP/HWPX document. */
(function(global){
  'use strict';
  const MAX_FILE=100*1024*1024,MAX_EXPANDED=120*1024*1024,MAX_FIELD=8000;
  const FIELDS=['written_date','approver_person','ordering_person','technical_person','item_name','model_number','manufacturer','related_documents','inspection_date','inspector','required_specification','inspection_contents','inspection_result'];
  const LABELS={item_name:['품명'],model_number:['모델번호','모델명'],manufacturer:['제조사'],related_documents:['관련자료첨부','관련자료'],inspection_date:['검수일자','검수일'],inspector:['검수자'],required_specification:['요구사양'],inspection_contents:['검수내용'],inspection_result:['검수결과']};
  const APPROVAL={approver_person:'담당자',ordering_person:'발주담당자',technical_person:'기술책임자'};
  const view=a=>new DataView(a.buffer,a.byteOffset,a.byteLength);
  const norm=s=>String(s??'').replace(/[\s\u00a0·:：()（）.\-\/]/g,'');
  const clean=s=>String(s??'').replace(/\r/g,'').replace(/\u0000/g,'').replace(/\u00a0/g,' ').trim();
  const plainDate=s=>/^[\s년월일.\-/]*$/.test(s)?'':s;
  function checked(value){const s=clean(value);if(s.length>MAX_FIELD)throw Error('검수보고서 한 칸의 내용은 8,000자 이내로 불러올 수 있습니다.');return s;}
  function recordYear(fields){for(const key of ['inspection_date','written_date']){const m=fields[key]?.match(/(?:^|\D)((?:19|20|21)\d{2}|2200)\s*(?:년|[-./])/);if(m)return Number(m[1]);}return null;}
  function mapFields(tables,allText){
    if(!/DFEN\s*[-－]\s*QPF\s*[-－]\s*04\s*[-－]\s*03/i.test(allText)||!norm(allText).includes('검수보고서'))throw Error('DFEN-QPF-04-03 검수보고서 양식을 확인해주세요.');
    const candidates=tables.filter(t=>Object.values(LABELS).every(names=>t.cells.some(c=>[0,2].includes(c.c)&&names.includes(norm(c.text)))));
    if(candidates.length!==1)throw Error(candidates.length?'한 파일에 검수보고서가 여러 개 있습니다. 보고서별로 나누어 불러와주세요.':'품명·모델번호·검수 내용 등 원본의 필수 칸을 찾지 못했습니다.');
    const fields=Object.fromEntries(FIELDS.map(k=>[k,''])),main=candidates[0];
    for(const [key,names] of Object.entries(LABELS)){
      const labels=main.cells.filter(c=>[0,2].includes(c.c)&&names.includes(norm(c.text)));if(labels.length!==1)throw Error('검수보고서 항목이 중복되어 내용을 구분할 수 없습니다.');
      const label=labels[0],value=main.cells.find(c=>c.r===label.r&&c.c===label.c+label.cs);
      if(!value)throw Error('검수보고서의 '+label.text+' 입력 칸을 찾지 못했습니다.');
      fields[key]=checked(value.text);
    }
    const approval=tables.filter(t=>Object.values(APPROVAL).every(name=>t.cells.some(c=>norm(c.text)===name)));
    if(approval.length!==1)throw Error('원본의 담당자·발주담당자·기술책임자 결재란을 찾지 못했습니다.');
    for(const [key,name] of Object.entries(APPROVAL)){
      const label=approval[0].cells.find(c=>norm(c.text)===name),value=approval[0].cells.find(c=>c.c===label.c&&c.r===label.r+label.rs);
      if(!value)throw Error('결재란의 '+name+' 입력 칸을 찾지 못했습니다.');
      fields[key]=checked(value.text);
    }
    const dates=approval[0].cells.filter(c=>/^작성\s*일\s*[:：]?/.test(clean(c.text)));
    if(dates.length!==1)throw Error('원본의 작성일 입력 칸을 찾지 못했습니다.');
    let date=clean(dates[0].text).replace(/^작성\s*일\s*[:：]?\s*/,'');
    if(!date){const value=approval[0].cells.find(c=>c.r===dates[0].r&&c.c===dates[0].c+dates[0].cs);date=clean(value?.text);}
    fields.written_date=checked(plainDate(date));fields.inspection_date=checked(plainDate(fields.inspection_date));
    return {fields,year:recordYear(fields)};
  }
  function records(a){const result=[];let p=0;while(p<a.length){if(p+4>a.length)throw Error('HWP 레코드가 손상되었습니다.');const h=view(a).getUint32(p,true);p+=4;let n=h>>>20;if(n===4095){if(p+4>a.length)throw Error('HWP 레코드 크기를 확인해주세요.');n=view(a).getUint32(p,true);p+=4;}if(n>a.length-p||result.length>=100000)throw Error('HWP 구성요소 범위를 확인해주세요.');result.push({tag:h&1023,level:h>>>10&1023,bytes:a.subarray(p,p+n)});p+=n;}return result;}
  function hwpText(a){let result='';for(let p=0;p+1<a.length;){const c=view(a).getUint16(p,true);if(c<32){if(c===10)result+='\n';if([9,30,31].includes(c))result+=' ';if(c===24)result+='-';const step=[1,2,3,4,5,6,7,8,9,11,12,14,15,16,17,18,19,20,21,22,23].includes(c)?16:2;if(p+step>a.length)throw Error('HWP 글자 제어정보가 손상되었습니다.');p+=step;}else{result+=String.fromCharCode(c===0xf09e?0xb7:c);p+=2;}}return result;}
  async function rawInflate(bytes){if(typeof global.DecompressionStream!=='function')throw Error('이 브라우저는 HWP 압축 읽기를 지원하지 않습니다. 최신 브라우저 또는 HWPX 파일을 사용해주세요.');const reader=new Blob([bytes]).stream().pipeThrough(new global.DecompressionStream('deflate-raw')).getReader(),chunks=[];let total=0;try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>MAX_EXPANDED)throw Error('압축 해제한 HWP 문서가 너무 큽니다.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;}
  async function inflate(bytes){try{return await rawInflate(bytes);}catch(error){if(!/junk.*after.*end/i.test(error.message)||bytes.length<9)throw error;const expected=view(bytes).getUint32(bytes.length-4,true);if(expected>MAX_EXPANDED)throw Error('압축 해제한 HWP 문서가 너무 큽니다.');const out=await rawInflate(bytes.subarray(0,-8));if(out.length!==expected)throw Error('HWP 압축 크기가 일치하지 않습니다.');return out;}}
  function tablesFromRecords(recs){const tables=[],stack=[],all=[];for(const rec of recs){const {tag,level,bytes:a}=rec;while(stack.length&&level<stack.at(-1).level)stack.pop();
    if(tag===77){if(a.length<8)throw Error('HWP 표 정보가 손상되었습니다.');const t={level,rows:view(a).getUint16(4,true),cols:view(a).getUint16(6,true),cells:[],current:null};if(!t.rows||!t.cols||t.rows>200||t.cols>50)throw Error('HWP 표의 행·열 범위를 확인해주세요.');tables.push(t);stack.push(t);}
    else if(tag===72&&stack.length&&level===stack.at(-1).level&&a.length>=34){const t=stack.at(-1),v=view(a),c={r:v.getUint16(10,true),c:v.getUint16(8,true),rs:v.getUint16(14,true),cs:v.getUint16(12,true),paragraphs:[]};if(!c.rs||!c.cs||c.r+c.rs>t.rows||c.c+c.cs>t.cols||t.cells.length>=2000)throw Error('HWP 표의 병합 범위를 확인해주세요.');t.cells.push(c);t.current=c;}
    else if(tag===67){const value=hwpText(a);all.push(value);const t=stack.at(-1);if(t?.current&&level===t.level+1)t.current.paragraphs.push(value);}}
    for(const t of tables)for(const c of t.cells){c.text=clean(c.paragraphs.join('\n'));delete c.paragraphs;}return {tables,allText:all.join('\n')};
  }
  async function readHwp(raw){if(!global.XLSX?.CFB)throw Error('한글 읽기 구성요소를 불러오지 못했습니다. 새로고침해주세요.');let cfb;try{cfb=global.XLSX.CFB.read(raw,{type:'array'});}catch{throw Error('HWP 문서를 읽지 못했습니다. 한글에서 다시 저장한 파일을 사용해주세요.');}
    if(cfb.FileIndex.length>4096)throw Error('HWP 구성요소가 너무 많습니다.');const entries=cfb.FileIndex.map((entry,i)=>({name:(cfb.FullPaths[i]||entry.name).replace(/^[^/]+\//,''),bytes:new Uint8Array(entry.content||[])})),get=name=>entries.find(e=>e.name===name)?.bytes;
    const header=get('FileHeader');if(!header||header.length<40||new TextDecoder().decode(header.subarray(0,17))!=='HWP Document File')throw Error('HWP 5 형식의 검수보고서를 선택해주세요.');const flags=view(header).getUint32(36,true);if(flags&6)throw Error('암호 또는 배포용 보호를 해제한 HWP 파일을 사용해주세요.');
    const sections=entries.filter(e=>/^BodyText\/Section\d+$/.test(e.name)).sort((a,b)=>Number(a.name.match(/\d+$/)[0])-Number(b.name.match(/\d+$/)[0]));if(!sections.length||sections.length>32)throw Error('HWP 본문 구성을 확인해주세요.');
    const tables=[],texts=[];let total=0;for(const section of sections){const bytes=flags&1?await inflate(section.bytes):section.bytes;total+=bytes.length;if(total>MAX_EXPANDED)throw Error('압축 해제한 HWP 본문이 너무 큽니다.');const parsed=tablesFromRecords(records(bytes));tables.push(...parsed.tables);texts.push(parsed.allText);}return mapFields(tables,texts.join('\n'));
  }
  const children=(node,name)=>Array.from(node?.children||[]).filter(n=>n.localName===name),child=(node,name)=>children(node,name)[0],all=(node,name)=>Array.from(node?.getElementsByTagNameNS('*',name)||[]);
  const ancestor=(node,name)=>{for(let p=node?.parentElement;p;p=p.parentElement)if(p.localName===name)return p;return null;};
  function xml(s){if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('외부 참조가 있는 HWPX 문서는 지원하지 않습니다.');const doc=new DOMParser().parseFromString(s,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('HWPX 문서 구성을 읽지 못했습니다.');return doc;}
  function xmlText(node){if(node.nodeType===3)return node.nodeValue;if(node.nodeType!==1)return '';if(node.localName==='lineBreak')return '\n';if(node.localName==='tab')return '\t';return Array.from(node.childNodes).map(xmlText).join('');}
  function tablesFromXml(doc){const tables=all(doc,'tbl').map(t=>{const rows=Number(t.getAttribute('rowCnt')),cols=Number(t.getAttribute('colCnt'));if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1||rows>200||cols>50)throw Error('HWPX 표의 행·열 범위를 확인해주세요.');const cells=children(t,'tr').flatMap(tr=>children(tr,'tc')).map(tc=>{const address=child(tc,'cellAddr'),span=child(tc,'cellSpan'),r=Number(address?.getAttribute('rowAddr')),c=Number(address?.getAttribute('colAddr')),rs=Number(span?.getAttribute('rowSpan')||1),cs=Number(span?.getAttribute('colSpan')||1);if(!address||![r,c,rs,cs].every(Number.isInteger)||r<0||c<0||rs<1||cs<1||r+rs>rows||c+cs>cols)throw Error('HWPX 표의 병합 범위를 확인해주세요.');const paragraphs=children(child(tc,'subList'),'p');return {r,c,rs,cs,text:clean(paragraphs.map(p=>all(p,'t').filter(n=>ancestor(n,'tc')===tc).map(xmlText).join('')).join('\n'))};});if(cells.length>2000)throw Error('HWPX 표의 칸 수가 너무 많습니다.');return {rows,cols,cells};});
    return {tables,allText:all(doc,'t').map(xmlText).join('\n')};
  }
  async function readHwpx(raw){if(!global.JSZip)throw Error('HWPX 읽기 구성요소를 불러오지 못했습니다. 새로고침해주세요.');let zip;try{zip=await global.JSZip.loadAsync(raw);}catch{throw Error('HWPX 압축 문서를 읽지 못했습니다. 한글에서 다시 저장해주세요.');}
    const entries=Object.values(zip.files).filter(f=>!f.dir);if(entries.length>4096||entries.reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>MAX_EXPANDED)throw Error('압축 해제한 HWPX 문서가 너무 큽니다.');
    let total=0;async function textFile(name,max=12*1024*1024){const file=zip.file(name);if(!file||(file._data?.uncompressedSize||0)>max)throw Error('HWPX 구성요소를 확인해주세요.');const bytes=await file.async('uint8array');total+=bytes.length;if(bytes.length>max||total>MAX_EXPANDED)throw Error('HWPX 본문 크기가 너무 큽니다.');return new TextDecoder().decode(bytes);}
    if((await textFile('mimetype',100)).trim()!=='application/hwp+zip')throw Error('HWPX 문서 형식이 아닙니다.');const sections=entries.filter(f=>/^Contents\/section\d+\.xml$/i.test(f.name)).sort((a,b)=>Number(a.name.match(/\d+(?=\.xml$)/i)[0])-Number(b.name.match(/\d+(?=\.xml$)/i)[0]));if(!sections.length||sections.length>32)throw Error('HWPX 본문 구성을 확인해주세요.');
    const tables=[],texts=[];for(const section of sections){const parsed=tablesFromXml(xml(await textFile(section.name)));tables.push(...parsed.tables);texts.push(parsed.allText);}return mapFields(tables,texts.join('\n'));
  }
  async function parse(file){if(!file||!file.size||file.size>MAX_FILE||!/\.hwpx?$/i.test(file.name||''))throw Error('100MB 이내 HWP 또는 HWPX 검수보고서를 선택해주세요.');const raw=new Uint8Array(await file.arrayBuffer());if(!raw.length||raw.length>MAX_FILE)throw Error('검수보고서 파일 크기를 확인해주세요.');const result=/\.hwpx$/i.test(file.name)?await readHwpx(raw):await readHwp(raw);return {...result,file};}
  global.DF_QPF_INSPECTION_IMPORT={parse,_test:{records,hwpText,tablesFromRecords,tablesFromXml,mapFields,recordYear,readHwp,readHwpx}};
})(window);
