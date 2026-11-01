(() => {
  if (customElements.get('sp-collection-showcase')) return;

  class SpCollectionShowcase extends HTMLElement {
    connectedCallback() {
      this.onBlockSelect = this.onBlockSelect.bind(this);
      this.addEventListener('shopify:block:select', this.onBlockSelect);
      if (window.Shopify && window.Shopify.designMode) {
        this.showAllCards();
        return;
      }

      if (this.dataset.reveal !== 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.showAllCards();
        return;
      }

      const cards = [...this.querySelectorAll('[data-sp-showcase-card]')];
      if (!cards.length || !('IntersectionObserver' in window)) {
        this.showAllCards();
        return;
      }

      this.classList.add('sp-is-reveal-ready');
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const index = cards.indexOf(entry.target);
            entry.target.style.transitionDelay = `${Math.max(index, 0) * 70}ms`;
            entry.target.classList.add('sp-is-visible');
            this.observer.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
      );

      cards.forEach((card) => this.observer.observe(card));
    }

    disconnectedCallback() {
      this.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.observer?.disconnect();
      this.observer = null;
    }

    onBlockSelect(event) {
      const card = event.target.closest('[data-sp-showcase-card]');
      card?.classList.add('sp-is-visible');
    }

    showAllCards() {
      this.querySelectorAll('[data-sp-showcase-card]').forEach((card) => card.classList.add('sp-is-visible'));
    }
  }

  customElements.define('sp-collection-showcase', SpCollectionShowcase);
})();
