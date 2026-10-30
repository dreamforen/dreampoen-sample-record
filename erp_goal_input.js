/* ERP 3.57 · Live won formatting for the annual goal input only. */
(function(root){
  'use strict';
  const MAX=9007199254740991n;
  const groups=['','만','억','조'];
  const comma=digits=>digits.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  function parse(raw){
    const normalized=String(raw??'').normalize('NFKC').replace(/^\s*₩\s*/,'').replace(/\s*원\s*$/,'');
    if(!/^[\d,\s]*$/.test(normalized))throw Error('목표 금액은 숫자로 입력해주세요. 소수점과 음수는 사용할 수 없습니다.');
    const digits=normalized.replace(/[,\s]/g,'').replace(/^0+(?=\d)/,'');
    if(digits&&BigInt(digits)>MAX)throw Error('목표 금액은 9,007,199,254,740,991원 이하로 입력해주세요.');
    return digits;
  }
  function korean(digits){
    if(!digits)return '목표 금액을 입력해주세요.';
    if(digits==='0')return '0원';
    const chunks=[];
    for(let end=digits.length,i=0;end>0;end-=4,i++){
      const value=Number(digits.slice(Math.max(0,end-4),end));
      if(value)chunks.unshift(comma(String(value))+groups[i]);
    }
    return chunks.join(' ')+'원';
  }
  function digitsBefore(value,index){return (value.slice(0,index).normalize('NFKC').match(/\d/g)||[]).length;}
  function caretAt(value,count){
    if(count<=0)return 0;
    for(let i=0,n=0;i<value.length;i++){if(/\d/.test(value[i])&&++n===count)return i+1;}
    return value.length;
  }
  function bind(input,preview){
    if(!input||!preview)return null;
    if(input._erpGoalMoney)return input._erpGoalMoney;
    let composing=false;
    if(!preview.id)preview.id='dfErpGoalAmountPreview';
    preview.setAttribute('role','status');preview.setAttribute('aria-live','polite');
    const described=new Set(String(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));described.add(preview.id);
    input.setAttribute('aria-describedby',[...described].join(' '));
    input.type='text';input.inputMode='numeric';input.autocomplete='off';
    function update(){
      if(composing)return false;
      const raw=input.value,start=digitsBefore(raw,input.selectionStart??raw.length),end=digitsBefore(raw,input.selectionEnd??raw.length);
      try{
        const digits=parse(raw),formatted=comma(digits);
        input.value=formatted;
        input.setSelectionRange(caretAt(formatted,start),caretAt(formatted,end));
        input.setCustomValidity('');input.removeAttribute('aria-invalid');
        preview.textContent=korean(digits);preview.dataset.invalid='false';
        return true;
      }catch(error){
        input.setCustomValidity(error.message);input.setAttribute('aria-invalid','true');
        preview.textContent=error.message;preview.dataset.invalid='true';
        return false;
      }
    }
    function onKey(event){
      if(composing||event.ctrlKey||event.metaKey||event.altKey||input.selectionStart!==input.selectionEnd)return;
      const pos=input.selectionStart,value=input.value;
      // A grouping comma should not become an obstacle when editing a number.
      let remove=-1,next=pos;
      if(event.key==='Backspace'&&value[pos-1]===','&&/\d/.test(value[pos-2]||'')){remove=pos-2;next=pos-2;}
      if(event.key==='Delete'&&value[pos]===','&&/\d/.test(value[pos+1]||'')){remove=pos+1;}
      if(remove<0)return;
      event.preventDefault();input.value=value.slice(0,remove)+value.slice(remove+1);input.setSelectionRange(next,next);update();
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    input.addEventListener('input',update);input.addEventListener('blur',update);input.addEventListener('keydown',onKey);
    input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;update();});
    const api={update,value:()=>{const digits=parse(input.value);if(!digits&&input.required)throw Error('목표 금액을 입력해주세요.');return digits?Number(digits):0;}};
    input._erpGoalMoney=api;update();return api;
  }
  const api={parse,comma,korean,bind};root.DFErpGoalInput=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
