/* DREAMFOREN v120.37.22.3 · SAMPLE STORAGE + RECTANGULAR TRAVERSE VIEW */
(function dfV12037193SampleStorageAndTraverseView(){
  'use strict';

  const VERSION='v120.37.22.3';
  const VERSION_LABEL=`ONLINE ${VERSION} · SAMPLE STORAGE + TRAVERSE VIEW`;
  const RECORDS_KEY='dreampoen_sample_records_v17';
  const DRAFT_KEY='dreampoen_sample_draft_v17';
  const GUARD_KEY='dreampoen_confirmed_record_guard_v12037162';
  const DELETED_KEY='dreampoen_repository_deleted_receipts_v12012';
  const MAX_GUARDS=80;
  const LARGE_GUARD_CHARS=900000;
  let versionObserver=null;

  const byId=id=>document.getElementById(id);
  const clean=value=>String(value??'').trim();
  const parsedTime=value=>{
    const time=Date.parse(value||'');
    return Number.isFinite(time)?time:0;
  };
  const clone=value=>{
    try{return JSON.parse(JSON.stringify(value));}
    catch(_){return value;}
  };
  const json=value=>{
    try{return JSON.stringify(value);}
    catch(_){return ''}
  };
  const sameJson=(a,b)=>{
    if(a===b)return true;
    if(a==null||b==null)return false;
    return json(a)===json(b);
  };
  const isQuotaError=error=>error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014||/quota|storage.*full|저장.*공간/i.test(String(error?.message||error||''));

  function storageChars(){
    let total=0;
    try{
      for(let index=0;index<localStorage.length;index++){
        const key=localStorage.key(index)||'';
        total+=key.length+(localStorage.getItem(key)||'').length;
      }
    }catch(_){/* 진단값만 생략 */}
    return total;
  }

  // 확정본(data), 실제로 다른 작성중 본(autosaveData), 이전 수동 저장본(backup)은 유지한다.
  // 같은 내용이 중복 저장된 경우에만 사본을 제거한다.
  function compactRecord(record){
    if(!record||typeof record!=='object')return record;
    const output={...record};
    if(output.autosaveData!==undefined&&sameJson(output.autosaveData,output.data))delete output.autosaveData;
    if(output.backup!==undefined&&output.backup!==null&&sameJson(output.backup,output.data)){
      delete output.backup;
      delete output.backupAt;
    }
    return output;
  }

  function compactRecords(records){
    return (Array.isArray(records)?records:[]).map(compactRecord);
  }

  // 온라인 전송 보호본에는 작성중 자동저장본이 필요하지 않다.
  // 확정본과 '최근 저장본 복구'용 backup은 그대로 둔다.
  function compactGuardRecord(record){
    const output=compactRecord(record);
    if(!output||typeof output!=='object')return output;
    const protectedRecord={...output};
    delete protectedRecord.autosaveData;
    delete protectedRecord.autosavedAt;
    return protectedRecord;
  }

  function readObject(key){
    try{
      const value=JSON.parse(localStorage.getItem(key)||'{}');
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    }catch(_){return {}}
  }

  function sortedGuardKeys(guards){
    return Object.keys(guards||{}).sort((a,b)=>{
      const right=Math.max(parsedTime(guards[b]?.savedAt),parsedTime(guards[b]?.updatedAt));
      const left=Math.max(parsedTime(guards[a]?.savedAt),parsedTime(guards[a]?.updatedAt));
      return right-left;
    });
  }

  function compactGuardMap(guards,{aggressive=false}={}){
    const needsLocalRecord=Object.values(guards||{}).some(guard=>guard&&!guard.record);
    const records=needsLocalRecord?(()=>{
      try{return typeof window.readRecordStore==='function'?window.readRecordStore():[]}
      catch(_){return []}
    })():[];
    const byRecordId=new Map(records.map(record=>[clean(record?.id),record]));
    const output={};
    sortedGuardKeys(guards).forEach(key=>{
      const guard=guards[key];
      if(!guard||typeof guard!=='object')return;
      const record=guard.record||byRecordId.get(clean(guard.id||key));
      output[key]={...guard};
      if(record)output[key].record=compactGuardRecord(record);
    });
    let keys=sortedGuardKeys(output);
    const limit=aggressive?12:MAX_GUARDS;
    keys.slice(limit).forEach(key=>delete output[key]);
    if(!aggressive&&json(output).length>LARGE_GUARD_CHARS){
      keys=sortedGuardKeys(output);
      keys.slice(24).forEach(key=>delete output[key]);
    }
    return output;
  }

  function storeGuards(guards,{aggressive=false}={}){
    let output=compactGuardMap(guards,{aggressive});
    const keys=Object.keys(output);
    if(!keys.length){localStorage.removeItem(GUARD_KEY);return true}
    try{
      localStorage.setItem(GUARD_KEY,json(output));
      return true;
    }catch(error){
      if(!isQuotaError(error))throw error;
      output=compactGuardMap(output,{aggressive:true});
      try{
        localStorage.setItem(GUARD_KEY,json(output));
        return true;
      }catch(lastError){
        // 보호 사본 저장 실패가 본 기록 저장까지 막지 않게 한다.
        window.DF_DIAG?.warn('SAMPLE-GUARD-STORAGE-12037223','온라인 보호 사본 저장공간 부족',lastError?.message||String(lastError));
        return false;
      }
    }
  }

  function compactStoredState(){
    const before=storageChars();
    try{
      const records=JSON.parse(localStorage.getItem(RECORDS_KEY)||'[]');
      if(Array.isArray(records))localStorage.setItem(RECORDS_KEY,json(compactRecords(records)));
    }catch(error){
      window.DF_DIAG?.warn('SAMPLE-RECORD-COMPACT-12037223','기존 시료기록 중복사본 정리 보류',error?.message||String(error));
    }
    try{storeGuards(readObject(GUARD_KEY));}
    catch(error){window.DF_DIAG?.warn('SAMPLE-GUARD-COMPACT-12037223','온라인 보호본 정리 보류',error?.message||String(error));}
    const after=storageChars();
    window.DF_SAMPLE_STORAGE_HEALTH={version:VERSION,beforeChars:before,afterChars:after,releasedChars:Math.max(0,before-after)};
    return window.DF_SAMPLE_STORAGE_HEALTH;
  }

  function patchRecordWriter(){
    const base=window.writeRecordStore;
    if(typeof base!=='function'||base._dfV12037193)return false;
    const patched=function dfV12037193WriteRecordStore(records){
      const compacted=compactRecords(records);
      try{
        return base.call(this,compacted);
      }catch(error){
        if(!isQuotaError(error))throw error;
        storeGuards(readObject(GUARD_KEY),{aggressive:true});
        try{return base.call(this,compacted)}
        catch(lastError){
          const status=byId('saveStatus');
          if(status)status.textContent='저장 중단 · 브라우저 저장공간이 부족합니다.';
          window.DF_DIAG?.error('SAMPLE-RECORD-STORAGE-12037223','시료기록 저장공간 부족',lastError?.message||String(lastError));
          throw lastError;
        }
      }
    };
    patched._dfV12037193=true;
    patched._dfV12037193Base=base;
    try{window.writeRecordStore=patched}catch(_){return false}
    return true;
  }

  function patchAutoSaveFeedback(){
    const base=window.autoSaveCurrent;
    if(typeof base!=='function'||base._dfV12037193)return false;
    const patched=function dfV12037193AutoSaveCurrent(){
      try{return base.apply(this,arguments)}
      catch(error){
        if(!isQuotaError(error))throw error;
        storeGuards(readObject(GUARD_KEY),{aggressive:true});
        try{return base.apply(this,arguments)}
        catch(lastError){
          const badge=byId('autoSaveBadge');
          if(badge)badge.textContent='자동보관 공간 부족 · 기록 저장 버튼을 눌러주세요';
          window.DF_DIAG?.warn('SAMPLE-DRAFT-STORAGE-12037223','작성중 자동보관 공간 부족',lastError?.message||String(lastError));
          return false;
        }
      }
    };
    patched._dfV12037193=true;
    patched._dfV12037193Base=base;
    window.autoSaveCurrent=patched;
    return true;
  }

  function patchManualSaveFeedback(){
    const button=byId('btnSave'),base=window.manualSaveRecord;
    if(!button||typeof base!=='function'||button.dataset.dfV12037193Save==='1')return false;
    button.dataset.dfV12037193Save='1';
    button.onclick=function dfV12037193ManualSave(){
      try{return base.apply(this,arguments)}
      catch(error){
        console.error('[SAMPLE-STORAGE-12037223]',error);
        const message=isQuotaError(error)
          ?'브라우저 저장공간이 가득 차 기록을 저장하지 못했습니다.\n중복 보호본을 정리했으니 다시 한 번 저장해주세요.'
          :`시료채취기록 저장 중 오류가 발생했습니다.\n${error?.message||error}`;
        const status=byId('saveStatus');if(status)status.textContent='기록 저장 실패 · 오류진단을 확인해주세요.';
        alert(message);
        return false;
      }
    };
    return true;
  }

  function deletedHistoryHas(receipt){
    try{return new Set(JSON.parse(localStorage.getItem(DELETED_KEY)||'[]').map(String)).has(clean(receipt))}
    catch(_){return false}
  }

  function receiptOf(record){
    try{
      if(typeof window.dfRepoReceipt==='function')return clean(window.dfRepoReceipt(record?.data));
    }catch(_){/* 구버전 호환 */}
    return clean(record?.data?.fields?.receiptNo);
  }

  function compactCaptureSavedRecord(event){
    try{
      const id=clean(event?.detail?.id);
      if(!id||typeof window.readRecordStore!=='function')return false;
      const record=window.readRecordStore().find(item=>clean(item?.id)===id);
      if(!record)return false;
      const receipt=receiptOf(record),hadDeletedHistory=deletedHistoryHas(receipt);
      if(hadDeletedHistory)window.dfV1203722ForgetDeletedReceipt?.(receipt);
      const guards=readObject(GUARD_KEY);
      guards[id]={
        id,
        receipt,
        updatedAt:record.updatedAt||record.autosavedAt||record.createdAt||'',
        savedAt:new Date().toISOString(),
        allowRevive:true,
        hadDeletedHistory,
        record:compactGuardRecord(record)
      };
      storeGuards(guards);
      return true;
    }catch(error){
      // 보호 사본의 문제로 방금 저장한 로컬 확정본을 실패 처리하지 않는다.
      window.DF_DIAG?.warn('SAMPLE-GUARD-CAPTURE-12037223','시료기록 보호본 저장 보류',error?.message||String(error));
      return false;
    }
  }

  function patchGuardCapture(){
    const old=window.dfV1203722CaptureSavedRecord;
    if(typeof old==='function')document.removeEventListener('dreampoen:record-saved',old,true);
    if(window.dfV12037193GuardCaptureBound)return true;
    document.addEventListener('dreampoen:record-saved',compactCaptureSavedRecord,true);
    window.dfV12037193GuardCaptureBound=true;
    return true;
  }

  function forgetConfirmedGuard(record){
    const id=clean(record?.id),receipt=receiptOf(record);
    if(!id&&!receipt)return false;
    const guards=readObject(GUARD_KEY);
    let changed=false;
    Object.keys(guards).forEach(key=>{
      const guard=guards[key];
      if((id&&clean(guard?.id||key)===id)||(receipt&&clean(guard?.receipt)===receipt)){
        delete guards[key];changed=true;
      }
    });
    if(changed)storeGuards(guards);
    return changed;
  }

  function patchOnlineConfirmation(){
    const base=window.dfRepoUpsertMeasurement;
    if(typeof base!=='function'||base._dfV12037193)return false;
    const patched=async function dfV12037193UpsertAndReleaseGuard(record){
      const result=await base.apply(this,arguments);
      if(result!==false)forgetConfirmedGuard(record);
      return result;
    };
    patched._dfV12037193=true;
    patched._dfV12037193Base=base;
    window.dfRepoUpsertMeasurement=patched;
    return true;
  }

  // 사각형 산정값/표/행 수는 건드리지 않는다.
  // 측정구 정면에서는 삽입되는 긴 변을 화면 가로로 놓고,
  // 1번이 측정구 가까이, 다음 번호가 삽입방향 안쪽으로 보이게 한다.
  function renderRectangularFrontView(model){
    const svg=byId('traverseDiagram');
    if(!svg)return false;
    if(!model||!model.area){
      svg.innerHTML='<text x="160" y="112" text-anchor="middle" class="diagram-empty">굴뚝 치수를 입력하세요</text>';
      return true;
    }
    const dimensionA=Number(model.A),dimensionB=Number(model.B);
    if(!(dimensionA>0&&dimensionB>0))return false;
    const aIsHorizontal=dimensionA>=dimensionB;
    const horizontal=aIsHorizontal?dimensionA:dimensionB;
    const vertical=aIsHorizontal?dimensionB:dimensionA;
    const horizontalDivisions=Math.max(1,Number(aIsHorizontal?model.nA:model.nB)||1);
    const verticalDivisions=Math.max(1,Number(aIsHorizontal?model.nB:model.nA)||1);
    const maxW=205,maxH=145,scale=Math.min(maxW/horizontal,maxH/vertical);
    const width=horizontal*scale,height=vertical*scale;
    const x0=(285-width)/2,y0=(185-height)/2;
    const portX=x0+width+18,portY=y0+height/2;
    let body=`<rect x="${x0}" y="${y0}" width="${width}" height="${height}" class="duct-shape"/>
      <line x1="${x0+width}" y1="${portY}" x2="${portX}" y2="${portY}" class="port-neck"/>
      <circle cx="${portX+5}" cy="${portY}" r="7" class="sampling-port"/>
      <text x="${portX+16}" y="${portY+4}" class="port-label">측정구</text>
      <line x1="${portX-3}" y1="${portY-18}" x2="${x0+width-25}" y2="${portY-18}" class="probe-arrow"/>
      <polygon points="${x0+width-25},${portY-18} ${x0+width-15},${portY-23} ${x0+width-15},${portY-13}" class="probe-arrow-head"/>
      <text x="${portX-2}" y="${portY-26}" text-anchor="end" class="probe-label">삽입방향</text>`;
    for(let column=1;column<horizontalDivisions;column++){
      const x=x0+width*column/horizontalDivisions;
      body+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+height}" class="grid-line"/>`;
    }
    for(let row=1;row<verticalDivisions;row++){
      const y=y0+height*row/verticalDivisions;
      body+=`<line x1="${x0}" y1="${y}" x2="${x0+width}" y2="${y}" class="grid-line"/>`;
    }
    const values=model.values||[];
    values.forEach((_value,index)=>{
      // 계산된 지점 수만 사용해 긴 삽입축에 등간격으로 투영한다.
      // 표에 표시되는 실제 산정 좌표는 기존 값을 그대로 유지한다.
      const ratio=values.length===1?0.5:(index+0.5)/values.length;
      const x=x0+width-ratio*width;
      const y=portY;
      body+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" class="measure-dot"/><text x="${(x+8).toFixed(1)}" y="${(y-8).toFixed(1)}" class="point-label">${index+1}</text>`;
    });
    body+=`<text x="160" y="208" text-anchor="middle" class="diagram-caption">사각형 · ${model.nA}×${model.nB} 등분 · 오른쪽 측부 측정구 기준</text>`;
    svg.innerHTML=body;
    svg.dataset.dfRectView='sampling-port-front';
    svg.dataset.dfVisualWidth=String(horizontal);
    svg.dataset.dfVisualHeight=String(vertical);
    svg.dataset.dfHorizontalAxis=aIsHorizontal?'A':'B';
    return true;
  }

  function patchTraverseRenderer(){
    const base=window.renderTraverseDiagram;
    if(typeof base!=='function'||base._dfV12037193)return false;
    const patched=function dfV12037193RenderTraverseDiagram(model){
      if(model?.shape==='rect'&&renderRectangularFrontView(model))return;
      return base.apply(this,arguments);
    };
    patched._dfV12037193=true;
    patched._dfV12037193Base=base;
    window.renderTraverseDiagram=patched;
    try{
      if(typeof window.traverseModel==='function')patched(window.traverseModel());
    }catch(error){window.DF_DIAG?.warn('TRAVERSE-REDRAW-12037223','측정점 그림 즉시 갱신 보류',error?.message||String(error));}
    return true;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side&&side.textContent!==VERSION_LABEL)side.textContent=VERSION_LABEL;
    if(footer&&footer.textContent!==VERSION)footer.textContent=VERSION;
    if(document.documentElement)document.documentElement.dataset.dreamforenVersion=VERSION;
    window.DF_ACTIVE_BUILD=VERSION;
  }

  function replaceVersionNode(id){
    const current=byId(id);
    if(!current||current.dataset.v12037193Owner==='1')return current;
    const replacement=current.cloneNode(true);
    replacement.dataset.v12037193Owner='1';
    current.replaceWith(replacement);
    return replacement;
  }

  function ownVersionDisplay(){
    replaceVersionNode('dfBuildVersionStatic');
    replaceVersionNode('dfFooterVersion');
    applyVersion();
    if(versionObserver||typeof MutationObserver==='undefined')return;
    const targets=['dfBuildVersionStatic','dfFooterVersion'].map(byId).filter(Boolean);
    versionObserver=new MutationObserver(applyVersion);
    targets.forEach(target=>versionObserver.observe(target,{childList:true,characterData:true,subtree:true}));
  }

  function init(){
    const health=compactStoredState();
    patchRecordWriter();
    patchAutoSaveFeedback();
    patchManualSaveFeedback();
    patchGuardCapture();
    patchOnlineConfirmation();
    patchTraverseRenderer();
    ownVersionDisplay();
    [180,700,1600,3200].forEach(wait=>setTimeout(()=>{
      patchRecordWriter();
      patchAutoSaveFeedback();
      patchManualSaveFeedback();
      patchOnlineConfirmation();
      patchTraverseRenderer();
      applyVersion();
    },wait));
    window.DF_DIAG?.info(
      'SAMPLE-STORAGE-TRAVERSE-12037223',
      '시료기록 저장용량·사각 측정점 정면도 보정 완료',
      `확정자료 유지 / 중복사본 ${health.releasedChars||0}자 정리 / 산정식·표·서식 변경 없음`
    );
  }

  window.dfV12037193CompactRecord=compactRecord;
  window.dfV12037193CompactStoredState=compactStoredState;
  window.dfV12037193RenderRectangularFrontView=renderRectangularFrontView;
  window.dfV12037193ApplyVersion=applyVersion;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
