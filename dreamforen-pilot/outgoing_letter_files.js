/* Private attachments; file bytes are staged locally until a document save. */
(function(){
  'use strict';
  const bucket='outgoing-letter-files',mb=1024*1024,limits=Object.freeze({file:25*mb,total:60*mb,count:12});
  const ext=Object.freeze({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'});
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const nameOf=value=>Array.from(String(value||'붙임 파일').replace(/[\u0000-\u001f\u007f/\\]/g,' ').trim()||'붙임 파일').slice(0,200).join('');
  const metadata=x=>({id:x.id,name:x.name,mime:x.mime,size:x.size,path:x.path});
  const path=(id,file,mime)=>id+'/'+file+'.'+ext[mime];
  const blobBytes=async blob=>{
    if(typeof blob.arrayBuffer==='function')return new Uint8Array(await blob.arrayBuffer());
    return new Uint8Array(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('파일을 읽을 수 없습니다.'));reader.readAsArrayBuffer(blob);}));
  };
  function mimeOf(bytes){
    if([0x25,0x50,0x44,0x46,0x2d].every((n,i)=>bytes[i]===n))return 'application/pdf';
    if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
    return '';
  }
  async function stage(id,file){
    const name=nameOf(file.name);
    if(!uuid.test(id)||file.size<5||file.size>limits.file)throw Error(name+' · 파일 한 개는 25MB까지 첨부할 수 있어요.');
    const mime=mimeOf(await blobBytes(file.slice(0,8)));
    if(!mime||!new RegExp('\\.'+(mime==='image/jpeg'?'jpe?g':ext[mime])+'$','i').test(String(file.name||'').trim()))throw Error(name+' · 원본을 PDF, JPG 또는 PNG로 저장한 뒤 첨부해주세요.');
    const fileId=crypto.randomUUID();return {id:fileId,name,mime,size:file.size,path:path(id,fileId,mime),file};
  }
  function manifest(id,value){
    if(value===undefined)return []; // Opening records from the previous schema before migration.
    if(!Array.isArray(value)||value.length>limits.count)throw Error('공문 붙임 목록을 읽을 수 없습니다.');
    let size=0;const ids=new Set();
    return value.map(x=>{
      if(!x||!uuid.test(id)||!uuid.test(x.id)||ids.has(x.id)||!Object.hasOwn(ext,x.mime)||!Number.isInteger(x.size)||x.size<5||x.size>limits.file||
          typeof x.name!=='string'||x.name!==nameOf(x.name)||x.path!==path(id,x.id,x.mime))throw Error('공문 붙임 목록의 형식이 올바르지 않습니다.');
      size+=x.size;if(size>limits.total)throw Error('붙임 파일 합계가 60MB를 넘습니다.');
      ids.add(x.id);return metadata(x);
    });
  }
  function configured(error){return /bucket not found|outgoing-letter-files.*not found/i.test(error?.message||'');}
  async function upload(c,items,guard){
    const staged=items.filter(x=>x.file&&!x.uploaded);
    if(!staged.length)return;
    const store=c.db.storage.from(bucket);
    for(const x of staged){
      guard();
      let error;
      try{({error}=await store.upload(x.path,new Blob([x.file],{type:x.mime}),{contentType:x.mime,upsert:false}));}
      catch(e){error=e;}
      guard();
      if(error){
        if(configured(error))throw Error('03_outgoing_letter_attachments.sql을 적용한 뒤 저장해주세요.');
        // A missing upload response may mean the original already reached Storage. Compare exact bytes.
        let prior;try{prior=await store.download(x.path);}catch(_){}
        guard();
        if(!prior?.data||prior.error||prior.data.size!==x.size)throw Error(x.name+' · 붙임을 저장하지 못했습니다. 연결을 확인하고 다시 저장해주세요.');
        const [a,b]=await Promise.all([blobBytes(prior.data),blobBytes(x.file)]);guard();
        if(a.length!==b.length||a.some((n,i)=>n!==b[i]))throw Error(x.name+' · 서버의 붙임과 원본이 달라 저장을 멈췄습니다. 파일을 제외한 뒤 다시 첨부해주세요.');
      }
      x.uploaded=true;
    }
  }
  async function readBytes(c,x,guard){
    guard();
    let data=x.file;
    if(!data){
      const result=await c.db.storage.from(bucket).download(x.path);guard();
      if(result.error||!result.data)throw Error(x.name+' · 저장된 붙임 파일을 열 수 없습니다.');
      data=result.data;
    }
    if(data.size!==x.size)throw Error(x.name+' · 저장된 파일의 크기가 달라 PDF 생성을 중단했습니다.');
    const bytes=await blobBytes(data);guard();
    if(mimeOf(bytes)!==x.mime)throw Error(x.name+' · 저장된 형식이 달라 PDF 생성을 중단했습니다.');
    return bytes;
  }
  const sizeLabel=n=>n>=mb?(n/mb).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  window.DF_OUTGOING_LETTER_FILES=Object.freeze({limits,stage,manifest,metadata,upload,readBytes,sizeLabel});
})();
