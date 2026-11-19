/* Contract editing controls. Existing IDs, period writers and permissions remain authoritative. */
(function(global){
  'use strict';
  const clean=v=>String(v??'').trim(),esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let active=null;
  const site=r=>{
    if(r&&('target_name'in r||'requester_name'in r)){
      const p=clean(r.target_name)?'target_':'requester_';
      return {name:clean(r[p+'name']),address:clean(r[p+'address']),biz:clean(r[p+'biz_no'])};
    }
    return {name:clean(r?.name??r?.Name),address:clean(r?.address??r?.Address),biz:clean(r?.biz_no??r?.BizNo)};
  };
  function changes(before,after,company){
    const a=site(before),b=site(after),c=site(company),out={};
    for(const key of ['name','address','biz'])if(clean(a[key])!==clean(b[key])&&clean(b[key])!==clean(c[key]))out[key==='biz'?'biz_no':key]=clean(b[key]);
    return out;
  }
  function review({before,after,company,patch}){
    if(!active||!active.body.isConnected)return Promise.resolve(false);
    if(!Object.keys(patch).length)return Promise.resolve(true);
    const doc=active.body.ownerDocument,dialog=doc.createElement('dialog');dialog.className='df-contract-change-dialog';
    const labels={name:'사업장명',address:'사업장 주소',biz_no:'사업자번호'},b=site(company);
    dialog.innerHTML='<header><h2>사업장 변경 확인</h2><button type="button" data-cancel aria-label="변경 확인 닫기">×</button></header>'+
      '<div class="df-contract-change-content"><table><thead><tr><th>항목</th><th>현재 업체정보</th><th>변경 후</th></tr></thead><tbody>'+
      Object.entries(patch).map(([key,value])=>'<tr><th>'+labels[key]+'</th><td>'+esc(b[key==='biz_no'?'biz':key])+'</td><td>'+esc(value)+'</td></tr>').join('')+
      '</tbody></table><p>연결된 같은 사업장의 기준정보를 변경합니다. 시설·일정·시료 연결 ID는 유지됩니다.</p>'+
      (patch.biz_no?'<label class="df-contract-same-entity"><input type="checkbox" data-same-entity> 다른 업체의 신규 계약이 아닌, 동일 사업장의 사업자번호 정정임을 확인했습니다.</label>':'')+
      '<p class="df-contract-small">이미 확정한 문서와 세금계산서·입금 원장은 유지됩니다.</p></div>'+
      '<footer><button type="button" data-cancel>돌아가기</button><button type="button" class="primary" data-apply'+(patch.biz_no?' disabled':'')+'>계약·업체정보 함께 저장</button></footer>';
    active.body.append(dialog);
    return new Promise(resolve=>{
      const state=active;
      let done=false;const finish=yes=>{if(done)return;done=true;state.pendingReview=null;dialog.close();dialog.remove();resolve(yes);};
      state.pendingReview=()=>finish(false);
      dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>finish(false));
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      const box=dialog.querySelector('[data-same-entity]'),apply=dialog.querySelector('[data-apply]');
      if(box)box.onchange=()=>apply.disabled=!box.checked;
      apply.onclick=()=>finish(!box||box.checked);dialog.showModal();
    });
  }
  function busy(){
    const body=active?.body;
    return !!body&&[...body.querySelectorAll('button')].some(b=>b.disabled&&/저장\s*중/.test(b.textContent));
  }
  function mount(existing,body){
    active?.dispose();const state={existing,body,dialog:null};active=state;
    const copy=body.querySelector('[data-contract-copy]'),save=body.querySelector('#contractEditSave');
    if(copy){
      copy.disabled=!!save?.disabled;
      copy.onclick=()=>{
        if(copy.disabled)return;
        const filled=['name','address','biz_no'].some(k=>clean(body.querySelector('#ct_target_'+k)?.value));
        const different=['name','address','biz_no'].some(k=>clean(body.querySelector('#ct_target_'+k)?.value)!==clean(body.querySelector('#ct_requester_'+k)?.value));
        if(filled&&different&&!global.confirm('측정대상 사업장명·주소·사업자번호를 위 의뢰기관 정보와 같게 입력할까요?'))return;
        for(const key of ['name','address','biz_no']){
          const target=body.querySelector('#ct_target_'+key),source=body.querySelector('#ct_requester_'+key);
          target.value=source.value;target.dispatchEvent(new Event('input',{bubbles:true}));
        }
      };
    }
    const custom=body.querySelector('[data-contract-custom-section]');
    const toolbar=body.ownerDocument.createElement('div');toolbar.className='df-contract-settings-bar';
    toolbar.innerHTML='<button type="button" class="company-btn secondary" data-contract-settings>추가항목 · 시설별 측정주기</button>';
    body.querySelector('.contract-editor-actions')?.before(toolbar);
    const dialog=body.ownerDocument.createElement('dialog');dialog.className='df-contract-settings-dialog';dialog.id='dfContractSettings';
    dialog.innerHTML='<header><h2>추가항목 · 시설별 측정주기</h2><button type="button" data-settings-close aria-label="설정 닫기">×</button></header><div class="df-contract-settings-content"><div data-custom-host></div><div data-cycle-host></div></div><footer><small>추가항목은 계약 저장 시 반영됩니다.</small><button type="button" data-settings-close>닫기</button></footer>';
    state.dialog=dialog;if(custom)dialog.querySelector('[data-custom-host]').append(custom);body.append(dialog);
    toolbar.querySelector('button').onclick=()=>{dialog.showModal();dialog.querySelector('h2').focus?.();};
    const close=()=>{if(busy())return;dialog.close();};
    dialog.querySelectorAll('[data-settings-close]').forEach(b=>b.onclick=close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    state.dispose=()=>{
      state.observer?.disconnect();state.pendingReview?.();
      if(dialog.open)dialog.close();dialog.remove();if(active===state)active=null;
    };
    const parent=body.closest('#contractModal');
    if(parent&&global.MutationObserver){
      state.observer=new MutationObserver(()=>{if(!body.isConnected||parent.hidden||parent.style.display==='none')state.dispose();});
      state.observer.observe(parent,{attributes:true,attributeFilter:['hidden','style'],childList:true});
    }
  }
  function attachCycles(section){
    const host=active?.dialog?.querySelector('[data-cycle-host]');
    if(host&&active.body.isConnected)host.replaceChildren(section);
  }
  global.DFContractEditor=Object.freeze({mount,attachCycles,review,changes,busy,dispose:()=>active?.dispose()});
})(window);
