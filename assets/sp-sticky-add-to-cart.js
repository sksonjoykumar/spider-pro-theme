(() => {
  'use strict';

  if (window.__spStickyAddToCartAssetLoaded) {
    window.SpiderStickyAddToCart?.init?.(document);
    return;
  }
  window.__spStickyAddToCartAssetLoaded = true;

  const FALLBACK_VARIANT_EVENT = 'spider:variant:changed';
  const FALLBACK_CART_UPDATED_EVENT = 'spider:cart:updated';
  const FALLBACK_CART_ERROR_EVENT = 'spider:cart:error';

  class StickyAddToCart {
    constructor(root) {
      this.root = root;
      this.bar = root.querySelector('[data-sticky-atc]');
      if (!this.bar || this.bar.__spStickyAtc) return;

      this.form = root.querySelector('[data-product-form]');
      this.mainButton = this.form?.querySelector('[data-add-to-cart]') || null;
      this.anchor = root.querySelector('[data-product-block="buy_buttons"] [data-add-to-cart]') || this.mainButton;
      this.mainQuantity = root.querySelector('[data-product-block="quantity"] [data-product-quantity]') || root.querySelector('[data-product-quantity]');
      this.variantSelect = this.bar.querySelector('[data-sticky-variant]');
      this.quantityInput = this.bar.querySelector('[data-sticky-quantity-input]');
      this.submit = this.bar.querySelector('[data-sticky-submit]');
      this.submitText = this.bar.querySelector('[data-sticky-submit-text]');
      if (this.submitText) this.submitText.dataset.availableText = this.bar.dataset.availableLabel || this.submitText.textContent.trim();
      this.image = this.bar.querySelector('[data-sticky-image]');
      this.price = this.bar.querySelector('[data-sticky-price]');
      this.compare = this.bar.querySelector('[data-sticky-compare]');
      this.saving = this.bar.querySelector('[data-sticky-saving]');
      this.variantText = this.bar.querySelector('[data-sticky-variant-text]');
      this.stock = this.bar.querySelector('[data-sticky-stock]');
      this.stockText = this.bar.querySelector('[data-sticky-stock-text]');
      this.buyNow = this.bar.querySelector('[data-sticky-buy-now]');
      this.message = this.bar.querySelector('[data-sticky-message]');
      this.checkoutBusy = false;
      this.checkoutController = null;
      this.footerObserver = null;
      this.footerVisible = false;
      this.productLinks = [...this.bar.querySelectorAll('[data-sticky-product-link]')];
      this.mobileQuery = window.matchMedia('(max-width: 749px)');
      this.tabletQuery = window.matchMedia('(min-width: 750px) and (max-width: 1199px)');
      this.visible = false;
      this.pending = false;
      this.observer = null;
      this.toolbarObserver = null;
      this.toolbar = null;
      this.documentEvents = [];

      this.onStickyClick = this.onStickyClick.bind(this);
      this.onStickyChange = this.onStickyChange.bind(this);
      this.onMainInput = this.onMainInput.bind(this);
      this.onVariant = this.onVariant.bind(this);
      this.onCartUpdated = this.onCartUpdated.bind(this);
      this.onCartError = this.onCartError.bind(this);
      this.onProductSystemReady = this.onProductSystemReady.bind(this);
      this.onViewportChange = this.onViewportChange.bind(this);
      this.onScroll = this.onScroll.bind(this);

      this.bar.__spStickyAtc = this;
      this.bind();
      this.ensureCanonicalEvents();
      this.syncInitialState();
      this.setupVisibilityObserver();
      this.setupFooterObserver();
      this.setupToolbarOffset();
    }

    bind() {
      this.bar.addEventListener('click', this.onStickyClick);
      this.bar.addEventListener('change', this.onStickyChange);
      this.bar.addEventListener('input', this.onStickyChange);
      this.root.addEventListener('change', this.onMainInput);
      this.root.addEventListener('input', this.onMainInput);
      document.addEventListener('sp:product-system:ready', this.onProductSystemReady);
      this.mobileQuery.addEventListener?.('change', this.onViewportChange);
      window.addEventListener('resize', this.onViewportChange, { passive: true });
      window.addEventListener('scroll', this.onScroll, { passive: true });
      this.tabletQuery.addEventListener?.('change', this.onViewportChange);
    }

    bindDocumentEvent(name, handler) {
      if (!name || this.documentEvents.some(([eventName, eventHandler]) => eventName === name && eventHandler === handler)) return;
      document.addEventListener(name, handler);
      this.documentEvents.push([name, handler]);
    }

    ensureCanonicalEvents() {
      const variantNames = new Set([FALLBACK_VARIANT_EVENT, window.Spider?.events?.variantChanged].filter(Boolean));
      const cartUpdatedNames = new Set([FALLBACK_CART_UPDATED_EVENT, window.Spider?.events?.cartUpdated].filter(Boolean));
      const cartErrorNames = new Set([FALLBACK_CART_ERROR_EVENT, window.Spider?.events?.cartError].filter(Boolean));
      variantNames.forEach((name) => this.bindDocumentEvent(name, this.onVariant));
      cartUpdatedNames.forEach((name) => this.bindDocumentEvent(name, this.onCartUpdated));
      cartErrorNames.forEach((name) => this.bindDocumentEvent(name, this.onCartError));
    }

    onProductSystemReady() {
      this.ensureCanonicalEvents();
      this.syncInitialState();
    }

    syncInitialState() {
      if (!this.form || !this.mainButton || !this.anchor) {
        this.setVisible(false);
        this.bar.hidden = true;
        return;
      }

      const variantId = this.root.dataset.selectedVariantId || this.form.querySelector('[data-variant-input]')?.value || this.root.querySelector('[data-variant-select]')?.value;
      if (variantId) this.syncVariantById(variantId);
      this.syncQuantityFromMain();
      this.syncButtonFromMain();
    }

    setupVisibilityObserver() {
      if (!this.anchor || typeof IntersectionObserver !== 'function') {
        this.refreshVisibility();
        return;
      }
      this.observer?.disconnect();
      this.observer = new IntersectionObserver(() => this.refreshVisibility(), { threshold: [0, 0.01] });
      this.observer.observe(this.anchor);
      this.refreshVisibility();
    }

    setupFooterObserver() {
      const footer = document.querySelector('[data-footer-group], #shopify-section-footer, footer');
      if (!footer || typeof IntersectionObserver !== 'function') return;
      this.footerObserver = new IntersectionObserver(([entry]) => {
        this.footerVisible = Boolean(entry?.isIntersecting);
        this.refreshVisibility();
      }, { rootMargin: `0px 0px -${Math.min(100,Math.max(0,this.bar.offsetHeight))}px 0px`, threshold: 0 });
      this.footerObserver.observe(footer);
    }

    refreshVisibility() {
      const rect = this.anchor?.getBoundingClientRect();
      if (!rect || !this.form || !this.mainButton) return this.setVisible(false);
      const disabled = (this.mobileQuery.matches && this.bar.dataset.mobileEnabled === 'false')
        || (this.tabletQuery.matches && this.bar.dataset.tabletEnabled === 'false')
        || (!this.mobileQuery.matches && !this.tabletQuery.matches && this.bar.dataset.desktopEnabled === 'false');
      const mode = this.bar.dataset.displayMode || 'after';
      let show = mode === 'always'
        || (mode === 'scroll' ? window.scrollY >= Number(this.bar.dataset.scrollDistance || 600) : rect.bottom <= 0);
      if (window.Shopify?.designMode) show = true;
      this.setVisible(!disabled && !this.footerVisible && show);
    }

    setVisible(visible) {
      if (this.visible === Boolean(visible)) return;
      this.visible = Boolean(visible);
      this.bar.classList.toggle('is-visible', this.visible);
      this.bar.setAttribute('aria-hidden', String(!this.visible));
      if (this.visible) this.bar.removeAttribute('inert');
      else this.bar.setAttribute('inert', '');
    }

    onScroll() { this.refreshVisibility(); }

    onViewportChange() {
      this.refreshVisibility();
      this.updateToolbarOffset();
    }

    setupToolbarOffset() {
      this.connectToolbarObserver();
      this.updateToolbarOffset();
    }

    connectToolbarObserver() {
      const nextToolbar = document.querySelector('[data-toolbar-mobile], .sp-toolbar-mobile, #ToolbarMobile');
      if (nextToolbar === this.toolbar && this.toolbar?.isConnected) return;
      this.toolbarObserver?.disconnect();
      this.toolbarObserver = null;
      this.toolbar = nextToolbar || null;
      if (this.toolbar && typeof ResizeObserver === 'function') {
        this.toolbarObserver = new ResizeObserver(() => this.updateToolbarOffset());
        this.toolbarObserver.observe(this.toolbar);
      }
    }

    updateToolbarOffset() {
      if (!this.toolbar?.isConnected) this.connectToolbarObserver();
      let offset = 0;
      let hasToolbar = false;
      if (this.mobileQuery.matches && this.toolbar) {
        const style = getComputedStyle(this.toolbar);
        const rect = this.toolbar.getBoundingClientRect();
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0;
        const anchoredToViewport = style.position === 'fixed' && rect.top < window.innerHeight && rect.bottom >= window.innerHeight - 2 && rect.bottom <= window.innerHeight + 2;
        if (visible && anchoredToViewport) {
          offset = Math.max(0, Math.round(rect.height));
          hasToolbar = true;
        }
      }
      this.bar.style.setProperty('--sp-sticky-atc-toolbar-offset', `${offset}px`);
      this.bar.classList.toggle('has-mobile-toolbar', hasToolbar);
    }

    onMainInput(event) {
      if (!this.mainQuantity || event.target !== this.mainQuantity) return;
      this.syncQuantityFromMain();
    }

    onVariant(event) {
      const eventRoot = event.detail?.root || event.detail?.form?.closest?.('[data-main-product]');
      const sectionId = String(event.detail?.sectionId || '');
      if (eventRoot && eventRoot !== this.root) return;
      if (!eventRoot && sectionId && sectionId !== String(this.root.dataset.sectionId || '')) return;

      const variant = event.detail?.variant;
      if (!variant?.id) {
        this.setUnavailable();
        return;
      }
      this.syncVariantById(variant.id, variant.available);
      this.syncQuantityFromMain();
      this.syncButtonFromMain();
      this.setAvailability(Boolean(variant.available));
    }

    variantOption(id) {
      if (!this.variantSelect || !id) return null;
      return [...this.variantSelect.options].find((option) => String(option.value) === String(id)) || null;
    }

    syncVariantById(id, availableOverride = null) {
      const option = this.variantOption(id);
      if (this.variantSelect && option) this.variantSelect.value = String(id);

      const available = availableOverride == null
        ? (option ? option.dataset.available === 'true' : this.mainButton?.dataset.canSubmit !== 'false')
        : Boolean(availableOverride);

      if (option) {
        if (this.price && option.dataset.price) this.price.textContent = option.dataset.price;
        if (this.compare) {
          this.compare.textContent = option.dataset.compare || '';
          this.compare.hidden = !option.dataset.compare;
        }
        if (this.saving) {
          this.saving.hidden = !option.dataset.compare;
          this.saving.textContent = `${this.bar.dataset.savePrefix || 'Save'} ${option.dataset.saving || '0'}%`;
        }
        if (this.variantText) this.variantText.textContent = option.dataset.title || '';

        if (this.image && option.dataset.imageUrl) {
          if (this.image.src !== option.dataset.imageUrl) this.image.src = option.dataset.imageUrl;
          this.image.removeAttribute('srcset');
          this.image.alt = option.dataset.imageAlt || this.image.alt || '';
        }
        if (option.dataset.url) this.productLinks.forEach((link) => { link.href = option.dataset.url; });
        this.applyQuantityRules(option);
      }

      this.setAvailability(available);
      if (this.stock) this.stock.classList.toggle('is-unavailable', !available);
      if (this.stockText) this.stockText.textContent = available
        ? (this.bar.dataset.inStockLabel || 'In stock')
        : (this.bar.dataset.outStockLabel || 'Sold out');
    }

    selectMainVariant(id) {
      if (!id) return;
      const fallback = this.root.querySelector('select[data-variant-select]');
      if (fallback) {
        if (String(fallback.value) === String(id)) return;
        fallback.value = String(id);
        fallback.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      const controller = this.root.__spiderProductPage;
      const variant = controller?.findVariantById?.(id);
      if (variant && typeof controller?.applyVariant === 'function') controller.applyVariant(variant, { source: 'sticky-atc' });
    }

    applyQuantityRules(option) {
      if (!this.quantityInput || !option) return;
      const min = Math.max(1, Number(option.dataset.quantityMin || 1));
      const step = Math.max(1, Number(option.dataset.quantityStep || 1));
      const max = Number(option.dataset.quantityMax || 0);
      this.quantityInput.min = String(min);
      this.quantityInput.step = String(step);
      if (max > 0) this.quantityInput.max = String(max);
      else this.quantityInput.removeAttribute('max');
      this.normalizeQuantity(this.quantityInput);
      this.syncQuantityToMain();
    }

    normalizeQuantity(input) {
      if (!input) return 1;
      const min = Math.max(1, Number(input.min || 1));
      const step = Math.max(1, Number(input.step || 1));
      const max = Number(input.max || 0);
      let value = Number(input.value);
      if (!Number.isFinite(value)) value = min;
      value = Math.max(min, value);
      if (max > 0) value = Math.min(max, value);
      value = min + Math.round((value - min) / step) * step;
      value = Math.max(min, value);
      if (max > 0) value = Math.min(min + Math.floor((max - min) / step) * step, value);
      input.value = String(value);

      const minus = this.bar.querySelector('[data-sticky-quantity-minus]');
      const plus = this.bar.querySelector('[data-sticky-quantity-plus]');
      if (minus) minus.disabled = value <= min;
      if (plus) plus.disabled = max > 0 && value >= max;
      return value;
    }

    syncQuantityFromMain() {
      if (!this.quantityInput) return;
      if (this.mainQuantity) {
        this.quantityInput.min = this.mainQuantity.min || this.quantityInput.min || '1';
        this.quantityInput.step = this.mainQuantity.step || this.quantityInput.step || '1';
        if (this.mainQuantity.max) this.quantityInput.max = this.mainQuantity.max;
        else this.quantityInput.removeAttribute('max');
        this.quantityInput.value = this.mainQuantity.value || this.quantityInput.value || this.quantityInput.min || '1';
      }
      this.normalizeQuantity(this.quantityInput);
    }

    syncQuantityToMain() {
      if (!this.quantityInput) return;
      const value = this.normalizeQuantity(this.quantityInput);
      if (this.mainQuantity && String(this.mainQuantity.value) !== String(value)) {
        this.mainQuantity.value = String(value);
        this.mainQuantity.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    onStickyChange(event) {
      if (event.target === this.variantSelect && event.type === 'change') {
        const option = this.variantSelect.selectedOptions[0];
        if (!option) return;
        this.selectMainVariant(option.value);
        return;
      }

      if (event.target === this.quantityInput) {
        this.syncQuantityToMain();
      }
    }

    onStickyClick(event) {
      const minus = event.target.closest('[data-sticky-quantity-minus]');
      if (minus) {
        event.preventDefault();
        if (!this.quantityInput || minus.disabled) return;
        const step = Math.max(1, Number(this.quantityInput.step || 1));
        this.quantityInput.value = String(Number(this.quantityInput.value || this.quantityInput.min || 1) - step);
        this.syncQuantityToMain();
        return;
      }

      const plus = event.target.closest('[data-sticky-quantity-plus]');
      if (plus) {
        event.preventDefault();
        if (!this.quantityInput || plus.disabled) return;
        const step = Math.max(1, Number(this.quantityInput.step || 1));
        this.quantityInput.value = String(Number(this.quantityInput.value || this.quantityInput.min || 1) + step);
        this.syncQuantityToMain();
        return;
      }

      const buy = event.target.closest('[data-sticky-buy-now]');
      if (buy) {
        event.preventDefault();
        if (!buy.disabled && !this.pending && !this.checkoutBusy) this.buyNowCheckout();
        return;
      }

      const submit = event.target.closest('[data-sticky-submit]');
      if (!submit) return;
      event.preventDefault();
      if (submit.disabled || this.pending || this.checkoutBusy || !this.mainButton || !this.form || this.form.getAttribute('aria-busy') === 'true') return;
      this.syncQuantityToMain();
      this.setPending(true);
      this.mainButton.click();
    }

    async buyNowCheckout() {
      if (!this.form || !this.buyNow || this.checkoutBusy || this.pending || this.form.getAttribute('aria-busy') === 'true') return;
      const mainVariant = String(this.root.dataset.selectedVariantId
        || this.form.querySelector('[data-variant-input]')?.value
        || this.variantSelect?.value || '');
      if (!mainVariant || this.mainButton?.disabled) return;
      this.syncQuantityToMain();
      const payload = new FormData(this.form);
      payload.set('id', mainVariant);
      if (this.quantityInput) payload.set('quantity', this.quantityInput.value || '1');
      else if (!payload.has('quantity')) payload.set('quantity', '1');
      // Remove Shopify product-form metadata which does not belong in cart/add.js.
      payload.delete('form_type');
      payload.delete('utf8');
      const route = window.Shopify?.routes?.root || '/';
      this.checkoutBusy = true;
      this.checkoutController = new AbortController();
      this.buyNow.disabled = true;
      this.buyNow.setAttribute('aria-busy', 'true');
      if (this.submit) this.submit.disabled = true;
      if (this.message) { this.message.hidden = true; this.message.textContent = ''; }
      try {
        const response = await fetch(`${route}cart/add.js`, {
          method: 'POST',
          body: payload,
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          signal: this.checkoutController.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.description || data.message || 'Unable to start checkout');
        // Go through Shopify standard checkout. This is NOT an accelerated wallet button.
        window.location.assign(`${route}checkout`);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (this.message) { this.message.hidden = false; this.message.textContent = error?.message || 'Unable to start checkout'; }
        this.checkoutBusy = false;
        this.syncButtonFromMain();
      } finally {
        this.buyNow.removeAttribute('aria-busy');
      }
    }

    syncButtonFromMain() {
      if (!this.submit || !this.mainButton) return;
      const canSubmit = !this.mainButton.disabled && this.mainButton.dataset.canSubmit !== 'false';
      this.submit.dataset.canSubmit = String(canSubmit);
      if (!this.pending) this.submit.disabled = !canSubmit;
      if (!this.pending && this.submitText) this.submitText.textContent = canSubmit
        ? (this.submitText.dataset.availableText || this.root.dataset.addLabel || 'Add to cart')
        : (this.root.dataset.soldLabel || 'Sold out');
      if (this.buyNow) this.buyNow.disabled = !canSubmit || this.checkoutBusy || this.pending;
    }

    setAvailability(available) {
      if (!this.submit) return;
      const canSubmit = Boolean(available);
      this.submit.dataset.canSubmit = String(canSubmit);
      if (!this.pending) this.submit.disabled = !canSubmit;
      if (this.buyNow) this.buyNow.disabled = !canSubmit || this.pending || this.checkoutBusy;
      if (this.submitText) {
        this.submitText.textContent = canSubmit
          ? (this.submitText.dataset.availableText || this.root.dataset.addLabel || 'Add to cart')
          : (this.root.dataset.soldLabel || 'Sold out');
      }
    }

    setUnavailable() {
      if (this.submit) {
        this.submit.dataset.canSubmit = 'false';
        this.submit.disabled = true;
      }
      if (this.submitText) this.submitText.textContent = this.root.dataset.unavailableLabel || 'Unavailable';
      if (this.buyNow) this.buyNow.disabled = true;
      if (this.stock) this.stock.classList.add('is-unavailable');
      if (this.stockText) this.stockText.textContent = this.root.dataset.unavailableLabel || 'Unavailable';
    }

    setPending(pending) {
      this.pending = Boolean(pending);
      if (!this.submit) return;
      this.submit.toggleAttribute('aria-busy', this.pending);
      if (this.pending) this.submit.disabled = true;
      else this.syncButtonFromMain();
      if (this.buyNow) this.buyNow.disabled = this.pending || this.checkoutBusy || this.submit.dataset.canSubmit === 'false';
    }

    eventBelongsToForm(event) {
      const eventForm = event.detail?.form;
      if (eventForm) return eventForm === this.form;
      const variantId = String(event.detail?.variantId || '');
      const currentId = String(this.root.dataset.selectedVariantId || '');
      return !variantId || !currentId || variantId === currentId;
    }

    onCartUpdated(event) {
      if (!this.pending || !this.eventBelongsToForm(event)) return;
      this.setPending(false);
    }

    onCartError() {
      if (this.pending) this.setPending(false);
    }

    destroy() {
      this.checkoutController?.abort();
      this.footerObserver?.disconnect();
      this.observer?.disconnect();
      this.toolbarObserver?.disconnect();
      this.bar.removeEventListener('click', this.onStickyClick);
      this.bar.removeEventListener('change', this.onStickyChange);
      this.bar.removeEventListener('input', this.onStickyChange);
      this.root.removeEventListener('change', this.onMainInput);
      this.root.removeEventListener('input', this.onMainInput);
      document.removeEventListener('sp:product-system:ready', this.onProductSystemReady);
      this.documentEvents.forEach(([name, handler]) => document.removeEventListener(name, handler));
      this.documentEvents = [];
      this.mobileQuery.removeEventListener?.('change', this.onViewportChange);
      this.tabletQuery.removeEventListener?.('change', this.onViewportChange);
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onViewportChange);
      delete this.bar.__spStickyAtc;
      delete this.root.__spStickyAddToCart;
    }
  }

  const init = (scope = document) => {
    scope.querySelectorAll?.('[data-main-product]').forEach((root) => {
      if (!root.querySelector('[data-sticky-atc]') || root.__spStickyAddToCart) return;
      root.__spStickyAddToCart = new StickyAddToCart(root);
    });
  };

  const destroy = (scope) => {
    scope.querySelectorAll?.('[data-main-product]').forEach((root) => root.__spStickyAddToCart?.destroy());
  };

  window.SpiderStickyAddToCart = { init, destroy };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();

  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));
})();
