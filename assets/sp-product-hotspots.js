(() => {
  'use strict';

  if (customElements.get('sp-product-hotspots')) return;

  class SpiderProductHotspots extends HTMLElement {
    connectedCallback() {
      if (this.__connected) return;

      this.__connected = true;
      this.abort = new AbortController();
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;

      this.hotspots = [...this.querySelectorAll('[data-hotspot-button]')];
      this.targets = [...this.querySelectorAll('[data-hotspot-target]')];
      this.triggers = [...this.querySelectorAll('[data-hotspot-trigger]')];
      this.strip = this.querySelector('.sp-product-hotspots__strip');

      this.addEventListener('click', this.onClick, { signal: this.abort.signal });

      const firstIndex =
        this.hotspots[0]?.dataset.hotspotIndex ||
        this.targets[0]?.dataset.hotspotIndex ||
        this.triggers[0]?.dataset.hotspotIndex;

      if (firstIndex) this.activate(firstIndex, false);
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.__connected = false;
    }

    onClick = (event) => {
      const hotspot = event.target.closest('[data-hotspot-button]');
      if (hotspot && this.contains(hotspot)) {
        this.activate(hotspot.dataset.hotspotIndex, true);
        return;
      }

      const trigger = event.target.closest('[data-hotspot-trigger]');
      if (trigger && this.contains(trigger)) {
        this.activate(trigger.dataset.hotspotIndex, true);
      }
    };

    activate(index, shouldScroll) {
      const key = String(index);

      this.hotspots.forEach((item) => {
        const active = item.dataset.hotspotIndex === key;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      this.targets.forEach((item) => {
        const active = item.dataset.hotspotIndex === key;
        item.classList.toggle('is-active', active);

        if (active && shouldScroll && window.innerWidth < 900) {
          item.scrollIntoView({
            behavior: this.reducedMotion?.matches ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      });

      this.triggers.forEach((item) => {
        const active = item.dataset.hotspotIndex === key;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      if (shouldScroll && this.strip) {
        const stripItem = this.strip.querySelector(
          `[data-hotspot-trigger][data-hotspot-index="${CSS.escape(key)}"]`
        );

        stripItem?.scrollIntoView({
          behavior: this.reducedMotion?.matches ? 'auto' : 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }

    activateBlock(blockId) {
      if (!blockId) return;

      const hotspot = this.querySelector(
        `[data-hotspot-button][data-block-id="${CSS.escape(String(blockId))}"]`
      );

      if (hotspot) {
        this.activate(hotspot.dataset.hotspotIndex, false);
        return;
      }

      const target = this.querySelector(
        `[data-hotspot-target][data-block-id="${CSS.escape(String(blockId))}"]`
      );

      if (target) this.activate(target.dataset.hotspotIndex, false);
    }
  }

  customElements.define('sp-product-hotspots', SpiderProductHotspots);

  if (!window.__spProductHotspotsEditorEvents) {
    window.__spProductHotspotsEditorEvents = true;

    document.addEventListener('shopify:block:select', (event) => {
      const sectionId = event.detail?.sectionId;
      const blockId = event.detail?.blockId;

      if (!sectionId || !blockId) return;

      const section = document.querySelector(
        `sp-product-hotspots[data-section-id="${CSS.escape(String(sectionId))}"]`
      );

      section?.activateBlock?.(blockId);
    });
  }
})();
