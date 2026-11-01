(() => {
  'use strict';

  const TAG = 'sp-recently-viewed-products';
  const CORE_READY = 'sp:recently-viewed:ready';
  const COMMERCE_READY = 'sp:product-commerce:ready';
  const CAROUSEL_READY = 'sp:carousel:ready';
  const CORE_TIMEOUT = 12000;
  const FETCH_CONCURRENCY = 4;

  if (customElements.get(TAG)) return;

  const storefrontRoot = () => {
    const raw = String(window.Shopify?.routes?.root || '/').trim() || '/';
    const clean = raw.replace(/^\/+|\/+$/g, '');
    return clean ? `/${clean}/` : '/';
  };

  const productUrlForHandle = (handle) => {
    const safe = String(handle || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(safe)) return null;
    return new URL(`${storefrontRoot()}products/${encodeURIComponent(safe)}`, window.location.origin);
  };

  const loadScriptOnce = (src) => new Promise((resolve, reject) => {
    if (window.SpiderRecentlyViewed?.get) return resolve(window.SpiderRecentlyViewed);

    let timer = 0;
    const finish = (callback, value) => {
      window.clearTimeout(timer);
      document.removeEventListener(CORE_READY, onReady);
      callback(value);
    };
    const onReady = () => finish(resolve, window.SpiderRecentlyViewed);
    document.addEventListener(CORE_READY, onReady, { once: true });

    const target = new URL(src, document.baseURI).href;
    let script = [...document.scripts].find((node) => node.src === target);
    if (!script) {
      script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.spRecentlyViewedCoreLoader = '';
      document.head.append(script);
    }

    script.addEventListener('load', () => {
      if (window.SpiderRecentlyViewed?.get) finish(resolve, window.SpiderRecentlyViewed);
    }, { once: true });
    script.addEventListener('error', () => finish(reject, new Error('Unable to load Spider Recently Viewed core.')), { once: true });

    timer = window.setTimeout(() => finish(reject, new Error('Spider Recently Viewed core timed out.')), CORE_TIMEOUT);
  });

  class SpiderRecentlyViewedProducts extends HTMLElement {
    constructor() {
      super();
      this.abortController = new AbortController();
      this.renderController = null;
      this.carousel = null;
      this.core = null;
      this.coreUnsubscribe = null;
      this.commerceReadyHandler = null;
      this.carouselReadyHandler = null;
      this.renderToken = 0;
    }

    connectedCallback() {
      if (this.dataset.spRvConnected === 'true') return;
      if (this.abortController.signal.aborted) this.abortController = new AbortController();
      this.dataset.spRvConnected = 'true';
      this.bindLocalControls();
      this.boot();
    }

    disconnectedCallback() {
      this.abortController.abort();
      this.renderController?.abort();
      this.renderController = null;
      this.coreUnsubscribe?.();
      this.coreUnsubscribe = null;
      this.unmountCarousel();
      if (this.commerceReadyHandler) document.removeEventListener(COMMERCE_READY, this.commerceReadyHandler);
      if (this.carouselReadyHandler) document.removeEventListener(CAROUSEL_READY, this.carouselReadyHandler);
      this.commerceReadyHandler = null;
      this.carouselReadyHandler = null;
      delete this.dataset.spRvConnected;
    }

    get designMode() {
      return this.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode);
    }

    get options() {
      return {
        max: Math.max(5, Math.min(50, Number(this.dataset.historyMax) || 20)),
        expirationDays: Math.max(5, Math.min(365, Number(this.dataset.expirationDays) || 30))
      };
    }

    get currentProductId() {
      return String(this.dataset.currentProductId || '').trim();
    }

    get currentProductHandle() {
      return String(this.dataset.currentProductHandle || '').trim();
    }

    get productsToShow() {
      return Math.max(2, Math.min(12, Number(this.dataset.productsToShow) || 8));
    }

    get minimumProducts() {
      return Math.max(1, Math.min(6, Number(this.dataset.minProducts) || 1));
    }

    bindLocalControls() {
      const clearButton = this.querySelector('[data-sp-rv-clear]');
      clearButton?.addEventListener('click', () => {
        if (!this.core) return;
        const accepted = window.confirm('Clear your recently viewed products?');
        if (!accepted) return;
        this.core.clear();
      }, { signal: this.abortController.signal });
    }

    async boot() {
      try {
        this.core = window.SpiderRecentlyViewed?.get
          ? window.SpiderRecentlyViewed
          : await loadScriptOnce(this.dataset.coreUrl || '');

        this.trackCurrentProductAsFallback();
        this.core.prune?.(this.options);
        this.coreUnsubscribe = this.core.subscribe?.(() => this.render()) || null;
        await this.render();
      } catch (_) {
        this.fail('Recently viewed products could not be initialized.');
      }
    }

    trackCurrentProductAsFallback() {
      // Theme Editor is a valid preview environment for Recently Viewed.
      // Do not skip tracking merely because Shopify.designMode is true.
      if (!this.currentProductHandle || !this.core?.add) return;
      if (window.__SPIDER_RECENT_PRODUCT_TRACKED__ === this.currentProductHandle) return;
      window.__SPIDER_RECENT_PRODUCT_TRACKED__ = this.currentProductHandle;
      this.core.add({
        id: this.currentProductId,
        handle: this.currentProductHandle,
        variantId: String(this.dataset.currentVariantId || ''),
        viewedAt: Date.now()
      }, this.options);
    }

    history() {
      const items = this.core?.get?.(this.options) || [];
      const seen = new Set();
      return items.filter((item) => {
        const id = String(item?.id || '');
        const handle = String(item?.handle || '');
        if (!handle) return false;
        if ((this.currentProductId && id === this.currentProductId) || (this.currentProductHandle && handle === this.currentProductHandle)) return false;
        const key = id ? `id:${id}` : `handle:${handle}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    async render() {
      const token = ++this.renderToken;
      this.renderController?.abort();
      this.renderController = new AbortController();
      const renderSignal = this.renderController.signal;
      this.unmountCarousel();
      this.setAttribute('aria-busy', 'true');
      this.dataset.state = 'loading';
      this.querySelector('[data-sp-rv-products]')?.replaceChildren();

      const history = this.history();
      if (!history.length) {
        this.finishEmpty('No recently viewed products yet.');
        return;
      }

      const wanted = history.slice(0, Math.max(this.productsToShow, this.minimumProducts));
      const cards = await this.fetchCards(wanted, token, renderSignal);
      if (token !== this.renderToken || !this.isConnected) return;

      const validCards = cards.filter(Boolean).filter((card) => {
        if (this.dataset.hideSoldOut !== 'true') return true;
        return card.dataset.productAvailable !== 'false';
      }).slice(0, this.productsToShow);

      if (validCards.length < this.minimumProducts) {
        this.finishEmpty(`Recently viewed requires at least ${this.minimumProducts} product${this.minimumProducts === 1 ? '' : 's'}.`);
        return;
      }

      const host = this.querySelector('[data-sp-rv-products]');
      if (!host) {
        this.fail('Recently viewed product container is unavailable.');
        return;
      }

      const fragment = document.createDocumentFragment();
      validCards.forEach((card) => fragment.append(card));
      host.append(fragment);

      this.dataset.state = 'ready';
      this.hidden = false;
      this.setAttribute('aria-busy', 'false');
      this.querySelector('[data-sp-rv-editor-state]')?.setAttribute('hidden', '');
      const footer = this.querySelector('[data-sp-rv-footer]');
      if (footer) footer.hidden = false;
      this.status(`${validCards.length} recently viewed product${validCards.length === 1 ? '' : 's'} loaded.`);
      this.syncCommerce();
      this.mountCarousel();
    }

    async fetchCards(items, token, signal) {
      const results = new Array(items.length).fill(null);
      let cursor = 0;
      const worker = async () => {
        while (cursor < items.length) {
          const index = cursor++;
          if (token !== this.renderToken || signal.aborted) return;
          const item = items[index];
          try {
            results[index] = await this.fetchCard(item, signal);
          } catch (error) {
            if (error?.name === 'AbortError') return;
            results[index] = null;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, () => worker()));
      return results;
    }

    async fetchCard(item, signal) {
      const url = productUrlForHandle(item.handle);
      if (!url) throw new Error('Invalid product handle.');
      url.searchParams.set('section_id', String(this.dataset.rendererSection || 'sp-rv-card-global'));
      if (item.variantId) url.searchParams.set('variant', String(item.variantId));

      const response = await fetch(url.toString(), {
        signal,
        headers: { Accept: 'text/html' },
        credentials: 'same-origin'
      });
      if (!response.ok) {
        const error = new Error(`Recently viewed product request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }

      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const card = parsed.querySelector('[data-sp-product-card]');
      if (!card) throw new Error('Recently viewed renderer returned no product card.');
      return document.importNode(card, true);
    }

    syncCommerce() {
      const sync = () => window.SpiderProductCommerce?.cards?.sync?.(this);
      if (window.SpiderProductCommerce?.cards?.sync) {
        sync();
        return;
      }
      if (this.commerceReadyHandler) return;
      this.commerceReadyHandler = () => {
        this.commerceReadyHandler = null;
        sync();
      };
      document.addEventListener(COMMERCE_READY, this.commerceReadyHandler, { once: true });
    }

    mountCarousel() {
      const carouselRoot = this.querySelector('[data-sp-rv-carousel]');
      if (!carouselRoot) return;
      const mount = () => {
        if (!window.SpiderCarousel?.mount || !this.isConnected) return;
        this.carousel = window.SpiderCarousel.mount(carouselRoot);
      };
      if (window.SpiderCarousel?.mount) {
        mount();
        return;
      }
      if (this.carouselReadyHandler) return;
      this.carouselReadyHandler = () => {
        this.carouselReadyHandler = null;
        mount();
      };
      document.addEventListener(CAROUSEL_READY, this.carouselReadyHandler, { once: true });
    }

    unmountCarousel() {
      const carouselRoot = this.querySelector('[data-sp-rv-carousel]');
      if (carouselRoot && window.SpiderCarousel?.unmount) window.SpiderCarousel.unmount(carouselRoot);
      this.carousel = null;
    }

    finishEmpty(message) {
      this.dataset.state = 'empty';
      this.setAttribute('aria-busy', 'false');
      this.querySelector('[data-sp-rv-products]')?.replaceChildren();
      const footer = this.querySelector('[data-sp-rv-footer]');
      if (footer) footer.hidden = true;
      const editor = this.querySelector('[data-sp-rv-editor-state]');
      if (this.designMode) {
        this.hidden = false;
        if (editor) {
          editor.hidden = false;
          editor.textContent = message || 'Browse products to populate Recently Viewed Products.';
        }
      } else {
        this.hidden = true;
      }
      this.status(message || 'No recently viewed products.');
    }

    fail(message) {
      this.dataset.state = 'error';
      this.setAttribute('aria-busy', 'false');
      if (!this.designMode) {
        this.hidden = true;
      } else {
        this.hidden = false;
        const editor = this.querySelector('[data-sp-rv-editor-state]');
        if (editor) {
          editor.hidden = false;
          editor.textContent = message;
        }
      }
      this.status(message);
    }

    status(message) {
      const node = this.querySelector('[data-sp-rv-status]');
      if (node) node.textContent = String(message || '');
    }
  }

  customElements.define(TAG, SpiderRecentlyViewedProducts);
})();
