/* Beta 3.18 · 분석 화면·성적서의 공통 숫자 계산 규칙 */
(function(global){
 'use strict';
 const number=value=>{
  if(value==null||typeof value==='boolean'||String(value).trim()==='')return null;
  const raw=String(value).trim().replace(/,/g,'');
  const n=Number(raw);return Number.isFinite(n)?n:null;
 };
 const readings=values=>(values||[]).map(number).filter(Number.isFinite);
 const average=values=>{const a=readings(values);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;};
 const digits=(v,fallback,min=-1,max=10)=>{const n=number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;};
 const settings=(values={},defaultResult=3)=>({calc:digits(values.calc_decimals,-1),result:digits(values.result_decimals,defaultResult,0,8)});
 const round=(value,d=-1)=>{
  if(!Number.isFinite(value))return null;if(d<0)return value;
  // 지수로 자리수를 이동해 음수도 대칭으로 반올림합니다.
  const shift=(v,e)=>{const a=String(v).split('e');return Number(a[0]+'e'+((Number(a[1])||0)+e));};
  return Math.sign(value)*shift(Math.round(shift(Math.abs(value),d)+Number.EPSILON),-d);
 };
 const format=(value,p,empty='-')=>Number.isFinite(value)?value.toFixed(p.result):empty;
 function calculate(key,values={},options={}){
  const analyzer=['질소산화물','황산화물','일산화탄소','산소','이산화탄소','CO2'].includes(key);
  const p=settings(values,analyzer||key==='먼지'?1:3),r=v=>round(v,p.calc),n=k=>number(values[k]);
  const div=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?r(a/b):null;
  const mul=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?r(a*b):null;
  const oxygen=result=>{
   if(!values.correction)return result;
   const measured=average(options.o2vals),std=number(options.stdO2);
   return measured!==null&&std!==null&&measured<21&&std<21?div(mul(result,r(21-std)),r(21-measured)):null;
  };
  let raw=null,mean=null,count=0,md=null,standardVolume=null;
  if(analyzer){const a=readings([values.v1,values.v2,values.v3]);count=a.length;mean=count?r(a.reduce((s,v)=>s+v,0)/count):null;raw=oxygen(mean);}
  else if(key==='먼지'){
   const before=n('before'),after=n('after'),vm=n('vm'),theta=n('theta'),pa=n('pa'),dh=n('dh');
   if([before,after,vm,theta,pa,dh].every(Number.isFinite)&&vm>0){
    md=mul(r(after-before),1000);
    standardVolume=mul(mul(vm,div(273,r(273+theta))),div(r(pa+div(dh,13.6)),760));
    raw=standardVolume>0?oxygen(div(md,standardVolume)):null;
   }
  }else if(n('Vs')>0){
   if(key.startsWith('VOC:')){const mw=number(options.molecularWeight);if([n('ms'),n('mb'),mw].every(Number.isFinite)&&mw>0)raw=div(mul(div(r(n('ms')-n('mb')),n('Vs')),22.4),mw);}
   else if([n('a'),n('b')].every(Number.isFinite)){
    const delta=r(n('a')-n('b'));
    if(key.startsWith('중금속:')){if(n('V')!==null)raw=div(mul(delta,n('V')),n('Vs'));}
    else if(key==='폼알데하이드'){if(n('V')!==null)raw=mul(div(mul(div(mul(r(mul(2,n('a'))-n('b')),n('V')),n('Vs')),22.4),30.026),0.1429);}
    else{
     const factors={'암모니아':[25,null],'황화수소':[10,32.06],'사이안화수소':[10,26.017],'브로민화합물':[100,79.904]};
     let factor=factors[key];
     if(key.startsWith('염화수소'))factor=[key.endsWith(':uv')||values.method_code==='uv'?50:100,35.453];
     if(key.startsWith('플루오린화합물'))factor=[key.endsWith(':lanthanum')||values.method_code==='lanthanum'?10:n('V'),18.998];
     if(factor&&factor[0]!==null){raw=div(mul(delta,factor[0]),n('Vs'));if(factor[1])raw=div(mul(raw,22.4),factor[1]);}
    }
   }
  }
  return {raw,mean,count,md,standardVolume,precision:p,text:format(raw,p)};
 }
 global.DFAnalysisNumbers={number,readings,average,settings,round,format,calculate};
})(window);
