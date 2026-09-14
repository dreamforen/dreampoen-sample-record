/* DREAMFOREN v120.37.11 · WEATHER INTEGRATION RESTORE */
'use strict';

// ==========================================================
// v120.46 DREAMFOREN WEATHER / MEASUREMENT-SYSTEM TIME-CYCLE MATCH + SIMPLE FIELD UI
// 1행: 위치 / 시도 / 시군구 / 읍면동 / 기상데이터 가져오기
// 2행: 기상 / 기온 / 습도
// 3행: 측정위치대기압 / 대기압 / 풍향 / 풍속
// 위치는 업체현황 주소를 기준으로 자동 판별한다. 자동 결과가 다르거나 오류가 나면 시/도·시/군/구·읍/면/동을 직접 수정하고
// 별도 적용 버튼 없이 [기상데이터 가져오기]만 누르면 직접 입력한 위치를 다시 좌표로 변환한 뒤 조회한다.
// 기상조회는 측정인의 실측 사례와 동일하게 전체채취 시작시간(totalStart) 기준 최신 3시간 정규 발표회차를 선택하고,
// 해당 발표본의 첫 예보시각(+1시간 예보) 1세트를 사용한다. 확인 사례: 08:39→08/09, 10:45→08/09,
// 12:00·12:44·13:50→11/12, 14:55·16:00→14/15.
// 측정위치대기압(locationPressure)과 대기압(pressure)은 현장 수기값이며 기상 API가 자동 변경하지 않는다.
// ==========================================================
(function dfV12046Weather(){
  const $id=id=>document.getElementById(id);
  const setVal=(id,v,{event=true}={})=>{const el=$id(id);if(!el)return;el.value=v??'';if(event){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}};
  const getVal=id=>String($id(id)?.value??'').trim();
  function status(msg,bad=false){const el=$id('dfWeatherStatus');if(!el)return;el.textContent=msg;el.dataset.bad=bad?'1':'0'}

  const WEATHER_FIELDS=[
    ['weather','기상',''],
    ['airTemp','기온','℃'],
    ['humidity','습도','%'],
    ['locationPressure','측정위치대기압','mmHg'],
    ['pressure','대기압','mmHg'],
    ['windDir','풍향',''],
    ['windSpeed','풍속','m/s']
  ];

  function weatherFieldWrapper(id){
    const el=$id(id);if(!el)return null;
    return el.closest('label,.field,.form-field,.input-group,.form-group,.grid-item,.form-item,.input-item,td')||el.parentElement;
  }

  function moveWeatherFields(panel){
    const top=$id('dfWeatherValuesTop'),bottom=$id('dfWeatherValuesBottom');if(!top||!bottom)return;
    WEATHER_FIELDS.forEach(([id,label,unit])=>{
      const el=$id(id);if(!el)return;
      const row=['weather','airTemp','humidity'].includes(id)?top:bottom;
      let group=panel.querySelector(`[data-weather-field="${id}"]`);
      if(!group){
        group=document.createElement('div');
        group.className='df-weather-value-group';
        group.dataset.weatherField=id;
        group.innerHTML=`<span class="df-weather-value-label">${label}</span><div class="df-weather-control-slot"></div>${unit?`<span class="df-weather-unit">${unit}</span>`:''}`;
        row.appendChild(group);
      }else if(group.parentElement!==row){row.appendChild(group)}
      const sourceWrap=weatherFieldWrapper(id);
      group.querySelector('.df-weather-control-slot')?.appendChild(el);
      el.classList.add('df-weather-native-control');
      if(sourceWrap && sourceWrap!==group && !panel.contains(sourceWrap)){
        const remains=[...sourceWrap.querySelectorAll('input,select,textarea,button')].filter(x=>x!==el);
        if(remains.length===0){sourceWrap.classList.add('df-weather-original-hidden');sourceWrap.setAttribute('aria-hidden','true')}
      }
    });
  }

  function markWeatherNeedsReload(){
    if(getVal('weatherBaseDate')||getVal('weatherBaseTime')||getVal('weatherFcstDate')||getVal('weatherFcstTime')){
      ['weatherBaseDate','weatherBaseTime','weatherFcstDate','weatherFcstTime','weatherMeasureDate','weatherMeasureTime'].forEach(id=>setVal(id,'',{event:false}));
      const btn=$id('dfWeatherLoad');if(btn)btn.textContent='기상데이터 다시 가져오기';
    }
  }

  function markManualLocation(){
    setVal('weatherLocationSource','manual',{event:false});
    ['weatherRegionCode','weatherNx','weatherNy','weatherMatchedAddress'].forEach(id=>setVal(id,'',{event:false}));
    markWeatherNeedsReload();
  }

  function ensurePanel(){
    if($id('dfWeatherRegionPanel')){moveWeatherFields($id('dfWeatherRegionPanel'));return}
    const weather=$id('weather');if(!weather)return;
    const anchor=weatherFieldWrapper('weather')||weather.parentElement;
    const parent=anchor?.parentElement||weather.parentElement;
    const panel=document.createElement('section');
    panel.id='dfWeatherRegionPanel';panel.className='df-weather-region-panel';
    panel.innerHTML=`
      <div class="df-weather-location-row">
        <span class="df-weather-location-label">위치</span>
        <input id="weatherRegion1" type="text" aria-label="시/도" placeholder="00도" title="업체 주소로 자동 입력됩니다. 필요하면 직접 수정할 수 있습니다.">
        <input id="weatherRegion2" type="text" aria-label="시/군/구" placeholder="00시" title="업체 주소로 자동 입력됩니다. 필요하면 직접 수정할 수 있습니다.">
        <input id="weatherRegion3" type="text" aria-label="읍/면/동" placeholder="00동" title="업체 주소로 자동 입력됩니다. 필요하면 직접 수정할 수 있습니다.">
        <button type="button" id="dfWeatherLoad">기상데이터 가져오기</button>
      </div>
      <div class="df-weather-values-wrap">
        <div id="dfWeatherValuesTop" class="df-weather-values-row df-weather-values-top"></div>
        <div id="dfWeatherValuesBottom" class="df-weather-values-row df-weather-values-bottom"></div>
      </div>
      <span id="dfWeatherStatus" class="df-weather-hidden-status" aria-live="polite"></span>
      <input id="weatherRegionCode" type="hidden">
      <input id="weatherNx" type="hidden">
      <input id="weatherNy" type="hidden">
      <input id="weatherMatchedAddress" type="hidden">
      <input id="weatherLocationSource" type="hidden">
      <input id="weatherBaseDate" type="hidden">
      <input id="weatherBaseTime" type="hidden">
      <input id="weatherFcstDate" type="hidden">
      <input id="weatherFcstTime" type="hidden">
      <input id="weatherMeasureDate" type="hidden">
      <input id="weatherMeasureTime" type="hidden">`;
    if(parent)parent.insertBefore(panel,anchor);else weather.before(panel);
    panel.style.gridColumn='1 / -1';panel.style.width='100%';panel.style.maxWidth='none';panel.style.flex='1 1 100%';

    if(!$id('dfWeatherStyle')){
      const style=document.createElement('style');style.id='dfWeatherStyle';style.textContent=`
      #dfWeatherRegionPanel.df-weather-region-panel{box-sizing:border-box;width:100%!important;max-width:none!important;min-width:0!important;grid-column:1/-1!important;flex:1 1 100%!important;clear:both;margin:4px 0 8px!important;padding:0!important;border:1px solid #9eb6cf!important;border-radius:4px!important;background:#fff!important;overflow:hidden!important}
      #dfWeatherRegionPanel .df-weather-location-row{box-sizing:border-box;display:grid!important;grid-template-columns:58px minmax(115px,145px) minmax(115px,145px) minmax(135px,175px) 158px minmax(0,1fr)!important;gap:7px!important;align-items:center!important;min-height:41px!important;padding:5px 7px!important;background:#f7fbff!important;border-bottom:1px solid #b8c9da!important}
      #dfWeatherRegionPanel .df-weather-location-label{height:30px;display:flex;align-items:center;justify-content:center;border:1px solid #adc0d3;border-radius:3px;background:#e8f1f9;color:#1e3852;font-size:11px;font-weight:800;white-space:nowrap}
      #dfWeatherRegionPanel .df-weather-location-row input{box-sizing:border-box!important;width:100%!important;min-width:0!important;height:30px!important;margin:0!important;padding:3px 8px!important;border:1px solid #aebed0!important;border-radius:3px!important;background:#fff!important;color:#172b3f!important;font-size:11px!important;line-height:1.2!important;white-space:nowrap!important}
      #dfWeatherRegionPanel .df-weather-location-row input:focus{outline:2px solid rgba(86,132,178,.18)!important;border-color:#6f95b9!important}
      #dfWeatherRegionPanel .df-weather-location-row button{box-sizing:border-box!important;height:30px!important;min-width:0!important;margin:0!important;padding:0 12px!important;border:1px solid #76962d!important;border-radius:3px!important;background:#86a832!important;color:#fff!important;font-size:10.5px!important;font-weight:800!important;line-height:28px!important;white-space:nowrap!important;cursor:pointer!important}
      #dfWeatherRegionPanel .df-weather-location-row button:hover{background:#77992b!important}
      #dfWeatherRegionPanel .df-weather-values-wrap{box-sizing:border-box;width:100%!important;background:#fff!important;overflow:hidden!important}
      #dfWeatherRegionPanel .df-weather-values-row{box-sizing:border-box;display:grid!important;align-items:stretch!important;width:100%!important;min-width:0!important;margin:0!important;padding:0!important;gap:0!important;background:#fff!important}
      #dfWeatherRegionPanel .df-weather-values-top{grid-template-columns:minmax(180px,1.25fr) minmax(165px,1fr) minmax(165px,1fr)!important;border-bottom:1px solid #b8c9da!important}
      #dfWeatherRegionPanel .df-weather-values-bottom{grid-template-columns:minmax(250px,1.45fr) minmax(190px,1.05fr) minmax(165px,.9fr) minmax(190px,1fr)!important}
      #dfWeatherRegionPanel .df-weather-value-group{box-sizing:border-box;display:grid!important;grid-template-columns:auto minmax(78px,1fr) auto!important;align-items:stretch!important;min-width:0!important;height:40px!important;margin:0!important;padding:0!important;border-right:1px solid #b8c9da!important;background:#fff!important;float:none!important;position:static!important;overflow:hidden!important}
      #dfWeatherRegionPanel .df-weather-values-row .df-weather-value-group:last-child{border-right:0!important}
      #dfWeatherRegionPanel .df-weather-value-label{box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important;min-width:54px!important;padding:0 6px!important;border-right:1px solid #b8c9da!important;background:#e7f0f8!important;color:#17324d!important;font-size:10.5px!important;font-weight:800!important;line-height:1.1!important;white-space:nowrap!important;writing-mode:horizontal-tb!important;word-break:keep-all!important;overflow:visible!important}
      #dfWeatherRegionPanel .df-weather-value-group[data-weather-field="locationPressure"] .df-weather-value-label{min-width:104px!important;font-size:10px!important}
      #dfWeatherRegionPanel .df-weather-control-slot{box-sizing:border-box!important;display:flex!important;align-items:center!important;min-width:78px!important;padding:4px 5px!important;background:#fff!important;overflow:hidden!important}
      #dfWeatherRegionPanel .df-weather-native-control{box-sizing:border-box!important;display:block!important;position:static!important;float:none!important;width:100%!important;min-width:70px!important;max-width:none!important;height:29px!important;min-height:29px!important;margin:0!important;padding:3px 7px!important;border:1px solid #aebed0!important;border-radius:3px!important;background:#fff!important;color:#111827!important;font-size:11px!important;line-height:21px!important;writing-mode:horizontal-tb!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}
      #dfWeatherRegionPanel select.df-weather-native-control{padding-right:20px!important}
      #dfWeatherRegionPanel .df-weather-unit{display:flex!important;align-items:center!important;justify-content:center!important;min-width:34px!important;padding:0 5px 0 1px!important;background:#fff!important;color:#52677c!important;font-size:9.5px!important;white-space:nowrap!important}
      .df-weather-original-hidden{display:none!important;width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}
      .df-weather-hidden-status{display:none!important}
      @media(max-width:1050px){#dfWeatherRegionPanel .df-weather-location-row{grid-template-columns:54px 112px 112px 135px 148px minmax(0,1fr)!important}#dfWeatherRegionPanel .df-weather-values-top{grid-template-columns:minmax(165px,1.2fr) minmax(150px,1fr) minmax(150px,1fr)!important}#dfWeatherRegionPanel .df-weather-values-bottom{grid-template-columns:minmax(230px,1.4fr) minmax(175px,1fr) minmax(150px,.9fr) minmax(175px,1fr)!important}}
      @media(max-width:820px){#dfWeatherRegionPanel .df-weather-location-row{grid-template-columns:52px 1fr 1fr!important;gap:5px!important}#dfWeatherRegionPanel #weatherRegion3{grid-column:2/4!important}#dfWeatherRegionPanel #dfWeatherLoad{grid-column:1/4!important;width:100%!important}#dfWeatherRegionPanel .df-weather-values-top,#dfWeatherRegionPanel .df-weather-values-bottom{grid-template-columns:1fr!important}#dfWeatherRegionPanel .df-weather-value-group{border-right:0!important;border-bottom:1px solid #b8c9da!important}#dfWeatherRegionPanel .df-weather-values-bottom .df-weather-value-group:last-child{border-bottom:0!important}}
      `;document.head.appendChild(style);
    }
    moveWeatherFields(panel);
    $id('dfWeatherLoad').onclick=()=>loadWeather();
    ['weatherRegion1','weatherRegion2','weatherRegion3'].forEach(id=>$id(id)?.addEventListener('input',markManualLocation));
    ['measureDate','totalStart'].forEach(id=>{const el=$id(id);if(el&&!el.dataset.dfWeatherBasisWatch){el.dataset.dfWeatherBasisWatch='1';el.addEventListener('input',markWeatherNeedsReload);el.addEventListener('change',markWeatherNeedsReload)}});
  }

  function selectedCompany(){try{return typeof findSampleCompanyByInput==='function'?findSampleCompanyByInput():null}catch(_){return null}}
  async function invoke(name,body){
    if(!dfSupabase||!dfCloudUser)throw new Error('Supabase 로그인 후 사용할 수 있습니다.');
    const {data,error}=await dfSupabase.functions.invoke(name,{body});
    if(error)throw new Error(error.message||String(error));
    if(!data?.success)throw new Error(data?.message||`${name} 호출 실패`);
    return data;
  }
  function applyLocation(d,source='auto'){
    setVal('weatherRegion1',d.region_1depth_name||'',{event:false});
    setVal('weatherRegion2',d.region_2depth_name||'',{event:false});
    setVal('weatherRegion3',d.region_3depth_name||'',{event:false});
    setVal('weatherRegionCode',d.code||'',{event:false});
    setVal('weatherNx',d.nx??'',{event:false});setVal('weatherNy',d.ny??'',{event:false});
    setVal('weatherMatchedAddress',d.matched_address||d.input_address||'',{event:false});
    setVal('weatherLocationSource',source,{event:false});
    scheduleAutoSave?.();
  }
  async function autoLocate(showAlert=false){
    ensurePanel();const c=selectedCompany();const address=String(c?.Address||c?.address||'').trim();
    if(!address){status('업체현황 주소 확인 필요',true);if(showAlert)alert('업체현황에 주소가 없거나 업체가 선택되지 않았습니다.\n위치를 직접 입력한 뒤 [기상데이터 가져오기]를 눌러주세요.');return null}
    try{status('주소 자동판별 중');const d=await invoke('dreamforen-location',{address});applyLocation(d,'auto');status('자동 판별 완료');return d}catch(e){status('자동 판별 실패',true);if(showAlert)alert(`주소 자동판별에 실패했습니다.\n위치를 직접 입력한 뒤 [기상데이터 가져오기]를 눌러주세요.\n\n${e.message}`);return null}
  }
  async function manualLocate({showAlert=true}={}){
    ensurePanel();const address=[getVal('weatherRegion1'),getVal('weatherRegion2'),getVal('weatherRegion3')].filter(Boolean).join(' ');
    if(!getVal('weatherRegion1')||!getVal('weatherRegion2')||!getVal('weatherRegion3')){
      if(showAlert)alert('시/도, 시/군/구, 읍/면/동을 모두 입력해주세요.');
      return null;
    }
    try{status('직접 입력 위치 확인 중');const d=await invoke('dreamforen-location',{address});applyLocation(d,'manual');status('직접 입력 위치 적용 완료');return d}catch(e){status('직접 입력 위치 적용 실패',true);if(showAlert)alert(`입력한 위치를 확인하지 못했습니다.\n시/도, 시/군/구, 읍/면/동을 확인한 뒤 다시 눌러주세요.\n\n${e.message}`);return null}
  }
  function baseCycle(dateStr,timeStr){
    // 측정인 실측 자료에서 확인된 3시간 정규 발표회차 규칙.
    // 08:39→08:00, 10:45→08:00, 12:00/12:44/13:50→11:00, 14:55/16:00→14:00.
    const date=String(dateStr||'').trim(),time=normalizeTimeValue(String(timeStr||'').trim());
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('측정일과 전체 채취 시작시간을 먼저 입력해주세요.');
    const d=new Date(`${date}T${time}:00`);
    if(Number.isNaN(d.getTime()))throw new Error('측정일 또는 전체 채취 시작시간 형식을 확인해주세요.');
    const cycles=[2,5,8,11,14,17,20,23];let h=d.getHours(),cycle=cycles.filter(x=>x<=h).pop();
    if(cycle===undefined){d.setDate(d.getDate()-1);cycle=23}
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return {base_date:`${y}${m}${day}`,base_time:String(cycle).padStart(2,'0')+'00'};
  }
  function previousBaseCycle(base){
    const d=new Date(`${String(base.base_date).slice(0,4)}-${String(base.base_date).slice(4,6)}-${String(base.base_date).slice(6,8)}T${String(base.base_time).slice(0,2)}:00:00`);
    if(Number.isNaN(d.getTime()))return base;
    d.setHours(d.getHours()-3);
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),h=String(d.getHours()).padStart(2,'0');
    return {base_date:`${y}${m}${day}`,base_time:`${h}00`};
  }
  function windName(deg){const n=Number(deg);if(!Number.isFinite(n))return '';const dirs=['북','북-북동','북동','동-북동','동','동-남동','남동','남-남동','남','남-남서','남서','서-남서','서','서-북서','북서','북-북서'];return dirs[Math.floor((n+11.25)/22.5)%16]}
  function weatherName(map){const p=String(map.PTY??'0');if(p==='1')return '비';if(p==='2')return '비/눈';if(p==='3')return '눈';if(p==='4')return '소나기';const s=String(map.SKY??'');return s==='1'?'맑음':s==='3'?'구름많음':s==='4'?'흐림':''}
  function pickForecast(items,date,time){
    // 선택된 발표본의 가장 이른 예보시각 1세트를 사용한다.
    // 단기예보 정규회차 기준으로 08→09, 11→12, 14→15처럼 +1시간 예보가 선택된다.
    const rows=(items||[]).filter(x=>/^\d{8}$/.test(String(x.fcstDate||''))&&/^\d{4}$/.test(String(x.fcstTime||'')));
    if(!rows.length)return {};
    const keys=[...new Set(rows.map(x=>Number(`${x.fcstDate}${String(x.fcstTime).padStart(4,'0')}`)).filter(Number.isFinite))].sort((a,b)=>a-b);
    const chosen=keys[0];
    if(chosen===undefined)return {};
    const chosenStr=String(chosen).padStart(12,'0'),chosenDate=chosenStr.slice(0,8),chosenTime=chosenStr.slice(8,12);
    const out={};
    rows.filter(x=>String(x.fcstDate)===chosenDate&&String(x.fcstTime).padStart(4,'0')===chosenTime).forEach(x=>out[x.category]=x.fcstValue);
    return {values:out,fcstDate:chosenDate,fcstTime:chosenTime};
  }
  async function resolveLocationForWeather(){
    let nx=getVal('weatherNx'),ny=getVal('weatherNy');
    const source=getVal('weatherLocationSource');
    const hasManualText=getVal('weatherRegion1')&&getVal('weatherRegion2')&&getVal('weatherRegion3');

    // 사용자가 자동값을 직접 수정했다면 별도 '수동입력' 버튼 없이 현재 입력값을 우선 적용한다.
    if(source==='manual'&&hasManualText){
      const d=await manualLocate({showAlert:true});
      return d?{nx:d.nx,ny:d.ny}:null;
    }
    if(nx&&ny)return {nx:Number(nx),ny:Number(ny)};

    // 좌표가 없지만 위치칸에 값이 있다면 저장/복원된 수동값일 수 있으므로 먼저 현재 입력값을 적용한다.
    if(hasManualText){
      const d=await manualLocate({showAlert:false});
      if(d)return {nx:d.nx,ny:d.ny};
    }

    // 기본 동작은 업체현황 주소 자동판별.
    const d=await autoLocate(false);
    if(d)return {nx:d.nx,ny:d.ny};
    alert('기상 지역을 자동으로 확인하지 못했습니다.\n위치의 시/도, 시/군/구, 읍/면/동을 직접 입력한 뒤 [기상데이터 가져오기]를 다시 눌러주세요.');
    return null;
  }
  async function loadWeather(){
    ensurePanel();
    const loc=await resolveLocationForWeather();
    if(!loc)return;
    const nx=loc.nx,ny=loc.ny;

    const date=normalizeManualDate(getVal('measureDate'));
    const time=normalizeTimeValue(getVal('totalStart'));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)){
      return alert('측정일과 전체 채취 시작시간을 먼저 입력해주세요.\n기상데이터는 전체 채취 시작시간을 기준으로 조회합니다.');
    }
    if(getVal('measureDate')!==date)setVal('measureDate',date,{event:false});
    if(getVal('totalStart')!==time)setVal('totalStart',time,{event:false});
    const base=baseCycle(date,time);
    try{
      status('기상청 조회 중');
      let usedBase=base,d;
      try{d=await invoke('dreamforen-weather',{...usedBase,nx:Number(nx),ny:Number(ny)})}
      catch(firstError){
        // 발표 정각 직후 신규 발표본이 아직 API에 반영되지 않았을 때만 직전 회차로 안전 fallback.
        usedBase=previousBaseCycle(base);
        d=await invoke('dreamforen-weather',{...usedBase,nx:Number(nx),ny:Number(ny)});
      }
      const picked=pickForecast(d.items,date,time),v=picked.values||{};
      if(!Object.keys(v).length)throw new Error('선택된 발표회차의 첫 예보값을 찾지 못했습니다.');
      setVal('weatherBaseDate',usedBase.base_date,{event:false});setVal('weatherBaseTime',usedBase.base_time,{event:false});
      setVal('weatherFcstDate',picked.fcstDate||'',{event:false});setVal('weatherFcstTime',picked.fcstTime||'',{event:false});
      setVal('weatherMeasureDate',date,{event:false});setVal('weatherMeasureTime',time,{event:false});
      if(v.TMP!==undefined)setVal('airTemp',v.TMP);if(v.REH!==undefined)setVal('humidity',v.REH);if(v.WSD!==undefined)setVal('windSpeed',v.WSD);if(Number(v.WSD)===0)setVal('windDir','무풍');else if(v.VEC!==undefined){const dir=windName(v.VEC);if(dir)setVal('windDir',dir)}const w=weatherName(v);if(w)setVal('weather',w);
      const loadBtn=$id('dfWeatherLoad');if(loadBtn)loadBtn.textContent='기상데이터 가져오기';
      status('기상 입력 완료');recalc?.();scheduleAutoSave?.();
    }catch(e){status('기상 조회 실패',true);alert(`기상데이터를 가져오지 못했습니다.\n${e.message}`)}
  }

  if(typeof pickSampleCompany==='function'){
    const basePick=pickSampleCompany;pickSampleCompany=function(item){basePick(item);setTimeout(()=>autoLocate(false),20)};
  }
  document.addEventListener('DOMContentLoaded',()=>{ensurePanel();setTimeout(()=>{const c=selectedCompany();if(c&&!getVal('weatherRegion3'))autoLocate(false)},900)},{once:true});
  window.dfWeatherAutoLocate=autoLocate;window.dfWeatherLoad=loadWeather;
})();;

// ==========================================================
// v120.37.11 VERSION / DIAGNOSTIC MARKER
// ==========================================================
(function dfV1203711Version(){
  const VERSION='v120.37.11';
  function applyVersion(){
    const side=document.getElementById('dfBuildVersionStatic');
    const foot=document.getElementById('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · WEATHER + MOBILE PDF`;
    if(foot)foot.textContent=VERSION;
  }
  window.DF_WEATHER_INTEGRATION_VERSION=VERSION;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyVersion,{once:true});else applyVersion();
  window.DF_DIAG?.info('WEATHER-RESTORE-1203711','기상 연동 복원 준비 완료','업체 주소·측정일·전체채취 시작시간 기준');
})();

