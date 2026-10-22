/* Beta 3.19 · 팀별 A/B 번호표 / 번호 표기 통일 비교 / 팀별 페이지 */
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
  function match(entries,record,teamId,receipt){
    const number=filterNo(record),recordYear=year(record);
    if(!eligible(record))return {exact:null,spare:null,entry:null,layout:{}};
    const sameNumber=value=>canonical(value)===canonical(number);
    const scope=e=>sameNumber(e.filter_no)&&text(e.measure_date).slice(0,4)===recordYear&&text(e.team_id)===text(teamId);
    const exact=entries.find(e=>text(e.receipt_no)===text(receipt)&&
      text(e.measure_date).slice(0,4)===recordYear&&text(e.team_id)===text(teamId)&&
      (sameNumber(e.filter_no)||sameNumber(e.source_filter_no))&&
      (typeof window.dfV1203726LedgerMatchesRecord!=='function'||window.dfV1203726LedgerMatchesRecord(e,record)))||null;
    const candidates=entries.filter(e=>spare(e)&&scope(e));
    // 같은 팀·연도·여지번호가 중복되면 임의의 전무게를 가져오지 않는다.
    const preweight=candidates.length===1?candidates[0]:null;
    return {exact,spare:preweight,entry:exact||preweight,layout:layout(exact?.ledger_page?exact:preweight),ambiguous:candidates.length>1};
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
  window.DFFilterLedger={canonical,teamKey,filterNo,year,spare,unusedAuto,eligible,layout,match,pages};
})();
