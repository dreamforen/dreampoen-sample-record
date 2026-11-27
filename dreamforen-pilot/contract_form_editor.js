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
 function styledSlice(p,start,end){
  const copy=p.cloneNode(true);for(const column of copy.querySelectorAll('.dfcw-sign-column'))column.replaceWith(...column.childNodes);
  let pos=0;for(const n of runs(copy)){const a=pos,b=pos+n.data.length;pos=b;n.data=n.data.slice(Math.max(0,start-a),Math.max(0,Math.min(n.data.length,end-a)));if(b<=start||a>=end)n.data='';}
  const column=p.ownerDocument.createElement('span');column.className='dfcw-sign-column';column.append(...copy.childNodes);return column;
 }
 function signatureColumns(doc,type,common){
  if(type!=='contract')return;
  for(const index of [45,46,47]){const p=doc.querySelector('[data-hwp-p="'+index+'"]');if(!p)continue;const text=p.textContent;let at=index===45?text.indexOf('측정대행업자'):text.lastIndexOf('대표자 성명');
   if(index===46){
    const left=styledSlice(p,0,text.length),right=styledSlice(p,0,text.length),parts=String(common.client_address||'').split(/\r?\n/),address=parts[0]||'',rest=parts.slice(1).join(' ');
    replaceText(left,'    사업장 주소 '+address+(rest?'\n                  '+rest:''));
    replaceText(right,'사업장 주소 경기도 안양시 만안구 덕천로\n              152번길 25, B동 2005호');p.replaceChildren(left,right);
   }else if(at>0){const end=text.slice(0,at).trimEnd().length;p.replaceChildren(styledSlice(p,0,end),styledSlice(p,at,text.length));}else continue;
   p.classList.add('dfcw-sign-columns');
  }
 }
 function selectionOffset(node){const selection=node.ownerDocument.getSelection();if(!selection?.rangeCount||!node.contains(selection.anchorNode))return null;const range=selection.getRangeAt(0).cloneRange();range.selectNodeContents(node);range.setEnd(selection.anchorNode,selection.anchorOffset);return range.toString().length;}
 function restoreSelection(node,offset){if(offset===null)return;const doc=node.ownerDocument,selection=doc.getSelection(),range=doc.createRange();let left=offset;for(const n of runs(node)){if(left<=n.length){range.setStart(n,left);range.collapse(true);selection.removeAllRanges();selection.addRange(range);return;}left-=n.length;}range.selectNodeContents(node);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}
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
  const changes=()=>model.buildChanges(type,common,overrides);
  const parser=new DOMParser(),doc=parser.parseFromString(source.html,'text/html');
  doc.querySelectorAll('script,iframe,object,embed').forEach(n=>n.remove());doc.querySelectorAll('link[rel=stylesheet]').forEach(n=>n.remove());
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
  }
  const frame=document.createElement('iframe');frame.className='dfcw-original-frame';frame.title=({contract:'표준계약서',plan:'과업수행계획서',notice:'계약체결사실통보서'}[type])+' 원본 작성';frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('scrolling','no');frame.style.cssText='width:calc(210mm + 8px);border:0;display:block;margin:0 auto;min-height:297mm;overflow:hidden';
  host.replaceChildren(frame);
  let cancelLoad;
  const ready=new Promise((resolve,reject)=>{cancelLoad=()=>reject(Error('문서 작성 화면이 닫혔습니다.'));frame.onload=()=>{if(destroyed||!host.isConnected||!frame.isConnected)return cancelLoad();resolve();};frame.onerror=()=>reject(Error('원본 문서 화면을 열지 못했습니다.'));});
  const loadWatch=new MutationObserver(()=>{if(!host.isConnected||!frame.isConnected)cancelLoad();});loadWatch.observe(host.ownerDocument,{childList:true,subtree:true});
  frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;
  try{await ready;}catch(error){frame.remove();throw error;}finally{loadWatch.disconnect();frame.onload=null;frame.onerror=null;}
  if(!host.isConnected||!frame.isConnected){frame.remove();throw Error('문서 작성 화면이 닫혔습니다.');}
  const content=frame.contentDocument,body=content.body;
  // HWP line-spacing is relative to its character size, never the browser's
  // default 16px body. Apply the already-derived native run size to each para.
  const probe=content.createElement('p');probe.className='Normal';probe.style.cssText='position:absolute;visibility:hidden;height:0;overflow:hidden';const run=content.createElement('span');run.className='lang-ko charshape-0';probe.append(run);body.append(probe);
  const baseSize=content.defaultView.getComputedStyle(run).fontSize;if(baseSize)body.style.fontSize=baseSize;
  for(const p of content.querySelectorAll('p[data-hwp-p]')){const info=byIndex.get(Number(p.dataset.hwpP));run.className='lang-ko charshape-'+(info?.charShapes?.[0]?.id||0);probe.className=p.className;const size=content.defaultView.getComputedStyle(run).fontSize;if(size)p.style.fontSize=size;}
  probe.remove();signatureColumns(content,type,common);
  const size=()=>{if(!destroyed&&frame.isConnected)frame.style.height=Math.ceil(body.getBoundingClientRect().height+12)+'px';};
  const observer=new ResizeObserver(size);observer.observe(body);content.fonts?.ready.then(size);body.querySelectorAll('img').forEach(img=>img.addEventListener('load',size));
  const setEditable=value=>{enabled=!!value;content.querySelectorAll('[data-hwp-editable]').forEach(n=>{n.contentEditable=enabled?'plaintext-only':'false';n.setAttribute('aria-readonly',String(!enabled));});};setEditable(enabled);
  body.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.closest('[data-hwp-editable]'))event.preventDefault();});
  body.addEventListener('paste',event=>{const p=event.target.closest('[data-hwp-editable]');if(!p)return;event.preventDefault();if(!enabled)return;const text=(event.clipboardData?.getData('text/plain')||'').replace(/[\r\n]+/g,' ');content.execCommand('insertText',false,text);});
  body.addEventListener('input',event=>{
   const p=event.target.closest('[data-hwp-editable]');if(!p||!enabled||destroyed)return;
   const index=Number(p.dataset.hwpP),text=p.textContent.replace(/[\r\n]+/g,' '),offset=selectionOffset(p);const raw=byIndex.get(index)?.rawText?.replace(/\r$/,'')||'';overrides[index]=retainAnchors(raw,text);
   // Reapply source run styles, including mixed-font labels, after plaintext paste.
   p.innerHTML=originals.get(index)||'';replaceText(p,text);restoreSelection(p,offset);
   let patch={};if(typeof model.extractCommon==='function'){
    const next=model.extractCommon(type,index,text,common)||common;
    for(const [key,value]of Object.entries(next))if(common[key]!==value)patch[key]=value;
    if(Object.keys(patch).length){Object.assign(common,patch);delete overrides[index];}
   }
   options.onChange?.({type,index,text:overrides[index]??text,commonPatch:patch,overrides:{...overrides}});size();
  });
  body.addEventListener('focusout',()=>{
   if(destroyed)return;const next=changes();for(const p of content.querySelectorAll('[data-hwp-p]')){const index=Number(p.dataset.hwpP);if(!Object.prototype.hasOwnProperty.call(next,index)||p.contains(content.activeElement))continue;p.innerHTML=originals.get(index)||'';replaceText(p,next[index]);}signatureColumns(content,type,common);size();
  });size();
  return {destroy(){destroyed=true;observer.disconnect();frame.remove();},setEditable,changes,
   html(){const copy=content.documentElement.cloneNode(true);copy.querySelectorAll('[contenteditable]').forEach(p=>{p.removeAttribute('contenteditable');p.removeAttribute('role');p.removeAttribute('aria-readonly');});return '<!doctype html>'+copy.outerHTML;},frame,
   update(values){if(values.common)common={...values.common};if(values.overrides)overrides={...values.overrides};},
  };
 }
 root.DF_CONTRACT_FORM_EDITOR={mount,_test:{replaceText,showText,retainAnchors,signatureColumns}};
})(window);
