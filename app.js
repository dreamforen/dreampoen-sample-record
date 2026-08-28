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
$('#btnPrint').onclick=()=>window.print();

function excelCellText(ws,addr){
  const cell=ws.getCell(addr);
  const v=cell?.value;
  if(v==null)return '';
  if(typeof v==='object'){
    if(v.text!=null)return String(v.text);
    if(v.result!=null)return String(v.result);
    if(v.richText)return v.richText.map(x=>x.text||'').join('');
  }
  return String(v);
}
function parseTeamFromSheet(ws){
  const v=excelCellText(ws,'C11')||'';
  return v.includes('1')?'1':'2';
}
function importV18Workbook(wb){
  const ws=wb.worksheets.find(s=>/시료채취기록지/.test(s.name))||wb.worksheets[0];
  if(!ws)throw new Error('시료채취기록지 시트를 찾지 못했습니다.');

  const data=clone(baseTemplates[recordType]);
  const f=data.fields;
  f.receiptNo=excelCellText(ws,'C1');
  f.measureDate=excelCellText(ws,'M1');
  f.company=excelCellText(ws,'C3');
  f.facility=excelCellText(ws,'C4');
  f.manager1=(excelCellText(ws,'J4')||'').replace(/\s*\(인\)\s*$/,'');
  f.engineer=(excelCellText(ws,'L4')||'').replace(/^책임기술자\s*/,'').replace(/\s*\(인\)\s*$/,'');
  const total=excelCellText(ws,'C5').split('~').map(x=>x.trim());
  f.totalStart=total[0]||''; f.totalEnd=total[1]||'';

  f.weather=excelCellText(ws,'C8');
  f.airTemp=excelCellText(ws,'G8');
  f.humidity=excelCellText(ws,'K8');
  f.windDir=excelCellText(ws,'N8');
  f.locationPressure=excelCellText(ws,'C9');
  f.pressure=excelCellText(ws,'G9');
  f.windSpeed=excelCellText(ws,'K9');
  f.pitot=excelCellText(ws,'N9');

  const shape=excelCellText(ws,'C10');
  f.stackShape=shape.includes('사각')?'rect':'round';
  if(f.stackShape==='round'){
    f.diameter=excelCellText(ws,'G10'); f.stackW=''; f.stackH='';
  }else{
    f.diameter=''; f.stackW=excelCellText(ws,'G10'); f.stackH=excelCellText(ws,'K10');
  }

  const team=parseTeamFromSheet(ws);
  data.selectedTeam=team;
  f.nozzleCm=excelCellText(ws,'G11');

  // These are summary averages in the formatted Excel. Restore into first cells as a practical fallback.
  const o2=excelCellText(ws,'C7'),co2=excelCellText(ws,'G7'),moist=excelCellText(ws,'K7');
  data.o2vals=[o2,'','']; data.co2vals=[co2,'','']; data.moist=[moist,'','','',''];
  f.filterNo=excelCellText(ws,'N7');

  // Locate particle section and read until average/blank
  let particleHeaderRow=0;
  for(let r=1;r<=ws.rowCount;r++){
    const t=excelCellText(ws,`A${r}`);
    if(String(t).includes('3. 입자상')){particleHeaderRow=r+1;break;}
  }
  if(!particleHeaderRow){
    for(let r=1;r<=ws.rowCount;r++){
      const rowtxt=[...Array(14)].map((_,i)=>excelCellText(ws,`${String.fromCharCode(65+i)}${r}`)).join(' ');
      if(rowtxt.includes('포인트')&&rowtxt.includes('가스온도')){particleHeaderRow=r;break;}
    }
  }
  data.points=[];
  if(particleHeaderRow){
    const sectionText=excelCellText(ws,`A${particleHeaderRow-1}`);
    const tm=sectionText.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
    if(tm){f.particleStart=tm[1];f.particleEnd=tm[2];}
    for(let r=particleHeaderRow+1;r<=Math.min(ws.rowCount,particleHeaderRow+20);r++){
      const first=excelCellText(ws,`A${r}`);
      if(!first || /평균|합계/.test(first))break;
      if(!/^\d+$/.test(first))continue;
      data.points.push({
        time:excelCellText(ws,`B${r}`),temp:excelCellText(ws,`C${r}`),static:excelCellText(ws,`D${r}`),
        dynamic:excelCellText(ws,`E${r}`),vacuum:excelCellText(ws,`G${r}`),holder:excelCellText(ws,`H${r}`),
        meterIn:excelCellText(ws,`I${r}`),meterOut:excelCellText(ws,`J${r}`),impinger:excelCellText(ws,`K${r}`),volume:excelCellText(ws,`L${r}`)
      });
    }
  }

  // Find gas-phase section and load rows
  data.gasRows=[];
  let gasHeader=0;
  for(let r=1;r<=ws.rowCount;r++){
    const a=excelCellText(ws,`A${r}`);
    if(String(a).includes('4. 가스상')){gasHeader=r+1;break;}
  }
  if(gasHeader){
    for(let r=gasHeader+1;r<=Math.min(ws.rowCount,gasHeader+20);r++){
      const no=excelCellText(ws,`A${r}`);
      if(!/^\d+$/.test(no))break;
      data.gasRows.push({
        item:excelCellText(ws,`B${r}`),flow:excelCellText(ws,`E${r}`),pressure:excelCellText(ws,`G${r}`),
        temp:excelCellText(ws,`I${r}`),volume:excelCellText(ws,`K${r}`),
        start:excelCellText(ws,`L${r}`),end:excelCellText(ws,`N${r}`)
      });
    }
  }

  // Find final calculated block for meter/std oxygen if present
  for(let r=1;r<=ws.rowCount;r++){
    const a=excelCellText(ws,`A${r}`),e=excelCellText(ws,`E${r}`);
    if(a==='적산유량계 전(L)')f.meterBefore=excelCellText(ws,`C${r}`);
    if(e==='표준산소농도')f.stdO2=excelCellText(ws,`G${r}`);
  }

  return data;
}
$('#btnExcelImport').onclick=()=>$('#excelImportFile').click();
$('#excelImportFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{
    if(typeof ExcelJS==='undefined')throw new Error('Excel 라이브러리를 불러오지 못했습니다.');
    const buf=await file.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const imported=importV18Workbook(wb);
    currentRecordId=null;
    apply(imported);
    $('#saveStatus').textContent=`Excel 불러오기 완료 · ${file.name} · 수정 후 기록 저장 가능`;
    $('#autoSaveBadge').textContent='Excel 복원됨';
    scheduleAutoSave();
    renderTodayRecords();
  }catch(err){
    console.error(err);
    alert('Excel 불러오기에 실패했습니다. v18 이후 웹에서 출력한 시료채취기록지 Excel인지 확인해주세요.');
  }finally{
    e.target.value='';
  }
});

$('#btnExcel').onclick=async()=>{
  if(typeof ExcelJS==='undefined')return alert('Excel 출력 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.');
  const o=collect(), c=calcCore(), tv=traverseModel();
  const wb=new ExcelJS.Workbook();
  wb.creator='주식회사 드림포이엔';
  const ws=wb.addWorksheet(recordType==='dust'?'시료채취기록지(먼지)':'시료채취기록지(중금속)',{
    pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.2,right:0.2,top:0.3,bottom:0.3,header:0.1,footer:0.1}}
  });
  ws.views=[{showGridLines:false}];
  ws.columns=Array.from({length:14},(_,i)=>({width:i===0?7:11}));

  const thin={style:'thin',color:{argb:'FF4B5563'}};
  const border={top:thin,left:thin,bottom:thin,right:thin};
  const fillLabel={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9F0F7'}};
  const fillSection={type:'pattern',pattern:'solid',fgColor:{argb:'FFD7E6F3'}};
  const fillAuto={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F7FB'}};
  const center={horizontal:'center',vertical:'middle',wrapText:true};
  const left={horizontal:'left',vertical:'middle',wrapText:true};

  function styleRange(rng,fill){
    const [a,b]=rng.split(':'); const s=ws.getCell(a),e=ws.getCell(b||a);
    for(let rr=s.row;rr<=e.row;rr++)for(let cc=s.col;cc<=e.col;cc++){
      const cell=ws.getCell(rr,cc); cell.border=border; cell.alignment=center;
      cell.font={name:'맑은 고딕',size:9};
      if(fill)cell.fill=fill;
    }
  }
  function merge(rng,val,opt={}){
    ws.mergeCells(rng); styleRange(rng,opt.fill);
    const c=ws.getCell(rng.split(':')[0]); c.value=val??''; c.alignment=opt.left?left:center;
    c.font={name:'맑은 고딕',size:opt.size||9,bold:!!opt.bold};
  }
  function one(addr,val,opt={}){
    const c=ws.getCell(addr); c.value=val??''; c.border=border; c.alignment=opt.left?left:center;
    c.font={name:'맑은 고딕',size:opt.size||9,bold:!!opt.bold}; if(opt.fill)c.fill=opt.fill;
  }
  function label(rng,val){merge(rng,val,{bold:true,fill:fillLabel});}
  function section(row,val){merge(`A${row}:N${row}`,val,{bold:true,fill:fillSection,left:true,size:10});ws.getRow(row).height=21;}

  merge('A1:B2','접 수 번 호',{bold:true,fill:fillLabel});
  merge('C1:D2',o.fields.receiptNo||'',{bold:true});
  merge('E1:J2','대 기 시 료 채 취 기 록 지',{bold:true,size:16});
  merge('K1:L2','측 정 날 짜',{bold:true,fill:fillLabel});
  merge('M1:N2',o.fields.measureDate||'',{bold:true});

  label('A3:B3','업 체 명'); merge('C3:G3',o.fields.company||'',{left:true});
  label('H3:I3','측 정 대 행 기 관'); merge('J3:N3','주식회사 드림포이엔',{bold:true});
  label('A4:B4','시 설 명'); merge('C4:G4',o.fields.facility||'',{left:true});
  label('H4:I4','시료채취자'); merge('J4:K4',`${o.fields.manager1||''} (인)`);
  merge('L4:N4',`책임기술자 ${o.fields.engineer||''} (인)`);
  label('A5:B5','총 채취시간'); merge('C5:G5',`${o.fields.totalStart||''} ~ ${o.fields.totalEnd||''}`);
  label('H5:I5','측정항목'); merge('J5:N5',recordType==='dust'?'먼지':'중금속');

  section(6,'1. 일반사항');
  const gen=[
    ['A7:B7','산소 평균 (%)','C7:D7',$('#o2Avg').textContent],
    ['E7:F7','CO₂ 평균 (%)','G7:H7',$('#co2Avg').textContent],
    ['I7:J7','수분 평균 (%)','K7:L7',$('#moistAvg').textContent],
    ['M7:M7','여지번호','N7:N7',o.fields.filterNo],
    ['A8:B8','기상','C8:D8',o.fields.weather],
    ['E8:F8','기온 (℃)','G8:H8',o.fields.airTemp],
    ['I8:J8','습도 (%)','K8:L8',o.fields.humidity],
    ['M8:M8','풍향','N8:N8',o.fields.windDir],
    ['A9:B9','측정위치 대기압','C9:D9',o.fields.locationPressure],
    ['E9:F9','대기압 (mmHg)','G9:H9',o.fields.pressure],
    ['I9:J9','풍속','K9:L9',o.fields.windSpeed],
    ['M9:M9','피토관계수','N9:N9',o.fields.pitot],
    ['A10:B10','굴뚝단면','C10:D10',$('#stackShape').value==='round'?'원형':'사각형'],
    ['E10:F10','내경/가로 (m)','G10:H10',$('#stackShape').value==='round'?o.fields.diameter:o.fields.stackW],
    ['I10:J10','세로 (m)','K10:L10',$('#stackShape').value==='rect'?o.fields.stackH:'-'],
    ['M10:M10','오리피스계수','N10:N10',selectedTeam==='1'?51:47.6],
    ['A11:B11','측정팀','C11:D11',selectedTeam+'팀'],
    ['E11:F11','노즐직경 (cm)','G11:H11',o.fields.nozzleCm],
    ['I11:J11','K-factor','K11:L11',$('#kFactor').textContent],
    ['M11:M11','등속흡인계수','N11:N11',$('#rIso').textContent+' %']
  ];
  gen.forEach(x=>{label(x[0],x[1]);merge(x[2],x[3]);});

  section(12,'2. 측정점 위치');
  const posText=(tv.values||[]).map((v,i)=>{
    if(v?.label==='중앙')return `${i+1}지점 중앙`;
    return tv.shape==='round'?`${i+1}지점 ${Number(v.dist).toFixed(3)} m`:`${i+1}지점 ${Number(v.x).toFixed(3)} × ${Number(v.y).toFixed(3)} m`;
  }).join(' / ');
  merge('A13:N13',`${tv.summary||''}${posText?' | '+posText:''}`,{left:true});

  section(14,`3. 입자상 측정조건 / 시료채취시간 ${o.fields.particleStart||''} ~ ${o.fields.particleEnd||''}`);
  const hdr=['포인트','시간','가스온도','정압','동압','오리피스압차','진공압','홀더온도','미터In','미터Out','임핀저','채취량'];
  hdr.forEach((h,i)=>one(`${String.fromCharCode(65+i)}15`,h,{bold:true,fill:fillLabel}));
  merge('M15:N15','비고',{bold:true,fill:fillLabel});
  const pts=o.points||[], count=Math.max(5,pts.length);
  for(let i=0;i<count;i++){
    const r=16+i,p=pts[i]||{};
    const vals=[i<pts.length?i+1:'',p.time||'',p.temp||'',p.static||'',p.dynamic||'',i<pts.length?($(`[data-orifice-r="${i}"]`)?.textContent||''):'',p.vacuum||'',p.holder||'',p.meterIn||'',p.meterOut||'',p.impinger||'',p.volume||''];
    vals.forEach((v,j)=>one(`${String.fromCharCode(65+j)}${r}`,v,{fill:j===5?fillAuto:null}));
    merge(`M${r}:N${r}`,'');
  }
  const sr=16+count;
  one(`A${sr}`,'평균/합계',{bold:true,fill:fillLabel});
  const sums=[$('#sumTime').textContent,$('#avgTemp').textContent,$('#avgStatic').textContent,$('#avgDynamic').textContent,$('#avgOrifice').textContent,$('#avgVacuum').textContent,$('#avgHolder').textContent,$('#avgMeterIn').textContent,$('#avgMeterOut').textContent,$('#avgImpinger').textContent,$('#sumVolume').textContent];
  sums.forEach((v,j)=>one(`${String.fromCharCode(66+j)}${sr}`,v,{bold:true,fill:fillAuto}));
  merge(`M${sr}:N${sr}`,'',{fill:fillAuto});

  const gasStart=sr+1; section(gasStart,'4. 가스상 측정조건');
  merge(`A${gasStart+1}:A${gasStart+1}`,'NO',{bold:true,fill:fillLabel});
  merge(`B${gasStart+1}:D${gasStart+1}`,'항목',{bold:true,fill:fillLabel});
  merge(`E${gasStart+1}:F${gasStart+1}`,'흡인유속',{bold:true,fill:fillLabel});
  merge(`G${gasStart+1}:H${gasStart+1}`,'게이지압',{bold:true,fill:fillLabel});
  merge(`I${gasStart+1}:J${gasStart+1}`,'미터온도',{bold:true,fill:fillLabel});
  one(`K${gasStart+1}`,'채취량',{bold:true,fill:fillLabel});one(`L${gasStart+1}`,'시작',{bold:true,fill:fillLabel});one(`M${gasStart+1}`,'~',{bold:true,fill:fillLabel});one(`N${gasStart+1}`,'종료',{bold:true,fill:fillLabel});
  const gases=o.gasRows||[], gc=Math.max(3,gases.length);
  for(let i=0;i<gc;i++){
    const r=gasStart+2+i,g=gases[i]||{};
    one(`A${r}`,i<gases.length?i+1:'');merge(`B${r}:D${r}`,g.item||'',{left:true});merge(`E${r}:F${r}`,g.flow||'');merge(`G${r}:H${r}`,g.pressure||'');merge(`I${r}:J${r}`,g.temp||'');one(`K${r}`,g.volume||'');one(`L${r}`,g.start||'');one(`M${r}`,i<gases.length?'~':'');one(`N${r}`,g.end||'');
  }

  const cr=gasStart+2+gc; section(cr,'5. 적산유량계 / 누출검사 / 자동 산출값');
  const blocks=[
    ['A'+(cr+1)+':B'+(cr+1),'적산유량계 전(L)','C'+(cr+1)+':D'+(cr+1),o.fields.meterBefore],
    ['E'+(cr+1)+':F'+(cr+1),'적산유량계 후(L)','G'+(cr+1)+':H'+(cr+1),$('#meterAfter').textContent],
    ['I'+(cr+1)+':J'+(cr+1),'누출검사','K'+(cr+1)+':N'+(cr+1),o.leak],
    ['A'+(cr+2)+':B'+(cr+2),'배출가스 밀도','C'+(cr+2)+':D'+(cr+2),$('#rDensity').textContent+' kg/m³'],
    ['E'+(cr+2)+':F'+(cr+2),'평균 유속','G'+(cr+2)+':H'+(cr+2),$('#rVelocity').textContent+' m/s'],
    ['I'+(cr+2)+':J'+(cr+2),'굴뚝 단면적','K'+(cr+2)+':N'+(cr+2),$('#rArea').textContent+' m²'],
    ['A'+(cr+3)+':B'+(cr+3),'보정 전 유량','C'+(cr+3)+':D'+(cr+3),$('#rFlow').textContent+' Sm³/min'],
    ['E'+(cr+3)+':F'+(cr+3),'표준산소농도','G'+(cr+3)+':H'+(cr+3),o.fields.stdO2||'-'],
    ['I'+(cr+3)+':J'+(cr+3),'산소보정 후 유량','K'+(cr+3)+':N'+(cr+3),$('#rCorrectedFlow').textContent+' Sm³/min']
  ];
  blocks.forEach(b=>{label(b[0],b[1]);merge(b[2],b[3],{fill:fillAuto});});
  ws.pageSetup.printArea=`A1:N${cr+3}`;

  const raw=wb.addWorksheet('산출근거(로우데이터)',{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  raw.views=[{showGridLines:false}];raw.columns=[{width:5},{width:19},{width:8},{width:34},{width:30},{width:13},{width:10}];
  raw.addRow(['No.','항목','기호','산출식 / 근거','대입값','산출값','단위']);
  $$('#rawCalcRows tr').forEach(tr=>raw.addRow([...tr.children].map(td=>td.textContent.trim())));
  raw.addRow([]);raw.addRow(['지점별 원시 측정값']);raw.addRow(['지점','시간(min)','가스온도','정압','동압','오리피스압차','채취량(L)']);
  (o.points||[]).forEach((p,i)=>raw.addRow([i+1,p.time,p.temp,p.static,p.dynamic,$(`[data-orifice-r="${i}"]`)?.textContent||'',p.volume]));
  for(let r=1;r<=raw.rowCount;r++)raw.getRow(r).eachCell({includeEmpty:true},cell=>{cell.border=border;cell.alignment=center;cell.font={name:'맑은 고딕',size:9};});
  raw.getRow(1).font={name:'맑은 고딕',size:9,bold:true};raw.getRow(1).fill=fillSection;

  const buf=await wb.xlsx.writeBuffer(), blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'),safe=(o.fields.company||'시료채취기록').replace(/[\\/:*?"<>|]/g,'_');
  a.href=URL.createObjectURL(blob);a.download=`${o.fields.receiptNo||''}_${safe}_${recordType==='dust'?'먼지':'중금속'}_시료채취기록지.xlsx`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
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
