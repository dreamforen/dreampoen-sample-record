/* DREAMFOREN v120.37.36.0 · 완료 성적서의 반기보고 자료 계산 */
(function (global) {
  'use strict';
  const text = v => v == null ? '' : String(v).trim();
  const clone = v => JSON.parse(JSON.stringify(v));
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const aliases = row => [...new Set([row?.Id, row?.id, row?.OnlineId, row?.online_id].map(text).filter(Boolean))];
  const TEMPLATE_IDS = new Set(['industrial_small', 'industrial_large', 'boiler_small', 'boiler_large']);
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
    if (!report || report.archived_at || report.status !== 'issued' || report.form_data?.report_mode === 'reference' || reportForm(report).report_mode === 'reference') return false;
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
      const found = list.filter(f => aliases(f).includes(text(report.facility_id)));
      return found.length === 1 ? found[0] : null;
    }
    const name = norm(report.facility_name || reportForm(report).request?.stack_name);
    const found = name ? list.filter(f => [f.FacilityName, f.PreventionFacility, f.EmissionFacility].some(v => norm(v) === name)) : [];
    return found.length === 1 ? found[0] : null;
  }
  const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function resultItem(row) {
    const raw = text(row?.item), withUnit = raw.match(/^(.*?)\(([^()]+)\)\s*$/);
    return withUnit ? text(withUnit[1]) : raw;
  }
  function oxygenItem(value) {
    const key = text(value).replace(/\([^()]*\)\s*$/, '').replace(/\s/g, '').toLowerCase();
    return ({'먼지':'먼지',dust:'먼지','질소산화물':'질소산화물',nox:'질소산화물','황산화물':'황산화물',sox:'황산화물',
      '일산화탄소':'일산화탄소',co:'일산화탄소','산소':'산소',o2:'산소','이산화탄소':'이산화탄소',co2:'이산화탄소'})[key] || '';
  }
  function oxygenStandard(value) {
    if (!['string', 'number'].includes(typeof value)) return null;
    const m = text(value).match(/^((?:\d+(?:\.\d*)?|\.\d+))\s*[%％]?$/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 0 && n < 21 ? n : null;
  }
  function oxygenSourceVersion(report) {
    const form = reportForm(report), snapshot = report?.form_data?.completion_snapshot;
    return JSON.stringify({schema:1,report_id:text(report?.id),receipt_no:text(report?.source_receipt_no),
      company_id:text(report?.company_id),facility_id:text(report?.facility_id),measurement_date:date(report?.measurement_date),
      completion_version:snapshot?.version ?? null,confirmed_at:text(snapshot?.confirmed_at),file_id:text(snapshot?.file_id),
      updated_at:snapshot?.version===1 && snapshot.form ? '' : text(report?.updated_at),
      sampling:{date:text(form.sampling?.date),standard_oxygen:text(form.sampling?.standard_oxygen),
        flow_before:text(form.sampling?.flow_before),flow_before_unit:text(form.sampling?.flow_before_unit),
        flow_after:text(form.sampling?.flow_after),flow_after_unit:text(form.sampling?.flow_after_unit)},
      results:(Array.isArray(form.results)?form.results:[]).filter(r=>text(r?.item)).map(r=>({item:text(r.item),
        value:text(r.result ?? r.value),unit:text(r.unit),method:text(r.method)}))});
  }
  function resolveOxygenSnapshot(report, company, repositoryRows) {
    const form=reportForm(report), rows=(Array.isArray(form.results)?form.results:[]).filter(r=>text(r?.item));
    const output={source_version:oxygenSourceVersion(report),receipt_no:text(report?.source_receipt_no),
      results:rows.map(r=>({source_item:resultItem(r),correction:oxygenItem(r.item)?null:false,
        reason:oxygenItem(r.item)?'analysis_not_confirmed':'not_correctable'}))};
    function unknown(reason) {
      output.reason=reason;
      output.results=output.results.map(r=>r.correction===false?r:{...r,correction:null,reason});
      return output;
    }
    if (!output.results.some(r=>r.correction===null)) {output.reason='not_correctable';return output;}
    const snapshot=report?.form_data?.completion_snapshot;
    const timestamp=value=>{
      const raw=text(value);
      if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) return null;
      const n=Date.parse(raw);return Number.isFinite(n)?n:null;
    };
    const confirmed=timestamp(snapshot?.confirmed_at);
    if (!report?.id || report.archived_at || report.status!=='issued' || snapshot?.version!==1 || !object(snapshot.form) || confirmed===null)
      return unknown('completion_not_confirmed');
    const receipt=text(report.source_receipt_no), reportDay=date(report.measurement_date), sampleDay=date(form.sampling?.date);
    if (!receipt || !reportDay || reportDay!==sampleDay) return unknown('report_identity_invalid');
    if (!aliases(company).includes(text(report.company_id)) || !text(report.facility_id)) return unknown('company_or_facility_unlinked');
    const facilities=(company?.Facilities||[]).filter(f=>f&&f.Active!==false&&aliases(f).includes(text(report.facility_id)));
    if (facilities.length!==1) return unknown('company_or_facility_ambiguous');
    const matching=(Array.isArray(repositoryRows)?repositoryRows:[]).filter(r=>text(r?.receipt_no)===receipt);
    if (matching.length!==1) return unknown(matching.length?'repository_ambiguous':'repository_missing');
    const source=matching[0], measurement=source.measurement_data, data=measurement?.data, fields=data?.fields;
    if (!object(measurement)||!object(data)||!object(fields)) return unknown('repository_malformed');
    const deleted=value=>value===true||['true','t','1','yes','y','on'].includes(text(value).toLowerCase());
    if (source.hidden===true||deleted(measurement.deleted)||deleted(measurement._deleted)) return unknown('repository_inactive');
    if (!text(measurement.id)||text(fields.receiptNo)!==receipt||date(source.measure_date)!==reportDay||date(fields.measureDate)!==reportDay)
      return unknown('repository_identity_mismatch');
    if (!aliases(company).includes(text(fields.companyDbId))||!aliases(facilities[0]).includes(text(fields.facilityDbId)))
      return unknown('repository_identity_mismatch');
    // An alias shared by another facility must not choose a source by list order.
    if ((company.Facilities||[]).filter(f=>f&&f.Active!==false&&aliases(f).includes(text(fields.facilityDbId))).length!==1)
      return unknown('repository_facility_ambiguous');
    const analysis=source.analysis_data, values=analysis?.values;
    if (!object(analysis)||!object(values)||text(analysis.recordId)!==text(measurement.id)) return unknown('analysis_identity_mismatch');
    const rawTimes=[analysis.savedAt,source.analysis_updated_at,values._localUpdatedAt,values._cloudSavedAt].filter(v=>text(v)!=='');
    if (!rawTimes.length) return unknown('analysis_time_missing');
    const times=rawTimes.map(timestamp);
    if (times.some(v=>v===null)) return unknown('analysis_time_invalid');
    const latest=Math.max(...times);
    if (latest>confirmed) return unknown('analysis_newer_than_completion');
    output.record_id=text(measurement.id);output.analysis_record_id=text(analysis.recordId);
    output.analysis_saved_at=new Date(latest).toISOString();output.confirmed_at=text(snapshot.confirmed_at);
    const lab=object(values.lab)?values.lab:{};
    output.results=rows.map(r=>{
      const item=resultItem(r), key=oxygenItem(item);
      if (!key) return {source_item:item,correction:false,reason:'not_correctable'};
      if (key==='먼지') {
        if (own(values,'dustCorrection')&&typeof values.dustCorrection==='boolean')
          return {source_item:item,correction:values.dustCorrection,reason:'analysis_saved',analysis_key:'먼지'};
        return {source_item:item,correction:null,reason:own(values,'dustCorrection')?'analysis_flag_invalid':'analysis_flag_missing',analysis_key:'먼지'};
      }
      const candidates=Object.keys(lab).filter(k=>object(lab[k])&&lab[k].enabled!==false&&
        (oxygenItem(k)===key||oxygenItem(k.split(':').slice(-1)[0])===key));
      if (candidates.length!==1) return {source_item:item,correction:null,reason:candidates.length?'analysis_item_ambiguous':'analysis_item_missing'};
      const analysisKey=candidates[0], value=lab[analysisKey];
      // Match the exact calculator branches, not a coincidentally similar wet-method key.
      if (!['질소산화물','황산화물','일산화탄소','산소','이산화탄소','CO2'].includes(analysisKey))
        return {source_item:item,correction:null,reason:'analysis_key_unsupported',analysis_key:analysisKey};
      return {source_item:item,correction:typeof value.correction==='boolean'?value.correction:null,
        reason:typeof value.correction==='boolean'?'analysis_saved':own(value,'correction')?'analysis_flag_invalid':'analysis_flag_missing',
        analysis_key:analysisKey,method_code:text(value.method_code)};
    });
    output.reason=output.results.some(r=>r.correction===null)?'review_required':'resolved';
    return output;
  }
  function grade(v) { const s = text(v); return /^[1-5](?:종)?$/.test(s) ? s.replace(/종$/, '') + '종' : s; }
  function authorityFromAddress(value) {
    const tokens = text(value).replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean)
      .map(token => token.replace(/^.*?(?=(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주))/, ''));
    if (!tokens.length) return '';
    if (tokens.some(token => /제주특별자치도$/.test(token))) return '';
    const metroIndex = tokens.findIndex(token => /(?:특별시|광역시)$/.test(token));
    if (metroIndex >= 0) {
      const local = tokens.slice(metroIndex + 1).find(token => /(?:시|군|구)$/.test(token));
      if (local) return /시$/.test(local) ? local + '장' : /군$/.test(local) ? local + '수' : local + '청장';
      return tokens[metroIndex] + '장';
    }
    const city = tokens.find(token => /(?:특별자치시|시)$/.test(token));
    if (city) return city + '장';
    const county = tokens.find(token => /군$/.test(token));
    if (county) return county + '수';
    const district = tokens.find(token => /구$/.test(token));
    return district ? district + '청장' : '';
  }
  function authorityTitle(value) {
    const raw = text(value).replace(/구청창$/, '구청장');
    if (!raw || /(?:시장|군수|구청장|도지사)$/.test(raw)) return raw;
    if (/(?:특별자치시|특별시|광역시|시)$/.test(raw)) return raw + '장';
    if (/군$/.test(raw)) return raw + '수';
    if (/구$/.test(raw)) return raw + '청장';
    return raw;
  }
  function build({ reports = [], company = {}, facilityProfiles = {}, year, half, manual = {} } = {}) {
    const issues = [], warnings = [], sources = [], excluded = [], companyId = text(company.Id || company.id), companyAliases = aliases(company);
    const cp = profileFor(facilityProfiles, companyId);
    const pick = (key, fallback) => own(manual, key) ? text(manual[key]) : text(fallback);
    const address = pick('address', cp.address || company.Address || company.address);
    const authority = authorityTitle(manual.authority) || authorityTitle(cp.local_authority)
      || authorityFromAddress(company.Address || company.address || address);
    const data = {
      company_name: pick('company_name', cp.company_name || company.Name), representative: pick('representative', cp.representative || company.Representative),
      manager: pick('manager', cp.manager || company.EnvironmentManager), address,
      phone: pick('phone', cp.phone || company.Phone), business_class: grade(pick('business_class', cp.site_class || company.Grade)),
      year: Number(year), half: Number(half), template_id: pick('template_id', 'industrial_small'), submit_date: pick('submit_date', ''), submitter: '',
      authority, measurements: []
    };
    if (!companyId) issues.push('업체현황의 업체를 정확히 연결해주세요.');
    if (!TEMPLATE_IDS.has(data.template_id)) issues.push('반기보고서 고정 양식을 선택해주세요.');
    if (!Number.isInteger(data.year) || data.year < 2000 || data.year > 2100 || ![1, 2].includes(data.half)) issues.push('보고 연도와 반기를 확인해주세요.');
    const selected = [];
    for (const report of reports) {
      if (!report || report.archived_at) continue;
      if (report.form_data?.report_mode === 'reference' || reportForm(report).report_mode === 'reference') { excluded.push({ id: report.id, reason: 'reference_report' }); continue; }
      if (!text(report.company_id) && norm(report.company_name) === norm(company.Name)) {
        issues.push(`${text(report.report_no || report.id)}: 성적서의 업체 연결을 확인해주세요.`);
        excluded.push({ id: report.id, reason: 'unmatched_company' }); continue;
      }
      const companyMatch = companyAliases.includes(text(report.company_id));
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
      const facilityId = text(facility.Id || facility.id), p = profileFor(facilityProfiles, companyId, facilityId);
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
      if (!classValue) issues.push(`${receipt}: 시설 종별이 비어 있습니다.`);
      else if (!/^(?:[1-5]종|설치면제|면제)$/.test(classValue)) issues.push(`${receipt}: 시설 종별 원본값을 확인해주세요.`);
      const resultItems = measurementOverride.result_items && typeof measurementOverride.result_items === 'object'
        ? measurementOverride.result_items : {};
      const resultFlows = measurementOverride.result_daily_flows && typeof measurementOverride.result_daily_flows === 'object'
        ? measurementOverride.result_daily_flows : {};
      const resultBases = object(measurementOverride.result_flow_bases) || Array.isArray(measurementOverride.result_flow_bases)
        ? measurementOverride.result_flow_bases : {};
      const savedOxygen = manual.oxygen_sources?.[text(report.id)];
      const oxygen = object(savedOxygen) && savedOxygen.source_version===oxygenSourceVersion(report) ? savedOxygen : null;
      const legacyBasis = own(measurementOverride,'flow_basis') ? text(measurementOverride.flow_basis)
        : own(override,'flow_basis') ? text(override.flow_basis) : '';
      const standard = oxygenStandard(sample.standard_oxygen);
      const results = (form.results || []).filter(r => text(r.item)).map((r, resultIndex) => {
        const sourceItem = resultItem(r), sourceOxygen = oxygen?.results?.[resultIndex];
        const usableSource = sourceOxygen && sourceOxygen.source_item===sourceItem && typeof sourceOxygen.correction==='boolean';
        const sourceCorrection = !oxygenItem(sourceItem) ? false : usableSource ? sourceOxygen.correction : null;
        const autoBasis = sourceCorrection===true ? 'after' : sourceCorrection===false ? 'before' : '';
        const selectedBasis = own(resultBases,resultIndex) ? text(resultBases[resultIndex]) : '';
        const explicitBasis = selectedBasis!=='' && selectedBasis!=='auto';
        const resultBasis = explicitBasis ? selectedBasis : autoBasis || legacyBasis;
        const basisValid = ['before','after'].includes(resultBasis);
        if (!basisValid) issues.push(`${receipt} ${sourceItem}: 항목별 산소보정 유량 기준을 확인해주세요.`);
        if (resultBasis==='after' && standard===null) issues.push(`${receipt} ${sourceItem}: 보정 유량의 표준산소농도를 확인해주세요.`);
        const hasCommonValue = own(measurementOverride,'flow_value'), hasCommonUnit = own(measurementOverride,'flow_unit');
        const useCommonBasis = ['before','after'].includes(legacyBasis) && legacyBasis===resultBasis;
        const useCommonValue = hasCommonValue && useCommonBasis;
        const resultRaw = useCommonValue ? measurementOverride.flow_value : resultBasis==='after' ? sample.flow_after : sample.flow_before;
        const resultUnit = hasCommonUnit && useCommonBasis ? measurementOverride.flow_unit : resultBasis==='after' ? sample.flow_after_unit : sample.flow_before_unit;
        const resultParsed = parseFlow(resultRaw,resultUnit,useCommonValue?'':'S㎥/분');
        const calculated = !basisValid ? {valid:false,error:'유량 보정 기준을 확인해주세요.'}
          : resultParsed.error ? {valid:false,error:resultParsed.error} : dailyFlow(resultParsed.value,resultParsed.unit,hours);
        let resultFlow = calculated.valid ? calculated.value : '';
        const hasManualFlow = own(resultFlows,resultIndex) && text(resultFlows[resultIndex])!=='';
        if (hasManualFlow) {
          const rawResultFlow=resultFlows[resultIndex];
          const parsedResultFlow=['number','string'].includes(typeof rawResultFlow)?number(rawResultFlow):null;
          if (parsedResultFlow===null||!Number.isFinite(parsedResultFlow)) {
            issues.push(`${receipt} ${sourceItem}: 항목별 일일유량을 0 이상의 숫자로 입력해주세요.`);
            resultFlow='';
          } else resultFlow=parsedResultFlow;
        } else {
          if (basisValid&&!calculated.valid) issues.push(`${receipt} ${sourceItem}: ${calculated.error}`);
          if ((hasCommonValue||hasCommonUnit)&&!['before','after'].includes(legacyBasis)&&basis===resultBasis)
            issues.push(`${receipt} ${sourceItem}: 공통유량 기준을 다시 선택해주세요.`);
        }
        return {item:own(resultItems,resultIndex)?text(resultItems[resultIndex]):sourceItem,
          daily_flow:resultFlow,auto_daily_flow:calculated.valid?calculated.value:'',
          flow_basis:basisValid?resultBasis:'',auto_flow_basis:autoBasis,source_correction:sourceCorrection,
          flow_basis_source:explicitBasis?'manual':autoBasis?(oxygenItem(sourceItem)?'analysis':'not_correctable'):legacyBasis?'legacy':'review',
          oxygen_correction:resultBasis==='after'?true:resultBasis==='before'?false:null,
          oxygen_standard:resultBasis==='after'?standard:null,
          value_oxygen_correction:sourceCorrection,value_oxygen_standard:standard,
          source_item:sourceItem,value:text(r.result??r.value),
          unit:text(r.unit)||(text(r.item).match(/\(([^()]+)\)\s*$/)||[])[1]||'',method:text(r.method)};
      });
      if (!results.length) issues.push(`${receipt}: 측정항목이 없습니다.`);
      for (const [resultIndex, r] of results.entries()) {
        const label = r.source_item || `${resultIndex + 1}번째 측정항목`;
        if (!r.item) issues.push(`${receipt} ${label}: 반기보고서 항목 표기명을 입력해주세요.`);
        for (const [key, valueLabel] of [['value', '측정값'], ['unit', '단위'], ['method', '측정방법']])
          if (!r[key]) issues.push(`${receipt} ${label}: ${valueLabel}을 확인해주세요.`);
      }
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
  global.DF_HALFYEAR_MODEL = { build, oxygenSourceVersion, resolveOxygenSnapshot, dailyFlow, parseFlow, flowUnit, halfForDate, reportEligible, reportForm, facilityFor, authorityFromAddress, authorityTitle };
})(window);
