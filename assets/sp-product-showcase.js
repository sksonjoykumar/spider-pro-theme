(() => {
  'use strict';

  if (window.__spProductShowcaseBound) return;
  window.__spProductShowcaseBound = true;

  const ROOT_SELECTOR = '[data-sp-product-showcase]';
  const VARIANT_EVENT = window.Spider?.events?.variantChanged || 'spider:variant:changed';

  function activateImage(root, button) {
    if (!root || !button) return;
    const mainImage = root.querySelector('[data-showcase-main-image]');
    if (!mainImage) return;

    const nextSrc = button.dataset.imageSrc;
    if (!nextSrc) return;

    mainImage.src = nextSrc;
    if (button.dataset.imageSrcset) mainImage.srcset = button.dataset.imageSrcset;
    else mainImage.removeAttribute('srcset');
    if (button.dataset.imageAlt) mainImage.alt = button.dataset.imageAlt;
    mainImage.dataset.imageId = button.dataset.imageId || '';

    root.querySelectorAll('[data-showcase-thumbnail]').forEach((thumbnail) => {
      const active = thumbnail === button;
      thumbnail.classList.toggle('is-active', active);
      thumbnail.setAttribute('aria-pressed', String(active));
    });
  }

  function syncAddLabel(root, variant) {
    const button = root.querySelector('[data-add-to-cart]');
    const label = button?.querySelector('[data-add-to-cart-text]');
    if (!button || !label) return;

    if (variant === null) {
      label.textContent = root.dataset.unavailableLabel || 'Unavailable';
      button.disabled = true;
      button.dataset.canSubmit = 'false';
      return;
    }

    if (variant && variant.available === false) {
      label.textContent = root.dataset.soldLabel || 'Sold out';
      button.disabled = true;
      button.dataset.canSubmit = 'false';
      return;
    }

    if (root.dataset.addLabel) label.textContent = root.dataset.addLabel;
    if (variant && variant.available === true) {
      button.disabled = false;
      button.dataset.canSubmit = 'true';
    }
  }

  function syncVariant(root, detail) {
    if (!root || !detail) return;
    const variant = detail.variant;
    const availability = root.querySelector('[data-showcase-availability]');
    const availabilityText = root.querySelector('[data-showcase-availability-text]');

    if (availability && availabilityText) {
      const available = Boolean(variant?.available);
      availability.classList.toggle('is-unavailable', !available);
      availabilityText.textContent = available
        ? (root.dataset.inStockLabel || 'Available now')
        : (root.dataset.outStockLabel || 'Currently unavailable');
    }

    const variantMeta = root.querySelector('[data-showcase-variant-meta]');
    const variantValue = root.querySelector('[data-showcase-variant-value]');
    if (variantMeta && variantValue && Array.isArray(variant?.options)) {
      const optionIndex = Math.max(0, Number(root.dataset.variantMetaIndex || 0));
      variantValue.textContent = variant.options[optionIndex] || '';
    }

    if (variant) {
      const imageId = detail.imageId || variant.featured_image_id;
      if (imageId) {
        const thumbnail = [...root.querySelectorAll('[data-showcase-thumbnail]')]
          .find((item) => String(item.dataset.imageId) === String(imageId));
        if (thumbnail) activateImage(root, thumbnail);
      }
    }

    syncAddLabel(root, variant === undefined ? null : variant);

    const detailsLink = root.querySelector('[data-showcase-details]');
    if (detailsLink && root.dataset.featuredProductUrl && variant?.id) {
      try {
        const url = new URL(root.dataset.featuredProductUrl, window.location.origin);
        url.searchParams.set('variant', String(variant.id));
        detailsLink.href = url.toString();
      } catch (_) {
        // Keep the Liquid-generated product URL if URL parsing is unavailable.
      }
    }
  }

  function init(scope = document) {
    const roots = [];
    if (scope?.matches?.(ROOT_SELECTOR)) roots.push(scope);
    scope?.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => roots.push(root));

    roots.forEach((root) => {
      if (root.dataset.addLabel) {
        const buttonText = root.querySelector('[data-add-to-cart-text]');
        const button = root.querySelector('[data-add-to-cart]');
        if (buttonText && button && !button.disabled) buttonText.textContent = root.dataset.addLabel;
      }
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-showcase-thumbnail]');
    if (!button) return;
    const root = button.closest(ROOT_SELECTOR);
    if (!root) return;
    event.preventDefault();
    activateImage(root, button);
  });

  document.addEventListener(VARIANT_EVENT, (event) => {
    const root = event.detail?.root;
    if (!root?.matches?.(ROOT_SELECTOR)) return;
    syncVariant(root, event.detail);
  });

  if (VARIANT_EVENT !== 'spider:variant:changed') {
    document.addEventListener('spider:variant:changed', (event) => {
      const root = event.detail?.root;
      if (!root?.matches?.(ROOT_SELECTOR)) return;
      syncVariant(root, event.detail);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
