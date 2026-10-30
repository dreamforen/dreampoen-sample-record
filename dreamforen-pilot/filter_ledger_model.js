/* Beta 3.55 · 관리연도+여지번호 연결 / 채취팀과 여지 소속 분리 */
(function(){
  'use strict';
  const text=v=>String(v??'').trim();
  const data=r=>r?.measurement_data?.data||r?.data||{};
  const fields=r=>data(r).fields||r?.fields||{};
  const filterNo=r=>text(fields(r).filterNo);
  function canonical(value){
    const original=text(value),compact=original.normalize('NFKC').toUpperCase().replace(/[\s\-‐‑‒–—−﹘﹣－]/g,'');
    const parsed=compact.match(/^([A-Z])(\d{1,6})$/);
    if(!parsed||Number(parsed[2])<1)return original;
    return parsed[1]+String(Number(parsed[2])).padStart(3,'0');
  }
  const teamKey=value=>text(value).normalize('NFKC').replace(/팀|\s/g,'');
  const year=r=>text(r?.measure_date||fields(r).measureDate).slice(0,4);
  const spare=e=>text(e?.receipt_no).startsWith('DF-SPARE-');
  const unusedAuto=e=>text(e?.receipt_no).startsWith('DF-SPARE-AUTO-')&&e?.before_weight==null&&e?.after_weight==null&&!e?.deleted_at&&(!e?.updated_at||e.updated_at===e.created_at);
  const eligible=r=>['dust','combo'].includes(r?.record_type||data(r).recordType)&&!!filterNo(r);
  const layout=e=>e?.ledger_page&&Number.isInteger(Number(e.ledger_slot))&&e.ledger_slot!=null
    ?{ledger_page:e.ledger_page,ledger_slot:Number(e.ledger_slot),ledger_page_at:e.ledger_page_at}:{};
  function match(entries,record,teamId,receipt,context={}){
    const number=filterNo(record),recordYear=year(record);
    if(!eligible(record))return {exact:null,spare:null,entry:null,layout:{}};
    const sameNumber=value=>canonical(value)===canonical(number);
    const archivedPages=new Set(entries.filter(e=>e.deleted_at&&e.ledger_page).map(e=>`${e.team_id}|${e.ledger_page}`));
    const live=e=>!e.deleted_at&&!e._page_deleted&&!archivedPages.has(`${e.team_id}|${e.ledger_page}`);
    const scope=e=>text(e.measure_date).slice(0,4)===recordYear;
    const related=e=>scope(e)&&(sameNumber(e.filter_no)||sameNumber(e.source_filter_no));
    const exact=entries.find(e=>live(e)&&text(e.receipt_no)===text(receipt)&&scope(e)&&
      (sameNumber(e.filter_no)||sameNumber(e.source_filter_no))&&
      (typeof window.dfV1203726LedgerMatchesRecord!=='function'||window.dfV1203726LedgerMatchesRecord(e,record)))||null;
    const candidates=entries.filter(e=>live(e)&&spare(e)&&scope(e)&&sameNumber(e.filter_no));
    const occupied=entries.filter(e=>live(e)&&!spare(e)&&related(e)&&e!==exact);
    const claims=new Set((context.sources||[]).filter(r=>eligible(r)&&year(r)===recordYear&&canonical(filterNo(r))===canonical(number))
      .map(r=>text(r?.measurement_data?.id||r?.id)||text(r?.receipt_no||fields(r).receiptNo)).filter(Boolean));
    let error='';
    if(claims.size>1)error='같은 연도·여지번호가 여러 시료에 입력되어 있습니다. 원본 번호를 확인해주세요.';
    else if(occupied.length)error='같은 연도·여지번호에 다른 시료의 저장자료가 있습니다. 임의로 합치지 않았습니다.';
    else if(candidates.length>1)error='같은 연도·여지번호의 사전 무게 행이 여러 개입니다. 기존 무게를 확인해주세요.';
    else if(exact&&candidates.length)error='같은 번호의 시료 저장행과 사전 무게 행이 따로 있습니다. 기존 값을 확인해주세요.';
    else if(!exact&&!candidates.length&&entries.some(e=>related(e)&&!live(e)))
      error='삭제된 여지 행 또는 페이지입니다. 새 여지를 확인한 뒤 연결해주세요.';
    const preweight=!exact&&!error&&candidates.length===1?candidates[0]:null;
    const entry=exact||preweight;
    return {exact,spare:preweight,entry,layout:layout(entry),ownerTeamId:entry?.team_id||null,
      samplingTeamId:teamId||null,ambiguous:!!error,error};
  }
  async function readMatch(client,record,receipt){
    const recordYear=year(record);
    if(!/^\d{4}$/.test(recordYear))throw Error('여지대장에 연결할 측정일을 확인해주세요.');
    const response=await client.rpc('df_filter_lookup_number',{p_year:Number(recordYear),p_no:filterNo(record)});
    if(response.error)throw Error('여지번호 조회 실패: '+response.error.message+' (67번 SQL 적용 여부를 확인해주세요.)');
    if(!Array.isArray(response.data?.rows)||!Array.isArray(response.data?.source_claims)||
      response.data.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row))||
      response.data.source_claims.some(row=>!row||typeof row!=='object'||Array.isArray(row)))
      throw Error('여지번호 조회 응답을 확인할 수 없습니다. 67번 SQL 적용 후 다시 조회해주세요.');
    const recordId=text(record?.measurement_data?.id||record?.id);
    if(response.data.source_claims.some(row=>text(row.receipt_no)!==text(receipt)&&
      (!recordId||text(row.record_id)!==recordId)))
      throw Error('같은 연도·여지번호가 다른 시료에도 입력되어 있습니다. 원본 번호를 확인해주세요.');
    const rows=response.data.rows;
    const result=match(rows,record,null,receipt);
    if(result.error)throw Error(result.error);
    return result;
  }
  function pages(rows){
    const groups=new Map(),loose=new Map();
    const teamName=row=>text(row.cells[3]?.textContent)||text(row.dataset.filterTeamId)||'미지정';
    const addLoose=row=>{
      const number=canonical(row.querySelector?.('[data-f="filter_no"]')?.value||row.dataset.filterNumber||'');
      const prefix=number.match(/^([A-Z])\d+$/)?.[1]||'other';
      const key=`${row.dataset.filterTeamId}|${prefix}`;
      if(!loose.has(key))loose.set(key,[]);
      loose.get(key).push(row);
    };
    for(const row of rows){
      const d=row.dataset,key=d.filterPage;
      if(!key){addLoose(row);continue;}
      const groupKey=`${d.filterTeamId}|${key}`;
      if(!groups.has(groupKey))groups.set(groupKey,{key,team:d.filterTeamId,teamName:teamName(row),at:d.filterPageAt||'',rows:Array(35).fill(null),fixed:true});
      const group=groups.get(groupKey),slot=Number(d.filterSlot);
      if(Number.isInteger(slot)&&slot>=0&&slot<35&&!group.rows[slot])group.rows[slot]=row;
      else addLoose(row); // 이전 중복 자료도 같은 팀의 별도 페이지에 보존한다.
    }
    for(const [scope,items] of loose){
      items.sort((a,b)=>text(b.cells[0]?.textContent).localeCompare(text(a.cells[0]?.textContent))||
        text(b.dataset.filterReceipt).localeCompare(text(a.dataset.filterReceipt),'ko',{numeric:true}));
      for(let i=0;i<items.length;i+=35){
        const part=items.slice(i,i+35),at=text(part[0]?.cells[0]?.textContent)+'T00:00:00.000Z',key=`samples-${scope.replace('|','-')}-${i}`;
        groups.set(key,{key,team:part[0].dataset.filterTeamId,teamName:teamName(part[0]),at,rows:[...part,...Array(35-part.length).fill(null)],fixed:false});
      }
    }
    return [...groups.values()].sort((a,b)=>text(a.teamName).localeCompare(text(b.teamName),'ko',{numeric:true})||
      text(a.team).localeCompare(text(b.team))||text(b.at).localeCompare(text(a.at))||b.key.localeCompare(a.key));
  }
  window.DFFilterLedger={canonical,teamKey,filterNo,year,spare,unusedAuto,eligible,layout,match,readMatch,pages};
})();
