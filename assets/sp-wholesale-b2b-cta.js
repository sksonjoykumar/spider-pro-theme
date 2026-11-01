/* Progressive modal enhancement: without JS the native Shopify contact form stays inline. */
(() => {
  'use strict';
  if (document.documentElement.dataset.spWholesaleScriptReady === '1') return;
  document.documentElement.dataset.spWholesaleScriptReady = '1';
  const instances = new WeakMap();
  function init(root) {
    if (!root || instances.has(root) || root.dataset.spFormMode !== 'modal') return;
    const trigger = root.querySelector('[data-sp-wholesale-open]');
    const shell = root.querySelector('[data-sp-wholesale-form-shell]');
    const panel = root.querySelector('[data-sp-wholesale-form-panel]');
    if (!trigger || !shell || !panel || typeof HTMLDialogElement === 'undefined') return;
    const dialog = document.createElement('dialog');
    dialog.className = 'sp-wholesale__dialog';
    dialog.setAttribute('aria-label', root.querySelector('.sp-wholesale__form-heading')?.textContent?.trim() || 'Wholesale application');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sp-wholesale__dialog-close';
    close.setAttribute('aria-label', 'Close application form');
    close.textContent = '×';
    dialog.append(close, panel);
    root.append(dialog);
    shell.hidden = true;
    let lastFocus = null;
    const onOpen = event => {
      event.preventDefault();
      lastFocus = document.activeElement;
      dialog.showModal();
      (dialog.querySelector('input:not([type="hidden"])') || close).focus({ preventScroll: true });
    };
    const onClose = () => dialog.close();
    const onBackdrop = event => { if (event.target === dialog) dialog.close(); };
    const onDialogClose = () => { if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); };
    trigger.addEventListener('click', onOpen);
    close.addEventListener('click', onClose);
    dialog.addEventListener('click', onBackdrop);
    dialog.addEventListener('close', onDialogClose);
    instances.set(root, () => {
      trigger.removeEventListener('click', onOpen);
      close.removeEventListener('click', onClose);
      dialog.removeEventListener('click', onBackdrop);
      dialog.removeEventListener('close', onDialogClose);
      if (dialog.open) dialog.close();
      shell.append(panel);
      shell.hidden = false;
      dialog.remove();
      instances.delete(root);
    });
    if (root.querySelector('.sp-wholesale__form-error,.sp-wholesale__form-message')) {
      const message = root.querySelector('.sp-wholesale__form-error,.sp-wholesale__form-message');
      if (message) { dialog.showModal(); message.focus?.(); }
    }
  }
  const all = scope => {
    if (scope.matches?.('[data-sp-wholesale]')) init(scope);
    scope.querySelectorAll?.('[data-sp-wholesale]').forEach(init);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => all(document), {once:true});
  else all(document);
  {
    document.addEventListener('shopify:section:load', e => all(e.target));
    document.addEventListener('shopify:section:unload', e => {
      if (e.target.matches?.('[data-sp-wholesale]')) instances.get(e.target)?.();
      e.target.querySelectorAll?.('[data-sp-wholesale]').forEach(root => instances.get(root)?.());
    });
  }
})();
