/* Resolve report dimensions from the saved sample and its own facility only. */
(function(global){
  'use strict';
  const keys=['height','diameter'],labels={height:'굴뚝 높이',diameter:'내경·단면 치수'};
  const clean=value=>String(value??'').trim();
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const sampleFields=row=>row?.measurement_data?.data?.fields||{};
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const nameKey=value=>clean(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[‐‑–—]/g,'-');
  function length(value){
    const m=clean(value).match(/^(\d+(?:\.\d*)?|\.\d+)\s*(?:m)?$/i);
    return m&&Number.isFinite(Number(m[1]))&&Number(m[1])>0?m[1]:'';
  }
  function shape(value){
    const key=clean(value).toLowerCase();
    return /^(round|원형)$/.test(key)?'round':/^(rect|사각형|사각)$/.test(key)?'rect':'';
  }
  function section(kind,diameter,w,h){
    const d=length(diameter),width=length(w),depth=length(h);
    if(kind==='round')return d;
    if(kind==='rect')return width&&depth?width+' × '+depth:'';
    return '';
  }
  function sameNumber(a,b){
    const numbers=value=>clean(value).replace(/\s*m\s*$/i,'').split(/[×xX]/).map(length);
    const x=numbers(a),y=numbers(b);
    return clean(a)===clean(b)||x.length===y.length&&x.every((n,i)=>n&&y[i]&&Number(n)===Number(y[i]));
  }
  async function loadFacility(db,source,company){
    const f=sampleFields(source),sourceCompany=clean(source.company_id||f.companyDbId);
    // A legacy company ID must first resolve to the same current UUID. Never search other companies by facility name.
    const companyId=clean(company?.OnlineId||company?.Id||sourceCompany);
    if(!uuid.test(companyId))return null;
    const id=clean(source.facility_id||f.facilityDbId),name=nameKey(source.facility_name||f.facility);
    if(id){
      const {data,error}=await db.from('facilities').select('id,legacy_id,stack_height,stack_shape,diameter,stack_w,stack_h').eq('company_id',companyId).eq(uuid.test(id)?'id':'legacy_id',id).maybeSingle();
      if(error)throw error;
      return data||null;
    }
    if(!name)return null;
    const hits=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await db.from('facilities').select('*').eq('company_id',companyId).order('id').range(offset,offset+499);
      if(error)throw error;
      const rows=data||[];
      for(const row of rows){
        const names=row.extra_data?.FormerFacilityNames;
        if([row.name,row.facility_name,row.prevention_facility,...(Array.isArray(names)?names:[])].some(value=>nameKey(value)===name))hits.push(row);
      }
      if(hits.length>1)return null;
      if(rows.length<500)return hits[0]||null;
    }
  }
  function snapshot(source,facility){
    const f=sampleFields(source),fromSample=['stackShape','diameter','stackW','stackH'].some(key=>own(f,key));
    let kind=shape(f.stackShape),diameter=null,height=null,dimensionsFrom='';
    if(fromSample){
      // Older records may contain dimensions without a shape selector. Only infer if exactly one shape is represented.
      if(!own(f,'stackShape')){
        const circular=!!length(f.diameter),rectangular=!!(length(f.stackW)&&length(f.stackH));
        if(circular!==rectangular)kind=circular?'round':'rect';
      }
      diameter=section(kind,f.diameter,f.stackW,f.stackH);dimensionsFrom='채취기록';
    }else if(facility){
      kind=shape(facility.stack_shape);
      diameter=section(kind,facility.diameter,facility.stack_w??facility.stack_width,facility.stack_h);dimensionsFrom='업체현황';
    }
    // stackH is a rectangular cross-section dimension; it is never the stack height.
    const measuredHeight=length(f.stackHeight);
    if(measuredHeight)height=measuredHeight;
    else if(facility)height=length(facility.stack_height);
    return {facility,height,diameter,from:{height:measuredHeight?'채취기록':facility?'업체현황':'',diameter:dimensionsFrom}};
  }
  function apply(form,confirmed){
    const changes=[];
    if(form.report_mode==='reference'||!confirmed)return changes;
    const origins=form.stack_geometry_origins||(form.stack_geometry_origins={});
    for(const key of keys){
      const next=confirmed[key];
      if(origins[key]?.mode==='manual')continue;
      if(next===null){
        // Without an exact linked source there is no authority to replace a saved number.
        delete origins[key];continue;
      }
      const prior=clean(form.request[key]);
      if(!sameNumber(prior,next))changes.push({key,prior,next});
      form.request[key]=next;
      origins[key]={mode:'auto',source:confirmed.from[key]};
    }
    return changes;
  }
  function markManual(form,key){
    if(form.report_mode==='reference'||!keys.includes(key))return;
    (form.stack_geometry_origins||(form.stack_geometry_origins={}))[key]={mode:'manual'};
  }
  function pending(form,confirmed,file){
    const request=form.request||{},origins=form.stack_geometry_origins||{};
    return keys.filter(key=>{
      if(confirmed&&confirmed[key]!==null&&origins[key]?.mode!=='manual'&&!sameNumber(request[key],confirmed[key]))return true;
      // Only generated files have an authoritative web snapshot of the printed values.
      return !!(file?.file_role==='generated'&&file.form_snapshot?.request&&!sameNumber(request[key],file.form_snapshot.request[key]));
    });
  }
  global.DF_REPORT_GEOMETRY=Object.freeze({keys,labels,loadFacility,snapshot,apply,markManual,pending});
})(window);
