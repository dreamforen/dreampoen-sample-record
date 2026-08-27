const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=(n,d=2)=>Number.isFinite(n)?Number(n).toFixed(d):'-';
const num=id=>parseFloat($(id).value)||0;
let recordType='dust';

const tbody=$('#pointTable tbody');
const defaults=[
  [30,31.1,1.4,2.6,23.9698445233,71.12,120,35,35,20,460],
  ['','','','','','','','','','',''],['','','','','','','','','','',''],['','','','','','','','','','',''],['','','','','','','','','','','']
];
const keys=['time','temp','static','dynamic','orifice','vacuum','holder','meterIn','meterOut','impinger','volume'];
for(let r=0;r<5;r++){
  const tr=document.createElement('tr'); tr.innerHTML=`<th>${r+1}</th>`+keys.map((k,i)=>`<td><input type="number" step="0.01" data-r="${r}" data-k="${k}" value="${defaults[r][i]}"></td>`).join(''); tbody.appendChild(tr);
}

function valuesBy(k){return $$(`[data-k="${k}"]`).map(x=>parseFloat(x.value)).filter(Number.isFinite)}
function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0}
function sum(a){return a.reduce((s,v)=>s+v,0)}

function recalc(){
  const moist=avg($$('.moist').map(x=>parseFloat(x.value)).filter(Number.isFinite));
  $('#moistAvg').textContent=fmt(moist,3);
  const sums={time:sum(valuesBy('time')),volume:sum(valuesBy('volume'))};
  const avgs={temp:avg(valuesBy('temp')),static:avg(valuesBy('static')),dynamic:avg(valuesBy('dynamic')),orifice:avg(valuesBy('orifice')),vacuum:avg(valuesBy('vacuum')),holder:avg(valuesBy('holder')),meterIn:avg(valuesBy('meterIn')),meterOut:avg(valuesBy('meterOut')),impinger:avg(valuesBy('impinger'))};
  $('#sumTime').textContent=fmt(sums.time,1); $('#sumVolume').textContent=fmt(sums.volume,1);
  for(const [k,id] of Object.entries({temp:'avgTemp',static:'avgStatic',dynamic:'avgDynamic',orifice:'avgOrifice',vacuum:'avgVacuum',holder:'avgHolder',meterIn:'avgMeterIn',meterOut:'avgMeterOut',impinger:'avgImpinger'})) $('#'+id).textContent=fmt(avgs[k],2);

  const o2=num('#o2'), co2=num('#co2'), pa=num('#pressure'), pitot=num('#pitot');
  const bwo=moist/100, n2=100-o2-co2;
  const md=.32*o2+.44*co2+.28*n2;
  const ms=md*(1-bwo)+bwo*18.01;
  const ps=avgs.static/13.6;
  const density=(1/(22.4*100))*((28*n2+44*co2+32*o2)*(100-moist)/100+18*moist)*273/(273+avgs.temp)*(pa+ps)/760;
  const velocity=(density>0&&avgs.dynamic>=0)?pitot*Math.sqrt(2*9.81*avgs.dynamic/density):0;
  const area=$('#stackShape').value==='round' ? Math.PI*Math.pow(num('#diameter'),2)/4 : num('#stackW')*num('#stackH');
  const flow=area*velocity*273/(273+avgs.temp)*(pa+ps)/760*(1-bwo)*60;

  // 원본 '수식(먼지)'!E13 구조: Ts*(0.00346*Vic + Vm/Tm*(Pa+ΔH/13.6))/(P's*t*v*An)*16670
  // 자동수분 사용 시 Vic는 수분 백분율로부터 채취량 기준 역산.
  const Ts=273+avgs.temp, Tm=273+avg([avgs.meterIn,avgs.meterOut].filter(v=>v!==0));
  const Vm=sums.volume/1000, Pprime=pa+ps, t=sums.time, An=Math.PI*Math.pow(num('#nozzleCm'),2)/4;
  const vic=(sums.volume>0 && moist<100)?(sums.volume*moist*18/((100-moist)*22.4)):0;
  const iso=(Pprime>0&&t>0&&velocity>0&&An>0&&Tm>0)?Ts*(0.00346*vic + Vm/Tm*(pa+avgs.orifice/13.6))/(Pprime*t*velocity*An)*16670:0;

  $('#rMoist').textContent=fmt(moist,3); $('#rDensity').textContent=fmt(density,4); $('#rVelocity').textContent=fmt(velocity,3); $('#rArea').textContent=fmt(area,4); $('#rFlow').textContent=fmt(flow,3); $('#rIso').textContent=fmt(iso,2);
}

document.addEventListener('input',recalc); document.addEventListener('change',recalc);
$$('.seg').forEach(b=>b.addEventListener('click',()=>{ $$('.seg').forEach(x=>x.classList.remove('active'));b.classList.add('active');recordType=b.dataset.type;$('#itemName').value=recordType==='dust'?'먼지':'중금속'; if(recordType==='metal'&&!$('#filterNo').value)$('#filterNo').value='중금속용'; recalc(); }));

function collect(){const obj={recordType,fields:{},moist:$$('.moist').map(x=>x.value),points:[]}; $$('input[id],select[id]').forEach(x=>obj.fields[x.id]=x.value); for(let r=0;r<5;r++){const p={}; keys.forEach(k=>p[k]=$(`[data-r="${r}"][data-k="${k}"]`).value); obj.points.push(p)} return obj}
function apply(o){ if(!o)return; recordType=o.recordType||'dust'; $$('.seg').forEach(x=>x.classList.toggle('active',x.dataset.type===recordType)); Object.entries(o.fields||{}).forEach(([id,v])=>{if($('#'+id))$('#'+id).value=v}); (o.moist||[]).forEach((v,i)=>{$$('.moist')[i].value=v}); (o.points||[]).forEach((p,r)=>keys.forEach(k=>{const el=$(`[data-r="${r}"][data-k="${k}"]`); if(el)el.value=p[k]??''})); recalc() }
$('#btnSave').onclick=()=>{localStorage.setItem('dreampoen_sample_record_v1',JSON.stringify(collect())); $('#saveStatus').textContent='이 브라우저에 임시저장 완료 · '+new Date().toLocaleString()};
$('#btnLoad').onclick=()=>{const s=localStorage.getItem('dreampoen_sample_record_v1'); if(!s)return alert('저장된 기록이 없습니다.'); apply(JSON.parse(s)); $('#saveStatus').textContent='저장된 기록을 불러왔습니다.'};
$('#btnReset').onclick=()=>{if(confirm('현재 입력값을 초기화할까요?')){localStorage.removeItem('dreampoen_sample_record_v1');location.reload()}};
$('#btnPrint').onclick=()=>window.print();
$('#btnExcel').onclick=()=>{if(typeof XLSX==='undefined')return alert('Excel 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'); const o=collect(); const rows=[['대기 시료채취기록지'],['측정구분',recordType==='dust'?'먼지':'중금속'],['접수번호',o.fields.receiptNo],['측정날짜',o.fields.measureDate],['업체명',o.fields.company],['시설명',o.fields.facility],[],['포인트','채취시간(min)','가스온도(℃)','정압(mmH2O)','동압(mmH2O)','오리피스압차(mmH2O)','진공게이지압(mmHg)','홀더온도(℃)','미터In(℃)','미터Out(℃)','임핀저출구(℃)','채취량(L)']]; o.points.forEach((p,i)=>rows.push([i+1,...keys.map(k=>p[k])])); rows.push([],['계산결과','수분량(%)',$('#rMoist').textContent,'밀도(kg/m3)',$('#rDensity').textContent,'유속(m/s)',$('#rVelocity').textContent,'단면적(m2)',$('#rArea').textContent,'유량(Sm3/min)',$('#rFlow').textContent,'등속흡인계수(%)',$('#rIso').textContent]); const ws=XLSX.utils.aoa_to_sheet(rows); ws['!cols']=[{wch:17},...Array(11).fill({wch:14})]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'시료채취기록'); const safe=(o.fields.company||'시료채취기록').replace(/[\\/:*?"<>|]/g,'_'); XLSX.writeFile(wb,`${o.fields.receiptNo||''}_${safe}.xlsx`)};

if(!$('#measureDate').value)$('#measureDate').value=new Date().toISOString().slice(0,10); recalc();
