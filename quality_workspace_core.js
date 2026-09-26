(function(root){'use strict';
 const TAGS=new Set('P DIV SPAN BR B STRONG I EM U S SUB SUP TABLE TBODY THEAD TFOOT TR TD TH COLGROUP COL UL OL LI H1 H2 H3 H4 HR'.split(' '));
 const STYLES=new Set('font-family font-size font-weight font-style color background-color text-decoration text-decoration-line text-align text-indent line-height letter-spacing margin margin-left margin-right margin-top margin-bottom padding padding-left padding-right padding-top padding-bottom width height min-height max-width vertical-align border border-left border-right border-top border-bottom border-collapse table-layout white-space break-after break-before list-style-type'.split(' '));
 // Browsers enumerate border shorthands as longhands. Retain the complete
 // width/style/color triplet, including an explicitly borderless edge.
 for(const edge of ['top','right','bottom','left'])for(const part of ['width','style','color'])STYLES.add('border-'+edge+'-'+part);
 for(const p of ['border-width','border-style','border-color','border-spacing','word-break','word-spacing'])STYLES.add(p);
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
     for(const p of Array.from(n.style||[])){const v=n.style.getPropertyValue(p);if((STYLES.has(p)||p==='display'&&v==='inline-block')&&!/[<>\\]|url\s*\(|expression|@import|javascript|behavior/i.test(v)&&v.length<240)css.setProperty(p,v);}
     const attrs={};for(const key of ['colspan','rowspan','span','start']){const val=Number(n.getAttribute(key));if(Number.isInteger(val)&&val>0&&val<=100)attrs[key]=String(val);}
     const page=n.hasAttribute('data-page-break'),warning=n.getAttribute('data-source-warning'),format=n.getAttribute('data-qw-format'),number=n.getAttribute('data-qw-number'),endline=n.getAttribute('data-qw-endline');
     if(n.getAttribute('align')&&/^(left|center|right|justify)$/.test(n.getAttribute('align')))css.textAlign=n.getAttribute('align');
     for(const a of Array.from(n.attributes))n.removeAttribute(a.name);
     if(css.cssText)n.setAttribute('style',css.cssText);
     for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);
     if(page)n.setAttribute('data-page-break','1');if(warning)n.setAttribute('data-source-warning','object');
     if(format==='2'&&['P','TABLE'].includes(n.tagName))n.setAttribute('data-qw-format','2');
     if(number==='1'&&n.tagName==='SPAN')n.setAttribute('data-qw-number','1');
     if(endline==='1'&&n.tagName==='BR')n.setAttribute('data-qw-endline','1');walk(n);
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
   if(meta.title&&meta.originalTitle&&normalized(meta.title)!==normalized(meta.originalTitle)){
    for(const cell of div.querySelectorAll('td'))if(normalized(cell.textContent)===normalized(meta.originalTitle))replaceText(cell,meta.title);
   }
   const walker=doc.createTreeWalker(div,4);let n;
   while((n=walker.nextNode())){
    n.nodeValue=n.nodeValue.replace(/DFEN-Q[MPI]-\d{2}/g,meta.key)
     .replace(/Rev\.\s*\d+/gi,'Rev.'+String(meta.revision).padStart(2,'0'))
     .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g,pageNumber+' / '+total);
    if(meta.status!=='source'&&!(meta.status==='correction'&&!meta.effectiveDate))n.nodeValue=n.nodeValue.replace(/20\d{2}[.-]\d{2}[.-]\d{2}/g,meta.effectiveDate||'승인 전');
   }return div.innerHTML;
 }
 const normalized=s=>String(s||'').replace(/\s/g,'');
 function replaceText(cell,value){
   const walker=cell.ownerDocument.createTreeWalker(cell,4),nodes=[];let n;
   while((n=walker.nextNode()))if(n.nodeValue.trim())nodes.push(n);
   if(!nodes.length){cell.textContent=value;return;}
   nodes[0].nodeValue=value;for(const node of nodes.slice(1))node.nodeValue='';
 }
 function tocRows(area){
   const found=[];
   for(const table of area.querySelectorAll('table')){
    const rows=Array.from(table.rows),heading=rows.slice(0,3).find(r=>Array.from(r.cells).some(c=>normalized(c.textContent)==='개정번호'));
    if(!heading)continue;
    for(const row of rows){const cells=Array.from(row.cells),keyCell=cells.find(c=>/^DFEN-Q[MPI]-\d{2}$/.test(normalized(c.textContent)));if(!keyCell)continue;
     const key=normalized(keyCell.textContent),revisionCell=cells.at(-1),titleCell=cells[cells.indexOf(keyCell)-1];
     const pageCell=cells[cells.indexOf(keyCell)+1];
     if(revisionCell!==keyCell&&/^\d+$/.test(revisionCell.textContent.trim()))found.push({key,revisionCell,titleCell:titleCell!==revisionCell&&titleCell!==keyCell?titleCell:null,pageCell:pageCell!==revisionCell?pageCell:null,row});
    }
   }return found;
 }
 function revisionHints(payload,field='header',doc=root.document){
   const values=[];for(const s of payload.sections||[]){const div=doc.createElement('div');div.innerHTML=sanitize(s[field]||'',doc);for(const m of div.textContent.matchAll(/Rev\.\s*(\d{1,4})/gi))values.push(Number(m[1]));}return [...new Set(values)];
 }
 // Live metadata is derived from the current record; historical HTML stays unchanged.
 // Preserve each original cell so collecting an editable body cannot save an
 // unrelated document's later approval into this document's historical payload.
 function unbindToc(area){
   for(const cell of area.querySelectorAll('[data-qw-toc-original]')){
     cell.innerHTML=cell.getAttribute('data-qw-toc-original');
     for(const a of ['data-qw-toc-original','data-qw-toc-revision','data-qw-toc-title','data-qw-toc-page','contenteditable','title'])cell.removeAttribute(a);
   }for(const row of area.querySelectorAll('[data-qw-toc-target]')){row.removeAttribute('data-qw-toc-target');row.removeAttribute('tabindex');row.removeAttribute('role');row.removeAttribute('aria-label');}return area;
 }
 function bindToc(area,approved){
   unbindToc(area);let count=0;
   for(const {key,revisionCell:cell,titleCell,pageCell,row} of tocRows(area)){
     const record=approved[key];if(!record||!['active','source','correction'].includes(record.status)||!Number.isInteger(record.revision))continue;
     cell.setAttribute('data-qw-toc-original',cell.innerHTML);cell.setAttribute('data-qw-toc-revision',key);
     cell.contentEditable='false';cell.setAttribute('contenteditable','false');cell.title='현재 등록번호 Rev.'+String(record.revision).padStart(2,'0')+' · 매칭 탭에서 정정';
     replaceText(cell,String(record.revision).padStart(2,'0'));count++;
     row.dataset.qwTocTarget=key;
     if(pageCell&&/^\d+$/.test(pageCell.textContent.trim())){pageCell.setAttribute('data-qw-toc-original',pageCell.innerHTML);pageCell.dataset.qwTocPage=key;pageCell.setAttribute('contenteditable','false');pageCell.title='쪽수는 앞쪽 전체 미리보기에서 자동 계산됩니다.';}
     const prefix=titleCell?.textContent.match(/^\s*\d+(?:\.\d+)*\.?\s*/)?.[0]||'';
     if(titleCell&&record.title){
      titleCell.setAttribute('data-qw-toc-original',titleCell.innerHTML);titleCell.setAttribute('data-qw-toc-title',key);titleCell.setAttribute('contenteditable','false');titleCell.title='문서 제목은 매칭 탭에서 변경할 수 있습니다.';if(normalized(titleCell.textContent.slice(prefix.length))!==normalized(record.title))replaceText(titleCell,prefix+record.title);
     }
   }return count;
 }
 function bindTocPages(area,pages){for(const cell of area.querySelectorAll('[data-qw-toc-page]')){const page=pages[cell.dataset.qwTocPage];if(Number.isInteger(page))replaceText(cell,String(page));}}
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
 root.DFQualityCore={sanitize,payload,clone,bindHeader,bindToc,unbindToc,tocRows,bindTocPages,revisionHints,SaveQueue};
 if(typeof module!=='undefined')module.exports=root.DFQualityCore;
})(typeof window!=='undefined'?window:globalThis);
