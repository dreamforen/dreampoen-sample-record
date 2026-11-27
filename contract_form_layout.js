/* Native HWP object placement and A4 page boundaries. Text nodes and source run styles are retained. */
(function(root){'use strict';
const NOTICE={"page":{"width":595.28,"height":841.88},"tables":[{"x":28.35,"y":61.8,"width":538.58,"height":175.75,"z":2,"cells":[{"x":0.0,"y":0.0,"width":538.58,"height":34.02,"valign":"middle","paragraphs":[3]},{"x":0.0,"y":34.02,"width":56.69,"height":141.73,"valign":"middle","paragraphs":[4,5,6,7,8]},{"x":56.69,"y":34.02,"width":255.12,"height":42.52,"valign":"top","paragraphs":[9]},{"x":311.81,"y":34.02,"width":226.77,"height":42.52,"valign":"top","paragraphs":[10]},{"x":56.69,"y":76.54,"width":255.12,"height":42.52,"valign":"top","paragraphs":[11]},{"x":311.81,"y":76.54,"width":226.77,"height":42.52,"valign":"top","paragraphs":[12]},{"x":56.69,"y":119.06,"width":481.89,"height":56.69,"valign":"top","paragraphs":[13]}]},{"x":28.35,"y":237.54,"width":538.6,"height":45.35,"z":10,"cells":[{"x":0.0,"y":0.0,"width":538.58,"height":2.83,"valign":"bottom","paragraphs":[21]},{"x":0.0,"y":2.83,"width":56.69,"height":42.52,"valign":"bottom","paragraphs":[22]},{"x":56.69,"y":2.83,"width":28.35,"height":42.52,"valign":"middle","paragraphs":[23]},{"x":85.04,"y":2.83,"width":70.87,"height":42.52,"valign":"middle","paragraphs":[24,25]},{"x":155.91,"y":2.83,"width":85.04,"height":42.52,"valign":"middle","paragraphs":[26,27]},{"x":240.95,"y":2.83,"width":70.87,"height":42.52,"valign":"middle","paragraphs":[28,29]},{"x":311.82,"y":2.83,"width":56.69,"height":42.52,"valign":"middle","paragraphs":[30,31,32]},{"x":368.51,"y":2.83,"width":141.73,"height":21.26,"valign":"middle","paragraphs":[33]},{"x":510.24,"y":2.83,"width":28.35,"height":42.52,"valign":"middle","paragraphs":[34]},{"x":368.51,"y":24.09,"width":70.87,"height":21.26,"valign":"middle","paragraphs":[35]},{"x":439.38,"y":24.09,"width":70.87,"height":21.26,"valign":"middle","paragraphs":[36]}]},{"x":85.04,"y":282.9,"width":481.91,"height":34.02,"z":12,"cells":[{"x":0.0,"y":0.0,"width":28.35,"height":34.02,"valign":"middle","paragraphs":[37]},{"x":28.35,"y":0.0,"width":70.87,"height":34.02,"valign":"middle","paragraphs":[38]},{"x":99.22,"y":0.0,"width":85.04,"height":34.02,"valign":"middle","paragraphs":[39]},{"x":184.26,"y":0.0,"width":127.56,"height":34.02,"valign":"middle","paragraphs":[40]},{"x":311.82,"y":0.0,"width":70.87,"height":34.02,"valign":"middle","paragraphs":[41]},{"x":382.69,"y":0.0,"width":70.87,"height":34.02,"valign":"middle","paragraphs":[42]},{"x":453.56,"y":0.0,"width":28.35,"height":34.02,"valign":"middle","paragraphs":[43]}]},{"x":28.35,"y":316.91,"width":538.58,"height":192.76,"z":13,"cells":[{"x":0.0,"y":0.0,"width":538.58,"height":155.91,"valign":"top","paragraphs":[44]},{"x":0.0,"y":155.91,"width":538.58,"height":8.5,"valign":"top","paragraphs":[45]},{"x":0.0,"y":164.41,"width":56.69,"height":28.35,"valign":"middle","paragraphs":[46]},{"x":56.69,"y":164.41,"width":481.89,"height":28.35,"valign":"middle","paragraphs":[47]}]}],"shapes":[{"x":28.35,"y":43.65,"width":311.81,"height":14.17,"z":0,"paragraphs":[1]},{"x":354.33,"y":43.65,"width":99.21,"height":14.17,"z":1,"paragraphs":[2]},{"x":439.37,"y":220.54,"width":99.21,"height":14.17,"z":3,"paragraphs":[14]},{"x":99.21,"y":118.49,"width":226.77,"height":14.17,"z":4,"paragraphs":[15]},{"x":354.33,"y":118.49,"width":198.43,"height":14.17,"z":5,"paragraphs":[16]},{"x":99.21,"y":161.01,"width":226.77,"height":14.17,"z":6,"paragraphs":[17]},{"x":99.21,"y":203.53,"width":453.54,"height":14.17,"z":7,"paragraphs":[18]},{"x":382.68,"y":220.54,"width":56.69,"height":14.17,"z":8,"paragraphs":[19]},{"x":538.58,"y":220.54,"width":14.17,"height":14.17,"z":9,"paragraphs":[20]},{"x":56.69,"y":331.09,"width":467.72,"height":28.35,"z":14,"paragraphs":[48,49]},{"x":382.68,"y":373.61,"width":170.08,"height":14.17,"z":15,"paragraphs":[50]},{"x":311.81,"y":401.95,"width":56.69,"height":14.17,"z":16,"paragraphs":[51]},{"x":382.68,"y":401.95,"width":99.21,"height":14.17,"z":17,"paragraphs":[52]},{"x":481.89,"y":401.95,"width":70.87,"height":14.17,"z":18,"paragraphs":[53]},{"x":85.04,"y":416.13,"width":70.87,"height":14.17,"z":19,"paragraphs":[54]},{"x":85.04,"y":430.3,"width":70.87,"height":14.17,"z":20,"paragraphs":[55]},{"x":170.08,"y":430.3,"width":56.69,"height":14.17,"z":21,"paragraphs":[56]},{"x":465.53,"y":372.6,"width":100.8,"height":100.84,"z":22,"paragraphs":[]}],"charshapes":{"0":{"width":1.0,"spacing":0.0},"1":{"width":1.0,"spacing":0.0},"2":{"width":1.0,"spacing":0.0},"3":{"width":0.95,"spacing":-0.05},"4":{"width":0.95,"spacing":-0.05},"5":{"width":0.85,"spacing":-0.08},"6":{"width":0.85,"spacing":-0.08},"7":{"width":0.85,"spacing":-0.08},"8":{"width":0.85,"spacing":-0.08},"9":{"width":0.85,"spacing":-0.08}}};
const PLAN={"page":{"width":595.28,"height":841.88,"left":56.69,"bodyTop":79.36,"contentWidth":481.88},"paragraphs":{"0":{"page":1,"x":56.69,"y":79.36,"width":481.88},"1":{"page":1,"x":56.69,"y":100.16,"width":481.88},"2":{"page":1,"x":56.69,"y":126.16,"width":481.88},"3":{"page":1,"x":56.69,"y":152.16,"width":481.88},"8":{"page":1,"x":56.69,"y":294.09,"width":481.88},"9":{"page":1,"x":56.69,"y":314.09,"width":481.88},"10":{"page":1,"x":56.69,"y":334.09,"width":481.88},"11":{"page":1,"x":56.69,"y":354.09,"width":481.88},"12":{"page":1,"x":56.69,"y":374.09,"width":481.88},"13":{"page":1,"x":56.69,"y":394.09,"width":481.88},"14":{"page":1,"x":56.69,"y":414.09,"width":481.88},"15":{"page":1,"x":56.69,"y":434.09,"width":481.88},"16":{"page":1,"x":56.69,"y":454.09,"width":481.88},"17":{"page":1,"x":56.69,"y":498.09,"width":481.88},"18":{"page":1,"x":56.69,"y":518.09,"width":481.88},"19":{"page":1,"x":56.69,"y":538.09,"width":481.88},"20":{"page":1,"x":56.69,"y":558.09,"width":481.88},"21":{"page":1,"x":56.69,"y":578.09,"width":481.88},"22":{"page":1,"x":56.69,"y":598.09,"width":481.88},"23":{"page":1,"x":56.69,"y":618.09,"width":481.88},"24":{"page":1,"x":56.69,"y":638.09,"width":481.88},"25":{"page":1,"x":56.69,"y":658.09,"width":481.88},"26":{"page":1,"x":56.69,"y":678.09,"width":481.88},"27":{"page":1,"x":56.69,"y":698.09,"width":481.88},"28":{"page":1,"x":56.69,"y":718.09,"width":481.88},"29":{"page":1,"x":56.69,"y":738.09,"width":481.88},"30":{"page":2,"x":56.69,"y":79.36,"width":481.88},"31":{"page":2,"x":56.69,"y":101.76,"width":481.88},"32":{"page":2,"x":56.69,"y":125.96,"width":481.88},"33":{"page":2,"x":56.69,"y":145.16,"width":481.88},"34":{"page":2,"x":56.69,"y":164.36,"width":481.88},"35":{"page":2,"x":56.69,"y":183.56,"width":481.88},"36":{"page":2,"x":56.69,"y":260.36,"width":481.88},"37":{"page":2,"x":56.69,"y":279.56,"width":481.88},"38":{"page":2,"x":56.69,"y":298.76,"width":481.88},"39":{"page":2,"x":56.69,"y":317.96,"width":481.88},"40":{"page":2,"x":56.69,"y":337.16,"width":481.88},"41":{"page":2,"x":56.69,"y":356.36,"width":481.88},"42":{"page":2,"x":56.69,"y":375.56,"width":481.88},"43":{"page":2,"x":56.69,"y":394.76,"width":481.88},"44":{"page":2,"x":56.69,"y":413.96,"width":481.88},"45":{"page":2,"x":56.69,"y":433.16,"width":481.88},"56":{"page":2,"x":56.69,"y":498.78,"width":481.88},"57":{"page":2,"x":56.69,"y":517.98,"width":481.88},"58":{"page":2,"x":56.69,"y":537.18,"width":481.88},"59":{"page":2,"x":56.69,"y":556.38,"width":481.88},"60":{"page":2,"x":56.69,"y":575.58,"width":481.88},"106":{"page":3,"x":56.69,"y":84.36,"width":481.88},"107":{"page":3,"x":56.69,"y":103.56,"width":481.88},"108":{"page":3,"x":56.69,"y":141.96,"width":481.88},"109":{"page":3,"x":56.69,"y":161.16,"width":481.88},"110":{"page":3,"x":56.69,"y":180.36,"width":481.88},"111":{"page":3,"x":56.69,"y":199.56,"width":481.88},"112":{"page":3,"x":56.69,"y":221.96,"width":481.88},"113":{"page":3,"x":56.69,"y":260.36,"width":481.88},"114":{"page":3,"x":56.69,"y":279.56,"width":481.88},"115":{"page":3,"x":56.69,"y":298.76,"width":481.88},"116":{"page":3,"x":56.69,"y":375.56,"width":481.88},"117":{"page":3,"x":56.69,"y":394.76,"width":481.88},"118":{"page":3,"x":56.69,"y":413.96,"width":481.88},"119":{"page":3,"x":56.69,"y":452.36,"width":481.88},"120":{"page":3,"x":56.69,"y":471.56,"width":481.88},"121":{"page":3,"x":56.69,"y":529.16,"width":481.88},"122":{"page":3,"x":56.69,"y":548.36,"width":481.88},"123":{"page":3,"x":56.69,"y":586.76,"width":481.88},"124":{"page":3,"x":56.69,"y":605.96,"width":481.88},"125":{"page":3,"x":56.69,"y":663.56,"width":481.88},"126":{"page":3,"x":56.69,"y":682.76,"width":481.88},"127":{"page":3,"x":56.69,"y":701.96,"width":481.88},"128":{"page":3,"x":56.69,"y":740.36,"width":481.88},"129":{"page":4,"x":56.69,"y":79.36,"width":481.88},"130":{"page":4,"x":56.69,"y":117.76,"width":481.88},"131":{"page":4,"x":56.69,"y":136.96,"width":481.88},"132":{"page":4,"x":56.69,"y":156.16,"width":481.88},"133":{"page":4,"x":56.69,"y":175.36,"width":481.88},"134":{"page":4,"x":56.69,"y":194.56,"width":481.88},"135":{"page":4,"x":56.69,"y":213.76,"width":481.88},"136":{"page":4,"x":56.69,"y":232.96,"width":481.88},"137":{"page":4,"x":56.69,"y":252.16,"width":481.88},"138":{"page":4,"x":56.69,"y":271.36,"width":481.88},"139":{"page":4,"x":56.69,"y":290.56,"width":481.88},"140":{"page":4,"x":56.69,"y":309.76,"width":481.88},"141":{"page":4,"x":56.69,"y":328.96,"width":481.88},"142":{"page":4,"x":56.69,"y":386.56,"width":481.88},"143":{"page":4,"x":56.69,"y":405.76,"width":481.88},"144":{"page":4,"x":56.69,"y":424.96,"width":481.88},"145":{"page":4,"x":56.69,"y":482.56,"width":481.88},"146":{"page":4,"x":56.69,"y":501.76,"width":481.88},"147":{"page":4,"x":56.69,"y":559.36,"width":481.88},"148":{"page":4,"x":56.69,"y":578.56,"width":481.88},"149":{"page":4,"x":56.69,"y":616.96,"width":481.88},"150":{"page":4,"x":56.69,"y":636.16,"width":481.88},"151":{"page":4,"x":56.69,"y":655.36,"width":481.88},"152":{"page":4,"x":56.69,"y":712.96,"width":481.88},"153":{"page":4,"x":56.69,"y":732.16,"width":481.88},"154":{"page":5,"x":56.69,"y":79.36,"width":481.88},"155":{"page":5,"x":56.69,"y":117.76,"width":481.88},"156":{"page":5,"x":56.69,"y":136.96,"width":481.88},"157":{"page":5,"x":56.69,"y":156.16,"width":481.88},"158":{"page":5,"x":56.69,"y":175.36,"width":481.88},"159":{"page":5,"x":56.69,"y":194.56,"width":481.88},"160":{"page":5,"x":56.69,"y":213.76,"width":481.88},"161":{"page":5,"x":56.69,"y":232.96,"width":481.88},"162":{"page":5,"x":56.69,"y":290.56,"width":481.88},"163":{"page":5,"x":56.69,"y":309.76,"width":481.88},"164":{"page":5,"x":56.69,"y":328.96,"width":481.88},"165":{"page":5,"x":56.69,"y":386.56,"width":481.88},"166":{"page":5,"x":56.69,"y":405.76,"width":481.88}},"tables":[{"owner":3,"page":1,"x":59.52,"y":180.99,"width":481.9,"height":97.27},{"owner":45,"page":2,"x":59.52,"y":438.01,"width":487.63,"height":57.94},{"owner":60,"page":2,"x":59.52,"y":578.41,"width":476.2,"height":175.21}],"charshapes":{"0":{"width":1.0,"spacing":0.0},"1":{"width":0.98,"spacing":-0.02},"2":{"width":0.95,"spacing":-0.05},"3":{"width":1.0,"spacing":0.0},"4":{"width":1.0,"spacing":0.0},"5":{"width":1.0,"spacing":0.0},"6":{"width":1.0,"spacing":-0.01},"7":{"width":1.0,"spacing":0.0},"8":{"width":1.0,"spacing":0.0},"9":{"width":1.0,"spacing":0.0},"10":{"width":1.0,"spacing":0.0},"11":{"width":1.0,"spacing":0.0},"12":{"width":1.0,"spacing":-0.01},"13":{"width":1.0,"spacing":0.0},"14":{"width":1.0,"spacing":0.0},"15":{"width":1.0,"spacing":0.0},"16":{"width":1.0,"spacing":0.0},"17":{"width":1.0,"spacing":0.0},"18":{"width":1.0,"spacing":0.0},"19":{"width":1.0,"spacing":0.0},"20":{"width":1.0,"spacing":0.0},"21":{"width":1.0,"spacing":0.0},"22":{"width":1.0,"spacing":0.0},"23":{"width":1.0,"spacing":-0.08},"24":{"width":1.0,"spacing":0.0},"25":{"width":1.0,"spacing":0.0},"26":{"width":1.0,"spacing":0.0},"27":{"width":1.0,"spacing":0.0},"28":{"width":1.0,"spacing":-0.03},"29":{"width":1.0,"spacing":0.0},"30":{"width":1.0,"spacing":0.0},"31":{"width":1.0,"spacing":0.0},"32":{"width":1.0,"spacing":-0.04},"33":{"width":1.0,"spacing":-0.06},"34":{"width":1.0,"spacing":-0.09},"35":{"width":1.0,"spacing":0.03},"36":{"width":1.0,"spacing":-0.01},"37":{"width":1.0,"spacing":-0.05},"38":{"width":1.0,"spacing":0.05},"39":{"width":1.0,"spacing":0.03},"40":{"width":1.0,"spacing":-0.04},"41":{"width":1.0,"spacing":-0.02},"42":{"width":1.0,"spacing":-0.05},"43":{"width":1.0,"spacing":-0.08},"44":{"width":1.0,"spacing":0.02},"45":{"width":1.0,"spacing":0.04},"46":{"width":1.0,"spacing":0.0},"47":{"width":1.0,"spacing":0.0},"48":{"width":1.0,"spacing":0.0},"49":{"width":1.0,"spacing":0.0},"50":{"width":1.0,"spacing":0.0}}};

const state=new WeakMap();
const noticeMap=[0,3,4,5,6,7,8,9,10,11,12,13,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,1,2,14,15,16,17,18,19,20,48,49,50,51,52,53,54,55,56,57];
function px(v){return Number(v).toFixed(2)+'pt';}
function prepare(doc,type){
 if(!doc?.querySelector)return {changed:false};
 if(type==='notice'){
  const first=doc.querySelector('[data-hwp-p="1"]');
  if(first?.textContent.includes('측정대행계약 체결사실 통보서')){
   for(const p of doc.querySelectorAll('[data-hwp-p]')){const old=Number(p.getAttribute('data-hwp-p'));if(noticeMap[old]!==undefined)p.setAttribute('data-hwp-p',noticeMap[old]);}
   doc.documentElement?.setAttribute('data-native-id-map','446');
  }
  [...doc.querySelectorAll('table')].forEach((n,i)=>{if(!n.hasAttribute('data-hwp-table'))n.setAttribute('data-hwp-table',i);});
  [...doc.querySelectorAll('.GShapeObjectControl')].forEach((n,i)=>{if(!n.hasAttribute('data-hwp-shape'))n.setAttribute('data-hwp-shape',i);});
 }
 if(['plan','notice'].includes(type))nativeText(doc,type);
 return {changed:true};
}
function stylesheet(doc){
 if(doc.getElementById('dfcfl-style'))return;
 const style=doc.createElement('style');style.id='dfcfl-style';style.textContent=`
 body.dfcfl-layout{margin:0;background:#f1f3f2}
 body.dfcfl-layout .Section{width:595.28pt!important;margin:0 auto!important;border:0!important;background:transparent!important}
 body.dfcfl-layout .HeaderPageFooter{margin:0!important;padding:0!important}
 body.dfcfl-layout .Page{padding:0!important;margin:0!important;position:relative}
 body.dfcfl-layout .dfcfl-page{position:relative;width:595.28pt;height:841.88pt;box-sizing:border-box;background:#fff;margin:0 0 16px;box-shadow:0 1px 5px #132c2426;break-after:page;page-break-after:always}
 body.dfcfl-layout .dfcfl-page:last-child{margin-bottom:0;break-after:auto;page-break-after:auto}
 body.dfcfl-layout .dfcfl-positioned{position:absolute!important;box-sizing:border-box;margin:0!important}
 body.dfcfl-layout .dfcfl-block>p{margin-top:0!important;margin-bottom:0!important}
 body.dfcfl-layout .dfcfl-notice .GShapeObjectControl{padding:0!important;overflow:visible}
 body.dfcfl-layout .dfcfl-notice .GShapeObjectControl>p{margin-top:0!important;margin-bottom:0!important}
 body.dfcfl-layout .dfcfl-notice table{table-layout:fixed;display:block}
 body.dfcfl-layout .dfcfl-notice tbody,body.dfcfl-layout .dfcfl-notice tr{display:contents}
 body.dfcfl-layout .dfcfl-notice td{position:absolute;display:flex;flex-direction:column;box-sizing:border-box;overflow:visible}
 body.dfcfl-layout .dfcfl-notice [data-hwp-p]{flex-shrink:0;line-height:1;min-height:0}
 body.dfcfl-layout .dfcfl-notice [data-hwp-p]:empty{height:0;min-height:0}
 body.dfcfl-layout .dfcfl-notice img{display:block}
 @media print{@page{size:A4;margin:0}body.dfcfl-layout{padding:0!important;background:white}body.dfcfl-layout .Section{margin:0!important}body.dfcfl-layout .dfcfl-page{margin:0!important;box-shadow:none;break-after:page;page-break-after:always}body.dfcfl-layout .dfcfl-page:last-child{break-after:auto;page-break-after:auto}}
 `;doc.head.append(style);
}
function position(node,r){
 node.classList.add('dfcfl-positioned');node.style.left=px(r.x);node.style.top=px(r.y);node.style.width=px(r.width);if(r.height!==undefined)node.style.height=px(r.height);node.style.zIndex=String((r.z||0)+1);
 node.setAttribute('data-native-x',r.x);node.setAttribute('data-native-y',r.y);
}
function page(doc,number,type){const p=doc.createElement('section');p.className='dfcfl-page dfcfl-'+type;p.setAttribute('data-form-page',number);p.setAttribute('aria-label',number+'쪽');return p;}
function nativeText(doc,type){
 // HWP paragraph delimiters are record markers, not visible extra browser lines.
 for(const p of doc.querySelectorAll('[data-hwp-p]')){
  const last=p.lastChild;if(last?.nodeType===3)last.data=last.data.replace(/[\r\n]+$/,'');
  const metrics=type==='notice'?NOTICE.charshapes:PLAN.charshapes;
  const spans=[...p.querySelectorAll('span')],shapes=spans.map(n=>Number(String(n.className).match(/charshape-(\d+)/)?.[1]??0));
  for(let i=0;i<spans.length;i++){const f=metrics[shapes[i]];if(f)spans[i].style.letterSpacing=f.spacing+'em';}
  const widths=[...new Set(shapes.map(i=>metrics[i]?.width??1))];
  if(widths.length===1&&widths[0]!==1){p.style.transform='scaleX('+widths[0]+')';p.style.transformOrigin='left top';p.style.width=(100/widths[0])+'%';}
 }
}
function notice(doc){
 const host=doc.querySelector('.Page');if(!host)return {pageCount:0};
 const sheet=page(doc,1,'notice'),tables=[...doc.querySelectorAll('table')],shapes=[...doc.querySelectorAll('.GShapeObjectControl')];
 const anchors=[...doc.querySelectorAll('[data-hwp-p="0"],[data-hwp-p="57"]')];
 tables.forEach((n,i)=>{const r=NOTICE.tables[i];if(r){position(n,r);[...n.querySelectorAll('td')].forEach((cell,j)=>{const c=r.cells[j];if(!c)return;cell.style.left=px(c.x);cell.style.top=px(c.y);cell.style.width=px(c.width);cell.style.height=px(c.height);cell.style.justifyContent=c.valign==='middle'?'center':c.valign==='bottom'?'flex-end':'flex-start';cell.dataset.nativeCell=j;});sheet.append(n);}});
 shapes.forEach((n,i)=>{const r=NOTICE.shapes[i];if(r){position(n,r);if(n.querySelector('img')){const img=n.querySelector('img');img.style.width=px(r.width);img.style.height=px(r.height);img.style.mixBlendMode='multiply';n.style.pointerEvents='none';img.style.pointerEvents='none';}else if(r.paragraphs.some(id=>[50,51,52,53].includes(id))){n.style.zIndex=String(30+i);}sheet.append(n);}});
 // Keep native control-only paragraph identities without adding visible flow.
 for(const n of anchors){n.hidden=true;sheet.append(n);}
 host.replaceChildren(sheet);return {pageCount:1};
}
function plan(doc){
 const host=doc.querySelector('.Page');if(!host)return {pageCount:0};
 const sheets=Array.from({length:5},(_,i)=>page(doc,i+1,'plan'));
 const paragraphs=[...doc.querySelectorAll('[data-hwp-p]')],byId=new Map(paragraphs.map(p=>[Number(p.getAttribute('data-hwp-p')),p])),tables=[...doc.querySelectorAll('table')];
 // Preserve live paragraph nodes, including their contenteditable state and native run spans.
 for(const [index,r]of Object.entries(PLAN.paragraphs)){
  const p=byId.get(Number(index));if(!p)continue;
  const wrap=doc.createElement('div');wrap.className='dfcfl-block';wrap.setAttribute('data-layout-paragraph',index);position(wrap,r);wrap.append(p);sheets[r.page-1].append(wrap);
 }
 tables.forEach((t,i)=>{const r=PLAN.tables[i];if(!r)return;t.setAttribute('data-hwp-table',i);position(t,r);sheets[r.page-1].append(t);});
 host.replaceChildren(...sheets);return {pageCount:5,keptTogetherParagraphs:[154]};
}

const signatures=new WeakMap();
function textNodes(node){const walker=node.ownerDocument.createTreeWalker(node,4),out=[];let next;while((next=walker.nextNode()))out.push(next);return out;}
function signatureSlice(p,start,end){
 const copy=p.cloneNode(true);
 for(const column of [...copy.querySelectorAll('.dfcw-sign-column,.dfcfl-sign-piece')].reverse())column.replaceWith(...column.childNodes);
 let at=0;for(const n of textNodes(copy)){const a=at,b=at+n.data.length;at=b;n.data=b<=start||a>=end?'':n.data.slice(Math.max(0,start-a),Math.min(n.data.length,end-a));}
 const out=p.ownerDocument.createElement('span');out.className='dfcfl-sign-piece';out.append(...copy.childNodes);return out;
}
function signatureRanges(index,text){
 const labels=[...text.matchAll(index===45?/측정대행업자/g:index===46?/사업장\s*주소/g:/대표자\s*성명/g)];
 const split=index===45?labels[0]?.index:labels[1]?.index;if(!Number.isInteger(split)||split<=0)return null;
 if(index!==46)return [{from:0,to:split,col:1,row:1},{from:split,to:text.length,col:2,row:1}];
 // The native HWP stores each address's first line, then its continuation,
 // interleaved left/right in one paragraph. Keep that original text order.
 const gaps=[...text.slice(split).matchAll(/[ \t\u001e\u001f\u00a0\u2002\u2003]{8,}/g)];
 const first=gaps[0];if(!first)return [{from:0,to:split,col:1,row:1},{from:split,to:text.length,col:2,row:1}];
 const a=split+first.index,b=gaps[1]?split+gaps[1].index:null;
 const out=[{from:0,to:split,col:1,row:1},{from:split,to:a,col:2,row:1}];
 if(b!==null){out.push({from:a,to:b,col:1,row:2},{from:b,to:text.length,col:2,row:2});}
 else out.push({from:a,to:text.length,col:2,row:2});
 return out;
}
function signatureColumns(doc,type){
 if(type!=='contract')return {paragraphs:0};
 if(!doc.getElementById('dfcfl-signature-style')){const st=doc.createElement('style');st.id='dfcfl-signature-style';st.textContent=`
 .Page p.dfcfl-signature{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;column-gap:12pt;align-items:start;white-space:normal!important}
 .Page p.dfcfl-signature>.dfcfl-sign-piece{display:block;min-width:0;max-width:100%;box-sizing:border-box;white-space:pre-line!important;overflow-wrap:anywhere;word-break:normal}
 .Page p.dfcfl-signature>.dfcfl-sign-continuation{padding-inline-start:5em}
 .Page p.dfcfl-signature .dfcfl-sign-annotation{display:inline-block;max-width:100%;box-sizing:border-box;white-space:normal!important;overflow-wrap:anywhere}
 `;doc.head.append(st);}
 let count=0;
 for(const index of [45,46,47]){
  const p=doc.querySelector('[data-hwp-p="'+index+'"]');if(!p)continue;const text=p.textContent,known=signatures.get(p);
  if(known===text&&p.querySelector(':scope>.dfcfl-sign-piece')){count++;continue;}
  const ranges=signatureRanges(index,text);if(!ranges)continue;
  const parts=ranges.map(r=>{const node=signatureSlice(p,r.from,r.to);node.style.gridColumn=String(r.col);node.style.gridRow=String(r.row);node.dataset.signatureSide=r.col===1?'client':'provider';if(r.row===2)node.classList.add('dfcfl-sign-continuation');
   if(index===47)for(const span of node.querySelectorAll('span'))if(/\(\s*서명\s*또는\s*인\s*\)/.test(span.textContent)&&!span.querySelector('span'))span.classList.add('dfcfl-sign-annotation');
   return node;});
  p.replaceChildren(...parts);p.classList.add('dfcw-sign-columns','dfcfl-signature');signatures.set(p,text);count++;
 }
 return {paragraphs:count};
}
function apply(doc,type,context={}){
 prepare(doc,type);if(type==='contract'){signatureColumns(doc,type);return {pageCount:1};}if(!['plan','notice'].includes(type))return {pageCount:1};
 nativeText(doc,type);const old=state.get(doc);if(old?.type===type)return old.result;
 stylesheet(doc);doc.body.classList.add('dfcfl-layout');const result=type==='notice'?notice(doc):plan(doc);state.set(doc,{type,result});return result;
}
root.DF_CONTRACT_FORM_LAYOUT=Object.freeze({version:'447',signatureColumns,legacyNoticeIds:Object.freeze(Object.fromEntries(noticeMap.map((n,i)=>[i,n]))),prepare,apply,geometry:type=>type==='notice'?NOTICE:type==='plan'?PLAN:null});
if(typeof module!=='undefined'&&module.exports)module.exports=root.DF_CONTRACT_FORM_LAYOUT;
})(typeof window!=='undefined'?window:globalThis);
