/* DREAMFOREN v120.34.0 · SCHEDULE DATE / MENU / HOME / SAMPLE STICKY */
(function(){
  'use strict';
  const VERSION='v120.34.0';
  const $=id=>document.getElementById(id);

  function resetHome(){
    try{
      sessionStorage.setItem('df_v12031_force_home','1');
      sessionStorage.setItem('dreampoen_current_view_v1101','home');
    }catch(_){ }
    const url=new URL(location.href);
    url.hash='home';
    url.searchParams.set('dfreset',Date.now());
    location.assign(url.toString());
  }

  function bindBrand(){
    const old=$('dfBrandHomeReset');if(!old)return;
    // 이전 버전의 중복 클릭 핸들러를 제거하고 홈 리셋 동작 하나만 유지한다.
    const brand=old.cloneNode(true);old.replaceWith(brand);
    brand.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();resetHome()});
    brand.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();resetHome()}});
  }

  function bindScheduleGuard(){
    const grid=$('scheduleCalendarGrid');if(!grid)return;
    // 달력 재렌더링 이후에도 더블클릭한 셀의 ISO 날짜를 우선 보관한다.
    grid.addEventListener('dblclick',e=>{
      const cell=e.target.closest('[data-schedule-date]');
      const date=cell?.dataset.scheduleDate;if(!date)return;
      try{localStorage.setItem('dreampoen_schedule_draft_date',date)}catch(_){ }
      if(typeof scheduleState!=='undefined')scheduleState.selectedDate=date;
      setTimeout(()=>{const input=$('scheduleAddDate');if(input)input.value=date},0);
    },true);
  }

  function bind(){
    bindBrand();bindScheduleGuard();
    $('dfBuildVersionStatic')&&($('dfBuildVersionStatic').textContent='ONLINE '+VERSION+' · SCHEDULE & NAV FIX');
    $('dfFooterVersion')&&($('dfFooterVersion').textContent=VERSION);
    window.DF_DIAG?.info('SYSTEM','v120.34 일정 날짜·메뉴·홈·기록저장 고정바 보정 완료');
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})();
