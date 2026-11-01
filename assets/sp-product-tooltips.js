(() => {
  'use strict';

  const GUARD = '__SPIDER_PRODUCT_TOOLTIPS_V2__';
  if (window[GUARD]) return;
  window[GUARD] = true;

  const oldLayer = document.getElementById('SpProductTooltip');
  if (oldLayer) oldLayer.remove();

  const layer = document.createElement('div');
  layer.id = 'SpProductTooltip';
  layer.className = 'sp-product-tooltip-layer';
  layer.setAttribute('role', 'tooltip');
  layer.hidden = true;
  document.body.append(layer);

  let active = null;

  const supportsTooltip = () =>
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    window.innerWidth >= 750;

  const sourceFor = (button) =>
    button?.querySelector?.('.sp-product-card__tooltip');

  const hide = () => {
    if (active) {
      active.removeAttribute('data-sp-floating-tooltip-active');
      if (active.getAttribute('aria-describedby') === layer.id) {
        active.removeAttribute('aria-describedby');
      }
    }

    active = null;
    layer.classList.remove('is-visible');
    layer.hidden = true;
  };

  const position = (button) => {
    const source = sourceFor(button);
    const text = source?.textContent?.trim();

    if (!supportsTooltip() || !source || !text || button?.disabled) {
      hide();
      return;
    }

    if (active && active !== button) {
      active.removeAttribute('data-sp-floating-tooltip-active');
      if (active.getAttribute('aria-describedby') === layer.id) {
        active.removeAttribute('aria-describedby');
      }
    }

    active = button;
    layer.textContent = text;
    layer.hidden = false;

    button.setAttribute('data-sp-floating-tooltip-active', '');
    button.setAttribute('aria-describedby', layer.id);

    const trigger = button.getBoundingClientRect();
    const tip = layer.getBoundingClientRect();
    const gutter = 10;
    const gap = 9;
    const half = tip.width / 2;

    const centerX = trigger.left + trigger.width / 2;
    const x = Math.min(
      window.innerWidth - gutter - half,
      Math.max(gutter + half, centerX)
    );

    const topY = trigger.top - tip.height - gap;
    const bottomY = trigger.bottom + gap;
    const y = topY >= gutter
      ? topY
      : Math.min(window.innerHeight - tip.height - gutter, bottomY);

    layer.style.left = `${Math.round(x)}px`;
    layer.style.top = `${Math.round(y)}px`;

    requestAnimationFrame(() => {
      if (active === button && !layer.hidden) {
        layer.classList.add('is-visible');
      }
    });
  };

  const actionFrom = (target) =>
    target?.closest?.('.sp-product-card__icon-action');

  document.addEventListener('pointerover', (event) => {
    const action = actionFrom(event.target);
    if (!action || action.contains(event.relatedTarget)) return;
    position(action);
  });

  document.addEventListener('pointerout', (event) => {
    const action = actionFrom(event.target);
    if (!action || action !== active || action.contains(event.relatedTarget)) return;
    hide();
  });

  document.addEventListener('focusin', (event) => {
    const action = actionFrom(event.target);
    if (action) position(action);
  });

  document.addEventListener('focusout', (event) => {
    if (actionFrom(event.target) === active) hide();
  });

  document.addEventListener('click', (event) => {
    const action = actionFrom(event.target);
    if (!action) return;

    /* Wishlist/compare labels can change after click. Refresh the visible tooltip. */
    window.setTimeout(() => {
      if (action.matches(':hover') || document.activeElement === action) {
        position(action);
      } else {
        hide();
      }
    }, 0);
  });

  document.addEventListener('sp:wishlist:change', () => {
    window.setTimeout(() => active && position(active), 0);
  });

  document.addEventListener('sp:compare:change', () => {
    window.setTimeout(() => active && position(active), 0);
  });

  window.addEventListener('resize', hide, { passive: true });
  window.addEventListener('scroll', hide, { passive: true, capture: true });
})();
