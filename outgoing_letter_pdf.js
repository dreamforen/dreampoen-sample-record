/* The outgoing A4 paper and its attachments become one downloadable PDF. */
(function(){
  'use strict';
  const script=document.currentScript?.src||document.baseURI,mm=96/25.4;
  const width=210*mm,height=297*mm,margin=17*mm,usable=Math.floor(height-2*margin);
  const a4=[210*72/25.4,297*72/25.4],maxPages=250;
  const renderCss='body{margin:0;background:#fff}.dl-paper{display:flow-root;width:210mm;min-height:0;padding:0 19mm;margin:0;color:#000;box-shadow:none}.dl-meta{table-layout:fixed}.dl-meta th,.dl-footer{color:#000}.df-outgoing-a4-page{position:absolute;top:0;left:0;background:#fff;overflow:hidden}';
  let deps;
  function scriptOnce(name,ready){
    if(ready())return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const el=document.createElement('script');
      const fail=()=>{clearTimeout(timer);el.remove();reject(Error('PDF 기능을 불러오지 못했습니다. 연결을 확인해주세요.'));};
      const timer=setTimeout(fail,15000);
      el.src=new URL('vendor/'+name,script).href;
      el.onload=()=>{if(ready()){clearTimeout(timer);resolve();}else fail();};el.onerror=fail;document.head.append(el);
    });
  }
  function tools(){
    if(!deps)deps=Promise.all([
      scriptOnce('pdf-lib-1.17.1.min.js',()=>!!window.PDFLib?.PDFDocument),
      scriptOnce('html2canvas-1.4.1.min.js',()=>typeof window.html2canvas==='function')
    ]).catch(e=>{deps=null;throw e;});
    return deps;
  }
  // Break only in the whitespace between text lines or printed table/header blocks.
  function slices(h,zones,limit=usable){
    const end=Math.ceil(h),merged=[];
    for(const [top,bottom] of zones.slice().sort((a,b)=>a[0]-b[0])){
      const a=Math.max(0,Math.floor(top)),b=Math.min(end,Math.ceil(bottom));if(b<=a)continue;
      const last=merged[merged.length-1];if(last&&last[1]>=a)last[1]=Math.max(last[1],b);else merged.push([a,b]);
    }
    const pages=[];
    for(let start=0;start<end;){
      let stop=Math.min(start+limit,end);
      const overlap=merged.find(([top,bottom])=>top<stop&&stop<bottom);
      if(overlap)stop=overlap[0];
      if(stop<=start)throw Error('한 페이지에 들어가지 않는 영역이 있습니다. 제목 또는 본문 줄을 나눠주세요.');
      pages.push([start,stop]);start=stop;
    }
    return pages;
  }
  function layout(paper){
    const base=paper.getBoundingClientRect(),zones=[];
    const mark=rect=>{if(rect.height>0)zones.push([rect.top-base.top,rect.bottom-base.top]);};
    const whole='.dl-issuer,.dl-meta,.dl-signature,.dl-footer';
    paper.querySelectorAll(whole).forEach(n=>mark(n.getBoundingClientRect()));
    const doc=paper.ownerDocument,range=doc.createRange(),walker=doc.createTreeWalker(paper,4);let node;
    while((node=walker.nextNode())){
      if(!node.data.trim()||node.parentElement.closest(whole))continue;
      range.selectNodeContents(node);for(const rect of range.getClientRects())mark(rect);
    }
    return slices(base.height,zones);
  }
  async function addPaper(pdf,row,seal,job){
    const paperApi=window.DF_OUTGOING_LETTER_PAPER,frame=document.createElement('iframe');
    frame.title='PDF 생성';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.style.cssText='display:block;position:fixed;left:-12000px;top:0;width:1200px;height:1300px;border:0;pointer-events:none;';
    document.body.append(frame);
    try{
      const doc=frame.contentDocument,work=doc.body,style=doc.createElement('style');style.textContent=paperApi.css+renderCss;
      doc.documentElement.lang='ko';doc.head.append(style);work.innerHTML=paperApi.shape(row,document.baseURI,{seal});
      const letter=work.firstElementChild;
      const [logo,square]=await Promise.all([job.verifyImage(letter.querySelector('.dl-issuer img')),row.apply_square_seal!==false?job.verifyImage(letter.querySelector('.dl-square')):Promise.resolve(true)]);
      job.assert();
      if(!logo)throw Error('회사 로고를 불러오지 못했습니다. 다시 시도해주세요.');
      if(!square)throw Error('사각직인을 등록한 뒤 다시 시도하거나, 공문에서 사각직인 넣기를 해제해주세요.');
      if(doc.fonts?.ready)await Promise.race([doc.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]);
      job.assert();const sections=layout(letter);
      if(!sections.length||sections.length>maxPages)throw Error('공문 페이지를 생성할 수 없습니다.');
      for(const [i,[start,stop]] of sections.entries()){
        job.assert();job.progress('공문 PDF 작성 중 · '+(i+1)+' / '+sections.length+'쪽');
        const canvasPage=doc.createElement('div'),clip=doc.createElement('div'),copy=letter.cloneNode(true);
        canvasPage.className='df-outgoing-a4-page';canvasPage.style.cssText='width:'+width+'px;height:'+height+'px;';
        clip.style.cssText='position:absolute;inset-inline:0;top:'+margin+'px;height:'+(stop-start)+'px;overflow:hidden;';
        // The measured paper remains in place; the copy is clipped per A4 page.
        copy.style.position='relative';copy.style.top=-start+'px';clip.append(copy);canvasPage.append(clip);work.append(canvasPage);
        let canvas;
        try{
          canvas=await window.html2canvas(canvasPage,{scale:2,backgroundColor:'#fff',width:Math.ceil(width),height:Math.ceil(height),windowWidth:1200,scrollX:0,scrollY:0,logging:false,useCORS:true,imageTimeout:12000,removeContainer:true});
          job.assert();
          const image=await pdf.embedPng(canvas.toDataURL('image/png'));
          job.assert();const page=pdf.addPage(a4);page.drawImage(image,{x:0,y:0,width:a4[0],height:a4[1]});
        }finally{if(canvas)canvas.width=canvas.height=0;canvasPage.remove();}
      }
    }finally{frame.remove();}
  }
  async function addAttachment(pdf,attachment,bytes){
    if(attachment.mime==='application/pdf'){
      const source=await window.PDFLib.PDFDocument.load(bytes,{updateMetadata:false});
      const count=source.getPageCount();if(!count)throw Error('첨부 PDF에 페이지가 없습니다.');
      if(count+pdf.getPageCount()>maxPages)throw Error('합본은 250쪽까지 생성할 수 있습니다.');
      const pages=await pdf.copyPages(source,source.getPageIndices());for(const page of pages)pdf.addPage(page);
      return;
    }
    if(pdf.getPageCount()>=maxPages)throw Error('합본은 250쪽까지 생성할 수 있습니다.');
    const url=URL.createObjectURL(new Blob([bytes],{type:attachment.mime}));let canvas;
    try{
      const img=new Image();img.src=url;
      if(typeof img.decode==='function')await img.decode();
      else if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
      if(!img.naturalWidth||!img.naturalHeight)throw Error('그림 파일이 손상되었습니다.');
      const w=img.naturalWidth,h=img.naturalHeight,scale=Math.min((a4[0]-54)/w,(a4[1]-54)/h),down=Math.min(1,2000/Math.max(w,h));
      canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*down));canvas.height=Math.max(1,Math.round(h*down));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const image=await pdf.embedJpg(canvas.toDataURL('image/jpeg',.96)),page=pdf.addPage(a4);
      page.drawImage(image,{x:(a4[0]-w*scale)/2,y:(a4[1]-h*scale)/2,width:w*scale,height:h*scale});
    }finally{if(canvas)canvas.width=canvas.height=0;URL.revokeObjectURL(url);}
  }
  async function build(row,seal,attachments,job){
    await tools();job.assert();
    const pdf=await window.PDFLib.PDFDocument.create();
    pdf.setTitle(row.subject||'발송용 공문');pdf.setAuthor(row.sender_name||'주식회사 드림포이엔');
    await addPaper(pdf,row,seal,job);
    for(const [i,file] of attachments.entries()){
      job.assert();job.progress('붙임 PDF 구성 중 · '+(i+1)+' / '+attachments.length+' · '+file.name);
      const bytes=await job.read(file);job.assert();
      try{await addAttachment(pdf,file,bytes);}catch(error){
        if(/encrypt/i.test(error?.message||''))throw Error(file.name+' · 암호를 해제한 PDF를 다시 첨부해주세요.');
        throw Error(file.name+' · '+(/^(첨부 PDF에 페이지|합본은)/.test(error?.message||'')?error.message:'파일을 열지 못했습니다. 원본을 확인해 다시 첨부해주세요.'));
      }
    }
    job.assert();const bytes=await pdf.save();job.assert();return {bytes,pages:pdf.getPageCount()};
  }
  window.DF_OUTGOING_LETTER_PDF=Object.freeze({build,slices,addAttachment});
})();
