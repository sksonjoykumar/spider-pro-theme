(() => {
  'use strict';

  class PredictiveSearch {
    constructor(root) {
      this.root = root;
      this.input = root.querySelector('input[type="search"]');
      this.results = root.querySelector('[data-predictive-results]');
      this.controller = null;
      this.timer = 0;
      this.onInput = this.onInput.bind(this);
      this.onKey = this.onKey.bind(this);
      this.input?.addEventListener('input', this.onInput);
      this.input?.addEventListener('keydown', this.onKey);
    }

    onInput() {
      clearTimeout(this.timer);
      const query = this.input.value.trim();
      if (query.length < 2) {
        this.controller?.abort();
        this.results.innerHTML = '';
        this.results.removeAttribute('aria-busy');
        return;
      }
      this.timer = window.setTimeout(() => this.fetch(query), 180);
    }

    async fetch(query) {
      this.controller?.abort();
      this.controller = new AbortController();
      this.results.setAttribute('aria-busy', 'true');
      try {
        const limit = Number(window.Spider.settings?.search_result_limit || 6);
        const url = `${window.Shopify?.routes?.root || '/'}search/suggest?q=${encodeURIComponent(query)}&resources[type]=product,collection,page,article&resources[limit]=${limit}&section_id=predictive-search`;
        const response = await fetch(url, { signal: this.controller.signal, headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error('Search unavailable');
        this.results.innerHTML = await response.text();
        document.dispatchEvent(new CustomEvent(window.Spider.events.searchUpdated, { detail: { query } }));
      } catch (error) {
        if (error.name !== 'AbortError') this.results.textContent = 'Search unavailable';
      } finally {
        this.results.removeAttribute('aria-busy');
      }
    }

    onKey(event) {
      const links = [...this.results.querySelectorAll('a')];
      if (event.key === 'Escape') {
        this.results.innerHTML = '';
        this.input.focus();
        return;
      }
      if (!links.length || event.key !== 'ArrowDown') return;
      event.preventDefault();
      links[0].focus();
    }

    destroy() {
      clearTimeout(this.timer);
      this.controller?.abort();
      this.input?.removeEventListener('input', this.onInput);
      this.input?.removeEventListener('keydown', this.onKey);
    }
  }

  const init = (root = document) => root.querySelectorAll('[data-predictive-search]').forEach((node) => {
    if (!node.__spider) node.__spider = new PredictiveSearch(node);
  });
  document.addEventListener('DOMContentLoaded', () => init());
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => event.target.querySelectorAll('[data-predictive-search]').forEach((node) => {
    node.__spider?.destroy();
    delete node.__spider;
  }));
})();
