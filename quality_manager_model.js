(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DFQualityManagerModel=api;})(typeof window!=='undefined'?window:globalThis,function(){'use strict';
 const norm=s=>String(s??'').replace(/\s/g,'').replace(/[·ㆍ․・]/g,'').toLowerCase();
 const kind=key=>/^DFEN-QM-\d{2}$/.test(key)?'manual':/^DFEN-QP-\d{2}$/.test(key)?'procedure':/^DFEN-QI-\d{2}$/.test(key)?'instruction':'form';
 const validKey=k=>/^DFEN-Q(?:M|P|I)-\d{2}$|^DFEN-Q(?:PF|IF)-\d{2}-\d{2}$/.test(k);
 const rev=v=>v!==null&&v!==''&&Number.isInteger(Number(v))?'Rev.'+String(v).padStart(2,'0'):'미설정';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const reviewId=(scope,key,year)=>scope+':'+key+':'+year;
 function reviewState(record,index,date=today()){
  if(!record)return {code:'todo',label:'검토 필요',stale:false,overdue:false};
  const snapshot=record.snapshot||[],byKey=new Map(index.map(x=>[x.doc_key,x]));
  const stale=snapshot.some(x=>!byKey.has(x.key)||byKey.get(x.key).stamp!==x.stamp);
  const overdue=!!record.due_date&&record.due_date<date&&!['reviewed','not_applicable'].includes(record.status);
  if(stale&&['reviewed','not_applicable'].includes(record.status))return {code:'stale',label:'변경 후 재검토',stale:true,overdue};
  if(overdue)return {code:'overdue',label:'기한 경과',stale,overdue:true};
  return {code:record.status,label:({todo:'검토 필요',in_progress:'보완 중',reviewed:'검토 완료',not_applicable:'해당 없음'})[record.status]||'검토 필요',stale,overdue};
 }
 function score(items,records,index,year){
  let total=0,excluded=0,earned=0,unassessed=0,reviewed=0;
  for(const item of items){total+=item.points;const r=records.find(x=>x.scope==='assessment'&&x.item_key===item.id&&x.record_year===year),s=reviewState(r,index);
   if(!r||s.code==='stale'||!['reviewed','not_applicable'].includes(r.status)||r.result==='unassessed'){unassessed++;continue;}
   reviewed++;if(r.result==='na'&&r.status==='not_applicable')excluded+=item.points;else if(r.result==='pass')earned+=item.points;
  }
  return {total,excluded,earned,unassessed,reviewed,ratio:unassessed||total===excluded?null:earned/(total-excluded)*100};
 }
 function suggest(item,index){
  const n=item.group.startsWith('2.')?Number(item.group.split('.')[1])+1:Number(item.group.split('.')[1])+11;
  const manual='DFEN-QM-'+String(n).padStart(2,'0');
  const synonyms={'2.1':['조직'],'2.2':['품질시스템'],'2.3':['문서관리'],'2.4':['시험의뢰','계약'],'2.5':['위탁'],'2.6':['물품구매'],'2.7':['고객','불만'],'2.8':['부적합'],'2.9':['기록관리'],'2.10':['내부정도관리','내부심사'],'3.1':['직원'],'3.2':['시설','환경조건'],'3.3':['시험방법'],'3.4':['시험장비','표준물질'],'3.5':['시료채취'],'3.6':['시료관리'],'3.7':['시험결과의보증'],'3.8':['결과보고'],'3.9':['리스크']};
  return index.filter(d=>d.doc_key===manual||d.kind!=='manual'&&!d.doc_key.endsWith('-00')&&(synonyms[item.group]||[]).some(x=>norm(d.title).includes(norm(x)))).map(d=>d.doc_key);
 }
 function catalog(index,register=[],revisions=[],reviews=[],year=Number(today().slice(0,4))){
  const reg=new Map(register.map(r=>[r.doc_code,r]));
  return index.map(d=>{const working=revisions.filter(r=>r.doc_key===d.doc_key&&['draft','submitted'].includes(r.status)),registration=reg.get(d.doc_key),r=reviews.find(x=>x.scope==='document'&&x.item_key===d.doc_key&&x.record_year===year),review=reviewState(r,index);
   const conflict=working.length>1||registration&&registration.status!=='obsolete'&&Number(registration.revision)!==Number(d.revision);
   return {...d,working:working[0]||null,registration,review,record:r,conflict:!!conflict,issue:conflict?'번호 기준 확인':registration?.status==='obsolete'?'폐지':d.status==='source'?'기준자료 · 미승인':d.has_correction?'번호 유지 수정본':'승인본'};
  });
 }
 function auditDocument(doc,index,register,parsed){
  const out=[],known=new Map(index.map(d=>[d.doc_key,d]));for(const r of register)if(!known.has(r.doc_code))known.set(r.doc_code,{...r,doc_key:r.doc_code,title:r.document_title||r.title||r.doc_code});
  const add=(type,target,detail)=>{if(!out.some(x=>x.type===type&&x.target===target&&x.detail===detail))out.push({document:doc.doc_key,type,target,detail});};
  const reg=register.find(r=>r.doc_code===doc.doc_key);
  if(reg&&reg.status!=='obsolete'&&Number(reg.revision)!==Number(doc.revision))add('conflict',doc.doc_key,'현재 본문 '+rev(doc.revision)+' / 등록대장 '+rev(reg.revision));
  if(doc.status==='source')add('unapproved',doc.doc_key,'현재 기준자료의 승인·시행 여부 확인');
  for(const h of parsed.headers||[])if(h.revision!=null&&h.revision!==Number(doc.revision))add('source',doc.doc_key,'저장 원문 머리말 '+rev(h.revision)+' / 현재 표시 '+rev(doc.revision)+' · 원문 표기 차이');
  const tocCounts=new Map();for(const t of parsed.toc||[]){tocCounts.set(t.key,(tocCounts.get(t.key)||0)+1);const d=known.get(t.key);if(!d)add('reference',t.key,'목차 대상 미등록 또는 조회 권한 확인 필요');else if(Number(t.revision)!==Number(d.revision))add('source',t.key,'저장 원문 목차 '+rev(t.revision)+' / 현재 표시 '+rev(d.revision)+' · 자동 표시값과 원문 구분');}
  for(const [key,n]of tocCounts)if(n>1)add('toc',key,'목차에 '+n+'회 연결');
  for(const r of parsed.references||[])if(!known.has(r.key))add('reference',r.key,'본문 참조 대상 미등록 또는 조회 권한 확인 필요');
  return out;
 }
 const ITEMS=['먼지','매연','황산화물','질소산화물','일산화탄소','염화수소','불소화물','암모니아','황화수소','시안화수소','염소','이황화탄소','VOCs','PAHs','브롬','페놀','포름알데히드','총탄화수소','중금속','비소','수은'];
 function parseItems(raw){
  const tokens=String(raw||'').split(/[,，、;；/\n+]+/).map(x=>x.trim()).filter(Boolean),out=new Set(),unknown=[];
  const aliases={dust:'먼지',so2:'황산화물',sox:'황산화물',no2:'질소산화물',nox:'질소산화물',co:'일산화탄소',hcl:'염화수소',hf:'불소화물',nh3:'암모니아',h2s:'황화수소',hcn:'시안화수소',cl2:'염소',cs2:'이황화탄소',voc:'VOCs',vocs:'VOCs',pah:'PAHs',pahs:'PAHs',thc:'총탄화수소',hg:'수은',as:'비소',arsenic:'비소',mercury:'수은',metal:'중금속',metals:'중금속',pb:'중금속',cd:'중금속',cr:'중금속',cu:'중금속',zn:'중금속',ni:'중금속',mn:'중금속',be:'중금속',납:'중금속',카드뮴:'중금속',크롬:'중금속',구리:'중금속',아연:'중금속',니켈:'중금속',망간:'중금속',베릴륨:'중금속',불소:'불소화물',플루오린화합물:'불소화물',불소화합물:'불소화물',포름알데하이드:'포름알데히드',총탄화수소:'총탄화수소',탄화수소:'총탄화수소'};
  for(const t of tokens){const n=norm(t).replace(/\([^)]*\)/g,'');const v=ITEMS.find(x=>norm(x)===n)||aliases[n];if(v)out.add(v);else unknown.push(t);}
  return {items:[...out],unknown};
 }
 function sourceRows(rows){
  const valid=rows.filter(r=>!r.archived_at&&!r.deleted_at&&r.measurement_no&&r.measurement_no!=='X'&&r.measurement_date),groups=new Map();
  for(const r of valid){const k=String(r.measurement_no).trim();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
  return [...groups.entries()].map(([receipt,copies])=>{copies.sort((a,b)=>String(a.id).localeCompare(String(b.id)));const r=copies[0],fields=['measurement_date','target_site','facility','measurement_items'];const conflict=copies.some(x=>fields.some(f=>norm(x[f])!==norm(r[f])));return {...r,receipt,source_ids:copies.map(x=>x.id),duplicate:copies.length>1,conflict,...parseItems(r.measurement_items)};});
 }
 function workload(rows,assignments,year,settings){
  const configs=settings?.details?.criteria||[],daily=[],warnings=[],byKey=new Map(assignments.filter(x=>x.scope==='workload').slice().sort((a,b)=>String(a.updated_at||'').localeCompare(String(b.updated_at||''))).map(x=>[x.item_key,x]));
  for(const r of sourceRows(rows)){const a=byKey.get(r.receipt)?.details||{},items=a.items||r.items,team=a.team||'',date=r.measurement_date;let issues=[];
   const stale=!!a.source_snapshot&&['measurement_date','measurement_items','target_site','facility'].some(k=>norm(a.source_snapshot[k])!==norm(r[k]));
   if(stale)issues.push('원자료 변경 후 집계 지정 재확인');if(r.conflict)issues.push('동일 접수번호의 원자료가 다름');if(r.unknown.length&&!a.items)issues.push('미분류 항목: '+r.unknown.join(', '));if(!team)issues.push('측정팀 지정 필요');
   if(issues.length)warnings.push({row:r,reasons:issues});
   if(!stale&&!r.conflict&&team&&(!r.unknown.length||a.items))for(const item of items)if(date.startsWith(String(year)))daily.push({date,team,item,receipt:r.receipt,source_id:r.id,facility:r.facility,site:r.target_site||r.request_org});
   if(!stale&&!r.conflict&&a.analysis_date){for(const item of a.analysis_items||items.filter(x=>!['먼지','매연','황산화물','질소산화물','일산화탄소','총탄화수소'].includes(x)))if(a.analysis_date.startsWith(String(year)))daily.push({date:a.analysis_date,team:'분석',item,receipt:r.receipt,source_id:r.id,facility:r.facility,site:r.target_site||r.request_org});}
  }
  const groups=new Map();for(const r of daily){const k=[r.date,r.team,r.item].join('|');if(!groups.has(k))groups.set(k,{date:r.date,team:r.team,item:r.item,count:0,receipts:[],source_ids:[]});const g=groups.get(k);g.count++;g.receipts.push(r.receipt);g.source_ids.push(r.source_id);}
  const summary=[...groups.values()].map(g=>{const c=configs.find(x=>x.team===g.team&&x.item===g.item);const appropriate=settings?.details?.confirmed?(c?.daily_override??(c&&c.daily_method==='hours/time'&&c.hours>0&&c.time>0?c.hours/c.time:null)):null;return {...g,capacity:appropriate,ratio:appropriate>0?g.count/appropriate:null,status:appropriate==null?'기준 확인 필요':appropriate===0?'기준 0 · 검토 필요':g.count>appropriate?'초과 · 조치 필요':'기준 이내'};}).sort((a,b)=>b.date.localeCompare(a.date)||a.team.localeCompare(b.team)||ITEMS.indexOf(a.item)-ITEMS.indexOf(b.item));
  return {daily,summary,warnings,sources:sourceRows(rows),unassigned:sourceRows(rows).filter(r=>!byKey.get(r.receipt)?.details?.team).length,analysisWaiting:sourceRows(rows).filter(r=>!byKey.get(r.receipt)?.details?.analysis_date).length};
 }
 function csv(rows){const protect=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return '\ufeff'+rows.map(r=>r.map(protect).join(',')).join('\r\n');}
 function annual(daily,settings){const map=new Map();for(const r of daily){const key=r.team+'|'+r.item;if(!map.has(key))map.set(key,{team:r.team,item:r.item,months:Array(12).fill(0),total:0});const x=map.get(key);x.months[Number(r.date.slice(5,7))-1]++;x.total++;}return [...map.values()].map(r=>{const c=settings?.details?.criteria?.find(x=>x.team===r.team&&x.item===r.item),appropriate=settings?.details?.confirmed&&c&&c.hours>0&&c.time>0&&c.weight!=null&&c.days>0?c.hours/c.time*c.weight*c.days:null,maximum=appropriate!=null&&c.factor>=1?appropriate*c.factor:null;return {...r,appropriate,maximum,ratio:appropriate>0?r.total/appropriate:null,status:appropriate==null?'기준 확인 필요':r.total<=appropriate?'적정건수 이내':maximum!=null&&r.total<=maximum?'적정 초과 · 최대 이내 · 검토 필요':'최대 초과 · 조치 필요'};}).sort((a,b)=>a.team.localeCompare(b.team)||ITEMS.indexOf(a.item)-ITEMS.indexOf(b.item));}
 return {norm,kind,validKey,rev,today,reviewId,reviewState,score,suggest,catalog,auditDocument,ITEMS,parseItems,sourceRows,workload,annual,csv};
});
