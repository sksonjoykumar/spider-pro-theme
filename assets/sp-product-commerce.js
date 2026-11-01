(() => {
  'use strict';

  const VERSION = '2.5.0';
  const GUARD = '__SPIDER_PRODUCT_COMMERCE_CORE_V25__';
  const COMPARE_KEY = 'spider:compare:v1';
  const DEFAULT_COMPARE_MAX = 4;
  const productCache = window.__SpiderNormalizedProductCache instanceof Map ? window.__SpiderNormalizedProductCache : new Map();
  window.__SpiderNormalizedProductCache = productCache;
  const rawProductCache = window.__SpiderProductRawCache instanceof Map ? window.__SpiderProductRawCache : new Map();
  window.__SpiderProductRawCache = rawProductCache;

  const existing = window.SpiderProductCommerce;
  if (window[GUARD] && existing?.version === VERSION && existing.compare && existing.products && typeof existing.bindUI === 'function') {
    existing.bindUI();
    document.dispatchEvent(new CustomEvent('sp:product-commerce:ready', { detail: { version: VERSION, service: existing } })); document.dispatchEvent(new CustomEvent('sp:commerce:ready', { detail: { version: VERSION, service: existing } }));
    return;
  }
  window[GUARD] = true;

  const safeJson = (raw, fallback) => {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  };
  const readStorage = (key, fallback) => {
    try { return safeJson(window.localStorage.getItem(key), fallback) ?? fallback; } catch (_) { return fallback; }
  };
  const writeStorage = (key, value) => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  };
  const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const stripHtml = (html) => {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const safeHref = (href) => {
    try {
      const u = new URL(String(href || '/'), window.location.href);
      return ['http:', 'https:'].includes(u.protocol) ? u.href : '/';
    } catch (_) { return '/'; }
  };
  const storefrontRoot = () => {
    const raw = String(window.Shopify?.routes?.root || '/').trim() || '/';
    const clean = raw.replace(/^\/+|\/+$/g, '');
    return clean ? `/${clean}/` : '/';
  };
  const productJsonUrl = (href) => {
    const url = new URL(href, window.location.href);
    url.hash = '';
    url.search = '';
    url.pathname = `${url.pathname.replace(/\.js$/i, '').replace(/\/$/, '')}.js`;
    return url.toString();
  };
  const createProductDataService = () => ({
    cache: rawProductCache,
    productJsonUrl,
    async get(href, signal) {
      if (!href) throw new Error('Product URL is unavailable');
      const key = productJsonUrl(href);
      if (!rawProductCache.has(key)) {
        const promise = fetch(key, { headers: { Accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) {
              const error = new Error(`Unable to load product (${response.status})`);
              error.status = response.status;
              error.code = 'PRODUCT_FETCH_FAILED';
              throw error;
            }
            return response.json();
          })
          .catch((error) => { rawProductCache.delete(key); throw error; });
        rawProductCache.set(key, promise);
      }
      const promise = rawProductCache.get(key);
      if (!signal) return promise;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
          (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
          (error) => { signal.removeEventListener('abort', onAbort); reject(error); }
        );
      });
    },
    invalidate(href) {
      try { rawProductCache.delete(productJsonUrl(href)); } catch (_) {}
      try { productCache.delete(productJsonUrl(href)); } catch (_) {}
    }
  });
  const productData = window.SpiderProductData && typeof window.SpiderProductData.get === 'function'
    ? window.SpiderProductData
    : createProductDataService();
  window.SpiderProductData = productData;
  if (productData.cache instanceof Map && productData.cache !== rawProductCache) {
    window.__SpiderProductRawCache = productData.cache;
  }

  const imageUrl = (url, width = 900) => {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.origin);
      if (/cdn\.shopify\.com|shopifycdn\.net/i.test(u.hostname)) u.searchParams.set('width', String(width));
      return u.toString();
    } catch (_) { return String(url); }
  };

  const normalizeProduct = (raw, fallbackUrl = '') => {
    const variants = Array.isArray(raw?.variants) ? raw.variants.map((variant) => {
      const options = Array.isArray(variant.options)
        ? variant.options.map(String)
        : [variant.option1, variant.option2, variant.option3].filter((v) => v != null).map(String);
      const media = variant.featured_image?.src || variant.featured_image || null;
      return {
        id: String(variant.id || ''), available: Boolean(variant.available), options,
        price: Number(variant.price || 0), compareAt: Number(variant.compare_at_price || 0),
        image: typeof media === 'string' ? media : media?.src || null, sku: variant.sku || '',
        inventoryQty: Number.isFinite(Number(variant.inventory_quantity)) ? Number(variant.inventory_quantity) : null,
        inventoryTracked: variant.inventory_management === 'shopify' && variant.inventory_policy !== 'continue'
      };
    }) : [];
    const options = Array.isArray(raw?.options) ? raw.options.map((option, index) => {
      const values = typeof option === 'object' && Array.isArray(option.values)
        ? option.values.map((v) => typeof v === 'object' ? String(v.name ?? v.value ?? '') : String(v))
        : [...new Set(variants.map((variant) => variant.options[index]).filter(Boolean))];
      return { name: typeof option === 'string' ? option : option?.name || `Option ${index + 1}`, position: Number(option?.position || index + 1), values };
    }) : [];
    const images = (Array.isArray(raw?.images) ? raw.images : []).map((image) => typeof image === 'string' ? image : image?.src || image?.url || '').filter(Boolean);
    const featured = typeof raw?.featured_image === 'string' ? raw.featured_image : raw?.featured_image?.src || images[0] || '';
    return {
      id: String(raw?.id || ''), handle: raw?.handle || '', title: raw?.title || 'Product', vendor: raw?.vendor || '',
      description: raw?.description || '', url: raw?.url || fallbackUrl, available: raw?.available !== false,
      price: Number(raw?.price ?? raw?.price_min ?? variants[0]?.price ?? 0),
      compareAt: Number(raw?.compare_at_price ?? raw?.compare_at_price_min ?? Math.max(0, ...variants.map((v) => v.compareAt || 0))),
      featuredImage: featured, images, options, variants, tags: Array.isArray(raw?.tags) ? raw.tags : typeof raw?.tags === 'string' ? raw.tags.split(',').map((tag) => tag.trim()) : []
    };
  };
  const fetchProduct = async (href, { signal } = {}) => {
    if (!href) throw new Error('Product URL is unavailable');
    const key = productJsonUrl(href);
    if (!productCache.has(key)) {
      const promise = Promise.resolve(productData.get(href, signal))
        .then((raw) => normalizeProduct(raw, href))
        .catch((error) => { productCache.delete(key); throw error; });
      productCache.set(key, promise);
    }
    return productCache.get(key);
  };
  const getExactVariant = (product, selected) => product?.variants?.find((variant) =>
    selected.length === variant.options.length && variant.options.every((value, index) => String(value) === String(selected[index]))
  ) || null;

  const isColorOption = (product, index) => /colou?r/i.test(String(product?.options?.[index]?.name || ''));
  const getCardPreviewVariant = (product, { optionIndex = 0, optionValue = '', selectedOptions = [] } = {}) => {
    if (!product?.variants?.length) return null;
    const index = Math.max(0, Number(optionIndex) || 0);
    const value = String(optionValue || '');
    const selected = Array.isArray(selectedOptions) ? selectedOptions.map(String) : [];
    const candidate = selected.slice();
    candidate[index] = value;
    const exact = getExactVariant(product, candidate);
    if (exact?.available) return exact;
    return product.variants.find((variant) => variant.available && String(variant.options[index]) === value)
      || product.variants.find((variant) => String(variant.options[index]) === value)
      || null;
  };

  const urlWithVariant = (href, variantId) => {
    try {
      const url = new URL(String(href || '/'), window.location.href);
      if (variantId) url.searchParams.set('variant', String(variantId));
      else url.searchParams.delete('variant');
      return url.toString();
    } catch (_) { return String(href || '/'); }
  };

  const COLOR_MAP = {
    black:'#000000','jet black':'#0a0a0a',white:'#ffffff','off white':'#faf9f6',ivory:'#fffff0',cream:'#fffdd0',beige:'#f5f5dc',tan:'#d2b48c',brown:'#8b4513',chocolate:'#7b3f00',gray:'#808080',grey:'#808080',charcoal:'#36454f',silver:'#c0c0c0',red:'#ff0000','dark red':'#8b0000',burgundy:'#800020',maroon:'#800000',pink:'#ffc0cb','light pink':'#ffb6c1','baby pink':'#f4c2c2','blush pink':'#f9b7c4','hot pink':'#ff69b4','dusty pink':'#d8a7b1','dusty rose':'#c9a0a0',purple:'#800080',lavender:'#b57edc',lilac:'#c8a2c8',violet:'#8f00ff',periwinkle:'#ccccff',plum:'#8e4585',blue:'#0000ff',navy:'#000080','navy blue':'#000080','royal blue':'#4169e1','sky blue':'#87ceeb','baby blue':'#89cff0','powder blue':'#b0e0e6','denim blue':'#1560bd','cobalt blue':'#0047ab',teal:'#008080',turquoise:'#40e0d0',aqua:'#00ffff',green:'#008000','dark green':'#006400','forest green':'#228b22','emerald green':'#50c878',olive:'#808000','army green':'#4b5320','sage green':'#9caf88',mint:'#98ff98',yellow:'#ffff00',mustard:'#ffdb58',gold:'#ffd700',orange:'#ffa500','burnt orange':'#cc5500',peach:'#ffcba4',coral:'#ff7f50',salmon:'#fa8072'
  };
  const normalizeColorName = (value) => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const splitEntries = (raw) => String(raw || '').split(/[;,\n\r]+/).map((x) => x.trim()).filter(Boolean);
  const parseSwatchMap = (raw) => {
    const map = new Map();
    splitEntries(raw).forEach((entry) => {
      const i = entry.search(/[:=]/); if (i < 1) return;
      const key = normalizeColorName(entry.slice(0, i)); const paint = entry.slice(i + 1).trim();
      if (!key || !paint) return;
      if (window.CSS?.supports?.('color', paint) || /^(linear|radial|conic)-gradient\(/i.test(paint)) map.set(key, paint);
    });
    return map;
  };
  const resolveSingleColor = (value) => {
    const raw = String(value || '').trim(); const key = normalizeColorName(raw);
    if (COLOR_MAP[key]) return COLOR_MAP[key];
    if (window.CSS?.supports?.('color', raw)) return raw;
    const words = key.split(/\s+/).filter(Boolean);
    for (let len = Math.min(3, words.length); len > 0; len -= 1) for (let i = 0; i <= words.length - len; i += 1) {
      const candidate = words.slice(i, i + len).join(' '); if (COLOR_MAP[candidate]) return COLOR_MAP[candidate];
    }
    return '';
  };
  const resolveSwatch = (value, customMap = new Map()) => {
    const raw = String(value || '').trim(); const custom = customMap.get(normalizeColorName(raw)); if (custom) return custom;
    const pieces = raw.split(/\s*(?:\/|&|\+|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
    if (pieces.length > 1) {
      const colors = pieces.map(resolveSingleColor).filter(Boolean).slice(0, 3);
      if (colors.length > 1) return `linear-gradient(135deg, ${colors.map((c, i) => `${c} ${(i/colors.length)*100}% ${((i+1)/colors.length)*100}%`).join(', ')})`;
    }
    return resolveSingleColor(raw);
  };

  const formatNumber = (value, decimals = 2, thousands = ',', decimal = '.') => {
    const fixed = (Number(value || 0) / 100).toFixed(decimals); const [integer, fraction] = fixed.split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, thousands); return decimals ? `${grouped}${decimal}${fraction}` : grouped;
  };
  const formatMoney = (cents, format = '{{amount}}', currency = '') => {
    if (window.Shopify?.formatMoney) { try { return window.Shopify.formatMoney(Number(cents || 0), format); } catch (_) {} }
    const values = { amount: formatNumber(cents,2,',','.'), amount_no_decimals: formatNumber(cents,0,',','.'), amount_with_comma_separator: formatNumber(cents,2,'.',','), amount_no_decimals_with_comma_separator: formatNumber(cents,0,'.',',') };
    let output = format || '{{amount}}'; Object.entries(values).forEach(([k,v]) => { output = output.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v); });
    return /\{\{/.test(output) ? `${formatNumber(cents)}${currency ? ` ${currency}` : ''}` : output;
  };

  const normalizeCompareItem = (product) => {
    if (!product?.id) return null;
    return {
      id: String(product.id), handle: product.handle || '', url: product.url || '/', title: product.title || 'Product', vendor: product.vendor || '',
      image: product.image || product.featuredImage || product.images?.[0] || '', price: product.price ?? '', compareAt: product.compareAt ?? '', available: product.available !== false
    };
  };
  const compareSubscribers = new Set();
  let compareItems = (Array.isArray(readStorage(COMPARE_KEY, [])) ? readStorage(COMPARE_KEY, []) : []).map(normalizeCompareItem).filter(Boolean);
  let compareMax = DEFAULT_COMPARE_MAX;
  let comparePersist = true;
  const emitCompare = (action = 'sync', product = null) => {
    const detail = { action, productId: String(product?.id || ''), count: compareItems.length, products: compareItems.slice(), max: compareMax };
    compareSubscribers.forEach((fn) => { try { fn(detail); } catch (_) {} });
    document.dispatchEvent(new CustomEvent('sp:compare:change', { detail }));
  };
  const compare = {
    version: VERSION,
    has: (id) => compareItems.some((x) => String(x.id) === String(id)),
    count: () => compareItems.length,
    getAll: () => compareItems.slice(),
    setMax(value) { compareMax = Math.max(2, Math.min(4, Number(value) || DEFAULT_COMPARE_MAX)); if (compareItems.length > compareMax) this.setAll(compareItems.slice(0, compareMax)); return compareMax; },
    setPersistence(enabled) { comparePersist = enabled !== false; if (!comparePersist) { try { window.localStorage.removeItem(COMPARE_KEY); } catch (_) {} } },
    getMax: () => compareMax,
    setAll(products) {
      const next = []; (Array.isArray(products) ? products : []).forEach((p) => { const item = normalizeCompareItem(p); if (item && !next.some((x) => x.id === item.id) && next.length < compareMax) next.push(item); });
      compareItems = next; (comparePersist && writeStorage(COMPARE_KEY, compareItems)); emitCompare('set'); return compareItems.slice();
    },
    add(product) {
      const item = normalizeCompareItem(product); if (!item) return false; if (this.has(item.id)) return true;
      if (compareItems.length >= compareMax) { emitCompare('limit', item); return false; }
      compareItems.push(item); (comparePersist && writeStorage(COMPARE_KEY, compareItems)); emitCompare('add', item); return true;
    },
    remove(id) { const before = compareItems.length; const removed = compareItems.find((x) => String(x.id) === String(id)); compareItems = compareItems.filter((x) => String(x.id) !== String(id)); if (before !== compareItems.length) { (comparePersist && writeStorage(COMPARE_KEY, compareItems)); emitCompare('remove', removed); } return before !== compareItems.length; },
    toggle(product) { const item = normalizeCompareItem(product); if (!item) return false; return this.has(item.id) ? (this.remove(item.id), false) : this.add(item); },
    clear() { if (!compareItems.length) return; compareItems = []; (comparePersist && writeStorage(COMPARE_KEY, compareItems)); emitCompare('clear'); },
    subscribe(fn) { if (typeof fn !== 'function') return () => {}; compareSubscribers.add(fn); return () => compareSubscribers.delete(fn); },
    sync() { emitCompare('sync'); }
  };
  window.SpiderCompare = compare;

  window.addEventListener('storage', (event) => {
    if (event.key !== COMPARE_KEY) return;
    compareItems = (Array.isArray(safeJson(event.newValue, [])) ? safeJson(event.newValue, []) : []).map(normalizeCompareItem).filter(Boolean).slice(0, compareMax);
    emitCompare('storage');
  });

  const summaryFromCard = (card) => ({
    id: String(card?.dataset.productId || ''), handle: card?.dataset.productHandle || '', url: card?.dataset.productUrl || '/',
    title: card?.dataset.productTitle || card?.querySelector('[data-product-title],h3,h2')?.textContent?.trim() || 'Product', vendor: card?.dataset.productVendor || '',
    image: card?.dataset.productImage || card?.querySelector('img')?.currentSrc || card?.querySelector('img')?.src || '',
    price: card?.dataset.productPrice || '', compareAt: card?.dataset.productCompareAt || '', available: card?.dataset.productAvailable !== 'false'
  });
  const summaryFromProduct = (product) => ({
    id: String(product?.id || ''), handle: product?.handle || '', url: product?.url || '/', title: product?.title || 'Product', vendor: product?.vendor || '',
    image: product?.featuredImage || product?.images?.[0] || '', price: Number(product?.price || 0),
    compareAt: Number(product?.compareAt || 0), available: product?.available !== false
  });

  class CommerceUI {
    constructor(root) {
      this.root = root; this.qv = root?.querySelector('[data-sp-commerce-qv]'); this.qa = root?.querySelector('[data-sp-commerce-qa]'); this.tray = root?.querySelector('[data-sp-commerce-compare-tray]'); this.compareDialog = root?.querySelector('[data-sp-commerce-compare-dialog]');
      this.state = new WeakMap(); this.trigger = new WeakMap(); this.config = {}; this.swatchMap = new Map(); this.bound = false; this.fetchSequence = 0;
      this.compareSettings = this.readCompareSettings(); this.compareDismissed = false; this.compareDetailCache = new Map(); this.compareRenderToken = 0;
      compare.setPersistence(this.compareSettings.persist); compare.setMax(this.compareSettings.max);
      this.bind(); this.renderCompare();
    }
    bind() {
      if (!this.root || this.bound) return; this.bound = true;
      this.root.addEventListener('click', (event) => this.onClick(event));
      this.root.addEventListener('change', (event) => this.onChange(event));
      // Capture quantity before the existing Spider cart controller reads FormData.
      this.root.addEventListener('submit', (event) => {
        const form = event.target.closest('#SpProductQuickView [data-product-card-form], #SpProductQuickAdd [data-product-card-form]');
        if (!form) return;
        const dialog = form.closest('dialog');
        const state = this.state.get(dialog);
        const qty = dialog.querySelector('[data-sp-commerce-quantity]');
        const value = this.clampQuantity(state, Number(qty?.value));
        if (!state?.variant?.available || !state.variant.id) {
          event.preventDefault();
          const status = dialog.querySelector('[data-sp-commerce-status]');
          if (status) status.textContent = 'Please select an available option.';
          return;
        }
        form.querySelector('[data-sp-commerce-variant]').value = String(state.variant.id);
        form.querySelector('[data-sp-commerce-form-quantity]').value = String(value);
        if (qty) qty.value = String(value);
      }, true);
      [this.qv, this.qa, this.compareDialog].forEach((dialog) => {
        if (!dialog) return;
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); if (dialog === this.qv && this.closeZoom(dialog)) return; this.closeDialog(dialog); });
        dialog.addEventListener('close', () => {
          dialog.classList.remove('is-open', 'is-opening', 'is-closing');
          this.unlockPage();
          this.restoreFocus(dialog);
        });
      });
      document.addEventListener('sp:compare:change', (event) => { if (event.detail?.action === 'add' || event.detail?.action === 'set') this.compareDismissed = false; this.renderCompare(); if (event.detail?.action === 'limit') this.announce(`You can compare up to ${compare.getMax()} products.`); this.syncDialogStates(); });
      document.addEventListener('sp:wishlist:change', () => this.syncDialogStates());
    }
    configure(config = {}) {
      this.config = { ...this.config, ...config };
      // The global comparison limit must not be replaced by individual product-card defaults.
      if (config.source instanceof Element && this.root) {
        const style = getComputedStyle(config.source);
        const pairs = [['--sp-commerce-text','--sp-section-text'],['--sp-commerce-heading','--sp-section-heading'],['--sp-commerce-card','--sp-section-card'],['--sp-commerce-muted','--sp-section-muted'],['--sp-commerce-border','--sp-section-border'],['--sp-commerce-accent','--sp-section-accent']];
        pairs.forEach(([target, source]) => { const value = style.getPropertyValue(source).trim(); if (value) this.root.style.setProperty(target, value); });
      }
      if (config.swatchMap instanceof Map) this.swatchMap = config.swatchMap;
      else if (typeof config.swatchMap === 'string') this.swatchMap = parseSwatchMap(config.swatchMap);
    }
    async openFromCard(card, mode = 'quick-view', trigger = null, config = {}) {
      const selectedOptions = safeJson(card?.dataset.selectedOptions || card?.dataset.initialOptions || '[]', []).map(String);
      const resolvedConfig = {
        ...config,
        source: config.source || card?.closest('sp-featured-collection, sp-collections-grid-tabs, sp-wishlist'),
        colorShape: config.colorShape || card?.dataset.colorShape || 'circle',
        sizeShape: config.sizeShape || card?.dataset.sizeShape || 'square',
        initialVariantId: String(card?.dataset.selectedVariantId || card?.dataset.initialVariantId || ''),
        selectedOptions
      };
      this.configure(resolvedConfig);
      const href = card?.dataset.productUrl;
      if (mode === 'quick-add' && !this.qa) { if (href) window.location.assign(safeHref(href)); return; }
      if (!href) { this.announce('Product details are unavailable.'); return; }
      const seq = ++this.fetchSequence;
      // Reuse genuine Shopify review markup if a card already rendered it.
      const rating = card.querySelector('.sp-product-card__rating[aria-label]');
      if (rating) {
        const match = String(rating.getAttribute('aria-label') || '').match(/([0-9]+(?:\.[0-9]+)?)\s+out of\s+([0-9]+(?:\.[0-9]+)?)/i);
        if (match && Number(match[2]) > 0) resolvedConfig.rating = { value:Number(match[1]), max:Number(match[2]) };
      }
      try {
        const product = await fetchProduct(href);
        if (seq !== this.fetchSequence) return;
        return this.open(product, mode, trigger || card, resolvedConfig);
      } catch (_) { if (seq === this.fetchSequence) this.announce('Unable to load product details. Please retry.'); }
    }
    open(product, mode = 'quick-view', trigger = null, config = {}) {
      this.configure(config);
      const dialog = mode === 'quick-add' ? this.qa : this.qv;
      if (!dialog || !product) return;
      this.trigger.set(dialog, trigger || document.activeElement);
      const configuredOptions = Array.isArray(config.selectedOptions) ? config.selectedOptions.map(String) : [];
      let first = product.variants.find((variant) => String(variant.id) === String(config.initialVariantId || '')) || null;
      if (!first && configuredOptions.length) first = getExactVariant(product, configuredOptions);
      if (!first) first = product.variants.find((variant) => variant.available) || product.variants[0] || null;
      const selected = first?.options?.slice() || configuredOptions;
      const state = { product, selected, variant: first, imageIndex: 0, descriptionExpanded: false, mode, rating:config.rating || null };
      this.state.set(dialog, state);
      this.renderDialog(dialog, state);
      this.resetDialogScroll(dialog);
      this.openDialog(dialog);
      requestAnimationFrame(() => {
        dialog.querySelector('[data-sp-commerce-close]')?.focus({ preventScroll: true });
        this.resetDialogScroll(dialog);
      });
    }
    resetDialogScroll(dialog) {
      if (!dialog) return;
      const nodes = [
        dialog,
        dialog.querySelector('.sp-commerce-qv__shell'),
        dialog.querySelector('.sp-commerce-qv__content'),
        dialog.querySelector('.sp-commerce-qa__shell')
      ].filter(Boolean);

      nodes.forEach((node) => {
        try {
          node.scrollTop = 0;
          node.scrollLeft = 0;
        } catch (_) {}
      });
    }
    openDialog(dialog) {
      if (!dialog || dialog.open) return;
      dialog.classList.remove('is-closing');
      dialog.classList.add('is-opening');
      this.resetDialogScroll(dialog);
      dialog.showModal();
      this.lockPage();
      this.resetDialogScroll(dialog);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.resetDialogScroll(dialog);
        dialog.classList.remove('is-opening');
        dialog.classList.add('is-open');
      }));
    }
    closeDialog(dialog) {
      if (!dialog?.open || dialog.classList.contains('is-closing')) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
      dialog.classList.remove('is-open', 'is-opening');
      dialog.classList.add('is-closing');
      window.setTimeout(() => { if (dialog.open) dialog.close(); }, 340);
    }
    lockPage() {
      const count = Number(document.documentElement.dataset.spCommerceDialogCount || 0) + 1;
      document.documentElement.dataset.spCommerceDialogCount = String(count);
      document.documentElement.classList.add('sp-commerce-dialog-open');
    }
    unlockPage() {
      const count = Math.max(0, Number(document.documentElement.dataset.spCommerceDialogCount || 1) - 1);
      document.documentElement.dataset.spCommerceDialogCount = String(count);
      if (!count) document.documentElement.classList.remove('sp-commerce-dialog-open');
    }
    renderDialog(dialog, state) {
      const { product, mode } = state; const p = (name) => dialog.querySelector(`[data-sp-commerce-${name}]`);
      const title = p('title'); if (title) title.textContent = product.title;
      const vendor = p('vendor'); if (vendor) { vendor.textContent = product.vendor || ''; vendor.hidden = !product.vendor || (dialog === this.qv && dialog.dataset.spQvShowVendor !== 'true'); }
      const description = stripHtml(product.description); const desc = p('description'); const descWrap = dialog.querySelector('[data-sp-commerce-description-wrap]'); const descToggle = dialog.querySelector('[data-sp-commerce-description-toggle]');
      const isQv = dialog === this.qv;
      const descLength = isQv ? Math.max(80, Math.min(300, Number(dialog.dataset.spQvDescLength) || 170)) : dialog === this.qa ? Math.max(60, Math.min(400, Number(dialog.dataset.spQaDescriptionLength) || 170)) : 240;
      if (descWrap) descWrap.hidden = !description || (isQv && dialog.dataset.spQvDescription === 'false') || (dialog === this.qa && dialog.dataset.spQaShowDescription === 'false');
      if (desc) { desc.dataset.fullText = description; desc.dataset.spTextLimit = String(descLength); desc.textContent = description.length > descLength ? `${description.slice(0, descLength - 3).trim()}…` : description; }
      if (descToggle) { descToggle.hidden = description.length <= descLength; descToggle.textContent = 'Read more'; }
      if (isQv) {
        const rating = dialog.querySelector('[data-sp-qv-rating]');
        if (rating) {
          const good = state.rating && Number.isFinite(state.rating.value) && state.rating.max > 0;
          rating.hidden = !good || dialog.dataset.spQvShowRating === 'false';
          if (good) {
            const value = Math.round(state.rating.value / state.rating.max * 5 * 10) / 10;
            rating.querySelector('[data-sp-qv-rating-label]').textContent = `${value.toFixed(1)} / 5`;
            rating.querySelector('.sp-qv-v2__stars')?.style.setProperty('--sp-qv-stars', `${Math.max(0, Math.min(100, value / 5 * 100))}%`);
          }
        }
        const details = p('link'); if (details) details.hidden = dialog.dataset.spQvShowDetails !== 'true';
        const benefits = dialog.querySelector('[data-sp-qv-benefits-list]'); if (benefits) benefits.hidden = dialog.dataset.spQvBenefits === 'false';
        const expand = dialog.querySelector('[data-sp-qv-expand]'); if (expand) expand.hidden = dialog.dataset.spQvZoom === 'false';
        this.closeZoom(dialog);
      }
      const link = p('link'); if (link) link.href = safeHref(product.url || '/');
      const qty = p('quantity'); if (qty) qty.value = '1';
      const buy = p('buy'); if (buy) buy.hidden = this.config.buyNow === false || (dialog === this.qv && dialog.dataset.spQvBuyNow === 'false') || (dialog === this.qa && dialog.dataset.spQaBuy === 'false');
      if (dialog === this.qa) { const grp = dialog.querySelector('[data-sp-qa-quantity-group]'); if (grp) grp.hidden = dialog.dataset.spQaQuantity === 'false'; }
      dialog.querySelectorAll('[data-sp-commerce-wishlist]').forEach((button) => { button.hidden = this.config.showWishlist === false; });
      dialog.querySelectorAll('[data-sp-commerce-compare]').forEach((button) => { button.hidden = this.config.showCompare === false; });
      this.renderOptions(dialog, state); this.renderGallery(dialog, state); this.updateVariant(dialog, state); this.syncDialogStates();
      dialog.classList.toggle('is-quick-add', mode === 'quick-add');
    }
    renderOptions(dialog, state) {
      const container = dialog.querySelector('[data-sp-commerce-options]'); if (!container) return; container.textContent = '';
      state.product.options.forEach((option, index) => {
        if (dialog === this.qa && state.product.options.length === 1 && option.values.length === 1 && /^(default title|default)$/i.test(option.values[0])) return;
        const field = document.createElement('fieldset'); field.className = 'sp-commerce-dialog__field'; const legend = document.createElement('legend'); legend.textContent = option.name; field.append(legend);
        const values = document.createElement('div'); values.className = 'sp-commerce-dialog__values'; const isColor = /colou?r/i.test(option.name) && (dialog !== this.qa || dialog.dataset.spQaSwatches !== 'false');
        option.values.forEach((value) => {
          const button = document.createElement('button'); button.type = 'button'; const shape = isColor ? (this.config.colorShape || 'circle') : (this.config.sizeShape || 'square'); button.className = `sp-commerce-dialog__value${isColor ? ' is-color' : ' is-size'} is-shape-${shape}`; button.dataset.spCommerceOption = ''; button.dataset.optionIndex = String(index); button.dataset.optionValue = value; button.setAttribute('aria-pressed', String(state.selected[index] === value)); button.setAttribute('aria-label', `${option.name}: ${value}`);
          if (isColor) { const paint = resolveSwatch(value, this.swatchMap); if (paint) button.style.setProperty('--sp-commerce-swatch', paint); const label = document.createElement('span'); label.className = 'sp-visually-hidden'; label.textContent = value; button.append(label); }
          else button.textContent = value;
          values.append(button);
        }); field.append(values); container.append(field);
      }); this.updateOptionAvailability(dialog, state);
    }
    updateOptionAvailability(dialog, state) {
      dialog.querySelectorAll('[data-sp-commerce-option]').forEach((button) => {
        const index = Number(button.dataset.optionIndex); const candidate = state.selected.slice(); candidate[index] = button.dataset.optionValue;
        const possible = state.product.variants.some((variant) => variant.available && candidate.every((value, i) => !value || String(variant.options[i]) === String(value)));
        button.disabled = !possible; button.setAttribute('aria-disabled', String(!possible)); button.setAttribute('aria-pressed', String(state.selected[index] === button.dataset.optionValue));
      });
    }
    renderGallery(dialog, state) {
      const image = dialog.querySelector('[data-sp-commerce-image]'); if (!image) return;
      const gallery = state.product.images.length ? state.product.images : [state.product.featuredImage].filter(Boolean);
      state.gallery = gallery; state.imageIndex = Math.max(0, Math.min(gallery.length - 1, state.imageIndex || 0));
      dialog.querySelectorAll('[data-sp-commerce-media-prev],[data-sp-commerce-media-next]').forEach((button) => { button.hidden = gallery.length <= 1 || (dialog === this.qv && dialog.dataset.spQvShowArrows === 'false'); });
      const expand = dialog.querySelector('[data-sp-qv-expand]'); if (expand) expand.hidden = !gallery.length || dialog.dataset.spQvZoom === 'false';
      const variantImage = state.variant?.image;
      const variantIndex = variantImage ? gallery.findIndex((src) => String(src).split('?')[0] === String(variantImage).split('?')[0]) : -1;
      this.setGalleryImage(dialog, state, variantIndex >= 0 ? variantIndex : state.imageIndex);
    }
    setGalleryImage(dialog, state, index) {
      if (!state?.gallery?.length) return;
      const total = state.gallery.length; state.imageIndex = (Number(index) + total) % total;
      const image = dialog.querySelector('[data-sp-commerce-image]'); if (image) { image.src = imageUrl(state.gallery[state.imageIndex], 1200); image.alt = state.product?.title || ''; }
      const zoom = dialog.querySelector('[data-sp-qv-zoom-image]'); if (zoom && !dialog.querySelector('[data-sp-qv-lightbox]')?.hidden) { zoom.src = imageUrl(state.gallery[state.imageIndex], 1800); zoom.alt = state.product?.title || ''; }
      dialog.querySelectorAll('[data-sp-commerce-thumb]').forEach((button) => {
        const active = Number(button.dataset.spCommerceThumb) === state.imageIndex; button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      });
    }
    moveGallery(dialog, state, delta) { if (state?.gallery?.length) this.setGalleryImage(dialog, state, state.imageIndex + delta); }
    toggleDescription(dialog, state, button) {
      const desc = dialog.querySelector('[data-sp-commerce-description]'); if (!desc || !state) return;
      state.descriptionExpanded = !state.descriptionExpanded; const full = desc.dataset.fullText || '';
      const limit = Number(desc.dataset.spTextLimit) || 240;
      desc.textContent = state.descriptionExpanded || full.length <= limit ? full : `${full.slice(0, limit - 3).trim()}…`;
      button.textContent = state.descriptionExpanded ? 'Read less' : 'Read more';
    }
    updateVariant(dialog, state) {
      state.variant = getExactVariant(state.product, state.selected); const variant = state.variant; const config = this.config; const p = (name) => dialog.querySelector(`[data-sp-commerce-${name}]`);
      const price = p('price');
      const onSale = Boolean(variant && variant.compareAt > variant.price && variant.compareAt > 0);
      if (price) {
        const current = variant ? escapeHtml(formatMoney(variant.price, config.moneyFormat, config.currency)) : '';
        const showCompare = dialog !== this.qa || dialog.dataset.spQaShowCompare !== 'false';
        const was = onSale && showCompare ? ` <s>${escapeHtml(formatMoney(variant.compareAt, config.moneyFormat, config.currency))}</s>` : '';
        const savings = onSale ? Math.round((variant.compareAt - variant.price) / variant.compareAt * 100) : 0;
        price.innerHTML = variant ? `${current}${was}${dialog === this.qv && savings > 0 ? ` <span class="sp-qv-v2__save">Save ${savings}%</span>` : dialog === this.qa && savings > 0 && dialog.dataset.spQaShowSavings !== 'false' ? ` <span class="sp-qa-v2__save">Save ${savings}%</span>` : ''}` : '';
      }
      if (dialog === this.qv) {
        const badge = dialog.querySelector('[data-sp-qv-badge]');
        if (badge) {
          const tags = (state.product.tags || []).map((tag) => String(tag).trim().toLowerCase());
          const label = tags.includes('best seller') || tags.includes('bestseller') ? 'Best seller' : tags.includes('new arrival') || tags.includes('new') ? 'New arrival' : onSale ? 'Sale' : '';
          badge.hidden = !label || dialog.dataset.spQvShowBadge === 'false';
          badge.textContent = label;
        }
      }
      if (dialog === this.qa) {
        const badge = dialog.querySelector('[data-sp-qa-badge-label]');
        if (badge) {
          const tags = (state.product.tags || []).map((tag) => String(tag).trim().toLowerCase());
          const source = dialog.dataset.spQaBadgeSource || 'auto';
          const configured = String(dialog.dataset.spQaBadgeText || '').trim();
          const label = source === 'custom' ? configured : source === 'sale' ? (onSale ? 'Sale' : '') :
            tags.includes('best seller') || tags.includes('bestseller') ? 'Best seller' :
            tags.includes('new arrival') || tags.includes('new') ? 'New arrival' : onSale ? 'Sale' : '';
          badge.hidden = !label || dialog.dataset.spQaBadge === 'false';
          const textNode = badge.querySelector('[data-sp-qa-badge-text]'); if (textNode) textNode.textContent = label;
        }
      }
      const input = p('variant'); if (input) input.value = variant?.id || '';
      const add = p('add'); if (add) { add.disabled = !variant?.available; add.textContent = !variant ? 'Unavailable combination' : variant.available ? 'Add to cart' : 'Sold out'; }
      const buy = p('buy'); if (buy) buy.disabled = !variant?.available;
      const status = p('status'); if (status) status.textContent = !variant ? 'This option combination is unavailable.' : !variant.available ? 'This variant is sold out.' : '';
      const availability = p('availability'); if (availability) {
        availability.textContent = !variant ? 'Unavailable combination' : variant.available ? 'In stock' : 'Sold out';
        availability.classList.toggle('is-unavailable', !variant?.available);
        if (dialog === this.qv) availability.hidden = dialog.dataset.spQvShowAvailability === 'false';
        if (dialog === this.qa) availability.hidden = dialog.dataset.spQaStock === 'false';
      }
      const qty = p('quantity'); if (qty) {
        const value = this.clampQuantity(state, Number(qty.value));
        qty.value = String(value);
        qty.min = '1';
        if (variant?.inventoryTracked && variant.inventoryQty != null) qty.max = String(Math.max(1, variant.inventoryQty)); else qty.removeAttribute('max');
        const hiddenQty = p('form-quantity'); if (hiddenQty) hiddenQty.value = String(value);
      }
      const detailsLink = p('link'); if (detailsLink) detailsLink.href = safeHref(urlWithVariant(state.product.url || '/', variant?.id));
      if (variant?.image && state.gallery?.length) {
        const imageIndex = state.gallery.findIndex((src) => String(src).split('?')[0] === String(variant.image).split('?')[0]);
        if (imageIndex >= 0) this.setGalleryImage(dialog, state, imageIndex);
        else { const image = p('image'); if (image) image.src = imageUrl(variant.image, 1000); }
      }
      this.updateOptionAvailability(dialog, state);
    }
    clampQuantity(state, value) {
      const min = 1;
      const max = state?.variant?.inventoryTracked && state.variant.inventoryQty !== null ? Math.max(1, state.variant.inventoryQty) : Infinity;
      return Math.min(max, Math.max(min, Math.floor(Number(value) || min)));
    }
    closeZoom(dialog) {
      const box = dialog?.querySelector('[data-sp-qv-lightbox]');
      if (!box || box.hidden) return false;
      box.hidden = true;
      const zoomImage = box.querySelector('img'); if (zoomImage) zoomImage.removeAttribute('src');
      dialog.querySelector('[data-sp-qv-expand]')?.focus({ preventScroll:true });
      return true;
    }
    syncDialogStates() {
      [this.qv, this.qa].forEach((dialog) => { if (!dialog) return; const state = this.state.get(dialog); if (!state?.product) return; const id = state.product.id; const wish = Boolean(window.SpiderWishlist?.has?.(id)); const compared = compare.has(id);
        dialog.querySelectorAll('[data-sp-commerce-wishlist]').forEach((b) => { b.classList.toggle('is-active', wish); b.setAttribute('aria-pressed', String(wish)); b.setAttribute('aria-label', wish ? 'Remove product from wishlist' : 'Add product to wishlist'); });
        dialog.querySelectorAll('[data-sp-commerce-compare]').forEach((b) => { b.classList.toggle('is-active', compared); b.setAttribute('aria-pressed', String(compared)); b.setAttribute('aria-label', compared ? 'Remove product from compare' : 'Add product to compare'); });
      });
    }
    onChange(event) {
      const qty = event.target.closest('[data-sp-commerce-quantity]'); if (qty) {
        const state = this.state.get(qty.closest('dialog'));
        qty.value = String(this.clampQuantity(state, qty.value));
        const hidden = qty.closest('dialog')?.querySelector('[data-sp-commerce-form-quantity]'); if (hidden) hidden.value = qty.value;
      }
    }
    onClick(event) {
      const zoomClose = event.target.closest('[data-sp-qv-zoom-close]'); if (zoomClose) { this.closeZoom(zoomClose.closest('dialog')); return; }
      const zoomOpen = event.target.closest('[data-sp-qv-expand]'); if (zoomOpen) {
        const dialog = zoomOpen.closest('dialog'), state = this.state.get(dialog), box = dialog.querySelector('[data-sp-qv-lightbox]');
        if (state?.gallery?.length && box) {
          const img = box.querySelector('[data-sp-qv-zoom-image]');
          img.src = imageUrl(state.gallery[state.imageIndex], 1800); img.alt = state.product.title;
          box.hidden = false;
          box.querySelector('[data-sp-qv-zoom-close]')?.focus({preventScroll:true});
        }
        return;
      }
      const close = event.target.closest('[data-sp-commerce-close]'); if (close) { this.closeDialog(close.closest('dialog')); return; }
      const dialogBackdrop = event.target instanceof HTMLDialogElement ? event.target : null; if (dialogBackdrop && event.target === dialogBackdrop) { this.closeDialog(dialogBackdrop); return; }
      const option = event.target.closest('[data-sp-commerce-option]'); if (option) { const dialog=option.closest('dialog'); const state=this.state.get(dialog); if (!state || option.disabled) return; state.selected[Number(option.dataset.optionIndex)] = option.dataset.optionValue; this.updateVariant(dialog,state); return; }
      const thumb = event.target.closest('[data-sp-commerce-thumb]'); if (thumb) { const dialog = thumb.closest('dialog'), state = this.state.get(dialog); if (state?.gallery?.[Number(thumb.dataset.spCommerceThumb)]) this.setGalleryImage(dialog, state, Number(thumb.dataset.spCommerceThumb)); return; }
      const prev = event.target.closest('[data-sp-commerce-media-prev]'), next = event.target.closest('[data-sp-commerce-media-next]'); if (prev || next) { const dialog = (prev || next).closest('dialog'), state = this.state.get(dialog); this.moveGallery(dialog, state, next ? 1 : -1); return; }
      const descToggle = event.target.closest('[data-sp-commerce-description-toggle]'); if (descToggle) { const dialog = descToggle.closest('dialog'), state = this.state.get(dialog); this.toggleDescription(dialog, state, descToggle); return; }
      const minus = event.target.closest('[data-sp-commerce-minus]'), plus = event.target.closest('[data-sp-commerce-plus]'); if (minus || plus) { const dialog=(minus||plus).closest('dialog'), qty=dialog.querySelector('[data-sp-commerce-quantity]'); qty.value=String(this.clampQuantity(this.state.get(dialog),(Number(qty.value)||1)+(plus?1:-1))); return; }
      const wish = event.target.closest('[data-sp-commerce-wishlist]'); if (wish) { const dialog=wish.closest('dialog'), state=this.state.get(dialog); if (!state) return; const summary={id:state.product.id,handle:state.product.handle,url:urlWithVariant(state.product.url,state.variant?.id),title:state.product.title,image:state.variant?.image||state.product.featuredImage,vendor:state.product.vendor}; window.SpiderWishlist?.toggle?.(summary); return; }
      const cmp = event.target.closest('[data-sp-commerce-compare]'); if (cmp && this.compareSettings.enabled === false) return; if (cmp) { const dialog=cmp.closest('dialog'), state=this.state.get(dialog); if (state) compare.toggle({...summaryFromProduct(state.product,this.config),url:urlWithVariant(state.product.url,state.variant?.id),image:state.variant?.image||state.product.featuredImage}); return; }
      const formSubmit = event.target.closest('[data-sp-commerce-add]'); if (formSubmit) { const dialog=formSubmit.closest('dialog'), state=this.state.get(dialog), qty=dialog.querySelector('[data-sp-commerce-quantity]'), hiddenQty=dialog.querySelector('[data-sp-commerce-form-quantity]'); if (!state?.variant?.available) { event.preventDefault(); return; } if (hiddenQty) hiddenQty.value=String(this.clampQuantity(state,qty?.value)); return; }
      const buy = event.target.closest('[data-sp-commerce-buy]'); if (buy) { event.preventDefault(); const dialog=buy.closest('dialog'), state=this.state.get(dialog); this.buyNow(state, dialog); return; }
      const compareAdd = event.target.closest('[data-sp-compare-add-cart]'); if (compareAdd) { event.preventDefault(); this.addComparedProduct(compareAdd); return; }
      const remove = event.target.closest('[data-sp-commerce-compare-remove]'); if (remove) { compare.remove(remove.dataset.productId); return; }
      const clear = event.target.closest('[data-sp-commerce-compare-clear]'); if (clear) { compare.clear(); return; }
      const openCompare = event.target.closest('[data-sp-commerce-compare-open]'); if (openCompare) { this.openCompare(openCompare); return; }
      const dismiss = event.target.closest('[data-sp-commerce-compare-dismiss]'); if (dismiss) { this.compareDismissed = true; this.tray.hidden = true; return; }
    }
    async buyNow(state, dialog) {
      if (!state?.variant?.available) return;
      const button = dialog.querySelector('[data-sp-commerce-buy]'); if (button?.disabled) return;
      const qty = this.clampQuantity(state, dialog.querySelector('[data-sp-commerce-quantity]')?.value), status=dialog.querySelector('[data-sp-commerce-status]');
      if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); }
      try { const root=storefrontRoot(); const response=await fetch(`${root}cart/add.js`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({items:[{id:Number(state.variant.id),quantity:qty}]})}); if(!response.ok) throw new Error('Cart add failed'); window.location.assign(`${root}checkout`); }
      catch (_) { if(status) status.textContent='Unable to start checkout. Please use Add to cart.'; if(button){button.disabled=false;button.removeAttribute('aria-busy');} }
    }
    readCompareSettings() {
      const raw = this.root?.querySelector('[data-sp-compare-settings]')?.textContent || '{}';
      const s = safeJson(raw, {}) || {};
      return {
        enabled:s.enabled !== false, max:Math.max(2,Math.min(4,Number(s.max)||4)), persist:s.persist!==false,
        barTitle:s.barTitle||'Compare Products', barSubtitle:s.barSubtitle||'Compare up to 4 products',
        compareLabel:s.compareLabel||'Compare', modalEyebrow:s.modalEyebrow||'COMPARE PRODUCTS',
        modalTitle:s.modalTitle||'Find the perfect', modalHighlight:s.modalHighlight||'fit',
        modalDescription:s.modalDescription||'Compare key features, specs and benefits.',
        showRatings:s.showRatings!==false, showSavings:s.showSavings!==false,
        showCompareAt:s.showCompareAt!==false, showCart:s.showCart!==false,
        showIcons:s.showIcons!==false, showEmpty:s.showEmpty!==false, hideEmptyRows:s.hideEmptyRows!==false,
        showColors:s.showColors!==false, showThumbnails:s.showThumbnails!==false,
        showNames:s.showNames!==false, showClear:s.showClear!==false, showHeading:s.showHeading!==false,
        barHeight:Math.max(100,Math.min(280,Number(s.barHeight ?? 158) || 158)),
        barMobileHeight:Math.max(0,Math.min(240,Number(s.barMobileHeight ?? 0) || 0)),
        barBottom:Number(s.barBottom)||0, barWidth:Number(s.barWidth)||2000,
        barRadius:Number(s.barRadius)||24, barImageSize:Number(s.barImageSize)||74,
        modalWidth:Number(s.modalWidth)||1320, modalRadius:Number(s.modalRadius)||16,
        backdropOpacity:Math.max(0,Math.min(90,Number(s.backdropOpacity)||55)),
        moneyFormat:s.moneyFormat||'{{amount}}'
      };
    }
    compareMoney(cents) {
      return formatMoney(cents, this.config.moneyFormat || this.compareSettings.moneyFormat, this.config.currency || '');
    }
    compareElement(tag, cls='', content='') {
      const el=document.createElement(tag); if(cls)el.className=cls;
      if(content!==undefined && content!==null)el.textContent=String(content);
      return el;
    }
    compareIcon(kind='check') {
      const icons = {
        check:'<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7 12 3 3 7-7" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>',
        wave:'<path d="M2 12h3l2-7 3 14 3-10 2 6 2-3h5"/>',
        battery:'<rect x="3" y="7" width="17" height="10" rx="2"/><path d="M22 10v4"/>',
        circle:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
        bluetooth:'<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',
        microphone:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8"/>',
        weight:'<path d="M12 3c-3 0-5 2-5 5v2L4 21h16l-3-11V8c0-3-2-5-5-5Zm0 4v4"/>',
        water:'<path d="M12 2C8 7 5 11 5 15a7 7 0 0 0 14 0c0-4-3-8-7-13Z"/>',
        box:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16m-8-5v14"/>',
        color:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="7" r="1"/><circle cx="7" cy="13" r="1"/><circle cx="16" cy="13" r="1"/>',
        default:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'
      };
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');
      svg.innerHTML=icons[kind]||icons.default;return svg;
    }
    renderCompare() {
      if (!this.tray) return;
      const s=this.compareSettings, items=compare.getAll();
      this.tray.hidden=!s.enabled||!items.length||this.compareDismissed;
      this.tray.style.setProperty('--sp-compare-bar-height',`${s.barHeight}px`);
      this.tray.style.setProperty('--sp-compare-bar-mobile-height',`${s.barMobileHeight}px`);
      this.tray.style.setProperty('--sp-compare-bar-width',`${s.barWidth}px`);
      this.tray.style.setProperty('--sp-compare-bar-radius',`${s.barRadius}px`);
      this.tray.style.setProperty('--sp-compare-image-size',`${s.barImageSize}px`);
      this.tray.style.setProperty('--sp-compare-bottom',`${s.barBottom}px`);
      const heading=this.tray.querySelector('.sp-commerce-compare-tray__heading'); if(heading)heading.hidden=!s.showHeading;
      const subtitle=this.tray.querySelector('[data-sp-compare-bar-subtitle]');if(subtitle)subtitle.textContent=String(s.barSubtitle).replace(/\b4\b/,String(compare.getMax()));
      const clear=this.tray.querySelector('[data-sp-commerce-compare-clear]');if(clear)clear.hidden=!s.showClear;
      const dialogClear=this.compareDialog?.querySelector('[data-sp-commerce-compare-clear]');if(dialogClear)dialogClear.hidden=!s.showClear;
      const button=this.tray.querySelector('[data-sp-commerce-compare-open]');
      if(button){button.disabled=items.length<2;button.setAttribute('aria-disabled',String(items.length<2));button.setAttribute('aria-label',items.length<2?'Choose at least two products to compare':`${s.compareLabel} ${items.length} products`);button.querySelector('[data-sp-compare-action-label]').textContent=`${s.compareLabel} (${items.length})`;}
      const box=this.tray.querySelector('[data-sp-commerce-compare-items]'); if(box){
        box.replaceChildren();items.forEach(product=>{
          const item=this.compareElement('article','sp-commerce-compare-tray__product');
          let pic=null;
          if(s.showThumbnails){pic=this.compareElement('div','sp-commerce-compare-tray__thumb');if(product.image){const img=document.createElement('img');img.src=imageUrl(product.image,160);img.alt='';img.loading='lazy';pic.append(img);}item.append(pic);}
          if(s.showNames){const link=this.compareElement('a','sp-commerce-compare-tray__name',product.title);link.href=safeHref(product.url);item.append(link);}
          const b=this.compareElement('button','sp-commerce-compare-tray__remove','×');b.type='button';b.dataset.spCommerceCompareRemove='';b.dataset.productId=product.id;b.setAttribute('aria-label',`Remove ${product.title} from compare`);(pic || item).append(b);box.append(item);
        });
      }
      if(this.compareDialog?.open)this.renderCompareDialog();
    }
    openCompare(trigger) {
      if(compare.count()<2){this.announce('Select at least two products to compare.');return;}
      if(!this.compareDialog)return;
      this.trigger.set(this.compareDialog,trigger);
      this.renderCompareDialog();this.openDialog(this.compareDialog);
      requestAnimationFrame(()=>this.compareDialog.querySelector('[data-sp-commerce-close]')?.focus({preventScroll:true}));
    }
    compareGroup(product) {
      const str=`${product?.type||''} ${product?.title||''} ${(product?.tags||[]).join(' ')}`.toLowerCase();
      if(/headphone|earbud|earphone|speaker|sound|audio|bluetooth|microphone/.test(str))return 'Audio';
      if(/shirt|hoodie|jacket|dress|pants|denim|clothing|apparel|sweater|t-shirt/.test(str))return 'Clothing';
      if(/laptop|computer|monitor|phone|camera|electronics|keyboard|tablet/.test(str))return 'Electronics';
      return 'General';
    }
    async loadCompareProduct(item) {
      const key=String(item.id);
      if(!this.compareDetailCache.has(key)) {
        const loading=(async()=>{
          const href=safeHref(item.url);
          const product=await fetchProduct(href);
          let details={specs:[],colors:[],rating:null,ratingCount:null,type:'',tags:[]};
          try {
            const url=new URL(href);url.searchParams.delete('variant');url.searchParams.set('section_id','sp-compare-product-data');
            const res=await fetch(url.toString(),{headers:{'Accept':'text/html'}});
            if(res.ok){const html=await res.text();const doc=new DOMParser().parseFromString(html,'text/html');
              const script=doc.querySelector('[data-sp-compare-product-json]');if(script){const data=safeJson(script.textContent,{});if(String(data.id)===String(product.id))details={...details,...data};}
            }
          }catch(_){/* Product AJAX is the safe fallback; do not manufacture specs */}
          return {item,product,details,group:this.compareGroup({...product,...details})};
        })().catch(err=>{this.compareDetailCache.delete(key);return {item,error:err,product:null,details:{specs:[],colors:[]},group:'General'};});
        this.compareDetailCache.set(key,loading);
      }
      return this.compareDetailCache.get(key);
    }
    renderCompareDialog() {
      const box=this.compareDialog?.querySelector('[data-sp-commerce-compare-table]');if(!box)return;
      const s=this.compareSettings, token=++this.compareRenderToken, items=compare.getAll();
      this.compareDialog.style.setProperty('--sp-compare-modal-width',`${s.modalWidth}px`);
      this.compareDialog.style.setProperty('--sp-compare-modal-radius',`${s.modalRadius}px`);
      this.compareDialog.style.setProperty('--sp-compare-backdrop',String(s.backdropOpacity/100));
      box.replaceChildren(this.compareElement('p','sp-compare-loading','Loading actual product details…'));
      box.setAttribute('aria-busy','true');
      Promise.all(items.map(item=>this.loadCompareProduct(item))).then(data=>{
        if(token!==this.compareRenderToken || !box.isConnected)return;
        this.paintCompareGrid(box,data);
        box.setAttribute('aria-busy','false');
      }).catch(()=>{if(token===this.compareRenderToken){box.replaceChildren(this.compareElement('p','sp-compare-loading','Unable to load comparison. Please try again.'));box.setAttribute('aria-busy','false');}});
    }
    paintCompareGrid(box, data) {
      const s=this.compareSettings;
      const n=data.length;
      const grid=this.compareElement('div','sp-compare-grid');grid.style.setProperty('--sp-compare-columns',String(n));
      const intro=this.compareElement('div','sp-compare-grid__intro');
      intro.append(this.compareElement('p','sp-compare-grid__eyebrow',s.modalEyebrow));
      const heading=this.compareElement('h2','sp-compare-grid__heading');heading.id='SpProductCompareTitle';heading.append(document.createTextNode(`${s.modalTitle} `));heading.append(this.compareElement('span','sp-compare-grid__highlight',s.modalHighlight));intro.append(heading);
      intro.append(this.compareElement('p','sp-compare-grid__description',s.modalDescription));grid.append(intro);
      data.forEach(entry=>grid.append(this.compareProductHeader(entry)));
      const groups=[...new Set(data.map(x=>x.group))], category=groups.length===1?groups[0]:'Mixed';
      let keys=[];let labels=new Map();
      data.forEach(entry=>(entry.details?.specs||[]).forEach(row=>{
        const group=String(row.group||'Common').trim();if(group!=='Common' && group!==category)return;
        const key=String(row.key||row.label);if(!labels.has(key)){labels.set(key,row);keys.push(key);}
      }));
      // Common product data is always available; category fields show only when configured and non-empty.
      let rows=[{label:'Product Type',type:'text',icon:'box',values:data.map(entry=>entry.details?.type||entry.product?.type||null)}];
      keys.forEach(key=>{
        const sample=labels.get(key);
        const values=data.map(entry=>(entry.details?.specs||[]).find(row=>String(row.key||row.label)===key)?.value??null);
        rows.push({label:sample.label,type:sample.type,icon:this.iconForSpec(sample.label),values});
      });
      if(s.showColors && data.some(entry=>(entry.details?.colors||[]).length)) rows.push({label:'Available Colors',type:'colors',icon:'color',values:data.map(entry=>entry.details?.colors||[])});
      rows=rows.filter(row=>{
        const empty=row.values.every(v=>this.compareValueMissing(v));
        return !s.hideEmptyRows || !empty;
      });
      if(!rows.length){rows=[{label:'Specifications',type:'text',icon:'default',values:data.map(()=>null)}];}
      rows.forEach((row,i)=>{
        const alt=i%2===0?' is-alt':'';
        const label=this.compareElement('div',`sp-compare-grid__label${alt}`);if(s.showIcons)label.append(this.compareIcon(row.icon));label.append(this.compareElement('strong','',row.label));grid.append(label);
        row.values.forEach(value=>{const cell=this.compareElement('div',`sp-compare-grid__value${alt}`);this.fillCompareValue(cell,value,row.type);grid.append(cell);});
      });
      box.replaceChildren(grid);
      const status=this.compareDialog.querySelector('[data-sp-compare-status]');
      if(status){status.textContent=category==='Mixed'?'Different product types: showing shared attributes and configured common specifications.':'';}
    }
    compareValueMissing(value) {
      return value===null||value===undefined||value===''||(Array.isArray(value)&&value.length===0);
    }
    iconForSpec(label) {
      const t=String(label||'').toLowerCase();
      if(/noise|cancell/.test(t))return'wave';if(/battery|power/.test(t))return'battery';
      if(/driver/.test(t))return'circle';if(/bluetooth|wireless/.test(t))return'bluetooth';
      if(/microphone|mic/.test(t))return'microphone';if(/weight/.test(t))return'weight';
      if(/water|resistan/.test(t))return'water';if(/color/.test(t))return'color';
      if(/travel|case|device/.test(t))return'box';return'default';
    }
    fillCompareValue(cell,value,type) {
      const s=this.compareSettings;
      if(this.compareValueMissing(value)){if(s.showEmpty)cell.textContent='—';return;}
      if(type==='colors') {
        const wrap=this.compareElement('div','sp-compare-grid__swatches');
        value.forEach(entry=>{
          const color=String(entry.color||'');const name=String(entry.name||'Color');
          if(color && (/^#[0-9a-f]{3,8}$/i.test(color)||/^rgb\(/i.test(color))){
            const dot=this.compareElement('span','sp-compare-grid__swatch');dot.style.backgroundColor=color;dot.title=name;dot.setAttribute('aria-label',name);wrap.append(dot);
          }else{const label=this.compareElement('span','sp-compare-grid__color-name',name);wrap.append(label);}
        });cell.append(wrap);return;
      }
      if(typeof value==='boolean'||type==='boolean'){
        const truth=value===true||String(value).toLowerCase()==='true';
        if(truth){const icon=this.compareIcon('check');icon.classList.add('sp-compare-grid__bool');cell.append(icon);}else cell.textContent='—';return;
      }
      if(Array.isArray(value)){cell.textContent=value.map(v=>typeof v==='object'?String(v?.name??v?.value??''):String(v)).filter(Boolean).join(', ')||'—';return;}
      if(typeof value==='object'){
        if(value.value!==undefined){cell.textContent=`${value.value}${value.unit?' '+value.unit:''}`;return;}
        cell.textContent='—';return;
      }
      cell.textContent=String(value);
    }
    compareProductHeader(entry) {
      const s=this.compareSettings, item=entry.item, product=entry.product;
      const card=this.compareElement('article','sp-compare-grid__product');
      const remove=this.compareElement('button','sp-compare-grid__remove','×');remove.type='button';remove.dataset.spCommerceCompareRemove='';remove.dataset.productId=item.id;remove.setAttribute('aria-label',`Remove ${item.title} from comparison`);card.append(remove);
      const link=this.compareElement('a','sp-compare-grid__image');link.href=safeHref(item.url);if(item.image){const pic=document.createElement('img');pic.src=imageUrl(item.image,420);pic.alt=item.title;pic.loading='lazy';link.append(pic);}card.append(link);
      const title=this.compareElement('a','sp-compare-grid__product-name',product?.title||item.title);title.href=safeHref(item.url);card.append(title);
      const rating=entry.details?.rating, count=Number(entry.details?.ratingCount);const number=Number(typeof rating==='object'?rating?.rating:rating);
      if(s.showRatings && Number.isFinite(number) && number>0){
        const review=this.compareElement('div','sp-compare-grid__reviews');const stars=this.compareElement('span','sp-compare-grid__stars','★★★★★');const max=Number(rating?.scale_max||5)||5;stars.style.setProperty('--sp-compare-rating-fill',`${Math.max(0,Math.min(100,number/max*100))}%`);review.append(stars);
        review.append(this.compareElement('span','',`${number.toFixed(1)}${Number.isFinite(count)&&count>0?` (${count.toLocaleString()})`:''}`));card.append(review);
      }
      const selectedId=(()=>{try{return new URL(item.url,location.href).searchParams.get('variant');}catch(_){return null;}})();
      const variant=product?.variants?.find(v=>String(v.id)===String(selectedId))||product?.variants?.find(v=>v.available)||product?.variants?.[0]||null;
      const current=variant?.price??item.price, old=variant?.compareAt??item.compareAt;
      const pricing=this.compareElement('div','sp-compare-grid__pricing');if(current!==''&&current!=null){const money=Number(current);pricing.append(this.compareElement('b','',this.compareMoney(money)));if(Number(old)>money && Number(old)>0){if(s.showCompareAt)pricing.append(this.compareElement('s','',this.compareMoney(old)));if(s.showSavings)pricing.append(this.compareElement('span','sp-compare-grid__saving',`Save ${Math.round((Number(old)-money)/Number(old)*100)}%`));}}card.append(pricing);
      if(s.showCart){const button=this.compareElement('button','sp-compare-grid__cart',product?.variants?.length>1?'Choose options':'Add to cart');button.type='button';button.dataset.spCompareAddCart='';button.dataset.productId=item.id;button.disabled=!variant?.available||Boolean(entry.error);card.append(button);}
      if(entry.error)card.append(this.compareElement('small','sp-compare-grid__error','Product information unavailable'));
      return card;
    }
    async addComparedProduct(button) {
      if(button.disabled)return; const id=String(button.dataset.productId||'');const item=compare.getAll().find(p=>p.id===id);if(!item)return;
      const status=this.compareDialog?.querySelector('[data-sp-compare-status]');button.disabled=true;
      try {
        const entry=await this.loadCompareProduct(item);if(!entry.product)throw new Error('Product unavailable');
        const card=document.querySelector(`[data-sp-product-card][data-product-id="${CSS.escape(id)}"], [data-sp-wishlist-card][data-product-id="${CSS.escape(id)}"]`);
        const temp=card||document.createElement('div');
        if(!card){temp.dataset.productUrl=item.url;temp.dataset.productId=id;temp.dataset.productTitle=item.title;temp.dataset.productImage=item.image;}
        const product=entry.product;
        if(product.variants.length!==1 || !product.variants[0]?.available){
          if(this.compareDialog?.open)this.compareDialog.close();
          await this.openFromCard(temp,'quick-add',document.activeElement,{moneyFormat:this.compareSettings.moneyFormat});
        } else {
          // Route through the existing product-card submission flow and default Spider cart controller.
          service.cards.controller?.submitVariant(temp,product.variants[0].id,1);
          if(status)status.textContent='Adding product to your cart…';
        }
      }catch(_){if(status)status.textContent='Unable to add this item. Please open its product page.';}
      finally{button.disabled=false;}
    }
    restoreFocus(dialog) { const trigger=this.trigger.get(dialog); if(trigger?.isConnected) try{trigger.focus({preventScroll:true});}catch(_){} this.trigger.delete(dialog); }
    announce(message) { const live=this.root?.querySelector('[data-sp-commerce-live]'); if(live){live.textContent='';requestAnimationFrame(()=>{live.textContent=message;});} }
  }


  class GlobalCardController {
    constructor() {
      this.abort = new AbortController(); this.signal = this.abort.signal; this.pendingCards = new WeakMap();
      document.addEventListener('click', (event) => this.onClick(event), { signal: this.signal });
      document.addEventListener('sp:wishlist:change', () => this.syncStates(), { signal: this.signal });
      document.addEventListener('sp:wishlist:ready', () => this.syncStates(), { signal: this.signal });
      document.addEventListener('sp:compare:change', () => this.syncStates(), { signal: this.signal });
      document.addEventListener('shopify:section:load', (event) => this.decorate(event.target), { signal: this.signal });
      this.decorate(document); this.syncStates();
    }
    cardFrom(target) { return target?.closest?.('[data-sp-product-card], [data-sp-featured-card], [data-sp-collections-grid-tabs-card], [data-sp-wishlist-card]') || null; }
    async onClick(event) {
      const qv=event.target.closest('[data-sp-product-quick-view]'); if(qv){const card=this.cardFrom(qv); if(card){event.preventDefault(); service.ui?.openFromCard(card,'quick-view',qv,this.configFrom(card));} return;}
      const qa=event.target.closest('[data-sp-product-quick-add]'); if(qa){const card=this.cardFrom(qa); if(card){event.preventDefault(); const directId=String(qa.dataset.spDirectVariantId||''); if(directId)this.submitVariant(card,directId,1);else service.ui?.openFromCard(card,'quick-add',qa,this.configFrom(card));} return;}
      const wish=event.target.closest('[data-sp-product-wishlist]'); if(wish){const card=this.cardFrom(wish); if(card){event.preventDefault(); const summary=summaryFromCard(card); if(!window.SpiderWishlist?.toggle){this.announce('Wishlist service is unavailable.');return;} const execute=()=>window.SpiderWishlist.toggle(summary); if(card.dataset.productContext==='wishlist'&&window.SpiderWishlist.has?.(summary.id)&&!matchMedia?.('(prefers-reduced-motion: reduce)').matches){card.classList.add('is-removing');setTimeout(execute,170);}else execute();} return;}
      const cmp=event.target.closest('[data-sp-product-compare]'); if(cmp && service.ui?.compareSettings?.enabled === false) return; if(cmp){const card=this.cardFrom(cmp); if(card){event.preventDefault(); compare.toggle(summaryFromCard(card));} return;}
      const qtyButton=event.target.closest('[data-sp-card-qty-step]');
      if(qtyButton){const card=this.cardFrom(qtyButton);if(card){event.preventDefault();const input=card.querySelector('[data-sp-product-card-quantity-value]');const output=card.querySelector('[data-sp-card-qty-output]');if(input){const control=qtyButton.closest('[data-min-quantity]');const min=Math.max(1,Number(control?.dataset.minQuantity)||1);const inc=Math.max(1,Number(control?.dataset.increment)||1);const max=Number(control?.dataset.maxQuantity)||Infinity;const current=Math.max(min,Number(input.value)||min);const delta=Number(qtyButton.dataset.spCardQtyStep)||0;const next=Math.max(min,Math.min(max,current+delta*inc));input.value=String(next);if(output)output.textContent=String(next);}}return;}
      const thumb=event.target.closest('[data-sp-product-card-variant-thumb]');
      if(thumb){const card=this.cardFrom(thumb);if(card&&!thumb.disabled){event.preventDefault();try{const product=await this.productForCard(card);const variant=product.variants.find(v=>String(v.id)===String(thumb.dataset.variantId));if(variant?.available)await this.applyVariant(card,product,variant,variant.options.slice());}catch(_){const status=card.querySelector('[data-sp-product-card-option-status]');if(status)status.textContent='Unable to select this variant.';}}return;}
      const option=event.target.closest('[data-sp-product-card-option]'); if(option){const card=this.cardFrom(option); if(card && !option.disabled){event.preventDefault(); this.selectOption(card,option);} return;}
    }
    submitVariant(card,variantId,quantity=1){if(!variantId)return;const form=document.createElement('form');form.method='post';const host=card.closest('[data-sp-product-section],sp-featured-collection,sp-collections-grid-tabs,sp-wishlist');form.action=host?.dataset?.cartAddUrl||`${storefrontRoot()}cart/add`;form.hidden=true;form.setAttribute('data-product-card-form','');form.innerHTML=`<input name="id" value="${escapeHtml(variantId)}"><input name="quantity" value="${Math.max(1,Number(quantity)||1)}">`;document.body.append(form);form.requestSubmit();setTimeout(()=>form.remove(),1000);}
    configFrom(card){const host=card.closest('[data-sp-product-section],sp-featured-collection,sp-collections-grid-tabs,sp-wishlist');let map='';try{map=JSON.parse(host?.dataset?.swatchColorMapJson||'""')}catch(_){map=host?.dataset?.swatchColorMapJson||''}return{source:host||card,moneyFormat:host?.dataset?.moneyFormat||'{{amount}}',currency:host?.dataset?.currency||'',compareMax:service.ui?.compareSettings?.max||4,buyNow:host?.dataset?.buyNow!=='false',showWishlist:card.dataset.showWishlist!=='false',showCompare:card.dataset.showCompare!=='false',showQuickAdd:card.dataset.showQuickAdd!=='false',swatchMap:map,colorShape:card.dataset.colorShape||'circle',sizeShape:card.dataset.sizeShape||'square'};}
    selected(card){
      const initial=safeJson(card.dataset.selectedOptions||card.dataset.initialOptions||'[]',[]).map(String);
      card.querySelectorAll('[data-sp-card-option-group]').forEach(group=>{
        const i=Number(group.dataset.optionIndex);
        const active=group.querySelector('[data-sp-product-card-option][aria-pressed="true"]');
        if(active)initial[i]=String(active.dataset.optionValue||'');
      });
      return initial;
    }
    productForCard(card){
      let product=this.pendingCards.get(card);
      if(!product){product=fetchProduct(card.dataset.productUrl);this.pendingCards.set(card,product);}
      return product;
    }
    async selectOption(card,button){
      const group=button.closest('[data-sp-card-option-group]');
      if(!group)return;
      const optionIndex=Number(button.dataset.optionIndex);
      const optionValue=String(button.dataset.optionValue||'');
      const selected=this.selected(card);
      selected[optionIndex]=optionValue;
      try{
        const product=await this.productForCard(card);
        const color=isColorOption(product,optionIndex);
        const variant=color
          ? getCardPreviewVariant(product,{optionIndex,optionValue,selectedOptions:selected})
          : getExactVariant(product,selected);
        if(!variant?.available){
          const status=card.querySelector('[data-sp-product-card-option-status]');
          if(status)status.textContent='This option is unavailable.';
          return;
        }
        await this.applyVariant(card,product,variant,variant.options.slice());
      }catch(_){
        this.pendingCards.delete(card);
        const status=card.querySelector('[data-sp-product-card-option-status]');
        if(status)status.textContent='Unable to update this option. Open Choose Options to continue.';
      }
    }
    updateCardOptionState(card,product,selected){
      card.querySelectorAll('[data-sp-product-card-option]').forEach(btn=>{
        const i=Number(btn.dataset.optionIndex);
        const value=String(btn.dataset.optionValue||'');
        const color=isColorOption(product,i);
        let possible=false;
        if(color){
          possible=product.variants.some(v=>v.available&&String(v.options[i])===value);
        }else{
          const candidate=selected.slice();candidate[i]=value;
          possible=Boolean(getExactVariant(product,candidate)?.available);
        }
        btn.disabled=!possible;
        btn.setAttribute('aria-disabled',String(!possible));
        const active=String(selected[i]||'')===value;
        btn.classList.toggle('is-selected',active);
        btn.setAttribute('aria-pressed',String(active));
      });
      card.querySelectorAll('[data-sp-card-option-group]').forEach(group=>{
        const i=Number(group.dataset.optionIndex);
        const label=group.querySelector('[data-sp-card-option-label]');
        if(label)label.textContent=selected[i]||'';
      });
    }
    updateVariantMedia(card,product,variant){
      const primary=card.querySelector('.sp-product-card__image--primary,[data-sp-product-primary-image],[data-sp-wishlist-image]');
      const target=variant?.image||product?.featuredImage||'';
      if(!primary||!target)return Promise.resolve();
      const finalSrc=imageUrl(target,900);
      const token=String((Number(card.dataset.variantMediaToken||0)+1));
      card.dataset.variantMediaToken=token;
      primary.classList.add('is-changing-variant');
      const apply=()=>{
        if(card.dataset.variantMediaToken!==token)return;
        primary.removeAttribute('srcset');
        primary.src=finalSrc;
        primary.alt=product?.title||primary.alt||'';
        primary.hidden=false;
        card.dataset.productImage=target;
        card.classList.add('has-variant-media-selected');
        requestAnimationFrame(()=>primary.classList.remove('is-changing-variant'));
      };
      return new Promise((resolve)=>{
        const preload=new Image();
        preload.onload=()=>{apply();resolve();};
        preload.onerror=()=>{apply();resolve();};
        preload.src=finalSrc;
        if(preload.complete){apply();resolve();}
      });
    }
    async applyVariant(card,product,variant,selected){
      const status=card.querySelector('[data-sp-product-card-option-status]');
      this.updateCardOptionState(card,product,selected);
      card.dataset.selectedVariantId=String(variant.id||'');
      card.dataset.selectedOptions=JSON.stringify(selected.map(String));
      card.dataset.productPrice=String(variant.price||0);
      card.dataset.productCompareAt=String(variant.compareAt||0);
      card.querySelectorAll('[data-sp-product-card-variant]').forEach(input=>{input.value=variant.id;});
      if(status)status.textContent=variant.available?'':'This variant is sold out.';
      const price=card.querySelector('[data-sp-product-card-price]');
      if(price){
        const cfg=this.configFrom(card);
        const current=escapeHtml(formatMoney(variant.price,cfg.moneyFormat,cfg.currency));
        const comparePrice=variant.compareAt>variant.price?` <s>${escapeHtml(formatMoney(variant.compareAt,cfg.moneyFormat,cfg.currency))}</s>`:'';
        price.innerHTML=`<span class="sp-price"><span>${current}</span>${comparePrice}</span>`;
      }
      const base=card.dataset.productBaseUrl||String(card.dataset.productUrl||product.url||'/').split('?')[0];
      card.dataset.productBaseUrl=base;
      const selectedUrl=urlWithVariant(base,variant.id);
      card.dataset.productUrl=selectedUrl;
      card.querySelectorAll('.sp-product-card__media,.sp-product-card__title a,[data-sp-wishlist-media-link],[data-sp-wishlist-title]').forEach(link=>{link.href=selectedUrl;});
      card.querySelectorAll('[data-sp-product-card-variant-thumb]').forEach(btn=>{const active=String(btn.dataset.variantId)===String(variant.id);btn.classList.toggle('is-selected',active);btn.setAttribute('aria-pressed',String(active));});
      const stock=card.querySelector('[data-sp-stock-wrap]');
      if(stock){const label=stock.querySelector('[data-sp-stock-label]');const track=stock.querySelector('.sp-product-card__stock-track');const fill=stock.querySelector('[data-sp-stock-fill]');const limit=Math.max(1,Number(card.dataset.stockThreshold)||10);const tracked=variant.inventoryTracked&&variant.inventoryQty!==null;if(label)label.textContent=!variant.available?'Sold out':tracked&&variant.inventoryQty<=limit?`Only ${Math.max(0,variant.inventoryQty)} left`:'Available';if(track){track.hidden=!tracked;if(tracked){const qty=Math.max(0,variant.inventoryQty);track.setAttribute('aria-valuenow',String(Math.min(limit,qty)));if(fill)fill.style.width=`${Math.min(100,qty/limit*100)}%`;}}}
      const qas=card.querySelectorAll('[data-sp-product-quick-add]');
      qas.forEach(button=>{if(product.variants.length===1)button.dataset.spDirectVariantId=String(variant.id);});
      await this.updateVariantMedia(card,product,variant);
    }
    decorate(root=document){root.querySelectorAll?.('[data-sp-product-card]').forEach(card=>{card.querySelectorAll('[data-sp-swatch-value]').forEach(btn=>{if(btn.dataset.spSwatchDecorated)return;btn.dataset.spSwatchDecorated='true';const native=btn.dataset.spSwatchNativeImage||'';const nativeColor=btn.dataset.spSwatchNativeColor||'';const resolved=nativeColor||btn.dataset.spSwatchResolved||resolveSwatch(btn.dataset.spSwatchValue||'',parseSwatchMap(this.configFrom(card).swatchMap||''));const visual=btn.querySelector('.sp-product-card__swatch-visual');if(native){if(visual)visual.style.backgroundImage=`url("${native.replace(/"/g,'\\"')}")`;}else if(resolved){if(visual){if(/gradient\(/i.test(resolved))visual.style.backgroundImage=resolved;else visual.style.backgroundColor=resolved;}if(/gradient\(/i.test(resolved))btn.style.setProperty('--sp-product-swatch-image',resolved);else btn.style.setProperty('--sp-product-swatch',resolved);}});});this.syncStates(root);}
    syncStates(root=document){root.querySelectorAll?.('[data-sp-product-card], [data-sp-wishlist-card]').forEach(card=>{const id=String(card.dataset.productId||'');const wish=Boolean(window.SpiderWishlist?.has?.(id));const compared=compare.has(id);card.querySelectorAll('[data-sp-product-wishlist]').forEach(b=>{b.classList.toggle('is-active',wish);b.setAttribute('aria-pressed',String(wish));b.setAttribute('aria-label',wish?'Remove product from wishlist':'Add product to wishlist');});card.querySelectorAll('[data-sp-product-compare]').forEach(b=>{b.hidden=service.ui?.compareSettings?.enabled===false;b.classList.toggle('is-active',compared);b.setAttribute('aria-pressed',String(compared));b.setAttribute('aria-label',compared?'Remove product from compare':'Add product to compare');});});service.ui?.syncDialogStates?.();}
    announce(message){service.ui?.announce?.(message);}
  }

  const service = {
    version: VERSION, storageKey: COMPARE_KEY, compare,
    products: { cache: productCache, rawCache: productData.cache || rawProductCache, data: productData, productJsonUrl, normalize: normalizeProduct, fetch: fetchProduct, invalidate(href){try{const key=productJsonUrl(href);productCache.delete(key);}catch(_){} productData.invalidate?.(href);}, exactVariant: getExactVariant, cardPreviewVariant: getCardPreviewVariant, summaryFromCard, summaryFromProduct, imageUrl },
    swatches: { normalizeColorName, parseMap: parseSwatchMap, resolve: resolveSwatch },
    money: { format: formatMoney }, cards: { controller: null, sync(root=document){ if(!service.cards.controller) service.cards.controller=new GlobalCardController(); service.cards.controller.decorate(root); } }, helpers: { escapeHtml, stripHtml, safeHref, storefrontRoot, urlWithVariant }, ui: null,
    bindUI(root = document.querySelector('[data-sp-product-commerce-ui]')) { if(!root) return null; if(!this.ui || this.ui.root!==root)this.ui=new CommerceUI(root); return this.ui; }
  };
  window.SpiderProductCommerce = service;
  const boot=()=>{service.bindUI(); if(!service.cards.controller) service.cards.controller=new GlobalCardController();}; if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.dispatchEvent(new CustomEvent('sp:product-commerce:ready',{detail:{version:VERSION,service}})); document.dispatchEvent(new CustomEvent('sp:commerce:ready',{detail:{version:VERSION,service}}));
})();
