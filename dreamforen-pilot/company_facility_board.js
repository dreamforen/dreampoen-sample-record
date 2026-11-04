/* Beta 3.9.9: presentation order only; original facility IDs and array indexes remain authoritative. */
(function(global){'use strict';
 const collator=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
 const name=f=>String(f?.FacilityName||f?.PreventionFacility||f?.EmissionFacility||'').trim();
 function parts(f){const value=name(f).normalize('NFKC'),m=value.match(/^(방|배|[A-Z])\s*[-‐‑–—]?\s*(\d+)/i);return {value,group:m?m[1].toUpperCase():'',number:m?Number(m[2]):null};}
 function rank(group){return group==='방'?0:group==='배'?1:/^[A-Z]$/.test(group)?2+group.charCodeAt(0)-65:100;}
 function ordered(facilities){return (facilities||[]).map((facility,index)=>({facility,index})).sort((a,b)=>{const x=parts(a.facility),y=parts(b.facility);return rank(x.group)-rank(y.group)||(x.group===y.group&&x.number!==null&&y.number!==null?x.number-y.number:0)||collator.compare(x.value,y.value)||a.index-b.index;});}
 global.DFCompanyFacilityBoard=Object.freeze({ordered});
})(window);
