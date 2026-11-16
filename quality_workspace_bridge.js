/* One document screen per quality folder; the existing approval and revision APIs stay in use. */
(function(){'use strict';
 const kinds={
  manual:{route:'quality-manual',id:'dfViewQualityManual',title:'품질매뉴얼',prefix:'QM',category:'quality_manual',module:'quality-manual'},
  procedure:{route:'quality-procedure',id:'dfViewQualityProcedure',title:'품질절차서',prefix:'QP',category:'quality_procedure',module:'doc-hub'},
  instruction:{route:'quality-instruction',id:'dfViewQualityInstruction',title:'품질지침서',prefix:'QI',category:'quality_instruction',module:'doc-hub'}
 };
 const entries=Object.entries(kinds),by=id=>document.getElementById(id);
 const kindOfRoute=view=>entries.find(([,x])=>x.route===view)?.[0];
 const kindOfCategory=category=>entries.find(([,x])=>x.category===category)?.[0];
 const visible=node=>!!node&&!node.hidden&&node.style.display!=='none';
 const route=()=>window.DF_NAVIGATION_GUARD?.getActive?.();
 let mounted=null,pendingRoute=null,approval=null;
 const workspace=()=>mounted?.frame.contentWindow?.DFQualityWorkspace;
 function context(){
  const api=typeof dfSupabase!=='undefined'?dfSupabase:null;
  const user=typeof dfCloudUser!=='undefined'?dfCloudUser:null;
  const profile=typeof dfCloudProfile!=='undefined'?dfCloudProfile:null;
  return {api,user,profile,permissionStatus:window.DFMenuPermissions?.getStatus()?.status||'idle'};
 }
 function can(kind,action){
  const data=Object.hasOwn(kinds,kind)?kinds[kind]:null,{user,profile}=context();
  if(!data||!user||!profile||profile.active===false||profile.retired_at||profile.id&&profile.id!==user.id)return false;
  const access=profile.access_permissions||profile.board_permissions||{};
  const admin=String(profile.role).toLowerCase()==='admin';
  if(!admin&&access[data.category]===false)return false;
  const legacy=action==='view'?(kind==='manual'||access['doc-hub']!==false):admin||access.quality_edit===true;
  return window.DFMenuPermissions?.can(data.module,action,legacy)===true;
 }
 function canApprove(action='create'){return window.DFMenuPermissions?.can('approval',action,true)===true;}
 const validKey=(kind,key)=>typeof key==='string'&&new RegExp('^DFEN-'+kinds[kind].prefix+'-\\d{2}$').test(key)?key:null;
 function migrate(view,data={},trusted=false){
  let kind=kindOfRoute(view);
  if(!kind&&trusted&&view==='quality'&&data.mode)kind=Object.hasOwn(kinds,data.kind)?data.kind:null;
  if(!kind)return {view,data};
  return {view:kinds[kind].route,data:{kind,key:trusted?validKey(kind,data.key):null,
    ...(trusted&&data.fromManager===true?{fromManager:true}:{})}};
 }
 function dispose(){
  if(!mounted)return;
  const old=mounted;mounted=null;
  try{old.frame.contentWindow?.DFQualityWorkspace?.dispose?.();}catch(_){}
  old.host.remove();
 }
 function mount(view,data={},options={}){
  const kind=kindOfRoute(view),actor=context().user?.id,key=kind&&validKey(kind,data.key);
  if(!kind){if(mounted&&route()!==mounted.view&&!workspace()?.isPending?.())dispose();return;}
  if(!can(kind,'view'))return;
  const target=by(kinds[kind].id);if(!target)return;
  if(mounted?.view===view&&mounted.actor===actor&&!options.edit&&!options.tab&&(!key||key===workspace()?.getKey?.()||!workspace()?.getKey?.()&&key===mounted.key))return;
  if(workspace()?.isPending?.())return;
  dispose();
  const host=document.createElement('div'),frame=document.createElement('iframe');
  host.id='dfQualityWorkspaceHost';
  host.style.cssText='width:100%;min-width:0';
  frame.title=kinds[kind].title;
  frame.style.cssText='display:block;width:100%;height:max(500px,calc(100vh - 76px));height:max(500px,calc(100dvh - 76px));border:0;background:#edf1f5';
  const args=new URLSearchParams({v:'411',kind});if(key)args.set('key',key);
  if(options.edit)args.set('edit','1');if(options.tab==='matching')args.set('tab','matching');
  frame.src='quality_workspace.html?'+args;
  mounted={view,kind,actor,key,host,frame,fromManager:data.fromManager===true};
  host.append(frame);target.append(host);
 }
 function enter(view){
  const req=pendingRoute?.view===view?pendingRoute:null;
  if(req)pendingRoute=null;
  mount(view,req?.data,req?.options);
 }
 function go(kind,key,options={}){
  if(!can(kind,'view'))return false;
  const view=kinds[kind].route;
  const req={view,data:{kind,key:validKey(kind,key),fromManager:options.fromManager===true},options};
  pendingRoute=req;
  try{return window.v62ShowOnly?.(view);}
  finally{if(pendingRoute===req)pendingRoute=null;}
 }
 function navigation(view){
  const kind=kindOfRoute(view);
  if(!kind)return null;
  return {
   canLeave:()=>mounted?.view!==view||!workspace()?.isPending?.(),
   confirmLeave:()=>!approvalBusy()&&!visible(approval?.detail),
   capture(){
    const req=pendingRoute?.view===view?pendingRoute.data:null,current=mounted?.view===view?mounted:null;
    return {key:'quality:'+kind,data:{kind,key:req?req.key:validKey(kind,current&&workspace()?.getKey?.())||current?.key||null,
      ...(req?.fromManager||current?.fromManager?{fromManager:true}:{})}};
   },
   restore(s){mount(view,s?.data||{});}
  };
 }
 function selectionChanged(frame,key){
  if(mounted?.frame.contentWindow!==frame||!can(mounted.kind,'view'))return;
  mounted.key=validKey(mounted.kind,key);
  if(route()===mounted.view)window.DF_NAVIGATION_GUARD?.changed({persist:true});
 }
 async function leave(){
  const ws=workspace();if(ws?.isPending?.())await ws.flush();
  if(ws?.isPending?.())throw Error('저장이 끝난 뒤 이동하세요.');
  if(window.history.length>1&&window.DF_NAVIGATION_GUARD?.back())return;
  window.v62ShowOnly?.('quality',{replace:true});
 }
 function notify(){workspace()?.sync?.().catch(()=>{});}
 function permissionChanged(event){
  const ctx=context();
  if(mounted&&(event?.detail?.signedOut||mounted.actor!==ctx.user?.id||!ctx.profile||ctx.profile.active===false||ctx.profile.retired_at)){
   workspace()?.permissionChanged?.();dispose();return;
  }
  if(mounted&&(ctx.permissionStatus==='ready'||ctx.profile?.role==='admin')&&!can(mounted.kind,'view')){
   workspace()?.permissionChanged?.();dispose();return;
  }
  workspace()?.permissionChanged?.();
  if(!mounted&&kindOfRoute(route())&&!document.body.classList.contains('df-auth-locked'))enter(route());
 }
 function approvalBusy(){
  if(!approval)return false;
  const m=by('dfApprovalFormModal'),editor=m?._dfApprovalEditor;
  return approval.opening||visible(m)&&(approval.id?editor?.doc?.id===approval.id:
   String(editor?.preset?.content||editor?.doc?.content||'').split('\n')[0]===approval.marker);
 }
 function watchApproval(){
  if(!approval||approval.opening)return;
  if(approvalBusy()||visible(approval.detail))return;
  approval.observer?.disconnect();approval=null;notify();
 }
 async function openApproval(preset,linkedId,kind=mounted?.kind){
  if(!can(kind,'view')||(!linkedId&&!canApprove())||(linkedId&&!canApprove('view')))throw Error('내부결재 권한을 확인해 주세요.');
  if(approvalBusy())throw Error('열린 결재창을 먼저 닫아 주세요.');
  if(typeof window.dfApprovalOpenPreset!=='function')throw Error('결재창을 불러오지 못했습니다.');
  const token={id:linkedId,marker:String(preset?.content||'').split('\n')[0],opening:true,observer:null};
  approval=token;
  const actor=context().user?.id,activeRoute=route(),host=mounted;
  try{
   const ok=await window.dfApprovalOpenPreset({...preset,
    ...(linkedId?{dfQualityApprovalId:linkedId}:{}),
    dfQualityOpenIf:()=>actor===context().user?.id&&activeRoute===route()&&host===mounted&&can(kind,'view')});
   if(ok===false)throw Error('결재문서를 열지 못했습니다. 권한과 상태를 확인해 주세요.');
   token.opening=false;
   const modal=by('dfApprovalFormModal');
   if(modal&&approvalBusy()){
    token.observer=new MutationObserver(watchApproval);
    token.observer.observe(modal,{attributes:true,attributeFilter:['hidden','style']});
   }else if(linkedId&&visible(by('dfApprovalDetailModal'))){
    token.detail=by('dfApprovalDetailModal');
    token.observer=new MutationObserver(watchApproval);
    token.observer.observe(token.detail,{attributes:true,attributeFilter:['hidden','style']});
   }else{approval=null;notify();}
  }catch(e){if(approval===token)approval=null;throw e;}
 }
 function init(){
  window.dfQualityManualOpen=()=>go('manual');
  window.dfQmsSectionOpen=window.dfQualityManualOpen;
  const legacyOpen=window.dfOpenDocumentHub;
  if(typeof legacyOpen==='function')window.dfOpenDocumentHub=function(category){
   const kind=kindOfCategory(category);
   if(kind)return go(kind);
   return legacyOpen.apply(this,arguments);
  };
  if(typeof legacyOpen==='function')legacyFilesOpen=category=>legacyOpen.call(window,category);
  // Window capture precedes the old document-hub click handlers.
  window.addEventListener('click',e=>{
   const button=e.target.closest?.('[data-doc-category]');
   const kind=kindOfCategory(button?.dataset.docCategory);
   if(kind){e.preventDefault();e.stopImmediatePropagation();go(kind);return;}
   if(e.target.closest?.('#dfLogoutBtn,#dfCloudLogout')&&workspace()?.isPending?.()){
    e.preventDefault();e.stopImmediatePropagation();
    alert('품질문서에서 저장을 마친 뒤 로그아웃해 주세요.');
   }
  },true);
  document.addEventListener('df:menu-permissions-changed',permissionChanged);
  document.addEventListener('df:quality-revision-changed',notify);
  document.addEventListener('df:document-revisions-loaded',notify);
  window.addEventListener('focus',notify);
  window.addEventListener('beforeunload',e=>{if(workspace()?.isPending?.()){e.preventDefault();e.returnValue='';}});
  enter(route());
 }
 window.DFQualityBridge=Object.freeze({context,can,canApprove,migrate,enter,navigation,leave,selectionChanged,approvalBusy,approval:openApproval,
  isVisible:()=>!!mounted&&visible(by(kinds[mounted.kind].id))&&!document.body.classList.contains('df-auth-locked'),
  openEditor:(kind,key)=>go(kind,key,{edit:true}),
  openPreview:(kind,key)=>go(kind,key),
  openManaged(kind,key,mode,tab){if(window.DFQualityManager?.isOpen?.())return go(kind,key,{fromManager:true,edit:mode==='edit'&&tab!=='matching',tab});},
  backToManager:leave,
  legacyFiles(kind){if(can(kind,'view')&&kind!=='manual')return legacyFilesOpen?.(kinds[kind].category);},
  approvalList(){window.v62ShowOnly?.('approval');document.getElementById('dfApprovalRefresh')?.click();}
 });
 let legacyFilesOpen=null;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
