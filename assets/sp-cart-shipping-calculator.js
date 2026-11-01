(() => {
  'use strict';

  class SpiderCartShippingCalculator {
    constructor(root) {
      this.root = root;
      this.form = root.querySelector('[data-shipping-form]');
      this.country = root.querySelector('[data-shipping-country]');
      this.provinceWrap = root.querySelector('[data-shipping-province-wrap]');
      this.province = root.querySelector('[data-shipping-province]');
      this.zip = root.querySelector('[data-shipping-zip]');
      this.button = root.querySelector('[data-shipping-submit]');
      this.status = root.querySelector('[data-shipping-status]');
      this.results = root.querySelector('[data-shipping-results]');
      this.controller = null;
      this.destroyed = false;

      this.onCountryChange = this.onCountryChange.bind(this);
      this.onSubmit = this.onSubmit.bind(this);
      this.country?.addEventListener('change', this.onCountryChange);
      this.form?.addEventListener('submit', this.onSubmit);
      this.syncProvinces();
    }

    rootUrl() {
      const root = String(this.root.dataset.rootUrl || window.Shopify?.routes?.root || '/');
      return root.endsWith('/') ? root : `${root}/`;
    }

    setBusy(busy) {
      if (this.button) {
        this.button.disabled = busy;
        this.button.setAttribute('aria-busy', String(busy));
      }
      this.form?.setAttribute('aria-busy', String(busy));
    }

    setStatus(message, error = false) {
      if (!this.status) return;
      this.status.textContent = String(message || '');
      this.status.classList.toggle('sp-cart-shipping-calculator__error', Boolean(error));
    }

    onCountryChange() { this.syncProvinces(); }

    syncProvinces() {
      if (!this.country || !this.province || !this.provinceWrap) return;
      const option = this.country.options[this.country.selectedIndex];
      let provinces = [];
      try { provinces = JSON.parse(option?.dataset?.provinces || '[]'); } catch (_) { provinces = []; }

      this.province.textContent = '';
      provinces.forEach((entry) => {
        const value = Array.isArray(entry) ? entry[0] : entry?.[0] || entry?.code || '';
        const label = Array.isArray(entry) ? entry[1] : entry?.[1] || entry?.name || value;
        const node = document.createElement('option');
        node.value = String(value || '');
        node.textContent = String(label || value || '');
        this.province.appendChild(node);
      });

      const hasProvinces = provinces.length > 0;
      this.provinceWrap.hidden = !hasProvinces;
      this.province.disabled = !hasProvinces;
    }

    addressParams() {
      const params = new URLSearchParams();
      params.set('shipping_address[country]', this.country?.value || '');
      params.set('shipping_address[zip]', this.zip?.value.trim() || '');
      if (this.province && !this.province.disabled && this.province.value) {
        params.set('shipping_address[province]', this.province.value);
      }
      return params;
    }

    async onSubmit(event) {
      event.preventDefault();
      if (!this.form?.reportValidity()) return;

      this.controller?.abort();
      this.controller = new AbortController();
      const params = this.addressParams();
      const query = params.toString();
      const base = this.rootUrl();
      this.setBusy(true);
      this.setStatus('Calculating shipping rates…');
      if (this.results) {
        this.results.hidden = true;
        this.results.textContent = '';
      }

      try {
        const prepare = await fetch(`${base}cart/prepare_shipping_rates.json?${query}`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          signal: this.controller.signal
        });
        if (!prepare.ok && prepare.status !== 202) {
          const detail = await this.readError(prepare);
          throw new Error(detail || 'Unable to calculate shipping rates.');
        }

        const payload = await this.pollRates(`${base}cart/async_shipping_rates.json?${query}`, this.controller.signal);
        const rates = Array.isArray(payload?.shipping_rates) ? payload.shipping_rates : [];
        this.renderRates(rates);
      } catch (error) {
        if (error?.name !== 'AbortError') this.setStatus(error?.message || 'Unable to calculate shipping rates.', true);
      } finally {
        if (!this.destroyed) this.setBusy(false);
      }
    }

    async pollRates(url, signal) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
        if (!response.ok) {
          const detail = await this.readError(response);
          throw new Error(detail || 'Unable to calculate shipping rates.');
        }
        const text = await response.text();
        if (text && text !== 'null') {
          const data = JSON.parse(text);
          if (data?.shipping_rates) return data;
        }
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(resolve, 450);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      }
      throw new Error('Shipping rates are taking longer than expected. Please try again.');
    }

    async readError(response) {
      try {
        const data = await response.json();
        if (typeof data === 'string') return data;
        return data?.description || data?.message || data?.error || '';
      } catch (_) {
        return '';
      }
    }

    money(value) {
      const amount = Number(value || 0);
      const currency = String(this.root.dataset.currency || '').trim();
      if (!currency) return String(value ?? '');
      try {
        return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency }).format(amount);
      } catch (_) {
        return `${amount.toFixed(2)} ${currency}`;
      }
    }

    renderRates(rates) {
      if (!this.results) return;
      this.results.textContent = '';
      if (!rates.length) {
        this.setStatus('No shipping rates are available for this destination.', true);
        this.results.hidden = true;
        return;
      }

      const list = document.createElement('ul');
      list.className = 'sp-cart-shipping-calculator__rates';
      rates.forEach((rate) => {
        const item = document.createElement('li');
        item.className = 'sp-cart-shipping-calculator__rate';
        const name = document.createElement('span');
        name.textContent = String(rate.presentment_name || rate.name || rate.code || 'Shipping');
        const price = document.createElement('strong');
        price.textContent = this.money(rate.price);
        item.append(name, price);
        list.appendChild(item);
      });
      this.results.appendChild(list);
      this.results.hidden = false;
      this.setStatus(`${rates.length} shipping ${rates.length === 1 ? 'rate' : 'rates'} found.`);
    }

    destroy() {
      this.destroyed = true;
      this.controller?.abort();
      this.country?.removeEventListener('change', this.onCountryChange);
      this.form?.removeEventListener('submit', this.onSubmit);
    }
  }

  const init = (scope = document) => {
    scope.querySelectorAll?.('[data-cart-shipping-calculator]').forEach((root) => {
      if (!root.__spCartShippingCalculator) root.__spCartShippingCalculator = new SpiderCartShippingCalculator(root);
    });
  };

  const destroy = (scope) => {
    scope.querySelectorAll?.('[data-cart-shipping-calculator]').forEach((root) => {
      root.__spCartShippingCalculator?.destroy();
      delete root.__spCartShippingCalculator;
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));
  const cartUpdatedEvent = window.Spider?.events?.cartUpdated || 'spider:cart:updated';
  document.addEventListener(cartUpdatedEvent, () => requestAnimationFrame(() => init()));
})();
