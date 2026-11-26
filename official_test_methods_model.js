/* Dedicated official test-method documents; existing quality/approval documents stay separate. */
(function (global) {
  'use strict';
  const CATEGORY='official_test_method',BUCKET='quality-documents',TABLE='quality_documents';
  const MAX_FILE_SIZE=50*1024*1024,MAX_BODY_SIZE=1024*1024,MAX_HISTORY=100;
  const DOMAINS=Object.freeze(['대기','수질','폐기물','악취','실내공기질','소음·진동','공통','기타']);
  const TYPES=Object.freeze({pdf:'application/pdf',hwp:'application/x-hwp',hwpx:'application/hwp+zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'});
  const text=value=>String(value??'');
  const copy=value=>JSON.parse(JSON.stringify(value));
  const bytes=value=>new TextEncoder().encode(value).length;
  function failure(message,code){const error=new Error(message);if(code)error.code=code;return error;}
  function field(value,label,max,trim=true){const out=trim?text(value).trim():text(value);if(out.length>max)throw failure(label+'의 길이를 확인해주세요.','VALIDATION');return out;}
  function isoDate(value){
    const date=text(value).trim();if(!date)return '';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw failure('시행일을 올바른 날짜로 입력해주세요.','VALIDATION');
    return date;
  }
  function sourceUrl(value){
    const source=field(value,'출처 주소',2048);if(!source)return '';
    let url;try{url=new URL(source);}catch(_){throw failure('출처 주소는 http 또는 https 주소로 입력해주세요.','VALIDATION');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw failure('출처 주소는 인증정보가 없는 http 또는 https 주소만 사용할 수 있습니다.','VALIDATION');
    return url.href;
  }
  function normalize(values={}){
    const title=field(values.title,'문서명',300);if(!title)throw failure('문서명을 입력해주세요.','VALIDATION');
    const domain=text(values.domain||'대기').trim(),status=text(values.status||'active').trim();
    if(!DOMAINS.includes(domain))throw failure('분야를 선택해주세요.','VALIDATION');
    if(!['active','draft','obsolete'].includes(status))throw failure('문서 상태를 확인해주세요.','VALIDATION');
    const body=text(values.body);if(bytes(body)>MAX_BODY_SIZE)throw failure('본문은 1MB 이하로 입력해주세요.','VALIDATION');
    return {title,docNo:field(values.docNo,'시험법 번호',100),version:field(values.version||'0','개정번호',80),status,domain,effectiveDate:isoDate(values.effectiveDate),sourceUrl:sourceUrl(values.sourceUrl),body,note:field(values.note,'비고',4000,false)};
  }
  function ownedPath(path){
    const value=text(path);
    return value.startsWith(CATEGORY+'/')&&value.length<=1200&&!/[\\\x00-\x1f?#]/.test(value)&&!value.split('/').some(part=>part==='..'||part==='.'||!part);
  }
  function assertRow(row){if(!row||row.category!==CATEGORY||!text(row.id))throw failure('공정시험법 문서를 확인할 수 없습니다.','CATEGORY');return row;}
  function historyItems(value){
    if(value==null)return [];
    if(!Array.isArray(value)||value.length>MAX_HISTORY)throw failure('이전 파일 이력이 올바르지 않거나 100건을 초과했습니다.','HISTORY_LIMIT');
    return value.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||!ownedPath(item.storage_path))throw failure('이전 파일의 보관 경로를 확인해주세요.','FILE_PATH');
      return {...copy(item),file_name:field(item.file_name,'이전 파일명',512),storage_path:field(item.storage_path,'이전 파일 경로',1200),mime_type:field(item.mime_type,'파일 형식',150),file_size:Number(item.file_size)||0,version:field(item.version,'이전 개정번호',80),replaced_at:field(item.replaced_at,'이전 파일 보관일',80)};
    });
  }
  function decode(row){
    assertRow(row);let metadata=null;
    try{const parsed=JSON.parse(text(row.content));if(parsed&&parsed.kind===CATEGORY&&parsed.schema===1)metadata=parsed;}catch(_){}
    const data=metadata||{};
    return {...row,title:text(row.title),docNo:text(row.doc_no),version:text(row.version||'0'),status:text(row.status||'active'),domain:DOMAINS.includes(data.domain)?data.domain:'대기',effectiveDate:text(data.effectiveDate),sourceUrl:text(data.sourceUrl),body:metadata?text(data.body):text(row.content),note:text(data.note),history:historyItems(data.history)};
  }
  function validateFile(file){
    if(!file||typeof file.name!=='string'||!file.name.trim()||file.name.length>512||/[\x00-\x1f]/.test(file.name))throw failure('업로드할 파일을 선택해주세요.','FILE_VALIDATION');
    const extension=file.name.split('.').pop().toLowerCase();
    if(!Object.hasOwn(TYPES,extension)||/^(text\/html|image\/svg\+xml|(?:text|application)\/(?:javascript|x-javascript))$/i.test(file.type||''))throw failure('PDF·HWP·HWPX·DOCX·TXT·PNG·JPG 파일을 업로드해주세요.','FILE_VALIDATION');
    if(!Number.isFinite(Number(file.size))||Number(file.size)<=0||Number(file.size)>MAX_FILE_SIZE)throw failure('파일 크기는 0바이트보다 크고 50MB 이하여야 합니다.','FILE_VALIDATION');
    return {name:file.name,extension,mimeType:TYPES[extension],size:Number(file.size)};
  }
  function uniquePath(file){
    const uuid=global.crypto?.randomUUID?.();if(!uuid)throw failure('안전한 파일명을 만들 수 없습니다. 브라우저를 새로고침해주세요.','UPLOAD');
    const safe=file.name.replace(/[^0-9A-Za-z._-]/g,'_').slice(-180)||('document.'+file.extension);
    return CATEGORY+'/'+uuid+'_'+safe;
  }
  function repository({getSession,can}={}){
    if(typeof getSession!=='function'||typeof can!=='function')throw failure('공정시험법 연결 설정을 확인해주세요.','CONFIG');
    function capture(){const session=getSession()||{};if(!session.client||!text(session.userId))throw failure('로그인 후 공정시험법을 확인해주세요.','SESSION');return {client:session.client,userId:text(session.userId)};}
    function same(token){const session=getSession()||{};return session.client===token.client&&text(session.userId)===token.userId;}
    function active(token){if(!same(token))throw failure('로그인이 변경되어 작업을 중단했습니다. 현재 계정에서 다시 열어주세요.','SESSION_CHANGED');return token;}
    function permit(token,action){active(token);if(can(action)!==true)throw failure('공정시험법 '+({view:'조회',create:'등록',update:'수정',delete:'삭제',upload:'파일 업로드'}[action]||action)+' 권한이 없습니다.','PERMISSION');}
    async function request(token,query){active(token);const response=await query;active(token);if(response?.error)throw response.error;if(!response||!Object.hasOwn(response,'data'))throw failure('서버 응답을 확인할 수 없습니다.','RESPONSE');return response.data;}
    async function current(token,row,optimistic){
      assertRow(row);let query=token.client.from(TABLE).select('*').eq('id',row.id).eq('category',CATEGORY);
      if(optimistic){if(!text(row.updated_at))throw failure('최신 문서를 다시 열고 수정해주세요.','CONFLICT');query=query.eq('updated_at',row.updated_at);}
      const value=await request(token,query.maybeSingle());
      if(!value)throw failure('문서가 변경되었거나 삭제되었습니다. 새로고침 후 다시 확인해주세요.','CONFLICT');
      assertRow(value);if(text(value.id)!==text(row.id))throw failure('조회한 문서를 확인할 수 없습니다.','RESPONSE');return value;
    }
    async function cleanup(token,paths){
      active(token);const valid=[...new Set(paths.filter(ownedPath))];if(!valid.length)return;
      const response=await token.client.storage.from(BUCKET).remove(valid);active(token);if(response?.error)throw response.error;
    }
    async function cleanupUnreferenced(token,path){
      // A transport or response-verification error can occur after a committed write.
      // Never remove an uploaded object until the server confirms no document uses it.
      // Generated paths contain no PostgREST syntax. Include history references too:
      // a second editor might already have replaced this newly committed object.
      const rows=await request(token,token.client.from(TABLE).select('id').eq('category',CATEGORY).or('storage_path.eq.'+path+',content.like.%'+path+'%').limit(1));
      if(!Array.isArray(rows))throw failure('파일 저장 상태를 확인하지 못했습니다.','RESPONSE');
      if(!rows.length)await cleanup(token,[path]);
    }
    async function list(){
      const token=capture();permit(token,'view');const rows=[];
      for(let offset=0;offset<10000;offset+=500){
        const batch=await request(token,token.client.from(TABLE).select('*').eq('category',CATEGORY).order('updated_at',{ascending:false}).range(offset,offset+499));
        permit(token,'view');
        if(!Array.isArray(batch)||batch.some(row=>row?.category!==CATEGORY))throw failure('공정시험법 목록 응답을 확인할 수 없습니다.','RESPONSE');
        rows.push(...batch);if(batch.length<500)return rows;
      }
      throw failure('등록 문서가 많아 전체 목록을 확인하지 못했습니다. 관리자에게 문의해주세요.','LIST_LIMIT');
    }
    async function save({row=null,values,file=null}={}){
      const token=capture(),action=row?'update':'create';permit(token,action);if(file)permit(token,'upload');
      const normalized=normalize(values),info=file?validateFile(file):null;
      const prior=row?await current(token,row,true):null;
      const history=prior?decode(prior).history:[];
      if(file&&prior?.storage_path){
        if(!ownedPath(prior.storage_path))throw failure('현재 파일의 보관 경로를 확인해주세요.','FILE_PATH');
        if(history.length>=MAX_HISTORY)throw failure('이전 파일 이력이 100건에 도달했습니다. 새 문서로 등록해주세요.','HISTORY_LIMIT');
        history.push({file_name:text(prior.file_name),storage_path:prior.storage_path,mime_type:text(prior.mime_type),file_size:Number(prior.file_size)||0,version:text(prior.version),replaced_at:new Date().toISOString()});
      }
      const payload={category:CATEGORY,title:normalized.title,doc_no:normalized.docNo,version:normalized.version,status:normalized.status,content:JSON.stringify({kind:CATEGORY,schema:1,domain:normalized.domain,effectiveDate:normalized.effectiveDate,sourceUrl:normalized.sourceUrl,body:normalized.body,note:normalized.note,history}),updated_by:token.userId,updated_at:new Date().toISOString()};
      if(bytes(payload.content)>2*MAX_BODY_SIZE)throw failure('문서 정보의 크기를 줄여주세요.','VALIDATION');
      if(!prior)Object.assign(payload,{created_by:token.userId,file_name:null,storage_path:null,mime_type:null,file_size:0});
      let uploaded='';
      try{
        if(file){
          permit(token,action);permit(token,'upload');uploaded=uniquePath(info);
          const result=await token.client.storage.from(BUCKET).upload(uploaded,file,{contentType:info.mimeType,upsert:false});active(token);if(result?.error){uploaded='';throw result.error;}
          if(!result?.data)throw failure('파일 업로드 결과를 확인할 수 없습니다.','UPLOAD');
          Object.assign(payload,{file_name:info.name,storage_path:uploaded,mime_type:info.mimeType,file_size:info.size});
        }
        permit(token,action);if(file)permit(token,'upload');
        const query=prior?token.client.from(TABLE).update(payload).eq('id',prior.id).eq('category',CATEGORY).eq('updated_at',prior.updated_at).select('*').maybeSingle():token.client.from(TABLE).insert(payload).select('*').single();
        const saved=await request(token,query);
        if(!saved)throw failure('다른 곳에서 문서가 변경되었습니다. 새로고침 후 다시 저장해주세요.','CONFLICT');
        assertRow(saved);if(prior&&text(saved.id)!==text(prior.id)||saved.title!==payload.title||saved.content!==payload.content||file&&saved.storage_path!==uploaded)throw failure('저장된 문서 내용을 확인하지 못했습니다. 새로고침 후 확인해주세요.','RESPONSE');
        return saved;
      }catch(error){
        if(uploaded&&same(token)){
          try{await cleanupUnreferenced(token,uploaded);}catch(cleanupError){if(same(token)){error.cleanupWarning='업로드한 파일의 저장 상태 또는 정리를 확인하지 못했습니다. 관리자에게 문의해주세요.';}}
        }
        throw error;
      }
    }
    async function remove(row){
      const token=capture();permit(token,'delete');const prior=await current(token,row,true),history=decode(prior).history;
      const paths=[prior.storage_path,...history.map(item=>item.storage_path)].filter(Boolean);
      permit(token,'delete');
      const removed=await request(token,token.client.from(TABLE).delete().eq('id',prior.id).eq('category',CATEGORY).eq('updated_at',prior.updated_at).select('id,category,updated_at').maybeSingle());
      if(!removed)throw failure('다른 곳에서 문서가 변경되었습니다. 새로고침 후 다시 삭제해주세요.','CONFLICT');
      assertRow(removed);if(text(removed.id)!==text(prior.id))throw failure('삭제 결과를 확인할 수 없습니다.','RESPONSE');
      const warnings=[];if(paths.some(path=>!ownedPath(path)))warnings.push('공정시험법 외의 파일은 정리하지 않았습니다.');
      try{permit(token,'delete');await cleanup(token,paths);}catch(error){if(!same(token))throw error;warnings.push('문서는 삭제했지만 첨부파일 정리를 완료하지 못했습니다. 관리자에게 문의해주세요.');}
      return {deleted:true,...(warnings.length?{cleanupWarning:warnings.join(' ')}:{})};
    }
    async function file(row){
      const token=capture();permit(token,'view');assertRow(row);const path=text(row.storage_path);
      if(!ownedPath(path))throw failure('공정시험법 첨부파일 경로를 확인해주세요.','FILE_PATH');
      const prior=await current(token,row,false),paths=[prior.storage_path,...decode(prior).history.map(item=>item.storage_path)];
      if(!paths.includes(path))throw failure('이 문서에 연결된 첨부파일이 아닙니다. 새로고침 후 다시 확인해주세요.','FILE_PATH');
      permit(token,'view');const data=await request(token,token.client.storage.from(BUCKET).download(path));
      permit(token,'view');
      if(!data||typeof data.arrayBuffer!=='function')throw failure('파일을 읽을 수 없습니다.','RESPONSE');return data;
    }
    return Object.freeze({list,save,remove,file});
  }
  const api=Object.freeze({CATEGORY,BUCKET,MAX_FILE_SIZE,DOMAINS,decode,normalize,validateFile,repository});
  global.DFOfficialTestMethodModel=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
