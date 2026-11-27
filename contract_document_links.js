/* Saved contract documents enter through the existing contract toolbar and exact-ID editor. */
(function(root){
  'use strict';
  if(root.DF_CONTRACT_DOCUMENT_LINKS)return;
  const doc=root.document,clean=value=>String(value??'').trim(),owned=new Set();
  let detail=null,observer=null,originalEditor=null,editorHook=null,opening=false,destroyed=false;
  function canView(){
    try{
      if(typeof dfCloudUser==='undefined'||!dfCloudUser?.id)return false;
      const admin=typeof dfCloudProfile!=='undefined'&&dfCloudProfile?.role==='admin';
      if(root.DFMenuPermissions)return root.DFMenuPermissions.can('contract','view',admin)===true;
      return typeof dfMenuCan==='function'?dfMenuCan('contract','view',admin)===true:admin;
    }catch(_){return false;}
  }
  function make(scope,label){
    const button=doc.createElement('button');button.type='button';button.className='company-btn secondary';
    button.dataset.contractDocumentsSaved=scope;button.textContent=label;owned.add(button);return button;
  }
  function discard(button){owned.delete(button);button.remove();}
  function disconnect(){observer?.disconnect();observer=null;}
  function forgetDetail(){disconnect();for(const b of [...owned])if(b.dataset.contractDocumentsSaved==='contract')discard(b);detail=null;}
  function syncDetail(){
    if(!detail)return;
    const modal=detail.body.closest('#contractModal');
    if(!detail.body.isConnected||!modal||modal.hidden||modal.style.display==='none'){forgetDetail();return;}
    const actions=detail.body.querySelector('.contract-editor-actions .right');
    for(const button of [...owned])if(button.dataset.contractDocumentsSaved==='contract'&&(!button.isConnected||!actions?.contains(button)))discard(button);
    if(!actions)return;
    let button=[...owned].find(b=>b.dataset.contractDocumentsSaved==='contract'&&actions.contains(b));
    if(!button){button=make('contract','저장된 계약문서');actions.prepend(button);}
    button.hidden=!canView();button.disabled=opening||!canView();
  }
  function mountDetail(row){
    forgetDetail();
    const id=clean(row?.id),body=doc.getElementById('contractModalBody');
    // Unsaved and renewal drafts have no persisted contract ID. Never infer one from names or numbers.
    if(!id||!body)return;
    detail={id,body};syncDetail();
    if(!detail||!root.MutationObserver)return;
    observer=new root.MutationObserver(records=>{
      if(records.some(record=>record.type==='childList'))syncDetail();
      else if(records.some(record=>record.type==='attributes'&&record.target.id==='contractModal'))syncDetail();
    });
    observer.observe(body,{childList:true,subtree:true});
    observer.observe(body.closest('#contractModal'),{attributes:true,attributeFilter:['hidden','style']});
  }
  function refresh(){
    if(destroyed)return;
    const toolbar=doc.querySelector('#dfViewContract .contract-page .contract-toolbar');
    for(const button of [...owned])if(button.dataset.contractDocumentsSaved==='all'&&(!button.isConnected||button.parentElement!==toolbar))discard(button);
    if(toolbar){
      let button=[...owned].find(b=>b.dataset.contractDocumentsSaved==='all'&&b.parentElement===toolbar);
      if(!button){button=make('all','저장된 계약문서');const anchor=toolbar.querySelector('#contractExportCsv');if(anchor)anchor.before(button);else toolbar.append(button);}
      button.hidden=!canView();button.disabled=opening||!canView();
    }
    syncDetail();
    if(!editorHook&&typeof root.dfV70OpenContractEditor==='function'){
      originalEditor=root.dfV70OpenContractEditor;
      editorHook=function(row,...args){const result=originalEditor.apply(this,[row,...args]);if(!destroyed&&canView())mountDetail(row);return result;};
      root.dfV70OpenContractEditor=editorHook;
    }
  }
  async function click(event){
    const button=event.target.closest?.('button[data-contract-documents-saved]');
    if(!button||!owned.has(button))return;
    event.preventDefault();event.stopPropagation();
    if(destroyed||opening||button.hidden||button.disabled||!canView())return;
    const options={year:'all'};
    if(button.dataset.contractDocumentsSaved==='contract'){
      if(!detail||!detail.body.contains(button)||!detail.id)return;
      options.contractId=detail.id;
    }
    if(typeof root.DF_CONTRACT_WRITER?.openSaved!=='function')return;
    opening=true;refresh();
    try{await root.DF_CONTRACT_WRITER.openSaved(options);}
    catch(error){if(canView())root.alert?.('계약문서를 불러오지 못했습니다.\n'+(error?.message||error));}
    finally{opening=false;refresh();}
  }
  function destroy(){
    if(destroyed)return;destroyed=true;disconnect();
    doc.removeEventListener('click',click,true);doc.removeEventListener('df:menu-permissions-changed',refresh);
    doc.removeEventListener('DOMContentLoaded',refresh);
    if(root.dfV70OpenContractEditor===editorHook)root.dfV70OpenContractEditor=originalEditor;
    for(const button of [...owned])discard(button);detail=null;
  }
  doc.addEventListener('click',click,true);doc.addEventListener('df:menu-permissions-changed',refresh);
  root.DF_CONTRACT_DOCUMENT_LINKS=Object.freeze({version:'446',refresh,destroy});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})(window);
