/* The sampling screen and report calculate from the same saved inputs. */
(function(global){
  'use strict';
  const finite=value=>{const n=parseFloat(value);return Number.isFinite(n)?n:null;};
  const zero=value=>finite(value)??0;
  const numbers=values=>Array.isArray(values)?values.map(finite).filter(Number.isFinite):[];
  const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
  function absorption(fields){
    const flow=zero(fields.absFlow),pm=zero(fields.absPm),tmIn=zero(fields.absTmIn),tmOut=zero(fields.absTmOut),vm=zero(fields.absVolume);
    const before=zero(fields.absWeightBefore),after=zero(fields.absWeightAfter),ma=(after||before)?after-before:0;
    const thetaM=average([tmIn,tmOut].filter(v=>Number.isFinite(v)&&v!==0));
    const pa=zero(fields.locationPressure)||zero(fields.pressure);
    const waterStd=(22.4/18)*ma,dryStd=vm>0?vm*(273/(273+thetaM))*((pa+pm)/760):0;
    const xw=(vm>0&&ma>=0&&(dryStd+waterStd)>0)?waterStd/(dryStd+waterStd)*100:0;
    return {flow,pm,tmIn,tmOut,thetaM,vm,before,after,ma,pa,xw};
  }
  function calculate({moist,o2,co2,pa,pitot,avgs,sums,shape,diameter,width,height,std}){
    const n2=100-o2-co2,md=.32*o2+.44*co2+.28*n2,ms=md*(1-moist/100)+(moist/100)*18.01,ps=avgs.static/13.6,pStack=pa+ps;
    const r0=(1/(22.4*100))*((28*n2+44*co2+32*o2)*(100-moist)/100+18*moist);
    const density=r0*273/(273+avgs.temp)*pStack/760;
    const velocity=(density>0&&avgs.dynamic>=0)?pitot*Math.sqrt(2*9.81*avgs.dynamic/density):0;
    const area=shape==='round'?Math.PI*Math.pow(diameter,2)/4:shape==='rect'?width*height:0;
    const flow=area*velocity*273/(273+avgs.temp)*pStack/760*(1-moist/100)*60;
    const oxygenCorrection=Number.isFinite(std)&&std>=0&&std<21&&Number.isFinite(o2)&&o2<=21;
    const correctedFlow=oxygenCorrection?flow*(21-o2)/(21-std):NaN;
    return {moist,o2,co2,pa,pitot,avgs,sums,n2,md,ms,ps,pStack,r0,density,velocity,area,flow,std,oxygenCorrection,correctedFlow};
  }
  function savedPoints(record){
    const points=record.recordType==='combo'?(record.comboParticleMode==='metal'?record.comboMetalPoints||record.comboDustPoints||record.points:record.comboDustPoints||record.points):record.points;
    return Array.isArray(points)?points:null;
  }
  function fromSaved(record){
    if(!record||!record.fields)return null;
    const f=record.fields,pts=savedPoints(record),read=key=>numbers((pts||[]).map(p=>p?.[key]));
    const temp=read('temp'),dynamic=read('dynamic'),pressure=read('static');
    const moist=record.moistureMethod==='absorption'?absorption(f).xw:average(numbers(record.moist));
    const o2=global.DFAnalysisNumbers.average(Array.isArray(record.o2vals)?record.o2vals:[]),co2=global.DFAnalysisNumbers.average(Array.isArray(record.co2vals)?record.co2vals:[]);
    const pitot=String(f.pitot??'').trim()?zero(f.pitot):0.83;
    const metrics=calculate({moist,o2,co2,pa:zero(f.locationPressure)||zero(f.pressure),pitot,
      avgs:{temp:average(temp),static:average(pressure),dynamic:average(dynamic)},sums:{},
      shape:f.stackShape,diameter:zero(f.diameter),width:zero(f.stackW),height:zero(f.stackH),std:parseFloat(f.stdO2)});
    const velocityKnown=!!(temp.length&&dynamic.length&&metrics.pa>0&&metrics.pitot>0&&metrics.density>0&&metrics.avgs.dynamic>=0);
    const dimensionsKnown=f.stackShape==='round'?zero(f.diameter)>0:f.stackShape==='rect'&&zero(f.stackW)>0&&zero(f.stackH)>0;
    return {metrics,hasPoints:pts!==null,hasTemperature:temp.length>0,velocityKnown,flowKnown:velocityKnown&&dimensionsKnown,
      moistureKnown:record.moistureMethod==='absorption'?zero(f.absVolume)>0:numbers(record.moist).length>0};
  }
  global.DF_SAMPLE_STACK_METRICS=Object.freeze({calculate,absorption,fromSaved});
})(window);
