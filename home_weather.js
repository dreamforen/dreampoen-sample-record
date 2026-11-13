/* DREAMFOREN · 7-day KMA forecast on the home screen. */
(function(){
  'use strict';
  const regions=[
    ['경기',[
      ['anyang','안양시 만안구'],['suwon','수원시'],['ansan','안산시'],['siheung','시흥시'],['hwaseong','화성시'],
      ['pyeongtaek','평택시'],['anseong','안성시'],['yongin','용인시'],
    ]],
    ['서울·인천',[['seoul','서울'],['incheon','인천']]],
    ['충남',[['cheonan','천안시'],['asan','아산시']]],
  ];
  const names=new Map(regions.flatMap(([,rows])=>rows)), preference='df_home_forecast_region';
  const ttl=15*60000, retry=60*1000, cache=new Map();
  const $=id=>document.getElementById(id);
  const weekday=['일','월','화','수','목','금','토'];
  const kst=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const isoToday=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
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
      const desc=am&&pm&&am!==pm?'오전 '+am+' · 오후 '+pm:am||pm||'예보 없음';
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
    if(code==='KMA_ACCESS')return short?'기상청 단기예보 이용 설정을 확인해 주세요.':'기상청 중기예보 활용 신청과 인증키를 확인해 주세요.';
    if(code==='KMA_LIMIT')return '기상청 조회 한도에 도달했습니다. 잠시 뒤 다시 확인해 주세요.';
    if(code==='FUNCTION_MISSING')return '7일 예보 연결을 설정하면 이곳에 표시됩니다.';
    return '기상청 예보를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.';
  }
  function show(result){
    renderDays(result.days||[]);
    const current=$('dfHomeWeatherStatus');
    if(result.code){current.textContent=errorLabel(result.code,true);return;}
    const bits=[names.get(result.region)];
    if(result.shortIssued)bits.push('단기 '+issueText(result.shortIssued)+' 발표');
    if(result.midIssued)bits.push('중기 '+issueText(result.midIssued)+' 발표');
    if(result.shortError||result.midError){
      const short=!!result.shortError,code=result.shortError||result.midError;
      bits.push((short?'단기':'중기')+' 일부 조회 불가');
      if(code==='KMA_ACCESS'||code==='KMA_LIMIT')bits.push(errorLabel(code,short));
    }else if(result.days.some(d=>!d.source))bits.push('아직 발표되지 않은 날짜가 있습니다.');
    current.textContent=bits.filter(Boolean).join(' · ');
  }
  function normalize(data,region){
    if(data?.code)return {code:data.code};
    if(!data||data.region!==region||data.today!==isoToday()||!Array.isArray(data.days)||data.days.length!==7)throw new Error('FORECAST_FORMAT');
    for(const [i,d] of data.days.entries()){
      const expected=new Date(Date.parse(data.today+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
      if(d?.date!==expected)throw new Error('FORECAST_FORMAT');
    }
    return data;
  }
  function init(){
    const panel=$('dfHomeWeather'),home=$('dfViewHome'),select=$('dfHomeWeatherRegion'),refresh=$('dfHomeWeatherRefresh'),status=$('dfHomeWeatherStatus');
    if(!panel||!home||!select||!refresh||!status)return;
    for(const [group,rows] of regions){
      const options=document.createElement('optgroup');options.label=group;
      for(const [key,label] of rows){const option=make('option','',label);option.value=key;options.append(option);}
      select.append(options);
    }
    let chosen='anyang';
    try{const saved=localStorage.getItem(preference);if(names.has(saved))chosen=saved;}catch{}
    select.value=chosen;
    let version=0,requestKey='',activeId='',activeClient=null,displayedKey='';
    function current(){
      const id=typeof dfCloudUser!=='undefined'?dfCloudUser?.id:'';
      const client=typeof dfSupabase!=='undefined'?dfSupabase:null;
      return id&&client&&!home.hidden&&home.style.display!=='none'&&!document.body.classList.contains('df-auth-locked')&&!document.hidden?{id,client}:null;
    }
    async function load(force=false){
      const session=current();
      if(!session){
        if(requestKey){version++;requestKey='';refresh.disabled=false;}
        if(typeof dfCloudUser==='undefined'||!dfCloudUser?.id){activeId='';activeClient=null;cache.clear();displayedKey='';if($('dfHomeWeatherDays').firstChild)renderDays([]);}
        return;
      }
      if(activeId!==session.id||activeClient!==session.client){
        activeId=session.id;activeClient=session.client;cache.clear();requestKey='';displayedKey='';version++;
      }
      const region=names.has(select.value)?select.value:'anyang',key=region+':'+isoToday();
      if(requestKey===key)return;
      const token=++version;
      requestKey='';refresh.disabled=false;
      const hit=cache.get(key),ms=Date.now();
      if(!force&&hit&&hit.until>ms){
        if(displayedKey!==key){show(hit.result);displayedKey=key;}
        return;
      }
      for(const [old,entry] of cache)if(entry.until<=ms)cache.delete(old);
      requestKey=key;refresh.disabled=true;
      if(displayedKey!==key){renderDays([]);displayedKey='';}
      status.textContent=names.get(region)+' 예보를 불러오는 중입니다.';
      const owner=()=>{const c=current();return token===version&&c?.id===session.id&&c.client===session.client&&select.value===region;};
      let result;
      try{
        const {data,error}=await session.client.functions.invoke('dreamforen-weekly-weather',{body:{region}});
        if(error){
          const ctx=error.context;
          let response;
          try{response=await ctx?.json?.();}catch{}
          result={code:response?.code||(ctx?.status===404?'FUNCTION_MISSING':[401,403].includes(ctx?.status)?'LOGIN_REQUIRED':'WEATHER_UNAVAILABLE')};
        }else result=normalize(data,region);
      }catch{result={code:'WEATHER_UNAVAILABLE'};}
      if(!owner()){
        if(token===version){requestKey='';refresh.disabled=false;}
        return;
      }
      requestKey='';refresh.disabled=false;
      if(!result.code&&(result.shortError||result.midError)&&result.days.every(d=>!d.source))result={code:result.shortError||result.midError};
      // A transient error must not replace a just-loaded valid forecast for this region and date.
      if(result.code==='WEATHER_UNAVAILABLE'&&hit?.result?.days?.some(d=>d.source)){
        show(hit.result);status.textContent+=' · 최신 예보 재조회 실패';
        cache.set(key,{result:hit.result,until:ms+retry});
      }else{
        show(result);
        cache.set(key,{result,until:ms+(result.code||result.shortError||result.midError?retry:ttl)});
      }
      displayedKey=key;
    }
    select.addEventListener('change',()=>{try{localStorage.setItem(preference,select.value);}catch{}void load();});
    refresh.addEventListener('click',()=>void load(true));
    $('dfHomeRefresh')?.addEventListener('click',()=>void load(true));
    const watcher=new MutationObserver(()=>void load());
    watcher.observe(home,{attributes:true,attributeFilter:['hidden','style']});
    watcher.observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',()=>void load());
    window.addEventListener('pageshow',()=>void load());
    window.setInterval(()=>void load(),5*60000);
    void load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
