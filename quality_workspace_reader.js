/* Current-document print reader. Sources and approved snapshots remain read-only. */
(function(){'use strict';
 const $=id=>document.getElementById(id),C=window.DFQualityCore,B=parent!==window?parent.DFQualityBridge:null;
 const titles={manual:'품질 매뉴얼',procedure:'품질 절차서',instruction:'품질 지침서'};
 const R={kind:'manual',identity:null,sources:[],records:[],stamp:'',loading:null,queued:false,disposed:false,valid:false,overflow:false,selected:null,generation:0};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const result=async query=>{const r=await query;if(r.error)throw r.error;return r.data;};
 const rev=n=>'Rev.'+String(n).padStart(2,'0');
 const stamp=rows=>JSON.stringify(rows.map(r=>[r.doc_key,r.basis_id,r.basis_version,r.lock_version,r.revision,r.title,r.updated_at]).sort((a,b)=>a[0].localeCompare(b[0])));
 function api(){const c=B?.context();if(!c?.user||!c.api||c.user.id!==R.identity)throw Error('로그인이 변경되었습니다. 품질문서 메뉴를 다시 열어주세요.');if(!B.can(R.kind,'view'))throw Error('문서 조회 권한이 없습니다.');return c.api;}
 function message(text){if(R.disposed)return;$('readerMessage').textContent=text;$('readerMessage').hidden=!text;}
 function failed(e){if(R.disposed)return;R.valid=false;$('readerPrint').disabled=true;$('readerStatus').textContent='최신 내용 확인 필요';message(String(e?.message||e));}
 const run=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>message(String(e?.message||e)));
 function fit(){const choice=$('readerZoom').value,width=$('readerCanvas').clientWidth-32;const scale=choice==='fit'?Math.min(1,Math.max(.3,width/(210*96/25.4))):Number(choice)/100;$('readerPages').style.zoom=scale;}
 function jump(key){const page=Array.from($('readerPages').children).find(p=>p.dataset.documentKey===key);if(!page)return;R.selected=key;page.scrollIntoView?.({block:'start',behavior:'auto'});renderToc();}
 function renderToc(){
  const q=$('readerSearch').value.trim().toLowerCase();$('readerToc').innerHTML=R.records.filter(r=>!q||(r.doc_key+' '+r.title).toLowerCase().includes(q)).map(r=>`<button data-reader-key="${esc(r.doc_key)}" class="${r.doc_key===R.selected?'active':''}"><small>${esc(r.doc_key)}</small>${esc(r.title)}<span>${rev(r.revision)}${r.has_correction?' · 수정본':r.status==='source'?' · 기준자료':''}</span></button>`).join('');
  $('readerToc').querySelectorAll('button').forEach(b=>b.onclick=()=>jump(b.dataset.readerKey));
 }
 function setControls(loading){$('readerKind').disabled=loading;$('readerPrint').disabled=loading||!R.valid||R.overflow;$('readerRefresh').disabled=loading;}
 async function load(force=false){
  if(R.disposed||!force&&(document.hidden||B?.isVisible?.()===false))return;
  if(R.loading){if(force)R.queued=true;return R.loading;}
  const generation=R.generation,kind=R.kind;
  R.loading=(async()=>{
   setControls(true);$('readerStatus').textContent='현재 문서 확인 중…';
   const [sources,index]=await Promise.all([result(api().from('quality_workspace_sources').select('doc_key,kind,title,base_revision,source_sha256').eq('kind',kind).order('doc_key')),result(api().rpc('df_qw_current_index'))]);
   if(R.disposed||generation!==R.generation)return;
   const rows=index.filter(r=>r.kind===kind);R.sources=sources;
   if(!force&&stamp(rows)===R.stamp){$('readerStatus').textContent='현재 저장본 반영됨';return;}
   R.valid=false;$('readerEmpty').hidden=!!rows.length;
   if(!rows.length){R.records=[];R.stamp=stamp(rows);$('readerPages').replaceChildren();renderToc();$('readerPageCount').textContent='';$('readerStatus').textContent='등록된 문서 없음';return;}
   const loaded=[];
   for(let i=0;i<rows.length;i+=4){
    loaded.push(...await Promise.all(rows.slice(i,i+4).map(r=>result(api().rpc('df_qw_current',{p_key:r.doc_key})))));
    if(R.disposed||generation!==R.generation)return;
    $('readerStatus').textContent=`본문 불러오는 중 ${loaded.length}/${rows.length}`;
   }
   const documents=[];
   for(const r of loaded){
    let payload=C.payload(r.payload);if(r.status==='source')payload=(await window.DFQualityNativeFormat.restore(payload,r.doc_key)).payload;
    if(R.disposed||generation!==R.generation)return;
    const status=r.has_correction?'correction':r.status;
    documents.push({payload,meta:{key:r.doc_key,title:r.title,originalTitle:sources.find(s=>s.doc_key===r.doc_key)?.title||r.title,revision:r.revision,status,effectiveDate:r.effective_date},label:r.has_correction?'현재 수정본 · 개정번호 유지 · 별도 결재 없음':r.status==='active'?'승인본':'검토 기준자료 · 미승인'});
   }
   $('readerStatus').textContent='인쇄 미리보기 구성 중…';
   const built=await window.DFQualityPrint.render({documents,records:Object.fromEntries(loaded.map(r=>[r.doc_key,r])),live:true});
   const latest=(await result(api().rpc('df_qw_current_index'))).filter(r=>r.kind===kind);
   if(R.disposed||generation!==R.generation)return;
   if(stamp(loaded)!==stamp(latest)){R.queued=true;$('readerStatus').textContent='방금 저장된 내용 다시 반영 중…';return;}
   $('readerPages').replaceChildren(...built.pages);R.records=latest;R.stamp=stamp(latest);R.valid=true;R.overflow=built.overflow;
   for(const row of $('readerPages').querySelectorAll('[data-qw-toc-target]')){row.tabIndex=0;row.setAttribute('role','link');row.setAttribute('aria-label',row.dataset.qwTocTarget+' 본문으로 이동');}
   renderToc();fit();$('readerPageCount').textContent=built.pages.length+'쪽';$('readerStatus').textContent='현재 저장본 반영됨';message(built.overflow?'인쇄 영역을 초과한 표나 문단이 있습니다. 작업실의 인쇄 미리보기에서 여백과 서식을 확인하세요.':'');
   if(R.selected)jump(R.selected);
  })();
  try{return await R.loading;}catch(e){failed(e);throw e;}finally{R.loading=null;if(!R.disposed){setControls(false);if(R.queued){R.queued=false;setTimeout(()=>load(true).catch(()=>{}),0);}}}
 }
 async function selectKind(kind){
  if(!titles[kind]||!B.can(kind,'view'))throw Error('문서 조회 권한을 확인하세요.');
  R.generation++;if(R.loading)await R.loading.catch(()=>{});R.kind=kind;R.stamp='';R.selected=null;R.valid=false;R.queued=false;
  $('readerKind').value=kind;$('readerTitle').textContent=titles[kind];$('readerOriginalPdf').hidden=kind!=='manual';$('readerZoom').value='100';$('readerPages').replaceChildren();$('readerToc').replaceChildren();$('readerPageCount').textContent='';
  await load(true);
 }
 async function print(){await load(true);if(!R.valid||R.overflow)throw Error('최신 미리보기와 인쇄 영역을 확인한 뒤 다시 인쇄하세요.');window.print();}
 async function originalHwp(){
  const rows=await result(api().from('quality_workspace_files').select('*').eq('kind',R.kind).order('created_at',{ascending:false}));
  const file=rows.find(f=>!f.revision_id&&/\.hwpx?$/i.test(f.name));if(!file)throw Error('원본 HWP가 등록되어 있지 않습니다. 작업실의 원본·첨부파일에서 확인하세요.');
  const blob=await result(api().storage.from('quality-workspace-originals').download(file.path));if(R.disposed)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function dispose(){R.disposed=true;R.generation++;clearInterval(R.poll);}
 function permissionChanged(){const c=B?.context();if(c?.user?.id!==R.identity||!B.can(R.kind,'view')){dispose();$('readerPages').replaceChildren();$('readerToc').replaceChildren();$('readerTitle').textContent='문서 닫힘';$('readerStatus').textContent='로그인·권한 확인 필요';$('readerPrint').disabled=true;R.records=[];R.sources=[];}}
 window.DFQualityWorkspace={getKind:()=>R.kind,getKey:()=>R.selected,sync:()=>load(),selectKind,permissionChanged,dispose,isPending:()=>false,flush:async()=>{},print};
 async function start(){
  if(!B)throw Error('로그인한 업무 사이트의 품질문서 메뉴에서 열어주세요.');R.identity=B.context().user?.id;
  $('readerBack').onclick=run(()=>B.leave());$('readerWorkspace').onclick=run(()=>B.openEditor(R.kind,R.selected));$('readerPrint').onclick=run(print);$('readerRefresh').onclick=run(()=>load(true));$('readerOriginalHwp').onclick=run(originalHwp);$('readerZoom').onchange=fit;$('readerSearch').oninput=renderToc;$('readerKind').onchange=run(()=>selectKind($('readerKind').value));
  const follow=e=>{const row=e.target.closest?.('[data-qw-toc-target]');if(row){e.preventDefault();jump(row.dataset.qwTocTarget);}};$('readerPages').onclick=follow;$('readerPages').onkeydown=e=>{if(e.key==='Enter'||e.key===' ')follow(e);};
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();run(print)();}});
  window.addEventListener('beforeprint',()=>{if(!R.valid||R.overflow){document.body.classList.add('reader-print-blocked');$('readerPages').hidden=true;$('readerMessage').hidden=false;$('readerMessage').textContent='인쇄를 취소하고 최신 미리보기를 확인하세요.';}});window.addEventListener('afterprint',()=>{$('readerPages').hidden=false;document.body.classList.remove('reader-print-blocked');});
  window.addEventListener('resize',fit);window.addEventListener('focus',()=>load().catch(()=>{}));document.addEventListener('visibilitychange',()=>{if(!document.hidden)load().catch(()=>{});});
  for(const o of $('readerKind').options)o.disabled=!B.can(o.value,'view');
  const args=new URLSearchParams(location.search),requested=args.get('kind'),kind=titles[requested]&&B.can(requested,'view')?requested:Object.keys(titles).find(k=>B.can(k,'view'));
  await selectKind(kind);const key=args.get('key');if(key)jump(key);R.poll=setInterval(()=>load().catch(()=>{}),5000);
 }
 start().catch(failed);
})();
