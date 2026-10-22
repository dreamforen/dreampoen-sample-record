/* DREAMPOEN v120.37.29.0 · Mobile menu space and keyboard access.
 * Load after app.js / v12032.js and before navigation_guard.js.
 * Reuses the existing button, click handlers, router and scroll-lock functions.
 */
(function (window, document) {
  'use strict';
  if (window.DF_MOBILE_NAVIGATION) return;
  var initialized = false, button, sidebar, bar, closer, main, wasOpen = false;
  var sidebarOriginal = {}, originalMainInert = false, savedFocus = null;
  function mobile() { return window.matchMedia ? window.matchMedia('(max-width:768px)').matches : window.innerWidth <= 768; }
  function open() { return mobile() && document.body.classList.contains('df-mobile-menu-open'); }
  function focus(element) { if (element && element.isConnected) try { element.focus({preventScroll:true}); } catch (_) { element.focus(); } }
  function originalAttribute(element, key, value) {
    if (value === null) element.removeAttribute(key); else element.setAttribute(key, value);
  }
  function measure() {
    if (!bar) return;
    var height = mobile() ? Math.ceil(bar.getBoundingClientRect().height) : 0;
    // Keep CSS's safe-area fallback until layout is measurable (e.g. hidden login).
    if (height > 0) document.documentElement.style.setProperty('--df-mobile-nav-height', height + 'px');
    else document.documentElement.style.removeProperty('--df-mobile-nav-height');
  }
  function sync() {
    if (!button) return;
    var narrow = mobile(), expanded = open();
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? '메뉴 닫기' : '메뉴 열기');
    button.textContent = expanded ? '✕ 닫기' : '☰ 메뉴';
    if (narrow) {
      sidebar.setAttribute('aria-hidden', String(!expanded));
      sidebar.inert = !expanded;
      if (expanded) {
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
        sidebar.setAttribute('aria-label', '전체 메뉴');
      } else {
        ['role','aria-modal','aria-label'].forEach(function(key){originalAttribute(sidebar,key,sidebarOriginal[key]);});
      }
    } else {
      sidebar.inert = sidebarOriginal.inert;
      ['aria-hidden','role','aria-modal','aria-label'].forEach(function(key){originalAttribute(sidebar,key,sidebarOriginal[key]);});
    }
    if (expanded && !wasOpen) {
      savedFocus = document.activeElement;
      originalMainInert = main ? !!main.inert : false;
      if (main) main.inert = true;
      focus(closer);
    } else if (!expanded && wasOpen) {
      if (main) main.inert = originalMainInert;
      // A page/dialog opened by a menu action may already own focus.
      if (sidebar.contains(document.activeElement)) focus(narrow ? button : savedFocus);
    }
    wasOpen = expanded;
  }
  function close(restoreFocus) {
    if (!document.body.classList.contains('df-mobile-menu-open')) return sync();
    if (typeof window.dfCloseMobileMenu === 'function') window.dfCloseMobileMenu();
    sync();
    if (restoreFocus !== false && mobile()) focus(button);
  }
  function focusable() {
    return Array.from(sidebar.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')).filter(function(el){
      if (el.disabled || el.tabIndex < 0 || el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
      var style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    });
  }
  function init() {
    if (initialized) return;
    button = document.getElementById('dfMobileMenuBtn');
    sidebar = document.querySelector('.df-sidebar');
    var shell = document.querySelector('.df-app-shell');
    if (!button || !sidebar || !shell) return;
    initialized = true;
    main = document.querySelector('.df-main-area');
    ['aria-hidden','role','aria-modal','aria-label'].forEach(function(key){sidebarOriginal[key]=sidebar.getAttribute(key);});
    sidebarOriginal.inert = !!sidebar.inert;
    if (!sidebar.id) sidebar.id = 'dfMobileSidebar';
    button.setAttribute('aria-controls', sidebar.id);
    var reserve = document.createElement('div');
    reserve.id = 'dfMobileNavReserve';
    bar = document.createElement('div');
    bar.id = 'dfMobileNavBar';
    var title = document.createElement('span');
    title.className = 'df-mobile-nav-title';
    title.textContent = '통합업무시스템';
    bar.appendChild(button); bar.appendChild(title); reserve.appendChild(bar);
    shell.parentNode.insertBefore(reserve, shell);
    var header = document.createElement('div');
    header.className = 'df-mobile-drawer-close';
    var label = document.createElement('strong'); label.textContent = '전체 메뉴';
    closer = document.createElement('button'); closer.type = 'button'; closer.textContent = '닫기 ✕';
    closer.setAttribute('aria-label', '메뉴 닫기');
    header.appendChild(label); header.appendChild(closer); sidebar.insertBefore(header, sidebar.firstChild);
    document.body.classList.add('df-mobile-nav-ready');
    // app.js registered its original button/backdrop listeners earlier. Do not clone,
    // intercept or replace them; synchronize after their normal click handling.
    button.addEventListener('click', sync);
    var backdrop = document.getElementById('dfMobileMenuBackdrop');
    if (backdrop) { backdrop.setAttribute('aria-hidden','true'); backdrop.addEventListener('click',sync); }
    closer.addEventListener('click',function(){close(true);});
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
    if (window.ResizeObserver) new window.ResizeObserver(measure).observe(bar);
    window.addEventListener('resize',function(){measure();sync();},{passive:true});
    if (window.visualViewport) window.visualViewport.addEventListener('resize',measure,{passive:true});
    window.addEventListener('keydown',function(event){
      if (!open()) return;
      if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
      if (event.key !== 'Tab') return;
      var items = focusable(), first = items[0] || closer, last = items[items.length-1] || closer;
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) { event.preventDefault(); focus(last); }
      else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) { event.preventDefault(); focus(first); }
    },true);
    // Register before navigation_guard's capture handler. Its stopImmediatePropagation
    // intentionally bypasses legacy bubbling listeners, so observe without routing.
    window.addEventListener('click',function(event){
      var target = event.target.closest && event.target.closest('.df-nav-item[data-view],#dfProfileOpen,#dfLogoutBtn,#dfBrandHomeReset');
      if (!open() || !target || !sidebar.contains(target)) return;
      Promise.resolve().then(function(){close(false);});
    },true);
    measure(); sync();
  }
  window.DF_MOBILE_NAVIGATION = Object.freeze({version:'120.37.29.0',refresh:function(){measure();sync();},close:close});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})(window,document);
