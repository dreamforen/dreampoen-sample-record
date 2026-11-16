/* Shared A4 layout for direct editing, preview and print. */
(function(){
  'use strict';
  const sender=Object.freeze({name:'주식회사 드림포이엔',representative:'하준명',address:'경기도 안양시 만안구 덕천로152번길 25, B동 2005호',phone:'031-420-2156~8',fax:'031-420-2155',email:'naynay2@naver.com'});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').trim();
  const sealAllowed=v=>typeof v==='string'&&v.length<=2800000&&/^data:image\/(?:jpeg|png);base64,[a-z0-9+/]+={0,2}$/i.test(v);
  const allowed=new Set(['DIV','P','SPAN','BR','B','STRONG','I','EM','U','S','STRIKE','OL','UL','LI']);
  const omitted=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','NOSCRIPT','TEMPLATE','SVG','MATH','FORM','INPUT','TEXTAREA','SELECT','BUTTON','IMG','VIDEO','AUDIO']);
  function sanitizedBody(markup){
    const source=document.createElement('template'),container=document.createElement('div');
    source.innerHTML=String(markup??'').slice(0,100001);
    function copy(node,parent,depth){
      if(node.nodeType===3){parent.append(document.createTextNode(node.data));return;}
      if(node.nodeType!==1||node.namespaceURI!=='http://www.w3.org/1999/xhtml'||omitted.has(node.tagName))return;
      if(depth>60){parent.append(document.createTextNode(node.textContent));return;}
      let dest=parent;
      if(allowed.has(node.tagName)){
        dest=document.createElement(node.tagName==='STRIKE'?'s':node.tagName.toLowerCase());
        const align=clean(node.style.textAlign||node.getAttribute('align')).toLowerCase();
        if(/^(left|center|right)$/.test(align))dest.style.textAlign=align;
        if(node.tagName==='SPAN'){
          if(node.style.fontWeight==='bold'||Number(node.style.fontWeight)>=600)dest.style.fontWeight='bold';
          if(node.style.fontStyle==='italic')dest.style.fontStyle='italic';
          if(/^underline$/.test(node.style.textDecoration))dest.style.textDecoration='underline';
        }
        parent.append(dest);
      }
      for(const child of node.childNodes)copy(child,dest,depth+1);
    }
    for(const n of source.content.childNodes)copy(n,container,0);
    const blocks=new Set(['DIV','P','OL','UL','LI']);let plain='';
    const boundary=()=>{if(plain&&!plain.endsWith('\n'))plain+='\n';};
    function read(node){
      if(node.nodeType===3){plain+=node.data;return;}
      if(node.tagName==='BR'){plain+='\n';return;}
      const b=blocks.has(node.tagName);if(b)boundary();for(const c of node.childNodes)read(c);if(b)boundary();
    }
    for(const n of container.childNodes)read(n);
    return {html:plain.trim()?container.innerHTML:'',text:plain.trim()};
  }
  function bodyFor(row){
    const content=sanitizedBody(row?.body_html);
    return content.text?content.html:esc(row?.body_text||'');
  }
  function shape(row,base,{edit=false,seal=''}={}){
    const asset=rel=>esc(new URL(rel,base).href);
    const company=row.sender_name??sender.name,signer=row.submitter_name??sender.representative,date=clean(row.issue_date);
    const dateText=date.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1년 $2월 $3일');
    const input=(key,label,value,limit,extra='')=>'<input class="dl-inline" name="'+key+'" aria-label="'+label+'" maxlength="'+limit+'" value="'+esc(value)+'" '+extra+'>';
    const line=(label,body,cls='')=>'<tr><th scope="row">'+label+'</th><td class="'+cls+'">'+body+'</td></tr>';
    const wantSeal=row.apply_square_seal!==false;
    const square=wantSeal&&sealAllowed(seal)?'<img class="dl-square" alt="드림포이엔 사각직인" src="'+esc(seal)+'">':edit&&wantSeal?'<span class="dl-seal-placeholder">사각직인<br>등록 필요</span>':'';
    const body=edit?'<div id="dfOutgoingBody" class="dl-body dl-editable" data-placeholder="여기에 공문 본문을 작성하세요." contenteditable="true" role="textbox" aria-label="공문 본문" aria-multiline="true" spellcheck="false">'+bodyFor(row)+'</div>':'<div class="dl-body">'+bodyFor(row)+'</div>';
    const detail=edit?'<section class="dl-detail"><label class="dl-detail-title" for="df-letter-field-detail_text">— 아 래 —</label><textarea class="dl-inline" id="df-letter-field-detail_text" name="detail_text" placeholder="세부내역 (선택)" maxlength="6000" rows="2">'+esc(row.detail_text)+'</textarea></section>':row.detail_text?'<section class="dl-detail"><h2 class="dl-detail-title">— 아 래 —</h2><div class="dl-body dl-detail-text">'+esc(row.detail_text)+'</div></section>':'';
    const attachments=edit?'<div class="dl-attachments"><label for="df-letter-field-attachments_text">붙임</label><textarea class="dl-inline" id="df-letter-field-attachments_text" name="attachments_text" maxlength="2000" rows="1" placeholder="첨부할 문서명 (선택)">'+esc(row.attachments_text)+'</textarea></div>':row.attachments_text?'<div class="dl-attachments"><b>붙임</b> '+esc(row.attachments_text)+'</div>':'';
    const signerPrint=company===sender.name&&signer===sender.representative?'대표이사 '+signer:signer;
    const tag=edit?'article':'main';
    return '<'+tag+' class="dl-paper" aria-label="'+(edit?'발송용 공문 편집':'발송용 공문')+'">'+
      '<header class="dl-issuer"><img alt="드림포이엔 로고" src="'+asset('assets/dreamforen-logo.jpg')+'" data-fallback="'+asset('dreamforen-logo.jpg')+'"><h1>'+esc(sender.name)+'</h1><span></span></header>'+
      '<table class="dl-meta"><tbody>'+
      line('수신',edit?input('recipient','수신',row.recipient,200,'placeholder="기관명 또는 담당자"'):esc(row.recipient))+
      (edit||row.reference_text?line('참조',edit?input('reference_text','참조',row.reference_text,200,'placeholder="부서 또는 담당자 (선택)"'):esc(row.reference_text)):'')+
      line('발신',edit?input('sender_name','발신자명',company,200):esc(company))+
      line('제목',edit?input('subject','제목',row.subject,240,'placeholder="공문 제목"'):esc(row.subject),'dl-subject')+
      '</tbody></table>'+body+detail+attachments+
      '<section class="dl-signature">'+(edit?'<label class="dl-issue"><span>시행일</span><input type="date" name="issue_date" aria-label="시행일" value="'+esc(date)+'"></label>':'<div>'+esc(dateText)+'</div>')+
      '<div class="dl-signer">'+(edit?'<span id="dfOutgoingPaperCompany">'+esc(company)+'</span><label><span>제출자명</span>'+input('submitter_name','제출자명',signer,120)+'</label>':'<span>'+esc([company,signerPrint].filter(Boolean).join(' '))+'</span>')+
      '<span class="dl-seal-slot" '+(edit?'id="dfOutgoingPaperSeal"':'')+'>'+square+'</span></div></section>'+
      '<footer class="dl-footer">'+(edit?'<p><b>시행</b> '+input('document_no','공문번호',row.document_no,80,'placeholder="저장 시 자동 부여"')+'</p>':'<p><b>시행</b> '+esc(row.document_no||'저장 시 부여')+' '+(date?'('+esc(date)+')':'')+'</p>')+
      '<p>'+esc(sender.address)+'</p><p>전화 '+esc(sender.phone)+' · 팩스 '+esc(sender.fax)+' · '+esc(sender.email)+'</p></footer></'+tag+'>';
  }
  const css='.dl-paper,.dl-paper *{box-sizing:border-box}.dl-paper{width:min(100%,210mm);min-height:297mm;padding:17mm 19mm;margin:14px auto;background:#fff;color:#10243a;font:11pt/1.65 "Malgun Gothic","Noto Sans KR",sans-serif;box-shadow:0 2px 20px #17394d24}.dl-issuer{display:grid;grid-template-columns:16mm 1fr 16mm;align-items:center;text-align:center;margin-bottom:7mm;break-inside:avoid}.dl-issuer img{width:13mm;height:13mm;object-fit:contain}.dl-issuer h1{font-size:20pt;line-height:1.2;margin:0;letter-spacing:.015em;color:inherit}.dl-meta{border-collapse:collapse;width:100%;margin-bottom:6mm;border-bottom:1.2pt solid #263b4c;padding-bottom:2mm;break-inside:avoid}.dl-meta th,.dl-meta td{padding:.9mm 1mm;text-align:left;vertical-align:top;overflow-wrap:anywhere}.dl-meta th{width:24mm;font-size:10pt;color:#334c61}.dl-subject{font-weight:750}.dl-body{line-height:1.8;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;orphans:2;widows:2}.dl-body p{margin:.35em 0}.dl-body ol,.dl-body ul{margin:.28em 0;padding-inline-start:1.8em}.dl-body li{white-space:pre-wrap}.dl-detail-title{display:block;text-align:center;font-size:11pt;margin:5mm 0 3mm;break-after:avoid}.dl-detail-text{padding:0 4mm}.dl-attachments{border-top:1px solid #d8e1e8;margin-top:5mm;padding-top:2mm;white-space:pre-wrap;overflow-wrap:anywhere}.dl-signature{margin:10mm 0 6mm;text-align:center;break-inside:avoid}.dl-signer{display:inline-flex;align-items:center;justify-content:center;gap:2mm;font-size:13pt;font-weight:750;flex-wrap:wrap;max-width:100%}.dl-seal-slot{display:inline-flex;vertical-align:middle}.dl-square{width:15mm;height:15mm;object-fit:contain}.dl-footer{border-top:1px solid #8b9bab;padding-top:3mm;font-size:8.7pt;color:#395165;overflow-wrap:anywhere;break-inside:avoid}.dl-footer>p{margin:0}.dl-footer b{color:#172b3e}'+
    '@media screen and (max-width:640px){.dl-paper{min-height:0;padding:8mm 5mm;margin:0 auto}.dl-issuer{grid-template-columns:12mm 1fr 12mm}.dl-issuer h1{font-size:16pt}.dl-issuer img{width:10mm;height:10mm}.dl-meta th{width:12mm}}'+
    '@media print{.dl-paper{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;color:#000}.dl-footer,.dl-meta th{color:#000}}';
  function buildPrint(row,base,seal){
    const controls='@page{size:A4 portrait;margin:17mm 19mm}body{margin:0;background:#eaf0f4}.dl-print-tools{position:sticky;top:0;z-index:1;display:flex;gap:12px;align-items:center;justify-content:center;padding:10px;background:#162c40;color:white;font:14px "Malgun Gothic",sans-serif}.dl-print-tools button{font:inherit;border:0;border-radius:7px;padding:5px 14px;cursor:pointer}@media print{body{background:white}.dl-print-tools{display:none}.dl-paper:not([data-dl-print-ready]){display:none}}';
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(clean(row.subject)||'발송용 공문')+'</title><style>'+css+controls+'</style></head><body><div class="dl-print-tools"><button id="printLetter" type="button" disabled>인쇄 / PDF 저장</button><span id="printLetterStatus" role="status">인쇄 준비 중…</span></div>'+shape(row,base,{seal})+'</body></html>';
  }
  window.DF_OUTGOING_LETTER_PAPER=Object.freeze({sender,css,esc,sealAllowed,sanitizedBody,bodyFor,shape,buildPrint});
})();
