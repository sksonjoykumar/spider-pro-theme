(() => {
  'use strict';

  const VERSION = '1.0.0';
  const KEY = 'sp_recently_viewed_products:v1';
  const DEFAULT_MAX = 20;
  const DEFAULT_EXPIRY_DAYS = 30;
  const GUARD = '__SPIDER_RECENTLY_VIEWED_CORE_V1__';

  const now = () => Date.now();
  const dayMs = 86400000;
  const asText = (value) => String(value ?? '').trim();
  const asId = (value) => asText(value);
  const clampMax = (value) => Math.max(1, Math.min(50, Number(value) || DEFAULT_MAX));
  const clampDays = (value) => Math.max(1, Math.min(365, Number(value) || DEFAULT_EXPIRY_DAYS));

  const validHandle = (value) => {
    const handle = asText(value);
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(handle) ? handle : '';
  };

  const normalizeItem = (input) => {
    if (!input || typeof input !== 'object') return null;
    const handle = validHandle(input.handle);
    if (!handle) return null;
    const id = asId(input.id || input.productId);
    const variantId = asId(input.variantId || input.variant_id);
    const viewedAtRaw = Number(input.viewedAt || input.viewed_at || 0);
    const viewedAt = Number.isFinite(viewedAtRaw) && viewedAtRaw > 0 ? viewedAtRaw : now();
    return { id, handle, variantId, viewedAt };
  };

  const readRaw = () => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return { version: 1, items: [] };
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { version: 1, items: parsed };
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
        return { version: 1, items: parsed.items };
      }
    } catch (_) {
      return { version: 1, items: [] };
    }
    return { version: 1, items: [] };
  };

  const writeRaw = (items) => {
    const payload = { version: 1, items };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  };

  const sanitize = (items, { max = DEFAULT_MAX, expirationDays = DEFAULT_EXPIRY_DAYS } = {}) => {
    const expiryMs = clampDays(expirationDays) * dayMs;
    const cutoff = now() - expiryMs;
    const seen = new Set();
    const output = [];

    (Array.isArray(items) ? items : []).forEach((raw) => {
      const item = normalizeItem(raw);
      if (!item || item.viewedAt < cutoff) return;
      const key = item.id ? `id:${item.id}` : `handle:${item.handle}`;
      if (seen.has(key)) return;
      seen.add(key);
      output.push(item);
    });

    output.sort((a, b) => b.viewedAt - a.viewedAt);
    return output.slice(0, clampMax(max));
  };

  const subscribers = new Set();
  let memoryItems = sanitize(readRaw().items);
  let storageUsable = true;

  const announce = (detail) => {
    const payload = {
      version: VERSION,
      key: KEY,
      count: memoryItems.length,
      items: memoryItems.map((item) => ({ ...item })),
      ...detail
    };
    subscribers.forEach((callback) => {
      try { callback(payload); } catch (_) { /* subscriber failures must not break storage */ }
    });
    document.dispatchEvent(new CustomEvent('sp:recently-viewed:updated', { detail: payload }));
  };

  const persist = () => {
    if (!storageUsable) return false;
    const ok = writeRaw(memoryItems);
    if (!ok) storageUsable = false;
    return ok;
  };

  const api = {
    version: VERSION,
    storageKey: KEY,
    defaults: { max: DEFAULT_MAX, expirationDays: DEFAULT_EXPIRY_DAYS },

    get(options = {}) {
      const fresh = sanitize(storageUsable ? readRaw().items : memoryItems, options);
      memoryItems = fresh;
      if (storageUsable) persist();
      return fresh.map((item) => ({ ...item }));
    },

    add(product, options = {}) {
      const item = normalizeItem({ ...product, viewedAt: product?.viewedAt || now() });
      if (!item) return false;
      const existing = this.get(options).filter((entry) => {
        if (item.id && entry.id) return entry.id !== item.id;
        return entry.handle !== item.handle;
      });
      memoryItems = sanitize([item, ...existing], options);
      persist();
      announce({ action: 'add', product: { ...item } });
      return true;
    },

    remove(productIdOrHandle, options = {}) {
      const token = asText(productIdOrHandle);
      if (!token) return false;
      const before = this.get(options);
      const next = before.filter((item) => item.id !== token && item.handle !== token);
      if (next.length === before.length) return false;
      memoryItems = sanitize(next, options);
      persist();
      announce({ action: 'remove', productIdOrHandle: token });
      return true;
    },

    clear() {
      memoryItems = [];
      try { window.localStorage.removeItem(KEY); } catch (_) { storageUsable = false; }
      const detail = { version: VERSION, key: KEY, count: 0, items: [], action: 'clear' };
      subscribers.forEach((callback) => { try { callback(detail); } catch (_) {} });
      document.dispatchEvent(new CustomEvent('sp:recently-viewed:cleared', { detail }));
      document.dispatchEvent(new CustomEvent('sp:recently-viewed:updated', { detail }));
    },

    prune(options = {}) {
      memoryItems = sanitize(storageUsable ? readRaw().items : memoryItems, options);
      persist();
      announce({ action: 'prune' });
      return memoryItems.map((item) => ({ ...item }));
    },

    subscribe(callback) {
      if (typeof callback !== 'function') return () => {};
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    trackFromElement(element, options = {}) {
      if (!element) return false;
      const id = asId(element.dataset.productId);
      const handle = validHandle(element.dataset.productHandle);
      const variantId = asId(element.dataset.variantId);
      if (!handle) return false;
      return this.add({ id, handle, variantId, viewedAt: now() }, options);
    }
  };

  const existing = window.SpiderRecentlyViewed;
  if (window[GUARD] && existing?.version === VERSION && typeof existing.get === 'function' && typeof existing.add === 'function') {
    document.dispatchEvent(new CustomEvent('sp:recently-viewed:ready', { detail: { version: VERSION, service: existing } }));
    return;
  }

  window[GUARD] = true;
  window.SpiderRecentlyViewed = api;

  const bootTracker = () => {
    const marker = document.querySelector('[data-sp-recently-viewed-current-product]');
    if (!marker) return;

    // Track product previews in Shopify Theme Editor too. The previous build
    // skipped request.design_mode entirely, so merchants could browse several
    // products in the editor and the Recently Viewed history always stayed empty.
    // This history remains browser-local and does not affect storefront shoppers.
    const handle = validHandle(marker.dataset.productHandle);
    if (!handle || window.__SPIDER_RECENT_PRODUCT_TRACKED__ === handle) return;
    window.__SPIDER_RECENT_PRODUCT_TRACKED__ = handle;
    api.trackFromElement(marker);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTracker, { once: true });
  else bootTracker();

  // Shopify's editor can dynamically reload/reselect sections while keeping the
  // preview document alive. Re-check the current product marker without polling.
  document.addEventListener('shopify:section:load', bootTracker);
  document.addEventListener('shopify:section:select', bootTracker);

  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    memoryItems = sanitize(readRaw().items);
    announce({ action: 'storage' });
  });

  document.dispatchEvent(new CustomEvent('sp:recently-viewed:ready', { detail: { version: VERSION, service: api } }));
})();
