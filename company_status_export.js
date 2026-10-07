/* 업체현황: 현재 화면의 필터·정렬 결과를 읽기 전용 XLSX로 내보냅니다. */
(function(){
  'use strict';
  let busy=false;
  const text=node=>String(node?.textContent||'').trim();
  const columns=[['기관명',30],['사업자번호',17],['소재지',48],['시설 수',10],['계약주기',15],['연',10],['반기',10],['분기',10],['월',10],['최근 측정일',16],['다음 필요',25],['상태',14],['시설 비고',44]];
  function allowed(){return typeof dfMenuCan!=='function'||dfMenuCan('company','view');}
  function dateValue(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    const d=new Date(value+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?d:value;
  }
  function snapshot(){
    const body=document.getElementById('companyTbody');
    const rows=Array.from(body?.querySelectorAll('tr[data-company-id]')||[]).map(tr=>{
      const c=tr.cells;if(c.length!==12)throw Error('업체현황 표 구성을 확인하지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return [text(c[0].querySelector('strong')),text(c[0].querySelector('small')),text(c[1]),Number(text(c[2])),...Array.from(c).slice(3,8).map(text),dateValue(text(c[8])),...Array.from(c).slice(9).map(text)];
    });
    const state=typeof companyState!=='undefined'?companyState:{};
    return {rows,year:document.getElementById('companyTrackYear')?.value||state.year||'',search:document.getElementById('companySearch')?.value||'',status:({complete:'완료',inprogress:'진행중'})[state.statusFilter]||'전체',now:new Date()};
  }
  function wrappedLines(value,width){
    return String(value??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(Array.from(line).reduce((sum,ch)=>sum+(ch.charCodeAt(0)>255?2:1),0)/(width-2))),0);
  }
  async function download(){
    if(busy)return;
    if(!allowed()){alert('업체현황 조회 권한이 필요합니다.');return;}
    const button=document.getElementById('companyStatusExcel');busy=true;if(button){button.disabled=true;button.textContent='엑셀 만드는 중…';}
    try{
      if(!window.ExcelJS?.Workbook)throw Error('엑셀 기능을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해주세요.');
      const data=snapshot();if(!data.rows.length){alert('현재 조건에 맞는 업체가 없습니다. 검색 또는 상태 필터를 변경해주세요.');return;}
      const wb=new ExcelJS.Workbook();wb.creator='주식회사 드림포이엔';wb.created=data.now;
      const palette={ink:'FF203A43',muted:'FF71838A',teal:'FF238777',light:'FFF3F7F6',line:'FFE1E9E6',white:'FFFFFFFF'};
      const tableSheet=wb.addWorksheet('업체현황',{views:[{state:'frozen',xSplit:2,ySplit:1,showGridLines:false,zoomScale:85}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
      const ws=wb.addWorksheet('조회 요약',{views:[{state:'normal',showGridLines:false,zoomScale:85}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'7:8',margins:{left:0.3,right:0.3,top:0.4,bottom:0.4,header:0.2,footer:0.2}}});
      columns.forEach((c,i)=>{ws.getColumn(i+1).width=c[1];tableSheet.getColumn(i+1).width=c[1];});
      function block(range,value,fill,color,size,bold,align='left'){
        ws.mergeCells(range);const cell=ws.getCell(range.split(':')[0]);cell.value=value;
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
        cell.font={name:'맑은 고딕',size,bold,color:{argb:color}};
        cell.alignment={horizontal:align,vertical:'middle',wrapText:true,indent:align==='left'?1:0};
      }
      block('A1:I2',`${data.year?data.year+'년 ':''}업체현황`,palette.ink,palette.white,23,true);
      block('J1:M1','DREAMFOREN  /  주식회사 드림포이엔',palette.ink,'FFB7D5CE',11,true,'right');
      block('J2:M2',data.now.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}),palette.ink,'FFD6E4DF',10,false,'right');
      ws.getRow(1).height=29;ws.getRow(2).height=25;
      block('A3:M3',`조회 조건   ${data.status}  ·  검색: ${data.search||'전체'}  ·  시설 합계: ${data.rows.reduce((n,r)=>n+r[3],0)}개  ·  아래 요약은 현재 내려받은 업체 기준입니다.`,palette.white,palette.muted,10,false);
      ws.getRow(3).height=Math.max(30,wrappedLines(ws.getCell('A3').value,190)*15);
      const complete=data.rows.filter(r=>r[11]==='완료').length;
      const cards=[['A4:C4','A5:C5','조회 업체',data.rows.length,palette.ink],['D4:J4','D5:J5','완료',complete,palette.teal],['K4:M4','K5:M5','진행중 / 미완료',data.rows.length-complete,'FFAE782D']];
      cards.forEach(([labelRange,valueRange,label,value,color])=>{block(labelRange,label,palette.light,palette.muted,10,false);block(valueRange,value,palette.light,color,23,true);ws.getCell(valueRange.split(':')[0]).numFmt='#,##0';});
      ws.getRow(4).height=23;ws.getRow(5).height=37;ws.getRow(6).height=13;
      block('A7:M7','업체현황 시트에서 열 제목의 화살표로 정렬·필터를 적용하고 셀을 직접 수정할 수 있습니다.',palette.white,palette.muted,11,false);
      ws.getRow(7).height=30;
      const header=tableSheet.getRow(1);header.values=columns.map(c=>c[0]);header.height=31;
      header.eachCell(cell=>{cell.font={name:'맑은 고딕',size:10,bold:true,color:{argb:palette.white}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:palette.ink}};cell.alignment={horizontal:'center',vertical:'middle'};});
      const rowHeight=Math.max(40,...data.rows.flatMap(values=>values.map((v,j)=>wrappedLines(v instanceof Date?'2026-10-02':v,columns[j][1]-2)*16+14)));
      data.rows.forEach((values,i)=>{
        const row=tableSheet.addRow(values);row.height=rowHeight;
        row.eachCell({includeEmpty:true},(cell,j)=>{
          cell.font={name:'맑은 고딕',size:11,color:{argb:[2,3,13].includes(j)?palette.muted:palette.ink},bold:j===1};
          const centered=[2,4,5,6,7,8,9,10,12].includes(j);
          cell.alignment={vertical:'middle',wrapText:true,horizontal:centered?'center':'left',indent:centered?0:1};
          cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2?'FFF7F9F8':palette.white}};
          cell.border={bottom:{style:'hair',color:{argb:palette.line}}};
          if(j===1)cell.border.left={style:'thin',color:{argb:palette.line}};
        });
        row.getCell(2).numFmt='@';for(const j of [6,7,8,9])row.getCell(j).numFmt='@';
        row.getCell(4).numFmt='0';row.getCell(10).numFmt='yyyy-mm-dd';
        const done=values[11]==='완료',status=row.getCell(12);
        status.font={name:'맑은 고딕',size:10,bold:true,color:{argb:done?'FF237762':'FF986A26'}};
        status.fill={type:'pattern',pattern:'solid',fgColor:{argb:done?'FFEAF4EE':'FFFAF1E2'}};
      });
      tableSheet.addTable({name:'CompanyStatus',ref:'A1',headerRow:true,totalsRow:false,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:columns.map(c=>({name:c[0],filterButton:true})),rows:data.rows});
      tableSheet.addConditionalFormatting({ref:`L2:L${data.rows.length+1}`,rules:[
        {type:'expression',formulae:['$L2="완료"'],style:{font:{color:{argb:'FF237762'},bold:true},fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFEAF4EE'}}}},
        {type:'expression',formulae:['AND($L2<>"완료",$L2<>"")'],style:{font:{color:{argb:'FF986A26'},bold:true},fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFFAF1E2'}}}}
      ]});
      ws.getCell('A5').value={formula:"MAX(0,COUNTA('업체현황'!A:A)-1)",result:data.rows.length};
      ws.getCell('D5').value={formula:'COUNTIF(업체현황!L:L,"완료")',result:complete};
      ws.getCell('K5').value={formula:'COUNTIFS(업체현황!L:L,"<>완료",업체현황!L:L,"<>")-1',result:data.rows.length-complete};
      ws.getCell('A3').value=`내려받은 조건   ${data.status}  ·  검색: ${data.search||'전체'}  ·  요약 수치는 업체현황 시트의 전체 행 기준입니다.`;
      block('A9:C9','시설 합계',palette.light,palette.muted,10,false);
      block('D9:M9',{formula:'SUM(업체현황!D:D)',result:data.rows.reduce((n,r)=>n+r[3],0)},palette.light,palette.ink,16,true);
      ws.getRow(9).height=30;
      wb.calcProperties.fullCalcOnLoad=true;
      tableSheet.pageSetup.printArea=`A1:M${1+data.rows.length}`;
      ws.pageSetup.printArea='A1:M9';ws.pageSetup.printTitlesRow='';
      tableSheet.headerFooter.oddFooter='&L주식회사 드림포이엔&C업체현황&R&P / &N';
      const buffer=await wb.xlsx.writeBuffer();
      const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a=document.createElement('a');a.href=url;
      const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(data.now).replace(/-/g,'');
      a.download=`업체현황_${data.year||'전체연도'}_${data.status}_${stamp}.xlsx`;a.hidden=true;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){console.error('업체현황 Excel',e);alert('엑셀 다운로드 실패\n'+(e.message||e));}
    finally{busy=false;if(button){button.disabled=false;button.textContent='엑셀 다운로드';}}
  }
  function ensure(){
    const toolbar=document.querySelector('#dfViewCompany .v12062-company-toolbar, #dfViewCompany .company-toolbar');if(!toolbar||document.getElementById('companyStatusExcel'))return;
    const button=document.createElement('button');button.type='button';button.id='companyStatusExcel';button.className='company-btn secondary';button.textContent='엑셀 다운로드';button.title='현재 연도·상태·검색 조건에 맞는 업체 전체를 화면 순서대로 다운로드';button.style.whiteSpace='nowrap';button.addEventListener('click',download);
    const count=toolbar.querySelector('#companyCount');if(count)toolbar.insertBefore(button,count);else toolbar.appendChild(button);
  }
  function init(){ensure();const root=document.getElementById('dfViewCompany');if(root)new MutationObserver(ensure).observe(root,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
