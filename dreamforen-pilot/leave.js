/* DREAMFOREN LEAVE APPROVAL · v120.37.30 · opening usage by employee/year */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const db=()=>{try{return dfSupabase}catch(_){return null}},me=()=>{try{return dfCloudUser?.id||''}catch(_){return ''}},admin=()=>{try{return dfCloudProfile?.role==='admin'&&dfCloudProfile?.active!==false}catch(_){return false}};
 let loadVersion=0;
 const years=date=>{if(!date)return '-';const a=new Date(date),b=new Date();let y=b.getFullYear()-a.getFullYear();if(b<new Date(b.getFullYear(),a.getMonth(),a.getDate()))y--;return `${Math.max(0,y)+1}년차`};
 const rounded=n=>Math.round((Number(n)||0)*100)/100;
 const daysValue=input=>{const value=String(input?.value??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(value))return null;const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=9999.99?n:null};
 function summarize(rows){
   let granted=0,opening=0,webUsed=0,adjustment=0;
   for(const row of rows){const days=Number(row.days)||0;if(row.opening_usage===true)opening-=days;else if(row.entry_type==='grant')granted+=days;else if(row.entry_type==='use'||row.entry_type==='cancel')webUsed-=days;else adjustment+=days}
   return {granted:rounded(granted),opening:rounded(opening),webUsed:rounded(webUsed),adjustment:rounded(adjustment),balance:rounded(granted+adjustment-opening-webUsed)};
 }
 function open(){if(typeof window.dfApprovalOpenTemplate==='function')window.dfApprovalOpenTemplate('annual_leave');else alert('내부결재 양식을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.')}
 function styles(){if($('dfLeaveOpeningStyle'))return;const s=document.createElement('style');s.id='dfLeaveOpeningStyle';s.textContent=`
 #dfEmployeeLeaveList .df-leave-admin-card{display:block;padding:16px;min-width:0}
 #dfEmployeeLeaveList .df-leave-card-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding-bottom:13px;border-bottom:1px solid #e4ebef}
 #dfEmployeeLeaveList .df-leave-card-head strong{font-size:15px}#dfEmployeeLeaveList .df-leave-card-head small{display:block;margin-top:4px}
 #dfEmployeeLeaveList .df-leave-numbers{display:flex;flex-wrap:wrap;gap:18px}#dfEmployeeLeaveList .df-leave-numbers span{font-size:11px}#dfEmployeeLeaveList .df-leave-numbers b{display:block;margin-top:3px;font-size:18px}
 #dfEmployeeLeaveList .df-leave-numbers [data-negative] b{color:#b42318}
 #dfEmployeeLeaveList .df-leave-card-edit{display:flex;align-items:end;gap:10px;flex-wrap:wrap;padding-top:12px}
 #dfEmployeeLeaveList .df-leave-card-edit label{min-width:130px;font-size:12px}#dfEmployeeLeaveList .df-leave-card-edit input{box-sizing:border-box;width:100%;max-width:190px}
 #dfEmployeeLeaveList .df-leave-opening-edit{margin-top:12px;padding:12px;background:#f4f8fb;border:1px solid #d9e5ed;border-radius:8px}
 #dfEmployeeLeaveList .df-leave-opening-edit>p{margin:0 0 9px;font-size:12px;line-height:1.6;color:#4b6576}#dfEmployeeLeaveList .df-leave-opening-edit .df-leave-card-edit{padding-top:0}
 #dfEmployeeLeaveList .df-leave-opening-note{flex:1;min-width:180px}#dfEmployeeLeaveList .df-leave-opening-note input{max-width:none}
 #dfEmployeeLeaveList .df-leave-status{font-size:12px;line-height:1.5;margin-top:8px}#dfEmployeeLeaveList .df-leave-status:empty{display:none}
 #dfEmployeeLeaveList .df-leave-opening-history{margin-top:8px;font-size:12px;color:#4b6576}#dfEmployeeLeaveList .df-leave-opening-history summary{cursor:pointer}#dfEmployeeLeaveList .df-leave-opening-history ul{padding-left:20px;line-height:1.8}
 #dfEmployeeLeaveList .df-leave-pending{font-size:11px;color:#708391;margin-top:7px}
 @media(max-width:600px){#dfEmployeeLeaveList .df-leave-card-edit label{flex:1;min-width:120px}#dfEmployeeLeaveList .df-leave-card-edit input{max-width:none}#dfEmployeeLeaveList .df-leave-card-edit button{white-space:normal}#dfEmployeeLeaveList .df-leave-numbers{gap:12px}}
 `;document.head.appendChild(s)}
 async function loadAdmin(){
   if(!admin())return;const list=$('dfEmployeeLeaveList'),year=Number($('dfEmployeeLeaveYear')?.value||new Date().getFullYear()),version=++loadVersion;if(!list)return;
   list.setAttribute('aria-busy','true');
   try{
     const [p,l,pending]=await Promise.all([
       db().from('profiles').select('id,name,email,team,job_title,hire_date,annual_leave_days').eq('active',true).order('name'),
       db().from('leave_ledger').select('*').eq('leave_year',year),
       db().from('leave_requests').select('employee_id,days').eq('status','submitted').in('leave_type',['annual','half_am','half_pm']).gte('start_date',year+'-01-01').lt('start_date',(year+1)+'-01-01')
     ]);
     if(version!==loadVersion)return;if(p.error)throw p.error;if(l.error)throw l.error;if(pending.error)throw pending.error;
     const people=p.data||[],allRows=l.data||[],names=new Map(people.map(x=>[x.id,x.name||x.email]));
     list.innerHTML=people.map(x=>{
       const rows=allRows.filter(y=>y.employee_id===x.id),s=summarize(rows),opening=rows.find(y=>y.opening_usage===true),waiting=rounded((pending.data||[]).filter(y=>y.employee_id===x.id).reduce((a,b)=>a+Number(b.days||0),0));
       return `<article class="df-leave-admin-card" data-leave-employee="${esc(x.id)}"><div class="df-leave-card-head"><div><strong>${esc(x.name||x.email)}</strong><small>${esc(x.job_title||x.team||'소속 미지정')} · 근속 ${years(x.hire_date)}</small></div><div class="df-leave-numbers"><span>총 부여<b>${s.granted}일</b></span><span>기존 사용<b>${s.opening}일</b></span><span>웹 승인 사용<b>${s.webUsed}일</b></span>${s.adjustment?`<span>별도 조정<b>${s.adjustment>0?'+':''}${s.adjustment}일</b></span>`:''}<span ${s.balance<0?'data-negative="true"':''}>잔여<b>${s.balance}일</b></span></div></div><div class="df-leave-pending">승인 대기 ${waiting}일 · 대기 중인 신청은 잔여일수에서 차감하지 않습니다.</div><div class="df-leave-card-edit"><label>입사일<input type="date" data-hire value="${esc(x.hire_date||'')}"></label><label>연간 기준일수<input type="number" data-policy min="0" max="999.99" step="0.5" value="${Number(x.annual_leave_days??15)}"></label><button type="button" class="company-btn secondary" data-profile-save>기본정보 저장</button><button type="button" class="company-btn primary" data-grant>${year}년 기준일수 부여</button></div><div class="df-leave-opening-edit"><p><b>${year}년 기존 사용 연차</b> — 웹 사용 전에 이미 사용한 일수만 입력합니다. 웹에서 승인된 휴가는 제외하며, 다시 저장하면 아래 일수로 변경됩니다. (예: 반차 포함 3.5일)</p><div class="df-leave-card-edit"><label>기존 사용일수<input type="number" data-opening-days min="0" max="9999.99" step="0.5" value="${s.opening}"></label><label class="df-leave-opening-note">메모<input data-opening-note maxlength="500" placeholder="예: 웹 도입 전 사용분" value="${esc(opening?.note||'')}"></label><button type="button" class="company-btn primary" data-opening-save>기존 사용일수 저장</button></div><details class="df-leave-opening-history"><summary>변경 이력</summary><div data-opening-history>이력을 불러오는 중입니다.</div></details></div><div class="df-leave-status" role="status" aria-live="polite"></div></article>`;
     }).join('')||'<div class="df-employees-empty">사용 중인 직원이 없습니다.</div>';
     list.querySelectorAll('[data-leave-employee]').forEach(card=>{
       const opening=allRows.find(x=>x.employee_id===card.dataset.leaveEmployee&&x.opening_usage===true);card._openingUpdatedAt=opening?.opening_updated_at||null;
       card.querySelector('[data-profile-save]').onclick=()=>saveProfile(card);
       card.querySelector('[data-grant]').onclick=()=>grant(card,year);
       card.querySelector('[data-opening-save]').onclick=()=>saveOpening(card,year);
       card.querySelector('details').ontoggle=()=>{if(card.querySelector('details').open)loadHistory(card,year,names)};
     });
   }catch(e){if(version===loadVersion)list.innerHTML=`<div class="df-employees-empty">연차현황을 불러오지 못했습니다.<br>${esc(e.message||e)}</div>`}
   finally{if(version===loadVersion)list.removeAttribute('aria-busy')}
 }
 function status(card,message,error=false){const target=card.querySelector('.df-leave-status');target.textContent=message;target.style.color=error?'#b42318':'#486936'}
 async function saveOpening(card,year){
   if(!admin()||card._saving)return;const days=daysValue(card.querySelector('[data-opening-days]'));
   if(days===null){status(card,'기존 사용일수는 0 이상, 소수점 둘째 자리까지 입력해주세요.',true);return}
   card._saving=true;const buttons=[...card.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status(card,'기존 사용일수를 저장하고 있습니다.');
   try{
     const q=await db().rpc('df_leave_set_opening_usage',{p_employee:card.dataset.leaveEmployee,p_year:year,p_days:days,p_note:card.querySelector('[data-opening-note]').value.trim(),p_expected_updated_at:card._openingUpdatedAt});
     if(q.error)throw q.error;
     await loadAdmin();const updated=[...($('dfEmployeeLeaveList')?.querySelectorAll('[data-leave-employee]')||[])].find(x=>x.dataset.leaveEmployee===card.dataset.leaveEmployee);if(updated)status(updated,'기존 사용일수를 저장했습니다. 잔여연차에 반영되었습니다.');
   }catch(e){const message=String(e.message||e);status(card,/df_leave_set_opening_usage|schema cache/i.test(message)?'연차 사용일수 저장 기능이 아직 설치되지 않았습니다. 42번 연차 SQL을 적용한 뒤 다시 저장해주세요.':message,true)}
   finally{card._saving=false;buttons.forEach(b=>b.disabled=false)}
 }
 async function loadHistory(card,year,names){
   const target=card.querySelector('[data-opening-history]');if(target.dataset.loaded==='true')return;
   try{const r=await db().from('leave_opening_usage_audit').select('old_days,new_days,note,changed_at,actor_id').eq('employee_id',card.dataset.leaveEmployee).eq('leave_year',year).order('changed_at',{ascending:false}).limit(10);if(r.error)throw r.error;target.innerHTML=r.data?.length?'<ul>'+r.data.map(x=>`<li>${esc(new Date(x.changed_at).toLocaleString('ko-KR'))} · ${esc(names.get(x.actor_id)||'관리자')} · ${Number(x.old_days||0)} → ${Number(x.new_days||0)}일${x.note?' · '+esc(x.note):''}</li>`).join('')+'</ul>':'저장된 변경 이력이 없습니다.';target.dataset.loaded='true'}catch(e){target.textContent='변경 이력을 불러오지 못했습니다. 연차 기능 설치 상태를 확인해주세요.'}
 }
 async function saveProfile(card){
   if(!admin()||card._saving)return;const days=daysValue(card.querySelector('[data-policy]'));if(days===null||days>999.99)return status(card,'연간 기준일수는 0 이상, 999.99 이하로 입력해주세요.',true);
   card._saving=true;try{const q=await db().from('profiles').update({hire_date:card.querySelector('[data-hire]').value||null,annual_leave_days:days}).eq('id',card.dataset.leaveEmployee);if(q.error)throw q.error;await loadAdmin()}catch(e){status(card,e.message||String(e),true)}finally{card._saving=false}
 }
 async function grant(card,year){
   if(!admin()||card._saving)return;const days=daysValue(card.querySelector('[data-policy]'));if(days===null||days<=0||days>999.99)return status(card,'부여할 기준일수는 0보다 크고 999.99 이하이어야 합니다.',true);
   if(!confirm(`${year}년 연차 ${days}일을 부여할까요?\n이미 부여한 기록이 있다면 추가 부여됩니다.`))return;
   card._saving=true;try{const q=await db().from('leave_ledger').insert({employee_id:card.dataset.leaveEmployee,leave_year:year,entry_type:'grant',days,note:`${year}년 관리자 연차 부여`,created_by:me()});if(q.error)throw q.error;await loadAdmin()}catch(e){status(card,'연차 부여 실패: '+(e.message||e),true)}finally{card._saving=false}
 }
 document.addEventListener('DOMContentLoaded',()=>{
   $('dfLeaveNew')?.addEventListener('click',open);const y=$('dfEmployeeLeaveYear'),now=new Date().getFullYear();if(!y)return;styles();y.innerHTML=Array.from({length:7},(_,i)=>now-5+i).map(v=>`<option ${v===now?'selected':''}>${v}</option>`).join('');
   document.querySelectorAll('[data-employee-tab]').forEach(b=>b.onclick=()=>{const leave=b.dataset.employeeTab==='leave';$('dfEmployeeAccountsPanel').hidden=leave;$('dfEmployeeLeavePanel').hidden=!leave;document.querySelectorAll('[data-employee-tab]').forEach(x=>x.className='company-btn '+(x===b?'primary':'secondary'));if(leave)loadAdmin()});
   $('dfEmployeeLeaveRefresh').onclick=loadAdmin;y.onchange=loadAdmin;
 },{once:true});
})();
