// ==========================================================
// DREAMFOREN v120.37.15.9
// 먼지 여지관리대장 연속 숫자입력 + 시료채취 CO2 기본값 0.0
// 저장·연동·계산·문서·인쇄 로직은 변경하지 않는다.
// ==========================================================
(function dfV12037159FilterInputAndCo2Default(){
  'use strict';

  const VERSION='v120.37.15.9';
  const byId=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();

  function co2Defaults(values){
    const source=Array.isArray(values)?values.slice(0,3):[];
    while(source.length<3)source.push('');
    return source.map(value=>text(value)===''?'0.0':value);
  }

  function patchRecord(record){
    if(!record||typeof record!=='object')return record;
    return {...record,co2vals:co2Defaults(record.co2vals)};
  }

  // 이후 열기·새 기록·새 날짜·시설 추가 경로는 모두 기존 apply를 통과한다.
  if(typeof apply==='function'){
    const baseApply=apply;
    apply=function dfV159ApplyCo2Default(record){
      const args=[...arguments];
      args[0]=patchRecord(record);
      return baseApply.apply(this,args);
    };
  }

  function patchTemplates(){
    try{
      if(typeof baseTemplates!=='undefined'&&baseTemplates){
        ['dust','metal','combo'].forEach(key=>{
          if(baseTemplates[key])baseTemplates[key].co2vals=co2Defaults(baseTemplates[key].co2vals);
        });
      }
      if(typeof workingStates!=='undefined'&&workingStates){
        ['dust','metal','combo'].forEach(key=>{
          if(workingStates[key])workingStates[key].co2vals=co2Defaults(workingStates[key].co2vals);
        });
      }
    }catch(error){
      window.DF_DIAG?.warn('CO2-DEFAULT-12037159','CO2 기본 템플릿 보정 생략',error?.message||error);
    }
  }

  function showCo2Defaults(){
    let changed=false;
    document.querySelectorAll('.co2val').forEach(input=>{
      if(text(input.value)!=='')return;
      input.value='0.0';
      changed=true;
    });
    if(changed&&typeof recalc==='function')recalc();
    return changed;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · FILTER INPUT + CO2 DEFAULT`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    patchTemplates();
    showCo2Defaults();
    applyVersion();
    [180,700,1600].forEach(wait=>setTimeout(()=>{
      patchTemplates();
      showCo2Defaults();
      applyVersion();
    },wait));
    window.DF_DIAG?.info('FILTER-CO2-12037159','여지대장 연속입력·CO2 0.0 기본표시 준비 완료','기존 값·계산·저장·LAB 연동 유지');
  }

  window.dfV1203719Co2Defaults=co2Defaults;
  window.dfV1203719ShowCo2Defaults=showCo2Defaults;

  if(document.readyState==='complete')setTimeout(init,0);
  else window.addEventListener('load',init,{once:true});
})();
