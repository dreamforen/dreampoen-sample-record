/* DREAMFOREN Beta 3.10.1 · DFEN-QPF-13-05. Shared equipment IDs are the link for later ledgers. */
(function(){'use strict';
 const CODE='DFEN-QPF-13-05',BUCKET='quality-equipment-files';
 const defs=[['equipment_code','관리번호'],['equipment_name','장비명'],['manufacturer','제조사'],['model','모델명'],['serial_no','S/N'],['inspection_type','교정/정도검사'],['last_inspection','교정/정도검사 일자'],['next_inspection','차기 교정/정도검사 일자'],['purchase_date','구입일자'],['manager','관리책임자 정'],['deputy','관리책임자 부'],['note','비고']];
 const S={active:false,ready:false,busy:false,identity:null,rows:[],files:[],selected:'all',draft:null,baseline:'',pending:null,query:'',sort:'code',filter:'all',year:'all',reportDate:'',load:0};
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const me=()=>typeof dfCloudUser==='undefined'?null:dfCloudUser,db=()=>typeof dfSupabase==='undefined'?null:dfSupabase,profile=()=>typeof dfCloudProfile==='undefined'?null:dfCloudProfile;
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const can=a=>!!me()&&(window.DFMenuPermissions?.can('quality-forms',a,a==='view'||profile()?.role==='admin'||profile()?.access_permissions?.quality_edit===true)??false);
 function context(id=S.identity){if(!id||me()?.id!==id||!can('view')||!db())throw Error('로그인과 작성용 품질문서 권한을 확인해주세요.');return db();}
 const result=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
 const dirty=()=>!!window.DF_EQ_ASSETS?.hasPending()||!!S.pending||!!S.draft&&JSON.stringify(S.draft)!==S.baseline;
 const discard=()=>!S.busy&&!window.DF_EQ_ASSETS?.busy()&&(!dirty()||confirm('저장하지 않은 장비 정보와 업로드 선택을 취소할까요?'));
 function say(v,bad=false){if($('eqStatus')){$('eqStatus').textContent=v;$('eqStatus').className=bad?'bad':'ok';}}
 function error(e){const text=(e.code||'')+' '+(e.message||e);say(/PGRST202|42P01|schema cache/.test(text)?'장비대장 DB 설치가 필요합니다. 47_beta310_equipment_cycles_assets.sql 실행 여부를 확인해주세요.':e.message||String(e),true);}
 const run=fn=>(...a)=>Promise.resolve().then(()=>fn(...a)).catch(error);
 const normalized=v=>String(v??'').trim().toUpperCase();
 function dateText(v){
  const t=String(v??'').trim(),m=t.match(/^(\d{2}|\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\.?$/);
  if(!m)return t;const y=Number(m[1])+(m[1].length===2?2000:0),mm=Number(m[2]),d=Number(m[3]);
  const dt=new Date(Date.UTC(y,mm-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mm-1||dt.getUTCDate()!==d)return t;
  return `${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 }
 const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&dateText(v)===v&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const cycleOptions=[['legacy','기존 일자 / 직접 지정'],['6','6개월'],['12','1년'],['24','2년'],['36','3년'],['custom','직접 주기 설정'],['as_needed','수시'],['none','해당 없음']];
 function cycleChoice(f){if(f._cycle_custom)return 'custom';if(f.cycle_mode==='periodic')return f.cycle_unit==='months'&&['6','12','24','36'].includes(String(f.cycle_value))?String(f.cycle_value):'custom';return f.cycle_mode||'legacy';}
 function cycleLabel(f){return f.cycle_mode==='periodic'?`${f.cycle_value}${f.cycle_unit==='days'?'일':'개월'}`:f.cycle_mode==='as_needed'?'수시':f.cycle_mode==='none'?'해당 없음':'직접 입력';}
 function recalculate(f,strict=false){
  const mode=f.cycle_mode||'legacy';if(mode==='legacy')return f.next_inspection;
  if(mode==='as_needed')return f.next_inspection='수시';if(mode==='none')return f.next_inspection='-';
  if(mode!=='periodic')throw Error('검사주기를 확인해주세요.');
  const n=Number(f.cycle_value),unit=f.cycle_unit||'months',last=dateText(f.last_inspection);
  if(!Number.isInteger(n)||n<1||n>(unit==='days'?36500:1200)||!['days','months'].includes(unit)){if(strict)throw Error('검사주기는 개월 1~1200 또는 일 1~36500으로 입력해주세요.');return f.next_inspection='';}
  if(!iso(last)){if(strict)throw Error('자동 계산을 위해 최근 교정/정도검사 일자를 입력해주세요.');return f.next_inspection='';}
  const [y,m,d]=last.split('-').map(Number);let next;
  if(unit==='days')next=new Date(Date.UTC(y,m-1,d+n));else{const start=new Date(Date.UTC(y,m-1+n,1)),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();next=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),Math.min(d,end)));}
  f.next_inspection=next.toISOString().slice(0,10);return f.next_inspection;
 }
 function editor(f,selected,write){
  const input=(k,l,extra='')=>`<label>${l}<input data-eq-field="${k}" value="${esc(f[k])}" maxlength="500" ${write?'':'disabled'} ${extra}></label>`;
  const field=k=>input(k,defs.find(x=>x[0]===k)[1],selected&&k==='equipment_code'?'readonly':'');
  const mode=f.cycle_mode||'legacy',choice=cycleChoice(f);
  return `<div class="eq-fields">${['equipment_code','equipment_name','manufacturer','model','serial_no','inspection_type'].map(field).join('')}${input('last_inspection','최근 교정/정도검사 일자','placeholder="YYYY-MM-DD"')}<label>검사주기<select id="eqCycle" ${write?'':'disabled'}>${cycleOptions.map(([v,l])=>`<option value="${v}" ${choice===v?'selected':''}>${l}</option>`).join('')}</select></label><div class="eq-cycle-custom" id="eqCycleCustom" ${choice==='custom'?'':'hidden'}><label>기간<input id="eqCycleValue" type="number" min="1" max="36500" value="${esc(f.cycle_value||1)}" ${write?'':'disabled'}></label><label>단위<select id="eqCycleUnit" ${write?'':'disabled'}><option value="months" ${f.cycle_unit!=='days'?'selected':''}>개월</option><option value="days" ${f.cycle_unit==='days'?'selected':''}>일</option></select></label></div>${input('next_inspection','차기 교정/정도검사 일자',mode==='legacy'?'placeholder="YYYY-MM-DD"':'readonly placeholder="최근 검사일과 주기를 선택하세요"')}${field('purchase_date')}<div class="eq-cycle-help">최근 검사일에 선택한 기간을 더해 계산합니다. 수시는 고정 만료일 없이 표시됩니다.</div><div class="eq-manager-row">${field('manager')}${field('deputy')}</div><label class="eq-note-field">비고<textarea data-eq-field="note" maxlength="4000" ${write?'':'disabled'}>${esc(f.note)}</textarea></label></div>`;
 }
 function cycleInput(e){
  const f=S.draft;if(!f)return;
  if(e.target.id==='eqCycle'){const v=e.target.value;f._cycle_custom=v==='custom';f.cycle_mode=['legacy','as_needed','none'].includes(v)?v:'periodic';f.cycle_value=v==='custom'?(f.cycle_value||1):Number(v)||null;f.cycle_unit=v==='custom'?(f.cycle_unit||'months'):'months';recalculate(f);render();return;}
  if(e.target.id==='eqCycleValue')f.cycle_value=Number(e.target.value);if(e.target.id==='eqCycleUnit')f.cycle_unit=e.target.value;
  if(['eqCycleValue','eqCycleUnit'].includes(e.target.id)||e.target.dataset.eqField==='last_inspection'){recalculate(f);const next=document.querySelector('[data-eq-field="next_inspection"]');if(next)next.value=f.next_inspection||'';}
 }
 function status(data,now=today()){
  const t=dateText(data.next_inspection);
  if(data.inactive)return {key:'inactive',label:'사용중지',days:null};
  if(!iso(t))return {key:'unknown',label:t==='수시'?'수시':/자체/.test(t)?'자체 교정':t==='-'?'일자 해당 없음':'일자 확인',days:null};
  const days=Math.round((Date.parse(t+'T00:00:00Z')-Date.parse(now+'T00:00:00Z'))/86400000);
  return {key:days<0?'overdue':days<=30?'soon':'normal',label:days<0?`기한 경과 ${-days}일`:days===0?'오늘 예정':days<=30?`예정 ${days}일 전`:'정상',days};
 }
 function visible(){return S.rows.filter(r=>(!S.query||Object.values(r.data).join(' ').toLowerCase().includes(S.query.toLowerCase()))&&(S.filter==='all'||status(r.data).key===S.filter)).sort((a,b)=>{
  let n=0;if(S.sort==='due')n=(iso(a.data.next_inspection)?Date.parse(a.data.next_inspection):Infinity)-(iso(b.data.next_inspection)?Date.parse(b.data.next_inspection):Infinity);
  if(S.sort==='name')n=a.data.equipment_name.localeCompare(b.data.equipment_name,'ko');
  return (Number.isNaN(n)?0:n)||a.equipment_code.localeCompare(b.equipment_code,'ko',{numeric:true});
 });}
 const badge=d=>{const s=status(d);return `<span class="eq-badge ${s.key}">${esc(s.label)}</span>`;};
 function report(rows){return `<article class="eq-sheet"><header><h2>시험장비 등록대장</h2><span>작성일 ${esc(S.reportDate||today())}</span></header><table><colgroup>${[4,11,16,9,11,12,9,9,10,9,6,6].map(v=>`<col style="width:${v}%">`).join('')}</colgroup><thead><tr>${['NO.','관리번호','장비명','제조사','모델명','S/N','교정/정도검사','교정/정도검사 일자','차기 교정/정도검사 일자','구입일자'].map(v=>`<th rowspan="2">${v}</th>`).join('')}<th colspan="2">관리책임자</th></tr><tr><th>정</th><th>부</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td>${defs.slice(0,11).map(([k])=>`<td>${esc(r.data[k])}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="12">등록된 장비가 없습니다.</td></tr>'}</tbody></table><footer>${CODE} · Rev.${esc(window.DF_DOCUMENT_REVISIONS?.rev(CODE,'01')||'01')}<span>A4(297×210mm)</span></footer></article>`;}
 function render(){
  if(!$('eqPane'))return;const rows=visible(),selected=S.rows.find(r=>r.id===S.selected),write=S.ready&&!S.busy&&can(selected?'update':'create');
  $('eqTabs').hidden=S.selected==='all';$('eqTabs').innerHTML=`<button data-eq-tab="all">← 전체 등록대장 (${S.rows.length})</button><strong>${esc(selected?.equipment_code||'새 장비 등록')}</strong>`;
  $('eqSearch').disabled=S.busy||!!S.draft||!!S.pending||!!window.DF_EQ_ASSETS?.busy();

  $('eqSummary').innerHTML=[['all','전체'],['overdue','기한 경과'],['soon','30일 이내'],['unknown','일자 확인·해당 없음']].map(([k,l])=>`<button data-eq-filter="${k}">${l} <b>${S.rows.filter(r=>k==='all'||status(r.data).key===k).length}</b></button>`).join('');
  $('eqNew').disabled=!S.ready||S.busy||!can('create');$('eqChoose').disabled=!S.ready||S.busy||!can('upload')||!can('create');$('eqRefresh').disabled=S.busy;$('eqPrint').disabled=!S.ready||S.busy||!!S.pending||!!S.draft;
  $('eqDate').value=S.reportDate||today();$('eqDate').disabled=S.busy;
  const years=[...new Set(S.files.map(f=>f.register_date.slice(0,4)))].sort().reverse();$('eqYear').innerHTML='<option value="all">전체 연도</option>'+years.map(y=>`<option ${S.year===y?'selected':''}>${y}</option>`).join('');
  $('eqFiles').innerHTML=S.files.filter(f=>S.year==='all'||f.register_date.startsWith(S.year)).map(f=>`<article class="eq-file"><strong>${esc(f.name)}</strong><small>${esc(f.register_date.slice(0,10))} · 원본 ${f.row_count}대</small><button data-eq-file="${esc(f.id)}">미리보기</button><button data-eq-download="${esc(f.id)}">원본 받기</button></article>`).join('')||'<p class="eq-empty">보관된 원본이 없습니다.</p>';
  if(S.pending){const p=S.pending,exists=new Set(S.rows.map(r=>r.equipment_code)),skips=p.rows.filter(r=>exists.has(r.equipment_code)).length;
   $('eqMain').innerHTML=`<section class="eq-import"><h3>등록 전 확인</h3><p>${esc(p.file.name)} · ${p.rows.length}대 · 등록 후보 ${p.rows.length-skips}대 / 기존 ${skips}대</p><p>기존 장비와 삭제 이력이 있는 관리번호는 건너뜁니다. 기존 장비의 정보는 관리번호를 눌러 수정할 수 있습니다.</p>${p.warnings.length?`<p class="eq-warning">${p.warnings.map(esc).join('<br>')}</p>`:''}<button id="eqImportSave" ${S.busy?'disabled':''}>원본 보관 및 신규 장비 등록</button> <button id="eqCancel" ${S.busy?'disabled':''}>취소</button><div class="eq-table-wrap">${report(p.rows.map(data=>({data})))}</div></section>`;
  }else if(S.draft){const f=S.draft;$('eqMain').innerHTML=`<section class="eq-editor"><h3>${selected?'장비 정보 수정':'새 장비 등록'}</h3><p>${badge(f)}</p>${editor(f,selected,write)}<label class="eq-inactive"><input data-eq-field="inactive" type="checkbox" ${f.inactive?'checked':''} ${write?'':'disabled'}> 사용중지 장비</label><p>검사일은 원본 또는 검사성적서를 확인하여 입력해주세요.</p><button id="eqSave" ${write?'':'disabled'}>저장</button> <button id="eqCancel" ${S.busy?'disabled':''}>취소</button></section>`;
  }else if(selected){const f=selected.data;$('eqMain').innerHTML=`<section class="eq-detail"><header><div><small>${esc(selected.equipment_code)}</small><h3>${esc(f.equipment_name)}</h3></div>${badge(f)}</header><dl>${defs.slice(2,9).map(([k,l])=>`<div><dt>${l}</dt><dd>${esc(f[k]||'—')}</dd></div>`).join('')}<div><dt>검사주기</dt><dd>${esc(cycleLabel(f))}</dd></div><div class="eq-manager-row"><div><dt>관리책임자 정</dt><dd>${esc(f.manager||'—')}</dd></div><div><dt>관리책임자 부</dt><dd>${esc(f.deputy||'—')}</dd></div></div><div class="eq-note-field"><dt>비고</dt><dd>${esc(f.note||'—')}</dd></div></dl><div class="eq-detail-actions"><button id="eqEdit" ${S.busy||!can('update')?'disabled':''}>장비 정보 수정</button>${can('delete')?`<button id="eqDelete" class="eq-danger" ${S.busy?'disabled':''}>장비 삭제</button>`:''}</div><small class="eq-updated">최근 저장 ${esc(new Date(selected.updated_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</small><div id="eqAssets"></div></section>`;
  }else{$('eqMain').innerHTML=`<div class="eq-list-head"><h3>시험장비 등록대장</h3><span>${rows.length}대 표시 · 관리번호를 누르면 장비 정보가 열립니다.</span></div><div class="eq-table-wrap"><table class="eq-list"><colgroup><col style="width:12%"><col style="width:20%"><col style="width:12%"><col style="width:10%"><col style="width:11%"><col style="width:11%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>관리번호</th><th>장비명 / 모델명</th><th>S/N</th><th>검사 구분</th><th>최근 검사일</th><th>차기 검사일</th><th>관리책임자 정 / 부</th><th>상태</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button data-eq-tab="${esc(r.id)}">${esc(r.equipment_code)}</button></td><td>${esc(r.data.equipment_name)}<small>${esc(r.data.model)}</small></td><td>${esc(r.data.serial_no)}</td><td>${esc(r.data.inspection_type)}</td><td>${esc(r.data.last_inspection)}</td><td>${esc(r.data.next_inspection)}</td><td>${esc(r.data.manager)} / ${esc(r.data.deputy)}</td><td>${badge(r.data)}</td></tr>`).join('')||`<tr><td colspan="8">${S.ready?'등록된 장비가 없습니다. 위의 원본 관리에서 등록대장 엑셀을 업로드하거나 장비를 직접 등록해주세요.':'장비대장을 불러오는 중입니다.'}</td></tr>`}</tbody></table></div>`;}
  if($('eqAssets')&&selected)window.DF_EQ_ASSETS?.mount($('eqAssets'),selected,say);else window.DF_EQ_ASSETS?.unmount();
 }
 async function pages(table){let all=[];for(let from=0;;from+=500){const list=await result(context().from(table).select('*').order('id').range(from,from+499));context();all.push(...list);if(list.length<500)return all;}}
 async function reload(){const id=S.identity,token=++S.load;const [rows,files]=await Promise.all([pages('quality_equipment'),pages('quality_equipment_files')]);context(id);if(!S.active||token!==S.load)return;S.rows=rows;S.files=files.sort((a,b)=>b.created_at.localeCompare(a.created_at));S.ready=true;if(!S.reportDate)S.reportDate=S.files[0]?.register_date||today();}
 function originals(show){$('eqOriginalPanel').hidden=!show;$('eqOriginalToggle').setAttribute('aria-expanded',String(show));}
 function select(id){if(!discard())return;originals(false);S.pending=null;S.draft=null;S.selected=id;render();}
 function validate(d){d.equipment_code=normalized(d.equipment_code);if(!/^[A-Z0-9][A-Z0-9_.-]{1,79}$/.test(d.equipment_code))throw Error('관리번호는 영문·숫자·하이픈으로 입력해주세요.');if(!d.equipment_name?.trim())throw Error('장비명을 입력해주세요.');for(const [k] of defs){d[k]=String(d[k]??'').trim();if(d[k].length>(k==='note'?4000:500))throw Error('입력 내용이 너무 깁니다: '+k);}recalculate(d,true);for(const k of ['last_inspection','next_inspection','purchase_date']){d[k]=dateText(d[k]);if(/^\d/.test(d[k])&&!iso(d[k]))throw Error('날짜를 확인해주세요: '+d[k]);}return d;}
 async function parse(file){
  if(!/\.xlsx$/i.test(file.name)||!file.size||file.size>20*1024*1024)throw Error('20MB 이내 시험장비 등록대장 XLSX 파일을 선택해주세요.');
  if(!window.XLSX||!window.JSZip)throw Error('엑셀 구성요소를 불러오지 못했습니다. 새로고침해주세요.');
  const bytes=await file.arrayBuffer(),zip=await JSZip.loadAsync(bytes);let expanded=0;for(const f of Object.values(zip.files)){expanded+=f._data?.uncompressedSize||0;if(expanded>80*1024*1024)throw Error('압축을 푼 엑셀의 크기가 너무 큽니다.');}
  const wb=XLSX.read(bytes,{type:'array',cellDates:false,cellStyles:true}),rows=[],warnings=[],seen=new Set();let date='';
  const cell=(ws,addr,isDate=false)=>{const c=ws[addr];if(!c)return '';if(c.t==='e')throw Error('엑셀 오류 셀을 확인해주세요: '+addr);if(isDate&&typeof c.v==='number'){const d=XLSX.SSF.parse_date_code(c.v,{date1904:!!wb.Workbook?.WBProps?.date1904});if(!d)throw Error('날짜 셀을 확인해주세요: '+addr);return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}return isDate?dateText(c.v):String(c.w??c.v??'').trim();};
  for(const name of wb.SheetNames){const ws=wb.Sheets[name];if(!ws['!ref'])continue;const range=XLSX.utils.decode_range(ws['!ref']);let header=0;
   for(let n=1;n<=Math.min(range.e.r+1,40);n++)if(cell(ws,'B'+n).replace(/\s/g,'')==='관리번호'&&cell(ws,'C'+n).replace(/\s/g,'')==='장비명'){header=n;break;}
   if(!header)continue;
   const headers={D:'제조사',E:'모델명',G:'S/N',H:'교정/정도검사',I:'교정/정도검사일자',J:'차기교정/정도검사일자',K:'구입일자'};
   for(const [col,label] of Object.entries(headers))if(cell(ws,col+header).replace(/\s/g,'')!==label)throw Error(name+' 시트의 '+col+'열 제목을 확인해주세요. 원본 등록대장 양식이 필요합니다.');
   if(range.e.r>2000)throw Error('장비 데이터는 시트당 2,000행 이내로 정리해주세요.');date=date||dateText(cell(ws,'M'+(header-1),true));
   const numbers=new Set();
   for(let n=header+2;n<=range.e.r+1;n++){const code=normalized(cell(ws,'B'+n)),title=cell(ws,'C'+n);if(!code&&!title)continue;if(!code||!title)throw Error(`${name} ${n}행 관리번호 또는 장비명이 비어 있습니다.`);if(seen.has(code))throw Error('엑셀 안에 중복 관리번호가 있습니다: '+code);seen.add(code);
    const d={equipment_code:code,equipment_name:title,manufacturer:cell(ws,'D'+n),model:cell(ws,'E'+n),serial_no:cell(ws,'G'+n),inspection_type:cell(ws,'H'+n),last_inspection:cell(ws,'I'+n,true),next_inspection:cell(ws,'J'+n,true),purchase_date:cell(ws,'K'+n,true),manager:cell(ws,'L'+n),deputy:cell(ws,'M'+n),note:[cell(ws,'N'+n),cell(ws,'O'+n)].filter(Boolean).join(' '),source_sheet:name,source_row:n,source_no:cell(ws,'A'+n),inactive:false};
    if(numbers.has(d.source_no))warnings.push('원본 NO. '+d.source_no+'가 중복되어 있습니다. 화면 순번은 자동 표시하며 관리번호로 구분합니다.');numbers.add(d.source_no);rows.push(validate(d));
   }
  }
  if(!rows.length)throw Error('시험장비 등록대장 형식의 데이터가 없습니다.');if(rows.length>500)throw Error('한 번에 최대 500대까지 등록할 수 있습니다.');
  warnings.push('S/N은 원본 G열을 사용합니다. 숨김 F열은 가져오지 않으며 원본 파일에는 그대로 보관됩니다.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  return {file,rows,warnings,date:iso(date)?date:today(),id:crypto.randomUUID(),hash};
 }
 async function prepare(file){if(!file||!S.ready||S.busy||!can('create')||!can('upload')||!discard())return;const id=S.identity;S.busy=true;render();try{const p=await parse(file);context(id);if(!S.active)return;S.pending=p;originals(false);S.draft=null;S.selected='all';S.reportDate=p.date;say('원본과 등록할 장비를 확인한 뒤 등록 버튼을 눌러주세요.');}finally{S.busy=false;render();}}
 async function importSave(){if(!S.pending||S.busy||!can('create')||!can('upload'))return;const id=S.identity,p=S.pending;context(id);S.busy=true;render();try{
  const path=`${id}/${p.id}.xlsx`;if(!p.uploaded){await result(context(id).storage.from(BUCKET).upload(path,p.file,{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:false}));context(id);p.uploaded=true;}
  const answer=await result(context(id).rpc('df_equipment_import',{p_file:{id:p.id,name:p.file.name,path,size:p.file.size,sha256:p.hash,register_date:p.date},p_rows:p.rows}));context(id);S.pending=null;await reload();say(`원본 보관 완료 · 신규 ${answer.inserted}대 등록 · 기존·삭제 이력 ${answer.skipped}대 건너뜀`);
 }finally{S.busy=false;render();}}
 function edit(f){S.pending=null;S.draft=JSON.parse(JSON.stringify(f));S.baseline=JSON.stringify(S.draft);render();}
 async function save(){if(!S.draft||S.busy)return;const old=S.rows.find(r=>r.id===S.selected);if(!can(old?'update':'create'))throw Error('장비 저장 권한이 없습니다.');const d=validate({...S.draft}),id=S.identity;context(id);S.busy=true;render();try{const r=await result(context(id).rpc('df_equipment_save',{p_id:old?.id||null,p_version:old?.lock_version??null,p_data:d}));context(id);S.draft=null;S.selected=r.id;await reload();say('장비 정보를 저장하고 연결된 장비관리대장의 검사일자를 반영했습니다.');document.dispatchEvent(new CustomEvent('df:equipment-dates-saved',{detail:{equipment_id:r.id,source:'register'}}));}finally{S.busy=false;render();}}
 async function archive(){
  const row=S.rows.find(r=>r.id===S.selected);if(!row||S.busy||window.DF_EQ_ASSETS?.busy()||!can('delete'))return;
  if(!confirm(`${row.equipment_code} · ${row.data.equipment_name}\n\n이 장비를 삭제할까요?\n목록·검색·인쇄에서 제외되며 사진과 성적서도 함께 숨겨집니다.\n장비와 첨부 이력은 보존됩니다.`))return;
  if(!discard())return;const id=S.identity;S.busy=true;render();
  try{const answer=await context(id).rpc('df_equipment_archive',{p_id:row.id,p_version:row.lock_version});if(answer.error){if(/PGRST202|schema cache/.test((answer.error.code||'')+' '+answer.error.message))throw Error('48_beta3101_equipment_delete.sql을 먼저 실행해주세요.');throw answer.error;}context(id);window.DF_EQ_ASSETS?.reset();S.rows=S.rows.filter(r=>r.id!==row.id);S.selected='all';S.draft=null;S.pending=null;await reload();say(row.equipment_code+' 장비를 삭제했습니다.');}finally{S.busy=false;render();}
 }
 async function fileOpen(id,download=false){const f=S.files.find(x=>x.id===id);if(!f)return;const identity=S.identity,b=await result(context().storage.from(BUCKET).download(f.path));context(identity);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');context(identity);if(hash!==f.sha256)throw Error('원본 파일 확인에 실패했습니다.');if(!download&&window.DF_QUALITY_FILE_PREVIEW)return DF_QUALITY_FILE_PREVIEW.open({name:f.name,size:f.size,mime:b.type,load:()=>Promise.resolve(b)});const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function print(){context();if(S.pending||S.draft)throw Error('등록 또는 저장을 마친 뒤 인쇄해주세요.');const w=window.open('','_blank');if(!w)throw Error('팝업 차단을 해제해주세요.');const rows=S.selected==='all'?visible():S.rows.filter(r=>r.id===S.selected),base=new URL('.',document.baseURI).href,css=Array.from(document.styleSheets).filter(s=>s.href?.includes('qpf_equipment.css')).map(s=>Array.from(s.cssRules).map(r=>r.cssText).join('\n')).join('\n');w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="${esc(base)}"><title>시험장비 등록대장</title><style>${css}</style><link rel="stylesheet" href="qpf_equipment.css?v=beta3101"></head><body class="eq-print"><nav><button onclick="window.print()">인쇄 / PDF 저장</button></nav>${report(rows)}</body></html>`);w.document.close();}
 function header(){window.DF_QPF_FORMS.state.view='qpf-equipment';$('dfDocTitle').textContent=CODE+' (01) 시험장비 등록대장';$('dfDocDescription').textContent='장비별 등록정보 · 검사예정일 · 원본 엑셀 보관';$('dfDocBack').textContent='← 작성용 품질문서';}
 function ensure(){if($('eqPane'))return;const pane=document.createElement('section');pane.id='eqPane';pane.hidden=true;pane.innerHTML=`<div class="eq-toolbar"><input id="eqSearch" type="search" placeholder="관리번호 · 장비명 · S/N · 담당자" aria-label="장비 검색"><select id="eqSort" aria-label="정렬"><option value="code">관리번호순</option><option value="due">차기 검사일 빠른순</option><option value="name">장비명순</option></select><select id="eqFilter" aria-label="검사 상태"><option value="all">전체 상태</option><option value="overdue">기한 경과</option><option value="soon">30일 이내</option><option value="normal">정상</option><option value="unknown">일자 확인·해당 없음</option><option value="inactive">사용중지</option></select><button id="eqRefresh">새로고침</button><button id="eqNew">+ 장비 등록</button><button id="eqPrint">미리보기 / 인쇄</button><button id="eqOriginalToggle" aria-expanded="false" aria-controls="eqOriginalPanel">원본 관리</button><label>대장 작성일 <input id="eqDate" type="date"></label></div><section id="eqOriginalPanel" hidden aria-label="등록대장 원본 관리"><h3>원본 등록대장 업로드</h3><div id="eqDrop" tabindex="0" role="button" aria-label="원본 엑셀 선택"><b>엑셀 파일을 끌어놓으세요</b><small>XLSX · 20MB 이내</small><button id="eqChoose">파일 선택</button><input id="eqInput" data-df-drop="off" type="file" accept=".xlsx" hidden></div><p class="eq-hint">원본을 보관하고 관리번호별로 신규 장비를 등록합니다.</p><h3>보관된 원본</h3><select id="eqYear" aria-label="원본 조회 연도"><option value="all">전체 연도</option></select><div id="eqFiles"></div></section><div id="eqStatus" role="status" aria-live="polite"></div><div id="eqSummary"></div><div id="eqTabs" aria-label="전체 등록대장으로 이동"></div><div class="eq-layout"><main id="eqMain"></main></div>`;$('dfQualityFormWorkspace').append(pane);
  $('eqOriginalToggle').onclick=()=>originals($('eqOriginalPanel').hidden);
  $('eqSearch').oninput=e=>{if(S.draft||S.pending||S.busy||window.DF_EQ_ASSETS?.busy())return;S.query=e.target.value;S.selected='all';render();};$('eqSort').onchange=e=>{S.sort=e.target.value;render();};$('eqFilter').onchange=e=>{S.filter=e.target.value;render();};$('eqYear').onchange=e=>{S.year=e.target.value;render();};$('eqDate').onchange=e=>{S.reportDate=e.target.value||today();};
  $('eqNew').onclick=()=>{if(!discard())return;S.selected='new';edit(Object.fromEntries(defs.map(([k])=>[k,''])));};$('eqChoose').onclick=e=>{e.stopPropagation();$('eqInput').click();};$('eqInput').onchange=run(e=>{const f=e.target.files[0];e.target.value='';return prepare(f);});
  $('eqRefresh').onclick=run(async()=>{if(!discard())return;S.pending=null;S.draft=null;S.busy=true;render();try{await reload();say('최신 장비 정보를 불러왔습니다.');}finally{S.busy=false;render();}});$('eqPrint').onclick=run(print);
  const drop=$('eqDrop');drop.onclick=()=>{if(!$('eqChoose').disabled)$('eqInput').click();};drop.onkeydown=e=>{if(e.target===drop&&['Enter',' '].includes(e.key)){e.preventDefault();drop.click();}};drop.ondragover=e=>{e.preventDefault();e.stopPropagation();};drop.ondrop=run(e=>{e.preventDefault();e.stopPropagation();if(e.dataTransfer.files.length!==1)throw Error('엑셀 파일을 한 개씩 선택해주세요.');return prepare(e.dataTransfer.files[0]);});
  pane.addEventListener('input',e=>{const k=e.target.dataset.eqField;if(k&&S.draft)S.draft[k]=k==='inactive'?e.target.checked:e.target.value;if(!['eqCycle','eqCycleUnit'].includes(e.target.id))cycleInput(e);});
  pane.addEventListener('change',e=>{if(['eqCycle','eqCycleUnit'].includes(e.target.id))cycleInput(e);});
  pane.addEventListener('click',run(async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.eqTab)select(b.dataset.eqTab);else if(b.dataset.eqFilter){S.filter=b.dataset.eqFilter;$('eqFilter').value=S.filter;render();}else if(b.dataset.eqFile)await fileOpen(b.dataset.eqFile);else if(b.dataset.eqDownload)await fileOpen(b.dataset.eqDownload,true);else if(b.id==='eqEdit'&&!window.DF_EQ_ASSETS?.busy())edit(S.rows.find(r=>r.id===S.selected).data);else if(b.id==='eqDelete')await archive();else if(b.id==='eqCancel'){if(!discard())return;S.pending=null;S.draft=null;if(S.selected==='new')S.selected='all';render();}else if(b.id==='eqSave')await save();else if(b.id==='eqImportSave')await importSave();}));
 }
 async function open(){if(S.busy||window.DF_EQ_ASSETS?.busy())return;if(!can('view'))throw Error('작성용 품질문서 조회 권한이 없습니다.');window.DF_QPF_FORMS.open();ensure();originals(false);Object.assign(S,{active:true,ready:false,identity:me().id,rows:[],files:[],draft:null,pending:null,selected:'all',reportDate:'',query:'',filter:'all',sort:'code',year:'all'});$('eqPane').hidden=false;$('qpfFolderPane').hidden=true;$('qpfLedgerPane').hidden=true;$('eqSearch').value='';$('eqFilter').value='all';$('eqSort').value='code';header();render();say('장비 등록대장을 불러오는 중입니다…');await reload();render();say(S.rows.length?S.rows.length+'대의 장비를 불러왔습니다.':'원본 시험장비 등록대장 엑셀을 업로드해주세요.');}
 function close(){window.DF_EQ_ASSETS?.reset();S.active=false;S.load++;if($('eqPane'))$('eqPane').hidden=true;}
 const navigation={capture(){return {...S,rows:S.rows.slice(),files:S.files.slice(),draft:S.draft?{...S.draft}:null};},canLeave(){return !S.busy&&!window.DF_EQ_ASSETS?.busy();},async restore(v){if(v?.identity!==me()?.id){close();throw Error('계정이 변경되어 장비대장을 다시 열어야 합니다.');}ensure();Object.assign(S,v,{active:true,busy:false});$('eqPane').hidden=false;$('eqSearch').value=S.query;$('eqFilter').value=S.filter;$('eqSort').value=S.sort;if(!S.draft)await reload();header();render();}};
 addEventListener('beforeunload',e=>{if(S.active&&(dirty()||window.DF_EQ_ASSETS?.busy())){e.preventDefault();e.returnValue='';}});
 async function refreshClean(){if(!S.active||!S.ready||S.busy||S.draft||S.pending||window.DF_EQ_ASSETS?.busy())return;S.busy=true;try{await reload();}finally{S.busy=false;render();}}
 addEventListener('focus',run(refreshClean));document.addEventListener('df:equipment-dates-saved',run(e=>{if(e.detail?.source!=='register')return refreshClean();}));
 document.addEventListener('df:menu-permissions-changed',()=>{if(!S.active)return;if(!can('view')){S.rows=[];S.files=[];S.pending=null;S.draft=null;S.ready=false;close();}else render();});
 window.DF_QPF_EQUIPMENT={open:run(open),close,confirmDiscard:discard,navigation,state:S,_test:{parse,dateText,status,visible,validate,report,recalculate,cycleChoice}};
})();
