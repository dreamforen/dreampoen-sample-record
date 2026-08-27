const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=(n,d=2)=>Number.isFinite(n)?Number(n).toFixed(d):'-';
const num=id=>parseFloat($(id)?.value)||0;
let recordType='dust';
let selectedTeam='2';

const EQUIPMENT={
  '1':{orificeCoeff:51,nozzles:[0.317,0.472,0.609,0.759,0.957]},
  '2':{orificeCoeff:47.6,nozzles:[0.312,0.450,0.533,0.612,0.777]}
};

const tbody=$('#pointTable tbody');
const defaults=[
  [30,31.1,1.4,2.6,71.12,120,35,35,20,460],
  ['','','','','','','','','',''],['','','','','','','','','',''],['','','','','','','','','',''],['','','','','','','','','','']
];
const keys=['time','temp','static','dynamic','vacuum','holder','meterIn','meterOut','impinger','volume'];
for(let r=0;r<5;r++){
  const tr=document.createElement('tr');
  const cells=keys.map((k,i)=>{
    if(k==='vacuum') return `<td class="auto-before"><span class="orifice-cell" data-orifice-r="${r}">-</span></td><td><input type="number" step="0.01" data-r="${r}" data-k="${k}" value="${defaults[r][i]}"></td>`;
    return `<td><input type="number" step="0.01" data-r="${r}" data-k="${k}" value="${defaults[r][i]}"></td>`;
  }).join('');
  tr.innerHTML=`<th>${r+1}</th>${cells}`;
  tbody.appendChild(tr);
}

function valuesBy(k){return $$(`[data-k="${k}"]`).map(x=>parseFloat(x.value)).filter(Number.isFinite)}
function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0}
function sum(a){return a.reduce((s,v)=>s+v,0)}
function o2Average(){return avg($$('.o2val').map(x=>parseFloat(x.value)).filter(Number.isFinite))}
function co2Average(){return avg($$('.co2val').map(x=>parseFloat(x.value)).filter(Number.isFinite))}
function moistureAverage(){return avg($$('.moist').map(x=>parseFloat(x.value)).filter(Number.isFinite))}
function orificeCoeff(){return EQUIPMENT[selectedTeam].orificeCoeff}

function setTeam(team, preferredNozzle){
  selectedTeam=String(team);
  $$('.team-tab').forEach(b=>b.classList.toggle('active',b.dataset.team===selectedTeam));
  $('#orificeCoeff').textContent=fmt(orificeCoeff(),1).replace('.0','');
  const box=$('#nozzleTabs'); box.innerHTML='';
  const list=EQUIPMENT[selectedTeam].nozzles;
  let chosen=parseFloat(preferredNozzle);
  if(!list.some(v=>Math.abs(v-chosen)<1e-6)) chosen=list[list.length-1];
  list.forEach(v=>{
    const b=document.createElement('button'); b.type='button'; b.className='nozzle-tab'+(Math.abs(v-chosen)<1e-6?' active':'');
    b.dataset.nozzle=v; b.textContent=v.toFixed(3); b.onclick=()=>selectNozzle(v); box.appendChild(b);
  });
  $('#nozzleCm').value=chosen;
  recalc();
}
function selectNozzle(v){
  $('#nozzleCm').value=v;
  $$('.nozzle-tab').forEach(b=>b.classList.toggle('active',Math.abs(parseFloat(b.dataset.nozzle)-v)<1e-6));
  recalc();
}
$$('.team-tab').forEach(b=>b.addEventListener('click',()=>setTeam(b.dataset.team)));

function syncStackShape(clearInactive=false){
  const shape=$('#stackShape').value;
  const d=$('#diameter'), w=$('#stackW'), h=$('#stackH');
  if(shape==='round'){
    if(clearInactive){w.value=''; h.value='';}
    d.disabled=false; w.disabled=true; h.disabled=true;
    d.closest('label').classList.remove('inactive-field'); w.closest('label').classList.add('inactive-field'); h.closest('label').classList.add('inactive-field');
  }else{
    if(clearInactive)d.value='';
    d.disabled=true; w.disabled=false; h.disabled=false;
    d.closest('label').classList.add('inactive-field'); w.closest('label').classList.remove('inactive-field'); h.closest('label').classList.remove('inactive-field');
  }
  renderTraverse();
}

function roundTraverseData(d){
  if(!(d>0)) return {count:0, ratios:[]};
  if(d<=1) return {count:4,ratios:[0.707]};
  if(d<=2) return {count:8,ratios:[0.500,0.866]};
  if(d<=4) return {count:12,ratios:[0.408,0.707,0.913]};
  if(d<=4.5) return {count:16,ratios:[0.354,0.612,0.791,0.935]};
  return {count:20,ratios:[0.316,0.548,0.707,0.837,0.949]};
}

function renderTraverse(){
  const shape=$('#stackShape').value;
  const diagram=$('#stackDiagram'), info=$('#traverseInfo'), summary=$('#traverseSummary');
  diagram.innerHTML='';
  diagram.className='stack-diagram '+shape;
  if(shape==='round'){
    const d=num('#diameter');
    const t=roundTraverseData(d);
    diagram.innerHTML='<div class="circle-outline"><span class="center-dot"></span></div>';
    if(d>0){
      const wall=t.ratios.map((r,i)=>{const dist=(d/2)*(1-r); return `<span>r${i+1}: ${dist.toFixed(3)} m</span>`}).join('');
      summary.textContent=`원형 · ${t.count}개 측정점 기준`;
      info.innerHTML=`<strong>내경 ${d.toFixed(3)} m</strong><p>원형 단면은 원으로 표시합니다.</p><div class="distance-chips">${wall}</div>`;
    }else{summary.textContent='원형 · 내경 입력 필요'; info.innerHTML='<p>내경을 입력하면 측정점 기준이 자동 계산됩니다.</p>';}
  }else{
    const w=num('#stackW'), h=num('#stackH');
    diagram.innerHTML='<div class="rect-outline"><i class="v q1"></i><i class="v q2"></i><i class="v q3"></i><i class="h q1"></i><i class="h q2"></i><i class="h q3"></i></div>';
    if(w>0&&h>0){
      const wx=w/4, hy=h/4;
      summary.textContent='사각형 · 가로/세로 4등분';
      info.innerHTML=`<strong>가로 ${w.toFixed(3)} m × 세로 ${h.toFixed(3)} m</strong><p>가로 ÷ 4 = <b>${wx.toFixed(3)} m</b> · 세로 ÷ 4 = <b>${hy.toFixed(3)} m</b></p><p>엑셀 기록지처럼 단면을 4 × 4로 등분해 표시합니다.</p>`;
    }else{summary.textContent='사각형 · 가로/세로 입력 필요'; info.innerHTML='<p>가로와 세로를 입력하면 각 변의 4등분 값이 자동 계산됩니다.</p>';}
  }
}

function calcCore(){
  const moist=moistureAverage();
  const o2=o2Average(), co2=co2Average();
  const pa=num('#locationPressure')||num('#pressure');
  const pitot=num('#pitot');
  const avgs={
    temp:avg(valuesBy('temp')),static:avg(valuesBy('static')),dynamic:avg(valuesBy('dynamic')),
    vacuum:avg(valuesBy('vacuum')),holder:avg(valuesBy('holder')),meterIn:avg(valuesBy('meterIn')),
    meterOut:avg(valuesBy('meterOut')),impinger:avg(valuesBy('impinger'))
  };
  const sums={time:sum(valuesBy('time')),volume:sum(valuesBy('volume'))};
  const n2=100-o2-co2;
  const md=.32*o2+.44*co2+.28*n2;
  const ms=md*(1-moist/100)+(moist/100)*18.01;
  const ps=avgs.static/13.6;
  const pStack=pa+ps;
  const density=(1/(22.4*100))*((28*n2+44*co2+32*o2)*(100-moist)/100+18*moist)*273/(273+avgs.temp)*pStack/760;
  const velocity=(density>0&&avgs.dynamic>=0)?pitot*Math.sqrt(2*9.81*avgs.dynamic/density):0;
  const area=$('#stackShape').value==='round' ? Math.PI*Math.pow(num('#diameter'),2)/4 : num('#stackW')*num('#stackH');
  const flow=area*velocity*273/(273+avgs.temp)*pStack/760*(1-moist/100)*60;
  return {moist,o2,co2,pa,pitot,avgs,sums,n2,md,ms,ps,pStack,density,velocity,area,flow};
}

function calcKFactor(c){
  const nozzle=num('#nozzleCm');
  const Ts=273+c.avgs.temp;
  const Tm=273+avg([c.avgs.meterIn,c.avgs.meterOut].filter(v=>Number.isFinite(v)&&v!==0));
  if(!Ts||!Tm||!c.pa||!c.ms||!nozzle) return 0;
  const k=8.009/100000*Math.pow(c.pitot,2)*orificeCoeff()*(Tm*c.pStack*c.md)/(Ts*c.pa*c.ms)*Math.pow(1-c.moist/100,2)*Math.pow(nozzle*10,4);
  return Math.round(k*100)/100;
}

function pointOrifice(r,c){
  const temp=parseFloat($(`[data-r="${r}"][data-k="temp"]`).value);
  const dynamic=parseFloat($(`[data-r="${r}"][data-k="dynamic"]`).value);
  const meterIn=parseFloat($(`[data-r="${r}"][data-k="meterIn"]`).value);
  const meterOut=parseFloat($(`[data-r="${r}"][data-k="meterOut"]`).value);
  const nozzle=num('#nozzleCm');
  if(![temp,dynamic,meterIn,meterOut].every(Number.isFinite)||!c.pa||!c.ms||!nozzle) return NaN;
  const Tm=273+(meterIn+meterOut)/2;
  const Ts=273+temp;
  return 8.009/100000*Math.pow(c.pitot,2)*orificeCoeff()*(Tm*c.pStack*c.md)/(Ts*c.pa*c.ms)*Math.pow(1-c.moist/100,2)*Math.pow(nozzle*10,4)*dynamic;
}

function recalc(){
  const c=calcCore();
  $('#moistAvg').textContent=fmt(c.moist,1);
  $('#o2Avg').textContent=fmt(c.o2,1);
  $('#co2Avg').textContent=fmt(c.co2,1);
  $('#rO2').textContent=fmt(c.o2,1);
  $('#rCO2').textContent=fmt(c.co2,1);
  $('#sumTime').textContent=fmt(c.sums.time,1); $('#sumVolume').textContent=fmt(c.sums.volume,1);
  for(const [k,id] of Object.entries({temp:'avgTemp',static:'avgStatic',dynamic:'avgDynamic',vacuum:'avgVacuum',holder:'avgHolder',meterIn:'avgMeterIn',meterOut:'avgMeterOut',impinger:'avgImpinger'})) $('#'+id).textContent=fmt(c.avgs[k],2);

  const orifices=[];
  for(let r=0;r<5;r++){
    const v=pointOrifice(r,c); const cell=$(`[data-orifice-r="${r}"]`);
    cell.textContent=Number.isFinite(v)?fmt(v,2):'-'; if(Number.isFinite(v)) orifices.push(v);
  }
  const avgOrifice=avg(orifices);
  $('#avgOrifice').textContent=orifices.length?fmt(avgOrifice,2):'-';
  $('#equipmentOrifice').textContent=orifices.length?fmt(avgOrifice,2):'-';
  $('#kFactor').textContent=fmt(calcKFactor(c),2);

  const Ts=273+c.avgs.temp, Tm=273+avg([c.avgs.meterIn,c.avgs.meterOut].filter(v=>v!==0));
  const Vm=c.sums.volume/1000, Pprime=c.pStack, t=c.sums.time, An=Math.PI*Math.pow(num('#nozzleCm'),2)/4;
  const vic=(c.sums.volume>0&&c.moist<100)?(c.sums.volume*c.moist*18/((100-c.moist)*22.4)):0;
  const iso=(Pprime>0&&t>0&&c.velocity>0&&An>0&&Tm>0)?Ts*(0.00346*vic+Vm/Tm*(c.pa+avgOrifice/13.6))/(Pprime*t*c.velocity*An)*16670:0;

  $('#rMoist').textContent=fmt(c.moist,1); $('#rDensity').textContent=fmt(c.density,2); $('#rVelocity').textContent=fmt(c.velocity,2);
  $('#rArea').textContent=fmt(c.area,2); $('#rFlow').textContent=fmt(c.flow,1); $('#rIso').textContent=fmt(iso,1);
  renderTraverse();
}

document.addEventListener('input',recalc); document.addEventListener('change',recalc);
$('#stackShape').addEventListener('change',()=>{syncStackShape(true);recalc();});
$$('.seg').forEach(b=>b.addEventListener('click',()=>{
  $$('.seg').forEach(x=>x.classList.remove('active')); b.classList.add('active'); recordType=b.dataset.type;
  $('#itemName').value=recordType==='dust'?'먼지':'중금속'; if(recordType==='metal'&&!$('#filterNo').value)$('#filterNo').value='중금속용'; recalc();
}));

function collect(){
  const obj={recordType,selectedTeam,fields:{},moist:$$('.moist').map(x=>x.value),o2vals:$$('.o2val').map(x=>x.value),co2vals:$$('.co2val').map(x=>x.value),points:[]};
  $$('input[id],select[id]').forEach(x=>obj.fields[x.id]=x.value);
  for(let r=0;r<5;r++){const p={}; keys.forEach(k=>p[k]=$(`[data-r="${r}"][data-k="${k}"]`).value); obj.points.push(p)}
  return obj;
}
function apply(o){
  if(!o)return; recordType=o.recordType||'dust'; $$('.seg').forEach(x=>x.classList.toggle('active',x.dataset.type===recordType));
  Object.entries(o.fields||{}).forEach(([id,v])=>{if($('#'+id))$('#'+id).value=v});
  syncStackShape(false);
  (o.moist||[]).forEach((v,i)=>{if($$('.moist')[i])$$('.moist')[i].value=v});
  (o.o2vals||[]).forEach((v,i)=>{if($$('.o2val')[i])$$('.o2val')[i].value=v});
  (o.co2vals||[]).forEach((v,i)=>{if($$('.co2val')[i])$$('.co2val')[i].value=v});
  (o.points||[]).forEach((p,r)=>keys.forEach(k=>{const el=$(`[data-r="${r}"][data-k="${k}"]`); if(el)el.value=p[k]??''}));
  setTeam(o.selectedTeam||'2',o.fields?.nozzleCm); recalc();
}
$('#btnSave').onclick=()=>{localStorage.setItem('dreampoen_sample_record_v3',JSON.stringify(collect())); $('#saveStatus').textContent='이 브라우저에 임시저장 완료 · '+new Date().toLocaleString()};
$('#btnLoad').onclick=()=>{const s=localStorage.getItem('dreampoen_sample_record_v3')||localStorage.getItem('dreampoen_sample_record_v2')||localStorage.getItem('dreampoen_sample_record_v1'); if(!s)return alert('저장된 기록이 없습니다.'); apply(JSON.parse(s)); $('#saveStatus').textContent='저장된 기록을 불러왔습니다.'};
$('#btnReset').onclick=()=>{if(confirm('현재 입력값을 초기화할까요?')){localStorage.removeItem('dreampoen_sample_record_v3');location.reload()}};
$('#btnPrint').onclick=()=>window.print();
$('#btnExcel').onclick=()=>{
  if(typeof XLSX==='undefined')return alert('Excel 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.');
  const o=collect(), c=calcCore();
  const rows=[['대기 시료채취기록지'],['측정구분',recordType==='dust'?'먼지':'중금속'],['접수번호',o.fields.receiptNo],['측정날짜',o.fields.measureDate],['업체명',o.fields.company],['시설명',o.fields.facility],['측정팀',selectedTeam+'팀'],['오리피스계수',orificeCoeff()],['노즐직경(cm)',o.fields.nozzleCm],[],['기상',o.fields.weather,'기온',o.fields.airTemp,'습도',o.fields.humidity,'측정위치 대기압',o.fields.locationPressure,'대기압',o.fields.pressure,'풍향',o.fields.windDir,'풍속',o.fields.windSpeed],['산소평균(%)',$('#o2Avg').textContent,'이산화탄소평균(%)',$('#co2Avg').textContent,'수분평균(%)',$('#moistAvg').textContent],[],['포인트','채취시간(min)','가스온도(℃)','정압(mmH2O)','동압(mmH2O)','오리피스압차(mmH2O)','진공게이지압(mmHg)','홀더온도(℃)','미터In(℃)','미터Out(℃)','임핀저출구(℃)','채취량(L)']];
  o.points.forEach((p,i)=>rows.push([i+1,p.time,p.temp,p.static,p.dynamic,$(`[data-orifice-r="${i}"]`).textContent,p.vacuum,p.holder,p.meterIn,p.meterOut,p.impinger,p.volume]));
  rows.push([],['계산결과','K-factor',$('#kFactor').textContent,'수분량(%)',$('#rMoist').textContent,'밀도(kg/m3)',$('#rDensity').textContent,'유속(m/s)',$('#rVelocity').textContent,'단면적(m2)',$('#rArea').textContent,'유량(Sm3/min)',$('#rFlow').textContent,'등속흡인계수(%)',$('#rIso').textContent]);
  const ws=XLSX.utils.aoa_to_sheet(rows); ws['!cols']=[{wch:18},...Array(13).fill({wch:14})]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'시료채취기록');
  const safe=(o.fields.company||'시료채취기록').replace(/[\\/:*?"<>|]/g,'_'); XLSX.writeFile(wb,`${o.fields.receiptNo||''}_${safe}.xlsx`);
};

if(!$('#measureDate').value)$('#measureDate').value=new Date().toISOString().slice(0,10);
setTeam('2',0.777);
syncStackShape(false);
recalc();
