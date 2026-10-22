/* Beta 3.37 · compare numeric values and review actual overlapping edits. */
(function(root){'use strict';
 const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const numericFields=new Set(['absPm','pitot','stdO2','stackH','stackW','absFlow','absTmIn','airTemp','absTmOut','diameter','humidity','nozzleCm','pressure','absVolume','meterBefore','nozzleOther','absWeightAfter','absWeightBefore','windSpeed','locationPressure']);
 const pointField=/^(points|comboDustPoints|comboMetalPoints)\.\d+\.(time|temp|static|dynamic|vacuum|holder|meterIn|meterOut|impinger|volume)$/;
 function numeric(value){
  const raw=String(value).trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))return value;
  const negative=raw[0]==='-',parts=raw.replace(/^[+-]/,'').split('.');
  const whole=(parts[0]||'0').replace(/^0+(?=\d)/,''),fraction=(parts[1]||'').replace(/0+$/,'');
  return (negative&&(whole!=='0'||fraction)?'-':'')+whole+(fraction?'.'+fraction:'');
 }
 function ordered(value,path=''){
  if(Array.isArray(value))return value.map((item,index)=>ordered(item,path?path+'.'+index:String(index)));
  if(object(value))return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,ordered(value[key],path?path+'.'+key:key)]));
  if(value!==null&&value!==undefined&&String(value).trim()!==''&&(pointField.test(path)||/^fields\.[^.]+$/.test(path)&&numericFields.has(path.slice(7))||/^(moist|o2vals|co2vals)\.\d+$/.test(path)))return numeric(value);
  return value;
 }
 const equal=(a,b,path='')=>JSON.stringify(ordered(a,path))===JSON.stringify(ordered(b,path));
 const text=value=>String(value??'').trim();
 const labels={gasRows:'가스 항목·채취시간',fields:'기록지',points:'측정점',metalItems:'중금속 항목',recordType:'기록 종류',selectedTeam:'팀',moist:'수분',o2vals:'산소',co2vals:'이산화탄소',comboDustPoints:'먼지 측정점',comboMetalPoints:'중금속 측정점',company:'업체명',companyDbId:'업체 연결',facility:'시설명',facilityDbId:'시설 연결',receiptNo:'접수번호',measureDate:'측정일',filterNo:'여지번호'};
 function error(message,code='DF_SAMPLE_CONFLICT'){const e=Error(message);e.code=code;return e;}
 Object.assign(labels,{vacuum:'진공압',meterBefore:'적산유량계 시작값',temp:'온도',time:'시간',static:'정압',dynamic:'동압',volume:'채취량',holder:'여지홀더 온도',meterIn:'미터 입구온도',meterOut:'미터 출구온도',impinger:'임핀저 온도'});
 const label=path=>path.split('.').map(key=>/^\d+$/.test(key)?(Number(key)+1)+'번':labels[key]||key).join(' · ');
 function merge(base,current,draft,path='',conflicts=[],options={}){
  if(equal(draft,base,path)||equal(draft,current,path))return copy(current);
  if(equal(current,base,path))return copy(draft);
  if(options.indexedPoints&&/^(points|comboDustPoints|comboMetalPoints)$/.test(path)&&[base,current,draft].every(Array.isArray)&&base.length===current.length&&base.length===draft.length&&[base,current,draft].every(rows=>rows.every(object)))return base.map((item,index)=>merge(item,current[index],draft[index],path+'.'+index,conflicts,options));
  if(object(base)&&object(current)&&object(draft)){
   const out=copy(current);
   for(const key of new Set([...Object.keys(base),...Object.keys(draft)])){
    // Legacy collect() includes controls from unrelated menus. Keep their server
    // values; they are not edits to the sampling record.
    if(path==='fields'&&(/^(df(?!Rect)|qpf|qif|qic|schedule|analysisRecord)/.test(key)||['companySearch','companyTrackYear','navigationCompanySearch','analysisTodayOnly','contractYear','contractSearch','contractStatus'].includes(key)))continue;
    const value=merge(base[key],current[key],draft[key],path?path+'.'+key:key,conflicts,options);
    if(value===undefined)delete out[key];else out[key]=value;
   }
   return out;
  }
  if(options.resolutions&&Object.hasOwn(options.resolutions,path)){
   if(options.resolutions[path]==='draft')return copy(draft);
   if(options.resolutions[path]==='server')return copy(current);
  }
  conflicts.push(path);return copy(current);
 }
 function data(row){
  const record=row?.measurement_data;
  if(row?._dfSummary||record?._dfSummary||!object(record?.data))throw error('전체 저장 원본을 확인할 수 없습니다. 자료실에서 원본을 열어주세요.','DF_SAMPLE_BASE_REQUIRED');
  const out=copy(record.data),fields=out.fields||(out.fields={});
  if(!object(fields))throw error('기록지 항목 구조를 확인할 수 없습니다. 현재 입력을 백업해주세요.','DF_SAMPLE_BASE_REQUIRED');
  for(const [key,value] of Object.entries({receiptNo:row.receipt_no,measureDate:row.measure_date,company:row.company_name,facility:row.facility_name}))if(!fields[key])fields[key]=value||'';
  if(!out.recordType)out.recordType=row.record_type;
  return out;
 }
 function validate(row,draft,no){
  if(row.hidden===true||[row.measurement_data?.deleted,row.measurement_data?._deleted].some(value=>/^(true|t|1|yes)$/i.test(text(value))))throw error('삭제되었거나 숨김 처리된 자료입니다. 미전송 내용을 보관하고 관리자에게 확인해주세요.','DF_SAMPLE_INACTIVE');
  if(!object(draft?.data)||draft._dfSummary||!text(draft.id)||text(draft.data.fields?.receiptNo)!==no||text(row.receipt_no)!==no)throw error('저장 원본의 접수번호를 확인할 수 없습니다. 현재 입력을 백업해주세요.','DF_SAMPLE_IDENTITY');
  if(text(row.measurement_data?.id)&&text(row.measurement_data.id)!==text(draft.id))throw error('같은 접수번호에 다른 기록이 연결되어 있습니다. 미전송 내용은 보관했습니다.','DF_SAMPLE_IDENTITY');
  const inner=text(row.measurement_data?.data?.fields?.receiptNo);
  if(inner&&inner!==no)throw error('서버 원본의 접수번호 연결이 다릅니다. 미전송 내용은 보관했습니다.','DF_SAMPLE_IDENTITY');
 }
 function prepare(base,row,draft,no,now,options={}){
  validate(row,draft,no);
  const current=data(row);let prior;
  if(equal(current,draft.data))return {record:copy(row.measurement_data),changed:false};
  // A manual save carries its immediate previous confirmed data as backup.
  // It also makes consecutive saves safe when the first request is still in flight.
  if(object(draft.backup)&&equal(current,draft.backup))prior=current;
  else if(base){
   validate(base,draft,no);prior=data(base);
  }else throw error('수정 기준 원본이 없어 자동으로 합칠 수 없습니다. 미전송 내용을 백업한 뒤 자료실에서 최신 원본을 열어주세요.','DF_SAMPLE_BASE_REQUIRED');
  const layout=value=>({recordType:value.recordType,selectedTeam:value.selectedTeam,manualPointCount:value.manualPointCount,comboParticleMode:value.comboParticleMode,fields:Object.fromEntries(['stackShape','diameter','stackW','stackH','dfRectDirection','dfRectLine','dfRectSymmetry'].map(key=>[key,value.fields?.[key]]))});
  const indexedPoints=equal(layout(prior),layout(current))&&equal(layout(prior),layout(draft.data));
  const conflicts=[],merged=merge(prior,current,draft.data,'',conflicts,{indexedPoints,resolutions:options.resolutions});
  if(conflicts.length){
   if(conflicts.some(path=>/^(points|comboDustPoints|comboMetalPoints)$/.test(path)))throw error('측정점의 개수나 배치가 서로 다르게 변경되었습니다. 입력을 백업한 뒤 자료실에서 최신 원본을 열어 배치를 확인해주세요.','DF_SAMPLE_LAYOUT');
   const paths=[...new Set(conflicts.map(label))];
   const e=error('같은 항목이 다른 곳에서도 수정되어 저장을 보류했습니다. 확인할 항목: '+paths.join(', ')+'\n현재 입력과 미전송 내용은 유지됩니다. 자료실의 저장 상태에서 이 내용을 백업한 뒤 최신 자료와 비교해주세요.');
   e.paths=conflicts;e.report={receipt:no,paths:conflicts,base:copy(prior),server:copy(current),draft:copy(draft.data)};throw e;
  }
  const record={...copy(row.measurement_data),id:row.measurement_data.id||draft.id,data:merged,updatedAt:now,autosavedAt:now,autosaveData:copy(merged),backup:copy(current),backupAt:row.measurement_data.updatedAt||row.measurement_updated_at||row.updated_at};
  return {record,changed:!equal(current,merged)};
 }
 const get=(value,path)=>path.split('.').reduce((item,key)=>item&&Object.hasOwn(item,key)?item[key]:undefined,value);
 const api=Object.freeze({version:'Beta 3.37',equal,merge,prepare,label,get,data});
 if(typeof module==='object'&&module.exports)module.exports=api;else root.DF_SAMPLE_SAVE_MODEL=api;
})(typeof window==='undefined'?globalThis:window);
