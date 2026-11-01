(() => {
  'use strict';

  const TAG = 'sp-wishlist';

  const commerce = () => window.SpiderProductCommerce || null;

  const parseSwatchMap = (raw) => {
    const parser = commerce()?.swatches?.parseMap;
    return typeof parser === 'function' ? parser(raw) : new Map();
  };



  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');


  const storefrontRoot = () => {
    const shared = commerce()?.helpers?.storefrontRoot;
    if (typeof shared === 'function') return shared();
    const raw = String(window.Shopify?.routes?.root || '/').trim() || '/';
    return `/${raw.replace(/^\/+|\/+$/g, '')}${raw === '/' ? '' : '/'}`.replace(/^\/\//, '/');
  };

  const productPathFromHandle = (handle) => {
    const safeHandle = String(handle || '').trim();
    return safeHandle ? `${storefrontRoot()}products/${encodeURIComponent(safeHandle)}` : '';
  };

  const formatWishlistMoney = (cents, root) => {
    const formatter = commerce()?.money?.format;
    if (typeof formatter !== 'function') return String(Number(cents || 0) / 100);
    return formatter(cents, root?.dataset?.moneyFormat || '{{amount}}', root?.dataset?.currency || '');
  };


  const imageUrl = (url, width = 720) => {
    const helper = commerce()?.products?.imageUrl;
    return typeof helper === 'function' ? helper(url, width) : String(url || '');
  };

  const REQUIRED_WISHLIST_METHODS = ['has', 'count', 'getAll', 'getProducts', 'get', 'registerProduct', 'add', 'remove', 'toggle', 'clear', 'subscribe', 'sync'];

  const isValidWishlistService = (service) => {
    const sharedValidator = window.SpiderWishlistCore?.isValidService;
    if (typeof sharedValidator === 'function') {
      try { return Boolean(sharedValidator(service)); } catch (_) {}
    }
    return Boolean(service && REQUIRED_WISHLIST_METHODS.every((method) => typeof service[method] === 'function'));
  };

  const isValidCommerceService = (service) => Boolean(
    service && typeof service.products?.fetch === 'function' && typeof service.products?.exactVariant === 'function' && typeof service.swatches?.resolve === 'function'
  );

  const ensureProductCommerce = (timeout = 5000) => {
    if (isValidCommerceService(window.SpiderProductCommerce)) return Promise.resolve(window.SpiderProductCommerce);
    return new Promise((resolve, reject) => {
      let timer;
      const done = (service) => {
        if (!isValidCommerceService(service)) return false;
        clearTimeout(timer);
        document.removeEventListener('sp:product-commerce:ready', onReady);
        resolve(service);
        return true;
      };
      const onReady = (event) => done(event.detail?.service || window.SpiderProductCommerce);
      document.addEventListener('sp:product-commerce:ready', onReady);
      timer = setTimeout(() => {
        document.removeEventListener('sp:product-commerce:ready', onReady);
        reject(new Error('Spider Product Commerce is unavailable'));
      }, timeout);
    });
  };

  class WishlistResolveError extends Error {
    constructor(message, { code = 'WISHLIST_RESOLVE_ERROR', kind = 'network', productId = '', url = '', cause = null } = {}) {
      super(message);
      this.name = 'WishlistResolveError';
      this.code = code;
      this.kind = kind;
      this.productId = String(productId || '');
      this.url = String(url || '');
      if (cause) this.cause = cause;
    }
  }

  const ensureWishlistCore = (src) => {
    const current = window.SpiderWishlist;
    if (current?._spiderWishlistCoreV4 === true && isValidWishlistService(current)) return Promise.resolve(current);
    if (!src) return Promise.reject(new Error('Spider Wishlist core URL is unavailable'));
    if (window.__SPIDER_WISHLIST_CORE_LOADING__) return window.__SPIDER_WISHLIST_CORE_LOADING__;

    const targetSrc = new URL(src, window.location.href).href;
    window.__SPIDER_WISHLIST_CORE_LOADING__ = new Promise((resolve, reject) => {
      let settled = false;
      let recoveryStarted = false;
      let timer = null;

      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener('sp:wishlist:ready', onReady);
      };
      const succeed = (service = window.SpiderWishlist) => {
        if (settled || !isValidWishlistService(service) || service?._spiderWishlistCoreV4 !== true) return false;
        settled = true;
        cleanup();
        resolve(service);
        return true;
      };
      const fail = (message) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };
      const onReady = (event) => succeed(event.detail?.service || window.SpiderWishlist);
      document.addEventListener('sp:wishlist:ready', onReady);

      const appendCore = () => {
        if (settled) return;
        recoveryStarted = true;
        window.__SPIDER_WISHLIST_CORE_V4__ = false;
        const script = document.createElement('script');
        script.src = targetSrc;
        script.defer = true;
        script.dataset.spWishlistCoreDynamic = '';
        script.addEventListener('load', () => {
          script.dataset.spWishlistCoreLoaded = 'true';
          if (!succeed()) fail('Spider Wishlist core loaded without a compatible V4 service');
        }, { once: true });
        script.addEventListener('error', () => fail('Unable to load Spider Wishlist core'), { once: true });
        document.head.append(script);
      };

      if (succeed()) return;

      const existing = [...document.scripts].find((script) => script.src === targetSrc);
      if (!existing) {
        appendCore();
      } else {
        existing.addEventListener('load', () => {
          existing.dataset.spWishlistCoreLoaded = 'true';
          succeed();
        }, { once: true });
        existing.addEventListener('error', () => {
          if (!recoveryStarted) {
            existing.remove();
            appendCore();
          }
        }, { once: true });

        // A script tag can already be loaded while a stale/partial service remains.
        // Recover by replacing that tag only after giving a normal deferred load a chance to finish.
        setTimeout(() => {
          if (settled || succeed()) return;
          if (!recoveryStarted) {
            existing.remove();
            appendCore();
          }
        }, 800);
      }

      timer = setTimeout(() => {
        if (!succeed()) fail('Unable to initialize Spider Wishlist core before timeout');
      }, 5000);
    }).finally(() => {
      window.__SPIDER_WISHLIST_CORE_LOADING__ = null;
    });

    return window.__SPIDER_WISHLIST_CORE_LOADING__;
  };

  class SpiderWishlistPage extends HTMLElement {
    connectedCallback() {
      if (this._connected) return;
      this._connected = true;
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.service = isValidWishlistService(window.SpiderWishlist) ? window.SpiderWishlist : null;
      this.cardTemplate = this.querySelector('[data-sp-wishlist-card-template]');
      this.grid = this.querySelector('[data-sp-wishlist-grid]');
      this.empty = this.querySelector('[data-sp-wishlist-empty]');
      this.error = this.querySelector('[data-sp-wishlist-error]');
      this.errorTitle = this.querySelector('[data-sp-wishlist-error-title]');
      this.errorMessage = this.querySelector('[data-sp-wishlist-error-message]');
      this.clearUnresolvedButton = this.querySelector('[data-sp-wishlist-clear-unresolved]');
      this.partial = this.querySelector('[data-sp-wishlist-partial]');
      this.partialMessage = this.querySelector('[data-sp-wishlist-partial-message]');
      this.loading = this.querySelector('[data-sp-wishlist-loading]');
      this.metaBar = this.querySelector('[data-sp-wishlist-meta]');
      this.countNodes = [...this.querySelectorAll('[data-sp-wishlist-page-count]')];
      this.clearConfirm = this.querySelector('[data-sp-wishlist-clear-confirm]');
      this.commerce = window.SpiderProductCommerce || null;
      this.live = this.querySelector('[data-sp-wishlist-live]');
      this.swatchMap = this.readSwatchMap();
      this.products = new Map();
      this.lastFailures = [];
      this.lastSavedCount = 0;
      this.lastTrigger = null;
      this.renderToken = 0;
      this.pageState = 'booting';
      this.suppressChangeRefresh = false;

      this.addEventListener('click', (event) => this.onClick(event), { signal: this.signal });
      document.addEventListener('sp:wishlist:change', () => {
        if (this.service && !this.suppressChangeRefresh) this.refresh();
      }, { signal: this.signal });
      document.addEventListener('sp:compare:change', () => this.syncCompareStates(), { signal: this.signal });
      document.addEventListener('sp:product-commerce:ready', (event) => {
        this.commerce = event.detail?.service || window.SpiderProductCommerce || this.commerce;
        this.syncCompareStates();
      }, { signal: this.signal });
      document.addEventListener('sp:wishlist:ready', (event) => {
        const readyService = event.detail?.service || window.SpiderWishlist;
        if (isValidWishlistService(readyService)) this.service = readyService;
      }, { signal: this.signal });

      this.setPageState('booting');
      this.bootstrap();
    }

    disconnectedCallback() {
      this.refreshAbort?.abort();
      this.abort?.abort();
      this._connected = false;
    }

    async bootstrap() {
      this.setPageState('booting', this.lastSavedCount);
      try {
        this.service = await ensureWishlistCore(this.dataset.coreUrl);
        this.commerce = await ensureProductCommerce();
        if (!this.isConnected) return;
        await this.refresh();
      } catch (error) {
        if (!this.isConnected) return;
        console.error('[Spider Wishlist] Unable to initialize Wishlist core.', error);
        this.setPageState('core-error', this.lastSavedCount);
      }
    }

    async retry() {
      this.lastFailures.forEach((failure) => {
        if (failure.url) this.commerce?.products?.invalidate?.(failure.url);
      });
      this.setPageState('loading', this.lastSavedCount);
      try {
        this.service = await ensureWishlistCore(this.dataset.coreUrl);
        this.commerce = await ensureProductCommerce();
        await this.refresh();
      } catch (error) {
        console.error('[Spider Wishlist] Retry could not initialize Wishlist core.', error);
        if (this.isConnected) this.setPageState('core-error', this.lastSavedCount);
      }
    }

    setPageState(state, count = this.lastSavedCount || 0) {
      this.pageState = state;
      this.dataset.state = state;
      const loading = state === 'booting' || state === 'loading';
      const readyWithItems = state === 'ready-with-items';
      const partial = state === 'partial';
      const readyEmpty = state === 'ready-empty';
      const error = state === 'core-error' || state === 'network-error' || state === 'legacy-unresolved';
      const showGrid = readyWithItems || partial;
      const showMeta = count > 0 && !loading && !readyEmpty;

      this.setLoading(loading, count);
      if (this.grid) this.grid.hidden = !showGrid;
      this.metaBar?.toggleAttribute('hidden', !showMeta);
      this.empty?.toggleAttribute('hidden', !readyEmpty);
      this.error?.toggleAttribute('hidden', !error);
      this.partial?.toggleAttribute('hidden', !partial);
      this.renderErrorState(state);
    }

    renderErrorState(state) {
      if (!this.errorTitle || !this.errorMessage) return;
      let title = '';
      let message = '';
      let allowClearUnresolved = false;

      if (state === 'core-error') {
        title = "Wishlist service couldn't start";
        message = 'The shared Spider Wishlist service is unavailable or incompatible. Please retry.';
      } else if (state === 'network-error') {
        title = "Wishlist products couldn't be loaded";
        message = 'Your saved wishlist is still intact. Check your connection and retry loading the current product data.';
        allowClearUnresolved = this.lastFailures.length > 0;
      } else if (state === 'legacy-unresolved') {
        title = 'Some older saved wishlist items need to be refreshed';
        message = 'These saved IDs do not have enough product handle/URL metadata to resolve safely. Nothing was deleted automatically.';
        allowClearUnresolved = this.lastFailures.length > 0;
      }

      if (title) this.errorTitle.textContent = title;
      if (message) this.errorMessage.textContent = message;
      if (this.clearUnresolvedButton) this.clearUnresolvedButton.hidden = !allowClearUnresolved;
    }

    readSwatchMap() {
      try { return parseSwatchMap(JSON.parse(this.dataset.swatchColorMapJson || '""')); }
      catch (_) { return parseSwatchMap(this.dataset.swatchColorMapJson || ''); }
    }

    announce(message) {
      if (!this.live) return;
      this.live.textContent = '';
      requestAnimationFrame(() => { this.live.textContent = message; });
    }

    getWishlistProducts() {
      if (!isValidWishlistService(this.service)) return [];
      try { return this.service.getProducts(); }
      catch (_) { return []; }
    }

    updateCount(count) {
      const safeCount = Math.max(0, Number(count) || 0);
      const label = `${safeCount} ${safeCount === 1 ? 'item' : 'items'}`;
      this.countNodes.forEach((node) => { node.textContent = label; });
    }

    setLoading(active, count = 0) {
      this.loading?.toggleAttribute('hidden', !active);
      this.grid?.setAttribute('aria-busy', active ? 'true' : 'false');
      if (active && this.loading) {
        this.loading.style.setProperty('--sp-wishlist-skeleton-count', String(Math.min(8, Math.max(2, count || 4))));
      }
    }

    async refresh() {
      this.service = isValidWishlistService(window.SpiderWishlist) ? window.SpiderWishlist : this.service;
      this.commerce = isValidCommerceService(window.SpiderProductCommerce) ? window.SpiderProductCommerce : this.commerce;
      if (!isValidWishlistService(this.service) || !isValidCommerceService(this.commerce)) {
        this.setPageState('core-error', this.lastSavedCount);
        return;
      }

      this.refreshAbort?.abort();
      this.refreshAbort = new AbortController();
      const refreshSignal = this.refreshAbort.signal;
      const token = ++this.renderToken;

      this.service.backfillFromDOM?.(document);
      const items = this.getWishlistProducts();
      this.lastSavedCount = items.length;
      this.updateCount(items.length);

      if (!items.length) {
        this.lastFailures = [];
        this.products.clear();
        if (this.grid) this.grid.innerHTML = '';
        this.setPageState('ready-empty', 0);
        return;
      }

      this.setPageState('loading', items.length);

      const results = new Array(items.length);
      const failures = new Array(items.length);
      let nextIndex = 0;
      const workers = Array.from({ length: Math.min(5, items.length) }, async () => {
        while (nextIndex < items.length && !refreshSignal.aborted) {
          const index = nextIndex++;
          try {
            results[index] = await this.resolveItem(items[index], refreshSignal);
          } catch (error) {
            if (error?.name === 'AbortError') return;
            const failure = error instanceof WishlistResolveError
              ? error
              : new WishlistResolveError(error?.message || 'Product could not be loaded', {
                  kind: 'network', productId: items[index]?.id || '', cause: error
                });
            failures[index] = failure;
            console.warn('[Spider Wishlist] Wishlist item could not be resolved.', items[index]?.id || '', failure);
          }
        }
      });

      await Promise.all(workers);
      if (token !== this.renderToken || refreshSignal.aborted || !this.isConnected) return;

      const resolved = results.filter(Boolean);
      this.lastFailures = failures.filter(Boolean);
      this.products.clear();
      resolved.forEach((product) => this.products.set(String(product.id), product));
      this.renderProducts(resolved);
      this.syncCompareStates();
      // Saved count is authoritative; failed hydration must not make the header/page count look empty.
      this.updateCount(items.length);

      if (resolved.length && this.lastFailures.length) {
        const failedCount = this.lastFailures.length;
        if (this.partialMessage) {
          this.partialMessage.textContent = `${failedCount} older or unavailable saved ${failedCount === 1 ? 'item' : 'items'} could not be loaded. The rest of your wishlist is shown below.`;
        }
        this.setPageState('partial', items.length);
        this.announce(`${failedCount} saved ${failedCount === 1 ? 'product' : 'products'} could not be loaded.`);
        return;
      }

      if (resolved.length) {
        this.setPageState('ready-with-items', items.length);
        return;
      }

      const allLegacy = this.lastFailures.length > 0 && this.lastFailures.every((failure) => failure.kind === 'legacy');
      const anyCore = this.lastFailures.some((failure) => failure.kind === 'core');
      if (allLegacy) this.setPageState('legacy-unresolved', items.length);
      else if (anyCore) this.setPageState('core-error', items.length);
      else this.setPageState('network-error', items.length);
    }

    async resolveItem(item, signal = this.signal) {
      const id = String(item?.id || '').trim();
      if (!id) {
        throw new WishlistResolveError('Saved wishlist record is missing its product ID.', { code: 'MISSING_ID', kind: 'legacy' });
      }

      const registered = this.service?.get?.(id);
      if (registered && typeof registered === 'object') item = { ...item, ...registered };

      const handle = String(item?.handle || '').trim();
      const productUrl = String(item?.url || productPathFromHandle(handle)).trim();
      if (!productUrl) {
        throw new WishlistResolveError('Saved wishlist record has no product handle or URL.', {
          code: 'LEGACY_METADATA_MISSING', kind: 'legacy', productId: id
        });
      }
      if (!this.commerce?.products?.fetch) {
        throw new WishlistResolveError('Spider Product Commerce is unavailable.', {
          code: 'PRODUCT_COMMERCE_UNAVAILABLE', kind: 'core', productId: id, url: productUrl
        });
      }

      let product;
      try {
        product = await this.commerce.products.fetch(productUrl, { signal });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new WishlistResolveError(error?.message || 'Unable to fetch current Shopify product data.', {
          code: error?.code || 'PRODUCT_FETCH_FAILED', kind: 'network', productId: id, url: productUrl, cause: error
        });
      }

      if (product.id && String(product.id) !== id) {
        throw new WishlistResolveError('Saved metadata points to a different Shopify product.', {
          code: 'PRODUCT_ID_MISMATCH', kind: 'legacy', productId: id, url: productUrl
        });
      }
      product.id = id;
      if (!product.url) product.url = productUrl;

      this.service.registerProduct({
        id,
        handle: product.handle || handle,
        url: product.url || productUrl,
        title: product.title,
        image: product.featuredImage,
        vendor: product.vendor,
        rating: item?.rating || '',
        addedAt: item?.addedAt
      });

      product.addedAt = Number(item?.addedAt || 0);
      product._wishlistMeta = item || {};
      return product;
    }

    renderProducts(products) {
      this.grid.innerHTML = '';
      const fragment = document.createDocumentFragment();

      products.forEach((product) => {
        if (!this.cardTemplate?.content) return;
        const node = this.cardTemplate.content.firstElementChild.cloneNode(true);
        this.hydrateCard(node, product);
        fragment.append(node);
      });

      this.grid.append(fragment);
      window.SpiderProductCommerce?.cards?.sync?.(this.grid);
    }

    hydrateCard(card, product) {
      card.dataset.productId = String(product.id);
      card.dataset.productHandle = product.handle || '';
      card.dataset.productUrl = product.url || '';
      card.dataset.productBaseUrl = product.url || '';
      card.dataset.productTitle = product.title || '';
      card.dataset.productVendor = product.vendor || '';
      card.dataset.productImage = product.featuredImage || '';
      card.dataset.productAvailable = String(product.available !== false);
      card.dataset.productPrice = String(product.price || 0);
      card.dataset.productCompareAt = String(product.compareAt || 0);
      card.dataset.productContext = 'wishlist';
      card.dataset.colorShape = this.dataset.colorShape || 'circle';
      card.dataset.sizeShape = this.dataset.sizeShape || 'square';
      card.dataset.addedAt = String(product.addedAt || 0);
      card.dataset.priceValue = String(product.price || 0);

      const titleLink = card.querySelector('[data-sp-wishlist-title]');
      if (titleLink) {
        titleLink.textContent = product.title;
        titleLink.href = product.url || this.dataset.continueUrl || '/collections/all';
      }
      const mediaLink = card.querySelector('[data-sp-wishlist-media-link]');
      if (mediaLink) mediaLink.href = product.url || this.dataset.continueUrl || '/collections/all';

      const vendor = card.querySelector('[data-sp-wishlist-vendor]');
      if (vendor) {
        vendor.textContent = product.vendor || '';
        vendor.hidden = !(this.dataset.showVendor === 'true' && product.vendor);
      }
      const rating = card.querySelector('[data-sp-wishlist-rating]');
      const ratingText = product._wishlistMeta?.rating || product.rating || '';
      if (rating) {
        rating.textContent = ratingText;
        rating.hidden = !(this.dataset.showRating === 'true' && ratingText);
      }

      const image = card.querySelector('[data-sp-wishlist-image]');
      const secondary = card.querySelector('[data-sp-wishlist-secondary-image]');
      if (image) {
        if (product.featuredImage) {
          image.src = imageUrl(product.featuredImage, 720);
          image.alt = product.title;
          image.hidden = false;
        } else {
          image.hidden = true;
        }
      }
      if (secondary) {
        const second = this.dataset.showSecondImage === 'true' ? product.images?.[1] : '';
        if (second && second !== product.featuredImage) {
          secondary.src = imageUrl(second, 720);
          secondary.hidden = false;
          card.classList.add('has-secondary-media');
        } else {
          secondary.hidden = true;
          card.classList.remove('has-secondary-media');
        }
      }

      const badges = card.querySelector('[data-sp-wishlist-badges]');
      if (badges) {
        let html = '';
        if (!product.available && !product.unresolved) html += '<span class="sp-wishlist-card__badge sp-product-card__badge sp-product-card__badge--sold">Sold out</span>';
        else if (Number(product.compareAt || 0) > Number(product.price || 0)) html += '<span class="sp-wishlist-card__badge sp-wishlist-card__badge--sale sp-product-card__badge sp-product-card__badge--sale">Sale</span>';
        badges.innerHTML = html;
      }

      const initialVariant = product.variants.find((v) => v.available) || product.variants[0] || null;
      if (initialVariant) {
        card.dataset.initialVariantId = String(initialVariant.id || '');
        card.dataset.selectedVariantId = String(initialVariant.id || '');
        card.dataset.initialOptions = JSON.stringify(initialVariant.options || []);
        card.dataset.selectedOptions = JSON.stringify(initialVariant.options || []);
        if (initialVariant.image) {
          card.dataset.productImage = initialVariant.image;
          if (image) image.src = imageUrl(initialVariant.image, 720);
        }
      }
      this.updateCardPrice(card, product, initialVariant);
      this.renderCardOptions(card, product);

      const remove = card.querySelector('[data-sp-wishlist-remove]');
      if (remove) {
        remove.setAttribute('aria-label', `Remove ${product.title} from wishlist`);
        remove.setAttribute('aria-pressed', 'true');
      }

      const compare = card.querySelector('[data-sp-wishlist-compare]');
      if (compare) compare.hidden = !(this.dataset.showCompare === 'true' && this.compareAvailable());

      const qv = card.querySelector('[data-sp-wishlist-quick-view]');
      if (qv) qv.hidden = this.dataset.showQuickView !== 'true' || product.unresolved;

      const addButtons = card.querySelectorAll('[data-sp-wishlist-quick-add]');
      const forcePurchaseCta = card.dataset.productDesign === '7';
      addButtons.forEach((add) => {
        add.hidden = (this.dataset.showQuickAdd !== 'true' && !forcePurchaseCta) || product.unresolved;
        this.configureCardAdd(add, card, product);
      });

      const unavailable = card.querySelector('[data-sp-wishlist-unresolved]');
      if (unavailable) unavailable.hidden = !product.unresolved;
      card.classList.toggle('is-unresolved', Boolean(product.unresolved));
      card.classList.toggle('is-sold-out', !product.available && !product.unresolved);
    }

    configureCardAdd(button, card, product) {
      const isIconButton = button.classList.contains('sp-product-card__icon-action') || Boolean(button.querySelector('svg'));
      const tooltip = button.querySelector('.sp-product-card__tooltip');
      const setButtonCopy = (label) => {
        button.setAttribute('aria-label', label);
        if (tooltip) tooltip.textContent = label;
        if (!isIconButton) button.textContent = label;
      };

      if (!product.available) {
        setButtonCopy('Sold out');
        button.disabled = true;
        button.removeAttribute('data-sp-direct-variant-id');
        return;
      }

      button.disabled = false;
      const initial = product.variants.find((variant) => variant.available) || product.variants[0] || null;
      if (product.variants.length === 1 && initial?.id) {
        setButtonCopy('Add to cart');
        button.dataset.mode = 'direct';
        button.dataset.spDirectVariantId = String(initial.id);
      } else {
        setButtonCopy('Choose options');
        button.dataset.mode = 'options';
        button.removeAttribute('data-sp-direct-variant-id');
      }
    }

    updateCardPrice(card, product, variant) {
      const price = card.querySelector('[data-sp-wishlist-price]');
      if (!price) return;
      const current = Number(variant?.price ?? product.price ?? 0);
      const compare = Number(variant?.compareAt ?? product.compareAt ?? 0);
      price.innerHTML = `<span class="sp-price"><span class="sp-wishlist-card__price-current">${escapeHtml(formatWishlistMoney(current, this))}</span>` +
        (compare > current ? `<s class="sp-wishlist-card__price-compare">${escapeHtml(formatWishlistMoney(compare, this))}</s>` : '') + '</span>';
      card.dataset.priceValue = String(current);
    }

    renderCardOptions(card, product) {
      const holder = card.querySelector('[data-sp-wishlist-card-options]');
      if (!holder) return;
      holder.innerHTML = '';
      if (!product.options.length || !product.variants.length) return;

      const initial = product.variants.find((variant) => variant.available) || product.variants[0];
      const selected = [...(initial?.options || [])];
      card.dataset.initialOptions = JSON.stringify(selected);
      card.dataset.selectedOptions = JSON.stringify(selected);
      card.dataset.initialVariantId = String(initial?.id || '');
      card.dataset.selectedVariantId = String(initial?.id || '');

      product.options.forEach((option, optionIndex) => {
        const name = String(option.name || '');
        const lower = name.toLowerCase();
        const isColor = lower.includes('color') || lower.includes('colour');
        const isSize = lower.includes('size');
        if ((isColor && this.dataset.showSwatches !== 'true') || (isSize && this.dataset.showSizes !== 'true') || (!isColor && !isSize)) return;

        const group = document.createElement('div');
        group.className = `sp-wishlist-card__option-group sp-product-card__option-group sp-product-card__option-group--${isColor ? 'color' : 'size'}`;
        group.dataset.spCardOptionGroup = '';
        group.dataset.optionIndex = String(optionIndex);
        group.dataset.optionName = name;

        const showLabel = isColor ? this.dataset.showColorLabel === 'true' : this.dataset.showSizeLabel === 'true';
        if (showLabel) {
          const label = document.createElement('div');
          label.className = 'sp-wishlist-card__option-label sp-product-card__option-label';
          label.append(`${isColor ? this.dataset.colorLabel || 'Color' : this.dataset.sizeLabel || 'Size'}: `);
          const strong = document.createElement('strong');
          strong.dataset.spCardOptionLabel = '';
          strong.textContent = selected[optionIndex] || '';
          label.append(strong);
          group.append(label);
        }

        const list = document.createElement('div');
        list.className = isColor
          ? `sp-wishlist-card__swatches sp-product-card__swatches sp-product-card__swatches--${this.dataset.colorShape || 'circle'}`
          : `sp-wishlist-card__swatches sp-product-card__size-swatches sp-product-card__size-swatches--${this.dataset.sizeShape || 'square'}`;
        list.setAttribute('aria-label', `${name} options`);

        option.values.slice(0, Number(this.dataset.swatchLimit || 5)).forEach((value) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = isColor
            ? 'sp-wishlist-card__swatch sp-product-card__swatch sp-product-card__swatch--color'
            : 'sp-wishlist-card__swatch sp-product-card__size-swatch';
          button.dataset.spProductCardOption = '';
          button.dataset.optionIndex = String(optionIndex);
          button.dataset.optionValue = String(value);
          button.setAttribute('aria-label', `${name}: ${String(value)}`);
          const activeValue = String(value) === String(selected[optionIndex]);
          const availableValue = isColor
            ? product.variants.some((variant) => variant.available && String(variant.options?.[optionIndex] || '') === String(value))
            : product.variants.some((variant) => {
                if (!variant.available) return false;
                return variant.options?.every((variantValue, index) =>
                  index === optionIndex ? String(variantValue) === String(value) : String(variantValue) === String(selected[index] || '')
                );
              });
          button.setAttribute('aria-pressed', String(activeValue));
          button.setAttribute('aria-disabled', String(!availableValue));
          button.disabled = !availableValue;
          button.classList.toggle('is-selected', activeValue);
          button.title = String(value);
          if (isColor) {
            button.dataset.spSwatchValue = String(value);
            const visual = document.createElement('span');
            visual.className = 'sp-product-card__swatch-visual';
            visual.setAttribute('aria-hidden', 'true');
            button.append(visual);
          } else {
            button.textContent = String(value);
          }
          list.append(button);
        });
        group.append(list);
        holder.append(group);
      });

      window.SpiderProductCommerce?.cards?.sync?.(card);
    }

    compareAvailable() {
      return Boolean(window.SpiderCompare && typeof window.SpiderCompare.has === 'function' && typeof window.SpiderCompare.toggle === 'function');
    }

    syncCompareStates() {
      const available = this.compareAvailable();
      this.querySelectorAll('[data-sp-wishlist-compare]').forEach((button) => {
        button.hidden = !(this.dataset.showCompare === 'true' && available);
        if (!available) return;
        const card = button.closest('[data-sp-wishlist-card]');
        const active = window.SpiderCompare.has(String(card?.dataset.productId || ''));
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-label', active ? 'Remove from compare' : 'Add to compare');
      });
    }

    showClearConfirm(show) {
      if (!this.clearConfirm) return;
      this.clearConfirm.hidden = !show;
      if (show) this.clearConfirm.querySelector('[data-sp-wishlist-clear-confirm-yes]')?.focus();
    }

    clearUnresolvedItems() {
      const ids = [...new Set(this.lastFailures.map((failure) => String(failure.productId || '')).filter(Boolean))];
      if (!ids.length || !isValidWishlistService(this.service)) return;
      const label = ids.length === 1 ? 'this unresolved saved item' : `these ${ids.length} unresolved saved items`;
      if (!window.confirm(`Remove ${label} from your wishlist?`)) return;

      this.suppressChangeRefresh = true;
      try { ids.forEach((id) => this.service.remove(id)); }
      finally { this.suppressChangeRefresh = false; }
      this.lastFailures = [];
      this.announce(`${ids.length} unresolved ${ids.length === 1 ? 'item' : 'items'} removed from wishlist.`);
      this.refresh();
    }

    onClick(event) {
      const retry = event.target.closest('[data-sp-wishlist-retry]');
      if (retry && this.contains(retry)) {
        event.preventDefault();
        this.retry();
        return;
      }

      const clearUnresolved = event.target.closest('[data-sp-wishlist-clear-unresolved]');
      if (clearUnresolved && this.contains(clearUnresolved)) {
        event.preventDefault();
        this.clearUnresolvedItems();
        return;
      }

      if (event.target.closest('[data-sp-wishlist-clear]')) {
        event.preventDefault();
        this.showClearConfirm(true);
        return;
      }
      if (event.target.closest('[data-sp-wishlist-clear-cancel]')) {
        this.showClearConfirm(false);
        return;
      }
      if (event.target.closest('[data-sp-wishlist-clear-confirm-yes]')) {
        this.showClearConfirm(false);
        try { this.service?.clear?.(); } catch (_) {}
        this.announce('Wishlist cleared.');
      }
    }


  }

  if (!customElements.get(TAG)) customElements.define(TAG, SpiderWishlistPage);
})();
