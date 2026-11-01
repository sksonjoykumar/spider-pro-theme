(() => {
  'use strict';

  if (window.__spFeaturedProductBound) return;
  window.__spFeaturedProductBound = true;

  const eventName = window.Spider?.events?.variantChanged || 'spider:variant:changed';

  document.addEventListener(eventName, (event) => {
    const root = event.detail?.root;
    const variant = event.detail?.variant;
    if (!root?.matches?.('[data-featured-product][data-main-product]')) return;

    if (variant?.id) {
      const detailsLink = root.querySelector('[data-featured-product-details]');
      if (detailsLink) {
        try {
          const productUrl = new URL(root.dataset.featuredProductUrl || detailsLink.href, window.location.origin);
          productUrl.searchParams.set('variant', String(variant.id));
          detailsLink.href = productUrl.toString();
        } catch (_) {}
      }
    }

    /*
      sp-product-form.js is shared with the main product page and writes ?variant=
      to the current page URL. A Featured Product can live on home/landing pages,
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
