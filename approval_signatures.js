/* Expense approval signatures: each approval captures its own signature and server date. */
(function(){'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const png=v=>typeof v==='string'&&v.length<=150000&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(v)?v:'';
 function date(v){const t=Date.parse(v||'');return Number.isFinite(t)?new Date(t+32400000).toISOString().slice(0,10):'';}
 function markup(step){
  if(step?.status!=='approved')return '';
  const image=png(step.signature?.image),text=step.signature?.text||step.actor?.name||step.approver?.name||'승인',day=date(step.acted_at);
  return `<span class="dfa-approval-sign-block">${image?`<img class="dfa-approval-sign-image" src="${esc(image)}" alt="${esc(step.actor?.name||text)} 결재 서명">`:`<span class="dfa-approved-signature">${esc(text)}</span>`}<span class="dfa-signature-date">${esc(day||'날짜 미확인')}</span></span>`;
 }
 function mount(modal,name,stepName){
  const decision=modal.querySelector('.df-approval-decision');if(!decision)return;
  const box=document.createElement('section');box.className='df-ap-sign-editor';
  box.innerHTML=`<div class="df-ap-sign-head"><b>${esc(stepName)} 결재 서명</b><small>승인하면 서명 아래에 결재일이 자동으로 저장됩니다.</small></div><div class="df-ap-sign-tools"><label>서명 입력 <input data-ap-sign-text maxlength="24" value="${esc(name)}" placeholder="이름 또는 서명"></label><button type="button" data-ap-sign-draw>직접 그리기</button><button type="button" data-ap-sign-clear>지우기</button></div><div class="df-ap-sign-drawing" hidden><canvas width="560" height="180" aria-label="결재자 서명 그리기"></canvas><button type="button" data-ap-sign-apply>서명 적용</button><button type="button" data-ap-sign-reset>다시 그리기</button></div><div class="df-ap-sign-preview"></div>`;
  decision.before(box);const canvas=box.querySelector('canvas'),ctx=canvas.getContext('2d'),panel=box.querySelector('.df-ap-sign-drawing'),preview=box.querySelector('.df-ap-sign-preview');
  let active=false,ink=false,dirty=false,image='';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
  const point=e=>{const b=canvas.getBoundingClientRect();return [(e.clientX-b.left)*canvas.width/b.width,(e.clientY-b.top)*canvas.height/b.height];};
  const show=()=>{preview.innerHTML=image?`<img src="${esc(image)}" alt="적용된 결재 서명"><small>서명 적용됨 · 결재일은 승인 시 저장</small>`:'';};
  canvas.addEventListener('pointerdown',e=>{active=true;dirty=true;canvas.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(...point(e));e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!active)return;ink=true;ctx.lineTo(...point(e));ctx.stroke();e.preventDefault();});
  ['pointerup','pointercancel'].forEach(t=>canvas.addEventListener(t,()=>active=false));
  box.querySelector('[data-ap-sign-draw]').onclick=()=>panel.hidden=!panel.hidden;
  box.querySelector('[data-ap-sign-reset]').onclick=()=>{ctx.clearRect(0,0,560,180);ink=false;dirty=false;};
  box.querySelector('[data-ap-sign-apply]').onclick=()=>{if(!ink)return alert('서명을 그린 후 적용해주세요.');
   const pixels=ctx.getImageData(0,0,560,180).data;let left=560,top=180,right=0,bottom=0;
   for(let y=0;y<180;y++)for(let x=0;x<560;x++)if(pixels[(y*560+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   const crop=document.createElement('canvas');crop.width=right-left+17;crop.height=bottom-top+17;crop.getContext('2d').drawImage(canvas,left,top,right-left+1,bottom-top+1,8,8,right-left+1,bottom-top+1);
   image=png(crop.toDataURL('image/png'));if(!image)return alert('서명 크기가 너무 큽니다. 간단히 다시 그려주세요.');dirty=false;show();panel.hidden=true;
  };
  box.querySelector('[data-ap-sign-clear]').onclick=()=>{image='';ink=false;dirty=false;ctx.clearRect(0,0,560,180);box.querySelector('[data-ap-sign-text]').value='';show();};
  modal._dfReadSignature=()=>{const text=box.querySelector('[data-ap-sign-text]').value.trim();if(dirty)throw Error('그린 서명을 적용한 후 승인해주세요.');if(!text&&!image)throw Error('결재 서명을 입력하거나 직접 그려주세요.');return {text,image};};
 }
 window.DFApprovalSign={mount,markup,read:modal=>{if(!modal._dfReadSignature)throw Error('서명 입력창을 다시 열어주세요.');return modal._dfReadSignature();}};
})();
