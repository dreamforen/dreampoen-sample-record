/* Beta405: selectable remembered login, with auth-only IndexedDB storage. */
(function(root){
  'use strict';
  function isQuotaError(error){
    return error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014||/exceeded the quota|storage.*(?:quota|full)/i.test(String(error?.message||error||''));
  }
  function create(url,host=root){
    const storageKey=`sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    const preferenceKey='df_auth_remember_v1:'+storageKey;
    const keys=new Set([storageKey,storageKey+'-code-verifier',storageKey+'-user']);
    const temporary=new Map(),tabKey=key=>'df_auth_tab_v1:'+key;
    let remember=true,lastMode='none';
    const read=(area,key)=>{try{return host[area]?.getItem(key)??null;}catch(_){return null;}};
    const write=(area,key,value)=>{try{host[area].setItem(key,value);return true;}catch(_){return false;}};
    const erase=(area,key)=>{try{host[area].removeItem(key);return true;}catch(_){return false;}};
    const allowed=key=>{if(typeof key!=='string'||(key!==storageKey&&!key.startsWith(storageKey+'-')))return false;keys.add(key);return true;};
    const database=new Promise(resolve=>{
      let settled=false,timer;
      const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
      try{
        if(!host.indexedDB){finish(null);return;}
        const request=host.indexedDB.open('dreamforen-auth-v1'+(host.DF_PILOT?.namespace?':'+host.DF_PILOT.namespace:''),1);
        timer=setTimeout(()=>finish(null),2500);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('sessions'))request.result.createObjectStore('sessions');};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();finish(db);};
        request.onerror=request.onblocked=()=>finish(null);
      }catch(_){finish(null);}
    });
    async function entry(key,operation,value){
      const db=await database;if(!db)return {ok:false};
      return new Promise(resolve=>{
        try{
          const tx=db.transaction('sessions',operation==='get'?'readonly':'readwrite');
          const store=tx.objectStore('sessions');
          const request=operation==='get'?store.get(key):operation==='delete'?store.delete(key):store.put(value,key);
          let result;
          request.onsuccess=()=>{result=request.result;};
          tx.oncomplete=()=>resolve({ok:true,found:result!==undefined,value:result});
          tx.onabort=tx.onerror=()=>resolve({ok:false});
        }catch(_){resolve({ok:false});}
      });
    }
    async function current(key){
      if(temporary.has(key))return {value:temporary.get(key),source:temporary.get(key)===null?'none':'memory'};
      const tab=read('sessionStorage',tabKey(key));
      if(tab!==null)return {value:tab,source:'tab'};
      if(remember){
        const saved=await entry(key,'get');
        // A null tombstone prevents an old localStorage token restoring after logout.
        if(saved.ok&&saved.found)return {value:saved.value,source:saved.value===null?'none':'persistent'};
        const local=read('localStorage',key);
        if(local!==null)return {value:local,source:'local'};
      }
      return {value:null,source:'none'};
    }
    const ready=(async()=>{
      const saved=await entry(preferenceKey,'get');
      const preference=saved.ok&&saved.found?saved.value:read('localStorage',preferenceKey);
      remember=preference!=='0';
      lastMode=(await current(storageKey)).source;
    })();
    async function save(key,value){
      value=String(value);
      temporary.set(key,value);
      if(remember){
        if((await entry(key,'put',value)).ok){
          erase('localStorage',key);erase('sessionStorage',tabKey(key));temporary.delete(key);
          if(key===storageKey)lastMode='persistent';return;
        }
        // A failed durable replacement must not leave a previous account's token.
        await entry(key,'delete');
        if(write('localStorage',key,value)){
          erase('sessionStorage',tabKey(key));temporary.delete(key);
          if(key===storageKey)lastMode='local';return;
        }
      }
      // Remove only this project's authentication keys, never work or drafts.
      const cleared=erase('localStorage',key)||read('localStorage',key)===null;
      if(cleared&&write('sessionStorage',tabKey(key),value)){
        temporary.delete(key);if(key===storageKey)lastMode='tab';
      }else{erase('sessionStorage',tabKey(key));if(key===storageKey)lastMode='memory';}
    }
    const storage=Object.freeze({
      async getItem(key){if(!allowed(key))return null;await ready;const found=await current(key);if(key===storageKey)lastMode=found.source;return found.value;},
      async setItem(key,value){if(!allowed(key))return;await ready;await save(key,value);},
      async removeItem(key){
        if(!allowed(key))return;await ready;
        temporary.set(key,null);
        let durable=await entry(key,'put',null);if(!durable.ok)durable=await entry(key,'delete');
        const local=erase('localStorage',key),tab=erase('sessionStorage',tabKey(key));
        if(durable.ok&&local&&tab)temporary.delete(key);
        if(key===storageKey)lastMode='none';
      }
    });
    async function setRemember(value){
      await ready;
      const next=!!value;
      if(next===remember)return;
      const existing=await Promise.all([...keys].map(async key=>[key,(await current(key)).value]));
      // Save the choice separately from the session; passwords are never stored.
      await entry(preferenceKey,'put',next?'1':'0');
      write('localStorage',preferenceKey,next?'1':'0');
      remember=next;
      for(const [key,token] of existing){
        if(!next){await entry(key,'put',null);erase('localStorage',key);}
        if(token!==null)await save(key,token);
      }
    }
    function clearFallback(){
      for(const key of keys){erase('sessionStorage',tabKey(key));temporary.delete(key);}
      lastMode='none';
    }
    return Object.freeze({storageKey,storage,ready:()=>ready,setRemember,remembered:()=>remember,clearFallback,mode:()=>lastMode});
  }
  root.DF_AUTH_STORAGE=Object.freeze({create,isQuotaError});
})(typeof window==='undefined'?globalThis:window);
