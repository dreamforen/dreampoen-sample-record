/* Original cumulative Excel: inspect native geometry and patch only requested cell values.
 * inspect() -> {sourceUrl,sheets:[{name,path,dimension,columns,rowHeights,merges,cells,rows}]}.
 * generate({sheetName:{A5:value}}) or generate({cells:{sheetName:{A5:value}},
 * appendRows:{sheetName:[[A,B,C,D,E,F,G], ...]},
 * newSheets:[{name,template:'11월',title,rows:[[A,B,C,D,E,F,G], ...]}]}) -> Promise<Blob>.
 * Existing cells, monthly sheets, fonts, merges, printer parts and relationships remain intact.
 */
(function(root){
  'use strict';
  const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XML='http://www.w3.org/XML/1998/namespace';
  const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const SOURCE='assets/contract_docs/originals/contract_status.xlsx';
  const MAX_ROWS=10000;
  let pending=null;
  const fail=message=>{throw new Error(message);};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const attrs=element=>element?Object.fromEntries(Array.from(element.attributes).map(a=>[a.localName,a.value])):{};
  const children=(element,name)=>element?Array.from(element.children).filter(n=>n.localName===name):[];
  const child=(element,name)=>children(element,name)[0]||null;
  const descendants=(element,name)=>element?Array.from(element.getElementsByTagNameNS(NS,name)):[];
  function parse(value){const doc=new root.DOMParser().parseFromString(value,'application/xml');if(doc.getElementsByTagName('parsererror').length)fail('원본 Excel XML을 읽지 못했습니다.');return doc;}
  function pathFrom(base,relative){
    if(!relative||relative.startsWith('/')||relative.includes('://'))fail('원본 Excel의 연결 경로를 확인해주세요.');
    const parts=base.split('/').slice(0,-1);for(const part of relative.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}return parts.join('/');
  }
  const textOf=node=>descendants(node,'t').map(n=>n.textContent||'').join('');
  const letter=n=>{let out='';while(n){out=String.fromCharCode(65+(n-1)%26)+out;n=Math.floor((n-1)/26);}return out;};
  function coordinate(address){const m=String(address).match(/^([A-Z]{1,3})([1-9]\d*)$/);if(!m)fail('Excel 셀 주소를 확인해주세요: '+address);let column=0;for(const c of m[1])column=column*26+c.charCodeAt(0)-64;return {column,row:Number(m[2]),address:m[0]};}
  function font(node){
    const color=attrs(child(node,'color'));
    return {name:child(node,'name')?.getAttribute('val')||'',size:Number(child(node,'sz')?.getAttribute('val')||11),bold:!!child(node,'b'),italic:!!child(node,'i'),underline:!!child(node,'u'),color,family:child(node,'family')?.getAttribute('val')||'',scheme:child(node,'scheme')?.getAttribute('val')||''};
  }
  function styleTable(document){
    const main=document.documentElement,fonts=children(child(main,'fonts'),'font').map(font),fills=children(child(main,'fills'),'fill').map(n=>{const pattern=child(n,'patternFill');return {patternType:pattern?.getAttribute('patternType')||'',fgColor:attrs(child(pattern,'fgColor')),bgColor:attrs(child(pattern,'bgColor'))};});
    const borders=children(child(main,'borders'),'border').map(n=>Object.fromEntries(['left','right','top','bottom','diagonal'].map(side=>{const x=child(n,side);return [side,{style:x?.getAttribute('style')||'',color:attrs(child(x,'color'))}];})));
    const formats=Object.fromEntries(children(child(main,'numFmts'),'numFmt').map(n=>[n.getAttribute('numFmtId'),n.getAttribute('formatCode')]));
    return children(child(main,'cellXfs'),'xf').map(n=>({font:fonts[Number(n.getAttribute('fontId')||0)]||{},fill:fills[Number(n.getAttribute('fillId')||0)]||{},border:borders[Number(n.getAttribute('borderId')||0)]||{},alignment:attrs(child(n,'alignment')),numFmt:formats[n.getAttribute('numFmtId')]||'',numFmtId:Number(n.getAttribute('numFmtId')||0),protection:attrs(child(n,'protection'))}));
  }
  function valueOf(cell,strings){
    const type=cell.getAttribute('t')||'n',v=child(cell,'v')?.textContent;
    if(type==='s')return strings[Number(v)]??'';
    if(type==='inlineStr')return textOf(child(cell,'is'));
    if(type==='b')return v==='1';
    if(v===undefined||v===null||v==='')return null;
    if(type==='n'){const n=Number(v);return Number.isFinite(n)?n:v;}
    return v;
  }
  async function source(){
    if(pending)return pending;
    pending=(async()=>{
      if(!root.JSZip||!root.DOMParser||!root.XMLSerializer)fail('Excel 처리 구성요소를 불러오지 못했습니다. 새로고침해주세요.');
      const sourceUrl=new URL(SOURCE,root.location.href).href,response=await root.fetch(sourceUrl);
      if(!response.ok)fail('원본 계약체결 현황을 불러오지 못했습니다. ('+response.status+')');
      const bytes=new Uint8Array(await response.arrayBuffer()),zip=await root.JSZip.loadAsync(bytes,{checkCRC32:true});
      const read=async path=>{const file=zip.file(path);if(!file)fail('원본 Excel 구성요소가 없습니다: '+path);return parse(await file.async('string'));};
      const workbook=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');
      const relation=new Map(Array.from(rels.documentElement.children).map(n=>[n.getAttribute('Id'),n]));
      const styles=styleTable(await read('xl/styles.xml')),shared=zip.file('xl/sharedStrings.xml'),strings=shared?descendants(parse(await shared.async('string')),'si').map(textOf):[];
      const sheets=[];
      for(const sheet of descendants(workbook,'sheet')){
        const link=relation.get(sheet.getAttributeNS(REL,'id'));if(!link||link.getAttribute('TargetMode')==='External')fail('원본 Excel 시트 연결을 확인해주세요.');
        const path=pathFrom('xl/workbook.xml',link.getAttribute('Target')),document=await read(path),main=document.documentElement,format=child(main,'sheetFormatPr');
        const merges=descendants(main,'mergeCell').map(n=>n.getAttribute('ref')),columns=descendants(main,'col').map(n=>({min:Number(n.getAttribute('min')),max:Number(n.getAttribute('max')),width:Number(n.getAttribute('width')||format?.getAttribute('defaultColWidth')||8.43),hidden:n.getAttribute('hidden')==='1',attributes:attrs(n)}));
        const rows=children(child(main,'sheetData'),'row').map(n=>{
          const cells=children(n,'c').map(c=>{const styleId=Number(c.getAttribute('s')||0),style=styles[styleId]||{};return {address:c.getAttribute('r'),value:valueOf(c,strings),type:c.getAttribute('t')||'n',styleId,formula:child(c,'f')?.textContent??null,...copy(style)};});
          return {number:Number(n.getAttribute('r')),height:Number(n.getAttribute('ht')||format?.getAttribute('defaultRowHeight')||15),hidden:n.getAttribute('hidden')==='1',attributes:attrs(n),cells};
        });
        sheets.push({name:sheet.getAttribute('name'),path,dimension:child(main,'dimension')?.getAttribute('ref')||'',columns,defaultColumnWidth:Number(format?.getAttribute('defaultColWidth')||8.43),defaultRowHeight:Number(format?.getAttribute('defaultRowHeight')||15),rowHeights:Object.fromEntries(rows.map(r=>[r.number,r.height])),merges,rows,cells:rows.flatMap(r=>r.cells),pageSetup:attrs(child(main,'pageSetup')),pageMargins:attrs(child(main,'pageMargins')),sheetFormat:attrs(format)});
      }
      return {bytes,zip,sheets,sourceUrl};
    })().catch(error=>{pending=null;throw error;});
    return pending;
  }
  async function inspect(){const data=await source();return copy({sourceUrl:data.sourceUrl,sheets:data.sheets});}
  function removeValue(cell){for(const n of Array.from(cell.children))if(['v','is','f'].includes(n.localName))cell.removeChild(n);cell.removeAttribute('t');}
  function setValue(document,cell,value){
    removeValue(cell);
    if(value===null||value===undefined||value==='')return;
    if(typeof value==='number'){
      if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)fail('Excel 숫자 범위를 확인해주세요.');
      cell.setAttribute('t','n');const v=document.createElementNS(NS,'v');v.textContent=String(value);cell.appendChild(v);return;
    }
    if(typeof value==='boolean'){cell.setAttribute('t','b');const v=document.createElementNS(NS,'v');v.textContent=value?'1':'0';cell.appendChild(v);return;}
    if(typeof value!=='string')fail('Excel에는 글자·숫자·빈 값만 입력할 수 있습니다.');
    if(value.length>32767)fail('Excel 셀에는 32,767자까지 입력할 수 있습니다.');
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value)||Array.from(value).some(c=>{const n=c.codePointAt(0);return n>=0xd800&&n<=0xdfff;}))fail('Excel에 사용할 수 없는 문자가 있습니다.');
    // Literal text, including leading =/+/-/@, never becomes a formula.
    cell.setAttribute('t','inlineStr');const inline=document.createElementNS(NS,'is'),text=document.createElementNS(NS,'t');text.setAttributeNS(XML,'xml:space','preserve');text.textContent=value;inline.appendChild(text);cell.appendChild(inline);
  }
  function recordValues(record){
    if(Array.isArray(record)){if(record.length>7)fail('계약체결 현황은 A~G의 일곱 열로 입력해주세요.');return record;}
    if(!record||typeof record!=='object')fail('추가할 계약 행의 형식을 확인해주세요.');
    return ['A','B','C','D','E','F','G'].map(key=>record[key]??null);
  }
  function appendNativeRow(document,body,template,number,values){
    const row=template.cloneNode(true);row.setAttribute('r',String(number));
    for(const cell of children(row,'c')){const c=coordinate(cell.getAttribute('r'));cell.setAttribute('r',letter(c.column)+number);removeValue(cell);}
    for(let column=1;column<=7;column++){
      let cell=children(row,'c').find(n=>coordinate(n.getAttribute('r')).column===column);
      if(!cell){cell=document.createElementNS(NS,'c');cell.setAttribute('r',letter(column)+number);row.appendChild(cell);}
      setValue(document,cell,values[column-1]);
    }
    body.appendChild(row);return row;
  }
  function expandedPrintArea(value,before,after){
    if(after<=before)return value;
    return value.replace(/(\$?[A-Z]{1,3}\$?)(\d+)(?=\s*(?:,|$))/g,(all,column,row)=>Number(row)===before?column+after:all);
  }
  async function extendPrintArea(zip,name,before,after){
    if(after<=before)return;
    const file=zip.file('xl/workbook.xml');if(!file)return;
    const document=parse(await file.async('string')),index=descendants(document,'sheet').findIndex(s=>s.getAttribute('name')===name),definitions=child(document.documentElement,'definedNames');
    let changed=false;
    for(const definition of children(definitions,'definedName'))if(definition.hasAttribute('localSheetId')&&Number(definition.getAttribute('localSheetId'))===index&&definition.getAttribute('name')==='_xlnm.Print_Area'){
      const next=expandedPrintArea(definition.textContent,before,after);if(next!==definition.textContent){definition.textContent=next;changed=true;}
    }
    if(changed)zip.file('xl/workbook.xml',new root.XMLSerializer().serializeToString(document),{createFolders:false});
  }
  async function createSheets(zip,data,requests,sheets,modified){
    const read=async path=>{const file=zip.file(path);if(!file)fail('원본 Excel 구성요소가 없습니다: '+path);return parse(await file.async('string'));};
    const workbook=await read('xl/workbook.xml'),relations=await read('xl/_rels/workbook.xml.rels'),types=await read('[Content_Types].xml');
    const nativeSheets=descendants(workbook,'sheet'),sheetList=child(workbook.documentElement,'sheets'),existingNames=new Set(nativeSheets.map(n=>(n.getAttribute('name')||'').normalize('NFC').toLowerCase()));
    let sheetId=Math.max(...nativeSheets.map(n=>Number(n.getAttribute('sheetId'))||0),0);
    const usedRelations=new Set(Array.from(relations.documentElement.children).map(n=>n.getAttribute('Id')));
    let relationId=1,pathId=1;
    const addedNames=[];
    for(const request of requests){
      if(!request||typeof request!=='object'||Array.isArray(request))fail('새 월별 시트의 형식을 확인해주세요.');
      const name=String(request.name??'').trim().normalize('NFC');
      if(!name||name.length>31||/[\\/?:*\[\]\u0000-\u001f]/.test(name)||name.startsWith("'")||name.endsWith("'"))fail('월별 시트 이름은 31자 이내이며 \\ / ? : * [ ] 문자를 사용할 수 없습니다.');
      if(existingNames.has(name.toLowerCase()))fail('같은 이름의 월별 시트가 이미 있습니다: '+name);
      const template=data.sheets.find(s=>s.name===String(request.template||'11월'));
      if(!template)fail('복사할 원본 월별 시트를 확인해주세요.');
      const records=request.rows||[];if(!Array.isArray(records)||records.length>MAX_ROWS-4)fail('새 월별 시트의 계약 행 수를 확인해주세요.');
      if(typeof request.title!=='string'||!request.title.trim())fail('새 월별 시트의 제목을 입력해주세요.');
      const document=await read(template.path),main=document.documentElement,body=child(main,'sheetData');
      if(!body)fail('복사할 원본 데이터 영역을 찾지 못했습니다.');
      const rows=children(body,'row'),last=Math.max(...rows.map(n=>Number(n.getAttribute('r'))),15),rowTemplate=rows.find(n=>Number(n.getAttribute('r'))===last);
      for(const row of rows)if(Number(row.getAttribute('r'))>=5&&Number(row.getAttribute('r'))<=15)for(const cell of children(row,'c'))if(coordinate(cell.getAttribute('r')).column<=7)removeValue(cell);
      const title=rows.flatMap(row=>children(row,'c')).find(c=>c.getAttribute('r')==='A1');if(!title)fail('원본 월별 제목 셀을 찾지 못했습니다.');setValue(document,title,request.title);
      let max=last;
      for(let i=0;i<records.length;i++){
        const values=recordValues(records[i]),number=5+i;
        if(number>last){appendNativeRow(document,body,rowTemplate,number,values);max=number;continue;}
        const row=rows.find(n=>Number(n.getAttribute('r'))===number);if(!row)fail('원본 입력 행을 찾지 못했습니다.');
        for(let c=1;c<=7;c++){
          let cell=children(row,'c').find(n=>coordinate(n.getAttribute('r')).column===c);
          if(!cell){cell=document.createElementNS(NS,'c');cell.setAttribute('r',letter(c)+number);const after=children(row,'c').find(n=>coordinate(n.getAttribute('r')).column>c);row.insertBefore(cell,after||null);}
          setValue(document,cell,values[c-1]);
        }
      }
      if(max>last)child(main,'dimension')?.setAttribute('ref','A1:G'+max);
      while(zip.file('xl/worksheets/sheet'+pathId+'.xml'))pathId++;
      const newPath='xl/worksheets/sheet'+pathId+'.xml';pathId++;
      zip.file(newPath,new root.XMLSerializer().serializeToString(document),{createFolders:false});modified.push(newPath);
      const oldRel=template.path.replace(/([^/]+)$/,'_rels/$1.rels'),newRel=newPath.replace(/([^/]+)$/,'_rels/$1.rels');
      if(zip.file(oldRel))zip.file(newRel,await zip.file(oldRel).async('uint8array'),{createFolders:false});
      while(usedRelations.has('rId'+relationId))relationId++;const rid='rId'+relationId++;usedRelations.add(rid);
      const nativeSheet=workbook.createElementNS(NS,'sheet');nativeSheet.setAttribute('name',name);nativeSheet.setAttribute('sheetId',String(++sheetId));nativeSheet.setAttributeNS(REL,'r:id',rid);sheetList.appendChild(nativeSheet);
      const relation=relations.createElementNS(relations.documentElement.namespaceURI,'Relationship');relation.setAttribute('Id',rid);relation.setAttribute('Type',REL+'/worksheet');relation.setAttribute('Target',newPath.replace(/^xl\//,''));relations.documentElement.appendChild(relation);
      const override=types.createElementNS(types.documentElement.namespaceURI,'Override');override.setAttribute('PartName','/'+newPath);override.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');types.documentElement.appendChild(override);
      // Preserve any source print area/title definitions by cloning only the
      // new sheet's local names; existing definitions remain unchanged.
      const definitions=child(workbook.documentElement,'definedNames'),templateIndex=data.sheets.indexOf(template),newIndex=descendants(workbook,'sheet').length-1;
      if(definitions)for(const definition of children(definitions,'definedName').slice())if(definition.hasAttribute('localSheetId')&&Number(definition.getAttribute('localSheetId'))===templateIndex&&['_xlnm.Print_Area','_xlnm.Print_Titles'].includes(definition.getAttribute('name'))){
        const clone=definition.cloneNode(true),oldQuoted="'"+template.name.replace(/'/g,"''")+"'!",newQuoted="'"+name.replace(/'/g,"''")+"'!";
        clone.setAttribute('localSheetId',String(newIndex));clone.textContent=clone.textContent.split(oldQuoted).join(newQuoted).split(template.name+'!').join(newQuoted);if(clone.getAttribute('name')==='_xlnm.Print_Area')clone.textContent=expandedPrintArea(clone.textContent,last,max);definitions.appendChild(clone);
      }
      existingNames.add(name.toLowerCase());sheets.push({...template,name,path:newPath});addedNames.push(name);
    }
    for(const [path,document] of [['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',relations],['[Content_Types].xml',types]])zip.file(path,new root.XMLSerializer().serializeToString(document),{createFolders:false});
    if(zip.file('docProps/app.xml')){
      const app=await read('docProps/app.xml'),main=app.documentElement,all=Array.from(main.children),heading=all.find(n=>n.localName==='HeadingPairs'),titles=all.find(n=>n.localName==='TitlesOfParts');
      const variants=heading?Array.from(heading.getElementsByTagName('*')).filter(n=>n.localName==='variant'):[];
      for(let i=0;i<variants.length-1;i++)if(Array.from(variants[i].getElementsByTagName('*')).some(n=>n.localName==='lpstr'&&n.textContent==='Worksheets')){const count=Array.from(variants[i+1].getElementsByTagName('*')).find(n=>n.localName==='i4');if(count)count.textContent=String(Number(count.textContent||0)+addedNames.length);}
      const vector=titles?Array.from(titles.children).find(n=>n.localName==='vector'):null;
      if(vector){const example=Array.from(vector.children).find(n=>n.localName==='lpstr');for(const name of addedNames){const title=app.createElementNS(example?.namespaceURI||'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes','vt:lpstr');title.textContent=name;vector.appendChild(title);}vector.setAttribute('size',String(vector.children.length));}
      zip.file('docProps/app.xml',new root.XMLSerializer().serializeToString(app),{createFolders:false});
    }
  }
  async function generate(changes={}){
    const data=await source();if(!changes||typeof changes!=='object'||Array.isArray(changes))fail('Excel 변경자료 형식을 확인해주세요.');
    const structured=Object.prototype.hasOwnProperty.call(changes,'cells')||Object.prototype.hasOwnProperty.call(changes,'appendRows')||Object.prototype.hasOwnProperty.call(changes,'newSheets');
    const cells=structured?(changes.cells||{}):changes,appendRows=structured?(changes.appendRows||{}):{},newSheets=structured?(changes.newSheets||[]):[];
    if(!Array.isArray(newSheets)||newSheets.length>120)fail('새 월별 시트는 한 번에 120개까지 추가할 수 있습니다.');
    for(const input of [cells,appendRows])if(!input||typeof input!=='object'||Array.isArray(input))fail('Excel 변경자료 형식을 확인해주세요.');
    const names=new Set([...Object.keys(cells),...Object.keys(appendRows)]);if(!names.size&&!newSheets.length)return new root.Blob([data.bytes],{type:MIME});
    const zip=await root.JSZip.loadAsync(data.bytes,{checkCRC32:true}),modified=[],sheets=data.sheets.slice();
    if(newSheets.length)await createSheets(zip,data,newSheets,sheets,modified);
    for(const name of names){
      const sheet=sheets.find(s=>s.name===name);if(!sheet)fail('원본 Excel에 없는 월입니다: '+name);
      const patch=cells[name]||{},addition=appendRows[name]||[];
      if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Array.isArray(addition))fail('Excel 셀·추가 행의 형식을 확인해주세요.');
      if(!Object.keys(patch).length&&!addition.length)continue;
      const document=parse(await zip.file(sheet.path).async('string')),main=document.documentElement,body=child(main,'sheetData');
      if(!body)fail('원본 Excel 데이터 영역을 찾지 못했습니다.');
      let existing=children(body,'row'),last=Math.max(...existing.map(n=>Number(n.getAttribute('r'))),0),max=last;
      if(last+addition.length>MAX_ROWS)fail('한 월은 '+MAX_ROWS.toLocaleString('ko-KR')+'행까지 입력할 수 있습니다.');
      const template=existing.find(n=>Number(n.getAttribute('r'))===last);if(addition.length&&!template)fail('추가 행의 원본 서식을 찾지 못했습니다.');
      for(const record of addition){
        const values=recordValues(record),row=template.cloneNode(true),number=++max;
        row.setAttribute('r',String(number));
        for(const cell of children(row,'c')){const c=coordinate(cell.getAttribute('r'));cell.setAttribute('r',letter(c.column)+number);removeValue(cell);}
        for(let column=1;column<=7;column++){
          let cell=children(row,'c').find(n=>coordinate(n.getAttribute('r')).column===column);
          if(!cell){cell=document.createElementNS(NS,'c');cell.setAttribute('r',letter(column)+number);row.appendChild(cell);}
          setValue(document,cell,values[column-1]);
        }
        body.appendChild(row);
      }
      existing=children(body,'row');
      for(const [address,value] of Object.entries(patch)){
        const point=coordinate(address);if(point.column>7||point.row>max)fail('원본 또는 추가된 A~G 범위 안에서 입력해주세요: '+address);
        let row=existing.find(n=>Number(n.getAttribute('r'))===point.row);
        if(!row){row=document.createElementNS(NS,'row');row.setAttribute('r',String(point.row));const after=existing.find(n=>Number(n.getAttribute('r'))>point.row);body.insertBefore(row,after||null);existing=children(body,'row');}
        let cell=children(row,'c').find(n=>n.getAttribute('r')===point.address);
        if(!cell){cell=document.createElementNS(NS,'c');cell.setAttribute('r',point.address);const after=children(row,'c').find(n=>coordinate(n.getAttribute('r')).column>point.column);row.insertBefore(cell,after||null);}
        setValue(document,cell,value);
      }
      if(max>last){const dimension=child(main,'dimension');if(dimension)dimension.setAttribute('ref','A1:G'+max);await extendPrintArea(zip,name,last,max);}
      zip.file(sheet.path,new root.XMLSerializer().serializeToString(document),{createFolders:false});modified.push(sheet.path);
    }
    if(!modified.length)return new root.Blob([data.bytes],{type:MIME});
    const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
    return new root.Blob([bytes],{type:MIME});
  }
  root.DFContractOriginalExcel={inspect,generate,sourcePath:SOURCE};
})(window);
