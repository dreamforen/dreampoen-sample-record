/* Sample-authoritative filter-ledger sync. Only runs after a verified online save. */
(function (global, document) {
  'use strict';
  const RPC = 'df_filter_sample_sync_v438';
  const text = value => String(value == null ? '' : value).trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const sourceId = row => text(row?.measurement_data?.id || row?.record_id);
  const sourceReceipt = row => text(row?.receipt_no || row?.measurement_data?.data?.fields?.receiptNo);
  const fault = (message, code) => Object.assign(new Error(message), { code });

  function create(options = {}) {
    const getSession = options.getSession;
    const request = options.request;
    const review = options.review || (async () => false);
    const notify = options.notify || (() => {});
    const refresh = options.refresh || (() => {});
    if (typeof getSession !== 'function' || typeof request !== 'function') throw Error('여지 연결 설정을 확인해주세요.');
    const flights = new Map(), lanes = new Map(), states = new Map();
    let generation = 0;
    function capture(expectedOwner) {
      const session = getSession() || {};
      if (!session.userId || !session.client || expectedOwner && text(expectedOwner) !== text(session.userId)) throw fault('로그인이 변경되어 여지 연결을 중단했습니다.', 'SESSION_CHANGED');
      return { userId: text(session.userId), client: session.client, generation };
    }
    function valid(token) {
      const now = getSession() || {};
      return token.generation === generation && token.userId === text(now.userId) && token.client === now.client;
    }
    function fence(token) { if (!valid(token)) throw fault('로그인 또는 권한이 변경되어 여지 연결을 중단했습니다.', 'SESSION_CHANGED'); }
    function publish(token, row, status, message, plan, extra = {}) {
      fence(token);
      const item = { row: clone(row), recordId: sourceId(row), receiptNo: sourceReceipt(row), status, message, plan: plan ? clone(plan) : null, ...extra };
      states.set(token.userId + '|' + item.recordId, item);
      try { notify(item); } catch (_) { /* A notice cannot undo a confirmed source save. */ }
      return item;
    }
    async function rpc(token, row, apply, reviewToken, takeover) {
      fence(token);
      const response = await request(token.client, RPC, {
        p_receipt_no: sourceReceipt(row), p_record_id: sourceId(row),
        p_apply: !!apply, p_review_token: reviewToken || null, p_takeover: !!takeover
      });
      fence(token);
      if (response?.error) throw response.error;
      const plan = response?.data;
      if (!plan || !['ready', 'synced', 'confirmation_required', 'blocked', 'skipped'].includes(plan.status)) throw fault('여지 연결 응답을 확인하지 못했습니다.', 'RESPONSE');
      if (plan.source && (text(plan.source.receipt_no) && text(plan.source.receipt_no) !== sourceReceipt(row) || text(plan.source.record_id) && text(plan.source.record_id) !== sourceId(row))) throw fault('여지 연결 대상 시료가 변경되었습니다. 최신 기록에서 다시 저장해주세요.', 'SOURCE_CHANGED');
      return plan;
    }
    function warning(plan, fallback) {
      return [plan.message, ...(Array.isArray(plan.warnings) ? plan.warnings : [])].map(text).filter(Boolean).join(' · ') || fallback;
    }
    async function run(row, settings, token) {
      if (!sourceId(row) || !sourceReceipt(row)) return publish(token, row, 'pending', '시료는 저장됐지만 여지 연결에 필요한 원본 ID·접수번호를 확인하지 못했습니다.');
      publish(token, row, 'checking', '시료 저장 완료 · 여지대장 연결 확인 중');
      try {
        let plan = await rpc(token, row, false, null, false);
        for (let attempts = 0; attempts < 4; attempts++) {
          fence(token);
          if (plan.status === 'skipped') return publish(token, row, 'skipped', warning(plan, '여지대장 반영 대상이 아닌 기록입니다.'), plan);
          if (plan.status === 'synced') {
            const result = publish(token, row, 'synced', '시료 저장 완료 · 여지대장 반영 완료', plan);
            try { await refresh(result); } catch (_) { /* The server result remains authoritative. */ }
            fence(token); return result;
          }
          if (plan.status === 'ready') {
            plan = await rpc(token, row, true, plan.review_token, false);
            continue;
          }
          const blocked = plan.status === 'blocked';
          publish(token, row, 'pending', warning(plan, blocked ? '여지번호가 중복되어 원본 확인이 필요합니다.' : '기존 여지 자료와 비교한 뒤 연결해주세요.'), plan);
          if (!settings.interactive) return states.get(token.userId + '|' + sourceId(row));
          const approved = await review(plan, { canApply: !blocked, token, isCurrent: () => valid(token) });
          fence(token);
          if (blocked || approved !== true) return publish(token, row, 'pending', blocked ? warning(plan, '같은 여지번호의 원본을 확인해주세요.') : '시료 저장 완료 · 여지 연결 확인을 보류했습니다.', plan);
          if (!text(plan.review_token)) throw fault('연결 확인 정보가 만료됐습니다. 다시 확인해주세요.', 'STALE_PLAN');
          const takeover = plan.takeover_required !== false && plan.can_takeover !== false;
          plan = await rpc(token, row, true, plan.review_token, takeover);
          // A changed snapshot requires a fresh table and a fresh confirmation.
        }
        return publish(token, row, 'pending', '확인 중 자료가 여러 번 변경되었습니다. 최신 내용에서 여지 연결을 다시 확인해주세요.', plan);
      } catch (error) {
        if (!valid(token)) return { status: 'cancelled', code: 'SESSION_CHANGED' };
        const missing = error?.code === 'PGRST202' || error?.code === '42883' || /df_filter_sample_sync_v438.*(?:not find|does not exist)|(?:not find|does not exist).*df_filter_sample_sync_v438/i.test(error?.message || '');
        const message = missing ? '시료 저장 완료 · 여지 자동연결 설정이 필요합니다. 438번 SQL 적용 후 다시 확인해주세요.' : '시료 저장 완료 · 여지 반영 보류: ' + text(error?.message || error);
        return publish(token, row, 'pending', message, null, { code: missing ? 'MIGRATION_REQUIRED' : error?.code || 'SYNC_ERROR' });
      }
    }
    function afterSaved(row, settings = {}) {
      let token;
      try { token = capture(settings.owner); } catch (_) { return Promise.resolve({ status: 'cancelled', code: 'SESSION_CHANGED' }); }
      const snapshot = clone(row || {}), key = token.userId + '|' + sourceId(snapshot), revision = text(snapshot.measurement_updated_at || snapshot.updated_at || snapshot.measurement_data?.updatedAt);
      const flightKey = key + '|' + sourceReceipt(snapshot) + '|' + revision + '|' + (settings.interactive !== false);
      if (flights.has(flightKey)) return flights.get(flightKey);
      const previous = lanes.get(key);
      const work = Promise.resolve(previous).catch(() => {}).then(() => { fence(token); return run(snapshot, { interactive: settings.interactive !== false }, token); }).catch(error => {
        if (!valid(token)) return { status: 'cancelled', code: 'SESSION_CHANGED' };
        return publish(token, snapshot, 'pending', '시료 저장 완료 · 여지 반영 보류: ' + text(error.message));
      }).finally(() => { if (flights.get(flightKey) === work) flights.delete(flightKey); if (lanes.get(key) === work) lanes.delete(key); });
      flights.set(flightKey, work); lanes.set(key, work); return work;
    }
    return Object.freeze({ afterSaved, states, invalidate() { generation++; states.clear(); } });
  }

  let visibleItem = null, reviewTail = Promise.resolve(), activeReview = null;
  function session() {
    const client = typeof dfSupabase === 'undefined' ? null : dfSupabase;
    const user = typeof dfCloudUser === 'undefined' ? null : dfCloudUser;
    const inactive = typeof dfCloudProfile !== 'undefined' && dfCloudProfile?.active === false;
    return { client, userId: inactive ? '' : text(user?.id) };
  }

  function uiReview(plan, options) {
    const work = () => new Promise(resolve => {
      if (!options.isCurrent()) return resolve(false);
      const dialog = document.createElement('dialog'); dialog.className = 'df-filter-sync-review'; dialog.setAttribute('aria-labelledby', 'dfFilterSyncReviewTitle');
      dialog.innerHTML = '<header><h2 id="dfFilterSyncReviewTitle">여지 연결 확인</h2></header><main><p class="warning" data-review-warning></p><div class="table-wrap"><table><thead><tr><th>구분</th><th>접수번호</th><th>측정일</th><th>업체·시설</th><th>여지번호</th><th>채취 전(g)</th><th>채취 후(g)</th></tr></thead><tbody></tbody></table></div><p data-review-effect style="margin-top:12px"></p></main><footer><button type="button" class="company-btn secondary" data-review-cancel>나중에 확인</button><button type="button" class="company-btn primary" data-review-apply>이 기록에 연결</button></footer>';
      const source = plan.source || {}, entries = Array.isArray(plan.existing_entries) ? plan.existing_entries : [];
      const current = { ...source, before_weight: source.before_weight ?? source.source_before_weight, after_weight: source.after_weight ?? source.source_after_weight };
      const add = (label, row) => {
        const tr = document.createElement('tr');
        const values = [label, row.receipt_no, row.measure_date, row.company_name, row.filter_no, row.before_weight, row.after_weight];
        values.forEach((value, i) => { const cell = document.createElement(i === 0 ? 'th' : 'td'); cell.textContent = value == null || value === '' ? '—' : String(value); if (i === 3 && row.facility_name) { const small = document.createElement('small'); small.textContent = row.facility_name; cell.append(small); } tr.append(cell); });
        dialog.querySelector('tbody').append(tr);
      };
      add('저장한 기록지', current);
      (Array.isArray(plan.current_claims) ? plan.current_claims : []).filter(row => text(row.receipt_no) !== text(source.receipt_no) || text(row.record_id) !== text(source.record_id)).forEach(row => add('같은 번호의 기록지', row));
      entries.forEach(row => add(row.live === false ? '삭제 보관 대장' : text(row.receipt_no).startsWith('DF-SPARE-') ? '사전 여지' : text(row.id) && text(row.id) === text(plan.target_entry?.id) ? '연결할 기존 대장' : '기존 대장', row));
      dialog.querySelector('[data-review-warning]').textContent = [plan.message, ...(plan.warnings || [])].map(text).filter(Boolean).join('\n') || '같은 여지번호의 기존 자료가 있습니다. 내용을 확인해주세요.';
      dialog.querySelector('[data-review-effect]').textContent = options.canApply ? plan.takeover_required === false ? '새로 확인한 시료·대장 내용을 기준으로 반영합니다. 기존 무게와 다른 시료·분석자료는 변경하지 않습니다.' : '이 기록에 연결하면 위 기존 대장 무게를 유지합니다. 다른 시료채취기록지와 분석자료는 변경하지 않습니다.' : '중복된 원본이나 기존 연결을 확인한 뒤 해당 기록지에서 여지번호를 정정·저장해주세요. 기존 무게는 변경하지 않았습니다.';
      const apply = dialog.querySelector('[data-review-apply]'), cancel = dialog.querySelector('[data-review-cancel]'); apply.hidden = !options.canApply;
      let finished = false;
      const finish = value => { if (finished) return; finished = true; if (activeReview?.dialog === dialog) activeReview = null; try { dialog.close(); } catch (_) {} dialog.remove(); resolve(value); };
      activeReview = { dialog, cancel: () => finish(false) };
      apply.onclick = () => finish(options.isCurrent()); cancel.onclick = () => finish(false);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      document.body.append(dialog);
      if (typeof dialog.showModal === 'function') { dialog.showModal(); cancel.focus(); }
      else { finish(false); global.alert('여지 연결 확인이 필요합니다. 최신 브라우저에서 기록을 다시 저장해주세요.'); }
    });
    const result = reviewTail.catch(() => {}).then(work); reviewTail = result; return result;
  }
  function panel() {
    let node = document.getElementById('dfFilterSampleSyncStatus');
    if (node) return node;
    const anchor = document.getElementById('saveStatus') || document.getElementById('dfRepositoryStatus'); if (!anchor) return null;
    node = document.createElement('div'); node.id = 'dfFilterSampleSyncStatus'; node.className = 'df-filter-sync-status'; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
    const label = document.createElement('span'), button = document.createElement('button'); button.type = 'button'; button.className = 'company-btn secondary'; button.textContent = '여지 연결 확인'; button.hidden = true;
    node.append(label, button); anchor.after(node);
    button.onclick = async () => { const item = visibleItem; if (!item) return; button.disabled = true; await engine.afterSaved(item.row, { interactive: true }); if (button.isConnected) button.disabled = false; };
    return node;
  }
  function show(item) {
    visibleItem = item;
    const node = panel();
    if (node) { node.hidden = false; node.classList.toggle('bad', item.status === 'pending'); const label = node.querySelector('span'); label.textContent = item.status === 'skipped' ? '' : item.receiptNo + ' · ' + item.message; label.title = label.textContent; const button = node.querySelector('button'); button.hidden = item.status !== 'pending'; button.disabled = item.status === 'checking'; }
    document.dispatchEvent(new CustomEvent('df:filter-sample-sync-status', { detail: { recordId: item.recordId, receiptNo: item.receiptNo, status: item.status, message: item.message } }));
  }
  const engine = create({ getSession: session, request: (client, name, args) => client.rpc(name, args), review: uiReview, notify: show,
    refresh(result) { const view = document.getElementById('dfViewFilterLedger'); if (view && !view.hidden && getComputedStyle(view).display !== 'none' && !global.dfFilterHasDrafts?.() && !global.dfFilterWriteInProgress?.() && typeof global.dfFilterReload === 'function') return global.dfFilterReload(); document.dispatchEvent(new CustomEvent('df:filter-ledger-synced', { detail: { receiptNo: result.receiptNo, recordId: result.recordId } })); }
  });
  function accessSnapshot() {
    const current = session(), rights = [];
    for (const module of ['sample', 'filter-ledger']) for (const action of ['view', 'create', 'update']) {
      let allowed = true;
      try { if (typeof global.dfMenuCan === 'function') allowed = !!global.dfMenuCan(module, action, true); else if (global.DFMenuPermissions?.can) allowed = !!global.DFMenuPermissions.can(module, action, true); } catch (_) { allowed = false; }
      rights.push(allowed);
    }
    return { ...current, rights };
  }
  let access = accessSnapshot();
  document.addEventListener('df:menu-permissions-changed', () => {
    const next = accessSnapshot();
    const changedActor = next.userId !== access.userId || next.client !== access.client;
    const revoked = access.rights.some((allowed, index) => allowed && !next.rights[index]);
    access = next;
    if (!changedActor && !revoked) return;
    engine.invalidate(); activeReview?.cancel(); visibleItem = null;
    const node = document.getElementById('dfFilterSampleSyncStatus');
    if (node) { node.querySelector('span').textContent = ''; node.querySelector('button').hidden = true; }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel, { once: true }); else panel();
  global.DF_FILTER_SAMPLE_SYNC = Object.freeze({ afterSaved: engine.afterSaved, version: '438', _test: { create, uiReview, engine, sourceId, sourceReceipt } });
})(window, document);
