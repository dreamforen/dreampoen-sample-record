/* Quality-only integration: the live hub, approval module and other apps stay in place. */
(function(){'use strict';
 let frame=null,host=null,hub=null,entry=null,returnView='quality',hubDisplay='',hubPriority='',frameMode='edit',frameKind='manual';
 let transition=null;
 let pendingMarker=null,openingUntil=0,seenForm=false,lastForm=false,lastDetail=false,observer=null;
 const workspace=()=>frame?.contentWindow?.DFQualityWorkspace;
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
 function notify(){workspace()?.sync?.().catch(()=>{});}
 const visible=e=>!!e&&!e.hidden&&e.style.display!=='none';
 function approvalBusy(){
  const m=document.getElementById('dfApprovalFormModal'),editor=m?._dfApprovalEditor;
  return !!pendingMarker&&(seenForm?visible(m)&&String(editor?.preset?.content||editor?.doc?.content||'').startsWith(pendingMarker):Date.now()<openingUntil);
 }
 function observeApproval(){
  if(!window.document)return;
  const form=document.getElementById('dfApprovalFormModal'),detail=document.getElementById('dfApprovalDetailModal');
  const formOpen=visible(form),detailOpen=visible(detail),editor=form?._dfApprovalEditor;
  if(pendingMarker&&formOpen&&String(editor?.preset?.content||editor?.doc?.content||'').startsWith(pendingMarker))seenForm=true;
  if(pendingMarker&&seenForm&&!formOpen){pendingMarker=null;seenForm=false;}
  if(lastForm&&!formOpen||lastDetail&&!detailOpen)notify();
  lastForm=formOpen;lastDetail=detailOpen;
 }
 async function closeFrame(){
  const ws=workspace();if(ws){if(ws.isPending?.())await ws.flush();if(ws.isPending?.())throw Error('저장이 끝난 뒤 이동하세요.');ws.dispose?.();}
  if(frame){frame.remove();frame=null;}if(host){host.remove();host=null;}if(hub){hub.hidden=false;if(hubDisplay)hub.style.setProperty('display',hubDisplay,hubPriority);else hub.style.removeProperty('display');}hub=null;
 }
 async function leave(){
  if(transition)await transition;
  const mode=frameMode,kind=workspace()?.getKind?.()||frameKind,key=workspace()?.getKey?.()||null,from=returnView;
  await closeFrame();if(mode==='edit')await open(from,kind,'preview',key);else window.v62ShowOnly?.('quality');
 }
 function open(...args){const run=()=>openNow(...args),task=transition?transition.catch(()=>{}).then(run):run();transition=task;task.finally(()=>{if(transition===task)transition=null;}).catch(()=>{});return task;}
 async function openNow(from,kind,mode='edit',key=null){
  kind=kind||['manual','procedure','instruction'].find(k=>can(k,'view'));
  if(!kind||!can(kind,'view'))return alert('품질문서 조회 권한을 확인하세요.');
  if(frame&&frameMode===mode&&!key&&(workspace()?.selectKind||frameKind===kind)){window.v62ShowOnly?.(returnView);await workspace()?.selectKind?.(kind);frameKind=kind;notify();frame.focus();return;}
  if(frame)await closeFrame();
  returnView=from||'quality';frameMode=mode;frameKind=kind;const view=document.getElementById(returnView==='quality-manual'?'dfViewQualityManual':'dfViewQuality');if(!view)return;
  window.v62ShowOnly?.(returnView);
  hub=view.querySelector(returnView==='quality-manual'?'.df-qms-shell':'.df-module-hub');if(hub){hubDisplay=hub.style.getPropertyValue('display');hubPriority=hub.style.getPropertyPriority('display');hub.hidden=true;hub.style.setProperty('display','none','important');}
  host=document.createElement('section');host.id='dfQualityWorkspaceHost';host.style.cssText='width:100%;margin:0;';
  frame=document.createElement('iframe');frame.title=mode==='preview'?'현재 품질문서 인쇄 미리보기':'작업실';frame.src=(mode==='preview'?'quality_workspace_reader.html':'quality_workspace.html')+'?v=5&kind='+encodeURIComponent(kind)+(key?'&key='+encodeURIComponent(key):'');
  frame.style.cssText='width:100%;height:max(850px,calc(100vh - 110px));border:1px solid #d7dfe7;border-radius:8px;background:#edf1f5;display:block;';host.append(frame);view.append(host);
 }
 const launch=(from,kind,mode,key)=>open(from,kind,mode,key).catch(e=>alert(e.message||String(e)));
 window.DFQualityBridge=Object.freeze({context,can,leave,approvalBusy,isVisible:()=>visible(document.getElementById(returnView==='quality-manual'?'dfViewQualityManual':'dfViewQuality')),
  openEditor(kind,key){return open(returnView,kind,'edit',key);},
  openPreview(kind,key){return open(returnView,kind,'preview',key);},
  approval(preset){
   if(typeof dfApprovalOpenPreset!=='function')throw Error('기존 내부결재 기능을 불러오지 못했습니다.');
   pendingMarker=String(preset.content||'').split('\n')[0];openingUntil=Date.now()+20000;seenForm=false;
   try{return dfApprovalOpenPreset(preset);}catch(e){pendingMarker=null;throw e;}
  },
  approvalList(){window.v62ShowOnly?.('approval');document.getElementById('dfApprovalRefresh')?.click();},
  legacyFiles(kind){if(!can(kind,'view'))return;const category=kind==='procedure'?'quality_procedure':'quality_instruction';window.dfOpenDocumentHub?.(category);},
  permissionChanged(){workspace()?.permissionChanged();}
 });
 function mount(){
  const view=document.getElementById('dfViewQuality'),actions=document.querySelector('#dfViewQualityManual .df-qms-actions');
  const target=view?.querySelector('.df-module-hub');
  if(target&&!entry){entry=document.createElement('button');entry.type='button';entry.className='company-btn primary';entry.textContent='작업실';entry.style.cssText='margin:10px 0;padding:6px 10px;font-size:12px;' ;entry.addEventListener('click',()=>launch('quality'));target.prepend(entry);}
  if(actions&&!actions.querySelector('[data-qw-open]')){const b=document.createElement('button');b.type='button';b.dataset.qwOpen='1';b.className='company-btn secondary';b.textContent='작업실';b.addEventListener('click',()=>launch('quality-manual','manual'));actions.append(b);}
  if(!document.getElementById('dfQualityWorkspaceLegacyStyle')){
   const style=document.createElement('style');style.id='dfQualityWorkspaceLegacyStyle';
   style.textContent='#dfQmsSectionMode,#dfViewQualityManual .df-qms-mode-tabs,#dfQmsSummary{display:none!important}#dfViewQualityManual .df-qms-actions{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto}#dfViewQualityManual .df-qms-actions .company-btn{font-size:12px!important;line-height:1.4!important;padding:6px 10px!important;min-height:30px;white-space:nowrap;font-weight:600!important}';document.head.append(style);
   if(document.getElementById('dfQmsSectionMode')?.classList.contains('primary'))document.getElementById('dfQmsOriginalMode')?.click();
  }
  window.dfQualityManualOpen=()=>launch('quality-manual','manual','preview');window.dfQmsSectionOpen=window.dfQualityManualOpen;
  const allowed=['manual','procedure','instruction'].some(k=>can(k,'view'));if(entry)entry.hidden=!allowed;
  document.querySelectorAll('[data-qw-open]').forEach(b=>b.hidden=!can('manual','view'));
  if(!observer){observer=new MutationObserver(observeApproval);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style']});}
 }
 document.addEventListener('df:menu-permissions-changed',()=>{mount();window.DFQualityBridge.permissionChanged();});
 document.addEventListener('click',e=>{
  const category=e.target.closest?.('[data-doc-category="quality_manual"],[data-doc-category="quality_procedure"],[data-doc-category="quality_instruction"],.df-nav-item[data-view="quality-manual"]');
  if(category){e.preventDefault();e.stopImmediatePropagation();const kind=category.dataset.docCategory==='quality_procedure'?'procedure':category.dataset.docCategory==='quality_instruction'?'instruction':'manual';launch(kind==='manual'?'quality-manual':'quality',kind,'preview');return;}
  if(!frame||!e.target.closest?.('.df-nav-item[data-view],#dfLogoutBtn,#dfCloudLogout'))return;
  const ws=workspace();
  if(ws?.isPending()){e.preventDefault();e.stopImmediatePropagation();ws.flush().then(()=>{if(ws.isPending())throw Error('개정 처리 중');e.target.closest('button,a')?.click();}).catch(()=>alert('아직 처리 중이거나 저장하지 못한 품질문서가 있습니다. 작업실에서 상태를 확인하세요.'));}
  else setTimeout(notify,0);
 },true);
 window.addEventListener('focus',notify);
 window.addEventListener('beforeunload',e=>{if(workspace()?.isPending()){e.preventDefault();e.returnValue='';}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
