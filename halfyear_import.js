/* Dreamforen half-year client import. Reads source data; never writes company records. */
(function (global) {
  'use strict';
  var VERSION = 1;
  var SEED_URL = 'assets/halfyear_clients_2026.json?v=120372600';
  function clean(value) { return value == null ? '' : String(value).trim(); }
  function normalized(value) {
    return clean(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  }
  function normalizeName(value) {
    return normalized(value).replace(/\(주\)/g, '주식회사').replace(/^주식회사|주식회사$/g, '');
  }
  function parseGrade(value) {
    var str = clean(value);
    if (/^[1-5](?:\s*종)?$/.test(str)) return str.match(/[1-5]/)[0];
    var choices = Array.from(str.matchAll(/\[\s*[■☑✓✔●]\s*\]\s*([1-5])\s*종/g));
    return choices.length === 1 ? choices[0][1] : '';
  }
  function parseFacilityGrade(value) {
    var str = clean(value);
    return /^(?:설치면제|면제)$/.test(str) ? str : parseGrade(value);
  }
  function parseHours(value) {
    if (value == null || clean(value) === '') return null;
    var s = clean(value).replace(/\s*(시간(?:\/일)?|h(?:ours?)?(?:\/day)?)\s*$/i, '');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 24 ? n : null;
  }
  function textCell(sheet, addr) {
    var cell = sheet[addr];
    if (!cell) return {value: '', raw: null, text: '', type: '', formula: null};
    return {value: cell.v == null ? '' : cell.v, raw: cell.v == null ? null : cell.v,
      text: cell.w == null ? clean(cell.v) : String(cell.w), type: cell.t || '', formula: cell.f || null};
  }
  function lastRow(sheet) {
    var ref = sheet['!ref'] || '', m = ref.match(/(?:^|:)[A-Z]+(\d+)$/);
    return m ? Number(m[1]) : Math.max.apply(null, Object.keys(sheet).map(function (s) {
      var n = s.match(/^[A-Z]+(\d+)$/); return n ? Number(n[1]) : 0;
    }));
  }
  function issue(code, message, cell) { return {code: code, message: message, cell: cell || ''}; }
  function parseWorkbook(workbook, options) {
    options = options || {};
    var sheetName = (workbook.SheetNames || Object.keys(workbook.Sheets || {})).find(function (n) {
      return normalized(n) === '거래처db';
    });
    if (!sheetName) throw new Error('엑셀에서 거래처DB 시트를 찾을 수 없습니다.');
    var sheet = workbook.Sheets[sheetName], headers = {};
    'ABCDEFGHIJKLMNOPQRSTUV'.split('').forEach(function (col) { headers[col] = normalized(textCell(sheet, col + '1').value); });
    var expected = {A:'업체명',B:'주소',C:'연락처',D:'대표자',E:'담당자',F:'종별',Q:'지자체'};
    for (var i = 0; i < 5; i++) {
      expected['GHIJK'[i]] = '배출구명' + (i + 1);
      expected['LMNOP'[i]] = '가동시간' + (i + 1);
      expected['RSTUV'[i]] = '종' + (i + 1);
    }
    Object.keys(expected).forEach(function (col) {
      if (headers[col] !== normalized(expected[col])) throw new Error('거래처DB ' + col + '1 열 제목을 확인해 주세요. 필요한 제목: ' + expected[col]);
    });
    var dataset = {version:VERSION, filename:clean(options.filename) || '거래처DB 엑셀', sheet:sheetName,
      sha256:clean(options.sha256), source_headers:expected, companies:[], issues:[]};
    var n = lastRow(sheet);
    for (var row = 2; row <= n; row++) {
      var raw = {}, cols = 'ABCDEFGHIJKLMNOPQRSTUV'.split('');
      cols.forEach(function (col) { raw[col] = textCell(sheet, col + row); });
      if (!cols.some(function (col) { return clean(raw[col].value); })) continue;
      var sourceKey = sheetName + ':' + row;
      var company = {source_key:sourceKey, sheet:sheetName, row:row,
        name:clean(raw.A.value), address:clean(raw.B.value), phone:clean(raw.C.value),
        representative:clean(raw.D.value), manager:clean(raw.E.value), company_class:parseGrade(raw.F.value),
        authority:clean(raw.Q.value), raw:raw, source_cells:{name:'A'+row,address:'B'+row,phone:'C'+row,
          representative:'D'+row,manager:'E'+row,company_class:'F'+row,authority:'Q'+row}, facilities:[],issues:[]};
      if (!company.name) company.issues.push(issue('missing_company_name','업체명이 없습니다.','A'+row));
      if (!company.company_class) company.issues.push(issue('missing_company_class','사업장 종별을 확인해 주세요.','F'+row));
      for (var slot = 0; slot < 5; slot++) {
        var fc = 'GHIJK'[slot], hc = 'LMNOP'[slot], gc = 'RSTUV'[slot];
        if (![fc,hc,gc].some(function (col) {return clean(raw[col].value);})) continue;
        var facility = {source_key:sourceKey+':'+(slot+1),slot:slot+1,name:clean(raw[fc].value),
          hours_per_day:parseHours(raw[hc].value),facility_class:parseFacilityGrade(raw[gc].value),
          raw:{name:raw[fc],hours_per_day:raw[hc],facility_class:raw[gc]},
          source_cells:{name:fc+row,hours_per_day:hc+row,facility_class:gc+row},issues:[]};
        if (!facility.name) facility.issues.push(issue('missing_facility_name','배출구명이 없습니다.',fc+row));
        if (/^(?:미가동|가동중지|휴업|폐업|\d+\s*개\s*[.。…]*)$/.test(facility.name)) {
          facility.issues.push(issue('not_a_facility_name','시설을 식별할 수 없는 설명입니다. 실제 배출구를 확인해 주세요.',fc+row));
        }
        if (facility.hours_per_day === null) facility.issues.push(issue('missing_or_invalid_hours','시설 가동시간을 0~24시간 범위로 확인해 주세요.',hc+row));
        if (!facility.facility_class) facility.issues.push(issue('missing_or_invalid_facility_class',
          clean(raw[gc].value) ? '시설 종별을 확인해 주세요: '+clean(raw[gc].value) : '시설 종별이 비어 있습니다.',gc+row));
        company.facilities.push(facility);
      }
      dataset.companies.push(company);
    }
    var groups = new Map();
    dataset.companies.forEach(function (c) {
      var name = normalizeName(c.name); if (!name) return;
      if (!groups.has(name)) groups.set(name, []); groups.get(name).push(c);
    });
    groups.forEach(function (companies) {
      if (companies.length > 1) companies.forEach(function (c) {
        c.issues.push(issue('duplicate_source_company','엑셀의 같은 업체명 '+companies.map(function (d) {return d.row;}).join(', ')+'행을 비교하고 사용할 행을 선택해 주세요.','A'+c.row));
      });
    });
    dataset.summary = {companies:dataset.companies.length, facilities:0,companies_without_facilities:0,
      duplicate_company_groups:Array.from(groups.values()).filter(function (a) {return a.length>1;}).length,
      missing_hours:0,missing_facility_class:0,invalid_facility_class:0,exempt_facility_class:0};
    dataset.companies.forEach(function (c) {
      if (!c.facilities.length) dataset.summary.companies_without_facilities++;
      c.facilities.forEach(function (f) {
        dataset.summary.facilities++;
        if (f.hours_per_day===null) dataset.summary.missing_hours++;
        if (!clean(f.raw.facility_class.value)) dataset.summary.missing_facility_class++;
        else if (!f.facility_class) dataset.summary.invalid_facility_class++;
        else if (/^(?:설치면제|면제)$/.test(f.facility_class)) dataset.summary.exempt_facility_class++;
      });
    });
    return dataset;
  }
  async function sha256(buffer) {
    if (!global.crypto || !global.crypto.subtle) return '';
    var digest = await global.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(function (x) {return x.toString(16).padStart(2,'0');}).join('');
  }
  async function parseFile(file) {
    if (!file || !/\.(?:xlsx|xlsm|xls)$/i.test(file.name || '')) throw new Error('거래처DB 시트가 있는 엑셀 파일(.xlsx, .xlsm, .xls)을 선택해 주세요.');
    if (file.size > 30*1024*1024) throw new Error('엑셀 파일은 최대 30MB까지 등록할 수 있습니다.');
    if (!global.XLSX || !global.XLSX.read) throw new Error('엑셀 읽기 기능을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    var buffer = await file.arrayBuffer();
    var wb = global.XLSX.read(buffer, {type:'array', cellDates:false, cellFormula:true, cellText:true, bookVBA:false});
    return parseWorkbook(wb,{filename:file.name,sha256:await sha256(buffer)});
  }
  async function loadSeed() {
    var response = await global.fetch(SEED_URL, {cache:'no-store'});
    if (!response.ok) throw new Error('기본 거래처DB 자료를 불러오지 못했습니다. assets/halfyear_clients_2026.json 파일을 확인해 주세요.');
    var data = await response.json();
    if (!data || data.version!==VERSION || !Array.isArray(data.companies)) throw new Error('기본 거래처DB 자료 형식이 올바르지 않습니다.');
    return data;
  }
  function companyId(c) { return clean(c && (c.Id || c.legacy_id || c.id)); }
  function facilityId(f) { return clean(f && (f.Id || f.legacy_id || f.id)); }
  function companyName(c) { return clean(c && (c.Name || c.name)); }
  function facilityName(f) { return clean(f && (f.FacilityName || f.name || f.PreventionFacility || f.EmissionFacility)); }
  function companyFacilities(c) { return ((c && (c.Facilities || c.facilities)) || []).filter(function (f) {return f && !f.Deleted && !f.deleted;}); }
  function onlineId(x) { return clean(x && (x.OnlineId || x.online_id || (x.legacy_id && x.id))); }
  function facilityNames(f) {
    return [f.FacilityName,f.PreventionFacility,f.EmissionFacility,f.name].filter(function (x) {return clean(x);});
  }
  function facilityCode(value) {
    var str = clean(value).normalize('NFKC');
    if (/[배방]\s*[-－–—]?\s*\d+\s*[,~～]/.test(str)) return '';
    var found = Array.from(str.matchAll(/([배방])\s*[-－–—]?\s*(\d+)(?!\d)/g)).map(function (m) {return m[1]+'-'+Number(m[2]);});
    var unique = Array.from(new Set(found)); return unique.length===1 ? unique[0] : '';
  }
  function capacity(value) {
    var s = clean(value).normalize('NFKC').replace(/,/g,'');
    var matches = Array.from(s.matchAll(/(\d+(?:\.\d+)?)\s*(?:CMM|S?m[³3]\s*\/\s*min|S?m[³3]\s*\/\s*분)/gi));
    return matches.length===1 ? Number(matches[0][1]) : null;
  }
  function matchFacility(source, company) {
    var list = companyFacilities(company), sourceName=normalized(source.name);
    var exact = list.filter(function (f) { return facilityNames(f).some(function (v) {return normalized(v)===sourceName;});});
    if (exact.length) return {items:exact,method:'exact_name'};
    var code = facilityCode(source.name), cap = capacity(source.name);
    if (!code || cap===null) return {items:[],method:''};
    var keyed = list.filter(function (f) {
      var names = facilityNames(f), codes = Array.from(new Set(names.map(facilityCode).filter(Boolean)));
      if (codes.length!==1 || codes[0]!==code) return false;
      var caps = names.map(capacity).filter(function (v) {return v!==null;});
      var rawCap=clean(f.Capacity || f.capacity);
      if (/^\d+(?:\.\d+)?$/.test(rawCap)) caps.push(Number(rawCap));
      var uniq = Array.from(new Set(caps)); return uniq.length===1 && uniq[0]===cap;
    });
    return {items:keyed,method:'facility_code_and_capacity'};
  }
  function summarizeRow(row) {
    return {key:row.key,company:row.source_company.name,facility:row.source_facility && row.source_facility.name,
      status:row.status,reason:row.reason};
  }
  function match(dataset, companies, overrides) {
    if (!dataset || !Array.isArray(dataset.companies)) throw new Error('거래처DB 자료가 없습니다.');
    companies = (Array.isArray(companies) ? companies : []).filter(function (c) {return c && !c.Deleted && !c.deleted;});
    overrides = overrides || {};
    var rows=[];
    dataset.companies.forEach(function (sourceCompany) {
      var srcList=sourceCompany.facilities.length ? sourceCompany.facilities : [null];
      srcList.forEach(function (sourceFacility) {
        var key=sourceFacility ? sourceFacility.source_key : sourceCompany.source_key+':company';
        var ov=overrides[key] || {}, row={key:key,source:{filename:dataset.filename,sha256:dataset.sha256,sheet:sourceCompany.sheet||dataset.sheet,row:sourceCompany.row,source_key:key},source_company:sourceCompany,source_facility:sourceFacility,
          company_id:'',facility_id:'',company_online_id:'',facility_online_id:'',status:'unmatched',reason:'',
          match_method:'',candidates:{companies:[],facilities:[]},issues:(sourceCompany.issues||[]).concat(sourceFacility && sourceFacility.issues || [])};
        rows.push(row);
        if (ov.skip) {row.status='skipped';row.reason='사용자가 제외한 행';return;}
        var named=companies.filter(function (c) {return normalizeName(companyName(c))===normalizeName(sourceCompany.name);});
        row.candidates.companies=named.map(function (c) {return {id:companyId(c),name:companyName(c)};});
        var target=null;
        if (ov.company_id) {
          var byId=companies.filter(function (c) {return companyId(c)===clean(ov.company_id);});
          if (byId.length!==1) {row.status='review';row.reason='선택한 업체가 없거나 업체 식별자가 중복되었습니다.';return;}
          target=byId[0];
        } else {
          if (!sourceCompany.name || named.length!==1) {
            row.status=named.length>1?'review':'unmatched';row.reason=named.length>1?'같은 이름의 업체가 여러 개입니다. 업체를 선택해 주세요.':'업체를 직접 선택해 주세요.';return;
          }
          if ((sourceCompany.issues||[]).some(function (i) {return i.code==='duplicate_source_company';})) {
            row.status='review';row.reason='엑셀 중복 업체행을 확인하고 사용할 행을 선택해 주세요.';return;
          }
          target=named[0];
        }
        row.company_id=companyId(target);row.company_online_id=onlineId(target);
        var fList=companyFacilities(target);
        row.candidates.facilities=fList.map(function (f) {return {id:facilityId(f),name:facilityName(f)};});
        if (!sourceFacility) {row.status='review';row.reason='엑셀에 시설 자료가 없습니다.';return;}
        if (!row.company_id) {row.status='review';row.reason='업체 식별자가 없습니다.';return;}
        var targetFacility=null;
        if (ov.facility_id) {
          var explicit=fList.filter(function (f) {return facilityId(f)===clean(ov.facility_id);});
          if (explicit.length!==1) {row.status='review';row.reason='선택한 시설이 해당 업체에 없거나 식별자가 중복되었습니다.';return;}
          targetFacility=explicit[0];row.match_method='manual';
        } else {
          if ((sourceFacility.issues||[]).some(function (i) {return i.code==='not_a_facility_name'||i.code==='missing_facility_name';})) {
            row.status='review';row.reason='시설 설명을 확인하고 실제 배출구를 선택해 주세요.';return;
          }
          var matched=matchFacility(sourceFacility,target);
          if (matched.items.length!==1) {row.status=matched.items.length>1?'review':'unmatched';
            row.reason=matched.items.length>1?'시설명이 중복됩니다. 배출구를 선택해 주세요.':'일치하는 배출구를 확인해 선택해 주세요.';return;}
          targetFacility=matched.items[0];row.match_method=matched.method;
        }
        row.facility_id=facilityId(targetFacility);row.facility_online_id=onlineId(targetFacility);
        if (!row.facility_id) {row.status='review';row.reason='시설 식별자가 없습니다.';return;}
        row.status='matched';row.reason=row.match_method==='manual'?'직접 연결 확인':'업체와 시설 연결 확인';
      });
    });
    // Never let two spreadsheet positions silently overwrite the same live facility.
    var targets=new Map();
    rows.filter(function (r) {return r.status==='matched';}).forEach(function (r) {
      var key=r.company_id+'\u0000'+r.facility_id;if(!targets.has(key))targets.set(key,[]);targets.get(key).push(r);
    });
    targets.forEach(function (list) {
      if(list.length<2)return;
      list.forEach(function(r){r.status='review';r.reason='여러 엑셀 행이 같은 시설에 연결됩니다. 적용할 한 행을 선택하고 나머지는 제외해 주세요.';
        r.issues.push(issue('duplicate_target_facility',r.reason));});
    });
    var counts={total:rows.length,matched:0,review:0,unmatched:0,skipped:0};
    rows.forEach(function(r){counts[r.status]++;});
    return {rows:rows,counts:counts,issues:rows.filter(function(r){return r.status==='review'||r.status==='unmatched';}).map(summarizeRow)};
  }
  global.DF_HALFYEAR_IMPORT = {version:VERSION,parseWorkbook:parseWorkbook,parseFile:parseFile,loadSeed:loadSeed,
    match:match,normalizeName:normalizeName,parseGrade:parseGrade,parseFacilityGrade:parseFacilityGrade,parseHours:parseHours,
    facilityCode:facilityCode,capacity:capacity};
})(typeof window !== 'undefined' ? window : globalThis);
