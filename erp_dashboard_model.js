/* DREAMFOREN Beta 3.62 · invoice-date receipt totals and monthly activity.
 * Recalculates read-only settlement; preserves source rows and customer matching.
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
  function settlement(input,asOf='all'){
    const model=root.DFErpSettlement||(typeof require==='function'?require('./erp_settlement_model.js'):null);
    if(!model?.settle)throw Error('수금 계산 구성요소를 불러오지 못했습니다. Ctrl+F5로 새로고침해주세요.');
    return model.settle({invoices:input.invoices||[],payments:input.payments||[],asOf});
  }
  const applied=(settled,key)=>settled.paymentByKey.get(text(key))?.allocated||0;
  const unpaid=(settled,key)=>settled.paymentByKey.get(text(key))?.unallocated||0;
  const projected=settled=>({
    invoices:settled.invoices.filter(x=>x.included).map(x=>({row:x.row,day:x.day,value:x.amount,customerKey:x.customerKey})),
    payments:settled.payments.filter(x=>x.included).map(x=>({row:x.row,day:x.day,value:x.amount,customerKey:x.customerKey})),
    issues:settled.issues
  });
  function dashboard(input){
    input=input||{};
    const year=yearValue(input.year),start=year+'-01-01',end=year+'-12-31',goal=won(input.goal);
    if(goal<0)throw Error('목표 발급금액은 0원 이상으로 입력해주세요.');
    const settled=settlement(input,end),data=projected(settled);
    const annualInvoices=data.invoices.filter(x=>x.day>=start&&x.day<=end),annualPayments=data.payments.filter(x=>x.day>=start&&x.day<=end);
    const invoices=data.invoices.filter(x=>x.day&&x.day<=end),payments=data.payments.filter(x=>x.day&&x.day<=end);
    const groups=settled.accounts.map(a=>({customerKey:a.customerKey,issued:a.issued,paid:a.paid,balance:a.due,due:a.due,advance:a.unallocated,unallocated:a.unallocated,unappliedCredit:a.unappliedCredit,invoiceCount:a.invoiceCount,paymentCount:a.paymentCount}));
    const issued=sum(annualInvoices.map(x=>x.value)),paid=sum(annualPayments.map(x=>applied(settled,x.row.unique_key))),rawPaid=sum(annualPayments.map(x=>x.value));
    const cumulativeIssued=sum(invoices.map(x=>x.value)),cumulativePaid=sum(payments.map(x=>applied(settled,x.row.unique_key))),due=sum(groups.map(x=>x.due)),unallocated=sum(groups.map(x=>x.unallocated));
    const reviewKeys=new Set(input.reviewPaymentKeys||[]),reviewPayments=payments.filter(x=>reviewKeys.has(text(x.row.unique_key)));
    const known=input.customers?new Set(input.customers.map(c=>text(c.customer_key))):null;
    const orphanKeys=known?groups.filter(g=>!known.has(g.customerKey)).map(g=>g.customerKey):[];
    const issues=data.issues;
    const provisional=reviewPayments.length>0||issues.length>0||orphanKeys.length>0;
    const months=Array.from({length:12},(_,i)=>{
      const month=year+'-'+String(i+1).padStart(2,'0'),inv=annualInvoices.filter(x=>x.day.startsWith(month)),pay=annualPayments.filter(x=>x.day.startsWith(month));
      return {month,issued:sum(inv.map(x=>x.value)),paid:sum(pay.map(x=>applied(settled,x.row.unique_key))),rawPaid:sum(pay.map(x=>x.value)),unallocated:sum(pay.map(x=>unpaid(settled,x.row.unique_key))),invoiceCount:inv.length,paymentCount:pay.length};
    });
    const percent=goal>0?issued/goal*100:null;
    return {
      year,asOf:end,goal,
      annual:{issued,paid,rawPaid,unallocated:sum(annualPayments.map(x=>unpaid(settled,x.row.unique_key))),supply:sum(annualInvoices.map(x=>x.row.supply_amount)),tax:sum(annualInvoices.map(x=>x.row.tax_amount)),invoiceCount:annualInvoices.length,paymentCount:annualPayments.length},
      achievement:{percent,progressPercent:percent===null?0:Math.max(0,Math.min(100,percent)),remaining:Math.max(0,sum([goal,-issued])),basis:'annual-issued-vat-included'},
      receivable:{issuedThroughYear:cumulativeIssued,paidThroughYear:cumulativePaid,due,advance:unallocated,unallocated,ratePercent:cumulativeIssued>0?due/cumulativeIssued*100:null,customerCount:groups.filter(g=>g.due>0).length,basis:'invoice-date-receipts-through-year-vat-included'},
      unmatched:{count:(input.payments||[]).filter(p=>p?.status==='pending'&&date(p.payment_date)&&date(p.payment_date)<=end).length,amount:sum((input.payments||[]).filter(p=>p?.status==='pending'&&date(p.payment_date)&&date(p.payment_date)<=end).map(p=>p.amount))},
      review:{provisional,paymentCount:reviewPayments.length,paymentAmount:sum(reviewPayments.map(x=>x.value)),issues,orphanCustomerKeys:orphanKeys},
      months,customers:groups
    };
  }
  function customerMonths(input){
    input=input||{};const key=text(input.customerKey);if(!key)throw Error('조회할 업체를 선택해주세요.');
    const year=yearValue(input.year||'all',true),start=year==='all'?null:year+'-01-01',end=year==='all'?null:year+'-12-31';
    const source={invoices:(input.invoices||[]).filter(x=>text(x.customer_key)===key),payments:(input.payments||[]).filter(x=>text(x.matched_customer_key)===key)};
    const settled=settlement(source,end||'all'),data=projected(settled),account=settled.accountByCustomer.get(key),opening=start?settlement(source,(Number(year)-1)+'-12-31').accountByCustomer.get(key):null;
    const invoices=data.invoices.filter(x=>x.customerKey===key&&x.day&&(!end||x.day<=end));
    const payments=data.payments.filter(x=>x.customerKey===key&&x.day&&(!end||x.day<=end));
    const openingBalance=opening?.due||0;
    const visibleInvoices=invoices.filter(x=>!start||x.day>=start),visiblePayments=payments.filter(x=>!start||x.day>=start);
    const monthKeys=[...new Set([...visibleInvoices.map(x=>x.day.slice(0,7)),...visiblePayments.map(x=>x.day.slice(0,7))])].sort();
    const months=monthKeys.map(month=>{
      const inv=visibleInvoices.filter(x=>x.day.startsWith(month)),pay=visiblePayments.filter(x=>x.day.startsWith(month));
      const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate(),prior=new Date(Date.UTC(y,m-1,0)).toISOString().slice(0,10);
      const before=settlement(source,prior).accountByCustomer.get(key),after=settlement(source,month+'-'+String(last).padStart(2,'0')).accountByCustomer.get(key);
      const issued=sum(inv.map(x=>x.value)),paid=sum(pay.map(x=>applied(settled,x.row.unique_key))),unallocated=sum(pay.map(x=>unpaid(settled,x.row.unique_key)));
      return {month,invoices:inv.map(x=>{const a=settled.invoiceByKey.get(text(x.row.unique_key));return {...x.row,settled_amount:a?.allocated||0,credited_amount:a?.credited||0,remaining_amount:a?.remaining||0};}).sort(byDate('issue_date')),
        payments:pay.map(x=>{const a=settled.paymentByKey.get(text(x.row.unique_key));return {...x.row,settled_amount:a?.allocated||0,unallocated_amount:a?.unallocated||0,settlement_reason:a?.reasonText||''};}).sort(byDate('payment_date')),
        issued,paid,rawPaid:sum(pay.map(x=>x.value)),unallocated,openingBalance:before?.due||0,netBalance:after?.due||0,due:after?.due||0,advance:after?.unallocated||0};
    }).reverse();
    return {customerKey:key,year,openingBalance,months,issued:sum(visibleInvoices.map(x=>x.value)),paid:sum(visiblePayments.map(x=>applied(settled,x.row.unique_key))),rawPaid:sum(visiblePayments.map(x=>x.value)),unallocated:sum(visiblePayments.map(x=>unpaid(settled,x.row.unique_key))),closingBalance:account?.due||0,due:account?.due||0,advance:account?.unallocated||0,issues:settled.issues};
  }
  const api={won,sum,date,settlement,dashboard,customerMonths};root.DFErpDashboard=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
