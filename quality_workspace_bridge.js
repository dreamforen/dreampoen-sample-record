/* Quality-only entry point. No replacement of existing menus, approvals or app state. */
(function(){'use strict';
 let frame=null,host=null,hub=null,entry=null,returnView='quality',hubDisplay='',hubPriority='';
 function context(){
  const api=typeof dfSupabase!=='undefined'?dfSupabase:null;
  const user=typeof dfCloudUser!=='undefined'?dfCloudUser:null;
  const profile=typeof dfCloudProfile!=='undefined'?dfCloudProfile:null;
  return {api,user,profile,permissionStatus:window.DFMenuPermissions?.getStatus()?.status||'idle'};
 }
 function can(kind,action){
  const {user,profile}=context();if(!user||!profile||profile.active===false||profile.id&&profile.id!==user.id)return false;
  const access=profile.access_permissions||{},module=kind==='manual'?'quality-manual':'doc-hub';
  const legacy=action==='view'?(kind==='manual'?access.quality_manual!==false:access['doc-hub']!==false):(profile.role==='admin'||access.quality_edit===true);
  return window.DFMenuPermissions?window.DFMenuPermissions.can(module,action,legacy):false;
 }
 async function leave(){
  if(frame?.contentWindow?.DFQualityWorkspace)await frame.contentWindow.DFQualityWorkspace.flush();
  if(frame){frame.remove();frame=null;}if(host){host.remove();host=null;}if(hub){hub.hidden=false;if(hubDisplay)hub.style.setProperty('display',hubDisplay,hubPriority);else hub.style.removeProperty('display');}
  if(returnView==='quality-manual')window.v62ShowOnly?.('quality-manual');
 }
 async function open(from){
  if(!['manual','procedure','instruction'].some(k=>can(k,'view')))return alert('품질문서 조회 권한을 확인하세요.');
  returnView=from||'quality';const view=document.getElementById(returnView==='quality-manual'?'dfViewQualityManual':'dfViewQuality');if(!view)return;
  window.v62ShowOnly?.(returnView);
  if(frame){frame.focus();return;}
  hub=view.querySelector(returnView==='quality-manual'?'.df-qms-shell':'.df-module-hub');if(hub){hubDisplay=hub.style.getPropertyValue('display');hubPriority=hub.style.getPropertyPriority('display');hub.hidden=true;hub.style.setProperty('display','none','important');}
  host=document.createElement('section');host.id='dfQualityWorkspaceHost';host.style.cssText='width:100%;margin:0;';
  frame=document.createElement('iframe');frame.title='품질문서 전체화면 작업실';frame.src='quality_workspace.html?v=2';
  frame.style.cssText='width:100%;height:max(850px,calc(100vh - 110px));border:1px solid #d7dfe7;border-radius:10px;background:#edf1f5;display:block;';
  host.append(frame);view.append(host);
 }
 window.DFQualityBridge=Object.freeze({context,can,leave,
  approval(preset){if(typeof dfApprovalOpenPreset!=='function')throw Error('기존 내부결재 기능을 불러오지 못했습니다.');return dfApprovalOpenPreset(preset);},
  approvalList(){window.v62ShowOnly?.('approval');},
  permissionChanged(){frame?.contentWindow?.DFQualityWorkspace?.permissionChanged();}
 });
 function mount(){
  const view=document.getElementById('dfViewQuality'),actions=document.querySelector('#dfViewQualityManual .df-qms-actions');
  const target=view?.querySelector('.df-module-hub');
  if(target&&!entry){entry=document.createElement('button');entry.type='button';entry.className='company-btn primary';entry.textContent='품질문서 작업실 · 문서형 편집';entry.style.cssText='margin:14px 0;padding:12px 18px;';entry.addEventListener('click',()=>open('quality'));target.prepend(entry);}
  if(actions&&!actions.querySelector('[data-qw-open]')){const b=document.createElement('button');b.type='button';b.dataset.qwOpen='1';b.className='company-btn secondary';b.textContent='2025 검토본 · 문서형 작업실';b.addEventListener('click',()=>open('quality-manual'));actions.append(b);}
  const visible=['manual','procedure','instruction'].some(k=>can(k,'view'));if(entry)entry.hidden=!visible;
  document.querySelectorAll('[data-qw-open]').forEach(b=>b.hidden=!can('manual','view'));
 }
 document.addEventListener('df:menu-permissions-changed',()=>{mount();window.DFQualityBridge.permissionChanged();});
 document.addEventListener('click',e=>{
  if(!frame||!e.target.closest('.df-nav-item[data-view],#dfLogoutBtn,#dfCloudLogout'))return;
  const ws=frame.contentWindow?.DFQualityWorkspace;
  if(ws?.isPending()){e.preventDefault();e.stopImmediatePropagation();ws.flush().then(()=>e.target.closest('button,a')?.click()).catch(()=>alert('아직 저장하지 못한 품질문서가 있습니다. 작업실에서 재시도하거나 백업을 내려받으세요.'));}
 },true);
 window.addEventListener('beforeunload',e=>{if(frame?.contentWindow?.DFQualityWorkspace?.isPending()){e.preventDefault();e.returnValue='';}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
