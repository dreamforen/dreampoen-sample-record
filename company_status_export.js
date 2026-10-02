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
      const ws=wb.addWorksheet('업체현황',{views:[{state:'frozen',xSplit:2,ySplit:4}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:4',margins:{left:0.25,right:0.25,top:0.4,bottom:0.4,header:0.2,footer:0.2}}});
      columns.forEach((c,i)=>ws.getColumn(i+1).width=c[1]);
      ws.mergeCells('A1:M1');ws.getCell('A1').value=`${data.year?data.year+'년 ':''}업체현황`;ws.getRow(1).height=32;
      ws.getCell('A1').font={name:'맑은 고딕',size:18,bold:true,color:{argb:'FF17365D'}};
      ws.mergeCells('A2:M2');ws.getCell('A2').value=`상태: ${data.status} / 검색: ${data.search||'전체'} / 업체 ${data.rows.length}개 / 내려받은 시각: ${data.now.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})}`;
      ws.getCell('A2').alignment={vertical:'middle',wrapText:true};ws.getCell('A2').font={name:'맑은 고딕',size:10,color:{argb:'FF526477'}};ws.getRow(2).height=Math.max(30,wrappedLines(ws.getCell('A2').value,190)*15);
      ws.getRow(3).height=8;ws.getRow(4).values=columns.map(c=>c[0]);ws.getRow(4).height=27;
      ws.getRow(4).eachCell(cell=>{cell.font={name:'맑은 고딕',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245A81'}};cell.alignment={horizontal:'center',vertical:'middle'};});
      data.rows.forEach((values,i)=>{
        const row=ws.addRow(values);row.height=Math.max(32,...values.map((v,j)=>wrappedLines(v instanceof Date?'2026-10-02':v,columns[j][1])*16+10));
        row.eachCell({includeEmpty:true},(cell,j)=>{
          cell.font={name:'맑은 고딕',size:11,color:{argb:'FF243746'}};
          cell.alignment={vertical:'middle',wrapText:true,horizontal:[2,4,5,6,7,8,9,10,12].includes(j)?'center':'left'};
          cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2?'FFF0F5FA':'FFFFFFFF'}};
          cell.border={bottom:{style:'hair',color:{argb:'FFD7E1EB'}}};
        });
        row.getCell(2).numFmt='@';for(const j of [6,7,8,9])row.getCell(j).numFmt='@';
        row.getCell(4).numFmt='0';row.getCell(10).numFmt='yyyy-mm-dd';
        const done=values[11]==='완료';row.getCell(12).font={name:'맑은 고딕',size:11,bold:true,color:{argb:done?'FF13734A':'FF9C5700'}};
      });
      ws.autoFilter={from:{row:4,column:1},to:{row:4+data.rows.length,column:13}};
      ws.pageSetup.printArea=`A1:M${4+data.rows.length}`;
      ws.headerFooter.oddFooter='&C&P / &N';
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
