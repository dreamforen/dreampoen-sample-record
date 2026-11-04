/* DREAMFOREN Beta 396 · 일정관리 전달사항. Existing schedules and company links are never written. */
(function(window,document){
  'use strict';
  if(window.DFScheduleNotice)return;
  const GET='df_schedule_notice_get_v396',SAVE='df_schedule_notice_save_v396';
  const state={user:'',seq:0,loaded:false,busy:false,baseline:'',version:0,updated:'',error:'',lastLoad:0};
  let view,section,input,saveButton,reloadButton,message,observer;
  function user(){try{return typeof dfCloudUser!=='undefined'?String(dfCloudUser?.id||''):''}catch(_){return ''}}
  function api(){try{return typeof dfSupabase!=='undefined'?dfSupabase:null}catch(_){return null}}
  function can(action){try{return !!user()&&typeof dfMenuCan==='function'&&dfMenuCan('schedule',action)}catch(_){return false}}
  function visible(){return !!view&&!view.hidden&&view.style.display!=='none'}
  function dirty(){return !!input&&input.value!==state.baseline}
  function timestamp(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
  function reset(id){state.user=id;state.seq++;state.loaded=false;state.busy=false;state.baseline='';state.version=0;state.updated='';state.error='';state.lastLoad=0;if(input)input.value=''}
  function syncIdentity(){const id=user();if(id!==state.user)reset(id);return id}
  function paint(){
    if(!section)return;
    const allowed=can('view'),writable=allowed&&can('update');
    section.hidden=!allowed;
    input.readOnly=!writable||!state.loaded;input.disabled=state.busy&&!state.loaded;
    saveButton.hidden=!writable;saveButton.disabled=state.busy||!state.loaded||!dirty();
    saveButton.textContent=state.busy&&state.loaded?'저장 중…':'저장';reloadButton.disabled=state.busy;reloadButton.hidden=!state.error;
    message.textContent=state.error||(state.busy?(state.loaded?'저장 중…':'불러오는 중…'):!state.loaded?'전달사항을 불러오지 못했습니다.':dirty()?'저장하지 않은 내용':state.updated?'저장 '+timestamp(state.updated):'');
  }
  function parse(row){
    if(!row||typeof row.content!=='string'||!Number.isInteger(row.lock_version)||row.lock_version<0)throw Error('전달사항 응답을 확인할 수 없습니다.');
    return {content:row.content,version:row.lock_version,updated:row.updated_at||''};
  }
  async function load(force=false){
    const id=syncIdentity(),client=api();
    if(!id||!client||!can('view')||state.busy){paint();return false}
    if(!force&&(dirty()||(state.loaded&&Date.now()-state.lastLoad<15000))){paint();return false}
    const priorValue=input.value,seq=++state.seq;state.busy=true;state.error='';paint();
    try{
      const result=await client.rpc(GET);
      if(user()!==id||api()!==client||seq!==state.seq){syncIdentity();paint();return false}
      if(result.error)throw result.error;
      const row=parse(result.data);if(input.value!==priorValue)return false;
      state.baseline=row.content;state.version=row.version;state.updated=row.updated;input.value=row.content;
      state.loaded=true;state.lastLoad=Date.now();return true;
    }catch(error){
      if(user()===id&&seq===state.seq)state.error='전달사항을 불러오지 못했습니다. 다시 불러오기를 눌러주세요.';
      return false;
    }finally{if(user()===id&&seq===state.seq){state.busy=false;paint()}}
  }
  async function save(){
    const id=syncIdentity(),client=api();
    if(!id||!client||!can('view')||!can('update')||!state.loaded||state.busy||!dirty()){paint();return false}
    const content=input.value;if(content.length>20000){state.error='전달사항은 20000자 이내로 작성해주세요.';paint();return false}
    const seq=++state.seq;state.busy=true;state.error='';paint();
    try{
      const result=await client.rpc(SAVE,{p_content:content,p_version:state.version});
      if(user()!==id||api()!==client||seq!==state.seq){syncIdentity();paint();return false}
      if(result.error)throw result.error;
      const row=parse(result.data);state.baseline=row.content;state.version=row.version;state.updated=row.updated;state.lastLoad=Date.now();return true;
    }catch(error){
      if(user()===id&&seq===state.seq)state.error=String(error?.code)==='40001'?'다른 사용자가 먼저 수정했습니다. 작성 내용은 유지됩니다. 다시 불러오기로 최신 내용을 확인해주세요.':'저장하지 못했습니다. 작성 내용은 유지됩니다. 연결을 확인한 뒤 다시 시도해주세요.';
      return false;
    }finally{if(user()===id&&seq===state.seq){state.busy=false;paint()}}
  }
  function refresh(){syncIdentity();paint();if(visible())void load()}
  function mount(){
    view=document.getElementById('dfViewSchedule');const tabs=view?.querySelector('.schedule-inner-tabs');if(!tabs||section)return;
    section=document.createElement('section');section.id='dfScheduleNotice';section.className='schedule-day-panel';section.style.margin='0 0 14px';section.hidden=true;
    section.innerHTML='<div class="schedule-day-head"><h2 id="dfScheduleNoticeTitle">전달사항</h2><div class="schedule-day-actions"><span id="dfScheduleNoticeMessage" role="status" aria-live="polite"></span><button type="button" class="company-btn secondary" id="dfScheduleNoticeReload">다시 불러오기</button><button type="button" class="company-btn primary" id="dfScheduleNoticeSave">저장</button></div></div><div class="schedule-add-card" style="border:0;border-radius:0"><div class="schedule-add-grid"><label class="span-2"><textarea id="dfScheduleNoticeText" rows="3" maxlength="20000" aria-labelledby="dfScheduleNoticeTitle" readonly></textarea></label></div></div>';
    tabs.insertAdjacentElement('afterend',section);
    input=section.querySelector('textarea');saveButton=section.querySelector('#dfScheduleNoticeSave');reloadButton=section.querySelector('#dfScheduleNoticeReload');message=section.querySelector('#dfScheduleNoticeMessage');
    input.addEventListener('input',()=>{state.error='';paint()});saveButton.addEventListener('click',()=>void save());
    reloadButton.addEventListener('click',()=>{if(dirty()&&!window.confirm('작성 중인 내용을 닫고 저장된 전달사항을 다시 불러올까요?'))return;void load(true)});
    observer=new MutationObserver(refresh);observer.observe(view,{attributes:true,attributeFilter:['hidden','style']});
    document.addEventListener('df:menu-permissions-changed',refresh);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});window.addEventListener('focus',refresh);refresh();
  }
  window.DFScheduleNotice={load,save,refresh};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window,document);
