/* Spider Back to Top — one accessible System Group instance; no external libraries. */
(() => {
  'use strict';
  const TRUE = 'true';
  const TOOLBAR = 'sp-mobile-toolbar.sp-mobile-toolbar, .sp-mobile-toolbar[data-sp-mobile-toolbar]';
  const STICKY = '[data-sp-sticky-atc], [data-sticky-atc], .sp-sticky-atc, .sp-sticky-add-to-cart';
  const BLOCKERS = [
    '[data-sp-search-modal].is-open', '.sp-smodal.is-open',
    'dialog[open]', '[data-cart-drawer][open]', '.sp-cart-drawer[open]',
    '[data-sp-mobile-menu][open]', '.sp-mobile-menu[open]',
    '.sp-mobile-toolbar__sheet.is-open', '[data-sp-toolbar-sheet].is-open',
    '[aria-modal="true"][open]', '[data-sp-quick-view].is-open',
    '.sp-age-verification__dialog[open]', '.sp-newsletter-popup__dialog[open]',
    '.sp-exit-popup__dialog[open]'
  ].join(',');

  const num = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const visible = (el) => {
    if (!el || el.hidden || el.closest('[hidden], [inert]')) return false;
    const css = getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && num(css.opacity, 1) > 0 && el.getClientRects().length > 0;
  };
  const bottomOccupation = (el, allowedBottomGap = 28) => {
    if (!visible(el)) return 0;
    const r = el.getBoundingClientRect();
    const h = window.innerHeight;
    // Only account for bottom-anchored bars, never ordinary content in the viewport.
    if (r.bottom < h - allowedBottomGap || r.top >= h || r.height < 1) return 0;
    return Math.max(0, Math.min(h, h - Math.max(0, r.top)));
  };

  class SpiderBackToTop extends HTMLElement {
    constructor() {
      super();
      this.button = null;
      this.sectionId = '';
      this.raf = 0;
      this.resizeObserver = null;
      this.mutationObserver = null;
      this.lastOccupation = -1;
      this.lastProgress = -1;
      this.isEditorSelected = false;
      this.onUpdate = this.onUpdate.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onSectionSelect = this.onSectionSelect.bind(this);
      this.onSectionDeselect = this.onSectionDeselect.bind(this);
      this.onSectionLoad = this.onSectionLoad.bind(this);
      this.onThemeChange = this.onThemeChange.bind(this);
    }

    connectedCallback() {
      if (this.dataset.spBackToTopReady === TRUE) return;
      this.button = this.querySelector('[data-sp-back-to-top-button]');
      if (!this.button) {
        // Custom element may upgrade before its children finish parsing.
        if (!this.bootRaf) this.bootRaf = requestAnimationFrame(() => {
          this.bootRaf = 0;
          if (this.isConnected) this.connectedCallback();
        });
        return;
      }
      this.dataset.spBackToTopReady = TRUE;
      this.sectionId = this.dataset.sectionId || '';
      this.threshold = Math.max(0, num(this.dataset.threshold, 200));
      this.progressEnabled = this.dataset.progressEnabled === TRUE;
      this.avoidToolbar = this.dataset.avoidToolbar !== 'false';
      this.avoidStickyAtc = this.dataset.avoidStickyAtc !== 'false';
      this.editorPreview = this.dataset.editorPreview !== 'false';
      this.hideBlockingUi = this.dataset.hideBlockingUi !== 'false';
      this.alwaysShow = this.dataset.alwaysShow === TRUE;
      this.designMode = Boolean(window.Shopify?.designMode);
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.button.addEventListener('click', this.onClick);
      window.addEventListener('scroll', this.onUpdate, { passive: true });
      window.addEventListener('resize', this.onUpdate, { passive: true });
      window.addEventListener('orientationchange', this.onUpdate, { passive: true });
      document.addEventListener('shopify:section:select', this.onSectionSelect);
      document.addEventListener('shopify:section:deselect', this.onSectionDeselect);
      document.addEventListener('shopify:section:load', this.onSectionLoad);
      document.addEventListener('shopify:section:reorder', this.onUpdate);
      document.addEventListener('shopify:block:select', this.onUpdate);
      document.addEventListener('sp:drawer:open', this.onUpdate);
      document.addEventListener('sp:drawer:close', this.onUpdate);
      document.addEventListener('sp:overlay:change', this.onUpdate);

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(this.onUpdate);
        this.resizeObserver.observe(document.documentElement);
      }
      if ('MutationObserver' in window && document.body) {
        this.mutationObserver = new MutationObserver(this.onUpdate);
        // Observe only state changes (not text), throttle expensive work to one animation frame.
        this.mutationObserver.observe(document.body, {
          subtree: true, childList: true, attributes: true,
          attributeFilter: ['open', 'hidden', 'aria-hidden', 'class', 'inert']
        });
      }
      this.queueUpdate();
    }

    disconnectedCallback() {
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.bootRaf) cancelAnimationFrame(this.bootRaf);
      this.raf = this.bootRaf = 0;
      this.button?.removeEventListener('click', this.onClick);
      window.removeEventListener('scroll', this.onUpdate);
      window.removeEventListener('resize', this.onUpdate);
      window.removeEventListener('orientationchange', this.onUpdate);
      document.removeEventListener('shopify:section:select', this.onSectionSelect);
      document.removeEventListener('shopify:section:deselect', this.onSectionDeselect);
      document.removeEventListener('shopify:section:load', this.onSectionLoad);
      document.removeEventListener('shopify:section:reorder', this.onUpdate);
      document.removeEventListener('shopify:block:select', this.onUpdate);
      document.removeEventListener('sp:drawer:open', this.onUpdate);
      document.removeEventListener('sp:drawer:close', this.onUpdate);
      document.removeEventListener('sp:overlay:change', this.onUpdate);
      this.resizeObserver?.disconnect();
      this.mutationObserver?.disconnect();
      this.resizeObserver = this.mutationObserver = null;
      delete this.dataset.spBackToTopReady;
    }

    onUpdate() { this.queueUpdate(); }
    onThemeChange() { this.queueUpdate(); }
    onSectionLoad() { this.queueUpdate(); }
    onSectionSelect(event) {
      if (String(event?.detail?.sectionId || '') !== this.sectionId) return;
      this.isEditorSelected = true;
      this.queueUpdate();
    }
    onSectionDeselect(event) {
      if (String(event?.detail?.sectionId || '') !== this.sectionId) return;
      this.isEditorSelected = false;
      this.queueUpdate();
    }
    onClick(event) {
      event.preventDefault();
      const behavior = this.motionQuery.matches ? 'instant' : 'smooth';
      try { window.scrollTo({ top: 0, left: 0, behavior }); }
      catch (_) { window.scrollTo(0, 0); }
    }
    queueUpdate() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        if (this.isConnected) this.update();
      });
    }
    getScrollMetrics() {
      const scroller = document.scrollingElement || document.documentElement;
      const scrollY = Math.max(0, window.scrollY || scroller.scrollTop || 0);
      const maxScroll = Math.max(0, scroller.scrollHeight - document.documentElement.clientHeight);
      return { scrollY, maxScroll };
    }
    getOccupiedBottom() {
      let occupied = 0;
      if (this.avoidToolbar) {
        const toolbar = document.querySelector(TOOLBAR);
        if (toolbar && window.innerWidth <= num(toolbar.dataset.breakpoint, 749) && !toolbar.classList.contains('is-scroll-hidden')) {
          occupied = Math.max(occupied, bottomOccupation(toolbar));
        }
      }
      if (this.avoidStickyAtc) {
        document.querySelectorAll(STICKY).forEach(bar => {
          if (bar.classList.contains('is-visible') || bar.hasAttribute('open') || bar.getAttribute('aria-hidden') === 'false') {
            occupied = Math.max(occupied, bottomOccupation(bar, occupied + 28));
          }
        });
      }
      return Math.ceil(occupied);
    }
    isBlocked() {
      if (!this.hideBlockingUi) return false;
      return Array.from(document.querySelectorAll(BLOCKERS)).some(visible);
    }
    update() {
      if (!this.button) return;
      const { scrollY, maxScroll } = this.getScrollMetrics();
      const isPreview = this.designMode && this.editorPreview && this.isEditorSelected;
      const show = !this.isBlocked() && (isPreview || this.alwaysShow || (maxScroll > 0 && scrollY >= this.threshold));
      const occupied = this.getOccupiedBottom();
      if (occupied !== this.lastOccupation) {
        this.style.setProperty('--sp-back-to-top-occupied-bottom', `${occupied}px`);
        this.lastOccupation = occupied;
      }
      this.classList.toggle('is-visible', show && !isPreview);
      this.classList.toggle('is-editor-preview', show && isPreview);
      this.classList.toggle('is-suppressed', !show);
      // Keep visually hidden control out of the tab order and accessibility tree.
      if (this.button.hidden !== !show) this.button.hidden = !show;
      if (this.button.disabled !== !show) this.button.disabled = !show;
      this.button.tabIndex = show ? 0 : -1;
      if (this.button.getAttribute('aria-hidden') !== String(!show)) this.button.setAttribute('aria-hidden', String(!show));
      const ratio = (this.progressEnabled && maxScroll > 0) ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
      const deg = Math.round(ratio * 36000) / 100;
      if (deg !== this.lastProgress) {
        this.style.setProperty('--sp-back-to-top-progress-deg', `${deg}deg`);
        this.lastProgress = deg;
      }
      this.classList.toggle('is-complete', this.progressEnabled && maxScroll > 0 && ratio >= .9999);
    }
  }
  if (!customElements.get('sp-back-to-top')) customElements.define('sp-back-to-top', SpiderBackToTop);
})();
