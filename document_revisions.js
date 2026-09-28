/* Current approved form metadata. Historical originals remain immutable. */
(function(){'use strict';
 let rows=new Map(),identity='',inflight=null,channel=null,client=null,sequence=0,lastLoaded=0;
 const user=()=>typeof dfCloudUser!=='undefined'?dfCloudUser:null,db=()=>typeof dfSupabase!=='undefined'?dfSupabase:null;
 const key=s=>String(s||'').trim().toUpperCase().replace(/\s*\(\d+\)\s*$/,'');
 const BASE={'DFEN-QPF-14-01':{doc_code:'DFEN-QPF-14-01',revision:8,status:'active',request_id:null}};
 const get=code=>rows.get(key(code))||BASE[key(code)]||null;
 const label=(code,fallback=key(code))=>{const r=get(code);return r?r.doc_code+' · Rev.'+String(r.revision).padStart(2,'0')+(r.status==='obsolete'?' · 폐지':''):fallback;};
 function paint(){
  document.querySelectorAll('[data-df-document-code]').forEach(el=>{const value=label(el.dataset.dfDocumentCode);if(el.textContent!==value)el.textContent=value;});
  for(const [selector,code] of [['.qpf-pledge-sheet footer span:nth-child(2)','DFEN-QPF-01-03'],['.qic-footer span:nth-child(2)','DFEN-QIF-01-02'],['.qif-form-footer span:nth-child(2)','DFEN-QIF-01-01'],['.qcr-sheet footer span:nth-child(2)','DFEN-QPF-02-02']]){
   const r=get(code);if(r)document.querySelectorAll(selector).forEach(el=>{const value='Rev. '+String(r.revision).padStart(2,'0')+(r.status==='obsolete'?' · 폐지':'');if(el.textContent!==value)el.textContent=value;});
  }
  const title=document.getElementById('dfDocTitle'),match=title?.textContent.match(/^(DFEN-Q(?:PF|IF)-\d{2}-\d{2})\s*\(\d+\)/),current=match&&get(match[1]);
  if(current){const next=title.textContent.replace(match[0],current.doc_code+' ('+String(current.revision).padStart(2,'0')+')');if(next!==title.textContent)title.textContent=next;}
  const r=get('DFEN-QPF-14-01'),print=document.getElementById('btnPrint');let badge=document.getElementById('dfSampleRevision');
  if(r&&print&&!badge){badge=document.createElement('span');badge.id='dfSampleRevision';badge.className='badge';print.parentNode.append(badge);}
  if(badge){badge.hidden=!r;badge.textContent=r?label('DFEN-QPF-14-01'):'';}
 }
 async function refresh(force=false){
  const id=user()?.id,api=db();if(!id||!api){sequence++;rows.clear();identity='';paint();return [];}
  if(identity!==id){sequence++;rows.clear();identity=id;inflight=null;lastLoaded=0;if(channel&&client)client.removeChannel(channel);channel=null;}
  if(inflight)return inflight;if(force!==true&&Date.now()-lastLoaded<5000)return [...rows.values()];const token=sequence;
  inflight=(async()=>{let all=[];for(let from=0;;from+=500){const r=await api.from('quality_document_register').select('*').order('doc_code').range(from,from+499);if(r.error){if(!/42P01|PGRST205/.test(r.error.code||''))console.warn('문서 REV 동기화:',r.error.message);return [...rows.values()];}all.push(...r.data);if(r.data.length<500)break;}
   if(user()?.id!==id||token!==sequence)return [];const changed=JSON.stringify([...rows.values()])!==JSON.stringify(all);rows=new Map(all.map(r=>[r.doc_code,r]));lastLoaded=Date.now();paint();if(changed)document.dispatchEvent(new CustomEvent('df:document-revisions-loaded',{detail:{rows:all}}));
   if(!channel&&api.channel){client=api;channel=api.channel('document-revisions-'+id).on('postgres_changes',{event:'*',schema:'public',table:'quality_document_register'},()=>refresh()).subscribe();}return all;
  })();try{return await inflight;}finally{if(token===sequence)inflight=null;}
 }
 window.DF_DOCUMENT_REVISIONS={get,label,refresh,rev(code,fallback){const r=get(code);return r?String(r.revision).padStart(2,'0'):fallback;},list:()=>[...rows.values()],snapshot(code){const r=get(code);return r?{doc_code:r.doc_code,revision:r.revision,status:r.status,request_id:r.request_id}:null;}};
 document.addEventListener('df:quality-revision-changed',()=>refresh(true));document.addEventListener('df:menu-permissions-changed',refresh);
 window.addEventListener('focus',()=>refresh(true));window.addEventListener('beforeprint',paint);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 setInterval(()=>{if(!document.hidden&&user())refresh();},30000);
 function start(){refresh();const title=document.getElementById('dfDocTitle');if(title)new MutationObserver(paint).observe(title,{childList:true,subtree:true,characterData:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
