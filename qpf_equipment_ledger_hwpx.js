/* Beta 3.15 · HWPX 장비관리대장: 포함 사진, 병합 셀, 제원 안의 표 */
(function(){'use strict';
 const unit=n=>Number(n||0)*25.4/7200;
 const children=(e,name)=>[...(e?.children||[])].filter(x=>x.localName===name);
 const child=(e,name)=>children(e,name)[0];
 const all=(e,name)=>[...(e?.getElementsByTagNameNS('*',name)||[])];
 const attr=(e,k,f='')=>e?.getAttribute(k)??f;
 const number=(e,k,f=0)=>Number(attr(e,k,f));
 const clean=s=>String(s||'').replace(/[\s·.\-\/]/g,'');
 const ancestor=(e,name)=>{for(let p=e?.parentElement;p;p=p.parentElement)if(p.localName===name)return p;return null;};
 function xml(s){if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('외부 참조가 있는 HWPX 문서는 지원하지 않습니다.');const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('HWPX 문서 구성을 읽지 못했습니다.');return d;}
 function picData(pic){const dim=child(pic,'imgDim'),size=child(pic,'sz'),org=child(pic,'orgSz'),clip=child(pic,'imgClip'),flip=child(pic,'flip');const w=number(dim,'dimwidth')||number(org,'width'),h=number(dim,'dimheight')||number(org,'height'),l=number(clip,'left'),t=number(clip,'top'),r=number(clip,'right',w),b=number(clip,'bottom',h);
  return {kind:'source',bin:attr(child(pic,'img'),'binaryItemIDRef'),angle:number(child(pic,'rotationInfo'),'angle')%360,aspect:number(size,'width')/number(size,'height')||null,crop:w>0&&h>0&&r>l&&b>t?[l/w,t/h,(r-l)/w,(b-t)/h]:[0,0,1,1],flipX:attr(flip,'horizontal')==='1',flipY:attr(flip,'vertical')==='1'};
 }
 function plain(node){if(node.nodeType===3)return node.nodeValue;if(node.nodeType!==1)return '';if(node.localName==='lineBreak')return '\n';if(node.localName==='tab')return '\t';return [...node.childNodes].map(plain).join('');}
 async function parse(file,helpers){
  if(!window.JSZip)throw Error('HWPX 읽기 구성요소를 불러오지 못했습니다. 새로고침해주세요.');
  const raw=new Uint8Array(await file.arrayBuffer());let zip;try{zip=await JSZip.loadAsync(raw);}catch(e){throw Error('HWPX 압축 문서를 읽지 못했습니다. 한글에서 다시 저장해주세요.');}
  const entries=Object.values(zip.files).filter(f=>!f.dir);if(entries.length>2048||entries.reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>180*1024*1024)throw Error('압축 해제한 문서가 너무 큽니다. 한글에서 그림 용량을 줄인 뒤 다시 불러와주세요.');
  async function bytes(name,max=12*1024*1024){const f=zip.file(name);if(!f)throw Error('HWPX 구성요소가 없습니다: '+name);if((f._data?.uncompressedSize||0)>max)throw Error('HWPX 구성요소의 크기가 너무 큽니다.');const data=await f.async('uint8array');if(data.length>max)throw Error('HWPX 구성요소의 크기가 너무 큽니다.');return data;}
  const decode=a=>new TextDecoder().decode(a);
  if(decode(await bytes('mimetype',100)).trim()!=='application/hwp+zip')throw Error('HWPX 문서 형식이 아닙니다.');
  const manifest=xml(decode(await bytes('Contents/content.hpf'))),header=xml(decode(await bytes('Contents/header.xml')));
  const sectionPaths=entries.filter(f=>/^Contents\/section\d+\.xml$/i.test(f.name));if(sectionPaths.length!==1)throw Error('단일 구역의 A4 장비관리대장 HWPX를 선택해주세요.');
  const section=xml(decode(await bytes(sectionPaths[0].name))),borders=new Map(),chars=new Map(),paras=new Map();
  for(const b of all(header,'borderFill'))borders.set(attr(b,'id'),{edges:['left','right','top','bottom'].map(side=>{const e=child(b,side+'Border'),type=attr(e,'type');return {kind:type==='NONE'?'none':type.includes('DOUBLE')?'double':type.includes('DOT')?'dotted':type.includes('DASH')?'dashed':'solid',width:parseFloat(attr(e,'width','.1'))||.1,color:attr(e,'color','#000000')};}),background:attr(all(b,'winBrush')[0],'faceColor','#ffffff')});
  for(const c of all(header,'charPr'))chars.set(attr(c,'id'),{font:Math.max(5,Math.min(28,number(c,'height',900)/100)),bold:!!child(c,'bold'),color:attr(c,'textColor','#000000')});
  for(const p of all(header,'paraPr'))paras.set(attr(p,'id'),{align:attr(child(p,'align'),'horizontal','CENTER').toLowerCase()});
  const directCells=t=>children(t,'tr').flatMap(tr=>children(tr,'tc'));
  function paragraphs(tc){return children(child(tc,'subList'),'p');}
  function cellText(tc){return paragraphs(tc).map(p=>all(p,'t').filter(t=>ancestor(t,'tc')===tc).map(plain).join('')).join('\n').trim().replace(/\uf09e/g,'·');}
  function richBlocks(tc,depth=0){if(depth>3)throw Error('제원 안의 표가 너무 깊게 중첩되어 있습니다.');const blocks=[];for(const p of paragraphs(tc)){let text='';for(const run of children(p,'run'))for(const n of run.children){if(n.localName==='t')text+=plain(n);if(n.localName==='tbl'){if(text)blocks.push({kind:'text',text});text='';blocks.push({kind:'table',rows:children(n,'tr').map(tr=>children(tr,'tc').map(c=>({text:cellText(c),cs:number(child(c,'cellSpan'),'colSpan',1),rs:number(child(c,'cellSpan'),'rowSpan',1),width:unit(number(child(c,'cellSz'),'width'))})))});}}blocks.push({kind:'text',text});}return blocks;}
  function table(t){const cells=directCells(t).map(tc=>{const addr=child(tc,'cellAddr'),span=child(tc,'cellSpan'),size=child(tc,'cellSz'),ps=paragraphs(tc),run=ps.flatMap(p=>children(p,'run')).find(r=>all(r,'t').some(t=>plain(t).trim())),p=run?.parentElement||ps[0];let h=unit(number(size,'height'));
    if(!h){const lines=ps.flatMap(p=>all(child(p,'linesegarray'),'lineseg'));h=unit(Math.max(0,...lines.map(l=>number(l,'vertpos')+number(l,'vertsize')))+282);}
    const pictures=all(tc,'pic').filter(pic=>ancestor(pic,'tc')===tc);if(pictures.length>1)throw Error('한 칸에 여러 장의 그림이 겹쳐 있습니다. 한글에서 사진 칸을 나눈 뒤 불러와주세요.');
    const style={...borders.get(attr(tc,'borderFillIDRef')),...chars.get(attr(run,'charPrIDRef')),...paras.get(attr(p,'paraPrIDRef')),lineHeight:1.05};
    const c={r:number(addr,'rowAddr'),c:number(addr,'colAddr'),rs:number(span,'rowSpan',1),cs:number(span,'colSpan',1),w:unit(number(size,'width')),h,text:cellText(tc),style,picture:pictures[0]?picData(pictures[0]):null};
    if(all(tc,'tbl').length){c.rich=richBlocks(tc);c.text=c.rich.map(b=>b.kind==='table'?b.rows.map(row=>row.map(v=>v.text).join('\t')).join('\n'):b.text).join('\n').trim();}
    c.spacer=!c.text&&!c.picture&&!(style.edges||[]).some(e=>e.kind!=='none');return c;
   });return {level:0,rows:number(t,'rowCnt'),cols:number(t,'colCnt'),cells,origin:{x:unit(number(child(t,'pos'),'horzOffset')),y:unit(number(child(t,'pos'),'vertOffset'))}};}
  const topTables=all(section,'tbl').filter(t=>!ancestor(t,'tbl'));
  const source=topTables.find(t=>directCells(t).some(c=>clean(cellText(c))==='장비관리대장'));
  if(!source)throw Error('DFEN-QPF-13-01 장비관리대장 양식을 확인해주세요.');
  const main=table(source),tables=[main];
  for(const t of topTables.slice(topTables.indexOf(source)+1)){if(!directCells(t).some(c=>cellText(c).includes('DFEN-QPF-13-01')))tables.push(table(t));}
  const grid=helpers.joinTables(main,tables),fields=helpers.fieldMap(grid.cells);
  if(Object.keys(fields).length!==12)throw Error('장비명·관리번호·검교정일 등 필수 칸을 찾지 못했습니다.');
  const manifestItems=new Map(all(manifest,'item').map(i=>[attr(i,'id'),i])),pictures=new Map();let total=0;
  for(const bin of new Set(grid.cells.filter(c=>c.picture).map(c=>c.picture.bin))){const item=manifestItems.get(bin),href=attr(item,'href').replace(/^\.\//,'');if(!/^BinData\/[\w .-]+$/i.test(href))throw Error('문서 내부에 포함된 장비 사진만 사용할 수 있습니다.');const a=await bytes(href,100*1024*1024);total+=a.length;if(total>120*1024*1024)throw Error('문서 안의 사진 용량이 너무 큽니다.');pictures.set(bin,new Blob([a],{type:helpers.pictureType(a)}));}
  const footerTable=topTables.find(t=>directCells(t).some(c=>cellText(c).includes('DFEN-QPF-13-01'))),footer=footerTable?directCells(footerTable).map(cellText).filter(Boolean):['DFEN-QPF-13-01','Rev. 00','- 주식회사 드림포이엔 -','A4(210×297mm)'];
  const doc={schema:1,page:{width:210,height:297,left:13,top:15.4},table:{rows:grid.rows,cols:grid.cols,xs:grid.xs,ys:grid.ys,cells:grid.cells},fields,footer};
  if(grid.xs.at(-1)>190||grid.ys.at(-1)>264)throw Error('A4 한 페이지 범위를 벗어나는 양식입니다.');
  return {doc,pictures,raw,file,code:grid.cells[fields.equipment_code].text.trim().toUpperCase()};
 }
 window.DF_EQ_LEDGER_HWPX={parse};
})();
