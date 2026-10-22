/* 반기보고서 업체현황 정보: 식별자 확인 → 변경검토 → 서버 원자반영. */
(function(global){
  'use strict';
  const VERSION='120.37.34.0';
  const FIELD_LABELS={company_name:'보고서 업체명',site_class:'사업장 종',local_authority:'제출 지자체',representative:'대표자',manager:'환경기술인',phone:'연락처',address:'사업장 소재지',operating_hours:'일일 가동시간',facility_class:'시설 종'};
  const COMPANY_FIELDS=['company_name','site_class','local_authority','representative','manager','phone','address'];
  const FACILITY_FIELDS=['operating_hours','facility_class'];
  const state={options:{},companies:[],facilities:[],loaded:false,promise:null,error:'',plans:new Map(),sequence:0};
  let activeEditor=null,editorObserver=null,observedBody=null,editorMountQueued=false;
  const str=v=>String(v??'').trim();
  const clone=v=>JSON.parse(JSON.stringify(v));
  const esc=v=>str(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const present=v=>v!==null&&v!==undefined&&str(v)!=='';
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function database(){return state.options.database||(typeof dfSupabase!=='undefined'?dfSupabase:null);}
  function canUpdate(){const p=typeof dfCloudProfile!=='undefined'?dfCloudProfile:{},legacy=p?.active!==false&&['admin','관리자'].includes(str(p?.role).toLowerCase());return global.DFMenuPermissions?global.DFMenuPermissions.can('company','update',legacy):legacy;}
  function localCompanies(){const src=state.options.companies;return (typeof src==='function'?src():src)||(typeof companyState!=='undefined'?companyState?.db?.Companies:[])||[];}
  function configure(options={}){
    if(options.database&&state.options.database&&options.database!==state.options.database){state.loaded=false;state.companies=[];state.facilities=[];state.plans.clear();}
    state.options={...state.options,...options};return api;
  }
  async function readAll(table,columns){
    const db=database();if(!db)throw Error('온라인 DB에 연결되어 있지 않습니다.');
    const rows=[];
    for(let start=0;;start+=1000){
      const {data,error}=await db.from(table).select(columns).order('id',{ascending:true}).range(start,start+999);
      if(error)throw error;rows.push(...(data||[]));if(!data||data.length<1000)break;
    }
    return rows;
  }
  async function load(force=false){
    if(state.promise){
      if(!force)return state.promise;
      // 일반 업체수정 직후의 새로고침은 수정 이전에 시작한 조회결과로 대체하지 않습니다.
      try{await state.promise;}catch(error){}
      return load(true);
    }
    if(state.loaded&&!force){hydrate();return snapshot();}
    state.promise=(async()=>{
      try{
        const result=await Promise.all([
          readAll('companies','id,legacy_id,name,grade,halfyear_profile'),
          readAll('facilities','id,legacy_id,company_id,name,halfyear_profile')
        ]);
        state.companies=result[0];state.facilities=result[1];state.loaded=true;state.error='';hydrate();return snapshot();
      }catch(error){state.loaded=false;state.error=String(error.message||error);throw Error('반기보고서 업체정보를 불러오지 못했습니다. 37번 SQL 적용 및 권한을 확인해 주세요. '+state.error);}
      finally{state.promise=null;}
    })();return state.promise;
  }
  function snapshot(){return clone({companies:state.companies,facilities:state.facilities});}
  function exactCompany(id,onlineId){
    const key=str(id),oid=str(onlineId);
    const found=state.companies.filter(c=>(!key||str(c.id)===key||str(c.legacy_id)===key)&&(!oid||str(c.id)===oid));
    return (key||oid)&&found.length===1?found[0]:null;
  }
  function exactFacility(company,id,onlineId){
    if(!company)return null;const key=str(id),oid=str(onlineId);
    const found=state.facilities.filter(f=>str(f.company_id)===str(company.id)&&(!key||str(f.id)===key||str(f.legacy_id)===key)&&(!oid||str(f.id)===oid));
    return (key||oid)&&found.length===1?found[0]:null;
  }
  function get(companyId,facilityId){
    const company=exactCompany(companyId);if(!company)return {};
    if(facilityId!==undefined&&facilityId!==null&&str(facilityId)!=='')return clone(exactFacility(company,facilityId)?.halfyear_profile||{});
    const profile=clone(company.halfyear_profile||{}),grade=str(company.grade).replace(/\s*종$/,'');
    // 기존 업체정보 화면에서 나중에 수정한 사업장 종이 과거 엑셀 출처값보다 우선합니다.
    profile.site_class=/^[1-5]$/.test(grade)?grade:'';
    return profile;
  }
  function hydrate(){
    for(const company of localCompanies()){
      const online=exactCompany(company.Id||company.id,company.OnlineId||company.online_id);if(!online)continue;
      company.HalfyearProfile=get(online.id);
      for(const facility of company.Facilities||company.facilities||[]){
        const row=exactFacility(online,facility.Id||facility.id,facility.OnlineId||facility.online_id);if(!row)continue;
        facility.HalfyearProfile=clone(row.halfyear_profile||{});
        // 새 필드만 캐시에 추가하며 측정주기·측정값 등 기존 시설필드는 수정하지 않습니다.
        if(present(row.halfyear_profile?.operating_hours))facility.OperatingHoursPerDay=row.halfyear_profile.operating_hours;
        if(present(row.halfyear_profile?.facility_class))facility.FacilityClass=row.halfyear_profile.facility_class;
      }
    }
    refreshVisibleCards();
  }
  function normalized(field,value){
    if(!present(value))return undefined;
    if(field==='operating_hours'){
      const raw=str(value);if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error('일일 가동시간은 0~24 사이의 숫자로 입력해 주세요.');
      const number=Number(raw);if(!Number.isFinite(number)||number<0||number>24)throw Error('일일 가동시간은 0~24시간입니다.');return number;
    }
    if(field==='facility_class'||field==='site_class'){
      if(field==='facility_class'&&['설치면제','면제'].includes(str(value)))return str(value);
      const valueString=str(value).replace(/\s*종$/,'');if(!/^[1-5]$/.test(valueString))throw Error('종별은 1~5종으로 입력해 주세요.');return valueString;
    }
    const valueString=str(value);if(valueString.length>1000)throw Error(FIELD_LABELS[field]+' 값이 너무 깁니다.');return valueString;
  }
  function provenance(row,scope,field){
    const source=scope==='company'?row.source_company:row.source_facility;
    const cellFields={company_name:'name',site_class:'company_class',local_authority:'authority',operating_hours:'hours_per_day'};
    const sourceField=cellFields[field]||field;
    const origin=row.source||{};
    return {kind:'workbook',file:str(origin.filename||row.source_file||source?.filename),sha256:str(origin.sha256),
      sheet:str(origin.sheet||row.source_company?.sheet||'거래처DB'),row:row.source_company?.row??origin.row??null,
      cell:str(source?.source_cells?.[sourceField]),source_key:str(source?.source_key||row.key)};
  }
  function preview(mappedRows){
    if(!state.loaded)throw Error('먼저 온라인 업체정보를 불러와 주세요.');
    const edits=[],issues=[],skipped=[];
    for(const row of mappedRows||[]){
      if(row.status==='skipped'){skipped.push(row.key);continue;}
      if(row.status!=='matched'){issues.push({key:row.key,message:'업체와 시설 연결을 먼저 확인해 주세요.'});continue;}
      const sc=row.source_company||{},sf=row.source_facility||{};
      const companyValues={company_name:sc.name,site_class:sc.company_class,local_authority:sc.authority,representative:sc.representative,manager:sc.manager,phone:sc.phone,address:sc.address};
      const facilityValues={operating_hours:sf.hours_per_day,facility_class:sf.facility_class};
      edits.push({company_id:row.company_id,company_online_id:row.company_online_id,scope:'company',changes:companyValues,
        sources:Object.fromEntries(COMPANY_FIELDS.map(field=>[field,provenance(row,'company',field)])),key:row.key});
      if(row.facility_id||row.facility_online_id)edits.push({company_id:row.company_id,company_online_id:row.company_online_id,
        facility_id:row.facility_id,facility_online_id:row.facility_online_id,scope:'facility',changes:facilityValues,
        sources:Object.fromEntries(FACILITY_FIELDS.map(field=>[field,provenance(row,'facility',field)])),key:row.key});
      else if(Object.values(facilityValues).some(present))issues.push({key:row.key,message:'시설별 값을 저장할 시설 연결이 없습니다.'});
    }
    return makePlan(edits,issues,skipped);
  }
  function previewEdits(edits){
    if(!state.loaded)throw Error('먼저 온라인 업체정보를 불러와 주세요.');
    return makePlan((edits||[]).map(e=>({...e,scope:e.scope||(e.facility_id||e.facility_online_id?'facility':'company'),
      sources:e.sources||Object.fromEntries(Object.keys(e.changes||{}).map(field=>[field,{kind:'manual',screen:'업체현황'}]))})),[],[]);
  }
  function makePlan(edits,issues=[],skipped=[]){
    const tasks=new Map(),changes=[];
    for(const edit of edits){
      const company=exactCompany(edit.company_id,edit.company_online_id);
      if(!company){issues.push({key:edit.key,message:'현재 온라인 업체 식별자가 일치하지 않습니다.'});continue;}
      const row=edit.scope==='facility'?exactFacility(company,edit.facility_id,edit.facility_online_id):company;
      if(!row){issues.push({key:edit.key,message:'시설 식별자 또는 소속업체가 일치하지 않습니다.'});continue;}
      const allowed=edit.scope==='facility'?FACILITY_FIELDS:COMPANY_FIELDS,taskKey=edit.scope+':'+row.id;
      if(!tasks.has(taskKey))tasks.set(taskKey,{scope:edit.scope,id:row.id,company_id:company.id,expected_name:row.name,
        expected_grade:edit.scope==='company'?str(company.grade):undefined,expected_profile:clone(row.halfyear_profile||{}),changes:{},sources:{},
        companyName:company.name,facilityName:edit.scope==='facility'?row.name:'',companyId:company.legacy_id||company.id,facilityId:edit.scope==='facility'?row.legacy_id||row.id:null});
      const task=tasks.get(taskKey);
      for(const [field,raw] of Object.entries(edit.changes||{})){
        if(!allowed.includes(field)){issues.push({key:edit.key,message:'지원하지 않는 업체정보 필드: '+field});continue;}
        let value;try{value=normalized(field,raw);}catch(error){issues.push({key:edit.key,message:error.message});continue;}
        if(value===undefined)continue; // 누락값은 0으로 만들거나 기존값을 삭제하지 않습니다.
        if(Object.hasOwn(task.changes,field)&&!same(task.changes[field],value)){
          issues.push({key:edit.key,message:task.companyName+' '+task.facilityName+'의 '+FIELD_LABELS[field]+' 값이 원본 여러 행에서 다릅니다. 한 행을 선택해 주세요.'});continue;
        }
        task.changes[field]=value;task.sources[field]=clone(edit.sources?.[field]||{kind:'manual'});
      }
    }
    const payload=[];
    for(const task of tasks.values()){
      for(const field of Object.keys(task.changes)){
        let before=task.expected_profile[field];if(field==='site_class')before=task.expected_grade;
        const after=task.changes[field];
        const gradeDiff=field==='site_class'&&str(task.expected_grade)!==str(after);
        if(same(before,after)&&!gradeDiff){delete task.changes[field];delete task.sources[field];continue;}
        changes.push({scope:task.scope,companyId:task.companyId,facilityId:task.facilityId,companyName:task.companyName,facilityName:task.facilityName,
          field,label:FIELD_LABELS[field],before:before??'',after,conflict:present(before)&&!same(before,after),source:clone(task.sources[field])});
      }
      if(Object.keys(task.changes).length){const {companyName,facilityName,companyId,facilityId,...data}=task;payload.push(data);}
    }
    const id='halfyear-plan-'+(++state.sequence),plan={id,changes,issues,skipped,ready:!issues.length&&payload.length>0,count:changes.length,targets:payload.length};
    state.plans.set(id,{payload:clone(payload),plan:clone(plan)});
    // 열린 검토의 원본만 보관합니다. 화면에서 수정한 plan 객체를 SQL 입력으로 신뢰하지 않습니다.
    if(state.plans.size>12)state.plans.delete(state.plans.keys().next().value);
    return plan;
  }
  async function apply(plan){
    if(!canUpdate())throw Error("업체현황 수정 권한이 없습니다.");
    if(plan?.confirmed!==true)throw Error('변경 내용을 확인한 뒤 업체현황 반영을 눌러 주세요.');
    const stored=state.plans.get(plan.id);if(!stored)throw Error('검토정보가 만료되었습니다. 다시 검토해 주세요.');
    if(!stored.plan.ready)throw Error(stored.plan.issues.length?'연결 또는 입력 오류를 먼저 해결해 주세요.':'반영할 변경사항이 없습니다.');
    const db=database();if(!db)throw Error('온라인 DB에 연결되어 있지 않습니다.');
    const {data,error}=await db.rpc('apply_halfyear_company_profiles',{p_changes:stored.payload});
    if(error)throw Error('업체현황 반영 실패: '+(error.message||error));
    if(!data||!Array.isArray(data.companies)||!Array.isArray(data.facilities))throw Error('서버 저장 응답을 확인하지 못했습니다. 새로 불러와 확인해 주세요.');
    for(const row of data.companies){const index=state.companies.findIndex(c=>c.id===row.id);if(index>=0)state.companies[index]={...state.companies[index],...row};}
    for(const row of data.facilities){const index=state.facilities.findIndex(f=>f.id===row.id);if(index>=0)state.facilities[index]={...state.facilities[index],...row};}
    // 온라인 성공이 확인된 뒤에만 기존 캐시의 사업장 종과 새 시설정보를 변경합니다.
    for(const row of data.companies){const local=localCompanies().filter(c=>(str(c.Id||c.id)===str(row.legacy_id)||str(c.Id||c.id)===str(row.id))&&(!c.OnlineId||str(c.OnlineId)===str(row.id)));if(local.length===1)local[0].Grade=row.grade;}
    hydrate();state.plans.delete(plan.id);
    try{await state.options.onChanged?.(clone(data));}catch(error){console.warn('반기보고서 정보는 저장되었으나 화면 갱신에 실패했습니다.',error);}
    return clone(data);
  }
  function displayProfile(company){
    const cp=profileDefaults(company);return `<section class="df-halfyear-profile-panel" style="margin:18px 0;padding:18px;border:1px solid #dce4df;border-radius:12px;background:#fff"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h4 style="margin:0">반기보고서 업체·시설정보</h4><button type="button" class="company-btn secondary" data-hyp-edit>업체·가동시간·종별 수정</button></div><dl style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:16px 0">${COMPANY_FIELDS.map(field=>`<div><dt style="font-size:12px;color:#607067">${FIELD_LABELS[field]}</dt><dd style="margin:4px 0;font-size:14px;white-space:pre-wrap">${esc(field==='site_class'?classLabel(cp[field]):cp[field]||'미등록')}</dd></div>`).join('')}</dl><p style="font-size:12px;color:#607067">위 시설 카드에서도 종수·가동시간을 확인할 수 있습니다. 새로 추가한 시설은 업체정보를 먼저 저장한 뒤 다시 열어 등록해주세요.</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th>시설명</th><th>일일 가동시간</th><th>시설 종</th></tr></thead><tbody>${(company.Facilities||[]).map(f=>{const p=get(company.Id,f.Id);return `<tr><td style="padding:10px 8px">${esc(f.FacilityName||f.PreventionFacility)}</td><td>${present(p.operating_hours)?esc(p.operating_hours)+' 시간/일':'미등록'}</td><td>${esc(classLabel(p.facility_class))}</td></tr>`;}).join('')||'<tr><td colspan="3">등록된 시설이 없습니다.</td></tr>'}</tbody></table></div></section>`;
  }
  function cardLabels(companyId,facilityId){
    if(!state.loaded)return {kind:state.error?'조회 실패':'확인 중',hours:state.error?'조회 실패':'확인 중'};
    const p=get(companyId,facilityId);
    return {kind:classLabel(p.facility_class),hours:present(p.operating_hours)?str(p.operating_hours)+' 시간/일':'미등록'};
  }
  function refreshVisibleCards(){
    if(!global.document)return;
    document.querySelectorAll('[data-hyp-company-id][data-hyp-facility-id]').forEach(card=>{
      const labels=cardLabels(card.dataset.hypCompanyId,card.dataset.hypFacilityId);
      for(const [selector,value] of [['[data-hyp-card-class]',labels.kind],['[data-hyp-card-hours]',labels.hours]]){
        const el=card.querySelector(selector);if(el&&el.textContent!==value)el.textContent=value;
      }
    });
  }
  function decorateFacilityCard(html,facility,company){
    if(typeof html!=='string'||!company||!facility)return html;
    const cid=str(company.Id||company.id),fid=str(facility.Id||facility.id),labels=cardLabels(cid,fid);
    const outputStyle='display:flex;align-items:center;min-height:36px;padding:6px 10px;border:1px solid #d7e2dc;border-radius:6px;background:#f4f8f5;color:#203c30;box-sizing:border-box';
    html=html.replace('class="v75-facility-card"','class="v75-facility-card" data-hyp-company-id="'+esc(cid)+'" data-hyp-facility-id="'+esc(fid)+'"');
    return html.replace('<div class="v75-facility-grid">','<div class="v75-facility-grid"><label>시설 종수</label><output data-hyp-card-class aria-label="시설 종수" style="'+outputStyle+'">'+esc(labels.kind)+'</output><label>일일 가동시간</label><output data-hyp-card-hours aria-label="일일 가동시간" style="'+outputStyle+'">'+esc(labels.hours)+'</output>');
  }
  function profileSignature(company){return JSON.stringify([profileDefaults(company),(company.Facilities||[]).map(f=>[str(f.Id||f.id),str(f.FacilityName||f.PreventionFacility),get(company.Id||company.id,f.Id||f.id)])]);}
  function profileAnchor(container){return container.querySelector('.company-facilities')||container.querySelector('.v75-facilities')?.closest('.v75-editor-section');}
  async function mountPanel(container,company,force=false,editorToken=null){
    if(!container||!company)return;
    if(editorToken&&activeEditor!==editorToken)return;
    const id=str(company.Id||company.id);container.dataset.hypCompany=id;
    let error=null;try{await load();}catch(e){error=e;}
    if(!container.isConnected||container.dataset.hypCompany!==id||(editorToken&&activeEditor!==editorToken))return;
    const anchor=profileAnchor(container);if(!anchor)return;
    refreshVisibleCards();
    const existing=container.querySelector('.df-halfyear-profile-panel');
    const editingPanel=editorToken&&editorToken.profilePanel;
    if(!force&&editingPanel&&!editingPanel.isConnected&&editingPanel.querySelector('[data-hyp-company]')){
      if(existing)existing.remove();anchor.after(editingPanel);return;
    }
    // Background reads and ordinary facility redraws must not replace an active editor.
    if(existing&&!force&&existing.querySelector('[data-hyp-company]'))return;
    const signature=error?'error:'+error.message:profileSignature(company);
    if(existing&&!force&&existing.dataset.hypSignature===signature)return;
    if(error){
      const panel=document.createElement('section');panel.className='df-halfyear-profile-panel';panel.dataset.hypSignature=signature;
      panel.style.cssText='margin:14px 0;padding:14px;border:1px solid #dfcda3;border-radius:10px;background:#fff9ed';
      const message=document.createElement('p');message.textContent='시설 종수·가동시간을 불러오지 못했습니다. '+error.message;panel.appendChild(message);
      const retry=document.createElement('button');retry.type='button';retry.className='company-btn secondary';retry.textContent='다시 불러오기';retry.onclick=()=>{retry.disabled=true;void mountPanel(container,company,true,editorToken);};panel.appendChild(retry);
      if(existing)existing.replaceWith(panel);else anchor.after(panel);return;
    }
    if(existing)existing.remove();anchor.insertAdjacentHTML('afterend',displayProfile(company));
    const panel=container.querySelector('.df-halfyear-profile-panel');panel.dataset.hypSignature=signature;
    const button=panel.querySelector('[data-hyp-edit]');if(button){button.disabled=!canUpdate();button.onclick=()=>editProfile(company,container,editorToken);}
  }
  function scheduleEditorPanel(){
    if(editorMountQueued)return;editorMountQueued=true;
    Promise.resolve().then(()=>{
      editorMountQueued=false;const editor=activeEditor,container=editor&&editor.container;
      if(!container||!container.isConnected||!container.querySelector('#v75CompanySave'))return;
      refreshVisibleCards();if(editor.company&&!editor.isNew)void mountPanel(container,editor.company,false,editor);
    });
  }
  function watchEditor(company,isNew){
    const container=document.getElementById('companyModalBody');if(!container||!container.querySelector('#v75CompanySave'))return;
    activeEditor={company,isNew,container};container.dataset.hypCompany=str(company?.Id||company?.id);
    if(observedBody!==container){
      editorObserver?.disconnect();observedBody=container;
      if(global.MutationObserver){editorObserver=new MutationObserver(scheduleEditorPanel);editorObserver.observe(container,{childList:true});}
    }
    scheduleEditorPanel();
  }
  function editProfile(company,container,editorToken=null){
    if(!canUpdate()){global.alert?.("업체현황 수정 권한이 없습니다.");return;}
    const panel=container.querySelector('.df-halfyear-profile-panel');if(!panel)return;
    if(editorToken){if(activeEditor!==editorToken)return;editorToken.profilePanel=panel;}
    const ownsPanel=()=>container.dataset.hypCompany===str(company.Id||company.id)&&(editorToken?activeEditor===editorToken:panel.isConnected&&container.contains(panel));
    const cp=profileDefaults(company),facilities=company.Facilities||[];
    panel.innerHTML=`<h4>반기보고서 업체·시설정보 수정</h4><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-bottom:14px">${COMPANY_FIELDS.map(field=>`<label style="display:flex;flex-direction:column;gap:6px">${FIELD_LABELS[field]} ${field==='site_class'?`<select data-hyp-company="site_class">${classOptions(cp.site_class)}</select>`:`<input data-hyp-company="${field}" value="${esc(cp[field])}" maxlength="1000">`}</label>`).join('')}</div><p style="font-size:13px;color:#607067">보고서 업체명과 연락정보는 반기보고서 기본값으로 저장됩니다. 연결된 업체·시설은 그대로 유지됩니다.</p><div style="overflow:auto"><table style="width:100%"><thead><tr><th>시설명</th><th>일일 가동시간</th><th>시설 종</th></tr></thead><tbody>${facilities.map(f=>{const p=get(company.Id,f.Id);return `<tr data-hyp-facility="${esc(f.Id)}"><td>${esc(f.FacilityName||f.PreventionFacility)}</td><td><input aria-label="일일 가동시간" type="number" min="0" max="24" step="any" data-hyp-field="operating_hours" value="${esc(p.operating_hours)}" style="width:100px"> 시간/일</td><td><select data-hyp-field="facility_class">${classOptions(p.facility_class,true)}</select></td></tr>`;}).join('')}</tbody></table></div><p data-hyp-message style="white-space:pre-line;color:#53655d">빈칸은 기존 값을 유지합니다. 변경검토 후 반영해 주세요.</p><div data-hyp-review></div><div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="company-btn primary" data-hyp-check>변경내용 확인</button><button type="button" class="company-btn secondary" data-hyp-cancel>닫기</button></div>`;
    panel.querySelector('[data-hyp-cancel]').onclick=()=>{if(!ownsPanel())return;if(editorToken)editorToken.profilePanel=null;void mountPanel(container,company,true,editorToken);};
    panel.querySelector('[data-hyp-check]').onclick=()=>{
      const message=panel.querySelector('[data-hyp-message]');
      try{
        const edits=[{company_id:company.Id,scope:'company',changes:Object.fromEntries([...panel.querySelectorAll('[data-hyp-company]')].map(e=>[e.dataset.hypCompany,e.value]))}];
        panel.querySelectorAll('[data-hyp-facility]').forEach(row=>edits.push({company_id:company.Id,facility_id:row.dataset.hypFacility,changes:Object.fromEntries([...row.querySelectorAll('[data-hyp-field]')].map(e=>[e.dataset.hypField,e.value]))}));
        const plan=previewEdits(edits);message.textContent=plan.issues.length?plan.issues.map(x=>x.message).join('\n'):plan.count?`${plan.count}개 변경사항을 확인해 주세요.`:'변경사항이 없습니다.';
        panel.querySelector('[data-hyp-review]').innerHTML=plan.ready?`<ul>${plan.changes.map(c=>`<li>${esc(c.facilityName||c.companyName)} · ${esc(c.label)}: ${esc(c.before)||'미등록'} → <strong>${esc(c.after)}</strong></li>`).join('')}</ul><button type="button" class="company-btn primary" data-hyp-apply>확인한 내용으로 저장</button>`:'';
        const button=panel.querySelector('[data-hyp-apply]');if(button)button.onclick=async()=>{
          if(!ownsPanel())return;
          const controls=[...panel.querySelectorAll('input,select,button')];controls.forEach(el=>el.disabled=true);
          try{await apply({...plan,confirmed:true});if(ownsPanel()){if(editorToken)editorToken.profilePanel=null;await mountPanel(container,company,true,editorToken);}}
          catch(error){if(ownsPanel()){message.textContent=error.message;controls.forEach(el=>el.disabled=false);}else global.alert?.((company.Name||'업체')+'의 반기 기본값을 저장하지 못했습니다. '+error.message);}
        };
      }catch(error){message.textContent=error.message;}
    };
    panel.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{panel.querySelector('[data-hyp-review]').innerHTML='';}));
  }
  function profileDefaults(company){const profile=get(company.Id||company.id);return {company_name:company.Name||'',representative:company.Representative||'',manager:company.EnvironmentManager||'',address:company.Address||'',phone:company.Phone||'',site_class:company.Grade||'',...profile};}
  function classLabel(value){return present(value)?/^[1-5]$/.test(str(value))?str(value)+'종':str(value):'미등록';}
  function classOptions(value,facility=false){return '<option value="">미등록</option>'+[1,2,3,4,5,...(facility?['설치면제','면제']:[])].map(n=>`<option value="${n}" ${str(value)===String(n)?'selected':''}>${classLabel(n)}</option>`).join('');}
  function installCompanyHooks(){
    const card=global.dfV75FacilityCard;
    if(typeof card==='function'&&!card.__halfyearProfileHook){
      const wrapped=function(f,i,c){return decorateFacilityCard(card.apply(this,arguments),f,c);};wrapped.__halfyearProfileHook=true;global.dfV75FacilityCard=wrapped;
    }
    const editor=global.dfV75OpenCompanyEditor;
    if(typeof editor==='function'&&!editor.__halfyearProfileHook){
      const wrapped=function(c,isNew){activeEditor=null;const result=editor.apply(this,arguments);watchEditor(c,!!isNew);return result;};wrapped.__halfyearProfileHook=true;global.dfV75OpenCompanyEditor=wrapped;
    }

    for(const name of ['companyRenderDetail','companyOpenDetailPopup','dfV68PullCompanies','dfV68SyncCompany']){
      const original=global[name];if(typeof original!=='function'||original.__halfyearProfileHook)continue;
      const wrapped=function(...args){
        const result=original.apply(this,args);
        const after=()=>{
          hydrate();
          const company=name==='companyOpenDetailPopup'?args[0]:(typeof companySelected==='function'?companySelected():null);
          const container=global.document?.getElementById(name==='companyOpenDetailPopup'?'companyModalBody':'companyDetail');
          if(name==='dfV68PullCompanies'||name==='dfV68SyncCompany'){void load(true).then(()=>{if(company&&container)return mountPanel(container,company);}).catch(()=>{});return;}
          if(company&&container)void mountPanel(container,company);
        };
        if(result&&typeof result.then==='function')return result.then(value=>{after();return value;});
        after();return result;
      };
      wrapped.__halfyearProfileHook=true;global[name]=wrapped;
    }
  }
  const api={version:VERSION,configure,load,get,preview,previewEdits,apply,hydrate,installCompanyHooks};
  global.DF_HALFYEAR_COMPANY=api;
  if(global.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCompanyHooks,{once:true});else installCompanyHooks();}
})(typeof window!=='undefined'?window:globalThis);
