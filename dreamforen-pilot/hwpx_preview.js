/* Dreampoen HWPX document preview v120.37.32.0. Reads the saved package; never rewrites it. */
(function (global) {
  'use strict';
  var VERSION = '120.37.32.0', UNIT = 75, MAX_ENTRY = 24 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024;
  var HWP_NS = /^http:\/\/www\.hancom\.co\.kr\/(?:hwpml|schema)\//;
  function children(n, name) { return Array.from(n && n.children || []).filter(function (e) { return !name || e.localName === name; }); }
  function one(n, name) { return children(n, name)[0] || null; }
  function all(n, name) { return n ? Array.from(n.getElementsByTagNameNS('*', name)) : []; }
  function first(n, name) { return all(n, name)[0] || null; }
  function val(n, name, fallback) { var v = n && n.getAttribute(name); return v == null ? (fallback == null ? '' : fallback) : v; }
  function num(n, name, fallback) { var v = Number(val(n, name, fallback == null ? 0 : fallback)); return Number.isFinite(v) ? Math.max(-10000000, Math.min(10000000, v)) : (fallback || 0); }
  function px(v) { return (Number(v || 0) / UNIT) + 'px'; }
  function color(v, fallback) { return /^#[\da-f]{6}$/i.test(v || '') ? v : (fallback || 'transparent'); }
  function el(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; }
  function setBox(node, x, y, w, h) { Object.assign(node.style, {position: 'absolute', left: px(x), top: px(y), width: px(w), height: px(h)}); }
  function warn(ctx, message) { if (!ctx.warnings.includes(message)) ctx.warnings.push(message); }
  function parseXML(text, name) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(name + ': 외부 개체가 포함된 XML은 표시할 수 없습니다.');
    var xml = new DOMParser().parseFromString(text, 'application/xml');
    if (!xml.documentElement || xml.getElementsByTagName('parsererror').length || all(xml, 'parsererror').length) throw new Error(name + ': HWPX 문서 구조를 읽을 수 없습니다.');
    if (xml.getElementsByTagName('*').length > 160000) throw new Error('미리보기 가능한 문서 요소 수를 초과했습니다.');
    return xml;
  }
  function safePath(raw) {
    var path = String(raw || '').replace(/^\.\//, '');
    if (!path || /[\\:\x00-\x1f?#]/.test(path) || path[0] === '/' || path.split('/').some(function (p) { return p === '..' || p === '.'; })) return '';
    return path;
  }
  function entry(zip, path) { path = safePath(path); return path && (zip.file(path) || zip.file('Contents/' + path)) || null; }
  async function readEntry(ctx, item, type) {
    if (!item) return null;
    var size = item._data && item._data.uncompressedSize;
    if (size > MAX_ENTRY || (ctx.readBytes || 0) + (size || 0) > MAX_TOTAL) throw new Error('미리보기 가능한 문서 크기를 초과했습니다.');
    var bytes = await item.async('uint8array');
    ctx.readBytes = (ctx.readBytes || 0) + bytes.byteLength;
    if (bytes.byteLength > MAX_ENTRY || ctx.readBytes > MAX_TOTAL) throw new Error('미리보기 가능한 문서 크기를 초과했습니다.');
    return type === 'bytes' ? bytes : new TextDecoder('utf-8').decode(bytes);
  }
  function imageMime(b) {
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return 'image/png';
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
    if (String.fromCharCode.apply(null, b.slice(0, 6)) === 'GIF89a' || String.fromCharCode.apply(null, b.slice(0, 6)) === 'GIF87a') return 'image/gif';
    if (String.fromCharCode.apply(null, b.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, b.slice(8, 12)) === 'WEBP') return 'image/webp';
    return '';
  }
  function base64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 16384) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 16384)); return btoa(s); }
  function keyed(xml, name) { var map = Object.create(null); all(xml, name).forEach(function (n) { map[val(n, 'id')] = n; }); return map; }
  async function load(blob) {
    if (!global.JSZip) throw new Error('HWPX 압축 모듈을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');
    var bytes = blob && typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
    if (!bytes || bytes.byteLength > MAX_TOTAL) throw new Error('미리보기 가능한 파일 크기를 초과했습니다.');
    var zip = await global.JSZip.loadAsync(bytes), ctx = {zip: zip, warnings: [], images: Object.create(null), masters: Object.create(null), sections: [], readBytes: 0};
    if (Object.keys(zip.files).length > 3000) throw new Error('미리보기 가능한 압축 항목 수를 초과했습니다.');
    var manifestText = await readEntry(ctx, entry(zip, 'Contents/content.hpf'));
    if (!manifestText) throw new Error('HWPX 문서 목록이 없습니다.');
    var manifest = parseXML(manifestText, 'content.hpf'), items = keyed(manifest, 'item');
    var headerText = await readEntry(ctx, entry(zip, val(items.header, 'href', 'Contents/header.xml')));
    if (!headerText) throw new Error('HWPX 글꼴·서식 정보가 없습니다.');
    ctx.header = parseXML(headerText, 'header.xml'); ctx.chars = keyed(ctx.header, 'charPr'); ctx.paras = keyed(ctx.header, 'paraPr'); ctx.borders = keyed(ctx.header, 'borderFill'); ctx.fonts = Object.create(null);
    all(ctx.header, 'fontface').forEach(function (face) { ctx.fonts[val(face, 'lang')] = keyed(face, 'font'); });
    var order = all(manifest, 'itemref').map(function (n) { return val(n, 'idref'); }).filter(function (id) { return /(?:^|\/)section\d+\.xml$/i.test(val(items[id], 'href')); });
    if (!order.length) order = Object.keys(items).filter(function (id) { return /(?:^|\/)section\d+\.xml$/i.test(val(items[id], 'href')); }).sort(function (a, b) { return a.localeCompare(b, undefined, {numeric: true}); });
    if (!order.length) throw new Error('HWPX 본문이 없습니다.');
    for (var id of order) { var xml = await readEntry(ctx, entry(zip, val(items[id], 'href'))); if (!xml) throw new Error('HWPX 본문 파일이 누락되었습니다.'); ctx.sections.push(parseXML(xml, id)); }
    for (var mid of Object.keys(items).filter(function (id) { return /masterpage/i.test(id) && /\.xml$/i.test(val(items[id], 'href')); })) {
      var mtext = await readEntry(ctx, entry(zip, val(items[mid], 'href'))); if (mtext) ctx.masters[mid] = parseXML(mtext, mid);
    }
    var refs = new Set(); ctx.sections.concat(Object.values(ctx.masters)).forEach(function (doc) { all(doc, 'img').forEach(function (n) { refs.add(val(n, 'binaryItemIDRef')); }); });
    for (var ref of refs) {
      var imageItem = items[ref], path = safePath(val(imageItem, 'href')), file = path && entry(zip, path);
      if (!file || val(imageItem, 'isEmbeded') === '0') { warn(ctx, '외부 연결 또는 누락된 그림이 있습니다. HWPX 원본의 그림 연결을 확인해주세요.'); continue; }
      var binary = await readEntry(ctx, file, 'bytes'), mime = imageMime(binary);
      if (!mime) { warn(ctx, '일부 그림 형식은 웹에서 표시할 수 없습니다. 해당 위치에 안내를 표시했습니다.'); continue; }
      ctx.images[ref] = 'data:' + mime + ';base64,' + base64(binary);
    }
    return ctx;
  }
  function applyChar(node, run, ctx) {
    var prop = ctx.chars[val(run, 'charPrIDRef')] || ctx.chars['0']; if (!prop) return;
    var fontRef = one(prop, 'fontRef'), font = (ctx.fonts.HANGUL || {})[val(fontRef, 'hangul')], latin = (ctx.fonts.LATIN || {})[val(fontRef, 'latin')];
    var names = [val(font, 'face'), val(latin, 'face')].filter(Boolean).map(function (v) { return '"' + v.replace(/["\\\n\r]/g, '') + '"'; });
    node.style.fontFamily = names.concat(['"Malgun Gothic"', '"Batang"', 'serif']).join(',');
    node.style.fontSize = px(Math.max(100, num(prop, 'height', 1000)));
    node.style.color = color(val(prop, 'textColor'), '#000000');
    node.style.backgroundColor = color(val(prop, 'shadeColor'));
    if (one(prop, 'bold')) node.style.fontWeight = '700'; if (one(prop, 'italic')) node.style.fontStyle = 'italic';
    var u = one(prop, 'underline'), s = one(prop, 'strikeout');
    if (u && val(u, 'type') !== 'NONE') node.style.textDecoration = 'underline';
    if (s && val(s, 'shape') && !['NONE', '3D'].includes(val(s, 'shape'))) node.style.textDecoration = (node.style.textDecoration + ' line-through').trim();
    if (one(prop, 'supscript')) { node.style.verticalAlign = 'super'; node.style.fontSize = px(num(prop, 'height', 1000) * 0.7); }
    if (one(prop, 'subscript')) { node.style.verticalAlign = 'sub'; node.style.fontSize = px(num(prop, 'height', 1000) * 0.7); }
    var spacing = one(prop, 'spacing'); if (spacing) node.style.letterSpacing = (num(spacing, 'hangul') / 100) + 'em';
    var ratio = one(prop, 'ratio'); if (ratio && num(ratio, 'hangul', 100) !== 100) node.style.fontStretch = num(ratio, 'hangul', 100) + '%';
  }
  function applyPara(node, p, ctx) {
    var prop = ctx.paras[val(p, 'paraPrIDRef')] || ctx.paras['0'];
    node.style.margin = '0'; node.style.whiteSpace = 'pre-wrap'; node.style.overflowWrap = 'anywhere'; node.style.lineHeight = '1.2';
    if (!prop) return;
    var align = val(one(prop, 'align'), 'horizontal'); node.style.textAlign = ({CENTER: 'center', RIGHT: 'right', JUSTIFY: 'justify', DISTRIBUTE: 'justify', DISTRIBUTE_SPACE: 'justify'})[align] || 'left';
    var margin = first(prop, 'margin'); ['left', 'right', 'prev', 'next'].forEach(function (key, i) { var item = one(margin, key); if (item) node.style[['paddingLeft', 'paddingRight', 'marginTop', 'marginBottom'][i]] = px(num(item, 'value')); });
    var indent = one(margin, 'intent') || one(margin, 'indent'); if (indent) node.style.textIndent = px(num(indent, 'value'));
    var line = first(prop, 'lineSpacing'); if (line) { var type = val(line, 'type'), value = num(line, 'value'); if (type === 'PERCENT') node.style.lineHeight = String(Math.max(0.5, value / 100)); else if (type === 'FIXED') node.style.lineHeight = px(Math.max(100, value)); }
  }
  function applyBorder(node, id, ctx) {
    var border = ctx.borders[id]; if (!border) return;
    ['left', 'right', 'top', 'bottom'].forEach(function (side) {
      var b = one(border, side + 'Border'), type = val(b, 'type'); if (!b || type === 'NONE') return;
      var width = parseFloat(val(b, 'width', '0.1')) || 0.1, shape = /DOUBLE/.test(type) ? 'double' : /DOT/.test(type) ? 'dotted' : /DASH/.test(type) ? 'dashed' : 'solid';
      node.style['border' + side[0].toUpperCase() + side.slice(1)] = Math.min(10, width) + 'mm ' + shape + ' ' + color(val(b, 'color'), '#000000');
    });
    var fill = first(border, 'winBrush'); if (fill) node.style.backgroundColor = color(val(fill, 'faceColor'));
  }
  // HWPX stores dimensions on merged cells. Solve boundary differences to keep unequal subdivisions intact.
  function boundaries(cells, count, axis, total, ctx) {
    count = Math.max(1, Math.min(3000, count)); var edges = Array.from({length: count + 1}, function () { return []; }), result = Array(count + 1).fill(null);
    cells.forEach(function (cell) { var addr = one(cell, 'cellAddr'), span = one(cell, 'cellSpan'), sz = one(cell, 'cellSz'), start = num(addr, axis === 'x' ? 'colAddr' : 'rowAddr'), end = start + num(span, axis === 'x' ? 'colSpan' : 'rowSpan', 1), size = num(sz, axis === 'x' ? 'width' : 'height'); if (start >= 0 && end <= count && end > start && size > 0) { edges[start].push([end, size]); edges[end].push([start, -size]); } });
    result[0] = 0; var queue = [0];
    while (queue.length) { var i = queue.shift(); edges[i].forEach(function (e) { if (result[e[0]] == null) { result[e[0]] = result[i] + e[1]; queue.push(e[0]); } }); }
    if (result[count] == null) result[count] = total || count * 1500;
    for (var a = 0; a < count; a++) if (result[a] != null && result[a + 1] == null) { var b = a + 1; while (b < count && result[b] == null) b++; for (var j = a + 1; j < b; j++) result[j] = result[a] + (result[b] - result[a]) * (j - a) / (b - a); }
    if (result.some(function (v, i) { return i && v < result[i - 1]; })) { warn(ctx, '일부 표의 셀 치수에 불일치가 있어 경계 간격을 보정했습니다.'); result = result.map(function (_, i) { return i * (total || count * 1500) / count; }); }
    return result;
  }
  function drawPicture(pic, ctx, loc) {
    var image = first(pic, 'img'), ref = val(image, 'binaryItemIDRef'), size = one(pic, 'sz') || one(pic, 'curSz'), w = Math.max(1, num(size, 'width', 5000)), h = Math.max(1, num(size, 'height', 5000));
    var wrapper = el('span', 'dhp-picture'); wrapper.dataset.imageRef = ref; Object.assign(wrapper.style, {display: 'inline-block', position: 'relative', width: px(w), height: px(h), overflow: 'hidden', verticalAlign: 'middle'});
    if (ctx.images[ref]) {
      var img = el('img'); img.src = ctx.images[ref]; img.alt = '문서에 포함된 그림'; img.draggable = false; Object.assign(img.style, {display: 'block', width: '100%', height: '100%', maxWidth: 'none'});
      var clip = one(pic, 'imgClip'), dim = one(pic, 'imgDim'), dw = num(dim, 'dimwidth'), dh = num(dim, 'dimheight'), cw = num(clip, 'right') - num(clip, 'left'), ch = num(clip, 'bottom') - num(clip, 'top');
      if (dw > 0 && dh > 0 && cw > 0 && ch > 0) Object.assign(img.style, {position: 'absolute', width: (dw / cw * 100) + '%', height: (dh / ch * 100) + '%', left: (-num(clip, 'left') / cw * 100) + '%', top: (-num(clip, 'top') / ch * 100) + '%'});
      var bright = num(image, 'bright'), contrast = num(image, 'contrast'), alpha = num(image, 'alpha'); img.style.filter = 'brightness(' + Math.max(0, 1 + bright / 100) + ') contrast(' + Math.max(0, 1 + contrast / 100) + ')'; img.style.opacity = String(Math.max(0, Math.min(1, 1 - alpha / 255)));
      var flip = one(pic, 'flip'), rotation = one(pic, 'rotationInfo'), transforms = []; if (num(flip, 'horizontal')) transforms.push('scaleX(-1)'); if (num(flip, 'vertical')) transforms.push('scaleY(-1)'); if (num(rotation, 'angle')) transforms.push('rotate(' + num(rotation, 'angle') + 'deg)'); if (transforms.length) wrapper.style.transform = transforms.join(' ');
      wrapper.appendChild(img);
    } else { wrapper.classList.add('dhp-image-missing'); wrapper.textContent = '그림 확인 필요'; warn(ctx, '표시할 수 없는 그림이 있습니다. 해당 위치의 안내를 확인해주세요.'); }
    var pos = one(pic, 'pos');
    if (val(pos, 'treatAsChar', '1') === '0') {
      var globalX = ['PAPER', 'PAGE'].includes(val(pos, 'horzRelTo')), globalY = ['PAPER', 'PAGE'].includes(val(pos, 'vertRelTo'));
      var rx = val(pos, 'horzRelTo') === 'PAPER' ? 0 : loc.margin.left, ry = val(pos, 'vertRelTo') === 'PAPER' ? 0 : loc.margin.top;
      var areaW = val(pos, 'horzRelTo') === 'PAPER' ? loc.pageW : loc.pageW - loc.margin.left - loc.margin.right, areaH = val(pos, 'vertRelTo') === 'PAPER' ? loc.pageH : loc.pageH - loc.margin.top - loc.margin.bottom;
      var x = globalX ? rx : loc.x, y = globalY ? ry : loc.y;
      if (globalX && val(pos, 'horzAlign') === 'CENTER') x += (areaW - w) / 2; if (globalX && val(pos, 'horzAlign') === 'RIGHT') x += areaW - w;
      if (globalY && val(pos, 'vertAlign') === 'CENTER') y += (areaH - h) / 2; if (globalY && val(pos, 'vertAlign') === 'BOTTOM') y += areaH - h;
      x += num(pos, 'horzOffset'); y += num(pos, 'vertOffset'); setBox(wrapper, x, y, w, h); wrapper.style.zIndex = val(pic, 'textWrap') === 'BEHIND_TEXT' ? '0' : '20'; loc.page.appendChild(wrapper); return null;
    }
    return wrapper;
  }
  function renderParagraph(p, ctx, loc) {
    var out = el('div', 'dhp-paragraph'); applyPara(out, p, ctx); var hasContent = false;
    children(p, 'run').forEach(function (run) {
      var span = el('span'); applyChar(span, run, ctx); out.style.fontSize = out.style.fontSize || span.style.fontSize;
      function process(n) {
        if (!HWP_NS.test(n.namespaceURI || '')) return;
        switch (n.localName) {
          case 't':
            Array.from(n.childNodes).forEach(function (part) { if (part.nodeType === 3 || part.nodeType === 4) { span.appendChild(document.createTextNode(part.textContent)); if (part.textContent) hasContent = true; } else if (part.nodeType === 1) process(part); }); break;
          case 'lineBreak': span.appendChild(el('br')); hasContent = true; break;
          case 'tab': span.appendChild(document.createTextNode('\t')); hasContent = true; break;
          case 'nbSpace': case 'fwSpace': span.appendChild(document.createTextNode(n.localName === 'fwSpace' ? '\u3000' : '\u00a0')); hasContent = true; break;
          case 'pic': var picture = drawPicture(n, ctx, loc); if (picture) { span.appendChild(picture); hasContent = true; } break;
          case 'tbl': var table = renderTable(n, ctx, loc); table.node.style.position = 'relative'; table.node.style.left = '0'; table.node.style.top = '0'; span.appendChild(table.node); hasContent = true; break;
          case 'equation': var script = first(n, 'script'); span.appendChild(el('span', 'dhp-equation', script ? script.textContent : '[수식]')); hasContent = true; warn(ctx, '수식은 원문 수식 문자열로 표시됩니다. 최종 모양은 한글에서 확인해주세요.'); break;
          case 'switch': var branch = one(n, 'case') || one(n, 'default'); children(branch).forEach(process); break;
          case 'container': case 'rect': case 'ellipse': case 'line': case 'arc': case 'polygon': case 'curve': case 'chart': case 'ole':
            span.appendChild(el('span', 'dhp-unsupported', '[도형·개체: 한글에서 확인]')); hasContent = true; warn(ctx, '일부 도형·개체는 웹 미리보기에서 생략됩니다. 최종 출력은 HWPX 원본으로 확인해주세요.'); break;
          default: break; // Scripts, actions, arbitrary markup and hyperlink targets are never executed.
        }
      }
      children(run).forEach(process); out.appendChild(span);
    });
    if (!hasContent && !out.querySelector('.dhp-picture')) { out.appendChild(document.createTextNode('\u00a0')); out.dataset.empty = 'true'; }
    return out;
  }
  function renderTable(tbl, ctx, loc) {
    var rows = children(tbl, 'tr'), cells = rows.flatMap(function (row) { return children(row, 'tc'); }), size = one(tbl, 'sz'), nx = num(tbl, 'colCnt', 1), ny = num(tbl, 'rowCnt', rows.length);
    if (cells.length > 20000 || nx > 3000 || ny > 3000) throw new Error('미리보기 가능한 표 크기를 초과했습니다.');
    var xs = boundaries(cells, nx, 'x', num(size, 'width'), ctx), ys = boundaries(cells, ny, 'y', num(size, 'height'), ctx), width = xs[xs.length - 1], height = ys[ys.length - 1];
    var table = el('div', 'dhp-table'); table.setAttribute('role', 'table'); table.setAttribute('aria-rowcount', ny); table.setAttribute('aria-colcount', nx); table.dataset.tableId = val(tbl, 'id'); setBox(table, 0, 0, width, height);
    cells.forEach(function (cell) {
      var addr = one(cell, 'cellAddr'), span = one(cell, 'cellSpan'), x = num(addr, 'colAddr'), y = num(addr, 'rowAddr'), sx = Math.max(1, num(span, 'colSpan', 1)), sy = Math.max(1, num(span, 'rowSpan', 1));
      if (x < 0 || y < 0 || x + sx >= xs.length || y + sy >= ys.length) { warn(ctx, '표의 일부 셀 주소가 올바르지 않아 표시하지 못했습니다.'); return; }
      var node = el('div', 'dhp-cell'); node.setAttribute('role', 'cell'); node.setAttribute('aria-colindex', x + 1); node.setAttribute('aria-rowindex', y + 1); node.setAttribute('aria-colspan', sx); node.setAttribute('aria-rowspan', sy); node.dataset.cellName = val(cell, 'name');
      setBox(node, xs[x], ys[y], xs[x + sx] - xs[x], ys[y + sy] - ys[y]); applyBorder(node, val(cell, 'borderFillIDRef', val(tbl, 'borderFillIDRef')), ctx);
      var margin = val(cell, 'hasMargin') === '1' ? one(cell, 'cellMargin') : one(tbl, 'inMargin'); margin = margin || one(cell, 'cellMargin');
      ['left', 'right', 'top', 'bottom'].forEach(function (s) { node.style['padding' + s[0].toUpperCase() + s.slice(1)] = px(num(margin, s)); });
      var sub = one(cell, 'subList'), content = el('div', 'dhp-cell-content'); node.style.justifyContent = ({CENTER: 'center', BOTTOM: 'flex-end'})[val(sub, 'vertAlign')] || 'flex-start';
      if (val(sub, 'textDirection') === 'VERTICAL') content.style.writingMode = 'vertical-rl';
      var pY = loc.y + ys[y] + num(margin, 'top');
      children(sub, 'p').forEach(function (p) { var segment = first(one(p, 'linesegarray'), 'lineseg'); content.appendChild(renderParagraph(p, ctx, Object.assign({}, loc, {x: loc.x + xs[x] + num(margin, 'left'), y: pY + num(segment, 'vertpos')}))); });
      node.appendChild(content); table.appendChild(node);
    });
    return {node: table, width: width, height: height, boundaries: ys};
  }
  function pageSpec(section) {
    var prop = first(section, 'pagePr'), margin = one(prop, 'margin');
    return {width: Math.max(10000, num(prop, 'width', 59528)), height: Math.max(10000, num(prop, 'height', 84188)), margin: {left: Math.max(0, num(margin, 'left', 5668)), right: Math.max(0, num(margin, 'right', 5668)), top: Math.max(0, num(margin, 'top', 5668)), bottom: Math.max(0, num(margin, 'bottom', 5668)), header: num(margin, 'header'), footer: num(margin, 'footer')}};
  }
  function topObjects(p, name) { var result = []; children(p, 'run').forEach(function (run) { children(run, name).forEach(function (n) { result.push(n); }); }); return result; }
  function renderDocument(ctx) {
    var pages = [], current, spec, flowY = 0, priorPosition = -1, sectionPage = 0, masters, headers;
    function makePage() {
      if (pages.length >= 100) throw new Error('미리보기는 한 번에 100페이지까지 표시할 수 있습니다. 원본을 다운로드하여 확인해주세요.');
      var sheet = el('article', 'dhp-page'); sheet.setAttribute('aria-label', '문서 ' + (pages.length + 1) + '페이지'); sheet.dataset.page = String(pages.length + 1); sheet.style.width = px(spec.width); sheet.style.height = px(spec.height); sheet.dataset.width = String(spec.width / UNIT); sheet.dataset.height = String(spec.height / UNIT); sheet.style.position = 'relative';
      current = sheet; pages.push(sheet); sectionPage++; flowY = 0; priorPosition = -1;
      var loc = {page: sheet, pageW: spec.width, pageH: spec.height, margin: spec.margin, x: spec.margin.left, y: spec.margin.top};
      masters.forEach(function (master) {
        var root = master.documentElement, type = val(root, 'type'); if (type === 'EVEN' && sectionPage % 2 || type === 'ODD' && sectionPage % 2 === 0) return;
        var layer = el('div', 'dhp-master'); setBox(layer, 0, 0, spec.width, spec.height); layer.style.zIndex = '0'; sheet.appendChild(layer);
        children(one(root, 'subList'), 'p').forEach(function (p) { var seg = first(one(p, 'linesegarray'), 'lineseg'), y = spec.margin.top + num(seg, 'vertpos'), para = renderParagraph(p, ctx, Object.assign({}, loc, {page: layer, y: y})); setBox(para, spec.margin.left + num(seg, 'horzpos'), y, spec.width - spec.margin.left - spec.margin.right, Math.max(100, num(seg, 'vertsize', 1000))); layer.appendChild(para); });
      });
      headers.forEach(function (header) {
        var type = val(header, 'applyPageType'); if (type === 'EVEN' && sectionPage % 2 || type === 'ODD' && sectionPage % 2 === 0) return;
        var sub = one(header, 'subList'), paras = children(sub, 'p'), headerY = header.localName === 'footer' ? spec.height - spec.margin.bottom + spec.margin.footer : Math.max(0, spec.margin.top - spec.margin.header - 2200);
        paras.forEach(function (p) { var tables = topObjects(p, 'tbl'); if (tables.length) tables.forEach(function (tbl) { var table = renderTable(tbl, ctx, Object.assign({}, loc, {y: headerY})); table.node.style.left = px(spec.margin.left); table.node.style.top = px(headerY); sheet.appendChild(table.node); }); else { var para = renderParagraph(p, ctx, Object.assign({}, loc, {y: headerY})); setBox(para, spec.margin.left, headerY, spec.width - spec.margin.left - spec.margin.right, 2200); sheet.appendChild(para); } });
      });
      return sheet;
    }
    ctx.sections.forEach(function (section) {
      spec = pageSpec(section); sectionPage = 0;
      masters = all(section, 'masterPage').map(function (n) { return ctx.masters[val(n, 'idRef')]; }).filter(Boolean);
      headers = all(section, 'header').concat(all(section, 'footer')); makePage();
      children(section.documentElement, 'p').forEach(function (p) {
        var segment = first(one(p, 'linesegarray'), 'lineseg'), position = segment ? num(segment, 'vertpos') : flowY;
        if ((val(p, 'pageBreak') === '1' || (segment && priorPosition >= 0 && position < priorPosition + 1)) && flowY > 0) makePage();
        var loc = {page: current, pageW: spec.width, pageH: spec.height, margin: spec.margin, x: spec.margin.left, y: spec.margin.top + position}, tables = topObjects(p, 'tbl');
        if (tables.length) {
          tables.forEach(function (tbl) {
            var pos = one(tbl, 'pos'), outside = one(tbl, 'outMargin'), x = spec.margin.left + num(pos, 'horzOffset') + num(outside, 'left'), y = spec.margin.top + position + num(pos, 'vertOffset') + num(outside, 'top');
            if (val(pos, 'horzRelTo') === 'PAPER') x = num(pos, 'horzOffset'); if (val(pos, 'vertRelTo') === 'PAPER') y = num(pos, 'vertOffset');
            var size = one(tbl, 'sz'), h = num(size, 'height'), room = spec.height - spec.margin.bottom;
            if (y + h > room + 75 && flowY > 0 && h <= room - spec.margin.top) { makePage(); position = 0; y = spec.margin.top + num(outside, 'top') + num(pos, 'vertOffset'); }
            loc = Object.assign({}, loc, {page: current, x: x, y: y}); var table = renderTable(tbl, ctx, loc); table.node.style.left = px(x); table.node.style.top = px(y); table.node.style.zIndex = '1'; current.appendChild(table.node);
            if (y + table.height > spec.height + 75) {
              // Preserve every cell when a long source table extends over a page: repeat the saved geometry through clipped page viewports.
              var consumed = spec.height - y, original = table.node;
              while (consumed < table.height) { makePage(); var clone = original.cloneNode(true); clone.style.top = px(spec.margin.top - consumed); current.appendChild(clone); consumed += spec.height - spec.margin.top - spec.margin.bottom; }
              warn(ctx, '여러 페이지에 걸친 표의 웹 페이지 나눔은 한글과 다를 수 있습니다.');
            }
            flowY = Math.max(flowY, y - spec.margin.top + table.height); priorPosition = position;
          });
          // Floating pictures and non-table text sharing the anchor paragraph must not disappear.
          var remainder = p.cloneNode(true); children(remainder, 'run').forEach(function (run) { children(run, 'tbl').forEach(function (n) { n.remove(); }); });
          var rest = renderParagraph(remainder, ctx, loc); if (rest.textContent.trim() || rest.querySelector('.dhp-picture')) { setBox(rest, loc.x, loc.y, spec.width - spec.margin.left - spec.margin.right, 2000); current.appendChild(rest); }
        } else {
          var paragraph = renderParagraph(p, ctx, loc), height = Math.max(1000, num(segment, 'vertsize', 1200)); setBox(paragraph, spec.margin.left + num(segment, 'horzpos'), spec.margin.top + position, spec.width - spec.margin.left - spec.margin.right, height); current.appendChild(paragraph); flowY = Math.max(flowY, position + height + num(segment, 'spacing')); priorPosition = position;
        }
      });
    });
    return pages;
  }
  var PRINT_CSS = '.dhp-page{position:relative;overflow:hidden;background:#fff;color:#000;box-sizing:border-box;break-after:page;page-break-after:always}.dhp-page:last-child{break-after:auto;page-break-after:auto}.dhp-page *{box-sizing:border-box}.dhp-cell{display:flex;flex-direction:column;min-width:0;overflow:visible}.dhp-cell-content{width:100%;min-width:0}.dhp-paragraph{padding:0;font-family:Batang,serif;font-size:13.3333px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.2}.dhp-table{isolation:auto}.dhp-master{pointer-events:none}.dhp-image-missing,.dhp-unsupported{color:#6d4d00;font:10px sans-serif;background:#fff3cd}.dhp-cell-content>.dhp-paragraph{flex:none}';
  async function render(blob, options) {
    options = options || {}; var ctx = await load(blob), pages = renderDocument(ctx), root = el('div', 'dhp-viewer'), toolbar = el('div', 'dhp-toolbar'), select = el('select'), pageList = el('div', 'dhp-pages'), warnings = el('div', 'dhp-notes'), destroyed = false, observer, frame, usesAnimationFrame = typeof global.requestAnimationFrame === 'function';
    select.setAttribute('aria-label', '문서 미리보기 확대'); [['fit', '화면에 맞춤'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%']].forEach(function (o) { var option = el('option', '', o[1]); option.value = o[0]; select.appendChild(option); });
    toolbar.appendChild(el('span', 'dhp-page-count', '총 ' + pages.length + '페이지')); toolbar.appendChild(select); var printButton = el('button', 'dhp-print-button', '웹 인쇄'); printButton.type = 'button'; printButton.addEventListener('click', function () { print().catch(function (err) { global.alert(err.message || '인쇄 창을 열 수 없습니다.'); }); }); toolbar.appendChild(printButton); root.appendChild(toolbar);
    root.appendChild(el('div', 'dhp-notice', '저장된 HWPX 본문을 표시합니다. PC의 글꼴과 한글의 조판 방식에 따라 줄바꿈·인쇄 위치가 조금 다를 수 있습니다.'));
    if (ctx.warnings.length) { warnings.setAttribute('role', 'status'); ctx.warnings.forEach(function (message) { warnings.appendChild(el('p', '', message)); }); root.appendChild(warnings); }
    pages.forEach(function (page) { var wrap = el('div', 'dhp-page-wrap'); wrap.appendChild(page); pageList.appendChild(wrap); }); root.appendChild(pageList);
    var scopeStyle = el('style'); scopeStyle.textContent = PRINT_CSS; root.prepend(scopeStyle);
    function resize() { if (destroyed) return; var width = Math.max(200, pageList.clientWidth || root.clientWidth || 850) - 32; pages.forEach(function (page) { var w = Number(page.dataset.width), h = Number(page.dataset.height), scale = select.value === 'fit' ? Math.min(1, width / w) : Number(select.value); page.style.transformOrigin = 'top left'; page.style.transform = 'scale(' + scale + ')'; page.parentNode.style.width = w * scale + 'px'; page.parentNode.style.height = h * scale + 'px'; }); }
    select.addEventListener('change', resize); if (global.ResizeObserver) { observer = new ResizeObserver(resize); observer.observe(root); } else global.addEventListener('resize', resize);
    frame = usesAnimationFrame ? global.requestAnimationFrame(resize) : global.setTimeout(resize, 0);
    async function print() {
      var w = global.open('', '_blank'); if (!w) throw new Error('인쇄 창이 차단되었습니다. 팝업을 허용한 후 다시 시도해주세요.');
      var doc = w.document; doc.open(); doc.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body></body></html>'); doc.close();
      var title = doc.createElement('title'); title.textContent = options.name || 'HWPX 문서'; doc.head.appendChild(title);
      var style = doc.createElement('style'), pw = Number(pages[0].dataset.width), ph = Number(pages[0].dataset.height);
      style.textContent = PRINT_CSS + 'html,body{margin:0;padding:0;background:white}.dhp-page{margin:0;box-shadow:none;transform:none!important}@page{size:' + pw + 'px ' + ph + 'px;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' + pages.map(function (page, i) { return '@page dhp' + i + '{size:' + Number(page.dataset.width) + 'px ' + Number(page.dataset.height) + 'px;margin:0}[data-page=\"' + page.dataset.page + '\"]{page:dhp' + i + '}'; }).join(''); doc.head.appendChild(style);
      pages.forEach(function (page) { var clone = page.cloneNode(true); clone.style.transform = 'none'; doc.body.appendChild(doc.importNode(clone, true)); });
      await Promise.all(Array.from(doc.images).map(function (img) { return img.complete ? Promise.resolve() : new Promise(function (resolve) { img.onload = img.onerror = resolve; setTimeout(resolve, 3000); }); }));
      if (doc.fonts && doc.fonts.ready) await Promise.race([doc.fonts.ready, new Promise(function (resolve) { setTimeout(resolve, 2000); })]); w.focus(); w.print();
    }
    return {element: root, pages: pages.length, warnings: ctx.warnings.slice(), print: print, destroy: function () { destroyed = true; if (observer) observer.disconnect(); global.removeEventListener('resize', resize); if (usesAnimationFrame) { if (global.cancelAnimationFrame) global.cancelAnimationFrame(frame); } else global.clearTimeout(frame); }};
  }
  global.DF_HWPX_PREVIEW = {version: VERSION, render: render, _test: {parseXML: parseXML, safePath: safePath, boundaries: boundaries, load: load, renderDocument: renderDocument}};
})(window);
