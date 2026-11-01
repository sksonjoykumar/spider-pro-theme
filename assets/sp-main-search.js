(() => {
  if (window.__spiderMainSearchBooted) return;
  window.__spiderMainSearchBooted = true;
  'use strict';

  if (window.__SPIDER_MAIN_SEARCH_V1__) return;
  window.__SPIDER_MAIN_SEARCH_V1__ = true;

  class SpiderMainSearch {
    constructor(root) {
      this.root = root;
      this.sectionId = root.dataset.sectionId || '';
      this.ajax = root.dataset.searchAjax === 'true';
      this.controller = null;
      this.loadingMore = false;
      this.lastFilterTrigger = null;
      this.root.classList.add('is-search-ready');
      this.updateFilterTrigger();
      this.boundClick = this.onClick.bind(this);
      this.boundSubmit = this.onSubmit.bind(this);
      this.boundChange = this.onChange.bind(this);
      this.boundKeydown = this.onKeydown.bind(this);
      root.addEventListener('click', this.boundClick);
      root.addEventListener('submit', this.boundSubmit);
      root.addEventListener('change', this.boundChange);
      root.addEventListener('keydown', this.boundKeydown);
    }

    destroy() {
      this.controller?.abort();
      this.root.removeEventListener('click', this.boundClick);
      this.root.removeEventListener('submit', this.boundSubmit);
      this.root.removeEventListener('change', this.boundChange);
      this.root.removeEventListener('keydown', this.boundKeydown);
      this.closeFilters({ restoreFocus: false });
      this.root.classList.remove('is-search-ready');
    }

    onClick(event) {
      const clear = event.target.closest('[data-search-clear]');
      if (clear && this.root.contains(clear)) {
        const field = clear.closest('[data-search-form]')?.querySelector('input[name="q"]');
        if (field) { field.value = ''; field.focus(); field.dispatchEvent(new Event('input', { bubbles: true })); }
        return;
      }

      const open = event.target.closest('[data-search-filter-open]');
      if (open && this.root.contains(open)) {
        event.preventDefault();
        if (this.isDrawerMode()) {
          this.openFilters(open);
        } else {
          this.root.classList.toggle('is-filters-collapsed');
          this.updateFilterTrigger();
        }
        return;
      }

      const close = event.target.closest('[data-search-filter-close], [data-search-filter-overlay]');
      if (close && this.root.contains(close)) {
        event.preventDefault();
        this.closeFilters();
        return;
      }

      const loadMore = event.target.closest('[data-search-load-more]');
      if (loadMore && this.root.contains(loadMore)) {
        if (!this.ajax) return;
        event.preventDefault();
        this.loadMore(loadMore);
        return;
      }

      const filterLink = event.target.closest('[data-search-filter-link]');
      if (filterLink && this.root.contains(filterLink) && this.ajax) {
        event.preventDefault();
        this.navigate(filterLink.href, { push: true, focusResults: true });
      }
    }

    onSubmit(event) {
      const form = event.target.closest('[data-search-facets-form], [data-search-sort-form]');
      if (!form || !this.root.contains(form) || !this.ajax) return;
      event.preventDefault();
      const url = this.urlFromForm(form);
      this.navigate(url, { push: true, focusResults: true });
    }

    onChange(event) {
      const sort = event.target.closest('[data-search-sort]');
      if (!sort || !this.root.contains(sort)) return;
      sort.form?.requestSubmit();
    }

    onKeydown(event) {
      if (event.key === 'Escape' && this.root.classList.contains('is-filter-open')) {
        event.preventDefault();
        this.closeFilters();
        return;
      }

      if (event.key !== 'Tab' || !this.root.classList.contains('is-filter-open')) return;
      const panel = this.root.querySelector('[data-search-filters-panel]');
      if (!panel) return;
      const focusable = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.hidden && node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    isDrawerMode() {
      return window.matchMedia('(max-width: 989px)').matches || this.root.classList.contains('sp-main-search--filters-drawer');
    }

    updateFilterTrigger() {
      const trigger = this.root.querySelector('[data-search-filter-open]');
      if (!trigger) return;
      const isExpanded = this.isDrawerMode()
        ? this.root.classList.contains('is-filter-open')
        : !this.root.classList.contains('is-filters-collapsed');
      trigger.setAttribute('aria-expanded', String(isExpanded));
      trigger.setAttribute('aria-label', isExpanded && !this.isDrawerMode() ? 'Hide filters' : 'Show filters');
    }

    openFilters(trigger) {
      const panel = this.root.querySelector('[data-search-filters-panel]');
      const overlay = this.root.querySelector('[data-search-filter-overlay]');
      if (!panel) return;
      this.lastFilterTrigger = trigger || null;
      this.root.classList.add('is-filter-open');
      this.updateFilterTrigger();
      if (overlay) overlay.hidden = false;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      document.documentElement.classList.add('sp-scroll-lock');
      requestAnimationFrame(() => panel.querySelector('[data-search-filter-close], input, button, a[href]')?.focus());
    }

    closeFilters({ restoreFocus = true } = {}) {
      const panel = this.root.querySelector('[data-search-filters-panel]');
      const overlay = this.root.querySelector('[data-search-filter-overlay]');
      this.root.classList.remove('is-filter-open');
      this.updateFilterTrigger();
      if (overlay) overlay.hidden = true;
      panel?.removeAttribute('role');
      panel?.removeAttribute('aria-modal');
      document.documentElement.classList.remove('sp-scroll-lock');
      if (restoreFocus) this.lastFilterTrigger?.focus?.();
    }

    urlFromForm(form) {
      const url = new URL(form.action || location.href, location.origin);
      url.search = '';
      new FormData(form).forEach((value, key) => {
        if (String(value).trim() !== '') url.searchParams.append(key, value);
      });
      return url.toString();
    }

    sectionUrl(url) {
      const requestUrl = new URL(url, location.origin);
      requestUrl.searchParams.set('section_id', this.sectionId);
      return requestUrl;
    }

    cleanUrl(url) {
      const clean = new URL(url, location.origin);
      clean.searchParams.delete('section_id');
      return clean.pathname + (clean.searchParams.toString() ? `?${clean.searchParams.toString()}` : '');
    }

    async navigate(url, { push = true, focusResults = false } = {}) {
      if (!this.sectionId) {
        location.href = url;
        return;
      }
      this.controller?.abort();
      this.controller = new AbortController();
      this.root.classList.add('is-loading');
      this.root.setAttribute('aria-busy', 'true');
      try {
        const requestUrl = this.sectionUrl(url);
        const response = await fetch(requestUrl, { signal: this.controller.signal, headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error('Search update failed');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const nextRoot = doc.querySelector('[data-search-section]');
        if (!nextRoot) throw new Error('Search section missing from response');
        const historyUrl = this.cleanUrl(requestUrl);
        this.destroy();
        this.root.replaceWith(nextRoot);
        init(nextRoot.parentElement || document);
        syncProductCards(nextRoot);
        if (push) history.pushState({ spiderSearch: true }, '', historyUrl);
        if (focusResults) requestAnimationFrame(() => nextRoot.querySelector('[data-search-results]')?.focus({ preventScroll: false }));
        window.Spider?.announce?.(nextRoot.querySelector('[data-search-summary]')?.textContent?.trim() || 'Search results updated.');
      } catch (error) {
        if (error?.name !== 'AbortError') location.href = this.cleanUrl(url);
      }
    }

    async loadMore(link) {
      if (this.loadingMore || !this.sectionId) return;
      this.loadingMore = true;
      link.setAttribute('aria-busy', 'true');
      link.classList.add('is-loading');
      try {
        const requestUrl = this.sectionUrl(link.href);
        const response = await fetch(requestUrl, { headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error('Load more failed');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const nextRoot = doc.querySelector('[data-search-section]');
        const nextList = nextRoot?.querySelector('[data-search-results-list]');
        const currentList = this.root.querySelector('[data-search-results-list]');
        if (!nextList || !currentList) throw new Error('Search results missing from response');

        const fragment = document.createDocumentFragment();
        [...nextList.children].forEach((item) => {
          item.classList.add('is-newly-loaded');
          fragment.append(item);
        });
        currentList.append(fragment);

        const currentPagination = this.root.querySelector('[data-search-pagination]');
        const nextPagination = nextRoot.querySelector('[data-search-pagination]');
        if (nextPagination && currentPagination) currentPagination.replaceWith(nextPagination);
        else currentPagination?.remove();

        const clean = this.cleanUrl(requestUrl);
        history.replaceState({ spiderSearch: true }, '', clean);
        syncProductCards(currentList);
        window.Spider?.announce?.(this.root.querySelector('[data-search-summary]')?.textContent?.trim() || 'Search results updated.');
      } catch (_) {
        location.href = link.href;
      } finally {
        this.loadingMore = false;
        link.removeAttribute('aria-busy');
        link.classList.remove('is-loading');
      }
    }
  }

  function syncProductCards(root) {
    if (window.SpiderProductCommerce?.cards?.sync) {
      window.SpiderProductCommerce.cards.sync(root);
      return;
    }
    document.addEventListener('sp:product-system:ready', () => window.SpiderProductCommerce?.cards?.sync?.(root), { once: true });
  }

  function init(scope = document) {
    const roots = scope.matches?.('[data-search-section]') ? [scope] : [...(scope.querySelectorAll?.('[data-search-section]') || [])];
    roots.forEach((root) => {
      if (!root.__spiderMainSearch) root.__spiderMainSearch = new SpiderMainSearch(root);
      syncProductCards(root);
    });
  }

  function destroy(scope) {
    const roots = scope.matches?.('[data-search-section]') ? [scope] : [...(scope.querySelectorAll?.('[data-search-section]') || [])];
    roots.forEach((root) => {
      root.__spiderMainSearch?.destroy();
      delete root.__spiderMainSearch;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));
  window.addEventListener('popstate', () => location.reload());
})();
