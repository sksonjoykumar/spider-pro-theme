(() => {
  'use strict';

  const SELECTOR = '[data-sp-product-information-tabs]';
  const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class SpProductInformationTabs extends HTMLElement {
    connectedCallback() {
      if (this.controller) return;
      this.controller = new AbortController();
      this.signal = this.controller.signal;
      this.isAccordion = this.dataset.spLayout === 'style_4';
      this.multipleOpen = this.dataset.spAccordionMultiple === 'true';
      this.tabs = [...this.querySelectorAll('[role="tab"]')];
      this.panels = [...this.querySelectorAll('[role="tabpanel"]')];
      this.details = [...this.querySelectorAll('[data-sp-accordion-item]')];
      this.orientationQuery = window.matchMedia('(min-width: 750px)');
      this.updateOrientation();
      this.orientationQuery.addEventListener?.('change', () => this.updateOrientation(), { signal: this.signal });

      if (this.isAccordion) this.initAccordion();
      else this.initTabs();
      this.classList.add('is-ready');
    }

    disconnectedCallback() {
      this.destroy();
    }

    updateOrientation() {
      const tablist = this.querySelector('[role="tablist"]');
      if (!tablist) return;
      const vertical = this.dataset.spOrientation === 'vertical' && this.orientationQuery?.matches;
      tablist.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    }

    initTabs() {
      this.tabs.forEach((tab) => {
        tab.addEventListener('click', () => this.activateTab(tab, false), { signal: this.signal });
        tab.addEventListener('keydown', (event) => this.onTabKeydown(event, tab), { signal: this.signal });
      });
      const selected = this.tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || this.tabs[0];
      if (selected) this.activateTab(selected, false, false);
    }

    initAccordion() {
      if (!this.multipleOpen) {
        let foundOpen = false;
        this.details.forEach((item) => {
          if (!item.open) return;
          if (foundOpen) item.open = false;
          foundOpen = true;
        });
      }
      this.details.forEach((item) => {
        item.addEventListener('toggle', () => {
          const summary = item.querySelector('summary');
          if (summary) summary.setAttribute('aria-expanded', String(item.open));
          if (item.open && !this.multipleOpen) {
            this.details.forEach((other) => {
              if (other !== item) other.open = false;
            });
          }
        }, { signal: this.signal });
      });
    }

    activateTab(tab, moveFocus = false, scroll = true) {
      if (!tab) return;
      const panelId = tab.getAttribute('aria-controls');
      this.tabs.forEach((item) => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      this.panels.forEach((panel) => {
        const active = panel.id === panelId;
        panel.hidden = !active;
        panel.toggleAttribute('inert', !active);
      });
      if (moveFocus) tab.focus();
      if (scroll && this.dataset.spMobileScroll === 'true') {
        tab.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }

    onTabKeydown(event, tab) {
      const vertical = this.dataset.spOrientation === 'vertical' && this.orientationQuery.matches;
      const rtl = getComputedStyle(this).direction === 'rtl';
      let nextIndex = null;
      const index = this.tabs.indexOf(tab);
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = this.tabs.length - 1;
      if (vertical && event.key === 'ArrowUp') nextIndex = (index - 1 + this.tabs.length) % this.tabs.length;
      if (vertical && event.key === 'ArrowDown') nextIndex = (index + 1) % this.tabs.length;
      if (!vertical && event.key === 'ArrowLeft') nextIndex = (index + (rtl ? 1 : -1) + this.tabs.length) % this.tabs.length;
      if (!vertical && event.key === 'ArrowRight') nextIndex = (index + (rtl ? -1 : 1) + this.tabs.length) % this.tabs.length;
      if ((event.key === 'Enter' || event.key === ' ') && tab.getAttribute('aria-selected') !== 'true') nextIndex = index;
      if (nextIndex === null) return;
      event.preventDefault();
      this.activateTab(this.tabs[nextIndex], true);
    }

    selectBlock(blockId) {
      if (!blockId) return;
      if (this.isAccordion) {
        const item = this.querySelector(`[data-sp-block-id="${CSS.escape(blockId)}"]`);
        if (item) {
          item.open = true;
          item.querySelector('summary')?.focus({ preventScroll: true });
          item.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        }
        return;
      }
      const tab = this.querySelector(`[role="tab"][data-sp-block-id="${CSS.escape(blockId)}"]`);
      if (tab) this.activateTab(tab, true);
    }

    destroy() {
      this.controller?.abort();
      this.controller = null;
      this.classList.remove('is-ready');
    }
  }

  if (!customElements.get('sp-product-information-tabs')) {
    customElements.define('sp-product-information-tabs', SpProductInformationTabs);
  }

  if (!window.__spProductInformationTabsEditorBound) {
    window.__spProductInformationTabsEditorBound = true;
    document.addEventListener('shopify:block:select', (event) => {
      const section = event.target.closest(SELECTOR);
      section?.selectBlock(event.detail?.blockId || event.target.dataset.spBlockId);
    });
  }
})();
