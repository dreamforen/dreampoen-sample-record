/* Beta 3.30 · compare editable values, preserve unrelated concurrent changes. */
(function(){'use strict';
 const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const equal=(a,b)=>JSON.stringify(stable(a??null))===JSON.stringify(stable(b??null));
 const labels={extra_data:'추가 정보',name:'업체명',address:'주소',biz_no:'사업자번호',representative:'대표자',environment_manager:'환경기술인',phone:'연락처',email:'이메일',industry:'업종',grade:'사업장 종',cycle:'측정주기',measurement_items:'측정항목',measurement_history:'측정이력',tracking:'월별 측정일',active:'사용 상태',ManualMeasurementDates:'수동 측정일',MeasurementMatchKeys:'측정자료 연결',FacilityMasterSource:'시설 기준',PreventionFacility:'방지시설',EmissionFacility:'배출시설',StackHeight:'굴뚝높이',Item:'항목',prevention_facility:'방지시설명',emission_facility:'배출시설명',capacity:'시설 용량',stack_height:'굴뚝높이',items:'시설 측정항목',item_cycles:'시설 항목별 주기',stack_shape:'굴뚝 형태',diameter:'직경',stack_w:'가로',stack_h:'세로',dimension_raw:'규격',memo:'시설 메모',Source:'자료 출처'};
 function conflict(paths){const e=Error('같은 항목이 다른 곳에서 수정되었습니다. 충돌 항목: '+[...new Set(paths.map(p=>p.split('.').map(k=>labels[k]||k).join(' · ')))].join(', ')+'\n입력한 내용은 유지됩니다. 최신 업체 정보를 확인한 뒤 해당 항목을 다시 수정해주세요.');e.code='DF_COMPANY_CONFLICT';return e;}
 function merge(base,current,draft,path='',conflicts=[]){
  if(equal(draft,base)||equal(draft,current))return clone(current);
  if(equal(current,base))return clone(draft);
  if(object(base)&&object(current)&&object(draft)){const out=clone(current);for(const k of new Set([...Object.keys(base),...Object.keys(draft)])){if(k==='UpdatedAt')continue;const v=merge(base[k],current[k],draft[k],path?path+'.'+k:k,conflicts);if(v===undefined)delete out[k];else out[k]=v;}return out;}
  conflicts.push(path);return clone(current);
 }
 function companyModel(r){const x=r.extra_data||{};return companyEnsureFields({Id:r.legacy_id||r.id,OnlineId:r.id,Name:r.name||'',Address:r.address||'',BizNo:r.biz_no||'',Representative:r.representative||'',EnvironmentManager:r.environment_manager||'',Phone:r.phone||'',Email:r.email||'',Industry:r.industry||'',Grade:r.grade||'',Cycle:r.cycle||'',MeasurementItems:r.measurement_items||[],MeasurementHistory:r.measurement_history||[],Tracking:clone(r.tracking||{}),Active:r.active!==false,PreventionFacility:x.PreventionFacility||'',EmissionFacility:x.EmissionFacility||'',StackHeight:x.StackHeight||'',Item:x.Item||'',FacilityMasterSource:x.FacilityMasterSource||'',ManualMeasurementDates:Array.isArray(x.ManualMeasurementDates)?clone(x.ManualMeasurementDates):undefined,MeasurementMatchKeys:Array.isArray(x.MeasurementMatchKeys)?clone(x.MeasurementMatchKeys):[],UpdatedAt:r.updated_at||''});}
 function companyRow(r){const c=companyModel(r),row=dfV68CompanyRow(c);delete row.extra_data.UpdatedAt;return row;}
 function facilityModel(r){return {Id:r.legacy_id||r.id,OnlineId:r.id,FacilityName:r.facility_name||r.name||'',PreventionFacility:r.prevention_facility||r.facility_name||r.name||'',EmissionFacility:r.emission_facility||'',Capacity:r.capacity??'',StackHeight:r.stack_height??'',Cycle:r.cycle||'',Items:clone(r.items||[]),ItemCycles:dfV95NormalizeItemCycles(r.item_cycles,r.items,r.cycle),StackShape:r.stack_shape||'',Diameter:r.diameter??'',StackW:(r.stack_w??r.stack_width)??'',StackH:r.stack_h??'',DimensionRaw:r.dimension_raw||'',MeasurementHistory:clone(r.measurement_history||[]),Memo:r.memo||'',ManualMeasurementDates:Array.isArray(r.extra_data?.ManualMeasurementDates)?clone(r.extra_data.ManualMeasurementDates):undefined,Source:r.extra_data?.Source||r.extra_data?.migration_source||''};}
 const facilityRow=r=>dfV68FacilityRow(facilityModel(r),r.company_id);
 function capture(c){if(!c||c.ContractOnly||!c.OnlineId)return c;if(!c._loadedCompanyRow){const r=dfV68CompanyRow(c);delete r.extra_data.UpdatedAt;c._loadedCompanyRow=clone(r);}if(!Array.isArray(c._loadedFacilityRows))c._loadedFacilityRows=(c.Facilities||[]).map(f=>({...dfV68FacilityRow(f,c.OnlineId),id:f.OnlineId||null}));return c;}
 function track(c,row,facilities){c._loadedUpdatedAt=row.updated_at;c.UpdatedAt=row.updated_at;c._loadedCompanyRow=companyRow(row);c._loadedFacilityRows=clone(facilities);return c;}
 function patch(current,desired){const out={};for(const k of Object.keys(desired)){if(k==='legacy_id'||k==='company_id')continue;if(!equal(current[k],desired[k]))out[k]=clone(desired[k]);}return out;}
 function prepare(c,current,models){const wanted=dfV68CompanyRow(c);delete wanted.extra_data.UpdatedAt;if(!current)return {payload:dfV68CompanyRow(c),patch:dfV68CompanyRow(c)};
  const base=c._loadedCompanyRow;
  if(!base){if(!c._loadedUpdatedAt||c._loadedUpdatedAt!==current.updated_at)throw conflict(['기준자료 확인 필요']);const full=dfV68CompanyRow(c);full.legacy_id=current.legacy_id;full.extra_data={...clone(current.extra_data||{}),...full.extra_data};return {payload:full,patch:patch(current,full)};}
  const now=companyRow(current),errors=[];let summary=null;
  if(c._facilityDerived&&models){const v={};companyFacilityRebuildCompany(v,clone(models));summary=dfV68CompanyRow(v);for(const k of ['measurement_items','cycle'])wanted[k]=clone(base[k]);for(const k of ['PreventionFacility','EmissionFacility','Item'])wanted.extra_data[k]=clone(base.extra_data?.[k]);}
  const desired=merge(base,now,wanted,'',errors);if(errors.length)throw conflict(errors);
  if(summary){for(const k of ['measurement_items','cycle'])desired[k]=summary[k];for(const k of ['PreventionFacility','EmissionFacility','Item'])desired.extra_data[k]=summary.extra_data[k];}
  desired.legacy_id=current.legacy_id;const change=patch(now,desired);desired.extra_data={...clone(current.extra_data||{}),...desired.extra_data};if(change.extra_data)change.extra_data=clone(desired.extra_data);
  return {payload:desired,patch:change};
 }
 function facilities(c,owned){
  const bases=c._loadedFacilityRows||[];if(!Array.isArray(c._loadedFacilityRows)&&owned.length)throw conflict(['시설 기준자료 확인 필요']);
  const seen=new Set(),keep=new Set(),updates=[],inserts=[],conflicts=[],models=[],requested=Array.isArray(c.Facilities)?c.Facilities:[];
  for(const f of requested){if(!f.Id)f.Id=String(c.Id)+'-fac-'+crypto.randomUUID();if(seen.has(String(f.Id)))throw Error('시설 ID가 중복되어 저장하지 않았습니다.');seen.add(String(f.Id));
   const old=f.OnlineId?owned.find(r=>r.id===f.OnlineId):owned.find(r=>String(r.legacy_id||r.id)===String(f.Id));let base=f.OnlineId?bases.find(r=>r.id===f.OnlineId):bases.find(r=>String(r.legacy_id||r.id)===String(f.Id));
   if(!old&&base){if(!equal(facilityRow(base),dfV68FacilityRow(f,c.OnlineId)))conflicts.push((f.FacilityName||'시설')+'.삭제된 시설');continue;}
   if(f.OnlineId&&!old&&!base)throw Error('기존 시설이 삭제되었거나 다른 업체에 속합니다. 새로고침해주세요.');
   const row=dfV68FacilityRow(f,c.OnlineId);if(old&&!base&&!f.OnlineId&&equal(facilityRow(old),row))base=old; // A lost insert response can be verified by the stable ID and identical values.
   if(old){keep.add(old.id);if(!base)throw conflict([(f.FacilityName||'시설')+'.시설 기준자료 확인 필요']);const now=facilityRow(old),desired=merge(facilityRow(base),now,row,f.FacilityName||'시설',conflicts);desired.legacy_id=old.legacy_id;const change=patch(now,desired);desired.extra_data={...clone(old.extra_data||{}),...desired.extra_data};if(change.extra_data)change.extra_data=clone(desired.extra_data);if(Object.keys(change).length)updates.push({f,old,row:change,desired});models.push(facilityModel({...old,...desired}));}else{inserts.push({f,row});models.push(f);}
  }
  const remove=owned.filter(r=>!keep.has(r.id)&&bases.some(b=>b.id===r.id||String(b.legacy_id||b.id)===String(r.legacy_id||r.id)));
  for(const r of remove){const b=bases.find(x=>x.id===r.id||String(x.legacy_id||x.id)===String(r.legacy_id||r.id));if(!equal(facilityRow(b),facilityRow(r)))conflicts.push((r.name||'시설')+'.삭제 전 다른 수정');}
  for(const r of owned)if(!keep.has(r.id)&&!remove.includes(r))models.push(facilityModel(r));
  if(conflicts.length)throw conflict(conflicts);return {updates,inserts,remove,models};
 }
 function conditional(query,row,keys){for(const k of keys){if(k==='id'||k==='company_id')continue;const v=row[k];query=v==null?query.is(k,null):query.eq(k,typeof v==='object'?JSON.stringify(v):v);}return query;}
 function companySaved(c,row){const model=companyModel(row);for(const k of ['Name','Address','BizNo','Representative','EnvironmentManager','Phone','Email','Industry','Grade','Cycle','MeasurementItems','MeasurementHistory','Tracking','Active','PreventionFacility','EmissionFacility','StackHeight','Item','FacilityMasterSource','ManualMeasurementDates','MeasurementMatchKeys']){if(model[k]===undefined)delete c[k];else c[k]=clone(model[k]);}c.OnlineId=row.id;c._loadedUpdatedAt=row.updated_at;c.UpdatedAt=row.updated_at;c._loadedCompanyRow=companyRow(row);return c;}
 function facilitySaved(c,f,row){if(!row?.id)throw Error('시설 저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다.');Object.assign(f,facilityModel(row));const a=c._loadedFacilityRows||(c._loadedFacilityRows=[]),i=a.findIndex(x=>x.id===row.id);if(i<0)a.push(clone(row));else a[i]=clone(row);}
 function finish(c,row,rows){companySaved(c,row);c.Facilities=rows.map(facilityModel);track(c,row,rows);delete c._facilityDerived;return c;}
 function lock(){const controls=[...document.querySelectorAll('#companyModal input,#companyModal select,#companyModal textarea,#companyModal button')],values=controls.map(x=>x.disabled);controls.forEach(x=>x.disabled=true);return ()=>controls.forEach((x,i)=>x.disabled=values[i]);}
 window.DFCompanySaveGuard=Object.freeze({version:'Beta 3.30',equal,merge,conflict,capture,track,prepare,facilities,conditional,finish,companySaved,facilitySaved,lock,companyRow,facilityRow});
})();
