/* DREAMPOEN v120.37.32.0 — read-only HWPX batch download; no document merging. */
(function(){
  'use strict';
  function text(v){return String(v==null?'':v).trim();}
  function safeName(value){var name=text(value).normalize('NFC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g,'_').replace(/^\.+/,'').replace(/[. ]+$/,'');return name||'성적서.hwpx';}
  function uniqueName(value,used){var raw=safeName(value),stem=raw.replace(/\.hwpx$/i,'').slice(0,170),extension=/\.hwpx$/i.test(raw)?'.hwpx':'',name=stem+extension,n=1;while(used.has(name.toLowerCase()))name=stem+' ('+(++n)+')'+extension;used.add(name.toLowerCase());return name;}
  async function bytes(blob){if(blob&&typeof blob.arrayBuffer==='function')return blob.arrayBuffer();if(blob instanceof Uint8Array||blob instanceof ArrayBuffer)return blob;return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=function(){reject(Error('파일 내용을 읽지 못했습니다.'));};reader.readAsArrayBuffer(blob);});}
  async function create(options){
    var files=(options.files||[]).slice();if(!files.length)throw Error('다운로드할 HWPX 파일이 없습니다.');if(!window.JSZip)throw Error('ZIP 구성요소를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    var zip=new window.JSZip(),used=new Set();
    for(var i=0;i<files.length;i++){
      var file=files[i];if(options.progress)options.progress(i,files.length,file);
      try{var blob=await options.load(file);if(!blob)throw Error('파일이 없습니다.');zip.file(uniqueName(options.name?options.name(file):file.file_name,used),await bytes(blob));}
      catch(error){throw Error('다음 파일을 받지 못해 ZIP 다운로드를 중단했습니다. 일부 파일만 빠진 압축파일은 만들지 않습니다.\n'+text(file.file_name)+'\n'+text(error&&error.message||error));}
    }
    if(options.progress)options.progress(files.length,files.length,null);
    return zip.generateAsync({type:'blob',compression:'STORE'});
  }
  window.DF_REPORT_DOWNLOADS={create:create,safeName:safeName,uniqueName:uniqueName};
})();
