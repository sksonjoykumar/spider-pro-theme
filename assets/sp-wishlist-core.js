(() => {
  'use strict';

  const VERSION = 4;
  const READY_EVENT = 'sp:wishlist:ready';
  const CHANGE_EVENT = 'sp:wishlist:change';
  const ID_KEY = 'spider:wishlist:v1';
  const META_KEY = 'spider:wishlist:meta:v2';
  const REQUIRED_METHODS = ['has', 'count', 'getAll', 'getProducts', 'get', 'registerProduct', 'add', 'remove', 'toggle', 'clear', 'subscribe', 'sync'];

  const isValidService = (service) => Boolean(
    service && REQUIRED_METHODS.every((method) => typeof service[method] === 'function')
  );

  window.SpiderWishlistCore = Object.assign(window.SpiderWishlistCore || {}, {
    version: VERSION,
    idKey: ID_KEY,
    metaKey: META_KEY,
    requiredMethods: REQUIRED_METHODS.slice(),
    isValidService
  });

  // A stale/partial flag must never poison future initialization.
  if (window.__SPIDER_WISHLIST_CORE_V4__) {
    const existingV4 = window.SpiderWishlist;
    if (existingV4?._spiderWishlistCoreV4 === true && isValidService(existingV4)) {
      queueMicrotask(() => {
        try { document.dispatchEvent(new CustomEvent(READY_EVENT, { detail: { version: VERSION, service: existingV4 } })); } catch (_) {}
      });
      return;
    }
    window.__SPIDER_WISHLIST_CORE_V4__ = false;
  }
  window.__SPIDER_WISHLIST_CORE_V4__ = true;

  let storageAvailable = true;
  const readJSON = (key, fallback) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      storageAvailable = false;
      return fallback;
    }
  };

  const writeJSON = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      storageAvailable = false;
      return false;
    }
  };

  const asId = (value) => String(value?.id ?? value ?? '').trim();
  const cssEscape = (value) => window.CSS?.escape
    ? window.CSS.escape(String(value))
    : String(value).replace(/["\\]/g, '\\$&');

  const storefrontRoot = () => {
    const raw = String(window.Shopify?.routes?.root || '/').trim() || '/';
    return `/${raw.replace(/^\/+|\/+$/g, '')}${raw === '/' ? '' : '/'}`.replace(/^\/\//, '/');
  };

  const productPathFromHandle = (handle) => {
    const safeHandle = String(handle || '').trim();
    return safeHandle ? `${storefrontRoot()}products/${encodeURIComponent(safeHandle)}` : '';
  };

  const productHandleFromUrl = (value) => {
    try {
      const url = new URL(String(value || ''), window.location.origin);
      const match = url.pathname.match(/\/products\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1].replace(/\.js$/i, '')) : '';
    } catch (_) {
      return '';
    }
  };

  const cleanUrl = (value, handle = '') => {
    const candidate = String(value || '').trim();
    if (candidate) {
      try {
        const url = new URL(candidate, window.location.origin);
        if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin) return '';
        url.hash = '';
        return `${url.pathname}${url.search}`;
      } catch (_) {}
    }
    const safeHandle = String(handle || '').trim();
    return productPathFromHandle(safeHandle);
  };

  const cleanImage = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    return String(value.src || value.url || value.image || '').trim();
  };

  const normalizeItem = (value = {}) => {
    if (typeof value !== 'object' || value === null) value = { id: value };
    const id = asId(value);
    let handle = String(value.handle || '').trim();
    let url = cleanUrl(value.url || value.productUrl || '', handle);
    if (!handle && url) handle = productHandleFromUrl(url);
    if (!url && handle) url = cleanUrl('', handle);
    return {
      id,
      handle,
      url,
      title: String(value.title || '').trim(),
      image: cleanImage(value.image || value.featuredImage || value.featured_image || value.featured_media),
      vendor: String(value.vendor || '').trim(),
      rating: String(value.rating || '').trim(),
      addedAt: Number(value.addedAt || value.added_at || 0) || Date.now()
    };
  };

  const discoverFromDOM = (id, root = document) => {
    id = asId(id);
    if (!id || !root?.querySelector) return null;

    const selectors = [
      `[data-product-id="${cssEscape(id)}"][data-product-url]`,
      `[data-sp-product-id="${cssEscape(id)}"][data-product-url]`,
      `[data-product-id="${cssEscape(id)}"]`,
      `[data-sp-product-id="${cssEscape(id)}"]`
    ];

    let node = null;
    for (const selector of selectors) {
      try {
        node = root.querySelector(selector);
        if (node) break;
      } catch (_) {}
    }
    if (!node) return null;

    const card = node.closest?.('[data-product-id], [data-sp-product-id]') || node;
    const url = card.dataset?.productUrl || card.querySelector?.('a[href*="/products/"]')?.getAttribute('href') || '';
    const handle = card.dataset?.productHandle || productHandleFromUrl(url);
    const title = card.dataset?.productTitle || card.querySelector?.('[data-product-title], [class*="card__title"]')?.textContent?.trim() || '';
    const image = card.dataset?.productImage || card.querySelector?.('img:not([hidden])')?.currentSrc || card.querySelector?.('img:not([hidden])')?.src || '';
    const vendor = card.dataset?.productVendor || '';
    const rating = card.querySelector?.('[data-product-rating], .sp-featured-card__rating, .sp-collections-grid-tabs-card__rating')?.textContent?.replace(/\s+/g, ' ')?.trim() || '';

    return normalizeItem({ id, handle, url, title, image, vendor, rating, addedAt: Date.now() });
  };

  const choose = (...values) => values.find((entry) => entry !== '' && entry != null);
  const ids = new Set();
  const metaMap = new Map();

  const ingestMeta = (item, includeId = true) => {
    const normalized = normalizeItem(item);
    if (!normalized.id) return;
    const current = metaMap.get(normalized.id) || {};
    metaMap.set(normalized.id, {
      ...current,
      ...normalized,
      addedAt: Number(current.addedAt || normalized.addedAt || Date.now()) || Date.now()
    });
    if (includeId) ids.add(normalized.id);
  };

  const loadStoredState = () => {
    const storedIds = readJSON(ID_KEY, []);
    const storedMeta = readJSON(META_KEY, []);
    ids.clear();
    metaMap.clear();
    (Array.isArray(storedIds) ? storedIds : []).map(asId).filter(Boolean).forEach((id) => ids.add(id));
    const entries = Array.isArray(storedMeta) ? storedMeta : Object.values(storedMeta || {});
    entries.forEach((item) => ingestMeta(item, false));
    // Metadata is not authoritative for membership: only ID_KEY decides saved state.
    return ids.size;
  };

  loadStoredState();

  const persist = () => {
    writeJSON(ID_KEY, [...ids]);
    writeJSON(META_KEY, [...ids].map((id) => metaMap.get(id)).filter(Boolean));
  };

  const mergeItem = (value, metadata = null, root = document) => {
    const id = asId(value) || asId(metadata);
    if (!id) return null;

    const current = metaMap.get(id) || { id };
    const fromValue = typeof value === 'object' && value !== null ? normalizeItem({ ...value, id }) : { id };
    const fromMetadata = typeof metadata === 'object' && metadata !== null ? normalizeItem({ ...metadata, id }) : { id };
    const discovered = discoverFromDOM(id, root) || { id };

    let handle = choose(fromMetadata.handle, fromValue.handle, discovered.handle, current.handle, '') || '';
    let url = choose(fromMetadata.url, fromValue.url, discovered.url, current.url, '') || '';
    if (!handle && url) handle = productHandleFromUrl(url);
    if (!url && handle) url = cleanUrl('', handle);

    return {
      id,
      handle,
      url,
      title: choose(fromMetadata.title, fromValue.title, discovered.title, current.title, '') || '',
      image: choose(fromMetadata.image, fromValue.image, discovered.image, current.image, '') || '',
      vendor: choose(fromMetadata.vendor, fromValue.vendor, discovered.vendor, current.vendor, '') || '',
      rating: choose(fromMetadata.rating, fromValue.rating, discovered.rating, current.rating, '') || '',
      addedAt: Number(current.addedAt || fromMetadata.addedAt || fromValue.addedAt || discovered.addedAt || Date.now()) || Date.now()
    };
  };

  const isResolvableMeta = (item) => Boolean(item?.id && item?.handle && item?.url);

  const backfillFromDOM = (root = document) => {
    let changed = false;
    ids.forEach((id) => {
      const current = metaMap.get(id);
      if (isResolvableMeta(current) && current?.title) return;
      const discovered = discoverFromDOM(id, root);
      if (!discovered) return;
      const merged = mergeItem(current || { id }, discovered, root);
      if (!merged) return;
      const previous = JSON.stringify(current || null);
      metaMap.set(id, merged);
      if (JSON.stringify(merged) !== previous) changed = true;
    });
    if (changed) persist();
    return changed;
  };

  const updateHeaderCount = (count) => {
    const safeCount = Math.max(0, Number(count) || 0);
    const display = safeCount > 99 ? '99+' : String(safeCount);

    document.querySelectorAll('[data-sp-wishlist-count], [data-wishlist-count]').forEach((node) => {
      node.dataset.count = String(safeCount);
      node.textContent = display;
      if (node.hasAttribute('data-hide-zero')) node.hidden = safeCount === 0;
    });

    document.querySelectorAll('[data-sp-toolbar-count="wishlist"]').forEach((node) => {
      node.dataset.count = String(safeCount);
      node.textContent = display;
      node.hidden = safeCount === 0;
    });

    document.querySelectorAll('[data-sp-wishlist-link], [data-wishlist-link]').forEach((link) => {
      if (!(link instanceof HTMLElement)) return;
      let badge = link.querySelector('[data-sp-wishlist-core-count]');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'sp-wishlist-header-count';
        badge.setAttribute('data-sp-wishlist-core-count', '');
        badge.setAttribute('data-sp-wishlist-count', '');
        badge.setAttribute('aria-hidden', 'true');
        link.append(badge);
      }
      badge.dataset.count = String(safeCount);
      badge.textContent = display;
      badge.hidden = safeCount === 0;

      const original = link.dataset.spWishlistBaseLabel || link.getAttribute('aria-label') || 'Wishlist';
      if (!link.dataset.spWishlistBaseLabel) {
        link.dataset.spWishlistBaseLabel = original.replace(/,?\s*\d+\s*(items?)?$/i, '').trim() || 'Wishlist';
      }
      link.setAttribute('aria-label', `${link.dataset.spWishlistBaseLabel}, ${safeCount} ${safeCount === 1 ? 'item' : 'items'}`);
    });
  };

  const syncGenericButtons = () => {
    document.querySelectorAll('[data-sp-wishlist-toggle][data-product-id], [data-wishlist-toggle][data-product-id]').forEach((button) => {
      const id = String(button.dataset.productId || '');
      if (!id) return;
      const active = ids.has(id);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  const subscribers = new Set();
  const notify = (productId = '', active = false, action = 'sync', options = {}) => {
    if (options.backfill !== false) backfillFromDOM();
    const products = [...ids].map((id) => metaMap.get(id) || { id });
    const detail = {
      productId: asId(productId),
      active: Boolean(active),
      action,
      count: ids.size,
      items: [...ids],
      products
    };
    updateHeaderCount(ids.size);
    syncGenericButtons();
    subscribers.forEach((callback) => { try { callback(detail); } catch (_) {} });
    document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }));
  };

  // Migrate any prior Spider service into the single V4 store before replacing it.
  const previousService = window.SpiderWishlist;
  if (previousService) {
    try {
      const previousProducts = typeof previousService.getProducts === 'function' ? previousService.getProducts() : [];
      (Array.isArray(previousProducts) ? previousProducts : []).forEach((product) => {
        const item = mergeItem(product);
        if (!item?.id) return;
        ids.add(item.id);
        metaMap.set(item.id, item);
      });
    } catch (_) {}
    try {
      const previousIds = typeof previousService.getAll === 'function' ? previousService.getAll() : [];
      (Array.isArray(previousIds) ? previousIds : []).forEach((value) => {
        const id = asId(value);
        if (id) ids.add(id);
      });
    } catch (_) {}
  }
  backfillFromDOM();
  persist();

  const service = {
    _spiderWishlistCoreV4: true,
    version: VERSION,
    get storageAvailable() { return storageAvailable; },
    has(value) { return ids.has(asId(value)); },
    count() { return ids.size; },
    getAll() { return [...ids]; },
    getProducts() {
      backfillFromDOM();
      return [...ids].map((id) => metaMap.get(id) || { id });
    },
    get(value) {
      const id = asId(value);
      backfillFromDOM();
      return metaMap.get(id) || (ids.has(id) ? { id } : null);
    },
    registerProduct(value, metadata = null) {
      const item = mergeItem(value, metadata);
      if (!item?.id) return null;
      metaMap.set(item.id, item);
      if (ids.has(item.id)) persist();
      return item;
    },
    backfillFromDOM(root = document) { return backfillFromDOM(root); },
    add(value, metadata = null) {
      const item = mergeItem(value, metadata);
      if (!item?.id) return false;
      if (!isResolvableMeta(item)) {
        console.warn('[Spider Wishlist] Add rejected because product handle/URL metadata is missing.', item.id);
        return false;
      }
      ids.add(item.id);
      metaMap.set(item.id, item);
      persist();
      notify(item.id, true, 'add');
      return true;
    },
    remove(value) {
      const id = asId(value);
      if (!id) return false;
      const changed = ids.delete(id);
      metaMap.delete(id);
      persist();
      if (changed) notify(id, false, 'remove');
      return false;
    },
    toggle(value, metadata = null) {
      const id = asId(value) || asId(metadata);
      if (!id) return false;
      return ids.has(id) ? this.remove(id) : this.add(value, metadata);
    },
    clear() {
      if (!ids.size && !metaMap.size) return;
      ids.clear();
      metaMap.clear();
      persist();
      notify('', false, 'clear');
    },
    subscribe(callback) {
      if (typeof callback !== 'function') return () => {};
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    sync() { notify('', false, 'sync'); }
  };

  window.SpiderWishlist = service;

  if (!document.getElementById('SpiderWishlistCoreStyles')) {
    const style = document.createElement('style');
    style.id = 'SpiderWishlistCoreStyles';
    style.textContent = `
      [data-sp-wishlist-link],[data-wishlist-link]{position:relative}
      .sp-wishlist-header-count{position:absolute;inset-block-start:-7px;inset-inline-end:-9px;display:grid;place-items:center;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:var(--sp-color-accent,#171717);color:#fff;font:700 10px/1 Arial,sans-serif;box-sizing:border-box}
      .sp-wishlist-header-count[hidden]{display:none!important}
    `;
    document.head.append(style);
  }

  const syncDom = () => {
    backfillFromDOM();
    updateHeaderCount(service.count());
    syncGenericButtons();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncDom, { once: true });
  else queueMicrotask(syncDom);

  // Cross-tab sync: read both keys, never write them back from this handler.
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== window.localStorage || (event.key !== ID_KEY && event.key !== META_KEY)) return;
    loadStoredState();
    notify('', false, 'storage', { backfill: false });
  });

  // Ready means a fully compatible service is already installed.
  queueMicrotask(() => {
    try { document.dispatchEvent(new CustomEvent(READY_EVENT, { detail: { version: VERSION, service } })); } catch (_) {}
  });
})();
