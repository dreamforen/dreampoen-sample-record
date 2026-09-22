/* DREAMFOREN measurement-report branding. Original text, table geometry and source images are preserved. */
(function(global){
'use strict';
const VERSION='120373000',BASE='assets/report_branding/',MIME='application/hwp+zip',WM_MARK='DF_REPORT_BRANDING_WATERMARK_V1',SEAL_MARK='DF_REPORT_BRANDING_SEAL_V1';
const cache=new Map(),value=v=>v==null?'':String(v),clean=v=>value(v).trim(),fail=m=>{throw new Error(m);};
const local=n=>n.name.split(':').pop(),children=(n,name)=>(n?.children||[]).filter(c=>local(c)===name),first=(n,name)=>children(n,name)[0];
function desc(n,name){return (n?.children||[]).flatMap(c=>(local(c)===name?[c]:[]).concat(desc(c,name)));}
function decode(s){return s.replace(/&#x([\da-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v)).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
const escape=s=>value(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function attr(n,key){const m=n?.open.match(new RegExp('\\b'+key+'="([^\"]*)"'));return m?decode(m[1]):'';}
function setAttr(open,key,v){const re=new RegExp('\\b'+key+'="[^\"]*"');return re.test(open)?open.replace(re,key+'="'+escape(v)+'"'):open.replace(/(\/?>)$/,' '+key+'="'+escape(v)+'"$1');}
function parse(xml){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('외부 XML 선언이 있는 HWPX는 처리할 수 없습니다.');
 const checked=/xmlns:hp=/.test(xml)?xml:'<check xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">'+xml+'</check>';
 const doc=new global.DOMParser().parseFromString(checked,'application/xml');if(doc.getElementsByTagName('parsererror').length)fail('HWPX XML 구조가 올바르지 않습니다.');
 const root={name:'#document',children:[],start:0,end:xml.length},stack=[root];const re=/<(?:!--[\s\S]*?--|\?[^]*?\?|!\[CDATA\[[\s\S]*?\]\]|\/?[\w:.-]+(?:"[^"]*"|'[^']*'|[^'">])*)>/g;let m;
 while((m=re.exec(xml))){const token=m[0];if(/^<\?|^<!/.test(token))continue;if(/^<\//.test(token)){const n=stack.pop();if(!n||n===root)fail('HWPX 태그가 손상되었습니다.');n.closeStart=m.index;n.end=re.lastIndex;continue;}const n={name:token.match(/^<([\w:.-]+)/)[1],open:token,start:m.index,openEnd:re.lastIndex,closeStart:re.lastIndex,end:re.lastIndex,self:/\/\s*>$/.test(token),children:[],parent:stack[stack.length-1]};n.parent.children.push(n);if(!n.self)stack.push(n);}if(stack.length!==1)fail('HWPX 태그 경계를 확인하지 못했습니다.');return root;
}
const raw=(n,xml)=>n?xml.slice(n.start,n.end):'',textOf=(n,xml)=>desc(n,'t').map(t=>decode(xml.slice(t.openEnd,t.closeStart).replace(/<[^>]*>/g,''))).join(''),compact=s=>s.replace(/\s/g,'');
function edit(xml,patches){patches.sort((a,b)=>b.start-a.start||b.end-a.end);let edge=xml.length+1;for(const p of patches){if(p.end>edge)fail('HWPX 수정 범위가 겹칩니다.');xml=xml.slice(0,p.start)+p.text+xml.slice(p.end);edge=p.start;}return xml;}
const patch=(n,text)=>({start:n.start,end:n.end,text});
function ancestors(n,name){const a=[];for(let p=n.parent;p;p=p.parent)if(local(p)===name)a.push(p);return a;}
function footerOf(table,xml){
 const cells=children(table,'tr').flatMap(r=>children(r,'tc'));const found=cells.filter(c=>{const s=compact(textOf(c,xml));return s.includes('드림포이엔')&&s.includes('대표자성명')&&s.includes('측정분석결과를사실대로')&&s.includes('서명또는인');});
 if(found.length!==1)return null;const cell=found[0],ps=children(first(cell,'subList'),'p'),signature=ps.filter(p=>compact(textOf(p,xml)).includes('서명또는인'));
 if(signature.length!==1)return null;return {table,cell,signature:signature[0]};
}
function reportPages(tree,xml){return desc(tree,'tbl').map(t=>footerOf(t,xml)).filter(Boolean);}
async function bytes(input){if(input&&typeof input.arrayBuffer==='function')return new Uint8Array(await input.arrayBuffer());if(input instanceof ArrayBuffer)return new Uint8Array(input);if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);fail('HWPX 파일을 읽지 못했습니다.');}
async function hash(input){return Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',await bytes(input)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
async function loadAsset(name,options={}){const key=BASE+name;if(options.assetLoader)return bytes(await options.assetLoader(key));if(!cache.has(key))cache.set(key,(async()=>{const r=await global.fetch(new URL(key+'?v='+VERSION,global.location?.href||'https://localhost/').href,{cache:'no-cache'});if(!r.ok)fail('성적서 공통 워터마크·직인 파일을 불러오지 못했습니다. 배포 파일을 확인해 주세요.');return new Uint8Array(await r.arrayBuffer());})().catch(e=>{cache.delete(key);throw e;}));return cache.get(key);}
async function assets(options={}){const decodeBytes=x=>new TextDecoder().decode(x);const manifest=JSON.parse(decodeBytes(await loadAsset('manifest.json',options)));const [watermark,seal,master,header,sealPicture]=await Promise.all([manifest.watermark.file,manifest.seal.file,manifest.masterpage,manifest.header,manifest.seal_picture].map(n=>loadAsset(n,options)));if(await hash(watermark)!==manifest.watermark.sha256||await hash(seal)!==manifest.seal.sha256)fail('성적서 워터마크·직인 원본이 배포 설정과 다릅니다.');return {manifest,watermark,seal,master:decodeBytes(master),header:decodeBytes(header),sealPicture:decodeBytes(sealPicture)};}
function manifestInfo(xml){const tree=parse(xml),manifest=desc(tree,'manifest')[0];if(!manifest)fail('HWPX 파일 목록을 찾지 못했습니다.');return {tree,manifest,items:children(manifest,'item')};}
function internalPath(href){return !!href&&!/^(?:[A-Za-z]:|[a-z]+:|\/|\\)/i.test(href)&&!href.split(/[\\/]/).includes('..');}
function imageItems(info){return info.items.filter(i=>/^image\//.test(attr(i,'media-type')));}
function uniqueName(base,used){let n=base,i=1;while(used.has(n))n=base+'_'+i++;used.add(n);return n;}
function usedIds(xml){return new Set(Array.from(xml.matchAll(/\b(?:id|instid)="([^\"]*)"/g),m=>m[1]));}
function freePath(zip,base,ext){let path=base+ext,n=1;while(zip.file(path))path=base+'_'+n+++ext;return path;}
function integerId(used,start){let n=start;while(used.has(String(n)))n++;used.add(String(n));return String(n);}
async function sectionParts(zip){const result=[];for(const name of Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n)).sort()){const xml=await zip.file(name).async('string'),tree=parse(xml);result.push({name,xml,tree,pages:reportPages(tree,xml)});}return result;}
async function repairKnownExternalSeal(zip,options={}){
 const hpf=zip.file('Contents/content.hpf');if(!hpf)fail('HWPX 파일 목록이 없습니다.');let xml=await hpf.async('string');const info=manifestInfo(xml),external=imageItems(info).filter(i=>attr(i,'isEmbeded')==='0'||!internalPath(attr(i,'href')));if(!external.length)return false;
 const a=await assets(options),sections=await sectionParts(zip),patches=[],repaired=[];
 for(const item of external){const href=attr(item,'href'),basename=href.split(/[\\/]/).pop();if(/^[a-z][a-z0-9+.-]*:\/\//i.test(href)||!a.manifest.seal.external_filenames.includes(basename))continue;const id=attr(item,'id'),uses=[];
  for(const s of sections)for(const pic of desc(s.tree,'pic'))if(desc(pic,'img').some(i=>attr(i,'binaryItemIDRef')===id))uses.push({s,pic});
  if(!uses.length||uses.some(({s,pic})=>!ancestors(pic,'tbl').some(t=>!!footerOf(t,s.xml))))continue;
  // A whitelisted company-seal filename plus a recognized issuer report context is required.
  let path='BinData/df_report_company_seal.jpg',suffix=1;while(zip.file(path)&&await hash(await zip.file(path).async('uint8array'))!==a.manifest.seal.sha256)path='BinData/df_report_company_seal_'+suffix+++'.jpg';zip.file(path,a.seal);let open=setAttr(setAttr(item.open,'href',path),'isEmbeded','1');open=setAttr(open,'media-type','image/jpeg');patches.push(patch(item,open));repaired.push(id);
 }
 if(patches.length){xml=edit(xml,patches);zip.file('Contents/content.hpf',xml);}return repaired.length>0;
}
async function ensureEmbeddedImages(zip){const xml=await zip.file('Contents/content.hpf').async('string'),info=manifestInfo(xml),images=imageItems(info),map=new Map(images.map(i=>[attr(i,'id'),i]));for(const i of images)if(attr(i,'isEmbeded')==='0'||!internalPath(attr(i,'href'))||!zip.file(attr(i,'href')))fail('외부 연결 또는 누락된 그림이 있습니다: '+attr(i,'href')+'\n해당 그림을 한글에서 문서에 포함시켜 저장해 주세요.');for(const name of Object.keys(zip.files).filter(n=>/^Contents\/.*\.xml$/.test(n))){const xml=await zip.file(name).async('string');for(const img of desc(parse(xml),'img')){const ref=attr(img,'binaryItemIDRef');if(ref&&!map.has(ref))fail('문서의 그림 연결을 찾지 못했습니다: '+ref);}}return {xml,info,images,map};}
// Older saved reports can still contain the former author's local seal path.
// Downloads repair only that resource link: no text, table, picture position or
// watermark normalization, and no change to the original stored file/version.
async function prepareDownload(input,options={}){
 if(!global.JSZip||!global.DOMParser||!global.crypto?.subtle)fail('성적서 그림 확인 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
 const inputBytes=await bytes(input),zip=await global.JSZip.loadAsync(inputBytes,{checkCRC32:true});
 if(!zip.file('mimetype')||clean(await zip.file('mimetype').async('string'))!==MIME)fail('HWPX 성적서가 아닙니다.');
 const repaired=await repairKnownExternalSeal(zip,options);await ensureEmbeddedImages(zip);
 if(!repaired)return input instanceof Blob?input:new Blob([inputBytes],{type:MIME});
 const output=new global.JSZip();output.file('mimetype',MIME,{compression:'STORE'});
 for(const [name,file] of Object.entries(zip.files)){if(name==='mimetype'||file.dir)continue;output.file(name,await file.async('uint8array'));}
 return output.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE',compressionOptions:{level:6}});
}
function importMasterStyles(target,source){
 let xml=target;const sr=parse(source),sourceBy=(name,id)=>desc(sr,name).find(n=>attr(n,'id')===String(id));
 function add(collection,tag,sourceNode,changes={}){let t=parse(xml),list=desc(t,collection)[0];if(!list||list.self)fail('워터마크에 필요한 글자·문단 설정을 찾지 못했습니다.');const nodes=children(list,tag),id=String(Math.max(-1,...nodes.map(n=>Number(attr(n,'id'))).filter(Number.isFinite))+1);let markup=raw(sourceNode,source),open=sourceNode.open;for(const [k,v] of Object.entries({...changes,id}))open=setAttr(open,k,v);markup=open+markup.slice(sourceNode.open.length);const count=attr(list,'itemCnt')!==''?'itemCnt':'fontCnt';xml=edit(xml,[{start:list.start,end:list.openEnd,text:setAttr(list.open,count,nodes.length+1)},{start:list.closeStart,end:list.closeStart,text:markup}]);return id;}
 const border=add('borderFills','borderFill',sourceBy('borderFill',2)),tab=add('tabProperties','tabPr',sourceBy('tabPr',0));
 const charSource=sourceBy('charPr',0);let character=raw(charSource,source),fonts=first(charSource,'fontRef');const map={hangul:'HANGUL',latin:'LATIN',hanja:'HANJA',japanese:'JAPANESE',other:'OTHER',symbol:'SYMBOL',user:'USER'};
 for(const [key,lang] of Object.entries(map)){const targetTree=parse(xml),face=desc(targetTree,'fontface').find(n=>attr(n,'lang')===lang),sourceFace=desc(sr,'fontface').find(n=>attr(n,'lang')===lang),f=children(sourceFace,'font').find(n=>attr(n,'id')===attr(fonts,key));if(!face||!f)fail('워터마크 글꼴 설정이 없습니다.');let match=children(face,'font').find(n=>attr(n,'face')===attr(f,'face')&&attr(n,'type')===attr(f,'type'));let id;
  if(match)id=attr(match,'id');else{id=String(Math.max(-1,...children(face,'font').map(n=>Number(attr(n,'id'))))+1);let fragment=raw(f,source);fragment=setAttr(f.open,'id',id)+fragment.slice(f.open.length);xml=edit(xml,[{start:face.start,end:face.openEnd,text:setAttr(face.open,'fontCnt',children(face,'font').length+1)},{start:face.closeStart,end:face.closeStart,text:fragment}]);}
  character=character.replace(/<hh:fontRef\b[^>]*>/,tag=>setAttr(tag,key,id));
 }
  function addFragment(collection,tag,fragment,changes={}){const t=parse(xml),list=desc(t,collection)[0],nodes=children(list,tag),id=String(Math.max(-1,...nodes.map(n=>Number(attr(n,'id'))).filter(Number.isFinite))+1),root=parse(fragment).children[0];let open=root.open;for(const [k,v] of Object.entries({...changes,id}))open=setAttr(open,k,v);fragment=open+fragment.slice(root.open.length);xml=edit(xml,[{start:list.start,end:list.openEnd,text:setAttr(list.open,'itemCnt',nodes.length+1)},{start:list.closeStart,end:list.closeStart,text:fragment}]);return id;}
 const charId=addFragment('charProperties','charPr',character,{borderFillIDRef:border});let paragraph=raw(sourceBy('paraPr',52),source).replace(/<hh:border\b[^>]*>/,tag=>setAttr(tag,'borderFillIDRef',border));const paraId=addFragment('paraProperties','paraPr',paragraph,{tabPrIDRef:tab});
 const styleId=addFragment('styles','style',raw(sourceBy('style',0),source),{name:'DF Report Branding',engName:'DF Report Branding',paraPrIDRef:paraId,charPrIDRef:charId});
 // The imported style's next-style reference is kept inside this new style, not in the user's original styles.
 const finalTree=parse(xml),style=desc(finalTree,'style').find(n=>attr(n,'id')===styleId);xml=edit(xml,[patch(style,setAttr(style.open,'nextStyleIDRef',styleId))]);return {xml,charId,paraId,styleId};
}
function marker(pic,xml,text){return desc(pic,'shapeComment').some(n=>xml.slice(n.openEnd,n.closeStart).includes(text));}
// A seal is a floating foreground object anchored alongside its report table.
// Both axes use PAPER coordinates: Hancom resolves a cell's PARA frame to the outer paragraph.
// Footer geometry determines the target; the original table and text are never moved.
function sealPlacement(page,sectionTree,headerXml,xml){
 const paper=desc(sectionTree,'pagePr')[0],margins=first(paper,'margin'),cellSize=first(page.cell,'cellSz'),cellMargin=attr(page.cell,'hasMargin')==='1'?first(page.cell,'cellMargin'):first(page.table,'inMargin'),sub=first(page.cell,'subList'),ps=children(sub,'p'),head=parse(headerXml),num=(n,k)=>Number(attr(n,k)||0);
 const paperWidth=num(paper,'width'),paperHeight=num(paper,'height'),left=num(margins,'left'),right=num(margins,'right'),cw=num(cellSize,'width'),ch=num(cellSize,'height'),ml=num(cellMargin,'left'),mr=num(cellMargin,'right'),mt=num(cellMargin,'top'),mb=num(cellMargin,'bottom'),contentWidth=cw-ml-mr;
 const anchor=ps[0],anchorLine=first(first(anchor,'linesegarray'),'lineseg'),signatureLine=first(first(page.signature,'linesegarray'),'lineseg');
 if(!anchorLine||!signatureLine||num(first(page.cell,'cellAddr'),'colAddr')!==0||paperWidth!==59528||paperHeight!==84188||contentWidth<=0)fail('성적서 하단 서명칸의 위치를 확인하지 못했습니다. 한글에서 원본을 저장한 뒤 다시 올려 주세요.');
 const anchorY=num(anchorLine,'vertpos'),sigY=num(signatureLine,'vertpos'),sigH=num(signatureLine,'vertsize')||1000,center=sigY+sigH/2;
 const rects=[];let priorBottom=0,priorSpacing=0;
 for(const para of ps){const lines=children(first(para,'linesegarray'),'lineseg'),txt=textOf(para,xml).replace(/\s+$/,'');let fontHeight=0;
  for(const run of children(para,'run')){const c=desc(head,'charPr').find(c=>attr(c,'id')===attr(run,'charPrIDRef'));fontHeight=Math.max(fontHeight,num(c,'height'));}
  fontHeight=fontHeight||1000;const top=lines.length?Math.min(...lines.map(l=>num(l,'vertpos'))):priorBottom+priorSpacing,bottom=lines.length?Math.max(...lines.map(l=>num(l,'vertpos')+(num(l,'vertsize')||fontHeight))):top+fontHeight;priorBottom=bottom;priorSpacing=lines.length?num(lines[lines.length-1],'spacing'):0;
  const style=desc(head,'paraPr').find(n=>attr(n,'id')===attr(para,'paraPrIDRef')),alignment=attr(first(style,'align'),'horizontal');
  // Conservative text width: full-em glyphs, 0.6-em spaces. No raster or font replacement.
  const textWidth=Math.min(contentWidth,Array.from(txt).reduce((sum,c)=>sum+fontHeight*(/\s/.test(c)?0.6:1),0));const lx=alignment==='RIGHT'?contentWidth-textWidth:alignment==='CENTER'?(contentWidth-textWidth)/2:0;
  rects.push({para,txt,top,bottom,left:lx,right:lx+textWidth});
 }
 const contentBottom=Math.max(...rects.map(r=>r.bottom)),align=attr(sub,'vertAlign'),spare=Math.max(0,ch-mt-mb-contentBottom),alignShift=align==='CENTER'?spare/2:align==='BOTTOM'?spare:0;
 let lower=anchorY+142,upper=ch-mt-mb-alignShift-142;const capWidth=5669,ratio=7339/7612;
 const tablePos=first(page.table,'pos'),tableWidth=num(first(page.table,'sz'),'width'),relative=attr(tablePos,'horzRelTo'),tableAlign=attr(tablePos,'horzAlign'),offset=num(tablePos,'horzOffset');let tableLeft=left+offset;
 if(relative==='PAPER')tableLeft=tableAlign==='RIGHT'?paperWidth-offset-tableWidth:tableAlign==='CENTER'?(paperWidth-tableWidth)/2+offset:offset;
 else if(!['PARA','PAGE','COLUMN'].includes(relative)||tableAlign!=='LEFT')fail('현재 성적서 표의 가로 배치를 확인하지 못했습니다. 원본 한글에서 서명칸 위치를 확인해 주세요.');
 const tablePara=ancestors(page.table,'p')[0],tableLine=first(first(tablePara,'linesegarray'),'lineseg'),row=num(first(page.cell,'cellAddr'),'rowAddr'),cells=children(page.table,'tr').flatMap(r=>children(r,'tc')),column=cells.filter(c=>num(first(c,'cellAddr'),'colAddr')===0),before=column.filter(c=>num(first(c,'cellAddr'),'rowAddr')<row),after=column.filter(c=>num(first(c,'cellAddr'),'rowAddr')>row);
 if(!tableLine||attr(tablePos,'vertRelTo')!=='PARA'||attr(tablePos,'vertAlign')!=='TOP'||num(tablePos,'vertOffset')<0||ancestors(page.table,'tbl').length)fail('성적서 하단 서명칸의 쪽 위치를 확인하지 못했습니다. 원본 한글 위치를 확인해 주세요.');
 const tablePr=desc(head,'paraPr').find(n=>attr(n,'id')===attr(tablePara,'paraPrIDRef')),beforeMargin=desc(tablePr,'prev')[0],floating=attr(tablePos,'treatAsChar')!=='1',tableTop=num(margins,'top')+num(tableLine,'vertpos')+num(tablePos,'vertOffset')+(floating?num(first(page.table,'outMargin'),'top')-num(beforeMargin,'value'):0);
 const footerTop=tableTop+Math.max(before.reduce((sum,c)=>sum+num(first(c,'cellSz'),'height'),0),num(first(page.table,'sz'),'height')-ch-after.reduce((sum,c)=>sum+num(first(c,'cellSz'),'height'),0)),paperLimit=paperHeight-num(margins,'bottom')-142;
 upper=Math.min(upper,paperLimit-footerTop-mt-alignShift);
 // Locate the signature words, not the far-right cell border. HWP useFontSpace=0 uses
 // half-em Latin/space advances; preserve each run's original size, width ratio and spacing.
 const signatureText=textOf(page.signature,xml),signatureMatch=/\(?서명\s*또는\s*인\)?/.exec(signatureText);if(!signatureMatch)fail('성적서 서명 문구의 위치를 확인하지 못했습니다.');
 const advances=[];for(const run of children(page.signature,'run')){const ch=desc(head,'charPr').find(n=>attr(n,'id')===attr(run,'charPrIDRef')),height=num(ch,'height')||1000,ratios=first(ch,'ratio'),spacing=first(ch,'spacing');for(const c of Array.from(textOf(run,xml))){const group=/[\uac00-\ud7af\u1100-\u11ff]/.test(c)?'hangul':'latin',ratio=attr(ratios,group)===''?1:num(ratios,group)/100;advances.push(height*((c.charCodeAt(0)<128?0.5:1)*ratio+num(spacing,group)/100));}}
 const signatureLines=children(first(page.signature,'linesegarray'),'lineseg'),line=signatureLines.filter(l=>num(l,'textpos')<=signatureMatch.index).slice(-1)[0]||signatureLine,lineIndex=signatureLines.indexOf(line),lineStart=num(line,'textpos'),lineEnd=lineIndex+1<signatureLines.length?num(signatureLines[lineIndex+1],'textpos'):advances.length,measure=(a,b)=>advances.slice(a,b).reduce((sum,v)=>sum+v,0),lineWidth=num(line,'horzsize')||contentWidth,fullWidth=measure(lineStart,lineEnd),signatureStyle=desc(head,'paraPr').find(n=>attr(n,'id')===attr(page.signature,'paraPrIDRef')),signatureAlign=attr(first(signatureStyle,'align'),'horizontal');
 const textLeft=tableLeft+ml+num(line,'horzpos')+(signatureAlign==='RIGHT'?lineWidth-fullWidth:signatureAlign==='CENTER'?(lineWidth-fullWidth)/2:0),targetX=textLeft+measure(lineStart,signatureMatch.index)+measure(signatureMatch.index,signatureMatch.index+signatureMatch[0].length)/2;
 const rightEdge=Math.min(paperWidth-right-142,tableLeft+cw-mr-284),leftEdge=Math.max(left+142,tableLeft+ml+142),capLeft=Math.max(leftEdge,Math.min(targetX-capWidth/2,rightEdge-capWidth)),localLeft=capLeft-tableLeft-ml,localRight=capLeft+capWidth-tableLeft-ml;
 for(const r of rects){if(r.para===page.signature||!r.txt)continue;const protectedLine=/소재지|연락처|의뢰사항|해당\s*없음/.test(r.txt)||r.top>sigY;if(!protectedLine&&(r.right<=localLeft||r.left>=localRight))continue;const start=r.top-142,end=r.bottom+142;if(end<=center)lower=Math.max(lower,end);else if(start>=center)upper=Math.min(upper,start);else fail('서명란과 다른 문장이 겹칩니다. 원본 한글 서명칸의 여유 공간을 확인해 주세요.');}
 const width=Math.min(capWidth,Math.floor((upper-lower)/ratio)),height=Math.round(width*ratio);if(width<2835||height<=0)fail('서명칸의 직인 여유 공간이 부족합니다. 원본 한글 서명칸을 확인해 주세요.');
 const x=Math.round(Math.max(leftEdge,Math.min(targetX-width/2,rightEdge-width))),y=Math.round(Math.max(lower,Math.min(center-height/2,upper-height))-anchorY);
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<left||x+width>paperWidth-right||y<0||mt+alignShift+anchorY+y+height>ch-mb)fail('직인이 페이지 또는 서명칸을 벗어납니다. 원본 한글 위치를 확인해 주세요.');
 return {anchor:tablePara,tableId:attr(page.table,'id'),x,y,width,height,cellTop:mt+alignShift+anchorY+y,cellBottom:mt+alignShift+anchorY+y+height,paperWidth,paperHeight,cellHeight:ch,allowedTop:lower,allowedBottom:upper,footerTop,paperTop:footerTop+mt+alignShift+anchorY+y,paperBottom:footerTop+mt+alignShift+anchorY+y+height};
}
function sealPicture(source,id,instid,imageId,place){let xml=source,tree=parse(xml),pic=tree.children[0],pos=first(pic,'pos'),img=first(pic,'img'),comment=first(pic,'shapeComment');let open=pic.open;for(const [k,v] of Object.entries({id,instid,zOrder:'100',textWrap:'IN_FRONT_OF_TEXT'}))open=setAttr(open,k,v);let position=pos.open;for(const [k,v] of Object.entries({treatAsChar:'0',affectLSpacing:'0',flowWithText:'0',allowOverlap:'1',vertRelTo:'PAPER',horzRelTo:'PAPER',vertAlign:'TOP',horzAlign:'LEFT',vertOffset:Math.round(place.paperTop),horzOffset:place.x}))position=setAttr(position,k,v);
 const changes=[{start:pic.start,end:pic.openEnd,text:open},patch(pos,position),patch(img,setAttr(img.open,'binaryItemIDRef',imageId)),patch(comment,'<hp:shapeComment>'+SEAL_MARK+';tableId='+escape(place.tableId)+'</hp:shapeComment>')];
 for(const name of ['orgSz','curSz','sz']){const n=first(pic,name);changes.push(patch(n,setAttr(setAttr(n.open,'width',place.width),'height',place.height)));}
 const off=first(pic,'offset');changes.push(patch(off,setAttr(setAttr(off.open,'x','0'),'y','0')));const rotation=first(pic,'rotationInfo');changes.push(patch(rotation,setAttr(setAttr(rotation.open,'centerX',Math.floor(place.width/2)),'centerY',Math.floor(place.height/2))));
 const render=first(pic,'renderingInfo');changes.push(patch(render,'<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>'));
 const rect=first(pic,'imgRect');changes.push(patch(rect,'<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="'+place.width+'" y="0"/><hc:pt2 x="'+place.width+'" y="'+place.height+'"/><hc:pt3 x="0" y="'+place.height+'"/></hp:imgRect>'));return edit(xml,changes);
}
function sealOwner(pic,xml){const comment=first(pic,'shapeComment'),text=comment?decode(xml.slice(comment.openEnd,comment.closeStart)).trim():'';return text.startsWith(SEAL_MARK+';tableId=')?text.slice((SEAL_MARK+';tableId=').length):'';}
function attrsObject(n,omit=[]){const result={};for(const m of (n?.open||'').matchAll(/([\w:.-]+)="([^"]*)"/g))if(!omit.includes(m[1])&&!m[1].startsWith('xmlns'))result[m[1]]=decode(m[2]);return result;}
function sameAttrs(a,b,omit=[]){return JSON.stringify(Object.entries(attrsObject(a,omit)).sort())===JSON.stringify(Object.entries(attrsObject(b,omit)).sort());}
function sameNode(a,ax,b,bx,omit=[],ignore=[]){if(!a||!b)return false;const shape=(n,xml)=>ignore.includes(local(n))?[local(n)]:[local(n),Object.entries(attrsObject(n,omit)).sort(),n.children.map(c=>shape(c,xml)),n.children.length?'':decode(xml.slice(n.openEnd,n.closeStart)).trim()];if(ignore.includes(local(a))&&ignore.includes(local(b)))return true;return JSON.stringify(shape(a,ax))===JSON.stringify(shape(b,bx));}
function samePicture(pic,xml,reference,refXml,seal=false){
 if(!sameAttrs(pic,reference,['id','instid','zOrder'])||attr(pic,'zOrder')!==(seal?'100':attr(reference,'zOrder')))return false;
 for(const name of ['offset','orgSz','curSz','flip','rotationInfo','renderingInfo','imgRect','imgClip','inMargin','imgDim','effects','sz','outMargin']){const x=first(pic,name),y=first(reference,name);if(!sameNode(x,xml,y,refXml))return false;}
 if(!sameAttrs(first(pic,'img'),first(reference,'img'),['binaryItemIDRef']))return false;
 if(!sameAttrs(first(pic,'pos'),first(reference,'pos')))return false;
 return true;
}
function brandingOnlyMaster(tree,xml,hashes,a){const pics=desc(tree,'pic');return !clean(textOf(tree,xml))&&!desc(tree,'tbl').length&&pics.length>0&&pics.every(pic=>marker(pic,xml,WM_MARK)||(hashes.get(attr(first(pic,'img'),'binaryItemIDRef'))===a.manifest.watermark.sha256&&Number(attr(first(pic,'sz'),'width'))>10000));}
async function inspect(input,options={}){
 const zip=input?.files?input:await global.JSZip.loadAsync(await bytes(input),{checkCRC32:true}),a=await assets(options),parts=await sectionParts(zip),pageCount=parts.reduce((n,s)=>n+s.pages.length,0);let seals=0,watermarks=0,valid=true,wmRecord;
 const refMaster=parse(a.master),refPic=desc(refMaster,'pic')[0],refSeal=parse(a.sealPicture).children[0];const headerText=await zip.file('Contents/header.xml').async('string'),head=parse(headerText),refHeader=parse(a.header);
 for(const s of parts){for(const pic of desc(s.tree,'pic'))if(marker(pic,s.xml,SEAL_MARK))seals++;for(const page of s.pages){try{const found=desc(s.tree,'pic').filter(pic=>sealOwner(pic,s.xml)===attr(page.table,'id')),place=sealPlacement(page,s.tree,headerText,s.xml),expected=sealPicture(a.sealPicture,'0','0','source',place),expectedTree=parse(expected);if(found.length!==1||ancestors(found[0],'p')[0]!==place.anchor||ancestors(found[0],'tbl').length>0||!samePicture(found[0],s.xml,expectedTree.children[0],expected,true))valid=false;}catch(_){valid=false;}}}
 for(const name of Object.keys(zip.files).filter(n=>/^Contents\/.*\.xml$/.test(n))){const xml=await zip.file(name).async('string'),tree=parse(xml);for(const pic of desc(tree,'pic'))if(marker(pic,xml,WM_MARK)){watermarks++;wmRecord={name,xml,tree,pic};if(local(tree.children[0])!=='masterPage'||!samePicture(pic,xml,refPic,a.master))valid=false;}}
 if(wmRecord){const {tree,xml}=wmRecord,root=tree.children[0],sub=first(root,'subList'),ps=children(sub,'p'),refPs=children(first(refMaster.children[0],'subList'),'p');if(!sameAttrs(root,refMaster.children[0],['id'])||!sameAttrs(sub,first(refMaster.children[0],'subList'))||ps.length!==refPs.length)valid=false;
  for(let i=0;i<ps.length;i++){const p=ps[i],ref=refPs[i];if(!ref||!sameAttrs(p,ref,['id','paraPrIDRef','styleIDRef'])||!sameNode(first(p,'linesegarray'),xml,first(ref,'linesegarray'),a.master)){valid=false;continue;}const para=desc(head,'paraPr').find(n=>attr(n,'id')===attr(p,'paraPrIDRef')),reference=desc(refHeader,'paraPr').find(n=>attr(n,'id')==='52');if(!sameNode(para,headerText,reference,a.header,['id','tabPrIDRef','borderFillIDRef']))valid=false;for(const run of children(p,'run')){const ch=desc(head,'charPr').find(n=>attr(n,'id')===attr(run,'charPrIDRef'));const sourceChar=desc(refHeader,'charPr').find(n=>attr(n,'id')==='0');if(!sameNode(ch,headerText,sourceChar,a.header,['id','borderFillIDRef'],['fontRef']))valid=false;const fontGroups={hangul:'HANGUL',latin:'LATIN',hanja:'HANJA',japanese:'JAPANESE',other:'OTHER',symbol:'SYMBOL',user:'USER'};for(const [key,lang] of Object.entries(fontGroups)){const font=children(desc(head,'fontface').find(n=>attr(n,'lang')===lang),'font').find(n=>attr(n,'id')===attr(first(ch,'fontRef'),key)),sourceFont=children(desc(refHeader,'fontface').find(n=>attr(n,'lang')===lang),'font').find(n=>attr(n,'id')===attr(first(sourceChar,'fontRef'),key));if(!font||!sourceFont||attr(font,'face')!==attr(sourceFont,'face')||attr(font,'type')!==attr(sourceFont,'type'))valid=false;}}}
  for(const s of parts)if(s.pages.length)for(const prop of desc(s.tree,'secPr')){const refs=children(prop,'masterPage');if(!refs.some(n=>attr(n,'idRef')===attr(root,'id'))||Number(attr(prop,'masterPageCnt'))!==refs.length)valid=false;}
 }else valid=false;
 try{const m=await ensureEmbeddedImages(zip),paths=new Map(m.images.map(i=>[attr(i,'id'),attr(i,'href')]));for(const s of parts)for(const pic of desc(s.tree,'pic'))if(marker(pic,s.xml,SEAL_MARK))if(await hash(await zip.file(paths.get(attr(first(pic,'img'),'binaryItemIDRef'))).async('uint8array'))!==a.manifest.seal.sha256)valid=false;if(wmRecord&&await hash(await zip.file(paths.get(attr(first(wmRecord.pic,'img'),'binaryItemIDRef'))).async('uint8array'))!==a.manifest.watermark.sha256)valid=false;}catch(_){valid=false;}
 return {standardized:pageCount>0&&seals===pageCount&&watermarks===1&&valid,pageCount,sealCount:seals,watermarkCount:watermarks,version:VERSION};
}
async function normalize(input,options={}){
 if(!global.JSZip||!global.DOMParser||!global.crypto?.subtle)fail('성적서 그림 처리 구성요소를 불러오지 못했습니다.');const inputBytes=await bytes(input),zip=await global.JSZip.loadAsync(inputBytes,{checkCRC32:true});if(!zip.file('mimetype')||clean(await zip.file('mimetype').async('string'))!==MIME)fail('HWPX 성적서가 아닙니다.');const a=await assets(options);const repaired=await repairKnownExternalSeal(zip,options);let state=await ensureEmbeddedImages(zip);let parts=await sectionParts(zip),pages=parts.flatMap(s=>s.pages);if(!pages.length)fail('드림포이엔 성적서의 발행인·서명 위치를 찾지 못했습니다. 회사 성적서 양식을 확인해 주세요.');
 for(const s of parts)if(s.pages.length)for(const pp of desc(s.tree,'pagePr'))if(attr(pp,'width')!=='59528'||attr(pp,'height')!=='84188')fail('공통 워터마크는 A4 세로 성적서에 적용할 수 있습니다. 원본 판형을 확인해 주세요.');
 const existing=await inspect(zip,options);if(existing.standardized&&!repaired)return new Blob([inputBytes],{type:MIME});
 const imageHashes=new Map();for(const i of state.images)imageHashes.set(attr(i,'id'),await hash(await zip.file(attr(i,'href')).async('uint8array')));
 // Remove only known company seals and the exact source branding watermark. Other signatures/pictures remain.
 for(const s of parts){const edits=[];for(const pic of desc(s.tree,'pic')){const img=first(pic,'img'),known=imageHashes.get(attr(img,'binaryItemIDRef'))===a.manifest.seal.sha256;if((known||marker(pic,s.xml,SEAL_MARK))&&(ancestors(pic,'tbl').some(t=>footerOf(t,s.xml))||s.pages.some(p=>sealOwner(pic,s.xml)===attr(p.table,'id'))))edits.push(patch(pic,''));}if(edits.length)zip.file(s.name,edit(s.xml,edits));}
 const masterNames=Object.keys(zip.files).filter(n=>/^Contents\/.*master.*\.xml$/i.test(n)),masterRecords=[];for(const name of masterNames){const xml=await zip.file(name).async('string'),tree=parse(xml);masterRecords.push({name,xml,tree,root:tree.children[0],brandingOnly:brandingOnlyMaster(tree,xml,imageHashes,a)});}
 let hpf=await zip.file('Contents/content.hpf').async('string'),mi=manifestInfo(hpf),ids=new Set(mi.items.map(i=>attr(i,'id'))),wmId=uniqueName('df_report_watermark',ids),sealId=uniqueName('df_report_seal',ids),masterId,masterPath,needsMasterItem=false;
 const usedMasterIds=new Set(parts.filter(s=>s.pages.length).flatMap(s=>desc(s.tree,'secPr').flatMap(prop=>children(prop,'masterPage').map(n=>attr(n,'idRef'))))),usedMasters=masterRecords.filter(m=>usedMasterIds.has(attr(m.root,'id')));
 const other=usedMasters.filter(m=>!m.brandingOnly);if(other.length)fail('기존 바탕쪽에 회사 워터마크 외의 내용이 있습니다. 본문과 바탕쪽을 보존하기 위해 자동 적용을 중단했습니다.');
 const reusable=usedMasters.find(m=>m.brandingOnly);if(reusable){masterId=attr(reusable.root,'id');masterPath=reusable.name;}else{masterId=uniqueName('df_report_branding_master',ids);let masterIndex=0;while(zip.file('Contents/masterpage'+masterIndex+'.xml'))masterIndex++;masterPath='Contents/masterpage'+masterIndex+'.xml';needsMasterItem=true;}
 const wmPath=freePath(zip,'BinData/'+wmId,'.png'),sealPath=freePath(zip,'BinData/'+sealId,'.jpg');
 const header=await zip.file('Contents/header.xml').async('string'),styles=importMasterStyles(header,a.header);zip.file('Contents/header.xml',styles.xml);
 let master=a.master,mt=parse(master),mr=mt.children[0],mp=desc(mt,'pic')[0],miNode=first(mp,'img'),mc=first(mp,'shapeComment');const originalIds=usedIds((await Promise.all(Object.keys(zip.files).filter(n=>/^Contents\/.*\.xml$/.test(n)).map(n=>zip.file(n).async('string')))).join(''));const picId=integerId(originalIds,2100000000),instId=integerId(originalIds,2101000000);
 master=edit(master,[{start:mr.start,end:mr.openEnd,text:setAttr(mr.open,'id',masterId)},{start:mp.start,end:mp.openEnd,text:setAttr(setAttr(mp.open,'id',picId),'instid',instId)},patch(miNode,setAttr(miNode.open,'binaryItemIDRef',wmId)),patch(mc,'<hp:shapeComment>'+WM_MARK+'</hp:shapeComment>')]);master=master.replace(/\bparaPrIDRef="52"/g,'paraPrIDRef="'+styles.paraId+'"').replace(/\bcharPrIDRef="0"/g,'charPrIDRef="'+styles.charId+'"').replace(/\bstyleIDRef="0"/g,'styleIDRef="'+styles.styleId+'"');parse(master);
 zip.file(wmPath,a.watermark);zip.file(sealPath,a.seal);zip.file(masterPath,master);
 hpf=edit(hpf,[{start:mi.manifest.closeStart,end:mi.manifest.closeStart,text:'<opf:item id="'+wmId+'" href="'+wmPath+'" media-type="image/png" isEmbeded="1"/><opf:item id="'+sealId+'" href="'+sealPath+'" media-type="image/jpeg" isEmbeded="1"/>'+(needsMasterItem?'<opf:item id="'+masterId+'" href="'+masterPath+'" media-type="application/xml"/>':'')}]);zip.file('Contents/content.hpf',hpf);
 parts=await sectionParts(zip);for(const s of parts){if(!s.pages.length)continue;const edits=[];for(const p of s.pages){const place=sealPlacement(p,s.tree,styles.xml,s.xml),run=children(place.anchor,'run').slice(-1)[0];if(!run||Number(attr(first(p.cell,'cellSz'),'width'))<10000)fail('발행인 서명칸의 직인 위치를 확인해 주세요.');const seal=sealPicture(a.sealPicture,integerId(originalIds,2102000000),integerId(originalIds,2103000000),sealId,place);if(run.self)edits.push(patch(run,run.open.replace(/\/>$/, '>')+seal+'</'+run.name+'>'));else edits.push({start:run.closeStart,end:run.closeStart,text:seal});}
  const properties=desc(s.tree,'secPr');if(!properties.length)fail('성적서 쪽 설정을 찾지 못했습니다.');for(const prop of properties){const masters=children(prop,'masterPage');edits.push({start:prop.start,end:prop.openEnd,text:setAttr(prop.open,'masterPageCnt',1)});if(masters.length){edits.push(patch(masters[0],'<hp:masterPage idRef="'+masterId+'"/>'));for(const other of masters.slice(1))edits.push(patch(other,''));}else edits.push({start:prop.closeStart,end:prop.closeStart,text:'<hp:masterPage idRef="'+masterId+'"/>'});}const next=edit(s.xml,edits);parse(next);zip.file(s.name,next);
 }
 // No old raster thumbnail is presented as a newly branded document. Text preview stays unchanged.
 zip.remove('Preview/PrvImage.png');await ensureEmbeddedImages(zip);
 const verified=await inspect(zip,options);if(!verified.standardized)fail('워터마크·직인 적용 확인에 실패했습니다. 원본 파일은 변경되지 않았습니다.');
 const output=new global.JSZip();output.file('mimetype',MIME,{compression:'STORE'});for(const [name,file] of Object.entries(zip.files)){if(name==='mimetype'||file.dir)continue;output.file(name,await file.async('uint8array'));}return output.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE',compressionOptions:{level:6}});
}
global.DF_REPORT_BRANDING=Object.freeze({version:VERSION,normalize,repairKnownExternalSeal,prepareDownload,inspect});
})(typeof window!=='undefined'?window:globalThis);

