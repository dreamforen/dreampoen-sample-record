// ==========================================================
// DREAMFOREN v120.37.15.3
// 카카오내비 모바일 클릭 보강 + 에코랩 읍면동 기상격자 일치 + 시료채취기록 보정
// ==========================================================
(function dfV1203715NavigationWeatherGasOrder(){
  'use strict';

  const VERSION='v120.37.15.3';
  const KAKAO_SDK_ID='dfKakaoJavaScriptSdk';
  const KAKAO_SDK_URL='https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
  const KAKAO_SDK_INTEGRITY='sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy';
  const locationCache=new Map();
  let kakaoSdkPromise=null;

  const byId=id=>document.getElementById(id);
  const valueOf=id=>String(byId(id)?.value??'').trim();
  const setSilent=(id,value)=>{const el=byId(id);if(el)el.value=value??''};
  const companyName=company=>String(company?.Name||company?.name||'목적지').trim()||'목적지';
  const companyAddress=company=>String(company?.Address||company?.address||'').trim();

  function kakaoJavaScriptKey(){
    const config=window.DREAMFOREN_CONFIG||{};
    return String(
      config.kakaoJavaScriptKey||
      config.kakaoJavascriptKey||
      config.KAKAO_JAVASCRIPT_KEY||
      ''
    ).trim();
  }

  async function invokeLocation(address){
    if(!address)throw new Error('업체 주소가 없습니다.');
    if(typeof dfSupabase==='undefined'||!dfSupabase||typeof dfCloudUser==='undefined'||!dfCloudUser){
      throw new Error('로그인 후 주소를 확인할 수 있습니다.');
    }
    const {data,error}=await dfSupabase.functions.invoke('dreamforen-location',{body:{address}});
    if(error)throw new Error(error.message||String(error));
    if(!data?.success)throw new Error(data?.message||'업체 주소 좌표를 확인하지 못했습니다.');
    return data;
  }

  function cachedLocation(address){
    if(!locationCache.has(address)){
      const request=invokeLocation(address).catch(error=>{
        locationCache.delete(address);
        throw error;
      });
      locationCache.set(address,request);
    }
    return locationCache.get(address);
  }

  function storedDestination(company){
    const x=Number(company?.Longitude??company?.longitude??company?.lng);
    const y=Number(company?.Latitude??company?.latitude??company?.lat);
    return Number.isFinite(x)&&Number.isFinite(y)&&x!==0&&y!==0
      ?{name:companyName(company),address:companyAddress(company),x,y}
      :null;
  }

  async function prepareDestination(company){
    const stored=storedDestination(company);
    if(stored)return stored;
    const address=companyAddress(company);
    const located=await cachedLocation(address);
    const x=Number(located.longitude),y=Number(located.latitude);
    if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('카카오내비에 전달할 업체 좌표가 없습니다.');
    return {name:companyName(company),address,x,y};
  }

  function initializeKakaoSdk(){
    const key=kakaoJavaScriptKey();
    if(window.Kakao?.isInitialized?.())return window.Kakao;
    if(!key){
      const error=new Error('카카오 JavaScript 키가 설정되지 않았습니다.');
      error.code='KAKAO_KEY_MISSING';
      throw error;
    }
    if(!window.Kakao?.init)throw new Error('카카오 JavaScript SDK를 불러오지 못했습니다.');
    window.Kakao.init(key);
    if(!window.Kakao.isInitialized?.())throw new Error('카카오 JavaScript SDK 초기화에 실패했습니다.');
    return window.Kakao;
  }

  function ensureKakaoSdk(){
    if(window.Kakao?.isInitialized?.())return Promise.resolve(window.Kakao);
    if(!kakaoJavaScriptKey()){
      const error=new Error('카카오 JavaScript 키가 설정되지 않았습니다.');
      error.code='KAKAO_KEY_MISSING';
      return Promise.reject(error);
    }
    if(window.Kakao?.init){
      try{return Promise.resolve(initializeKakaoSdk())}catch(error){return Promise.reject(error)}
    }
    if(kakaoSdkPromise)return kakaoSdkPromise;
    kakaoSdkPromise=new Promise((resolve,reject)=>{
      let script=byId(KAKAO_SDK_ID);
      const finish=()=>{try{resolve(initializeKakaoSdk())}catch(error){reject(error)}};
      const fail=()=>reject(new Error('카카오 JavaScript SDK를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.'));
      if(script){
        script.addEventListener('load',finish,{once:true});
        script.addEventListener('error',fail,{once:true});
        return;
      }
      script=document.createElement('script');
      script.id=KAKAO_SDK_ID;
      script.src=KAKAO_SDK_URL;
      script.integrity=KAKAO_SDK_INTEGRITY;
      script.crossOrigin='anonymous';
      script.addEventListener('load',finish,{once:true});
      script.addEventListener('error',fail,{once:true});
      document.head.appendChild(script);
    }).catch(error=>{kakaoSdkPromise=null;throw error});
    return kakaoSdkPromise;
  }

  function missingKakaoKeyMessage(){
    return '카카오내비를 처음 연결하려면 카카오 JavaScript 키 설정이 1회 필요합니다.\n\n'+
      '1. 카카오디벨로퍼스의 기존 앱에서 JavaScript 키를 확인\n'+
      '2. JavaScript SDK 도메인에 https://dreamforen.github.io 등록\n'+
      "3. 기존 config.js 안에 kakaoJavaScriptKey: '발급받은 키' 추가\n\n"+
      '키 설정 전에는 카카오맵으로 잘못 우회하지 않도록 차단해 두었습니다.';
  }

  function showKakaoNaviError(error){
    if(error?.code==='KAKAO_KEY_MISSING')alert(missingKakaoKeyMessage());
    else alert(`카카오내비를 열지 못했습니다.\n${error?.message||error}`);
    window.DF_DIAG?.error?.('KAKAO-NAVI-ERROR','카카오내비 실행 실패',String(error?.message||error));
  }

  function startPreparedKakaoNavi(destination,kakao){
    if(!kakao?.Navi?.start)throw new Error('카카오내비 실행 기능을 찾지 못했습니다.');
    // 모바일 브라우저가 앱 실행을 실제 버튼 터치로 인식하도록
    // 주소·SDK 준비가 끝난 상태에서 클릭 이벤트 안에서 즉시 호출한다.
    kakao.Navi.start({
      name:destination.name,
      x:destination.x,
      y:destination.y,
      coordType:'wgs84'
    });
    window.DF_DIAG?.info('KAKAO-NAVI-START','카카오내비 공식 SDK 실행',`${destination.name} / ${destination.address}`);
  }

  function patchNavigationButton(company){
    const result=byId('navigationResult');
    const button=result?.querySelector('.navigation-route-buttons .kakao-navi');
    if(!button||!company)return;
    const original='카카오내비';
    const help=result.querySelector('.navigation-route-help');
    let prepared=null;
    let preparing=null;

    const setButton=(text,disabled)=>{
      if(!button.isConnected)return;
      button.textContent=text;
      button.disabled=disabled;
      button.setAttribute('aria-busy',disabled?'true':'false');
    };
    const setDefaultHelp=()=>{
      if(!help)return;
      help.textContent=kakaoJavaScriptKey()
        ?'카카오맵은 장소 확인, 카카오내비는 목적지 길안내, 티맵은 주소 검색으로 각각 연결됩니다.'
        :'카카오내비는 최초 1회 JavaScript 키 설정 후 앱으로 연결됩니다. 카카오맵과 티맵은 지금 사용할 수 있습니다.';
    };
    const prepare=()=>{
      if(prepared)return Promise.resolve(prepared);
      if(preparing)return preparing;
      preparing=Promise.all([prepareDestination(company),ensureKakaoSdk()])
        .then(([destination,kakao])=>(prepared={destination,kakao}))
        .finally(()=>{preparing=null});
      return preparing;
    };

    button.onclick=()=>{
      if(!window.Kakao?.isInitialized?.()&&!kakaoJavaScriptKey()){
        alert(missingKakaoKeyMessage());
        return;
      }
      if(prepared){
        try{startPreparedKakaoNavi(prepared.destination,prepared.kakao)}
        catch(error){showKakaoNaviError(error)}
        return;
      }

      // 아직 준비 중일 때는 비동기 완료 뒤 자동 실행하지 않는다.
      // 자동 실행은 모바일에서 팝업/앱 호출로 차단될 수 있으므로 준비 후 한 번 더 터치하게 한다.
      setButton('내비 준비 중',true);
      if(help)help.textContent='업체 주소와 카카오내비를 준비하고 있습니다.';
      prepare().then(()=>{
        setButton(original,false);
        if(help)help.textContent='준비가 끝났습니다. 카카오내비 버튼을 눌러주세요.';
      }).catch(error=>{
        setButton(original,false);
        setDefaultHelp();
        showKakaoNaviError(error);
      });
    };
    button.title='카카오내비 앱으로 목적지를 전달합니다.';
    setDefaultHelp();
    if(kakaoJavaScriptKey()){
      setButton('내비 준비 중',true);
      if(help)help.textContent='업체 주소와 카카오내비를 준비하고 있습니다.';
      prepare().then(()=>{
        setButton(original,false);
        setDefaultHelp();
      }).catch(error=>{
        setButton(original,false);
        if(help)help.textContent='카카오내비 준비에 실패했습니다. 버튼을 눌러 오류 내용을 확인해주세요.';
        window.DF_DIAG?.error?.('KAKAO-NAVI-PREPARE','카카오내비 사전 준비 실패',String(error?.message||error));
      });
    }
  }

  if(typeof navigationRenderCompany==='function'){
    const baseNavigationRender=navigationRenderCompany;
    navigationRenderCompany=function(company){
      baseNavigationRender(company);
      if(company)patchNavigationButton(company);
    };
  }

  function applyEcolabWeatherLocation(location,regionAddress){
    setSilent('weatherRegion1',location.region_1depth_name||'');
    setSilent('weatherRegion2',location.region_2depth_name||'');
    setSilent('weatherRegion3',location.region_3depth_name||'');
    setSilent('weatherRegionCode',location.code||'');
    setSilent('weatherNx',location.nx??'');
    setSilent('weatherNy',location.ny??'');
    setSilent('weatherMatchedAddress',regionAddress||location.matched_address||location.input_address||'');
    setSilent('weatherLocationSource','auto-ecolab-region');
    if(typeof scheduleAutoSave==='function')scheduleAutoSave();
  }

  async function preferEcolabCompanyWeatherGrid(){
    if(typeof findSampleCompanyByInput!=='function')return false;
    const company=findSampleCompanyByInput();
    const address=companyAddress(company);
    if(!company||!address)return false;
    const source=valueOf('weatherLocationSource');

    // 사용자가 직접 지정한 위치는 자동으로 덮어쓰지 않는다.
    if(source==='manual')return false;

    // 에코랩은 상세 도로주소가 아니라 시/도·시/군/구·읍/면/동 선택값의 중심 격자를 사용한다.
    // 상세주소는 행정구역 판별에만 사용하고, 기상조회 격자는 행정구역명으로 한 번 더 변환한다.
    const detailLocation=await cachedLocation(address);
    const regionAddress=[
      detailLocation.region_1depth_name,
      detailLocation.region_2depth_name,
      detailLocation.region_3depth_name
    ].map(value=>String(value||'').trim()).filter(Boolean).join(' ');
    if(!detailLocation.region_1depth_name||!detailLocation.region_2depth_name||!detailLocation.region_3depth_name){
      throw new Error('업체 상세주소에서 읍·면·동을 확인하지 못했습니다.');
    }
    const regionLocation=await cachedLocation(regionAddress);
    applyEcolabWeatherLocation(regionLocation,regionAddress);
    window.DF_DIAG?.info('WEATHER-ECOLAB-GRID','에코랩 읍면동 중심 기상격자 적용',`${regionAddress} / nx ${regionLocation.nx}, ny ${regionLocation.ny}`);
    return true;
  }

  if(typeof window.dfWeatherLoad==='function'){
    const baseWeatherLoad=window.dfWeatherLoad;
    window.dfWeatherLoad=async function dfV12037152WeatherLoad(){
      try{await preferEcolabCompanyWeatherGrid()}
      catch(error){
        window.DF_DIAG?.error?.('WEATHER-ECOLAB-GRID-ERROR','에코랩 읍면동 격자 확인 실패',String(error?.message||error));
      }
      return baseWeatherLoad();
    };
  }

  function bindWeatherButton(){
    const button=byId('dfWeatherLoad');
    if(button)button.onclick=()=>window.dfWeatherLoad?.();
  }

  function reorderGasItems(){
    const select=byId('gasItemSelect');
    if(!select||select.dataset.dfV1203715Order==='1')return;
    const preferred=['총탄화수소','질소산화물','황산화물'];
    const last='비소화합물';
    const options=[...select.options];
    const byValue=new Map(options.map(option=>[option.value,option]));
    const middle=options.map(option=>option.value).filter(value=>!preferred.includes(value)&&value!==last);
    [...preferred,...middle,last].forEach(value=>{
      const option=byValue.get(value);
      if(option)select.appendChild(option);
    });
    if(byValue.has(preferred[0]))select.value=preferred[0];
    select.dataset.dfV1203715Order='1';
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic');
    const footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · SAMPLE RECORD FIX`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    reorderGasItems();
    bindWeatherButton();
    applyVersion();
    [80,450,1100].forEach(delay=>setTimeout(()=>{reorderGasItems();bindWeatherButton();applyVersion()},delay));
    window.DF_DIAG?.info('SAMPLE-RECORD-12037153','측정점 순서·가스항목·CO 기본값·등속흡인계수 표시 보정 완료','기존 계약/견적/ERP/여지/기상/내비 자동연동 변경 없음');
  }

  window.dfV1203715PrepareDestination=prepareDestination;
  window.dfV1203715PreferExactWeatherGrid=preferEcolabCompanyWeatherGrid;
  window.dfV12037152PreferEcolabWeatherGrid=preferEcolabCompanyWeatherGrid;
  window.DF_NAV_WEATHER_GAS_VERSION=VERSION;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
