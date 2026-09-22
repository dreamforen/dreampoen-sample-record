/* Per-analysis method snapshots. Shared defaults apply when a new analysis is opened. */
(function (global) {
  'use strict';
  if (global.DF_ANALYSIS_METHODS) return;
  var doc=global.document, active=null, loading=0, scheduled=false, installed=false;
  var requestSerial=0, newAnalyses=new Set();
  var CACHE_KEY='dreampoen_lab_raw_input_v64';
  var own=function(o,k){return !!o&&Object.prototype.hasOwnProperty.call(o,k);};
  var clean=function(v){return v==null?'':String(v).trim();};
  var clone=function(v){return v==null?v:JSON.parse(JSON.stringify(v));};
  function cache() {
    try { return typeof global.analysisInputCache==='function' ? global.analysisInputCache() : JSON.parse(global.localStorage.getItem(CACHE_KEY)||'{}'); }
    catch (_) { return {}; }
  }
  function writeCache(value) { global.localStorage.setItem(CACHE_KEY,JSON.stringify(value)); }
  function currentId() {
    try { if (typeof analysisSelectedRecordId!=='undefined') return clean(analysisSelectedRecordId); } catch (_) {}
    return clean(global.analysisSelectedRecordId || doc.getElementById('analysisRecordSelect')?.value || active?.id);
  }
  function hasSavedAnalysis(value) {
    return !!value && typeof value==='object' && Object.keys(value).length>0;
  }
  function definitions() {return global.DF_MEASUREMENT_METHODS;}
  function getMethod(context,item,variant) {
    var api=definitions();
    if (!api || typeof api.get!=='function') return null;
    try {
      if(context.methodRows){
        var key=typeof api.canonical==='function'?api.canonical(item,variant?{variant:variant}:undefined):item+(variant?':'+variant:'');
        return context.methodRows[key] || null;
      }
      return api.get(item,variant?{variant:variant}:undefined);
    } catch (_) {return null;}
  }
  function notice() {
    var applyButton=doc.getElementById('dfAnalysisApplyCommonMethods');
    if(applyButton)applyButton.disabled=!active || active.methodsState==='loading' || !canWriteAnalysis();
    var node=doc.getElementById('dfAnalysisMethodStatus');
    if(!active || (!active.overrideRequested && (active.snapshot || !active.allowDefaults))){if(node)node.remove();return;}
    if(active.methodsState!=='loading' && active.methodsState!=='error'){if(node)node.remove();return;}
    if(!node){node=doc.createElement('div');node.id='dfAnalysisMethodStatus';node.className='no-print';node.setAttribute('role','status');
      var area=doc.getElementById('analysisPrintArea');if(area)area.before(node);else return;}
    node.replaceChildren();
    var label=doc.createElement('span');label.textContent=active.methodsState==='loading'?'공통 방법을 불러오는 중입니다.':'공통 방법을 불러오지 못해 기존 방법을 표시합니다. 로그인 상태와 공통 설정을 확인해 주세요.';
    node.appendChild(label);
    if(active.methodsState==='error'){
      var retry=doc.createElement('button');retry.type='button';retry.textContent='다시 불러오기';
      retry.onclick=function(){if(active?.overrideRequested)applyCommon(false);else if(active && !active.snapshot)startMethodLoad(active);};node.appendChild(retry);
    }
  }
  function startMethodLoad(context) {
    var token=++requestSerial,api=definitions();
    context.loadToken=token;context.methodsState='loading';context.methodError='';context.methodRows=null;notice();
    context.methodsPromise=Promise.resolve().then(function(){
      if(!api || typeof api.load!=='function')throw new Error('공통 방법 기능을 불러오지 못했습니다.');
      return api.load(true);
    }).then(function(rows){
      if(context.loadToken!==token)return;
      context.methodRows=Array.isArray(rows)?Object.fromEntries(rows.map(function(row){return [row.analyte_key,clone(row)];})):null;
      context.methodsState='ready';
    }).catch(function(error){
      if(context.loadToken!==token)return;
      context.methodsState='error';context.methodError=clean(error?.message||error);
      global.DF_DIAG?.warn?.('ANALYSIS-METHODS','공통 방법 불러오기 실패 · 기존 분석방법 유지',context.methodError);
    }).finally(function(){if(active===context && context.loadToken===token){notice();apply();}});
    return context.methodsPromise;
  }
  function keyOf(card) {
    var key=clean(card.dataset.labKey);
    if(key)return key;
    if(card.classList.contains('dust-analysis-card'))return '먼지';
    return clean(card.querySelector('.analysis-card-title strong')?.textContent);
  }
  function analyteOf(card,key) {
    if(card.dataset.analyte)return clean(card.dataset.analyte);
    if(/^(?:중금속|VOC):/.test(key))return key.slice(key.indexOf(':')+1);
    return key.replace(/:(?:ic|uv|lanthanum)$/,'');
  }
  function variantOf(card,key) {
    return clean(card.dataset.methodCode) || (key.match(/:(ic|uv|lanthanum)$/)||[])[1] || '';
  }
  function cards() {
    var area=doc.getElementById('analysisPrintArea');
    if(!area)return [];
    return Array.from(area.querySelectorAll('.analysis-card')).filter(function(card){
      var dust=card.closest('#analysisDustSheet');
      return (!dust || dust.style.display!=='none') && !!keyOf(card);
    });
  }
  function originalMethod(card) {
    if(!own(card.dataset,'dfMethodOriginal'))card.dataset.dfMethodOriginal=clean(card.querySelector('.analysis-card-title em')?.textContent);
    return card.dataset.dfMethodOriginal;
  }
  function manualMethod(values,key,field) {
    var row=values && values.lab && values.lab[key];
    if(own(row,field))return {exists:true,value:clean(row[field])};
    if(field==='analysis_method' && own(row,'method'))return {exists:true,value:clean(row.method)};
    return {exists:false,value:''};
  }
  function snapshotCard(card,context) {
    var key=keyOf(card), item=analyteOf(card,key), variant=variantOf(card,key), original=originalMethod(card);
    var saved=context.snapshot && context.snapshot.cards && context.snapshot.cards[key];
    if(saved)return clone(saved);
    var manualAnalysis=manualMethod(context.original,key,'analysis_method');
    var manualSampling=manualMethod(context.original,key,'sampling_method');
    var shared=context.allowDefaults && context.methodsState==='ready'?getMethod(context,item,variant):null;
    return {analyte:item,variant:variant,
      analysis_method:manualAnalysis.exists?manualAnalysis.value:(clean(shared?.analysis_method)||original),
      sampling_method:manualSampling.exists?manualSampling.value:clean(shared?.sampling_method),
      analysis_source:manualAnalysis.exists?'manual':(clean(shared?.analysis_method)?'shared':'existing'),
      sampling_source:manualSampling.exists?'manual':(clean(shared?.sampling_method)?'shared':'existing'),
      revision:shared?.revision || null};
  }
  function display(card,value) {
    var em=card.querySelector('.analysis-card-title em');
    if(em && em.textContent!==value.analysis_method)em.textContent=value.analysis_method;
    var row=card.querySelector(':scope > .df-analysis-sampling-method');
    if(!value.sampling_method){if(row)row.remove();return;}
    if(!row){
      row=doc.createElement('div');row.className='df-analysis-sampling-method';
      var label=doc.createElement('span');label.textContent='시료채취방법';
      var text=doc.createElement('strong');row.append(label,text);
      var heading=card.querySelector('.analysis-card-title');
      if(heading)heading.insertAdjacentElement('afterend',row);else card.prepend(row);
    }
    var target=row.querySelector('strong');if(target.textContent!==value.sampling_method)target.textContent=value.sampling_method;
  }
  function canWriteAnalysis(){var legacy=true,api=global.DFMenuPermissions,action=active&&active.allowDefaults?'create':'update';return api?api.can('analysis',action,legacy):legacy;}
  function persistSnapshot(context) {
    if(!canWriteAnalysis())return;
    if(!context || !context.snapshot || !context.id)return;
    var store=cache();
    if(!store[context.id])return;
    store[context.id].method_snapshot=clone(context.snapshot);
    writeCache(store);
  }
  function apply() {
    if(loading || !active || currentId()!==active.id)return;
    if(active.allowDefaults && !active.snapshot && active.methodsState==='loading')return;
    var list=cards();if(!list.length)return;
    var changed=false;
    list.forEach(function(card){
      var key=keyOf(card), value=snapshotCard(card,active);
      display(card,value);
      // Historical rows without a snapshot keep their original methods; opening them alone does not backfill metadata.
      if((active.allowDefaults && active.methodsState==='ready') || active.snapshot){
        if(!active.snapshot)active.snapshot={version:1,created_at:new Date().toISOString(),cards:{}};
        if(!active.snapshot.cards)active.snapshot.cards={};
        if(!own(active.snapshot.cards,key)) {active.snapshot.cards[key]=value;changed=true;}
      }
    });
    if(changed)persistSnapshot(active);
    notice();
  }
  function scheduleApply() {
    if(scheduled)return;scheduled=true;
    Promise.resolve().then(function(){scheduled=false;apply();});
  }
  function restoreMethodFields(before,after) {
    if(before?.method_snapshot)after.method_snapshot=clone(before.method_snapshot);
    Object.keys(before?.lab||{}).forEach(function(key){
      ['method','analysis_method','sampling_method'].forEach(function(field){
        if(!own(before.lab[key],field))return;
        if(!after.lab)after.lab={};if(!after.lab[key])after.lab[key]={};
        after.lab[key][field]=before.lab[key][field];
      });
    });
  }
  async function applyCommon(ask) {
    if(!canWriteAnalysis()){global.alert?.("시료분석 작성 또는 수정 권한이 없습니다.");return false;}
    if(!active || currentId()!==active.id)return false;
    if(ask!==false && typeof global.confirm==='function' && !global.confirm('현재 분석서의 시료채취방법·분석방법 문구에 공통 설정을 다시 적용할까요?\n분석 입력값과 계산식은 유지됩니다. 적용 후 분석자료 저장을 눌러 주세요.'))return false;
    var context=active;context.overrideRequested=true;
    await startMethodLoad(context);
    if(active!==context || currentId()!==context.id || context.methodsState!=='ready')return false;
    var next=clone(context.snapshot || {version:1,created_at:new Date().toISOString(),cards:{}}),store=cache();
    var values=store[context.id]||{},updated=0;if(!next.cards)next.cards={};
    cards().forEach(function(card){
      var key=keyOf(card),current=snapshotCard(card,context),shared=getMethod(context,analyteOf(card,key),variantOf(card,key));
      ['analysis_method','sampling_method'].forEach(function(field){
        if(!clean(shared?.[field]))return;
        current[field]=clean(shared[field]);current[field==='analysis_method'?'analysis_source':'sampling_source']='shared';
        current.revision=shared.revision||null;updated++;
        if(!values.lab)values.lab={};if(!values.lab[key])values.lab[key]={};values.lab[key][field]=current[field];
        if(field==='analysis_method' && own(values.lab[key],'method'))values.lab[key].method=current[field];
      });
      next.cards[key]=current;
    });
    next.applied_at=new Date().toISOString();context.snapshot=next;context.overrideRequested=false;
    values.method_snapshot=clone(next);store[context.id]=values;writeCache(store);context.original=clone(values);
    apply();
    var status=doc.getElementById('analysisSaveStatus');
    if(status){status.textContent=updated?'공통 방법 적용 · 분석자료 저장 필요':'적용할 공통 방법이 없습니다.';status.classList.remove('saved');}
    return true;
  }
  function install() {
    if(installed || typeof global.loadAnalysisRecord!=='function' || typeof global.saveAnalysisInputCache!=='function')return false;
    installed=true;
    var baseLoad=global.loadAnalysisRecord;
    global.loadAnalysisRecord=function(record){
      var id=clean(record?.id), before=cache()[id], previous=active;
      if(id && !hasSavedAnalysis(before))newAnalyses.add(id);
      // Preserve this open session's snapshot during a re-render of the same record.
      var savedSnapshot=clone(before?.method_snapshot || (previous?.id===id?previous.snapshot:null));
      if(id && previous?.id===id && !savedSnapshot && previous.methodsState==='loading'){
        active=previous;active.record=record;active.original=clone(before||{});
      }else{
        active=id ? {id:id,record:record,original:clone(before||{}),allowDefaults:newAnalyses.has(id),
          snapshot:savedSnapshot,methodsState:savedSnapshot?'ready':'unused'} : null;
        if(active?.allowDefaults && !active.snapshot)startMethodLoad(active);
      }
      notice();
      loading++;
      try{return baseLoad.apply(this,arguments);}
      finally{loading--;apply();}
    };
    global.loadAnalysisRecord._dfSharedMethods=true;
    var baseSave=global.saveAnalysisInputCache;
    global.saveAnalysisInputCache=function(){
      var id=currentId(),before=clone(cache()[id]||{}),result=baseSave.apply(this,arguments);
      if(!id)return result;
      var store=cache(),after=store[id];if(!after)return result;
      restoreMethodFields(before,after);
      if(active?.id===id && active.snapshot)after.method_snapshot=clone(active.snapshot);
      writeCache(store);return result;
    };
    global.saveAnalysisInputCache._dfSharedMethods=true;
    if(typeof global.renderPendingAnalysisCards==='function'){
      var baseRender=global.renderPendingAnalysisCards;
      global.renderPendingAnalysisCards=function(){var result=baseRender.apply(this,arguments);apply();return result;};
    }
    // Capture the methods currently displayed when a historical record is deliberately saved.
    doc.addEventListener('click',function(e){
      var button=e.target.closest?.('#analysisSaveBtn, #analysisPrintBtn');
      if(!button || !active || currentId()!==active.id)return;
      if(active.methodsState==='loading' && (active.overrideRequested || (active.allowDefaults && !active.snapshot))){
        var requested=active,requestedId=active.id,requestedToken=active.loadToken;
        e.preventDefault();e.stopImmediatePropagation();
        active.methodsPromise.then(function(){if(active===requested && active.loadToken===requestedToken && currentId()===requestedId && button.isConnected)button.click();});
        return;
      }
      if(button.id!=='analysisSaveBtn') {apply();return;}
      apply();
      if(!active.snapshot){
        active.snapshot={version:1,created_at:new Date().toISOString(),cards:{}};
        cards().forEach(function(card){active.snapshot.cards[keyOf(card)]=snapshotCard(card,active);});
        persistSnapshot(active);
      }
    },true);
    // All existing print/PDF and repository print paths use these same nodes and snapshots.
    global.addEventListener('beforeprint',apply);
    doc.addEventListener('df-measurement-methods-changed',function(){
      // Existing open analyses are pinned. Only the next new analysis reads the changed defaults.
      apply();
    });
    var area=doc.getElementById('analysisPrintArea');
    if(area && global.MutationObserver)new global.MutationObserver(scheduleApply).observe(area,{childList:true,subtree:true});
    return true;
  }
  function styles(){
    if(doc.getElementById('dfAnalysisMethodsStyle'))return;
    var style=doc.createElement('style');style.id='dfAnalysisMethodsStyle';
    style.textContent='#analysisPrintArea .df-analysis-sampling-method{display:grid;grid-template-columns:90px minmax(0,1fr);gap:12px;padding:9px 14px;border-bottom:1px solid #d9e1e8;font-size:12px;line-height:1.5;break-inside:avoid}#analysisPrintArea .df-analysis-sampling-method>span{color:#51606e}#analysisPrintArea .df-analysis-sampling-method>strong{font-weight:400;white-space:pre-wrap;overflow-wrap:anywhere}#analysisPrintArea .analysis-card-title em{white-space:pre-wrap;overflow-wrap:anywhere}#dfAnalysisMethodStatus{display:flex;align-items:center;gap:12px;margin:12px 0;padding:10px 14px;background:#fff8e6;border:1px solid #e7d7ae;border-radius:8px;color:#675324;font-size:13px}#dfAnalysisMethodStatus button{padding:6px 10px;border:1px solid #c9b989;border-radius:6px;background:white;cursor:pointer}@media print{#analysisPrintArea .df-analysis-sampling-method{font-size:10px;padding:5px 8px}#dfAnalysisMethodStatus,#dfAnalysisApplyCommonMethods{display:none!important}}';
    doc.head.appendChild(style);
  }
  function boot(){
    styles();install();
    var save=doc.getElementById('analysisSaveBtn');
    if(save && !doc.getElementById('dfAnalysisApplyCommonMethods')){
      var button=doc.createElement('button');button.type='button';button.id='dfAnalysisApplyCommonMethods';
      button.className='company-btn secondary no-print';button.textContent='공통 방법 다시 적용';button.disabled=!active||!canWriteAnalysis();
      button.onclick=function(){applyCommon(true);};save.after(button);
    }
  }
  global.DF_ANALYSIS_METHODS={install:install,apply:apply,applyCommon:applyCommon,version:1};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);

