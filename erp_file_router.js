/* Beta3.56 · one ERP file selection, workbook-content classification.
   Financial parsing, import identity, duplicate review and writes stay in their existing modules. */
(function(root){
  'use strict';
  const cache=new WeakMap();
  const text=v=>String(v??'').trim();
  const key=v=>text(v).normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
  const col=(row,names)=>{const keys=(row||[]).map(key);return names.some(n=>keys.includes(key(n)));};
  const dateHeaders=['거래일','거래일자','입금일','처리일','거래일시','거래일자시간'];
  const nameHeaders=['입금자명','입금자','보낸분','의뢰인','적요','기재내용'];
  const depositHeaders=['입금액','입금액원','입금금액','입금금액원','입금','맡기신금액'];
  const date=v=>root.DFErpImport?.date(v)||'';
  function detectRows(rows){
    if(!Array.isArray(rows)||!rows.length)return '';
    const invoice=rows.some(row=>col(row,['작성일자','작성일'])&&col(row,['공급받는자사업자등록번호','공급받는자등록번호']));
    const payment=rows.slice(0,40).some(row=>col(row,dateHeaders)&&col(row,nameHeaders)&&
      (col(row,depositHeaders)||(col(row,['거래금액'])&&col(row,['입출금구분','거래구분','구분']))));
    // The existing bank parser supports this precise headerless 12-column export.
    const headerless=!invoice&&!payment&&rows.every(row=>row.length>=12&&date(row[0])&&
      [row[1],row[2],row[3]].every(v=>/^[0-9,]+$/.test(String(v))));
    if(invoice&&(payment||headerless))return 'ambiguous';
    return invoice?'invoice':payment||headerless?'payment':'';
  }
  async function sha(bytes){
    if(!root.crypto?.subtle)throw Error('파일 확인에 필요한 보안 기능을 사용할 수 없습니다. HTTPS에서 다시 열어주세요.');
    const value=await root.crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function classify(file){
    if(!file||typeof file.arrayBuffer!=='function')return Promise.reject(Error('선택한 파일을 읽을 수 없습니다. 다시 선택해주세요.'));
    if(cache.has(file))return cache.get(file);
    const work=(async()=>{
      if(!root.XLSX||!root.DFErpImport)throw Error('업로드 구성요소를 불러오지 못했습니다. 새로고침해주세요.');
      if(!/\.(xlsx|xls|xlsm)$/i.test(text(file.name)))throw Error(`${text(file.name)||'선택 파일'}: Excel 파일(.xls/.xlsx/.xlsm)을 선택해주세요.`);
      const bytes=await file.arrayBuffer();let wb;
      try{wb=root.XLSX.read(new Uint8Array(bytes),{type:'array',cellDates:true,raw:false});}
      catch(_){throw Error(`${file.name}: Excel 파일을 열 수 없습니다. 원본 파일을 확인해주세요.`);}
      if(!wb.SheetNames.length)throw Error(`${file.name}: 시트를 찾지 못했습니다.`);
      const sheets=wb.SheetNames.map(name=>({name,rows:root.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false})}));
      const first=sheets[0],kind=detectRows(first.rows);
      if(kind==='ambiguous')throw Error(`${file.name}: 계산서와 입출금 제목이 한 시트에 함께 있습니다. 자료 종류별 원본 파일을 선택해주세요.`);
      if(!kind)throw Error(`${file.name}: 첫 번째 시트에서 국세청 계산서 또는 은행 입출금 양식을 확인하지 못했습니다.`);
      if(sheets.slice(1).some(s=>detectRows(s.rows)))throw Error(`${file.name}: 여러 시트에 거래 자료가 있습니다. 누락을 막기 위해 거래 시트별 파일로 나눠 선택해주세요.`);
      return {file,kind,hash:await sha(bytes),name:file.name,sheet:first.name};
    })();
    cache.set(file,work);return work;
  }
  async function route(files){
    const selected=Array.from(files||[]);
    if(!selected.length)return {invoices:[],payments:[],files:[],duplicates:[],count:0};
    const classified=await Promise.all(selected.map(classify));
    const unique=new Map(),duplicates=[];
    for(const item of classified){
      if(unique.has(item.hash)){duplicates.push({...item,duplicateOf:unique.get(item.hash).name});continue;}
      unique.set(item.hash,item);
    }
    const kept=[...unique.values()];
    return {invoices:kept.filter(x=>x.kind==='invoice').map(x=>x.file),payments:kept.filter(x=>x.kind==='payment').map(x=>x.file),files:kept,duplicates,count:kept.length};
  }
  async function parse(files,existingCustomers=[]){
    // Finish all file recognition before calling either financial parser.
    const selection=await route(files);
    const invoices=await root.DFErpImport.parseInvoices(selection.invoices,existingCustomers);
    const payments=await root.DFErpTransactions.parsePayments(selection.payments);
    return {invoices:invoices.invoices,customers:invoices.customers,payments:payments.payments,
      rawInvoices:invoices.raw,rawPayments:payments.raw,withdrawals:payments.withdrawals,selection};
  }
  root.DFErpFileRouter=Object.freeze({classify,route,parse,detectRows});
})(typeof window!=='undefined'?window:globalThis);
