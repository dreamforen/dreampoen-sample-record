/* Original HWP-derived HTML editor. Native HWP is the source of saved/exported text. */
(function(root){
 'use strict';
 const cache=new Map(),enc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const showText=v=>{const raw=String(v??'').replace(/[\u001e\u001f]/g,'\u2002');return root.DF_CONTRACT_FORM_MODEL?.plain?root.DF_CONTRACT_FORM_MODEL.plain(raw):raw;};
 function retainAnchors(raw,next){
  const controls=new Set([2,3,4,5,6,7,8,9,11,12,14,15,16,17,18,21,22,23]),anchors=[];let plain='',visible=0;
  for(let i=0;i<raw.length;i++){const code=raw.charCodeAt(i);if(controls.has(code)){anchors.push({position:visible,raw:raw.slice(i,i+8)});i+=7;}else if(code===30||code===31){plain+=' ';visible++;}else if(code>=32||code===10){plain+=raw[i];visible++;}}
  let pre=0,suf=0;while(pre<plain.length&&pre<next.length&&plain[pre]===next[pre])pre++;while(suf<plain.length-pre&&suf<next.length-pre&&plain[plain.length-1-suf]===next[next.length-1-suf])suf++;
  const mapped=anchors.map(a=>({...a,position:a.position<=pre?a.position:a.position>=plain.length-suf?a.position+next.length-plain.length:pre}));
  let out=next;for(const a of mapped.slice().reverse())out=out.slice(0,a.position)+a.raw+out.slice(a.position);return out;
 }
 function runs(node){const doc=node.ownerDocument,walk=doc.createTreeWalker(node,4),out=[];let n;while((n=walk.nextNode()))out.push(n);return out;}
 function replaceText(node,next){
  const all=runs(node),before=all.map(x=>x.data).join('');next=showText(next);if(before===next)return;
  if(!all.length){const span=node.ownerDocument.createElement('span');span.className=node.firstElementChild?.className||'';span.textContent=next;node.append(span);return;}
  let prefix=0,suffix=0;while(prefix<before.length&&prefix<next.length&&before[prefix]===next[prefix])prefix++;
  while(suffix<before.length-prefix&&suffix<next.length-prefix&&before[before.length-1-suffix]===next[next.length-1-suffix])suffix++;
  const stop=before.length-suffix,insert=next.slice(prefix,next.length-suffix);let pos=0,done=false;
  for(const part of all){const start=pos,end=pos+part.data.length;pos=end;
   if(end<=prefix||start>=stop&&done)continue;
   const left=part.data.slice(0,Math.max(0,Math.min(part.data.length,prefix-start))),right=part.data.slice(Math.max(0,Math.min(part.data.length,stop-start)));
   part.data=left+(!done?insert:'')+right;done=true;
  }
  if(!done)all[all.length-1].data+=insert;
 }
 function signatureColumns(doc,type,common){return root.DF_CONTRACT_FORM_LAYOUT?.signatureColumns(doc,type,common);}
 function selectionOffset(node){const selection=node.ownerDocument.getSelection();if(!selection?.rangeCount||!node.contains(selection.anchorNode))return null;const range=selection.getRangeAt(0).cloneRange();range.selectNodeContents(node);range.setEnd(selection.anchorNode,selection.anchorOffset);return range.toString().length;}
 function restoreSelection(node,offset){if(offset===null)return;const doc=node.ownerDocument,selection=doc.getSelection(),range=doc.createRange();let left=offset;for(const n of runs(node)){if(left<=n.length){range.setStart(n,left);range.collapse(true);selection.removeAllRanges();selection.addRange(range);return;}left-=n.length;}range.selectNodeContents(node);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}
 function cleanFormat(value){
  const out={};if(!value||typeof value!=='object'||Array.isArray(value))return out;
  if(typeof value.fontFamily==='string'&&value.fontFamily.trim()&&value.fontFamily.length<=80&&!/[\x00-\x1f;{}<>]/.test(value.fontFamily))out.fontFamily=value.fontFamily.trim();
  if(value.fontSize!==''&&value.fontSize!==null&&Number.isFinite(Number(value.fontSize))&&Number(value.fontSize)>=6&&Number(value.fontSize)<=96)out.fontSize=Number(value.fontSize);
  for(const key of ['bold','italic','underline'])if(typeof value[key]==='boolean')out[key]=value[key];
  if(['left','center','right','justify'].includes(value.textAlign))out.textAlign=value.textAlign;
  const limits={charWidth:[50,200],letterSpacing:[-30,50],lineHeight:[80,300],textIndent:[-72,144],marginLeft:[0,144],marginRight:[0,144],spaceBefore:[0,72],spaceAfter:[0,72]};
  for(const [key,[min,max]]of Object.entries(limits)){const v=value[key];if(v!==''&&v!==null&&(typeof v==='number'||typeof v==='string')&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max)out[key]=['charWidth','letterSpacing','lineHeight'].includes(key)?Math.round(Number(v)):Math.round(Number(v)*200)/200;}
  return out;
 }
 function cleanStyles(value,indices){const out={};for(const [key,format]of Object.entries(value||{})){if(!/^\d+$/.test(key)||!indices.has(Number(key)))continue;const next=cleanFormat(format);if(Object.keys(next).length)out[key]=next;}return out;}
 function formatParagraph(p,format){
  const f=cleanFormat(format),all=[p,...p.querySelectorAll('span')],props={fontFamily:'font-family',fontSize:'font-size',bold:'font-weight',italic:'font-style',underline:'text-decoration'};
  for(const [key,property]of Object.entries(props))if(Object.prototype.hasOwnProperty.call(f,key)){
   const value=key==='fontFamily'?JSON.stringify(f[key]):key==='fontSize'?f[key]+'pt':key==='bold'?(f[key]?'bold':'normal'):key==='italic'?(f[key]?'italic':'normal'):(f[key]?'underline':'none');
   all.forEach(n=>n.style.setProperty(property,value,'important'));
  }
  if(f.textAlign)p.style.setProperty('text-align',f.textAlign,'important');
  if(f.charWidth!==undefined){p.style.transform='scaleX('+(f.charWidth/100)+')';p.style.transformOrigin='left top';p.style.width=(10000/f.charWidth)+'%';}
  if(f.letterSpacing!==undefined)all.forEach(n=>n.style.setProperty('letter-spacing',(f.letterSpacing/100)+'em','important'));
  if(f.lineHeight!==undefined)all.forEach(n=>n.style.setProperty('line-height',String(f.lineHeight/100),'important'));
  const pointProps={textIndent:'text-indent',marginLeft:'margin-left',marginRight:'margin-right',spaceBefore:'margin-top',spaceAfter:'margin-bottom'};
  for(const [key,property]of Object.entries(pointProps))if(f[key]!==undefined)p.style.setProperty(property,f[key]+'pt','important');
  if(f.textIndent!==undefined)p.style.setProperty('padding-left',Math.max(0,-f.textIndent)+'pt','important');
 }
 async function template(type){
  if(!['contract','plan','notice'].includes(type))throw Error('지원하지 않는 계약 서식입니다.');
  if(!cache.has(type)){const base=new URL('assets/contract_docs/originals/web/'+type+'/',location.href);const pending=Promise.all([fetch(new URL('index.xhtml',base)),fetch(new URL('styles.css',base))]).then(async([html,css])=>{if(!html.ok||!css.ok)throw Error('원본 계약 서식 파일을 불러오지 못했습니다.');return {base:base.href,html:await html.text(),css:await css.text()};});cache.set(type,pending);pending.catch(()=>cache.delete(type));}
  return cache.get(type);
 }
 async function mount(host,options={}){
  const type=options.type||'contract',[source,native]=await Promise.all([template(type),root.DF_CONTRACT_ORIGINAL_HWP.inspect(type)]);
  if(!host.isConnected)throw Error('계약 작성 화면이 바뀌었습니다.');
  const model=root.DF_CONTRACT_FORM_MODEL;if(!model)throw Error('계약 입력 구성요소를 불러오지 못했습니다.');
  let common={...(options.common||{})},overrides={...(options.overrides||{})},enabled=!!options.editable,destroyed=false;
  let composingParagraph=null,pendingParagraph=null,compositionTimer=null,explicitComposition=false;
  const cancelPending=()=>{if(compositionTimer!==null)root.clearTimeout(compositionTimer);compositionTimer=null;composingParagraph=null;pendingParagraph=null;explicitComposition=false;};
  const validIndices=new Set(native.paragraphs.map(p=>Number(p.index)));let styles=cleanStyles(options.styles,validIndices),selected=null;
  const changes=()=>model.buildChanges(type,common,overrides);
  const parser=new DOMParser(),doc=parser.parseFromString(source.html,'text/html');
  doc.querySelectorAll('script,iframe,object,embed').forEach(n=>n.remove());doc.querySelectorAll('link[rel=stylesheet]').forEach(n=>n.remove());
  root.DF_CONTRACT_FORM_LAYOUT?.prepare(doc,type);
  const base=doc.createElement('base');base.href=source.base;doc.head.prepend(base);
  const style=doc.createElement('style');style.textContent=source.css+'\n'+
   'body{background:#fff} table{border:0!important} .Paper{border:0;margin:0 auto} .Page p{white-space:pre-wrap} [contenteditable="plaintext-only"]{outline:1px dashed transparent;min-width:1em} [contenteditable="plaintext-only"]:hover{outline-color:#b7cdbc} [contenteditable="plaintext-only"]:focus{outline:1px solid #7da88a;background:#f8fcf8} .dfcw-sign-columns{display:grid;grid-template-columns:1fr 1fr;white-space:normal!important}.dfcw-sign-columns>.dfcw-sign-column{white-space:pre-wrap;min-width:0} @media print{body{padding:0}.Paper{margin:0;border:0} [contenteditable]{outline:0!important;background:transparent!important}}';doc.head.append(style);
  const byIndex=new Map(native.paragraphs.map(x=>[Number(x.index),x])),initial=changes(),originals=new Map();
  for(const p of doc.querySelectorAll('[data-hwp-p]')){
   const index=Number(p.dataset.hwpP),info=byIndex.get(index);originals.set(index,p.innerHTML);
   if(Object.prototype.hasOwnProperty.call(initial,index))replaceText(p,initial[index]);
   // Fixed control anchors/signature columns stay in the original native file.
   // Their customer values update through the primary name/address fields.
   const field=model.descriptors?.(type)?.fields.find(x=>Number(x.paragraph)===index);
   if(info?.editable||field){p.dataset.hwpEditable='1';p.setAttribute('aria-label',field?.label||'문서 입력 '+(index+1));p.setAttribute('role','textbox');}
   if(info?.editable||field||showText(info?.text||info?.rawText||'').trim()){p.dataset.hwpFormat='1';if(!p.hasAttribute('data-hwp-editable')){p.tabIndex=0;p.setAttribute('aria-label','문단 서식 '+(index+1));}}
  }
  const frame=document.createElement('iframe');frame.className='dfcw-original-frame';frame.title=({contract:'표준계약서',plan:'과업수행계획서',notice:'계약체결사실통보서'}[type])+' 원본 작성';frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('scrolling','no');frame.style.cssText='width:calc(210mm + 8px);border:0;display:block;margin:0 auto;min-height:297mm;overflow:hidden';
  const toolbar=document.createElement('div');toolbar.className='dfcw-formatbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','문단 글자 서식');
  const faces=[...new Set(['맑은 고딕','바탕','돋움','굴림','궁서','함초롬바탕','함초롬돋움','Arial','Times New Roman',...(native.fontOptions||native.fonts||[]).map(f=>typeof f==='string'?f:f.name||f.fontFamily||'')].filter(Boolean))];
  toolbar.innerHTML='<span class="dfcw-format-target">수정할 문단 선택</span><label>글꼴 <select aria-label="글꼴"><option value="">원본 글꼴</option>'+faces.map(f=>'<option value="'+enc(f)+'">'+enc(f)+'</option>').join('')+'</select></label><label>크기 <input type="number" min="6" max="96" step="0.5" placeholder="원본" aria-label="글자 크기"></label>'+[['bold','굵게'],['italic','기울임'],['underline','밑줄'],['left','왼쪽정렬'],['center','가운데정렬'],['right','오른쪽정렬'],['reset','원본서식']].map(([k,title])=>'<button type="button" data-format="'+k+'"'+(['bold','italic','underline'].includes(k)?' aria-pressed="false"':'')+'>'+title+'</button>').join('');
  const spacingToggle=document.createElement('button');spacingToggle.type='button';spacingToggle.textContent='간격 조절';spacingToggle.setAttribute('aria-expanded','false');toolbar.append(spacingToggle);
  const spacingPanel=document.createElement('div');spacingPanel.className='dfcw-spacing-panel';spacingPanel.hidden=true;spacingPanel.setAttribute('role','group');spacingPanel.setAttribute('aria-label','문단 간격');
  const spacingFields=[['letterSpacing','자간 (%)',-30,50,1],['charWidth','장평 (%)',50,200,1],['lineHeight','줄 간격 (%)',80,300,5],['textIndent','들여쓰기 (pt)',-72,144,1],['marginLeft','왼쪽 여백 (pt)',0,144,1],['marginRight','오른쪽 여백 (pt)',0,144,1],['spaceBefore','문단 앞 (pt)',0,72,1],['spaceAfter','문단 뒤 (pt)',0,72,1]];
  spacingPanel.innerHTML=spacingFields.map(([key,label,min,max,step])=>'<label>'+label+' <input type="number" data-spacing="'+key+'" aria-label="'+label+'" min="'+min+'" max="'+max+'" step="'+step+'" placeholder="원본"></label>').join('');toolbar.append(spacingPanel);
  spacingToggle.addEventListener('click',()=>{spacingPanel.hidden=!spacingPanel.hidden;spacingToggle.setAttribute('aria-expanded',String(!spacingPanel.hidden));});
  const scroll=document.createElement('div');scroll.className='dfcw-paper-scroll';scroll.append(frame);host.replaceChildren(toolbar,scroll);
  let cancelLoad;
  const ready=new Promise((resolve,reject)=>{cancelLoad=()=>reject(Error('문서 작성 화면이 닫혔습니다.'));frame.onload=()=>{if(destroyed||!host.isConnected||!frame.isConnected)return cancelLoad();resolve();};frame.onerror=()=>reject(Error('원본 문서 화면을 열지 못했습니다.'));});
  const loadWatch=new MutationObserver(()=>{if(!host.isConnected||!frame.isConnected)cancelLoad();});loadWatch.observe(host.ownerDocument,{childList:true,subtree:true});
  frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;
  try{await ready;}catch(error){toolbar.remove();scroll.remove();throw error;}finally{loadWatch.disconnect();frame.onload=null;frame.onerror=null;}
  if(!host.isConnected||!frame.isConnected){toolbar.remove();scroll.remove();throw Error('문서 작성 화면이 닫혔습니다.');}
  const content=frame.contentDocument,body=content.body;
  // HWP line-spacing is relative to its character size, never the browser's
  // default 16px body. Apply the already-derived native run size to each para.
  const probe=content.createElement('p');probe.className='Normal';probe.style.cssText='position:absolute;visibility:hidden;height:0;overflow:hidden';const run=content.createElement('span');run.className='lang-ko charshape-0';probe.append(run);body.append(probe);
  const baseSize=content.defaultView.getComputedStyle(run).fontSize;if(baseSize)body.style.fontSize=baseSize;
  for(const p of content.querySelectorAll('p[data-hwp-p]')){const info=byIndex.get(Number(p.dataset.hwpP));run.className='lang-ko charshape-'+(info?.charShapes?.[0]?.id||0);probe.className=p.className;const size=content.defaultView.getComputedStyle(run).fontSize;if(size)p.style.fontSize=size;}
  probe.remove();signatureColumns(content,type,common);
  const originalInline=new Map([...content.querySelectorAll('[data-hwp-p]')].map(p=>[p.dataset.hwpP,Object.fromEntries(['font-family','font-size','font-weight','font-style','text-decoration','text-align','letter-spacing','line-height','text-indent','padding-left','margin-left','margin-right','margin-top','margin-bottom','transform','transform-origin','width'].map(k=>[k,{value:p.style.getPropertyValue(k),priority:p.style.getPropertyPriority(k)}]))]));
  const decorate=()=>{signatureColumns(content,type,common);root.DF_CONTRACT_FORM_LAYOUT?.apply(content,type,{native,common});for(const p of content.querySelectorAll('[data-hwp-p]'))formatParagraph(p,styles[p.dataset.hwpP]);};decorate();
  const size=()=>{if(!destroyed&&frame.isConnected)frame.style.height=Math.ceil(body.getBoundingClientRect().height+12)+'px';};
  const observer=new ResizeObserver(size);observer.observe(body);content.fonts?.ready.then(size);body.querySelectorAll('img').forEach(img=>img.addEventListener('load',size));
  const lastCommitted=new Map([...content.querySelectorAll('[data-hwp-p]')].map(p=>[Number(p.dataset.hwpP),p.textContent.replace(/[\r\n]+/g,' ')]));
  const currentFormat=()=>({...byIndex.get(Number(selected))?.format,...styles[selected]});
  const syncToolbar=()=>{
   const p=selected&&content.querySelector('[data-hwp-p="'+selected+'"]'),f=currentFormat();toolbar.querySelector('.dfcw-format-target').textContent=p?.getAttribute('aria-label')||'수정할 문단 선택';
   toolbar.querySelectorAll('button,input,select').forEach(n=>n.disabled=!enabled||!p||!!composingParagraph);
   const face=toolbar.querySelector('select'),font=f.fontFamily||'';if(font&&![...face.options].some(o=>o.value===font)){const o=document.createElement('option');o.value=font;o.textContent=font;face.append(o);}face.value=font;toolbar.querySelector('input').value=f.fontSize??'';
   for(const b of toolbar.querySelectorAll('[aria-pressed]'))b.setAttribute('aria-pressed',String(f[b.dataset.format]===true));
   for(const input of spacingPanel.querySelectorAll('input'))input.value=f[input.dataset.spacing]??'';
  };
  const setEditable=value=>{enabled=!!value;if(!enabled)cancelPending();content.querySelectorAll('[data-hwp-editable]').forEach(n=>{n.contentEditable=enabled?'plaintext-only':'false';n.setAttribute('aria-readonly',String(!enabled));});syncToolbar();};setEditable(enabled);
  const emit=index=>options.onChange?.({type,index,text:overrides[index]??content.querySelector('[data-hwp-p="'+index+'"]')?.textContent??'',commonPatch:{},overrides:{...overrides},styles:JSON.parse(JSON.stringify(styles))});
  const applyFormat=(patch,reset=false)=>{
   flushPending();const p=selected&&content.querySelector('[data-hwp-p="'+selected+'"]');if(!enabled||!p||destroyed)return;
   if(reset)delete styles[selected];else{const next=cleanFormat({...styles[selected],...patch});if(Object.keys(next).length)styles[selected]=next;else delete styles[selected];}
   const text=p.textContent,offset=selectionOffset(p);p.innerHTML=originals.get(Number(selected))||'';replaceText(p,text);for(const [key,old]of Object.entries(originalInline.get(selected)||{}))if(old.value)p.style.setProperty(key,old.value,old.priority);else p.style.removeProperty(key);
   decorate();if(document.activeElement===frame)restoreSelection(p,offset);syncToolbar();emit(Number(selected));size();
  };
  toolbar.querySelectorAll('button[data-format]').forEach(b=>{b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{const key=b.dataset.format;if(key==='reset')applyFormat({},true);else if(['left','center','right'].includes(key))applyFormat({textAlign:key});else applyFormat({[key]:!(currentFormat()[key]===true)});});});
  toolbar.querySelector('select').addEventListener('change',e=>applyFormat({fontFamily:e.target.value||null}));
  const fontSizeInput=toolbar.querySelector('input');
  fontSizeInput.addEventListener('input',e=>{const value=Number(e.target.value);if(e.target.value!==''&&(!Number.isFinite(value)||value<6||value>96))return;applyFormat({fontSize:e.target.value===''?null:value});});
  fontSizeInput.addEventListener('change',e=>{const value=Number(e.target.value);if(e.target.value!==''&&(!Number.isFinite(value)||value<6||value>96)){syncToolbar();return;}applyFormat({fontSize:e.target.value===''?null:value});});
  for(const input of spacingPanel.querySelectorAll('input')){const change=event=>{const value=Number(input.value),valid=input.value===''||Number.isFinite(value)&&value>=Number(input.min)&&value<=Number(input.max);if(!valid){if(event.type==='change')syncToolbar();return;}applyFormat({[input.dataset.spacing]:input.value===''?null:value});};input.addEventListener('input',change);input.addEventListener('change',change);}
  body.addEventListener('focusin',event=>{const p=event.target.closest('[data-hwp-format]');if(p){selected=p.dataset.hwpP;syncToolbar();}});
  body.addEventListener('click',event=>{const p=event.target.closest('[data-hwp-format]');if(p){selected=p.dataset.hwpP;syncToolbar();}});
  body.addEventListener('keydown',event=>{const p=event.target.closest('[data-hwp-editable]');if(!p||event.isComposing||composingParagraph||event.keyCode===229)return;if(event.key==='Enter')event.preventDefault();const key={b:'bold',i:'italic',u:'underline'}[event.key.toLowerCase()];if(key&&(event.ctrlKey||event.metaKey)){event.preventDefault();selected=p.dataset.hwpP;applyFormat({[key]:!(currentFormat()[key]===true)});}});
  body.addEventListener('paste',event=>{const p=event.target.closest('[data-hwp-editable]');if(!p)return;event.preventDefault();if(!enabled)return;const text=(event.clipboardData?.getData('text/plain')||'').replace(/[\r\n]+/g,' ');content.execCommand('insertText',false,text);});
  function commitParagraph(p){
   if(!p||!p.isConnected||!enabled||destroyed)return false;
   const index=Number(p.dataset.hwpP),text=p.textContent.replace(/[\r\n]+/g,' '),offset=selectionOffset(p);if(lastCommitted.get(index)===text)return false;
   const raw=byIndex.get(index)?.rawText?.replace(/\r$/,'')||'';overrides[index]=retainAnchors(raw,text);
   // Reapply source run styles, including mixed-font labels, after plaintext paste.
   p.innerHTML=originals.get(index)||'';replaceText(p,text);restoreSelection(p,offset);
   let patch={};if(typeof model.extractCommon==='function'){
    const next=model.extractCommon(type,index,text,common)||common;
    for(const [key,value]of Object.entries(next))if(common[key]!==value)patch[key]=value;
    if(Object.keys(patch).length){Object.assign(common,patch);delete overrides[index];}
   }
   lastCommitted.set(index,text);formatParagraph(p,styles[index]);options.onChange?.({type,index,text:overrides[index]??text,commonPatch:patch,overrides:{...overrides},styles:JSON.parse(JSON.stringify(styles))});size();return true;
  }
  function flushPending(){const p=pendingParagraph||composingParagraph;cancelPending();const changed=commitParagraph(p);syncToolbar();return changed;}
  function deferComposition(p){pendingParagraph=p;if(compositionTimer!==null)root.clearTimeout(compositionTimer);compositionTimer=root.setTimeout(()=>{compositionTimer=null;if(composingParagraph||destroyed||!enabled)return;flushPending();},0);}
  body.addEventListener('compositionstart',event=>{const p=event.target.closest('[data-hwp-editable]');if(!p||!enabled||destroyed)return;if(pendingParagraph&&pendingParagraph!==p)flushPending();composingParagraph=p;pendingParagraph=p;explicitComposition=true;selected=p.dataset.hwpP;syncToolbar();});
  body.addEventListener('compositionend',event=>{const p=event.target.closest('[data-hwp-editable]');if(!p||!enabled||destroyed)return;composingParagraph=null;explicitComposition=false;deferComposition(p);syncToolbar();});
  body.addEventListener('input',event=>{const p=event.target.closest('[data-hwp-editable]');if(!p||!enabled||destroyed)return;if(event.isComposing){composingParagraph=p;pendingParagraph=p;return;}if(composingParagraph&&explicitComposition){pendingParagraph=p;return;}if(composingParagraph||pendingParagraph===p){composingParagraph=null;deferComposition(p);return;}commitParagraph(p);});
  body.addEventListener('focusout',()=>{
   if(destroyed)return;flushPending();const next=changes();for(const p of content.querySelectorAll('[data-hwp-p]')){const index=Number(p.dataset.hwpP);if(!Object.prototype.hasOwnProperty.call(next,index)||p.contains(content.activeElement))continue;p.innerHTML=originals.get(index)||'';replaceText(p,next[index]);lastCommitted.set(index,p.textContent.replace(/[\r\n]+/g,' '));}decorate();size();
  });size();
  return {destroy(){destroyed=true;cancelPending();observer.disconnect();toolbar.remove();scroll.remove();},setEditable,changes,flushPending,styles:()=>JSON.parse(JSON.stringify(styles)),
   html(){flushPending();const copy=content.documentElement.cloneNode(true);copy.querySelectorAll('[contenteditable]').forEach(p=>{p.removeAttribute('contenteditable');p.removeAttribute('role');p.removeAttribute('aria-readonly');});return '<!doctype html>'+copy.outerHTML;},frame,
   update(values){if(values.common)common={...values.common};if(values.overrides)overrides={...values.overrides};if(values.styles)styles=cleanStyles(values.styles,validIndices);},
  };
 }
 root.DF_CONTRACT_FORM_EDITOR={mount,_test:{replaceText,showText,retainAnchors,signatureColumns,cleanFormat,cleanStyles,formatParagraph}};
})(window);
