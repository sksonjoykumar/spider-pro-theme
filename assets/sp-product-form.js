(() => {
  'use strict';

  const variantEvent = () => window.Spider?.events?.variantChanged || 'spider:variant:changed';

  const FALLBACK_SWATCHES = {
    black: '#000000',
    white: '#ffffff',
    pink: '#f5c6d2',
    purple: '#8a0f8f',
    blue: '#233bff',
    navy: '#1f3b73',
    'navy blue': '#1f3b73',
    red: '#c81e1e',
    green: '#2f855a',
    yellow: '#facc15',
    grey: '#9ca3af',
    gray: '#9ca3af',
    beige: '#d6c09b',
    brown: '#7c4a2d',
    periwinkle: '#b8bcf0'
  };

  class ProductPageController {
    constructor(root) {
      this.root = root;
      this.form = root.querySelector('[data-product-form]');
      this.fallbackSelect = root.querySelector('select[data-variant-select]');
      this.variantInput = root.querySelector('[data-variant-input]');
      this.variantSelect = this.fallbackSelect || this.variantInput;
      this.dataNode = root.querySelector('[data-product-json]');
      this.product = window.Spider?.safeJson?.(this.dataNode?.textContent || '{}', {}) || this.safeJson(this.dataNode?.textContent || '{}', {});
      this.currentVariant = this.findVariantById(root.dataset.selectedVariantId) || this.findVariantById(this.fallbackSelect?.value || this.variantInput?.value) || null;
      this.pickupController = null;
      this.resizeObserver = null;
      this.enhanced = false;
      this.syncingVariantSelect = false;
      this.bound = false;

      this.onChange = this.onChange.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onSubmit = this.onSubmit.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onProductSystemReady = this.onProductSystemReady.bind(this);
      this.onWishlistChange = this.onWishlistChange.bind(this);
      this.onCompareChange = this.onCompareChange.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);

      this.bind();
      this.setupStickyOffset();
      this.tryEnhance();
      this.syncSecondaryActions();
      if (this.currentVariant) this.syncOptionInputsFromVariant(this.currentVariant);
      this.root.querySelectorAll('[data-product-quantity]').forEach((input) => this.normalizeQuantity(input));
    }

    safeJson(raw, fallback = {}) {
      try { return JSON.parse(raw); } catch (_) { return fallback; }
    }

    get commerce() { return window.SpiderProductCommerce || null; }
    get exactResolver() { return this.commerce?.products?.exactVariant || null; }

    bind() {
      if (this.bound) return;
      this.bound = true;
      this.root.addEventListener('change', this.onChange);
      this.root.addEventListener('click', this.onClick);
      this.root.addEventListener('submit', this.onSubmit, true);
      this.root.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('sp:product-system:ready', this.onProductSystemReady);
      document.addEventListener('sp:product-commerce:ready', this.onProductSystemReady);
      document.addEventListener('sp:commerce:ready', this.onProductSystemReady);
      document.addEventListener('sp:wishlist:change', this.onWishlistChange);
      document.addEventListener('sp:compare:change', this.onCompareChange);
      document.addEventListener('shopify:block:select', this.onBlockSelect);
    }

    tryEnhance() {
      if (this.enhanced || !this.exactResolver) return;
      this.enhanced = true;
      if (this.variantInput) {
        this.variantInput.disabled = false;
        this.variantInput.name = 'id';
      }
      if (this.fallbackSelect) this.fallbackSelect.removeAttribute('name');
      this.root.classList.add('is-product-ready');
      this.paintSwatches();
      const selected = this.findVariantById(this.fallbackSelect?.value || this.variantInput?.value) || this.currentVariant;
      if (selected) this.applyVariant(selected, { updateUrl: false, announce: false, refreshPickup: false, dispatch: false });
      this.updateOptionAvailability();
    }

    onProductSystemReady() {
      this.tryEnhance();
      this.syncSecondaryActions();
    }

    findVariantById(id) {
      return Array.isArray(this.product?.variants)
        ? this.product.variants.find((variant) => String(variant.id) === String(id || '')) || null
        : null;
    }

    selectedOptions() {
      const groups = [...this.root.querySelectorAll('[data-option-group]')]
        .sort((a, b) => Number(a.dataset.optionIndex) - Number(b.dataset.optionIndex));
      return groups.map((group) => {
        const select = group.querySelector('select[data-option-input]');
        if (select) return String(select.value || '');
        const checked = group.querySelector('input[data-option-input]:checked');
        return String(checked?.value || '');
      });
    }

    onChange(event) {
      const quantityInput = event.target.closest('[data-product-quantity]');
      if (quantityInput && this.root.contains(quantityInput)) {
        this.normalizeQuantity(quantityInput);
        return;
      }

      const optionInput = event.target.closest('[data-option-input]');
      if (optionInput && this.root.contains(optionInput)) {
        if (!this.exactResolver) return;
        const selected = this.selectedOptions();
        const variant = this.exactResolver(this.product, selected);
        this.updateSelectedOptionLabels();
        if (variant) this.applyVariant(variant, { source: 'options' });
        else this.applyUnavailable(selected);
        this.updateOptionAvailability();
        return;
      }

      const select = event.target.closest('[data-variant-select]');
      if (select && this.root.contains(select) && !this.syncingVariantSelect) {
        const variant = this.findVariantById(select.value);
        if (variant) {
          this.currentVariant = variant;
          this.syncOptionInputsFromVariant(variant);
          this.applyVariant(variant, { source: 'fallback' });
          this.updateOptionAvailability();
        }
      }
    }

    onKeyDown(event) {
      const button = event.target.closest('[data-option-button]');
      if (!button || !this.root.contains(button)) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const group = button.closest('[data-option-group]');
      const buttons = [...(group?.querySelectorAll('[data-option-button]') || [])].filter((item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
      if (!buttons.length) return;
      const current = Math.max(0, buttons.indexOf(button));
      const rtl = document.documentElement.dir === 'rtl';
      let next = current;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else if (event.key === 'ArrowRight') next = (current + (rtl ? -1 : 1) + buttons.length) % buttons.length;
      else if (event.key === 'ArrowLeft') next = (current + (rtl ? 1 : -1) + buttons.length) % buttons.length;
      else if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
      else if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    }

    onSubmit(event) {
      const form = event.target.closest('[data-product-form]');
      if (!form || form !== this.form || !this.root.contains(form)) return;

      this.root.querySelectorAll('[data-product-quantity]').forEach((input) => this.normalizeQuantity(input));

      if (this.enhanced) {
        if (!this.currentVariant?.id) {
          event.preventDefault();
          event.stopPropagation();
          this.applyUnavailable(this.selectedOptions());
          return;
        }
        if (this.variantInput) {
          this.variantInput.disabled = false;
          this.variantInput.name = 'id';
          this.variantInput.value = String(this.currentVariant.id);
        }
        if (this.fallbackSelect) this.fallbackSelect.removeAttribute('name');
      } else if (this.fallbackSelect) {
        this.fallbackSelect.name = 'id';
        if (this.variantInput) {
          this.variantInput.disabled = true;
          this.variantInput.removeAttribute('name');
        }
      }

      const formData = new FormData(form);
      if (!String(formData.get('id') || '').trim()) {
        event.preventDefault();
        event.stopPropagation();
        this.announce(this.root.dataset.unavailableLabel || 'Unavailable');
      }
    }

    onClick(event) {
      const optionButton = event.target.closest('[data-option-button]');
      if (optionButton && this.root.contains(optionButton)) {
        event.preventDefault();
        if (optionButton.disabled || optionButton.getAttribute('aria-disabled') === 'true') return;
        const wrap = optionButton.closest('[data-option-value-wrap]');
        const input = wrap?.querySelector('input[data-option-input]');
        if (!input || input.disabled) return;
        if (!input.checked) {
          const group = input.closest('[data-option-group]');
          group?.querySelectorAll('input[data-option-input]').forEach((candidate) => { candidate.checked = candidate === input; });
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          this.updateSelectedOptionLabels();
          this.syncOptionButtonStates();
        }
        return;
      }

      const accordionToggle = event.target.closest('[data-product-accordion-toggle]');
      if (accordionToggle && this.root.contains(accordionToggle)) {
        event.preventDefault();
        const accordion = accordionToggle.closest('[data-product-accordion]');
        const panel = accordion?.querySelector('[data-product-accordion-panel]');
        const expanded = accordionToggle.getAttribute('aria-expanded') === 'true';
        accordionToggle.setAttribute('aria-expanded', String(!expanded));
        if (panel) panel.hidden = expanded;
        accordion?.classList.toggle('is-open', !expanded);
        return;
      }

      const wishlist = event.target.closest('[data-main-product-wishlist]');
      if (wishlist && this.root.contains(wishlist)) {
        event.preventDefault();
        if (!window.SpiderWishlist?.toggle) return this.announce('Wishlist service is unavailable.');
        window.SpiderWishlist.toggle(this.productSummary());
        this.syncSecondaryActions();
        return;
      }

      const compare = event.target.closest('[data-main-product-compare]');
      if (compare && this.root.contains(compare)) {
        event.preventDefault();
        if (!window.SpiderCompare?.toggle) return this.announce('Compare service is unavailable.');
        window.SpiderCompare.toggle(this.productSummary());
        this.syncSecondaryActions();
        return;
      }

      const share = event.target.closest('[data-product-share]');
      if (share && this.root.contains(share)) {
        event.preventDefault();
        this.shareProduct();
      }
    }

    syncOptionInputsFromVariant(variant) {
      if (!variant || !Array.isArray(variant.options)) return;
      this.root.querySelectorAll('[data-option-group]').forEach((group) => {
        const index = Number(group.dataset.optionIndex);
        const value = String(variant.options[index] ?? '');
        const select = group.querySelector('select[data-option-input]');
        if (select) select.value = value;
        group.querySelectorAll('input[data-option-input]').forEach((input) => { input.checked = String(input.value) === value; });
      });
      this.updateSelectedOptionLabels();
      this.syncOptionButtonStates();
    }

    syncOptionButtonStates() {
      this.root.querySelectorAll('[data-option-value-wrap]').forEach((wrap) => {
        const input = wrap.querySelector('input[data-option-input]');
        const button = wrap.querySelector('[data-option-button]');
        if (!input || !button) return;
        const checked = Boolean(input.checked);
        button.setAttribute('aria-checked', String(checked));
        button.classList.toggle('is-selected', checked);
      });
    }

    updateSelectedOptionLabels() {
      this.root.querySelectorAll('[data-option-group]').forEach((group) => {
        const index = Number(group.dataset.optionIndex);
        const selected = this.selectedOptions()[index] || '';
        const label = group.querySelector('[data-option-selected]');
        if (label) label.textContent = selected;
      });
    }

    optionValueState(index, value, selected) {
      const variants = Array.isArray(this.product?.variants) ? this.product.variants : [];
      const matches = variants.filter((variant) => {
        if (!Array.isArray(variant.options) || String(variant.options[index] ?? '') !== String(value)) return false;
        for (let previous = 0; previous < index; previous += 1) {
          if (String(variant.options[previous] ?? '') !== String(selected[previous] ?? '')) return false;
        }
        return true;
      });
      return {
        exists: matches.length > 0,
        available: matches.some((variant) => Boolean(variant.available))
      };
    }

    updateOptionAvailability() {
      if (!Array.isArray(this.product?.variants)) return;
      const selected = this.selectedOptions();

      this.root.querySelectorAll('[data-option-group]').forEach((group) => {
        const index = Number(group.dataset.optionIndex);
        group.querySelectorAll('input[data-option-input]').forEach((input) => {
          const state = this.optionValueState(index, input.value, selected);
          const wrap = input.closest('[data-option-value-wrap]');
          const unavailable = !state.exists;
          const soldOut = state.exists && !state.available;
          wrap?.classList.toggle('is-unavailable', unavailable);
          wrap?.classList.toggle('is-sold-out', soldOut);
          input.disabled = unavailable;
          const label = wrap?.querySelector('[data-option-label]');
          if (label) {
            label.setAttribute('aria-disabled', String(unavailable));
            label.setAttribute('aria-checked', String(Boolean(input.checked)));
            label.toggleAttribute('disabled', unavailable);
            label.dataset.soldOut = String(soldOut);
            label.classList.toggle('is-selected', Boolean(input.checked));
          }
        });

        group.querySelectorAll('select[data-option-input] option').forEach((option) => {
          const state = this.optionValueState(index, option.value, selected);
          option.disabled = !state.exists;
          option.dataset.soldOut = String(state.exists && !state.available);
        });
      });
      this.syncOptionButtonStates();
    }

    paintSwatches() {
      const resolve = this.commerce?.swatches?.resolve;
      this.root.querySelectorAll('[data-swatch-paint]').forEach((paint) => {
        const value = String(paint.closest('[data-option-label]')?.dataset.optionValue || '').trim();
        let swatch = null;
        if (typeof resolve === 'function') swatch = resolve(value);
        if (!swatch && value) {
          const key = value.toLowerCase();
          swatch = FALLBACK_SWATCHES[key] || (window.CSS?.supports?.('color', value) ? value : null);
        }
        if (swatch) paint.style.setProperty('--sp-swatch-color', swatch);
      });
    }

    applyVariant(variant, options = {}) {
      if (!variant) return this.applyUnavailable();
      const settings = { updateUrl: true, announce: true, refreshPickup: true, dispatch: true, ...options };
      this.currentVariant = variant;
      this.root.dataset.selectedVariantId = String(variant.id);
      this.syncCanonicalVariantInput(variant.id);
      this.updatePrice(variant);
      this.updateMetadata(variant);
      this.updateInventory(variant);
      this.updateQuantityRules(variant);
      this.updateVolumePricing(variant);
      this.updatePurchaseState(variant);
      this.syncOptionInputsFromVariant(variant);
      this.updateSelectedOptionLabels();

      if (settings.updateUrl && history?.replaceState) {
        const url = new URL(location.href);
        url.searchParams.set('variant', String(variant.id));
        history.replaceState({}, '', url);
      }

      if (settings.refreshPickup) this.refreshPickup(variant.id);
      this.syncSecondaryActions();

      if (settings.dispatch) {
        document.dispatchEvent(new CustomEvent(variantEvent(), {
          detail: {
            variant,
            root: this.root,
            form: this.form,
            sectionId: this.root.dataset.sectionId,
            mediaId: variant.featured_media_id || null,
            imageId: variant.featured_image_id || null
          }
        }));
      }
      if (settings.announce) this.announce(variant.available ? this.root.dataset.inStockLabel : this.root.dataset.soldLabel);
    }

    applyUnavailable(selected = []) {
      this.currentVariant = null;
      this.root.dataset.selectedVariantId = '';
      this.syncCanonicalVariantInput('');
      const button = this.root.querySelector('[data-add-to-cart]');
      if (button) {
        button.disabled = true;
        button.dataset.canSubmit = 'false';
        const text = button.querySelector('[data-add-to-cart-text]');
        if (text) text.textContent = this.root.dataset.unavailableLabel || 'Unavailable';
      }
      const checkout = this.root.querySelector('[data-dynamic-checkout]');
      if (checkout) checkout.hidden = true;
      this.announce(this.root.dataset.unavailableLabel || 'Unavailable');
      document.dispatchEvent(new CustomEvent(variantEvent(), {
        detail: { variant: null, selectedOptions: selected, root: this.root, form: this.form, sectionId: this.root.dataset.sectionId }
      }));
    }

    syncCanonicalVariantInput(id) {
      const value = String(id || '');
      if (this.variantInput) {
        const changed = String(this.variantInput.value || '') !== value;
        this.variantInput.value = value;
        if (changed) this.variantInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const field = this.fallbackSelect;
      if (field) {
        let invalid = field.querySelector('[data-product-invalid-option]');
        if (!value) {
          if (!invalid) {
            invalid = document.createElement('option');
            invalid.value = '';
            invalid.hidden = true;
            invalid.dataset.productInvalidOption = '';
            field.prepend(invalid);
          }
          field.value = '';
        } else {
          field.value = value;
          invalid?.remove();
        }

        this.syncingVariantSelect = true;
        try { field.dispatchEvent(new Event('change', { bubbles: true })); } finally { this.syncingVariantSelect = false; }
      }
    }

    updatePrice(variant) {
      const price = this.root.querySelector('[data-current-price]');
      const compare = this.root.querySelector('[data-compare-price]');
      const saving = this.root.querySelector('[data-price-saving]');
      const unit = this.root.querySelector('[data-unit-price]');
      const compareValue = Number(variant.compare_at_price || 0);
      const priceValue = Number(variant.price || 0);
      const onSale = compareValue > priceValue;

      if (price) price.textContent = this.money(priceValue, variant.price_formatted);
      if (compare) {
        compare.hidden = !onSale;
        compare.textContent = onSale ? this.money(compareValue, variant.compare_at_price_formatted) : '';
      }
      if (saving) {
        saving.hidden = !onSale;
        saving.textContent = '';
        if (onSale) {
          const amount = compareValue - priceValue;
          const percentage = Math.round((amount / compareValue) * 100);
          if (saving.dataset.savingsMode === 'amount') {
            saving.textContent = `Save ${this.money(amount, variant.savings_amount_formatted)}`;
          } else if (saving.dataset.savingsMode === 'percentage_off') {
            saving.textContent = `${percentage}% OFF`;
          } else {
            saving.textContent = `Save ${percentage}%`;
          }
        }
      }
      if (unit) {
        const measurement = variant.unit_price_measurement;
        if (measurement && variant.unit_price != null) {
          const reference = Number(measurement.reference_value || 1) !== 1 ? measurement.reference_value : '';
          unit.textContent = `${this.money(variant.unit_price, variant.unit_price_formatted)} / ${reference}${measurement.reference_unit || ''}`;
        } else unit.textContent = '';
      }
    }

    money(cents, serverFormatted = '') {
      if (this.commerce?.money?.format) return this.commerce.money.format(Number(cents || 0), this.product.money_format || '{{amount}}');
      if (window.Shopify?.formatMoney) return window.Shopify.formatMoney(Number(cents || 0), this.product.money_format || '${{ amount }}');
      if (serverFormatted) return String(serverFormatted);
      return String(cents ?? '');
    }

    updateMetadata(variant) {
      const sku = this.root.querySelector('[data-product-sku]');
      const barcode = this.root.querySelector('[data-product-barcode]');
      if (sku) sku.textContent = variant.sku || '';
      if (barcode) barcode.textContent = variant.barcode || '';
      this.root.querySelector('[data-sku-row]')?.classList.toggle('is-empty', !variant.sku);
      this.root.querySelector('[data-barcode-row]')?.classList.toggle('is-empty', !variant.barcode);
    }

    updateInventory(variant) {
      const row = this.root.querySelector('[data-inventory-status]');
      if (!row) return;
      const text = row.querySelector('[data-inventory-text]') || row;
      const threshold = Math.max(1, Number(row.dataset.lowThreshold || 5));
      const quantity = Number(variant.inventory_quantity || 0);
      const managed = Boolean(variant.inventory_management);
      const low = Boolean(variant.available && managed && quantity > 0 && quantity <= threshold);
      const soldOut = !variant.available;
      row.classList.toggle('is-low', low);
      row.classList.toggle('is-sold-out', soldOut);
      if (soldOut) text.textContent = this.root.dataset.outStockLabel || this.root.dataset.soldLabel || 'Sold out';
      else if (low) {
        const showExact = row.dataset.showExact === 'true';
        const template = this.root.dataset.lowStockCountTemplate || 'Only __QTY__ left';
        text.textContent = showExact ? template.replace('__QTY__', String(quantity)) : (this.root.dataset.lowStockLabel || 'Low stock');
      } else text.textContent = this.root.dataset.inStockLabel || 'In stock';
    }

    normalizeQuantity(input) {
      if (!input) return;
      const min = Math.max(1, Number(input.min || 1));
      const step = Math.max(1, Number(input.step || 1));
      const max = Number(input.max || 0);
      let value = Number(input.value);
      if (!Number.isFinite(value)) value = min;
      value = Math.max(min, value);
      if (max > 0) value = Math.min(max, value);
      const offset = Math.max(0, value - min);
      value = min + Math.floor((offset + Number.EPSILON) / step) * step;
      if (max > 0) value = Math.min(max, value);
      input.value = String(value);

      const quantity = input.closest('[data-quantity]');
      const minus = quantity?.querySelector('[data-quantity-minus]');
      const plus = quantity?.querySelector('[data-quantity-plus]');
      if (minus) minus.disabled = value <= min;
      if (plus) plus.disabled = max > 0 && value >= max;
    }

    updateQuantityRules(variant) {
      const rule = variant.quantity_rule || {};
      this.root.querySelectorAll('[data-product-quantity]').forEach((input) => {
        const min = Math.max(1, Number(rule.min || 1));
        const step = Math.max(1, Number(rule.increment || 1));
        const max = Number(rule.max || 0);
        input.min = String(min);
        input.step = String(step);
        if (max > 0) input.max = String(max); else input.removeAttribute('max');
        this.normalizeQuantity(input);
      });
    }

    updateVolumePricing(variant) {
      const root = this.root.querySelector('[data-volume-pricing-root]');
      if (!root) return;
      let hasCurrentBreaks = false;
      root.querySelectorAll('[data-volume-pricing-variant]').forEach((table) => {
        const active = String(table.dataset.volumePricingVariant || '') === String(variant.id);
        table.hidden = !active;
        if (active) hasCurrentBreaks = true;
      });
      root.hidden = !hasCurrentBreaks;
    }

    updatePurchaseState(variant) {
      const button = this.root.querySelector('[data-add-to-cart]');
      const checkout = this.root.querySelector('[data-dynamic-checkout]');
      const canSubmit = Boolean(variant.available);
      if (button) {
        button.disabled = !canSubmit;
        button.dataset.canSubmit = String(canSubmit);
        const text = button.querySelector('[data-add-to-cart-text]');
        if (text) text.textContent = canSubmit ? (this.root.dataset.addLabel || 'Add to cart') : (this.root.dataset.soldLabel || 'Sold out');
      }
      if (checkout) checkout.hidden = !canSubmit;
    }

    async refreshPickup(variantId) {
      const current = this.root.querySelector('[data-product-pickup]');
      if (!current || !variantId) return;
      this.pickupController?.abort();
      this.pickupController = new AbortController();
      try {
        const url = new URL(this.root.dataset.productUrl || location.pathname, location.origin);
        url.searchParams.set('variant', String(variantId));
        url.searchParams.set('section_id', this.root.dataset.sectionId || '');
        const response = await fetch(url.toString(), { signal: this.pickupController.signal, headers: { Accept: 'text/html' } });
        if (!response.ok) return;
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const replacement = doc.querySelector('[data-product-pickup]');
        if (replacement && current.isConnected) current.replaceWith(replacement);
      } catch (error) {
        if (error?.name !== 'AbortError' && window.Shopify?.designMode) console.warn('[Spider Product] Pickup refresh failed.', error);
      }
    }

    productSummary() {
      const variant = this.currentVariant;
      const url = new URL(this.root.dataset.productUrl || this.product.url || location.pathname, location.origin);
      if (variant?.id) url.searchParams.set('variant', String(variant.id));
      const activeImage = this.root.querySelector('.sp-product-media.is-active img');
      return {
        id: String(this.product.id || this.root.dataset.productId || ''),
        handle: this.product.handle || this.root.dataset.productHandle || '',
        url: url.toString(),
        title: this.product.title || document.title,
        vendor: this.product.vendor || '',
        image: activeImage?.currentSrc || activeImage?.src || this.product.featuredImage || '',
        price: Number(variant?.price || 0),
        compareAt: Number(variant?.compare_at_price || 0),
        available: Boolean(variant?.available)
      };
    }

    syncSecondaryActions() {
      const id = String(this.product.id || this.root.dataset.productId || '');
      const wishlistActive = Boolean(window.SpiderWishlist?.has?.(id));
      const compareActive = Boolean(window.SpiderCompare?.has?.(id));
      this.root.querySelectorAll('[data-main-product-wishlist]').forEach((button) => {
        button.classList.toggle('is-active', wishlistActive);
        button.setAttribute('aria-pressed', String(wishlistActive));
      });
      this.root.querySelectorAll('[data-main-product-compare]').forEach((button) => {
        button.classList.toggle('is-active', compareActive);
        button.setAttribute('aria-pressed', String(compareActive));
      });
    }

    onWishlistChange() { this.syncSecondaryActions(); }
    onCompareChange() { this.syncSecondaryActions(); }

    async shareProduct() {
      const summary = this.productSummary();
      try {
        if (navigator.share) await navigator.share({ title: summary.title, url: summary.url });
        else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(summary.url);
          this.announce('Product link copied.');
        }
      } catch (error) {
        if (error?.name !== 'AbortError') this.announce('Unable to share this product.');
      }
    }

    announce(message) {
      const local = this.root.querySelector('[data-product-live-region]');
      if (local) {
        local.textContent = '';
        requestAnimationFrame(() => { local.textContent = String(message || ''); });
      }
      window.Spider?.announce?.(message);
    }

    setupStickyOffset() {
      if (!this.root.classList.contains('sp-main-product--sticky')) return;
      const header = document.querySelector('.sp-header[data-sticky], [data-header][data-sticky]');
      const update = () => {
        if (!header || header.dataset.sticky === 'none') {
          this.root.style.setProperty('--sp-product-sticky-offset', '16px');
          return;
        }
        const height = Math.max(0, Math.round(header.getBoundingClientRect().height));
        this.root.style.setProperty('--sp-product-sticky-offset', `${height + 16}px`);
      };
      update();
      if (header && 'ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(update);
        this.resizeObserver.observe(header);
      }
    }

    onBlockSelect(event) {
      if (!window.Shopify?.designMode || !this.root.contains(event.target)) return;
      event.target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }

    destroy() {
      this.pickupController?.abort();
      this.resizeObserver?.disconnect();
      this.root.removeEventListener('change', this.onChange);
      this.root.removeEventListener('click', this.onClick);
      this.root.removeEventListener('submit', this.onSubmit, true);
      this.root.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('sp:product-system:ready', this.onProductSystemReady);
      document.removeEventListener('sp:product-commerce:ready', this.onProductSystemReady);
      document.removeEventListener('sp:commerce:ready', this.onProductSystemReady);
      document.removeEventListener('sp:wishlist:change', this.onWishlistChange);
      document.removeEventListener('sp:compare:change', this.onCompareChange);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.bound = false;
    }
  }

  window.Spider = window.Spider || {};
  window.Spider.ProductForm = ProductPageController;

  const init = (scope = document) => {
    scope.querySelectorAll?.('[data-main-product]').forEach((root) => {
      if (!root.__spiderProductPage) root.__spiderProductPage = new ProductPageController(root);
    });
  };

  const destroy = (scope) => {
    scope.querySelectorAll?.('[data-main-product]').forEach((root) => {
      root.__spiderProductPage?.destroy();
      delete root.__spiderProductPage;
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));
})();
