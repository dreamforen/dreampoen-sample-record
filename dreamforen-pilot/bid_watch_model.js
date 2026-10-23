/* Beta 3.47: source-scoped links from the public G2B unified list. */
/* Beta 3.21: public notice helpers. This file contains no API credentials. */
(function(root){
  'use strict';
  const text=v=>String(v??'').trim(), norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  function isoKst(value){
    const s=value instanceof Date?value.toISOString():text(value);if(!s)return null;
    const hasZone=/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
    const local=s.replace(' ','T');
    if(!hasZone&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local))return null;
    const time=Date.parse(hasZone?s:local+'+09:00');return Number.isFinite(time)?new Date(time).toISOString():null;
  }
  function inputKst(value){const s=isoKst(value);return s?new Date(Date.parse(s)+32400000).toISOString().slice(0,16):'';}
  function formatKst(value){return inputKst(value).replace('T',' ')||'미정';}
  function apiDate(value){return new Date(Number(value)+32400000).toISOString().slice(0,16).replace(/[-:T]/g,'');}
  function safeUrl(value){try{
    const u=new URL(text(value));if(u.username||u.password)return '';
    const g2b=['https:','http:'].includes(u.protocol)&&(u.hostname==='g2b.go.kr'||u.hostname.endsWith('.g2b.go.kr'));
    const kogas=u.protocol==='https:'&&u.host==='www.kogas.or.kr'&&!u.hash&&u.pathname==='/site/koGas/referenceBidList.do'
      &&u.searchParams.get('Key')==='1050105010000'&&u.searchParams.get('searchCnd')==='RB010200'
      &&!!u.searchParams.get('searchKrwd')&&u.searchParams.get('searchKrwd').length<=500
      &&[...u.searchParams.keys()].every(k=>['Key','searchCnd','searchKrwd'].includes(k));
    return g2b||kogas?u.href:'';
  }catch(_){return '';}}
  function noticeUrl(n){
    const original=safeUrl(n?.detail_url);if(original)return original;
    const c=n?.content||n;
    if(c?.source!=='g2b_unified'||c?.unified_external!==true)return '';
    try{
      const u=new URL(text(n.detail_url));
      // Only explicit links supplied by the G2B external-notice list; never fetched by this app.
      if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>2000)return '';
      if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(u.hostname)||u.hostname.includes('xn--'))return '';
      if(/\.(?:localhost|local|localdomain|internal|invalid|test|example|lan|home|corp)$/.test(u.hostname))return '';
      return u.href;
    }catch(_){return '';}
  }
  function number(value){const s=text(value).replace(/,/g,'');if(!s)return null;const n=Number(s);return Number.isFinite(n)&&n>=0?n:null;}
  function notice(item,regions=[],licenses=[],base=[]){
    const id=text(item.bidNtceNo);if(!id||id.length>80||/[\u0000-\u001f\u007f]/.test(id)||!text(item.bidNtceNm))throw Error('SOURCE_NOTICE_INVALID');
    return {id:'servc:'+id,notice_no:id,revision:number(item.bidNtceOrd)||0,title:text(item.bidNtceNm).slice(0,500),
      agency:text(item.ntceInsttNm||item.dminsttNm).slice(0,300),published_at:isoKst(item.bidNtceDt||item.rgstDt),
      deadline:isoKst(item.bidClseDt),kind:text(item.ntceKindNm).slice(0,100),cancelled:/취소/.test(text(item.ntceKindNm)),
      estimated_price:number(item.presmptPrce),base_amount:number(base[0]?.bssamt),lower_rate:number(item.sucsfbidLwltRate),
      regions:[...new Set(regions.map(r=>text(r.prtcptPsblRgnNm)).filter(Boolean))].sort(),
      licenses:[...new Set(licenses.map(r=>text(r.lcnsLmtNm||r.permsnIndstrytyList)).filter(Boolean))].sort(),
      method:text(item.cntrctCnclsMthdNm),award_method:text(item.sucsfbidMthdNm),change_reason:text(item.chgNtceRsn),
      detail_url:safeUrl(item.bidNtceDtlUrl||item.bidNtceUrl),
      documents:Array.from({length:10},(_,i)=>({name:text(item['ntceSpecFileNm'+(i+1)]),url:safeUrl(item['ntceSpecDocUrl'+(i+1)])})).filter(d=>d.url),
      region_limited:text(item.cmmnSpldmdCorpRgnLmtYn)==='Y',license_limited:text(item.indstrytyLmtYn)==='Y'};
  }
  function match(n,s){
    const hay=norm(n.title+' '+n.agency),hits=(s.keywords||[]).filter(k=>hay.includes(norm(k)));
    if(!hits.length||(s.excluded_keywords||[]).some(k=>norm(k)&&hay.includes(norm(k))))return {matched:false,hits,reason:'검색어 조건'};
    if(s.min_amount!=null&&n.estimated_price!=null&&n.estimated_price<Number(s.min_amount)||s.max_amount!=null&&n.estimated_price!=null&&n.estimated_price>Number(s.max_amount))return {matched:false,hits,reason:'금액 조건'};
    const wanted=(s.regions||[]).filter(k=>norm(k)&&norm(k)!=='전국');
    if(wanted.length&&n.regions.length&&!n.regions.some(r=>norm(r).includes('전국')||wanted.some(k=>norm(r).includes(norm(k)))))return {matched:false,hits,reason:'참가 가능 지역'};
    return {matched:true,hits,reason:n.regions.length?'검색어·참가지역 확인':'검색어 일치 · 지역은 원문 확인'};
  }
  function stable(value){if(value instanceof Date)return JSON.stringify(value.toISOString());if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
  async function digest(value){const data=new TextEncoder().encode(stable(value));const hash=await root.crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');}
  function validSummary(v){return !!v&&typeof v.relevance==='boolean'&&Number.isInteger(v.score)&&v.score>=0&&v.score<=100&&['summary','reason','eligibility_note'].every(k=>typeof v[k]==='string'&&v[k].length<=1800)&&Array.isArray(v.checkpoints)&&v.checkpoints.length<=8&&v.checkpoints.every(x=>typeof x==='string'&&x.length<=500);}
  const api={norm,isoKst,inputKst,formatKst,apiDate,safeUrl,noticeUrl,number,notice,match,stable,digest,validSummary};
  root.DFBidModel=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);


