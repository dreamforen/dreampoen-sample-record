// ==========================================================
// DREAMFOREN v120.37.15.6
// LAB CO 기본값 + 먼지 여지대장/LAB 단일 저장 양방향 연동
// + 연도별 고정 35칸 페이지 추가 및 1 / N 페이지 이동
// + 전·후 무게 작성/수정/빈칸 삭제 양방향 반영
// + 시료채취기록지 가스 조건의 CO 입력란 제거
// ==========================================================
(function dfV12037155FilterLedgerValueCrud(){
  'use strict';

  const VERSION='v120.37.15.6';
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
    const name=value(record?.data?.selectedTeam||record?.data?.fields?.team||record?.fields?.team);
    return teams.find(team=>value(team.id)===name||window.DFFilterLedger.teamKey(team.name)===window.DFFilterLedger.teamKey(name))||null;
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
      // 같은 접수번호에 남은 다른 기록/업체의 여지값은 LAB으로 가져오지 않는다.
      if(exact&&typeof window.dfV1203726LedgerMatchesRecord==='function'&&!window.dfV1203726LedgerMatchesRecord(exact,record))exact=null;
    }

    if(filterNo&&team?.id&&/^\d{4}$/.test(year)){
      const spareQuery=await dfSupabase.rpc('df_filter_find_spares',{p_team:team.id,p_year:Number(year),p_no:filterNo});
      if(spareQuery.error)throw spareQuery.error;
      const match=window.DFFilterLedger.match([...(exact?[exact]:[]),...(spareQuery.data||[])],record,team.id,receipt);
      return {...match,team,filterNo};
    }
    return {exact:null,spare:null,team,filterNo,layout:{}};
  }

  function mergedWeightValues(record,values,match){
    const next={...(values||{})};
    const ledger=match?.exact||match?.spare||null;
    // 사용자가 현재 LAB에서 직접 손댄 값(빈칸 삭제 포함)이 최우선이다.
    // 손대지 않은 값은 대장 최신값을 사용하며, 대장에 null로 저장된 값도
    // 의도적인 삭제이므로 시료채취 기본값으로 되살리지 않는다.
    if(!dustFieldEdited(record,'before')){
      if(ledger&&!window.DFFilterLedger.unusedAuto(ledger))next.dustWeightBefore=blank(ledger.before_weight)?'':String(ledger.before_weight);
      else if(blank(next.dustWeightBefore)&&!blank(record?.data?.fields?.filterWeightBefore))next.dustWeightBefore=String(record.data.fields.filterWeightBefore);
    }
    if(!dustFieldEdited(record,'after')&&ledger&&!window.DFFilterLedger.unusedAuto(ledger))next.dustWeightAfter=blank(ledger.after_weight)?'':String(ledger.after_weight);
    return next;
  }

  function cacheAndShowWeights(record,values){
    const recordId=String(record?.id||'');
    if(!recordId)return;
    const cache=typeof analysisInputCache==='function'?analysisInputCache():{};
    cache[recordId]={...(cache[recordId]||{}),...values,_localUpdatedAt:new Date().toISOString()};
    const cacheKey=typeof ANALYSIS_INPUT_CACHE_KEY!=='undefined'?ANALYSIS_INPUT_CACHE_KEY:'dreampoen_lab_raw_input_v64';
    dfLocalStorage.setItem(cacheKey,JSON.stringify(cache));
    if(String(typeof analysisSelectedRecordId!=='undefined'?analysisSelectedRecordId:'')!==recordId)return;
    const before=byId('dustWeightBefore'),after=byId('dustWeightAfter');
    if(before&&Object.prototype.hasOwnProperty.call(values,'dustWeightBefore'))before.value=blank(values.dustWeightBefore)?'':String(values.dustWeightBefore);
    if(after&&Object.prototype.hasOwnProperty.call(values,'dustWeightAfter'))after.value=blank(values.dustWeightAfter)?'':String(values.dustWeightAfter);
    if(typeof window.calcDust==='function')calcDust();
  }

  window.dfFilterPrepareLabSync=async function prepareLabSync(record,values){
    const client=typeof dfSupabase!=='undefined'?dfSupabase:null,owner=typeof dfCloudUser!=='undefined'?dfCloudUser?.id:null;
    if(!window.DFFilterLedger.eligible(record))return {values};
    const match=await findLedgerWeights(record);
    if(client!==dfSupabase||owner!==dfCloudUser?.id)throw Error('로그인이 변경되어 여지대장 조회를 중단했습니다.');
    const merged=mergedWeightValues(record,values,match);
    cacheAndShowWeights(record,merged);
    return {...match,values:merged};
  };

  window.dfFilterCommitLabSync=async function commitLabSync(record,values,prepared){
    if(typeof dfSupabase==='undefined'||!dfSupabase||typeof dfCloudUser==='undefined'||!dfCloudUser||!window.DFFilterLedger.eligible(record))return false;
    const client=dfSupabase,owner=dfCloudUser.id;
    const before=value(values?.dustWeightBefore);
    const after=value(values?.dustWeightAfter);
    if(before!==''&&!Number.isFinite(Number(before)))throw Error('채취 전 여지무게를 숫자로 입력해주세요.');
    if(after!==''&&!Number.isFinite(Number(after)))throw Error('채취 후 여지무게를 숫자로 입력해주세요.');
    const match=prepared?.team?prepared:await findLedgerWeights(record);
    if(client!==dfSupabase||owner!==dfCloudUser?.id)throw Error('로그인이 변경되어 여지대장 저장을 중단했습니다.');
    if(!match?.team?.id)throw Error('시료채취기록지의 팀을 확인해주세요. 여지대장에 지정할 팀이 없습니다.');
    const receipt=value(typeof window.dfRepoReceipt==='function'?dfRepoReceipt(record.data):record?.data?.fields?.receiptNo);
    if(!receipt)return false;
    const now=new Date().toISOString();
    const payload={
      ...(match.layout||{}),
      receipt_no:receipt,
      measure_date:(typeof window.dfRepoDate==='function'?dfRepoDate(record.data):record?.data?.fields?.measureDate)||null,
      company_name:typeof window.dfRepoCompany==='function'?dfRepoCompany(record.data):value(record?.data?.fields?.company),
      facility_name:typeof window.dfRepoFacility==='function'?dfRepoFacility(record.data):value(record?.data?.fields?.facility),
      team_id:match?.team?.id||null,
      filter_no:match?.exact?.filter_no??match?.spare?.filter_no??window.DFFilterLedger.canonical(recordFilterNo(record)),
      source_filter_no:recordFilterNo(record),
      before_weight:before===''?null:Number(before),
      after_weight:after===''?null:Number(after),
      memo:record?.id?`RID:${record.id}`:'',
      updated_by:owner,
      updated_at:now
    };
    const result=await client.rpc('df_filter_save_entry',{p_entry:payload,p_previous_receipt:value(match?.exact?.receipt_no||match?.spare?.receipt_no)||null});
    if(result.error)throw Error(`LAB 자료는 저장됐지만 여지대장 반영에 실패했습니다: ${result.error.message}`);
    if(client!==dfSupabase||owner!==dfCloudUser?.id)throw Error('로그인이 변경되어 여지대장 저장 확인을 중단했습니다.');
    if(client===dfSupabase&&owner===dfCloudUser?.id)clearDustEdits(record);
    window.DF_DIAG?.info('DUST-TWO-WAY','LAB 저장 1회로 먼지 여지대장 반영 완료',`${receipt} / ${payload.filter_no||'여지번호 없음'}`);
    return true;
  };

  window.dfFilterHydrateLabWeights=async function hydrateLabWeights(record){
    if(typeof dfSupabase==='undefined'||!dfSupabase||!window.DFFilterLedger.eligible(record))return;
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
    if(window.dfFilterHasDirtyRows?.())return alert('변경한 여지 값을 먼저 저장한 뒤 추가해주세요.');
    if(typeof dfMenuRequire==='function'&&!dfMenuRequire('filter-ledger','create',true))return;
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

    // 35칸을 가진 새 사전 입력 페이지를 맨 앞에 추가한다.
    const addCount=PAGE_CAPACITY;
    const today=new Date();
    const monthDay=year===String(today.getFullYear())?`-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`:'-01-01';
    const measureDate=`${year}${monthDay}`;
    const token=`${Date.now()}-${crypto.randomUUID?.().slice(0,8)||Math.random().toString(36).slice(2,10)}`;
    const rows=Array.from({length:addCount},(_,index)=>({
      ledger_page:`preweight-${year}-${token}`,ledger_slot:index,ledger_page_at:new Date().toISOString(),
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
      window.dfFilterGoFirstPage?.();
      alert(`새 사전 여지 페이지를 맨 앞에 추가했습니다.\n기존 페이지의 여지번호와 전·후 무게 칸은 유지됩니다.`);
    }catch(error){
      alert(`여분 페이지 추가 실패\n${error?.message||error}`);
    }finally{
      if(button){button.disabled=false;button.textContent='+ 페이지 추가';}
    }
  };

  function pageScope(action){
    if(typeof dfMenuRequire==='function'&&!dfMenuRequire('filter-ledger',action,true))return null;
    if(!dfSupabase||!dfCloudUser){alert('로그인 후 사용해주세요.');return null;}
    if(window.dfFilterHasDirtyRows?.()){alert('변경한 여지 값을 먼저 저장해주세요.');return null;}
    const team=value(byId('dfFilterTeam')?.value),year=value(byId('dfFilterYear')?.value);
    if(!team||team==='all'||!/^\d{4}$/.test(year)){alert('팀과 관리 연도를 선택해주세요.');return null;}
    if(value(byId('dfFilterSearch')?.value)||byId('dfFilterStatus')?.value!=='all'){alert('검색·상태 필터를 해제한 뒤 사용해주세요.');return null;}
    return {team,year,page:window.dfFilterCurrentPage?.()};
  }
  window.dfFilterAddEntry=async()=>{
    const scope=pageScope('create');if(!scope)return;
    const number=prompt('추가할 여지번호를 입력해주세요. 빈칸으로 추가한 뒤 수정해도 됩니다.','');if(number===null)return;
    const button=byId('dfFilterEntryAdd');button.disabled=true;
    try{const result=await dfSupabase.rpc('df_filter_add_entry',{p_team:scope.team,p_year:Number(scope.year),p_page:scope.page?.key||null,p_filter_no:number.trim()});if(result.error)throw result.error;
     await window.dfFilterReload?.();if(result.data?.ledger_page!==scope.page?.key)window.dfFilterGoFirstPage?.();
    }catch(error){alert('여지 추가 실패\n'+error.message);}finally{button.disabled=false;}
  };
  window.dfFilterDeleteCurrentPage=async()=>{
    const scope=pageScope('delete');if(!scope?.page)return;
    const rows=scope.page.rows.filter(row=>row&&row.dataset.filterVirtual!=='1');
    const expected=[...new Map(rows.map(row=>[row.dataset.filterLedgerReceipt,{receipt_no:row.dataset.filterLedgerReceipt,updated_at:row.dataset.filterUpdatedAt}])).values()].sort((a,b)=>a.receipt_no<b.receipt_no?-1:a.receipt_no>b.receipt_no?1:0);
    if(!expected.length||expected.some(row=>!row.updated_at))return alert('페이지의 저장자료가 준비되지 않았습니다. SQL 58 적용 후 새로고침해주세요.');
    if(!confirm(`현재 ${scope.year}년 페이지를 대장 목록에서 삭제할까요?\n기존 여지무게는 서버에 보관되며 원본 시료와 분석값은 유지됩니다.`))return;
    const button=byId('dfFilterPageDelete');button.disabled=true;
    try{const result=await dfSupabase.rpc('df_filter_delete_page',{p_team:scope.team,p_page:scope.page.key,p_expected:expected});if(result.error)throw result.error;await window.dfFilterReload?.();}
    catch(error){alert('페이지 삭제 실패\n'+error.message);}finally{button.disabled=false;}
  };

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · SAMPLE GAS CONDITION CO REMOVED`;
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
    window.DF_DIAG?.info('FILTER-LEDGER-12037156','시료채취 가스조건 CO 제거·여지/LAB 저장 준비 완료','LAB CO 기본값·기존 자동연동·연도별 페이지·인쇄 양식 유지');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
