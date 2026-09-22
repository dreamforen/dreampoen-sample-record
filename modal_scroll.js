/* DREAMPOEN v120.37.30 · Shared popup wheel/viewport handling.
 * Load after modal_guard.js; this module never closes a dialog or edits records.
 * Native wheel scrolling stays native whenever its nearest scroll area has room.
 */
(function (window, document) {
  'use strict';
  if (window.DF_MODAL_SCROLL) return;
  var roots = [
    '.company-modal-backdrop', '.v75-company-modal-backdrop', '.contract-modal-backdrop',
    '.company-file-preview-backdrop', '.df-board-modal-backdrop', '.dfcd-modal-backdrop',
    '.rhx-preview-modal', '.rpt-method-modal', '.df-quality-file-preview',
    '#dfSafePreviewBackdrop', '#dfDiagPanel', 'dialog[open]', '[data-df-modal-root]'
  ].join(',');
  var panels = [
    '.company-modal', '.company-modal-panel', '.v75-company-modal', '.contract-modal', '.company-file-preview',
    '.df-board-modal', '.dfcd-modal', '.rhx-preview-card', '.df-quality-preview-dialog',
    '#dfSafePreviewCard', '#dfDiagCard', '.hy2-modal-card', '.rpt-method-dialog', '.rpt-method-card'
  ].join(',');
  var layoutBodies = [
    '.company-modal-body', '.contract-modal-body', '.df-board-modal-body', '.dfcd-editor-body',
    '.dfcd-preview-stage', '.v120633-match-body', '.df-gap-list', '.rhx-preview-body',
    '.company-file-preview-body', '.df-quality-preview-sheet-wrap', '.df-quality-preview-body',
    '.df-mobile-pdf-stage', '.hy2-modal-body', '#dfDiagOutput', '.df-erp-match-list'
  ].join(',');
  var bodies=layoutBodies+',.dfa-sheet-scroll';
  var opened = [], queued = false;

  function element(node) { return node && node.nodeType === 1 ? node : node && node.parentElement; }
  function visible(node) {
    if (!node || !node.isConnected) return false;
    for (var current=node; current && current.nodeType===1; current=current.parentElement) {
      if (current.hidden || current.getAttribute('aria-hidden')==='true') return false;
      var style=window.getComputedStyle(current);
      if (style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse') return false;
    }
    return true;
  }
  function hasScroll(node) {
    if (!node || node.clientHeight<=0 || node.scrollHeight-node.clientHeight<=1) return false;
    var style=window.getComputedStyle(node), overflow=style.overflowY || style.overflow;
    return /^(auto|scroll|overlay)$/.test(overflow);
  }
  function room(node, delta) {
    return delta<0 ? node.scrollTop>0.5 : node.scrollTop<node.scrollHeight-node.clientHeight-0.5;
  }
  function topRoot() {
    var top=null, highest=-Infinity;
    opened.forEach(function(root) {
      if (!visible(root)) return;
      var z=parseInt(window.getComputedStyle(root).zIndex,10)||0;
      // Later nodes win an equal stacking level, as they do in normal painting.
      if (z>=highest) { highest=z;top=root; }
    });
    return top;
  }
  function viewportHeight() {
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  }
  function refresh() {
    queued=false;
    if (!document.body) return;
    opened=Array.from(document.querySelectorAll(roots)).filter(visible);
    opened.forEach(function(root) {
      if (!root.classList.contains('df-modal-scroll-root')) root.classList.add('df-modal-scroll-root');
      var style=window.getComputedStyle(root);
      var padding=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
      var limit=Math.max(100,Math.floor(viewportHeight()-padding));
      var value=limit+'px';
      if (root.style.getPropertyValue('--df-modal-available-height')!==value) root.style.setProperty('--df-modal-available-height',value);
      Array.from(root.querySelectorAll(panels)).forEach(function(panel) {
        if (panel.closest(roots)!==root) return;
        if (!panel.classList.contains('df-modal-scroll-panel')) panel.classList.add('df-modal-scroll-panel');
        // Some legacy editors put the entire form directly in an overflow:hidden
        // card, with no scrollable body. Their whole card must be scrollable.
        var whole=!panel.querySelector(layoutBodies);
        if (panel.classList.contains('df-modal-scroll-whole')!==whole) panel.classList.toggle('df-modal-scroll-whole',whole);
      });
    });
    var active=opened.length>0;
    if (document.body.classList.contains('df-modal-scroll-open')!==active) document.body.classList.toggle('df-modal-scroll-open',active);
    if (document.documentElement.classList.contains('df-modal-scroll-open')!==active) document.documentElement.classList.toggle('df-modal-scroll-open',active);
  }
  function schedule() {
    if (queued) return;
    queued=true;
    (window.requestAnimationFrame || function(fn){return window.setTimeout(fn,0);})(refresh);
  }
  function distance(event, node) {
    if (event.deltaMode===1) return event.deltaY*16;
    if (event.deltaMode===2) return event.deltaY*Math.max(1,node.clientHeight);
    return event.deltaY;
  }
  function move(node, event) {
    if (!event.cancelable) return;
    event.preventDefault();
    node.scrollTop=Math.max(0,Math.min(node.scrollHeight-node.clientHeight,node.scrollTop+distance(event,node)));
  }
  function wheel(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey ||
        !event.deltaY || Math.abs(event.deltaX)>Math.abs(event.deltaY)) return;
    var root=topRoot();
    if (!root) return;
    var target=element(event.target);
    if (!target || !root.contains(target)) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    // Keep the browser's native select dropdown and focused control handling.
    if (target.closest('select') && target.closest('select')===document.activeElement) return;
    var nearest=null;
    for (var current=target;current;current=current.parentElement) {
      if (hasScroll(current)) {
        if (!nearest) nearest=current;
        if (room(current,event.deltaY)) {
          // A child at its boundary may have overscroll-behavior:contain. Explicitly
          // hand that wheel to the parent; otherwise preserve natural scrolling.
          if (current!==nearest) move(current,event);
          return;
        }
      }
      if (current===root) break;
    }
    if (!nearest) {
      // A toolbar, footer or backdrop has no scrollable ancestors. Scroll the
      // main modal body instead of requiring the pointer to hover its scrollbar.
      var candidates=Array.from(root.querySelectorAll(bodies+','+panels));
      for (var i=0;i<candidates.length;i+=1) {
        var candidate=candidates[i];
        if (candidate.closest(roots)===root && visible(candidate) && hasScroll(candidate) && room(candidate,event.deltaY)) {
          move(candidate,event);return;
        }
      }
    }
    // At both ends stay in this popup; do not scroll a lower popup or the page.
    if (event.cancelable) event.preventDefault();
  }
  function init() {
    refresh();
    new MutationObserver(function(changes) {
      if (changes.some(function(change) {
        var target=element(change.target);
        if (target && (target===document.body || target.matches(roots) || target.closest(roots))) return true;
        return Array.from(change.addedNodes||[]).some(function(node) {
          return node.nodeType===1 && (node.matches(roots) || node.querySelector(roots));
        }) || Array.from(change.removedNodes||[]).some(function(node) {
          return node.nodeType===1 && (node.matches(roots) || node.querySelector(roots));
        });
      })) schedule();
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class','aria-hidden','open']});
    window.addEventListener('wheel',wheel,{capture:true,passive:false});
    window.addEventListener('resize',schedule,{passive:true});
    if (window.visualViewport) window.visualViewport.addEventListener('resize',schedule,{passive:true});
  }
  window.DF_MODAL_SCROLL=Object.freeze({version:'120.37.30',refresh:refresh,protectedSelectors:roots});
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window,document);
