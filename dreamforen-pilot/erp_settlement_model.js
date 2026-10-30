/* DREAMFOREN Beta 3.62 · invoice-before-receipt settlement projection.
 * Read-only: source invoices, bank rows, customer matches and notes are never changed.
 * Cash can settle only invoices issued by its date; unused cash never carries forward.
 */
(function(root){
  'use strict';
  const text=v=>String(v??'').trim();
  function won(value){
    const raw=text(value);if(raw===''||raw==='-')return 0;
    const clean=raw.replace(/[,\s₩원]/g,'');
    if(!/^-?\d+(?:\.0+)?$/.test(clean)||!Number.isSafeInteger(Number(clean)))throw Error('원 단위 정수 금액을 확인해주세요.');
    return Number(clean);
  }
  function sum(values){let total=0;for(const value of values){total+=won(value);if(!Number.isSafeInteger(total))throw Error('금액 합계가 안전한 정수 범위를 벗어났습니다.');}return total;}
  function date(value){
    const raw=value instanceof Date&&!isNaN(value)?value.toISOString().slice(0,10):text(value).slice(0,10),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return '';const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
    return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?raw:'';
  }
  const chronological=(a,b)=>a.day.localeCompare(b.day)||a.key.localeCompare(b.key);
  const reasons={applied:'계산서에 반영',before_invoice:'계산서 발행 전 입금',no_open_invoice:'입금일 기준 미수 계산서 없음',excess_payment:'발행된 계산서 잔액을 초과한 금액',invalid_date:'입금일 확인 필요',missing_customer:'연결 업체 확인 필요',non_positive_payment:'양수 입금액 확인 필요'};
  function settle(input={}){
    const end=input.asOf===undefined||input.asOf===null||input.asOf==='all'?null:date(input.asOf);
    if(input.asOf!==undefined&&input.asOf!==null&&input.asOf!=='all'&&!end)throw Error('조회 기준일을 확인해주세요.');
    const issues=[],invoiceByKey=new Map(),paymentByKey=new Map(),accountByCustomer=new Map(),allocations=[],creditAllocations=[];
    function account(key){if(!accountByCustomer.has(key))accountByCustomer.set(key,{customerKey:key,invoices:[],payments:[],issued:0,billable:0,credited:0,paid:0,due:0,rawPaid:0,unallocated:0,unappliedCredit:0,invoiceCount:0,paymentCount:0});return accountByCustomer.get(key);}
    function read(rows,type){
      const out=[],seen=new Map(),isInvoice=type==='invoice',status=isInvoice?'active':'matched';
      for(const row of rows||[]){
        if(!row||row.status!==status)continue;
        const key=text(row.unique_key);if(!key)throw Error((isInvoice?'계산서':'입금')+' 고유번호를 확인해주세요.');
        const day=date(row[isInvoice?'issue_date':'payment_date']),amount=won(row[isInvoice?'total_amount':'amount']),customerKey=text(row[isInvoice?'customer_key':'matched_customer_key']);
        const identity=JSON.stringify([day,amount,customerKey]);
        if(seen.has(key)){if(seen.get(key)!==identity)throw Error('같은 거래 고유번호의 내용이 다릅니다: '+key);issues.push({type,key,reason:'duplicate',amount});continue;}seen.set(key,identity);
        if(day&&end&&day>end)continue;
        const x={key,customerKey,day,amount,row:{...row},included:!!day&&!!customerKey,allocated:0};
        if(!day){issues.push({type,key,reason:'date',amount});x.reason='invalid_date';}
        if(!customerKey){issues.push({type,key,reason:'customer',amount});x.reason='missing_customer';}
        if(isInvoice){Object.assign(x,{credited:0,netAmount:Math.max(0,amount),remaining:Math.max(0,amount),creditApplied:0,unappliedCredit:0,allocations:[],creditAllocations:[]});invoiceByKey.set(key,x);}
        else{
          Object.assign(x,{unallocated:amount,allocations:[],reason:x.reason||'no_open_invoice'});
          if(amount<=0){x.included=false;x.reason='non_positive_payment';issues.push({type,key,reason:'non_positive_payment',amount});}
          paymentByKey.set(key,x);
        }
        out.push(x);
        if(x.included)account(customerKey)[isInvoice?'invoices':'payments'].push(x);
      }
      return out.sort(chronological);
    }
    const invoices=read(input.invoices,'invoice'),payments=read(input.payments,'payment');
    const accounts=[...accountByCustomer.values()].sort((a,b)=>a.customerKey.localeCompare(b.customerKey));
    for(const a of accounts){
      a.invoices.sort(chronological);a.payments.sort(chronological);
      const positive=a.invoices.filter(x=>x.amount>0),negative=a.invoices.filter(x=>x.amount<0);
      // Contra invoices reduce existing invoice capacity before cash allocation. Prefer the
      // same-day, same-amount correction pair; do not consume an older periodic bill first.
      for(const credit of negative){
        let left=-credit.amount;
        const item=text(credit.row.item_name),rank=x=>x.day===credit.day?(x.amount===-credit.amount?(text(x.row.item_name)===item?0:1):2):3;
        const candidates=positive.filter(x=>x.day<=credit.day&&x.netAmount>0).sort((x,y)=>rank(x)-rank(y)||chronological(x,y));
        for(const invoice of candidates){
          const amount=Math.min(left,invoice.netAmount);if(!amount)continue;
          const link={creditKey:credit.key,invoiceKey:invoice.key,customerKey:a.customerKey,amount,method:rank(invoice)<=1?'same_day_equal_amount':rank(invoice)===2?'same_day_capacity':'prior_invoice_capacity'};
          invoice.credited=sum([invoice.credited,amount]);invoice.netAmount=sum([invoice.amount,-invoice.credited]);invoice.remaining=invoice.netAmount;invoice.creditAllocations.push(link);
          credit.creditApplied=sum([credit.creditApplied,amount]);credit.creditAllocations.push(link);creditAllocations.push(link);left-=amount;if(!left)break;
        }
        credit.netAmount=0;credit.remaining=0;credit.unappliedCredit=left;
        if(left)issues.push({type:'invoice',key:credit.key,customerKey:a.customerKey,reason:'unapplied_credit',amount:left});
      }
      for(const payment of a.payments){
        let left=payment.amount;
        const eligible=positive.filter(x=>x.day<=payment.day&&x.remaining>0);
        for(const invoice of eligible){
          const amount=Math.min(left,invoice.remaining);if(!amount)continue;
          const link={paymentKey:payment.key,invoiceKey:invoice.key,customerKey:a.customerKey,amount,paymentDate:payment.day,invoiceDate:invoice.day};
          invoice.allocated=sum([invoice.allocated,amount]);invoice.remaining=sum([invoice.netAmount,-invoice.allocated]);invoice.allocations.push(link);
          payment.allocated=sum([payment.allocated,amount]);payment.allocations.push(link);allocations.push(link);left-=amount;if(!left)break;
        }
        payment.unallocated=left;
        payment.reason=!left?'applied':payment.allocated?'excess_payment':!positive.some(x=>x.day<=payment.day)?'before_invoice':'no_open_invoice';
      }
      a.issued=sum(a.invoices.map(x=>x.amount));a.billable=sum(positive.map(x=>x.netAmount));a.credited=sum(positive.map(x=>x.credited));
      a.paid=sum(a.payments.map(x=>x.allocated));a.rawPaid=sum(a.payments.map(x=>x.amount));a.unallocated=sum(a.payments.map(x=>x.unallocated));a.due=sum(positive.map(x=>x.remaining));
      a.unappliedCredit=sum(negative.map(x=>x.unappliedCredit));a.invoiceCount=a.invoices.length;a.paymentCount=a.payments.length;
      a.balance=sum([a.issued,-a.paid]);
      if(a.rawPaid!==sum([a.paid,a.unallocated])||a.billable!==sum([a.paid,a.due])||a.issued!==sum([a.billable,-a.unappliedCredit]))throw Error('계산서·입금 배분 금액을 대조하지 못했습니다.');
    }
    for(const payment of payments)payment.reasonText=reasons[payment.reason]||payment.reason;
    const totals={issued:sum(accounts.map(x=>x.issued)),billable:sum(accounts.map(x=>x.billable)),credited:sum(accounts.map(x=>x.credited)),paid:sum(accounts.map(x=>x.paid)),due:sum(accounts.map(x=>x.due)),rawPaid:sum(accounts.map(x=>x.rawPaid)),unallocated:sum(accounts.map(x=>x.unallocated)),unappliedCredit:sum(accounts.map(x=>x.unappliedCredit)),invoiceCount:accounts.reduce((n,x)=>n+x.invoiceCount,0),paymentCount:accounts.reduce((n,x)=>n+x.paymentCount,0)};
    return {asOf:end||'all',accounts,accountByCustomer,invoices,invoiceByKey,payments,paymentByKey,allocations,creditAllocations,issues,totals,policy:'invoice-before-receipt-no-forward-cash-v362'};
  }
  const api={settle,won,sum,date};root.DFErpSettlement=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
