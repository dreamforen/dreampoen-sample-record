/* DREAMFOREN · original editable-text HWPX contract documents, 2026-09-22. */
(function (global) {
  'use strict';
  const MIME='application/hwp+zip', VERSION='120372500';
  const TEMPLATES={
    contract:{title:'측정대행표준계약서',filename:'측정대행표준계약서.hwpx',path:'assets/contract_docs/templates/standard_contract.hwpx',sha256:'668b60fba93e28d422b56ccdd675ed785ed56f2bb3e60bcbcc9cef982e10232c'},
    plan:{title:'과업수행계획서',filename:'과업수행계획서.hwpx',path:'assets/contract_docs/templates/task_plan.hwpx',sha256:'159c2164ba1afd0d4e3023eb5d2463edc9866fe0c3ef029a1cae9832455d50c4'}
  };
  const cache=new Map();
  const value=v=>v===undefined||v===null?'':String(v);
  const clean=v=>value(v).trim();
  const fail=message=>{throw new Error(message);};
  const local=n=>n.name.split(':').pop();
  const children=(n,name)=>n.children.filter(c=>local(c)===name);
  const first=(n,name)=>children(n,name)[0];
  function descendants(n,name){return n.children.flatMap(c=>(local(c)===name?[c]:[]).concat(descendants(c,name)));}
  function decode(s){return s.replace(/&#x([\da-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v)).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
  function xmlText(s){return value(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r\n?|\n/g,'<hp:lineBreak/>');}
  function attr(n,key){if(!n)return '';const m=n.open.match(new RegExp('\\b'+key+'="([^\"]*)"'));return m?decode(m[1]):'';}
  function parse(xml){
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('외부 XML 선언이 있는 문서는 사용할 수 없습니다.');
    const checked=/xmlns:hp=/.test(xml)?xml:'<check xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">'+xml+'</check>';
    const doc=new global.DOMParser().parseFromString(checked,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)fail('HWPX XML 구조를 읽지 못했습니다. 원본 파일을 다시 배포해 주세요.');
    const root={name:'#document',children:[],start:0,end:xml.length},stack=[root];
    const re=/<(?:!--[\s\S]*?--|\?[^]*?\?|!\[CDATA\[[\s\S]*?\]\]|\/?[\w:.-]+(?:"[^"]*"|'[^']*'|[^'">])*)>/g;let m;
    while((m=re.exec(xml))){const token=m[0];if(/^<\?|^<!/.test(token))continue;if(/^<\//.test(token)){const n=stack.pop();if(!n||n===root)fail('HWPX 태그가 손상되었습니다.');n.closeStart=m.index;n.end=re.lastIndex;continue;}const n={name:token.match(/^<([\w:.-]+)/)[1],open:token,start:m.index,openEnd:re.lastIndex,closeStart:re.lastIndex,end:re.lastIndex,self:/\/\s*>$/.test(token),children:[],parent:stack[stack.length-1]};n.parent.children.push(n);if(!n.self)stack.push(n);}
    if(stack.length!==1)fail('HWPX 태그 경계가 올바르지 않습니다.');return root;
  }
  function textOf(n,xml){return descendants(n,'t').map(t=>decode(xml.slice(t.openEnd,t.closeStart).replace(/<[^>]+>/g,''))).join('');}
  const raw=(n,xml)=>xml.slice(n.start,n.end);
  function applyEdits(xml,edits){edits.sort((a,b)=>b.start-a.start||b.end-a.end);let edge=xml.length+1;for(const e of edits){if(e.end>edge)fail('HWPX 수정 구간이 겹칩니다. 원본을 확인해 주세요.');xml=xml.slice(0,e.start)+e.text+xml.slice(e.end);edge=e.start;}return xml;}
  function editor(xml){
    const tree=parse(xml),edits=[],modified=new Set(),segments=new Map();
    function mark(n){while(n&&local(n)!=='p')n=n.parent;if(n)modified.add(n);}
    function edit(start,end,text){edits.push({start,end,text});}
    function tSegments(n){const out=[];for(const t of descendants(n,'t')){if(t.self)continue;let pos=t.openEnd;for(const c of t.children){if(c.start>pos)out.push({start:pos,end:c.start,node:t});pos=c.end;}if(t.closeStart>pos)out.push({start:pos,end:t.closeStart,node:t});}return out;}
    function replace(n,old,next,expected=1){let count=0;for(const s of tSegments(n)){const original=decode(xml.slice(s.start,s.end));let pos=original.indexOf(old);if(pos<0)continue;const pending=segments.get(s.start)||{...s,original,replacements:[]};while(pos>=0){count++;pending.replacements.push({start:pos,end:pos+old.length,text:value(next)});pos=original.indexOf(old,pos+old.length);}segments.set(s.start,pending);mark(s.node);}if(count!==expected)fail('원본의 입력 위치를 확인하지 못했습니다: '+old);}
    function setText(n,next){const ts=descendants(n,'t');next=value(next);if(ts.length){ts.forEach((t,i)=>{if(t.children.length)fail('혼합 문단은 전체 문자를 교체할 수 없습니다.');if(t.self){edit(t.start,t.end,i?'':t.open.replace(/\/>$/, '>')+xmlText(next)+'</'+t.name+'>');}else{edit(t.openEnd,t.closeStart,i?'':xmlText(next));}mark(t);});return;}
      const p=local(n)==='p'?n:descendants(n,'p')[0];if(!p)fail('빈 입력 문단을 찾지 못했습니다.');const run=first(p,'run');if(!run)fail('입력 문단의 글자모양을 찾지 못했습니다.');if(run.self)edit(run.start,run.end,run.open.replace(/\/>$/, '>')+'<hp:t>'+xmlText(next)+'</hp:t></'+run.name+'>');else edit(run.closeStart,run.closeStart,'<hp:t>'+xmlText(next)+'</hp:t>');mark(p);
    }
    function finish(){for(const s of segments.values())edit(s.start,s.end,xmlText(applyEdits(s.original,s.replacements)));for(const p of modified)for(const ls of children(p,'linesegarray'))edit(ls.start,ls.end,'');return applyEdits(xml,edits);}
    return {xml,tree,edit,replace,setText,invalidate:mark,finish};
  }
  function info(type){const t=TEMPLATES[type];if(!t)fail('지원하지 않는 계약문서입니다.');return {...t,url:new URL(t.path+'?v='+VERSION,global.location?.href||'https://localhost/').href};}
  function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s;}
  function validate(type,data={}){
    const issues=[];if(!TEMPLATES[type])issues.push('지원하지 않는 계약문서입니다.');
    for(const k of ['contract_date','start_date','end_date','signing_date','receipt_date'])if(clean(data[k])&&!validDate(clean(data[k])))issues.push(k+' 날짜를 확인해 주세요.');
    if(clean(data.start_date)&&clean(data.end_date)&&data.start_date>data.end_date)issues.push('완수일은 착수일 이후로 입력해 주세요.');
    if(clean(data.plan_year_month)&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(clean(data.plan_year_month)))issues.push('과업계획서 연월을 확인해 주세요.');
    if(clean(data.contract_amount)&&!/^\d{1,16}$/.test(clean(data.contract_amount).replace(/,/g,'')))issues.push('계약금액은 0 이상의 정수로 입력해 주세요.');
    if(clean(data.duration_months)&&!/^\d{1,4}$/.test(clean(data.duration_months)))issues.push('완수기간은 0 이상의 개월 수로 입력해 주세요.');
    for(const k of ['facilities','equipment'])if(data[k]!==undefined&&(!Array.isArray(data[k])||data[k].length>100))issues.push((k==='facilities'?'시설':'장비')+'은 문서당 100행 이내로 입력해 주세요.');
    if(data.contract_management_required!==undefined&&!['yes','no',''].includes(value(data.contract_management_required)))issues.push('계약관리 대상여부를 확인해 주세요.');
    for(const [k,v] of Object.entries(data))if(typeof v==='string'&&/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))issues.push(k+'에 사용할 수 없는 제어문자가 있습니다.');
    for(const k of ['facilities','equipment'])for(const row of Array.isArray(data[k])?data[k]:[])if(!row||typeof row!=='object'||Array.isArray(row)||Object.values(row).some(v=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value(v))))issues.push('시설·장비 입력값을 확인해 주세요.');
    return {valid:issues.length===0,issues};
  }
  function dateWords(v){const p=clean(v).split('-');return p.length===3?p[0]+' 년   '+p[1]+' 월   '+p[2]+' 일':'    년      월      일';}
  function dateDots(v){return clean(v).replace(/-/g,'. ');}
  function amountDigits(v){return clean(v).replace(/,/g,'');}
  function comma(v){return amountDigits(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
  function koreanAmount(v){let s=amountDigits(v);if(!s)return '';s=s.replace(/^0+(?=\d)/,'');if(s==='0')return '영';const digits='영일이삼사오육칠팔구',small=['','십','백','천'],big=['','만','억','조'];let out='',group=0;while(s){const part=s.slice(-4);s=s.slice(0,-4);let partText='';for(let i=0;i<part.length;i++){const n=+part[i],power=part.length-1-i;if(n)partText+=(n===1&&power?'':digits[n])+small[power];}if(partText)out=partText+big[group]+out;group++;}return out;}
  function months(d){if(clean(d.duration_months)!=='')return clean(d.duration_months);if(!d.start_date||!d.end_date)return '';const s=d.start_date.split('-').map(Number),e=d.end_date.split('-').map(Number);return String((e[0]-s[0])*12+e[1]-s[1]);}
  function addressLines(address){const s=clean(address);if(!s)return ['',''];if(s.includes('\n')){const a=s.split(/\r?\n/);return [a.shift(),a.join(' ')];}let width=0,breakAt=-1;for(let i=0;i<s.length;i++){width+=s.charCodeAt(i)>255?2:1;if(s[i]===' '&&width<=28)breakAt=i;if(width>28){if(breakAt>0)return [s.slice(0,breakAt),s.slice(breakAt+1)];break;}}return [s,''];}
  function findCell(table,row,col){const found=children(table,'tr').flatMap(tr=>children(tr,'tc')).filter(tc=>+attr(first(tc,'cellAddr'),'rowAddr')===row&&+attr(first(tc,'cellAddr'),'colAddr')===col);if(found.length!==1)fail('원본 표의 입력칸을 찾지 못했습니다: '+row+','+col);return found[0];}
  function paragraphs(cell){return children(first(cell,'subList'),'p');}
  function setDate(e,node,old,newDate){const [y,m,d]=clean(newDate).split('-');e.replace(node,old[0],y||'    ');e.replace(node,old[1],m||'  ');e.replace(node,old[2],d||'  ');}
  function contractXml(xml,d){
    const e=editor(xml),tables=descendants(e.tree,'tbl');if(tables.length!==1||attr(tables[0],'rowCnt')!=='16')fail('표준계약서 원본 표 구조가 다릅니다.');const t=tables[0],c=(r,col=0)=>findCell(t,r,col);e.invalidate(t);
    const req=d.contract_management_required===undefined?'yes':d.contract_management_required;e.setText(c(3,1),req==='no'?'여[ ]   부 [√]':req==='yes'?'여[√]   부 [ ]':'여[ ]   부 [ ]');
    e.setText(c(3,2),'접수번호'+(clean(d.receipt_no)?'\n'+clean(d.receipt_no):''));e.setText(c(3,3),'접수일'+(clean(d.receipt_date)?'\n'+dateDots(d.receipt_date):''));e.setText(c(4,1),clean(d.management_agency));
    const p=paragraphs(c(5)),address=addressLines(d.client_address);
    e.replace(p[1],'삼미자동차공업사',clean(d.client_name));e.replace(p[2],'경기도 오산시 경기대로',address[0]);e.replace(p[3],'677-4(내삼미동)',address[1]);e.replace(p[4],'김종국',clean(d.client_representative));e.replace(p[5],'124-48-67032',clean(d.client_biz_no));e.setText(p[7],'    '+clean(d.client_phone));
    e.replace(c(6),'대기자가측정',clean(d.service_name));
    setDate(e,c(7),['2026','09','23'],d.contract_date);e.replace(c(7,2),'27',months(d));
    setDate(e,c(8),['2026','09','23'],d.start_date);setDate(e,c(8,2),['2028','12','31'],d.end_date);
    e.replace(c(9),'경기도 오산시 경기대로 677-4(내삼미동)',clean(d.site_address)||clean(d.client_address));
    let words=clean(d.amount_korean)||koreanAmount(d.contract_amount);words=words.replace(/^금\s*/,'').replace(/원정$|원$|정$/,'');
    e.replace(c(10),'이십오만',words);e.replace(c(10),'250,000',comma(d.contract_amount));e.replace(c(10),'별도',d.vat_mode===undefined?'별도':clean(d.vat_mode));e.replace(c(10),'반기 측정',d.fee_basis===undefined?'반기 측정':clean(d.fee_basis));
    e.setText(c(11),'계약보증금 : '+clean(d.contract_guarantee));e.setText(c(12),'선      금 : '+clean(d.advance_payment));e.setText(c(13),'지체상금률: '+clean(d.penalty_rate));
    const sign=paragraphs(c(14));setDate(e,sign[7],['2026','09','23'],clean(d.signing_date)||clean(d.contract_date));
    e.replace(sign[8],'삼미자동차공업사',clean(d.client_name));e.replace(sign[9],'경기도 오산시 경기대로',address[0]);e.replace(sign[9],'667-4(내삼미동)',address[1]);e.replace(sign[10],'김 종 국',clean(d.client_representative));
    return e.finish();
  }
  function changeAttr(xml,name,value){const re=new RegExp('\\b'+name+'="[^\"]*"');if(!re.test(xml))fail('표 속성을 찾지 못했습니다: '+name);return xml.replace(re,name+'="'+value+'"');}
  function rowTable(table,xml,rows,kind){
    const originalRows=children(table,'tr'),headers=raw(originalRows[0],xml),keys=kind==='facilities'?['emission','prevention','cycle','items','quantity']:['_number','name','maker','model','note'];
    const data=rows.length?rows:[{}],count=data.length,oldCount=originalRows.length-1;
    const templateCells=children(originalRows[1],'tc'),tableHeight=+attr(first(table,'sz'),'height'),firstHeight=+attr(first(templateCells[0],'cellSz'),'height');
    const headerHeight=+attr(first(children(originalRows[0],'tc')[0],'cellSz'),'height');
    const originalHeights=originalRows.slice(1).map(tr=>+attr(first(children(tr,'tc')[0],'cellSz'),'height'));
    const heights=data.map((_,i)=>originalHeights[i]||originalHeights[originalHeights.length-1]||firstHeight);
    const merges={};if(kind==='facilities')for(const col of [2,3]){for(let i=0;i<count;){const v=clean(data[i][keys[col]]);let end=i+1;while(v&&end<count&&clean(data[end][keys[col]])===v)end++;merges[i+':'+col]=end-i;for(let j=i+1;j<end;j++)merges[j+':'+col]=0;i=end;}}
    const rowMarkup=data.map((row,i)=>{
      const cells=[];
      for(let col=0;col<keys.length;col++){
        const span=merges[i+':'+col]===undefined?1:merges[i+':'+col];if(span===0)continue;
        let template=children(originalRows[Math.min(i+1,oldCount)],'tc').find(tc=>+attr(first(tc,'cellAddr'),'colAddr')===col)||templateCells[col];
        if(!template)fail('시설·장비의 원본 칸을 찾지 못했습니다.');
        let x=raw(template,xml),ce=editor(x);ce.setText(ce.tree,keys[col]==='_number'?(rows.length?String(i+1):''):clean(row[keys[col]]));x=ce.finish();
        const ct=parse(x).children[0],patch=[];
        const address=first(ct,'cellAddr'),cellSpan=first(ct,'cellSpan'),sz=first(ct,'cellSz');
        patch.push({start:address.start,end:address.end,text:changeAttr(raw(address,x),'rowAddr',i+1)});
        patch.push({start:cellSpan.start,end:cellSpan.end,text:changeAttr(raw(cellSpan,x),'rowSpan',span)});
        patch.push({start:sz.start,end:sz.end,text:changeAttr(raw(sz,x),'height',heights.slice(i,i+span).reduce((a,b)=>a+b,0))});
        cells.push(applyEdits(x,patch));
      }
      return '<hp:tr>'+cells.join('')+'</hp:tr>';
    }).join('');
    const oldStart=originalRows[0].start-table.start,oldEnd=originalRows[originalRows.length-1].end-table.start;
    let result=raw(table,xml);result=result.slice(0,oldStart)+headers+rowMarkup+result.slice(oldEnd);
    result=changeAttr(result,'rowCnt',count+1);
    const st=parse(result).children[0],sz=first(st,'sz');let height=tableHeight;
    if(count!==oldCount)height=headerHeight+heights.reduce((a,b)=>a+b,0);
    result=applyEdits(result,[{start:sz.start,end:sz.end,text:changeAttr(raw(sz,result),'height',height)}]);
    // Keep the exact two-row source merge/geometry when the data has the same grouping.
    // Larger tables must be allowed to continue across pages without clipping.
    if(count>oldCount)result=result.replace(/\bpageBreak="TABLE"/,'pageBreak="CELL"');
    return result;
  }
  function planXml(xml,d){
    const e=editor(xml),sec=e.tree.children.find(n=>local(n)==='sec'),ps=children(sec,'p'),tables=descendants(e.tree,'tbl');if(ps.length!==108||tables.length!==3)fail('과업수행계획서 원본 구조가 다릅니다.');
    const client=clean(d.client_short_name)||clean(d.client_name);
    // Replace only the named party token. Legal clauses and all surrounding runs stay intact.
    for(const p of ps){const count=textOf(p,xml).split('삼미자동차공업사').length-1;if(count)e.replace(p,'삼미자동차공업사',(p===ps[3]||p===ps[34]||p===ps[39])?clean(d.client_name):client,count);}
    e.replace(ps[3],'대기자가측정 위탁용역',clean(d.service_name));e.replace(ps[28],'대기자가측정 위탁용역',clean(d.service_name));
    e.replace(ps[12],'2026. 09',clean(d.plan_year_month)?clean(d.plan_year_month).replace('-','. '):'');
    e.replace(ps[35],'경기도 오산시 경기대로 677-4(내삼미동)',clean(d.site_address)||clean(d.client_address));
    e.replace(ps[36],'착수일 ∼ 2028. 12. 31',(clean(d.start_date)?dateDots(d.start_date):'착수일')+' ∼ '+dateDots(d.end_date));
    e.replace(ps[44],'측정팀 2인/1조',clean(d.team_text));
    e.replace(ps[73],'반기 측정',d.fee_basis===undefined?'반기 측정':clean(d.fee_basis));e.replace(ps[73],'400,000',comma(d.contract_amount));e.replace(ps[73],'별도',d.vat_mode===undefined?'별도':clean(d.vat_mode));
    e.replace(ps[75],'측정완료 후 성적서 발행 시',d.plan_payment_terms===undefined?'측정완료 후 성적서 발행 시':clean(d.plan_payment_terms));
    e.edit(tables[1].start,tables[1].end,rowTable(tables[1],xml,Array.isArray(d.facilities)?d.facilities:[],'facilities'));
    e.edit(tables[2].start,tables[2].end,rowTable(tables[2],xml,Array.isArray(d.equipment)?d.equipment:[],'equipment'));
    e.invalidate(tables[1]);e.invalidate(tables[2]);
    return e.finish();
  }
  async function hash(bytes){if(!global.crypto?.subtle)fail('원본 확인을 위해 HTTPS에서 열어 주세요.');return Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');}
  async function templateBytes(type){const i=info(type);if(!cache.has(type))cache.set(type,(async()=>{const r=await global.fetch(i.url,{cache:'no-cache'});if(!r.ok)fail('원본 HWPX 파일을 불러오지 못했습니다. 배포 폴더를 확인해 주세요.');return r.arrayBuffer();})().catch(e=>{cache.delete(type);throw e;}));return cache.get(type);}
  async function generate(type,data={},options={}){
    const checked=validate(type,data);if(!checked.valid)fail(checked.issues.join('\n'));
    if(!global.JSZip||!global.DOMParser)fail('HWPX 처리 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    const bytes=options.templateBytes||await templateBytes(type);if(await hash(bytes)!==info(type).sha256)fail('등록된 원본과 HWPX 파일이 다릅니다. 이번 배포의 원본 파일을 함께 올려 주세요.');
    const zip=await global.JSZip.loadAsync(bytes,{checkCRC32:true});if(!zip.file('mimetype')||clean(await zip.file('mimetype').async('string'))!==MIME)fail('HWPX 문서 형식이 아닙니다.');
    const section=await zip.file('Contents/section0.xml').async('string'),generated=type==='contract'?contractXml(section,data):planXml(section,data);parse(generated);
    zip.file('Contents/section0.xml',generated);
    // Old screenshots contain the previous customer's data. Never label them as a generated preview.
    zip.remove('Preview/PrvImage.png');
    let preview='';const tree=parse(generated),ps=descendants(tree,'p');for(const p of ps)if(!descendants(p,'tbl').length)preview+=textOf(p,generated)+'\r\n';zip.file('Preview/PrvText.txt',preview);
    // Source metadata contains the specimen title; use the current party and document title instead.
    const hpf=zip.file('Contents/content.hpf');if(hpf){let meta=await hpf.async('string');const title=xmlText([clean(data.client_name),info(type).title].filter(Boolean).join(' ')).replace(/<hp:lineBreak\/>/g,' ');meta=meta.replace(/<((?:opf|dc):title)(?:\s*\/>|>[\s\S]*?<\/\1>)/,(_,tag)=>'<'+tag+'>'+title+'</'+tag+'>');meta=meta.replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*(<\/opf:meta>)/,(_,a,b)=>a+new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+b);zip.file('Contents/content.hpf',meta);}
    const ordered=new global.JSZip();ordered.file('mimetype',MIME,{compression:'STORE'});for(const [name,file] of Object.entries(zip.files)){if(name==='mimetype'||file.dir)continue;ordered.file(name,await file.async('uint8array'),{binary:true});}
    return ordered.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE',compressionOptions:{level:6}});
  }
  global.DF_CONTRACT_HWPX=Object.freeze({version:VERSION,info,validate,generate});
})(typeof window!=='undefined'?window:globalThis);
