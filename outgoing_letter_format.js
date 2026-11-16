/* Paragraph levels for outgoing letters. Only the level is stored; markers are rendered. */
(function(){
  'use strict';
  const block='p,div',levels='[data-dl-level],[data-dl-indent]',circled=Array.from('㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻');
  const initials=[0,2,3,5,6,7,9,11,12,14,15,16,17,18],vowels=[0,4,8,13,18,20,1,5,11,16];
  const hangul=vowels.flatMap(v=>initials.map(i=>String.fromCodePoint(0xac00+588*i+28*v)));
  const fonts=Object.freeze({gothic:'Malgun Gothic',batang:'Batang',dotum:'Dotum'});
  const depth=v=>/^[0-7]$/.test(String(v??''))?Number(v):null;
  function label(d,n){
    const h=hangul[n-1]||String(n),circle=n<=20?0x245f+n:n<=35?0x3251+n-21:n<=50?0x32b1+n-36:0;
    return [n+'.',h+'.',n+')',h+')','('+n+')','('+h+')',circle?String.fromCodePoint(circle):'('+n+')',circled[n-1]||'('+h+')'][d];
  }
  function walker(){
    const counters=Array(8).fill(0);
    return d=>{for(let i=d+1;i<counters.length;i++)counters[i]=0;return label(d,++counters[d]);};
  }
  function fontKey(source){
    const font=String(source??'').split(',')[0].replace(/["']/g,'').trim().toLowerCase();
    return Object.keys(fonts).find(k=>fonts[k].toLowerCase()===font||k===font)||null;
  }
  function nodes(p){return Array.from(p.childNodes).flatMap(n=>n.nodeType===1&&n.hasAttribute('data-dl-marker')?[]:n.nodeType===1&&n.hasAttribute('data-dl-text')?Array.from(n.childNodes):[n]);}
  function decorate(root){
    const next=walker();
    for(const p of root.querySelectorAll(levels)){
      if(!p.matches(block))continue;
      const d=depth(p.dataset.dlLevel),indent=depth(p.dataset.dlIndent),live=d??indent;
      if(live===null)continue;
      p.style.marginInlineStart=(2*live)+'ch';
      let marker=p.querySelector(':scope > [data-dl-marker]'),text=p.querySelector(':scope > [data-dl-text]');
      if(d===null){if(marker||text)p.replaceChildren(...nodes(p));continue;}
      if(!marker||!text){
        const content=nodes(p);marker=document.createElement('span');text=document.createElement('span');
        marker.dataset.dlMarker='';marker.contentEditable='false';marker.setAttribute('contenteditable','false');
        text.dataset.dlText='';text.append(...content);if(!text.hasChildNodes())text.append(document.createElement('br'));
        p.replaceChildren(marker,text);
      }
      const value=next(d);if(marker.textContent!==value)marker.textContent=value;
    }
  }
  function canonical(p,d,numbered){
    delete p.dataset.dlLevel;delete p.dataset.dlIndent;p.style.removeProperty('margin-inline-start');
    if(numbered||d>0)p.dataset[numbered?'dlLevel':'dlIndent']=String(d);
    if(!numbered&&p.querySelector(':scope > [data-dl-text]'))p.replaceChildren(...nodes(p));
  }
  function knownPrefix(value,justMarker=false){
    const suffix=justMarker?'$':'(?:[\\t \\xa0]+|$)';
    const h='['+hangul.join('')+']';
    const expr=['\\d+\\.',h+'\\.','\\d+\\)',h+'\\)','\\(\\d+\\)','\\('+h+'\\)','[①-⑳㉑-㉟㊱-㊿]','[㉮-㉻]'];
    for(let d=0;d<expr.length;d++){const m=value.match(new RegExp('^[\\t \\xa0]*'+expr[d]+suffix));if(m)return {d,length:m[0].length};}
    return null;
  }
  function content(p){return p.querySelector(':scope > [data-dl-text]')||p;}
  function strip(p,count){
    const seen=document.createTreeWalker(content(p),4);let n;
    while(count&&(n=seen.nextNode())){const take=Math.min(count,n.length);n.deleteData(0,take);count-=take;}
  }
  function place(p,atEnd=true){
    const range=document.createRange();range.selectNodeContents(content(p));range.collapse(!atEnd);
    const s=window.getSelection();s.removeAllRanges();s.addRange(range);
  }
  function paragraph(root,range){
    const {startContainer:n,startOffset:o}=range;
    const direct=(node)=>{while(node?.parentNode&&node.parentNode!==root&&node!==root)node=node.parentNode;return node&&node!==root?node:null;};
    const hit=n===root?(root.childNodes[o]||root.lastChild):direct(n);
    if(hit?.nodeType===1&&hit.matches(block))return hit;
    if(hit?.nodeType===1&&hit.matches('ol,ul'))return null;
    const p=document.createElement('div');let first=hit;
    while(first?.previousSibling&&!(first.previousSibling.nodeType===1&&first.previousSibling.matches('br,p,div,ol,ul')))first=first.previousSibling;
    if(first)root.insertBefore(p,first);else root.append(p);
    for(let item=first;item;){
      if(item.nodeType===1&&item.matches('br,p,div,ol,ul')){if(item.matches('br')&&!p.hasChildNodes())p.append(item);break;}
      const after=item.nextSibling;p.append(item);item=after;
    }
    if(!p.hasChildNodes())p.append(document.createElement('br'));return p;
  }
  function change(root,range,op){
    if(!range)return false;
    const selected=range.collapsed?[]:Array.from(root.children).filter(p=>p.matches(block)&&range.intersectsNode(p));
    const items=selected.length?selected:[paragraph(root,range)].filter(Boolean);
    if(!items.length)return false;
    const unnumber=op==='number'&&items.every(p=>p.hasAttribute('data-dl-level'));
    for(const p of items){
      const active=depth(p.dataset.dlLevel),plain=depth(p.dataset.dlIndent)||0;
      const typed=active===null&&knownPrefix(p.textContent);
      if(op==='number'){
        if(unnumber)canonical(p,active,false);
        else if(active===null){if(typed)strip(p,typed.length);canonical(p,typed?typed.d:plain,true);}
      }else{
        const d=active??(typed?typed.d:plain);
        if(typed)strip(p,typed.length);
        const step=op==='indent'?Math.min(7,d+1):Math.max(0,d-1);
        canonical(p,step,active!==null||!!typed);
      }
    }
    decorate(root);place(items[items.length-1]);return true;
  }
  function keydown(root,event){
    if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey)return false;
    const s=window.getSelection();if(!s?.rangeCount||!root.contains(s.anchorNode)||!root.contains(s.focusNode))return false;
    const r=s.getRangeAt(0),at=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;
    const p=at.closest(block.split(',').map(x=>x+'[data-dl-level],'+x+'[data-dl-indent]').join(','));
    if(p&&root.contains(p)&&event.key==='Tab')return change(root,r,event.shiftKey?'outdent':'indent');
    if(!r.collapsed||event.shiftKey)return false;
    if(event.key===' '&&(!p||!p.hasAttribute('data-dl-level'))){
      const closest=at===root?root:at.closest(block);
      if(!closest||!root.contains(closest)||at.closest('ol,ul'))return false;
      const prefix=knownPrefix(closest.textContent,true);if(!prefix)return false;
      const target=paragraph(root,r);if(!target)return false;
      strip(target,prefix.length);canonical(target,prefix.d,true);decorate(root);place(target);return true;
    }
    if(!p||!root.contains(p))return false;
    const d=depth(p.dataset.dlLevel),indent=depth(p.dataset.dlIndent)||0,t=content(p);
    if(event.key==='Backspace'&&t.contains(r.startContainer)){
      const prior=document.createRange();prior.selectNodeContents(t);prior.setEnd(r.startContainer,r.startOffset);
      if(!prior.toString()){canonical(p,Math.max(0,(d??indent)-1),d!==null&&d>0);decorate(root);place(p,false);return true;}
    }
    if(event.key!=='Enter')return false;
    if(!t.textContent.trim()){
      if(d===null&&indent===0)return false;
      canonical(p,d===null?0:Math.max(0,d-1),d!==null&&d>0);decorate(root);place(p);return true;
    }
    const tail=document.createRange();tail.selectNodeContents(t);
    if(t.contains(r.startContainer))tail.setStart(r.startContainer,r.startOffset);
    else tail.collapse(false);
    const after=tail.extractContents(),next=document.createElement('div');
    next.append(after);if(!next.textContent&&!next.querySelector('br'))next.append(document.createElement('br'));
    if(t!==p&&!t.textContent&&!t.querySelector('br'))t.append(document.createElement('br'));
    p.after(next);canonical(next,d??indent,d!==null);decorate(root);place(next,false);return true;
  }
  function template(root,value){
    root.replaceChildren();
    for(const line of value.split('\n')){
      const p=document.createElement('div'),item=knownPrefix(line),text=item?line.slice(item.length):line;
      if(item)canonical(p,item.d,true);
      p.append(text?document.createTextNode(text):document.createElement('br'));root.append(p);
    }
    decorate(root);
  }
  window.DF_OUTGOING_LETTER_FORMAT=Object.freeze({fonts,fontKey,depth,walker,decorate,change,keydown,template});
})();
