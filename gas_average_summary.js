/* DREAMFOREN Beta 3.5: gas averages in the sample calculation sheet. */
(function(global){
  'use strict';
  const finiteValues=values=>values.map(value=>parseFloat(value)).filter(Number.isFinite);
  function card(number,label,symbol,values){
    const samples=values.map(value=>parseFloat(value)),valid=finiteValues(values);
    const average=valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:null;
    const display=average===null?'—':average.toFixed(1);
    const terms=samples.map((value,index)=>Number.isFinite(value)?`${symbol}<sub>${index+1}</sub>(${value})`:null).filter(Boolean);
    const formula=valid.length?`${symbol} = <span class="lab-frac"><span>${terms.join(' + ')}</span><span>n(${valid.length})</span></span>`:'측정값 입력 후 평균이 표시됩니다.';
    const rows=[[symbol,`${label} 평균 (%)`,display],...samples.map((value,index)=>[`${symbol}<sub>${index+1}</sub>`,`${index+1}회 측정값 (%)`,Number.isFinite(value)?String(value):'—'])];
    return `<section class="lab-calc-block df-gas-average"><h3>${number}. ${label} 평균 (%)</h3><div class="lab-formula">${formula}</div><div class="lab-vars">${rows.map(row=>`<div><b>${row[0]}</b><span>${row[1]}</span><strong>${row[2]}</strong></div>`).join('')}</div><div class="lab-result">${label} 평균 = ${display} % · 입력 ${valid.length}회</div></section>`;
  }
  function render(){
    const host=document.getElementById('calcLabBody');if(!host)return;
    host.querySelectorAll('.df-gas-average').forEach(node=>node.remove());
    const first=host.querySelector('.lab-calc-block');if(!first)return;
    const values=selector=>Array.from(document.querySelectorAll(selector),el=>el.value);
    first.insertAdjacentHTML('afterend',card('1-1','산소','O₂',values('.o2val'))+card('1-2','이산화탄소','CO₂',values('.co2val')));
  }
  const original=global.updateRawData;
  if(typeof original==='function'&&!original.__gasAverageSummary){
    const wrapped=function(){const result=original.apply(this,arguments);render();return result;};
    wrapped.__gasAverageSummary=true;global.updateRawData=wrapped;
  }
  global.DF_GAS_AVERAGE_SUMMARY={render,card};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})(window);
