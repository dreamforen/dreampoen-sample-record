/* DREAMFOREN Pilot 0.1.0 — all changes apply only inside dreamforen-pilot/. */
(function(window,document){'use strict';
 const root=new URL('./',document.currentScript.src);
 function stop(message){
  document.write('<style>body{font:16px/1.7 system-ui;padding:30px;color:#183b37}main{max-width:520px;margin:15vh auto}</style><main><h1>시험용 앱 연결 확인</h1><p>'+message+'</p><p>기존 업무 웹은 평소 주소로 이용할 수 있습니다.</p></main><plaintext hidden>');
  window.stop();throw Error('Pilot bootstrap stopped: '+message);
 }
 if(!root.pathname.endsWith('/dreamforen-pilot/'))stop('압축 안의 dreamforen-pilot 폴더 전체를 올린 뒤, 해당 폴더 주소로 접속해 주세요.');
 const id=encodeURIComponent(root.pathname),prefix='df-pilot-v1::'+id+'::';
 function isolate(native){
  const get=k=>native.getItem(prefix+String(k));
  const keys=()=>Array.from({length:native.length},(_,i)=>native.key(i)).filter(k=>k&&k.startsWith(prefix)).map(k=>k.slice(prefix.length));
  const methods={getItem:get,setItem:(k,v)=>native.setItem(prefix+String(k),String(v)),removeItem:k=>native.removeItem(prefix+String(k)),
   clear:()=>keys().forEach(k=>native.removeItem(prefix+k)),key:i=>keys()[Number(i)>>>0]??null};
  return new Proxy({}, {
   get(_t,key){if(key==='length')return keys().length;if(key===Symbol.toStringTag)return 'Storage';if(key==='toString')return ()=> '[object Storage]';return Object.hasOwn(methods,key)?methods[key]:typeof key==='string'?get(key):undefined;},
   set(_t,key,value){methods.setItem(key,value);return true;},deleteProperty(_t,key){methods.removeItem(key);return true;},
   ownKeys:()=>keys(),getOwnPropertyDescriptor(_t,key){return keys().includes(key)?{value:get(key),writable:true,enumerable:true,configurable:true}:undefined;},
   has(_t,key){return key==='length'||Object.hasOwn(methods,key)||get(key)!==null;}
  });
 }
 try{
  const nativeLocal=window.localStorage,nativeSession=window.sessionStorage;
  const local=isolate(nativeLocal),session=isolate(nativeSession);
  const probe='__pilot_probe__';local.setItem(probe,'ok');if(local.getItem(probe)!=='ok')throw Error('storage probe');local.removeItem(probe);
  Object.defineProperty(window,'localStorage',{configurable:false,get:()=>local});
  Object.defineProperty(window,'sessionStorage',{configurable:false,get:()=>session});
  // Do not let changes to the original web's storage trigger pilot listeners.
  window.addEventListener('storage',e=>{
   if(e.key===null||!e.key.startsWith(prefix)){e.stopImmediatePropagation();return;}
   try{Object.defineProperty(e,'key',{value:e.key.slice(prefix.length)});}catch(_){e.stopImmediatePropagation();}
  },true);
 }catch(error){stop('앱 전용 임시저장 공간을 준비하지 못했습니다. 일반 브라우저 창에서 다시 열어 주세요.');}
 Object.defineProperty(window,'DF_PILOT',{value:Object.freeze({version:'0.1.0',root:root.href,id,namespace:prefix,
  database:'df-pilot-records-v1-'+id,channel:'df-pilot-records-v1-'+id,authKey:'df-pilot-auth-v1-'+id})});
})(window,document);
