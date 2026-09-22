/* DREAMPOEN v120.37.30 · Per-menu employee permissions.
 * Explicit rules are enforced by SQL 41 as well as the UI. Existing role and
 * profile permissions are never changed or temporarily impersonated here.
 */
(function (window, document) {
  'use strict';
  if (window.DFMenuPermissions) return;
  var ACTIONS = ['view','create','update','delete','upload'];
  var ACTION_NAMES = {view:'조회',create:'작성',update:'수정',delete:'삭제',upload:'업로드'};
  var MODULES = [
    ['home','홈','업무'],['company','업체현황','업무'],['schedule','일정관리','업무'],['navigation','네비게이션','업무'],
    ['sample','시료채취기록지','측정·분석'],['lab-hub','분석·시험실 관리','측정·분석'],['analysis','시료분석','측정·분석'],['filter-ledger','먼지 여지관리대장','측정·분석'],['repository','드림포이엔 자료실','측정·분석'],
    ['measurement-reports','성적서 작성','성적서'],['halfyear-reports','반기별 자가측정결과보고서','성적서'],['measurement-methods','시료채취·분석방법 설정','성적서'],
    ['quality','품질문서','품질문서'],['quality-manual','품질매뉴얼','품질문서'],['organization','조직도','품질문서'],['doc-hub','품질문서 자료실','품질문서'],['quality-forms','작성용 품질문서·접수대장','품질문서'],['qualification','시험담당자 자격 평가표','품질문서'],['certificate','자격인정서','품질문서'],
    ['approval','내부결재','인사·결재'],['leave','연차관리','인사·결재'],['employees','직원관리','인사·결재'],
    ['contract','계약관리·계약문서 작성','영업·회계'],['bid','입찰관리','영업·회계'],['billing','매출·수금 ERP','영업·회계'],['sales-quotes','견적서','영업·회계'],['sales-statements','거래명세서','영업·회계'],['sales-history','영업문서 이력','영업·회계'],['sales-prices','단가표','영업·회계'],['sales-settings','영업문서 설정','영업·회계'],
    ['board','게시판','기타'],['settings','환경설정','기타']
  ];
  var ALIASES = {companies:'company',contracts:'contract',bids:'bid',erp:'billing',reports:'measurement-reports',halfyear:'halfyear-reports',methods:'measurement-methods',lab:'analysis',filter_ledger:'filter-ledger',quality_forms:'quality-forms','schedule-add':'schedule',progress:'company'};
  var ADMIN_ONLY = ['employees','settings','leave'];
  var PRESETS = {none:[false,false,false,false,false],read:[true,false,false,false,false],write:[true,true,false,false,false],register:[true,true,false,false,true],edit:[true,true,true,false,false],all:[true,true,true,true,true]};
  var PRESET_NAMES = {inherit:'기존 설정 유지',none:'접근 차단',read:'조회만',write:'작성만',register:'작성·파일등록',edit:'작성·수정',all:'전체 허용',custom:'직접 설정'};
  var rules = new Map(), state = 'idle', stateUser = '', lastError = '', fetchSequence = 0, pending = null, lastLoaded = 0;
  var signedOut = false, initialized = false, clientBound = null, employeeObserver = null, actionRules = [], uiQueued = false;
  var dialogModel = null, focusBeforeDialog = null;
  function profile() { try { return typeof dfCloudProfile !== 'undefined' ? dfCloudProfile : null; } catch (_) { return null; } }
  function user() { try { return typeof dfCloudUser !== 'undefined' ? dfCloudUser : null; } catch (_) { return null; } }
  function client() { try { return typeof dfSupabase !== 'undefined' ? dfSupabase : null; } catch (_) { return null; } }
  function identity() { var u=user(),p=profile(); return !signedOut && u && p && p.active !== false && (!p.id || p.id === u.id) ? String(u.id || '') : ''; }
  function isAdmin() { return !!identity() && String(profile().role).toLowerCase() === 'admin'; }
  function canonical(module) { return ALIASES[module] || String(module || ''); }
  function moduleName(module) { var found=MODULES.find(function(m){return m[0]===canonical(module);}); return found ? found[1] : String(module); }
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function evaluateLegacy(value) { try { return typeof value === 'function' ? value() === true : value === true; } catch (_) { return false; } }
  function ownRules() { return rules.get(identity()) || {}; }
  function configured(module) { return state === 'ready' && stateUser === identity() && Object.prototype.hasOwnProperty.call(ownRules(),canonical(module)); }
  function can(module, action, legacy) {
    module=canonical(module); action=action || 'view';
    if (!identity() || ACTIONS.indexOf(action)<0) return false;
    if (isAdmin()) return true;
    if (ADMIN_ONLY.indexOf(module)>=0 || (module==='approval' && action==='delete')) return false;
    // Identity, request failures and in-flight loads must never expose legacy
    // privileges while the employee's explicit restrictions are unknown.
    if (state!=='ready' || stateUser!==identity()) return false;
    var explicit=ownRules()[module];
    return explicit ? explicit.view===true && explicit[action]===true : evaluateLegacy(legacy);
  }
  function granted(module, action) { return can(module,action,false); }
  function requirePermission(module,action,legacy) {
    if(can(module,action,legacy))return true;
    var message = state==='error' ? '권한 정보를 확인하지 못했습니다. 새로고침 후 다시 시도해주세요. 계속되면 관리자에게 알려주세요.' : state!=='ready' && !isAdmin() ? '메뉴 권한을 불러오는 중입니다. 잠시 후 다시 시도해주세요.' : moduleName(module)+'의 '+(ACTION_NAMES[action]||action)+' 권한이 없습니다. 관리자에게 메뉴별 권한을 요청해주세요.';
    window.alert(message);return false;
  }
  function emit() {
    queueUi();
    document.dispatchEvent(new CustomEvent('df:menu-permissions-changed',{detail:{status:state,userId:stateUser,error:lastError}}));
  }
  function invalidate(status) { fetchSequence+=1; rules=new Map(); state=status||'idle';stateUser='';lastError='';pending=null;lastLoaded=0;emit(); }
  function refresh() {
    var id=identity(),api=client();
    if(!id || !api || typeof api.rpc!=='function'){invalidate('idle');return Promise.resolve(false);}
    if(pending && stateUser===id)return pending;
    var seq=++fetchSequence;state='loading';stateUser=id;lastError='';emit();
    pending=Promise.resolve().then(function(){return api.rpc('df_menu_permissions_get');}).then(function(result){
      if(seq!==fetchSequence || identity()!==id)return false;
      if(result.error)throw result.error;
      if(!Array.isArray(result.data))throw Error('권한 조회 응답이 올바르지 않습니다.');
      var loaded=new Map();
      result.data.forEach(function(row){
        if(!row || !row.employee_id || !row.module || !row.permissions || typeof row.permissions!=='object')throw Error('권한 정보 형식이 올바르지 않습니다.');
        var employee=String(row.employee_id), module=canonical(row.module), values={};
        ACTIONS.forEach(function(action){values[action]=row.permissions[action]===true;});
        if(!loaded.has(employee))loaded.set(employee,{});
        loaded.get(employee)[module]=values;
      });
      rules=loaded;state='ready';lastLoaded=Date.now();return true;
    }).catch(function(error){
      if(seq!==fetchSequence || identity()!==id)return false;
      state='error';rules=new Map();lastError=String(error.message||error);return false;
    }).finally(function(){if(seq===fetchSequence){pending=null;emit();}});
    return pending;
  }
  function legacyView(module) {
    var p=profile(),access=p&&(p.access_permissions||p.board_permissions)||{};
    if(['employees','contract','bid','sales-quotes','sales-statements','sales-prices','sales-history','sales-settings','settings'].indexOf(module)>=0)return false;
    var key={analysis:'lab_analysis','lab-hub':'lab_hub','filter-ledger':'filter_ledger','quality-manual':'quality_manual','quality-forms':'quality_form',qualification:'quality_form',certificate:'quality_form','measurement-reports':'repository','halfyear-reports':'repository','measurement-methods':'repository'}[module]||module;
    return key==='billing' ? access[key]===true : access[key]!==false;
  }
  function updateNav() {
    document.querySelectorAll('.df-nav-item[data-view]').forEach(function(button){
      var module=canonical(button.dataset.view);
      if(!MODULES.some(function(m){return m[0]===module;}))return;
      if(configured(module) && !isAdmin()){
        var allow=can(module,'view',false);
        if(button.hidden===allow)button.hidden=!allow;
        if(!allow){button.dataset.dfMenuHidden='1';button.setAttribute('aria-disabled','true');button.classList.remove('df-menu-delegated-nav');}
        else {
          delete button.dataset.dfMenuHidden;button.removeAttribute('aria-disabled');
          // Only known menu entry buttons with an explicit view grant are
          // restored. Admin-only mutation controls are not touched.
          if(button.style.display==='none')button.style.removeProperty('display');
          if(button.classList.contains('df-admin-only'))button.classList.add('df-menu-delegated-nav');
          var group=button.closest('.df-nav-group');
          if(group){group.hidden=false;if(group.style.display==='none')group.style.removeProperty('display');}
        }
      }else if(button.dataset.dfMenuHidden || button.classList.contains('df-menu-delegated-nav')){
        delete button.dataset.dfMenuHidden;button.removeAttribute('aria-disabled');button.classList.remove('df-menu-delegated-nav');
        button.hidden=!can(module,'view',legacyView(module));
      }
    });
  }
  function ensureEmployeeButtons() {
    document.querySelectorAll('#dfEmployeesList [data-employee-id]').forEach(function(card){
      var action=card.querySelector('[data-df-menu-edit]');
      if(!isAdmin()){if(action)action.remove();return;}
      if(action)return;
      var host=card.querySelector('.df-employee-actions');if(!host)return;
      action=document.createElement('button');action.type='button';action.className='df-menu-permissions-open';action.dataset.dfMenuEdit=card.dataset.employeeId;action.textContent='메뉴별 세부권한';
      action.addEventListener('click',function(){openEditor(card.dataset.employeeId,card.querySelector('.df-employee-person-main strong')?.textContent || '직원');});
      host.appendChild(action);
    });
  }
  function queueUi() {
    if(uiQueued)return;uiQueued=true;
    Promise.resolve().then(function(){uiQueued=false;updateNav();ensureEmployeeButtons();apply(document);});
  }
  function rulePreset(rule) {
    if(!rule)return 'inherit';
    return Object.keys(PRESETS).find(function(p){return ACTIONS.every(function(a,i){return rule[a]===PRESETS[p][i];});})||'custom';
  }
  function presetRule(preset) { if(preset==='inherit')return null;var values=PRESETS[preset]||PRESETS.none,out={};ACTIONS.forEach(function(a,i){out[a]=values[i];});return out; }
  function options(selected,bulk) { return Object.keys(PRESET_NAMES).filter(function(p){return !bulk || p!=='custom';}).map(function(p){return '<option value="'+p+'"'+(p===selected?' selected':'')+'>'+PRESET_NAMES[p]+'</option>';}).join(''); }
  function modal() {
    var el=document.getElementById('dfMenuPermissionsModal');if(el)return el;
    el=document.createElement('div');el.id='dfMenuPermissionsModal';el.className='company-modal-backdrop df-menu-permissions-backdrop';el.hidden=true;
    el.innerHTML='<section class="company-modal df-menu-permissions-dialog" role="dialog" aria-modal="true" aria-labelledby="dfMenuPermissionsTitle"><header class="df-menu-permissions-head"><div><h2 id="dfMenuPermissionsTitle">메뉴별 세부권한</h2><p id="dfMenuPermissionsEmployee"></p></div><button type="button" data-df-permission-close aria-label="닫기">×</button></header><div class="df-menu-permissions-body"><p class="df-menu-permissions-help">메뉴마다 조회·작성·수정·삭제·업로드를 각각 정할 수 있습니다. <b>기존 설정 유지</b>는 현재 계정 권한을 그대로 사용합니다. 작성만 허용하면 기존 자료의 수정·삭제는 제한됩니다. <b>업로드</b>에는 첨부와 생성파일 저장이 포함됩니다.</p><p class="df-menu-permissions-scope">관리자 계정은 전체 권한을 유지합니다. 직원 권한·연차 부여·기존 사용일수 설정은 관리자만 변경합니다. 결재 승인·반려는 지정 결재자만 가능하며, 결재문서 삭제는 관리자 전용입니다.</p><div class="df-menu-permissions-tools"><label>메뉴 찾기<input type="search" id="dfMenuPermissionsSearch" placeholder="메뉴 이름 검색"></label><label>표시된 메뉴 일괄 설정<select id="dfMenuPermissionsBulk">'+options('inherit',true)+'</select></label><button type="button" id="dfMenuPermissionsApply">적용</button></div><div class="df-menu-permissions-table-wrap"><table class="df-menu-permissions-table"><thead><tr><th scope="col">메뉴</th><th scope="col">빠른 설정</th>'+ACTIONS.map(function(a){return '<th scope="col">'+ACTION_NAMES[a]+'</th>';}).join('')+'</tr></thead><tbody id="dfMenuPermissionsRows"></tbody></table></div></div><footer class="df-menu-permissions-foot"><p id="dfMenuPermissionsMessage" role="status" aria-live="polite"></p><div><button type="button" data-df-permission-close>닫기</button><button type="button" id="dfMenuPermissionsRetry" hidden>다시 불러오기</button><button type="button" id="dfMenuPermissionsSave">권한 저장</button></div></footer></section>';
    document.body.appendChild(el);
    el.querySelectorAll('[data-df-permission-close]').forEach(function(button){button.addEventListener('click',closeEditor);});
    el.querySelector('#dfMenuPermissionsSave').addEventListener('click',saveEditor);
    el.querySelector('#dfMenuPermissionsRetry').addEventListener('click',function(){if(dialogModel)loadEditor(dialogModel.employee,dialogModel.name);});
    el.querySelector('#dfMenuPermissionsSearch').addEventListener('input',filterRows);
    el.querySelector('#dfMenuPermissionsApply').addEventListener('click',function(){
      if(!dialogModel || dialogModel.busy)return;
      var preset=el.querySelector('#dfMenuPermissionsBulk').value;
      el.querySelectorAll('[data-df-permission-row]').forEach(function(row){if(!row.hidden)setRule(row.dataset.dfPermissionRow,presetRule(preset));});
    });
    el.querySelector('#dfMenuPermissionsRows').addEventListener('change',function(event){
      if(!dialogModel || dialogModel.busy)return;
      var row=event.target.closest('[data-df-permission-row]');if(!row)return;
      var module=row.dataset.dfPermissionRow;
      if(event.target.hasAttribute('data-df-permission-preset')){
        var preset=event.target.value;
        if(preset==='custom')setRule(module,dialogModel.values[module]||presetRule('read'));
        else setRule(module,presetRule(preset));
      }else if(event.target.dataset.dfPermissionAction){
        var action=event.target.dataset.dfPermissionAction,rule=Object.assign({},dialogModel.values[module]||presetRule('none'));
        rule[action]=event.target.checked;
        if(action==='view'&&!rule.view)ACTIONS.forEach(function(a){rule[a]=false;});
        else if(rule[action])rule.view=true;
        setRule(module,rule);
      }
    });
    el.addEventListener('keydown',function(event){
      // Keep focus in the dialog. Outside clicks and Escape never discard edits.
      if(event.key!=='Tab')return;
      var focusable=Array.from(el.querySelectorAll('button,input,select')).filter(function(n){return !n.disabled&&!n.hidden&&!n.closest('[hidden]');});
      var first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}
      else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
    });
    return el;
  }
  function setMessage(message,bad) { var el=document.getElementById('dfMenuPermissionsMessage');if(el){el.textContent=message;el.classList.toggle('error',!!bad);} }
  function rowHtml(module) {
    var id=module[0],rule=dialogModel.values[id],preset=rulePreset(rule),adminOnly=ADMIN_ONLY.indexOf(id)>=0;
    if(adminOnly)return '<tr data-df-permission-row="'+id+'"><th scope="row"><strong>'+escape(module[1])+'</strong><small>'+escape(module[2])+'</small></th><td colspan="6" class="df-menu-permissions-admin-only">관리자 전용</td></tr>';
    return '<tr data-df-permission-row="'+id+'"><th scope="row"><strong>'+escape(module[1])+'</strong><small>'+escape(module[2])+'</small></th><td><select data-df-permission-preset aria-label="'+escape(module[1])+' 빠른 설정">'+options(preset,false)+'</select></td>'+ACTIONS.map(function(a){return '<td><label'+(id==='approval'&&a==='delete'?' title="관리자 전용"':'')+'><input type="checkbox" data-df-permission-action="'+a+'" aria-label="'+escape(module[1])+' '+ACTION_NAMES[a]+'"'+(rule&&rule[a]&&!(id==='approval'&&a==='delete')?' checked':'')+(!rule?' disabled':'')+'><span class="df-menu-permissions-mobile-label">'+ACTION_NAMES[a]+'</span></label></td>';}).join('')+'</tr>';
  }
  function renderEditor() {
    document.getElementById('dfMenuPermissionsRows').innerHTML=MODULES.map(rowHtml).join('');
    filterRows();
  }
  function setRule(module,rule) {
    if(ADMIN_ONLY.indexOf(module)>=0)return;
    if(rule&&module==='approval')rule.delete=false;
    dialogModel.values[module]=rule;dialogModel.dirty.add(module);
    var row=document.querySelector('[data-df-permission-row="'+module+'"]');
    if(row){row.querySelector('[data-df-permission-preset]').value=rulePreset(rule);row.querySelectorAll('[data-df-permission-action]').forEach(function(input){input.disabled=!rule||(module==='approval'&&input.dataset.dfPermissionAction==='delete');input.checked=!!(rule&&rule[input.dataset.dfPermissionAction]);});}
    setMessage('변경한 메뉴 '+dialogModel.dirty.size+'개 · 권한 저장을 눌러 반영하세요.',false);
  }
  function filterRows() {
    var query=document.getElementById('dfMenuPermissionsSearch').value.trim().toLocaleLowerCase('ko');
    document.querySelectorAll('[data-df-permission-row]').forEach(function(row){row.hidden=!!query&&!row.querySelector('th').textContent.toLocaleLowerCase('ko').includes(query);});
  }
  function busyEditor(busy) {
    var el=modal();if(dialogModel)dialogModel.busy=busy;
    el.querySelectorAll('button,input,select').forEach(function(control){
      if(control.hasAttribute('data-df-permission-close'))return;
      if(control.dataset.dfPermissionAction){var row=control.closest('[data-df-permission-row]');control.disabled=busy||!dialogModel?.values[row.dataset.dfPermissionRow]||(row.dataset.dfPermissionRow==='approval'&&control.dataset.dfPermissionAction==='delete');}
      else control.disabled=busy;
    });
  }
  function loadEditor(employee,name) {
    dialogModel={employee:String(employee),name:name,values:{},dirty:new Set(),busy:true};
    var mine=dialogModel,el=modal();el.querySelector('#dfMenuPermissionsRows').innerHTML='';el.querySelector('#dfMenuPermissionsRetry').hidden=true;busyEditor(true);setMessage('권한 정보를 불러오는 중입니다.',false);
    return refresh().then(function(ok){
      if(dialogModel!==mine)return false;
      if(!ok||!isAdmin()){
        setMessage('권한 설정을 불러오지 못했습니다. 먼저 41_v1203730_menu_permissions.sql을 적용한 뒤 다시 불러와주세요. '+lastError,true);
        mine.busy=false;el.querySelector('#dfMenuPermissionsRetry').hidden=false;el.querySelector('#dfMenuPermissionsRetry').disabled=false;return false;
      }
      var saved=rules.get(mine.employee)||{};
      MODULES.forEach(function(m){mine.values[m[0]]=saved[m[0]]?Object.assign({},saved[m[0]]):null;});
      renderEditor();busyEditor(false);setMessage('설정하지 않은 메뉴는 기존 권한을 유지합니다.',false);return true;
    });
  }
  function openEditor(employee,name) {
    if(!isAdmin()){window.alert('메뉴별 권한 설정은 관리자만 변경할 수 있습니다.');return Promise.resolve(false);}
    var el=modal();focusBeforeDialog=document.activeElement;el.hidden=false;el.querySelector('#dfMenuPermissionsEmployee').textContent=(name||'직원')+' · 메뉴별 세부권한';el.querySelector('#dfMenuPermissionsSearch').value='';el.querySelector('[data-df-permission-close]').focus();
    return loadEditor(employee,name||'직원');
  }
  function closeEditor() {
    if(dialogModel?.saving){setMessage('저장이 끝난 뒤 닫아주세요.',false);return;}
    if(dialogModel?.dirty.size&&!window.confirm('저장하지 않은 권한 변경을 닫을까요?'))return;
    modal().hidden=true;dialogModel=null;focusBeforeDialog?.focus();
  }
  function saveEditor() {
    var model=dialogModel;if(!model||model.busy)return Promise.resolve(false);
    if(!isAdmin()){setMessage('관리자만 권한을 저장할 수 있습니다.',true);return Promise.resolve(false);}
    if(!model.dirty.size){setMessage('변경한 권한이 없습니다.',false);return Promise.resolve(true);}
    var changes={};model.dirty.forEach(function(module){changes[module]=model.values[module];});
    model.saving=true;busyEditor(true);setMessage('권한을 저장하는 중입니다.',false);
    return Promise.resolve().then(function(){return client().rpc('df_menu_permissions_save',{p_employee:model.employee,p_permissions:changes});}).then(function(result){
      if(result.error)throw result.error;
      model.dirty.clear();return refresh().then(function(ok){setMessage(ok?'저장했습니다. 직원이 새로고침하면 변경한 권한이 화면에도 반영됩니다.':'저장은 완료했지만 권한을 다시 확인하지 못했습니다. 새로고침해주세요.',!ok);return ok;});
    }).catch(function(error){setMessage('저장하지 못했습니다. 입력 내용은 유지됩니다. '+String(error.message||error),true);return false;}).finally(function(){model.saving=false;if(dialogModel===model)busyEditor(false);});
  }
  function actionFromElement(element) {
    var annotated=element.closest('[data-df-menu-module][data-df-menu-action]');
    if(annotated)return {element:annotated,module:annotated.dataset.dfMenuModule,action:annotated.dataset.dfMenuAction,legacy:annotated.dataset.dfMenuLegacy==='true'};
    for(var i=0;i<actionRules.length;i++){
      var entry=actionRules[i],match=element.closest(entry.selector);
      if(match)return {element:match,module:typeof entry.module==='function'?entry.module(match):entry.module,action:typeof entry.action==='function'?entry.action(match):entry.action,legacy:typeof entry.legacy==='function'?function(){return entry.legacy(match);}:entry.legacy};
    }
    return null;
  }
  function apply(root) {
    root=root||document;
    var targets=Array.from(root.querySelectorAll('[data-df-menu-module][data-df-menu-action]'));
    if(root.matches?.('[data-df-menu-module][data-df-menu-action]'))targets.unshift(root);
    targets.forEach(function(control){
      var allow=can(control.dataset.dfMenuModule,control.dataset.dfMenuAction,control.dataset.dfMenuLegacy==='true');
      if(!allow){
        if(!control.hasAttribute('data-df-menu-blocked')){
          control.dataset.dfMenuBlocked='1';
          control.dataset.dfMenuWasDisabled=control.disabled?'true':'false';
          control.dataset.dfMenuWasAriaDisabled=control.getAttribute('aria-disabled')||'';
        }
        if('disabled' in control)control.disabled=true;
        control.setAttribute('aria-disabled','true');
      }else if(control.hasAttribute('data-df-menu-blocked')){
        if('disabled' in control)control.disabled=control.dataset.dfMenuWasDisabled==='true';
        if(control.dataset.dfMenuWasAriaDisabled)control.setAttribute('aria-disabled',control.dataset.dfMenuWasAriaDisabled);
        else control.removeAttribute('aria-disabled');
        delete control.dataset.dfMenuBlocked;delete control.dataset.dfMenuWasDisabled;delete control.dataset.dfMenuWasAriaDisabled;
      }
    });
  }
  function registerActions(entries) { (entries||[]).forEach(function(entry){if(entry&&typeof entry.selector==='string')actionRules.push(entry);}); }
  function checkActionEvent(event) {
    var target=event.target;if(!target||!target.closest)return;
    var found=actionFromElement(target);if(!found)return;
    if(!requirePermission(found.module,found.action,found.legacy)){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.type==='change'&&target.type==='file')target.value='';
    }
  }
  function bindAuth() {
    var api=client();if(!api||api===clientBound)return;
    clientBound=api;
    if(api.auth?.onAuthStateChange)api.auth.onAuthStateChange(function(event){
      if(event==='SIGNED_OUT'){signedOut=true;invalidate('idle');return;}
      if(event==='SIGNED_IN'||event==='USER_UPDATED'||event==='TOKEN_REFRESHED'){
        signedOut=false;invalidate('idle');setTimeout(function(){if(identity())refresh();},0);
      }
    });
  }
  function checkIdentity() {
    bindAuth();
    var id=identity();
    if(id!==stateUser){if(id)refresh();else if(stateUser)invalidate('idle');}
  }
  function init() {
    if(initialized)return;initialized=true;
    // Registered before the final route controller. Only explicit known
    // navigation/action targets are intercepted; unrelated controls are intact.
    window.addEventListener('click',function(event){
      var button=event.target.closest?.('.df-nav-item[data-view],[data-lab-module]');
      if(button){var module=canonical(button.dataset.view||button.dataset.labModule);if(!requirePermission(module,'view',legacyView(module))){event.preventDefault();event.stopImmediatePropagation();return;}}
      checkActionEvent(event);
    },true);
    window.addEventListener('change',checkActionEvent,true);window.addEventListener('drop',checkActionEvent,true);window.addEventListener('submit',checkActionEvent,true);
    employeeObserver=new MutationObserver(queueUi);employeeObserver.observe(document.body,{childList:true,subtree:true});
    var old=window.dfApplyRoleAccess;
    if(typeof old==='function')window.dfApplyRoleAccess=function(){var result=old.apply(this,arguments);signedOut=false;refresh();return result;};
    window.addEventListener('focus',function(){if(identity()&&Date.now()-lastLoaded>30000)refresh();});
    document.addEventListener('visibilitychange',function(){if(!document.hidden&&identity()&&Date.now()-lastLoaded>30000)refresh();});
    // Detect late profile/client initialization. No repeating network polling.
    setInterval(checkIdentity,1000);
    checkIdentity();queueUi();
  }
  window.DFMenuPermissions=Object.freeze({version:'120.37.30',can:can,granted:granted,require:requirePermission,configured:configured,refresh:refresh,canonical:canonical,isAdmin:isAdmin,openEditor:openEditor,registerActions:registerActions,apply:apply,modules:Object.freeze(MODULES.map(function(m){return Object.freeze({id:m[0],label:m[1],group:m[2]});})),getStatus:function(){return {status:state,userId:stateUser,error:lastError};}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window,document);
