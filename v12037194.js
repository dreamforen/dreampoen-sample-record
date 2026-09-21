/* DREAMFOREN v120.37.22.4 · RECTANGULAR TRAVERSE CALCULATION */
(function dfV12037194RectangularTraverseCalculation(){
  'use strict';

  const VERSION='v120.37.22.4';
  const VERSION_LABEL=`ONLINE ${VERSION} · RECTANGULAR TRAVERSE CALC`;
  let versionObserver=null;

  const byId=id=>document.getElementById(id);
  const finite=value=>Number.isFinite(Number(value));
  const cleanNumber=value=>{
    const number=Number(value);
    return Number.isFinite(number)?number:0;
  };
  const fixed=value=>cleanNumber(value).toFixed(3);
  const short=value=>fixed(value).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');

  /*
   * 사각 단면의 전체 격자는 기존 공정시험기준 산정값을 유지한다.
   * 현장 기록지에는 측정구에서 삽입하는 한 측정선의 지점만 표시하므로,
   * 짧은 방향의 행을 대표 1개 행으로 취하고 삽입 방향의 구획 수는 줄이지 않는다.
   *
   * 예: 0.8 × 1.5 m, L <= 0.667 m
   * 전체 2 × 3 = 6점 / 대표 측정선 3점 / 내벽 기준 0.25, 0.75, 1.25 m
   */
  function correctRectangularModel(source){
    if(!source||source.shape!=='rect'||cleanNumber(source.area)<=0.25)return source;
    const A=cleanNumber(source.A),B=cleanNumber(source.B);
    const nA=Math.max(1,Math.round(cleanNumber(source.nA)||1));
    const nB=Math.max(1,Math.round(cleanNumber(source.nB)||1));
    if(!(A>0&&B>0&&nA>0&&nB>0))return source;

    // 구획 수가 다르면 더 많이 나뉜 축이 삽입 방향이다.
    // 구획 수가 같으면 측정구 정면에서 긴 변을 삽입 방향으로 표시한다.
    const insertionAxis=nA!==nB?(nA>nB?'A':'B'):(A>=B?'A':'B');
    const insertionLength=insertionAxis==='A'?A:B;
    const crossLength=insertionAxis==='A'?B:A;
    const insertionDivisions=insertionAxis==='A'?nA:nB;
    const crossDivisions=insertionAxis==='A'?nB:nA;
    const existingCount=Math.max(1,Math.round(cleanNumber(source.count)||1));

    // 정사각형 등에서 기존에 의도적으로 1/4 대표점을 사용한 경우는 변경하지 않는다.
    // 서로 다른 구획(예: 2×3) 또는 이미 한 측정선 수가 확보된 경우만 바로잡는다.
    if(nA===nB&&existingCount<insertionDivisions)return source;

    const count=Math.min(5,insertionDivisions);
    const insertionCell=insertionLength/insertionDivisions;
    const crossCell=crossLength/crossDivisions;
    const insertionDistances=Array.from({length:count},(_,index)=>insertionCell*(index+0.5));
    const values=insertionDistances.map(distance=>insertionAxis==='A'
      ?{x:distance,y:crossCell/2,dist:distance,insertionDistance:distance,insertionAxis}
      :{x:crossCell/2,y:distance,dist:distance,insertionDistance:distance,insertionAxis}
    );
    const legalCount=Math.max(1,Math.round(cleanNumber(source.legalCount)||(nA*nB)));
    const limit=finite(source.maxL)&&cleanNumber(source.maxL)>0?` · L ≤ ${short(source.maxL)} m`:'';
    const distanceText=insertionDistances.map(short).join(' / ');

    return {
      ...source,
      count,
      legalCount,
      values,
      representativeLine:true,
      insertionAxis,
      insertionLength,
      insertionDivisions,
      insertionDistances,
      summary:`단면적 ${cleanNumber(source.area).toFixed(3)} m²${limit} · ${nA} × ${nB} 등분(전체 ${legalCount}점) · 대표 측정선 ${count}지점 · 내벽 기준 ${distanceText} m`
    };
  }

  function patchTraverseModel(){
    const base=window.traverseModel;
    if(typeof base!=='function'||base._dfV12037194)return false;
    const patched=function dfV12037194TraverseModel(){
      return correctRectangularModel(base.apply(this,arguments));
    };
    patched._dfV12037194=true;
    patched._dfV12037194Base=base;
    window.traverseModel=patched;
    return true;
  }

  function postProcessTraverseDiagram(model){
    const svg=byId('traverseDiagram');
    if(!svg||model?.shape!=='rect'||!model.representativeLine)return false;

    // 전체 2×3 격자 중 실제 측정구에서 사용하는 대표 1개 행만 보이도록
    // 삽입 방향과 평행한 가로 분할선은 제거한다. 세로 구획과 측정점은 유지한다.
    [...svg.querySelectorAll('line.grid-line')].forEach(line=>{
      const x1=cleanNumber(line.getAttribute('x1')),x2=cleanNumber(line.getAttribute('x2'));
      const y1=cleanNumber(line.getAttribute('y1')),y2=cleanNumber(line.getAttribute('y2'));
      if(Math.abs(y1-y2)<0.01&&Math.abs(x1-x2)>0.01)line.remove();
    });
    const caption=svg.querySelector('.diagram-caption');
    if(caption)caption.textContent=`사각형 · 전체 ${model.nA}×${model.nB} 등분 · 대표 측정선 ${model.count}지점`;
    svg.dataset.dfRectView='representative-traverse-line';
    svg.dataset.dfInsertionAxis=model.insertionAxis||'';
    svg.dataset.dfInsertionDistances=(model.insertionDistances||[]).map(short).join(',');
    return true;
  }

  function patchTraverseRenderer(){
    const base=window.renderTraverseDiagram;
    if(typeof base!=='function'||base._dfV12037194)return false;
    const patched=function dfV12037194RenderTraverseDiagram(model){
      let result;
      // 직전 보정의 정면도 함수를 직접 사용해 입력 순서와 무관하게 긴 변을 가로로 유지한다.
      if(model?.shape==='rect'&&typeof window.dfV12037193RenderRectangularFrontView==='function'){
        result=window.dfV12037193RenderRectangularFrontView(model);
      }else{
        result=base.apply(this,arguments);
      }
      postProcessTraverseDiagram(model);
      return result;
    };
    patched._dfV12037194=true;
    patched._dfV12037194Base=base;
    window.renderTraverseDiagram=patched;
    return true;
  }

  function representativeDistance(model,value){
    const direct=Number(value?.insertionDistance);
    if(Number.isFinite(direct))return direct;
    const axis=model?.insertionAxis;
    const fallback=Number(axis==='A'?value?.x:value?.y);
    return Number.isFinite(fallback)?fallback:NaN;
  }

  function rewriteTraverseRows(model){
    if(model?.shape!=='rect'||!model.representativeLine)return false;
    const body=byId('traverseRows');
    if(body){
      body.innerHTML=(model.values||[]).map((value,index)=>{
        const distance=representativeDistance(model,value);
        return `<tr><th>${index+1} 지점</th><td>${Number.isFinite(distance)?short(distance):''}</td><td>m</td></tr>`;
      }).join('');
    }
    const summary=byId('traverseSummary');
    if(summary)summary.textContent=model.summary;
    return true;
  }

  function patchTraverseRows(){
    const base=window.updateTraverseAndRows;
    if(typeof base!=='function'||base._dfV12037194)return false;
    const patched=function dfV12037194UpdateTraverseAndRows(){
      const result=base.apply(this,arguments);
      try{rewriteTraverseRows(window.traverseModel())}
      catch(error){window.DF_DIAG?.warn('TRAVERSE-ROWS-12037224','사각 측정점 표 보정 보류',error?.message||String(error));}
      return result;
    };
    patched._dfV12037194=true;
    patched._dfV12037194Base=base;
    window.updateTraverseAndRows=patched;
    return true;
  }

  function representativeText(model){
    return (model?.values||[]).map((value,index)=>{
      const distance=representativeDistance(model,value);
      return `${index+1}지점 ${Number.isFinite(distance)?fixed(distance):''} m`;
    }).join(' / ');
  }

  function patchPrintDocument(){
    const base=window.buildPrintDocument;
    if(typeof base!=='function'||base._dfV12037194)return false;
    const patched=function dfV12037194BuildPrintDocument(){
      const result=base.apply(this,arguments);
      try{
        const model=window.traverseModel();
        if(model?.shape==='rect'&&model.representativeLine){
          const text=byId('pTraverseText');
          if(text)text.textContent=representativeText(model);
        }
      }catch(error){window.DF_DIAG?.warn('TRAVERSE-PRINT-12037224','인쇄 측정점 문구 보정 보류',error?.message||String(error));}
      return result;
    };
    patched._dfV12037194=true;
    patched._dfV12037194Base=base;
    window.buildPrintDocument=patched;
    return true;
  }

  function rewritePreviewHtml(html,model){
    if(model?.shape!=='rect'||!model.representativeLine)return html;
    let output=String(html??'');
    (model.values||[]).forEach(value=>{
      const oldText=`${fixed(value.x)} × ${fixed(value.y)} m`;
      const distance=representativeDistance(model,value);
      const newText=`${Number.isFinite(distance)?fixed(distance):''} m`;
      output=output.split(oldText).join(newText);
    });
    return output;
  }

  function patchPrintPreview(){
    const base=window.dfV1134PrintPreview;
    if(typeof base!=='function'||base._dfV12037194)return false;
    const patched=function dfV12037194PrintPreview(){
      let model=null;
      try{model=window.traverseModel()}catch(_){/* 원래 미리보기 유지 */}
      if(model?.shape!=='rect'||!model.representativeLine)return base.apply(this,arguments);
      const nativeOpen=window.open;
      window.open=function dfV12037194PreviewOpen(){
        const popup=nativeOpen.apply(window,arguments);
        if(!popup?.document||typeof popup.document.write!=='function')return popup;
        const nativeWrite=popup.document.write.bind(popup.document);
        popup.document.write=function dfV12037194PreviewWrite(html){
          return nativeWrite(rewritePreviewHtml(html,model));
        };
        return popup;
      };
      try{return base.apply(this,arguments)}
      finally{window.open=nativeOpen}
    };
    patched._dfV12037194=true;
    patched._dfV12037194Base=base;
    window.dfV1134PrintPreview=patched;
    return true;
  }

  function setXmlNumber(doc,ref,value){
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const cells=[...doc.getElementsByTagNameNS(ns,'c')];
    const cell=cells.find(item=>item.getAttribute('r')===ref);
    if(!cell)return false;
    [...cell.childNodes].forEach(node=>{
      if(['f','v','is'].includes(node.localName))cell.removeChild(node);
    });
    if(value===''||value===null||value===undefined||!Number.isFinite(Number(value))){
      cell.removeAttribute('t');
      return true;
    }
    cell.setAttribute('t','n');
    const node=doc.createElementNS(ns,'v');
    node.textContent=String(Number(value));
    cell.appendChild(node);
    return true;
  }

  async function resolveWorksheetPath(zip,sheetName){
    const parser=new DOMParser();
    const workbookFile=zip.file('xl/workbook.xml');
    const relationFile=zip.file('xl/_rels/workbook.xml.rels');
    if(!workbookFile||!relationFile)return '';
    const workbook=parser.parseFromString(await workbookFile.async('text'),'application/xml');
    const relations=parser.parseFromString(await relationFile.async('text'),'application/xml');
    const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const office='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const packageNs='http://schemas.openxmlformats.org/package/2006/relationships';
    const sheets=[...workbook.getElementsByTagNameNS(main,'sheet')];
    const sheet=sheets.find(item=>item.getAttribute('name')===sheetName)||sheets[0];
    if(!sheet)return '';
    const relationId=sheet.getAttributeNS(office,'id');
    const relation=[...relations.getElementsByTagNameNS(packageNs,'Relationship')]
      .find(item=>item.getAttribute('Id')===relationId);
    let target=relation?.getAttribute('Target')||'';
    if(!target)return '';
    target=target.startsWith('/')?target.slice(1):`xl/${target}`;
    return target.replace('xl/../','');
  }

  async function rewriteExcelDistances(result,model){
    if(!result?.bytes||model?.shape!=='rect'||!model.representativeLine||typeof JSZip==='undefined')return result;
    const zip=await JSZip.loadAsync(result.bytes);
    const path=await resolveWorksheetPath(zip,result.sheetName||'기록지(먼지)');
    const file=path&&zip.file(path);
    if(!file)return result;
    const parser=new DOMParser(),serializer=new XMLSerializer();
    const worksheet=parser.parseFromString(await file.async('text'),'application/xml');
    for(let index=0;index<5;index++){
      const value=model.values?.[index];
      const distance=value?representativeDistance(model,value):'';
      setXmlNumber(worksheet,`K${16+index}`,Number.isFinite(distance)?distance:'');
    }
    zip.file(path,serializer.serializeToString(worksheet));
    return {
      ...result,
      bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}})
    };
  }

  function downloadExcelResult(result){
    const blob=new Blob([result.bytes],{type:'application/vnd.ms-excel.sheet.macroEnabled.12'});
    const anchor=document.createElement('a');
    const href=URL.createObjectURL(blob);
    anchor.href=href;
    anchor.download=result.fileName||'시료채취기록지.xlsm';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1500);
  }

  function patchExcelExport(){
    const base=window.exactTemplateExcelExport;
    if(typeof base!=='function'||base._dfV12037194)return false;
    const patched=async function dfV12037194ExactTemplateExcelExport(options={}){
      const baseResult=await base.call(this,{...options,returnBytes:true});
      if(!baseResult?.bytes)return baseResult;
      let result=baseResult;
      try{result=await rewriteExcelDistances(baseResult,window.traverseModel())}
      catch(error){window.DF_DIAG?.warn('TRAVERSE-EXCEL-12037224','Excel 측정점 거리 보정 보류',error?.message||String(error));}
      if(options.returnBytes)return result;
      downloadExcelResult(result);
      return undefined;
    };
    patched._dfV12037194=true;
    patched._dfV12037194Base=base;
    window.exactTemplateExcelExport=patched;
    return true;
  }

  function applyVersion(){
    const side=byId('dfBuildVersionStatic'),footer=byId('dfFooterVersion');
    if(side&&side.textContent!==VERSION_LABEL)side.textContent=VERSION_LABEL;
    if(footer&&footer.textContent!==VERSION)footer.textContent=VERSION;
    if(document.documentElement)document.documentElement.dataset.dreamforenVersion=VERSION;
    window.DF_ACTIVE_BUILD=VERSION;
  }

  function replaceVersionNode(id){
    const current=byId(id);
    if(!current||current.dataset.v12037194Owner==='1')return current;
    const replacement=current.cloneNode(true);
    replacement.dataset.v12037194Owner='1';
    current.replaceWith(replacement);
    return replacement;
  }

  function ownVersionDisplay(){
    replaceVersionNode('dfBuildVersionStatic');
    replaceVersionNode('dfFooterVersion');
    applyVersion();
    if(versionObserver||typeof MutationObserver==='undefined')return;
    const targets=['dfBuildVersionStatic','dfFooterVersion'].map(byId).filter(Boolean);
    versionObserver=new MutationObserver(applyVersion);
    targets.forEach(target=>versionObserver.observe(target,{childList:true,characterData:true,subtree:true}));
  }

  function ensurePatches({refresh=false}={}){
    patchTraverseModel();
    patchTraverseRenderer();
    patchTraverseRows();
    patchPrintDocument();
    patchPrintPreview();
    patchExcelExport();
    ownVersionDisplay();
    if(refresh&&typeof window.updateTraverseAndRows==='function'){
      try{window.updateTraverseAndRows()}
      catch(error){window.DF_DIAG?.warn('TRAVERSE-REFRESH-12037224','측정점 화면 즉시 갱신 보류',error?.message||String(error));}
    }
    applyVersion();
  }

  function init(){
    ensurePatches({refresh:true});
    // 직전 패치의 지연 재적용보다 뒤에서 최종 보정이 유지되도록 확인한다.
    [260,920,1840,3460].forEach(wait=>setTimeout(()=>ensurePatches({refresh:true}),wait));
    window.DF_DIAG?.info(
      'RECTANGULAR-TRAVERSE-12037224',
      '사각 측정점 대표 측정선 산정 보정 완료',
      '0.8×1.5 m: 전체 2×3=6점 / 대표 측정선 3지점 / 내벽 기준 0.25·0.75·1.25 m'
    );
  }

  window.dfV12037194CorrectRectangularModel=correctRectangularModel;
  window.dfV12037194RewriteTraverseRows=rewriteTraverseRows;
  window.dfV12037194RewritePreviewHtml=rewritePreviewHtml;
  window.dfV12037194RewriteExcelDistances=rewriteExcelDistances;
  window.dfV12037194EnsurePatches=ensurePatches;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
