/* DREAMFOREN Beta 3.56 · presentation-only ERP totals and monthly activity.
 * Does not assign payments to invoices, change matching, or mutate source rows.
 */
(function(root){
  'use strict';
  const text=v=>String(v??'').trim();
  function won(value){
    const raw=text(value);if(raw===''||raw==='-')return 0;
    const clean=raw.replace(/[,\s₩원]/g,'');
    if(!/^-?\d+(?:\.0+)?$/.test(clean))throw Error('원 단위 정수 금액을 확인해주세요.');
    const result=Number(clean);if(!Number.isSafeInteger(result))throw Error('금액이 안전한 정수 범위를 벗어났습니다.');return result;
  }
  function sum(values){let result=0;for(const value of values){result+=won(value);if(!Number.isSafeInteger(result))throw Error('금액 합계가 안전한 정수 범위를 벗어났습니다.');}return result;}
  function date(value){
    const raw=value instanceof Date&&!isNaN(value)?value.toISOString().slice(0,10):text(value).slice(0,10);
    const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';
    const dt=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
    return dt.getUTCFullYear()===+m[1]&&dt.getUTCMonth()===+m[2]-1&&dt.getUTCDate()===+m[3]?raw:'';
  }
  function yearValue(value,allowAll=false){
    const s=text(value);if(allowAll&&s==='all')return s;
    if(!/^\d{4}$/.test(s)||Number(s)<2000||Number(s)>2100)throw Error('조회 연도를 확인해주세요.');return s;
  }
  const byDate=(field)=>(a,b)=>text(b[field]).localeCompare(text(a[field]))||text(a.unique_key).localeCompare(text(b.unique_key));
  function records(invoices,payments){
    const issues=[];
    const read=(rows,type,field,amountField)=>rows.filter(row=>row&&row.status===(type==='invoice'?'active':'matched')).map(row=>{
      const day=date(row[field]);const value=won(row[amountField]);
      if(!day)issues.push({type,key:text(row.unique_key),reason:'date',amount:value});
      const customerKey=text(row[type==='invoice'?'customer_key':'matched_customer_key']);
      if(!customerKey)issues.push({type,key:text(row.unique_key),reason:'customer',amount:value});
      return {row,day,value,customerKey};
    });
    return {invoices:read(invoices||[],'invoice','issue_date','total_amount'),payments:read(payments||[],'payment','payment_date','amount'),issues};
  }
  function dashboard(input){
    input=input||{};
    const year=yearValue(input.year),start=year+'-01-01',end=year+'-12-31',goal=won(input.goal);
    if(goal<0)throw Error('목표 발급금액은 0원 이상으로 입력해주세요.');
    const data=records(input.invoices,input.payments),annualInvoices=data.invoices.filter(x=>x.day>=start&&x.day<=end),annualPayments=data.payments.filter(x=>x.day>=start&&x.day<=end);
    const invoices=data.invoices.filter(x=>x.day&&x.day<=end),payments=data.payments.filter(x=>x.day&&x.day<=end);
    const accounts=new Map();
    const get=key=>{if(!accounts.has(key))accounts.set(key,{customerKey:key,issued:0,paid:0,invoiceCount:0,paymentCount:0});return accounts.get(key);};
    for(const x of invoices){const a=get(x.customerKey||'!invoice:'+text(x.row.unique_key));a.issued=sum([a.issued,x.value]);a.invoiceCount++;}
    for(const x of payments){const a=get(x.customerKey||'!payment:'+text(x.row.unique_key));a.paid=sum([a.paid,x.value]);a.paymentCount++;}
    const groups=[...accounts.values()].map(x=>({...x,balance:sum([x.issued,-x.paid]),due:Math.max(0,sum([x.issued,-x.paid])),advance:Math.max(0,sum([x.paid,-x.issued]))}));
    const issued=sum(annualInvoices.map(x=>x.value)),paid=sum(annualPayments.map(x=>x.value));
    const cumulativeIssued=sum(invoices.map(x=>x.value)),cumulativePaid=sum(payments.map(x=>x.value)),due=sum(groups.map(x=>x.due)),advance=sum(groups.map(x=>x.advance));
    const reviewKeys=new Set(input.reviewPaymentKeys||[]),reviewPayments=payments.filter(x=>reviewKeys.has(text(x.row.unique_key)));
    const known=input.customers?new Set(input.customers.map(c=>text(c.customer_key))):null;
    const orphanKeys=known?groups.filter(g=>!known.has(g.customerKey)).map(g=>g.customerKey):[];
    const provisional=reviewPayments.length>0||data.issues.length>0||orphanKeys.length>0;
    const months=Array.from({length:12},(_,i)=>{const month=year+'-'+String(i+1).padStart(2,'0'),inv=annualInvoices.filter(x=>x.day.startsWith(month)),pay=annualPayments.filter(x=>x.day.startsWith(month));return {month,issued:sum(inv.map(x=>x.value)),paid:sum(pay.map(x=>x.value)),invoiceCount:inv.length,paymentCount:pay.length};});
    const percent=goal>0?issued/goal*100:null;
    return {
      year,asOf:end,goal,
      annual:{issued,paid,supply:sum(annualInvoices.map(x=>x.row.supply_amount)),tax:sum(annualInvoices.map(x=>x.row.tax_amount)),invoiceCount:annualInvoices.length,paymentCount:annualPayments.length},
      achievement:{percent,progressPercent:percent===null?0:Math.max(0,Math.min(100,percent)),remaining:Math.max(0,sum([goal,-issued])),basis:'annual-issued-vat-included'},
      receivable:{issuedThroughYear:cumulativeIssued,paidThroughYear:cumulativePaid,due,advance,ratePercent:cumulativeIssued>0?due/cumulativeIssued*100:null,customerCount:groups.filter(g=>g.due>0).length,basis:'cumulative-issued-through-year-vat-included'},
      unmatched:{count:(input.payments||[]).filter(p=>p?.status==='pending'&&date(p.payment_date)&&date(p.payment_date)<=end).length,amount:sum((input.payments||[]).filter(p=>p?.status==='pending'&&date(p.payment_date)&&date(p.payment_date)<=end).map(p=>p.amount))},
      review:{provisional,paymentCount:reviewPayments.length,paymentAmount:sum(reviewPayments.map(x=>x.value)),issues:data.issues,orphanCustomerKeys:orphanKeys},
      months,customers:groups
    };
  }
  function customerMonths(input){
    input=input||{};const key=text(input.customerKey);if(!key)throw Error('조회할 업체를 선택해주세요.');
    const year=yearValue(input.year||'all',true),data=records(input.invoices,input.payments),start=year==='all'?null:year+'-01-01',end=year==='all'?null:year+'-12-31';
    const invoices=data.invoices.filter(x=>x.customerKey===key&&x.day&&(!end||x.day<=end));
    const payments=data.payments.filter(x=>x.customerKey===key&&x.day&&(!end||x.day<=end));
    const openingBalance=start?sum([...invoices.filter(x=>x.day<start).map(x=>x.value),...payments.filter(x=>x.day<start).map(x=>-x.value)]):0;
    const visibleInvoices=invoices.filter(x=>!start||x.day>=start),visiblePayments=payments.filter(x=>!start||x.day>=start);
    const monthKeys=[...new Set([...visibleInvoices.map(x=>x.day.slice(0,7)),...visiblePayments.map(x=>x.day.slice(0,7))])].sort();
    let balance=openingBalance;
    const months=monthKeys.map(month=>{
      const inv=visibleInvoices.filter(x=>x.day.startsWith(month)),pay=visiblePayments.filter(x=>x.day.startsWith(month)),issued=sum(inv.map(x=>x.value)),paid=sum(pay.map(x=>x.value)),opening=balance;
      balance=sum([balance,issued,-paid]);
      return {month,invoices:inv.map(x=>({...x.row})).sort(byDate('issue_date')),payments:pay.map(x=>({...x.row})).sort(byDate('payment_date')),issued,paid,openingBalance:opening,netBalance:balance,due:Math.max(0,balance),advance:Math.max(0,-balance)};
    }).reverse();
    const relevantKeys=new Set([...data.invoices,...data.payments].filter(x=>x.customerKey===key).map(x=>text(x.row.unique_key)));
    return {customerKey:key,year,openingBalance,months,issued:sum(visibleInvoices.map(x=>x.value)),paid:sum(visiblePayments.map(x=>x.value)),closingBalance:balance,due:Math.max(0,balance),advance:Math.max(0,-balance),issues:data.issues.filter(x=>relevantKeys.has(x.key))};
  }
  const api={won,sum,date,dashboard,customerMonths};root.DFErpDashboard=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
