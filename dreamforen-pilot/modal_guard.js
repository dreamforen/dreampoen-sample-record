/* DREAMPOEN v120.37.26.0 — keep document dialogs open until an intentional action.
 * Load this synchronous script before app.js and the feature scripts.
 * Only backdrop pointer events and dialog Escape/cancel are intercepted.
 * Close/Cancel/Save buttons, native controls, file drops and page navigation retain
 * their existing handlers. No business data or DOM-removal methods are changed.
 */
(function (window, document) {
  'use strict';
  if (window.DF_MODAL_GUARD) return;

  // Explicit inventory of this application's modal shells. In particular the
  // mobile navigation backdrop and autocomplete lists are not document dialogs.
  var roots = [
    '.company-modal-backdrop', '.contract-modal-backdrop',
    '.company-file-preview-backdrop', '.df-board-modal-backdrop',
    '.dfcd-modal-backdrop', '.rhx-preview-modal', '.rpt-method-modal',
    '.df-quality-file-preview', '#dfSafePreviewBackdrop', '#dfDiagPanel',
    'dialog[open]', '[data-df-modal-root]'
  ].join(',');
  var backdrops = roots + ',.df-quality-preview-backdrop,[data-df-modal-backdrop]';

  function element(value) {
    return value && value.nodeType === 1 ? value : value && value.parentElement;
  }
  function shown(node) {
    if (!node || !node.isConnected) return false;
    for (var current = node; current && current.nodeType === 1; current = current.parentElement) {
      if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
      var style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  }
  function openDialog() {
    var nodes = document.querySelectorAll(roots);
    for (var i = nodes.length - 1; i >= 0; i -= 1) if (shown(nodes[i])) return nodes[i];
    return null;
  }
  function backdropTarget(event) {
    var target = element(event.target);
    if (!target || !target.matches(backdrops) || !shown(target)) return null;
    // An open native dialog is also its content container. Only a click outside
    // its rectangle belongs to the browser's ::backdrop, not inner blank space.
    if (target.tagName === 'DIALOG') {
      var box = target.getBoundingClientRect();
      if (event.clientX >= box.left && event.clientX <= box.right &&
          event.clientY >= box.top && event.clientY <= box.bottom) return null;
    }
    return target;
  }
  function blockBackdrop(event) {
    if (!backdropTarget(event)) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick'].forEach(function (type) {
    window.addEventListener(type, blockBackdrop, {capture: true, passive: false});
  });

  function guardEscape(event) {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    if (!openDialog()) return;
    var target = element(event.target);
    if (!target || target === document.body || target === document.documentElement || target.matches(backdrops)) {
      event.stopImmediatePropagation();
      return;
    }
    // Let the focused input/select's own Escape handler and browser default run
    // (autocomplete reset, native date-picker dismissal), then stop the event
    // before the old document-level handlers can dismiss its containing modal.
    // Adding at the target during capture is supported by DOM event dispatch.
    var stop = function (localEvent) {
      if (localEvent !== event) return;
      target.removeEventListener(event.type, stop, false);
      localEvent.stopPropagation();
    };
    target.addEventListener(event.type, stop, false);
    // A local control may already stopImmediatePropagation. Clean up even then.
    Promise.resolve().then(function () { target.removeEventListener(event.type, stop, false); });
  }
  ['keydown', 'keyup', 'keypress'].forEach(function (type) {
    window.addEventListener(type, guardEscape, true);
  });
  window.addEventListener('cancel', function (event) {
    var target = element(event.target);
    if (!target || target.tagName !== 'DIALOG' || !target.open) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.DF_MODAL_GUARD = Object.freeze({version: '120.37.26.0', protectedSelectors: roots});
})(window, document);
