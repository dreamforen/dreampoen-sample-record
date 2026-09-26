/* One layout engine for the current-document reader and the workspace. */
(function(){'use strict';
 const C=window.DFQualityCore,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function render({documents,records={},live=true}){
  await document.fonts.ready;
  const measure=document.createElement('div');measure.style.cssText='position:absolute;left:-20000px;top:0;width:210mm;visibility:hidden;';document.body.append(measure);
  const pages=[];let overflow=false;
  try{
   for(const item of documents){const meta=item.meta;for(const section of item.payload.sections){
    let page,body,space;
    function addPage(){
     if(pages.length>=500)throw Error('500쪽을 초과했습니다. 문서 내용을 확인하세요.');
     page=document.createElement('article');page.className='paper print-paper';page.dataset.documentKey=meta.key;const p=section.page;
     page.style.padding=`${p.top}pt ${p.right}pt ${p.bottom}pt ${p.left}pt`;
     page.innerHTML=`<div class="draft-label">${esc(item.label||'')}${live&&meta.key.endsWith('-00')?' · 현재 등록번호 반영 목차':''}</div><div class="paper-header">${C.bindHeader(section.header,meta,1,1)}</div><div class="print-body"></div><div class="paper-footer">${C.bindHeader(section.footer,meta,1,1)}</div><div class="page-footline"><span>${esc(meta.key)} · Rev.${String(meta.revision).padStart(2,'0')} · ${meta.effectiveDate||'승인 전'}</span><span class="page-number"></span></div>`;
     measure.append(page);body=page.querySelector('.print-body');
     const h=page.querySelector('.paper-header'),f=page.querySelector('.paper-footer');h.style.minHeight=p.header+'pt';f.style.minHeight=p.footer+'pt';
     const heights=Array.from(page.children).filter(n=>n!==body).reduce((a,n)=>a+n.getBoundingClientRect().height,0);
     space=(p.height-p.top-p.bottom)*96/72-heights-2;body.style.height=Math.max(60,space)+'px';pages.push({page,section,meta});
    }
    function fits(n){body.append(n);const yes=body.scrollHeight<=body.clientHeight+1;return yes;}
    function oversized(n){n.classList.add('oversize');overflow=true;}
    function append(node){
     if(node.nodeType!==1)return;if(node.hasAttribute('data-page-break')){if(body.childNodes.length)addPage();return;}
     const had=body.childNodes.length;if(fits(node))return;node.remove();
     if(node.tagName==='TABLE'){
      // Keep rowspan-connected rows together; never cut a merged cell silently.
      const rows=Array.from(node.querySelectorAll(':scope > tbody > tr,:scope > tr')),groups=[];let end=-1;
      rows.forEach((r,i)=>{if(i>end){groups.push([]);end=i;}groups.at(-1).push(r);for(const cell of r.cells)end=Math.max(end,i+(cell.rowSpan||1)-1);});
      if(groups.length>1){
       let table=null,tb=null;for(const group of groups){
        if(!table){table=node.cloneNode(false);const cols=node.querySelector(':scope > colgroup');if(cols)table.append(cols.cloneNode(true));tb=document.createElement('tbody');table.append(tb);body.append(table);}
        group.forEach(r=>tb.append(r));if(body.scrollHeight>body.clientHeight+1){group.forEach(r=>r.remove());if(!tb.children.length)table.remove();if(body.children.length)addPage();table=node.cloneNode(false);const cols=node.querySelector(':scope > colgroup');if(cols)table.append(cols.cloneNode(true));tb=document.createElement('tbody');table.append(tb);group.forEach(r=>tb.append(r));body.append(table);if(body.scrollHeight>body.clientHeight+1)oversized(table);}
       }return;
      }
     }
     if(had){addPage();if(fits(node))return;node.remove();}
     if(node.tagName==='P'&&node.textContent.length>1){
      // Split long paragraphs at an actual measured text offset, retaining inline formatting.
      let remaining=node;
      while(remaining.textContent.length>1){
       body.append(remaining);if(body.scrollHeight<=body.clientHeight+1)return;remaining.remove();
       const texts=[];const walker=document.createTreeWalker(remaining,4);let t;while(t=walker.nextNode())texts.push(t);
       const length=remaining.textContent.length;let lo=1,hi=length-1,best=0;
       function split(at){let count=0,last=texts.at(-1),offset=last.length;for(const n of texts){if(count+n.length>=at){last=n;offset=at-count;break;}count+=n.length;}const r=document.createRange();r.selectNodeContents(remaining);r.setEnd(last,offset);const left=remaining.cloneNode(false);left.append(r.cloneContents());r.selectNodeContents(remaining);r.setStart(last,offset);const right=remaining.cloneNode(false);right.append(r.cloneContents());right.style.textIndent='0';return [left,right];}
       while(lo<=hi){const mid=(lo+hi)>>1,[left]=split(mid);body.append(left);const ok=body.scrollHeight<=body.clientHeight+1;left.remove();if(ok){best=mid;lo=mid+1;}else hi=mid-1;}
       if(!best){body.append(remaining);oversized(remaining);return;}
       // Avoid splitting a UTF-16 surrogate pair.
       const ch=remaining.textContent.charCodeAt(best-1);if(ch>=0xD800&&ch<=0xDBFF)best--;
       if(best<1){body.append(remaining);oversized(remaining);return;}
       const [left,right]=split(best);body.append(left);remaining=right;addPage();
      }body.append(remaining);return;
     }
     body.append(node);oversized(node);
    }

    addPage();const content=document.createElement('div');content.innerHTML=C.sanitize(section.html);if(live&&meta.key.endsWith('-00'))C.bindToc(content,records);for(const node of Array.from(content.childNodes))append(node);
   }}
   const totals={},localPages={},starts={};for(const {meta} of pages)totals[meta.key]=(totals[meta.key]||0)+1;
   pages.forEach(({page,section,meta},i)=>{
    const n=localPages[meta.key]=(localPages[meta.key]||0)+1;starts[meta.key]??=i+1;page.id='qw-page-'+(i+1);
    page.querySelector('.paper-header').innerHTML=C.bindHeader(section.header,meta,n,totals[meta.key]);page.querySelector('.paper-footer').innerHTML=C.bindHeader(section.footer,meta,n,totals[meta.key]);
    page.querySelector('.page-number').textContent=(i+1)+' / '+pages.length;
   });
   if(documents.length>1)for(const {page} of pages)C.bindTocPages(page,starts);
   return {pages:pages.map(x=>x.page),overflow,starts};
  }finally{measure.remove();}
 }
 window.DFQualityPrint={render};
})();
