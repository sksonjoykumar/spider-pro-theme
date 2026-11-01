(() => {
  'use strict';

  if (window.SpiderNewsletterPopup?.version) {
    window.SpiderNewsletterPopup.scan?.();
    return;
  }

  const memory = new Map();
  const root = document.documentElement;
  const lockOwners = new Set();
  const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  const safeStorage = {
    get(kind, key) { try { return window[kind].getItem(key); } catch (_) { return memory.get(`${kind}:${key}`) ?? null; } },
    set(kind, key, value) { try { window[kind].setItem(key, String(value)); } catch (_) { memory.set(`${kind}:${key}`, String(value)); } },
    remove(kind, key) { try { window[kind].removeItem(key); } catch (_) { memory.delete(`${kind}:${key}`); } }
  };

  const syncLock = () => root.classList.toggle('sp-newsletter-popup-lock', lockOwners.size > 0);

  class SpiderNewsletterPopup extends HTMLElement {
    constructor() {
      super();
      this.state = 'idle';
      this.dialog = null;
      this.abort = null;
      this.timer = 0;
      this.successTimer = 0;
      this.retryTimer = 0;
      this.retryCount = 0;
      this.scrollRaf = 0;
      this.lastFocus = null;
      this.isDesignMode = false;
      this.triggerCleanup = [];
      this.handleScroll = this.handleScroll.bind(this);
      this.handleExitIntent = this.handleExitIntent.bind(this);
      this.handleDialogClick = this.handleDialogClick.bind(this);
      this.handleDialogCancel = this.handleDialogCancel.bind(this);
      this.handleDialogClose = this.handleDialogClose.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.handleSubmit = this.handleSubmit.bind(this);
    }

    connectedCallback() {
      if (this.dataset.spNewsletterInitialized === 'true') return;
      this.dataset.spNewsletterInitialized = 'true';
      this.isDesignMode = this.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode);
      this.dialog = this.querySelector('[data-sp-newsletter-popup-dialog]');
      this.tab = this.querySelector('[data-sp-newsletter-popup-tab]');
      if (this.tab && safeStorage.get('sessionStorage', this.tabDismissalKey()) === '1') this.tab.hidden = true;
      if (!this.dialog) return;

      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.dialog.addEventListener('click', this.handleDialogClick, { signal });
      this.dialog.addEventListener('cancel', this.handleDialogCancel, { signal });
      this.dialog.addEventListener('close', this.handleDialogClose, { signal });
      this.dialog.addEventListener('keydown', this.handleKeydown, { signal });
      this.addEventListener('click', this.handleClick, { signal });
      this.addEventListener('submit', this.handleSubmit, { signal });

      const formError = this.querySelector('[data-sp-newsletter-error]');
      if (formError && !this.isDesignMode) {
        this.open('newsletter-error', false);
        return;
      }

      const success = this.querySelector('[data-sp-newsletter-success]');
      if (success && !this.isDesignMode) {
        this.open('newsletter-success', false);
        this.rememberNormalDismissal('newsletter-success');
        this.emit('sp:newsletter-popup:newsletter-success');
        if (this.dataset.closeAfterSuccess === 'true') {
          this.successTimer = window.setTimeout(() => this.close(false, 'newsletter-success'), Math.max(0, Number(this.dataset.successDelay) || 0) * 1000);
        }
        return;
      }

      if (this.isDesignMode) return;
      if (!this.deviceEligible() || this.isSuppressed()) { this.state = 'dismissed'; return; }
      this.arm();
    }

    disconnectedCallback() {
      if (this.dataset.spNewsletterInitialized !== 'true') return;
      this.dataset.spNewsletterInitialized = 'false';
      this.cleanupTriggers();
      window.clearTimeout(this.successTimer);
      this.successTimer = 0;
      this.close(false, 'unload');
      this.releaseLock();
      this.abort?.abort();
      this.abort = null;
    }

    baseKey() { return `sp:newsletter-popup:v${Math.max(1, Number(this.dataset.campaignVersion) || 1)}:${this.dataset.sectionId}`; }
    sessionDismissKey() { return `${this.baseKey()}:session-dismissed`; }
    tabDismissalKey() { return `${this.baseKey()}:tab-dismissed`; }
    dismissalKey() { return `${this.baseKey()}:dismissed`; }
    permanentKey() { return `${this.baseKey()}:permanent`; }

    acquireLock() { lockOwners.add(this); syncLock(); }
    releaseLock() { lockOwners.delete(this); syncLock(); }

    deviceEligible() {
      const width = window.innerWidth;
      if (width <= 749) return this.dataset.showMobile !== 'false';
      if (width <= 989) return this.dataset.showTablet !== 'false';
      return this.dataset.showDesktop !== 'false';
    }

    isSuppressed() {
      if (safeStorage.get('localStorage', this.permanentKey()) === '1') return true;
      if (safeStorage.get('sessionStorage', this.sessionDismissKey()) === '1') return true;
      const mode = this.dataset.repeatMode || 'days';
      if (mode === 'session') return false;
      const raw = safeStorage.get('localStorage', this.dismissalKey());
      if (!raw) return false;
      try {
        const data = JSON.parse(raw);
        if (data.never === true) return true;
        if ((Number(data.expires) || 0) > Date.now()) return true;
        safeStorage.remove('localStorage', this.dismissalKey());
      } catch (_) { safeStorage.remove('localStorage', this.dismissalKey()); }
      return false;
    }

    rememberNormalDismissal(reason = 'close') {
      if (this.isDesignMode) return;
      safeStorage.set('sessionStorage', this.sessionDismissKey(), '1');
      const mode = this.dataset.repeatMode || 'days';
      if (mode === 'session') return;
      if (mode === 'never') {
        safeStorage.set('localStorage', this.dismissalKey(), JSON.stringify({ never: true, reason }));
        return;
      }
      const days = Math.max(1, Number(this.dataset.repeatDays) || 7);
      safeStorage.set('localStorage', this.dismissalKey(), JSON.stringify({ expires: Date.now() + days * 86400000, reason }));
    }

    rememberPermanentDismissal() {
      if (this.isDesignMode) return;
      safeStorage.set('sessionStorage', this.sessionDismissKey(), '1');
      safeStorage.set('localStorage', this.permanentKey(), '1');
    }

    isTouchLike() { return matchMedia('(hover: none), (pointer: coarse)').matches || window.innerWidth <= 749; }

    arm() {
      if (this.state === 'open' || this.state === 'dismissed' || this.state === 'permanently_dismissed') return;
      this.cleanupTriggers();
      this.state = 'armed';
      const trigger = this.dataset.trigger || 'time';

      if (trigger === 'scroll') {
        this.armScroll(this.dataset.scrollMode || 'percentage', Number(this.dataset.scrollPixels) || 800, Number(this.dataset.scrollPercent) || 50);
        return;
      }

      if (trigger === 'exit_intent') {
        if (this.isTouchLike()) {
          const fallback = this.dataset.mobileExitFallback || 'time';
          if (fallback === 'disabled') { this.state = 'blocked'; return; }
          if (fallback === 'scroll') {
            this.armScroll('percentage', 0, Number(this.dataset.mobileFallbackScroll) || 60);
            return;
          }
          this.timer = window.setTimeout(() => this.requestOpen('mobile-fallback-time'), Math.max(3, Number(this.dataset.mobileFallbackDelay) || 8) * 1000);
          return;
        }
        document.addEventListener('mouseout', this.handleExitIntent);
        this.triggerCleanup.push(() => document.removeEventListener('mouseout', this.handleExitIntent));
        return;
      }

      this.timer = window.setTimeout(() => this.requestOpen('time'), Math.max(1, Number(this.dataset.delaySeconds) || 5) * 1000);
    }

    armScroll(mode, pixels, percent) {
      this.activeScrollMode = mode;
      this.activeScrollPixels = pixels;
      this.activeScrollPercent = percent;
      window.addEventListener('scroll', this.handleScroll, { passive: true });
      this.triggerCleanup.push(() => window.removeEventListener('scroll', this.handleScroll));
      this.handleScroll();
    }

    handleExitIntent(event) {
      if (this.state !== 'armed') return;
      const threshold = Math.max(0, Number(this.dataset.exitThreshold) || 20);
      if (event.relatedTarget === null && event.clientY <= threshold) this.requestOpen('exit-intent');
    }

    handleScroll() {
      if (this.scrollRaf || this.state !== 'armed') return;
      this.scrollRaf = requestAnimationFrame(() => {
        this.scrollRaf = 0;
        if (this.state !== 'armed') return;
        if (this.activeScrollMode === 'percentage') {
          const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          const percent = Math.min(100, Math.max(0, (window.scrollY / max) * 100));
          if (percent >= this.activeScrollPercent) this.requestOpen('scroll-percentage');
        } else if (window.scrollY >= this.activeScrollPixels) this.requestOpen('scroll-pixels');
      });
    }

    isFormInteractionActive() {
      const active = document.activeElement;
      return Boolean(active && (active.matches?.('input,textarea,select,[contenteditable="true"]') || active.closest?.('[contenteditable="true"]')));
    }

    otherBlockingUiOpen() {
      if ([...document.querySelectorAll('dialog[open]')].some(dialog => dialog !== this.dialog)) return true;
      if (root.classList.contains('sp-exit-popup-lock') || root.classList.contains('sp-age-verification-lock')) return true;
      if (root.classList.contains('sp-scroll-lock') && !lockOwners.has(this)) return true;
      if (root.classList.contains('sp-page-transition-active') || root.classList.contains('sp-loader-active')) return true;
      return Boolean(window.Spider?.pageTransitionController?.isActive);
    }

    requestOpen(reason) {
      if (this.state !== 'armed' && this.state !== 'blocked') return;
      if (this.isSuppressed() || !this.deviceEligible()) { this.state = 'dismissed'; this.cleanupTriggers(); return; }
      if (this.isFormInteractionActive() || this.otherBlockingUiOpen()) {
        this.state = 'blocked';
        if (this.retryCount >= 8) return;
        this.retryCount += 1;
        window.clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.requestOpen(reason), 1250);
        return;
      }
      this.open(reason, false);
    }

    open(reason = 'manual', preview = false) {
      if (!this.dialog || this.dialog.open) return;
      this.cleanupTriggers();
      this.retryCount = 0;
      this.state = 'open';
      this.dataset.popupOpen = 'true';
      this.lastFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      this.acquireLock();
      try { this.dialog.showModal?.(); if (!this.dialog.open) this.dialog.setAttribute('open', ''); }
      catch (_) { this.dialog.setAttribute('open', ''); }
      this.dataset.previewOpen = preview ? 'true' : 'false';
      requestAnimationFrame(() => (this.querySelector('[data-sp-newsletter-popup-close]') || this.dialog.querySelector(focusableSelector))?.focus?.({ preventScroll: true }));
      this.emit('sp:newsletter-popup:open', { reason, preview });
    }

    preview() { this.open('theme-editor', true); }

    close(dismiss = true, reason = 'close') {
      if (!this.dialog) return;
      const preview = this.dataset.previewOpen === 'true' || this.isDesignMode;
      if (dismiss && !preview) this.rememberNormalDismissal(reason);
      const wasOpen = this.dialog.open || this.dialog.hasAttribute('open');
      if (this.dialog.open && typeof this.dialog.close === 'function') {
        try { this.dialog.close(); } catch (_) { this.dialog.removeAttribute('open'); }
      } else {
        this.dialog.removeAttribute('open');
        if (wasOpen) this.finishClose(reason, preview);
      }
    }

    permanentDismiss() {
      if (!this.isDesignMode) this.rememberPermanentDismissal();
      this.state = 'permanently_dismissed';
      if (this.tab) this.tab.hidden = true;
      this.emit('sp:newsletter-popup:permanent-dismiss');
      this.close(false, 'do-not-show-again');
    }

    handleDialogClose() { this.finishClose('close', this.dataset.previewOpen === 'true' || this.isDesignMode); }
    finishClose(reason, preview) {
      this.releaseLock();
      this.dataset.popupOpen = 'false';
      this.dataset.previewOpen = 'false';
      if (this.lastFocus?.isConnected) this.lastFocus.focus?.({ preventScroll: true });
      this.emit('sp:newsletter-popup:close', { reason, preview });
      this.state = preview ? 'idle' : (this.state === 'permanently_dismissed' ? 'permanently_dismissed' : 'dismissed');
    }

    handleDialogCancel(event) { event.preventDefault(); this.close(true, 'escape'); }
    handleDialogClick(event) { if (event.target === this.dialog) this.close(true, 'backdrop'); }

    handleKeydown(event) {
      if (event.key !== 'Tab') return;
      const focusables = [...this.dialog.querySelectorAll(focusableSelector)].filter(el => !el.hidden && el.getClientRects().length);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    handleClick(event) {
      const tabDismiss = event.target.closest('[data-sp-newsletter-popup-tab-dismiss]');
      if (tabDismiss && this.contains(tabDismiss)) {
        event.preventDefault();
        if (this.tab) this.tab.hidden = true;
        safeStorage.set('sessionStorage', this.tabDismissalKey(), '1');
        return;
      }
      const reopen = event.target.closest('[data-sp-newsletter-popup-reopen]');
      if (reopen && this.contains(reopen)) {
        event.preventDefault();
        if (this.deviceEligible()) this.open('collapsed-tab', false);
        return;
      }
      const close = event.target.closest('[data-sp-newsletter-popup-close]');
      if (close && this.contains(close)) { event.preventDefault(); this.close(true, 'close-button'); return; }
      const noThanks = event.target.closest('[data-sp-newsletter-popup-no-thanks]');
      if (noThanks && this.contains(noThanks)) { event.preventDefault(); this.close(true, 'no-thanks'); return; }
      const permanent = event.target.closest('[data-sp-newsletter-popup-permanent-dismiss]');
      if (permanent && this.contains(permanent)) { event.preventDefault(); this.permanentDismiss(); }
    }

    handleSubmit(event) {
      const form = event.target.closest?.('.sp-newsletter-popup__form');
      if (!form || !this.contains(form)) return;
      const agreement = form.querySelector('[data-sp-newsletter-popup-agreement]');
      const status = form.querySelector('[data-sp-newsletter-popup-form-status]');
      if (agreement && !agreement.checked) {
        event.preventDefault();
        if (status) status.innerHTML = '<p class="sp-newsletter-popup__error" role="alert">Please accept the agreement before subscribing.</p>';
        agreement.focus({ preventScroll: true });
        return;
      }
      form.setAttribute('aria-busy', 'true');
      form.querySelector('[data-sp-newsletter-popup-submit]')?.setAttribute('aria-disabled', 'true');
    }

    cleanupTriggers() {
      window.clearTimeout(this.timer); window.clearTimeout(this.retryTimer);
      this.timer = 0; this.retryTimer = 0;
      if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf);
      this.scrollRaf = 0;
      this.triggerCleanup.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
    }

    emit(name, detail = {}) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { sectionId: this.dataset.sectionId, ...detail } })); }
  }

  if (!customElements.get('sp-newsletter-popup')) customElements.define('sp-newsletter-popup', SpiderNewsletterPopup);

  const manager = {
    version: '2.1.0',
    scan(rootNode = document) {
      rootNode.querySelectorAll?.('sp-newsletter-popup').forEach(el => {
        if (el.isConnected && el.dataset.spNewsletterInitialized !== 'true') el.connectedCallback?.();
      });
    },
    popupFromEvent(event) {
      const target = event.target instanceof Element ? event.target : null;
      return target?.closest?.('sp-newsletter-popup') || target?.querySelector?.('sp-newsletter-popup') || null;
    }
  };

  document.addEventListener('shopify:section:load', event => {
    manager.scan(event.target);
    const popup = manager.popupFromEvent(event);
    if (popup?.isDesignMode && popup.dataset.previewEditor === 'true') popup.preview?.();
  });
  document.addEventListener('shopify:section:unload', event => manager.popupFromEvent(event)?.disconnectedCallback?.());
  document.addEventListener('shopify:section:select', event => {
    const popup = manager.popupFromEvent(event);
    if (popup?.dataset.previewEditor === 'true') popup.preview?.();
  });
  document.addEventListener('shopify:section:deselect', event => {
    const popup = manager.popupFromEvent(event);
    if (popup?.isDesignMode) popup.close?.(false, 'theme-editor');
  });
  document.addEventListener('shopify:block:select', event => manager.popupFromEvent(event)?.preview?.());

  window.SpiderNewsletterPopup = manager;
  manager.scan();
})();
