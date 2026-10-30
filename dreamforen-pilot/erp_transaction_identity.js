/* Beta3.57 · exact bank transaction identity across overlapping exports.
   The configured namespace identifies one source bank account, never a filename. */
(function(root){
 'use strict';
 const M=root.DFErpImport,legacyParse=M?.parsePayments;
 const canonical=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s/g,'');
 const header=v=>canonical(v).replace(/[^a-z0-9가-힣]/g,'');
 const col=(row,names)=>{const a=(row||[]).map(header);for(const n of names){const i=a.indexOf(header(n));if(i>=0)return i;}return -1;};
 const dateNames=['거래일','거래일자','입금일','처리일','거래일시','거래일자시간'];
 const text=v=>String(v??'').trim();
 function timestamp(raw,separateTime=''){
  let value=text(raw).normalize('NFKC');
  if(separateTime&&!/[T\s]\d{1,2}:\d{2}:\d{2}/.test(value))value+=' '+text(separateTime);
  const m=value.match(/^(20\d{2})[-./년\s]?(\d{1,2})[-./월\s]?(\d{1,2})(?:일)?[T\s]+(\d{1,2}):(\d{2}):(\d{2})(?:\.0+)?(?:\+09:00)?$/);
  if(!m||!M.date(`${m[1]}-${m[2]}-${m[3]}`)||+m[4]>23||+m[5]>59||+m[6]>59)return '';
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:${m[6]}`;
 }
 function frame(parts){return parts.map(v=>{const s=String(v);return new TextEncoder().encode(s).length+':'+s;}).join('');}
 async function digest(parts){const bytes=new TextEncoder().encode(frame(parts));const out=await root.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(out)].map(b=>b.toString(16).padStart(2,'0')).join('');}
 function isStrong(p){
  const m=p?.import_meta;
  return m?.version===357&&Array.isArray(m.identity_parts)&&m.identity_parts.length===8&&m.identity_parts.every(x=>typeof x==='string')&&
   /^[a-f0-9]{64}$/.test(m.identity_hash||'')&&Number.isInteger(m.occurrence)&&m.occurrence>0&&
   p.unique_key===`PAY3:${m.identity_hash}:${m.occurrence}`;
 }
 function partsFor(payment,detail,namespace){
  const at=timestamp(detail.timestamp,detail.time);
  if(!at||detail.balance===null||detail.balance===undefined||text(detail.balance)==='')
   throw Error('BANK_IDENTITY_REQUIRED: '+payment.source_file+' '+payment.import_meta?.row_number+'행 · 거래시각(초 단위)과 거래 후 잔액이 필요합니다.');
  if(at.slice(0,10)!==payment.payment_date)throw Error('은행 거래일과 거래시각의 날짜가 다릅니다.');
  const amount=M.won(payment.amount),balance=M.won(detail.balance,'거래 후 잔액');
  return [at,String(amount),String(balance),canonical(payment.depositor_name),canonical(detail.account),canonical(payment.bank_name),canonical(payment.description),namespace];
 }
 async function inspect(file){
  const wb=root.XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array',cellDates:true,raw:false});
  const rows=root.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
  let h=-1;for(let i=0;i<Math.min(rows.length,40);i++)if(col(rows[i],dateNames)>=0){h=i;break;}
  const raw=h<0,head=raw?null:rows[h];
  const indexes=raw?{date:0,balance:3,account:5,method:8,time:-1,withdrawal:1}:{
   date:col(head,dateNames),balance:col(head,['잔액','거래후잔액','거래후 잔액','최종잔액']),
   account:col(head,['상대계좌','상대계좌번호','보낸계좌번호','의뢰인계좌번호','상대방계좌번호']),
   method:col(head,['거래방식','거래구분','거래종류','적요구분','거래내용구분']),
   time:col(head,['거래시간','처리시간','입금시간']),withdrawal:col(head,['출금액','출금금액','출금','찾으신금액'])
  };
  return {rows,raw,indexes};
 }
 async function parsePayments(files,options={}){
  if(!M||!legacyParse||!root.XLSX||!root.crypto?.subtle)throw Error('은행 자료 처리 구성요소를 불러오지 못했습니다.');
  const namespace=canonical(options.namespace??'primary');
  if(!namespace||namespace.length>100)throw Error('은행 원본 계좌 구분을 확인해주세요.');
  const result=new Map(),methods=new Map();let raw=0,withdrawals=0;
  for(const file of files||[]){
   const parsed=await legacyParse([file]),sheet=await inspect(file),counts=new Map();raw+=parsed.raw;
   if(sheet.indexes.withdrawal>=0)withdrawals+=sheet.rows.filter((r,i)=>(sheet.raw||i>0)&&text(r[sheet.indexes.withdrawal])&&/^\d[\d,]*$/.test(text(r[sheet.indexes.withdrawal]))&&M.won(r[sheet.indexes.withdrawal])>0).length;
   else withdrawals+=parsed.withdrawals;
   for(const p of parsed.payments){
    // Legacy parser inserts a synthetic header into the known headerless format.
    const sourceIndex=p.import_meta.row_number-(sheet.raw?2:1),row=sheet.rows[sourceIndex];
    if(!row)throw Error(file.name+': 원본 거래 행 위치를 확인할 수 없습니다.');
    const value=k=>sheet.indexes[k]<0?'':row[sheet.indexes[k]];
    const parts=partsFor(p,{timestamp:value('date'),time:value('time'),balance:value('balance'),account:value('account')},namespace);
    const hash=await digest(parts),method=text(value('method')),methodKey=canonical(method);
    if(methodKey&&methods.has(hash)&&methods.get(hash)!==methodKey)
     throw Error('BANK_IDENTITY_AMBIGUOUS: 같은 거래시각·금액·잔액의 거래방식이 서로 다릅니다. 원본 통장을 확인해주세요.');
    if(methodKey)methods.set(hash,methodKey);
    const occurrence=(counts.get(hash)||0)+1;counts.set(hash,occurrence);
    const next={...p,unique_key:`PAY3:${hash}:${occurrence}`,import_meta:{...p.import_meta,version:357,
     identity_parts:parts,identity_hash:hash,occurrence,transaction_method:method,
     source_account_namespace:namespace,source_account_in_export:false}};
    // Multiset maximum across files: each physical repeated row in one export keeps
    // an occurrence; overlapping exports do not add those occurrences again.
    if(!result.has(next.unique_key))result.set(next.unique_key,next);
    else if(!result.get(next.unique_key).import_meta.transaction_method&&method){
     result.get(next.unique_key).import_meta.transaction_method=method;
     result.get(next.unique_key).import_meta.transaction_method_source_file=file.name;
    }
   }
  }
  return {payments:[...result.values()],raw,withdrawals,overlapSkipped:raw-result.size};
 }
 function covered(a,b){const x=a.import_meta||{},y=b.import_meta||{};return (x.reviewed_keys||[]).includes(b.unique_key)||(y.reviewed_keys||[]).includes(a.unique_key)||(x.decision==='new'&&(x.candidate_keys||[]).includes(b.unique_key))||(y.decision==='new'&&(y.candidate_keys||[]).includes(a.unique_key));}
 function sameTransaction(a,b){return isStrong(a)&&isStrong(b)&&a.import_meta.identity_hash===b.import_meta.identity_hash&&a.import_meta.occurrence===b.import_meta.occurrence;}
 function candidates(p,rows){return (rows||[]).filter(x=>{
  if(isStrong(p)&&isStrong(x))return sameTransaction(p,x);
  return M.base(p)===M.base(x);
 }).sort((a,b)=>String(a.unique_key).localeCompare(String(b.unique_key),'en'));}
 function groups(rows){
  const buckets=new Map();for(const p of (rows||[]).filter(x=>x.status!=='excluded')){const key=M.base(p);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);}
  return [...buckets.values()].filter(items=>items.some((a,i)=>items.slice(i+1).some(b=>
   (!isStrong(a)||!isStrong(b)||sameTransaction(a,b))&&!covered(a,b))));
 }
 async function legacyIdentity(p,namespace='primary'){
  const fields=p?.import_meta?.bank_fields||[];
  const get=names=>{const f=fields.find(x=>names.map(header).includes(header(x.label)));return f?.value??'';};
  try{const parts=partsFor(p,{timestamp:get(dateNames),time:get(['거래시간','처리시간','입금시간']),balance:get(['잔액','거래후잔액','최종잔액']),account:get(['상대계좌','상대계좌번호','보낸계좌번호','의뢰인계좌번호','상대방계좌번호'])},canonical(namespace));return {identity_parts:parts,identity_hash:await digest(parts)};}
  catch(_){return null;}
 }
 root.DFErpTransactions=Object.freeze({parsePayments,canonical,timestamp,frame,digest,isStrong,candidates,groups,legacyIdentity});
})(typeof window!=='undefined'?window:globalThis);
