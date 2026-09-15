// ==========================================================
// DREAMFOREN v120.37.15.7
// 시료분석 · 자료실 날짜 검색 / 정렬 / 표시 개수 / 페이지
// 저장 데이터와 문서·인쇄·자동연동 로직은 변경하지 않는다.
// ==========================================================
(function dfV12037157DateSearchAndSort(){
  'use strict';

  const VERSION='v120.37.15.7';
  const byId=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();
  const collator=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
  const repositoryState={page:1,pageSize:10,total:0,pages:1,from:0,to:0};
  let forcedAnalysisRecordId='';
  let forcedAnalysisTimer=0;

  function todayIso(){
    const date=new Date(),pad=value=>String(value).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }

  function analysisDate(record){
    if(typeof dfV1129RecordDate==='function')return text(dfV1129RecordDate(record));
    const fields=record?.fields||record?.data?.fields||{};
    const raw=text(fields.measureDate||fields.date||record?.data?.measureDate);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const receipt=text(fields.receiptNo).replace(/\D/g,'');
    return receipt.length>=8?`${receipt.slice(0,4)}-${receipt.slice(4,6)}-${receipt.slice(6,8)}`:'';
  }

  function analysisHaystack(record){
    const fields=record?.fields||{};
    return [
      analysisDate(record),fields.receiptNo,fields.company,fields.facility,
      record?.data?.selectedTeam,fields.team
    ].map(text).join(' ').toLocaleLowerCase('ko');
  }

  function analysisCompare(sort){
    return (a,b)=>{
      const dateA=analysisDate(a),dateB=analysisDate(b);
      const receiptA=text(a?.fields?.receiptNo),receiptB=text(b?.fields?.receiptNo);
      if(sort==='date_asc')return collator.compare(dateA||'9999-99-99',dateB||'9999-99-99')||collator.compare(receiptA,receiptB);
      if(sort==='company_asc')return collator.compare(text(a?.fields?.company),text(b?.fields?.company))||collator.compare(dateB,dateA)||collator.compare(receiptB,receiptA);
      if(sort==='receipt_desc')return collator.compare(receiptB,receiptA)||collator.compare(dateB,dateA);
      return collator.compare(dateB,dateA)||collator.compare(text(b?.ts),text(a?.ts))||collator.compare(receiptB,receiptA);
    };
  }

  function analysisOptionLabel(record,prefix=''){
    const date=analysisDate(record)||'날짜 미입력';
    const label=typeof analysisRecordLabel==='function'?analysisRecordLabel(record):[
      record?.fields?.receiptNo,record?.fields?.company,record?.fields?.facility
    ].map(text).filter(Boolean).join(' / ');
    return `${prefix}[${date}] ${label||'기록 정보 없음'}`;
  }

  function refreshFilteredAnalysisRecords(preserve=true){
    const select=byId('analysisRecordSelect');
    if(!select||typeof analysisSavedRecords!=='function')return;

    const all=analysisSavedRecords();
    const todayOnly=byId('analysisTodayOnly')?.checked===true;
    const selectedDate=todayOnly?todayIso():text(byId('analysisRecordDate')?.value);
    const query=text(byId('analysisRecordSearch')?.value).toLocaleLowerCase('ko');
    const sort=byId('analysisRecordSort')?.value||'date_desc';
    const limit=Math.max(1,Number(byId('analysisRecordLimit')?.value)||20);

    const matches=all.filter(record=>{
      if(selectedDate&&analysisDate(record)!==selectedDate)return false;
      return !query||analysisHaystack(record).includes(query);
    }).sort(analysisCompare(sort));

    const activeId=preserve&&typeof analysisSelectedRecordId!=='undefined'?text(analysisSelectedRecordId):'';
    const visible=matches.slice(0,limit);
    const matchIds=new Set(matches.map(record=>text(record.id)));
    const addSpecial=(id,prefix)=>{
      if(!id||visible.some(record=>text(record.id)===id))return;
      const record=all.find(item=>text(item.id)===id);
      if(!record)return;
      record._dfV157Prefix=prefix;
      visible.unshift(record);
      if(visible.length>limit)visible.pop();
    };
    addSpecial(activeId,'현재 선택 · ');
    addSpecial(forcedAnalysisRecordId,'자료실 열기 · ');

    select.innerHTML='<option value="">저장된 기록을 선택하세요</option>';
    visible.forEach(record=>{
      const option=document.createElement('option');
      option.value=text(record.id);
      const specialPrefix=record._dfV157Prefix||(!matchIds.has(text(record.id))&&text(record.id)===activeId?'현재 선택 · ':'');
      option.textContent=analysisOptionLabel(record,specialPrefix);
      option.title=option.textContent;
      select.appendChild(option);
      if(record._dfV157Prefix)delete record._dfV157Prefix;
    });
    select._records=visible;
    if(activeId&&visible.some(record=>text(record.id)===activeId))select.value=activeId;

    const info=byId('analysisRecordFilterInfo');
    if(info){
      const shown=Math.min(matches.length,limit);
      const condition=selectedDate?`${selectedDate} · `:'';
      const extra=matches.length>limit?' · 검색어나 날짜로 더 좁힐 수 있습니다.':'';
      info.innerHTML=`${condition}전체 <strong>${all.length}</strong>건 중 검색 <strong>${matches.length}</strong>건 · 목록 <strong>${shown}</strong>건 표시${extra}`;
    }
    const recordInfo=byId('analysisRecordInfo');
    const hasActive=typeof analysisSelectedRecordId!=='undefined'&&analysisSelectedRecordId;
    if(recordInfo&&!hasActive){
      recordInfo.textContent=matches.length?'위 조건에 맞는 시료채취기록을 선택하세요.':'조건에 맞는 저장기록이 없습니다.';
    }
  }

  function repositoryTeam(row){
    const raw=text(row?.measurement_data?.data?.selectedTeam||row?.measurement_data?.data?.fields?.team).replace(/팀$/,'');
    return raw==='1'||raw==='2'?raw:'unknown';
  }

  function repositoryUpdatedAt(row){
    return text(row?.measurement_updated_at||row?.analysis_updated_at||row?.updated_at);
  }

  function repositoryCompare(sort){
    return (a,b)=>{
      const dateA=text(a?.measure_date),dateB=text(b?.measure_date);
      const receiptA=text(a?.receipt_no),receiptB=text(b?.receipt_no);
      if(sort==='date_asc')return collator.compare(dateA||'9999-99-99',dateB||'9999-99-99')||collator.compare(receiptA,receiptB);
      if(sort==='company_asc')return collator.compare(text(a?.company_name),text(b?.company_name))||collator.compare(dateB,dateA)||collator.compare(receiptB,receiptA);
      if(sort==='receipt_desc')return collator.compare(receiptB,receiptA)||collator.compare(dateB,dateA);
      return collator.compare(dateB,dateA)||collator.compare(repositoryUpdatedAt(b),repositoryUpdatedAt(a))||collator.compare(receiptB,receiptA);
    };
  }

  function updateRepositoryMeta(){
    const count=byId('dfRepositoryCount');
    const range=byId('dfRepositoryRange');
    const pageInfo=byId('dfRepositoryPageInfo');
    const previous=byId('dfRepositoryPrev');
    const next=byId('dfRepositoryNext');
    if(count)count.textContent=String(repositoryState.total);
    if(range)range.textContent=repositoryState.total?`${repositoryState.from}–${repositoryState.to}번째 표시`:'0건';
    if(pageInfo)pageInfo.textContent=`${repositoryState.page} / ${repositoryState.pages}`;
    if(previous)previous.disabled=repositoryState.page<=1;
    if(next)next.disabled=repositoryState.page>=repositoryState.pages;
  }

  function cloneWithoutListeners(id){
    const original=byId(id);
    if(!original)return null;
    const clone=original.cloneNode(true);
    if('value' in clone)clone.value=original.value;
    if('checked' in clone)clone.checked=original.checked;
    original.replaceWith(clone);
    return clone;
  }

  function debounce(callback,wait=100){
    let timer=0;
    return function(){
      const args=arguments,scope=this;
      clearTimeout(timer);
      timer=setTimeout(()=>callback.apply(scope,args),wait);
    };
  }

  function bindAnalysisFilters(){
    if(typeof refreshAnalysisRecordList==='undefined')return;
    refreshAnalysisRecordList=refreshFilteredAnalysisRecords;

    const today=cloneWithoutListeners('analysisTodayOnly');
    const date=byId('analysisRecordDate');
    const search=byId('analysisRecordSearch');
    const sort=byId('analysisRecordSort');
    const limit=byId('analysisRecordLimit');
    const clear=byId('analysisRecordClear');

    const syncDateState=()=>{
      if(!date)return;
      date.disabled=!!today?.checked;
      if(today?.checked)date.value='';
    };
    today?.addEventListener('change',()=>{syncDateState();refreshFilteredAnalysisRecords(true);});
    date?.addEventListener('change',()=>{
      if(date.value&&today)today.checked=false;
      syncDateState();
      refreshFilteredAnalysisRecords(true);
    });
    search?.addEventListener('input',debounce(()=>refreshFilteredAnalysisRecords(true),80));
    sort?.addEventListener('change',()=>refreshFilteredAnalysisRecords(true));
    limit?.addEventListener('change',()=>refreshFilteredAnalysisRecords(true));
    clear?.addEventListener('click',()=>{
      if(today)today.checked=true;
      if(date)date.value='';
      if(search)search.value='';
      if(sort)sort.value='date_desc';
      if(limit)limit.value='20';
      syncDateState();
      refreshFilteredAnalysisRecords(true);
    });

    syncDateState();
    refreshFilteredAnalysisRecords(true);
  }

  function bindRepositoryFilters(){
    if(typeof dfRepositoryFiltered!=='function'||typeof dfRepositoryRender!=='function')return;
    const baseFiltered=dfRepositoryFiltered;
    const baseRender=dfRepositoryRender;

    dfRepositoryFiltered=function dfV157RepositoryFiltered(){
      let rows=baseFiltered().slice();
      const selectedTeam=byId('dfRepositoryTeam')?.value||'all';
      if(selectedTeam!=='all')rows=rows.filter(row=>repositoryTeam(row)===selectedTeam);
      rows.sort(repositoryCompare(byId('dfRepositorySort')?.value||'date_desc'));

      repositoryState.pageSize=Math.max(1,Number(byId('dfRepositoryLimit')?.value)||10);
      repositoryState.total=rows.length;
      repositoryState.pages=Math.max(1,Math.ceil(rows.length/repositoryState.pageSize));
      repositoryState.page=Math.min(Math.max(1,repositoryState.page),repositoryState.pages);
      repositoryState.from=rows.length?(repositoryState.page-1)*repositoryState.pageSize+1:0;
      repositoryState.to=Math.min(repositoryState.page*repositoryState.pageSize,rows.length);
      return rows.slice(repositoryState.from?repositoryState.from-1:0,repositoryState.to);
    };

    dfRepositoryRender=function dfV157RepositoryRender(){
      const result=baseRender.apply(this,arguments);
      updateRepositoryMeta();
      return result;
    };

    const date=cloneWithoutListeners('dfRepositoryDate');
    const team=cloneWithoutListeners('dfRepositoryTeam');
    const search=cloneWithoutListeners('dfRepositorySearch');
    const clear=cloneWithoutListeners('dfRepositoryClear');
    const sort=byId('dfRepositorySort');
    const limit=byId('dfRepositoryLimit');
    const previous=byId('dfRepositoryPrev');
    const next=byId('dfRepositoryNext');
    const resetAndRender=()=>{repositoryState.page=1;dfRepositoryRender();};

    date?.addEventListener('change',resetAndRender);
    team?.addEventListener('change',resetAndRender);
    search?.addEventListener('input',debounce(resetAndRender,80));
    sort?.addEventListener('change',resetAndRender);
    limit?.addEventListener('change',resetAndRender);
    clear?.addEventListener('click',()=>{
      if(date)date.value='';
      if(team)team.value='all';
      if(search)search.value='';
      if(sort)sort.value='date_desc';
      if(limit)limit.value='10';
      resetAndRender();
    });
    previous?.addEventListener('click',()=>{
      if(repositoryState.page<=1)return;
      repositoryState.page-=1;
      dfRepositoryRender();
      byId('dfRepositoryList')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    next?.addEventListener('click',()=>{
      if(repositoryState.page>=repositoryState.pages)return;
      repositoryState.page+=1;
      dfRepositoryRender();
      byId('dfRepositoryList')?.scrollIntoView({behavior:'smooth',block:'start'});
    });

    if(typeof dfRepositoryOpenAnalysis==='function'){
      const baseOpenAnalysis=dfRepositoryOpenAnalysis;
      dfRepositoryOpenAnalysis=function dfV157OpenRepositoryAnalysis(receipt){
        const rows=typeof dfRepositoryRows!=='undefined'?dfRepositoryRows:[];
        forcedAnalysisRecordId=text(rows.find(row=>text(row.receipt_no)===text(receipt))?.measurement_data?.id);
        clearTimeout(forcedAnalysisTimer);
        forcedAnalysisTimer=setTimeout(()=>{forcedAnalysisRecordId='';},700);
        return baseOpenAnalysis.apply(this,arguments);
      };
    }

    dfRepositoryRender();
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side)side.textContent=`ONLINE ${VERSION} · DATE SEARCH & SORT`;
    if(footer)footer.textContent=VERSION;
  }

  function init(){
    bindAnalysisFilters();
    bindRepositoryFilters();
    applyVersion();
    [180,750,1700].forEach(wait=>setTimeout(applyVersion,wait));
    window.DF_DIAG?.info('LIST-FILTER-12037157','시료분석·자료실 날짜 검색/정렬/페이지 준비 완료','저장·문서·인쇄·자동연동 변경 없음');
  }

  if(document.readyState==='complete')setTimeout(init,0);
  else window.addEventListener('load',init,{once:true});
})();
