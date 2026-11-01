(() => {
  'use strict';

  const TAG = 'sp-product-recommendations';
  if (customElements.get(TAG)) return;

  const INTERACTIVE_SELECTOR = [
    'button',
    'input',
    'select',
    'textarea',
    'label',
    'form',
    '[contenteditable="true"]',
    '[role="button"]',
    '[data-sp-product-quick-view]',
    '[data-sp-product-quick-add]',
    '[data-sp-product-wishlist]',
    '[data-sp-product-compare]',
    '[data-sp-product-card-option]',
    '[data-sp-commerce-option]',
    '[data-sp-commerce-close]',
    '[data-sp-carousel-prev]',
    '[data-sp-carousel-next]',
    '[data-sp-carousel-pagination]',
    '[data-sp-carousel-pause]'
  ].join(',');

  class SpiderProductRecommendations extends HTMLElement {
    constructor() {
      super();
      this.abortController = null;
      this.carousel = null;
      this.commerceReadyHandler = null;
      this.carouselReadyHandler = null;
      this.eventsAbort = null;
      this.pointer = null;
      this.lastPointerCard = null;
      this.lastPointerUpAt = 0;
      this.lastDragAt = 0;
    }

    connectedCallback() {
      if (this.dataset.spRecommendationsConnected === 'true') return;
      this.dataset.spRecommendationsConnected = 'true';
      this.bindCardNavigation();

      if (this.dataset.performed === 'true') {
        this.activate();
        return;
      }

      this.load();
    }

    disconnectedCallback() {
      this.abortController?.abort();
      this.abortController = null;
      this.eventsAbort?.abort();
      this.eventsAbort = null;
      this.pointer = null;
      this.unmountCarousel();
      if (this.commerceReadyHandler) document.removeEventListener('sp:product-commerce:ready', this.commerceReadyHandler);
      if (this.carouselReadyHandler) document.removeEventListener('sp:carousel:ready', this.carouselReadyHandler);
      this.commerceReadyHandler = null;
      this.carouselReadyHandler = null;
      delete this.dataset.spRecommendationsConnected;
    }

    get designMode() {
      return this.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode);
    }

    bindCardNavigation() {
      this.eventsAbort?.abort();
      this.eventsAbort = new AbortController();
      const { signal } = this.eventsAbort;

      // Track real pointer movement before the global carousel sees the event.
      // This lets normal card clicks navigate while genuine horizontal drags stay drags.
      this.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch' || event.button !== 0) return;
        const card = event.target.closest?.('[data-sp-product-card]');
        if (!card || !this.contains(card)) return;
        this.pointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
          card
        };
        this.lastPointerCard = card;
      }, { capture: true, signal });

      window.addEventListener('pointermove', (event) => {
        if (!this.pointer || event.pointerId !== this.pointer.id) return;
        const dx = event.clientX - this.pointer.x;
        const dy = event.clientY - this.pointer.y;
        if (Math.hypot(dx, dy) > 7) this.pointer.moved = true;
      }, { capture: true, passive: true, signal });

      const finishPointer = (event) => {
        if (!this.pointer || (event.pointerId != null && event.pointerId !== this.pointer.id)) return;
        const now = Date.now();
        this.lastPointerCard = this.pointer.card || this.lastPointerCard;
        this.lastPointerUpAt = now;
        if (this.pointer.moved) this.lastDragAt = now;
        this.pointer = null;
      };
      window.addEventListener('pointerup', finishPointer, { capture: true, signal });
      window.addEventListener('pointercancel', finishPointer, { capture: true, signal });

      // Capture before SpiderCarousel's viewport click handler. This is intentionally
      // scoped to recommendations only and gives the canonical product card a robust
      // navigation fallback even if an older carousel build is still installed.
      this.addEventListener('click', (event) => this.onCardNavigationClick(event), {
        capture: true,
        signal
      });
    }

    onCardNavigationClick(event) {
      if (event.button !== 0) return;
      if (Date.now() - this.lastDragAt < 350) return;

      let card = event.target.closest?.('[data-sp-product-card]');
      // Older SpiderCarousel builds capture the pointer on pointerdown. In Chromium this can
      // retarget the eventual click to the carousel viewport instead of the <a>. Recover the
      // actual card from our pointerdown record so product navigation is still deterministic.
      if ((!card || !this.contains(card)) && Date.now() - this.lastPointerUpAt < 450) {
        card = this.lastPointerCard?.isConnected ? this.lastPointerCard : null;
      }
      if (!card || !this.contains(card)) return;
      if (event.target.closest?.(INTERACTIVE_SELECTOR)) return;

      const clickedLink = event.target.closest?.('a[href]');
      const rawHref = clickedLink?.getAttribute('href') || card.dataset.productUrl || card.dataset.productBaseUrl || '';
      if (!rawHref || rawHref === '#') return;

      let url;
      try {
        url = new URL(rawHref, window.location.href);
        if (!['http:', 'https:'].includes(url.protocol)) return;
      } catch (_) {
        return;
      }

      // Product cards are storefront navigation. Keep links on the same origin.
      if (url.origin !== window.location.origin) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const newContext = event.metaKey || event.ctrlKey || event.shiftKey || clickedLink?.target === '_blank';
      if (newContext) {
        const opened = window.open(url.href, '_blank', 'noopener');
        if (opened) opened.opener = null;
        return;
      }

      window.location.assign(url.href);
    }

    buildUrl() {
      const base = String(this.dataset.recommendationsUrl || '').trim();
      const productId = String(this.dataset.productId || '').trim();
      const sectionId = String(this.dataset.sectionId || '').trim();
      if (!base || !productId || !sectionId) return null;

      const url = new URL(base, window.location.origin);
      url.searchParams.set('section_id', sectionId);
      url.searchParams.set('product_id', productId);
      url.searchParams.set('limit', String(Math.max(1, Math.min(10, Number(this.dataset.limit) || 4))));
      url.searchParams.set('intent', this.dataset.intent === 'complementary' ? 'complementary' : 'related');
      return url;
    }

    async load() {
      const url = this.buildUrl();
      if (!url) {
        this.finishWithoutResults('Product recommendations require a current product.');
        return;
      }

      this.abortController?.abort();
      this.abortController = new AbortController();
      this.setAttribute('aria-busy', 'true');
      this.dataset.state = 'loading';

      try {
        const response = await fetch(url.toString(), {
          signal: this.abortController.signal,
          headers: { Accept: 'text/html' }
        });
        if (!response.ok) throw new Error(`Recommendations request failed (${response.status}).`);

        const text = await response.text();
        if (this.abortController.signal.aborted) return;

        const documentFragment = new DOMParser().parseFromString(text, 'text/html');
        const incoming = documentFragment.querySelector('[data-sp-product-recommendations]');
        if (!incoming) throw new Error('Recommendations response did not contain the Spider section root.');

        this.replaceFrom(incoming);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        this.finishWithoutResults('Product recommendations could not be loaded.');
      }
    }

    replaceFrom(incoming) {
      this.unmountCarousel();

      const hasResults = incoming.dataset.hasResults === 'true';
      this.innerHTML = incoming.innerHTML;
      this.dataset.performed = 'true';
      this.dataset.hasResults = String(hasResults);
      this.dataset.state = hasResults ? 'ready' : 'empty';
      this.setAttribute('aria-busy', 'false');

      if (hasResults || this.designMode) {
        this.hidden = false;
        this.activate();
      } else {
        this.hidden = true;
      }
    }

    finishWithoutResults(message) {
      this.dataset.state = 'error';
      this.dataset.hasResults = 'false';
      this.setAttribute('aria-busy', 'false');

      if (!this.designMode) {
        this.hidden = true;
        return;
      }

      this.hidden = false;
      const status = this.querySelector('[data-sp-recommendations-editor-state]');
      if (status) status.textContent = message;
    }

    activate() {
      if (this.dataset.hasResults !== 'true') {
        if (!this.designMode) this.hidden = true;
        this.setAttribute('aria-busy', 'false');
        return;
      }

      this.hidden = false;
      this.setAttribute('aria-busy', 'false');
      this.syncCommerce();
      this.mountCarousel();
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
      document.addEventListener('sp:product-commerce:ready', this.commerceReadyHandler, { once: true });
    }

    mountCarousel() {
      const carouselRoot = this.querySelector('[data-sp-recommendations-carousel]');
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
      document.addEventListener('sp:carousel:ready', this.carouselReadyHandler, { once: true });
    }

    unmountCarousel() {
      const carouselRoot = this.querySelector('[data-sp-recommendations-carousel]');
      if (carouselRoot && window.SpiderCarousel?.unmount) window.SpiderCarousel.unmount(carouselRoot);
      this.carousel = null;
    }
  }

  customElements.define(TAG, SpiderProductRecommendations);
})();
