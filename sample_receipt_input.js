/* Beta405: a split editor for the existing, complete receiptNo value. */
(function(root){
  'use strict';
  const full=document.getElementById('receiptNo'),date=document.getElementById('measureDate');
  if(!full||!date)return;
  const label=full.closest('label');label.classList.add('df-receipt-entry');
  const editor=document.createElement('span');editor.className='df-receipt-split';
  editor.innerHTML='<span data-receipt-prefix></span><span aria-hidden="true">-</span><input type="text" inputmode="numeric" autocomplete="off" aria-label="접수번호 뒷번호" placeholder="01">';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='df-receipt-toggle';toggle.textContent='전체 수정';
  full.after(editor,toggle);
  const prefix=editor.querySelector('[data-receipt-prefix]'),suffix=editor.querySelector('input');
  let lastValue='',fresh=true,fullMode=false,edited=false;
  function measurementPrefix(){
    const digits=String(date.value||'').replace(/\D/g,'');
    if(/^\d{8}$/.test(digits)){
      const y=Number(digits.slice(0,4)),m=Number(digits.slice(4,6)),d=Number(digits.slice(6,8)),check=new Date(Date.UTC(y,m-1,d));
      if(check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===d)return digits;
    }
    const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('');
  }
  function show(){
    full.hidden=!fullMode;editor.hidden=fullMode;
    toggle.textContent=fullMode?'뒤 번호 입력':'전체 수정';
    toggle.hidden=fullMode&&!!full.value&&!/^\d{8}-\d+$/.test(full.value);
  }
  function restore(){
    const value=String(full.value||''),match=/^(\d{8})-(\d+)$/.exec(value);
    fresh=!value;fullMode=!!value&&!match;edited=false;
    prefix.textContent=match?match[1]:measurementPrefix();suffix.value=match?match[2]:'';
    lastValue=value;show();
  }
  function commit(notify=false){
    if(!fullMode){
      if(fresh)prefix.textContent=measurementPrefix();
      full.value=suffix.value?prefix.textContent+'-'+(edited?suffix.value.padStart(2,'0'):suffix.value):'';
    }
    lastValue=full.value;
    if(notify)full.dispatchEvent(new Event('input',{bubbles:true}));
  }
  suffix.addEventListener('input',()=>{edited=true;suffix.value=suffix.value.replace(/\D/g,'');commit(true);});
  suffix.addEventListener('blur',()=>{if(suffix.value.length===1)suffix.value=suffix.value.padStart(2,'0');commit(true);});
  full.addEventListener('input',()=>{if(fullMode)lastValue=full.value;});
  toggle.addEventListener('click',event=>{
    event.preventDefault();
    if(fullMode){restore();if(fullMode)return;suffix.focus();}
    else{commit();fullMode=true;show();full.focus();}
  });
  for(const event of ['input','change','blur'])date.addEventListener(event,()=>{if(fresh&&!fullMode)commit();},true);
  root.DF_RECEIPT_INPUT=Object.freeze({restore,sync(){if(full.value!==lastValue)restore();commit();}});
  restore();
})(window);
