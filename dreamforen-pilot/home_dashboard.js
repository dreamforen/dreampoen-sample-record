/* DREAMFOREN · independent, read-only home dashboard refresh. */
(function(){
  'use strict';
  const byId=id=>document.getElementById(id),home=byId('dfViewHome');
  if(!home)return;
  const categories=['notice','method','board'],boardIds=['dfHomeNotice','dfHomeMethod','dfHomeBoard'];
  const snapshotKey='df_home_progress_v410',boardTtl=20000,progressTtl=15000,maxAge=12*3600000;
  let owner=null,signedOut=false,progressTimer=0;
  const seoulYear=()=>new Date(Date.now()+9*3600000).getUTCFullYear();
  function year(){return Number(byId('companyTrackYear')?.value)||seoulYear();}
  function visible(){return !document.hidden&&!home.hidden&&home.style.display!=='none';}
  function login(){
    if(signedOut||typeof dfCloudUser==='undefined'||!dfCloudUser?.id||!dfCloudProfile||
       (dfCloudProfile.id&&dfCloudProfile.id!==dfCloudUser.id)||dfCloudProfile.active===false||dfCloudProfile.retired_at||!dfSupabase)return null;
    const permissions=dfCloudProfile.access_permissions||dfCloudProfile.board_permissions||{};
    const legacy=dfCloudProfile.role==='admin'||permissions.home!==false;
    if(!dfMenuCan('home','view',legacy))return null;
    return {api:dfSupabase,id:String(dfCloudUser.id),project:dfCfg()?.url||''};
  }
  function clearBoard(message='게시글을 불러오는 중입니다.'){
    for(const id of boardIds){
      const node=byId(id);
      if(!node)continue;
      node._posts=[];
      const empty=document.createElement('div');
      empty.className='df-home-empty';empty.textContent=message;
      node.replaceChildren(empty);
    }
  }
  function renderProgress(summary,message=''){
    const set=(id,value)=>{const node=byId(id);if(node&&node.textContent!==String(value))node.textContent=value;};
    const pct=summary?(summary.all?Math.round(summary.completed/summary.all*100):0):null;
    set('dfHomeProgressYear',year()+'년');
    set('dfHomeMeasureAll',summary?.all??'–');set('dfHomeMeasurePlanned',summary?.incomplete??'–');
    set('dfHomeMeasureConfirmed',summary?.check??'–');set('dfHomeMeasureCompleted',summary?.completed??'–');
    set('dfHomeProgressPct',pct===null?'–':pct+'%');
    const detail=summary?(summary.all?summary.completed+'개 업체 완료 / '+summary.all+'개 업체현황 기준':'진행 업체가 없습니다.'):'';
    set('dfHomeProgressText',[detail,message].filter(Boolean).join(' · ')||'측정 진행률 확인 중');
    const bar=byId('dfHomeProgressBar');if(bar)bar.style.width=(pct??0)+'%';
  }
  function cached(s,y){
    if(s.summary?.year===y&&Date.now()-s.summary.at>=0&&Date.now()-s.summary.at<=maxAge)return s.summary;
    try{
      const r=JSON.parse(sessionStorage.getItem(snapshotKey)||'null');
      if(r?.id===s.id&&r.project===s.project&&s.project&&r.year===y&&Date.now()-r.at>=0&&Date.now()-r.at<=maxAge&&
         [r.all,r.completed,r.incomplete,r.check].every(n=>Number.isSafeInteger(n)&&n>=0)&&r.completed+r.incomplete+r.check===r.all)return r;
    }catch{}
    return null;
  }
  function context(){
    const s=login();
    // Role setup can finish before the login overlay closes. Collect readiness,
    // but don't display data or initiate reads while the overlay is locked.
    if(!s){
      if(owner){owner=null;clearBoard();renderProgress(null);}
      return null;
    }
    if(owner?.api===s.api&&owner.id===s.id&&owner.project===s.project)return owner;
    if(owner){clearBoard();renderProgress(null);}
    owner={...s,boardAt:0,boardGeneration:0,scheduleGeneration:0,scheduleAt:0,lastRendered:null};
    return owner;
  }
  function canDisplay(s){
    return s===context()&&visible()&&!document.body.classList.contains('df-auth-locked');
  }
  function loadBoard(s,{force=false,boardChanged=false}={}){
    if(boardChanged){s.boardGeneration++;s.boardAt=0;s.boardFlight=null;}
    if(s.boardFlight)return s.boardFlight;
    if(!force&&!boardChanged&&Date.now()-s.boardAt<boardTtl)return;
    const generation=s.boardGeneration;
    const flight=Promise.resolve().then(async()=>{
      if(!canDisplay(s))return;
      try{
        const q=s.api.from(DF_HOME_POST_TABLE).select('id,category,title,content,attachments,created_at,created_by')
          .order('created_at',{ascending:false}).limit(60);
        const {data,error}=await DFContractSites.request(q,'홈 게시판 조회',10000);
        if(generation!==s.boardGeneration||s!==context())return;
        if(error)throw error;
        if(!Array.isArray(data))throw Error('게시판 응답을 확인해주세요.');
        s.boardAt=Date.now();
        categories.forEach(cat=>dfHomeRenderPosts(cat,data));
      }catch(e){
        if(generation!==s.boardGeneration||s!==context())return;
        if(!s.boardAt)clearBoard(e?.message?.includes('attachments')?'게시판 첨부파일 설정을 확인해주세요.':'게시판을 불러오지 못했습니다.');
        window.DF_DIAG?.warn('HOME-BOARD','홈 게시판 조회 실패',e?.code||e?.message);
      }
    }).finally(()=>{if(s.boardFlight===flight)s.boardFlight=null;});
    s.boardFlight=flight;return flight;
  }
  async function readCompleted(s,y,generation){
    const rows=[],size=500;
    for(let start=0;;){
      const q=s.api.from('schedules').select('id,company_id,schedule_date,schedule_type,status,completed,extra_data',{count:'exact'})
        .gte('schedule_date',y+'-01-01').lt('schedule_date',(y+1)+'-01-01')
        .or('completed.eq.true,status.eq.completed').like('schedule_type','%측정%')
        .order('schedule_date',{ascending:true}).order('id',{ascending:true}).range(start,start+size-1);
      const {data,error,count}=await DFContractSites.request(q,'홈 측정 완료일 조회',9000);
      if(s!==context()||generation!==s.scheduleGeneration||year()!==y)return null;
      if(error)throw error;
      if(!Array.isArray(data))throw Error('완료 일정 응답을 확인해주세요.');
      rows.push(...data);start+=data.length;
      if(Number.isFinite(count)?start>=count:data.length<size)break;
      if(!data.length)throw Error('완료 일정 목록을 모두 확인하지 못했습니다.');
    }
    return rows;
  }
  function indexSourceDates(s,y){
    if(y!==2026&&!dfV120633SourceGroups().some(src=>(src.dates||[]).some(v=>+companyIsoDate(v).slice(0,4)===y)))return new Map();
    const snapshot=dfV120633BuildMatchSnapshot();
    if(s.sourceIndex?.snapshot===snapshot&&s.sourceIndex.year===y)return s.sourceIndex.dates;
    const dates=new Map();
    for(const row of dfV120633SourceGroups()){
      const id=snapshot.assigned.get(String(row.key));if(!id)continue;
      for(const value of row.dates||[]){
        const date=companyIsoDate(value);
        if(date&&+date.slice(0,4)===y){
          if(!dates.has(String(id)))dates.set(String(id),new Set());
          dates.get(String(id)).add(date);
        }
      }
    }
    for(const [id,ds] of dates)dates.set(id,[...ds].sort());
    s.sourceIndex={snapshot,year:y,dates};return dates;
  }
  function compute(s){
    if(!canDisplay(s))return;
    const y=year(),previous=cached(s,y);
    if(s.scheduleYear!==y||!s.catalogReady||s.scope!==companyState.contractCompanies||!s.scope||!s.scheduleRows){
      const failed=s.progressError||s.bootstrapDone&&(!s.catalogReady||s.scope!==companyState.contractCompanies);
      renderProgress(previous,failed?'최신 진행률을 확인하지 못했습니다.':previous?'최신 자료 확인 중':'측정 진행률 확인 중');
      return;
    }
    if(s.progressError){renderProgress(previous,'최신 진행률을 확인하지 못했습니다.');return;}
    if(s.lastRendered?.scope===s.scope&&s.lastRendered?.rows===s.scheduleRows&&s.lastRendered?.revision===s.revision&&s.summary?.year===y){
      renderProgress(s.summary,s.scheduleFlight?'최신 자료 확인 중':navigator.onLine===false?'오프라인 · 최근 조회값':'');return;
    }
    const companies=s.scope.filter(c=>c&&c.Active!==false);
    const uuidMap=new Map((companyState.db?.Companies||[]).filter(c=>c.OnlineId).map(c=>[String(c.OnlineId),String(c.Id||c.OnlineId)]));
    const schedules=s.scheduleRows.map(r=>dfV1131MapScheduleRow(r,uuidMap));
    const progressSource={sourceDates:indexSourceDates(s,y),schedules,scheduleIndex:window.dfHomeIndexCompletedSchedules(schedules)};
    let completed=0,incomplete=0,check=0;
    for(const company of companies){
      const item=dfV1206ProgressInfo(company,y,progressSource);
      if(item.ok)completed++;else if(item.memoStatus==='incomplete')incomplete++;else check++;
    }
    const summary={id:s.id,project:s.project,year:y,at:Date.now(),all:companies.length,completed,incomplete,check};
    s.lastRendered={scope:s.scope,rows:s.scheduleRows,revision:s.revision};
    s.summary=summary;
    try{if(s.project)sessionStorage.setItem(snapshotKey,JSON.stringify(summary));}catch{}
    renderProgress(summary);
  }
  function queueProgress(){
    clearTimeout(progressTimer);
    progressTimer=setTimeout(()=>{
      const s=context();if(!s)return;
      try{compute(s);}catch(e){
        if(canDisplay(s))renderProgress(cached(s,year()),'최신 진행률을 확인하지 못했습니다.');
        window.DF_DIAG?.warn('HOME-PROGRESS','측정 진행률 표시 실패',e?.code||e?.message);
      }
    },0);
  }
  function loadProgress(s,force=false){
    const y=year(),now=Date.now();
    if(s.scheduleFlight?.year===y)return;
    if(s.scheduleYear!==y){
      s.scheduleGeneration++;s.scheduleYear=y;s.scheduleRows=null;s.scheduleAt=0;s.progressError=false;
      renderProgress(cached(s,y),cached(s,y)?'최신 자료 확인 중':'');
    }
    if(!force&&s.scheduleAt&&now-s.scheduleAt<progressTtl){queueProgress();return;}
    if(navigator.onLine===false){renderProgress(cached(s,y),'오프라인 · 최근 조회값');return;}
    const request={year:y,generation:s.scheduleGeneration};s.scheduleFlight=request;
    renderProgress(cached(s,y),'최신 자료 확인 중');
    void readCompleted(s,y,request.generation).then(rows=>{
      if(!rows||s!==context()||s.scheduleFlight!==request||year()!==y)return;
      const signature=JSON.stringify(rows);
      if(signature!==s.scheduleSignature||!s.scheduleRows){s.scheduleRows=rows;s.scheduleSignature=signature;}
      s.progressError=false;s.scheduleAt=Date.now();
    }).catch(e=>{
      if(s!==context()||s.scheduleFlight!==request)return;
      s.scheduleAt=Date.now();s.progressError=true;
      window.DF_DIAG?.warn('HOME-PROGRESS','측정 완료일 조회 실패',e?.code||e?.message);
    }).finally(()=>{if(s.scheduleFlight===request){s.scheduleFlight=null;queueProgress();}});
  }
  function ready(api,id,kind){
    // A staff permissions response may still be pending when login pulls finish.
    // Stage only readiness for the same live identity; no data is shown here.
    if(!api||!id||api!==dfSupabase||id!==dfCloudUser?.id)return;
    const slot={api,id,...(pending?.api===api&&pending.id===id?pending:{})};
    if(kind==='scope')slot.scope=companyState.contractCompanies;
    if(kind==='catalog')slot.catalogReady=true;
    if(kind==='done')slot.bootstrapDone=true;
    slot.revision=(slot.revision||0)+1;
    pending=slot;
    hydrate(context());queueProgress();
  }
  let pending=null;
  function hydrate(s){
    if(s&&pending?.api===s.api&&pending.id===s.id){
      const {scope,catalogReady,bootstrapDone,revision}=pending;
      Object.assign(s,{scope,catalogReady,bootstrapDone,revision});
    }
  }
  function scheduleSaved(){
    const s=context();if(!s)return;
    s.scheduleGeneration++;s.scheduleAt=0;s.scheduleFlight=null;
    if(canDisplay(s))loadProgress(s,true);
  }
  function retryInputs(s){
    if(!s.bootstrapDone||s.catalogFlight||navigator.onLine===false||
       s.catalogReady&&s.scope===companyState.contractCompanies)return;
    s.bootstrapDone=false;
    if(pending?.api===s.api&&pending.id===s.id)pending.bootstrapDone=false;
    s.catalogFlight=Promise.resolve().then(()=>{
      if(s!==context())return;
      return dfV68PullCompanies({render:false});
    }).catch(e=>window.DF_DIAG?.warn('HOME-PROGRESS','측정업체 재조회 실패',e?.code||e?.message))
      .finally(()=>{s.catalogFlight=null;ready(s.api,s.id,'done');});
  }
  function load(options={}){
    const s=context();if(!s)return Promise.resolve();
    hydrate(s);
    if(!canDisplay(s))return Promise.resolve();
    const welcome=byId('dfHomeWelcome'),text=(dfCloudProfile.name||'사용자')+'님, 오늘의 공지와 측정 진행상황입니다.';
    if(welcome&&welcome.textContent!==text)welcome.textContent=text;
    const board=loadBoard(s,options);
    if(!options.boardChanged){
      if(options.force)retryInputs(s);
      loadProgress(s,!!options.force);
    }
    return Promise.resolve(board);
  }
  dfHomeRenderProgress=queueProgress;
  dfHomeLoad=load;
  window.DF_HOME_DASHBOARD={
    scopeReady:(api,id)=>ready(api,id,'scope'),companiesReady:(api,id)=>ready(api,id,'catalog'),
    bootstrapEnded:(api,id)=>ready(api,id,'done'),inputsChanged:(api,id)=>ready(api,id,'inputs'),scheduleSaved
  };
  const observer=new MutationObserver(()=>void load());
  observer.observe(home,{attributes:true,attributeFilter:['hidden','style']});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('df:menu-permissions-changed',e=>{
    signedOut=!!e.detail?.signedOut;
    if(signedOut){pending=null;try{sessionStorage.removeItem(snapshotKey);}catch{}}
    void load();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
  window.addEventListener('focus',()=>void load());
  window.addEventListener('pageshow',()=>void load());
  window.addEventListener('online',()=>void load({force:true}));
  window.setInterval(()=>{const s=context();if(s&&canDisplay(s))loadProgress(s);},30000);
  void load();
})();
