/* Beta 3.37 · explicit choices for overlapping sampling edits. */
(function(window,document){'use strict';
 let active=null;
 const format=value=>value===undefined?'(항목 없음)':value===null?'(빈 값)':value===''?'(빈칸)':typeof value==='object'?JSON.stringify(value,null,2):String(value);
 function choose(report){
  if(active)return Promise.reject(Error('먼저 열려 있는 저장값 확인을 마쳐주세요.'));
  return new Promise(resolve=>{
   const model=window.DF_SAMPLE_SAVE_MODEL;
   if(!document.getElementById('dfSampleReviewStyle')){
    const style=document.createElement('style');style.id='dfSampleReviewStyle';style.textContent='#dfSampleReview{width:min(800px,calc(100vw - 28px));max-height:85vh;border:1px solid #cbd5e1;border-radius:12px;padding:22px;color:#1e293b;background:white;font:13px/1.5 sans-serif;box-sizing:border-box}#dfSampleReview::backdrop{background:#0f172a66}#dfSampleReview h2{font-size:18px;margin:0 0 8px}#dfSampleReview p{margin:6px 0 14px}#dfSampleReview .scroll{max-height:52vh;overflow:auto}#dfSampleReview table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}#dfSampleReview th,#dfSampleReview td{border:1px solid #dbe2ea;padding:10px;text-align:left;vertical-align:top}#dfSampleReview th{background:#f1f5f9}#dfSampleReview th:first-child{width:27%}#dfSampleReview label{display:flex;align-items:flex-start;gap:8px;cursor:pointer;min-height:36px}#dfSampleReview input{width:auto;flex:none;margin-top:5px}#dfSampleReview pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:inherit}#dfSampleReview button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:6px;padding:8px 12px;font-size:13px;cursor:pointer}#dfSampleReview button[data-save]{background:#1d4ed8;border-color:#1d4ed8;color:white}#dfSampleReview .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}#dfSampleReview .bulk{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}#dfSampleReview [role=status]{color:#b91c1c;margin-top:8px}@media(max-width:520px){#dfSampleReview{padding:14px}#dfSampleReview td,#dfSampleReview th{padding:6px}}';document.head.append(style);
   }
   const dialog=document.createElement('dialog');dialog.id='dfSampleReview';dialog.setAttribute('aria-labelledby','dfSampleReviewTitle');
   dialog.innerHTML='<h2 id="dfSampleReviewTitle">저장할 값 확인</h2><p data-description></p><div class="bulk"><button type="button" data-all="draft">내 입력 모두 선택</button><button type="button" data-all="server">서버 값 모두 선택</button></div><div class="scroll"><table><thead><tr><th>확인할 항목</th><th>현재 서버 값</th><th>내 입력값</th></tr></thead><tbody></tbody></table></div><div role="status" aria-live="polite"></div><div class="actions"><button type="button" data-cancel>나중에 확인</button><button type="button" data-save>선택한 값으로 저장</button></div>';
   dialog.querySelector('[data-description]').textContent=report.receipt+' · 같은 항목에 서로 다른 값이 있습니다. 각 항목에서 저장할 값을 선택해주세요. 다른 변경 내용은 함께 보존됩니다.';
   const body=dialog.querySelector('tbody');
   report.paths.forEach((path,index)=>{
    const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';heading.textContent=model.label(path);row.append(heading);
    for(const side of ['server','draft']){
     const td=document.createElement('td'),label=document.createElement('label'),radio=document.createElement('input'),value=document.createElement('pre');
     radio.type='radio';radio.name='dfSampleChoice'+index;radio.value=side;radio.dataset.path=path;radio.setAttribute('aria-label',model.label(path)+' '+(side==='server'?'서버 값':'내 입력값'));
     value.textContent=format(model.get(report[side],path));label.append(radio,value);td.append(label);row.append(td);
    }
    body.append(row);
   });
   let finished=false;
   const finish=value=>{if(finished)return;finished=true;active=null;dialog.close();dialog.remove();resolve(value);};
   dialog.querySelector('[data-cancel]').onclick=()=>finish(null);
   dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
   for(const button of dialog.querySelectorAll('[data-all]'))button.onclick=()=>{for(const input of dialog.querySelectorAll('input[type=radio]'))input.checked=input.value===button.dataset.all;dialog.querySelector('[role=status]').textContent='';};
   dialog.querySelector('[data-save]').onclick=()=>{
    const selected={};for(const input of dialog.querySelectorAll('input:checked'))selected[input.dataset.path]=input.value;
    if(report.paths.some(path=>!Object.hasOwn(selected,path))){dialog.querySelector('[role=status]').textContent='각 항목에서 저장할 값을 선택해주세요.';return;}
    finish(selected);
   };
   document.body.append(dialog);active=dialog;dialog.showModal();
  });
 }
 window.DF_SAMPLE_SAVE_REVIEW=Object.freeze({choose});
})(window,document);
