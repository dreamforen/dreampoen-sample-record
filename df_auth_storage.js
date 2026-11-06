/* Beta404: protect the login session from a full browser storage area. */
(function(root){
  'use strict';
  function isQuotaError(error){
    return error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014||/exceeded the quota|storage.*(?:quota|full)/i.test(String(error?.message||error||''));
  }

  function create(url,host=root){
    // Match the existing Supabase browser key so existing sessions still restore.
    const storageKey=`sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    const keys=new Set([storageKey,storageKey+'-code-verifier',storageKey+'-user']);
    const temporary=new Map();
    const tabKey=key=>'df_auth_tab_v1:'+key;
    const allowed=key=>{
      if(typeof key!=='string'||(key!==storageKey&&!key.startsWith(storageKey+'-')))return false;
      keys.add(key);
      return true;
    };

    function read(area,key){try{return host[area]?.getItem(key)??null;}catch(_){return null;}}
    function write(area,key,value){try{host[area].setItem(key,value);return true;}catch(_){return false;}}
    function erase(area,key){try{host[area].removeItem(key);return true;}catch(_){return false;}}

    function current(key){
      if(temporary.has(key))return {value:temporary.get(key),source:'memory'};
      const shared=read('localStorage',key);
      if(shared!==null){
        // A later normal session, including one written in another tab, wins.
        if(read('sessionStorage',tabKey(key))!==null)erase('sessionStorage',tabKey(key));
        return {value:shared,source:'local'};
      }
      const tab=read('sessionStorage',tabKey(key));
      return {value:tab,source:tab===null?'none':'tab'};
    }

    const storage=Object.freeze({
      getItem(key){return allowed(key)?current(key).value:null;},
      setItem(key,value){
        if(!allowed(key))return;
        value=String(value);
        if(write('localStorage',key,value)){
          erase('sessionStorage',tabKey(key));
          temporary.delete(key);
          return;
        }
        // Keep the replacement before clearing only the obsolete auth key.
        // No measurements, drafts, outbox entries, or caches are touched here.
        temporary.set(key,value);
        const cleared=erase('localStorage',key)||read('localStorage',key)===null;
        if(cleared&&write('sessionStorage',tabKey(key),value))temporary.delete(key);
        else erase('sessionStorage',tabKey(key));
      },
      removeItem(key){
        if(!allowed(key))return;
        const localCleared=erase('localStorage',key),tabCleared=erase('sessionStorage',tabKey(key));
        if(localCleared&&tabCleared)temporary.delete(key);
        else temporary.set(key,null);
      }
    });

    function clearFallback(){
      // Supabase broadcasts sign-out. Drop this tab's copy without clearing a
      // shared session written by another tab after the sign-out event.
      for(const key of keys){
        const cleared=erase('sessionStorage',tabKey(key));
        if(!cleared||temporary.get(key)===null)temporary.set(key,null);
        else temporary.delete(key);
      }
    }

    return Object.freeze({storageKey,storage,clearFallback,mode:()=>current(storageKey).source});
  }
  root.DF_AUTH_STORAGE=Object.freeze({create,isQuotaError});
})(typeof window==='undefined'?globalThis:window);
