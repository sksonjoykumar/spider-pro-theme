/* Spider Native Drawer Controller — premium reversible transitions, one source of truth. */
(() => {
  'use strict';
  const Spider = window.Spider = window.Spider || {};
  const selector = 'dialog.sp-drawer';
  const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const getDuration = () => {
    if (reduceMotion()) return 0;
    const settings = document.getElementById('SpiderGlobalSettings');
    let enabled = true;
    try { if (settings) enabled = JSON.parse(settings.textContent).sp_ui_drawer_motion !== false; } catch (_) { /* CSS fallback */ }
    if (!enabled) return 0;
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--sp-ui-drawer-duration').trim();
    return Math.min(1000, Math.max(0, Number.parseFloat(raw) || 300));
  };
  const syncScrollLock = () => {
    document.documentElement.classList.toggle('sp-scroll-lock', Boolean(document.querySelector(`${selector}[open]`)));
  };
  const dispatch = (name, dialog) => {
    const type = Spider.events?.[name];
    if (type) document.dispatchEvent(new CustomEvent(type, { detail: { id: dialog.id } }));
  };
  const clearAnimation = (dialog) => {
    if (dialog.__spCloseTimer != null) window.clearTimeout(dialog.__spCloseTimer);
    dialog.__spCloseTimer = null;
    if (dialog.__spOpenFrame != null) window.cancelAnimationFrame(dialog.__spOpenFrame);
    dialog.__spOpenFrame = null;
  };
  const finishClose = (dialog) => {
    if (!dialog?.open) return;
    clearAnimation(dialog);
    dialog.close(); // native close event handles cleanup and notifications
  };
  const closeDrawer = (dialog, restoreFocus = true, immediately = false) => {
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
    dialog.__spRestoreFocus = restoreFocus;
    if (immediately || getDuration() === 0) { finishClose(dialog); return; }
    if (dialog.hasAttribute('data-sp-drawer-closing')) return;
    clearAnimation(dialog);
    dialog.dataset.spDrawerClosing = '';
    dialog.classList.remove('sp-drawer--entered');
    dialog.__spCloseTimer = window.setTimeout(() => finishClose(dialog), getDuration() + 34);
  };
  const openDrawer = (id, trigger) => {
    const dialog = document.getElementById(id);
    if (!(dialog instanceof HTMLDialogElement) || !dialog.matches(selector)) return;
    if (dialog.open) {
      if (dialog.hasAttribute('data-sp-drawer-closing')) {
        clearAnimation(dialog);
        dialog.removeAttribute('data-sp-drawer-closing');
        dialog.classList.add('sp-drawer--entered');
      }
      return;
    }
    document.querySelectorAll(`${selector}[open]`).forEach(other => closeDrawer(other, false, true));
    dialog.__trigger = trigger || null;
    dialog.__spRestoreFocus = true;
    dialog.removeAttribute('data-sp-drawer-closing');
    dialog.classList.remove('sp-drawer--entered');
    dialog.showModal();
    trigger?.setAttribute('aria-expanded', 'true');
    syncScrollLock();
    void dialog.offsetWidth; // commit the translated state before animating in
    dialog.__spOpenFrame = requestAnimationFrame(() => {
      dialog.__spOpenFrame = null;
      if (!dialog.open) return;
      dialog.classList.add('sp-drawer--entered');
      const first = dialog.querySelector('[data-drawer-close], ' + focusableSelector);
      first?.focus({ preventScroll: true });
    });
    dispatch('drawerOpened', dialog);
  };
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const opener = event.target.closest('[data-drawer-open]');
    if (opener) {
      if (opener.tagName === 'A') event.preventDefault();
      openDrawer(opener.dataset.drawerOpen, opener);
      return;
    }
    const closer = event.target.closest('[data-drawer-close]');
    if (closer) {
      const dialog = closer.closest(selector);
      if (dialog) closeDrawer(dialog);
      return;
    }
    const dialog = event.target;
    if (dialog instanceof HTMLDialogElement && dialog.matches(selector)) closeDrawer(dialog);
  });
  document.addEventListener('cancel', (event) => {
    if (event.target instanceof HTMLDialogElement && event.target.matches(selector)) {
      event.preventDefault();
      closeDrawer(event.target);
    }
  }, true);
  document.addEventListener('close', (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.matches(selector)) return;
    clearAnimation(dialog);
    dialog.removeAttribute('data-sp-drawer-closing');
    dialog.classList.remove('sp-drawer--entered');
    dialog.__trigger?.setAttribute('aria-expanded', 'false');
    syncScrollLock();
    if (dialog.__spRestoreFocus !== false && dialog.__trigger?.isConnected) {
      requestAnimationFrame(() => dialog.__trigger?.focus({ preventScroll: true }));
    }
    dispatch('drawerClosed', dialog);
    dialog.__trigger = null;
    dialog.__spRestoreFocus = true;
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const dialog = document.querySelector(`${selector}[open]`);
    if (!dialog) return;
    const nodes = Array.from(dialog.querySelectorAll(focusableSelector)).filter(el => !el.hidden && el.getClientRects().length);
    if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  Spider.openDrawer = openDrawer;
  Spider.closeDrawer = closeDrawer;
})();
