/* DREAMFOREN v120.37.26.0 · 완료 성적서의 반기보고 자료 계산 */
(function (global) {
  'use strict';
  const text = v => v == null ? '' : String(v).trim();
  const clone = v => JSON.parse(JSON.stringify(v));
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const norm = v => text(v).toLowerCase().replace(/주식회사|\(주\)|㈜/g, '').replace(/\s/g, '');
  function date(v) {
    const m = text(v).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:$|\s|T)/);
    if (!m) return '';
    const out = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    const d = new Date(out + 'T00:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === out ? out : '';
  }
  function halfForDate(v) { const d = date(v); return d ? (Number(d.slice(5, 7)) <= 6 ? 1 : 2) : null; }
  function reportForm(report) {
    const data = report?.form_data || {};
    return data.completion_snapshot?.version === 1 && data.completion_snapshot.form
      ? data.completion_snapshot.form : data;
  }
  function reportEligible(report, year, half) {
    if (!report || report.archived_at || report.status !== 'issued') return false;
    const d = date(report.measurement_date || reportForm(report).sampling?.date);
    return !!d && Number(d.slice(0, 4)) === Number(year) && halfForDate(d) === Number(half);
  }
  function number(v) {
    const raw = text(v).replace(/,/g, '');
    return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : null;
  }
  function flowUnit(v) {
    const u = text(v).normalize('NFKC').replace(/[³㎥]/g, '3').replace(/\^3/g, '3').replace(/\s/g, '').toLowerCase();
    const units = {
      'sm3/min': 'minute', 'sm3/분': 'minute', 'nm3/min': 'minute', 'nm3/분': 'minute',
      'sm3/h': 'hour', 'sm3/hr': 'hour', 'sm3/hour': 'hour', 'sm3/시간': 'hour',
      'nm3/h': 'hour', 'nm3/hr': 'hour', 'nm3/hour': 'hour', 'nm3/시간': 'hour',
      'sm3/day': 'day', 'sm3/d': 'day', 'sm3/일': 'day', 'nm3/day': 'day', 'nm3/d': 'day', 'nm3/일': 'day'
    };
    return units[u] || '';
  }
  function parseFlow(raw, explicitUnit, schemaDefault) {
    const s = text(raw);
    const m = s.match(/^((?:\d[\d,]*(?:\.\d*)?|\.\d+))\s*(.*?)$/);
    if (!m) return { value: null, unit: text(explicitUnit), error: '유량 값이 없거나 올바른 숫자가 아닙니다.' };
    const embedded = text(m[2]), supplied = text(explicitUnit);
    if (embedded && supplied && flowUnit(embedded) !== flowUnit(supplied))
      return { value: null, unit: embedded, error: '유량 값의 단위와 선택한 단위가 다릅니다.' };
    return { value: number(m[1]), unit: embedded || supplied || schemaDefault || '' };
  }
  function dailyFlow(raw, unit, hours) {
    const parsed = parseFlow(raw, unit, ''), mode = flowUnit(parsed.unit), h = number(hours);
    if (parsed.error) return { valid: false, error: parsed.error, value: null };
    if (!mode) return { valid: false, error: '표준상태 유량 단위(S㎥/분·시간·일)를 확인해주세요.', value: null };
    if (mode !== 'day' && (h === null || h > 24))
      return { valid: false, error: '시설별 하루 가동시간을 0~24시간으로 입력해주세요.', value: null };
    const factor = mode === 'minute' ? 60 * h : mode === 'hour' ? h : 1;
    const calculated = parsed.value * factor;
    if (!Number.isFinite(calculated)) return { valid: false, error: '일일유량 계산 범위를 확인해주세요.', value: null };
    return { valid: true, value: Math.round((calculated + Number.EPSILON) * 1000) / 1000,
      source_value: parsed.value, source_unit: parsed.unit, operating_hours: mode === 'day' ? h : h,
      factor, expression: mode === 'minute' ? `${parsed.value} × 60 × ${h}` : mode === 'hour' ? `${parsed.value} × ${h}` : `${parsed.value} (일일유량)` };
  }
  function profileFor(profiles, companyId, facilityId) {
    if (typeof profiles === 'function') return profiles(companyId, facilityId) || {};
    if (typeof profiles?.get === 'function') return profiles.get(companyId, facilityId) || {};
    return facilityId ? profiles?.[facilityId] || profiles?.facilities?.[facilityId] || {}
      : profiles?.company || profiles?.companies?.[companyId] || {};
  }
  function facilityFor(company, report) {
    const list = (company?.Facilities || []).filter(f => f && f.Active !== false);
    if (text(report.facility_id)) {
      const found = list.filter(f => text(f.Id) === text(report.facility_id));
      return found.length === 1 ? found[0] : null;
    }
    const name = norm(report.facility_name || reportForm(report).request?.stack_name);
    const found = name ? list.filter(f => [f.FacilityName, f.PreventionFacility, f.EmissionFacility].some(v => norm(v) === name)) : [];
    return found.length === 1 ? found[0] : null;
  }
  function grade(v) { const s = text(v); return /^[1-5](?:종)?$/.test(s) ? s.replace(/종$/, '') + '종' : s; }
  function build({ reports = [], company = {}, facilityProfiles = {}, year, half, manual = {} } = {}) {
    const issues = [], warnings = [], sources = [], excluded = [], companyId = text(company.Id);
    const cp = profileFor(facilityProfiles, companyId);
    const pick = (key, fallback) => own(manual, key) ? text(manual[key]) : text(fallback);
    const data = {
      company_name: pick('company_name', cp.company_name || company.Name), representative: pick('representative', cp.representative || company.Representative),
      manager: pick('manager', cp.manager || company.EnvironmentManager), address: pick('address', cp.address || company.Address),
      phone: pick('phone', cp.phone || company.Phone), business_class: grade(pick('business_class', cp.site_class || company.Grade)),
      year: Number(year), half: Number(half), submit_date: pick('submit_date', ''), submitter: pick('submitter', cp.representative || company.Representative),
      authority: pick('authority', cp.local_authority), measurements: []
    };
    if (!companyId) issues.push('업체현황의 업체를 정확히 연결해주세요.');
    if (!Number.isInteger(data.year) || data.year < 2000 || data.year > 2100 || ![1, 2].includes(data.half)) issues.push('보고 연도와 반기를 확인해주세요.');
    const selected = [];
    for (const report of reports) {
      if (!report || report.archived_at) continue;
      if (!text(report.company_id) && norm(report.company_name) === norm(company.Name)) {
        issues.push(`${text(report.report_no || report.id)}: 성적서의 업체 연결을 확인해주세요.`);
        excluded.push({ id: report.id, reason: 'unmatched_company' }); continue;
      }
      const companyMatch = text(report.company_id) === companyId;
      if (!companyMatch) { excluded.push({ id: report.id, reason: 'different_company' }); continue; }
      if (report.status !== 'issued') { excluded.push({ id: report.id, reason: 'not_completed' }); continue; }
      const day = date(report.measurement_date || reportForm(report).sampling?.date);
      if (!day) { issues.push(`${text(report.report_no || report.id)}: 측정일을 확인해주세요.`); continue; }
      if (Number(day.slice(0, 4)) !== data.year || halfForDate(day) !== data.half) { excluded.push({ id: report.id, reason: 'outside_period' }); continue; }
      const samplingDay = date(reportForm(report).sampling?.date);
      if (samplingDay && samplingDay !== day) { issues.push(`${text(report.report_no || report.id)}: 측정일과 성적서 채취일이 다릅니다.`); continue; }
      selected.push(report);
    }
    const byReceipt = new Map();
    for (const r of selected) {
      const key = text(r.source_receipt_no || r.report_no || r.id);
      if (byReceipt.has(key)) { issues.push(`${key}: 완료 성적서가 중복되어 있어 확인이 필요합니다.`); continue; }
      byReceipt.set(key, r);
    }
    for (const report of byReceipt.values()) {
      const form = reportForm(report), facility = facilityFor(company, report), receipt = text(report.source_receipt_no || report.report_no || report.id);
      if (!facility) { issues.push(`${receipt}: 업체현황의 시설을 정확히 연결해주세요.`); continue; }
      const facilityId = text(facility.Id), p = profileFor(facilityProfiles, companyId, facilityId);
      const override = manual.facilities?.[facilityId] || {};
      const measurementOverride = manual.measurements?.[text(report.id)] || {};
      const select = (key, fallback) => own(override, key) ? override[key] : fallback;
      const selectFlow = (key, fallback) => own(measurementOverride, key) ? measurementOverride[key] : fallback;
      const hours = select('operating_hours', p.operating_hours), classValue = grade(select('facility_class', p.facility_class));
      const basis = text(selectFlow('flow_basis', select('flow_basis', p.flow_basis || 'before')));
      const sample = form.sampling || {};
      const rawFlow = selectFlow('flow_value', basis === 'after' ? sample.flow_after : sample.flow_before);
      // Existing report fields are explicitly labelled S㎥/분 in the report editor.
      // A manual override must carry a unit instead of inheriting that assumption.
      const unit = selectFlow('flow_unit', basis === 'after' ? sample.flow_after_unit : sample.flow_before_unit);
      const parsed = parseFlow(rawFlow, unit, own(measurementOverride, 'flow_value') ? '' : 'S㎥/분');
      const flow = parsed.error ? { valid: false, error: parsed.error } : dailyFlow(parsed.value, parsed.unit, hours);
      if (!['before', 'after'].includes(basis)) issues.push(`${receipt}: 유량 보정 기준을 확인해주세요.`);
      if (!classValue) issues.push(`${receipt}: 시설 종별이 비어 있습니다.`);
      else if (!/^(?:[1-5]종|설치면제|면제)$/.test(classValue)) issues.push(`${receipt}: 시설 종별 원본값을 확인해주세요.`);
      if (!flow.valid) issues.push(`${receipt}: ${flow.error}`);
      const results = (form.results || []).filter(r => text(r.item)).map(r => {
        const withUnit = text(r.item).match(/^(.*?)\(([^()]+)\)\s*$/);
        return { item: withUnit ? text(withUnit[1]) : text(r.item), value: text(r.result ?? r.value),
          unit: text(r.unit) || (withUnit ? text(withUnit[2]) : ''), method: text(r.method) };
      });
      if (!results.length) issues.push(`${receipt}: 측정항목이 없습니다.`);
      for (const r of results) for (const [key, label] of [['value', '측정값'], ['unit', '단위'], ['method', '측정방법']])
        if (!r[key]) issues.push(`${receipt} ${r.item}: ${label}을 확인해주세요.`);
      data.measurements.push({
        report_id: text(report.id), receipt_no: receipt, facility_id: facilityId,
        facility_name: text(selectFlow('facility_name', form.request?.stack_name || report.facility_name || facility.FacilityName || facility.PreventionFacility)),
        facility_class: classValue, measurement_date: date(report.measurement_date || sample.date),
        measurement_type: '측정대행\n업체계약', agency_name: !text(form.issuer?.company) || norm(form.issuer?.company) === '드림포이엔' ? '주식회사\n드림포이엔' : text(form.issuer.company),
        daily_flow: flow.valid ? flow.value : '', flow_value: parsed.value, flow_unit: parsed.unit,
        operating_hours: hours ?? '', flow_basis: basis, calculation: flow.expression || '', results
      });
      sources.push({ id: text(report.id), receipt_no: receipt, updated_at: text(report.updated_at),
        completed_at: text(report.form_data?.completion_snapshot?.confirmed_at), facility_id: facilityId });
    }
    data.measurements.sort((a, b) => a.measurement_date.localeCompare(b.measurement_date) || a.facility_name.localeCompare(b.facility_name, 'ko') || a.receipt_no.localeCompare(b.receipt_no, 'ko', { numeric: true }));
    if (!data.measurements.length) issues.push('선택한 반기에 작성완료된 성적서가 없습니다.');
    for (const m of data.measurements) if (!m.facility_name) issues.push(`${m.receipt_no}: 보고서에 표시할 시설명을 입력해주세요.`);
    for (const [key, label] of [['company_name', '업체명'], ['representative', '대표자'], ['address', '주소'], ['phone', '연락처'], ['manager', '담당자'], ['authority', '지자체']])
      if (!data[key]) issues.push(`${label}을 입력해주세요.`);
    if (!/^[1-5]종$/.test(data.business_class)) issues.push('사업장 종별을 1~5종 중에서 확인해주세요.');
    if (data.submit_date && !date(data.submit_date)) issues.push('제출일을 확인해주세요.');
    const waiting = excluded.filter(x => x.reason === 'not_completed').length;
    if (waiting) warnings.push(`작성중 성적서 ${waiting}건은 집계에서 제외했습니다.`);
    return { data, issues: [...new Set(issues)], warnings, sources, excluded, ready: issues.length === 0,
      fingerprintInput: JSON.stringify({ data, sources }) };
  }
  global.DF_HALFYEAR_MODEL = { build, dailyFlow, parseFlow, flowUnit, halfForDate, reportEligible, reportForm, facilityFor };
})(window);
