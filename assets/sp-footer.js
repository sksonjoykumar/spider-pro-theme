/* Spider Premium Footer v4: single-controller native accordion, responsive + Theme Editor safe. */
(() => {
  'use strict';
  const KEY = '__spPremiumFooterV4';
  const ROOT = '[data-sp-premium-footer]';
  if (window[KEY]) {
    window[KEY].scan(document);
    return;
  }

  const mobile = window.matchMedia('(max-width: 767px)');
  const controllers = new WeakMap();

  function initialize(root) {
    if (!root || controllers.has(root)) return;
    const menus = [...root.querySelectorAll('[data-pf-mobile-menu]')];
    const cleanups = [];
    let currentMode = '';

    function syncMode() {
      const mode = mobile.matches ? 'mobile' : 'desktop';
      if (mode === currentMode) return;
      currentMode = mode;
      menus.forEach((menu, index) => {
        menu.open = mode === 'desktop' || (index === 0 && root.dataset.pfInitialOpen === 'true');
      });
    }

    function onToggle(menu) {
      if (!mobile.matches || !menu.open || root.dataset.pfSingleOpen !== 'true') return;
      for (const other of menus) {
        if (other !== menu && other.open) other.open = false;
      }
    }

    // The headings are visual labels on desktop, not collapsible controls.
    for (const menu of menus) {
      const summary = menu.querySelector('summary');
      if (summary) {
        const onClick = (event) => {
          if (!mobile.matches) event.preventDefault();
        };
        summary.addEventListener('click', onClick);
        cleanups.push(() => summary.removeEventListener('click', onClick));
      }
      const handler = () => onToggle(menu);
      menu.addEventListener('toggle', handler);
      cleanups.push(() => menu.removeEventListener('toggle', handler));
    }

    for (const input of root.querySelectorAll('[data-sp-pf-localization]')) {
      const handler = () => {
        const form = input.form;
        if (!form) return;
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      };
      input.addEventListener('change', handler);
      cleanups.push(() => input.removeEventListener('change', handler));
    }

    const onBreakpoint = () => syncMode();
    if (mobile.addEventListener) {
      mobile.addEventListener('change', onBreakpoint);
      cleanups.push(() => mobile.removeEventListener('change', onBreakpoint));
    } else {
      mobile.addListener(onBreakpoint);
      cleanups.push(() => mobile.removeListener(onBreakpoint));
    }

    syncMode();
    controllers.set(root, {
      selectBlock(target) {
        if (!mobile.matches) return;
        const menu = target.closest?.('[data-pf-mobile-menu]');
        if (menu && root.contains(menu)) menu.open = true;
      },
      dispose() {
        cleanups.forEach(fn => fn());
        controllers.delete(root);
      }
    });
  }

  function scan(scope) {
    if (scope.matches?.(ROOT)) initialize(scope);
    scope.querySelectorAll?.(ROOT).forEach(initialize);
  }

  function dispose(scope) {
    if (scope.matches?.(ROOT)) controllers.get(scope)?.dispose();
    scope.querySelectorAll?.(ROOT).forEach(root => controllers.get(root)?.dispose());
  }

  window[KEY] = {scan};
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan(document), {once: true});
  } else {
    scan(document);
  }
  document.addEventListener('shopify:section:load', event => scan(event.target));
  document.addEventListener('shopify:section:unload', event => dispose(event.target));
  document.addEventListener('shopify:block:select', event => {
    const root = event.target.closest?.(ROOT);
    if (root) controllers.get(root)?.selectBlock(event.target);
  });
})();
