/* DREAMFOREN · 7-day KMA forecast on the home screen. */
(function(){
  'use strict';
  const regions=[
    ['경기',[
      ['anyang','안양시'],['suwon','수원시'],['ansan','안산시'],['siheung','시흥시'],['hwaseong','화성시'],
      ['pyeongtaek','평택시'],['anseong','안성시'],['yongin','용인시'],
    ]],
    ['서울·인천',[['seoul','서울'],['incheon','인천']]],
    ['충남',[['cheonan','천안시'],['asan','아산시']]],
  ];
  const names=new Map(regions.flatMap(([,rows])=>rows)), preference='df_home_forecast_region';
  const savedKey='df_home_forecast_cache_v410', dayMs=86400000, fresh=10*60000, retry=60*1000, maxAge=dayMs;
  const cache=new Map();
  const issues=new Set(['KMA_ACCESS','KMA_LIMIT','KMA_NO_DATA','KMA_FORMAT','KMA_UNAVAILABLE','WEATHER_UNAVAILABLE','WEATHER_TIMEOUT','KEY_MISSING','LOGIN_REQUIRED','FUNCTION_MISSING']);
  const safeIssue=value=>issues.has(value)?value:null;
  const $=id=>document.getElementById(id);
  const weekday=['일','월','화','수','목','금','토'];
  const kst=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const isoToday=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const dayAt=(today,i)=>new Date(Date.parse(today+'T00:00:00Z')+i*dayMs).toISOString().slice(0,10);
  function dateText(day){const d=new Date(day+'T00:00:00Z');return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' ('+weekday[d.getUTCDay()]+')';}
  function issueText(time){const d=new Date(time);return time&&Number.isFinite(+d)?kst.format(d):'';}
  function make(tag,cls,text){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  const shapes={
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4m11.2-11.2L19 5"/>',
    cloud:'<path d="M6.8 19a4.8 4.8 0 0 1-.7-9.55 6 6 0 0 1 11.55 1.3A4.14 4.14 0 1 1 18.6 19Z"/>',
    rain:'<path d="M6.7 15.5a3.8 3.8 0 0 1-.6-7.55 5.3 5.3 0 0 1 10.3.85 3.4 3.4 0 1 1 1.1 6.7m-8.5 2-1.5 3m5.5-3-1.5 3m5.5-3-1.5 3"/>',
    snow:'<path d="M6.7 15.5a3.8 3.8 0 0 1-.6-7.55 5.3 5.3 0 0 1 10.3.85 3.4 3.4 0 1 1 1.1 6.7M8 19v.1m4 1.9v.1m4-2.1v.1"/>',
  };
  function iconFor(label){
    const type=/눈/.test(label)?'snow':/비|소나기/.test(label)?'rain':/구름|흐림/.test(label)?'cloud':label==='맑음'?'sun':null;
    const box=make('span','df-home-weather-icon'+(type?' '+type:''));box.setAttribute('aria-hidden','true');
    box.innerHTML=type?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+shapes[type]+'</svg>':'–';
    return box;
  }
  function renderDays(days){
    const list=$('dfHomeWeatherDays'),fragment=document.createDocumentFragment();
    days.forEach((day,i)=>{
      const li=make('li','df-home-weather-day'+(i===0?' is-today':''));
      const time=make('time','df-home-weather-date',(i===0?'오늘 ':i===1?'내일 ':'')+dateText(day.date));
      time.dateTime=day.date;li.append(time);
      const am=day.am||'',pm=day.pm||'';
      const desc=am&&pm&&am!==pm?'오전 '+am+' · 오후 '+pm:am||pm||(day.waiting?'예보 확인 대기':'예보 없음');
      li.append(iconFor([am,pm].find(x=>/비|눈|소나기/.test(x))||pm||am));
      li.append(make('div','df-home-weather-condition',desc));
      const temp=make('div','df-home-weather-temp');
      const low=Number.isFinite(day.min)?day.min+'°':'–',high=Number.isFinite(day.max)?day.max+'°':'–';
      temp.setAttribute('aria-label','최저 '+low+' / 최고 '+high);
      temp.append(make('span','is-min',low),make('span','df-home-weather-slash','/'),make('span','is-max',high));
      const pop=make('div','df-home-weather-pop','강수 '+(Number.isFinite(day.pop)?day.pop+'%':'–'));
      li.append(temp,pop);
      fragment.append(li);
    });
    list.replaceChildren(fragment);
  }
  function errorLabel(code,short){
    if(code==='KEY_MISSING')return '기상청 인증키 설정 후 예보를 볼 수 있습니다.';
    if(code==='LOGIN_REQUIRED')return '로그인 상태를 확인한 뒤 새로고침해 주세요.';
    if(code==='KMA_ACCESS')return short?'기상청 단기예보 이용 설정을 확인해 주세요.':'기상청 중기예보 이용 설정을 확인해 주세요.';
    if(code==='KMA_LIMIT')return '기상청 조회 한도에 도달했습니다. 잠시 뒤 다시 확인해 주세요.';
    if(code==='FUNCTION_MISSING')return '예보 연결을 설정하면 이곳에 표시됩니다.';
    if(code==='WEATHER_TIMEOUT')return '예보 응답이 늦어지고 있습니다. 잠시 뒤 다시 확인해 주세요.';
    return '기상청 예보를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.';
  }
  function show(result,extra=''){
    const current=$('dfHomeWeatherStatus');
    renderDays(result?.days||[]);
    if(!result)return;
    const bits=[names.get(result.region)];
    if(result.shortIssued)bits.push('단기 '+issueText(result.shortIssued));
    if(result.midIssued)bits.push('중기 '+issueText(result.midIssued));
    if(result.shortError||result.midError){
      const short=!!result.shortError,code=result.shortError||result.midError;
      bits.push((short?'단기':'중기')+' 일부 조회 불가');
      if(code==='KMA_ACCESS'||code==='KMA_LIMIT')bits.push(errorLabel(code,short));
    }
    if(extra)bits.push(extra);
    current.textContent=bits.filter(Boolean).join(' · ');
  }
  function normalize(data,region,today){
    if(data?.code)return {code:safeIssue(data.code)||'WEATHER_UNAVAILABLE'};
    if(!data||data.region!==region||data.today!==today||!Array.isArray(data.days)||data.days.length!==7)throw Error('FORECAST_FORMAT');
    const timestamp=value=>typeof value==='string'&&value.length<=30&&Number.isFinite(Date.parse(value))?value:null;
    const condition=value=>typeof value==='string'&&value.length<=24&&/^[가-힣 /·]+$/.test(value)?value:null;
    const value=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max?n:null;
    const start=Date.parse(today+'T00:00:00Z');
    const days=data.days.map((d,i)=>{
      const date=new Date(start+i*dayMs).toISOString().slice(0,10);
      if(d?.date!==date)throw Error('FORECAST_FORMAT');
      return {date,am:condition(d.am),pm:condition(d.pm),pop:value(d.pop,0,100),min:value(d.min,-65,65),max:value(d.max,-65,65),
        source:['short','mid','mixed'].includes(d.source)?d.source:null};
    });
    return {region,today,days,shortIssued:timestamp(data.shortIssued),midIssued:timestamp(data.midIssued),
      shortError:safeIssue(data.shortError),midError:safeIssue(data.midError)};
  }
  const usableDay=d=>!!d?.source&&[d.am,d.pm,d.pop,d.min,d.max].some(x=>x!==null);
  const usable=result=>result?.days?.some(usableDay);
  const recent=(entry,region,today,ms)=>!!entry&&entry.result?.region===region&&entry.savedAt<=ms&&ms-entry.savedAt<=maxAge&&
    [today,dayAt(today,-1)].includes(entry.result.today);
  const until=(result,ms)=>ms+(result.shortError||result.midError?retry:fresh);
  function display(entry,today,ms){
    const {result,previous}=entry,rolled=result.today!==today;
    const old=recent(previous,result.region,today,ms)?previous.result.days:[];
    let reused=false;
    const days=Array.from({length:7},(_,i)=>{
      const date=dayAt(today,i),day=result.days.find(d=>d.date===date);
      if(usableDay(day))return day;
      const prior=old.find(d=>d.date===date&&usableDay(d));
      if(prior){reused=true;return prior;}
      return day||{date,waiting:true};
    });
    return {result:{...result,today,days},note:rolled?'이전 예보':reused?'일부 이전 예보 포함':''};
  }
  function bestPrevious(entry,result,ms){
    const missing=new Set(result.days.filter(d=>!usableDay(d)).map(d=>d.date));
    if(!missing.size)return null;
    let best=null,max=0;
    for(const candidate of [entry,entry?.previous]){
      if(!recent(candidate,result.region,result.today,ms))continue;
      const count=candidate.result.days.filter(d=>missing.has(d.date)&&usableDay(d)).length;
      if(count>max){max=count;best={result:candidate.result,savedAt:candidate.savedAt};}
    }
    return best;
  }
  function remember(){
    const rows=[...cache.values()].sort((a,b)=>b.savedAt-a.savedAt).slice(0,6);
    // Only public forecast summaries and their timestamps are stored, not account or session data.
    try{localStorage.setItem(savedKey,JSON.stringify(rows));}catch{}
  }
  function restore(today,ms){
    try{
      const raw=localStorage.getItem(savedKey);
      if(!raw||raw.length>36000)return;
      const entries=JSON.parse(raw);
      if(!Array.isArray(entries))return;
      const read=(entry,region)=>{
        if(!Number.isFinite(entry?.savedAt)||!names.has(region)||!recent(entry,region,today,ms))return null;
        try{
          const result=normalize(entry.result,region,entry.result.today);
          return usable(result)?{result,savedAt:entry.savedAt}:null;
        }catch{return null;}
      };
      for(const entry of entries.slice(0,6)){
        const saved=read(entry,entry?.result?.region);
        if(!saved)continue;
        const {result,savedAt}=saved;
        const previous=read(entry.previous,result.region);
        cache.set(result.region,{result,savedAt,until:result.today===today?until(result,savedAt):0,
          previous:previous?.savedAt<=savedAt?previous:null});
      }
    }catch{}
  }
  async function fetchForecast(client,region,today,controller){
    let timer;
    try{
      const timed=new Promise(resolve=>{
        timer=setTimeout(()=>{controller.abort();resolve({code:'WEATHER_TIMEOUT'});},12000);
      });
      const query=(async()=>{
        const {data,error}=await client.functions.invoke('dreamforen-weekly-weather',{body:{region},signal:controller.signal});
        if(!error)return normalize(data,region,today);
        const ctx=error.context;
        let response;
        try{response=await ctx?.json?.();}catch{}
        return {code:safeIssue(response?.code)||(ctx?.status===404?'FUNCTION_MISSING':[401,403].includes(ctx?.status)?'LOGIN_REQUIRED':'WEATHER_UNAVAILABLE')};
      })();
      return await Promise.race([query,timed]);
    }catch{return {code:'WEATHER_UNAVAILABLE'};}
    finally{clearTimeout(timer);}
  }
  function init(){
    const panel=$('dfHomeWeather'),home=$('dfViewHome'),select=$('dfHomeWeatherRegion'),refresh=$('dfHomeWeatherRefresh'),status=$('dfHomeWeatherStatus');
    if(!panel||!home||!select||!refresh||!status)return;
    for(const [group,rows] of regions){
      const options=document.createElement('optgroup');options.label=group;
      for(const [key,label] of rows){const option=make('option','',label);option.value=key;options.append(option);}
      select.append(options);
    }
    try{const chosen=localStorage.getItem(preference);select.value=names.has(chosen)?chosen:'anyang';}catch{select.value='anyang';}
    let client=null,account='',cacheDay='',flight=null,shown=null,displayedRegion='',shownNote='',shownMessage='';
    const failures=new Map();
    function session(){
      const id=typeof dfCloudUser!=='undefined'?dfCloudUser?.id:'';
      const api=typeof dfSupabase!=='undefined'?dfSupabase:null;
      return id&&api&&!document.body.classList.contains('df-auth-locked')?{id,api}:null;
    }
    const visible=()=>!home.hidden&&home.style.display!=='none'&&!document.hidden;
    function cancel(){
      if(!flight)return;
      const old=flight;flight=null;old.controller.abort();refresh.disabled=false;
    }
    function paint(entry,region,message=''){
      const view=entry&&display(entry,cacheDay,Date.now());
      const note=view?.note||'';
      if(shown!==entry||displayedRegion!==region||shownNote!==note||shownMessage!==message){
        if(view)show(view.result,[note,message].filter(Boolean).join(' · '));
        else{renderDays([]);status.textContent=message;}
      }
      shown=entry;displayedRegion=region;shownNote=note;shownMessage=message;
    }
    async function load(force=false){
      const s=session();
      if(!s){
        cancel();
        if(account){
          client=null;account='';cacheDay='';cache.clear();failures.clear();
          paint(null,'','예보를 불러오는 중입니다.');
        }
        return;
      }
      if(!visible())return;
      const today=isoToday(),ms=Date.now();
      if(client!==s.api||account!==s.id||cacheDay!==today){
        cancel();client=s.api;account=s.id;cacheDay=today;
        cache.clear();failures.clear();restore(today,ms);
        shown=null;displayedRegion='';
      }
      const region=names.has(select.value)?select.value:'anyang';
      if(flight?.region===region)return;
      cancel();
      const old=cache.get(region),hit=recent(old,region,today,ms)?old:null;
      const failure=failures.get(region);
      if(!force&&failure?.until>ms){
        if(failure.code==='LOGIN_REQUIRED')paint(null,region,failure.label);
        else if(hit)paint(hit,region,'새 예보를 확인하지 못했습니다.');
        else paint(null,region,failure.label);
        return;
      }
      if(navigator.onLine===false){
        paint(hit,region,hit?'오프라인 · 저장된 예보':'인터넷 연결 후 예보를 볼 수 있습니다.');
        return;
      }
      if(!force&&hit?.until>ms){paint(hit,region);return;}
      const request={region,controller:new AbortController()};
      flight=request;refresh.disabled=true;
      if(!hit)paint(null,region,names.get(region)+' 예보를 불러오는 중입니다.');
      else paint(hit,region,'최신 확인 중');
      const result=await fetchForecast(s.api,region,today,request.controller);
      if(flight!==request)return;
      flight=null;refresh.disabled=false;
      const current=session();
      if(current?.id!==s.id||current.api!==s.api||select.value!==region||cacheDay!==today)return;
      if(isoToday()!==today){void load();return;}
      if(usable(result)){
        const completed=Date.now();
        const entry={result,savedAt:completed,until:until(result,completed),previous:bestPrevious(hit,result,completed)};
        failures.delete(region);cache.set(region,entry);remember();paint(entry,region);
      }else{
        const code=result.code||result.shortError||result.midError||'WEATHER_UNAVAILABLE';
        const label=errorLabel(code,!!result.shortError||!result.midError);
        failures.set(region,{until:Date.now()+retry,code,label});
        if(hit&&code!=='LOGIN_REQUIRED'){
          paint(hit,region,'새 예보를 확인하지 못했습니다.');
        }else{
          paint(null,region,label);
        }
      }
    }
    select.addEventListener('change',()=>{try{localStorage.setItem(preference,select.value);}catch{}void load();});
    refresh.addEventListener('click',()=>void load(true));
    $('dfHomeRefresh')?.addEventListener('click',()=>void load(true));
    const watcher=new MutationObserver(()=>void load());
    watcher.observe(home,{attributes:true,attributeFilter:['hidden','style']});
    watcher.observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',()=>void load());
    window.addEventListener('pageshow',()=>void load());
    window.addEventListener('online',()=>void load(true));
    window.setInterval(()=>void load(),60*1000);
    void load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
