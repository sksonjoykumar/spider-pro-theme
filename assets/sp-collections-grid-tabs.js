(() => {
  'use strict';

  const TAG = 'sp-collections-grid-tabs';
  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  class SpiderCollectionsGridTabs extends HTMLElement {
    connectedCallback() {
      this.abort?.abort();
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.controllers = [];
      this.loadMoreControllers = new Map();
      this.debugEnabled = this.dataset.debug === 'true';

      this.mountTabNavigation();
      this.initTabs();
      this.initCarousels();
      this.initParallax();

      this.addEventListener('click', (event) => {
        const button = event.target.closest('[data-sp-collections-grid-tabs-load-more]');
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
      this.loadMoreControllers?.forEach((controller) => controller.abort());
      this.loadMoreControllers?.clear();
      this.controllers.forEach((controller) => controller?.destroy?.());
      this.controllers = [];
      this.parallaxObserver?.disconnect();
      if (this.parallaxHandler) window.removeEventListener('scroll', this.parallaxHandler);
      cancelAnimationFrame(this.parallaxRaf || 0);
    }

    debug(...args) {
      if (this.debugEnabled) console.debug('[Spider Collections Grid Tabs]', ...args);
    }

    mountTabNavigation() {
      this.nav = this.querySelector('[data-sp-collections-grid-tabs-nav]');
      if (!this.nav) return;
      const sourceTabs = [...this.querySelectorAll('[data-sp-collections-grid-tabs-tab]')]
        .filter((tab) => !this.nav.contains(tab));
      sourceTabs.forEach((tab) => this.nav.append(tab));
    }

    initTabs() {
      this.nav = this.querySelector('[data-sp-collections-grid-tabs-nav]');
      this.panelsRoot = this.querySelector('[data-sp-collections-grid-tabs-panels]');
      this.tabs = this.nav ? [...this.nav.querySelectorAll('[data-sp-collections-grid-tabs-tab]')] : [];
      this.panels = this.panelsRoot ? [...this.panelsRoot.querySelectorAll('[data-sp-collections-grid-tabs-panel]')] : [];
      if (!this.nav || !this.tabs.length) return;

      this.nav.addEventListener('click', (event) => {
        const tab = event.target.closest('[data-sp-collections-grid-tabs-tab]');
        if (tab && this.nav.contains(tab)) this.activateTab(tab, true);
      }, { signal: this.signal });
      this.nav.addEventListener('keydown', (event) => this.onTabKey(event), { signal: this.signal });

      const hash = this.dataset.enableTabHash === 'true' ? decodeURIComponent(window.location.hash.slice(1)) : '';
      const active = this.tabs.find((tab) => hash && (tab.dataset.tabId === hash || tab.id === hash))
        || this.tabs.find((tab) => tab.dataset.activeDefault === 'true')
        || this.tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')
        || this.tabs[0];
      this.activateTab(active, false);
    }

    activateTab(tab, userInitiated = false) {
      if (!tab || !this.tabs?.includes(tab)) return;
      const id = tab.dataset.tabId;
      this.tabs.forEach((item) => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
        item.classList.toggle('is-active', active);
      });

      let activePanel = null;
      this.panels.forEach((panel) => {
        const active = panel.dataset.tabId === id;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
        panel.classList.remove('is-entering');
        if (active) activePanel = panel;
      });

      if (activePanel) {
        if (!prefersReducedMotion() && this.dataset.tabAnimation !== 'none') {
          requestAnimationFrame(() => {
            if (!activePanel.isConnected || activePanel.hidden) return;
            activePanel.classList.add('is-entering');
            activePanel.addEventListener('animationend', () => activePanel.classList.remove('is-entering'), { once: true });
          });
        }
        requestAnimationFrame(() => {
          this.initCarousels(activePanel);
          activePanel.querySelectorAll('[data-collections-grid-tabs-mode="carousel"]').forEach((block) => block.__spGlobalCarousel?.measure?.());
          window.SpiderProductCommerce?.cards?.sync?.(activePanel);
        });
      }

      if (userInitiated && this.dataset.enableTabHash === 'true' && id) {
        const url = new URL(window.location.href);
        url.hash = encodeURIComponent(id);
        window.history.replaceState(null, '', url);
      }
      this.dispatchEvent(new CustomEvent('sp:collections-grid-tabs:change', { detail: { tabId: id, panel: activePanel } }));
    }

    onTabKey(event) {
      const tab = event.target.closest('[data-sp-collections-grid-tabs-tab]');
      if (!tab || !this.tabs.length) return;
      const index = this.tabs.indexOf(tab);
      const rtl = getComputedStyle(this.nav).direction === 'rtl';
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + (rtl ? -1 : 1) + this.tabs.length) % this.tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index + (rtl ? 1 : -1) + this.tabs.length) % this.tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = this.tabs.length - 1;
      if (nextIndex !== null) {
        event.preventDefault();
        this.tabs[nextIndex].focus();
        this.activateTab(this.tabs[nextIndex], true);
      }
    }

    initCarousels(scope = this) {
      scope.querySelectorAll('[data-collections-grid-tabs-mode="carousel"]').forEach((block) => {
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

      this.loadMoreControllers?.get(blockId)?.abort();
      const loadMoreController = new AbortController();
      this.loadMoreControllers?.set(blockId, loadMoreController);
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;

      const textNode = button.querySelector('[data-sp-collections-grid-tabs-load-more-text]');
      const originalLabel = textNode?.textContent || 'Load more';
      if (textNode) textNode.textContent = 'Loading…';

      try {
        const response = await fetch(this.buildLoadMoreRequestUrl(nextUrl, button.dataset.pageParam), {
          headers: { Accept: 'text/html,application/json' },
          signal: loadMoreController.signal
        });
        if (!response.ok) throw new Error(`Unable to load products (${response.status})`);

        const documentFragment = this.parseRenderedSection(await response.text());
        const escapedBlockId = window.CSS?.escape?.(blockId) || blockId;
        const incomingRoot = documentFragment.querySelector(`#SpiderCollectionsGridTabs-${this.dataset.sectionId}`)
          || documentFragment.querySelector(TAG)
          || documentFragment;
        const incomingBlock = incomingRoot.querySelector?.(`[data-sp-collections-grid-tabs-block="${escapedBlockId}"]`)
          || incomingRoot.querySelector?.('[data-sp-collections-grid-tabs-block]');
        const incomingItems = incomingBlock?.querySelector('[data-sp-collections-grid-tabs-items]');
        const currentBlock = button.closest('[data-sp-collections-grid-tabs-block]');
        const currentItems = currentBlock?.querySelector('[data-sp-collections-grid-tabs-items]');

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

        const nextButton = incomingBlock?.querySelector('[data-sp-collections-grid-tabs-load-more]');
        if (nextButton?.dataset.nextUrl && added > 0) button.dataset.nextUrl = nextButton.dataset.nextUrl;
        else button.remove();

        const loadedNode = currentBlock?.querySelector('[data-sp-collections-grid-tabs-loaded]');
        const totalNode = currentBlock?.querySelector('[data-sp-collections-grid-tabs-total]');
        const progressBar = currentBlock?.querySelector('[data-sp-collections-grid-tabs-progress-bar]');
        const count = currentItems.querySelectorAll('[data-product-id]').length;
        const total = Math.max(
          1,
          Number(incomingBlock?.querySelector('[data-sp-collections-grid-tabs-total]')?.textContent || totalNode?.textContent || count)
        );

        if (loadedNode) loadedNode.textContent = String(Math.min(count, total));
        if (progressBar) progressBar.style.width = `${Math.min(100, (count / total) * 100)}%`;

        const status = currentBlock?.querySelector('[data-sp-collections-grid-tabs-status]');
        if (status) status.textContent = added ? `${added} more products loaded.` : 'All available products are loaded.';
      } catch (error) {
        if (error.name !== 'AbortError') {
          this.debug(error);
          const status = button.closest('[data-sp-collections-grid-tabs-block]')?.querySelector('[data-sp-collections-grid-tabs-status]');
          if (status) status.textContent = 'Unable to load more products. Please try again.';
        }
      } finally {
        if (this.loadMoreControllers?.get(blockId) === loadMoreController) this.loadMoreControllers.delete(blockId);
        if (button.isConnected) {
          button.removeAttribute('aria-busy');
          button.disabled = false;
          if (textNode) textNode.textContent = originalLabel;
        }
      }
    }

    initParallax() {
      if (this.dataset.parallax !== 'true' || prefersReducedMotion()) return;
      const image = this.querySelector('.sp-collections-grid-tabs__background-image');
      if (!image) return;

      this.parallaxHandler = () => {
        if (this.parallaxVisible === false || this.parallaxRaf) return;
        this.parallaxRaf = requestAnimationFrame(() => {
          this.parallaxRaf = 0;
          const rect = this.getBoundingClientRect();
          const centerOffset = rect.top + rect.height / 2 - window.innerHeight / 2;
          this.style.setProperty(
            '--sp-collections-grid-tabs-parallax-y',
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
      const blockId = String(event.detail.blockId || '');
      if (!blockId) return;
      const escaped = window.CSS?.escape?.(blockId) || blockId;
      const panel = this.querySelector(`[data-sp-collections-grid-tabs-panel][data-tab-id="${escaped}"]`);
      const tab = this.nav?.querySelector(`[data-sp-collections-grid-tabs-tab][data-tab-id="${escaped}"]`);
      if (tab) this.activateTab(tab, false);
      const block = this.querySelector(`[data-sp-collections-grid-tabs-block="${escaped}"]`) || panel;
      requestAnimationFrame(() => {
        block?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        block?.querySelectorAll?.('[data-collections-grid-tabs-mode="carousel"]').forEach((carouselBlock) => {
          const controller = carouselBlock.__spGlobalCarousel;
          if (controller) { controller.userPaused = true; controller.pauseTimer?.(); controller.updatePause?.(); controller.measure?.(); }
        });
      });
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SpiderCollectionsGridTabs);
})();
