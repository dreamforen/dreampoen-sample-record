/* DREAMFOREN expense board: pure dates/amounts, no credentials or stored records. */
(function(root){'use strict';
 const marker='DF_APPROVAL_FORM_V1\n';
 function form(d){try{const c=String(d?.content||'');if(!c.startsWith(marker))return null;const p=JSON.parse(c.slice(marker.length));return p.version===1&&p.template==='expense'&&p.data&&typeof p.data==='object'&&!Array.isArray(p.data)?p.data:null;}catch{return null;}}
 function isLeave(d){if(!d||d.deleted_at)return false;try{const c=String(d.content||'');if(c.startsWith(marker)){const p=JSON.parse(c.slice(marker.length));if(p.version===1&&p.data&&typeof p.data==='object'&&!Array.isArray(p.data)){if(p.template==='annual_leave')return true;if(p.template==='expense')return false;}}}catch(_){}return d.doc_type==='leave'||!!d.leave_request_id;}
 function isExpense(d){return !!d&&!d.deleted_at&&!isLeave(d)&&(d.doc_type==='purchase'||form(d)!==null);}

 function time(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:null;}
 function date(v){if(/^\d{4}-\d{2}-\d{2}$/.test(v||'')){const t=time(v+'T00:00:00+09:00');return t!==null&&new Date(t+32400000).toISOString().slice(0,10)===v?v:'';}const t=time(v);return t===null?'':new Date(t+32400000).toISOString().slice(0,10);}
 function kstTimestamp(v){const t=time(v);return t===null?v:new Date(t+32400000).toISOString().replace('Z','+09:00');}
 function approvedAt(d,steps=[],logs=[]){
  if(d.status!=='approved')return '';
  if(time(d.completed_at)!==null)return d.completed_at;
  const floor=time(d.submitted_at)??time(d.created_at)??-Infinity;
  const candidates=steps.filter(s=>s.document_id===d.id&&s.status==='approved').map(s=>s.acted_at)
   .concat(logs.filter(l=>l.document_id===d.id&&l.action==='approved').map(l=>l.created_at))
   .filter(v=>time(v)!==null&&time(v)>=floor).sort((a,b)=>time(b)-time(a));
  return candidates[0]||'';
 }
 function amount(d){const p=form(d);if(!p||!Array.isArray(p.items)||p.items.length>12)return null;let n=0,entered=false;for(const row of p.items){if(!row||typeof row!=='object')return null;const raw=String(row.amount??'').replace(/,/g,'').trim();if(!raw)continue;entered=true;const v=Number(raw);if(!Number.isSafeInteger(v)||v<0)return null;n+=v;if(!Number.isSafeInteger(n))return null;}return entered?n:null;}
 function entry(d,state={}){const p=form(d),who=(state.profiles||[]).find(x=>x.id===d.requester_id)||{};return {document:d,id:d.id,title:d.title||'',number:d.approval_no||'',requester:who.name||'직원',status:d.status,
  created:date(d.created_at),submitted:date(d.submitted_at),approved:date(approvedAt(d,state.steps,state.logs)),written:date(p?.applicationDate),amount:amount(d),bank:p?.bankInfo||'',
  attachments:(state.files||[]).filter(f=>f.document_id===d.id).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)))};}
 function month(e,basis='approved'){return e[basis]?.slice(0,7)||'';}
 function months(entries,basis,today=new Date().toISOString()){return [...new Set([date(today).slice(0,7),...entries.map(e=>month(e,basis))].filter(Boolean))].sort().reverse();}
 function filter(entries,{basis='approved',monthKey='all'}={}){return entries.filter(e=>monthKey==='all'||(monthKey==='unknown'?!month(e,basis):month(e,basis)===monthKey)).sort((a,b)=>String(b[basis]||'').localeCompare(String(a[basis]||''))||String(b.document.created_at||'').localeCompare(String(a.document.created_at||''))||String(a.id).localeCompare(String(b.id)));}
 function metrics(entries){let amount=0n,unknown=0,approved=0,approvedAmount=0n;for(const e of entries){if(e.amount===null)unknown++;else amount+=BigInt(e.amount);if(e.status==='approved'){approved++;if(e.amount!==null)approvedAmount+=BigInt(e.amount);}}return {count:entries.length,amount,unknown,approved,approvedAmount};}
 function fileKind(f){const mime=String(f.mime_type||'').toLowerCase(),name=String(f.file_name||'').toLowerCase();if(mime==='application/pdf'||name.endsWith('.pdf'))return 'pdf';if(/^image\/(png|jpeg|jpg|webp|gif|bmp)$/.test(mime)||/\.(png|jpe?g|webp|gif|bmp)$/.test(name))return 'image';return 'unsupported';}
 function selected(entries,ids){const wanted=new Set(ids);return entries.filter(e=>wanted.has(e.id));}
 const api={form,isLeave,isExpense,date,kstTimestamp,approvedAt,amount,entry,month,months,filter,metrics,fileKind,selected};root.DFExpenseModel=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

