/* Beta 3.3 · File-picker and drop operations share the existing upload handlers. */
(function(window,document){'use strict';
 if(window.DF_FILE_DROP?.scan)return;const legacy=window.DF_FILE_DROP;
 const nativeZones={qifFileInput:'#qifDropZone',qicFileInput:'#qicDropZone',rhxFileInput:'#rhxDropZone',hy2FinalInput:'#hy2FinalDrop'};
 const triggers={importFile:'importButton',qpfPledgeInput:'qpfPledgeChoose',dfErpInvoiceFiles:'dfErpInvoicePick',dfErpPaymentFiles:'dfErpPaymentPick',dfDocFile:'dfDocUpload',excelImportFile:'btnExcelImport',companyDocFileInput:'companyDocUploadBtn',rhxReferenceInput:'rhxReferenceChoose',qpfExcelFile:'qpfExcelImport'};
 const names={dfErpInvoiceFiles:'국세청 파일',dfErpPaymentFiles:'입출금 파일',excelImportFile:'기록지 엑셀',companyDocFileInput:'업체 첨부파일',dfDocFile:'문서 파일',rhxReferenceInput:'참고용 HWPX 양식',qpfExcelFile:'대장 엑셀',hy2ImportInput:'거래처DB 엑셀',dfBoardFiles:'게시판 첨부파일',dfApFormFiles:'결재 첨부파일',importFile:'가져오기 파일',upload:'문서 원본'};
 const records=new Map();let queued=false;
 const files=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
 const visible=e=>!!e&&!e.closest('[hidden]')&&getComputedStyle(e).display!=='none';
 function allowed(input,trigger){return input.isConnected&&!input.disabled&&(!trigger||!trigger.disabled&&visible(trigger));}
 function accepts(input,file){const rules=(input.accept||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),name=file.name.toLowerCase(),type=file.type.toLowerCase();return !rules.length||rules.some(r=>r[0]==='.'?name.endsWith(r):r.endsWith('/*')?type.startsWith(r.slice(0,-1)):type===r);}
 function attach(input){
  if(records.has(input))return;
  if(!input.id)input.id='dfDropFileInput'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  const native=input.matches('[data-rhxt-file]')?input.parentElement.querySelector('[data-rhxt-drop]'):nativeZones[input.id]&&document.querySelector(nativeZones[input.id]);
  if(native){records.set(input,{native});return;}
  let zone=document.querySelector('[data-df-file-target="'+input.id+'"]');
  if(!input.id)zone=null;
  const custom=!!zone,trigger=triggers[input.id]&&document.getElementById(triggers[input.id]);
  if(!zone){zone=document.createElement('div');zone.className='df-file-drop';zone.innerHTML='<strong></strong><small></small><button type="button">파일 선택</button><span class="df-file-drop-message" role="status"></span>';zone.querySelector('strong').textContent=(names[input.id]||'파일')+'을 여기에 끌어놓기';zone.querySelector('small').textContent=(input.multiple?'또는 클릭하여 여러 파일 선택':'또는 클릭하여 파일 선택')+(input.accept?' · '+input.accept.replaceAll(',',' / '):'');const host=input.id==='importFile'&&document.querySelector('.sidebar');if(host)host.append(zone);else input.after(zone);}
  if(legacy){zone.dataset.dfDropInput=input.id;if(trigger)zone.dataset.dfDropTrigger=trigger.id;if(input.id==='companyDocFileInput'){zone.dataset.companyDocUpload='기타';zone.querySelector('strong').textContent='기타 업체 첨부파일을 여기에 끌어놓기';}}
  zone.classList.add('df-file-drop');zone.tabIndex=0;zone.setAttribute('role','button');zone.setAttribute('aria-label',(names[input.id]||'파일')+' 선택 또는 끌어놓기');
  if(!zone.querySelector('.df-file-drop-message')){const message=document.createElement('span');message.className='df-file-drop-message';message.setAttribute('role','status');zone.append(message);}
  const message=text=>{zone.querySelector('.df-file-drop-message').textContent=text;};
  const choose=e=>{if(!allowed(input,trigger)||e.target===input||e.type==='click'&&trigger&&zone.contains(trigger)&&trigger.contains(e.target))return;e.preventDefault();e.stopPropagation();message('');if(trigger&&!zone.contains(trigger))trigger.click();else input.click();};
  zone.addEventListener('click',choose);zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){choose(e);}});
  ['dragenter','dragover'].forEach(type=>zone.addEventListener(type,e=>{if(!files(e))return;e.preventDefault();e.stopPropagation();if(allowed(input,trigger)){zone.classList.add('dragging');e.dataTransfer.dropEffect='copy';}else e.dataTransfer.dropEffect='none';}));
  zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('dragging');});
  zone.addEventListener('drop',e=>{
   if(!files(e))return;e.preventDefault();e.stopPropagation();zone.classList.remove('dragging');if(!allowed(input,trigger)){message('파일 등록 권한 또는 진행 중인 작업을 확인해주세요.');return;}
   const picked=Array.from(e.dataTransfer.files||[]);if(!picked.length)return;
   if(!input.multiple&&picked.length>1){message('한 번에 파일 1개를 선택해주세요.');return;}
   if(picked.some(file=>!accepts(input,file))){message('지원하는 파일 형식을 확인해주세요: '+input.accept);return;}
   const transfer=new DataTransfer();picked.forEach(f=>transfer.items.add(f));input.files=transfer.files;message(picked.length+'개 파일 선택');input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  records.set(input,{zone,trigger,custom});paint(input,records.get(input));
 }
 function paint(input,r){if(r.native)return;const block=!allowed(input,r.trigger);r.zone.classList.toggle('disabled',block);r.zone.setAttribute('aria-disabled',String(block));r.zone.tabIndex=block?-1:0;r.zone.querySelectorAll('button').forEach(b=>{if(b!==r.trigger&&b.disabled!==block)b.disabled=block;});if(!r.custom&&r.trigger){const hide=!visible(r.trigger);if(r.zone.hidden!==hide)r.zone.hidden=hide;}}
 function scan(){queued=false;for(const [input,r] of records){if(!input.isConnected){if(!r.custom)r.zone?.remove();records.delete(input);}else paint(input,r);}document.querySelectorAll('input[type="file"]').forEach(attach);}
 function schedule(){if(!queued){queued=true;queueMicrotask(scan);}}
 function init(){scan();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden']});
  // Dropping a file outside a target must not replace the website with that file.
  ['dragover','drop'].forEach(type=>document.addEventListener(type,e=>{if(files(e))e.preventDefault();},true));
  document.addEventListener('df:menu-permissions-changed',schedule);
 }
 window.DF_FILE_DROP=Object.assign({},legacy||{},{scan,refresh(){legacy?.refresh?.();scan();}});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window,document);
