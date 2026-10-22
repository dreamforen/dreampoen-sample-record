/* 시료채취·분석방법 공통 설정. 방법 명칭은 현재 앱에 이미 등록된 값만 기본 제공한다. */
(function(global){
  'use strict';
  const VERSION='120.37.30.0',TABLE='measurement_method_settings';
  const FIELDS=['sampling_method','analysis_method','report_method'];
  const GAS=['총탄화수소','질소산화물','황산화물','일산화탄소','염화수소','플루오린화합물','암모니아','사이안화수소','페놀화합물','이황화탄소','폼알데하이드','황화수소','브로민화합물','벤젠','염화비닐','디클로로메탄','클로로포름','1,2-디클로로에탄','사염화탄소','트리클로로에틸렌','테트라클로로에틸렌','에틸벤젠','스타이렌','1,3-부타디엔','아크릴로니트릴','아닐린','비소화합물'];
  const METALS=['구리화합물','크로뮴화합물','니켈화합물','아연화합물','납화합물','베릴륨','카드뮴화합물'];
  const VOC=['벤젠','염화비닐','디클로로메탄','클로로포름','1,2-디클로로에탄','사염화탄소','트리클로로에틸렌','테트라클로로에틸렌','에틸벤젠','스타이렌','1,3-부타디엔','아크릴로니트릴','아닐린'];
  const VARIANTS={'염화수소:ic':'염화수소 · IC','염화수소:uv':'염화수소 · 흡광광도법','플루오린화합물:ic':'플루오린화합물 · IC','플루오린화합물:lanthanum':'플루오린화합물 · 란타넘법'};
  // app.js dfV100*Card / 기존 LAB 방법 제목. 시험법 적합성이나 계산식을 새로 판단하지 않는다.
  const ANALYSIS={
    '총탄화수소':'불꽃이온화검출기법','질소산화물':'자동측정기기법','황산화물':'자동측정기기법','일산화탄소':'자동측정기기법',
    '암모니아':'인도페놀법','황화수소':'메틸렌블루법','사이안화수소':'4-피리딘카복실산-피라졸론법','브로민화합물':'이온크로마토그래피법',
    '폼알데하이드':'고성능 액체크로마토그래피법','염화수소:ic':'이온크로마토그래피법','염화수소:uv':'싸이오사이안산제이수은법',
    '플루오린화합물:ic':'이온크로마토그래피법','플루오린화합물:lanthanum':'란타넘-알리자린콤플렉손법'
  };
  METALS.concat('비소화합물').forEach(key=>ANALYSIS[key]='유도결합플라스마원자발광분광법');
  VOC.forEach(key=>ANALYSIS[key]='기체크로마토그래피 · 고체흡착 열탈착법');
  const ALIASES={thc:'총탄화수소',hcho:'폼알데하이드','포름알데하이드':'폼알데하이드','페놀':'페놀화합물','불소':'플루오린화합물','불소화합물':'플루오린화합물','플루오르화합물':'플루오린화합물',nox:'질소산화물',sox:'황산화물',co:'일산화탄소','크롬':'크로뮴화합물','크롬화합물':'크로뮴화합물','크로뮴':'크로뮴화합물','구리':'구리화합물','납':'납화합물','니켈':'니켈화합물','아연':'아연화합물','비소':'비소화합물','카드뮴':'카드뮴화합물','링겔만':'매연'};
  const state={options:{},rows:new Map(),legacy:new Map(),catalog:new Set(),loaded:false,pending:null,error:'',root:null,drafts:new Map(),query:'',filter:'all'};
  const clean=v=>String(v??'').trim(),copy=v=>JSON.parse(JSON.stringify(v)),has=v=>clean(v)!=='';
  const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function canonical(value,options={}){
    let raw=clean(value).replace(/^(중금속|VOC)\s*[:：]\s*/i,'').replace(/\((?:ppm|ppb|mg\/(?:S?m[3³]|S㎥)|㎎\/S?㎥|mg\/Sm³)\)\s*$/i,'').trim();
    let variant=clean(options.variant).toLowerCase();
    const tail=raw.match(/:(ic|uv|lanthanum)$/i);if(tail){variant=variant||tail[1].toLowerCase();raw=raw.slice(0,-tail[0].length);}
    // 일반 성적서 항목의 (IC) 표기는 동일 항목명으로 취급. 분석 카드의 방법구분은 variant 인자로 명시한다.
    raw=raw.replace(/\s*\((?:IC|UV)\)\s*$/i,'').trim();
    const compact=raw.replace(/\s+/g,'').toLowerCase();
    const name=ALIASES[compact]||GAS.concat(METALS,['먼지','매연','아세트알데하이드']).find(x=>x.replace(/\s+/g,'').toLowerCase()===compact)||raw;
    return variant?name+':'+variant:name;
  }
  function db(){return state.options.database||(typeof dfSupabase!=='undefined'?dfSupabase:null);}
  function profile(){const p=state.options.profile;return (typeof p==='function'?p():p)||(typeof dfCloudProfile!=='undefined'?dfCloudProfile:null)||{};}
  function user(){const u=state.options.currentUser;return (typeof u==='function'?u():u)||(typeof dfCloudUser!=='undefined'?dfCloudUser:null);}
  function legacyCanEdit(){const configured=state.options.canEdit;if(configured!==undefined)return typeof configured==='function'?!!configured():!!configured;const p=profile();return p.active!==false&&['admin','관리자'].includes(clean(p.role).toLowerCase());}
  function canAction(action){return global.DFMenuPermissions?global.DFMenuPermissions.can('measurement-methods',action,legacyCanEdit):legacyCanEdit();}
  function canEdit(){return canAction('create')||canAction('update');}
  function configure(options={}){
    if(options.database&&state.options.database&&options.database!==state.options.database){state.loaded=false;state.rows.clear();state.legacy.clear();state.drafts.clear();}
    state.options={...state.options,...options};refreshCatalog();return api;
  }
  function registerCatalog(values){
    for(const value of values||[]){const raw=typeof value==='string'?value:value?.analyte_key||value?.item_key||value?.item||value?.name||value?.Item;const key=canonical(raw);if(key&&key!=='*'&&key.length<=100)state.catalog.add(key);}
    return api;
  }
  function refreshCatalog(){
    registerCatalog(['먼지',...GAS,...METALS,'아세트알데하이드','매연',...Object.keys(VARIANTS)]);
    const configured=state.options.catalog;registerCatalog(typeof configured==='function'?configured():configured||[]);
    try{if(typeof GAS_ITEMS!=='undefined')registerCatalog(GAS_ITEMS);if(typeof V60_ANALYSIS_EXTRA_ITEMS!=='undefined')registerCatalog(V60_ANALYSIS_EXTRA_ITEMS);}catch(error){}
    if(global.document)registerCatalog([...document.querySelectorAll('#gasItemSelect option, [name="metalParticleItem"]')].map(el=>el.value));
    registerCatalog([...state.rows.keys(),...state.legacy.keys()]);
  }
  async function readAll(table){
    const database=db();if(!database)throw Error('온라인 DB에 로그인해 주세요.');const out=[];
    for(let start=0;;start+=1000){const {data,error}=await database.from(table).select('*').order(table===TABLE?'analyte_key':'sort_order',{ascending:true}).range(start,start+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break;}
    return out;
  }
  async function load(force=false){
    if(state.pending){if(!force)return state.pending;try{await state.pending;}catch(error){}return load(true);}
    if(state.loaded&&!force){refreshCatalog();return list();}
    state.pending=(async()=>{
      try{
        const [settings,legacy]=await Promise.all([readAll(TABLE),readAll('measurement_report_methods').catch(()=>[])]);
        state.rows=new Map(settings.map(row=>[canonical(row.analyte_key),copy(row)]));state.legacy=new Map();
        for(const row of legacy){if(row.active===false||clean(row.item_key)==='*')continue;const key=canonical(row.item_key),text=clean(row.display_text||[row.method_name,row.instrument_name&&'('+row.instrument_name+')'].filter(Boolean).join(' '));if(!key||!text)continue;if(!state.legacy.has(key))state.legacy.set(key,new Set());state.legacy.get(key).add(text);}
        state.loaded=true;state.error='';refreshCatalog();return list();
      }catch(error){state.error='공통 방법 설정을 불러오지 못했습니다. 38_measurement_methods.sql 적용 및 읽기 권한을 확인해 주세요. '+clean(error.message||error);state.loaded=false;throw Error(state.error);}
      finally{state.pending=null;}
    })();return state.pending;
  }
  function fallback(key){
    const legacy=state.legacy.get(key),ambiguous=!!legacy&&legacy.size>1;
    return {analyte_key:key,sampling_method:key==='먼지'?'반자동식측정법(입자상 굴뚝시료채취장치)':'',analysis_method:ANALYSIS[key]||'',
      report_method:ambiguous?'':legacy?.size===1?[...legacy][0]:key==='먼지'?'반자동식측정법(입자상 굴뚝시료채취장치)':'',revision:null,
      source:legacy?.size?'existing-report':state.catalog.has(key)?'builtin':'unregistered',ambiguous};
  }
  function complete(row){
    const out=copy(row);FIELDS.forEach(field=>out[field]=clean(out[field]));
    const combined=[...new Set([out.sampling_method,out.analysis_method].filter(Boolean))].join(' / ');
    out.effective_report_method=out.ambiguous?'':out.report_method||combined;out.display_text=out.effective_report_method;
    out.title=VARIANTS[out.analyte_key]||out.analyte_key;out.variant=out.analyte_key.match(/:(ic|uv|lanthanum)$/)?.[1]||'';return out;
  }
  function get(analyte,options={}){
    const key=canonical(analyte,options),row=state.rows.get(key);return complete(row?{...row,source:'shared',ambiguous:false}:fallback(key));
  }
  function list(){refreshCatalog();return [...state.catalog].map(key=>get(key)).sort((a,b)=>a.analyte_key==='먼지'?-1:b.analyte_key==='먼지'?1:a.analyte_key.localeCompare(b.analyte_key,'ko'));}
  function defaultsFor(items){registerCatalog(items);return (items||[]).map(item=>get(item));}
  function normalizeChange(value){
    const key=canonical(value.analyte_key);if(!key||key==='*'||key.length>100)throw Error('측정항목은 1~100자로 입력해 주세요.');
    const out={analyte_key:key,expected_revision:value.expected_revision??null};
    if(out.expected_revision!==null&&(!Number.isInteger(out.expected_revision)||out.expected_revision<1))throw Error('설정 버전이 올바르지 않습니다. 새로 불러와 주세요.');
    for(const field of FIELDS){out[field]=clean(value[field]);if(out[field].length>1000)throw Error('방법 설명은 각 1,000자까지 입력할 수 있습니다.');}
    return out;
  }
  async function save(changes){
    if(!canEdit())throw Error('공통 방법 설정의 작성 또는 수정 권한이 없습니다.');if(!db()||!user())throw Error('온라인 DB에 로그인해 주세요.');
    const normalized=(changes||[]).map(normalizeChange),keys=normalized.map(row=>row.analyte_key);
    for(const row of normalized)if(!canAction(row.expected_revision===null?'create':'update'))throw Error('공통 방법 설정의 '+(row.expected_revision===null?'작성':'수정')+' 권한이 없습니다.');
    if(!normalized.length)throw Error('변경한 방법이 없습니다.');if(normalized.length>500||new Set(keys).size!==keys.length)throw Error('측정항목이 중복되었거나 한 번에 저장할 수 있는 수를 넘었습니다.');
    const {data,error}=await db().rpc('save_measurement_method_settings',{p_changes:normalized});
    if(error)throw Error('방법 설정 저장 실패: '+clean(error.message||error));
    if(!Array.isArray(data)||data.length!==normalized.length)throw Error('서버 저장 결과를 확인하지 못했습니다. 새로 불러와 확인해 주세요.');
    // 성공한 응답을 확인한 뒤에만 캐시 갱신. 실패한 편집 내용은 화면에 남겨 둔다.
    for(const row of data){const key=canonical(row.analyte_key);state.rows.set(key,copy(row));state.catalog.add(key);state.drafts.delete(key);}
    state.loaded=true;const detail={changedKeys:keys,rows:data.map(row=>get(row.analyte_key))};
    if(global.document&&typeof global.CustomEvent==='function')document.dispatchEvent(new CustomEvent('df-measurement-methods-changed',{detail:copy(detail)}));
    try{await state.options.onChanged?.(copy(detail));}catch(error){console.warn('공통 방법은 저장되었으나 연결 화면 갱신에 실패했습니다.',error);}
    return data.map(row=>get(row.analyte_key));
  }
  function fillMissing(results,options={}){
    const rows=copy(results||[]);if(options.completed||options.preserveSnapshot)return rows;
    for(const row of rows){if(has(row.method))continue;const item=row.item||row.analyte||row.name;if(!item)continue;const setting=get(item);if(setting.effective_report_method){row.method=setting.effective_report_method;row.method_setting_key=setting.analyte_key;row.method_setting_revision=setting.revision;}}
    return rows;
  }
  async function open(container){
    state.root=typeof container==='string'?document.getElementById(container):container||document.getElementById('dfMeasurementMethodsApp');
    if(!state.root)return false;state.root.classList.add('mm-settings');render('설정을 불러오는 중입니다.');
    try{await load(true);render();}catch(error){render(error.message);}return true;
  }
  function draftFor(key){if(!state.drafts.has(key)){const row=get(key);state.drafts.set(key,{...row,expected_revision:row.revision??null,_changed:false});}return state.drafts.get(key);}
  function render(message=''){
    const root=state.root;if(!root)return;
    root.innerHTML=`<header class="mm-head"><div><span class="mm-eyebrow">공통 환경설정</span><h1>시료채취·분석방법</h1><p>항목별 방법을 한 번 등록하면 성적서와 분석 화면의 비어 있는 방법에 연결됩니다.</p></div><div class="mm-actions"><button type="button" data-mm-refresh>새로 불러오기</button><button type="button" data-mm-reset>입력 취소</button><button type="button" class="mm-primary" data-mm-save ${!canEdit()||!state.loaded?'disabled':''}>변경내용 저장</button></div></header><div class="mm-info">직접 작성한 방법과 완료된 문서는 유지됩니다. IC·흡광광도법 등은 실제 분석방법별로 따로 관리합니다.</div><div class="mm-toolbar"><label class="mm-search"><span>측정항목 검색</span><input type="search" data-mm-query placeholder="먼지, 총탄화수소, 분석방법…" value="${esc(state.query)}"></label><label><span>표시</span><select data-mm-filter><option value="all" ${state.filter==='all'?'selected':''}>전체 항목</option><option value="missing" ${state.filter==='missing'?'selected':''}>미입력 포함</option><option value="changed" ${state.filter==='changed'?'selected':''}>변경한 항목</option></select></label><button type="button" data-mm-add ${!canAction('create')?'disabled':''}>+ 항목 추가</button><span class="mm-count" data-mm-count></span></div><p class="mm-message" data-mm-message role="status">${esc(message||(!canEdit()?'등록된 방법을 확인할 수 있습니다. 관리자에게 작성·수정 권한을 요청해 주세요.':''))}</p><div class="mm-table-wrap"><table class="mm-table"><thead><tr><th>측정항목</th><th>시료채취방법</th><th>분석방법</th><th>성적서 표시방법</th></tr></thead><tbody data-mm-rows></tbody></table></div><p class="mm-footnote">성적서 표시방법이 비어 있으면 입력한 시료채취방법과 분석방법을 연결합니다. 원본 설정에서 여러 방법이 발견된 항목은 사용할 기본값을 직접 확인해 주세요.</p>`;
    renderRows();
    root.querySelector('[data-mm-query]').oninput=e=>{state.query=e.target.value;renderRows();};root.querySelector('[data-mm-filter]').onchange=e=>{state.filter=e.target.value;renderRows();};
    root.querySelector('[data-mm-refresh]').onclick=async()=>{if([...state.drafts.values()].some(row=>row._changed)){root.querySelector('[data-mm-message]').textContent='작성 중인 변경내용을 먼저 저장해 주세요. 입력값을 유지했습니다.';return;}state.drafts.clear();await open(root);};
    root.querySelector('[data-mm-reset]').onclick=async()=>{state.drafts.clear();await open(root);};
    root.querySelector('[data-mm-add]').onclick=addRow;
    root.querySelector('[data-mm-save]').onclick=async()=>{
      const button=root.querySelector('[data-mm-save]'),messageNode=root.querySelector('[data-mm-message]');button.disabled=true;
      try{const changed=[...state.drafts.values()].filter(row=>row._changed);await save(changed);render(`${changed.length}개 항목의 공통 방법을 저장했습니다.`);}
      catch(error){messageNode.textContent=error.message;button.disabled=!canEdit()||!state.loaded;}
    };
  }
  function renderRows(){
    const root=state.root;if(!root)return;const query=clean(state.query).toLowerCase();
    const rows=list().map(row=>draftFor(row.analyte_key)).filter(row=>!query||[row.title,row.analyte_key,...FIELDS.map(field=>row[field])].join(' ').toLowerCase().includes(query)).filter(row=>state.filter==='changed'?row._changed:state.filter==='missing'?FIELDS.some(field=>!has(row[field])):true);
    root.querySelector('[data-mm-count]').textContent=`${rows.length}개 항목`;
    root.querySelector('[data-mm-rows]').innerHTML=rows.length?rows.map(row=>`<tr data-mm-row="${esc(row.analyte_key)}"><th scope="row"><strong>${esc(row.title||row.analyte_key)}</strong><small>${row.variant?'분석방법 구분':row.revision?'공통 설정 · v'+row.revision:'기존 항목'}</small>${row.ambiguous?'<span class="mm-warning">기존 방법이 여러 개입니다</span>':''}${row._changed?'<span class="mm-changed">변경됨</span>':''}</th>${FIELDS.map(field=>`<td><textarea rows="3" data-mm-field="${field}" aria-label="${esc(row.title||row.analyte_key)} ${field==='sampling_method'?'시료채취방법':field==='analysis_method'?'분석방법':'성적서 표시방법'}" ${!canAction(row.revision?'update':'create')?'readonly':''} placeholder="${field==='report_method'?'비워 두면 채취·분석방법 연결':'방법 입력'}">${esc(row[field])}</textarea>${field==='report_method'?`<small class="mm-preview" data-mm-preview>${esc(complete({...row,ambiguous:row._changed?false:row.ambiguous}).effective_report_method)||'표시방법 미등록'}</small>`:''}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="4" class="mm-empty">조건에 맞는 측정항목이 없습니다.</td></tr>';
    root.querySelectorAll('[data-mm-row]').forEach(tr=>tr.querySelectorAll('[data-mm-field]').forEach(input=>input.oninput=()=>{
      const row=draftFor(tr.dataset.mmRow);row[input.dataset.mmField]=input.value;row._changed=true;
      tr.querySelector('[data-mm-preview]').textContent=complete({...row,ambiguous:false}).effective_report_method||'표시방법 미등록';
      if(!tr.querySelector('.mm-changed'))tr.querySelector('th').insertAdjacentHTML('beforeend','<span class="mm-changed">변경됨</span>');
    }));
  }
  function addRow(){if(!canAction("create"))return;
    const root=state.root;if(!root||root.querySelector('[data-mm-new-form]'))return;
    const form=document.createElement('form');form.className='mm-new-form';form.dataset.mmNewForm='';form.innerHTML='<label>새 측정항목 이름 <input data-mm-new-name maxlength="100" required></label><button type="submit">항목 추가</button><button type="button" data-mm-new-cancel>닫기</button>';
    root.querySelector('.mm-toolbar').after(form);form.querySelector('input').focus();form.querySelector('[data-mm-new-cancel]').onclick=()=>form.remove();
    form.onsubmit=event=>{event.preventDefault();const key=canonical(form.querySelector('input').value);if(!key||key==='*')return;registerCatalog([key]);draftFor(key);state.query=key;root.querySelector('[data-mm-query]').value=key;renderRows();form.remove();};
  }
  const api={version:VERSION,configure,registerCatalog,canonical,load,get,list,defaultsFor,save,fillMissing,open};
  global.DF_MEASUREMENT_METHODS=api;
  refreshCatalog();
})(typeof window!=='undefined'?window:globalThis);

