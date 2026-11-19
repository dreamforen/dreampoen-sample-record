/* Output identity only; do not read/write saved records or change calculations. */
(function(global){
  'use strict';
  const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const css=`.df-calc-identity{display:flex;flex-wrap:wrap;gap:2px 12px;align-items:baseline;margin:0 0 4px;padding:0 0 3px;border-bottom:1px solid #bbb;font-size:10px;line-height:1.3;color:#222;overflow-wrap:anywhere}.df-calc-identity .df-calc-facility{flex-basis:100%}.df-calc-print-identity{display:none}@page dfSampleCalculation{size:A4 portrait;margin:19mm 10mm 10mm}@media print{.calc-lab-sheet,.calc-lab-paper,.df-calc-preview-sheet{page:dfSampleCalculation;overflow:visible!important}.df-calc-identity{display:none!important}.df-calc-print-identity{display:block!important;position:fixed;top:-10mm;left:0;right:0;box-sizing:border-box;font-family:'Malgun Gothic',sans-serif;font-size:7.5pt;line-height:1.15;color:#111;border-bottom:.2mm solid #666;padding-bottom:.7mm;overflow-wrap:anywhere}.df-calc-print-identity .df-calc-facility{display:block;margin-top:.4mm}.df-calc-print-identity span+span{margin-left:3mm}.df-calc-print-identity .df-calc-facility{margin-left:0}.df-calc-print-identity~.calc-lab-title{break-after:avoid}}`;
  function fields(){return Object.fromEntries(['receiptNo','company','facility'].map(key=>[key,clean(document.getElementById(key)?.value)]));}
  function content(node,f){
    const labels=[['receiptNo','접수번호'],['company','업체명'],['facility','설비명']];
    const signature=JSON.stringify(labels.map(([key])=>clean(f[key])));
    if(node.dataset.identity===signature)return;
    node.replaceChildren();node.dataset.identity=signature;
    for(const [key,label] of labels){const span=node.ownerDocument.createElement('span');if(key==='facility')span.className='df-calc-facility';span.textContent=label+': '+(clean(f[key])||'미입력');node.appendChild(span);}
  }
  function prepare(paper,source){
    if(!paper)return;const f=source?.fields||source||fields();
    for(const className of ['df-calc-identity','df-calc-print-identity']){
      let node=Array.from(paper.children).find(x=>x.classList.contains(className));
      if(!node){node=paper.ownerDocument.createElement('div');node.className=className;paper.insertBefore(node,paper.firstChild);}
      content(node,f);
    }
  }
  function sync(){prepare(document.querySelector('#calcLabSheet .calc-lab-paper'),fields());}
  function excelHeader(doc,source){
    const f=source?.fields||source||fields(),escape=v=>(clean(v)||'미입력').replace(/&/g,'&&');
    const text='&C&"맑은 고딕,보통"&7접수번호: '+escape(f.receiptNo)+' | 업체명: '+escape(f.company)+'\n설비명: '+escape(f.facility);
    const root=doc.documentElement,children=Array.from(root.children),after=new Set(['rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst']);
    let header=children.find(n=>n.localName==='headerFooter');
    if(!header){header=doc.createElementNS(ns,'headerFooter');root.insertBefore(header,children.find(n=>after.has(n.localName))||null);}
    header.setAttribute('scaleWithDoc','0');header.setAttribute('alignWithMargins','1');
    for(const name of ['oddHeader','evenHeader','firstHeader']){
      let node=Array.from(header.children).find(n=>n.localName===name);
      if(!node){node=doc.createElementNS(ns,name);header.appendChild(node);}node.textContent=text;
    }
    const order=['oddHeader','oddFooter','evenHeader','evenFooter','firstHeader','firstFooter'];
    Array.from(header.children).sort((a,b)=>order.indexOf(a.localName)-order.indexOf(b.localName)).forEach(n=>header.appendChild(n));
    const margins=children.find(n=>n.localName==='pageMargins');
    if(margins){margins.setAttribute('header','0.05');margins.setAttribute('top',String(Math.max(Number(margins.getAttribute('top'))||0,0.3543307086614173)));}
  }
  function install(){
    if(!document.getElementById('dfCalcIdentityStyle')){const style=document.createElement('style');style.id='dfCalcIdentityStyle';style.textContent=css;document.head.appendChild(style);}
    document.addEventListener('input',event=>{if(['receiptNo','company','facility'].includes(event.target?.id))sync();});
    document.addEventListener('change',event=>{if(['receiptNo','company','facility'].includes(event.target?.id))sync();});
    const body=document.getElementById('calcLabBody');if(body)new MutationObserver(sync).observe(body,{childList:true});
    global.addEventListener('beforeprint',sync);sync();
  }
  global.DF_SAMPLE_CALC_IDENTITY=Object.freeze({prepare,sync,fields,excelHeader,css});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
})(window);
