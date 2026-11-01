(() => {
  'use strict';

  const TAG = 'sp-collection-spotlight';

  class SpiderCollectionSpotlight extends HTMLElement {
    connectedCallback() {
      this.abort?.abort();
      this.abort = new AbortController();
      this.carousel = this.querySelector('[data-sp-collection-spotlight-carousel]');
      this.mount = this.mount.bind(this);
      this.syncCommerce = this.syncCommerce.bind(this);

      this.mount();
      this.syncCommerce();
      document.addEventListener('sp:carousel:ready', this.mount, { signal: this.abort.signal });
      document.addEventListener('sp:product-system:ready', this.mount, { signal: this.abort.signal });
      document.addEventListener('sp:product-commerce:ready', this.syncCommerce, { signal: this.abort.signal });
    }

    disconnectedCallback() {
      this.abort?.abort();
      if (this.carousel) window.SpiderCarousel?.unmount?.(this.carousel);
      this.carousel = null;
    }

    mount() {
      if (!this.carousel || !this.isConnected) return;
      window.SpiderCarousel?.mount?.(this.carousel);
    }

    syncCommerce() {
      if (!this.isConnected) return;
      window.SpiderProductCommerce?.cards?.sync?.(this);
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SpiderCollectionSpotlight);
})();
