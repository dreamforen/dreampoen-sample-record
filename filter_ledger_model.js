/* Beta 3.14 · 여지번호 기준 연동 / 사전 무게 페이지·칸 고정 */
(function(){
  'use strict';
  const text=v=>String(v??'').trim();
  const data=r=>r?.measurement_data?.data||r?.data||{};
  const fields=r=>data(r).fields||r?.fields||{};
  const filterNo=r=>text(fields(r).filterNo);
  const year=r=>text(r?.measure_date||fields(r).measureDate).slice(0,4);
  const spare=e=>text(e?.receipt_no).startsWith('DF-SPARE-');
  const eligible=r=>['dust','combo'].includes(r?.record_type||data(r).recordType)&&!!filterNo(r);
  const layout=e=>e?.ledger_page&&Number.isInteger(Number(e.ledger_slot))&&e.ledger_slot!=null
    ?{ledger_page:e.ledger_page,ledger_slot:Number(e.ledger_slot),ledger_page_at:e.ledger_page_at}:{};
  function match(entries,record,teamId,receipt){
    const number=filterNo(record),recordYear=year(record);
    if(!eligible(record))return {exact:null,spare:null,entry:null,layout:{}};
    const scope=e=>text(e.filter_no)===number&&text(e.measure_date).slice(0,4)===recordYear&&text(e.team_id)===text(teamId);
    const exact=entries.find(e=>text(e.receipt_no)===text(receipt)&&
      text(e.measure_date).slice(0,4)===recordYear&&text(e.team_id)===text(teamId)&&
      (text(e.filter_no)===number||text(e.source_filter_no)===number)&&
      (typeof window.dfV1203726LedgerMatchesRecord!=='function'||window.dfV1203726LedgerMatchesRecord(e,record)))||null;
    const candidates=entries.filter(e=>spare(e)&&scope(e));
    // 같은 팀·연도·여지번호가 중복되면 임의의 전무게를 가져오지 않는다.
    const preweight=candidates.length===1?candidates[0]:null;
    return {exact,spare:preweight,entry:exact||preweight,layout:layout(exact?.ledger_page?exact:preweight),ambiguous:candidates.length>1};
  }
  function pages(rows){
    const groups=new Map(),loose=[];
    for(const row of rows){
      const d=row.dataset,key=d.filterPage;
      if(!key){loose.push(row);continue;}
      const groupKey=`${d.filterTeamId}|${key}`;
      if(!groups.has(groupKey))groups.set(groupKey,{key,team:d.filterTeamId,at:d.filterPageAt||'',rows:Array(35).fill(null),fixed:true});
      const group=groups.get(groupKey),slot=Number(d.filterSlot);
      if(Number.isInteger(slot)&&slot>=0&&slot<35&&!group.rows[slot])group.rows[slot]=row;
      else loose.push(row); // 이전 중복 자료도 화면에서 누락하지 않는다.
    }
    loose.sort((a,b)=>text(b.cells[0]?.textContent).localeCompare(text(a.cells[0]?.textContent))||
      text(b.dataset.filterReceipt).localeCompare(text(a.dataset.filterReceipt),'ko',{numeric:true}));
    for(let i=0;i<loose.length;i+=35){
      const part=loose.slice(i,i+35),at=text(part[0]?.cells[0]?.textContent)+'T00:00:00.000Z';
      groups.set(`samples-${i}`,{key:`samples-${i}`,at,rows:[...part,...Array(35-part.length).fill(null)],fixed:false});
    }
    return [...groups.values()].sort((a,b)=>text(b.at).localeCompare(text(a.at))||b.key.localeCompare(a.key));
  }
  window.DFFilterLedger={filterNo,year,spare,eligible,layout,match,pages};
})();
