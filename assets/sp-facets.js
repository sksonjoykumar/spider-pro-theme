(() => {
  'use strict';

  const ROOT = '[data-sp-main-collection]';
  const state = {
    request: null,
    infiniteObservers: new WeakMap(),
    gridStorageKey: 'sp:collection:grid-columns:v1',
    viewStorageKey: 'sp:collection:view:v1'
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const rootOf = (node) => node?.closest?.(ROOT) || null;

  const cleanUrl = (urlLike) => {
    const url = new URL(urlLike, location.href);
    url.searchParams.delete('section_id');
    return `${url.pathname}${url.search}${url.hash}`;
  };

  const ajaxEnabled = (root) => root?.dataset.ajaxEnabled === 'true';

  const announce = (message) => {
    const live = document.getElementById('SpiderLiveRegion');
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = message; });
  };

  const syncProductSystem = (root) => {
    try { window.SpiderProductCommerce?.cards?.sync?.(root || document); } catch (_) {}
  };

  const captureOpenFilters = (root) => new Set(
    qsa('details[data-sp-filter-group][open]', root).map((node) => node.dataset.spFilterGroup).filter(Boolean)
  );

  const restoreOpenFilters = (root, openFilters) => {
    if (!openFilters?.size) return;
    qsa('details[data-sp-filter-group]', root).forEach((node) => {
      if (openFilters.has(node.dataset.spFilterGroup)) node.open = true;
    });
  };

  const setLoading = (root, loading) => {
    root?.classList.toggle('is-loading', loading);
    const results = qs('[data-sp-collection-results]', root);
    results?.setAttribute('aria-busy', String(Boolean(loading)));
  };

  const formUrl = (form) => {
    const url = new URL(form.action || location.href, location.href);
    url.search = '';
    for (const [key, value] of new FormData(form).entries()) {
      if (String(value).trim() !== '') url.searchParams.append(key, value);
    }
    return url;
  };

  const replaceCollection = async (root, targetUrl, { push = true, focusResults = false } = {}) => {
    if (!root) return false;
    if (!ajaxEnabled(root)) {
      location.href = cleanUrl(targetUrl);
      return false;
    }

    state.request?.abort();
    const controller = new AbortController();
    state.request = controller;
    const sectionId = root.dataset.sectionId;
    const requestUrl = new URL(targetUrl, location.href);
    requestUrl.searchParams.set('section_id', sectionId);
    const openFilters = captureOpenFilters(root);

    setLoading(root, true);
    try {
      const response = await fetch(requestUrl, {
        signal: controller.signal,
        headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!response.ok) throw new Error(`Collection request failed: ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextRoot = qs(ROOT, doc);
      if (!nextRoot) throw new Error('Collection section was not returned.');

      const openDrawer = qs('dialog.sp-drawer[open]', root);
      if (openDrawer) {
        try { window.Spider?.closeDrawer?.(openDrawer, false); } catch (_) { try { openDrawer.close(); } catch (_) {} }
      }
      nextRoot.classList.toggle('is-sidebar-hidden', root.classList.contains('is-sidebar-hidden'));
      root.replaceWith(nextRoot);
      restoreOpenFilters(nextRoot, openFilters);
      restoreGridPreference(nextRoot);
      const filterTrigger = qs('[data-sp-sidebar-toggle]', nextRoot);
      if (filterTrigger) filterTrigger.setAttribute('aria-expanded', String(!nextRoot.classList.contains('is-sidebar-hidden')));
      syncProductSystem(nextRoot);
      initInfinite(nextRoot);

      const historyUrl = cleanUrl(targetUrl);
      if (push) history.pushState({ spiderCollection: true }, '', historyUrl);

      const count = qs('[data-sp-toolbar-count]', nextRoot)?.textContent?.trim();
      if (count) announce(`${count} loaded.`);
      if (focusResults) requestAnimationFrame(() => qs('[data-sp-collection-results]', nextRoot)?.focus({ preventScroll: true }));
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      console.warn('[Spider Collection] Ajax update failed; using normal navigation.', error);
      location.href = cleanUrl(targetUrl);
      return false;
    } finally {
      if (state.request === controller) state.request = null;
    }
  };

  const loadMore = async (link) => {
    const root = rootOf(link);
    const grid = qs('[data-sp-product-grid]', root);
    if (!root || !grid || link.dataset.loading === 'true') return;
    if (!ajaxEnabled(root)) {
      location.href = link.href;
      return;
    }

    link.dataset.loading = 'true';
    link.setAttribute('aria-busy', 'true');
    const status = qs('[data-sp-load-more-status]', root);
    if (status) status.textContent = 'Loading more products…';

    const controller = new AbortController();
    const requestUrl = new URL(link.href, location.href);
    requestUrl.searchParams.set('section_id', root.dataset.sectionId);

    try {
      const response = await fetch(requestUrl, { signal: controller.signal, headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`Load more failed: ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const incomingRoot = qs(ROOT, doc);
      const incomingGrid = qs('[data-sp-product-grid]', incomingRoot || doc);
      if (!incomingGrid) throw new Error('No product grid returned.');

      const existingIds = new Set(qsa('[data-sp-collection-product]', grid).map((item) => item.dataset.productId));
      const fragment = document.createDocumentFragment();
      let appended = 0;
      qsa('[data-sp-collection-product]', incomingGrid).forEach((item) => {
        const id = item.dataset.productId;
        if (id && existingIds.has(id)) return;
        if (id) existingIds.add(id);
        fragment.append(item);
        appended += 1;
      });
      grid.append(fragment);

      const currentPagination = qs('[data-sp-collection-pagination]', root);
      const nextPagination = qs('[data-sp-collection-pagination]', incomingRoot || doc);
      if (currentPagination && nextPagination) currentPagination.replaceWith(nextPagination);
      else currentPagination?.remove();

      syncProductSystem(grid);
      initInfinite(root);
      if (status) status.textContent = `${appended} products loaded.`;
      announce(`${appended} more products loaded.`);

      if (root.dataset.paginationType !== 'infinite') {
        const clean = cleanUrl(link.href);
        history.replaceState({ spiderCollection: true }, '', clean);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        if (status) status.textContent = 'Unable to load more products. Try again.';
        link.dataset.loading = 'false';
        link.removeAttribute('aria-busy');
        console.warn('[Spider Collection] Load more failed.', error);
      }
      return;
    }

    link.dataset.loading = 'false';
    link.removeAttribute('aria-busy');
  };

  const initInfinite = (root = document) => {
    qsa('[data-sp-infinite-scroll]', root).forEach((node) => {
      state.infiniteObservers.get(node)?.disconnect?.();
      const link = qs('[data-sp-load-more]', node);
      if (!link || !('IntersectionObserver' in window)) return;
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadMore(link);
      }, { rootMargin: '500px 0px' });
      state.infiniteObservers.set(node, observer);
      observer.observe(node);
    });
  };

  const preferredGridColumns = () => {
    try {
      const value = Number(localStorage.getItem(state.gridStorageKey));
      return value >= 2 && value <= 6 ? value : null;
    } catch (_) { return null; }
  };

  const applyGridColumns = (root, columns, persist = false) => {
    if (!root || !columns) return;
    root.classList.remove('is-list-view');
    const listButton = qs('[data-sp-grid-view="list"]', root);
    listButton?.classList.remove('is-active');
    listButton?.setAttribute('aria-pressed', 'false');
    root.style.setProperty('--sp-mc-cols-d', String(columns));
    const grid = qs('[data-sp-product-grid]', root);
    if (grid) grid.dataset.gridColumns = String(columns);
    qsa('[data-sp-grid-columns]', root).forEach((button) => {
      const active = Number(button.dataset.spGridColumns) === Number(columns);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (persist) {
      try {
        localStorage.setItem(state.gridStorageKey, String(columns));
        localStorage.setItem(state.viewStorageKey, 'grid');
      } catch (_) {}
    }
  };

  const applyListView = (root, persist = false) => {
    if (!root) return;
    root.classList.add('is-list-view');
    qsa('[data-sp-grid-columns]', root).forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
    const button = qs('[data-sp-grid-view="list"]', root);
    button?.classList.add('is-active');
    button?.setAttribute('aria-pressed', 'true');
    if (persist) {
      try { localStorage.setItem(state.viewStorageKey, 'list'); } catch (_) {}
    }
  };

  const restoreGridPreference = (root = document) => {
    const columns = preferredGridColumns();
    let view;
    try { view = localStorage.getItem(state.viewStorageKey); } catch (_) {}
    const restore = (collectionRoot) => {
      if (view === 'list' || (!view && collectionRoot.dataset.defaultView === 'list')) {
        applyListView(collectionRoot);
      } else if (columns) {
        applyGridColumns(collectionRoot, columns);
      }
    };
    if (root?.matches?.(ROOT)) { restore(root); return; }
    qsa(ROOT, root).forEach(restore);
  };

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-sp-collection-filter-form]');
    if (!form) return;
    const root = rootOf(form);
    if (!ajaxEnabled(root)) return;
    event.preventDefault();
    replaceCollection(root, formUrl(form), { push: true, focusResults: true });
  });

  document.addEventListener('change', (event) => {
    const sort = event.target.closest('[data-sp-sort-by]');
    if (sort) {
      const form = sort.form;
      const root = rootOf(sort);
      if (!ajaxEnabled(root)) {
        form?.requestSubmit?.();
        return;
      }
      event.preventDefault();
      replaceCollection(root, formUrl(form), { push: true, focusResults: true });
      return;
    }

    const filterForm = event.target.closest('[data-sp-collection-filter-form]');
    if (!filterForm || filterForm.dataset.autoApply !== 'true') return;
    if (!event.target.matches('input[type="checkbox"], input[type="radio"], select')) return;
    const root = rootOf(filterForm);
    if (!ajaxEnabled(root)) {
      filterForm.requestSubmit?.();
      return;
    }
    replaceCollection(root, formUrl(filterForm), { push: true, focusResults: false });
  });

  document.addEventListener('click', (event) => {
    const filterButton = event.target.closest('[data-sp-sidebar-toggle]');
    if (filterButton) {
      const root = rootOf(filterButton);
      if (!root) return;
      const mode = root.dataset.desktopFilterLayout;
      if (window.matchMedia('(min-width: 990px)').matches && (mode === 'sidebar-left' || mode === 'sidebar-right')) {
        const hidden = root.classList.toggle('is-sidebar-hidden');
        filterButton.setAttribute('aria-expanded', String(!hidden));
      } else {
        const dialogId = filterButton.getAttribute('aria-controls');
        if (window.Spider?.openDrawer) window.Spider.openDrawer(dialogId, filterButton);
        else { const dialog = document.getElementById(dialogId); if (dialog?.showModal) { dialog.showModal(); filterButton.setAttribute('aria-expanded', 'true'); } }
      }
      return;
    }
    const listButton = event.target.closest('[data-sp-grid-view="list"]');
    if (listButton) {
      applyListView(rootOf(listButton), true);
      return;
    }
    const gridButton = event.target.closest('[data-sp-grid-columns]');
    if (gridButton) {
      const root = rootOf(gridButton);
      applyGridColumns(root, Number(gridButton.dataset.spGridColumns), true);
      return;
    }

    const loadMoreLink = event.target.closest('[data-sp-load-more]');
    if (loadMoreLink) {
      const root = rootOf(loadMoreLink);
      if (ajaxEnabled(root)) {
        event.preventDefault();
        loadMore(loadMoreLink);
      }
      return;
    }

    const link = event.target.closest('[data-sp-collection-link]');
    if (!link) return;
    const root = rootOf(link);
    if (!ajaxEnabled(root)) return;
    event.preventDefault();
    replaceCollection(root, link.href, { push: true, focusResults: true });
  });

  window.addEventListener('popstate', () => {
    const root = qs(ROOT);
    if (!root || !ajaxEnabled(root)) return;
    replaceCollection(root, location.href, { push: false, focusResults: true });
  });

  const boot = (scope = document) => {
    qsa(ROOT, scope.matches?.(ROOT) ? scope.parentNode || document : scope).forEach((root) => {
      restoreGridPreference(root);
      const filterTrigger = qs('[data-sp-sidebar-toggle]', root);
      if (filterTrigger && window.matchMedia('(min-width: 990px)').matches && ['sidebar-left', 'sidebar-right'].includes(root.dataset.desktopFilterLayout)) {
        filterTrigger.setAttribute('aria-expanded', String(!root.classList.contains('is-sidebar-hidden')));
      }
      syncProductSystem(root);
      initInfinite(root);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  else boot();
  document.addEventListener('shopify:section:load', (event) => boot(event.target));
})();
