(() => {
  'use strict';

  const TAG = 'sp-product-carousel';

  class SpiderProductCarousel extends HTMLElement {
    connectedCallback() {
      this.abort?.abort();
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.carouselRoot = this.querySelector('[data-sp-product-carousel-root]');

      this.mount = this.mount.bind(this);
      this.syncCommerce = this.syncCommerce.bind(this);

      this.mount();
      this.syncCommerce();

      document.addEventListener('sp:carousel:ready', this.mount, { signal: this.signal });
      document.addEventListener('sp:product-system:ready', this.mount, { signal: this.signal });
      document.addEventListener('sp:product-commerce:ready', this.syncCommerce, { signal: this.signal });
    }

    disconnectedCallback() {
      this.abort?.abort();
      if (this.carouselRoot) window.SpiderCarousel?.unmount?.(this.carouselRoot);
      this.carouselRoot = null;
    }

    mount() {
      if (!this.carouselRoot || !this.isConnected) return;
      const controller = window.SpiderCarousel?.mount?.(this.carouselRoot);
      if (controller) this.controller = controller;
    }

    syncCommerce() {
      if (!this.isConnected) return;
      window.SpiderProductCommerce?.cards?.sync?.(this);
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SpiderProductCarousel);
})();
