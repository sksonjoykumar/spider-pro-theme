(() => {
  'use strict';

  if (window.__spProductHeroBound) return;
  window.__spProductHeroBound = true;

  const eventName = window.Spider?.events?.variantChanged || 'spider:variant:changed';

  document.addEventListener(eventName, (event) => {
    const root = event.detail?.root;
    const variant = event.detail?.variant;
    if (!root?.matches?.('[data-product-hero][data-main-product]')) return;

    if (variant?.id) {
      const detailsLink = root.querySelector('[data-product-hero-details]');
      if (detailsLink) {
        try {
          /* Match the data-product-hero-url attribute rendered by the section. */
          const productUrl = new URL(root.dataset.productHeroUrl || detailsLink.href, window.location.origin);
          productUrl.searchParams.set('variant', String(variant.id));
          detailsLink.href = productUrl.toString();
        } catch (_) {}
      }
    }

    /*
      sp-product-form.js is shared with the main product page and writes ?variant=
      to the current page URL. A Product Hero can live on home/landing pages,
      so keep the host page URL clean while still reusing the shared controller.
    */
    try {
      const pageUrl = new URL(window.location.href);
      if (pageUrl.searchParams.has('variant')) {
        pageUrl.searchParams.delete('variant');
        window.history.replaceState({}, '', `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);
      }
    } catch (_) {}
  });
})();
