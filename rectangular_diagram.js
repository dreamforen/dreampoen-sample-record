/* DREAMFOREN Beta 3.7 · rectangular diagram / particle point sync 2026-09-29.
 * ES 01301.1e 5.4.2 / Table 2 / 5.4.2.2.
 * One representative line drives both the diagram and particle input rows.
 */
(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const defaults={dfRectDirection:'',dfRectSymmetry:'',dfRectLine:'1'};
  const escapeText=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short=n=>String(Number(Number(n).toFixed(3)));
  const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
  const ceil=n=>Math.max(1,Math.ceil(n-1e-10));
  const even=n=>n%2?n+1:n;
  let reserve={};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const scopeKey=scope=>scope.type==='combo'?`combo:${scope.mode==='metal'?'metal':'dust'}`:scope.type==='metal'?'metal':'dust';
  const hasReading=row=>row&&Object.values(row).some(value=>String(value??'').trim()!=='');

  // Create controls before app.js collects/restores the initial record.
  function createControls(){
    const svg=byId('traverseDiagram'),box=svg?.parentElement;
    if(!box||byId('dfRectDiagramControls'))return;
    const style=document.createElement('style');
    style.id='dfRectDiagramStyle';
    style.textContent=`
      #dfRectDiagramControls[hidden],#dfRectDiagramNote[hidden]{display:none!important}
      #dfRectDiagramControls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:7px 0;text-align:left}
      #dfRectDiagramControls label{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:11px;font-weight:500;color:#475569}
      #dfRectDiagramControls label:last-child{grid-column:1/-1}
      #dfRectDiagramControls select{width:100%;min-width:0;height:30px;padding:3px 5px;font-size:11px;background:#fff;color:#243247;border:1px solid #cbd5e1;border-radius:5px}
      #dfRectDiagramNote{margin:4px 0 0;font-size:10px;line-height:1.5;text-align:left;color:#64748b;overflow-wrap:anywhere}
      #dfRectDiagramNote .df-rect-difference{display:block;color:#9a5b16;margin-top:3px}
      @media print{#dfRectDiagramControls,#dfRectDiagramNote{display:none!important}}
    `;
    document.head.appendChild(style);
    const controls=document.createElement('div');
    controls.id='dfRectDiagramControls';controls.hidden=true;
    controls.innerHTML=`
      <label>굴뚝 방향<select id="dfRectDirection"><option value="">방향 선택</option><option value="vertical">수직굴뚝</option><option value="horizontal">수평굴뚝</option></select></label>
      <label>대표점 감축 조건<select id="dfRectSymmetry"><option value="">유속 대칭 미확인 · 감축 안 함</option><option value="asymmetric">유속 비대칭 · 감축 안 함</option><option value="confirmed">유속 대칭 확인 · 감축</option></select></label>
      <label>표시할 측정선 1개<select id="dfRectLine">${Array.from({length:200},(_,i)=>`<option value="${i+1}">${i+1}번 측정선</option>`).join('')}</select></label>`;
    const note=document.createElement('div');note.id='dfRectDiagramNote';note.hidden=true;
    box.insertBefore(controls,svg);box.appendChild(note);
  }

  function settings(){
    return Object.fromEntries(Object.entries(defaults).map(([id,value])=>[id,byId(id)?.value||value]));
  }

  // A single plan supplies the diagram, insertion distances, and input row count.
  function plan(model,config){
    const A=Number(model?.A),B=Number(model?.B);
    if(!positive(A)||!positive(B))return null;
    // User convention: always draw the side port on the right, with B as
    // insertion depth (0.7 × 1.2 -> depth 1.2), never rotate by the longer side.
    const depthAxis='B',depth=B,cross=A,area=A*B;
    const direction=['vertical','horizontal'].includes(config.dfRectDirection)?config.dfRectDirection:'';
    const reduced=area>0.25&&!!direction&&config.dfRectSymmetry==='confirmed';
    const maxL=area<=1?0.5:area<=4?0.667:1;
    let nDepth=1,nCross=1;
    if(area>0.25&&area<=20){
      nDepth=ceil(depth/maxL);nCross=ceil(cross/maxL);
      while(nDepth*nCross<4){
        const dScore=Math.abs(Math.log((depth/(nDepth+1))/(cross/nCross)));
        const cScore=Math.abs(Math.log((depth/nDepth)/(cross/(nCross+1))));
        if(dScore<=cScore)nDepth++;else nCross++;
      }
      // A symmetric reduction needs equal represented areas on both sides.
      // Use an even full grid, never round a fractional reduced point count.
      if(reduced){nDepth=even(nDepth);if(direction==='vertical')nCross=even(nCross);}
    }else if(area>20){
      // The standard permits up to 20 equal-area cells above 20 m².
      const pairs=[[1,20],[2,10],[4,5],[5,4],[10,2],[20,1]].filter(([d,c])=>
        !reduced||(d%2===0&&(direction!=='vertical'||c%2===0)));
      pairs.sort((a,b)=>Math.abs(Math.log((depth/a[0])/(cross/a[1])))-Math.abs(Math.log((depth/b[0])/(cross/b[1]))));
      [nDepth,nCross]=pairs[0];
    }
    if(nDepth>200||nCross>200)return {unsupported:true,direction,depth,cross};
    const count=reduced?nDepth/2:nDepth;
    const lines=reduced&&direction==='vertical'?nCross/2:nCross;
    const requested=Number(config.dfRectLine);
    const line=Math.max(1,Math.min(lines,Number.isFinite(requested)?Math.floor(requested):1));
    const crossPosition=(line-0.5)*cross/nCross;
    const distances=Array.from({length:count},(_,i)=>(i+0.5)*depth/nDepth);
    return {direction,depthAxis,depth,cross,area,maxL,nDepth,nCross,reduced,line,lines,
      crossPosition,distances,fullCount:nDepth*nCross,plannedCount:count*lines,small:area<=0.25};
  }

  function updateOptions(model,config,p){
    const symmetry=byId('dfRectSymmetry');if(symmetry)symmetry.disabled=!config.dfRectDirection||!!p?.small;
    const select=byId('dfRectLine');
    if(select){
      const lines=p&&!p.unsupported?p.lines:1;
      const options=Array.from({length:lines},(_,i)=>{
        const offset=p&&!p.unsupported?(i+0.5)*p.cross/p.nCross:0;
        const anchor=p?.direction==='horizontal'?'바닥':'도면 아래';
        return `<option value="${i+1}">${i+1}번${offset?` · ${anchor} ${short(offset)}m`:''}</option>`;
      }).join('');
      if(select.innerHTML!==options)select.innerHTML=options;
      select.value=String(p?.line||1);select.disabled=lines===1;
    }
  }

  function tableDistances(model,axis){
    return (model.values||[]).map(v=>{
      if(v?.label==='중앙')return (axis==='A'?Number(model.A):Number(model.B))/2;
      if(Number.isFinite(Number(v?.insertionDistance)))return Number(v.insertionDistance);
      return Number(axis==='A'?v?.x:v?.y);
    });
  }

  function measurementModel(source){
    if(source?.shape!=='rect'||byId('proficiencyMode')?.checked)return null;
    const p=plan(source,settings());
    // Opening a legacy record must not silently reinterpret its stored layout.
    if(!p||p.unsupported||!p.direction)return null;
    const values=p.distances.map(distance=>({x:p.crossPosition,y:distance,dist:distance,insertionDistance:distance,insertionAxis:'B',...(p.small?{label:'중앙'}:{})}));
    return {...source,dfRectPlan:true,count:values.length,legalCount:p.plannedCount,
      fullGridCount:p.fullCount,values,area:p.area,nA:p.nCross,nB:p.nDepth,maxL:p.maxL,
      representativeLine:!p.small,insertionAxis:'B',insertionLength:p.depth,
      insertionDivisions:p.nDepth,insertionDistances:p.distances,
      summary:`단면적 ${p.area.toFixed(3)} m² · ${p.nDepth} × ${p.nCross} 구획 · ${p.small?'소규모 중심':p.reduced?(p.direction==='vertical'?'대칭 1/4 적용':'대칭 좌우 1/2 적용'):'감축 미적용'} · 전체 계획 ${p.plannedCount}점 · 대표 측정선 ${p.line}/${p.lines} · 입력 ${values.length}포인트`};
  }

  // Keep rows removed by a count reduction outside active measurements/calculations.
  // The bank belongs to the current record, with separate dust/metal combo slots.
  function resizePoints(count,points,scope){
    if(!scope?.rect)return points;
    const key=scopeKey(scope),old=reserve[key]||[],data=Array.isArray(points)?points:[];
    if(!data.length&&!old.length)return points;
    const merged=Array.from({length:Math.max(count,data.length,old.length)},(_,i)=>copy(data[i]??old[i]??{}));
    const tail=merged.map((row,i)=>i>=count&&hasReading(row)?row:null);
    while(tail.length&&tail.at(-1)===null)tail.pop();
    if(tail.length)reserve[key]=tail;else delete reserve[key];
    return merged.slice(0,count);
  }

  function pointReserve(){return Object.keys(reserve).length?copy(reserve):undefined;}

  function seedReserve(source,type){
    const rows=source?.rectPointReserve?.[scopeKey({type:source?.recordType,mode:source?.comboParticleMode})];
    if(!Array.isArray(rows))return undefined;
    return type==='combo'?{'combo:dust':copy(rows),'combo:metal':copy(rows)}:{[type==='metal'?'metal':'dust']:copy(rows)};
  }

  function loadRecord(record){
    reserve={};
    for(const key of ['dust','metal','combo:dust','combo:metal']){
      const rows=record?.rectPointReserve?.[key];
      if(Array.isArray(rows))reserve[key]=copy(rows);
    }
    Object.entries(defaults).forEach(([id,value])=>{
      const el=byId(id);if(!el)return;
      const stored=String(record?.fields?.[id]??value);
      if(id==='dfRectLine'&&!Array.from(el.options).some(o=>o.value===stored)){
        const option=document.createElement('option');option.value=stored;option.textContent=stored;el.appendChild(option);
      }
      el.value=stored;
    });
  }

  function requireExcelCapacity(model,format='Excel'){
    if(model?.dfRectPlan&&Number(model.count)>5){
      throw new Error(`현재 대표 측정선은 ${model.count}포인트입니다. 기존 ${format} 양식은 5포인트까지 지원하므로, 누락을 방지하기 위해 출력을 중단했습니다. 추가 포인트용 양식이 필요합니다.`);
    }
  }

  function draw(svg,p){
    const text=(x,y,body,size=10,anchor='middle')=>`<text x="${x}" y="${y}" font-family="Malgun Gothic,Arial,sans-serif" font-size="${size}" fill="#233247" text-anchor="${anchor}">${escapeText(body)}</text>`;
    const line=(x1,y1,x2,y2,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#73839a" stroke-width="0.8" ${extra}/>`;
    const scale=Math.min(190/p.depth,120/p.cross),W=p.depth*scale,H=p.cross*scale;
    const x0=(268-W)/2,y0=30+(120-H)/2,right=x0+W,bottom=y0+H;
    const portY=bottom-p.crossPosition/p.cross*H,portX=right+18;
    let body=text(160,13,`${p.direction==='vertical'?'수직굴뚝 · 수평 단면':p.direction==='horizontal'?'수평굴뚝 · 수직 단면':'굴뚝 방향 미선택'} · 대표선 도식`,10);
    body+=`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#ffffff" stroke="#25374d" stroke-width="1.4"/>`;
    if(p.reduced){
      const rh=p.direction==='vertical'?H/2:H;
      body+=`<rect x="${x0+W/2}" y="${bottom-rh}" width="${W/2}" height="${rh}" fill="#e9f2fb" stroke="none"/>`;
    }
    for(let i=1;i<p.nDepth;i++)body+=line(x0+W*i/p.nDepth,y0,x0+W*i/p.nDepth,bottom,'class="df-rect-grid" stroke-dasharray="3 3"');
    for(let i=1;i<p.nCross;i++)body+=line(x0,y0+H*i/p.nCross,right,y0+H*i/p.nCross,'class="df-rect-grid" stroke-dasharray="3 3"');
    body+=line(right,portY,portX,portY,'class="df-rect-port-neck"');
    body+=`<circle cx="${portX+5}" cy="${portY}" r="5" fill="#ffffff" stroke="#25374d" stroke-width="1.2" class="df-rect-port"/>`;
    body+=text(portX+14,portY+3,'측정구',9,'start');
    body+=line(portX-2,portY-13,right-12,portY-13);
    body+=`<path d="M ${right-12} ${portY-13} l 6 -3 v 6 Z" fill="#4b637f" stroke="none"/>`;
    p.distances.forEach((distance,i)=>{
      const x=right-distance/p.depth*W;
      body+=`<circle class="df-rect-point" data-depth="${distance}" data-cross="${p.crossPosition}" cx="${x}" cy="${portY}" r="3.8" fill="#176b95" stroke="#176b95" stroke-width="0.7"/>`;
      body+=text(x,portY-7,String(i+1),9);
    });
    body+=text(x0+W/2,24,`삽입깊이 ${short(p.depth)} m`,9);
    body+=`<text x="${x0-9}" y="${y0+H/2}" transform="rotate(-90 ${x0-9} ${y0+H/2})" font-family="Malgun Gothic,Arial,sans-serif" font-size="9" fill="#233247" text-anchor="middle">${p.direction==='horizontal'?'높이':'교차폭'} ${short(p.cross)} m</text>`;
    body+=text(160,169,`${p.nDepth}×${p.nCross} 구획 · ${p.small?'소규모 중심':p.reduced?(p.direction==='vertical'?'대칭 1/4 적용':'대칭 좌우 1/2 적용'):'감축 미적용'}`,9);
    body+=text(160,184,`측정선 ${p.line}/${p.lines} · 표시 ${p.distances.length}점 / 전체 계획 ${p.plannedCount}점`,9);
    const distanceText=p.distances.length<=8?`내벽부터 ${p.distances.map(short).join(' / ')} m`:`내벽부터 ${short(p.distances[0])} ~ ${short(p.distances.at(-1))} m`;
    body+=text(160,199,distanceText,9);
    body+=text(160,213,p.lines>1?'다른 측정선은 생략 표시':'선택한 측정선의 측정점',8);
    svg.innerHTML=body;
    svg.dataset.dfRectDiagram='beta372';
    svg.dataset.dfRectDirection=p.direction;
    svg.dataset.dfRectDepthAxis=p.depthAxis;
    svg.dataset.dfRectLine=String(p.line);
    svg.dataset.dfRectDistances=p.distances.map(short).join(',');
    svg.setAttribute('aria-label',`${p.direction==='vertical'?'수직':p.direction==='horizontal'?'수평':'방향 미선택'} 사각형 굴뚝 대표 측정선 ${p.line}/${p.lines}, 내벽 기준 ${p.distances.map(short).join(', ')} 미터, 전체 계획 ${p.plannedCount}점 중 ${p.distances.length}점 표시`);
  }

  function render(model){
    const svg=byId('traverseDiagram');if(!svg)return;
    const config=settings(),p=plan(model,config);
    updateOptions(model,config,p);
    const note=byId('dfRectDiagramNote');
    if(note)note.textContent=config.dfRectDirection
      ?'선택한 대표 측정선의 점 수를 입자상 측정조건에 적용합니다. 줄어든 행은 계산에서 제외하고 보관하며, 다시 늘리면 복원합니다. 조건 변경 후 유지된 측정값과 삽입거리를 확인하세요.'
      :'굴뚝 방향을 선택하면 그림과 입자상 측정조건이 연동됩니다. 방향 미선택 기록의 입력표는 기존 산정값을 유지합니다.';
    if(!p||p.unsupported){
      svg.innerHTML=`<text x="160" y="110" text-anchor="middle" font-size="11" fill="#64748b">${!p?'굴뚝의 두 단면 치수를 입력하세요':'구획이 매우 많아 도면 별도 검토가 필요합니다'}</text>`;
      svg.setAttribute('aria-label',!p?'사각형 굴뚝 치수 입력 대기':'사각형 구획 별도 검토 필요');
      return;
    }
    draw(svg,p);
    const existing=tableDistances(model,p.depthAxis);
    if(note&&!model.dfRectPlan&&(existing.length!==p.distances.length||existing.some((v,i)=>!Number.isFinite(v)||Math.abs(v-p.distances[i])>0.00001))){
      const difference=document.createElement('span');difference.className='df-rect-difference';
      difference.textContent='현재 그림과 기존 입력표의 배치가 다릅니다. 굴뚝 방향을 선택해 연동하세요.';note.appendChild(difference);
    }
    if(note&&byId('proficiencyMode')?.checked)note.append(' 숙련도 시험용은 수동 포인트 수를 우선합니다.');
    if(note&&config.dfRectSymmetry==='asymmetric')note.append(' 비대칭 유속은 비대칭 방향의 추가 세분 여부를 별도로 검토하세요.');
    if(note&&model.dfRectPlan&&model.count>5)note.append(' 현재 포인트 수는 기존 Excel·미리보기 양식의 5포인트 범위를 초과합니다.');
  }

  function install(){
    const base=window.renderTraverseDiagram;
    if(typeof base==='function'&&!base._dfRectDiagramOnly){
      const wrapped=function(model){
        const rect=model?.shape==='rect';
        const controls=byId('dfRectDiagramControls'),note=byId('dfRectDiagramNote');
        if(controls)controls.hidden=!rect;if(note)note.hidden=!rect;
        if(rect)return render(model);
        const svg=byId('traverseDiagram');
        if(svg){
          Object.keys(svg.dataset).filter(k=>k.startsWith('dfRect')).forEach(k=>delete svg.dataset[k]);
          svg.setAttribute('aria-label','굴뚝 단면 측정점 자동 표시');
        }
        return base.apply(this,arguments);
      };
      wrapped._dfRectDiagramOnly=true;
      // Older patches retry asynchronously; do not allow them to recenter this SVG.
      wrapped._dfV12037193=true;wrapped._dfV12037194=true;
      window.renderTraverseDiagram=wrapped;
    }
    if(typeof window.traverseModel==='function')window.renderTraverseDiagram?.(window.traverseModel());
  }

  createControls();
  // Dedicated listeners redraw only; app.js already owns record autosave.
  byId('dfRectDiagramControls')?.addEventListener('change',()=>{
    if(typeof window.traverseModel==='function')window.renderTraverseDiagram?.(window.traverseModel());
  });
  window.DF_RECTANGULAR_DIAGRAM={plan,settings,install,measurementModel,resizePoints,pointReserve,loadRecord,seedReserve,requireExcelCapacity};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
