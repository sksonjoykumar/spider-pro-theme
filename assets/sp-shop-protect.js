/* Spider Shop Protect v2.1 — patched to match Spider Theme 2026 markup and AJAX lifecycle. */
(function () {
  'use strict';

  function truthy(value) { return value === true || value === 'true' || value === '1'; }
  function parseUrl(input, base) {
    try { return new URL(String(input), base || (typeof location !== 'undefined' ? location.href : 'https://example.invalid/')); }
    catch (_) { return null; }
  }
  function hasBestSelling(input, base) {
    const url = parseUrl(input, base);
    return Boolean(url && url.searchParams.getAll('sort_by').includes('best-selling'));
  }
  function sanitizeBestSellingUrl(input, base) {
    const url = parseUrl(input, base);
    if (!url || !hasBestSelling(url.href)) return url;
    const values = url.searchParams.getAll('sort_by').filter(value => value !== 'best-selling');
    url.searchParams.delete('sort_by');
    values.forEach(value => url.searchParams.append('sort_by', value));
    return url;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hasBestSelling, sanitizeBestSellingUrl };
  }
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof HTMLElement === 'undefined') return;

  const EDITABLE = 'input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
  const PRODUCT_CARD = '[data-sp-product-card],.sp-product-card,[data-product-card],[data-sp-collection-product]';
  const PRODUCT_GALLERY = '[data-product-gallery],.sp-product-gallery,.sp-product-media,[data-product-media],.sp-main-product__media';
  const PRODUCT_QUICK = '[data-sp-commerce-qv],.sp-commerce-qv,#SpProductQuickView,[data-sp-quick-view],.sp-quick-view,[data-product-quick-view],#SpProductQuickAdd';
  const PRODUCT_LIGHTBOX = '[data-product-lightbox],.sp-product-lightbox';
  const IMAGE_SHELL = 'picture,.sp-product-card__media,[data-sp-product-media-link],.sp-product-media__surface,[data-media-zoom],.sp-product-gallery__thumb-button,.sp-product-lightbox__figure,.sp-commerce-qv__media';
  const PRODUCT_TEXT = [PRODUCT_CARD, PRODUCT_GALLERY, PRODUCT_QUICK, '[data-main-product]', '[data-product-info]', '.sp-main-product__info', '[id^="ProductInfo-"]', 'main[id*="MainProduct"]'].join(',');
  const MEDIA_SCOPE = [PRODUCT_CARD, PRODUCT_GALLERY, PRODUCT_QUICK, PRODUCT_LIGHTBOX].join(',');
  const NEVER_INTERFERE = [
    'header', '.sp-header', 'footer', '.sp-footer', 'nav',
    '[data-sp-shop-protect-allow]', '[data-sp-copyable]',
    '[data-sp-cart-drawer]', '.sp-cart-drawer', '[data-cart-drawer]',
    '.shopify-payment-button', '[data-shopify-accelerated-checkout]',
    '[data-sp-mobile-toolbar]', '.sp-mobile-toolbar',
    '[role="menu"]', '[role="listbox"]', '[role="combobox"]',
    '[data-sp-shop-protect-ignore]', '[data-sp-shop-protect-exclude]'
  ].join(',');
  const COPYABLE_COUPON = '[data-discount-code],[data-coupon-code],.discount-code,.coupon-code,[data-sp-discount-code]';
  const COPYABLE_SKU = '[data-product-sku],[data-sp-product-sku],.product-sku,.sp-product-sku';
  const COPYABLE_CONTACT = 'address,[data-sp-contact],[data-contact-info],a[href^="mailto:"],a[href^="tel:"]';
  const COPYABLE_TRACKING = '[data-tracking-number],[data-tracking-code],.tracking-number';
  const SORT_VALUE_SELECTOR = [
    'select[name="sort_by"] option[value="best-selling"]',
    '[data-sp-sort-by] option[value="best-selling"]',
    '[role="option"][data-value="best-selling"]',
    '[role="option"][value="best-selling"]',
    '[data-sort-value="best-selling"]',
    'button[name="sort_by"][value="best-selling"]'
  ].join(',');
  const SECTION_HOST = '[data-sp-main-collection],.sp-main-search,[data-sp-main-search]';

  class SpiderShopProtect extends HTMLElement {
    constructor() {
      super();
      this.active = false;
      this.abortController = null;
      this.observerEntries = [];
      this.sortOriginals = new Map();
      this.refreshScheduled = false;
      this.onContextMenu = this.onContextMenu.bind(this);
      this.onCopy = this.onCopy.bind(this);
      this.onDragStart = this.onDragStart.bind(this);
      this.onMouseDown = this.onMouseDown.bind(this);
      this.onRepaint = this.onRepaint.bind(this);
      this.onFacetRender = this.onFacetRender.bind(this);
      this.onSortInteraction = this.onSortInteraction.bind(this);
    }

    connectedCallback() {
      this.readConfig();
      if (window.__spShopProtectOwner && window.__spShopProtectOwner !== this) {
        window.__spShopProtectOwner.deactivate();
      }
      window.__spShopProtectOwner = this;
      if (this.mode === 'off' || !this.pageAllowed || (this.designMode && !this.editorPreview)) {
        this.debug('Disabled by configuration, targeting or Theme Editor.');
        return;
      }
      this.activate();
      this.debug('Active: mode=' + this.mode + ', scope=' + this.scope + ', contextMenu=' + this.contextMenuMode);
    }
    disconnectedCallback() {
      this.deactivate();
      if (window.__spShopProtectOwner === this) window.__spShopProtectOwner = null;
    }
    readConfig() {
      const d = this.dataset;
      this.designMode = truthy(d.designMode) || Boolean(window.Shopify && window.Shopify.designMode);
      this.editorPreview = truthy(d.editorPreview);
      this.mode = d.protectionMode || 'custom';
      this.scope = d.protectionScope || 'product';
      this.disableTextCopy = truthy(d.disableTextCopy);
      this.disableImageCopy = truthy(d.disableImageCopy);
      this.disableImageDrag = truthy(d.disableImageDrag);
      this.contextMenuMode = d.contextMenu || 'images';
      this.protectBackgroundImages = truthy(d.protectBackgroundImages);
      this.gallery = d.protectGallery !== 'false';
      this.cards = d.protectCards !== 'false';
      this.quickView = d.protectQuickView !== 'false';
      this.desktop = d.enableDesktop !== 'false';
      this.mobile = d.enableMobile !== 'false';
      this.allowCoupons = d.allowCouponCopy !== 'false';
      this.allowSku = d.allowSkuCopy !== 'false';
      this.allowContact = d.allowContactCopy !== 'false';
      this.allowTracking = d.allowTrackingCopy !== 'false';
      this.disableBestSeller = truthy(d.disableBestSeller);
      this.sanitizeSortUrl = d.sanitizeSortUrl !== 'false';
      this.debugEnabled = truthy(d.debug);
      this.pageType = (d.pageType || '').toLowerCase();
      this.pageAllowed = this.isPageAllowed(d);
      this.exclusions = this.parseExclusions(d.excludeSelectors || '');

      // Custom means existing saved settings keep their original meaning.
      // Explicit presets do not overwrite any saved Shopify setting value.
      if (this.mode === 'image') {
        this.scope = 'images'; this.disableTextCopy = false;
      } else if (this.mode === 'product') {
        this.scope = 'product'; this.disableTextCopy = false;
      } else if (this.mode === 'store') {
        this.scope = 'store';
      }
    }
    isPageAllowed(d) {
      const type = this.pageType;
      if (type === 'cart' || type.startsWith('customers') || type.includes('account') || type.includes('checkout')) return false;
      const key = { index: 'showHome', product: 'showProduct', collection: 'showCollection', search: 'showSearch', blog: 'showBlog', article: 'showArticle' }[type] || 'showOther';
      return d[key] !== 'false';
    }
    parseExclusions(raw) {
      const selectors = String(raw).split(/[\r\n,]+/).map(x => x.trim()).filter(Boolean).slice(0, 40);
      return selectors.filter(selector => {
        try { document.documentElement.matches(selector); return true; }
        catch (_) { this.debug('Ignored invalid exclusion selector: ' + selector); return false; }
      });
    }
    isMobile() { return window.matchMedia('(max-width: 749px)').matches; }
    deviceAllowed() { return this.isMobile() ? this.mobile : this.desktop; }
    ignored(element, kind) {
      if (!(element instanceof Element)) return true;
      if (element.closest(EDITABLE)) return true;
      if (element.closest(NEVER_INTERFERE)) return true;
      if (kind !== 'image' && element.closest('form,label,button,[role="button"]')) return true;
      if (kind !== 'image' && element.closest('a[href]')) return true;
      if (kind === 'context' && element.closest('a[href]')) return true;
      // Never block core overlays, except the specifically enabled Quick View product media.
      if (!element.closest(PRODUCT_QUICK) && !element.closest(PRODUCT_LIGHTBOX) && element.closest('dialog,[role="dialog"],[aria-modal="true"]')) return true;
      for (const selector of this.exclusions) {
        try { if (element.closest(selector)) return true; } catch (_) { /* Invalid selector must never disable other protection. */ }
      }
      if (this.allowCoupons && element.closest(COPYABLE_COUPON)) return true;
      if (this.allowSku && element.closest(COPYABLE_SKU)) return true;
      if (this.allowContact && element.closest(COPYABLE_CONTACT)) return true;
      if (this.allowTracking && element.closest(COPYABLE_TRACKING)) return true;
      return false;
    }
    mediaAllowed(element) {
      if (this.scope === 'store' || this.scope === 'images') return true;
      if (element.closest(PRODUCT_QUICK)) return this.quickView;
      if (element.closest(PRODUCT_LIGHTBOX)) return this.gallery;
      if (element.closest(PRODUCT_CARD)) return this.cards;
      return this.gallery && Boolean(element.closest(PRODUCT_GALLERY));
    }
    imageFor(target) {
      if (!(target instanceof Element)) return null;
      const image = target.closest('img');
      if (image) return image;
      // Spider product-card media are links. Right-click/drag can target the
      // link, its picture, or a decorative overlay rather than the img node.
      // Restrict fallback to real media shells: never pick an image from an
      // entire card, product page, or unrelated control.
      if (target.closest('button,input,textarea,select,[role="button"],[role="tab"]')) return null;
      const shell = target.closest(IMAGE_SHELL);
      return shell ? shell.querySelector('img') : null;
    }
    protectedImage(target) {
      if (!(target instanceof Element)) return false;
      const image = this.imageFor(target);
      if (image && this.mediaAllowed(image) && !this.ignored(image, 'image')) return true;
      if (!this.protectBackgroundImages) return false;
      let node = target;
      for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
        if (this.mediaAllowed(node) && !this.ignored(node, 'image')) {
          const background = window.getComputedStyle(node).backgroundImage;
          if (background && /url\(/i.test(background)) return true;
        }
      }
      return false;
    }
    textInScope(element) {
      if (!(element instanceof Element) || this.scope === 'images' || this.ignored(element, 'text')) return false;
      return this.scope === 'store' || Boolean(element.closest(PRODUCT_TEXT));
    }
    selectedTextInScope() {
      const selection = window.getSelection && window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
      const anchor = selection.anchorNode;
      const focus = selection.focusNode;
      const toElement = node => node && (node.nodeType === 1 ? node : node.parentElement);
      // Do not block copying a mixed selection that extends beyond protected text.
      return this.textInScope(toElement(anchor)) && this.textInScope(toElement(focus));
    }

    activate() {
      if (this.active) return;
      this.active = true;
      this.abortController = new AbortController();
      const signal = this.abortController.signal;
      // Delegation automatically handles Spider's replaced product cards and galleries.
      if (this.contextMenuMode !== 'off') document.addEventListener('contextmenu', this.onContextMenu, { signal, capture: true });
      if (this.disableTextCopy) document.addEventListener('copy', this.onCopy, { signal, capture: true });
      if (this.disableImageDrag) document.addEventListener('dragstart', this.onDragStart, { signal, capture: true });
      if (this.disableImageCopy) document.addEventListener('mousedown', this.onMouseDown, { signal, capture: true });
      if (this.disableBestSeller && /^(collection|search)$/.test(this.pageType)) {
        document.addEventListener('shopify:section:load', this.onRepaint, { signal });
        document.addEventListener('sp:facets:updated', this.onRepaint, { signal });
        document.addEventListener('products:update', this.onRepaint, { signal });
        document.addEventListener('facet:render', this.onFacetRender, { signal, capture: true });
        document.addEventListener('sp:facets:render', this.onFacetRender, { signal, capture: true });
        document.addEventListener('sp:search:updated', this.onRepaint, { signal });
        document.addEventListener('submit', this.onSortInteraction, { signal, capture: true });
        document.addEventListener('change', this.onSortInteraction, { signal, capture: true });
        document.addEventListener('click', this.onSortInteraction, { signal, capture: true });
        this.refreshSortUI();
        if (this.sanitizeSortUrl && !this.designMode) this.cleanupCurrentUrl();
      }
    }
    deactivate() {
      if (this.abortController) { this.abortController.abort(); this.abortController = null; }
      this.observerEntries.forEach(entry => entry.observer.disconnect());
      this.observerEntries = [];
      this.sortOriginals.forEach((original, element) => {
        if (!element.isConnected) return;
        element.hidden = original.hidden;
        if ('disabled' in element) element.disabled = original.disabled;
        if (original.ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', original.ariaHidden);
        if (original.protectMarker === null) element.removeAttribute('data-sp-shop-protect-sort-hidden');
        else element.setAttribute('data-sp-shop-protect-sort-hidden', original.protectMarker);
      });
      this.sortOriginals.clear();
      this.active = false;
      this.refreshScheduled = false;
    }
    onContextMenu(event) {
      if (!this.active || !this.deviceAllowed() || this.contextMenuMode === 'off') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Fix: product-card pictures live inside <a href>. Allowing all links
      // before looking for images disabled right-click protection on nearly
      // every collection card. Protect the image; preserve text/link menus.
      const isImage = this.disableImageCopy && this.protectedImage(target);
      const safeContext = this.ignored(target, 'context');
      let block = false;
      if (this.contextMenuMode === 'images') block = isImage;
      else if (this.contextMenuMode === 'protected') block = isImage || (!safeContext && this.disableTextCopy && this.textInScope(target));
      else if (this.contextMenuMode === 'store') block = isImage || !safeContext;
      if (block) { event.preventDefault(); this.debug('Protected context menu.'); }
    }
    onCopy(event) {
      if (!this.active || !this.deviceAllowed() || !this.disableTextCopy) return;
      if (!this.selectedTextInScope()) return;
      event.preventDefault();
      this.debug('Selective text copying blocked.');
    }
    onDragStart(event) {
      if (!this.active || !this.deviceAllowed() || !this.disableImageDrag) return;
      const image = this.imageFor(event.target);
      if (image && this.mediaAllowed(image) && !this.ignored(image, 'image')) {
        event.preventDefault(); this.debug('Eligible product-image drag blocked.');
      }
    }
    onMouseDown(event) {
      if (!this.active || !this.deviceAllowed() || event.button !== 1) return;
      const image = this.imageFor(event.target);
      if (image && this.mediaAllowed(image) && !this.ignored(image, 'image') && !image.closest('a[href]')) event.preventDefault();
    }
    onSortInteraction(event) {
      if (!this.active || !this.disableBestSeller) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (event.type === 'click') {
        // Prevent stale AJAX sort links from requesting a disabled sort value.
        const link = target.closest('a[href*="sort_by"]');
        if (link && hasBestSelling(link.href, location.href) && link.closest(SECTION_HOST)) {
          event.preventDefault(); event.stopPropagation();
          const clean = sanitizeBestSellingUrl(link.href, location.href);
          if (clean) location.assign(clean.href);
        }
        return;
      }
      const sort = target.matches('select[name="sort_by"],[data-sp-sort-by]') ? target : target.querySelector('select[name="sort_by"]');
      if (!sort || sort.value !== 'best-selling') return;
      const fallback = Array.from(sort.options).find(option => option.value !== 'best-selling' && !option.disabled);
      if (fallback) sort.value = fallback.value;
    }
    hideSortItem(element) {
      if (this.sortOriginals.has(element)) return;
      this.sortOriginals.set(element, { hidden: element.hidden, disabled: 'disabled' in element ? element.disabled : false, ariaHidden: element.getAttribute('aria-hidden'), protectMarker: element.getAttribute('data-sp-shop-protect-sort-hidden') });
      element.hidden = true;
      element.setAttribute('data-sp-shop-protect-sort-hidden', '');
      if ('disabled' in element) element.disabled = true;
      element.setAttribute('aria-hidden', 'true');
    }
    refreshSortUI() {
      if (!this.active || !this.disableBestSeller) return;
      const roots = Array.from(document.querySelectorAll(SECTION_HOST));
      // Shopify search can render a different root; use main only on the search template.
      if (this.pageType === 'search' && !roots.length) {
        const main = document.querySelector('main');
        if (main) roots.push(main);
      }
      for (const root of roots) {
        root.querySelectorAll('select[name="sort_by"],[data-sp-sort-by]').forEach(select => {
          if (select.value === 'best-selling') {
            const fallback = Array.from(select.options).find(option => option.value !== 'best-selling' && !option.disabled);
            if (fallback) select.value = fallback.value;
          }
        });
        root.querySelectorAll(SORT_VALUE_SELECTOR).forEach(el => this.hideSortItem(el));
        root.querySelectorAll('a[href*="sort_by"]').forEach(link => {
          if (hasBestSelling(link.getAttribute('href'), document.baseURI)) this.hideSortItem(link);
        });
      }
      this.attachObservers(roots);
      // Removed collection roots do not need to be retained in the restoration map.
      for (const element of this.sortOriginals.keys()) {
        if (!element.isConnected) this.sortOriginals.delete(element);
      }
    }
    attachObservers(roots) {
      if (!('MutationObserver' in window)) return;
      // Observe only actual collection/search components. Spider facets replace the
      // collection root with replaceWith(); load-more appends within the existing root.
      const targets = new Set();
      roots.forEach(root => {
        if (root.parentElement) targets.add(root.parentElement);
        targets.add(root);
      });
      this.observerEntries = this.observerEntries.filter(entry => {
        if (targets.has(entry.target) && entry.target.isConnected) return true;
        entry.observer.disconnect(); return false;
      });
      targets.forEach(target => {
        if (this.observerEntries.some(entry => entry.target === target)) return;
        const observer = new MutationObserver(records => {
          if (records.some(record => record.type === 'childList')) this.queueSortRefresh();
        });
        observer.observe(target, { childList: true, subtree: target.matches(SECTION_HOST) });
        this.observerEntries.push({ target, observer });
      });
    }
    onFacetRender(event) {
      // Backward compatibility with Spider integrations that expose a mutable
      // facet URL; the current sp-facets.js does not emit this legacy event.
      if (event && event.detail && event.detail.url && hasBestSelling(event.detail.url, location.href)) {
        const cleaned = sanitizeBestSellingUrl(event.detail.url, location.href);
        if (cleaned) event.detail.url = event.detail.url instanceof URL ? cleaned : cleaned.href;
      }
      this.queueSortRefresh();
    }
    onRepaint() { this.queueSortRefresh(); }
    queueSortRefresh() {
      if (!this.active || this.refreshScheduled) return;
      this.refreshScheduled = true;
      requestAnimationFrame(() => { this.refreshScheduled = false; if (this.active) this.refreshSortUI(); });
    }
    cleanupCurrentUrl() {
      if (!hasBestSelling(location.href)) return;
      const url = sanitizeBestSellingUrl(location.href);
      if (url && url.href !== location.href) location.replace(url.href);
    }
    debug(message) {
      if (this.debugEnabled && window.console && typeof console.debug === 'function') console.debug('[Spider Shop Protect v2]', message);
    }
  }
  if (!customElements.get('sp-shop-protect')) customElements.define('sp-shop-protect', SpiderShopProtect);
})();
