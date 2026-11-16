/* The outgoing A4 paper and its attachments become one downloadable PDF. */
(function(){
  'use strict';
  const script=document.currentScript?.src||document.baseURI,mm=96/25.4;
  const width=210*mm,height=297*mm,margin=17*mm,usable=Math.floor(height-2*margin),renderScale=2;
  const a4=[210*72/25.4,297*72/25.4],maxPages=250;
  const renderCss='body{margin:0;background:#fff}.dl-paper{display:flow-root;width:210mm;min-height:0;padding:0 19mm 12px;margin:0;color:#000;box-shadow:none}.dl-meta{table-layout:fixed}.dl-meta th,.dl-footer{color:#000}';
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
  function layout(paper){
    const base=paper.getBoundingClientRect();
    const rect=selector=>paper.querySelector(selector).getBoundingClientRect();
    return {end:Math.ceil(base.height),keep:[
      [rect('.dl-issuer').top-base.top-2,rect('.dl-meta').bottom-base.top+2],
      [rect('.dl-signature').top-base.top-2,rect('.dl-footer').bottom-base.top+2]
    ]};
  }
  function blankRows(canvas,top,count){
    const {width}=canvas,bytes=canvas.getContext('2d').getImageData(0,top,width,count).data,rowSize=width*4,blank=new Uint8Array(count);
    for(let y=0;y<count;y++){
      const end=(y+1)*rowSize;let painted=false;
      for(let x=y*rowSize;x<end;x+=4)if(bytes[x+3]&&Math.min(bytes[x],bytes[x+1],bytes[x+2])<254){painted=true;break;}
      blank[y]=painted?0:1;
    }
    return blank;
  }
  // Pick a cut on the actual painted image, never on a measured text box.
  function findBreak(canvas,bandStart,start,limit,keep,scale=renderScale){
    const first=start*scale,last=(start+limit)*scale,gap=2*scale;
    const height=Math.min(canvas.height-first,last-first+gap);
    if(height<2*gap+1)throw Error('공문 페이지의 여백을 확인할 수 없습니다.');
    const rows=blankRows(canvas,first,height);
    for(let at=limit;at>4;at--){
      const y=at*scale,pos=bandStart+start+at;
      if(y+gap>rows.length||keep.some(([lo,hi])=>pos>lo&&pos<hi))continue;
      let blank=true;
      for(let row=y-gap;row<y+gap;row++)if(!rows[row]){blank=false;break;}
      if(blank)return at;
    }
    throw Error('한 페이지에 들어가지 않는 영역이 있습니다. 본문을 나눈 뒤 다시 시도해주세요.');
  }
  async function addBandPage(pdf,canvas,offset,span){
    const part=document.createElement('canvas');
    try{
      part.width=canvas.width;part.height=span*renderScale;
      part.getContext('2d').drawImage(canvas,0,offset*renderScale,part.width,part.height,0,0,part.width,part.height);
      const png=await pdf.embedPng(part.toDataURL('image/png')),h=span*72/96;
      pdf.addPage(a4).drawImage(png,{x:0,y:a4[1]-margin*72/96-h,width:a4[0],height:h});
    }finally{part.width=part.height=0;}
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
      job.assert();const {end,keep}=layout(letter);
      if(!end||end>maxPages*usable)throw Error('공문 페이지를 생성할 수 없습니다.');
      for(let start=0;start<end;){
        job.assert();job.progress('공문 PDF 작성 중 · '+(pdf.getPageCount()+1)+'쪽');
        // Render the unshifted paper in bands no taller than two pages to bound memory.
        // Neighbouring pages use the same bitmap when they fit in a single band.
        const length=Math.min(end-start,2*usable+8),last=start+length===end;
        let canvas,offset=0;
        try{
          canvas=await window.html2canvas(letter,{x:0,y:start,scale:renderScale,backgroundColor:'#fff',width:Math.ceil(width),height:length,windowWidth:1200,windowHeight:1300,scrollX:0,scrollY:0,logging:false,useCORS:true,imageTimeout:12000,removeContainer:true});
          job.assert();
          for(;offset<length;){
            const left=length-offset;
            if(left<=usable&&!last)break;
            if(last&&left<=usable&&pdf.getPageCount()&&blankRows(canvas,offset*renderScale,left*renderScale).every(Boolean)){offset=length;break;}
            if(pdf.getPageCount()>=maxPages)throw Error('합본은 250쪽까지 생성할 수 있습니다.');
            const span=left<=usable?left:findBreak(canvas,start,offset,usable,keep);
            await addBandPage(pdf,canvas,offset,span);job.assert();offset+=span;
          }
        }finally{if(canvas)canvas.width=canvas.height=0;}
        start+=offset;
      }
    }finally{frame.remove();}
  }
  async function headerAssets(pdf){
    const canvas=document.createElement('canvas'),label='(첨부)',font='700 12px "Malgun Gothic","Noto Sans KR","Apple SD Gothic Neo",sans-serif';
    try{
      let ctx=canvas.getContext('2d');ctx.font=font;
      const w=Math.ceil(ctx.measureText(label).width)+2,h=18;
      canvas.width=w*3;canvas.height=h*3;
      ctx=canvas.getContext('2d');ctx.scale(3,3);ctx.font=font;ctx.fillStyle='#14283b';ctx.fillText(label,1,13);
      const {StandardFonts}=window.PDFLib;
      return {image:await pdf.embedPng(canvas.toDataURL('image/png')),digits:await pdf.embedFont(StandardFonts.HelveticaBold),w,h};
    }finally{canvas.width=canvas.height=0;}
  }
  function visiblePage(page){
    const crop=page.getCropBox(),media=page.getMediaBox();
    const x=Math.max(crop.x,media.x),y=Math.max(crop.y,media.y);
    const w=Math.min(crop.x+crop.width,media.x+media.width)-x,h=Math.min(crop.y+crop.height,media.y+media.height)-y;
    const a=((page.getRotation().angle%360)+360)%360;
    if(!(w>0&&h>0)||![0,90,180,270].includes(a))throw Error('첨부 PDF의 페이지 크기나 방향을 확인할 수 없습니다.');
    const lib=window.PDFLib,unit=page.node.lookupMaybe(lib.PDFName.of('UserUnit'),lib.PDFNumber)?.asNumber()||1;
    return {x,y,w,h,a,unit,width:a%180===90?h:w,height:a%180===90?w:h,
      point: (u,v)=>a===90?{x:x+w-v,y:y+u}:a===180?{x:x+w-u,y:y+h-v}:a===270?{x:x+v,y:y+h-u}:{x:x+u,y:y+v}};
  }
  function attachmentBox(view,sourceWidth,sourceHeight,maxScale=1){
    const {width,height}=view,f=Math.min(1/Math.max(view.unit,0.01),width/240,height/200);
    const pad=22*f,baseline=height-pad-18*f,ceiling=baseline-8*f;
    const scale=Math.min(maxScale,(width-2*pad)/sourceWidth,(ceiling-pad)/sourceHeight);
    return {f,pad,baseline,scale,left:(width-sourceWidth*scale)/2,bottom:pad+(ceiling-pad-sourceHeight*scale)/2};
  }
  function drawHeader(page,view,box,header,number,index,count){
    const {f,pad,baseline}=box,lib=window.PDFLib,rotate=lib.degrees(view.a),ink=lib.rgb(.08,.157,.23),size=11*f;
    page.drawImage(header.image,{...view.point(pad,baseline),width:header.w*f,height:header.h*f,rotate});
    page.drawText(String(number),{...view.point(pad+(header.w+5)*f,baseline+5*f),font:header.digits,size,rotate,color:ink});
    if(count>1){
      const current=index+' / '+count,w=header.digits.widthOfTextAtSize(current,size);
      page.drawText(current,{...view.point(view.width-pad-w,baseline+5*f),font:header.digits,size,rotate,color:ink});
    }
    page.drawLine({start:view.point(pad,baseline-3*f),end:view.point(view.width-pad,baseline-3*f),thickness:.45*f,color:lib.rgb(.65,.72,.77)});
  }
  function placeOriginal(page,view,box){
    const lib=window.PDFLib,{scale,left,bottom}=box,origin=view.point(0,0),onto=view.point(left,bottom),dx=onto.x-origin.x*scale,dy=onto.y-origin.y*scale;
    const context=page.doc.context,stream=(...ops)=>context.register(lib.PDFContentStream.of(context.obj({}),ops));
    // Keep the original page boxes and rotation. Clip the scaled content to
    // the previously visible CropBox so hidden original margins stay hidden.
    page.node.normalize();
    if(page.node.Contents()){
      const start=stream(lib.pushGraphicsState(),lib.rectangle(view.x*scale+dx,view.y*scale+dy,view.w*scale,view.h*scale),
        lib.clip(),lib.endPath(),lib.concatTransformationMatrix(scale,0,0,scale,dx,dy));
      const end=stream(lib.popGraphicsState());
      if(!page.node.wrapContentStreams(start,end))throw Error('첨부 PDF의 페이지를 배치하지 못했습니다.');
    }
    const map=(array,rect=false)=>{
      if(!(array instanceof lib.PDFArray))return;
      for(let j=0;j<array.size();j++){
        const n=array.lookup(j);if(!(n instanceof lib.PDFNumber))continue;
        let v=n.asNumber();const x=j%2===0;
        if(rect)v=Math.max(x?view.x:view.y,Math.min(v,x?view.x+view.w:view.y+view.h));
        array.set(j,lib.PDFNumber.of(v*scale+(x?dx:dy)));
      }
    };
    const notes=page.node.Annots();
    if(notes)for(let j=notes.size()-1;j>=0;j--){
      const note=notes.lookup(j);if(!(note instanceof lib.PDFDict))continue;
      const get=key=>note.lookup(lib.PDFName.of(key)),rect=get('Rect');
      const v=rect instanceof lib.PDFArray?rect.asArray().map((_,i)=>rect.lookup(i)?.asNumber?.()):[];
      if(v.length===4&&v.every(Number.isFinite)&&(Math.max(v[0],v[2])<=view.x||Math.min(v[0],v[2])>=view.x+view.w||Math.max(v[1],v[3])<=view.y||Math.min(v[1],v[3])>=view.y+view.h)){notes.remove(j);continue;}
      map(rect,true);for(const key of ['QuadPoints','L','Vertices','CL'])map(get(key));
      const ink=get('InkList');if(ink instanceof lib.PDFArray)for(let i=0;i<ink.size();i++)map(ink.lookup(i));
    }
  }
  async function addAttachment(pdf,attachment,bytes,header,number){
    if(attachment.mime==='application/pdf'){
      const source=await window.PDFLib.PDFDocument.load(bytes,{updateMetadata:false});
      const count=source.getPageCount();if(!count)throw Error('첨부 PDF에 페이지가 없습니다.');
      if(count+pdf.getPageCount()>maxPages)throw Error('합본은 250쪽까지 생성할 수 있습니다.');
      const pages=await pdf.copyPages(source,source.getPageIndices());
      for(const [i,page] of pages.entries()){
        const view=visiblePage(page),box=attachmentBox(view,view.width,view.height);
        placeOriginal(page,view,box);drawHeader(page,view,box,header,number,i+1,count);pdf.addPage(page);
      }
      return;
    }
    if(pdf.getPageCount()>=maxPages)throw Error('합본은 250쪽까지 생성할 수 있습니다.');
    const url=URL.createObjectURL(new Blob([bytes],{type:attachment.mime}));let canvas;
    try{
      const img=new Image();img.src=url;
      if(typeof img.decode==='function')await img.decode();
      else if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
      if(!img.naturalWidth||!img.naturalHeight)throw Error('그림 파일이 손상되었습니다.');
      const w=img.naturalWidth,h=img.naturalHeight,down=Math.min(1,2000/Math.max(w,h));
      canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*down));canvas.height=Math.max(1,Math.round(h*down));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const image=await pdf.embedJpg(canvas.toDataURL('image/jpeg',.96)),page=pdf.addPage(a4);
      const view=visiblePage(page),box=attachmentBox(view,w,h,Infinity);
      // Unlike PDF pages, a small source photo may be enlarged within the safe area.
      page.drawImage(image,{x:box.left,y:box.bottom,width:w*box.scale,height:h*box.scale});
      drawHeader(page,view,box,header,number,1,1);
    }finally{if(canvas)canvas.width=canvas.height=0;URL.revokeObjectURL(url);}
  }
  async function build(row,seal,attachments,job){
    await tools();job.assert();
    const pdf=await window.PDFLib.PDFDocument.create();
    pdf.setTitle(row.subject||'발송용 공문');pdf.setAuthor(row.sender_name||'주식회사 드림포이엔');
    await addPaper(pdf,row,seal,job);
    const header=attachments.length?await headerAssets(pdf):null;
    for(const [i,file] of attachments.entries()){
      job.assert();job.progress('붙임 PDF 구성 중 · '+(i+1)+' / '+attachments.length+' · '+file.name);
      const bytes=await job.read(file);job.assert();
      try{await addAttachment(pdf,file,bytes,header,i+1);}catch(error){
        if(/encrypt/i.test(error?.message||''))throw Error(file.name+' · 암호를 해제한 PDF를 다시 첨부해주세요.');
        throw Error(file.name+' · '+(/^(첨부 PDF|합본은)/.test(error?.message||'')?error.message:'파일을 열지 못했습니다. 원본을 확인해 다시 첨부해주세요.'));
      }
    }
    job.assert();const bytes=await pdf.save();job.assert();return {bytes,pages:pdf.getPageCount()};
  }
  window.DF_OUTGOING_LETTER_PDF=Object.freeze({build,findBreak});
})();
