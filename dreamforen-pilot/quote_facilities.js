/* Quotation-only facility grouping. No company, facility master or ERP links. */
(function(global){
  'use strict';
  const clean=v=>String(v??'').trim(),number=v=>Number(v)||0,clone=v=>JSON.parse(JSON.stringify(v));
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const records=new Map(),states=new WeakMap();let storageError='';
  const uid=()=>global.crypto?.randomUUID?.()||'facility-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  function splitSpecification(value){
    const text=clean(value),m=text.match(/^(.*?)\s*\(((?:\d+(?:\.\d+)?\s*회\s*\/\s*(?:반기|분기|년|연|월|주|일))|(?:(?:연|년|반기|분기|월|주|일)\s*\d+(?:\.\d+)?\s*회))\)\s*$/);
    return m?{facility:clean(m[1]),cycle:clean(m[2])}:{facility:text,cycle:''};
  }
  const specification=(facility,cycle)=>clean(facility)+(clean(cycle)?' ('+clean(cycle)+')':'');
  const signature=rows=>JSON.stringify(rows.map(x=>[clean(x.id),number(x.sort_order),String(x.item_name??''),String(x.specification??''),number(x.quantity),number(x.unit_price)]).sort((a,b)=>a[1]-b[1]));
  function matches(record,rows){return Array.isArray(record?.source_items)&&signature(record.source_items)===signature(rows);}
  async function load(client,actor){
    const next=[];let error='';
    try{
      for(let start=0;;start+=1000){
        const q=await client.from('sales_quote_facility_layouts').select('*').order('document_id',{ascending:true}).range(start,start+999);
        if(q.error)throw q.error;next.push(...(q.data||[]));if((q.data||[]).length<1000)break;
      }
    }catch(e){error=['42P01','PGRST205'].includes(e.code)?'설비별 견적 저장 준비가 필요합니다. 배포파일의 01_apply_all.sql을 적용해주세요.':'설비별 견적 정보를 불러오지 못했습니다. 새로고침 후 다시 확인해주세요. '+clean(e.message);}
    if(client!==(typeof dfSupabase==='undefined'?null:dfSupabase)||actor!==(typeof dfCloudUser==='undefined'?null:dfCloudUser?.id))return;
    records.clear();next.forEach(row=>records.set(row.document_id,row));storageError=error;
  }
  function savedLayout(doc,rows){
    if(doc?.facility_layout)return clone(doc.facility_layout);
    const record=records.get(doc?.id);return matches(record,rows)?clone(record.layout):null;
  }
  function init(create){
    const original=document.getElementById('dfSalesQuoteNew');if(!original||document.getElementById('dfSalesFacilityQuoteNew'))return;
    const button=document.createElement('button');button.type='button';button.id='dfSalesFacilityQuoteNew';button.className='company-btn secondary';button.textContent='설비별 견적 작성';
    button.dataset.dfMenuModule='sales-quotes';button.dataset.dfMenuAction='create';button.dataset.dfMenuLegacy='true';button.onclick=create;
    const actions=document.createElement('div');actions.className='df-quote-create-actions';original.before(actions);actions.append(original,button);global.DFMenuPermissions?.apply?.(actions);
  }
  function mount(form,doc,{makeRow,recalc,preferred='item',sourceItems=[]}={}){
    const container=form.querySelector('#dfSalesItemRows'),head=form.querySelector('.df-sales-items-head'),record=records.get(doc?.id);
    const sourceRows=()=>[...container.querySelectorAll('.df-sales-item-row')];
    const readRow=row=>({item_name:row.querySelector('[name=item_name]').value,specification:row.querySelector('[name=specification]').value,quantity:number(row.querySelector('[name=quantity]').value),unit_price:number(row.querySelector('[name=unit_price]').value)});
    const originalItems=sourceRows().map(readRow),layout=savedLayout(doc,sourceItems);
    const select=document.createElement('select');select.className='df-quote-layout-select';select.setAttribute('aria-label','견적 방식');select.innerHTML='<option value="item">일반 견적</option><option value="facility">설비별 견적</option>';head.querySelector('h3').after(select);
    const add=document.createElement('button');add.type='button';add.className='company-btn secondary';add.textContent='설비 추가';add.dataset.facilityAdd='';head.append(add);
    const state={form,container,mode:layout?.mode==='facility'?'facility':preferred,managed:!!record,select,add};states.set(form,state);
    function rowElement(item,cycle=''){
      const template=document.createElement('template');template.innerHTML=makeRow(item);const row=template.content.firstElementChild;
      row.querySelector('[name=quantity]').value=String(item.quantity??1);
      const spec=row.querySelector('[name=specification]'),hidden=document.createElement('input'),input=document.createElement('input');hidden.type='hidden';hidden.name='specification';hidden.value=item.specification||'';
      input.name='quote_cycle';input.value=cycle;input.placeholder='예: 1회/반기';input.setAttribute('aria-label','측정주기');spec.replaceWith(input);row.append(hidden);return row;
    }
    function addGroup({key=uid(),name='',rows=[]}={}){
      const group=document.createElement('section');group.className='df-quote-facility-group';group.dataset.quoteFacilityGroup=key;
      group.innerHTML='<header><button type="button" class="df-quote-group-handle" data-quote-group-handle title="설비를 끌어서 순서 변경" aria-label="설비 묶음 끌어서 이동">⠿</button><label>설비<input name="quote_facility_name" placeholder="설비명" value="'+escape(name)+'"></label><button type="button" class="company-btn secondary" data-facility-item-add>항목 추가</button><button type="button" class="company-btn danger" data-facility-remove>설비 삭제</button></header><div class="df-quote-facility-columns"><span></span><span>항목</span><span>주기</span><span>수량(횟수)</span><span>단가</span><span>공급가액</span><span></span></div><div data-facility-items></div>';
      const list=group.querySelector('[data-facility-items]');for(const item of rows)list.append(rowElement(item,item.cycle||''));if(!rows.length)list.append(rowElement({quantity:1}));container.append(group);return group;
    }
    function infer(flat){
      const groups=[],map=new Map();for(const item of flat){const parsed=splitSpecification(item.specification),name=parsed.facility||(clean(item.item_name)?'공통 항목':''),key=name.normalize('NFKC').replace(/\s+/g,' ').trim();
        if(!map.has(key)){const group={key:uid(),name,rows:[]};map.set(key,group);groups.push(group);}map.get(key).rows.push({...item,cycle:parsed.cycle});}
      return groups;
    }
    function fromLayout(flat,saved){
      const positions=new Map(sourceItems.map((item,i)=>[number(item.sort_order),i]));
      return saved.groups.map(group=>({key:group.key,name:group.name,rows:group.rows.map(meta=>({...flat[positions.get(number(meta.sort_order))],cycle:meta.cycle||''}))}));
    }
    function sync(){
      if(state.mode!=='facility')return;
      container.querySelectorAll('[data-quote-facility-group]').forEach(group=>{const name=group.querySelector('[name=quote_facility_name]').value;group.querySelectorAll('.df-sales-item-row').forEach(row=>row.querySelector('[name=specification]').value=specification(name,row.querySelector('[name=quote_cycle]').value));});
    }
    function render(mode,flat,saved){
      state.mode=mode;select.value=mode;add.hidden=mode!=='facility';container.classList.toggle('df-quote-facility-mode',mode==='facility');container.replaceChildren();
      if(mode==='facility'){const groups=saved?.groups?.length?fromLayout(flat,saved):infer(flat);for(const group of groups)addGroup(group);if(!groups.length)addGroup();}
      else flat.forEach(item=>{container.insertAdjacentHTML('beforeend',makeRow(item));container.lastElementChild.querySelector('[name=quantity]').value=String(item.quantity??1);});
      sync();recalc();
    }
    select.onchange=()=>{sync();const flat=sourceRows().map(readRow);if(select.value==='facility'&&flat.some(x=>clean(x.item_name))&&!global.confirm('같은 설비의 항목을 묶을까요? 입력한 수량·단가·금액은 유지됩니다.')){select.value=state.mode;return;}render(select.value,flat);};
    add.onclick=()=>{const group=addGroup();recalc();group.querySelector('[name=quote_facility_name]').focus();};
    container.addEventListener('click',event=>{
      const group=event.target.closest('[data-quote-facility-group]');if(!group)return;
      if(event.target.closest('[data-facility-item-add]')){const list=group.querySelector('[data-facility-items]');list.append(rowElement({quantity:1}));recalc();list.lastElementChild.querySelector('[name=item_name]').focus();}
      if(event.target.closest('[data-facility-remove]')){if(group.querySelectorAll('.df-sales-item-row').length&&[...group.querySelectorAll('[name=item_name]')].some(x=>clean(x.value))&&!global.confirm('이 설비와 입력한 항목을 견적서에서 삭제할까요?'))return;group.remove();if(!container.querySelector('[data-quote-facility-group]'))addGroup();recalc();}
    });
    function capture(detail){
      if(state.mode!=='facility')return {mode:'item',version:1,groups:[]};
      sync();const all=sourceRows(),wanted=new Set(detail.map(x=>number(x.sort_order))),groups=[];
      container.querySelectorAll('[data-quote-facility-group]').forEach(group=>{const rows=[...group.querySelectorAll('.df-sales-item-row')].map(row=>({sort_order:all.indexOf(row)+1,cycle:clean(row.querySelector('[name=quote_cycle]').value)})).filter(x=>wanted.has(x.sort_order));if(!rows.length)return;const name=clean(group.querySelector('[name=quote_facility_name]').value);if(!name)throw Error('설비명을 입력해주세요.');groups.push({key:group.dataset.quoteFacilityGroup,name,rows});});
      if(!detail.length)throw Error('설비별 견적에는 항목을 하나 이상 입력해주세요.');return {mode:'facility',version:1,groups};
    }
    state.sync=sync;state.capture=capture;
    state.insert=(row,action)=>{const next=rowElement({quantity:1});row.insertAdjacentElement(action==='before'?'beforebegin':'afterend',next);recalc();return next;};
    state.addToSelected=row=>{const group=row?.closest('[data-quote-facility-group]')||container.querySelector('[data-quote-facility-group]:last-child')||addGroup();const list=group.querySelector('[data-facility-items]'),next=rowElement({quantity:1});list.append(next);recalc();next.querySelector('[name=item_name]').focus();return next;};
    render(state.mode,originalItems,layout);
    return {sync,capture,needsSave:()=>state.managed||state.mode==='facility',saveError:()=>storageError};
  }
  function state(form){return states.get(form);}
  function placeRow(form,row,before){
    const s=state(form);if(s?.mode!=='facility')return false;
    if(before)before.before(row);else{s.container.querySelector('[data-quote-facility-group]:last-child [data-facility-items]').append(row);}s.sync();return true;
  }
  function appendRow(form,selected){const s=state(form);return s?.mode==='facility'?s.addToSelected(selected):null;}
  function insertRow(form,row,action){const s=state(form);return s?.mode==='facility'?s.insert(row,action):null;}
  function printParts(doc,detail){
    const layout=savedLayout(doc,detail);if(layout?.mode!=='facility'||!Array.isArray(layout.groups))return null;
    const byOrder=new Map(detail.map(x=>[number(x.sort_order),x])),seen=new Set(),groups=[];
    for(const group of layout.groups){const rows=[];for(const meta of group.rows||[]){const item=byOrder.get(number(meta.sort_order));if(!item||seen.has(number(meta.sort_order)))return null;seen.add(number(meta.sort_order));rows.push({item,cycle:meta.cycle||''});}if(rows.length)groups.push({...group,rows});}if(seen.size!==detail.length)return null;
    const amount=v=>Math.round(number(v)).toLocaleString('ko-KR');
    let html='';for(const group of groups){const subtotal=group.rows.reduce((sum,x)=>sum+number(x.item.quantity)*number(x.item.unit_price),0);group.rows.forEach(({item,cycle},i)=>{const supply=number(item.quantity)*number(item.unit_price);html+='<tr>'+(i===0?'<td class="facility" rowspan="'+group.rows.length+'">'+escape(group.name)+'<small>소계 '+amount(subtotal)+'원</small></td>':'')+'<td class="item">'+escape(item.item_name)+'</td><td class="cycle">'+escape(cycle||'-')+'</td><td>'+number(item.quantity).toLocaleString('ko-KR')+'</td><td class="money">'+amount(item.unit_price)+'</td><td class="money">'+amount(supply)+'</td><td class="money">'+amount(Math.round(supply*.1))+'</td></tr>';});}
    return {rows:html,cols:'<col style="width:46mm"><col style="width:34mm"><col style="width:25mm"><col style="width:10mm"><col style="width:24mm"><col style="width:28mm"><col style="width:22mm">',head:'<th>설비</th><th>항목</th><th>주기</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th>',css:'.df55-table .facility{text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;vertical-align:middle;line-height:1.5}.df55-table .facility small{display:block;margin-top:3mm;font-size:8pt;color:#506777}.df55-table .cycle{white-space:pre-wrap;overflow-wrap:anywhere}.df55-table tr{break-inside:avoid}'};
  }
  global.DFQuoteFacilities={load,init,mount,state,placeRow,appendRow,insertRow,printParts,splitSpecification,signature,matches,savedLayout};
  if(typeof module!=='undefined'&&module.exports)module.exports=global.DFQuoteFacilities;
})(typeof window!=='undefined'?window:globalThis);
