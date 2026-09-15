// ==========================================================
// DREAMFOREN v120.37.15.5
// CO 현장기록 기본값 + 먼지 여지대장/LAB 단일 저장 양방향 연동
// + 연도별 고정 35칸 페이지 추가 및 1 / N 페이지 이동
// + 전·후 무게 작성/수정/빈칸 삭제 양방향 반영
// ==========================================================
(function dfV12037155FilterLedgerValueCrud(){
  'use strict';

  const VERSION='v120.37.15.5';
  const SPARE_PREFIX='DF-SPARE-';
  const PAGE_CAPACITY=35;
  const byId=id=>document.getElementById(id);
  const value=value=>String(value??'').trim();
  const blank=value=>value===null||value===undefined||String(value).trim()==='';
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const dustEdits=new Map();

  function markDustEdit(field){
    const recordId=value(typeof analysisSelectedRecordId!=='undefined'?analysisSelectedRecordId:'');
    if(!recordId)return;
    if(!dustEdits.has(recordId))dustEdits.set(recordId,new Set());
    dustEdits.get(recordId).add(field);
  }

  function dustFieldEdited(record,field){
    return dustEdits.get(value(record?.id))?.has(field)===true;
  }

  function clearDustEdits(record){
    dustEdits.delete(value(record?.id));
  }

  function recordFilterNo(record){
    return value(record?.data?.fields?.filterNo||record?.fields?.filterNo);
  }

  function recordYear(record){
    return value(record?.data?.fields?.measureDate||record?.fields?.measureDate).match(/^(\d{4})/)?.[1]||'';
  }

  async function recordTeam(record){
    if(typeof dfSupabase==='undefined'||!dfSupabase)return null;
    const query=await dfSupabase.from('lab_teams').select('id,name').eq('active',true).order('sort_order');
    if(query.error)throw query.error;
    const teams=query.data||[];
    const name=value(record?.data?.selectedTeam||record?.data?.fields?.team||record?.fields?.team).replace(/팀$/,'');
    return teams.find(team=>value(team.name).replace(/팀$/,'')===name)||teams[0]||null;
  }

  async function findLedgerWeights(record){
    if(typeof dfSupabase==='undefined'||!dfSupabase)return {exact:null,spare:null,team:null,filterNo:recordFilterNo(record)};
    const receipt=value(typeof window.dfRepoReceipt==='function'?dfRepoReceipt(record?.data):record?.data?.fields?.receiptNo);
    const filterNo=recordFilterNo(record);
    const year=recordYear(record);
    const team=await recordTeam(record);
    let exact=null,spare=null;

    if(receipt){
      const exactQuery=await dfSupabase.from('filter_ledger_entries').select('*').eq('receipt_no',receipt).maybeSingle();
      if(exactQuery.error)throw exactQuery.error;
      exact=exactQuery.data||null;
    }

    if(filterNo){
      let spareBuilder=dfSupabase.from('filter_ledger_entries').select('*').eq('filter_no',filterNo).like('receipt_no',`${SPARE_PREFIX}%`);
      if(team?.id)spareBuilder=spareBuilder.eq('team_id',team.id);
      if(/^\d{4}$/.test(year))spareBuilder=spareBuilder.gte('measure_date',`${year}-01-01`).lte('measure_date',`${year}-12-31`);
      const spareQuery=await spareBuilder.order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(spareQuery.error)throw spareQuery.error;
      spare=spareQuery.data||null;
    }
    return {exact,spare,team,filterNo};
  }

  function mergedWeightValues(record,values,match){
    const next={...(values||{})};
    const ledger=match?.exact||match?.spare||null;
    // 사용자가 현재 LAB에서 직접 손댄 값(빈칸 삭제 포함)이 최우선이다.
    // 손대지 않은 값은 대장 최신값을 사용하며, 대장에 null로 저장된 값도
    // 의도적인 삭제이므로 시료채취 기본값으로 되살리지 않는다.
    if(!dustFieldEdited(record,'before')){
      if(ledger)next.dustWeightBefore=blank(ledger.before_weight)?'':String(ledger.before_weight);
      else if(blank(next.dustWeightBefore)&&!blank(record?.data?.fields?.filterWeightBefore))next.dustWeightBefore=String(record.data.fields.filterWeightBefore);
    }
    if(!dustFieldEdited(record,'after')&&ledger)next.dustWeightAfter=blank(ledger.after_weight)?'':String(ledger.after_weight);
    return next;
  }

  function cacheAndShowWeights(record,values){
    const recordId=String(record?.id||'');
    if(!recordId)return;
    const cache=typeof analysisInputCache==='function'?analysisInputCache():{};
    cache[recordId]={...(cache[recordId]||{}),...values,_localUpdatedAt:new Date().toISOString()};
    const cacheKey=typeof ANALYSIS_INPUT_CACHE_KEY!=='undefined'?ANALYSIS_INPUT_CACHE_KEY:'dreampoen_lab_raw_input_v64';
    localStorage.setItem(cacheKey,JSON.stringify(cache));
    if(String(typeof analysisSelectedRecordId!=='undefined'?analysisSelectedRecordId:'')!==recordId)return;
    const before=byId('dustWeightBefore'),after=byId('dustWeightAfter');
    if(before&&Object.prototype.hasOwnProperty.call(values,'dustWeightBefore'))before.value=blank(values.dustWeightBefore)?'':String(values.dustWeightBefore);
    if(after&&Object.prototype.hasOwnProperty.call(values,'dustWeightAfter'))after.value=blank(values.dustWeightAfter)?'':String(values.dustWeightAfter);
    if(typeof window.calcDust==='function')calcDust();
  }

  window.dfFilterPrepareLabSync=async function prepareLabSync(record,values){
    if(!['dust','combo'].includes(record?.data?.recordType))return {values};
    const match=await findLedgerWeights(record);
    const merged=mergedWeightValues(record,values,match);
    cacheAndShowWeights(record,merged);
    return {...match,values:merged};
  };

  window.dfFilterCommitLabSync=async function commitLabSync(record,values,prepared){
    if(typeof dfSupabase==='undefined'||!dfSupabase||typeof dfCloudUser==='undefined'||!dfCloudUser||!['dust','combo'].includes(record?.data?.recordType))return false;
    const before=value(values?.dustWeightBefore);
    const after=value(values?.dustWeightAfter);
    if(before!==''&&!Number.isFinite(Number(before)))throw Error('채취 전 여지무게를 숫자로 입력해주세요.');
    if(after!==''&&!Number.isFinite(Number(after)))throw Error('채취 후 여지무게를 숫자로 입력해주세요.');
    const match=prepared?.team?prepared:await findLedgerWeights(record);
    const receipt=value(typeof window.dfRepoReceipt==='function'?dfRepoReceipt(record.data):record?.data?.fields?.receiptNo);
    if(!receipt)return false;
    const now=new Date().toISOString();
    const payload={
      receipt_no:receipt,
      measure_date:(typeof window.dfRepoDate==='function'?dfRepoDate(record.data):record?.data?.fields?.measureDate)||null,
      company_name:typeof window.dfRepoCompany==='function'?dfRepoCompany(record.data):value(record?.data?.fields?.company),
      facility_name:typeof window.dfRepoFacility==='function'?dfRepoFacility(record.data):value(record?.data?.fields?.facility),
      team_id:match?.team?.id||null,
      filter_no:recordFilterNo(record),
      before_weight:before===''?null:Number(before),
      after_weight:after===''?null:Number(after),
      updated_by:dfCloudUser.id,
      updated_at:now
    };
    const result=await dfSupabase.from('filter_ledger_entries').upsert(payload,{onConflict:'receipt_no'});
    if(result.error)throw Error(`LAB 자료는 저장됐지만 여지대장 반영에 실패했습니다: ${result.error.message}`);
    const spareReceipt=value(match?.spare?.receipt_no);
    if(spareReceipt&&spareReceipt!==receipt){
      const removed=await dfSupabase.from('filter_ledger_entries').delete().eq('receipt_no',spareReceipt);
      if(removed.error)window.DF_DIAG?.warn('FILTER-SPARE-MIGRATE','LAB에 연결된 여분 여지 행 정리 실패',removed.error.message);
    }
    clearDustEdits(record);
    window.DF_DIAG?.info('DUST-TWO-WAY','LAB 저장 1회로 먼지 여지대장 반영 완료',`${receipt} / ${payload.filter_no||'여지번호 없음'}`);
    return true;
  };

  window.dfFilterHydrateLabWeights=async function hydrateLabWeights(record){
    if(typeof dfSupabase==='undefined'||!dfSupabase||!['dust','combo'].includes(record?.data?.recordType))return;
    const recordId=String(record?.id||'');
    try{
      const match=await findLedgerWeights(record);
      if(String(typeof analysisSelectedRecordId!=='undefined'?analysisSelectedRecordId:'')!==recordId)return;
      const current=typeof analysisInputCache==='function'?(analysisInputCache()[recordId]||{}):{};
      const merged=mergedWeightValues(record,current,match);
      if(merged.dustWeightBefore!==current.dustWeightBefore||merged.dustWeightAfter!==current.dustWeightAfter){
        cacheAndShowWeights(record,merged);
        const status=byId('analysisSaveStatus');
        if(status){status.textContent='여지대장 무게 불러옴';status.classList.add('saved');}
      }
    }catch(error){
      window.DF_DIAG?.warn('DUST-TWO-WAY','여지대장 → LAB 무게 불러오기 실패',error?.message||error);
    }
  };

  window.dfFilterAddSparePage=async function addSparePage(){
    if(typeof dfSupabase==='undefined'||!dfSupabase||typeof dfCloudUser==='undefined'||!dfCloudUser)return alert('온라인 DB에 로그인한 뒤 페이지를 추가해주세요.');
    const teamSelect=byId('dfFilterTeam');
    const yearSelect=byId('dfFilterYear');
    const teamId=value(teamSelect?.value),year=value(yearSelect?.value);
    if(!teamId||teamId==='all')return alert('여분 페이지를 추가할 팀을 먼저 선택해주세요.');
    if(!/^\d{4}$/.test(year))return alert('여분 페이지를 추가할 관리 연도를 선택해주세요.');

    const search=byId('dfFilterSearch'),status=byId('dfFilterStatus');
    if(search?.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));}
    if(status&&status.value!=='all'){status.value='all';status.dispatchEvent(new Event('change',{bubbles:true}));}
    await delay(180);

    const state=typeof window.dfFilterGetAnnualState==='function'?window.dfFilterGetAnnualState():{total:0,pageCapacity:PAGE_CAPACITY};
    const capacity=Number(state.pageCapacity)||PAGE_CAPACITY;
    const total=Number(state.total)||0;
    const targetTotal=total===0?capacity:(Math.ceil(total/capacity)+1)*capacity;
    const addCount=targetTotal-total;
    const pageNumber=total===0?1:Math.ceil(total/capacity)+1;
    const today=new Date();
    const monthDay=year===String(today.getFullYear())?`-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`:'-01-01';
    const measureDate=`${year}${monthDay}`;
    const token=`${Date.now()}-${crypto.randomUUID?.().slice(0,8)||Math.random().toString(36).slice(2,10)}`;
    const rows=Array.from({length:addCount},(_,index)=>({
      receipt_no:`${SPARE_PREFIX}${year}-${token}-${String(index+1).padStart(2,'0')}`,
      measure_date:measureDate,
      company_name:'',
      facility_name:'',
      team_id:teamId,
      filter_no:'',
      before_weight:null,
      after_weight:null,
      updated_by:dfCloudUser.id,
      updated_at:new Date().toISOString()
    }));
    const button=byId('dfFilterPageAdd');
    if(button){button.disabled=true;button.textContent='페이지 추가 중';}
    try{
      const result=await dfSupabase.from('filter_ledger_entries').upsert(rows,{onConflict:'receipt_no'});
      if(result.error)throw result.error;
      if(typeof window.dfFilterReload==='function')await window.dfFilterReload();
      await delay(120);
      window.dfFilterGoLastPage?.();
      alert(`여분 페이지 ${pageNumber}을 추가했습니다.\n표의 행은 늘어나지 않고 페이지 표시가 1 / N 방식으로 관리됩니다.`);
    }catch(error){
      alert(`여분 페이지 추가 실패\n${error?.message||error}`);
    }finally{
      if(button){button.disabled=false;button.textContent='+ 여분 페이지';}
    }
  };

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · FILTER VALUE SAVE/EDIT/CLEAR FIX`;
    if(footer)footer.textContent=VERSION;
    const apply=byId('dfFilterLabApply');
    if(apply)apply.textContent='변경 저장·LAB 반영';
  }

  function init(){
    const before=byId('dustWeightBefore'),after=byId('dustWeightAfter');
    if(before&&!before.dataset.dfValueCrudBound){before.dataset.dfValueCrudBound='1';before.addEventListener('input',()=>markDustEdit('before'));}
    if(after&&!after.dataset.dfValueCrudBound){after.dataset.dfValueCrudBound='1';after.addEventListener('input',()=>markDustEdit('after'));}
    applyVersion();
    [120,500,1200].forEach(wait=>setTimeout(applyVersion,wait));
    window.DF_DIAG?.info('FILTER-LEDGER-12037155','여지/LAB 작성·수정·빈칸 삭제 양방향 저장 준비 완료','기존 자동연동·연도별 페이지·인쇄 양식 유지');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
