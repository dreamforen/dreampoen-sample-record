/* DREAMPOEN v120.37.33.0 — read-only, section-preserving HWPX collection. */
(function () {
  'use strict';
  var VERSION='120.37.33.0', MAX_FILES=100, MAX_BYTES=120*1024*1024, MAX_XML=15*1024*1024;
  var HH='http://www.hancom.co.kr/hwpml/2011/head', OPF='http://www.idpf.org/2007/opf/';
  var GROUPS={borderFills:'borderFill',charProperties:'charPr',tabProperties:'tabPr',numberings:'numbering',bullets:'bullet',paraProperties:'paraPr',styles:'style',memoProperties:'memoPr'};
  var ORDER=['fontfaces','borderFills','charProperties','tabProperties','numberings','bullets','paraProperties','styles','memoProperties'];
  var REFS={borderFillIDRef:'borderFills',charPrIDRef:'charProperties',paraPrIDRef:'paraProperties',tabPrIDRef:'tabProperties',styleIDRef:'styles',nextStyleIDRef:'styles',numberingIDRef:'numberings',bulletIDRef:'bullets',outlineShapeIDRef:'numberings',memoShapeIDRef:'memoProperties'};
  var OPTIONAL={outlineShapeIDRef:1,memoShapeIDRef:1,numberingIDRef:1,bulletIDRef:1};
  var FORBIDDEN=new Set(['ole','chart','video','formObject','fieldBegin','fieldEnd','footNote','endNote','bookmark','connectLine','trackChange','trackChangeBegin','trackChangeEnd']);
  function txt(v){return String(v==null?'':v);}
  function children(n){return Array.from(n.children||n.childNodes||[]).filter(function(x){return x.nodeType===1;});}
  function all(n){return [n].concat(Array.from(n.getElementsByTagName('*'))).filter(function(x){return x.nodeType===1;});}
  function child(n,name){return children(n).find(function(x){return x.localName===name;});}
  function fail(message){throw Error(message);}
  function path(value){value=txt(value);if(!value||value.indexOf('\\')>=0||value.charAt(0)==='/'||/^[a-z][\w+.-]*:/i.test(value)||value.split('/').some(function(p){return p==='..'||p==='.';}))fail('안전하지 않은 HWPX 내부 경로입니다.');return value;}
  function parse(xml,name){if(xml.length>MAX_XML||/<!DOCTYPE|<!ENTITY/i.test(xml))fail('지원하지 않는 XML 선언 또는 문서 크기입니다: '+name);var doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)fail('HWPX XML을 읽을 수 없습니다: '+name);return doc;}
  function serial(n){return new XMLSerializer().serializeToString(n);}
  async function bytes(blob){if(blob&&typeof blob.arrayBuffer==='function')return blob.arrayBuffer();if(ArrayBuffer.isView(blob)||Object.prototype.toString.call(blob)==='[object ArrayBuffer]')return blob;return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=function(){reject(Error('파일을 읽을 수 없습니다.'));};reader.readAsArrayBuffer(blob);});}
  async function xml(zip,name){var f=zip.file(name);if(!f)fail('HWPX 구성 파일이 없습니다: '+name);return parse(await f.async('string'),name);}
  function mapValue(map,value,what,optional){if(map&&map.has(value))return map.get(value);if(optional&&(value==='0'||value===''))return value;fail('연결할 수 없는 '+what+' 참조입니다: '+value);}
  function shell(doc,name){return doc.createElementNS(HH,'hh:'+name);}
  function count(n,attr){n.setAttribute(attr||'itemCnt',String(children(n).length));}
  function rootSignature(root){return root.namespaceURI+'|'+Array.from(root.attributes).filter(function(a){return a.localName!=='secCnt'&&a.namespaceURI!=='http://www.w3.org/2000/xmlns/';}).map(function(a){return a.name+'='+a.value;}).sort().join('|')+'|'+children(root).filter(function(n){return !['refList','beginNum'].includes(n.localName);}).map(function(n){var copy=n.cloneNode(true);all(copy).forEach(function(e){Array.from(e.attributes).forEach(function(a){if(a.namespaceURI==='http://www.w3.org/2000/xmlns/')e.removeAttributeNode(a);});});return serial(copy);}).join('');}
  function checkRefs(root,maps,resources,objects){
    all(root).forEach(function(n){
      var local=n.localName;if(FORBIDDEN.has(local))fail('이 문서는 '+local+' 개체가 있어 원본 보존을 위해 합본을 중단했습니다. 개별 HWPX로 받아주세요.');
      if(local==='img'&&n.getAttribute('binaryItemIDRef')&&!resources.has(n.getAttribute('binaryItemIDRef')))fail('문서에 포함되지 않은 연결 그림이 있습니다. 개별 HWPX로 받아주세요.');
      if(local==='fontRef')Array.from(n.attributes).forEach(function(a){var lang=a.localName.toUpperCase();n.setAttribute(a.name,mapValue(maps.fontfaces[lang],a.value,'글꼴'));});
      Array.from(n.attributes).forEach(function(a){
        var key=a.localName,value=a.value;
        if(REFS[key]){n.setAttribute(a.name,mapValue(maps[REFS[key]],value,key,OPTIONAL[key]));return;}
        if(key==='binaryItemIDRef'){n.setAttribute(a.name,mapValue(resources,value,'그림/파일'));return;}
        if(key==='idRef'&&local==='masterPage'){n.setAttribute(a.name,mapValue(resources,value,'바탕쪽'));return;}
        if(key==='idRef'&&local==='heading'){var type=n.getAttribute('type');if(type==='NONE'){if(value!=='0'&&value!=='')fail('지원하지 않는 문단 번호 참조입니다.');return;}n.setAttribute(a.name,mapValue(maps[type==='BULLET'?'bullets':'numberings'],value,'문단 번호',true));return;}
        if(key==='href'&&value){fail('외부 연결 개체가 있는 문서는 합본할 수 없습니다.');}
        if((key==='linkListIDRef'||key==='linkListNextIDRef')&&value!=='0'&&value!=='')fail('연결된 글상자가 있어 원본 보존을 위해 합본을 중단했습니다.');
        if(/IDRef$|^idRef$/.test(key)&&!['linkListIDRef','linkListNextIDRef'].includes(key))fail('지원하지 않는 참조입니다: '+key);
        if((key==='id'||key==='instid')&&objects&&!['p','subList','secPr','colPr'].includes(local)&&value&&/^\d+$/.test(value)){var objectKey=local+':'+key+':'+value;if(!objects.map.has(objectKey))objects.map.set(objectKey,String(objects.next++));n.setAttribute(a.name,objects.map.get(objectKey));}
      });
    });
  }
  function buildMaps(source,destRef){
    var maps={fontfaces:{}},sourceRef=child(source.header.documentElement,'refList');if(!sourceRef)fail('HWPX 서식 목록이 없습니다.');
    children(sourceRef).forEach(function(group){
      var name=group.localName;if(!ORDER.includes(name)){if(children(group).length)fail('지원하지 않는 서식 목록입니다: '+name);return;}
      var dest=child(destRef,name);if(!dest){dest=shell(destRef.ownerDocument,name);destRef.appendChild(dest);}
      if(name==='fontfaces'){
        children(group).forEach(function(face){var lang=face.getAttribute('lang'),destFace=children(dest).find(function(x){return x.getAttribute('lang')===lang;});if(!destFace){destFace=destRef.ownerDocument.importNode(face,false);dest.appendChild(destFace);}var next=children(destFace).reduce(function(m,e){return Math.max(m,Number(e.getAttribute('id'))+1);},0),mapping=new Map();children(face).forEach(function(font){var id=font.getAttribute('id');if(mapping.has(id))fail('글꼴 ID가 중복되었습니다.');mapping.set(id,String(next++));});maps.fontfaces[lang]=mapping;});
      }else{var next=children(dest).reduce(function(m,e){return Math.max(m,Number(e.getAttribute('id'))+1);},name==='borderFills'||name==='numberings'||name==='bullets'?1:0),mapping=new Map();children(group).forEach(function(item){if(item.localName!==GROUPS[name])fail('지원하지 않는 서식 항목입니다: '+item.localName);var id=item.getAttribute('id');if(!/^\d+$/.test(id)||mapping.has(id))fail('서식 ID가 올바르지 않습니다.');mapping.set(id,String(next++));});maps[name]=mapping;}
    });
    return maps;
  }
  function appendStyles(source,destRef,maps,resources){
    var sourceRef=child(source.header.documentElement,'refList');children(sourceRef).forEach(function(group){
      var name=group.localName;if(!ORDER.includes(name))return;var dest=child(destRef,name);
      if(name==='fontfaces'){children(group).forEach(function(face){var lang=face.getAttribute('lang'),target=children(dest).find(function(x){return x.getAttribute('lang')===lang;});children(face).forEach(function(font){var node=destRef.ownerDocument.importNode(font,true);node.setAttribute('id',maps.fontfaces[lang].get(font.getAttribute('id')));checkRefs(node,maps,resources);target.appendChild(node);});count(target,'fontCnt');});}
      else children(group).forEach(function(item){var node=destRef.ownerDocument.importNode(item,true);node.setAttribute('id',maps[name].get(item.getAttribute('id')));checkRefs(node,maps,resources);dest.appendChild(node);});
      count(dest);
    });ORDER.forEach(function(name){var n=child(destRef,name);if(n)destRef.appendChild(n);});
  }
  function firstSectionControls(source){var root=source.sections[0].doc.documentElement;return ['header','footer'].reduce(function(result,type){result[type]=all(root).filter(function(n){return n.localName===type;}).map(function(n){return n.getAttribute('applyPageType')||'BOTH';});return result;},{});}
  function guardInheritance(source,previous){var current=firstSectionControls(source),firstSec=all(source.sections[0].doc.documentElement).find(function(n){return n.localName==='secPr';}),hasMaster=firstSec&&children(firstSec).some(function(n){return n.localName==='masterPage';});if(previous.master&&!hasMaster)fail('시설 간 바탕쪽 상속을 안전하게 분리할 수 없습니다. 이 조합은 개별 HWPX로 받아주세요.');if(source.masters.length)previous.master=true;['header','footer'].forEach(function(type){var active=previous[type]||[];if(active.length){var cur=new Set(current[type]);if(!cur.has('BOTH')&&active.some(function(x){return x==='BOTH'?!(cur.has('ODD')&&cur.has('EVEN')):!cur.has(x);}))fail('시설 간 '+(type==='header'?'머리말':'꼬리말')+' 상속을 안전하게 분리할 수 없습니다. 이 조합은 개별 HWPX로 받아주세요.');}source.sections.forEach(function(section){all(section.doc.documentElement).forEach(function(n){if(n.localName===type)active.push(n.getAttribute('applyPageType')||'BOTH');});});previous[type]=active;});}
  async function readSource(blob,index,limits){
    var raw=await bytes(blob);if(raw.byteLength>MAX_BYTES)fail('파일이 너무 큽니다. 업체/연도를 나누어 받아주세요.');var zip=await window.JSZip.loadAsync(raw),files=Object.values(zip.files).filter(function(x){return !x.dir;});if(files.length>2000)fail('구성 파일이 너무 많은 HWPX입니다.');files.forEach(function(f){path(f.name);if(f.unsafeOriginalName&&f.name!==f.unsafeOriginalName)fail('변형된 내부 경로가 있는 HWPX입니다.');limits.bytes+=Number(f._data&&f._data.uncompressedSize)||0;});if(limits.bytes>MAX_BYTES)fail('합본 용량을 초과했습니다. 업체/연도를 나누어 받아주세요.');
    var mt=zip.file('mimetype');if(!mt||!(await mt.async('string')).includes('hwp+zip'))fail('HWPX 형식의 파일이 아닙니다.');
    var encryption=await xml(zip,'META-INF/manifest.xml');if(children(encryption.documentElement).length)fail('암호화 또는 서명된 HWPX는 합본할 수 없습니다.');
    var pkg=await xml(zip,'Contents/content.hpf'),manifest=child(pkg.documentElement,'manifest'),spine=child(pkg.documentElement,'spine');if(!manifest||!spine)fail('HWPX 문서 순서 정보가 없습니다.');
    var entries=children(manifest),byId=new Map(),resources=new Map(),sections=[],masters=[],binary=[];var sectionIndex=0;
    for(var item of entries){var id=item.getAttribute('id'),href=path(item.getAttribute('href'));if(byId.has(id))fail('문서 리소스 ID가 중복되었습니다.');byId.set(id,item);if(!zip.file(href))fail('문서 구성 파일이 누락되었습니다: '+href);
      if(href==='Contents/header.xml'||href==='settings.xml')continue;
      if(/^Contents\/section\d+\.xml$/.test(href))continue;
      if(/^Contents\/masterpage\d+\.xml$/.test(href)){resources.set(id,'m'+index+'_'+id);masters.push({item:item,doc:await xml(zip,href),target:'Contents/m'+index+'_'+href.split('/').pop()});continue;}
      if(href.startsWith('BinData/')){if(!/^image\//.test(item.getAttribute('media-type')||''))fail('그림 이외의 삽입 파일이 있어 합본할 수 없습니다.');resources.set(id,'m'+index+'_'+id);binary.push({item:item,target:'BinData/m'+index+'_'+binary.length+'_'+href.split('/').pop()});continue;}
      if(href.startsWith('Scripts/')){var data=await zip.file(href).async('uint8array'),script;try{script=new TextDecoder((data[0]===255&&data[1]===254)||(data[1]===0&&data[3]===0)?'utf-16le':'utf-8').decode(data);}catch(e){fail('문서 스크립트를 확인할 수 없습니다.');}script=script.replace(/^\uFEFF/,'').replace(/\/\/[^\r\n]*/g,'').replace(/\s+/g,'');if(script&&!['varDocuments=XHwpDocuments;varDocument=Documents.Active_XHwpDocument;','functionOnDocument_New(){}'].includes(script))fail('사용자 매크로가 있는 문서는 원본 보존을 위해 합본할 수 없습니다.');continue;}
      fail('지원하지 않는 HWPX 구성 요소입니다: '+href);
    }
    var seen=new Set();for(var ref of children(spine)){var id=ref.getAttribute('idref'),item=byId.get(id);if(!item)fail('문서 읽기 순서의 파일이 누락되었습니다.');var href=item.getAttribute('href');if(/^Contents\/section\d+\.xml$/.test(href)){if(seen.has(id))fail('문서 구역이 중복되었습니다.');seen.add(id);sections.push({item:item,doc:await xml(zip,href)});sectionIndex++;}}
    if(!sections.length||entries.filter(function(i){return /^Contents\/section\d+\.xml$/.test(i.getAttribute('href'));}).length!==sectionIndex)fail('문서 구역 순서를 확인할 수 없습니다.');
    var format=await xml(zip,'version.xml'),versionRoot=format.documentElement,formatVersion=['xmlVersion','major','minor','micro','buildNumber','tagetApplication','targetApplication'].map(function(k){return k+'='+versionRoot.getAttribute(k);}).join('|');var header=await xml(zip,'Contents/header.xml');if(header.documentElement.localName!=='head'||header.documentElement.namespaceURI!==HH)fail('지원하지 않는 HWPX 서식 형식입니다.');if(Number(header.documentElement.getAttribute('secCnt'))!==sections.length)fail('문서 구역 수가 맞지 않습니다.');
    files.forEach(function(f){if(/^Contents\//.test(f.name)&&!['Contents/content.hpf','Contents/header.xml'].includes(f.name)&&!entries.some(function(i){return i.getAttribute('href')===f.name;}))fail('목록에 없는 문서 구성 요소가 있습니다: '+f.name);});
    return {zip:zip,pkg:pkg,header:header,formatVersion:formatVersion,entries:entries,resources:resources,sections:sections,masters:masters,binary:binary};
  }
  function rdf(sections){var ns='http://www.w3.org/1999/02/22-rdf-syntax-ns#',pkg='http://www.hancom.co.kr/hwpml/2016/meta/pkg#',doc=document.implementation.createDocument(ns,'rdf:RDF',null),root=doc.documentElement;root.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns:hwp',pkg);['Contents/header.xml'].concat(sections).forEach(function(path,index){var relation=doc.createElementNS(ns,'rdf:Description');relation.setAttributeNS(ns,'rdf:about','');var part=doc.createElementNS(pkg,'hwp:hasPart');part.setAttributeNS(ns,'rdf:resource',path);relation.appendChild(part);root.appendChild(relation);var desc=doc.createElementNS(ns,'rdf:Description');desc.setAttributeNS(ns,'rdf:about',path);var type=doc.createElementNS(ns,'rdf:type');type.setAttributeNS(ns,'rdf:resource',pkg+(index?'SectionFile':'HeaderFile'));desc.appendChild(type);root.appendChild(desc);});var desc=doc.createElementNS(ns,'rdf:Description');desc.setAttributeNS(ns,'rdf:about','');var type=doc.createElementNS(ns,'rdf:type');type.setAttributeNS(ns,'rdf:resource',pkg+'Document');desc.appendChild(type);root.appendChild(desc);return serial(doc);}
  async function create(options){
    var files=(options.files||[]).slice();if(!files.length)fail('합본할 HWPX가 없습니다.');if(files.length>MAX_FILES)fail('한 번에 최대 '+MAX_FILES+'개까지 합본할 수 있습니다.');if(!window.JSZip)fail('HWPX 구성요소를 불러오지 못했습니다. 새로고침해주세요.');
    var sources=[],limits={bytes:0},previous={};
    for(var i=0;i<files.length;i++){if(options.progress)options.progress(i,files.length,files[i]);try{var source=await readSource(await options.load(files[i]),i,limits);guardInheritance(source,previous);if(sources.length&&(rootSignature(sources[0].header.documentElement)!==rootSignature(source.header.documentElement)||sources[0].formatVersion!==source.formatVersion))fail('문서 호환성 설정이 달라 양식을 유지한 합본을 만들 수 없습니다.');sources.push(source);}catch(error){throw Error('한글 합본을 만들지 못했습니다. 원본 파일은 변경되지 않았습니다.\n'+txt(files[i].file_name)+'\n'+txt(error.message||error));}}
    if(options.progress)options.progress(files.length,files.length,null);
    var first=sources[0],out=new window.JSZip(),head=first.header.cloneNode(true),refList=child(head.documentElement,'refList'),pkg=first.pkg.cloneNode(true),manifest=child(pkg.documentElement,'manifest'),spine=child(pkg.documentElement,'spine'),sectionPaths=[],sectionNumber=0,objects={next:1000000,map:new Map()};
    while(refList.firstChild)refList.removeChild(refList.firstChild);while(manifest.firstChild)manifest.removeChild(manifest.firstChild);while(spine.firstChild)spine.removeChild(spine.firstChild);
    out.file('mimetype','application/hwp+zip',{compression:'STORE'});
    for(var f of Object.values(first.zip.files)){if(f.dir||f.name==='mimetype'||f.name.startsWith('Contents/')||f.name.startsWith('BinData/')||f.name.startsWith('Preview/')||f.name==='META-INF/container.rdf')continue;out.file(f.name,await f.async('uint8array'));}
    function addItem(item,id,href){var copy=pkg.importNode(item,true);if(id)copy.setAttribute('id',id);if(href)copy.setAttribute('href',href);manifest.appendChild(copy);return copy;}
    function addRef(id){var n=pkg.createElementNS(OPF,'opf:itemref');n.setAttribute('idref',id);n.setAttribute('linear','yes');spine.appendChild(n);}
    first.entries.filter(function(item){var href=item.getAttribute('href');return href==='Contents/header.xml'||href==='settings.xml'||href.startsWith('Scripts/');}).forEach(function(item){addItem(item);if(item.getAttribute('href')==='Contents/header.xml')addRef(item.getAttribute('id'));});
    var masterNumber=0;sources.forEach(function(source){source.masters.forEach(function(master){var id='masterpage'+masterNumber++;source.resources.set(master.item.getAttribute('id'),id);master.target='Contents/'+id+'.xml';});});
    for(var s=0;s<sources.length;s++){
      var source=sources[s],maps=buildMaps(source,refList);objects.map=new Map();appendStyles(source,refList,maps,source.resources);
      for(var b of source.binary){out.file(b.target,await source.zip.file(b.item.getAttribute('href')).async('uint8array'));addItem(b.item,source.resources.get(b.item.getAttribute('id')),b.target);}
      for(var master of source.masters){var copy=master.doc.cloneNode(true);copy.documentElement.setAttribute('id',source.resources.get(master.item.getAttribute('id')));checkRefs(copy.documentElement,maps,source.resources,objects);out.file(master.target,serial(copy));addItem(master.item,source.resources.get(master.item.getAttribute('id')),master.target);}
      for(var j=0;j<source.sections.length;j++){
        var section=source.sections[j],doc=section.doc.cloneNode(true),root=doc.documentElement;checkRefs(root,maps,source.resources,objects);
        if(j===0){var para=children(root).find(function(n){return n.localName==='p';});if(!para)fail('구역 첫 문단을 확인할 수 없습니다.');var sec=all(root).find(function(n){return n.localName==='secPr';}),start=sec&&child(sec,'startNum'),begin=child(source.header.documentElement,'beginNum');if(!sec||!start)fail('구역의 용지/시작 번호 설정이 없습니다.');if(begin)['page','pic','tbl','equation'].forEach(function(key){if(!Number(start.getAttribute(key)))start.setAttribute(key,begin.getAttribute(key)||'1');});}
        var id='section'+sectionNumber++,target='Contents/'+id+'.xml';if(sectionNumber>300)fail('문서 구역이 너무 많습니다. 업체/연도를 나누어 받아주세요.');out.file(target,serial(doc));addItem(section.item,id,target);addRef(id);sectionPaths.push(target);
      }
    }
    first.entries.filter(function(item){return item.getAttribute('href').startsWith('Scripts/');}).forEach(function(item){addRef(item.getAttribute('id'));});head.documentElement.setAttribute('secCnt',String(sectionNumber));
    var title=all(pkg.documentElement).find(function(n){return n.localName==='title';});if(title)title.textContent=options.title||'시설별 성적서 합본';
    out.file('Contents/header.xml',serial(head));out.file('Contents/content.hpf',serial(pkg));out.file('META-INF/container.rdf',rdf(sectionPaths));
    out.file('Preview/PrvText.txt',sources.map(function(src){return src.sections.map(function(sec){return all(sec.doc.documentElement).filter(function(n){return n.localName==='t';}).map(function(n){return n.textContent;}).join(' ');}).join('\n');}).join('\n\n').slice(0,32768));
    return out.generateAsync({type:'blob',mimeType:'application/hwp+zip',compression:'DEFLATE'});
  }
  window.DF_REPORT_MERGE={version:VERSION,create:create};
})();
