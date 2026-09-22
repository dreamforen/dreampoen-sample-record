/* DREAMFOREN · 시설별 원본 HWPX 등록 / 불변 버전 연결 */
(function () {
  "use strict";
  var TABLE = "measurement_report_templates", BUCKET = "quality-documents";
  var RPC = "register_measurement_report_template", MAX_SIZE = 30 * 1024 * 1024;
  var options = {}, state = { rows: [], error: "", loaded: false, pending: null, busy: false, serial: 0 };
  function text(v) { return String(v == null ? "" : v).trim(); }
  function copy(v) { return JSON.parse(JSON.stringify(v == null ? {} : v)); }
  function escape(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(v) { return text(v).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " "); }
  function companyNorm(v) { return norm(v).replace(/주식회사|\(주\)|㈜/g, "").trim().replace(/\s+/g, ""); }
  function getOption(key) { var v = options[key]; return typeof v === "function" ? v() : v; }
  function db() { return getOption("database"); }
  function user() { return getOption("currentUser"); }
  function companies() { return (getOption("companies") || []).filter(function (c) { return c && c.Active !== false; }); }
  function unique(rows) { return rows.length === 1 ? rows[0] : null; }
  function fields(source) { return source && source.measurement_data && source.measurement_data.data && source.measurement_data.data.fields || {}; }
  function companyId(c) { return text(c && (c.Id || c.id)); }
  function facilityId(f) { return text(f && (f.Id || f.id)); }
  function companyName(c) { return text(c && (c.Name || c.name)); }
  function facilityName(f) { return text(f && (f.FacilityName || f.Name || f.name || f.PreventionFacility)); }
  function facilityAliases(f) { return [f.FacilityName, f.Name, f.name, f.PreventionFacility].map(norm).filter(Boolean); }
  function identity(source) {
    var f = fields(source), value = {
      company_id: text(source && source.company_id || f.companyDbId),
      facility_id: text(source && source.facility_id || f.facilityDbId),
      company_name: text(source && source.company_name || f.company),
      facility_name: text(source && source.facility_name || f.facility)
    };
    var cs = companies(), companyMatches = value.company_id ? cs.filter(function (c) { return companyId(c) === value.company_id; }) : cs.filter(function (c) { return companyNorm(companyName(c)) === companyNorm(value.company_name); }), company = unique(companyMatches);
    value.ambiguous = companyMatches.length > 1;
    if (company) {
      if (!value.company_id) value.company_id = companyId(company);
      if (!value.company_name) value.company_name = companyName(company);
      var fs = (company.Facilities || []).filter(function (x) { return x && x.Active !== false; });
      var facilityMatches = value.facility_id ? fs.filter(function (x) { return facilityId(x) === value.facility_id; }) : fs.filter(function (x) { return facilityAliases(x).indexOf(norm(value.facility_name)) >= 0; }), facility = unique(facilityMatches);
      value.ambiguous = value.ambiguous || facilityMatches.length > 1;
      if (facility) {
        if (!value.facility_id) value.facility_id = facilityId(facility);
        if (!value.facility_name) value.facility_name = facilityName(facility);
      }
    }
    return value;
  }
  function sameAssociation(a, b) {
    if (a.ambiguous || b.ambiguous) return false;
    if (text(a.company_id) && text(a.facility_id) && text(b.company_id) && text(b.facility_id)) return text(a.company_id) === text(b.company_id) && text(a.facility_id) === text(b.facility_id);
    if (text(a.company_id) || text(a.facility_id) || text(b.company_id) || text(b.facility_id)) return false;
    return !!companyNorm(a.company_name) && !!norm(a.facility_name) && companyNorm(a.company_name) === companyNorm(b.company_name) && norm(a.facility_name) === norm(b.facility_name);
  }
  function getById(id) { return state.rows.find(function (r) { return text(r.id) === text(id); }) || null; }
  function validateAssociation(source, row) { return !!row && sameAssociation(identity(source), row); }
  function resolve(source) { return unique(state.rows.filter(function (r) { return r.active === true && validateAssociation(source, r); })); }
  function resolveForm(source, form) {
    var ref = form && form.template_ref;
    if (!ref) return resolve(source);
    var row = getById(ref.id);
    return row && validateAssociation(source, row) && text(row.fingerprint) === text(ref.fingerprint) && text(row.mapping && row.mapping.pageId) === text(ref.pageId) ? row : null;
  }
  function errorMessage(error) {
    var s = text(error && error.message || error);
    if (/measurement_report_templates|register_measurement_report_template|PGRST20[245]|42P01|schema cache|does not exist/i.test(s)) return "시설별 원본 양식 기능의 DB 업데이트가 필요합니다. 배포본의 36번 SQL 적용 후 다시 불러오세요. 기존 성적서 조회와 다운로드는 계속 사용할 수 있습니다.";
    return s || "원본 양식을 불러오지 못했습니다.";
  }
  function configure(next) { options = Object.assign({}, options, next || {}); return api; }
  async function load() {
    var serial = ++state.serial;
    try {
      var client = db(); if (!client) throw new Error("온라인 DB 연결 후 원본 양식을 불러올 수 있습니다.");
      var rows = [];
      for (var from = 0; ; from += 500) {
        var result = await client.from(TABLE).select("*").order("created_at", { ascending: false }).range(from, from + 499);
        if (result.error) throw result.error;
        rows = rows.concat(result.data || []);
        if (!result.data || result.data.length < 500) break;
      }
      if (serial === state.serial) { state.rows = rows; state.error = ""; state.loaded = true; }
    } catch (error) { if (serial === state.serial) { state.rows = []; state.error = errorMessage(error); state.loaded = false; } }
    return state.rows.slice();
  }
  function summaryOf(row) {
    var summary = row && row.mapping && row.mapping.summary || {}, out = [];
    ["prevention", "operation"].forEach(function (region) {
      (summary[region] || []).forEach(function (cell) { if (text(cell.value)) out.push({ cellId: cell.cellId, label: region === "prevention" ? "방지시설" : "시설가동상황", value: String(cell.value) }); });
    });
    return out;
  }
  function formMeta(formOrTemplate) {
    var ref = formOrTemplate && formOrTemplate.template_ref, row = ref ? getById(ref.id) : formOrTemplate && formOrTemplate.mapping ? formOrTemplate : null;
    var valid = !!row && (!ref || text(ref.fingerprint) === text(row.fingerprint) && text(ref.pageId) === text(row.mapping.pageId));
    return { template: valid ? row : null, linked: valid, name: valid ? row.file_name : "", facilityName: valid ? row.facility_name : "", fixedSummary: valid ? summaryOf(row) : [], variableFields: valid ? Array.from(new Set((row.mapping.mapping || []).map(function (m) { return m.field; }))) : [], error: ref && !valid ? "연결된 원본 양식 버전을 확인할 수 없습니다. 양식 목록을 다시 불러오세요." : "" };
  }
  function applyToForm(form, row, source) {
    if (!form || !row) throw new Error("시설에 연결할 원본 양식을 찾지 못했습니다.");
    if (source && !validateAssociation(source, row)) throw new Error("접수자료와 원본 양식의 업체·시설이 다릅니다.");
    form.template_ref = { id: row.id, fingerprint: row.fingerprint, pageId: row.mapping.pageId, company_id: row.company_id, company_name: row.company_name, facility_id: row.facility_id, facility_name: row.facility_name, file_name: row.file_name };
    return form;
  }
  async function storedBlob(row) {
    if (!db()) throw new Error("온라인 DB에 연결되어 있지 않습니다.");
    var result = await db().storage.from(BUCKET).download(row.storage_path);
    if (result.error) throw result.error;
    return result.data;
  }
  function engine() { var e = window.DF_REPORT_TEMPLATE_ENGINE; if (!e) throw new Error("원본 HWPX 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도하세요."); return e; }
  async function generate(form, templateRef, source) {
    var ref = templateRef || form && form.template_ref, row = ref && getById(typeof ref === "string" ? ref : ref.id);
    if (!row || !form || !form.template_ref) throw new Error("이 시설의 원본 HWPX를 먼저 등록하고 접수자료에 연결하세요. 다른 시설 양식은 대신 적용하지 않습니다.");
    if (source && !validateAssociation(source, row)) throw new Error("현재 접수자료와 원본 양식의 업체·시설이 다릅니다.");
    var pinned = form.template_ref;
    if (text(pinned.id) !== text(row.id) || text(pinned.fingerprint) !== text(row.fingerprint) || text(pinned.pageId) !== text(row.mapping.pageId) || !sameAssociation(pinned, row)) throw new Error("원본 양식 연결 정보가 일치하지 않습니다. 접수자료를 다시 열어 확인하세요.");
    var blob = await storedBlob(row), bytes = await blob.arrayBuffer(), check = await engine().validateConfig(bytes, row.mapping);
    if (!check.valid) throw new Error("원본 양식 연결을 확인하세요.\n" + (check.issues || []).map(issueText).join("\n"));
    return engine().generate(bytes, copy(row.mapping), copy(form));
  }
  function groupCompany(group) {
    var name = text(group && group.name), list = companies(), key = text(group && group.key);
    if (key && key.indexOf("name:") !== 0) return unique(list.filter(function (x) { return companyId(x) === key; }));
    var matches = list.filter(function (x) { return companyNorm(companyName(x)) === companyNorm(name); });
    if (matches.length > 1) return null;
    var c = unique(matches);
    if (!c && group && group.company && companyNorm(companyName(group.company)) === companyNorm(name)) c = group.company;
    return c;
  }
  function groupKey(group) { var c = groupCompany(group); return companyId(c) || "name:" + companyNorm(group && group.name); }
  function groupRows(group) {
    var c = groupCompany(group), id = companyId(c), name = companyNorm(group && group.name);
    return state.rows.filter(function (r) { return id ? text(r.company_id) === id : !text(r.company_id) && companyNorm(r.company_name) === name; });
  }
  function facilityChoices(group) {
    var c = groupCompany(group), out = [], seen = new Set();
    ((c && c.Facilities) || []).filter(function (f) { return f && f.Active !== false; }).forEach(function (f) {
      var id = facilityId(f); if (!id || seen.has(id)) return; seen.add(id); out.push({ id: id, name: facilityName(f), company_id: companyId(c), company_name: companyName(c) });
    });
    (group.sources || []).forEach(function (s) {
      var a = identity(s); if (!a.facility_id || !a.company_id || a.company_id !== companyId(c) || seen.has(a.facility_id)) return;
      seen.add(a.facility_id); out.push({ id: a.facility_id, name: a.facility_name, company_id: a.company_id, company_name: a.company_name });
    });
    return out.sort(function (a, b) { return a.name.localeCompare(b.name, "ko", { numeric: true }); });
  }
  function issueText(v) { return text(typeof v === "string" ? v : v && (v.message || v.label || v.code)); }
  function dateText(v) { try { return new Date(v).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (ignore) { return text(v); } }
  function labelFor(pending, field) { var item = (pending.inspection.fieldOptions || []).find(function (x) { return x.key === field; }); return item ? item.label : field; }
  function selectedPage(pending) { return pending && pending.inspection.pages.find(function (p) { return p.id === pending.pageId; }); }
  function optionHtml(value, label, selected) { return '<option value="' + escape(value) + '"' + (selected ? " selected" : "") + '>' + escape(label) + '</option>'; }
  function cellOptions(page, selected) {
    var seen = new Set(), cells = (page.fields || []).filter(function (cell) { if (seen.has(cell.cellId) || cell.protected && cell.cellId !== selected) return false; seen.add(cell.cellId); return true; });
    return optionHtml("", "칸 선택", !selected) + cells.map(function (cell) { return optionHtml(cell.cellId, (cell.label || "원본 칸") + " · " + text(cell.value || "빈 칸").slice(0, 95), cell.cellId === selected); }).join("");
  }
  function pageCompany(page) { return text(page.companyName || text(page.title).split(" · ")[0]).replace(/^성적서$/, ""); }
  function stackNumber(value) { var m = text(value).match(/배\s*[-－–]?\s*(\d+)\s*[)）]?/); return m ? String(Number(m[1])) : ""; }
  function registrationMismatch(pending, group) {
    var page = selectedPage(pending), facility = facilityChoices(group).find(function (f) { return f.id === pending.facilityId; });
    if (!page || !facility) return "";
    var originalCompany = pageCompany(page), originalStack = stackNumber(page.facilityName), selectedStack = stackNumber(facility.name);
    if (originalCompany && companyNorm(originalCompany) !== companyNorm(facility.company_name)) return "선택한 업체와 원본에 적힌 업체가 다릅니다. 이 업체의 성적서를 선택해 주세요.";
    if (originalStack && selectedStack && originalStack !== selectedStack) return "선택한 시설은 배-" + selectedStack + "이지만 원본은 배-" + originalStack + "입니다. 적용 시설 또는 원본 페이지를 다시 선택해 주세요.";
    return "";
  }
  function reviewHtml(pending, group) {
    var page = selectedPage(pending); if (!page) return "";
    var choice = facilityChoices(group).find(function (f) { return f.id === pending.facilityId; }), mismatch = registrationMismatch(pending, group);
    var warnings = (pending.inspection.warnings || []).concat(page.warnings || []), issues = (pending.inspection.blockingIssues || []).concat(page.blockingIssues || []);
    var fixed = page.fixedSummary || {}, fixedCount = (fixed.prevention || []).length + (fixed.operation || []).length;
    return '<div class="rhxt-review"><div class="rhxt-link-summary"><p><b>적용할 곳</b><span>' + escape(choice ? choice.company_name + ' · ' + choice.name : '위에서 시설을 선택하세요.') + '</span></p><p><b>원본에 적힌 곳</b><span>' + escape(pageCompany(page) + ' · ' + (page.facilityName || '시설명 확인 필요')) + '</span></p></div>' + (mismatch ? '<p class="rhxt-warning">' + escape(mismatch) + '</p>' : '') + '<div class="rhxt-review-title"><h3>바뀌는 값의 위치 확인</h3><span>선택 원본: ' + escape(page.title || page.facilityName || page.id) + '</span></div>' +
      '<p class="rhxt-note">원본에 적힌 이전 값을 보면서 연결 위치를 확인하세요. 방지시설과 시설가동상황의 값·셀 병합·줄바꿈은 원본 그대로 보존합니다.</p>' +
      (warnings.length ? '<div class="rhxt-notice">' + warnings.map(function (v) { return '<p>' + escape(issueText(v)) + '</p>'; }).join("") + '</div>' : '') +
      (issues.length ? '<div class="rhxt-warning">' + issues.map(function (v) { return '<p>' + escape(issueText(v)) + '</p>'; }).join("") + '<p>아래 연결을 확인한 뒤 검증 버튼을 누르세요.</p></div>' : '') +
      '<details class="rhxt-mapping-details"' + (issues.length || pending.mappingOpen ? ' open' : '') + '><summary>자동 연결 ' + pending.mapping.length + '개 · 세부 연결 확인/수정</summary><div class="rhxt-mapping-scroll"><table class="rhxt-mapping"><thead><tr><th>이번 자료의 항목</th><th>측정항목 / 시간 구분</th><th>원본의 칸 · 이전 값</th><th>작업</th></tr></thead><tbody>' +
      pending.mapping.map(function (m, index) {
        var result = /^result\./.test(m.field), selected = (page.fields || []).find(function (c) { return c.cellId === m.cellId; });
        return '<tr data-rhxt-map="' + index + '"><td><select data-map-key="field" aria-label="연결 항목">' + (pending.inspection.fieldOptions || []).map(function (f) { return optionHtml(f.key, f.label, f.key === m.field); }).join("") + '</select></td><td>' +
          (result ? '<input data-map-key="analyte" aria-label="측정항목명" value="' + escape(m.analyte || "") + '" placeholder="예: 먼지">' : '<span class="rhxt-muted">공통 항목</span>') +
          (m.field === "result.time" ? '<select data-map-key="part" aria-label="측정시간 구분">' + ["range", "start", "end"].map(function (v) { return optionHtml(v, { range: "시작 ~ 종료", start: "시작시간", end: "종료시간" }[v], (m.part || "range") === v); }).join("") + '</select>' : '') +
          '</td><td><select data-map-key="cellId" aria-label="원본 칸">' + cellOptions(page, m.cellId) + '</select><small>' + escape(selected && selected.value || "빈 칸") + (m.paragraphIndex != null ? ' · 문단 ' + (Number(m.paragraphIndex) + 1) : '') + '</small></td><td><button type="button" class="rhx-icon-btn danger" data-rhxt-remove-map="' + index + '" aria-label="항목 연결 삭제">×</button></td></tr>';
      }).join("") + '</tbody></table></div><button type="button" class="rhx-btn" data-rhxt-add-map>+ 연결 항목 추가</button></details>' +
      '<details class="rhxt-fixed"><summary>원본 그대로 유지하는 고정 영역 (' + fixedCount + '칸)</summary>' + ["prevention", "operation"].map(function (region) { return '<h4>' + (region === "prevention" ? "방지시설" : "시설가동상황") + '</h4><div class="rhxt-fixed-grid">' + (fixed[region] || []).filter(function (c) { return text(c.value); }).map(function (c) { return '<div><small>' + escape(region === "prevention" ? "방지시설" : "시설가동상황") + '</small><span>' + escape(c.value) + '</span></div>'; }).join("") + '</div>'; }).join("") + '</details>' +
      '<label class="rhxt-confirm"><input type="checkbox" data-rhxt-confirm' + (pending.confirmed ? " checked" : "") + '> 선택한 시설과 원본 페이지가 맞으며, 이전 값이 들어 있던 모든 변동 항목의 연결을 확인했습니다.</label>' +
      '<div class="rhxt-actions"><button type="button" class="rhx-btn" data-rhxt-check>연결 검증</button><button type="button" class="rhx-btn primary" data-rhxt-save' + (state.busy ? " disabled" : "") + '>이 시설의 원본 양식으로 등록</button><button type="button" class="rhx-btn" data-rhxt-cancel>취소</button></div><p class="rhxt-status" role="status" data-rhxt-status>' + escape(pending.status || "") + '</p></div>';
  }
  function renderSection(group) {
    var choices = facilityChoices(group), rows = groupRows(group), pending = state.pending && state.pending.groupKey === groupKey(group) ? state.pending : null;
    var active = rows.filter(function (r) { return r.active; });
    return '<section class="rhx-section rhxt-section" data-rhxt-section data-rhxt-company="' + escape(groupKey(group)) + '"><header><div><h2>시설별 원본 양식</h2><p>이전 성적서를 한 번 연결하면 같은 시설의 다음 접수자료에 그대로 적용합니다.</p></div><span class="rhx-chip good">연결 ' + active.length + '개 시설</span></header>' +
      (state.error ? '<div class="rhxt-warning" role="status">' + escape(state.error) + '<button type="button" class="rhx-btn" data-rhxt-retry>다시 불러오기</button></div>' : '') +
      '<div class="rhxt-register"><div class="rhxt-register-grid"><label>적용할 시설<select data-rhxt-facility>' + optionHtml("", "시설 선택", !(pending && pending.facilityId)) + choices.map(function (f) { return optionHtml(f.id, f.name, pending && pending.facilityId === f.id); }).join("") + '</select></label><label>원본 연도<input type="number" min="2000" max="2100" data-rhxt-year value="' + escape(pending ? pending.year : new Date().getFullYear()) + '"></label><label>자료 구분<select data-rhxt-period>' + ["1분기", "2분기", "3분기", "4분기", "상반기", "하반기", "연간", "기타"].map(function (p) { return optionHtml(p, p, (pending ? pending.period : "기타") === p); }).join("") + '</select></label></div>' +
      (!choices.length ? '<p class="rhxt-warning">업체현황에 시설을 먼저 등록해 주세요. 시설을 구분할 수 있는 정보가 있어야 원본 양식을 안전하게 연결할 수 있습니다.</p>' : '') +
      '<input type="file" accept=".hwpx" hidden data-rhxt-file><button type="button" class="rhxt-drop" data-rhxt-drop' + (!choices.length || state.busy ? ' disabled' : '') + '><strong>' + escape(pending && pending.file ? pending.file.name : "이전 성적서 HWPX를 끌어놓으세요") + '</strong><span>또는 클릭하여 선택 · 최대 30MB · HWP 파일은 한글에서 HWPX로 다른 이름 저장 후 등록</span></button><p class="rhxt-note">PDF·HWP 보관은 아래 ‘저장된 성적서 파일’에서 가능합니다. 원본의 셀 구조를 유지하는 자동 작성에는 HWPX가 필요합니다.</p><p class="rhxt-status" role="status" data-rhxt-file-status>' + escape(pending && pending.fileStatus || "") + '</p>' +
      (pending && pending.inspection ? '<label class="rhxt-page-pick">원본에서 사용할 성적서<select data-rhxt-page>' + pending.inspection.pages.map(function (p, i) { return optionHtml(p.id, (i + 1) + '. ' + (p.facilityName || p.title || '성적서'), p.id === pending.pageId); }).join("") + '</select></label>' + reviewHtml(pending, group) : '') + '</div>' +
      (rows.length ? '<div class="rhxt-versions"><h3>등록된 원본과 버전</h3><div class="rhxt-version-scroll"><table><thead><tr><th>시설</th><th>원본 파일</th><th>원본 시기</th><th>등록일</th><th>상태</th><th></th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + escape(r.facility_name) + '</td><td>' + escape(r.file_name) + '</td><td>' + escape(r.source_year + '년 ' + r.source_period) + '</td><td>' + escape(dateText(r.created_at)) + '</td><td><span class="rhx-state ' + (r.active ? 'done' : 'wait') + '">' + (r.active ? '다음 작성에 적용' : '이전 버전 보관') + '</span></td><td><button type="button" class="rhx-btn" data-rhxt-download="' + escape(r.id) + '">원본 다운로드</button></td></tr>'; }).join("") + '</tbody></table></div><p class="rhxt-note">새 원본을 등록해도 이미 작성한 성적서는 당시 연결된 원본 버전을 유지합니다.</p></div>' : '<div class="rhx-empty">등록된 원본 양식이 없습니다. 시설을 선택하고 이전 성적서를 올려주세요.</div>') + '</section>';
  }
  function notifyChanged() { if (typeof options.onChanged === "function") options.onChanged(); }
  function rerender(root, group) { var old = root.querySelector("[data-rhxt-section]"); if (!old || old.dataset.rhxtCompany !== groupKey(group)) return; var holder = document.createElement("div"); holder.innerHTML = renderSection(group); old.replaceWith(holder.firstElementChild); bindSection(root, group); }
  function activePending(group) { return state.pending && state.pending.groupKey === groupKey(group) ? state.pending : null; }
  function takeInputs(section, pending) {
    pending.facilityId = section.querySelector("[data-rhxt-facility]").value;
    pending.year = Number(section.querySelector("[data-rhxt-year]").value);
    pending.period = section.querySelector("[data-rhxt-period]").value;
    var confirm = section.querySelector("[data-rhxt-confirm]"); pending.confirmed = !!(confirm && confirm.checked);
  }
  function invalidate(pending) { pending.confirmed = false; pending.mappingOpen = true; pending.status = "연결 내용을 변경했습니다. 다시 확인하고 검증해 주세요."; }
  function configFor(pending) {
    var page = selectedPage(pending);
    return { version: 1, fingerprint: pending.inspection.fingerprint, pageId: pending.pageId, mapping: copy(pending.mapping), confirmed: !!pending.confirmed, summary: copy(page.fixedSummary || {}), pageTitle: page.title || "", facilityName: page.facilityName || "" };
  }
  async function inspectFile(file, section, root, group) {
    if (!file) return;
    var status = section.querySelector("[data-rhxt-file-status]");
    if (!/\.hwpx$/i.test(file.name)) { status.textContent = "원본 양식은 HWPX 파일만 연결할 수 있습니다. 한글에서 HWPX로 다른 이름 저장해 주세요."; return; }
    if (!file.size || file.size > MAX_SIZE) { status.textContent = "비어 있지 않은 30MB 이하 HWPX 파일을 선택하세요."; return; }
    var pending = { groupKey: groupKey(group), file: file, confirmed: false, mapping: [], status: "", fileStatus: "원본의 표와 변동 항목을 확인하고 있습니다." };
    takeInputs(section, pending); state.pending = pending; state.busy = true; status.textContent = pending.fileStatus;
    try {
      pending.bytes = await file.arrayBuffer(); pending.inspection = await engine().inspect(pending.bytes);
      if (!pending.inspection.pages || !pending.inspection.pages.length) throw new Error("이 HWPX에서 성적서 표를 찾지 못했습니다. 원본 파일을 확인해 주세요.");
      pending.pageId = pending.inspection.pages[0].id; pending.mapping = copy(pending.inspection.pages[0].mapping || []);
      pending.fileStatus = pending.inspection.pages.length + "개의 성적서를 찾았습니다. 적용할 시설과 사용할 원본 페이지를 직접 확인해 주세요.";
    } catch (error) { pending.inspection = null; pending.fileStatus = errorMessage(error); }
    finally { state.busy = false; if (state.pending === pending && root.querySelector("[data-rhxt-section]")) rerender(root, group); }
  }
  async function checkPending(pending) {
    var checkConfig = configFor(pending); checkConfig.confirmed = true;
    var result = await engine().validateConfig(pending.bytes, checkConfig);
    pending.status = result.valid ? "연결 검증을 통과했습니다. 시설과 원본 페이지를 확인한 뒤 등록하세요." : "확인이 필요합니다. " + (result.issues || []).map(issueText).join(" · ");
    return result;
  }
  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error("보안 연결(HTTPS)에서 원본을 등록해 주세요.");
    var bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    var s = Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join(""); return s.slice(0, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16) + "-" + s.slice(16, 20) + "-" + s.slice(20);
  }
  async function registerPending(pending, group) {
    if (!db() || !user()) throw new Error("로그인 후 원본 양식을 등록해 주세요.");
    if (!pending.confirmed) throw new Error("시설·원본 페이지·연결 항목을 확인하고 확인란을 선택해 주세요.");
    var facility = facilityChoices(group).find(function (f) { return f.id === pending.facilityId; });
    if (!facility || !facility.company_id || !facility.id) throw new Error("업체현황에 등록된 적용 시설을 선택하세요.");
    var mismatch = registrationMismatch(pending, group); if (mismatch) throw new Error(mismatch);
    if (!Number.isInteger(pending.year) || pending.year < 2000 || pending.year > 2100) throw new Error("원본 연도를 2000~2100년 사이로 입력하세요.");
    var check = await checkPending(pending); if (!check.valid) throw new Error(pending.status);
    var id = newId(), path = "report-writer/templates/" + id + ".hwpx", client = db();
    var upload = await client.storage.from(BUCKET).upload(path, pending.file, { contentType: "application/hwp+zip", upsert: false });
    if (upload.error) throw upload.error;
    var payload = { id: id, company_id: facility.company_id, company_name: facility.company_name, facility_id: facility.id, facility_name: facility.name, source_year: pending.year, source_period: pending.period, file_name: pending.file.name, storage_path: path, file_size: pending.file.size, mapping: configFor(pending), fingerprint: pending.inspection.fingerprint };
    var saved;
    try { saved = await client.rpc(RPC, { p_template: payload }); } catch (error) { saved = { error: error }; }
    if (saved.error) {
      // A transport error can arrive after the atomic RPC committed. Check before removing the uploaded object.
      var existing;
      try { existing = await client.from(TABLE).select("*").eq("id", id).maybeSingle(); } catch (ignore) { existing = { error: true }; }
      if (existing && !existing.error && existing.data) saved = { data: existing.data };
      else { if (existing && !existing.error && !existing.data) { try { await client.storage.from(BUCKET).remove([path]); } catch (ignore) {} } throw saved.error; }
    }
    var row = Array.isArray(saved.data) ? saved.data[0] : saved.data;
    if (!row || !row.id) throw new Error("원본 등록 결과를 확인할 수 없습니다. 목록을 다시 불러와 주세요.");
    state.rows.forEach(function (r) { if (sameAssociation(r, row)) r.active = false; });
    state.rows.unshift(row); state.error = ""; state.loaded = true; state.pending = null;
    await load();
    return row;
  }
  function bindSection(root, group) {
    var section = root && root.querySelector("[data-rhxt-section]"); if (!section || section.dataset.rhxtCompany !== groupKey(group)) return;
    if (state.busy) section.querySelectorAll("input, select, button").forEach(function (el) { el.disabled = true; });
    var fileInput = section.querySelector("[data-rhxt-file]"), drop = section.querySelector("[data-rhxt-drop]");
    drop.onclick = function () { if (!state.busy) fileInput.click(); };
    fileInput.onchange = function () { if (!state.busy) inspectFile(fileInput.files[0], section, root, group); };
    ["dragenter", "dragover"].forEach(function (name) { drop.addEventListener(name, function (e) { e.preventDefault(); e.stopPropagation(); if (!drop.disabled) drop.classList.add("dragging"); }); });
    ["dragleave", "drop"].forEach(function (name) { drop.addEventListener(name, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove("dragging"); }); });
    drop.addEventListener("drop", function (e) { if (state.busy || drop.disabled) return; var files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return; if (files.length > 1) { section.querySelector("[data-rhxt-file-status]").textContent = "시설과 원본 페이지를 확인할 수 있도록 한 번에 파일 하나씩 등록해 주세요."; return; } inspectFile(files[0], section, root, group); });
    var retry = section.querySelector("[data-rhxt-retry]"); if (retry) retry.onclick = async function () { retry.disabled = true; await load(); rerender(root, group); notifyChanged(); };
    section.querySelectorAll("[data-rhxt-download]").forEach(function (button) { button.onclick = async function () { button.disabled = true; try { var row = getById(button.dataset.rhxtDownload), blob = await storedBlob(row); if (typeof options.downloadBlob === "function") options.downloadBlob(blob, row.file_name); else { var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = row.file_name; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); } } catch (error) { window.alert(errorMessage(error)); } finally { button.disabled = false; } }; });
    var pending = activePending(group); if (!pending || !pending.inspection) return;
    ["facility", "year", "period"].forEach(function (key) { section.querySelector("[data-rhxt-" + key + "]").onchange = function () { takeInputs(section, pending); invalidate(pending); rerender(root, group); }; });
    section.querySelector("[data-rhxt-page]").onchange = function (e) { takeInputs(section, pending); pending.pageId = e.target.value; pending.mapping = copy(selectedPage(pending).mapping || []); invalidate(pending); rerender(root, group); };
    section.querySelectorAll("[data-rhxt-map]").forEach(function (tr) { var index = Number(tr.dataset.rhxtMap); tr.querySelectorAll("[data-map-key]").forEach(function (input) { input.onchange = function () { var key = input.dataset.mapKey, m = pending.mapping[index]; m[key] = input.value; if (key === "cellId" || key === "field") { delete m.paragraphIndex; var original = selectedPage(pending).mapping.find(function (x) { return x.field === m.field && x.cellId === m.cellId; }); if (original && original.paragraphIndex != null) m.paragraphIndex = original.paragraphIndex; } if (key === "field" && !/^result\./.test(m.field)) { delete m.analyte; delete m.part; } if (m.field === "result.time" && !m.part) m.part = "range"; if (key === "cellId") { var targetCell = selectedPage(pending).fields.find(function (x) { return x.cellId === m.cellId; }); if (targetCell && targetCell.unit) m.unit = targetCell.unit; else delete m.unit; } invalidate(pending); rerender(root, group); }; }); });
    section.querySelectorAll("[data-rhxt-remove-map]").forEach(function (button) { button.onclick = function () { pending.mapping.splice(Number(button.dataset.rhxtRemoveMap), 1); invalidate(pending); rerender(root, group); }; });
    section.querySelector("[data-rhxt-add-map]").onclick = function () { pending.mapping.push({ field: (pending.inspection.fieldOptions[0] || {}).key || "receipt_no", cellId: "" }); invalidate(pending); rerender(root, group); };
    section.querySelector("[data-rhxt-confirm]").onchange = function (e) { pending.confirmed = e.target.checked; };
    section.querySelector("[data-rhxt-cancel]").onclick = function () { if (state.busy) return; state.pending = null; rerender(root, group); };
    section.querySelector("[data-rhxt-check]").onclick = async function (e) { e.target.disabled = true; takeInputs(section, pending); try { await checkPending(pending); } catch (error) { pending.status = errorMessage(error); } finally { rerender(root, group); } };
    section.querySelector("[data-rhxt-save]").onclick = async function () {
      if (state.busy) return; takeInputs(section, pending); state.busy = true; pending.status = "원본을 등록하고 시설 연결을 저장하고 있습니다."; rerender(root, group);
      try { await registerPending(pending, group); notifyChanged(); }
      catch (error) { pending.status = errorMessage(error); }
      finally { state.busy = false; if (root.querySelector("[data-rhxt-section]")) rerender(root, group); }
    };
  }
  var api = { configure: configure, load: load, renderSection: renderSection, bindSection: bindSection, resolve: resolve, getById: getById, resolveForm: resolveForm, validateAssociation: validateAssociation, applyToForm: applyToForm, formMeta: formMeta, generate: generate,
    status: function () { return { loaded: state.loaded, error: state.error, count: state.rows.length }; },
    _test: { identity: identity, sameAssociation: sameAssociation, facilityChoices: facilityChoices, configFor: configFor, registerPending: registerPending, setRows: function (rows) { state.rows = rows; } }
  };
  window.DF_REPORT_TEMPLATES = api;
})();
