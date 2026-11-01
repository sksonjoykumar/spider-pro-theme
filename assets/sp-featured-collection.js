(() => {
  'use strict';

  const TAG = 'sp-featured-collection';
  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  class SpiderFeaturedCollection extends HTMLElement {
    connectedCallback() {
      this.abort?.abort();
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.controllers = [];
      this.loadMoreController = null;
      this.debugEnabled = this.dataset.debug === 'true';

      this.initCarousels();
      this.initParallax();

      this.addEventListener('click', (event) => {
        const button = event.target.closest('[data-sp-featured-load-more]');
        if (button && this.contains(button)) this.loadMore(button);
      }, { signal: this.signal });

      document.addEventListener('shopify:block:select', (event) => this.onBlockSelect(event), {
        signal: this.signal
      });

      window.SpiderProductCommerce?.cards?.sync?.(this);

      document.addEventListener('sp:product-commerce:ready', () => {
        window.SpiderProductCommerce?.cards?.sync?.(this);
      }, { signal: this.signal });

      document.addEventListener('sp:carousel:ready', () => {
        this.initCarousels(this);
      }, { signal: this.signal });
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.loadMoreController?.abort();
      this.controllers.forEach((controller) => controller?.destroy?.());
      this.controllers = [];
      this.parallaxObserver?.disconnect();
      if (this.parallaxHandler) window.removeEventListener('scroll', this.parallaxHandler);
      cancelAnimationFrame(this.parallaxRaf || 0);
    }

    debug(...args) {
      if (this.debugEnabled) console.debug('[Spider Featured Collection]', ...args);
    }

    initCarousels(scope = this) {
      scope.querySelectorAll('[data-featured-mode="carousel"]').forEach((block) => {
        const controller = window.SpiderCarousel?.mount?.(block);
        if (controller && !this.controllers.includes(controller)) this.controllers.push(controller);
      });
    }

    buildLoadMoreRequestUrl(nextUrl, pageParam = 'page') {
      const current = new URL(window.location.href);
      const next = new URL(nextUrl, window.location.href);
      const requestedParam = String(pageParam || 'page');
      const entries = next.searchParams.has(requestedParam)
        ? [[requestedParam, next.searchParams.get(requestedParam)]]
        : [...next.searchParams.entries()].filter(([key]) =>
            key === 'page' || key.startsWith('page_') || key.includes('paginate')
          );

      current.hash = '';
      current.searchParams.delete('section_id');
      [...current.searchParams.keys()].forEach((key) => {
        if (key === 'page' || key.startsWith('page_') || key.includes('paginate')) {
          current.searchParams.delete(key);
        }
      });
      entries.forEach(([key, value]) => current.searchParams.set(key, value));
      current.searchParams.set('section_id', this.dataset.sectionId);
      return current;
    }

    parseRenderedSection(text) {
      const raw = String(text || '').trim();
      let html = raw;

      if (raw.startsWith('{')) {
        try {
          const json = JSON.parse(raw);
          html = json[this.dataset.sectionId]
            || json.sections?.[this.dataset.sectionId]
            || Object.values(json).find((value) => typeof value === 'string')
            || raw;
        } catch (_) {}
      }

      return new DOMParser().parseFromString(html, 'text/html');
    }

    async loadMore(button) {
      const nextUrl = button.dataset.nextUrl;
      const blockId = button.dataset.blockId;
      if (!nextUrl || !blockId || button.getAttribute('aria-busy') === 'true') return;

      this.loadMoreController?.abort();
      this.loadMoreController = new AbortController();
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;

      const textNode = button.querySelector('[data-sp-featured-load-more-text]');
      const originalLabel = textNode?.textContent || 'Load more';
      if (textNode) textNode.textContent = 'Loading…';

      try {
        const response = await fetch(this.buildLoadMoreRequestUrl(nextUrl, button.dataset.pageParam), {
          headers: { Accept: 'text/html,application/json' },
          signal: this.loadMoreController.signal
        });
        if (!response.ok) throw new Error(`Unable to load products (${response.status})`);

        const documentFragment = this.parseRenderedSection(await response.text());
        const escapedBlockId = window.CSS?.escape?.(blockId) || blockId;
        const incomingRoot = documentFragment.querySelector(`#SpiderFeaturedCollection-${this.dataset.sectionId}`)
          || documentFragment.querySelector(TAG)
          || documentFragment;
        const incomingBlock = incomingRoot.querySelector?.(`[data-sp-featured-block="${escapedBlockId}"]`)
          || incomingRoot.querySelector?.('[data-sp-featured-block]');
        const incomingItems = incomingBlock?.querySelector('[data-sp-featured-items]');
        const currentBlock = button.closest('[data-sp-featured-block]');
        const currentItems = currentBlock?.querySelector('[data-sp-featured-items]');

        if (!incomingItems || !currentItems) throw new Error('Unable to read next product page');

        const existingIds = new Set(
          [...currentItems.querySelectorAll('[data-product-id]')].map((node) => String(node.dataset.productId || ''))
        );
        let added = 0;

        [...incomingItems.children].forEach((node) => {
          const id = String(node.dataset.productId || node.querySelector?.('[data-product-id]')?.dataset.productId || '');
          if (id && existingIds.has(id)) return;
          currentItems.append(document.importNode(node, true));
          if (id) existingIds.add(id);
          added += 1;
        });

        window.SpiderProductCommerce?.cards?.sync?.(currentItems);

        const nextButton = incomingBlock?.querySelector('[data-sp-featured-load-more]');
        if (nextButton?.dataset.nextUrl && added > 0) button.dataset.nextUrl = nextButton.dataset.nextUrl;
        else button.remove();

        const loadedNode = currentBlock?.querySelector('[data-sp-featured-loaded]');
        const totalNode = currentBlock?.querySelector('[data-sp-featured-total]');
        const progressBar = currentBlock?.querySelector('[data-sp-featured-progress-bar]');
        const count = currentItems.querySelectorAll('[data-product-id]').length;
        const total = Math.max(
          1,
          Number(incomingBlock?.querySelector('[data-sp-featured-total]')?.textContent || totalNode?.textContent || count)
        );

        if (loadedNode) loadedNode.textContent = String(Math.min(count, total));
        if (progressBar) progressBar.style.width = `${Math.min(100, (count / total) * 100)}%`;

        const status = currentBlock?.querySelector('[data-sp-featured-status]');
        if (status) status.textContent = added ? `${added} more products loaded.` : 'All available products are loaded.';
      } catch (error) {
        if (error.name !== 'AbortError') {
          this.debug(error);
          const status = button.closest('[data-sp-featured-block]')?.querySelector('[data-sp-featured-status]');
          if (status) status.textContent = 'Unable to load more products. Please try again.';
        }
      } finally {
        if (button.isConnected) {
          button.removeAttribute('aria-busy');
          button.disabled = false;
          if (textNode) textNode.textContent = originalLabel;
        }
      }
    }

    initParallax() {
      if (this.dataset.parallax !== 'true' || prefersReducedMotion()) return;
      const image = this.querySelector('.sp-featured-collection__background-image');
      if (!image) return;

      this.parallaxHandler = () => {
        if (this.parallaxVisible === false || this.parallaxRaf) return;
        this.parallaxRaf = requestAnimationFrame(() => {
          this.parallaxRaf = 0;
          const rect = this.getBoundingClientRect();
          const centerOffset = rect.top + rect.height / 2 - window.innerHeight / 2;
          this.style.setProperty(
            '--sp-featured-parallax-y',
            `${Math.max(-32, Math.min(32, centerOffset * -0.045))}px`
          );
        });
      };

      if ('IntersectionObserver' in window) {
        this.parallaxObserver = new IntersectionObserver((entries) => {
          this.parallaxVisible = Boolean(entries[0]?.isIntersecting);
          if (this.parallaxVisible) this.parallaxHandler();
        }, { rootMargin: '20% 0' });
        this.parallaxObserver.observe(this);
      } else {
        this.parallaxVisible = true;
      }

      window.addEventListener('scroll', this.parallaxHandler, { passive: true });
      this.parallaxHandler();
    }

    onBlockSelect(event) {
      if (event.detail?.sectionId !== this.dataset.sectionId) return;
      const blockId = event.detail.blockId || '';
      const block = this.querySelector(`[data-sp-featured-block="${window.CSS?.escape?.(blockId) || blockId}"]`);
      if (!block) return;

      block.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      const controller = block.__spGlobalCarousel;
      if (controller) {
        controller.userPaused = true;
        controller.pauseTimer?.();
        controller.updatePause?.();
      }
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SpiderFeaturedCollection);
})();
