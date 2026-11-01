(() => {
  'use strict';

  const SELECTOR = '[data-sp-product-bundle]';

  const money = (cents, root) => {
    const amount = Number(cents || 0);

    try {
      if (window.Spider?.money?.format) {
        return window.Spider.money.format(amount);
      }
    } catch (_) {}

    try {
      if (window.Shopify?.formatMoney) {
        return window.Shopify.formatMoney(amount, root.dataset.moneyFormat || '${{amount}}');
      }
    } catch (_) {}

    try {
      return new Intl.NumberFormat(document.documentElement.lang || 'en', {
        style: 'currency',
        currency: root.dataset.currency || 'USD'
      }).format(amount / 100);
    } catch (_) {
      return (amount / 100).toFixed(2);
    }
  };

  class SpiderProductBundle {
    constructor(root) {
      if (!root || root.__spBundleInstance) return root?.__spBundleInstance;
      this.root = root;
      this.root.__spBundleInstance = this;
      this.abort = new AbortController();

      this.addButton = root.querySelector('[data-bundle-add]');
      this.addLabel = root.querySelector('[data-bundle-add-label]');
      this.totalEl = root.querySelector('[data-bundle-total]');
      this.statusEl = root.querySelector('[data-bundle-status]');
      this.errorEl = root.querySelector('[data-bundle-error]');
      this.items = [...root.querySelectorAll('[data-bundle-item]')];

      this.onChange = this.onChange.bind(this);
      this.onAdd = this.onAdd.bind(this);

      root.addEventListener('change', this.onChange, { signal: this.abort.signal });
      this.addButton?.addEventListener('click', this.onAdd, { signal: this.abort.signal });

      this.refresh();
    }

    destroy() {
      this.abort.abort();
      if (this.root) delete this.root.__spBundleInstance;
    }

    getVariantData(item) {
      if (item.__spVariants) return item.__spVariants;
      const script = item.querySelector('[data-bundle-variants-json]');
      if (!script) return [];
      try {
        item.__spVariants = JSON.parse(script.textContent || '[]');
      } catch (_) {
        item.__spVariants = [];
      }
      return item.__spVariants;
    }

    getSelectedVariant(item) {
      const select = item.querySelector('[data-bundle-variant-select]');
      const variants = this.getVariantData(item);

      if (select) {
        return variants.find((variant) => String(variant.id) === String(select.value)) || null;
      }

      const id = item.dataset.selectedVariantId;
      return variants.find((variant) => String(variant.id) === String(id)) || null;
    }

    onChange(event) {
      const select = event.target.closest?.('[data-bundle-variant-select]');
      if (!select || !this.root.contains(select)) return;

      const item = select.closest('[data-bundle-item]');
      if (!item) return;

      const variant = this.getSelectedVariant(item);
      if (!variant) return;

      item.dataset.selectedVariantId = String(variant.id);
      item.dataset.selectedPrice = String(variant.price || 0);
      item.dataset.selectedAvailable = String(Boolean(variant.available));

      const priceEl = item.querySelector('[data-bundle-price]');
      const compareEl = item.querySelector('[data-bundle-compare]');
      const thumb = item.querySelector('[data-bundle-thumb]');

      if (priceEl) priceEl.textContent = money(variant.price, this.root);

      if (compareEl) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          compareEl.hidden = false;
          compareEl.textContent = money(variant.compare_at_price, this.root);
        } else {
          compareEl.hidden = true;
          compareEl.textContent = '';
        }
      }

      if (thumb && variant.image) {
        thumb.src = variant.image;
        thumb.removeAttribute('srcset');
      }

      this.refresh();
    }

    refresh() {
      const selected = this.items.map((item) => this.getSelectedVariant(item));
      const complete = selected.length >= 2 && selected.every(Boolean);
      const available = complete && selected.every((variant) => variant.available);
      const total = selected.reduce((sum, variant) => sum + Number(variant?.price || 0), 0);

      if (this.totalEl) this.totalEl.textContent = money(total, this.root);

      if (this.addButton) {
        this.addButton.disabled = !available;
        this.addButton.setAttribute('aria-disabled', available ? 'false' : 'true');
      }

      if (this.addLabel && !this.addButton?.classList.contains('is-loading')) {
        this.addLabel.textContent = available
          ? (this.root.dataset.addLabel || 'Add bundle to cart')
          : (complete
              ? (this.root.dataset.unavailableLabel || 'Bundle unavailable')
              : (this.root.dataset.chooseOptionsLabel || 'Choose available options'));
      }

      if (this.statusEl && !available) {
        this.statusEl.textContent = complete
          ? (this.root.dataset.unavailableLabel || 'Bundle unavailable')
          : (this.root.dataset.chooseOptionsLabel || 'Choose available options');
      } else if (this.statusEl) {
        this.statusEl.textContent = '';
      }

      return { selected, available, total };
    }

    async addViaSpider(items) {
      const candidates = [
        window.Spider?.cart?.addItems,
        window.SpiderCartAPI?.addItems,
        window.SpiderCart?.addItems
      ].filter((fn) => typeof fn === 'function');

      for (const fn of candidates) {
        try {
          return await fn.call(window.Spider?.cart || window.SpiderCartAPI || window.SpiderCart, items);
        } catch (_) {
          // Try the next known Spider adapter before falling back.
        }
      }

      return null;
    }

    async addViaShopify(items) {
      const response = await fetch(this.root.dataset.cartAddUrl || '/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ items })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(payload?.description || payload?.message || 'Unable to add bundle to cart.');
        error.payload = payload;
        throw error;
      }

      return payload;
    }

    notifyCart(result) {
      const detail = {
        source: 'sp-product-bundle',
        sectionId: this.root.dataset.sectionId,
        cart: result,
        result
      };

      document.dispatchEvent(new CustomEvent('spider:cart:updated', { detail }));
      document.dispatchEvent(new CustomEvent('cart:updated', { detail }));
      document.dispatchEvent(new CustomEvent('cart:refresh', { detail }));
      window.dispatchEvent(new CustomEvent('cart:updated', { detail }));
    }

    openCartDrawer(result) {
      if (String(this.root.dataset.cartOpenAfterAdd) !== 'true') return;

      const drawer =
        document.querySelector('cart-drawer') ||
        document.querySelector('[data-cart-drawer]') ||
        document.querySelector('.sp-cart-drawer');

      try {
        if (drawer && typeof drawer.renderContents === 'function' && result?.sections) {
          drawer.renderContents(result);
        }
      } catch (_) {}

      try {
        if (drawer && typeof drawer.open === 'function') {
          drawer.open();
          return;
        }
      } catch (_) {}

      const trigger =
        document.querySelector('[data-cart-open]') ||
        document.querySelector('[aria-controls="CartDrawer"]') ||
        document.querySelector('[aria-controls="cart-drawer"]');

      trigger?.click?.();
    }

    setLoading(isLoading) {
      if (!this.addButton || !this.addLabel) return;

      this.addButton.classList.toggle('is-loading', isLoading);
      this.addButton.setAttribute('aria-busy', isLoading ? 'true' : 'false');

      if (isLoading) {
        this.addButton.disabled = true;
        this.addLabel.textContent = this.root.dataset.loadingLabel || 'Adding bundle...';
      } else {
        this.refresh();
      }
    }

    async onAdd() {
      if (this.addButton?.disabled) return;

      const state = this.refresh();
      if (!state.available) return;

      const items = state.selected.map((variant) => ({
        id: Number(variant.id),
        quantity: 1,
        properties: {
          _spider_bundle_section: this.root.dataset.sectionId || ''
        }
      }));

      if (items.length < 2) return;

      if (this.errorEl) {
        this.errorEl.hidden = true;
        this.errorEl.textContent = '';
      }

      if (this.statusEl) this.statusEl.textContent = '';

      this.setLoading(true);

      try {
        let result = await this.addViaSpider(items);

        if (!result) {
          result = await this.addViaShopify(items);
        }

        this.notifyCart(result);
        this.openCartDrawer(result);

        if (this.statusEl) {
          this.statusEl.textContent = this.root.dataset.successLabel || 'Bundle added';
        }

        if (this.addLabel) {
          this.addLabel.textContent = this.root.dataset.successLabel || 'Bundle added';
        }

        window.setTimeout(() => this.refresh(), 1200);
      } catch (error) {
        if (this.errorEl) {
          this.errorEl.hidden = false;
          this.errorEl.textContent = error?.message || 'Unable to add the bundle. Please try again.';
        }
      } finally {
        this.setLoading(false);
      }
    }
  }

  const mount = (scope = document) => {
    scope.querySelectorAll?.(SELECTOR).forEach((root) => {
      if (!root.__spBundleInstance) new SpiderProductBundle(root);
    });
  };

  const unmountSection = (section) => {
    section?.querySelectorAll?.(SELECTOR).forEach((root) => {
      root.__spBundleInstance?.destroy?.();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }

  document.addEventListener('shopify:section:load', (event) => mount(event.target));
  document.addEventListener('shopify:section:unload', (event) => unmountSection(event.target));
})();
