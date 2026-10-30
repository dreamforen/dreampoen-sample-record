/* DREAMFOREN Beta3.57 · pure conservative payment identity matching.
 * A non_revenue decision classifies a retained bank row; it never deletes it.
 */
(function(root){
 'use strict';
 const str=v=>String(v??'').trim();
 const nf=v=>str(v).normalize('NFKC').toLowerCase();
 function norm(v){return nf(v).replace(/농업회사법인|어업회사법인|학교법인|사회복지법인|재단법인|사단법인|주식회사|유한책임회사|유한회사/g,'').replace(/\((?:주|유|재|사|학)\)|<(?:주|유|재|사|학)>|^(?:주|유|재|사|학)\)/g,'').replace(/[^0-9a-z가-힣]/g,'');}
 const compact=v=>nf(v).replace(/[^0-9a-z가-힣]/g,'');
 const brand=v=>norm(v).replace(/kgm/g,'케이지모빌리티');
 function core(v){return brand(v).replace(/자동차|공업사|서비스센터|서비스|종합정비|정비공장|모터스|정비/g,'');}
 const generic=new Set(['현대','기아','우리','제일','중앙','삼성','대성','대한','한국','자동차','공업사','모터스','서비스','정비','주식','농업회사법인','케이지모빌리티','르노코리아','한국지엠','현대자동차']);
 const reps=v=>[...new Set(nf(v).replace(/외\s*\d+\s*명/g,'').split(/[,/·;&\n]+/).map(x=>x.replace(/[^가-힣a-z]/g,'')).filter(x=>x.length>=2&&x.length<=20))];
 function tokens(v){const raw=nf(v),parts=raw.split(/[\s,./()\[\]{}<>\-_:]+/).map(norm).filter(Boolean);return [...new Set([norm(raw),...parts])];}
 function won(v){const s=str(v).replace(/[,\s₩원]/g,'');if(!s)return 0;if(!/^-?\d+(?:\.0+)?$/.test(s)||!Number.isSafeInteger(Number(s)))throw Error('입금액은 원 단위 정수여야 합니다.');return Number(s);}
 function bizNumbers(v){return [...nf(v).matchAll(/(?:^|[^0-9])(\d{3})[-\s]?(\d{2})[-\s]?(\d{5})(?=[^0-9]|$)/g)].map(m=>m[1]+m[2]+m[3]);}
 function distance(a,b){let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next;}return prev[b.length];}
 function transactionMethod(p){return str(p.method||p.transaction_method||p.import_meta?.transaction_method||(p.import_meta?.bank_fields||[]).find(x=>/거래방식|거래방법|거래구분/.test(x.label||''))?.value);}
 const response=(decision,reason,extra={})=>({decision,key:null,method:null,reason,category:decision==='non_revenue'?'other_non_sales':null,candidates:[],...extra});
 function createMatcher(context={}){
  const inv=context.invoices||[],totals=new Map(),invoiceAmounts=new Map();
  for(const i of inv.filter(x=>x?.status==='active')){const key=str(i.customer_key),value=won(i.total_amount);totals.set(key,(totals.get(key)||0)+value);if(!Number.isSafeInteger(totals.get(key)))throw Error('계산서 합계가 정수 범위를 벗어났습니다.');if(value>0){if(!invoiceAmounts.has(key))invoiceAmounts.set(key,new Set());invoiceAmounts.get(key).add(value);}}
  const customers=(context.customers||[]).filter(c=>str(c.customer_key)&&totals.get(str(c.customer_key))>0).map(c=>({...c,key:str(c.customer_key),name:brand(c.company_name),core:core(c.company_name),representatives:reps(c.representative),biz:str(c.biz_no||c.customer_key).replace(/\D/g,'')}));
  const keys=new Set(customers.map(c=>c.key)),repOwners=new Map();
  for(const c of customers)for(const r of c.representatives){if(!repOwners.has(r))repOwners.set(r,new Set());repOwners.get(r).add(c.key);}
  const ownCompanies=new Set((context.ownCompanyNames||[]).map(norm).filter(Boolean)),ownReps=new Set((context.ownRepresentativeNames||[]).flatMap(reps)),ownBiz=new Set((context.ownBusinessNumbers||[]).map(v=>str(v).replace(/\D/g,'')));
  const aliases=(context.aliases||[]).filter(a=>keys.has(str(a.customer_key))&&norm(a.alias_name).length>=2);
  function matchPayment(p){
   const value=won(p.amount??p.deposit),payer=str(p.depositor_name??p.payer),description=str(p.description),raw=payer+' '+description,method=transactionMethod(p),dep=brand(payer),desc=brand(description),toks=[...new Set([...tokens(payer),...tokens(description)].map(brand).filter(Boolean))],numbers=bizNumbers(raw);
   const fullNames=[dep,desc].filter(Boolean),prefixTokens=[...new Set([
    ...fullNames,
    ...tokens(payer).map(brand).filter(t=>t!==dep&&!dep.startsWith(t)),
    ...tokens(description).map(brand).filter(t=>t!==desc&&!desc.startsWith(t))
   ])];
   if(value<=0)return response('non_revenue','입금액이 없는 거래입니다.',{category:'non_deposit'});
   if(/^(?:결제|승인|매입|카드)?취소$/.test(method))return response('non_revenue','은행 거래구분이 취소인 환입금입니다.',{category:'cancellation_refund'});
   if(/^(?:예금|결산)?이자$/.test(method)||/^20\d{2}년?결산(?:이자)?$/.test(compact(payer))||/결산이자|예금이자|이자지급|이자입금/.test(compact(description)))return response('non_revenue','예금 결산·이자 입금입니다.',{category:'interest'});
   const ownPayer=ownCompanies.has(norm(payer))||ownReps.has(norm(payer))||bizNumbers(payer).some(n=>ownBiz.has(n));
   if(ownPayer){
    if(customers.some(c=>c.name.length>=2&&desc===c.name&&!ownCompanies.has(c.name)))return response('review','자사 입금자명과 외부 계산서 업체 메모가 함께 있어 확인이 필요합니다.',{category:'conflicting_internal_transfer'});
    return response('non_revenue','확인된 자사명·자사 대표자 계좌이체입니다.',{category:'internal_transfer'});
   }
   if(/^과오납(?:고용|산재|실업|연금|임채|보험)/.test(compact(payer)))return response('non_revenue','과오납·보험료 환급금입니다.',{category:'tax_insurance_refund'});
   const evidence=new Map(),hints=new Map(),exactKeys=new Set(),representativeKeys=new Set(),aliasKeys=new Set(),add=(c,score,reason,method)=>{const old=evidence.get(c.key);if(!old||score>old.score)evidence.set(c.key,{key:c.key,company_name:c.company_name,score,reason,method});};
   function confirmed(hit,candidates){
    const company=customers.find(c=>c.key===hit.key),shared=company?.representatives.filter(r=>repOwners.get(r)?.size>1)||[];
    if(shared.length&&(!invoiceAmounts.get(hit.key)?.has(value)||value>totals.get(hit.key))){
     const related=new Set(shared.flatMap(r=>[...repOwners.get(r)]));
     return response('review','같은 대표자의 여러 사업장 대금이 합쳐졌을 수 있습니다. 분할 여부를 확인해주세요.',{category:'possible_combined_payment',candidates:customers.filter(c=>related.has(c.key)).map(c=>({key:c.key,company_name:c.company_name,score:c.key===hit.key?hit.score:500,reason:c.key===hit.key?hit.reason:'같은 대표자의 다른 계산서 업체'}))});
    }
    return response('match',hit.reason,{key:hit.key,method:hit.method,candidates});
   }
   const bizHits=customers.filter(c=>c.biz.length===10&&numbers.includes(c.biz));
   if(bizHits.length===1){const hit={key:bizHits[0].key,company_name:bizHits[0].company_name,score:1000,method:'business_number',reason:'사업자번호가 일치합니다.'};return confirmed(hit,[hit]);}
   if(bizHits.length>1)return response('review','서로 다른 업체 사업자번호가 함께 있습니다.',{candidates:bizHits.map(c=>({key:c.key,company_name:c.company_name,score:1000}))});
   for(const c of customers){
    if(c.name.length>=2&&(dep===c.name||desc===c.name)){add(c,940,'업체명 전체 일치','company_exact');exactKeys.add(c.key);}
    if(c.name.length>=4&&toks.some(t=>t===c.name)){add(c,920,'거래내용의 업체명 전체 일치','company_token');exactKeys.add(c.key);}
    for(const r of c.representatives)if(toks.some(t=>norm(t)===r)){
     if(repOwners.get(r)?.size===1){add(c,900,'해당 계산서 업체에서만 사용하는 대표자명 일치','representative_unique');representativeKeys.add(c.key);}
     else hints.set(c.key,{key:c.key,company_name:c.company_name,score:500,reason:'여러 업체가 사용하는 대표자명'});
    }
    if(c.name.length>=4&&[dep,desc].some(t=>t.startsWith(c.name)&&/^(?:주식회?|자가측정료?|측정(?:료|비|수수료)|용역(?:료|비)|입금|대금|수수료)$/.test(t.slice(c.name.length))))add(c,880,'업체명 뒤에 명시된 측정·입금 메모 일치','company_memo_suffix');
    // A long complete bank memo overrides its shorter token fragments. E.g.
    // '케이지모빌리티 오산' must not turn the generic brand token into four hits.
    const usable=prefixTokens.filter(t=>t.length>=4&&!generic.has(t));
    if(usable.some(t=>c.name.startsWith(t)&&t.length/c.name.length>=0.4))add(c,800,'은행에서 잘린 업체명 접두부 일치','company_prefix');
    if(c.core.length>=4&&!generic.has(c.core)&&usable.some(t=>core(t)===c.core))add(c,780,'사업장 고유명과 정비업 표기 차이 일치','company_core');
   }
   for(const a of aliases)if(toks.includes(brand(a.alias_name))){add(customers.find(c=>c.key===str(a.customer_key)),930,'사용자가 저장한 직접매칭 이름 일치','manual_alias');aliasKeys.add(str(a.customer_key));}
   const ranked=[...evidence.values()].sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
   const strong=[exactKeys,representativeKeys,aliasKeys].filter(set=>set.size);
   if(strong.length){
    const agreement=[...strong[0]].filter(key=>strong.every(set=>set.has(key)));
    if(agreement.length===1){const hit=ranked.find(c=>c.key===agreement[0]);return confirmed({...hit,method:strong.length>1?'identity_corroborated':hit.method},ranked);}
    return response('review',agreement.length?'동일한 이름으로 발행된 업체가 여러 곳입니다.':'업체명·대표자명·직접매칭 단서가 서로 다릅니다.',{candidates:ranked});
   }
   if(ranked.length===1&&ranked[0].score>=780)return confirmed(ranked[0],ranked);
   if(ranked.length>1)return response('review','업체명·대표자명 단서가 여러 업체에 걸립니다.',{candidates:ranked});
   if(hints.size)return response('review','같은 대표자명으로 발행된 업체가 여러 곳입니다.',{candidates:[...hints.values()]});
   const fuzzy=[];
   for(const c of customers){let best=0;for(const t of toks.filter(x=>x.length>=7&&!generic.has(x))){if(Math.abs(t.length-c.name.length)>1)continue;const d=distance(t,c.name),sim=1-d/Math.max(t.length,c.name.length);if(d===1&&sim>=0.85)best=Math.max(best,sim);}if(best){const due=context.dueByCustomer instanceof Map?context.dueByCustomer.get(c.key):context.dueByCustomer?.[c.key],amountCorroborates=won(due)===value||invoiceAmounts.get(c.key)?.has(value);fuzzy.push({key:c.key,company_name:c.company_name,score:Math.round(best*100),similarity:best,amountCorroborates,reason:'긴 업체명 한 글자 차이',method:'company_typo_amount'});}}
   fuzzy.sort((a,b)=>b.similarity-a.similarity||a.key.localeCompare(b.key));
   // Even a unique one-character typo plus a common invoice amount can belong
   // to a different business (e.g. 유림/해림). Show candidates, never assign it.
   if(fuzzy.length)return response('review','비슷한 업체명이 있어 직접 확인이 필요합니다.',{candidates:fuzzy});
   if(value<=10&&/^(?:기보|인증|계좌확인|계좌인증)/.test(compact(payer)))return response('non_revenue','금융기관 계좌 인증용 소액 입금입니다.',{category:'account_verification'});
   if(/(?:은행|카드|캐피탈|보증기금|쿠콘|비바리퍼블리카)$/.test(norm(payer)))return response('review','금융기관 입금의 성격을 직접 확인해주세요.',{category:'unconfirmed_financial'});
   return response('review','계산서 업체와 연결할 고유한 이름 단서가 없습니다.');
  }
  return {matchPayment,customers:customers.map(c=>({key:c.key,company_name:c.company_name})),version:357};
 }
 const api={norm,brand,core,transactionMethod,createMatcher,matchPayment:(p,context)=>createMatcher(context).matchPayment(p)};root.DFErpMatching=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
