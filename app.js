const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=(n,d=2)=>Number.isFinite(n)?Number(n).toFixed(d):'-';
const num=id=>{const v=parseFloat($(id)?.value); return Number.isFinite(v)?v:0};
const clone=o=>JSON.parse(JSON.stringify(o));
let recordType='dust';
let selectedTeam='2';
let pointCount=1;
let workingStates={dust:null,metal:null};
let baseTemplates={dust:null,metal:null};
let applying=false;

const EQUIPMENT={
  '1':{orificeCoeff:51,nozzles:[0.317,0.472,0.609,0.759,0.957,1.088,1.263]},
  '2':{orificeCoeff:47.6,nozzles:[0.312,0.450,0.533,0.612,0.777,0.938,1.094,1.267]}
};
const GAS_ITEMS=['총탄화수소','질소산화물','황산화물','염화수소(IC)','플루오린화합물(IC)','암모니아','사이안화수소','페놀','이황화탄소','HCHO','황화수소'];
const keys=['time','temp','static','dynamic','vacuum','holder','meterIn','meterOut','impinger','volume'];
const firstPointDefault={time:'30',temp:'31.1',static:'1.4',dynamic:'2.6',vacuum:'71.12',holder:'120',meterIn:'35',meterOut:'35',impinger:'20',volume:'460'};

function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0}
function sum(a){return a.reduce((s,v)=>s+v,0)}
function valuesBy(k){return $$(`[data-k="${k}"]`).map(x=>parseFloat(x.value)).filter(Number.isFinite)}
function o2Average(){return avg($$('.o2val').map(x=>parseFloat(x.value)).filter(Number.isFinite))}
function co2Average(){return avg($$('.co2val').map(x=>parseFloat(x.value)).filter(Number.isFinite))}
function moistureAverage(){return avg($$('.moist').map(x=>parseFloat(x.value)).filter(Number.isFinite))}
function orificeCoeff(){return EQUIPMENT[selectedTeam].orificeCoeff}

function normalizeTimeValue(v){
  if(!v)return '';
  const raw=String(v).trim().replace(/[^0-9:]/g,'');
  let h,m;
  if(raw.includes(':')) [h,m]=raw.split(':').map(Number);
  else if(raw.length>=3){h=Number(raw.slice(0,-2));m=Number(raw.slice(-2))}
  else {h=Number(raw);m=0}
  if(!Number.isFinite(h)||!Number.isFinite(m)||h<0||h>23||m<0||m>59)return v;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function addMinutesToTime(t,mins){
  const v=normalizeTimeValue(t); if(!/^\d{2}:\d{2}$/.test(v))return '';
  const [h,m]=v.split(':').map(Number); const total=(h*60+m+Math.round(mins))%(24*60);
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

function buildPointRows(count,data=[]){
  const tbody=$('#pointTable tbody'); tbody.innerHTML=''; pointCount=Math.max(1,count||1);
  for(let r=0;r<pointCount;r++){
    const p=data[r]||((r===0&&data.length===0)?firstPointDefault:{});
    const tr=document.createElement('tr');
    const cells=keys.map(k=>k==='vacuum'
      ? `<td class="auto-before"><span class="orifice-cell" data-orifice-r="${r}">-</span></td><td><input type="number" step="0.01" data-r="${r}" data-k="${k}" value="${p[k]??''}"></td>`
      : `<td><input type="number" step="0.01" data-r="${r}" data-k="${k}" value="${p[k]??''}"></td>`).join('');
    tr.innerHTML=`<th>${r+1}</th>${cells}`; tbody.appendChild(tr);
  }
}
function capturePoints(){
  const out=[];
  for(let r=0;r<pointCount;r++){
    const p={}; keys.forEach(k=>{const el=$(`[data-r="${r}"][data-k="${k}"]`);p[k]=el?el.value:''}); out.push(p);
  }
  return out;
}

function setTeam(team,preferredNozzle){
  selectedTeam=String(team);
  $$('.team-tab').forEach(b=>b.classList.toggle('active',b.dataset.team===selectedTeam));
  const coeff=orificeCoeff();
  $('#orificeCoeff').textContent=selectedTeam==='1'?String(Math.round(coeff)):fmt(coeff,1);
  const box=$('#nozzleTabs'); box.innerHTML='';
  const list=EQUIPMENT[selectedTeam].nozzles;
  let chosen=parseFloat(preferredNozzle);
  const isPreset=Number.isFinite(chosen)&&list.some(v=>Math.abs(v-chosen)<1e-6);
  if(!Number.isFinite(chosen)) chosen=list[Math.min(4,list.length-1)];
  list.forEach(v=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='nozzle-tab'+(isPreset&&Math.abs(v-chosen)<1e-6?' active':'');
    b.dataset.nozzle=v;
    b.textContent=v.toFixed(3);
    b.onclick=()=>selectNozzle(v);
    box.appendChild(b)
  });
  if(!isPreset && Number.isFinite(chosen)){
    $('#nozzleOther').value=chosen.toFixed(3);
  }else{
    $('#nozzleOther').value='';
  }
  $('#nozzleCm').value=chosen;
  if(!applying)recalc();
}
function selectNozzle(v){
  $('#nozzleCm').value=v;
  $('#nozzleOther').value='';
  $$('.nozzle-tab').forEach(b=>b.classList.toggle('active',Math.abs(parseFloat(b.dataset.nozzle)-v)<1e-6));
  recalc()
}
function selectCustomNozzle(){
  const v=parseFloat($('#nozzleOther').value);
  if(!Number.isFinite(v)||v<=0)return;
  $('#nozzleCm').value=v;
  $$('.nozzle-tab').forEach(b=>b.classList.remove('active'));
  recalc();
}
$('#nozzleOther').addEventListener('input',selectCustomNozzle);
function roundTraverse(d){
  const area=Math.PI*d*d/4,R=d/2;
  if(!(d>0))return {area:0,totalLegal:0,repCount:1,locations:[''],summary:''};
  // 소규모 굴뚝: 대표점은 중심 1점
  if(area<=0.25)return {area,totalLegal:1,repCount:1,locations:[{dist:0,label:'중앙'}],summary:`단면적 ${area.toFixed(3)} m² · 대표 측정구 1지점 (중앙)`};
  let factors,totalLegal;
  if(d<=1){factors=[0.707];totalLegal=4;}
  else if(d<=2){factors=[0.500,0.866];totalLegal=8;}
  else if(d<=4){factors=[0.408,0.707,0.913];totalLegal=12;}
  else if(d<=4.5){factors=[0.354,0.612,0.791,0.935];totalLegal=16;}
  else {factors=[0.316,0.548,0.707,0.837,0.949];totalLegal=20;}
  // 전체 법정 측정점이 아니라 대표 측정구 1개에서 실제 입력할 반경방향 위치만 표시
  const locations=factors.map(f=>({dist:f*R,label:`${f.toFixed(3)}R`}));
  return {area,totalLegal,repCount:locations.length,locations,summary:`단면적 ${area.toFixed(3)} m² · 전체 기준 ${totalLegal}점 · 대표 측정구 ${locations.length}지점`};
}
function rectangularGrid(A,B){
  const area=A*B;
  if(!(A>0&&B>0)) return {count:0,nA:0,nB:0,cellA:0,cellB:0,area:0,maxL:0,summary:''};
  if(area<=0.25) return {count:1,nA:1,nB:1,cellA:A,cellB:B,area,maxL:Math.max(A,B),summary:`단면적 ${area.toFixed(3)} m² · 소규모 중심 1점`};

  // ES 기준: 단면적별 구획된 1변의 최대 길이 L
  const maxL=area<=1 ? 0.5 : (area<=4 ? 0.667 : 1.0);
  let nA=Math.max(1,Math.ceil(A/maxL));
  let nB=Math.max(1,Math.ceil(B/maxL));

  // 0.25 m² 초과는 최소 4개의 등단면적으로 구획
  while(nA*nB<4){
    const nextA=A/(nA+1), nextB=B/(nB+1);
    // 분할 후 셀 모양이 가능한 한 정사각형에 가까워지는 방향을 우선
    const scoreA=Math.abs(Math.log((nextA||1)/((B/nB)||1)));
    const scoreB=Math.abs(Math.log(((A/nA)||1)/(nextB||1)));
    if(scoreA<=scoreB) nA++; else nB++;
  }

  return {
    count:nA*nB,nA,nB,cellA:A/nA,cellB:B/nB,area,maxL,
    summary:`단면적 ${area.toFixed(3)} m² · L ≤ ${maxL} m · ${nA} × ${nB} 등분 · 전체 ${nA*nB}점`
  };
}

function traverseModel(){
  if($('#stackShape').value==='round'){
    const d=num('#diameter'),r=roundTraverse(d);
    return {shape:'round',count:r.repCount,legalCount:r.totalLegal,values:r.locations,area:r.area,summary:r.summary,diameter:d};
  }

  const A=num('#stackW'),B=num('#stackH'),g=rectangularGrid(A,B);
  if(!(A>0&&B>0)) return {shape:'rect',count:1,legalCount:0,values:[],area:0,summary:'',A,B,nA:1,nB:1};
  if(g.area<=0.25) return {
    shape:'rect',count:1,legalCount:1,
    values:[{x:A/2,y:B/2,label:'중앙'}],area:g.area,
    summary:`단면적 ${g.area.toFixed(3)} m² · 대표 1지점 (중앙)`,A,B,nA:1,nB:1,maxL:g.maxL
  };

  const cellA=g.cellA, cellB=g.cellB;

  // 현장 대표 측정구 적용:
  // 전체 격자는 공정시험기준대로 계산하되 실제 기록지에는 대표 측정구에서
  // 측정할 삽입 위치만 표시한다. 2×2의 경우 1점(셀 중심),
  // 세로 분할이 늘어나면 대표 측정구에서 필요한 중심 위치를 최대 5점까지 표시한다.
  // 좌표는 측정공이 있는 모서리를 기준으로 한 삽입거리이다.
  let repN=Math.max(1, Math.ceil(g.nB/2));
  // 블로그 교육 예시(1.0×1.25, L=0.667의 2×2)처럼 1/4 대표 1점으로
  // L 조건을 충족시키기 어려운 비정방형은 2점으로 보강.
  if(g.nA===2 && g.nB===2 && Math.max(A,B)/Math.min(A,B)>=1.2) repN=2;
  repN=Math.min(5,repN);

  const vals=[];
  for(let i=0;i<repN;i++){
    // 대표 측정구 한 면에서 각 등분면 중심까지의 삽입거리.
    // 0.80×0.80, 2×2 => 0.20×0.20 m
    const ix=0;
    const iy=Math.min(i,g.nB-1);
    vals.push({x:cellA*(ix+0.5), y:cellB*(iy+0.5)});
  }

  return {
    shape:'rect',count:repN,legalCount:g.count,values:vals,area:g.area,A,B,
    nA:g.nA,nB:g.nB,maxL:g.maxL,
    summary:`단면적 ${g.area.toFixed(3)} m² · L ≤ ${g.maxL} m · ${g.nA} × ${g.nB} 등분(전체 ${g.count}점) · 대표 측정구 ${repN}지점`
  };
}

function renderTraverseDiagram(m){
  const svg=$('#traverseDiagram'); if(!svg)return;
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!m || !m.area){
    svg.innerHTML='<text x="160" y="112" text-anchor="middle" class="diagram-empty">굴뚝 치수를 입력하세요</text>';
    return;
  }
  if(m.shape==='round'){
    const cx=150,cy=105,R=72;
    const portX=cx+R+18;
    let body=`<circle cx="${cx}" cy="${cy}" r="${R}" class="duct-shape"/>
      <line x1="${cx-R}" y1="${cy}" x2="${cx+R}" y2="${cy}" class="axis-line"/>
      <line x1="${cx}" y1="${cy-R}" x2="${cx}" y2="${cy+R}" class="axis-line faint"/>
      <line x1="${cx+R}" y1="${cy}" x2="${portX}" y2="${cy}" class="port-neck"/>
      <circle cx="${portX+5}" cy="${cy}" r="7" class="sampling-port"/>
      <text x="${portX+16}" y="${cy+4}" class="port-label">측정구</text>
      <line x1="${portX-4}" y1="${cy-20}" x2="${cx+R-20}" y2="${cy-20}" class="probe-arrow"/>
      <polygon points="${cx+R-20},${cy-20} ${cx+R-10},${cy-25} ${cx+R-10},${cy-15}" class="probe-arrow-head"/>
      <text x="${portX-2}" y="${cy-28}" text-anchor="end" class="probe-label">삽입방향</text>`;
    if(m.values.length===1 && m.values[0]?.label==='중앙'){
      body+=`<circle cx="${cx}" cy="${cy}" r="6" class="measure-dot"/><text x="${cx+9}" y="${cy-10}" class="point-label">1</text>`;
    }else{
      m.values.forEach((v,i)=>{
        const ratio=m.diameter>0?Math.min(1,Math.max(0,v.dist/(m.diameter/2))):0;
        const x=cx+ratio*R;
        body+=`<circle cx="${x.toFixed(1)}" cy="${cy}" r="6" class="measure-dot"/><text x="${(x+8).toFixed(1)}" y="${cy-10}" class="point-label">${i+1}</text>`;
      });
    }
    body+=`<text x="160" y="208" text-anchor="middle" class="diagram-caption">원형 · 오른쪽 측부 측정구 기준</text>`;
    svg.innerHTML=body; return;
  }

  const padX=45,padY=28,maxW=205,maxH=145;
  const scale=Math.min(maxW/m.A,maxH/m.B);
  const W=m.A*scale,H=m.B*scale,x0=(285-W)/2,y0=(185-H)/2;
  const portX=x0+W+18, portY=y0+H/2;
  let body=`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" class="duct-shape"/>
    <line x1="${x0+W}" y1="${portY}" x2="${portX}" y2="${portY}" class="port-neck"/>
    <circle cx="${portX+5}" cy="${portY}" r="7" class="sampling-port"/>
    <text x="${portX+16}" y="${portY+4}" class="port-label">측정구</text>
    <line x1="${portX-3}" y1="${portY-18}" x2="${x0+W-25}" y2="${portY-18}" class="probe-arrow"/>
    <polygon points="${x0+W-25},${portY-18} ${x0+W-15},${portY-23} ${x0+W-15},${portY-13}" class="probe-arrow-head"/>
    <text x="${portX-2}" y="${portY-26}" text-anchor="end" class="probe-label">삽입방향</text>`;
  for(let i=1;i<m.nA;i++){
    const x=x0+W*i/m.nA; body+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+H}" class="grid-line"/>`;
  }
  for(let j=1;j<m.nB;j++){
    const y=y0+H*j/m.nB; body+=`<line x1="${x0}" y1="${y}" x2="${x0+W}" y2="${y}" class="grid-line"/>`;
  }
  m.values.forEach((v,i)=>{
    // 표의 좌표는 좌측 하단을 기준으로 표시한다.
    // 오른쪽 측부 측정구 기준: 표의 x 삽입거리를 오른쪽 벽에서 안쪽으로 표시
    const x=x0+W-(v.x/m.A)*W, y=y0+H-(v.y/m.B)*H;
    body+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" class="measure-dot"/><text x="${(x+8).toFixed(1)}" y="${(y-8).toFixed(1)}" class="point-label">${i+1}</text>`;
  });
  body+=`<text x="160" y="208" text-anchor="middle" class="diagram-caption">사각형 · ${m.nA}×${m.nB} 등분 · 오른쪽 측부 측정구 기준</text>`;
  svg.innerHTML=body;
}

function updateTraverseAndRows(){
  const current=capturePoints(); const m=traverseModel();
  $('#traverseSummary').textContent=m.summary;
  const body=$('#traverseRows');body.innerHTML='';
  m.values.forEach((v,i)=>{
    if(m.shape==='round'){
      const isCenter=typeof v==='object'&&v.label==='중앙';
      const text=isCenter?'중앙':(typeof v==='object'?Number(v.dist).toFixed(3):v||'');
      body.insertAdjacentHTML('beforeend',`<tr><th>${i+1} 지점</th><td>${text}</td><td>${isCenter?'':'m'}</td></tr>`);
    }else{
      const isCenter=v?.label==='중앙';
      const text=isCenter?'중앙':`${Number(v.x).toFixed(3)} × ${Number(v.y).toFixed(3)}`;
      body.insertAdjacentHTML('beforeend',`<tr><th>${i+1} 지점</th><td>${text}</td><td>${isCenter?'':'m'}</td></tr>`);
    }
  });
  if(!m.values.length)body.insertAdjacentHTML('beforeend','<tr><th>1 지점</th><td></td><td></td></tr>');
  renderTraverseDiagram(m);
  if(pointCount!==m.count)buildPointRows(m.count,current);
}

function calcCore(){
  const moist=moistureAverage(),o2=o2Average(),co2=co2Average(),pa=num('#locationPressure')||num('#pressure'),pitot=num('#pitot');
  const avgs={temp:avg(valuesBy('temp')),static:avg(valuesBy('static')),dynamic:avg(valuesBy('dynamic')),vacuum:avg(valuesBy('vacuum')),holder:avg(valuesBy('holder')),meterIn:avg(valuesBy('meterIn')),meterOut:avg(valuesBy('meterOut')),impinger:avg(valuesBy('impinger'))};
  const sums={time:sum(valuesBy('time')),volume:sum(valuesBy('volume'))},n2=100-o2-co2,md=.32*o2+.44*co2+.28*n2,ms=md*(1-moist/100)+(moist/100)*18.01,ps=avgs.static/13.6,pStack=pa+ps;
  const r0=(1/(22.4*100))*((28*n2+44*co2+32*o2)*(100-moist)/100+18*moist);
  const density=r0*273/(273+avgs.temp)*pStack/760;
  const velocity=(density>0&&avgs.dynamic>=0)?pitot*Math.sqrt(2*9.81*avgs.dynamic/density):0;
  const area=$('#stackShape').value==='round'?Math.PI*Math.pow(num('#diameter'),2)/4:num('#stackW')*num('#stackH');
  const flow=area*velocity*273/(273+avgs.temp)*pStack/760*(1-moist/100)*60;
  const std=parseFloat($('#stdO2').value),oxygenCorrection=Number.isFinite(std)&&std>=0&&std<21&&Number.isFinite(o2)&&o2<=21;
  const correctedFlow=oxygenCorrection?flow*(21-o2)/(21-std):NaN;
  return {moist,o2,co2,pa,pitot,avgs,sums,n2,md,ms,ps,pStack,r0,density,velocity,area,flow,std,oxygenCorrection,correctedFlow};
}
function calcKFactor(c){
  const nozzle=num('#nozzleCm'),Ts=273+c.avgs.temp,Tm=273+avg([c.avgs.meterIn,c.avgs.meterOut].filter(v=>Number.isFinite(v)&&v!==0));
  if(!Ts||!Tm||!c.pa||!c.ms||!nozzle)return 0;
  const k=8.009/100000*Math.pow(c.pitot,2)*orificeCoeff()*(Tm*c.pStack*c.md)/(Ts*c.pa*c.ms)*Math.pow(1-c.moist/100,2)*Math.pow(nozzle*10,4);return Math.round(k*100)/100;
}
function pointOrifice(r,c){
  const temp=parseFloat($(`[data-r="${r}"][data-k="temp"]`)?.value),dynamic=parseFloat($(`[data-r="${r}"][data-k="dynamic"]`)?.value),meterIn=parseFloat($(`[data-r="${r}"][data-k="meterIn"]`)?.value),meterOut=parseFloat($(`[data-r="${r}"][data-k="meterOut"]`)?.value),nozzle=num('#nozzleCm');
  if(![temp,dynamic,meterIn,meterOut].every(Number.isFinite)||!c.pa||!c.ms||!nozzle)return NaN;
  const Tm=273+(meterIn+meterOut)/2,Ts=273+temp;return 8.009/100000*Math.pow(c.pitot,2)*orificeCoeff()*(Tm*c.pStack*c.md)/(Ts*c.pa*c.ms)*Math.pow(1-c.moist/100,2)*Math.pow(nozzle*10,4)*dynamic;
}
function updateRawData(c,iso,avgOrifice,vic,An,Ts,Tm,Vm){
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=(v===undefined||v===null||v==='')?'-':v};
  set('#rawCompany',$('#company')?.value); set('#rawFacility',$('#facility')?.value); set('#rawDate',$('#measureDate')?.value);
  set('#rawType',recordType==='dust'?'먼지':'중금속');
  const f=(n,d=3)=>Number.isFinite(n)?Number(n).toFixed(d):'-';
  const qaHr=c.flow*60, qHr=c.oxygenCorrection?c.correctedFlow*60:NaN;
  const rows=[
    ['수분량','Xw','5회 자동수분 측정값의 평균',`측정값 평균`,f(c.moist,1),'%'],
    ['질소농도','N₂','100 - O₂ - CO₂',`100 - ${f(c.o2,1)} - ${f(c.co2,1)}`,f(c.n2,1),'%'],
    ['표준상태 습 배출가스 밀도','r₀','1/(22.4×100) × [(28N₂+44CO₂+32O₂)×(100-Xw)/100 + 18Xw]',`O₂=${f(c.o2,1)}, CO₂=${f(c.co2,1)}, N₂=${f(c.n2,1)}, Xw=${f(c.moist,1)}`,f(c.r0,3),'kg/Sm³'],
    ['실제 배출가스 밀도','r','r₀ × 273/(273+θs) × (Pa+Ps)/760',`r₀=${f(c.r0,3)}, θs=${f(c.avgs.temp,2)}, Pa=${f(c.pa,1)}, Ps=${f(c.avgs.static,2)}`,f(c.density,2),'kg/m³'],
    ['배출가스 평균유속','v','C × √(2×9.81×h/r)',`C=${f(c.pitot,3)}, h=${f(c.avgs.dynamic,2)}, r=${f(c.density,3)}`,f(c.velocity,2),'m/s'],
    ['채취된 물의 총량','Vic','Vs × Xw/(100-Xw) × 18/22.4',`Vs=${f(c.sums.volume,1)} L, Xw=${f(c.moist,1)}`,f(vic,2),'mL'],
    ['노즐 단면적','An','3.14 × d² / 4',`d=${f(num('#nozzleCm'),3)} cm`,f(An,4),'cm²'],
    ['굴뚝 단면적','A',$('#stackShape').value==='round'?'π × D² / 4':'가로 × 세로',$('#stackShape').value==='round'?`D=${f(num('#diameter'),3)} m`:`${f(num('#stackW'),3)} × ${f(num('#stackH'),3)} m`,f(c.area,3),'m²'],
    ['오리피스 압차 평균','ΔH','각 지점 자동 산출값 평균',`오리피스계수=${selectedTeam==='1'?String(Math.round(orificeCoeff())):f(orificeCoeff(),1)}`,f(avgOrifice,2),'mmH₂O'],
    ['등속흡입계수','I','Ts × [0.00346Vic + Vm/Tm×(Pa+ΔH/13.6)] / (P\'s×t×v×An) × 16670',`Ts=${f(Ts,2)}, Vic=${f(vic,2)}, Vm=${f(Vm,4)}, Tm=${f(Tm,2)}, t=${f(c.sums.time,1)}`,f(iso,1),'%'],
    ['건조 표준배출가스량','Qa','A×v×273/(273+θs)×(Pa+Ps/13.6)/760×(1-Xw/100)×3600',`A=${f(c.area,3)}, v=${f(c.velocity,2)}, Xw=${f(c.moist,1)}`,f(qaHr,1),'Sm³/hr'],
    ['산소보정 배출가스량','Q','Qa × (21-O₂)/(21-Os)',c.oxygenCorrection?`Qa=${f(qaHr,1)}, O₂=${f(c.o2,1)}, Os=${f(c.std,1)}`:'표준산소농도 미입력',c.oxygenCorrection?f(qHr,1):'-','Sm³/hr']
  ];
  const tb=$('#rawCalcRows'); if(tb)tb.innerHTML=rows.map((r,i)=>`<tr><th>${i+1}</th><td>${r[0]}</td><td>${r[1]}</td><td class="formula-cell">${r[2]}</td><td>${r[3]}</td><td class="raw-result">${r[4]}</td><td>${r[5]}</td></tr>`).join('');
  const pt=$('#rawPointRows');
  if(pt){pt.innerHTML='';for(let r=0;r<pointCount;r++){
    const get=k=>parseFloat($(`[data-r="${r}"][data-k="${k}"]`)?.value),orv=pointOrifice(r,c);
    pt.insertAdjacentHTML('beforeend',`<tr><th>${r+1}</th><td>${f(get('time'),1)}</td><td>${f(get('temp'),2)}</td><td>${f(get('static'),2)}</td><td>${f(get('dynamic'),2)}</td><td>${f(orv,2)}</td><td>${f(get('vacuum'),2)}</td><td>${f(get('meterIn'),2)}</td><td>${f(get('meterOut'),2)}</td><td>${f(get('volume'),1)}</td></tr>`);
  }}
}

function recalc(){
  if(applying)return;
  updateTraverseAndRows();
  const c=calcCore();$('#moistAvg').textContent=fmt(c.moist,1);$('#o2Avg').textContent=fmt(c.o2,1);$('#co2Avg').textContent=fmt(c.co2,1);$('#rO2').textContent=fmt(c.o2,1);$('#rCO2').textContent=fmt(c.co2,1);
  $('#sumTime').textContent=fmt(c.sums.time,1);$('#sumVolume').textContent=fmt(c.sums.volume,1);
  for(const [k,id] of Object.entries({temp:'avgTemp',static:'avgStatic',dynamic:'avgDynamic',vacuum:'avgVacuum',holder:'avgHolder',meterIn:'avgMeterIn',meterOut:'avgMeterOut',impinger:'avgImpinger'}))$('#'+id).textContent=fmt(c.avgs[k],2);
  const orifices=[];for(let r=0;r<pointCount;r++){const v=pointOrifice(r,c),cell=$(`[data-orifice-r="${r}"]`);if(cell)cell.textContent=Number.isFinite(v)?fmt(v,2):'-';if(Number.isFinite(v))orifices.push(v)}
  const avgOrifice=avg(orifices);$('#avgOrifice').textContent=orifices.length?fmt(avgOrifice,2):'-';$('#equipmentOrifice').textContent=orifices.length?fmt(avgOrifice,2):'-';$('#kFactor').textContent=fmt(calcKFactor(c),2);
  const Ts=273+c.avgs.temp,Tm=273+avg([c.avgs.meterIn,c.avgs.meterOut].filter(v=>v!==0)),Vm=c.sums.volume/1000,Pprime=c.pStack,t=c.sums.time,An=Math.PI*Math.pow(num('#nozzleCm'),2)/4;const vic=(c.sums.volume>0&&c.moist<100)?(c.sums.volume*c.moist*18/((100-c.moist)*22.4)):0;const iso=(Pprime>0&&t>0&&c.velocity>0&&An>0&&Tm>0)?Ts*(0.00346*vic+Vm/Tm*(c.pa+avgOrifice/13.6))/(Pprime*t*c.velocity*An)*16670:0;
  $('#rMoist').textContent=fmt(c.moist,1);$('#rDensity').textContent=fmt(c.density,2);$('#rVelocity').textContent=fmt(c.velocity,2);$('#rArea').textContent=fmt(c.area,2);$('#rFlow').textContent=fmt(c.flow,1);$('#rCorrectedFlow').textContent=c.oxygenCorrection?fmt(c.correctedFlow,1):'-';$('#rIso').textContent=fmt(iso,1);$('#equipmentIso').textContent=fmt(iso,1);
  $('#flowBeforeCorrection').textContent=fmt(c.flow,1);$('#flowAfterCorrection').textContent=c.oxygenCorrection?fmt(c.correctedFlow,1):'-';
  updateRawData(c,iso,avgOrifice,vic,An,Ts,Tm,Vm);
  $('#particleEnd').value=addMinutesToTime($('#particleStart').value,c.sums.time);
  const before=parseFloat($('#meterBefore').value);if(Number.isFinite(before)){$('#meterAfter').textContent=fmt(before+c.sums.volume,1);$('#meterDifference').textContent=fmt(c.sums.volume,1)}else{$('#meterAfter').textContent='-';$('#meterDifference').textContent=fmt(c.sums.volume,1)}
}

document.addEventListener('input',e=>{if(!applying)recalc()});document.addEventListener('change',e=>{if(!applying)recalc()});
$('#stackShape').addEventListener('change',()=>{syncStackShape(true);recalc()});
['totalStart','totalEnd','particleStart'].forEach(id=>$('#'+id).addEventListener('blur',e=>{e.target.value=normalizeTimeValue(e.target.value);recalc()}));

const gasSelect=$('#gasItemSelect');GAS_ITEMS.forEach(x=>{const o=document.createElement('option');o.textContent=x;o.value=x;gasSelect.appendChild(o)});
function addGasRow(item,data={}){
  const tb=$('#gasTable tbody'),tr=document.createElement('tr');tr.dataset.item=item;
  tr.innerHTML=`<th class="gas-no"></th><td class="gas-name">${item}</td><td><input class="gas-flow" type="number" step="0.01" value="${data.flow??''}"></td><td><input class="gas-pressure" type="number" step="0.01" value="${data.pressure??''}"></td><td><input class="gas-temp" type="number" step="0.1" value="${data.temp??''}"></td><td><input class="gas-volume" type="number" step="0.1" value="${data.volume??''}"></td><td><input class="gas-start" type="text" inputmode="numeric" maxlength="5" placeholder="13:25" value="${data.start??''}"></td><td class="time-sep">~</td><td><input class="gas-end" type="text" inputmode="numeric" maxlength="5" placeholder="14:10" value="${data.end??''}"></td><td><button type="button" class="row-delete">삭제</button></td>`;
  [tr.querySelector('.gas-start'),tr.querySelector('.gas-end')].forEach(el=>el.addEventListener('blur',()=>{el.value=normalizeTimeValue(el.value)}));
  tr.querySelector('.row-delete').onclick=()=>{tr.remove();renumberGas()};tb.appendChild(tr);renumberGas();
}
function renumberGas(){$$('#gasTable tbody tr').forEach((tr,i)=>tr.querySelector('.gas-no').textContent=i+1)}
$('#btnAddGas').onclick=()=>{const item=gasSelect.value;if(!item)return;if($$('#gasTable tbody tr').some(tr=>tr.dataset.item===item))return alert('이미 추가된 항목입니다.');addGasRow(item)};

function collect(){
  const obj={recordType,selectedTeam,fields:{},moist:$$('.moist').map(x=>x.value),o2vals:$$('.o2val').map(x=>x.value),co2vals:$$('.co2val').map(x=>x.value),points:capturePoints(),gasRows:[],leak:document.querySelector('input[name="leak"]:checked')?.value||'적합'};
  $$('input[id],select[id]').forEach(x=>obj.fields[x.id]=x.value);
  $$('#gasTable tbody tr').forEach(tr=>obj.gasRows.push({item:tr.dataset.item,flow:tr.querySelector('.gas-flow').value,pressure:tr.querySelector('.gas-pressure').value,temp:tr.querySelector('.gas-temp').value,volume:tr.querySelector('.gas-volume').value,start:tr.querySelector('.gas-start').value,end:tr.querySelector('.gas-end').value}));return obj;
}
function apply(o){
  if(!o)return;applying=true;recordType=o.recordType||recordType;$$('.seg').forEach(x=>x.classList.toggle('active',x.dataset.type===recordType));
  Object.entries(o.fields||{}).forEach(([id,v])=>{const el=$('#'+id);if(el)el.value=v});$('#itemName').value=recordType==='dust'?'먼지':'중금속';
  (o.moist||[]).forEach((v,i)=>{if($$('.moist')[i])$$('.moist')[i].value=v});(o.o2vals||[]).forEach((v,i)=>{if($$('.o2val')[i])$$('.o2val')[i].value=v});(o.co2vals||[]).forEach((v,i)=>{if($$('.co2val')[i])$$('.co2val')[i].value=v});
  setTeam(o.selectedTeam||'2',o.fields?.nozzleCm);syncStackShape(false);const m=traverseModel();buildPointRows(m.count,o.points||[]);updateTraverseAndRows();
  $('#gasTable tbody').innerHTML='';(o.gasRows||[]).forEach(g=>addGasRow(g.item,g));const leak=document.querySelector(`input[name="leak"][value="${o.leak||'적합'}"]`);if(leak)leak.checked=true;applying=false;recalc();
}
function switchRecord(type){
  if(type===recordType)return;workingStates[recordType]=collect();recordType=type;const target=workingStates[type]||baseTemplates[type];apply(clone(target));$('#saveStatus').textContent=`${type==='dust'?'먼지':'중금속'} 기록지 · 다른 기록지와 독립 입력`;
}
$$('.seg').forEach(b=>b.addEventListener('click',()=>switchRecord(b.dataset.type)));
function storageKey(type){return `dreampoen_sample_record_v7_${type}`}
$('#btnSave').onclick=()=>{workingStates[recordType]=collect();localStorage.setItem(storageKey(recordType),JSON.stringify(workingStates[recordType]));$('#saveStatus').textContent=`${recordType==='dust'?'먼지':'중금속'} 기록지 임시저장 완료 · `+new Date().toLocaleString()};
$('#btnLoad').onclick=()=>{const s=localStorage.getItem(storageKey(recordType));if(!s)return alert(`저장된 ${recordType==='dust'?'먼지':'중금속'} 기록지가 없습니다.`);const o=JSON.parse(s);workingStates[recordType]=o;apply(clone(o));$('#saveStatus').textContent=`저장된 ${recordType==='dust'?'먼지':'중금속'} 기록지를 불러왔습니다.`};
$('#btnReset').onclick=()=>{if(confirm(`현재 ${recordType==='dust'?'먼지':'중금속'} 기록지만 초기화할까요?`)){localStorage.removeItem(storageKey(recordType));workingStates[recordType]=clone(baseTemplates[recordType]);apply(clone(baseTemplates[recordType]));$('#saveStatus').textContent='현재 기록지만 초기화했습니다.'}};
$('#btnPrint').onclick=()=>window.print();
$('#btnExcel').onclick=()=>{
  if(typeof XLSX==='undefined')return alert('Excel 라이브러리를 불러오지 못했습니다.');const o=collect(),c=calcCore(),m=traverseModel();
  const rows=[['대기 시료채취기록지'],['측정구분',recordType==='dust'?'먼지':'중금속'],['접수번호',o.fields.receiptNo],['측정날짜',o.fields.measureDate],['업체명',o.fields.company],['시설명',o.fields.facility],['전체 채취시간',o.fields.totalStart,'~',o.fields.totalEnd],['측정팀',selectedTeam+'팀'],['오리피스계수',orificeCoeff()],['노즐직경(cm)',o.fields.nozzleCm],['굴뚝단면',$('#stackShape').value==='round'?'원형':'사각형','대표 측정구 지점수',m.count,'전체 기준점수',m.legalCount],[],['기상',o.fields.weather,'기온',o.fields.airTemp,'습도',o.fields.humidity,'측정위치 대기압',o.fields.locationPressure,'대기압',o.fields.pressure,'풍향',o.fields.windDir,'풍속',o.fields.windSpeed],['산소평균(%)',$('#o2Avg').textContent,'이산화탄소평균(%)',$('#co2Avg').textContent,'수분평균(%)',$('#moistAvg').textContent,'표준산소(%)',o.fields.stdO2],['보정 전 유량(Sm3/min)',$('#rFlow').textContent,'보정 후 유량(Sm3/min)',$('#rCorrectedFlow').textContent],['적산유량계 전(L)',o.fields.meterBefore,'적산유량계 후(L)',$('#meterAfter').textContent,'누출검사',o.leak],[],['입자상 시료채취시간',o.fields.particleStart,'~',o.fields.particleEnd],['포인트','채취시간(min)','가스온도(℃)','정압(mmH2O)','동압(mmH2O)','오리피스압차(mmH2O)','진공게이지압(mmHg)','홀더온도(℃)','미터In(℃)','미터Out(℃)','임핀저출구(℃)','채취량(L)']];
  o.points.forEach((p,i)=>rows.push([i+1,p.time,p.temp,p.static,p.dynamic,$(`[data-orifice-r="${i}"]`)?.textContent||'',p.vacuum,p.holder,p.meterIn,p.meterOut,p.impinger,p.volume]));
  rows.push([],['기타 항목(가스상) 측정조건'],['NO','항목','흡인유속(L/min)','가스미터 게이지압(mmHg)','건식가스미터 온도(℃)','채취량(L)','시료채취 시작','~','시료채취 종료']);o.gasRows.forEach((g,i)=>rows.push([i+1,g.item,g.flow,g.pressure,g.temp,g.volume,g.start,'~',g.end]));
  rows.push([],['계산결과','K-factor',$('#kFactor').textContent,'수분량(%)',$('#rMoist').textContent,'밀도(kg/m3)',$('#rDensity').textContent,'유속(m/s)',$('#rVelocity').textContent,'단면적(m2)',$('#rArea').textContent,'보정 전 유량(Sm3/min)',$('#rFlow').textContent,'산소보정 후 유량(Sm3/min)',$('#rCorrectedFlow').textContent,'등속흡인계수(%)',$('#rIso').textContent]);
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:20},...Array(15).fill({wch:14})];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,recordType==='dust'?'먼지 시료채취기록':'중금속 시료채취기록');const safe=(o.fields.company||'시료채취기록').replace(/[\\/:*?"<>|]/g,'_');XLSX.writeFile(wb,`${o.fields.receiptNo||''}_${safe}_${recordType==='dust'?'먼지':'중금속'}.xlsx`);
};

if(!$('#measureDate').value)$('#measureDate').value=new Date().toISOString().slice(0,10);
buildPointRows(1,[]);setTeam('2',0.777);syncStackShape(false);recalc();
const initial=collect();baseTemplates.dust=clone(initial);baseTemplates.dust.recordType='dust';baseTemplates.dust.fields.itemName='먼지';baseTemplates.metal=clone(initial);baseTemplates.metal.recordType='metal';baseTemplates.metal.fields.itemName='중금속';workingStates.dust=clone(baseTemplates.dust);workingStates.metal=clone(baseTemplates.metal);
$('#saveStatus').textContent='먼지 기록지 · 중금속 기록지와 독립 입력';
