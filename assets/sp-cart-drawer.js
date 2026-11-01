(() => {
  'use strict';

  if (window.SpiderCartDrawerEnhancements?.version) return;

  const ROOT_SELECTOR = '[data-sp-cart-drawer-root]';
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  class SpiderCartDrawerInstance {
    constructor(root) {
      this.root = root;
      this.sectionId = root.dataset.sectionId || '';
      this.dialog = root.querySelector('[data-cart-drawer]');
      this.render = root.querySelector('[data-sp-cart-drawer-render]');
      this.abortController = new AbortController();
      this.requests = new Map();
      this.activeTool = null;
      this.toolTrigger = null;
      this.recommendationsLoaded = false;
      this.openObserver = null;
      this.onClick = this.onClick.bind(this);
      this.onQuantityClick = this.onQuantityClick.bind(this);
      this.onQuantityChange = this.onQuantityChange.bind(this);
      this.onSubmit = this.onSubmit.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onDialogMutation = this.onDialogMutation.bind(this);
    }

    connect() {
      if (!this.dialog || this.root.dataset.spCartEnhanced === 'true') return;
      this.root.dataset.spCartEnhanced = 'true';
      const signal = this.abortController.signal;
      // Quantity controls use dedicated capture handlers because the Kalles-parity
      // item markup is intentionally different from Spider Core's legacy cart-item markup.
      // Capturing here makes this drawer the single owner for these exact controls and
      // prevents a document-level legacy cart handler from sending a duplicate mutation.
      this.root.addEventListener('click', this.onQuantityClick, { capture: true, signal });
      this.root.addEventListener('change', this.onQuantityChange, { capture: true, signal });
      this.root.addEventListener('click', this.onClick, { signal });
      this.root.addEventListener('submit', this.onSubmit, { signal });
      this.root.addEventListener('change', (event) => {
        if (event.target.matches('[data-sp-shipping-country]')) {
          this.syncShippingProvinces(event.target.closest('[data-sp-cart-shipping-form]'));
        }
        if (event.target.matches('[data-sp-cart-terms]') && event.target.checked) {
          const form = event.target.closest('.sp-cart-drawer__summary-form');
          const error = form?.querySelector('[data-sp-cart-terms-error]');
          if (error) error.hidden = true;
        }
      }, { signal });
      this.dialog.addEventListener('keydown', this.onKeydown, { capture: true, signal });
      this.openObserver = new MutationObserver(this.onDialogMutation);
      this.openObserver.observe(this.dialog, { attributes: true, attributeFilter: ['open'] });
      if (this.dialog.open) this.onDrawerOpened();
    }

    disconnect() {
      this.closeTool({ restoreFocus: false });
      this.abortController.abort();
      this.requests.forEach((controller) => controller.abort());
      this.requests.clear();
      this.openObserver?.disconnect();
      this.openObserver = null;
      delete this.root.dataset.spCartEnhanced;
    }

    onDialogMutation() {
      if (this.dialog?.open) this.onDrawerOpened();
      else this.closeTool({ restoreFocus: false });
    }

    onDrawerOpened() {
      this.loadComplementary();
    }

    normalizeQuantity(value, fallback = 1) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    getQuantityContext(control) {
      const item = control?.closest?.('[data-sp-cart-drawer-item]');
      const input = item?.querySelector?.('[data-sp-cart-drawer-quantity-input]');
      if (!item || !input) return null;

      const min = Math.max(0, this.normalizeQuantity(input.min, 1));
      const step = Math.max(1, this.normalizeQuantity(input.step, 1));
      const maxValue = this.normalizeQuantity(input.max, Number.MAX_SAFE_INTEGER);
      const max = input.max === '' ? Number.MAX_SAFE_INTEGER : Math.max(min, maxValue);
      const current = Math.min(max, Math.max(min, this.normalizeQuantity(input.value, min)));
      const key = item.dataset.key || input.dataset.key || '';
      const line = this.normalizeQuantity(item.dataset.cartLine || item.dataset.line || input.dataset.cartLine || input.dataset.line, 0);

      if (!key && line < 1) return null;
      return { item, input, min, step, max, current, key, line };
    }

    onQuantityClick(event) {
      const button = event.target.closest?.('[data-sp-cart-drawer-quantity-button]');
      if (!button || !this.root.contains(button)) return;

      // Own only the dedicated parity quantity buttons. This prevents a second
      // document-level cart handler from processing the same click.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;

      const context = this.getQuantityContext(button);
      if (!context) return;
      const action = button.dataset.quantityAction;
      let next = context.current;
      if (action === 'plus') next += context.step;
      else if (action === 'minus') next -= context.step;
      else return;

      next = Math.min(context.max, Math.max(context.min, next));
      if (next === context.current) return;

      context.input.value = String(next);
      this.syncQuantityButtons(context);
      void this.changeQuantity(context, next, action, context.current);
    }

    onQuantityChange(event) {
      const input = event.target.closest?.('[data-sp-cart-drawer-quantity-input]');
      if (!input || !this.root.contains(input)) return;

      event.stopPropagation();
      event.stopImmediatePropagation();
      const context = this.getQuantityContext(input);
      if (!context) return;

      let next = this.normalizeQuantity(input.value, context.current);
      // Align manually-entered values to the variant's increment rule.
      next = context.min + Math.round((next - context.min) / context.step) * context.step;
      next = Math.min(context.max, Math.max(context.min, next));
      input.value = String(next);
      this.syncQuantityButtons({ ...context, current: next });

      const confirmed = this.normalizeQuantity(input.dataset.confirmedQuantity, context.current);
      if (next === confirmed) return;
      void this.changeQuantity(context, next, 'input', confirmed);
    }

    syncQuantityButtons(context) {
      const { item, input, min, max } = context;
      const current = this.normalizeQuantity(input.value, min);
      const minus = item.querySelector('[data-sp-cart-drawer-quantity-button][data-quantity-action="minus"]');
      const plus = item.querySelector('[data-sp-cart-drawer-quantity-button][data-quantity-action="plus"]');
      if (minus) minus.disabled = current <= min;
      if (plus) plus.disabled = current >= max;
    }

    findQuantityItem(key, line) {
      return Array.from(this.root.querySelectorAll('[data-sp-cart-drawer-item]')).find((item) => {
        if (key && item.dataset.key === key) return true;
        const itemLine = this.normalizeQuantity(item.dataset.cartLine || item.dataset.line, 0);
        return !key && line > 0 && itemLine === line;
      }) || null;
    }

    restoreQuantityFocus(key, line, action) {
      const item = this.findQuantityItem(key, line);
      if (!item) return;
      let target = null;
      if (action === 'plus' || action === 'minus') {
        target = item.querySelector(`[data-sp-cart-drawer-quantity-button][data-quantity-action="${action}"]`);
      } else {
        target = item.querySelector('[data-sp-cart-drawer-quantity-input]');
      }
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }

    async changeQuantity(context, quantity, action, previousQuantity) {
      const { item, input, key, line } = context;
      const requestKey = `quantity:${key || line}`;
      const payload = key ? { id: key, quantity } : { line, quantity };
      item.setAttribute('aria-busy', 'true');

      try {
        const data = await this.cartRequest(requestKey, 'cart/change.js', payload);
        const refreshed = this.refreshMarkup(data);
        if (!refreshed && input.isConnected) {
          input.value = String(quantity);
          input.dataset.confirmedQuantity = String(quantity);
          this.syncQuantityButtons({ ...context, current: quantity });
          this.updateGlobalCartCount(data.item_count);
          this.dispatchCartUpdated(data, 'cart-drawer-quantity');
        }
        this.announce('Cart updated.');
        requestAnimationFrame(() => this.restoreQuantityFocus(key, line, action));
      } catch (error) {
        if (error.name === 'AbortError') return;
        if (input.isConnected) {
          input.value = String(previousQuantity);
          input.dataset.confirmedQuantity = String(previousQuantity);
          this.syncQuantityButtons({ ...context, current: previousQuantity });
        }
        this.announce(error.message || 'Unable to update cart quantity.');
      } finally {
        if (item.isConnected) item.removeAttribute('aria-busy');
      }
    }

    onClick(event) {
      const openButton = event.target.closest('[data-sp-cart-tool-open]');
      if (openButton && this.root.contains(openButton)) {
        event.preventDefault();
        this.openTool(openButton.dataset.spCartToolOpen, openButton);
        return;
      }

      const closeButton = event.target.closest('[data-sp-cart-tool-close]');
      if (closeButton && this.root.contains(closeButton)) {
        event.preventDefault();
        this.closeTool();
        return;
      }

      const removeDiscount = event.target.closest('[data-sp-discount-remove]');
      if (removeDiscount && this.root.contains(removeDiscount)) {
        event.preventDefault();
        this.removeDiscount(removeDiscount);
        return;
      }

      const checkoutButton = event.target.closest('[data-sp-cart-checkout]');
      if (checkoutButton && this.root.contains(checkoutButton)) {
        const checkoutForm = checkoutButton.closest('.sp-cart-drawer__summary-form');
        const requiredTerms = checkoutForm?.querySelector('[data-sp-cart-terms-required]');
        if (requiredTerms && !requiredTerms.checked) {
          event.preventDefault();
          const error = checkoutForm.querySelector('[data-sp-cart-terms-error]');
          if (error) error.hidden = false;
          requiredTerms.focus();
          this.announce('Please agree to the terms before checkout.');
        }
      }
    }

    onKeydown(event) {
      if (event.key !== 'Escape' || !this.activeTool) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.closeTool();
    }

    onSubmit(event) {
      const noteForm = event.target.closest('[data-sp-cart-note-form]');
      if (noteForm) {
        event.preventDefault();
        this.saveNote(noteForm);
        return;
      }

      const discountForm = event.target.closest('[data-sp-cart-discount-form]');
      if (discountForm) {
        event.preventDefault();
        this.applyDiscount(discountForm);
        return;
      }

      const shippingForm = event.target.closest('[data-sp-cart-shipping-form]');
      if (shippingForm) {
        event.preventDefault();
        this.estimateShipping(shippingForm);
        return;
      }

      const checkoutForm = event.target.closest('.sp-cart-drawer__summary-form');
      if (checkoutForm && event.submitter?.name === 'checkout') {
        const requiredTerms = checkoutForm.querySelector('[data-sp-cart-terms-required]');
        if (requiredTerms && !requiredTerms.checked) {
          event.preventDefault();
          const error = checkoutForm.querySelector('[data-sp-cart-terms-error]');
          if (error) error.hidden = false;
          requiredTerms.focus();
          this.announce('Please agree to the terms before checkout.');
          return;
        }
        event.submitter.disabled = true;
        event.submitter.setAttribute('aria-busy', 'true');
      }
      // Gift wrap and complementary Quick Add are intentionally NOT intercepted.
      // Their data-product-card-form hook is owned by Spider's existing product/cart controller.
    }

    openTool(name, trigger) {
      const panel = this.root.querySelector(`[data-sp-cart-tool-panel="${CSS.escape(name)}"]`);
      if (!panel) return;
      if (this.activeTool) this.closeTool({ restoreFocus: false });
      this.activeTool = panel;
      this.toolTrigger = trigger || null;
      panel.hidden = false;
      trigger?.setAttribute('aria-expanded', 'true');
      if (name === 'shipping') this.syncShippingProvinces(panel.querySelector('[data-sp-cart-shipping-form]'));
      this.setPrimaryContentInert(true);
      const first = panel.querySelector(FOCUSABLE);
      requestAnimationFrame(() => first?.focus());
    }

    closeTool({ restoreFocus = true } = {}) {
      if (!this.activeTool) return;
      const panel = this.activeTool;
      const trigger = this.toolTrigger;
      panel.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
      this.activeTool = null;
      this.toolTrigger = null;
      this.setPrimaryContentInert(false);
      if (restoreFocus && trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
    }

    setPrimaryContentInert(state) {
      const body = this.root.querySelector('[data-sp-cart-drawer-body]');
      if (!body) return;
      body.querySelectorAll(':scope > .sp-cart-drawer__shipping, :scope > .sp-cart-drawer__main, :scope > .sp-cart-drawer__bottom').forEach((el) => {
        el.inert = state;
        if (state) el.setAttribute('aria-hidden', 'true');
        else el.removeAttribute('aria-hidden');
      });
    }

    route(path) {
      const base = window.Shopify?.routes?.root || '/';
      return `${base}${path}`.replace(/([^:]\/)\/+/g, '$1');
    }

    makeRequestController(key) {
      this.requests.get(key)?.abort();
      const controller = new AbortController();
      this.requests.set(key, controller);
      return controller;
    }

    async cartRequest(key, endpoint, payload) {
      const controller = this.makeRequestController(key);
      const body = this.root.querySelector('[data-sp-cart-drawer-body]');
      body?.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch(this.route(endpoint), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          credentials: 'same-origin',
          signal: controller.signal,
          body: JSON.stringify({
            ...payload,
            sections: [this.sectionId],
            sections_url: `${location.pathname}${location.search}`
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data.description || data.message || `Cart request failed (${response.status})`;
          throw new Error(message);
        }
        return data;
      } finally {
        if (this.requests.get(key) === controller) this.requests.delete(key);
        body?.setAttribute('aria-busy', 'false');
      }
    }

    getSectionHTML(data) {
      if (!data?.sections || !this.sectionId) return '';
      return data.sections[this.sectionId] || '';
    }

    parseRenderedSection(html) {
      if (!html) return null;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.querySelector('[data-sp-cart-drawer-render]');
    }

    refreshMarkup(data) {
      const nextRender = this.parseRenderedSection(this.getSectionHTML(data));
      if (!nextRender || !this.render) return false;
      const currentMain = this.render.querySelector('[data-sp-cart-drawer-main]');
      const previousScrollTop = currentMain?.scrollTop || 0;
      this.closeTool({ restoreFocus: false });
      this.render.innerHTML = nextRender.innerHTML;
      const refreshedMain = this.render.querySelector('[data-sp-cart-drawer-main]');
      if (refreshedMain && previousScrollTop > 0) refreshedMain.scrollTop = previousScrollTop;
      this.updateGlobalCartCount(data.item_count);
      this.dispatchCartUpdated(data);
      this.recommendationsLoaded = false;
      this.loadComplementary();
      return true;
    }

    updateGlobalCartCount(itemCount) {
      if (!Number.isFinite(Number(itemCount))) return;
      document.querySelectorAll('[data-cart-count]').forEach((node) => {
        node.textContent = String(itemCount);
      });
    }

    dispatchCartUpdated(cart, source = 'cart-drawer-tools') {
      document.dispatchEvent(new CustomEvent('spider:cart:updated', { detail: { cart, source } }));
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart, source } }));
    }

    statusFor(form) {
      return form?.querySelector('[data-sp-cart-tool-status]');
    }

    setStatus(form, message, isError = false) {
      const status = this.statusFor(form);
      if (!status) return;
      status.textContent = message || '';
      status.dataset.error = isError ? 'true' : 'false';
    }

    setFormBusy(form, busy) {
      form?.setAttribute('aria-busy', busy ? 'true' : 'false');
      form?.querySelectorAll('button, input, select, textarea').forEach((control) => {
        if (busy) {
          if (!control.disabled) control.dataset.spWasEnabled = 'true';
          control.disabled = true;
        } else if (control.dataset.spWasEnabled === 'true') {
          control.disabled = false;
          delete control.dataset.spWasEnabled;
        }
      });
    }

    async saveNote(form) {
      const note = form.elements.note?.value || '';
      this.setStatus(form, 'Saving…');
      this.setFormBusy(form, true);
      try {
        const data = await this.cartRequest('note', 'cart/update.js', { note });
        this.refreshMarkup(data);
        this.announce('Cart note saved.');
      } catch (error) {
        if (error.name !== 'AbortError') {
          this.setStatus(form, error.message || 'Unable to save cart note.', true);
          this.announce('Unable to save cart note.');
        }
      } finally {
        if (form.isConnected) this.setFormBusy(form, false);
      }
    }

    async applyDiscount(form) {
      const input = form.elements.discount;
      const code = input?.value.trim() || '';
      if (!code) {
        this.setStatus(form, form.dataset.errorMessage || 'Enter a valid discount code', true);
        input?.focus();
        return;
      }
      const existingCodes = Array.from(form.closest('[data-sp-cart-tool-panel]')?.querySelectorAll('[data-sp-discount-code]') || [])
        .map((node) => node.dataset.spDiscountCode || '')
        .filter(Boolean);
      const normalized = code.toLocaleLowerCase();
      const requestedCodes = existingCodes.some((value) => value.toLocaleLowerCase() === normalized)
        ? existingCodes
        : [...existingCodes, code];

      this.setStatus(form, 'Applying…');
      this.setFormBusy(form, true);
      try {
        const data = await this.cartRequest('discount', 'cart/update.js', { discount: requestedCodes.join(',') });
        const next = this.parseRenderedSection(this.getSectionHTML(data));
        const renderedMatch = Array.from(next?.querySelectorAll('[data-sp-discount-code]') || []).some((node) => (node.dataset.spDiscountCode || '').toLocaleLowerCase() === normalized);
        const responseMatch = Array.from(data?.cart_level_discount_applications || []).some((application) => (application?.title || '').toLocaleLowerCase() === normalized);
        const matched = renderedMatch || responseMatch;
        if (!matched) {
          this.setStatus(form, form.dataset.errorMessage || 'Enter a valid discount code', true);
          return;
        }
        this.refreshMarkup(data);
        this.announce(`Discount ${code} applied.`);
        const newTrigger = this.root.querySelector('[data-sp-cart-tool-open="discount"]');
        if (newTrigger) {
          this.openTool('discount', newTrigger);
          const newForm = this.root.querySelector('[data-sp-cart-discount-form]');
          this.setStatus(newForm, 'Discount applied.');
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          this.setStatus(form, error.message || form.dataset.errorMessage || 'Unable to apply discount.', true);
          this.announce('Unable to apply discount.');
        }
      } finally {
        if (form.isConnected) this.setFormBusy(form, false);
      }
    }

    async removeDiscount(button) {
      const code = button.dataset.spDiscountCode || '';
      const panel = button.closest('[data-sp-cart-tool-panel]');
      const form = panel?.querySelector('[data-sp-cart-discount-form]');
      const remaining = Array.from(panel?.querySelectorAll('[data-sp-discount-code]') || [])
        .map((node) => node.dataset.spDiscountCode || '')
        .filter((value) => value && value !== code);
      this.setStatus(form, 'Removing…');
      button.disabled = true;
      try {
        const data = await this.cartRequest('discount', 'cart/update.js', { discount: remaining.join(',') });
        this.refreshMarkup(data);
        this.announce(`Discount ${code} removed.`);
        const newTrigger = this.root.querySelector('[data-sp-cart-tool-open="discount"]');
        if (newTrigger) this.openTool('discount', newTrigger);
      } catch (error) {
        if (error.name !== 'AbortError') {
          button.disabled = false;
          this.setStatus(form, error.message || 'Unable to remove discount.', true);
          this.announce('Unable to remove discount.');
        }
      }
    }

    syncShippingProvinces(form) {
      if (!form) return;
      const country = form.querySelector('[data-sp-shipping-country]');
      const province = form.querySelector('[data-sp-shipping-province]');
      const field = form.querySelector('[data-sp-shipping-province-field]');
      if (!country || !province || !field) return;
      let provinces = [];
      try {
        provinces = JSON.parse(country.selectedOptions?.[0]?.dataset.provinces || '[]');
      } catch (_) {
        provinces = [];
      }
      const previous = province.value || form.dataset.defaultProvince || '';
      province.replaceChildren();
      provinces.forEach((entry) => {
        const value = Array.isArray(entry) ? entry[0] : entry;
        const label = Array.isArray(entry) ? entry[1] : entry;
        const option = new Option(label || value, value || label);
        if (String(option.value) === String(previous)) option.selected = true;
        province.add(option);
      });
      field.hidden = provinces.length === 0;
      province.disabled = provinces.length === 0;
    }

    async estimateShipping(form) {
      const results = form.querySelector('[data-sp-shipping-results]');
      const country = form.elements['address[country]']?.value || '';
      const province = form.elements['address[province]']?.value || '';
      const zip = form.elements['address[zip]']?.value || '';
      if (!country || !zip) {
        if (results) results.textContent = 'Enter a country and postal / ZIP code.';
        return;
      }

      const params = new URLSearchParams();
      params.set('shipping_address[country]', country);
      if (province) params.set('shipping_address[province]', province);
      params.set('shipping_address[zip]', zip);

      const controller = this.makeRequestController('shipping');
      this.setFormBusy(form, true);
      if (results) results.textContent = 'Calculating shipping rates…';
      try {
        const prepare = await fetch(`${this.route('cart/prepare_shipping_rates.json')}?${params}`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          signal: controller.signal
        });
        if (!prepare.ok && prepare.status !== 202) {
          const errorData = await prepare.json().catch(() => ({}));
          throw new Error(this.shippingError(errorData) || 'Unable to prepare shipping rates.');
        }

        const deadline = Date.now() + 10000;
        let payload = null;
        while (Date.now() < deadline) {
          await this.delay(450, controller.signal);
          const response = await fetch(`${this.route('cart/async_shipping_rates.json')}?${params}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal
          });
          if (response.status === 202) continue;
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(this.shippingError(data) || 'Unable to calculate shipping rates.');
          if (Array.isArray(data.shipping_rates)) {
            payload = data.shipping_rates;
            break;
          }
        }
        if (!payload) throw new Error('Shipping rates are taking too long. Please try again.');
        this.renderRates(results, payload);
        this.announce(payload.length ? 'Shipping rates updated.' : 'No shipping rates found.');
      } catch (error) {
        if (error.name !== 'AbortError') {
          if (results) results.textContent = error.message || 'Unable to calculate shipping rates.';
          this.announce('Unable to calculate shipping rates.');
        }
      } finally {
        if (this.requests.get('shipping') === controller) this.requests.delete('shipping');
        if (form.isConnected) this.setFormBusy(form, false);
      }
    }

    shippingError(data) {
      if (!data) return '';
      if (typeof data === 'string') return data;
      if (Array.isArray(data.error)) return data.error.join(' ');
      if (typeof data.error === 'string') return data.error;
      if (data.zip) return Array.isArray(data.zip) ? data.zip.join(' ') : String(data.zip);
      if (data.message) return String(data.message);
      return '';
    }

    renderRates(container, rates) {
      if (!container) return;
      container.replaceChildren();
      if (!rates.length) {
        container.textContent = 'No shipping rates found for this address.';
        return;
      }
      const list = document.createElement('ul');
      list.className = 'sp-cart-drawer__rates-list';
      rates.forEach((rate) => {
        const item = document.createElement('li');
        item.className = 'sp-cart-drawer__rate';
        const title = document.createElement('span');
        const price = document.createElement('strong');
        title.textContent = rate.name || rate.presentment_name || 'Shipping';
        price.textContent = rate.price === '0.00' || Number(rate.price) === 0 ? 'Free' : (rate.price_with_currency || rate.price || '');
        item.append(title, price);
        list.append(item);
      });
      container.append(list);
    }

    delay(ms, signal) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }

    async loadComplementary() {
      if (this.recommendationsLoaded || !this.dialog?.open) return;
      const container = this.root.querySelector('[data-sp-complementary]');
      const url = container?.dataset.recommendationsUrl;
      if (!container || !url) return;
      this.recommendationsLoaded = true;
      const controller = this.makeRequestController('recommendations');
      try {
        const response = await fetch(url, {
          headers: { Accept: 'text/html' },
          credentials: 'same-origin',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Recommendations request failed (${response.status})`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const incoming = doc.querySelector('[data-sp-complementary-products]');
        const current = container.querySelector('[data-sp-complementary-products]');
        if (!incoming || !current) return;
        const incomingCards = Array.from(incoming.querySelectorAll('[data-product-id]'));
        if (!incomingCards.length) return;
        if (container.dataset.replaceManual === 'true') {
          current.innerHTML = incoming.innerHTML;
        } else {
          const existing = new Set(Array.from(current.querySelectorAll('[data-product-id]')).map((el) => el.dataset.productId));
          incomingCards.forEach((card) => {
            if (!existing.has(card.dataset.productId)) current.append(card.cloneNode(true));
          });
        }
        if (current.querySelector('[data-product-id]')) container.hidden = false;
      } catch (error) {
        if (error.name !== 'AbortError') {
          // Manual recommendations stay visible; network failure is intentionally non-fatal.
        }
      } finally {
        if (this.requests.get('recommendations') === controller) this.requests.delete('recommendations');
      }
    }

    announce(message) {
      const live = document.getElementById('SpiderLiveRegion');
      if (!live || !message) return;
      live.textContent = '';
      requestAnimationFrame(() => { live.textContent = message; });
    }
  }

  const manager = {
    version: '1.0.1',
    instances: new Map(),
    controller: new AbortController(),
    observer: null,

    init(scope = document) {
      if (scope instanceof Element && scope.matches(ROOT_SELECTOR)) this.mount(scope);
      scope.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => this.mount(root));
      if (scope === document && !this.observer && document.body) {
        this.observer = new MutationObserver((records) => {
          records.forEach((record) => {
            record.removedNodes.forEach((node) => {
              if (!(node instanceof Element)) return;
              if (node.matches(ROOT_SELECTOR)) this.unmount(node);
              node.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => this.unmount(root));
            });
            record.addedNodes.forEach((node) => {
              if (!(node instanceof Element)) return;
              if (node.matches(ROOT_SELECTOR)) this.mount(node);
              node.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => this.mount(root));
            });
          });
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
      }
    },

    mount(root) {
      if (!root || this.instances.has(root)) return this.instances.get(root);
      const instance = new SpiderCartDrawerInstance(root);
      instance.connect();
      this.instances.set(root, instance);
      return instance;
    },

    unmount(root) {
      const instance = this.instances.get(root);
      if (!instance) return;
      instance.disconnect();
      this.instances.delete(root);
    },

    preview(root, force = false) {
      const instance = this.mount(root);
      const dialog = instance?.dialog;
      if (!dialog || dialog.open) return;
      const shouldOpen = force || dialog.dataset.openEditor === 'true';
      if (!shouldOpen) return;
      const existingTrigger = document.querySelector('[data-drawer-open="CartDrawer"]');
      if (existingTrigger) existingTrigger.click();
      else {
        try { dialog.showModal(); } catch (_) { /* Theme Editor fallback only */ }
      }
    },

    destroy() {
      this.instances.forEach((instance) => instance.disconnect());
      this.instances.clear();
      this.controller.abort();
      this.observer?.disconnect();
      this.observer = null;
    }
  };

  const signal = manager.controller.signal;
  const rootFromEvent = (target) => {
    if (!(target instanceof Element)) return null;
    if (target.matches(ROOT_SELECTOR)) return target;
    return target.closest?.(ROOT_SELECTOR) || target.querySelector?.(ROOT_SELECTOR) || null;
  };

  document.addEventListener('shopify:section:load', (event) => {
    manager.init(event.target);
    const root = rootFromEvent(event.target);
    if (root && window.Shopify?.designMode) manager.preview(root, false);
  }, { signal });

  document.addEventListener('shopify:section:unload', (event) => {
    const root = rootFromEvent(event.target);
    if (root) manager.unmount(root);
  }, { signal });

  document.addEventListener('shopify:section:select', (event) => {
    if (!window.Shopify?.designMode) return;
    const root = rootFromEvent(event.target);
    if (root) manager.preview(root, false);
  }, { signal });

  document.addEventListener('shopify:section:deselect', (event) => {
    if (!window.Shopify?.designMode) return;
    const root = rootFromEvent(event.target);
    const instance = root ? manager.instances.get(root) : null;
    instance?.closeTool({ restoreFocus: false });
  }, { signal });

  document.addEventListener('shopify:block:select', (event) => {
    if (!window.Shopify?.designMode) return;
    const root = rootFromEvent(event.target);
    if (root) manager.preview(root, true);
  }, { signal });

  document.addEventListener('shopify:block:deselect', (event) => {
    if (!window.Shopify?.designMode) return;
    const root = rootFromEvent(event.target);
    const instance = root ? manager.instances.get(root) : null;
    instance?.closeTool({ restoreFocus: false });
  }, { signal });

  window.SpiderCartDrawerEnhancements = manager;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.init(document), { once: true, signal });
  } else {
    manager.init(document);
  }
})();
