(() => {
  'use strict';

  const Spider = window.Spider = window.Spider || {};
  const EVENTS = {
    cartUpdated: Spider.events?.cartUpdated || 'spider:cart:updated',
    cartError: Spider.events?.cartError || 'spider:cart:error'
  };

  class CartController {
    constructor() {
      this.controller = null;
      this.sequence = 0;
      this.productRequests = new WeakMap();
      this.onChange = this.onChange.bind(this);
      this.onSubmit = this.onSubmit.bind(this);
      this.onRemove = this.onRemove.bind(this);
      this.onProductSubmit = this.onProductSubmit.bind(this);
      document.addEventListener('change', this.onChange);
      document.addEventListener('submit', this.onSubmit);
      document.addEventListener('submit', this.onProductSubmit);
      document.addEventListener('click', this.onRemove);
    }

    routesRoot() {
      return window.Shopify?.routes?.root || '/';
    }

    sectionIds() {
      return [...new Set([...document.querySelectorAll('[data-cart-section][data-section-id]')]
        .map((el) => el.dataset.sectionId)
        .filter(Boolean))].slice(0, 5);
    }

    setBusy(isBusy) {
      document.querySelectorAll('[data-cart-form]').forEach((form) => {
        form.toggleAttribute('aria-busy', isBusy);
        form.querySelectorAll('button, input, textarea').forEach((control) => {
          if (control.name === 'checkout') return;
          control.disabled = isBusy;
        });
      });
    }

    updateGlobalCartCount(itemCount) {
      if (!Number.isFinite(Number(itemCount))) return;
      document.querySelectorAll('[data-cart-count]').forEach((node) => {
        node.textContent = String(itemCount);
      });
    }

    render(sections) {
      Object.entries(sections || {}).forEach(([id, html]) => {
        const current = document.querySelector(`[data-cart-section][data-section-id="${CSS.escape(id)}"]`);
        if (!current || typeof html !== 'string') return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const replacement = doc.querySelector(`[data-cart-section][data-section-id="${CSS.escape(id)}"]`) || doc.body.firstElementChild;
        if (!replacement) return;

        // Preserve the live Cart Drawer dialog/instance. Replacing the dialog node would
        // leave SpiderCartDrawerEnhancements holding a stale reference.
        if (current.matches('[data-cart-drawer]')) {
          const currentRender = current.querySelector('[data-sp-cart-drawer-render]');
          const nextRender = replacement.querySelector('[data-sp-cart-drawer-render]');
          if (currentRender && nextRender) {
            const currentMain = currentRender.querySelector('[data-sp-cart-drawer-main]');
            const scrollTop = currentMain?.scrollTop || 0;
            currentRender.innerHTML = nextRender.innerHTML;
            const refreshedMain = currentRender.querySelector('[data-sp-cart-drawer-main]');
            if (refreshedMain && scrollTop > 0) refreshedMain.scrollTop = scrollTop;
            return;
          }
        }

        current.replaceWith(replacement);
      });
    }

    async request(url, payload, { openDrawer = false, source = 'cart' } = {}) {
      this.controller?.abort();
      this.controller = new AbortController();
      const seq = ++this.sequence;
      const sections = this.sectionIds();
      this.setBusy(true);

      const body = { ...payload };
      if (sections.length) {
        body.sections = sections;
        body.sections_url = location.pathname;
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: this.controller.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.description || data.message || 'Cart update failed');
        if (seq !== this.sequence) return data;
        this.render(data.sections || {});
        this.updateGlobalCartCount(data.item_count);
        document.dispatchEvent(new CustomEvent(EVENTS.cartUpdated, { detail: { source, cart: data } }));
        if (openDrawer) this.openCartDrawer();
        return data;
      } finally {
        if (seq === this.sequence) this.setBusy(false);
      }
    }

    async refresh(options = {}) {
      try {
        return await this.request(`${this.routesRoot()}cart/update.js`, { updates: {} }, options);
      } catch (error) {
        this.report(error);
        return null;
      }
    }

    onChange(event) {
      const input = event.target.closest('[data-cart-form] input[name="updates[]"]');
      if (!input || !window.Spider?.settings?.cart_ajax_updates) return;
      const line = Number(input.closest('[data-cart-line]')?.dataset.cartLine);
      const quantity = Math.max(0, Math.floor(Number(input.value) || 0));
      if (line) this.request(`${this.routesRoot()}cart/change.js`, { line, quantity }).catch((error) => this.report(error));
    }

    onSubmit(event) {
      const form = event.target.closest('[data-cart-form]');
      if (!form || !window.Spider?.settings?.cart_ajax_updates) return;
      if (event.submitter?.name === 'checkout') return;
      event.preventDefault();
      const updates = {};
      form.querySelectorAll('input[name="updates[]"]').forEach((input, index) => {
        updates[index + 1] = Math.max(0, Math.floor(Number(input.value) || 0));
      });
      this.request(`${this.routesRoot()}cart/update.js`, {
        updates,
        note: form.querySelector('[name="note"]')?.value || undefined
      }).catch((error) => this.report(error));
    }

    productCartConfig(form) {
      const root = form.closest('[data-main-product]');
      const localAjax = root?.dataset.cartAjaxUpdates;
      const localOpen = root?.dataset.cartOpenAfterAdd;
      const localType = root?.dataset.cartType;
      const globalSettings = window.Spider?.settings || {};

      const ajax = localAjax === 'true'
        ? true
        : localAjax === 'false'
          ? false
          : globalSettings.cart_ajax_updates !== false;
      const openAfterAdd = localOpen === 'true'
        ? true
        : localOpen === 'false'
          ? false
          : Boolean(globalSettings.cart_open_after_add);
      const type = String(localType || globalSettings.cart_type || (document.getElementById('CartDrawer') ? 'drawer' : 'page')).toLowerCase();

      return { ajax, openAfterAdd, type };
    }

    productAjaxEnabled(form) {
      if (typeof window.fetch !== 'function' || typeof window.FormData !== 'function') return false;
      const config = this.productCartConfig(form);
      // "Page" intentionally preserves Shopify's native Product Form navigation.
      if (config.type === 'page') return false;
      return config.ajax;
    }

    productOpenDrawer(form) {
      const config = this.productCartConfig(form);
      return config.ajax && config.openAfterAdd && config.type === 'drawer';
    }

    onProductSubmit(event) {
      const form = event.target.closest('[data-product-form], [data-product-card-form]');
      if (!form || event.defaultPrevented || !this.productAjaxEnabled(form)) return;

      const formData = new FormData(form);
      const variantId = String(formData.get('id') || '').trim();
      if (!variantId) return; // Preserve the native Shopify form fallback instead of swallowing an invalid form.

      event.preventDefault();
      this.addProductForm(form, event.submitter, formData).catch((error) => this.reportProductError(form, error));
    }

    async addProductForm(form, submitter = null, preparedFormData = null) {
      if (this.productRequests.has(form)) return null;
      const button = submitter || form.querySelector('[data-add-to-cart], button[type="submit"]');
      const message = form.querySelector('[data-product-message]');
      const controller = new AbortController();
      const formData = preparedFormData || new FormData(form);
      const variantId = String(formData.get('id') || '').trim();
      if (!variantId) throw new Error('Please select an available product option.');

      const sections = this.sectionIds();
      if (sections.length) {
        formData.set('sections', sections.join(','));
        formData.set('sections_url', location.pathname);
      }

      this.productRequests.set(form, controller);
      form.setAttribute('aria-busy', 'true');
      button?.setAttribute('aria-busy', 'true');
      if (button) button.disabled = true;
      if (message) {
        message.textContent = '';
        message.classList.remove('is-success');
      }

      try {
        const response = await fetch(`${this.routesRoot()}cart/add.js`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: formData,
          signal: controller.signal
        });
        const item = await response.json();
        if (!response.ok) throw new Error(item.description || item.message || 'Unable to add item');

        this.render(item.sections || {});

        // cart/add.js returns the added line item, not a guaranteed global item_count.
        // Fetch the canonical cart state for header counts and downstream listeners.
        let cart = null;
        try {
          const cartResponse = await fetch(`${this.routesRoot()}cart.js`, {
            method: 'GET',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            signal: controller.signal
          });
          if (cartResponse.ok) cart = await cartResponse.json();
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
        }

        if (cart) this.updateGlobalCartCount(cart.item_count);

        // If bundled section rendering was unavailable, refresh the canonical cart section markup.
        if (!item.sections && this.sectionIds().length) {
          const refreshed = await this.refresh({ openDrawer: false, source: 'product-form-refresh' });
          if (refreshed) cart = refreshed;
        }

        const addedLabel = form.dataset.addedLabel || (document.documentElement.lang === 'bn' ? 'কার্টে যোগ হয়েছে' : 'Added to cart');
        if (message) {
          message.textContent = addedLabel;
          message.classList.add('is-success');
        }

        const openDrawer = this.productOpenDrawer(form);
        document.dispatchEvent(new CustomEvent(EVENTS.cartUpdated, {
          detail: { source: 'product-form', cart, item, form, variantId }
        }));
        window.Spider?.announce?.(addedLabel);
        if (openDrawer) this.openCartDrawer();
        return item;
      } catch (error) {
        if (error?.name !== 'AbortError') this.reportProductError(form, error);
        return null;
      } finally {
        if (this.productRequests.get(form) === controller) this.productRequests.delete(form);
        form.removeAttribute('aria-busy');
        button?.removeAttribute('aria-busy');
        if (button) button.disabled = button.dataset.canSubmit === 'false';
      }
    }

    openCartDrawer() {
      const trigger = document.querySelector('[data-drawer-open="CartDrawer"]');
      const dialog = document.getElementById('CartDrawer');
      if (typeof window.Spider?.openDrawer === 'function' && (dialog || trigger)) {
        window.Spider.openDrawer('CartDrawer', trigger || null);
        return true;
      }
      if (trigger) {
        trigger.click();
        return true;
      }
      if (dialog instanceof HTMLDialogElement) {
        if (!dialog.open) {
          try { dialog.showModal(); } catch (_) { return false; }
        }
        return true;
      }
      return false;
    }

    reportProductError(form, error) {
      if (error?.name === 'AbortError') return;
      const message = form?.querySelector('[data-product-message]');
      if (message) {
        message.textContent = error?.message || 'Unable to add item';
        message.classList.remove('is-success');
      }
      this.report(error);
    }

    onRemove(event) {
      const link = event.target.closest('[data-cart-remove]');
      if (!link || !window.Spider?.settings?.cart_ajax_updates) return;
      event.preventDefault();
      const line = Number(link.dataset.line);
      if (line) this.request(`${this.routesRoot()}cart/change.js`, { line, quantity: 0 }).catch((error) => this.report(error));
    }

    report(error) {
      if (error?.name === 'AbortError') return;
      window.Spider?.announce?.(error?.message || 'Cart error');
      document.dispatchEvent(new CustomEvent(EVENTS.cartError, { detail: { error } }));
    }
  }

  const boot = () => {
    window.Spider = window.Spider || {};
    window.Spider.cartController = window.Spider.cartController || new CartController();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
