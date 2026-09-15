// ==========================================================
// DREAMFOREN v120.37.15.8
// 일정완료 -> 업체현황 반영 / 팀별 적산유량 승계 / 조회 부하 완화
// 문서·인쇄·기상·여지대장·LAB 계산 로직은 변경하지 않는다.
// ==========================================================
(function dfV12037158ScheduleMeterAndSpeed(){
  'use strict';

  const VERSION='v120.37.15.8';
  const SCHEDULE_POLL_MS=60000;
  const byId=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();
  const uniqueSorted=values=>[...new Set((values||[]).filter(Boolean))].sort();

  // ----------------------------------------------------------
  // 1) 시료채취기록지: 1팀과 2팀의 직전 적산값을 각각 승계한다.
  // 자동으로 들어온 값만 팀 전환 때 교체하고 사용자가 직접 입력한 값은 보존한다.
  // ----------------------------------------------------------
  let meterAuto={team:'',value:''};
  let meterManual=false;
  let settingMeter=false;

  function meterInput(){return byId('meterBefore')}
  function meterRecordDate(row){
    const value=text(row?.data?.fields?.measureDate||row?.createdAt).slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:'';
  }
  function meterTargetDate(){
    const value=text(byId('measureDate')?.value).slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:'';
  }
  function meterAfterFromRecord(row){
    const data=row?.data||{};
    const before=Number(data.fields?.meterBefore);
    const points=data.recordType==='combo'?(data.comboDustPoints||data.points||[]):(data.points||[]);
    const volume=(points||[]).reduce((sum,point)=>{
      const amount=Number(point?.volume);
      return sum+(Number.isFinite(amount)?amount:0);
    },0);
    return Number.isFinite(before)&&volume>0?(before+volume).toFixed(1):'';
  }
  function teamPreviousMeterAfter(team){
    const wanted=text(team||selectedTeam||'2');
    const target=meterTargetDate();
    const rows=(typeof readRecordStore==='function'?readRecordStore():[])
      .filter(row=>String(row?.id)!==String(typeof currentRecordId!=='undefined'?(currentRecordId||''):'')&&text(row?.data?.selectedTeam||'2')===wanted)
      .filter(row=>!target||!meterRecordDate(row)||meterRecordDate(row)<=target)
      .sort((a,b)=>meterRecordDate(b).localeCompare(meterRecordDate(a))||text(b.updatedAt||b.createdAt).localeCompare(text(a.updatedAt||a.createdAt)));
    for(const row of rows){
      const value=meterAfterFromRecord(row);
      if(value!=='')return value;
    }
    return '';
  }
  function rememberAutomaticMeter(team,value){
    meterAuto={team:text(team),value:text(value)};
    meterManual=false;
    const input=meterInput();
    if(input){
      input.dataset.dfMeterCarry='auto';
      input.dataset.dfMeterCarryTeam=meterAuto.team;
    }
  }
  function clearAutomaticMeter(manual=false){
    meterAuto={team:'',value:''};
    meterManual=manual;
    const input=meterInput();
    if(input){delete input.dataset.dfMeterCarry;delete input.dataset.dfMeterCarryTeam;}
  }
  function applyTeamCarry(team,{saveDraft=false}={}){
    const input=meterInput();if(!input)return '';
    const value=teamPreviousMeterAfter(team);
    settingMeter=true;
    input.value=value;
    settingMeter=false;
    rememberAutomaticMeter(team,value);
    if(typeof recalc==='function')recalc();
    if(saveDraft&&typeof scheduleAutoSave==='function')scheduleAutoSave();
    return value;
  }
  function detectCurrentAutomaticMeter(){
    const input=meterInput();if(!input)return;
    if(typeof currentRecordId!=='undefined'&&currentRecordId){clearAutomaticMeter(false);return;}
    const value=text(input.value),expected=teamPreviousMeterAfter(selectedTeam);
    if(value===expected)rememberAutomaticMeter(selectedTeam,value);
    else clearAutomaticMeter(value!=='');
  }

  if(typeof previousMeterAfter==='function')previousMeterAfter=teamPreviousMeterAfter;

  if(typeof setTeam==='function'){
    const baseSetTeam=setTeam;
    setTeam=function dfV158SetTeam(team,preferredNozzle){
      const input=meterInput();
      const oldTeam=text(typeof selectedTeam!=='undefined'?selectedTeam:'2');
      const oldValue=text(input?.value);
      const expectedOld=teamPreviousMeterAfter(oldTeam);
      const existingAuto=!meterManual&&(
        (meterAuto.team===oldTeam&&oldValue===meterAuto.value)||
        (input?.dataset?.dfMeterCarry==='auto'&&text(input.dataset.dfMeterCarryTeam)===oldTeam)||
        oldValue===expectedOld
      );
      const canReplace=typeof applying!=='undefined'&&!applying&&
        (typeof currentRecordId==='undefined'||!currentRecordId)&&
        !meterManual&&(oldValue===''||existingAuto);

      const result=baseSetTeam.apply(this,arguments);
      if(canReplace)applyTeamCarry(team,{saveDraft:true});
      return result;
    };
  }

  if(typeof apply==='function'){
    const baseApply=apply;
    apply=function dfV158ApplyRecord(record){
      const result=baseApply.apply(this,arguments);
      detectCurrentAutomaticMeter();
      return result;
    };
  }

  if(typeof dfResetSampleForNewDay==='function'){
    const baseReset=dfResetSampleForNewDay;
    dfResetSampleForNewDay=function dfV158ResetSampleForNewDay(){
      const result=baseReset.apply(this,arguments);
      applyTeamCarry(selectedTeam,{saveDraft:false});
      return result;
    };
  }

  document.addEventListener('input',event=>{
    if(event.target?.id!=='meterBefore'||settingMeter)return;
    clearAutomaticMeter(true);
  },true);

  // ----------------------------------------------------------
  // 2) 저장된 측정출장 완료일을 업체현황의 측정일에 항상 합산한다.
  // ManualMeasurementDates가 빈 배열이어도 일정완료를 제외하지 않는다.
  // ----------------------------------------------------------
  const companyNameKey=value=>text(value).toLowerCase()
    .replace(/주식회사|유한회사|\(주\)|㈜/g,'')
    .replace(/[^0-9a-z가-힣]/g,'');
  let scheduleIndexRows=null;
  let scheduleIndex=null;

  function trustedCompletedSchedule(schedule){
    return !!schedule&&!schedule.Deleted&&/측정/.test(text(schedule.Type))&&!!schedule.Completed&&
      !text(schedule.UpdatedBy).includes('저장대기');
  }
  function invalidateScheduleIndex(){scheduleIndexRows=null;scheduleIndex=null;}
  function buildScheduleIndex(){
    const rows=companyState?.db?.Schedules||[];
    if(rows===scheduleIndexRows&&scheduleIndex)return scheduleIndex;
    const map=new Map();
    const add=(key,date)=>{
      if(!key||!date)return;
      if(!map.has(key))map.set(key,new Set());
      map.get(key).add(date);
    };
    rows.forEach(schedule=>{
      if(!trustedCompletedSchedule(schedule))return;
      const date=typeof companyIsoDate==='function'?companyIsoDate(schedule.Date):text(schedule.Date).slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
      (schedule.CompanyIds||[]).map(text).filter(Boolean).forEach(id=>add(`id:${id}`,date));
      if(schedule.CompanyOnlineId)add(`id:${text(schedule.CompanyOnlineId)}`,date);
      [schedule.Company,...(schedule.Companies||[])].map(companyNameKey).filter(Boolean).forEach(name=>add(`name:${name}`,date));
    });
    scheduleIndexRows=rows;scheduleIndex=map;
    return map;
  }
  function scheduleDatesForCompany(company,year){
    const map=buildScheduleIndex(),dates=new Set();
    const keys=[company?.Id,company?.OnlineId].map(text).filter(Boolean).map(id=>`id:${id}`);
    const name=companyNameKey(company?.Name);if(name)keys.push(`name:${name}`);
    keys.forEach(key=>(map.get(key)||[]).forEach(date=>{if(Number(date.slice(0,4))===Number(year))dates.add(date);}));
    return [...dates].sort();
  }
  function scheduleLinkedCompanies(schedule){
    const companies=typeof dfV75SourceCompanies==='function'?dfV75SourceCompanies():(companyState?.db?.Companies||[]);
    const ids=new Set([...(schedule?.CompanyIds||[]),schedule?.CompanyOnlineId].map(text).filter(Boolean));
    const names=new Set([schedule?.Company,...(schedule?.Companies||[])].map(companyNameKey).filter(Boolean));
    return (companies||[]).filter(company=>{
      if([company?.Id,company?.OnlineId].map(text).filter(Boolean).some(id=>ids.has(id)))return true;
      return names.has(companyNameKey(company?.Name));
    });
  }

  if(typeof dfV1131MapScheduleRow==='function'){
    const baseMapSchedule=dfV1131MapScheduleRow;
    dfV1131MapScheduleRow=function dfV158MapScheduleRow(row,uuidToLegacy){
      const mapped=baseMapSchedule.apply(this,arguments),extra=row?.extra_data||{};
      const primaryOnline=text(row?.company_id);
      const primaryLegacy=primaryOnline&&uuidToLegacy?.get?.(primaryOnline);
      mapped.CompanyOnlineId=primaryOnline;
      mapped.CompanyIds=[...new Set([
        ...(Array.isArray(mapped.CompanyIds)?mapped.CompanyIds:[]),
        ...(Array.isArray(extra.company_ids)?extra.company_ids:[]),
        primaryLegacy
      ].map(text).filter(Boolean))];
      return mapped;
    };
  }

  if(typeof dfV120633DatesForCompany==='function'){
    const baseCompanyDates=dfV120633DatesForCompany;
    dfV120633DatesForCompany=function dfV158DatesForCompany(company,year){
      return uniqueSorted([
        ...(baseCompanyDates.call(this,company,year)||[]),
        ...scheduleDatesForCompany(company,year)
      ]);
    };
  }

  if(typeof dfV82StatusFromHistory==='function'){
    dfV82StatusFromHistory=function dfV158CompanyStatus(company,year){
      const progress=typeof dfV1206ProgressInfo==='function'?dfV1206ProgressInfo(company,year):null;
      if(!progress)return {key:'check',label:'측정확인필요'};
      if(progress.memoStatus==='incomplete')return {key:'incomplete',label:'미완료'};
      return progress.ok?{key:'complete',label:'완료'}:{key:'check',label:'측정확인필요'};
    };
  }

  if(typeof companyAnnualStatus==='function'){
    companyAnnualStatus=function dfV158AnnualStatus(company,year){
      const dates=typeof dfV120633DatesForCompany==='function'?dfV120633DatesForCompany(company,year):[];
      const h1=dates.filter(date=>Number(date.slice(5,7))<=6);
      const h2=dates.filter(date=>Number(date.slice(5,7))>=7);
      const needsH2=typeof companyNeedsH2==='function'?companyNeedsH2(company):true;
      const missing=[];
      if(!h1.length)missing.push('상반기');
      if(needsH2&&!h2.length)missing.push('하반기');
      return {
        H1:h1.at(-1)||'미측정',
        H2:h2.at(-1)||(needsH2?'미측정':'-'),
        Status:missing.length?`${missing.join('·')} 미측정`:'연간 완료'
      };
    };
  }

  // ----------------------------------------------------------
  // 3) 일정 동기화 최적화
  // - 회사 UUID 매핑은 이미 불러온 업체목록을 사용
  // - 월 조회는 일정 1회만 요청
  // - 변동이 없으면 큰 업체DB localStorage 재직렬화를 생략
  // - 자동 갱신 간격 10초 -> 60초, 수동/화면복귀 갱신 유지
  // ----------------------------------------------------------
  function companyUuidMap(){
    const map=new Map();
    (companyState?.db?.Companies||[]).forEach(company=>{
      const online=text(company.OnlineId),legacy=text(company.Id);
      if(online)map.set(online,legacy||online);
    });
    return map;
  }
  function scheduleSignature(rows){
    return (rows||[]).map(schedule=>JSON.stringify([
      text(schedule.OnlineId||schedule.Id),text(schedule.Date),text(schedule.Type),
      text(schedule.Company),(schedule.Companies||[]).map(text),(schedule.CompanyIds||[]).map(text),
      !!schedule.Confirmed,!!schedule.Completed,!!schedule.Deleted,text(schedule.UpdatedAt),text(schedule.UpdatedBy)
    ])).sort().join('\n');
  }

  if(typeof dfV96PullSchedules==='function'&&typeof dfV68FetchAll==='function'){
    dfV96PullSchedules=async function dfV158PullSchedules(){
      if(!dfSupabase||!dfCloudUser)return 0;
      const rows=await dfV68FetchAll('schedules','*','schedule_date');
      const map=companyUuidMap();
      const unique=new Map();
      (rows||[]).map(row=>dfV1131MapScheduleRow(row,map)).filter(schedule=>!schedule.Deleted)
        .forEach(schedule=>unique.set(text(schedule.OnlineId||schedule.Id),schedule));
      companyState.db.Schedules=[...unique.values()];
      invalidateScheduleIndex();
      return companyState.db.Schedules.length;
    };
  }

  let lastScheduleRequest={key:'',at:0};
  if(typeof dfV1101RefreshSchedulesOnline==='function'){
    dfV1101RefreshSchedulesOnline=async function dfV158RefreshSchedules(showFeedback=false){
      if(dfV1101ScheduleRefreshing)return false;
      if(!dfSupabase||!dfCloudUser||!companyState?.db){scheduleRenderAll?.();return false;}
      const key=`${scheduleState.year}-${String(scheduleState.month).padStart(2,'0')}`;
      const now=Date.now();
      if(!showFeedback&&lastScheduleRequest.key===key&&now-lastScheduleRequest.at<3000){scheduleRenderAll?.();return true;}
      lastScheduleRequest={key,at:now};
      dfV1101ScheduleRefreshing=true;
      const keepDate=scheduleState.selectedDate;
      const keepOnline=text(scheduleSelected?.()?.OnlineId||'');
      try{
        const start=`${key}-01`;
        const lastDay=new Date(scheduleState.year,scheduleState.month,0).getDate();
        const end=`${key}-${String(lastDay).padStart(2,'0')}`;
        const query=await dfSupabase.from('schedules')
          .select('id,company_id,schedule_date,status,schedule_type,employee,team,detail,memo,completed,extra_data,created_at,updated_at')
          .gte('schedule_date',start).lte('schedule_date',end).order('schedule_date',{ascending:true});
        if(query.error)throw query.error;

        const map=companyUuidMap();
        const remote=(query.data||[]).map(row=>dfV1131MapScheduleRow(row,map)).filter(schedule=>!schedule.Deleted);
        const existing=companyState.db.Schedules||[];
        const currentMonth=existing.filter(schedule=>text(schedule.Date)>=start&&text(schedule.Date)<=end&&!schedule.Deleted);
        const changed=scheduleSignature(currentMonth)!==scheduleSignature(remote);
        if(changed){
          const outside=existing.filter(schedule=>{const date=text(schedule.Date);return !(date>=start&&date<=end);});
          const unique=new Map();remote.forEach(schedule=>unique.set(text(schedule.OnlineId||schedule.Id),schedule));
          companyState.db.Schedules=[...outside,...unique.values()];
          invalidateScheduleIndex();
          try{companySaveDb?.();}catch(error){console.warn('일정 캐시 저장 생략',error);}
        }

        scheduleState.selectedDate=keepDate;
        const selected=(companyState.db.Schedules||[]).find(schedule=>text(schedule.OnlineId)===keepOnline);
        scheduleState.selectedId=selected?selected.Id:null;
        scheduleRenderAll?.();
        if(changed){companyRender?.();dfHomeRenderProgress?.();}
        if(showFeedback){
          const state=byId('companyOnlineState');
          if(state){state.textContent=changed?'일정 온라인 최신 ✓':'일정 변경 없음 · 최신 ✓';state.className='company-online-state ok';}
        }
        return true;
      }catch(error){
        console.error('[SCH-SYNC-12037158] 일정 동기화 실패',error);
        scheduleRenderAll?.();
        const state=byId('companyOnlineState');
        if(state){state.textContent=`동기화 실패 [SCH-SYNC-12037158] · ${error?.message||error}`;state.className='company-online-state bad';}
        if(showFeedback)alert(`일정 동기화 실패 [SCH-SYNC-12037158]\n${error?.message||error}`);
        return false;
      }finally{dfV1101ScheduleRefreshing=false;}
    };
  }

  if(typeof dfV1125StartScheduleSync==='function'){
    if(typeof dfV1125SchedulePollTimer!=='undefined'&&dfV1125SchedulePollTimer){
      clearInterval(dfV1125SchedulePollTimer);dfV1125SchedulePollTimer=null;
    }
    dfV1125StartScheduleSync=function dfV158StartScheduleSync(){
      if(dfV1125SchedulePollTimer)return;
      dfV1125SchedulePollTimer=setInterval(()=>{
        if(dfV1125ScheduleViewActive()&&!dfV1123ScheduleDirty)dfV1101RefreshSchedulesOnline(false);
      },SCHEDULE_POLL_MS);
    };
  }

  if(typeof dfV68PullCompanies==='function'){
    const basePullCompanies=dfV68PullCompanies;
    let companyPullPromise=null;
    dfV68PullCompanies=function dfV158PullCompaniesOnce(){
      if(companyPullPromise)return companyPullPromise;
      companyPullPromise=Promise.resolve(basePullCompanies.apply(this,arguments));
      return companyPullPromise.finally(()=>{companyPullPromise=null;});
    };
  }

  // 기존 v120.7.1의 업체별 연속 저장을 제거하고 일정 테이블을 단일 정본으로 사용한다.
  if(typeof dfV1123SaveScheduleStatus==='function'){
    dfV1123SaveScheduleStatus=async function dfV158SaveScheduleStatus(){
      const schedule=scheduleSelected?.();
      if(!schedule){alert('저장할 일정을 먼저 선택해주세요.');return false;}
      if(!dfV1123ScheduleDirty||(dfV1123ScheduleDirtyId&&String(schedule.Id)!==String(dfV1123ScheduleDirtyId))){
        alert('저장할 상태 변경사항이 없습니다.');return false;
      }
      const button=byId('scheduleStatusSave');
      if(button){button.disabled=true;button.textContent='저장 중...';}
      try{
        schedule.UpdatedAt=new Date().toISOString().slice(0,19);
        schedule.UpdatedBy='웹 · 저장완료';
        await dfV1131SyncSchedule(schedule);
        const onlineId=text(schedule.OnlineId),savedDate=schedule.Date;
        const matches=/측정/.test(text(schedule.Type))?scheduleLinkedCompanies(schedule):[];
        dfV1123ClearScheduleDirty();
        invalidateScheduleIndex();
        lastScheduleRequest={key:'',at:0};
        const refreshed=await dfV1101RefreshSchedulesOnline(false);
        scheduleState.selectedDate=savedDate;
        const synced=(companyState.db?.Schedules||[]).find(item=>text(item.OnlineId)===onlineId);
        if(synced)scheduleState.selectedId=String(synced.Id||'');
        scheduleRenderAll?.();companyRender?.();dfHomeRenderProgress?.();
        const state=byId('companyOnlineState');
        if(state){
          state.textContent=matches.length?`일정 저장 완료 · 업체현황 ${matches.length}개 반영 ✓`:'일정 저장 완료 · 연결 업체 확인 필요';
          state.className=`company-online-state ${matches.length?'ok':'warn'}`;
        }
        window.DF_DIAG?.info('SCHEDULE-COMPANY-12037158','완료일정 업체현황 반영',`${savedDate} / 연결업체 ${matches.length}개 / 서버재확인 ${refreshed?'완료':'실패'}`);
        if(!matches.length&&/측정/.test(text(schedule.Type)))window.DF_DIAG?.warn('SCHEDULE-COMPANY-MATCH-12037158','일정 업체를 찾지 못함',`${savedDate} / ${schedule.Company||''} / ${(schedule.CompanyIds||[]).join(',')}`);
        alert(matches.length?`일정 상태가 저장되었습니다.\n업체현황 ${matches.length}개 업체에 반영했습니다.`:'일정 상태는 저장되었습니다.\n업체명 연결을 확인해주세요.');
        return true;
      }catch(error){
        schedule.UpdatedBy='웹 · 저장대기';
        dfV1123ScheduleDirty=true;
        const state=byId('companyOnlineState');
        if(state){state.textContent='일정 상태 저장 실패';state.className='company-online-state bad';}
        alert(`일정 상태 저장 실패\n${error?.message||error}`);
        return false;
      }finally{
        if(button){button.disabled=!dfV1123ScheduleDirty;button.textContent=dfV1123ScheduleDirty?'변경사항 저장 *':'변경사항 저장';}
      }
    };
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · SCHEDULE + TEAM METER + SPEED`;
    if(footer)footer.textContent=VERSION;
  }
  function init(){
    detectCurrentAutomaticMeter();
    applyVersion();
    [180,800,1800].forEach(wait=>setTimeout(applyVersion,wait));
    window.DF_DIAG?.info('WORKFLOW-12037158','일정완료·팀별 적산유량·동기화 최적화 준비 완료',`일정 자동조회 ${SCHEDULE_POLL_MS/1000}초 / 수동 새로고침 유지`);
  }

  window.dfV1203718ScheduleDatesForCompany=scheduleDatesForCompany;
  window.dfV1203718PreviousMeterAfter=teamPreviousMeterAfter;
  window.dfV1203718InvalidateScheduleIndex=invalidateScheduleIndex;

  if(document.readyState==='complete')setTimeout(init,0);
  else window.addEventListener('load',init,{once:true});
})();
