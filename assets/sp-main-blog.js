(() => {
  'use strict';

  class SpiderBlogLoadMore {
    constructor(root) {
      this.root = root;
      this.grid = root.querySelector('[data-blog-article-grid]');
      this.button = root.querySelector('[data-blog-load-more]');
      this.controller = null;
      this.loading = false;
      this.onClick = this.onClick.bind(this);
      if (this.button && this.grid) this.button.addEventListener('click', this.onClick);
    }

    async onClick(event) {
      if (!this.button || !this.grid || this.loading) return;
      const url = this.button.href;
      if (!url || !window.fetch || !window.DOMParser) return;
      event.preventDefault();
      this.loading = true;
      this.button.setAttribute('aria-busy', 'true');
      this.button.setAttribute('aria-disabled', 'true');
      this.controller?.abort();
      this.controller = new AbortController();

      try {
        const response = await fetch(url, {
          signal: this.controller.signal,
          headers: { Accept: 'text/html' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const nextGrid = doc.querySelector(`[data-blog-section-id="${CSS.escape(this.root.dataset.blogSectionId || '')}"] [data-blog-article-grid]`)
          || doc.querySelector('[data-blog-article-grid]');
        const nextButton = doc.querySelector(`[data-blog-section-id="${CSS.escape(this.root.dataset.blogSectionId || '')}"] [data-blog-load-more]`)
          || doc.querySelector('[data-blog-load-more]');

        if (!nextGrid) throw new Error('Next article grid not found');
        const existingIds = new Set([...this.grid.querySelectorAll('[data-article-id]')].map((card) => String(card.dataset.articleId || '')));
        [...nextGrid.children].forEach((node) => {
          const id = String(node.dataset?.articleId || '');
          if (!id || !existingIds.has(id)) {
            this.grid.appendChild(document.importNode(node, true));
            if (id) existingIds.add(id);
          }
        });

        if (nextButton?.href) {
          this.button.href = nextButton.href;
          this.button.removeAttribute('aria-disabled');
          this.button.removeAttribute('aria-busy');
        } else {
          this.button.closest('[data-blog-load-more-wrap]')?.remove();
        }
      } catch (error) {
        if (error?.name !== 'AbortError') window.location.assign(url);
      } finally {
        this.loading = false;
        if (this.button?.isConnected) {
          this.button.removeAttribute('aria-busy');
          this.button.removeAttribute('aria-disabled');
        }
      }
    }

    destroy() {
      this.controller?.abort();
      this.button?.removeEventListener('click', this.onClick);
    }
  }

  const init = (scope = document) => {
    scope.querySelectorAll?.('[data-main-blog][data-pagination-type="load_more"]').forEach((root) => {
      if (!root.__spiderBlogLoadMore) root.__spiderBlogLoadMore = new SpiderBlogLoadMore(root);
    });
  };

  const destroy = (scope) => {
    scope.querySelectorAll?.('[data-main-blog]').forEach((root) => {
      root.__spiderBlogLoadMore?.destroy();
      delete root.__spiderBlogLoadMore;
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));
})();
