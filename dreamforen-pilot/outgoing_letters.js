/* Contract management · outgoing correspondence, kept separately from sales documents. */
(function(){
  'use strict';
  const by=id=>document.getElementById(id),table='contract_outgoing_letters',pageSize=20;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').trim(),lower=v=>clean(v).normalize('NFKC').toLowerCase();
  const today=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);
  const sender={name:'주식회사 드림포이엔',representative:'하준명',address:'경기도 안양시 만안구 덕천로152번길 25, B동 2005호',phone:'031-420-2156~8',fax:'031-420-2155',email:'naynay2@naver.com'};
  const types={notice:'일반 공문',payment:'내용증명 · 대금 지급 요청'},states={draft:'작성중',sent:'발송완료'};
  const templates={
    notice:{subject:'',body_text:'',detail_text:''},
    payment:{subject:'용역대금 지급 요청 (내용증명)',body_text:[
      '1. 당사는 [계약명]에 따라 [용역명]을 수행하였습니다.',
      '2. [발행일]에 세금계산서를 발행했으며, [기준일] 현재 아래 용역대금의 입금이 확인되지 않았습니다.',
      '3. [지급기한]까지 아래 계좌로 지급하여 주시기 바랍니다. 기한 내 처리가 어렵다면 지급 일정을 회신해 주시기 바랍니다.'
    ].join('\n\n'),detail_text:[
      '가. 계약 및 용역 내역','    1) 계약명:','    2) 수행기간:','    3) 측정 대상 및 항목:','    4) 미지급 금액:                 원 (부가세 포함 여부: )',
      '', '나. 지급 안내','    1) 은행명:','    2) 계좌번호:','    3) 예금주:'
    ].join('\n')}
  };
  const columns='id,document_no,template_kind,issue_date,recipient,subject,status,updated_at,archived_at';
  let rows=[],page=0,requestId=0,editorRequest=0,activeOwner='',activeClient=null,editing=null;
  const api=()=>typeof dfSupabase==='undefined'?null:dfSupabase;
  const user=()=>typeof dfCloudUser==='undefined'?null:dfCloudUser;
  const profile=()=>typeof dfCloudProfile==='undefined'?null:dfCloudProfile;
  function allowed(){
    const u=user(),p=profile();
    return !!(api()&&u?.id&&p&&(!p.id||p.id===u.id)&&p.active!==false&&!p.retired_at&&lower(p.role)==='admin'&&
      !document.body.classList.contains('df-auth-locked')&&(window.DFMenuPermissions?.isAdmin?.()??true));
  }
  function context(){if(!allowed())throw Error('발송용 공문은 관리자 계정으로 열어주세요.');return {client:api(),owner:user().id};}
  const current=c=>allowed()&&c.owner===user()?.id&&c.client===api();
  async function read(c,query){
    const result=await query;
    if(!current(c))throw Error('로그인이 변경되어 공문 처리를 중단했습니다.');
    if(result.error)throw result.error;
    return result.data;
  }
  function message(text){const node=by('dfOutgoingStatus');if(node)node.textContent=text;}
  function explain(e){
    if(['42P01','PGRST204','PGRST205'].includes(e?.code))return '발송용 공문을 사용하려면 배포 파일의 설치 SQL을 먼저 실행해주세요.';
    if(e?.code==='23505')return '이미 사용 중인 공문번호입니다. 번호를 확인해주세요.';
    return e?.message||'공문을 처리하지 못했습니다.';
  }
  function sync(){
    const owner=allowed()?user().id:'',client=owner?api():null;
    if(owner!==activeOwner||client!==activeClient){
      rows=[];page=0;activeOwner=owner;activeClient=client;requestId++;editorRequest++;
      if(editing)closeEditor(true);
      const search=by('dfOutgoingSearch');if(search)search.value='';
      message('');render();
    }
    const open=by('dfOutgoingNew');if(open)open.disabled=!owner;
  }
  function render(){
    const target=by('dfOutgoingList');if(!target)return;
    const q=lower(by('dfOutgoingSearch')?.value),kind=by('dfOutgoingKind')?.value,status=by('dfOutgoingState')?.value;
    const list=rows.filter(r=>(!q||[r.recipient,r.subject,r.document_no].some(t=>lower(t).includes(q)))&&(!kind||r.template_kind===kind)&&
      (status==='archived'?!!r.archived_at:!r.archived_at&&(!status||r.status===status)));
    const pages=Math.max(1,Math.ceil(list.length/pageSize));page=Math.max(0,Math.min(pages-1,page));
    target.innerHTML=list.length?`<table class="df-sales-table df-letter-table"><thead><tr><th scope="col">공문번호</th><th scope="col">제목</th><th scope="col">수신</th><th scope="col">시행일</th><th scope="col">상태</th><th scope="col">관리</th></tr></thead><tbody>${list.slice(page*pageSize,(page+1)*pageSize).map(r=>`
      <tr><td><strong>${esc(r.document_no)}</strong></td><td class="df-letter-subject"><b>${esc(r.subject)}</b><small>${esc(types[r.template_kind]||'공문')}</small></td><td>${esc(r.recipient)}</td><td>${esc(r.issue_date)}</td><td><span class="df-sales-status ${r.status==='sent'?'issued':'draft'}">${esc(r.archived_at?'보관':states[r.status]||r.status)}</span></td><td class="df-letter-row-actions">${r.archived_at?'':`<button type="button" class="company-btn secondary" data-letter-edit="${esc(r.id)}">수정</button> `}<button type="button" class="company-btn secondary" data-letter-preview="${esc(r.id)}">미리보기</button> <button type="button" class="company-btn secondary" data-letter-archive="${esc(r.id)}">${r.archived_at?'복원':'보관'}</button></td></tr>`).join('')}</tbody></table>`:'<p class="df-letter-empty">표시할 공문이 없습니다.</p>';
    by('dfOutgoingPager').hidden=list.length<=pageSize;
    by('dfOutgoingPage').textContent=(page+1)+' / '+pages;
    by('dfOutgoingPrev').disabled=page===0;
    by('dfOutgoingNext').disabled=page+1>=pages;
    by('dfOutgoingTotal').textContent=list.length+'건';
  }
  async function load(){
    sync();if(!allowed())return;
    const c=context(),token=++requestId,loaded=[];
    message('공문 목록을 불러오는 중…');
    try{
      for(let start=0;;start+=500){
        const part=await read(c,c.client.from(table).select(columns).order('issue_date',{ascending:false}).order('id',{ascending:false}).range(start,start+499));
        if(token!==requestId)return;
        loaded.push(...(part||[]));
        if((part?.length||0)<500)break;
      }
      rows=loaded;render();message('');
    }catch(e){if(token===requestId&&current(c))message(explain(e));}
  }
  async function readLetter(c,id,{includeArchived=false}={}){
    let query=c.client.from(table).select('*').eq('id',id);
    if(!includeArchived)query=query.is('archived_at',null);
    const row=await read(c,query.maybeSingle());
    if(!row)throw Error('공문이 이동되었거나 조회할 수 없습니다. 목록을 새로고침해주세요.');
    return row;
  }
  const dialog=()=>by('dfOutgoingEditor'),form=()=>by('dfOutgoingForm');
  function say(text){by('dfOutgoingEditorStatus').textContent=text;}
  function collect(mode){
    const f=form();
    if(!f.reportValidity())return null;
    const values=Object.fromEntries([...new FormData(f)].map(([k,v])=>[k,clean(v)]));
    if(!values.recipient||!values.subject||!values.body_text){say('수신, 제목, 본문을 입력해주세요.');return null;}
    if(mode==='save'&&editing?.row&&!values.document_no){say('공문번호를 입력해주세요.');return null;}
    return values;
  }
  function setType(kind){
    by('dfOutgoingTemplate').textContent=types[kind]||types.notice;
    by('dfOutgoingApplyTemplate').hidden=kind!=='payment';
  }
  function paintEditor(record,c){
    editing={row:record||null,id:record?.id||crypto.randomUUID(),context:c,busy:false,dirty:false};
    const f=form(),data=record||{document_no:'',template_kind:'notice',issue_date:today(),status:'draft'};
    for(const el of f.elements){if(el.name)el.value=data[el.name]??'';}
    f.elements.document_no.required=!!record;
    by('dfOutgoingEditorTitle').textContent=record?'공문 수정':'발송용 공문 작성';
    setType(f.elements.template_kind.value);
    say('');dialog().showModal();
  }
  async function edit(id){
    if(editing)return;
    try{
      const c=context(),token=++editorRequest,row=id?await readLetter(c,id):null;
      if(token!==editorRequest||!current(c)||!visible())return;
      paintEditor(row,c);
    }catch(e){message(explain(e));}
  }
  function closeEditor(force=false){
    if(!editing)return;
    if(!force&&(editing.busy||editing.dirty&&!window.confirm('저장하지 않은 공문 입력을 닫을까요?')))return;
    editing=null;form().reset();busy(false);dialog().close();
  }
  function busy(state){
    by('dfOutgoingSave').disabled=state;
    by('dfOutgoingClose').disabled=state;
    form().querySelector('fieldset').disabled=state;
    by('dfOutgoingPreview').disabled=state;
    by('dfOutgoingSave').textContent=state?'저장 중…':'저장';
  }
  async function save(event){
    event.preventDefault();
    const e=editing;if(!e||e.busy||!current(e.context))return;
    const payload=collect('save');if(!payload)return;
    e.busy=true;busy(true);say('');
    const c=e.context;
    try{
      let row;
      if(e.row){
        row=await read(c,c.client.from(table).update(payload).eq('id',e.id).eq('updated_at',e.row.updated_at).is('archived_at',null).select(columns).maybeSingle());
        if(!row)throw Error('다른 곳에서 공문을 수정했습니다. 화면의 입력은 유지됩니다.');
      }else{
        try{row=await read(c,c.client.from(table).insert({id:e.id,...payload}).select(columns).single());}
        catch(err){
          if(err?.code!=='23505')throw err;
          const saved=await read(c,c.client.from(table).select('*').eq('id',e.id).is('archived_at',null).maybeSingle());
          if(!saved||!Object.keys(payload).every(k=>k==='document_no'&&!payload[k]||String(saved[k]??'')===payload[k]))throw err;
          row=saved;
        }
      }
      if(!row?.id)throw Error('저장 결과를 확인하지 못했습니다.');
      if(editing!==e)return;
      closeEditor(true);
      await load();if(current(c))message(row.document_no+' 저장 완료');
    }catch(error){if(editing===e)say(explain(error));}
    finally{e.busy=false;if(editing===e)busy(false);}
  }
  async function archive(id){
    const row=rows.find(r=>r.id===id);if(!row||!allowed())return;
    const restore=!!row.archived_at;
    if(!restore&&!window.confirm(row.document_no+' 공문을 보관할까요? 보관함에서 다시 열거나 복원할 수 있습니다.'))return;
    try{
      const c=context();
      let query=c.client.from(table).update({archived_at:restore?null:new Date().toISOString()}).eq('id',id).eq('updated_at',row.updated_at);
      query=restore?query.eq('archived_at',row.archived_at):query.is('archived_at',null);
      const out=await read(c,query.select('id').maybeSingle());
      if(!out)throw Error('이미 변경된 공문입니다. 목록을 새로고침해주세요.');
      await load();if(current(c))message(restore?'공문을 복원했습니다.':'공문을 보관했습니다.');
    }catch(e){message(explain(e));}
  }
  const printCss=`@page{size:A4 portrait;margin:17mm 19mm}*{box-sizing:border-box}body{margin:0;background:#eaf0f4;color:#10243a;font:11pt/1.65 "Malgun Gothic","Noto Sans KR",sans-serif}.print-tools{position:sticky;top:0;z-index:1;display:flex;gap:12px;align-items:center;justify-content:center;padding:10px;background:#162c40;color:white}.print-tools button{font:inherit;border:0;border-radius:7px;padding:5px 14px;cursor:pointer}.sheet{width:min(100%,210mm);min-height:297mm;padding:17mm 19mm;background:white;margin:14px auto;box-shadow:0 2px 20px #17394d24}.issuer{display:grid;grid-template-columns:16mm 1fr 16mm;align-items:center;text-align:center;margin-bottom:7mm;break-inside:avoid}.issuer img{width:13mm;height:13mm;object-fit:contain}.issuer h1{font-size:20pt;line-height:1.2;margin:0;letter-spacing:.015em}.meta{border-collapse:collapse;width:100%;margin-bottom:6mm;border-bottom:1.2pt solid #263b4c;padding-bottom:2mm;break-inside:avoid}.meta th,.meta td{padding:.9mm 1mm;text-align:left;vertical-align:top;overflow-wrap:anywhere}.meta th{width:24mm;font-size:10pt;color:#334c61}.meta .subject{font-weight:750}.letter-text{line-height:1.8;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;orphans:2;widows:2}.detail-title{text-align:center;font-size:11pt;margin:5mm 0 3mm;break-after:avoid}.details{padding:0 4mm}.attachments{border-top:1px solid #d8e1e8;margin-top:5mm;padding-top:2mm;white-space:pre-wrap;overflow-wrap:anywhere}.signature{margin:10mm 0 6mm;text-align:center;break-inside:avoid}.signature .name{display:inline-flex;align-items:center;gap:2mm;font-size:13pt;font-weight:750}.signature img{width:15mm;height:15mm;object-fit:contain}.letter-footer{border-top:1px solid #8b9bab;padding-top:3mm;font-size:8.7pt;color:#395165;overflow-wrap:anywhere;break-inside:avoid}.letter-footer>p{margin:0}.letter-footer b{color:#172b3e}@media screen and (max-width:600px){.sheet{padding:8mm 5mm;margin:0 auto}.issuer{grid-template-columns:12mm 1fr 12mm}.issuer h1{font-size:16pt}.issuer img{width:10mm;height:10mm}}@media print{body{color:#000;background:white}.print-tools{display:none}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.letter-footer,.meta th{color:#000}}`;
  function buildPrint(row,base){
    const asset=path=>new URL(path,base).href;
    const title=clean(row.subject)||'발송용 공문',date=clean(row.issue_date);
    const stamp=/^\d{4}-\d{2}-\d{2}$/.test(date)?date.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1년 $2월 $3일'):'';
    const line=(label,value,cls='')=>`<tr><th scope="row">${label}</th><td class="${cls}">${esc(value)}</td></tr>`;
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${printCss}</style></head><body>
      <div class="print-tools"><button id="printLetter" type="button" disabled>인쇄 / PDF 저장</button><span id="printLetterStatus" role="status">로고와 직인 확인 중…</span></div>
      <main class="sheet"><header class="issuer"><img alt="드림포이엔 로고" src="${esc(asset('assets/dreamforen-logo.jpg'))}" data-fallback="${esc(asset('dreamforen-logo.jpg'))}"><h1>${esc(sender.name)}</h1><span></span></header>
      <table class="meta"><tbody>${line('수신',row.recipient)}${row.reference_text?line('참조',row.reference_text):''}${line('발신',sender.name)}${line('제목',title,'subject')}</tbody></table>
      <div class="letter-text">${esc(row.body_text)}</div>
      ${row.detail_text?`<h2 class="detail-title">— 아 래 —</h2><div class="letter-text details">${esc(row.detail_text)}</div>`:''}
      ${row.attachments_text?`<div class="attachments"><b>붙임</b> ${esc(row.attachments_text)}</div>`:''}
      <section class="signature"><div>${esc(stamp)}</div><div class="name"><span>${esc(sender.name)} 대표이사 ${esc(sender.representative)}</span><img alt="드림포이엔 직인" src="${esc(asset('assets/company_seal.png'))}" data-fallback="${esc(asset('company_seal.png'))}"></div></section>
      <footer class="letter-footer"><p><b>시행</b> ${esc(row.document_no||'저장 시 부여')} ${date?'('+esc(date)+')':''}</p><p>${esc(sender.address)}</p><p>전화 ${esc(sender.phone)} · 팩스 ${esc(sender.fax)} · ${esc(sender.email)}</p></footer></main></body></html>`;
  }
  async function verifyImage(img){
    for(const src of [img.getAttribute('src'),img.dataset.fallback]){
      if(!src)continue;
      if(img.getAttribute('src')!==src)img.src=src;
      try{
        if(typeof img.decode==='function'){await img.decode();if(img.naturalWidth>0)return true;}
        else if(img.complete?img.naturalWidth>0:await new Promise(resolve=>{img.onload=()=>resolve(true);img.onerror=()=>resolve(false);}))return true;
      }catch(_){}
    }
    return false;
  }
  async function preview(value){
    if(!allowed())return;
    const win=window.open('about:blank','_blank');
    if(!win){message('브라우저의 팝업을 허용한 뒤 미리보기를 눌러주세요.');return;}
    win.opener=null;win.document.body.textContent='공문 불러오는 중…';
    try{
      const c=context(),row=typeof value==='string'?await readLetter(c,value,{includeArchived:true}):value;
      if(win.closed||!current(c))return;
      win.document.open();win.document.write(buildPrint(row,document.baseURI));win.document.close();
      const button=win.document.getElementById('printLetter'),status=win.document.getElementById('printLetterStatus');
      const ok=(await Promise.all([...win.document.querySelectorAll('.sheet img')].map(verifyImage))).every(Boolean);
      if(win.closed)return;
      if(ok){button.disabled=false;button.onclick=()=>win.print();status.textContent='';}
      else status.textContent='로고 또는 직인을 불러오지 못했습니다. 웹 파일을 확인해주세요.';
    }catch(e){if(!win.closed)win.document.body.textContent=explain(e);}
  }
  const visible=()=>{const view=by('dfViewSalesLetters');return view&&!view.hidden&&view.style.display!=='none';};
  function init(){
    if(!form()||!dialog())return;
    by('dfOutgoingNew').onclick=()=>edit();
    by('dfOutgoingRefresh').onclick=load;
    for(const id of ['dfOutgoingSearch','dfOutgoingKind','dfOutgoingState'])by(id).addEventListener(id==='dfOutgoingSearch'?'input':'change',()=>{page=0;render();});
    by('dfOutgoingPrev').onclick=()=>{page--;render();};by('dfOutgoingNext').onclick=()=>{page++;render();};
    by('dfOutgoingList').addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b)return;
      if(b.dataset.letterEdit)edit(b.dataset.letterEdit);
      if(b.dataset.letterPreview)preview(b.dataset.letterPreview);
      if(b.dataset.letterArchive)archive(b.dataset.letterArchive);
    });
    by('dfOutgoingClose').onclick=()=>closeEditor();
    dialog().addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
    form().addEventListener('input',()=>{if(editing)editing.dirty=true;});
    form().elements.template_kind.addEventListener('change',event=>setType(event.target.value));
    by('dfOutgoingApplyTemplate').onclick=()=>{
      const f=form(),base=templates[f.elements.template_kind.value];if(!base||!editing)return;
      for(const key of Object.keys(base))if(!clean(f.elements[key].value))f.elements[key].value=base[key];
      editing.dirty=true;
    };
    by('dfOutgoingPreview').onclick=()=>{const row=collect();if(row)preview(row);};
    form().addEventListener('submit',save);
    document.addEventListener('df:menu-permissions-changed',()=>{sync();if(visible()&&allowed())load();});
    new MutationObserver(()=>{if(document.body.classList.contains('df-auth-locked')&&activeOwner)sync();})
      .observe(document.body,{attributes:true,attributeFilter:['class']});
    sync();
  }
  window.DF_OUTGOING_LETTERS=Object.freeze({load,isEditorOpen:()=>!!editing&&dialog()?.open,closeEditor:()=>closeEditor(),buildPrint});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
