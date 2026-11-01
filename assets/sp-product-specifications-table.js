(() => {
  'use strict';
  const SELECTOR = '[data-sp-product-specifications]';
  const instances = new WeakMap();
  const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  class ProductSpecs {
    constructor(root) {
      this.root = root;
      this.controller = new AbortController();
      const signal = this.controller.signal;
      this.tabs = Array.from(root.querySelectorAll('[role="tab"][data-sp-spec-tab]'));
      this.panels = Array.from(root.querySelectorAll('[role="tabpanel"][data-sp-spec-group]'));
      this.accordions = Array.from(root.querySelectorAll('.sp-specs__accordion'));
      this.tabs.forEach((tab) => {
        tab.addEventListener('click', () => this.activate(tab), { signal });
        tab.addEventListener('keydown', event => this.tabKeydown(event, tab), { signal });
      });
      if (this.tabs.length) this.activate(this.tabs.find(t => t.getAttribute('aria-selected') === 'true') || this.tabs[0], false);
      if (root.dataset.spAccordionMode === 'single') this.accordions.forEach(accordion => accordion.addEventListener('toggle', () => {
        if (!accordion.open) return;
        this.accordions.forEach(other => { if (other !== accordion) other.open = false; });
      }, {signal}));
      root.querySelector('[data-sp-spec-print]')?.addEventListener('click', () => window.print(), { signal });
      root.classList.add('sp-specs--ready');
    }
    activate(tab, focus = false) {
      if (!tab) return;
      this.tabs.forEach(current => {
        const selected = current === tab;
        current.setAttribute('aria-selected', String(selected));
        current.tabIndex = selected ? 0 : -1;
      });
      const target = tab.getAttribute('aria-controls');
      this.panels.forEach(panel => {
        const selected = panel.id === target;
        panel.hidden = !selected;
        panel.toggleAttribute('inert', !selected);
      });
      if (focus) tab.focus({preventScroll: true});
      tab.scrollIntoView({block:'nearest', inline:'nearest',behavior:prefersReduced()?'auto':'smooth'});
    }
    tabKeydown(event, tab) {
      const index = this.tabs.indexOf(tab), count = this.tabs.length;
      if (!count) return;
      const rtl = getComputedStyle(this.root).direction === 'rtl';
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      else if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + count) % count;
      else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + count) % count;
      else return;
      event.preventDefault();
      this.activate(this.tabs[next], true);
    }
    reveal(blockId) {
      if (!blockId) return;
      const selectedRow = Array.from(this.root.querySelectorAll('[data-sp-spec-row]')).find(row => row.dataset.spSpecRow === blockId);
      const selectedGroup = Array.from(this.root.querySelectorAll('[data-sp-spec-group]')).find(group => group.dataset.spSpecGroup === blockId);
      const group = selectedRow?.closest('[data-sp-spec-group]') || selectedGroup;
      if (!group) return;
      const tab = this.tabs.find(t => t.dataset.spSpecTab === group.dataset.spSpecGroup);
      if (tab) this.activate(tab);
      if (group.matches('details')) group.open = true;
      (selectedRow || group).scrollIntoView({block:'center',behavior:prefersReduced()?'auto':'smooth'});
    }
    destroy() { this.controller.abort(); this.root.classList.remove('sp-specs--ready'); }
  }
  function init(container = document) {
    const nodes = [];
    if (container.matches?.(SELECTOR)) nodes.push(container);
    nodes.push(...container.querySelectorAll(SELECTOR));
    nodes.forEach(root => {
      if (instances.has(root)) return;
      instances.set(root, new ProductSpecs(root));
    });
  }
  function destroy(container) {
    const nodes = [];
    if (container.matches?.(SELECTOR)) nodes.push(container);
    nodes.push(...container.querySelectorAll(SELECTOR));
    nodes.forEach(root => {
      instances.get(root)?.destroy();
      instances.delete(root);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), {once:true});
  else init();
  if (!window.__spSpecsEventsBound) {
    window.__spSpecsEventsBound = true;
    document.addEventListener('shopify:section:load', event => init(event.target));
    document.addEventListener('shopify:section:unload', event => destroy(event.target));
    document.addEventListener('shopify:block:select', event => {
      const root = event.target.closest(SELECTOR);
      if (root) instances.get(root)?.reveal(event.detail?.blockId || event.target.dataset.blockId);
    });
  }
})();
