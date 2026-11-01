(() => {
  'use strict';

  const variantEvent = () => window.Spider?.events?.variantChanged || 'spider:variant:changed';

  class ProductGallery {
    constructor(root) {
      this.root = root;
      this.track = root.querySelector('[data-gallery-track]');
      this.items = [...root.querySelectorAll('[data-media-id]')];
      this.tabs = [...root.querySelectorAll('[data-media-target]')];
      this.dots = [...root.querySelectorAll('[data-gallery-dot]')];
      this.counter = root.querySelector('[data-gallery-current]');
      this.lightbox = root.querySelector('[data-product-lightbox]');
      this.lightboxImage = this.lightbox?.querySelector('[data-lightbox-image]');
      this.lightboxCaption = this.lightbox?.querySelector('[data-lightbox-caption]');
      this.mode = root.dataset.galleryMode || 'thumbnails_left';
      this.mobileQuery = window.matchMedia('(max-width: 749px)');
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.scrollFrame = 0;
      this.variantEventName = variantEvent();
      this.index = Math.max(0, this.items.findIndex((item) => item.classList.contains('is-active')));
      this.lastTrigger = null;

      this.onClick = this.onClick.bind(this);
      this.onKey = this.onKey.bind(this);
      this.onVariant = this.onVariant.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.onMediaQuery = this.onMediaQuery.bind(this);
      this.onLightboxKey = this.onLightboxKey.bind(this);
      this.onLightboxClose = this.onLightboxClose.bind(this);

      root.addEventListener('click', this.onClick);
      root.addEventListener('keydown', this.onKey);
      this.track?.addEventListener('scroll', this.onScroll, { passive: true });
      document.addEventListener(this.variantEventName, this.onVariant);
      this.mobileQuery.addEventListener?.('change', this.onMediaQuery);
      this.lightbox?.addEventListener('keydown', this.onLightboxKey);
      this.lightbox?.addEventListener('close', this.onLightboxClose);
      this.sync({ scroll: false });
    }

    isMobile() { return this.mobileQuery.matches; }
    isStaticDesktop() { return !this.isMobile() && (this.mode === 'stacked' || this.mode === 'grid'); }

    activateById(id, options = {}) {
      const index = this.items.findIndex((item) => String(item.dataset.mediaId) === String(id));
      if (index < 0) return false;
      this.activate(index, options);
      return true;
    }

    activateByImageId(id, options = {}) {
      const index = this.items.findIndex((item) => String(item.dataset.mediaImageId || '') === String(id || ''));
      if (index < 0) return false;
      this.activate(index, options);
      return true;
    }

    activate(index, { focusTab = false, scroll = true, smooth = true } = {}) {
      if (!this.items.length) return;
      const next = (index + this.items.length) % this.items.length;
      const changed = next !== this.index;
      this.index = next;
      this.sync({ focusTab, scroll, smooth });
      if (changed) this.root.dispatchEvent(new CustomEvent('sp:product:media-change', { bubbles: true, detail: { index: this.index, mediaId: this.items[this.index]?.dataset.mediaId } }));
    }

    sync({ focusTab = false, scroll = false, smooth = true } = {}) {
      const mobile = this.isMobile();
      const staticDesktop = this.isStaticDesktop();

      this.items.forEach((item, itemIndex) => {
        const active = itemIndex === this.index;
        item.classList.toggle('is-active', active);
        if (mobile || staticDesktop) item.removeAttribute('aria-hidden');
        else item.setAttribute('aria-hidden', String(!active));
        if (!active) this.pauseMedia(item);
      });

      this.tabs.forEach((tab, tabIndex) => {
        const active = tabIndex === this.index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      this.dots.forEach((dot, dotIndex) => {
        if (dotIndex === this.index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      if (this.counter) this.counter.textContent = String(this.index + 1);
      if (focusTab) this.tabs[this.index]?.focus();

      if (scroll) {
        const item = this.items[this.index];
        if (mobile && this.track && item) {
          item.scrollIntoView({
            behavior: this.reducedMotion.matches || !smooth ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'start'
          });
        } else if (staticDesktop && item) {
          item.scrollIntoView({ behavior: this.reducedMotion.matches || !smooth ? 'auto' : 'smooth', block: 'nearest' });
        }
      }
    }

    pauseMedia(item) {
      item.querySelectorAll('video').forEach((video) => video.pause());
      item.querySelectorAll('model-viewer').forEach((model) => model.pause?.());
    }

    onClick(event) {
      const thumb = event.target.closest('[data-media-target]');
      if (thumb && this.root.contains(thumb)) {
        event.preventDefault();
        const index = this.tabs.indexOf(thumb);
        if (index >= 0) this.activate(index, { scroll: true });
        return;
      }

      const dot = event.target.closest('[data-gallery-dot]');
      if (dot && this.root.contains(dot)) {
        event.preventDefault();
        this.activate(Number(dot.dataset.galleryDot || 0), { scroll: true });
        return;
      }

      if (event.target.closest('[data-gallery-previous]')) {
        event.preventDefault();
        this.activate(this.index - 1, { scroll: true });
        return;
      }
      if (event.target.closest('[data-gallery-next]')) {
        event.preventDefault();
        this.activate(this.index + 1, { scroll: true });
        return;
      }

      const zoom = event.target.closest('[data-media-zoom]');
      if (zoom && this.root.contains(zoom)) {
        event.preventDefault();
        this.openLightbox(zoom);
        return;
      }

      if (!this.lightbox) return;
      if (event.target.closest('[data-lightbox-close]')) {
        event.preventDefault();
        this.lightbox.close();
        return;
      }
      if (event.target.closest('[data-lightbox-previous]')) {
        event.preventDefault();
        this.lightboxStep(-1);
        return;
      }
      if (event.target.closest('[data-lightbox-next]')) {
        event.preventDefault();
        this.lightboxStep(1);
        return;
      }
      if (event.target === this.lightbox) this.lightbox.close();
    }

    onKey(event) {
      const tab = event.target.closest('[data-media-target]');
      if (!tab) return;
      const index = this.tabs.indexOf(tab);
      const rtl = document.documentElement.dir === 'rtl';
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.activate(index + (rtl ? -1 : 1), { focusTab: true, scroll: true });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.activate(index + (rtl ? 1 : -1), { focusTab: true, scroll: true });
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.activate(index + 1, { focusTab: true, scroll: true });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.activate(index - 1, { focusTab: true, scroll: true });
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.activate(0, { focusTab: true, scroll: true });
      } else if (event.key === 'End') {
        event.preventDefault();
        this.activate(this.items.length - 1, { focusTab: true, scroll: true });
      }
    }

    onVariant(event) {
      const ownRoot = this.root.closest('[data-main-product]');
      const eventRoot = event.detail?.root || event.detail?.form?.closest?.('[data-main-product]');
      const sectionId = String(event.detail?.sectionId || '');
      if (!ownRoot) return;
      if (eventRoot && eventRoot !== ownRoot) return;
      if (!eventRoot && sectionId && sectionId !== String(ownRoot.dataset.sectionId || '')) return;

      const variant = event.detail?.variant;
      if (!variant) return;
      const mediaId = event.detail?.mediaId || variant.featured_media_id || variant.featured_media?.id;
      if (mediaId && this.activateById(mediaId, { scroll: true, smooth: false })) return;

      const imageId = event.detail?.imageId || variant.featured_image_id || variant.featured_image?.id;
      if (imageId) this.activateByImageId(imageId, { scroll: true, smooth: false });
    }

    onScroll() {
      if (!this.isMobile() || !this.track || this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = 0;
        const center = this.track.scrollLeft + this.track.clientWidth / 2;
        let closest = this.index;
        let distance = Infinity;
        this.items.forEach((item, index) => {
          const itemCenter = item.offsetLeft + item.offsetWidth / 2;
          const delta = Math.abs(itemCenter - center);
          if (delta < distance) { distance = delta; closest = index; }
        });
        if (closest !== this.index) this.activate(closest, { scroll: false });
      });
    }

    onMediaQuery() { this.sync({ scroll: false }); }

    zoomableItems() { return this.items.filter((item) => item.querySelector('[data-media-zoom]')); }

    openLightbox(trigger) {
      if (!this.lightbox || typeof this.lightbox.showModal !== 'function') return;
      const item = trigger.closest('[data-media-id]');
      if (item) {
        const index = this.items.indexOf(item);
        if (index >= 0) this.index = index;
      }
      this.lastTrigger = trigger;
      this.renderLightbox();
      this.lightbox.showModal();
      this.lightbox.querySelector('[data-lightbox-close]')?.focus();
    }

    renderLightbox() {
      if (!this.lightboxImage) return;
      let item = this.items[this.index];
      let zoom = item?.querySelector('[data-media-zoom]');
      if (!zoom) {
        const available = this.zoomableItems();
        item = available[0];
        zoom = item?.querySelector('[data-media-zoom]');
        const actual = this.items.indexOf(item);
        if (actual >= 0) this.index = actual;
      }
      if (!zoom) return;
      this.lightboxImage.src = zoom.dataset.zoomSrc || zoom.querySelector('img')?.currentSrc || '';
      this.lightboxImage.alt = zoom.dataset.zoomAlt || zoom.querySelector('img')?.alt || '';
      if (this.lightboxCaption) this.lightboxCaption.textContent = this.lightboxImage.alt;
    }

    lightboxStep(direction) {
      const available = this.zoomableItems();
      if (!available.length) return;
      const currentItem = this.items[this.index];
      let index = available.indexOf(currentItem);
      if (index < 0) index = 0;
      index = (index + direction + available.length) % available.length;
      const target = available[index];
      const absoluteIndex = this.items.indexOf(target);
      if (absoluteIndex >= 0) this.index = absoluteIndex;
      this.renderLightbox();
      this.sync({ scroll: false });
    }

    onLightboxKey(event) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.lightboxStep(document.documentElement.dir === 'rtl' ? -1 : 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.lightboxStep(document.documentElement.dir === 'rtl' ? 1 : -1);
      }
    }

    onLightboxClose() {
      if (this.lastTrigger?.isConnected) this.lastTrigger.focus();
      this.lastTrigger = null;
    }

    destroy() {
      cancelAnimationFrame(this.scrollFrame);
      this.root.removeEventListener('click', this.onClick);
      this.root.removeEventListener('keydown', this.onKey);
      this.track?.removeEventListener('scroll', this.onScroll);
      document.removeEventListener(this.variantEventName, this.onVariant);
      this.mobileQuery.removeEventListener?.('change', this.onMediaQuery);
      this.lightbox?.removeEventListener('keydown', this.onLightboxKey);
      this.lightbox?.removeEventListener('close', this.onLightboxClose);
    }
  }

  const init = (scope = document) => {
    scope.querySelectorAll?.('[data-product-gallery]').forEach((gallery) => {
      if (!gallery.__spider) gallery.__spider = new ProductGallery(gallery);
    });
  };
  const destroy = (scope) => {
    scope.querySelectorAll?.('[data-product-gallery]').forEach((gallery) => {
      gallery.__spider?.destroy();
      delete gallery.__spider;
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));

  window.Spider = window.Spider || {};
  window.Spider.ProductGallery = ProductGallery;
})();
