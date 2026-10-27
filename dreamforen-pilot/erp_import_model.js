/* Beta 3.51: ERP import validation and review; no external data access. */
(function(root){
 'use strict';
 const compact=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s/g,''),header=v=>compact(v).replace(/[^a-z0-9가-힣]/g,'');
 function won(v,label='금액'){
  const text=String(v??'').trim();if(!text||text==='-')return 0;
  const clean=text.replace(/[,\s₩원]/g,'');if(!/^-?\d+(?:\.0+)?$/.test(clean))throw Error(label+': 원 단위 정수 금액을 확인해주세요. ('+text+')');
  const n=Number(clean);if(!Number.isSafeInteger(n))throw Error(label+': 처리 가능한 정수 범위를 벗어났습니다.');return n;
 }
 function date(v){const m=String(v??'').trim().match(/^(20\d{2})[-./년\s]?(\d{1,2})[-./월\s]?(\d{1,2})(?:일|\b|\s|T|$)/);if(!m)return '';const y=+m[1],mo=+m[2],d=+m[3],dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
 const col=(row,names)=>{const a=row.map(header);for(const n of names){const i=a.indexOf(header(n));if(i>=0)return i;}return -1;};
 async function sha(bytes){const hash=await root.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
 async function read(file){const bytes=await file.arrayBuffer(),wb=root.XLSX.read(new Uint8Array(bytes),{type:'array',cellDates:true,raw:false});if(!wb.SheetNames.length)throw Error(file.name+': 시트를 찾지 못했습니다.');return {rows:root.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false}),hash:await sha(bytes)};}
 function safeSum(values){let s=0;for(const v of values){s+=won(v);if(!Number.isSafeInteger(s))throw Error('금액 합계가 안전한 정수 범위를 벗어났습니다.');}return s;}
 const base=p=>[p.payment_date,won(p.amount),compact(p.depositor_name)].join('|');
 const candidates=(p,rows)=>rows.filter(x=>base(x)===base(p)).sort((a,b)=>String(a.unique_key).localeCompare(String(b.unique_key),'en'));
 function groups(rows){const m=new Map();for(const p of rows.filter(x=>x.status!=='excluded')){const k=base(p);if(!m.has(k))m.set(k,[]);m.get(k).push(p);}return [...m.values()].filter(a=>a.length>1&&a.some((p,i)=>a.slice(i+1).some(q=>!covered(p,q))));}
 function covered(p,q){const a=p.import_meta||{},b=q.import_meta||{};return (a.reviewed_keys||[]).includes(q.unique_key)||(b.reviewed_keys||[]).includes(p.unique_key)||(a.decision==='new'&&(a.candidate_keys||[]).includes(q.unique_key))||(b.decision==='new'&&(b.candidate_keys||[]).includes(p.unique_key));}
 async function parseInvoices(files,existingCustomers=[]){
  const invoices=new Map(),customers=new Map();let raw=0;
  for(const file of files){const {rows}=await read(file);const h=rows.findIndex(r=>col(r,['작성일자','작성일'])>=0&&col(r,['공급받는자사업자등록번호','공급받는자등록번호'])>=0);if(h<0)throw Error(file.name+': 국세청 계산서의 작성일자·공급받는자 사업자번호 제목을 확인해주세요.');const head=rows[h],ix={date:col(head,['작성일자','작성일']),approval:col(head,['승인번호']),biz:col(head,['공급받는자사업자등록번호','공급받는자등록번호']),company:col(head,['공급받는자상호','공급받는자상호법인명','공급받는자상호법인명명']),rep:col(head,['공급받는자대표자명','공급받는자성명','공급받는자대표자']),total:col(head,['합계금액','총금액']),supply:col(head,['공급가액']),tax:col(head,['세액']),item:col(head,['품목명','품목'])};
   // 홈택스 표준 열의 반복되는 상호/대표자 제목은 사업자번호 바로 뒤의 열로 한정합니다.
   if(ix.company<0){const local=col(head.slice(ix.biz+1,ix.biz+5),['상호','상호법인명']);if(local>=0)ix.company=ix.biz+1+local;}
   if(ix.rep<0){const local=col(head.slice(ix.biz+1,ix.biz+5),['대표자명','성명','대표자']);if(local>=0)ix.rep=ix.biz+1+local;}
   if(['date','approval','biz','company','total','supply','tax'].some(k=>ix[k]<0))throw Error(file.name+': 계산서의 승인번호·업체명·합계금액·공급가액·세액 열을 찾지 못했습니다. 열이 다른 파일은 확인 후 처리해야 합니다.');
   for(let i=h+1;i<rows.length;i++){const r=rows[i];if(r.every(v=>String(v).trim()===''))continue;const approval=String(r[ix.approval]||'').trim(),company=String(r[ix.company]||'').trim();if(!approval&&!r[ix.date]&&r.some(v=>/^(총|전체)?합계/.test(String(v).trim())))continue;
    const day=date(r[ix.date]);if(!day||!approval||!company)throw Error(`${file.name} ${i+1}행: 작성일자·승인번호·업체명을 확인해주세요.`);const biz=String(r[ix.biz]||'').replace(/\D/g,'');if(biz.length!==10)throw Error(`${file.name} ${i+1}행: 사업자번호 10자리를 확인해주세요.`);
    const total=won(r[ix.total],file.name+' 합계금액'),supply=won(r[ix.supply]),tax=won(r[ix.tax]);if(!Number.isSafeInteger(supply+tax)||total!==supply+tax)throw Error(`${file.name} ${i+1}행: 합계금액과 공급가액+세액이 다릅니다.`);
    const old=existingCustomers.find(c=>c.customer_key===biz),invoice={unique_key:'INV:'+approval,customer_key:biz,issue_date:day,approval_no:approval,total_amount:total,supply_amount:supply,tax_amount:tax,item_name:ix.item<0?'':String(r[ix.item]||''),source_file:file.name,status:'active'};
    const prev=invoices.get(invoice.unique_key);if(prev&&['customer_key','issue_date','total_amount','supply_amount','tax_amount'].some(k=>prev[k]!==invoice[k]))throw Error('같은 승인번호의 계산서 내용이 서로 다릅니다: '+approval);
    invoices.set(invoice.unique_key,invoice);customers.set(biz,{customer_key:biz,company_name:old?.company_name||company,biz_no:biz,representative:old?.representative||(ix.rep<0?'':String(r[ix.rep]||''))});raw++;
   }
  }return {invoices:[...invoices.values()],customers:[...customers.values()],raw};
 }
 async function parsePayments(files){
  const payments=new Map();let raw=0,withdrawals=0;
  for(const file of files){const {rows,hash}=await read(file);let h=-1;for(let i=0;i<Math.min(rows.length,40);i++)if(col(rows[i],['거래일','거래일자','입금일','처리일','거래일시','거래일자시간'])>=0){h=i;break;}if(h<0){if(!rows.length||!rows.every(r=>r.length>=12&&date(r[0])&&/^[0-9,]+$/.test(String(r[1]))&&/^[0-9,]+$/.test(String(r[2]))&&/^[0-9,]+$/.test(String(r[3]))))throw Error(file.name+': 은행 거래일자 제목 행을 찾지 못했습니다.');rows.unshift(['거래일시','출금액','입금액','잔액','입금자명','상대계좌','은행','','거래방식','','','거래내용']);h=0;}
   const head=rows[h],ixDate=col(head,['거래일','거래일자','입금일','처리일','거래일시','거래일자시간']),deposit=col(head,['입금액','입금액원','입금금액','입금금액원','입금','맡기신금액']),generic=col(head,['거래금액']),direction=col(head,['입출금구분','거래구분','구분']),ixName=col(head,['입금자명','입금자','보낸분','의뢰인','적요','기재내용']),ixDesc=col(head,['거래내용','내용','기재내용','비고','메모']),ixBank=col(head,['은행','은행명','거래은행']);
   if((deposit<0&&(generic<0||direction<0))||ixName<0)throw Error(file.name+': 입금액·입금자 열이 필요합니다. 거래금액만 있는 파일은 입출금 구분도 있어야 합니다.');
   for(let i=h+1;i<rows.length;i++){const r=rows[i];if(r.every(v=>String(v).trim()===''))continue;const sum=won(r[deposit>=0?deposit:generic],`${file.name} ${i+1}행`);if(deposit<0){const kind=compact(r[direction]);if(['출금','출','지급','출금거래','d','debit'].includes(kind)){withdrawals++;continue;}if(!['입금','입','수입','입금거래','c','credit'].includes(kind)){if(sum===0)continue;throw Error(`${file.name} ${i+1}행: 입출금 구분을 확인해주세요.`);}}
    if(sum===0)continue;if(sum<0)throw Error(`${file.name} ${i+1}행: 입금액이 음수입니다. 별도 확인이 필요합니다.`);const day=date(r[ixDate]);if(!day){if(!r[ixDate]&&r.some(v=>/^(총|전체)?합계/.test(String(v).trim())))continue;throw Error(`${file.name} ${i+1}행: 거래일자를 확인해주세요.`);}
    const name=String(r[ixName]||'').trim(),description=ixDesc<0?'':String(r[ixDesc]||'').trim();if(!name&&!description)throw Error(`${file.name} ${i+1}행: 입금자와 거래내용이 모두 없습니다.`);
    const unique_key=`PAY2:${hash}:${i+1}`;payments.set(unique_key,{unique_key,payment_date:day,depositor_name:name,description,bank_name:ixBank<0?'':String(r[ixBank]||''),amount:sum,source_file:file.name,status:'pending',import_meta:{version:351,file_hash:hash,row_number:i+1,bank_fields:head.map((label,j)=>({label:String(label).slice(0,100),value:String(r[j]??'').slice(0,500)})).filter(x=>/거래일|일시|시간|거래번호|참조번호|잔액|계좌|은행|취급점/.test(x.label)).slice(0,20)},candidate_keys:[],decision:''});raw++;
   }
  }return {payments:[...payments.values()],raw,withdrawals};
 }
 const api={won,date,safeSum,base,candidates,groups,parseInvoices,parsePayments,compact};root.DFErpImport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
