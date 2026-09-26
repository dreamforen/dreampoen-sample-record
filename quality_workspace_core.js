(function(root){'use strict';
 const TAGS=new Set('P DIV SPAN BR B STRONG I EM U S SUB SUP TABLE TBODY THEAD TFOOT TR TD TH COLGROUP COL UL OL LI H1 H2 H3 H4 HR'.split(' '));
 const STYLES=new Set('font-family font-size font-weight font-style color background-color text-decoration text-decoration-line text-align text-indent line-height letter-spacing margin margin-left margin-right margin-top margin-bottom padding padding-left padding-right padding-top padding-bottom width height min-height max-width vertical-align border border-left border-right border-top border-bottom border-collapse table-layout white-space break-after break-before list-style-type'.split(' '));
 const DROP=new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH TEMPLATE LINK META FORM INPUT BUTTON TEXTAREA SELECT NOSCRIPT'.split(' '));
 function sanitize(html,doc=root.document){
   if(typeof html!=='string'||html.length>4000000)throw Error('본문 크기를 확인하세요.');
   const t=doc.createElement('template');t.innerHTML=html;
   function walk(parent){for(const n of Array.from(parent.childNodes)){
     if(n.nodeType===8){n.remove();continue;}if(n.nodeType!==1)continue;
     if(DROP.has(n.tagName)){n.remove();continue;}
     if(n.tagName==='FONT'){const s=doc.createElement('span');if(n.getAttribute('face'))s.style.fontFamily=n.getAttribute('face');if(n.getAttribute('color'))s.style.color=n.getAttribute('color');s.append(...n.childNodes);n.replaceWith(s);walk(parent);return;}
     if(!TAGS.has(n.tagName)){walk(n);n.replaceWith(...n.childNodes);continue;}
     const css=doc.createElement('span').style;
     for(const p of Array.from(n.style||[])){const v=n.style.getPropertyValue(p);if(STYLES.has(p)&&!/[<>\\]|url\s*\(|expression|@import|javascript|behavior/i.test(v)&&v.length<240)css.setProperty(p,v);}
     const attrs={};for(const key of ['colspan','rowspan','span','start']){const val=Number(n.getAttribute(key));if(Number.isInteger(val)&&val>0&&val<=100)attrs[key]=String(val);}
     const page=n.hasAttribute('data-page-break'),warning=n.getAttribute('data-source-warning');
     if(n.getAttribute('align')&&/^(left|center|right|justify)$/.test(n.getAttribute('align')))css.textAlign=n.getAttribute('align');
     for(const a of Array.from(n.attributes))n.removeAttribute(a.name);
     if(css.cssText)n.setAttribute('style',css.cssText);
     for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);
     if(page)n.setAttribute('data-page-break','1');if(warning)n.setAttribute('data-source-warning','object');walk(n);
   }}walk(t.content);return t.innerHTML;
 }
 const clone=v=>JSON.parse(JSON.stringify(v));
 function payload(p,doc=root.document){
   if(!p||p.format!=='dreamforen.quality.document.v1'||!Array.isArray(p.sections)||!p.sections.length||p.sections.length>100)throw Error('지원하지 않는 문서 형식입니다.');
   const result={format:p.format,layoutReviewed:p.layoutReviewed===true,source:{name:String(p.source?.name||'').slice(0,240),sha256:String(p.source?.sha256||''),basis:String(p.source?.basis||'').slice(0,240)},fonts:(p.fonts||[]).slice(0,50).map(String),issues:(p.issues||[]).slice(0,100).map(v=>String(v).slice(0,1000)),sections:p.sections.map(s=>{
     const defaults={width:595.28,height:841.89,left:56.7,right:56.7,top:42.52,bottom:42.52,header:85.04,footer:28.34},page={};
     for(const [k,def]of Object.entries(defaults)){let n=Number(s.page?.[k]);if(!Number.isFinite(n))n=def;page[k]=['width','height'].includes(k)?def:Math.min(180,Math.max(k==='header'?28:14,n));}
     return {page,header:sanitize(s.header||'',doc),footer:sanitize(s.footer||'',doc),html:sanitize(s.html||'<p><br></p>',doc)};
   })};
   if(JSON.stringify(result).length>4000000)throw Error('문서가 4MB를 초과합니다.');return result;
 }
 function bindHeader(html,meta,pageNumber,total,doc=root.document){
   const div=doc.createElement('div');div.innerHTML=sanitize(html,doc);
   const walker=doc.createTreeWalker(div,4);let n;
   while((n=walker.nextNode())){
    n.nodeValue=n.nodeValue.replace(/DFEN-Q[MPI]-\d{2}/g,meta.key)
     .replace(/Rev\.\s*\d+/gi,'Rev.'+String(meta.revision).padStart(2,'0'))
     .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g,pageNumber+' / '+total);
    if(meta.status!=='source')n.nodeValue=n.nodeValue.replace(/20\d{2}[.-]\d{2}[.-]\d{2}/g,meta.effectiveDate||'승인 전');
   }return div.innerHTML;
 }
 class SaveQueue{
   constructor({save,get,onState=()=>{},onSaved=()=>{}}){this.save=save;this.get=get;this.onState=onState;this.onSaved=onSaved;this.sequence=0;this.saved=0;this.timer=null;this.running=null;this.error=null;this.version=0;this.disposed=false;}
   reset(version){clearTimeout(this.timer);if(this.running)throw Error('저장 중에는 문서를 전환할 수 없습니다.');this.sequence=0;this.saved=0;this.error=null;this.version=version;this.disposed=false;}
   dirty(){return this.sequence!==this.saved;}
   change(){if(this.disposed)return;this.sequence++;this.onState('dirty');clearTimeout(this.timer);if(!this.error)this.timer=setTimeout(()=>this.flush().catch(()=>{}),1100);}
   async flush(checkpoint=false){
     clearTimeout(this.timer);if(this.running){await this.running;if(this.dirty()&&!this.error)return this.flush(checkpoint);return;}
     if(this.error)throw this.error;if(!this.dirty()&&!checkpoint)return;
     const seq=this.sequence,value=clone(this.get()),expected=this.version;this.onState('saving');
     this.running=(async()=>{try{const r=await this.save(value,expected,checkpoint);this.version=r.lock_version;this.saved=seq;this.onSaved(r);this.onState(this.dirty()?'dirty':'saved');}catch(e){this.error=e;this.onState('error',e);throw e;}finally{this.running=null;}})();
     await this.running;if(this.dirty()&&!this.error)return this.flush(false);
   }
   retry(){this.error=null;return this.flush();}
   dispose(){clearTimeout(this.timer);this.disposed=true;}
 }
 root.DFQualityCore={sanitize,payload,clone,bindHeader,SaveQueue};
 if(typeof module!=='undefined')module.exports=root.DFQualityCore;
})(typeof window!=='undefined'?window:globalThis);
