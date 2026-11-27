/* Deterministic bid analysis. No probability of winning is inferred from these samples. */
(function(root){
  'use strict';
  const START='[DF-BID-ANALYSIS:1]', END='[/DF-BID-ANALYSIS]', MAX_HISTORY=200;
  const text=v=>String(v??'').trim();
  function number(v){
    if(v===null||v===undefined||typeof v==='boolean')return null;
    const s=text(v).replace(/,/g,'');
    if(!s||!/^\d+(?:\.\d+)?$/.test(s))return null;
    const n=Number(s);return Number.isFinite(n)&&n<=Number.MAX_SAFE_INTEGER?n:null;
  }
  const norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  const titleKey=v=>norm(text(v).replace(/(?:19|20)\d{2}\s*년(?:도)?/g,'').replace(/\((?:재공고|정정공고)\)/g,''));
  const agencyKey=v=>norm(v).replace(/^경기도(?=성남시)/,'').replace(/^성남시청$/,'성남시');
  function similarity(a,b){
    const parts=v=>new Set(text(v).replace(/(?:19|20)\d{2}\s*년(?:도)?/g,'').split(/[\s·,()[\]]+/).map(norm).filter(x=>x&& !['용역','대행','년','년도'].includes(x)));
    const A=parts(a),B=parts(b);if(!A.size||!B.size)return 0;
    return [...A].filter(x=>B.has(x)).length/Math.max(A.size,B.size);
  }
  function readMemo(memo){
    const s=String(memo??''),i=s.lastIndexOf(START),j=s.indexOf(END,i);
    if(i<0||j<0||text(s.slice(j+END.length)))return {text:s,meta:{}};
    try{
      const meta=JSON.parse(s.slice(i+START.length,j));
      if(!meta||Array.isArray(meta)||typeof meta!=='object'||meta.version!==1)return {text:s,meta:{}};
      return {text:s.slice(0,i).replace(/\n\n$/,''),meta};
    }catch(_){return {text:s,meta:{}};}
  }
  function writeMemo(memo,meta={}){
    const plain=readMemo(memo).text;
    return plain+'\n\n'+START+'\n'+JSON.stringify({...meta,version:1})+'\n'+END;
  }
  function noticeNo(value){
    const s=text(value),direct=s.match(/^(R\d{2}BK\d{8}|\d{11})(?:[-/](\d{2,3}))?$/i);
    if(direct)return direct[1].toUpperCase()+'-'+(direct[2]||'000').padStart(3,'0');
    try{const u=new URL(s),id=u.searchParams.get('bidPbancNo')||u.searchParams.get('bidno');
      if(id)return noticeNo(id+'-'+(u.searchParams.get('bidPbancOrd')||'000'));
    }catch(_){}
    const match=s.match(/https?:\/\/[^\s<>]+/g)||[];
    for(const url of match){try{const u=new URL(url),id=u.searchParams.get('bidPbancNo');if(id)return noticeNo(id+'-'+(u.searchParams.get('bidPbancOrd')||'000'));}catch(_){}}
    return '';
  }
  function safeUrl(value){try{const u=new URL(text(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
  function baseAmount(record){const base=number(record?.base_amount);return base>0?base*(record.vat_mode==='excluded'?1.1:1):null;}
  function dateValue(value){
    if(!text(value))return NaN;
    const s=text(value),zoned=/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
    return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s)?s+'T00:00:00+09:00':zoned?s:s.replace(' ','T')+'+09:00');
  }
  const ceilWon=v=>Math.ceil(v-1e-7);
  function cleanHistory(rows){
    if(!Array.isArray(rows)||rows.length>MAX_HISTORY)throw Error('개찰자료는 한 번에 200건까지 등록할 수 있습니다.');
    return rows.map((row,i)=>{
      if(!row||typeof row!=='object'||Array.isArray(row))throw Error((i+1)+'행: 자료 형식을 확인해주세요.');
      const title=text(row.title).slice(0,500),agency=text(row.agency).slice(0,300),base=number(row.base_amount),win=number(row.winning_amount),rate=number(row.lower_rate),date=text(row.deadline);
      if(!title||!agency||!(base>0)||!(win>0)||!(rate>0&&rate<=100)||!Number.isFinite(dateValue(date)))throw Error((i+1)+'행: 입찰명·기관·개찰일·기초금액·낙찰금액·하한율을 확인해주세요.');
      const vat= row.vat_mode==='excluded'?'excluded':'included';
      const estimate=number(row.actual_estimated_price),range=number(row.range_percent);
      if(range===null||range>=100)throw Error((i+1)+'행: 예가범위를 입력해주세요. 예: ±3%이면 3');
      return {title,agency,base_amount:base,winning_amount:win,lower_rate:rate,deadline:date,vat_mode:vat,
        range_percent:range,actual_estimated_price:estimate,notice_no:noticeNo(row.notice_no),
        source_url:safeUrl(row.source_url),source_label:text(row.source_label||'등록한 개찰자료').slice(0,200),status:'completed'};
    });
  }
  function normalizeRecord(row,origin){
    const meta=readMemo(row.memo).meta;
    return {...row,origin,actual_estimated_price:number(row.actual_estimated_price??meta.actual_estimated_price),
      notice_no:noticeNo(row.notice_no||meta.notice_no||row.memo),pricing_method:row.pricing_method||meta.pricing_method||'floor',
      source_url:safeUrl(row.source_url||meta.source_url),source_label:row.source_label||meta.source_label||(origin==='public'?'공개 개찰자료':'저장된 개찰결과')};
  }
  function historyFor(target,records=[],publicHistory=[],now=Date.now()){
    const targetMeta=readMemo(target.memo).meta,targetNo=noticeNo(target.notice_no||targetMeta.notice_no||target.memo),targetDate=dateValue(target.deadline);
    const cutoff=Math.min(now,Number.isFinite(targetDate)?targetDate:now),pool=[],seen=new Map(),excluded={unfinished:0,incompatible:0,invalid:0,unrelated:0,duplicate:0,self:0,future:0};
    for(const record of records){
      pool.push(normalizeRecord(record,'saved'));
      const h=readMemo(record.memo).meta.history;
      if(Array.isArray(h))for(const row of h.slice(0,MAX_HISTORY))pool.push(normalizeRecord(row,'imported'));
    }
    for(const row of (Array.isArray(targetMeta.history)?targetMeta.history:[]).slice(0,MAX_HISTORY))pool.push(normalizeRecord(row,'imported'));
    for(const row of publicHistory)pool.push(normalizeRecord(row,'public'));
    for(const row of pool){
      if((target.id&&row.id===target.id)||(targetNo&&row.notice_no===targetNo)){excluded.self++;continue;}
      if(!['won','lost','completed'].includes(row.status)){excluded.unfinished++;continue;}
      const date=dateValue(row.deadline);
      if(!Number.isFinite(date)){excluded.invalid++;continue;}
      if(date>=cutoff){excluded.future++;continue;}
      const base=baseAmount(row),win=number(row.winning_amount),rate=number(row.lower_rate),range=number(row.range_percent);
      if(!(base>0)||!(win>0)||!(rate>0&&rate<=100)){excluded.invalid++;continue;}
      if(row.pricing_method!=='floor'||Math.abs(rate-number(target.lower_rate))>.00005||(range!==null&&Math.abs(range-number(target.range_percent))>.00005)){excluded.incompatible++;continue;}
      const max=1+number(target.range_percent)/100,min=1-number(target.range_percent)/100;
      const equivalent=win/base/(rate/100),actual=row.actual_estimated_price;
      if(equivalent<min-1e-6||win>base*max||actual!==null&&(actual<base*min-1||actual>base*max+1||win<ceilWon(actual*rate/100)||win>actual)){excluded.invalid++;continue;}
      const sameAgency=agencyKey(target.agency)&&agencyKey(row.agency)===agencyKey(target.agency),exact=titleKey(target.title)&&titleKey(row.title)===titleKey(target.title);
      if(!sameAgency||!exact&&similarity(target.title,row.title)<.7){excluded.unrelated++;continue;}
      const key=row.notice_no||(row.title&&row.agency?agencyKey(row.agency)+'|'+titleKey(row.title)+'|'+text(row.deadline).slice(0,10):row.id);
      const normalized={...row,base,win,rate,date,tier:exact?1:2,winRatio:win/base,assessment:actual!==null?actual/base*100:null,equivalentAssessment:equivalent*100};
      const existing=seen.get(key);
      if(existing){excluded.duplicate++;if(existing.origin!=='public')continue;}
      seen.set(key,normalized);
    }
    const all=[...seen.values()],tier=all.some(x=>x.tier===1)?1:2;
    return {rows:all.filter(x=>x.tier===tier).sort((a,b)=>b.date-a.date),tier,excluded};
  }
  function outcome(bid,estimate,rate,winner){
    if(!(bid>0))return {code:'empty',label:'금액 미입력'};
    if(!(estimate>0))return {code:'unknown',label:'예정가격 미확정'};
    const floor=ceilWon(estimate*rate/100);
    if(bid<floor)return {code:'below',label:'하한미달',floor,gap:floor-bid};
    if(bid>estimate)return {code:'above',label:'예정가격 초과',floor,gap:bid-estimate};
    if(winner>0&&bid>winner)return {code:'higher',label:'하한 충족 · 낙찰가 초과',floor,gap:bid-winner};
    return {code:'eligible',label:winner>0?'가격조건 충족 · 자격·동가 확인':'가격조건 충족',floor};
  }
  function analyze(target,records=[],publicHistory=[],options={}){
    const base=baseAmount(target),rate=number(target.lower_rate),range=number(target.range_percent),method=target.pricing_method||readMemo(target.memo).meta.pricing_method||'floor';
    const invalid=!base||!(rate>0&&rate<=100)||range===null||range<0||range>=100||method!=='floor';
    if(invalid)return {valid:false,recommended:null,count:0,rows:[],message:method!=='floor'?'이 낙찰방식은 별도 검토가 필요합니다.':'기초금액·낙찰하한율·예가 범위를 확인해주세요.'};
    const selection=historyFor(target,records,publicHistory,options.now??Date.now()),rows=selection.rows;
    const low=ceilWon(base*(1-range/100)*rate/100),high=ceilWon(base*(1+range/100)*rate/100),neutral=ceilWon(base*rate/100);
    const raw=rows.length?base*rows.reduce((s,x)=>s+x.winRatio,0)/rows.length:neutral;
    const recommended=rows.length?Math.max(low,Math.min(high,Math.round(raw/100)*100)):neutral;
    const own=number(target.our_bid_amount),winner=number(target.winning_amount),actual=number(target.actual_estimated_price??readMemo(target.memo).meta.actual_estimated_price);
    const assessmentFor=v=>v>0?v/(base*rate/100)*100:null;
    const actualValid=actual>0&&actual>=base*(1-range/100)-1&&actual<=base*(1+range/100)+1;
    const result=outcome(own,actualValid?actual:null,rate,winner);
    const warnings=[];
    if(!rows.length)warnings.push('비교 가능한 개찰자료가 없어 사정률 100%의 하한금액만 표시합니다.');
    else if(rows.length<5)warnings.push('비교자료 '+rows.length+'건으로 표본이 적습니다. 낙찰확률을 계산할 수 없습니다.');
    else warnings.push('과거 개찰자료의 평균 환산값이며, 낙찰확률은 검증되지 않았습니다.');
    if(actual>0&&!actualValid)warnings.push('입력한 예정가격이 예가 범위를 벗어납니다. 값을 확인해주세요.');
    const chosen=own>0?own:recommended;
    const scenarios=[-1,-.5,-.1,0,.5,1].filter(d=>Math.abs(d)<=range).map(d=>{const assessment=100+d,estimate=base*assessment/100;return {assessment,estimate,...outcome(chosen,estimate,rate,null)};});
    if(!scenarios.length)scenarios.push({assessment:100,estimate:base,...outcome(chosen,base,rate,null)});
    return {valid:true,base,rate,range,low,high,neutral,recommended,raw,count:rows.length,rows,selection,
      method:rows.length?'비교자료 단순평균 · 기초금액 비례 환산':'사정률 100% 기준 계산',
      sampleLabel:rows.length<5?'자료 부족':rows.length<20?'참고자료':'비교자료 축적',
      maxOwnAssessment:assessmentFor(own),maxRecommendedAssessment:assessmentFor(recommended),
      actualEstimate:actualValid?actual:null,ownOutcome:result,chosen,scenarios,warnings,
      ratio:recommended/base*100,observedMin:rows.length?Math.min(...rows.map(x=>base*x.winRatio)):null,observedMax:rows.length?Math.max(...rows.map(x=>base*x.winRatio)):null};
  }
  /* Annual amounts are deliberately separate from the imported/public history.
     A winning amount only yields an equivalent (estimated) assessment rate;
     the actual assessment still requires the actual estimated price. */
  function validateAnnual(annualRows,fallbackRate){
    const rows=[],errors=[],years=new Map(),defaultRate=number(fallbackRate);
    if(!Array.isArray(annualRows)||annualRows.length>MAX_HISTORY)return {rows,errors:[{index:-1,message:'연도별 금액은 200행까지 입력할 수 있습니다.'}],count:0};
    annualRows.forEach((source,index)=>{
      const row=source&&typeof source==='object'&&!Array.isArray(source)?source:null;
      if(!row){errors.push({index,message:'입력 내용을 확인해주세요.'});return;}
      // The editor starts an empty amount row with its year and rate prefilled.
      if(!text(row.base_amount)&&!text(row.winning_amount))return;
      const year=number(row.year),base=number(row.base_amount),win=number(row.winning_amount);
      const rate=text(row.lower_rate)?number(row.lower_rate):defaultRate;
      const item={index,year,base_amount:base,winning_amount:win,lower_rate:rate,assessment:null};
      let message='';
      if(!Number.isInteger(year)||year<1900||year>9999)message='연도는 1900~9999 사이의 정수로 입력해주세요.';
      else if(!Number.isSafeInteger(base)||base<=0||!Number.isSafeInteger(win)||win<=0)message='기초금액과 낙찰금액을 양의 정수로 입력해주세요.';
      else if(!(rate>0&&rate<=100))message='낙찰하한율은 0보다 크고 100 이하로 입력해주세요.';
      else if(years.has(year))message='같은 연도는 한 행만 입력해주세요.';
      if(!message){
        item.assessment=win/(base*(rate/100))*100;
        if(!Number.isFinite(item.assessment))message='금액과 낙찰하한율을 확인해주세요.';
        else years.set(year,index);
      }
      if(message){item.error=message;errors.push({index,message});}
      rows.push(item);
    });
    return {rows,errors,count:rows.filter(row=>!row.error).length};
  }
  // Keep won rounding exact: binary floating point can add a spurious won to
  // an otherwise exact amount when annual/current bases are large.
  function annualWon(target,rows,rate){
    const gcd=(a,b)=>{while(b){const next=a%b;a=b;b=next;}return a;};
    const reduce=(n,d)=>{const common=gcd(n,d);return {n:n/common,d:d/common};};
    const fraction=value=>{
      const parts=String(value).toLowerCase().split('e'),decimal=parts[0].split('.');
      const digits=decimal.join(''),scale=(decimal[1]?.length||0)-Number(parts[1]||0);
      return scale>=0?reduce(BigInt(digits),10n**BigInt(scale)):reduce(BigInt(digits)*10n**BigInt(-scale),1n);
    };
    let sum={n:0n,d:1n};
    for(const row of rows){
      const historical=fraction(row.lower_rate),term=reduce(BigInt(row.winning_amount)*100n*historical.d,BigInt(row.base_amount)*historical.n);
      sum=reduce(sum.n*term.d+term.n*sum.d,sum.d*term.d);
    }
    const current=fraction(rate);
    let n=sum.n*BigInt(number(target.base_amount))*current.n,d=sum.d*BigInt(rows.length)*current.d*100n;
    if(target.vat_mode==='excluded'){n*=11n;d*=10n;}
    const rounded=(n+d-1n)/d;
    return rounded>BigInt(Number.MAX_SAFE_INTEGER)?null:Number(rounded);
  }
  function analyzeAnnual(target={},annualRows=[]){
    const targetBase=baseAmount(target),targetRate=number(target.lower_rate);
    const method=target.pricing_method||readMemo(target.memo).meta.pricing_method||'floor';
    const checked=validateAnnual(annualRows,targetRate),rows=checked.rows;
    const result={valid:false,rows,errors:checked.errors,count:checked.count,averageAssessment:null,recommended:null,targetBase,targetRate,message:'',outOfRange:false};
    if(method!=='floor'){result.message='이 낙찰방식은 별도 검토가 필요합니다.';return result;}
    const inputBase=number(target.base_amount);
    if(!Number.isSafeInteger(inputBase)||inputBase<=0||!Number.isFinite(targetBase)||targetBase>Number.MAX_SAFE_INTEGER||!(targetRate>0&&targetRate<=100)){
      result.message='이번 기초금액과 낙찰하한율을 확인해주세요.';return result;
    }
    if(checked.errors.length){result.message=checked.errors[0].message;return result;}
    if(!rows.length){result.valid=true;result.message='연도별 기초금액과 낙찰금액을 입력해주세요.';return result;}
    const average=rows.reduce((total,row)=>total+row.assessment/rows.length,0);
    const recommended=annualWon(target,rows,targetRate);
    if(!Number.isSafeInteger(recommended)||recommended<=0){result.message='계산금액의 범위를 확인해주세요.';return result;}
    const range=number(target.range_percent);
    result.valid=true;result.averageAssessment=average;result.recommended=recommended;
    result.outOfRange=range!==null&&range>=0&&range<100&&(average<100-range-1e-8||average>100+range+1e-8);
    return result;
  }
  const api={number,norm,titleKey,agencyKey,noticeNo,safeUrl,baseAmount,dateValue,readMemo,writeMemo,cleanHistory,historyFor,outcome,analyze,validateAnnual,analyzeAnnual,MAX_HISTORY};
  root.DFBidAnalysisModel=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
