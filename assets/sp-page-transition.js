(() => {
  'use strict';

  const Spider = window.Spider = window.Spider || {};
  if (Spider.pageTransitionController) return;

  const loader = document.querySelector('[data-sp-global-loader]');
  if (!loader) return;

  const root = document.documentElement;
  const NAV_KEY = 'sp:page-transition:navigation';
  const SHOWN_KEY = 'sp:page-transition:shown-at';
  const EXCLUDED_CLICK_SELECTOR = [
    '[data-drawer-open]',
    '[data-drawer-close]',
    '[data-dialog-close]',
    '[data-add-to-cart]',
    '[data-cart-remove]',
    '[data-load-more]',
    '[data-gallery-next]',
    '[data-gallery-previous]',
    '[data-media-target]',
    '[data-media-zoom]',
    '[data-quantity-minus]',
    '[data-quantity-plus]',
    '[data-variant-select]',
    '[data-sort-by]',
    '[data-dynamic-checkout]'
  ].join(',');
  const EXCLUDED_FORM_SELECTOR = [
    '[data-product-form]',
    '[data-product-card-form]',
    '[data-cart-form]',
    '[data-facets-form]',
    '[data-predictive-search]'
  ].join(',');

  const number = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const config = Object.freeze({
    delay: Math.max(0, number(loader.dataset.loaderDelay, 100)),
    minDuration: Math.max(0, number(loader.dataset.loaderMinDuration, 250)),
    transitionDuration: Math.max(0, number(loader.dataset.transitionDuration, 350)),
    lockScroll: loader.dataset.lockScroll === 'true',
    designMode: loader.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode),
    designPreview: loader.dataset.designPreview === 'true'
  });

  class PageTransitionController {
    constructor() {
      this.visible = false;
      this.shownAt = 0;
      this.showTimer = 0;
      this.hideTimer = 0;
      this.cleanupTimer = 0;
      this.safetyTimer = 0;
      this.boundClick = this.onClick.bind(this);
      this.boundSubmit = this.onSubmit.bind(this);
      this.boundPageShow = this.onPageShow.bind(this);
      this.boundPageHide = this.onPageHide.bind(this);
      this.boundKeyDown = this.onKeyDown.bind(this);
      this.init();
    }

    init() {
      if (config.designMode) {
        this.reset(true);
        if (config.designPreview) {
          window.addEventListener('DOMContentLoaded', () => this.preview(), { once: true });
        }
        return;
      }

      const resumedFor = Math.max(0, number(root.dataset.spLoaderResume, 0));
      if (resumedFor > 0) {
        root.classList.remove('sp-loader-resume');
        this.show({ persist: false });
        this.hideTimer = window.setTimeout(() => this.hide({ respectMinimum: false }), resumedFor);
      } else {
        root.classList.remove('sp-loader-resume');
      }

      document.addEventListener('click', this.boundClick);
      document.addEventListener('submit', this.boundSubmit);
      window.addEventListener('pageshow', this.boundPageShow);
      window.addEventListener('pagehide', this.boundPageHide);
      document.addEventListener('keydown', this.boundKeyDown);

      this.cleanupTimer = window.setTimeout(() => {
        root.classList.remove('sp-page-entry', 'sp-page-entry--fade', 'sp-page-entry--fade_scale', 'sp-page-entry--slide_up', 'sp-page-entry--none');
        root.style.removeProperty('--sp-loader-resume-remaining');
        delete root.dataset.spLoaderResume;
      }, config.transitionDuration + resumedFor + 100);
    }

    emit(type, detail = {}) {
      const name = type === 'start'
        ? (Spider.events?.pageTransitionStart || 'spider:page-transition:start')
        : (Spider.events?.pageTransitionEnd || 'spider:page-transition:end');
      document.dispatchEvent(new CustomEvent(name, { detail }));
    }

    setNavigationFlag(url) {
      try {
        sessionStorage.setItem(NAV_KEY, JSON.stringify({ at: Date.now(), url: String(url || '') }));
      } catch (_) {}
    }

    setShownFlag() {
      try { sessionStorage.setItem(SHOWN_KEY, String(Date.now())); } catch (_) {}
    }

    clearShownFlag() {
      try { sessionStorage.removeItem(SHOWN_KEY); } catch (_) {}
    }

    clearNavigationFlag() {
      try { sessionStorage.removeItem(NAV_KEY); } catch (_) {}
    }

    closeOpenDrawerForNavigation() {
      document.querySelectorAll('dialog.sp-drawer[open]').forEach((dialog) => {
        if (typeof Spider.closeDrawer === 'function') Spider.closeDrawer(dialog, false);
        else dialog.close();
      });
    }

    show({ persist = true } = {}) {
      window.clearTimeout(this.showTimer);
      if (this.visible) return;
      this.visible = true;
      this.shownAt = performance.now();
      this.closeOpenDrawerForNavigation();
      loader.classList.remove('is-hiding');
      loader.classList.add('is-active');
      loader.setAttribute('aria-hidden', 'false');
      root.classList.add('sp-page-transition-active');
      if (config.lockScroll) root.classList.add('sp-page-transition-lock');
      if (persist) this.setShownFlag();
      this.emit('start', { loaderStyle: loader.dataset.loaderStyle || 'spinner' });
    }

    hide({ immediate = false, respectMinimum = true } = {}) {
      window.clearTimeout(this.hideTimer);
      if (!this.visible) {
        this.reset(immediate);
        return;
      }
      const elapsed = performance.now() - this.shownAt;
      const remaining = respectMinimum ? Math.max(0, config.minDuration - elapsed) : 0;
      if (remaining > 0 && !immediate) {
        this.hideTimer = window.setTimeout(() => this.hide({ immediate: false, respectMinimum: false }), remaining);
        return;
      }

      this.visible = false;
      this.clearShownFlag();
      root.classList.remove('sp-page-transition-lock', 'sp-page-transition-active');
      loader.setAttribute('aria-hidden', 'true');

      if (immediate) {
        loader.classList.remove('is-active', 'is-hiding');
        this.emit('end', { immediate: true });
        return;
      }

      loader.classList.remove('is-active');
      loader.classList.add('is-hiding');
      window.setTimeout(() => loader.classList.remove('is-hiding'), config.transitionDuration);
      this.emit('end', { immediate: false });
    }

    reset(immediate = true) {
      window.clearTimeout(this.showTimer);
      window.clearTimeout(this.hideTimer);
      window.clearTimeout(this.safetyTimer);
      this.visible = false;
      this.shownAt = 0;
      this.clearShownFlag();
      loader.classList.remove('is-active', 'is-hiding');
      loader.setAttribute('aria-hidden', 'true');
      root.classList.remove('sp-loader-resume', 'sp-page-transition-lock', 'sp-page-transition-active');
      if (immediate) root.style.removeProperty('--sp-loader-resume-remaining');
    }

    preview() {
      this.show({ persist: false });
      const displayTime = Math.max(1200, config.minDuration);
      this.hideTimer = window.setTimeout(() => this.hide({ respectMinimum: false }), displayTime);
    }

    schedule(url) {
      this.setNavigationFlag(url);
      window.clearTimeout(this.showTimer);
      window.clearTimeout(this.safetyTimer);
      if (config.delay === 0) this.show();
      else this.showTimer = window.setTimeout(() => this.show(), config.delay);

      // Recovery only: a failed/cancelled navigation must never leave the storefront blocked indefinitely.
      this.safetyTimer = window.setTimeout(() => {
        if (!document.hidden) {
          this.clearNavigationFlag();
          this.hide({ respectMinimum: true });
        }
      }, 15000);
    }

    eligibleLink(event, link) {
      if (!link || event.defaultPrevented || event.button !== 0) return null;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
      if (link.matches(EXCLUDED_CLICK_SELECTOR) || link.closest(EXCLUDED_CLICK_SELECTOR)) return null;
      if (link.hasAttribute('download')) return null;
      const target = (link.getAttribute('target') || '').trim().toLowerCase();
      if (target && target !== '_self') return null;

      const raw = (link.getAttribute('href') || '').trim();
      if (!raw || raw === '#' || raw.startsWith('#')) return null;
      if (/^(?:javascript:|mailto:|tel:|sms:)/i.test(raw)) return null;

      let url;
      try { url = new URL(link.href, location.href); } catch (_) { return null; }
      if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return null;

      const sameDocument = url.pathname === location.pathname && url.search === location.search;
      if (sameDocument && (url.hash || url.href === location.href)) return null;
      return url;
    }

    onClick(event) {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const url = this.eligibleLink(event, link);
      if (!url) return;
      this.schedule(url.href);
    }

    onSubmit(event) {
      const form = event.target instanceof HTMLFormElement ? event.target : event.target?.closest?.('form');
      if (!form || event.defaultPrevented || form.matches(EXCLUDED_FORM_SELECTOR)) return;
      if (form.closest(EXCLUDED_FORM_SELECTOR)) return;
      if ((form.getAttribute('method') || 'get').toLowerCase() === 'dialog') return;
      const target = (form.getAttribute('target') || '').trim().toLowerCase();
      if (target && target !== '_self') return;

      const submitter = event.submitter;
      if (submitter?.matches(EXCLUDED_CLICK_SELECTOR) || submitter?.closest(EXCLUDED_CLICK_SELECTOR)) return;

      let action;
      try { action = new URL(form.action || location.href, location.href); } catch (_) { return; }
      if (!/^https?:$/.test(action.protocol) || action.origin !== location.origin) return;
      if (/\/cart\/(?:add|change|update)(?:\.js)?$/i.test(action.pathname)) return;
      if (/\/contact$/i.test(action.pathname)) return;
      this.schedule(action.href);
    }

    onPageShow(event) {
      if (event.persisted) {
        this.reset(true);
        root.classList.remove('sp-page-entry', 'sp-page-entry--fade', 'sp-page-entry--fade_scale', 'sp-page-entry--slide_up', 'sp-page-entry--none');
      }
    }

    onPageHide() {
      window.clearTimeout(this.showTimer);
      window.clearTimeout(this.hideTimer);
      window.clearTimeout(this.safetyTimer);
      // Do not clear SHOWN_KEY here; the destination uses it to honor minimum display time.
      root.classList.remove('sp-page-transition-lock');
    }

    onKeyDown(event) {
      if (event.key === 'Escape' && this.visible && !document.hidden) {
        this.hide({ immediate: true, respectMinimum: false });
      }
    }
  }

  Spider.pageTransitionController = new PageTransitionController();
})();
