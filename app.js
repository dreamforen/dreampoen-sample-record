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
$$('.team-tab').forEach(b=>b.addEventListener('click',()=>setTeam(b.dataset.team)));


function syncStackShape(clearOther=true){
  const isRound=$('#stackShape').value==='round';
  const diameter=$('#diameter'), w=$('#stackW'), h=$('#stackH');

  // 선택된 단면만 입력 가능하게 하고, 반대쪽 입력값은 즉시 비운다.
  diameter.disabled=!isRound;
  w.disabled=isRound;
  h.disabled=isRound;

  diameter.closest('label')?.classList.toggle('shape-disabled',!isRound);
  w.closest('label')?.classList.toggle('shape-disabled',isRound);
  h.closest('label')?.classList.toggle('shape-disabled',isRound);

  if(clearOther){
    if(isRound){
      w.value='';
      h.value='';
    }else{
      diameter.value='';
    }
  }
}

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
  const fractionFormula=(key,text)=>{
    const map={
      'r':'<div class="formula-wrap"><span>r₀ × 273 × (Pa + Ps/13.6)</span><span>/</span><span>(273 + θs) × 760</span></div>',
      'v':'<div class="formula-wrap"><span>C × √</span><span class="formula-fraction"><span class="num">2 × 9.81 × h</span><span class="den">r</span></span></div>',
      'Vic':'<div class="formula-wrap"><span>Vs ×</span><span class="formula-fraction"><span class="num">Xw</span><span class="den">100 − Xw</span></span><span>× 18 / 22.4</span></div>',
      'I':'<div class="formula-wrap"><span class="formula-fraction"><span class="num">Ts × [0.00346Vic + Vm/Tm × (Pa + ΔH/13.6)]</span><span class="den">P′s × t × v × An</span></span><span>× 16670</span></div>',
      'Qa':'<div class="formula-wrap"><span>A × v ×</span><span class="formula-fraction"><span class="num">273</span><span class="den">273 + θs</span></span><span>×</span><span class="formula-fraction"><span class="num">Pa + Ps/13.6</span><span class="den">760</span></span><span>× (1 − Xw/100) × 3600</span></div>',
      'Q':'<div class="formula-wrap"><span>Qa ×</span><span class="formula-fraction"><span class="num">21 − O₂</span><span class="den">21 − Os</span></span></div>',
      'An':'<div class="formula-wrap"><span>3.14 × d² / 4</span></div>',
      'A':'<div class="formula-wrap"><span>'+text+'</span></div>',
      'r₀':'<div class="formula-wrap"><span class="formula-fraction"><span class="num">(28N₂ + 44CO₂ + 32O₂) × (100−Xw)/100 + 18Xw</span><span class="den">22.4 × 100</span></span></div>'
    };
    return map[key]||`<div class="formula-wrap"><span>${text}</span></div>`;
  };
  const tb=$('#rawCalcRows'); if(tb)tb.innerHTML=rows.map((r,i)=>`<tr><th>${i+1}</th><td>${r[0]}</td><td>${r[1]}</td><td class="formula-cell">${fractionFormula(r[1],r[2])}</td><td>${r[3]}</td><td class="raw-result">${r[4]}</td><td>${r[5]}</td></tr>`).join('');
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

document.addEventListener('input',e=>{if(!applying){recalc();scheduleAutoSave()}});document.addEventListener('change',e=>{if(!applying){recalc();scheduleAutoSave()}});
$('#stackShape').addEventListener('change',()=>{
  syncStackShape(true);
  updateTraverseAndRows();
  recalc();
});
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
  if(type===recordType)return;
  workingStates[recordType]=collect();
  recordType=type;
  currentRecordId=null;
  const target=workingStates[type]||baseTemplates[type];
  apply(clone(target));
  $('#saveStatus').textContent=`${type==='dust'?'먼지':'중금속'} 기록지 · 독립 입력 · 저장할 기록을 선택하거나 새로 저장하세요`;
  renderTodayRecords();
}
$$('.seg').forEach(b=>b.addEventListener('click',()=>switchRecord(b.dataset.type)));

const RECORDS_KEY='dreampoen_sample_records_v17';
const DRAFT_KEY='dreampoen_sample_draft_v17';
let currentRecordId=null;
let autoSaveTimer=null;

function readRecordStore(){
  try{
    const v=JSON.parse(localStorage.getItem(RECORDS_KEY)||'[]');
    return Array.isArray(v)?v:[];
  }catch(e){ return []; }
}
function writeRecordStore(records){
  localStorage.setItem(RECORDS_KEY,JSON.stringify(records));
}
function makeRecordId(){
  return 'rec_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
}
function recordLabel(data){
  const f=data?.fields||{};
  return `${f.receiptNo||'접수번호 미입력'} / ${f.company||'업체명 미입력'} / ${f.facility||'시설명 미입력'}`;
}
function recordDate(data, fallback){
  return data?.fields?.measureDate || String(fallback||'').slice(0,10);
}
function renderTodayRecords(){
  const list=$('#todayRecordList'); if(!list)return;
  const today=$('#measureDate')?.value || new Date().toISOString().slice(0,10);
  const records=readRecordStore()
    .filter(r=>recordDate(r.autosaveData||r.data,r.createdAt)===today)
    .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  if(!records.length){
    list.innerHTML='<div class="record-empty">오늘 저장된 기록이 없습니다.</div>';
    return;
  }
  list.innerHTML='';
  records.forEach((r,i)=>{
    const data=r.autosaveData||r.data;
    const row=document.createElement('div');
    row.className='record-item'+(r.id===currentRecordId?' active':'');
    row.innerHTML=`<button type="button" class="record-open" data-id="${r.id}">
      <span class="record-no">${i+1}</span>
      <span class="record-main">${recordLabel(data)}</span>
      <small>${r.autosavedAt?'자동저장 '+new Date(r.autosavedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'저장 '+new Date(r.updatedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</small>
    </button>
    <button type="button" class="record-delete" data-id="${r.id}" title="기록 삭제">삭제</button>`;
    list.appendChild(row);
  });
  $$('.record-open').forEach(b=>b.onclick=()=>openSavedRecord(b.dataset.id));
  $$('.record-delete').forEach(b=>b.onclick=()=>deleteSavedRecord(b.dataset.id));
}
function openSavedRecord(id){
  const records=readRecordStore(),r=records.find(x=>x.id===id);
  if(!r)return;
  if(currentRecordId!==id) workingStates[recordType]=collect();
  currentRecordId=id;
  apply(clone(r.autosaveData||r.data));
  $('#saveStatus').textContent=`저장 기록 불러옴 · ${recordLabel(r.autosaveData||r.data)}`;
  $('#autoSaveBadge').textContent='자동저장 연결됨';
  renderTodayRecords();
}
function deleteSavedRecord(id){
  const records=readRecordStore(),r=records.find(x=>x.id===id);
  if(!r)return;
  if(!confirm(`이 기록을 삭제할까요?\n${recordLabel(r.autosaveData||r.data)}`))return;
  writeRecordStore(records.filter(x=>x.id!==id));
  if(currentRecordId===id){
    currentRecordId=null;
    $('#saveStatus').textContent='저장 기록 삭제됨 · 현재 화면은 유지됩니다.';
  }
  renderTodayRecords();
}
function manualSaveRecord(){
  const data=collect(),now=new Date().toISOString();
  let records=readRecordStore(),r=records.find(x=>x.id===currentRecordId);
  if(r){
    // 수동 저장 직전의 확정본을 1개 백업해 둔다.
    r.backup=clone(r.data);
    r.backupAt=r.updatedAt||now;
    r.data=clone(data);
    r.autosaveData=clone(data);
    r.updatedAt=now;
    r.autosavedAt=now;
  }else{
    r={id:makeRecordId(),createdAt:now,updatedAt:now,autosavedAt:now,data:clone(data),autosaveData:clone(data),backup:null,backupAt:null};
    records.push(r); currentRecordId=r.id;
  }
  writeRecordStore(records);
  localStorage.removeItem(DRAFT_KEY);
  $('#saveStatus').textContent=`기록 저장 완료 · ${recordLabel(data)}`;
  $('#autoSaveBadge').textContent='저장 완료';
  renderTodayRecords();
}
function autoSaveCurrent(){
  if(applying)return;
  const data=collect(),now=new Date().toISOString();
  if(currentRecordId){
    const records=readRecordStore(),r=records.find(x=>x.id===currentRecordId);
    if(r){
      r.autosaveData=clone(data);
      r.autosavedAt=now;
      r.updatedAt=now;
      writeRecordStore(records);
      $('#autoSaveBadge').textContent='자동저장 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      renderTodayRecords();
      return;
    }
  }
  // 아직 최초 저장 전인 새 기록도 작성 중 초안으로 보존한다.
  localStorage.setItem(DRAFT_KEY,JSON.stringify({savedAt:now,data:clone(data)}));
  $('#autoSaveBadge').textContent='작성중 자동저장';
}
function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  $('#autoSaveBadge').textContent='저장 중…';
  autoSaveTimer=setTimeout(autoSaveCurrent,700);
}
function makeFreshRecord(keepCommon=false){
  const old=collect();
  currentRecordId=null;
  const base=clone(baseTemplates[recordType]);
  if(keepCommon){
    const keep=['measureDate','manager1','manager2','engineer','weather','airTemp','humidity','locationPressure','pressure','windDir','windSpeed','pitot'];
    keep.forEach(k=>{if(old.fields?.[k]!==undefined)base.fields[k]=old.fields[k]});
    base.selectedTeam=old.selectedTeam;
  }
  apply(base);
  localStorage.removeItem(DRAFT_KEY);
  $('#saveStatus').textContent='새 기록 작성 중';
  $('#autoSaveBadge').textContent='자동저장 대기';
  renderTodayRecords();
}
function restoreBackup(){
  if(!currentRecordId)return alert('먼저 오늘 기록에서 복구할 기록을 열어주세요.');
  const records=readRecordStore(),r=records.find(x=>x.id===currentRecordId);
  if(!r?.backup)return alert('이 기록에는 이전 수동 저장본이 없습니다.');
  if(!confirm(`최근 수동 저장 이전 상태로 되돌릴까요?\n백업시각: ${r.backupAt?new Date(r.backupAt).toLocaleString():'-'}`))return;
  const current=clone(r.data);
  r.data=clone(r.backup);
  r.backup=current;
  r.updatedAt=new Date().toISOString();
  r.autosaveData=clone(r.data);
  r.autosavedAt=r.updatedAt;
  writeRecordStore(records);
  apply(clone(r.data));
  $('#saveStatus').textContent='최근 저장본으로 복구했습니다.';
  renderTodayRecords();
}

$('#btnSave').onclick=manualSaveRecord;
$('#btnNew').onclick=()=>{
  if(!confirm('같은 업체의 다음 시설을 추가할까요? 업체/날짜/담당자/기상/장비 정보는 유지하고 측정값은 새로 시작합니다.'))return;
  const old=collect();
  currentRecordId=null;
  const fresh=clone(baseTemplates[recordType]);
  const keepFields=['measureDate','company','manager1','manager2','engineer','weather','airTemp','humidity','locationPressure','pressure','windDir','windSpeed','pitot','stackShape','diameter','stackW','stackH'];
  keepFields.forEach(k=>{if(old.fields?.[k]!==undefined)fresh.fields[k]=old.fields[k]});
  fresh.selectedTeam=old.selectedTeam;
  fresh.fields.nozzleCm=old.fields?.nozzleCm||fresh.fields.nozzleCm;
  ['receiptNo','facility','filterNo','totalStart','totalEnd','particleStart','particleEnd','meterBefore','stdO2'].forEach(k=>fresh.fields[k]='');
  fresh.moist=['','','','','']; fresh.o2vals=['','','']; fresh.co2vals=['','','']; fresh.gasRows=[]; fresh.points=[];
  apply(fresh);
  const mm=traverseModel(); buildPointRows(mm.count,[]); updateTraverseAndRows();
  localStorage.removeItem(DRAFT_KEY);
  $('#saveStatus').textContent='시설추가 · 업체 공통정보 유지 · 시설명과 측정값을 입력하세요.';
  $('#autoSaveBadge').textContent='자동저장 대기';
  renderTodayRecords();
};
$('#btnRestoreBackup').onclick=restoreBackup;
$('#btnReset').onclick=()=>{
  if(confirm('현재 입력 화면만 초기화할까요? 이미 저장된 기록은 삭제되지 않습니다.'))makeFreshRecord(false);
};

function setPrintText(id,value){
  const el=document.getElementById(id);
  if(el)el.textContent=value??'';
}
function buildPrintDocument(){
  const o=collect(), c=calcCore(), tv=traverseModel();

  setPrintText('pReceipt',o.fields.receiptNo);
  setPrintText('pDate',o.fields.measureDate);
  setPrintText('pCompany',o.fields.company);
  setPrintText('pFacility',o.fields.facility);
  setPrintText('pManager1',`${o.fields.manager1||''} (인)`);
  setPrintText('pManager2',`${o.fields.manager2||''} (인)`);
  setPrintText('pEngineer',`${o.fields.engineer||''} (인)`);
  setPrintText('pTotalTime',`${o.fields.totalStart||''} ~ ${o.fields.totalEnd||''}`);
  setPrintText('pStackShape',$('#stackShape').value==='round'?'원형 ■  사각형 □':'원형 □  사각형 ■');

  setPrintText('pO2',`${$('#o2Avg').textContent} %`);
  setPrintText('pCO2',`${$('#co2Avg').textContent} %`);
  setPrintText('pOrificeCoeff',selectedTeam==='1'?'51':fmt(orificeCoeff(),1));
  setPrintText('pKFactor',$('#kFactor').textContent);
  setPrintText('pIso',`${$('#rIso').textContent} %`);
  setPrintText('pPitot',o.fields.pitot);
  setPrintText('pLeak',o.leak||'적합');
  setPrintText('pNozzle',`${o.fields.nozzleCm||''} cm`);
  setPrintText('pStackDims',$('#stackShape').value==='round'?`${o.fields.diameter||''} m`:`${o.fields.stackW||''} × ${o.fields.stackH||''} m`);
  setPrintText('pMoist',`${$('#moistAvg').textContent} %`);
  setPrintText('pMeterBefore',o.fields.meterBefore||'');
  setPrintText('pMeterAfter',$('#meterAfter').textContent);

  setPrintText('pFilterNo',o.fields.filterNo);
  setPrintText('pAirTemp',`${o.fields.airTemp||''} ℃`);
  setPrintText('pHumidity',`${o.fields.humidity||''} %`);
  setPrintText('pWind',`${o.fields.windDir||''} / ${o.fields.windSpeed||''} m/s`);
  setPrintText('pWeather',o.fields.weather);
  setPrintText('pLocPressure',`${o.fields.locationPressure||''} mmHg`);
  setPrintText('pPressure',`${o.fields.pressure||''} mmHg`);
  setPrintText('pVelocity',`${$('#rVelocity').textContent} m/s`);
  setPrintText('pFlow',`${$('#rFlow').textContent} Sm³/min`);
  setPrintText('pCorrectedFlow',`${$('#rCorrectedFlow').textContent} Sm³/min`);
  setPrintText('pArea',`${$('#rArea').textContent} m²`);
  setPrintText('pDensity',`${$('#rDensity').textContent} kg/m³`);

  // 인쇄 전용 측정점 SVG: 검은 배경/스타일 누락 방지를 위해
  // 화면 SVG의 실제 도형을 흰 배경 위에 명시적으로 복제한다.
  const visual=$('#pTraverseVisual');
  if(visual){
    visual.innerHTML='';
    const src=$('#traverseDiagram');
    if(src){
      const ns='http://www.w3.org/2000/svg';
      const out=document.createElementNS(ns,'svg');
      out.setAttribute('class','print-traverse-svg');
      out.setAttribute('viewBox',src.getAttribute('viewBox')||'0 0 520 360');
      out.setAttribute('preserveAspectRatio','xMidYMid meet');
      const bg=document.createElementNS(ns,'rect');
      bg.setAttribute('x','0');bg.setAttribute('y','0');
      bg.setAttribute('width','100%');bg.setAttribute('height','100%');
      bg.setAttribute('fill','#ffffff');
      out.appendChild(bg);
      [...src.children].forEach(node=>{
        const cp=node.cloneNode(true);
        // CSS class 의존성을 없애고 인쇄에 안전한 기본값 부여
        if(cp.tagName==='rect' && !cp.getAttribute('fill')) cp.setAttribute('fill','none');
        if(['rect','circle','line','path','polyline','polygon'].includes(cp.tagName)){
          if(!cp.getAttribute('stroke')) cp.setAttribute('stroke','#111111');
          if(!cp.getAttribute('stroke-width')) cp.setAttribute('stroke-width','2');
        }
        if(cp.tagName==='text'){
          if(!cp.getAttribute('fill')) cp.setAttribute('fill','#111111');
          cp.setAttribute('font-family','Malgun Gothic, Arial, sans-serif');
        }
        out.appendChild(cp);
      });
      visual.appendChild(out);
    }
  }
  const ptxt=(tv.values||[]).map((v,i)=>{
    if(v?.label==='중앙')return `${i+1}지점 중앙`;
    return tv.shape==='round'?`${i+1}지점 ${Number(v.dist).toFixed(3)} m`:`${i+1}지점 ${Number(v.x).toFixed(3)} × ${Number(v.y).toFixed(3)} m`;
  }).join(' / ');
  setPrintText('pTraverseText',ptxt);

  setPrintText('pParticleTitle',`2. 입자상 측정조건 (${recordType==='dust'?'먼지':'중금속'}) / 시료채취시간 : ${o.fields.particleStart||''} ~ ${o.fields.particleEnd||''}`);
  const ptb=$('#pParticleRows'); ptb.innerHTML='';
  const points=o.points||[];
  const minRows=Math.max(5,points.length);
  for(let i=0;i<minRows;i++){
    const p=points[i]||{};
    const vals=[
      i<points.length?i+1:'',p.time||'',p.temp||'',p.static||'',p.dynamic||'',
      i<points.length?($(`[data-orifice-r="${i}"]`)?.textContent||''):'',
      p.vacuum||'',p.holder||'',p.meterIn||'',p.meterOut||'',p.impinger||'',p.volume||''
    ];
    const tr=document.createElement('tr');
    tr.innerHTML=vals.map(v=>`<td>${v}</td>`).join('');
    ptb.appendChild(tr);
  }
  const pfoot=$('#pParticleFoot');
  pfoot.innerHTML=`
    <tr class="sum-row"><th>합계</th><td>${$('#sumTime').textContent}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>${$('#sumVolume').textContent}</td></tr>
    <tr class="avg-row"><th>평균</th><td></td><td>${$('#avgTemp').textContent}</td><td>${$('#avgStatic').textContent}</td><td>${$('#avgDynamic').textContent}</td><td>${$('#avgOrifice').textContent}</td><td>${$('#avgVacuum').textContent}</td><td>${$('#avgHolder').textContent}</td><td>${$('#avgMeterIn').textContent}</td><td>${$('#avgMeterOut').textContent}</td><td>${$('#avgImpinger').textContent}</td><td></td></tr>`;

  // 가스상: 실제 추가한 만큼만
  const gtb=$('#pGasRows'); gtb.innerHTML='';
  const gases=o.gasRows||[];
  if(!gases.length){
    const tr=document.createElement('tr');
    tr.innerHTML='<td>1</td><td></td><td></td><td></td><td></td><td></td><td></td>';
    gtb.appendChild(tr);
  }else{
    gases.forEach((g,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${i+1}</td><td>${g.item||''}</td><td>${g.flow||''}</td><td>${g.pressure||''}</td><td>${g.temp||''}</td><td>${g.volume||''}</td><td>${g.start||''} ~ ${g.end||''}</td>`;
      gtb.appendChild(tr);
    });
  }

  // 2page calculation
  setPrintText('pCalcReceipt',o.fields.receiptNo||'');
  const calc=$('#pCalcSections');
  const frac=(num,den)=>`<span class="p-frac"><span>${num}</span><span>${den}</span></span>`;
  const block=(num,title,formula,items,result)=>`
    <section class="p-calc-block">
      <h3>${num}. ${title}</h3>
      <div class="p-calc-formula">${formula}</div>
      <div class="p-calc-detail">${items.map(x=>`<span><b>${x[0]}</b> = ${x[1]}</span>`).join('')}</div>
      <div class="p-calc-result">${result}</div>
    </section>`;

  const Ts=273+c.avgs.temp;
  const Tm=273+avg([c.avgs.meterIn,c.avgs.meterOut].filter(v=>v!==0));
  const Vm=c.sums.volume/1000;
  const avgOrifice=parseFloat($('#avgOrifice').textContent)||0;
  const An=3.14*Math.pow(num('#nozzleCm'),2)/4;
  const vic=(c.sums.volume>0&&c.moist<100)?(c.sums.volume*c.moist*18/((100-c.moist)*22.4)):0;

  calc.innerHTML=
    block('1','수분량 (%) [자동측정법]',
      `Xw = ${frac('Xw₁ + Xw₂ + Xw₃ + Xw₄ + Xw₅','5')}`,
      [
        ['Xw₁',($('.moist')[0]?.value||'-')+' %'],['Xw₂',($('.moist')[1]?.value||'-')+' %'],
        ['Xw₃',($('.moist')[2]?.value||'-')+' %'],['Xw₄',($('.moist')[3]?.value||'-')+' %'],
        ['Xw₅',($('.moist')[4]?.value||'-')+' %']
      ],`Xw = ${$('#rMoist').textContent} %`) +
    block('2','배출가스 밀도 (kg/m³)',
      `r = r₀ × ${frac('273','273 + θs')} × ${frac('Pa + Ps/13.6','760')}`,
      [['r₀',fmt(c.r0,2)+' kg/Sm³'],['θs',fmt(c.avgs.temp,2)+' ℃'],['Pa',fmt(c.pa,2)+' mmHg'],['Ps',fmt(c.avgs.static,2)+' mmH₂O']],
      `r = ${$('#rDensity').textContent} kg/m³`) +
    block('3','표준상태 습 배출가스 밀도 (kg/Sm³)',
      `r₀ = ${frac('(28N₂ + 44CO₂ + 32O₂) × (100−Xw)/100 + 18Xw','22.4 × 100')}`,
      [['Xw',fmt(c.moist,1)+' %'],['O₂',fmt(c.o2,1)+' %'],['CO₂',fmt(c.co2,1)+' %'],['N₂',fmt(c.n2,1)+' %']],
      `r₀ = ${fmt(c.r0,2)} kg/Sm³`) +
    block('4','배출가스 유속 (m/s)',
      `v = C × √${frac('2 × 9.81 × h','r')}`,
      [['C',fmt(c.pitot,3)],['h',fmt(c.avgs.dynamic,2)+' mmH₂O'],['r',fmt(c.density,2)+' kg/m³']],
      `v = ${$('#rVelocity').textContent} m/s`) +
    block('5','채취된 물의 총량 (mL)',
      `Vic = Vs × ${frac('Xw','100 − Xw')} × ${frac('18','22.4')}`,
      [['Vs',fmt(c.sums.volume,1)+' L'],['Xw',fmt(c.moist,1)+' %']],
      `Vic = ${fmt(vic,2)} mL`) +
    block('6','등속흡입계수 (I factor, %)',
      `I = ${frac('Ts × [0.00346Vic + Vm/Tm × (Pa + ΔH/13.6)]','P′s × t × v × An')} × 16670`,
      [['Ts',fmt(Ts,2)+' K'],['Vic',fmt(vic,2)+' mL'],['Vm',fmt(Vm,4)+' m³'],['Tm',fmt(Tm,2)+' K'],['ΔH',fmt(avgOrifice,2)+' mmH₂O'],['An',fmt(An,4)+' cm²']],
      `I = ${$('#rIso').textContent} %`) +
    block('7','배출가스량 (Sm³/hr)',
      `Qa = v × A × ${frac('273','Ts')} × ${frac('Pa + Ps/13.6','760')} × (1 − Xw/100) × 3600`,
      [['v',$('#rVelocity').textContent+' m/s'],['A',$('#rArea').textContent+' m²'],['Ts',fmt(Ts,2)+' K'],['Pa',fmt(c.pa,2)+' mmHg'],['Xw',fmt(c.moist,1)+' %']],
      `Qa = ${($('#rFlow').textContent && $('#rFlow').textContent!=='-')?fmt(parseFloat($('#rFlow').textContent)*60,1):'-'} Sm³/hr  /  ${$('#rFlow').textContent} Sm³/min`)+
    (c.oxygenCorrection?block('8','산소보정 배출가스량',
      `Q = Qa × ${frac('21 − O₂','21 − Os')}`,
      [['Qa',$('#rFlow').textContent+' Sm³/min'],['O₂',fmt(c.o2,1)+' %'],['Os',fmt(c.std,1)+' %']],
      `Q = ${$('#rCorrectedFlow').textContent} Sm³/min`):'');
}
$('#btnPrint').onclick=()=>window.print();


function xlsxText(ws,addr){
  const c=ws?.[addr];
  if(!c || c.v==null)return '';
  if(c.t==='d' && c.v instanceof Date)return c.v.toISOString().slice(0,10);
  return String(c.w!=null?c.w:c.v).trim();
}
function xlsxRowText(ws,r,maxCol=14){
  const out=[];
  for(let c=0;c<maxCol;c++)out.push(xlsxText(ws,XLSX.utils.encode_cell({r:r-1,c})));
  return out;
}
function findSheetRow(ws,keyword){
  const range=XLSX.utils.decode_range(ws['!ref']||'A1:A1');
  for(let r=range.s.r+1;r<=range.e.r+1;r++){
    if(xlsxRowText(ws,r,14).join(' ').includes(keyword))return r;
  }
  return 0;
}
function normalizeExcelDate(v){
  if(!v)return '';
  const s=String(v).trim();
  const m=s.match(/(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/);
  if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  return s;
}

function importEmbeddedWebData(wb){
  const ws=wb.Sheets?.['__WEB_DATA'];
  if(!ws)return null;
  const magic=xlsxText(ws,'A1');
  if(magic!=='DREAMPOEN_WEB_RECORD_V22')return null;
  const raw=xlsxText(ws,'A2');
  if(!raw)return null;
  try{return JSON.parse(raw)}catch(e){return null}
}

function cleanLegacyNumber(v){
  if(v==null)return '';
  const s=String(v).trim();
  if(!s || /^nan$/i.test(s) || /^undefined$/i.test(s) || /^null$/i.test(s))return '';
  const n=Number(s);
  return Number.isFinite(n)?String(Number(n.toFixed(6))):'';
}
function excelSerialToTime(v){
  const n=Number(v);
  if(!Number.isFinite(n))return normalizeTimeValue(v||'');
  if(n>=0 && n<1){
    const total=Math.round(n*24*60);
    return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  }
  return normalizeTimeValue(v||'');
}
function importDfenLegacyXlsm(wb){
  // 회사에서 기존 사용 중인 DFEN 시료채취기록지:
  // 숨김 '기록부' 시트가 원시 입력값의 기준 DB 역할을 한다.
  const ws=wb.Sheets?.['기록부'];
  if(!ws)return null;

  // 양식 판별 - 다른 이름의 일반 Excel을 잘못 읽지 않도록 확인
  const title=xlsxText(ws,'A1');
  if(!String(title).includes('시료채취 기록부'))return null;

  // v35: 웹에서 출력한 동일 XLSM을 다시 올리는 경우,
  // 숨김 기록부의 AZ200에 저장한 전체 웹 상태를 우선 복원한다.
  // 이 방식은 셀 매핑으로 재구성할 때 빠지던 담당자/시간/사각치수/가스행/팀/선택값 등을 그대로 살린다.
  const embeddedState=xlsxText(ws,'AZ200');
  if(embeddedState){
    try{
      const parsed=JSON.parse(embeddedState);
      if(parsed && parsed.fields){
        parsed.recordType=parsed.recordType||'dust';
        return parsed;
      }
    }catch(e){
      console.warn('AZ200 embedded web state parse failed; legacy cell mapping fallback',e);
    }
  }

  const data=clone(baseTemplates.dust);
  data.recordType='dust';
  const f=data.fields;

  // 기본 현장정보
  f.company=xlsxText(ws,'D4');
  f.facility=xlsxText(ws,'E5');
  f.measureDate=normalizeExcelDate(xlsxText(ws,'D6'));

  // 굴뚝/기상/장비 인자
  f.pitot=cleanLegacyNumber(xlsxText(ws,'S4'));
  f.airTemp=cleanLegacyNumber(xlsxText(ws,'S5'));
  f.pressure=cleanLegacyNumber(xlsxText(ws,'S6'));
  f.locationPressure=cleanLegacyNumber(xlsxText(ws,'V7')||xlsxText(ws,'S6'));
  f.diameter=cleanLegacyNumber(xlsxText(ws,'T8'));
  f.stackShape='round';
  f.stackW=''; f.stackH='';
  f.weather=xlsxText(ws,'Y8');
  f.humidity=cleanLegacyNumber(xlsxText(ws,'Y9'));
  f.windSpeed=cleanLegacyNumber(xlsxText(ws,'Y10'));
  f.windDir=xlsxText(ws,'Y11');
  f.nozzleCm=cleanLegacyNumber(xlsxText(ws,'E8'));
  f.filterNo=xlsxText(ws,'R13');
  f.meterBefore=cleanLegacyNumber(xlsxText(ws,'Y13'));

  // O2 / CO2 / 수분 - 원본 기록부의 산출/입력값을 첫 입력칸에 복원
  data.o2vals=[cleanLegacyNumber(xlsxText(ws,'E10')),'',''];
  data.co2vals=[cleanLegacyNumber(xlsxText(ws,'D11')),'',''];
  data.moist=[cleanLegacyNumber(xlsxText(ws,'E13')),'','','',''];

  // 기존 파일의 Kf 값으로 팀을 추정하되, 노즐 preset 일치 여부를 더 우선한다.
  const noz=Number(f.nozzleCm);
  const d1=EQUIPMENT['1'].nozzles.some(x=>Math.abs(x-noz)<0.002);
  const d2=EQUIPMENT['2'].nozzles.some(x=>Math.abs(x-noz)<0.002);
  data.selectedTeam=d1&&!d2?'1':'2';

  // 입자상 지점별 원시 측정값: 기록부 18~22행
  data.points=[];
  for(let r=18;r<=22;r++){
    const pointNo=xlsxText(ws,`A${r}`);
    const hasValue=[
      xlsxText(ws,`C${r}`),xlsxText(ws,`I${r}`),xlsxText(ws,`K${r}`),
      xlsxText(ws,`O${r}`),xlsxText(ws,`Q${r}`)
    ].some(v=>String(v).trim()!=='');
    if(!hasValue)continue;
    data.points.push({
      time:cleanLegacyNumber(xlsxText(ws,`Q${r}`)),
      temp:cleanLegacyNumber(xlsxText(ws,`C${r}`)),
      static:cleanLegacyNumber(xlsxText(ws,`I${r}`)),
      dynamic:cleanLegacyNumber(xlsxText(ws,`K${r}`)),
      vacuum:cleanLegacyNumber(xlsxText(ws,`U${r}`)),
      holder:'',
      meterIn:cleanLegacyNumber(xlsxText(ws,`E${r}`)),
      meterOut:cleanLegacyNumber(xlsxText(ws,`G${r}`)),
      impinger:cleanLegacyNumber(xlsxText(ws,`S${r}`)),
      volume:cleanLegacyNumber(xlsxText(ws,`O${r}`))
    });
  }

  // 기존 기록부에는 총 시료채취시간이 합계로 존재하므로
  // 시작시간이 실제 기록된 경우에만 종료시간은 웹에서 재계산한다.
  f.particleStart='';
  f.particleEnd='';

  // 가스상 측정조건: 기록부 31~47행에서 실제 값이 있는 행만 가져온다.
  data.gasRows=[];
  for(let r=30;r<=47;r++){
    const item=(xlsxText(ws,`B${r}`)||'').trim();
    const flow=cleanLegacyNumber(xlsxText(ws,`E${r}`));
    const pressure=cleanLegacyNumber(xlsxText(ws,`I${r}`));
    const tempIn=cleanLegacyNumber(xlsxText(ws,`M${r}`));
    const tempOut=cleanLegacyNumber(xlsxText(ws,`O${r}`));
    const volume=cleanLegacyNumber(xlsxText(ws,`Q${r}`));
    if(!item && !flow && !pressure && !tempIn && !volume)continue;
    // 항목명만 기본목록으로 들어있는 빈 행은 제외
    const hasMeasured=[flow,pressure,tempIn,tempOut,volume].some(v=>String(v).trim()!=='');
    if(!hasMeasured)continue;
    data.gasRows.push({
      item:item.toUpperCase(),
      flow, pressure,
      temp: tempIn && tempOut ? String((Number(tempIn)+Number(tempOut))/2) : (tempIn||tempOut),
      volume,
      start:'',
      end:''
    });
  }

  // 원형 측정점 수/아래 입자상 행은 apply 후 기존 계산로직이 다시 맞춘다.
  return data;
}

function importWebExcelWithXLSX(wb){
  const sheetName=wb.SheetNames.find(n=>/시료채취기록지/.test(n))||wb.SheetNames[0];
  const ws=wb.Sheets[sheetName];
  if(!ws)throw new Error('시료채취기록지 시트를 찾지 못했습니다.');

  // 파일 안의 측정항목을 보고 먼지/중금속을 자동 판별
  const item=xlsxText(ws,'J5');
  const targetType=item.includes('중금속')?'metal':'dust';
  recordType=targetType;
  $$('.seg').forEach(x=>x.classList.toggle('active',x.dataset.type===recordType));

  const data=clone(baseTemplates[targetType]);
  data.recordType=targetType;
  const f=data.fields;

  f.receiptNo=xlsxText(ws,'C1');
  f.measureDate=normalizeExcelDate(xlsxText(ws,'M1'));
  f.company=xlsxText(ws,'C3');
  f.facility=xlsxText(ws,'C4');
  f.manager1=xlsxText(ws,'J4').replace(/\s*\(인\)\s*$/,'');
  const eng=xlsxText(ws,'L4')||xlsxText(ws,'M4');
  f.engineer=eng.replace(/^책임기술자\s*/,'').replace(/\s*\(인\)\s*$/,'');
  const total=xlsxText(ws,'C5').split('~').map(x=>x.trim());
  f.totalStart=normalizeTimeValue(total[0]||'');
  f.totalEnd=normalizeTimeValue(total[1]||'');

  f.weather=xlsxText(ws,'C8');
  f.airTemp=xlsxText(ws,'G8');
  f.humidity=xlsxText(ws,'K8');
  f.windDir=xlsxText(ws,'N8');
  f.locationPressure=xlsxText(ws,'C9');
  f.pressure=xlsxText(ws,'G9');
  f.windSpeed=xlsxText(ws,'K9');
  f.pitot=xlsxText(ws,'N9');

  const shape=xlsxText(ws,'C10');
  f.stackShape=shape.includes('사각')?'rect':'round';
  if(f.stackShape==='round'){
    f.diameter=xlsxText(ws,'G10'); f.stackW=''; f.stackH='';
  }else{
    f.diameter=''; f.stackW=xlsxText(ws,'G10'); f.stackH=xlsxText(ws,'K10');
  }

  const teamText=xlsxText(ws,'C11');
  data.selectedTeam=teamText.includes('1')?'1':'2';
  f.nozzleCm=xlsxText(ws,'G11');

  // 출력본은 평균값만 보관하므로 첫 입력칸에 평균값을 복원한다.
  data.o2vals=[xlsxText(ws,'C7'),'',''];
  data.co2vals=[xlsxText(ws,'G7'),'',''];
  data.moist=[xlsxText(ws,'K7'),'','','',''];
  f.filterNo=xlsxText(ws,'N7');

  // 입자상 측정조건 위치는 제목명이 바뀌어도 헤더 "포인트 / 가스온도"를 찾아서 읽는다.
  let particleHeader=0;
  const range=XLSX.utils.decode_range(ws['!ref']||'A1:N100');
  for(let r=range.s.r+1;r<=range.e.r+1;r++){
    const row=xlsxRowText(ws,r,14).join(' ');
    if(row.includes('포인트') && row.includes('가스온도')){particleHeader=r;break;}
  }
  data.points=[];
  if(particleHeader){
    const title=xlsxRowText(ws,particleHeader-1,14).join(' ');
    const tm=title.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
    if(tm){f.particleStart=normalizeTimeValue(tm[1]);f.particleEnd=normalizeTimeValue(tm[2]);}
    for(let r=particleHeader+1;r<=Math.min(range.e.r+1,particleHeader+20);r++){
      const first=xlsxText(ws,`A${r}`);
      if(!first || /평균|합계/.test(first))break;
      if(!/^\d+$/.test(first))continue;
      data.points.push({
        time:xlsxText(ws,`B${r}`),temp:xlsxText(ws,`C${r}`),static:xlsxText(ws,`D${r}`),
        dynamic:xlsxText(ws,`E${r}`),vacuum:xlsxText(ws,`G${r}`),holder:xlsxText(ws,`H${r}`),
        meterIn:xlsxText(ws,`I${r}`),meterOut:xlsxText(ws,`J${r}`),impinger:xlsxText(ws,`K${r}`),
        volume:xlsxText(ws,`L${r}`)
      });
    }
  }

  // 가스상 조건
  data.gasRows=[];
  let gasHeader=0;
  for(let r=range.s.r+1;r<=range.e.r+1;r++){
    const row=xlsxRowText(ws,r,14).join(' ');
    if(row.includes('NO') && row.includes('흡인유속') && row.includes('게이지압')){gasHeader=r;break;}
  }
  if(gasHeader){
    for(let r=gasHeader+1;r<=Math.min(range.e.r+1,gasHeader+20);r++){
      const no=xlsxText(ws,`A${r}`);
      if(!/^\d+$/.test(no))break;
      data.gasRows.push({
        item:xlsxText(ws,`B${r}`),flow:xlsxText(ws,`E${r}`),pressure:xlsxText(ws,`G${r}`),
        temp:xlsxText(ws,`I${r}`),volume:xlsxText(ws,`K${r}`),
        start:normalizeTimeValue(xlsxText(ws,`L${r}`)),end:normalizeTimeValue(xlsxText(ws,`N${r}`))
      });
    }
  }

  // 적산유량계 / 표준산소농도는 항목명을 찾아 위치와 무관하게 읽는다.
  for(let r=range.s.r+1;r<=range.e.r+1;r++){
    const row=xlsxRowText(ws,r,14);
    row.forEach((txt,c)=>{
      if(txt==='적산유량계 전(L)'){
        f.meterBefore=xlsxText(ws,XLSX.utils.encode_cell({r:r-1,c:Math.min(c+2,13)}));
      }
      if(txt==='표준산소농도'){
        f.stdO2=xlsxText(ws,XLSX.utils.encode_cell({r:r-1,c:Math.min(c+2,13)}));
      }
    });
  }
  return data;
}
$('#btnExcelImport').onclick=()=>$('#excelImportFile').click();
$('#excelImportFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{
    if(typeof XLSX==='undefined')throw new Error('XLSX 라이브러리를 불러오지 못했습니다.');
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array',cellDates:true});
    const imported=importEmbeddedWebData(wb)||importDfenLegacyXlsm(wb)||importWebExcelWithXLSX(wb);
    if(imported.recordType){
      recordType=imported.recordType;
      $$('.seg').forEach(x=>x.classList.toggle('active',x.dataset.type===recordType));
    }
    currentRecordId=null;
    apply(imported);
    workingStates[recordType]=collect();
    $('#saveStatus').textContent=`Excel/XLSM 불러오기 완료 · ${file.name} · 기존 기록부 인자값을 웹에 배치했습니다.`;
    $('#autoSaveBadge').textContent='Excel 복원됨';
    scheduleAutoSave();
    renderTodayRecords();
  }catch(err){
    console.error(err);
    alert(`Excel 불러오기에 실패했습니다.\n${err?.message||err}\n웹에서 출력한 v18 이후 Excel 파일인지 확인해주세요.`);
  }finally{
    e.target.value='';
  }
});


async function traverseSvgToPngDataUrl(){
  const svg=$('#traverseDiagram');
  if(!svg)return null;
  try{
    const cloned=svg.cloneNode(true);
    cloned.setAttribute('xmlns','http://www.w3.org/2000/svg');
    cloned.setAttribute('width','640');
    cloned.setAttribute('height','440');
    cloned.setAttribute('viewBox',svg.getAttribute('viewBox')||'0 0 320 220');
    cloned.style.background='#ffffff';

    // 외부 CSS 클래스가 이미지 변환 중 사라지지 않도록 실제 스타일을 인라인으로 복사
    const srcEls=[svg,...svg.querySelectorAll('*')];
    const dstEls=[cloned,...cloned.querySelectorAll('*')];
    srcEls.forEach((src,i)=>{
      const dst=dstEls[i]; if(!dst)return;
      const cs=getComputedStyle(src);
      ['fill','stroke','strokeWidth','strokeDasharray','opacity','fontSize','fontFamily','fontWeight','textAnchor'].forEach(k=>{
        const cssName=k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
        const val=cs.getPropertyValue(cssName);
        if(val && val!=='none' && val!=='normal')dst.style[k]=val;
      });
      if(src.tagName?.toLowerCase()==='text'){
        dst.style.fill=cs.fill&&cs.fill!=='none'?cs.fill:'#111111';
        dst.style.fontFamily='Malgun Gothic, Arial, sans-serif';
      }
    });

    const xml=new XMLSerializer().serializeToString(cloned);
    const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const img=await new Promise((resolve,reject)=>{
      const im=new Image(); im.onload=()=>resolve(im); im.onerror=reject; im.src=url;
    });
    const canvas=document.createElement('canvas');
    canvas.width=640; canvas.height=440;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,640,440);
    URL.revokeObjectURL(url);
    return canvas.toDataURL('image/png');
  }catch(err){
    console.warn('측정점 그림 PNG 변환 실패',err);
    return null;
  }
}

function excelDateSerial(iso){
  if(!iso)return '';
  const m=String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return '';
  const utc=Date.UTC(+m[1],+m[2]-1,+m[3]);
  return (utc-Date.UTC(1899,11,30))/86400000;
}
function excelTimeSerial(t){
  const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return '';
  return ((+m[1])*60+(+m[2]))/(24*60);
}
function xmlChild(parent,name,ns){
  const el=parent.ownerDocument.createElementNS(ns,name);parent.appendChild(el);return el;
}
function findXmlCell(doc,ref){
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const cells=doc.getElementsByTagNameNS(ns,'c');
  for(const c of cells)if(c.getAttribute('r')===ref)return c;
  return null;
}
function setXmlCell(doc,ref,value,kind='auto'){
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const c=findXmlCell(doc,ref); if(!c)return false;
  [...c.childNodes].forEach(n=>{if(['f','v','is'].includes(n.localName))c.removeChild(n)});

  let val=value;
  if(typeof val==='string'){
    val=val.trim();
    if(/^nan$/i.test(val)||/^undefined$/i.test(val)||/^null$/i.test(val))val='';
  }
  if(val===null||val===undefined||val===''){
    c.removeAttribute('t');
    return true;
  }

  const numeric=(kind==='number'||kind==='date'||kind==='time'||(kind==='auto'&&typeof val==='number'));
  if(numeric){
    const n=Number(val);
    if(!Number.isFinite(n)){
      c.removeAttribute('t');
      return true;
    }
    c.setAttribute('t','n');
    const v=xmlChild(c,'v',ns);v.textContent=String(n);return true;
  }
  c.setAttribute('t','inlineStr');
  const is=xmlChild(c,'is',ns),t=xmlChild(is,'t',ns);t.textContent=String(val);return true;
}
function numOrBlank(v){
  if(v===null||v===undefined||String(v).trim()==='')return '';
  const n=Number(v);return Number.isFinite(n)?n:'';
}
function cleanSignName(v){
  return String(v||'').replace(/\s*\(인\)\s*/g,' ').replace(/\s+/g,' ').trim();
}
function dataUrlBytes(dataUrl){
  if(!dataUrl)return null;
  const b64=String(dataUrl).split(',')[1]; if(!b64)return null;
  const bin=atob(b64),arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return arr;
}
async function replaceTraverseDrawing(zip,parser,serializer){
  const png=await traverseSvgToPngDataUrl();
  const bytes=dataUrlBytes(png); if(!bytes)return;
  const drawPath='xl/drawings/drawing1.xml';
  const relPath='xl/drawings/_rels/drawing1.xml.rels';
  if(!zip.file(drawPath)||!zip.file(relPath))return;
  zip.file('xl/media/traverse_generated.png',bytes);

  const xdr='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
  const a='http://schemas.openxmlformats.org/drawingml/2006/main';
  const rns='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pr='http://schemas.openxmlformats.org/package/2006/relationships';
  const ddoc=parser.parseFromString(await zip.file(drawPath).async('text'),'application/xml');
  const rdoc=parser.parseFromString(await zip.file(relPath).async('text'),'application/xml');

  // 기존 중앙 원형 그룹 도형 제거 (다른 컨트롤/이미지는 유지)
  [...ddoc.getElementsByTagNameNS(xdr,'oneCellAnchor')].forEach(anchor=>{
    const grp=anchor.getElementsByTagNameNS(xdr,'grpSp')[0];
    if(!grp)return;
    const names=[...anchor.getElementsByTagNameNS(xdr,'cNvPr')].map(x=>x.getAttribute('name'));
    const from=anchor.getElementsByTagNameNS(xdr,'from')[0];
    const col=from?.getElementsByTagNameNS(xdr,'col')[0]?.textContent;
    const row=from?.getElementsByTagNameNS(xdr,'row')[0]?.textContent;
    if(names.includes('그룹 1')||(col==='9'&&row==='9'))anchor.remove();
  });

  // 관계 추가/갱신
  let rel=[...rdoc.documentElement.children].find(x=>x.getAttribute('Target')==='../media/traverse_generated.png');
  let rid='rId2';
  if(!rel){
    const ids=[...rdoc.documentElement.children].map(x=>x.getAttribute('Id')||'');
    let n=2;while(ids.includes('rId'+n))n++;rid='rId'+n;
    rel=rdoc.createElementNS(pr,'Relationship');
    rel.setAttribute('Id',rid);
    rel.setAttribute('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
    rel.setAttribute('Target','../media/traverse_generated.png');
    rdoc.documentElement.appendChild(rel);
  }else rid=rel.getAttribute('Id');

  const el=(ns,q)=>ddoc.createElementNS(ns,q);
  const txt=(parent,ns,q,v)=>{const e=el(ns,q);e.textContent=String(v);parent.appendChild(e);return e};
  const anchor=el(xdr,'xdr:oneCellAnchor');
  const from=el(xdr,'xdr:from');anchor.appendChild(from);
  txt(from,xdr,'xdr:col',9);txt(from,xdr,'xdr:colOff',628788);txt(from,xdr,'xdr:row',9);txt(from,xdr,'xdr:rowOff',171879);
  const ext=el(xdr,'xdr:ext');ext.setAttribute('cx','3132000');ext.setAttribute('cy','2484000');anchor.appendChild(ext);
  const pic=el(xdr,'xdr:pic');anchor.appendChild(pic);
  const nv=el(xdr,'xdr:nvPicPr');pic.appendChild(nv);
  const cnv=el(xdr,'xdr:cNvPr');cnv.setAttribute('id','2001');cnv.setAttribute('name','측정점 위치 자동그림 8.7x6.9cm');nv.appendChild(cnv);
  nv.appendChild(el(xdr,'xdr:cNvPicPr'));
  const bf=el(xdr,'xdr:blipFill');pic.appendChild(bf);
  const blip=el(a,'a:blip');blip.setAttributeNS(rns,'r:embed',rid);bf.appendChild(blip);
  const stretch=el(a,'a:stretch');stretch.appendChild(el(a,'a:fillRect'));bf.appendChild(stretch);
  const sp=el(xdr,'xdr:spPr');pic.appendChild(sp);
  const geom=el(a,'a:prstGeom');geom.setAttribute('prst','rect');geom.appendChild(el(a,'a:avLst'));sp.appendChild(geom);
  sp.appendChild(el(a,'a:noFill'));
  anchor.appendChild(el(xdr,'xdr:clientData'));
  ddoc.documentElement.appendChild(anchor);

  zip.file(drawPath,serializer.serializeToString(ddoc));
  zip.file(relPath,serializer.serializeToString(rdoc));
}
async function exactTemplateExcelExport(){
  if(typeof JSZip==='undefined')throw new Error('템플릿 처리 라이브러리를 불러오지 못했습니다.');
  const resp=await fetch('./dreampoen_record_template.xlsm',{cache:'no-store'});
  if(!resp.ok)throw new Error('기존 시료채취기록지 템플릿을 찾지 못했습니다. GitHub에 template xlsm 파일도 같이 업로드해주세요.');
  const zip=await JSZip.loadAsync(await resp.arrayBuffer());
  const parser=new DOMParser(),serializer=new XMLSerializer();
  const wbDoc=parser.parseFromString(await zip.file('xl/workbook.xml').async('text'),'application/xml');
  const relDoc=parser.parseFromString(await zip.file('xl/_rels/workbook.xml.rels').async('text'),'application/xml');
  const rels={};for(const rr of relDoc.documentElement.children)rels[rr.getAttribute('Id')]=rr.getAttribute('Target');
  const sheetPath={};
  const sheets=wbDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main','sheet');
  for(const s of sheets){
    const rid=s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    let target=rels[rid]||''; if(target.startsWith('/'))target=target.slice(1); else target='xl/'+target;
    sheetPath[s.getAttribute('name')]=target.replace('xl/../','');
  }
  const recordPath=sheetPath['기록부'],formPath=sheetPath['기록지(먼지)'],calcPath=sheetPath['등속계산'];
  if(!recordPath||!formPath||!calcPath)throw new Error('템플릿 시트 구조를 확인할 수 없습니다.');
  const recordDoc=parser.parseFromString(await zip.file(recordPath).async('text'),'application/xml');
  const formDoc=parser.parseFromString(await zip.file(formPath).async('text'),'application/xml');
  const calcDoc=parser.parseFromString(await zip.file(calcPath).async('text'),'application/xml');
  const o=collect(),f=o.fields||{},pts=o.points||[],gases=o.gasRows||[],tv=traverseModel(),c=calcCore();
  const moistureVals=o.moist||[];
  const orifices=[];for(let i=0;i<pts.length;i++){const v=pointOrifice(i,c);if(Number.isFinite(v))orifices.push(v)}
  const avgOrifice=orifices.length?avg(orifices):0;
  const Ts=273+c.avgs.temp;
  const mt=[c.avgs.meterIn,c.avgs.meterOut].filter(v=>Number.isFinite(v)&&v!==0);
  const Tm=273+(mt.length?avg(mt):0);
  const Vm=c.sums.volume/1000;
  const An=Math.PI*Math.pow(num('#nozzleCm'),2)/4;
  const vic=(c.sums.volume>0&&c.moist<100)?(c.sums.volume*c.moist*18/((100-c.moist)*22.4)):0;
  const iso=numOrBlank($('#rIso').textContent);
  const qaHr=Number.isFinite(c.flow)?c.flow*60:'';
  const qHr=c.oxygenCorrection&&Number.isFinite(c.correctedFlow)?c.correctedFlow*60:'';

  // 1) 숨김 기록부: 원시 입력값만. 빈 값은 0/NaN으로 바꾸지 않는다.
  const R=(ref,val,kind='auto')=>setXmlCell(recordDoc,ref,val,kind);
  // 전체 웹 기록 상태를 숨김 기록부의 미사용 원거리 셀에 보존.
  // 같은 XLSM을 Excel 불러오기로 재업로드하면 화면이 1:1에 가깝게 복원된다.
  R('AZ200',JSON.stringify(o));
  R('D4',f.company);R('E5',f.facility);R('D6',f.measureDate);
  R('S4',numOrBlank(f.pitot),'number');R('S5',numOrBlank(f.airTemp),'number');R('S6',numOrBlank(f.pressure),'number');
  R('V7',numOrBlank(f.locationPressure||f.pressure),'number');R('E8',numOrBlank(f.nozzleCm),'number');
  if(f.stackShape==='round'){R('T8',numOrBlank(f.diameter),'number')}else{R('T8','')}
  R('Y8',f.weather);R('Y9',numOrBlank(f.humidity),'number');R('Y10',numOrBlank(f.windSpeed),'number');R('Y11',f.windDir);
  R('F9',numOrBlank($('#avgOrifice').textContent),'number');R('E10',numOrBlank($('#o2Avg').textContent),'number');R('D11',numOrBlank($('#co2Avg').textContent),'number');
  R('F12',numOrBlank($('#rIso').textContent),'number');R('E13',numOrBlank($('#moistAvg').textContent),'number');R('R13',f.filterNo);R('Y13',numOrBlank(f.meterBefore),'number');
  for(let i=0;i<5;i++){
    const p=pts[i]||{},rr=18+i;
    R(`C${rr}`,numOrBlank(p.temp),'number');R(`E${rr}`,numOrBlank(p.meterIn),'number');R(`G${rr}`,numOrBlank(p.meterOut),'number');
    R(`I${rr}`,numOrBlank(p.static),'number');R(`K${rr}`,numOrBlank(p.dynamic),'number');R(`O${rr}`,numOrBlank(p.volume),'number');
    R(`Q${rr}`,numOrBlank(p.time),'number');R(`S${rr}`,numOrBlank(p.impinger),'number');R(`U${rr}`,numOrBlank(p.vacuum),'number');
  }
  for(let i=0;i<18;i++){
    const g=gases[i]||{},rr=30+i;
    R(`B${rr}`,g.item||'');R(`E${rr}`,numOrBlank(g.flow),'number');R(`I${rr}`,numOrBlank(g.pressure),'number');
    R(`M${rr}`,numOrBlank(g.temp),'number');R(`O${rr}`,numOrBlank(g.temp),'number');R(`Q${rr}`,numOrBlank(g.volume),'number');
  }

  // 2) 실제 인쇄 기록지: 기존 셀 크기/병합/색/인쇄영역은 그대로, 값 셀만 정확히 주입.
  const F=(ref,val,kind='auto')=>setXmlCell(formDoc,ref,val,kind);
  F('G2',f.receiptNo);F('Q2',excelDateSerial(f.measureDate),'date');F('G3',f.company);F('G5',f.facility);
  const m1=cleanSignName(f.manager1),m2=cleanSignName(f.manager2),eng=cleanSignName(f.engineer);
  F('N6',m1?`${m1} (인)`:'' );F('P6',m2?`${m2} (인)`:'' );F('Q6',eng?`${eng} (인)`:'' );
  F('G7',excelTimeSerial(f.totalStart),'time');F('I7',excelTimeSerial(f.totalEnd),'time');

  F('G10',numOrBlank($('#o2Avg').textContent),'number');F('I10','%');
  F('G11',numOrBlank($('#co2Avg').textContent),'number');F('I11','%');
  F('G12',numOrBlank($('#avgOrifice').textContent),'number');
  F('G13',numOrBlank($('#kFactor').textContent),'number');
  F('G14',numOrBlank($('#rIso').textContent),'number');F('I14','%');
  F('G15',numOrBlank(f.pitot),'number');
  F('G16',numOrBlank($('#equipmentOrifice').textContent),'number');
  F('G17',numOrBlank(f.nozzleCm),'number');F('I17','cm');
  if(f.stackShape==='round'){
    F('G18',numOrBlank(f.diameter),'number');F('I18','m (원형)');F('G19','');F('I19','');
  }else{
    F('G18',numOrBlank(f.stackW),'number');F('I18','m (가로)');F('G19',numOrBlank(f.stackH),'number');F('I19','m (세로)');
  }
  F('H21',numOrBlank($('#moistAvg').textContent),'number');

  // 측정점 위치 1~5: 실제 산출된 지점 수만 표시
  for(let i=0;i<5;i++){
    const v=tv.values?.[i],rr=16+i;
    if(!v){F(`K${rr}`,'');F(`M${rr}`,'');continue}
    if(v.label==='중앙'){F(`K${rr}`,'중앙');F(`M${rr}`,'');}
    else if(tv.shape==='round'){F(`K${rr}`,numOrBlank(v.dist),'number');F(`M${rr}`,'m');}
    else{F(`K${rr}`,`${Number(v.x).toFixed(3)} × ${Number(v.y).toFixed(3)}`);F(`M${rr}`,'m');}
  }

  F('P10',f.filterNo);F('P11',f.weather);F('P12',numOrBlank(f.airTemp),'number');F('R12','℃');
  F('P13',numOrBlank(f.humidity),'number');F('R13','%');F('P14',numOrBlank(f.locationPressure),'number');F('R14','mmHg');
  F('P15',numOrBlank(f.pressure),'number');F('R15','mmHg');F('P16',f.windDir);F('P17',numOrBlank(f.windSpeed),'number');F('R17','m/s');
  F('P20',numOrBlank(f.meterBefore),'number');F('P21',numOrBlank($('#meterAfter').textContent),'number');F('P22',numOrBlank($('#meterDifference').textContent),'number');
  F('Q20',o.leak||'적합');

  // 유속/유량은 라벨 셀(J열)이 아니라 값 셀(L열)에 입력
  F('L22',numOrBlank($('#rVelocity').textContent),'number');
  F('L24',numOrBlank($('#rFlow').textContent),'number');
  // 산소보정 후 유량 값 셀은 기존 수식을 지우지 않고 등속계산 탭의 U57 값을 통해 갱신

  F('G29',excelTimeSerial(f.particleStart),'time');F('I29',excelTimeSerial(f.particleEnd),'time');
  for(let i=0;i<5;i++){
    const p=pts[i]||{},rr=32+i;
    F(`F${rr}`,numOrBlank(p.time),'number');F(`G${rr}`,numOrBlank(p.temp),'number');F(`H${rr}`,numOrBlank(p.static),'number');
    F(`I${rr}`,numOrBlank(p.dynamic),'number');F(`J${rr}`,Number.isFinite(pointOrifice(i,c))?pointOrifice(i,c):'','number');
    F(`K${rr}`,numOrBlank(p.vacuum),'number');F(`L${rr}`,numOrBlank(p.holder),'number');F(`M${rr}`,numOrBlank(p.meterIn),'number');
    F(`N${rr}`,numOrBlank(p.meterOut),'number');F(`O${rr}`,numOrBlank(p.impinger),'number');F(`P${rr}`,numOrBlank(p.volume),'number');
  }
  F('F37',numOrBlank($('#sumTime').textContent),'number');F('P37',numOrBlank($('#sumVolume').textContent),'number');
  F('G38',numOrBlank($('#avgTemp').textContent),'number');F('H38',numOrBlank($('#avgStatic').textContent),'number');F('I38',numOrBlank($('#avgDynamic').textContent),'number');
  F('J38',numOrBlank($('#avgOrifice').textContent),'number');F('K38',numOrBlank($('#avgVacuum').textContent),'number');F('L38',numOrBlank($('#avgHolder').textContent),'number');
  F('M38',numOrBlank($('#avgMeterIn').textContent),'number');F('N38',numOrBlank($('#avgMeterOut').textContent),'number');F('O38',numOrBlank($('#avgImpinger').textContent),'number');
  for(let i=0;i<18;i++){
    const g=gases[i]||{},left=i<9,rr=42+(i%9),cols=left?['F','G','H','I','J','K']:['M','N','O','P','Q','R'];
    F(`${cols[0]}${rr}`,g.item||'');F(`${cols[1]}${rr}`,numOrBlank(g.flow),'number');F(`${cols[2]}${rr}`,numOrBlank(g.pressure),'number');
    F(`${cols[3]}${rr}`,numOrBlank(g.temp),'number');F(`${cols[4]}${rr}`,numOrBlank(g.volume),'number');F(`${cols[5]}${rr}`,g.start||g.end?`${g.start||''}-${g.end||''}`:'');
  }

  // 3) 등속계산 탭: 계산 가능한 인자와 결과를 직접 채움.
  const C=(ref,val,kind='auto')=>setXmlCell(calcDoc,ref,val,kind);
  C('D2',f.receiptNo);
  C('U9',numOrBlank(c.moist),'number');
  for(let i=0;i<5;i++)C(`U${10+i}`,numOrBlank(moistureVals[i]),'number');
  C('J22',numOrBlank(c.density),'number');C('K22','kg/m³');
  C('J23',numOrBlank(c.r0),'number');C('K23','kg/Sm³');
  C('J24',numOrBlank(c.avgs.temp),'number');C('K24','℃');
  C('J25',numOrBlank(c.pa),'number');C('K25','mmHg');
  C('J26',numOrBlank(c.ps),'number');C('K26','mmHg');
  C('U22',numOrBlank(c.r0),'number');C('U23',numOrBlank(c.moist),'number');C('U24',numOrBlank(c.o2),'number');C('U25',numOrBlank(c.co2),'number');C('U26',numOrBlank(c.n2),'number');
  C('J35',numOrBlank(c.velocity),'number');C('K35','m/s');C('J36',numOrBlank(c.pitot),'number');C('J37',numOrBlank(c.avgs.dynamic),'number');C('K37','mmH₂O');C('J38',numOrBlank(c.density),'number');C('K38','kg/m³');
  C('U35',numOrBlank(vic),'number');C('U36',numOrBlank(c.sums.volume),'number');C('U37',numOrBlank(c.moist),'number');
  C('J47',iso,'number');C('K47','%');C('J48',numOrBlank(Ts),'number');C('K48','K');C('J49',numOrBlank(vic),'number');C('K49','mL');
  C('J50',numOrBlank(Vm),'number');C('K50','m³');C('J51',numOrBlank(Tm),'number');C('K51','K');C('J52',numOrBlank(c.pa),'number');C('K52','mmHg');
  C('J53',numOrBlank(avgOrifice),'number');C('K53','mmH₂O');C('J54',numOrBlank(c.pStack),'number');C('K54','mmHg');C('J55',numOrBlank(c.sums.time),'number');C('K55','min');
  C('J56',numOrBlank(c.velocity),'number');C('K56','m/s');C('J57',numOrBlank(An),'number');C('K57','cm²');
  C('U47',numOrBlank(c.velocity),'number');C('U48',numOrBlank(c.area),'number');C('U49',numOrBlank(c.avgs.temp),'number');C('U50',numOrBlank(c.pa),'number');C('U51',numOrBlank(c.ps),'number');C('U52',numOrBlank(c.moist),'number');
  C('U54',numOrBlank(qaHr),'number');C('U55',numOrBlank(c.flow),'number');C('U56',numOrBlank(qHr),'number');C('U57',c.oxygenCorrection?numOrBlank(c.correctedFlow):'','number');

  // 4) 측정점 그림: 기존 검은/정적 그룹 도형을 제거하고 웹에서 보이는 그림을 PNG로 삽입
  await replaceTraverseDrawing(zip,parser,serializer);

  zip.file(recordPath,serializer.serializeToString(recordDoc));
  zip.file(formPath,serializer.serializeToString(formDoc));
  zip.file(calcPath,serializer.serializeToString(calcDoc));

  // workbook.xml은 원본을 그대로 유지하여 매크로/수식 구조 손상을 최소화
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
  const blob=new Blob([bytes],{type:'application/vnd.ms-excel.sheet.macroEnabled.12'});
  const a=document.createElement('a'),safe=(f.company||'시료채취기록').replace(/[\\/:*?"<>|]/g,'_');
  a.href=URL.createObjectURL(blob);a.download=`${f.receiptNo||''}_${safe}_시료채취기록지.xlsm`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
$('#btnExcel').onclick=async()=>{
  try{await exactTemplateExcelExport()}
  catch(err){console.error(err);alert(`기존 양식 Excel 출력 중 오류가 발생했습니다.\n${err?.message||err}`)}
};

if(!$('#measureDate').value)$('#measureDate').value=new Date().toISOString().slice(0,10);
buildPointRows(1,[]);setTeam('2',0.777);syncStackShape(false);recalc();
const initial=collect();baseTemplates.dust=clone(initial);baseTemplates.dust.recordType='dust';baseTemplates.dust.fields.itemName='먼지';baseTemplates.metal=clone(initial);baseTemplates.metal.recordType='metal';baseTemplates.metal.fields.itemName='중금속';workingStates.dust=clone(baseTemplates.dust);workingStates.metal=clone(baseTemplates.metal);
try{
  const draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
  if(draft?.data){
    apply(clone(draft.data));
    $('#saveStatus').textContent='이전에 작성하다 닫은 초안을 자동 복구했습니다.';
    $('#autoSaveBadge').textContent='초안 복구됨';
  }else{
    $('#saveStatus').textContent='새 기록 작성 중';
  }
}catch(e){$('#saveStatus').textContent='새 기록 작성 중';}
renderTodayRecords();
