/* Contract management · outgoing letters and private square seal. */
(function(){
  'use strict';
  const by=id=>document.getElementById(id),paper=window.DF_OUTGOING_LETTER_PAPER,esc=paper.esc;
  const table='contract_outgoing_letters',settings='contract_outgoing_letter_settings',pageSize=20;
  const clean=v=>String(v??'').trim(),lower=v=>clean(v).normalize('NFKC').toLowerCase();
  const today=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);
  const kinds={notice:'일반 공문',payment:'내용증명 · 대금 지급 요청'},states={draft:'임시저장',ready:'작성완료',sent:'발송완료'};
  const templates={
    notice:{body:'1. 귀 기관의 무궁한 발전을 기원합니다.\n\n2. [안내 또는 요청 내용을 작성하세요.]\n\n   가. \n   나. \n   다. '},
    payment:{subject:'용역대금 지급 요청 (내용증명)',body:[
      '1. 당사는 [계약명]에 따라 [용역명]을 수행하였습니다.',
      '2. [발행일]에 세금계산서를 발행했으며, [기준일] 현재 아래 용역대금의 입금이 확인되지 않았습니다.',
      '3. [지급기한]까지 아래 계좌로 지급하여 주시기 바랍니다. 기한 내 처리가 어렵다면 지급 일정을 회신해 주시기 바랍니다.'
    ].join('\n\n'),detail:[
      '가. 계약 및 용역 내역','    1) 계약명:','    2) 수행기간:','    3) 측정 대상 및 항목:','    4) 미지급 금액:                 원 (부가세 포함 여부: )',
      '','나. 지급 안내','    1) 은행명:','    2) 계좌번호:','    3) 예금주:'
    ].join('\n')}
  };
  const columns='id,document_no,template_kind,issue_date,recipient,subject,status,updated_at,archived_at';
  const textFields=['document_no','issue_date','template_kind','recipient','reference_text','subject','sender_name','submitter_name','detail_text','attachments_text'];
  let rows=[],page=0,requestId=0,editorRequest=0,owner='',client=null,editing=null;
  let stamp='',stampKnown=false,stampSerial=0,stampPick=null,stampWriting=false;
  const windows=new Set();
  const api=()=>typeof dfSupabase==='undefined'?null:dfSupabase,user=()=>typeof dfCloudUser==='undefined'?null:dfCloudUser,profile=()=>typeof dfCloudProfile==='undefined'?null:dfCloudProfile;
  const form=()=>by('dfOutgoingForm'),editor=()=>by('dfOutgoingEditor'),body=()=>by('dfOutgoingBody');
  const visible=()=>{const x=by('dfViewSalesLetters');return x&&!x.hidden&&x.style.display!=='none';};
  function allowed(){
    const u=user(),p=profile();
    return !!(api()&&u?.id&&p&&(!p.id||p.id===u.id)&&p.active!==false&&!p.retired_at&&lower(p.role)==='admin'&&
      !document.body.classList.contains('df-auth-locked')&&(window.DFMenuPermissions?.isAdmin?.()??true));
  }
  function context(){if(!allowed())throw Error('발송용 공문은 관리자 계정으로 열어주세요.');return {db:api(),user:user().id};}
  const current=c=>allowed()&&c.db===api()&&c.user===user()?.id;
  async function read(c,query){
    if(!current(c))throw Error('로그인이 변경되었습니다. 공문을 다시 열어주세요.');
    const result=await query;
    if(!current(c))throw Error('로그인이 변경되었습니다. 공문을 다시 열어주세요.');
    if(result.error)throw result.error;
    return result.data;
  }
  function message(v){const node=by('dfOutgoingStatus');if(node)node.textContent=v;}
  function say(v,bad=false){const node=by('dfOutgoingEditorStatus');node.textContent=v;node.classList.toggle('is-error',bad);}
  function explain(e){
    if(['42P01','42703','PGRST204','PGRST205'].includes(e?.code))return '배포 파일의 02_outgoing_letter_editor.sql을 실행한 뒤 다시 열어주세요.';
    if(e?.code==='23505')return '이미 사용 중인 공문번호입니다. 입력한 번호를 확인해주세요.';
    return e?.message||'공문을 처리하지 못했습니다.';
  }
  function sync(){
    const u=allowed()?user().id:'',db=u?api():null;
    if(u!==owner||db!==client){
      owner=u;client=db;rows=[];page=0;requestId++;editorRequest++;stampSerial++;stamp='';stampKnown=false;stampPick=null;stampWriting=false;
      if(editing)closeEditor(true);
      windows.forEach(p=>{try{p.close();}catch(_){}});windows.clear();
      const search=by('dfOutgoingSearch');if(search)search.value='';
      message('');render();paintStamp();
    }
    if(by('dfOutgoingNew'))by('dfOutgoingNew').disabled=!u;
    if(by('dfOutgoingSeal'))by('dfOutgoingSeal').disabled=!u||stampWriting;
  }
  function render(){
    const target=by('dfOutgoingList');if(!target)return;
    const q=lower(by('dfOutgoingSearch').value),kind=by('dfOutgoingKind').value,state=by('dfOutgoingState').value;
    const list=rows.filter(r=>(!q||[r.recipient,r.subject,r.document_no].some(t=>lower(t).includes(q)))&&(!kind||r.template_kind===kind)&&
      (state==='archived'?!!r.archived_at:!r.archived_at&&(!state||r.status===state)));
    const pages=Math.max(1,Math.ceil(list.length/pageSize));page=Math.max(0,Math.min(pages-1,page));
    function row(r){
      const id=esc(r.id),subject=esc(r.subject||(r.status==='draft'?'제목 없음 · 이어 쓰기':'제목 없음'));
      return '<tr><td>'+esc(r.document_no||'–')+'</td><td class="df-letter-subject">'+
        (r.archived_at?'<b>'+subject+'</b>':'<button type="button" class="df-letter-title-link" data-letter-edit="'+id+'">'+subject+'</button>')+
        '<small>'+esc(kinds[r.template_kind]||'공문')+'</small></td><td>'+esc(r.recipient||'–')+'</td><td>'+esc(r.issue_date||'–')+
        '</td><td><span class="df-sales-status '+(r.status==='draft'?'draft':'issued')+'">'+esc(r.archived_at?'보관':states[r.status]||r.status)+'</span></td>'+
        '<td class="df-letter-row-actions">'+
        '<button type="button" class="company-btn secondary" data-letter-preview="'+id+'">미리보기</button> '+
        '<button type="button" class="company-btn secondary" data-letter-archive="'+id+'">'+(r.archived_at?'복원':'보관')+'</button></td></tr>';
    }
    target.innerHTML=list.length?'<table class="df-sales-table df-letter-table"><thead><tr><th scope="col">공문번호</th><th scope="col">제목</th><th scope="col">수신</th><th scope="col">시행일</th><th scope="col">상태</th><th scope="col">관리</th></tr></thead><tbody>'+list.slice(page*pageSize,(page+1)*pageSize).map(row).join('')+'</tbody></table>':'<p class="df-letter-empty">표시할 공문이 없습니다.</p>';
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
        const part=await read(c,c.db.from(table).select(columns).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(start,start+499));
        if(token!==requestId)return;
        loaded.push(...(part||[]));if((part?.length||0)<500)break;
      }
      rows=loaded;render();message('');
    }catch(e){if(token===requestId&&current(c))message(explain(e));}
  }
  async function readLetter(c,id,includeArchived=false){
    let query=c.db.from(table).select('*').eq('id',id);
    if(!includeArchived)query=query.is('archived_at',null);
    const row=await read(c,query.maybeSingle());
    if(!row)throw Error('공문이 이동되었거나 조회할 수 없습니다. 목록을 새로고침해주세요.');
    return row;
  }

  async function verifyImage(img){
    if(!img)return false;
    for(const src of [img.getAttribute('src'),img.dataset.fallback]){
      if(!src)continue;if(img.getAttribute('src')!==src)img.src=src;
      try{
        if(typeof img.decode==='function'){await img.decode();if(img.naturalWidth>0)return true;}
        else if(img.complete?img.naturalWidth>0:await new Promise(done=>{img.onload=()=>done(true);img.onerror=()=>done(false);}))return true;
      }catch(_){}
    }
    return false;
  }
  function paintStamp(){
    const top=by('dfOutgoingSeal'),inForm=by('dfOutgoingEditorSeal'),slot=by('dfOutgoingPaperSeal');
    if(top){top.textContent=stamp?'사각직인 변경':'사각직인 설정';top.disabled=stampWriting||!allowed();}
    if(inForm){inForm.textContent=stamp?'사각직인 변경':'사각직인 등록';inForm.disabled=stampWriting||!!editing?.busy;}
    if(slot){
      const selected=form().elements.apply_square_seal.checked;
      slot.innerHTML=!selected?'':stamp?'<img class="dl-square" alt="드림포이엔 사각직인" src="'+esc(stamp)+'">':'<span class="dl-seal-placeholder">사각직인<br>등록 필요</span>';
    }
  }
  async function readStamp(c,force=false){
    if(!force&&stampKnown)return stamp;
    const serial=++stampSerial;
    const row=await read(c,c.db.from(settings).select('square_seal').eq('id',1).maybeSingle());
    if(row&&!paper.sealAllowed(row.square_seal))throw Error('저장한 사각직인 파일이 올바르지 않습니다. 다시 등록해주세요.');
    if(serial===stampSerial){stamp=row?.square_seal||'';stampKnown=true;paintStamp();}
    return serial===stampSerial?row?.square_seal||'':stamp;
  }
  async function stampData(file){
    if(!file||file.size<40||file.size>2*1024*1024)throw Error('2MB 이하의 사각직인 JPG 또는 PNG 파일을 선택해주세요.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
    if(!jpeg&&!png)throw Error('사각직인은 JPG 또는 PNG 이미지로 등록해주세요.');
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const src='data:image/'+(jpeg?'jpeg':'png')+';base64,'+btoa(binary),img=new Image();img.src=src;
    if(!await verifyImage(img))throw Error('이미지를 열 수 없습니다. 사각직인 원본을 다시 선택해주세요.');
    return src;
  }
  function pickStamp(){
    if(!allowed()||stampWriting||editing?.busy)return;
    stampPick=context();
    const input=by('dfOutgoingSealInput');
    input.value='';input.click();
  }
  async function saveStamp(file){
    const c=stampPick;stampPick=null;
    if(!file||!c||!current(c)||stampWriting)return;
    stampWriting=true;paintStamp();
    try{
      // Read the saved setting if the board has not opened an editor yet.
      const previous=await readStamp(c,true);
      if(previous&&!window.confirm('공문에 사용할 사각직인을 이 이미지로 바꿀까요?'))return;
      const src=await stampData(file);
      if(!current(c))return;
      stampSerial++;
      const updated=await read(c,c.db.from(settings).upsert({id:1,square_seal:src},{onConflict:'id'}).select('square_seal').single());
      if(updated?.square_seal!==src)throw Error('사각직인 저장을 확인하지 못했습니다. 다시 열어 확인해주세요.');
      stamp=src;stampKnown=true;paintStamp();
      if(editing)say('사각직인을 저장했습니다.');else message('사각직인을 저장했습니다.');
    }catch(e){if(current(c)){if(editing)say(explain(e),true);else message(explain(e));}}
    finally{if(current(c)){stampWriting=false;paintStamp();}}
  }

  function draft(row){return !row||row.status==='draft';}
  function paintMode(keepState=false){
    const r=editing?.row,isDraft=draft(r);
    by('dfOutgoingEditorTitle').textContent=r?'공문 편집':'공문 작성';
    by('dfOutgoingEditorMode').textContent=r?(states[r.status]||r.status)+(r.document_no?' · '+r.document_no:''):'작성 중';
    by('dfOutgoingStateField').hidden=isDraft;by('dfOutgoingDraft').hidden=!isDraft;
    if(!keepState)form().elements.send_state.value=r?.status==='sent'?'sent':'ready';
    by('dfOutgoingSave').textContent=isDraft?'저장':'변경 저장';
  }
  function paintEditor(row,c){
    editing={row:row||null,id:row?.id||crypto.randomUUID(),context:c,busy:false,dirty:false};
    const f=form(),initial=row||{template_kind:'notice',issue_date:today(),status:'draft',apply_square_seal:true};
    f.reset();f.elements.template_kind.value=initial.template_kind;f.elements.apply_square_seal.checked=initial.apply_square_seal!==false;
    by('dfOutgoingPaper').innerHTML=paper.shape(initial,document.baseURI,{edit:true,seal:stamp});
    const logo=by('dfOutgoingPaper').querySelector('.dl-issuer img');verifyImage(logo);
    busy(false);paintMode();paintStamp();say('');bindPaperBody();by('dfOutgoingBoard').hidden=true;editor().hidden=false;
    window.scrollTo(0,0);by('dfOutgoingEditorTitle').focus({preventScroll:true});
    readStamp(c,true).catch(error=>{if(editing?.context===c&&current(c))say(explain(error),true);});
  }
  async function edit(id){
    if(editing)return;
    try{
      const c=context(),token=++editorRequest,row=id?await readLetter(c,id):null;
      if(token!==editorRequest||!current(c)||!visible())return;
      paintEditor(row,c);window.DF_NAVIGATION_GUARD?.changed();
    }catch(e){message(explain(e));}
  }
  function confirmLeave(){return !editing?.dirty||!visible()||window.confirm('저장하지 않은 공문 입력은 사라집니다. 이동할까요?');}
  function closeEditor(force=false){
    if(!editing)return false;
    if(!force&&(editing.busy||!confirmLeave()))return false;
    editing=null;editorRequest++;form().reset();by('dfOutgoingPaper').replaceChildren();editor().hidden=true;by('dfOutgoingBoard').hidden=false;return true;
  }
  function returnToBoard(){
    if(!editing||editing.busy)return;
    if(window.DF_NAVIGATION_GUARD?.backTo('sales-letters','letters'))return;
    if(closeEditor()){
      window.DF_NAVIGATION_GUARD?.changed({replace:true});window.scrollTo(0,0);by('dfOutgoingNew').focus({preventScroll:true});
    }
  }
  function openBoard(){
    if(closeEditor(true))window.DF_NAVIGATION_GUARD?.changed({replace:true});
    return load();
  }
  const navigation={
    capture(){return editing&&!editor().hidden?{key:'letter:'+editing.id,data:{compose:true,letterId:editing.row?.id||''}}:{key:'letters',data:{}};},
    canLeave(){return !editing?.busy;},
    confirmLeave,
    async restore(snapshot){
      closeEditor(true);
      if(snapshot.data?.compose&&allowed()){
        const c=context(),id=snapshot.data.letterId;
        try{const row=id?await readLetter(c,id):null;if(current(c)&&visible())paintEditor(row,c);}
        catch(error){await load();if(current(c))message(explain(error));}
      }else await load();
    }
  };
  function busy(state){
    form().querySelector('fieldset').disabled=state;
    for(const id of ['dfOutgoingClose','dfOutgoingPreview','dfOutgoingDraft','dfOutgoingSave'])by(id).disabled=state;
    if(body())body().contentEditable=String(!state);
    if(!state)paintMode(true);
    else by('dfOutgoingSave').textContent='저장 중…';
  }
  function collect(operation){
    const f=form(),data={};
    for(const key of textFields)data[key]=clean(f.elements[key].value);
    if(body().innerHTML.length>100000){say('본문 서식을 줄여주세요.',true);return null;}
    const content=paper.sanitizedBody(body().innerHTML);
    if(content.text.length>15000||content.html.length>100000){say('본문은 15,000자 이내로 작성해주세요.',true);return null;}
    data.body_text=content.text;data.body_html=content.html;data.apply_square_seal=f.elements.apply_square_seal.checked;
    data.document_no=data.document_no||editing?.row?.document_no||null;data.issue_date=data.issue_date||null;
    data.status=operation==='draft'?'draft':operation==='save'?f.elements.send_state.value:editing?.row?.status||'draft';
    if(operation==='save'){
      const missing=required(data);
      if(missing.length){say(missing.join(', ')+'을(를) 입력해주세요. 작성 중인 내용은 임시저장할 수 있어요.',true);return null;}
    }
    return data;
  }
  function required(row){
    return [['recipient','수신'],['subject','제목'],['body_text','본문'],['issue_date','시행일'],['sender_name','발신자명'],['submitter_name','제출자명']]
      .filter(([key])=>!clean(row[key]??(key==='sender_name'?paper.sender.name:key==='submitter_name'?paper.sender.representative:''))).map(([,label])=>label);
  }
  function lostInsertMatches(saved,payload){
    return saved&&Object.keys(payload).every(k=>k==='document_no'&&payload[k]===null||saved[k]===payload[k]);
  }
  async function save(operation){
    const e=editing;if(!e||e.busy||!current(e.context)||operation==='draft'&&!draft(e.row))return;
    const payload=collect(operation);if(!payload)return;
    const c=e.context;e.busy=true;busy(true);say('');
    try{
      let row;
      if(e.row){
        row=await read(c,c.db.from(table).update(payload).eq('id',e.id).eq('updated_at',e.row.updated_at).is('archived_at',null).select(columns).maybeSingle());
        if(!row)throw Error('다른 화면에서 이 공문을 수정했습니다. 현재 입력은 유지했습니다.');
      }else{
        try{row=await read(c,c.db.from(table).insert({id:e.id,...payload}).select(columns).single());}
        catch(e1){
          if(e1?.code!=='23505')throw e1;const saved=await read(c,c.db.from(table).select('*').eq('id',e.id).is('archived_at',null).maybeSingle());
          if(!lostInsertMatches(saved,payload))throw e1;row=saved;
        }
      }
      if(!row?.id)throw Error('공문 저장 결과를 확인하지 못했습니다.');
      if(editing!==e)return;
      e.row=row;e.dirty=false;form().elements.document_no.value=row.document_no||'';paintMode();window.DF_NAVIGATION_GUARD?.changed({persist:true});
      say(operation==='draft'?'임시저장했습니다. 이어서 작성할 수 있어요.':(row.document_no||'공문')+' 저장했습니다.');
      await load();
    }catch(error){if(editing===e&&current(c))say(explain(error),true);}
    finally{e.busy=false;if(editing===e)busy(false);}
  }
  async function archive(id){
    const row=rows.find(r=>r.id===id);if(!row||!allowed())return;
    const restore=!!row.archived_at;
    if(!restore&&!window.confirm((row.document_no||row.subject||'이 임시 공문')+'을(를) 보관할까요?'))return;
    try{
      const c=context();
      let query=c.db.from(table).update({archived_at:restore?null:new Date().toISOString()}).eq('id',id).eq('updated_at',row.updated_at);
      query=restore?query.eq('archived_at',row.archived_at):query.is('archived_at',null);
      const out=await read(c,query.select('id').maybeSingle());
      if(!out)throw Error('공문이 이미 변경되었습니다. 목록을 새로고침해주세요.');
      await load();if(current(c))message(restore?'공문을 복원했습니다.':'공문을 보관했습니다.');
    }catch(e){message(explain(e));}
  }
  async function preview(value){
    if(!allowed())return;
    const win=window.open('about:blank','_blank');
    if(!win){if(editing)say('팝업을 허용한 뒤 다시 눌러주세요.',true);else message('팝업을 허용한 뒤 다시 눌러주세요.');return;}
    windows.forEach(x=>{if(x.closed)windows.delete(x);});windows.add(win);win.opener=null;win.document.body.textContent='공문 불러오는 중…';
    try{
      const c=context(),row=typeof value==='string'?await readLetter(c,value,true):value;
      const needStamp=row.apply_square_seal!==false;
      let seal='',stampError='';
      if(needStamp)try{seal=await readStamp(c,true);}catch(error){stampError=explain(error);}
      if(win.closed||!current(c))return;
      win.document.open();win.document.write(paper.buildPrint(row,document.baseURI,seal));win.document.close();
      const root=win.document.querySelector('.dl-paper'),button=win.document.getElementById('printLetter'),status=win.document.getElementById('printLetterStatus');
      const [logoOk,sealOk]=await Promise.all([verifyImage(root.querySelector('.dl-issuer img')),needStamp&&seal?verifyImage(root.querySelector('.dl-square')):Promise.resolve(!needStamp)]);
      if(win.closed||!current(c))return;
      if(stampError)status.textContent=stampError;
      else if(!logoOk)status.textContent='회사 로고를 불러오지 못했습니다.';
      else if(!sealOk)status.textContent='사각직인을 등록한 뒤 다시 미리보기를 열어주세요.';
      else if(!clean(row.document_no)||required(row).length)status.textContent='수신·제목·본문 등을 입력하고 저장하면 인쇄할 수 있습니다.';
      else{root.dataset.dlPrintReady='true';button.disabled=false;button.onclick=()=>win.print();status.textContent='';}
    }catch(e){if(!win.closed)win.document.body.textContent=explain(e);}
  }

  function markDirty(){if(editing&&!editing.busy)editing.dirty=true;}
  function chosenRange(node){
    const sel=window.getSelection();if(!sel)return null;
    if(sel.rangeCount&&node.contains(sel.anchorNode)&&node.contains(sel.focusNode))return sel.getRangeAt(0);
    node.focus();const r=document.createRange();r.selectNodeContents(node);r.collapse(false);sel.removeAllRanges();sel.addRange(r);return r;
  }
  function plainPaste(text){
    const node=body(),range=chosenRange(node);
    if(!range||!text)return;
    if(typeof document.execCommand==='function'&&document.execCommand('insertText',false,text)){markDirty();return;}
    range.deleteContents();const copy=document.createTextNode(text);range.insertNode(copy);range.setStartAfter(copy);range.collapse(true);markDirty();
  }
  function bindPaperBody(){
    body().onpaste=e=>{e.preventDefault();if(!editing?.busy)plainPaste(e.clipboardData?.getData('text/plain')||'');};
    body().ondrop=e=>{e.preventDefault();if(!editing?.busy&&!e.dataTransfer?.files?.length)plainPaste(e.dataTransfer?.getData('text/plain')||'');};
    form().querySelectorAll('.dl-paper textarea').forEach(node=>{
      const grow=()=>{node.style.height='auto';node.style.height=Math.max(node.scrollHeight,node.name==='detail_text'?50:24)+'px';};
      grow();node.addEventListener('input',grow);
    });
  }
  function defaultText(){
    if(!editing||editing.busy)return;
    const f=form(),t=templates[f.elements.template_kind.value]||templates.notice;
    let changed=false;
    if(!paper.sanitizedBody(body().innerHTML).text){body().textContent=t.body;changed=true;}
    if(t.subject&&!clean(f.elements.subject.value)){f.elements.subject.value=t.subject;changed=true;}
    if(t.detail&&!clean(f.elements.detail_text.value)){f.elements.detail_text.value=t.detail;f.elements.detail_text.dispatchEvent(new Event('input',{bubbles:true}));changed=true;}
    if(changed){markDirty();say('빈 항목에 기본 문안을 넣었습니다.');}else say('작성한 내용이 있어 그대로 유지했습니다.');
  }
  function init(){
    if(!form()||!editor())return;
    const style=document.createElement('style');style.textContent=paper.css;document.head.append(style);
    by('dfOutgoingNew').onclick=()=>edit();by('dfOutgoingRefresh').onclick=load;
    by('dfOutgoingSeal').onclick=by('dfOutgoingEditorSeal').onclick=pickStamp;
    by('dfOutgoingSealInput').onchange=e=>{e.stopPropagation();saveStamp(e.target.files?.[0]);};
    for(const id of ['dfOutgoingSearch','dfOutgoingKind','dfOutgoingState'])by(id).addEventListener(id==='dfOutgoingSearch'?'input':'change',()=>{page=0;render();});
    by('dfOutgoingPrev').onclick=()=>{page--;render();};by('dfOutgoingNext').onclick=()=>{page++;render();};
    by('dfOutgoingList').addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.letterEdit)edit(b.dataset.letterEdit);
      if(b.dataset.letterPreview)preview(b.dataset.letterPreview);
      if(b.dataset.letterArchive)archive(b.dataset.letterArchive);
    });
    by('dfOutgoingClose').onclick=returnToBoard;
    form().addEventListener('input',e=>{
      e.stopPropagation();markDirty();
      if(e.target.name==='sender_name')by('dfOutgoingPaperCompany').textContent=e.target.value;
      if(e.target.name==='apply_square_seal')paintStamp();
    });
    form().addEventListener('change',e=>{e.stopPropagation();markDirty();});
    form().addEventListener('keydown',e=>{if(editing&&(e.ctrlKey||e.metaKey)&&lower(e.key)==='s'){e.preventDefault();save(draft(editing.row)?'draft':'save');}});
    form().querySelectorAll('[data-letter-format]').forEach(button=>{
      button.onmousedown=e=>e.preventDefault();
      button.onclick=()=>{if(!editing||editing.busy)return;const r=chosenRange(body());if(r&&document.execCommand?.(button.dataset.letterFormat,false,null))markDirty();};
    });
    by('dfOutgoingApplyTemplate').onclick=defaultText;
    by('dfOutgoingPreview').onclick=()=>{const row=collect('preview');if(row)preview(row);};
    by('dfOutgoingDraft').onclick=()=>save('draft');
    form().addEventListener('submit',e=>{e.preventDefault();save('save');});
    document.addEventListener('df:menu-permissions-changed',()=>{sync();if(visible()&&allowed())load();});
    new MutationObserver(()=>{if(document.body.classList.contains('df-auth-locked')&&owner)sync();}).observe(document.body,{attributes:true,attributeFilter:['class']});
    sync();
  }
  window.DF_OUTGOING_LETTERS=Object.freeze({load,openBoard,navigation,buildPrint:paper.buildPrint});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
