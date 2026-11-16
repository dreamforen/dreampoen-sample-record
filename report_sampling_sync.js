/* Refresh only values whose source is the online sampling record. */
(function(global){
  'use strict';
  const specs=Object.freeze({
    weather:'날씨',temperature:'기온',humidity:'습도',pressure:'기압',wind_direction:'풍향',wind_speed:'풍속',
    standard_oxygen:'표준산소농도',measured_oxygen:'실측산소농도',flow_before:'유량(보정 전)',flow_after:'유량(보정 후)',
    moisture:'수분량',gas_temperature:'배출가스온도',gas_velocity:'배출가스 유속',date:'채취일',time:'채취시간',samplers:'시료채취자'
  }),has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),keys=Object.keys(specs);
  const numeric=new Set(['temperature','humidity','pressure','wind_speed','standard_oxygen','measured_oxygen','flow_before','flow_after','moisture','gas_temperature','gas_velocity']);
  const flows=new Set(['flow_before','flow_after']),unit='S㎥/분';
  const clean=v=>String(v??'').trim(),fixed=(v,d)=>Number.isFinite(v)?v.toFixed(d):'';
  function date(value){const m=clean(value).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';}
  function time(value){
    const raw=clean(value),m=raw.match(/^(\d{1,2})(?::(\d{2})(?::(\d{2}))?|\s*시\s*(\d{1,2})\s*분)$/);
    if(m&&+m[1]<24&&+(m[2]||m[4])<60&&(!m[3]||+m[3]<60))return m[1].padStart(2,'0')+':'+(m[2]||m[4]).padStart(2,'0')+(m[3]?':'+m[3]:'');
    if(/^\d{3,4}$/.test(raw)){const s=raw.padStart(4,'0');if(+s.slice(0,2)<24&&+s.slice(2)<60)return s.slice(0,2)+':'+s.slice(2);}
    return raw;
  }
  function snapshot(source){
    const record=source?.measurement_data?.data,f=record?.fields;
    if(!f)return {};
    const result={},synced={weather:'weather',temperature:'airTemp',humidity:'humidity',wind_direction:'windDir',wind_speed:'windSpeed',standard_oxygen:'stdO2'};
    for(const [key,name] of Object.entries(synced))if(has(f,name))result[key]=clean(f[name]);
    if(has(f,'measureDate')||source.measure_date)result.date=date(f.measureDate)||date(source.measure_date);
    if(['totalStart','totalEnd','particleStart','particleEnd'].some(k=>has(f,k)))result.time=[time(f.totalStart||f.particleStart),time(f.totalEnd||f.particleEnd)].filter(Boolean).join(' ~ ');
    if(['manager1','manager2'].some(k=>has(f,k)))result.samplers=[clean(f.manager1),clean(f.manager2)].filter(Boolean);
    const saved=global.DF_SAMPLE_STACK_METRICS.fromSaved(record),m=saved?.metrics;
    if(!m)return result;
    if(has(f,'locationPressure')||has(f,'pressure'))result.pressure=m.pa>0?fixed(m.pa,0):'';
    if(Array.isArray(record.o2vals))result.measured_oxygen=fixed(m.o2,1);
    if(Array.isArray(record.moist)||record.moistureMethod==='absorption')result.moisture=saved.moistureKnown?fixed(m.moist,1):'';
    if(saved.hasPoints){
      result.gas_temperature=saved.hasTemperature?fixed(m.avgs.temp,1):'';
      result.gas_velocity=saved.velocityKnown?fixed(m.velocity,2):'';
      result.flow_before=saved.flowKnown?fixed(m.flow,1):'';
      result.flow_after=saved.flowKnown&&m.oxygenCorrection?fixed(m.correctedFlow,1):'';
    }
    return result;
  }
  function comparable(key,value){
    if(key==='samplers')return Array.isArray(value)?value.map(clean).filter(Boolean).join('\n'):clean(value).split(/[,;\n]/).map(clean).filter(Boolean).join('\n');
    if(key==='date')return date(value);
    if(key==='time')return clean(value).replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}\s+/g,'').replace(/\s+/g,'');
    const v=clean(value);if(!numeric.has(key)||!v)return v;
    const n=v.match(/^([+-]?\d+(?:\.\d+)?|[+-]?\.\d+)(?:\s*(?:%|℃|°C|mmHg|m\/s|S(?:㎥|m3|m³)\/(?:분|min)))?$/i);
    return n?String(Number(n[1])):v;
  }
  function hourly(value){return /\/\s*(?:h|hr|hour|시간)\s*$/i.test(clean(value));}
  function differs(key,sampling,value){
    return comparable(key,sampling[key])!==comparable(key,value)||flows.has(key)&&hourly(sampling[key+'_unit']);
  }
  function markManual(form,key){
    if(form.report_mode==='reference'||!has(specs,key))return;
    (form.sample_field_origins||(form.sample_field_origins={}))[key]='manual';
    if(flows.has(key))form.sampling[key+'_unit']=unit;
  }
  function apply(form,values,reset=false){
    if(form.report_mode==='reference')return [];
    const sampling=form.sampling||(form.sampling={}),origins=form.sample_field_origins||(form.sample_field_origins={}),changes=[];
    for(const key of keys){
      if(!has(values,key))continue;
      if(origins[key]==='manual'&&!reset)continue;
      if(reset)delete origins[key];
      if(differs(key,sampling,values[key]))changes.push({key,before:sampling[key],after:values[key]});
      sampling[key]=values[key];
      if(flows.has(key))sampling[key+'_unit']=unit;
    }
    return changes;
  }
  function pending(form,values,file){
    if(form.report_mode==='reference')return [];
    const sampling=form.sampling||{},origins=form.sample_field_origins||{},printed=file?.file_role==='generated'?file.form_snapshot?.sampling:null;
    return keys.filter(key=>{
      if(has(values,key)&&origins[key]!=='manual'&&differs(key,sampling,values[key]))return true;
      return printed&&has(values,key)&&(comparable(key,printed[key])!==comparable(key,sampling[key])||flows.has(key)&&hourly(printed[key+'_unit'])!==hourly(sampling[key+'_unit']));
    });
  }
  global.DF_REPORT_SAMPLING=Object.freeze({specs,snapshot,apply,markManual,pending});
})(window);
