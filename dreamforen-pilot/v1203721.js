// ==========================================================
// DREAMFOREN v120.37.16.1
// 접수번호·시간 확정 저장 보호
// - 저장 직후 온라인 조회가 먼저 끝나도 새 로컬 기록을 삭제하지 않는다.
// - 삭제 표식이 명시된 접수번호만 로컬에서 제거한다.
// - 접수번호 변경 시 같은 기록 ID가 중복 생성되지 않도록 정리한다.
// 기존 입력·계산·인쇄·저장 payload 로직은 변경하지 않는다.
// ==========================================================
(function dfV12037161ReceiptTimeSaveFix(){
  'use strict';

  const VERSION='v120.37.16.1';
  const byId=id=>document.getElementById(id);

  function receiptOf(record){
    try{
      if(typeof dfRepoReceipt==='function')return String(dfRepoReceipt(record?.data)||'').trim();
    }catch(_){/* 기존 자료 호환용 fallback */}
    return String(record?.data?.fields?.receiptNo||'').trim();
  }

  function confirmedTime(record){
    const value=record?.updatedAt||record?.autosavedAt||record?.createdAt||'';
    const parsed=Date.parse(value);
    return Number.isFinite(parsed)?parsed:0;
  }

  function pruneExplicitDeletes(rows){
    const deleted=new Set();
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      try{
        if(typeof dfRepoIsDeleted==='function'&&dfRepoIsDeleted(row)){
          const receipt=String(row?.receipt_no||'').trim();
          if(receipt)deleted.add(receipt);
        }
      }catch(_){/* 잘못된 원격 한 행은 무시 */}
    });
    try{
      if(typeof dfRepoDeletedSet==='function'){
        dfRepoDeletedSet().forEach(receipt=>{
          const value=String(receipt||'').trim();
          if(value)deleted.add(value);
        });
      }
    }catch(_){/* 로컬 삭제 이력 접근 실패 시 원본을 보존 */}

    const local=typeof readRecordStore==='function'?readRecordStore():[];
    const kept=local.filter(record=>{
      const receipt=receiptOf(record);
      return !receipt||!deleted.has(receipt);
    });
    if(kept.length!==local.length&&typeof writeRecordStore==='function')writeRecordStore(kept);
    return {before:local.length,after:kept.length,deleted:[...deleted]};
  }

  function dedupeRecordsByStableId(){
    const records=typeof readRecordStore==='function'?readRecordStore():[];
    const chosen=new Map(),order=[];
    records.forEach((record,index)=>{
      const id=String(record?.id||'').trim();
      const key=id?`id:${id}`:`without-id:${index}`;
      if(!chosen.has(key)){
        chosen.set(key,record);
        order.push(key);
        return;
      }
      // 같은 시각이면 현재 기기에 먼저 있던 확정본을 유지한다.
      if(confirmedTime(record)>confirmedTime(chosen.get(key)))chosen.set(key,record);
    });
    const deduped=order.map(key=>chosen.get(key));
    const removed=records.length-deduped.length;
    if(removed>0&&typeof writeRecordStore==='function')writeRecordStore(deduped);
    return {removed,records:deduped};
  }

  function patchRepositorySync(){
    if(window.dfV12037161RepositoryPatched)return true;
    if(typeof dfRepoPruneMissingCloud!=='function'||typeof dfRepoMergeCloud!=='function')return false;

    // 원격 목록에 아직 없다는 이유만으로 방금 저장한 로컬 기록을 지우지 않는다.
    dfRepoPruneMissingCloud=function dfV12037161PruneOnlyExplicitDeletes(rows){
      return pruneExplicitDeletes(rows);
    };

    const baseMerge=dfRepoMergeCloud;
    dfRepoMergeCloud=function dfV12037161MergeWithoutReceiptRenameDuplicates(rows){
      const result=baseMerge.apply(this,arguments);
      const dedupe=dedupeRecordsByStableId();
      if(dedupe.removed>0&&result&&typeof result==='object')result.changed=true;
      return result;
    };
    window.dfV12037161RepositoryPatched=true;
    return true;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · RECEIPT + TIME SAVE`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    patchRepositorySync();
    applyVersion();
    [180,700,1600].forEach(wait=>setTimeout(()=>{
      patchRepositorySync();
      applyVersion();
    },wait));
    window.DF_DIAG?.info(
      'RECEIPT-TIME-SAVE-12037161',
      '접수번호·시간 확정 저장 보호 완료',
      '원격 미반영 새 기록 보존 / 명시 삭제만 제거 / 접수번호 변경 중복 방지'
    );
  }

  window.dfV1203721PruneExplicitDeletes=pruneExplicitDeletes;
  window.dfV1203721DedupeRecords=dedupeRecordsByStableId;
  window.dfV1203721PatchRepositorySync=patchRepositorySync;

  patchRepositorySync();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
