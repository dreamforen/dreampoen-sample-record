/* Beta 3.18 · 항목별 계산/결과 자리수와 공통 기본값 */
(function(){
 'use strict';
 const doc=document,N=window.DFAnalysisNumbers,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let common={},owner=null,pending=null,context=null,serial=0;
 const allowed=()=>typeof dfMenuCan==='function'?dfMenuCan('analysis','update')||dfMenuCan('analysis','create'):true;
 const sharedAllowed=()=>typeof dfMenuCan==='function'?dfMenuCan('analysis','update'):true;
 const id=()=>String(typeof analysisSelectedRecordId!=='undefined'?analysisSelectedRecordId:'');
 const cache=()=>typeof analysisInputCache==='function'?analysisInputCache():{};
 const keyOf=card=>card.dataset.labKey||(card.id==='analysisDustSheet'?'먼지':'');
 const fallback=key=>['먼지','질소산화물','황산화물','일산화탄소'].includes(key)?1:3;
 const options=(selected,isCalc)=>Array.from({length:isCalc?12:9},(_,i)=>{const value=isCalc?i-1:i;return `<option value="${value}" ${Number(selected)===value?'selected':''}>${value===-1?'반올림 없이 계산':value+'자리'}</option>`;}).join('');
 const saved=(values,key)=>key==='먼지'?values?.dust_precision:values?.lab?.[key];
 function setControls(card,value,key){
  const p=N.settings(value,fallback(key));card.querySelector('[data-lab-field="calc_decimals"]').value=String(p.calc);card.querySelector('[data-lab-field="result_decimals"]').value=String(p.result);
 }
 function attach(card,providedKey){
  const key=providedKey||keyOf(card);if(!key)return;
  let box=card.querySelector('.df-analysis-precision');
  if(!box){box=doc.createElement('div');box.className='df-analysis-precision no-print';box.innerHTML=`<label>계산 반올림<select data-lab-field="calc_decimals">${options(-1,true)}</select></label><label>결과 표기<select data-lab-field="result_decimals">${options(fallback(key),false)}</select></label><small>계산: 각 연산 후 반올림 · 표기: 최종결과 자리수 · 분석자료 저장 시 함께 보관</small>`;
   (card.querySelector('.analysis-card-title')||card.firstElementChild)?.after(box);
   box.addEventListener('change',()=>{box.dataset.precisionDirty='1';if(!allowed()){setControls(card,saved(cache()[id()],key)||{},key);return alert('분석 작성·수정 권한이 없습니다.');}
    if(key==='먼지')calcDust();else{const rec=analysisSavedRecords().find(r=>String(r.id)===id());if(rec)dfV100CalcCard(card,rec);}saveAnalysisInputCache();
    const status=doc.getElementById('analysisSaveStatus');if(status){status.textContent='소수점 설정 변경 · 분석자료 저장 필요';status.classList.remove('saved');}
   });
  }
  if(box.dataset.recordId!==id()){
   box.dataset.recordId=id();box.dataset.precisionDirty='0';
   const original=context?.id===id()?saved(context.original,key):saved(cache()[id()],key);
   setControls(card,original?.calc_decimals!==undefined||original?.result_decimals!==undefined?original:(common[key]||{}),key);
  }
  box.querySelectorAll('select').forEach(el=>el.disabled=!allowed());
 }
 async function loadCommon(force=false){
  const user=typeof dfCloudUser!=='undefined'?dfCloudUser?.id:null,client=typeof dfSupabase!=='undefined'?dfSupabase:null;
  if(owner!==user){owner=user;common={};pending=null;}
  if(!client||!user)return common;
  if(pending&&!force)return pending;
  const captured=user;
  pending=(async()=>{const response=await client.from('analysis_precision_settings').select('*');if(response.error)throw response.error;
   if(owner===captured)common=Object.fromEntries((response.data||[]).map(row=>[row.analyte_key,row]));return common;})();
  try{return await pending;}catch(error){pending=null;window.DF_DIAG?.warn('ANALYSIS-PRECISION','공통 소수점 조회 실패',error.message);return common;}
 }
 function cards(){return [...doc.querySelectorAll('#analysisPrintArea [data-lab-card],#analysisDustSheet')].filter(card=>card.style.display!=='none'&&keyOf(card));}
 async function openCommon(){
  await loadCommon(true);
  let modal=doc.getElementById('dfPrecisionModal');if(!modal){modal=doc.createElement('div');modal.id='dfPrecisionModal';modal.className='company-modal-backdrop';doc.body.append(modal);}
  const keys=[...new Set([...Object.keys(common),...cards().map(keyOf)])];
  if(!keys.length)return alert('먼저 분석할 시료를 선택해주세요.');
  modal.hidden=false;modal.style.display='flex';
  modal.innerHTML=`<div class="company-modal"><div class="company-modal-head"><h2>분석 소수점 공통 설정</h2><button data-close class="company-modal-close">×</button></div><p>새로 여는 분석의 기본값입니다. 이미 저장한 분석의 자리수는 유지됩니다. 현재 분석은 항목별 설정에서 바꾸고 분석자료를 저장해주세요.</p><table class="df-precision-table"><thead><tr><th>분석항목</th><th>계산 반올림</th><th>결과 표기</th></tr></thead><tbody>${keys.map(key=>{const p=N.settings(common[key]||{},fallback(key));return `<tr data-precision-key="${esc(key)}"><th>${esc(key)}</th><td><select data-calc>${options(p.calc,true)}</select></td><td><select data-result>${options(p.result,false)}</select></td></tr>`;}).join('')}</tbody></table><p>계산 자리수를 지정하면 각 연산 후 해당 자리수로 반올림합니다. '반올림 없이 계산'은 기존 계산 정밀도를 유지합니다.</p><div class="df-doc-editor-actions"><button data-close class="company-btn secondary">닫기</button><button data-save class="company-btn primary" ${sharedAllowed()?'':'disabled'}>공통 설정 저장</button></div></div>`;
  const close=()=>{modal.hidden=true;modal.style.display='none';};modal.querySelectorAll('[data-close]').forEach(el=>el.onclick=close);
  modal.querySelector('[data-save]').onclick=async()=>{
   if(!sharedAllowed())return alert('분석 수정 권한이 필요합니다.');
   if(typeof dfSupabase==='undefined'||!dfSupabase||!dfCloudUser)return alert('로그인 후 공통 설정을 저장해주세요.');
   const button=modal.querySelector('[data-save]');button.disabled=true;
   try{const values=[...modal.querySelectorAll('[data-precision-key]')].map(tr=>({analyte_key:tr.dataset.precisionKey,calc_decimals:Number(tr.querySelector('[data-calc]').value),result_decimals:Number(tr.querySelector('[data-result]').value),updated_by:dfCloudUser.id,updated_at:new Date().toISOString()}));
    const response=await dfSupabase.from('analysis_precision_settings').upsert(values,{onConflict:'analyte_key'});if(response.error)throw response.error;
    common=Object.fromEntries(values.map(row=>[row.analyte_key,row]));pending=null;close();alert('소수점 공통 설정을 저장했습니다. 이후 새 분석에 기본값으로 적용합니다.');
   }catch(error){alert('공통 설정 저장 실패\n'+error.message);}finally{button.disabled=false;}
  };
 }
 function install(){
  const base=window.loadAnalysisRecord;if(!base)return;
  window.loadAnalysisRecord=function(record){
   const token=++serial;context=record?{id:String(record.id),original:JSON.parse(JSON.stringify(cache()[record.id]||{}))}:null;
   window.dfAnalysisLoading=true;
   try{return base.apply(this,arguments);}finally{
    window.dfAnalysisLoading=false;if(record)saveAnalysisInputCache();
    loadCommon().then(()=>{if(token!==serial||!record||id()!==String(record.id))return;
     const c=context;cards().forEach(card=>{const key=keyOf(card),original=saved(c.original,key),box=card.querySelector('.df-analysis-precision');
      if(box?.dataset.precisionDirty==='1'||original?.calc_decimals!==undefined||original?.result_decimals!==undefined)return;
      if(common[key])setControls(card,common[key],key);
      if(key==='먼지')calcDust();else dfV100CalcCard(card,record);
     });
    });
   }
  };
 }
 function boot(){
  const style=doc.createElement('style');style.textContent='.df-analysis-precision{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:9px 14px;background:#f3f6f8;border-bottom:1px solid #d9e1e8;font-size:12px}.df-analysis-precision label{display:flex;align-items:center;gap:7px}.df-analysis-precision select,.df-precision-table select{min-height:30px;border:1px solid #cad4de;border-radius:5px;background:#fff;padding:3px 7px}.df-analysis-precision small{color:#607080}.df-precision-table{width:100%;border-collapse:collapse}.df-precision-table th,.df-precision-table td{padding:10px;border-bottom:1px solid #dde4ea;text-align:left}#dfPrecisionModal .company-modal{max-width:780px;padding:20px;max-height:90vh;overflow:auto}#dfPrecisionModal p{font-size:13px;line-height:1.6;color:#516171}@media print{.df-analysis-precision{display:none!important}}';doc.head.append(style);
  const save=doc.getElementById('analysisSaveBtn');if(save&&!doc.getElementById('dfPrecisionCommon')){const button=doc.createElement('button');button.id='dfPrecisionCommon';button.className='company-btn secondary no-print';button.textContent='소수점 공통 설정';button.onclick=openCommon;save.after(button);}
  install();
 }
 window.DF_ANALYSIS_PRECISION={attach,loadCommon,openCommon};
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
