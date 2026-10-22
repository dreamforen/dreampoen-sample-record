/* Table sizing shared by the editor and print renderer. */
(function(){'use strict';
 const mm=25.4/96;
 function grid(table){
  const occupied=[],cells=[];let count=0;
  Array.from(table.rows).forEach((row,r)=>{
   occupied[r]??=[];let col=0;
   for(const cell of row.cells){while(occupied[r][col])col++;const span=cell.colSpan||1,down=cell.rowSpan||1;cells.push({cell,start:col,span});
    for(let y=r;y<r+down;y++){occupied[y]??=[];for(let x=col;x<col+span;x++)occupied[y][x]=true;}
    col+=span;count=Math.max(count,col);
   }
  });return {cells,count};
 }
 function repairNumbers(area){
  for(const table of area.querySelectorAll('table')){
   const g=grid(table),head=g.cells.find(x=>x.start===0);
   if(!head||head.span!==1||!/^(no\.?|번호|순번)$/i.test(head.cell.textContent.replace(/\s/g,'')))continue;
   for(const {cell,start,span} of g.cells){
    if(start||span!==1||!(/^(no\.?|번호|순번|\(?\d{1,4}\)?\.?)$/i.test(cell.textContent.replace(/\s/g,''))))continue;
    // Imported 10pt paragraph margins leave less than one letter in a 31pt cell.
    for(const p of cell.querySelectorAll('p')){p.style.marginLeft='0';p.style.marginRight='0';p.style.textIndent='0';p.style.whiteSpace='nowrap';}
   }
  }
 }
 function measure(table){
  const g=grid(table);if(!g.count||g.count>40)throw Error('열이 1~40개인 표에서 사용할 수 있습니다.');
  const area=table.closest('.editable'),a=area.getBoundingClientRect(),t=table.getBoundingClientRect();
  const max=parseFloat(getComputedStyle(area).width)*mm,total=t.width/a.width*max;
  const edges=Array(g.count+1).fill(null);edges[0]=0;edges[g.count]=total;
  for(const {cell,start,span} of g.cells){const c=cell.getBoundingClientRect();edges[start]=(c.left-t.left)/t.width*total;edges[start+span]=(c.right-t.left)/t.width*total;}
  edges[0]=0;edges[g.count]=total;
  for(let i=0;i<g.count;i++)if(edges[i+1]===null){let end=i+1;while(edges[end]===null)end++;for(let n=i+1;n<end;n++)edges[n]=edges[i]+(edges[end]-edges[i])*(n-i)/(end-i);}
  return {max,total,widths:edges.slice(1).map((v,i)=>v-edges[i]),grid:g};
 }
 function apply(table,widths,max){
  const g=grid(table),sum=widths.reduce((a,b)=>a+b,0);
  if(widths.length!==g.count||widths.some(n=>!Number.isFinite(n)||n<3)||sum>max+.1)throw Error('각 열은 3mm 이상이며 전체 폭은 본문 너비 이내여야 합니다.');
  for(const col of table.querySelectorAll(':scope > colgroup,:scope > col'))col.remove();
  const group=document.createElement('colgroup');for(const w of widths){const col=document.createElement('col');col.style.width=(w*72/25.4).toFixed(4)+'pt';group.append(col);}table.prepend(group);
  table.style.width=(sum*72/25.4).toFixed(4)+'pt';table.style.maxWidth='100%';table.style.tableLayout='fixed';table.setAttribute('data-qw-format','2');
  for(const {cell,start,span} of g.cells)cell.style.width=(widths.slice(start,start+span).reduce((a,b)=>a+b,0)*72/25.4).toFixed(4)+'pt';
 }
 function install({getTable,validate,onChange}){
  let target=null,limit=0;const $=id=>document.getElementById(id),dialog=$('tableWidthDialog');
  function inputs(){return Array.from($('tableColumns').querySelectorAll('input'));}
  function widths(){return inputs().map(n=>Number(n.value));}
  $('tableWidth').onclick=()=>{
   try{validate();target=getTable();if(!target)throw Error('너비를 바꿀 표 안을 먼저 클릭하세요.');const m=measure(target);limit=m.max;
    $('tableTotal').value=m.total.toFixed(1);$('tableTotal').max=limit.toFixed(1);$('tableWidthLimit').textContent='본문 너비 '+limit.toFixed(1)+'mm 이내에서 조절하세요. 병합된 셀은 함께 적용됩니다.';
    $('tableColumns').replaceChildren(...m.widths.map((w,i)=>{const label=document.createElement('label');label.textContent=(i+1)+'열 (mm)';const input=document.createElement('input');input.type='number';input.min='3';input.step='.1';input.value=w.toFixed(1);input.required=true;label.append(input);input.oninput=()=>{$('tableTotal').value=widths().reduce((a,b)=>a+b,0).toFixed(1);};return label;}));
    $('tableWidthError').textContent='';dialog.showModal();
   }catch(e){$('message').textContent=e.message;$('message').hidden=false;}
  };
  $('tableTotal').onchange=()=>{const total=Number($('tableTotal').value),old=widths().reduce((a,b)=>a+b,0);if(total>0&&old>0)inputs().forEach(n=>n.value=(Number(n.value)*total/old).toFixed(1));};
  $('tableEqual').onclick=()=>{const w=Number($('tableTotal').value)/inputs().length;inputs().forEach(n=>n.value=w.toFixed(1));};
  $('tableWidthApply').onclick=e=>{e.preventDefault();try{
   validate();if(!target?.isConnected||!target.closest('.editable'))throw Error('문서가 변경되었습니다. 표를 다시 선택하세요.');
   const current=measure(target);apply(target,widths(),current.max);onChange();dialog.close();
  }catch(err){$('tableWidthError').textContent=err.message;}};
 }
 window.DFQualityTables={grid,measure,apply,repairNumbers,install};
})();
