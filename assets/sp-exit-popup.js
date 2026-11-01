(() => {
  'use strict';

  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const daysToMs = (days) => Math.max(0, Number(days) || 0) * 86400000;
  const toNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  class SafeStore {
    constructor(type) {
      this.memory = new Map();
      try {
        this.store = type === 'session' ? window.sessionStorage : window.localStorage;
        const probe = `sp:probe:${Math.random()}`;
        this.store.setItem(probe, '1');
        this.store.removeItem(probe);
      } catch (_) {
        this.store = null;
      }
    }
    get(key) {
      try { return this.store ? this.store.getItem(key) : (this.memory.get(key) ?? null); }
      catch (_) { return this.memory.get(key) ?? null; }
    }
    set(key, value) {
      const stringValue = String(value);
      try { if (this.store) this.store.setItem(key, stringValue); else this.memory.set(key, stringValue); }
      catch (_) { this.memory.set(key, stringValue); }
    }
    remove(key) {
      try { if (this.store) this.store.removeItem(key); }
      catch (_) {}
      this.memory.delete(key);
    }
  }

  class SpiderExitPopup extends HTMLElement {
    constructor() {
      super();
      this.state = 'idle';
      this.local = new SafeStore('local');
      this.session = new SafeStore('session');
      this.timer = 0;
      this.blockRetryTimer = 0;
      this.scrollRaf = 0;
      this.previousFocus = null;
      this.openCount = 0;
      this.carouselReady = false;
      this.onCarouselScroll = this.onCarouselScroll.bind(this);
      this.isVisible = false;
      this.scrollHandlerAttached = false;
      this.exitHandlerAttached = false;
      this.copyRestoreTimers = new Map();

      this.onClick = this.onClick.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onCancel = this.onCancel.bind(this);
      this.onDialogClick = this.onDialogClick.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.onMouseOut = this.onMouseOut.bind(this);
      this.onDrawerClosed = this.onDrawerClosed.bind(this);
      this.onDrawerOpened = this.onDrawerOpened.bind(this);
      this.onPageTransitionStart = this.onPageTransitionStart.bind(this);
      this.onSectionSelect = this.onSectionSelect.bind(this);
      this.onSectionDeselect = this.onSectionDeselect.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);
      this.onNewsletterSubmit = this.onNewsletterSubmit.bind(this);
    }

    connectedCallback() {
      if (this.initialized) return;
      this.initialized = true;
      this.dialog = this.querySelector('[data-sp-exit-popup-dialog]');
      if (!(this.dialog instanceof HTMLDialogElement)) return;

      this.sectionId = this.dataset.sectionId || 'unknown';
      this.designMode = this.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode);
      this.storageBase = `sp:exit-popup:${this.sectionId}`;
      this.animation = this.dataset.animation || 'fade_scale';
      this.maxOpens = Math.max(1, toNumber(this.dataset.maxOpens, 1));
      this.openCount = Math.max(0, toNumber(this.session.get(`${this.storageBase}:opens`), 0));

      this.addEventListener('click', this.onClick);
      this.addEventListener('keydown', this.onKeydown);
      this.addEventListener('submit', this.onNewsletterSubmit, true);
      this.dialog.addEventListener('cancel', this.onCancel);
      this.dialog.addEventListener('click', this.onDialogClick);
      document.addEventListener('spider:drawer:closed', this.onDrawerClosed);
      document.addEventListener('spider:drawer:opened', this.onDrawerOpened);
      document.addEventListener('spider:page-transition:start', this.onPageTransitionStart);

      if (this.designMode) {
        document.addEventListener('shopify:section:select', this.onSectionSelect);
        document.addEventListener('shopify:section:deselect', this.onSectionDeselect);
        document.addEventListener('shopify:block:select', this.onBlockSelect);
      }

      if (this.querySelector('[data-sp-exit-popup-newsletter-success]')) {
        this.emit('newsletter-success');
        if (this.dataset.closeNewsletterSuccess === 'true' && !this.designMode) {
          this.markDismissed('newsletter-success');
          return;
        }
      }

      if (this.designMode) {
        if (this.dataset.previewEditor === 'true') requestAnimationFrame(() => this.open('editor-preview', { ignoreEligibility: true }));
        return;
      }

      if (!this.viewportAllowed() || this.isSuppressed()) {
        this.state = 'dismissed';
        return;
      }

      this.arm();
    }

    disconnectedCallback() {
      this.clearTriggerHandlers();
      clearTimeout(this.blockRetryTimer);
      cancelAnimationFrame(this.scrollRaf);
      this.removeEventListener('click', this.onClick);
      this.removeEventListener('keydown', this.onKeydown);
      this.removeEventListener('submit', this.onNewsletterSubmit, true);
      this.dialog?.removeEventListener('cancel', this.onCancel);
      this.dialog?.removeEventListener('click', this.onDialogClick);
      document.removeEventListener('spider:drawer:closed', this.onDrawerClosed);
      document.removeEventListener('spider:drawer:opened', this.onDrawerOpened);
      document.removeEventListener('spider:page-transition:start', this.onPageTransitionStart);
      document.removeEventListener('shopify:section:select', this.onSectionSelect);
      document.removeEventListener('shopify:section:deselect', this.onSectionDeselect);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      if (this.carousel) this.carousel.removeEventListener('scroll', this.onCarouselScroll);
      this.carouselReady = false;
      this.carousel = null;
      this.copyRestoreTimers.forEach((timer) => clearTimeout(timer));
      this.copyRestoreTimers.clear();
      if (this.dialog?.open) this.dialog.close();
      this.releaseLock();
      this.initialized = false;
    }

    viewportAllowed() {
      const width = window.innerWidth;
      if (width <= 749) return this.dataset.showMobile === 'true';
      if (width <= 989) return this.dataset.showTablet === 'true';
      return this.dataset.showDesktop === 'true';
    }

    isSuppressed() {
      if (this.session.get(`${this.storageBase}:dismissed`) === '1') return true;
      if (this.openCount >= this.maxOpens) return true;
      const until = this.local.get(`${this.storageBase}:until`);
      if (until === 'never') return true;
      if (until && toNumber(until, 0) > Date.now()) return true;
      if (until && toNumber(until, 0) <= Date.now()) this.local.remove(`${this.storageBase}:until`);
      return false;
    }

    arm() {
      if (this.state !== 'idle') return;
      this.state = 'armed';
      let trigger = this.dataset.trigger || 'exit_intent';
      const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches && window.innerWidth >= 990;

      if (trigger === 'exit_intent' && !finePointer) {
        const fallback = this.dataset.mobileFallback || 'time';
        if (fallback === 'disabled') return;
        trigger = fallback;
      }

      if (trigger === 'manual') return;
      if (trigger === 'time') {
        const delay = this.dataset.trigger === 'exit_intent' ? this.dataset.mobileDelay : this.dataset.timeDelay;
        this.armTimer(delay);
      } else if (trigger === 'scroll') {
        const percent = this.dataset.trigger === 'exit_intent' ? this.dataset.mobileScrollPercent : this.dataset.scrollPercent;
        this.armScroll(percent);
      } else {
        this.armExitIntent();
      }
    }

    armTimer(seconds) {
      clearTimeout(this.timer);
      const delay = Math.max(1, toNumber(seconds, 5)) * 1000;
      this.timer = window.setTimeout(() => this.tryOpen('time'), delay);
    }

    armScroll(percent) {
      this.scrollThreshold = Math.min(90, Math.max(10, toNumber(percent, 50))) / 100;
      if (!this.scrollHandlerAttached) {
        window.addEventListener('scroll', this.onScroll, { passive: true });
        this.scrollHandlerAttached = true;
      }
      this.onScroll();
    }

    armExitIntent() {
      if (this.exitHandlerAttached) return;
      document.addEventListener('mouseout', this.onMouseOut, { passive: true });
      this.exitHandlerAttached = true;
    }

    clearTriggerHandlers() {
      clearTimeout(this.timer);
      this.timer = 0;
      if (this.scrollHandlerAttached) {
        window.removeEventListener('scroll', this.onScroll);
        this.scrollHandlerAttached = false;
      }
      if (this.exitHandlerAttached) {
        document.removeEventListener('mouseout', this.onMouseOut);
        this.exitHandlerAttached = false;
      }
    }

    onScroll() {
      if (this.scrollRaf) return;
      this.scrollRaf = requestAnimationFrame(() => {
        this.scrollRaf = 0;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.max(0, window.scrollY) / max;
        if (progress >= this.scrollThreshold) this.tryOpen('scroll');
      });
    }

    onMouseOut(event) {
      if (event.relatedTarget || event.toElement) return;
      if (event.clientY > 12) return;
      if (event.clientX < 0 || event.clientX > window.innerWidth) return;
      this.tryOpen('exit-intent');
    }

    activeFormField() {
      const active = document.activeElement;
      return active instanceof Element && Boolean(active.closest('input, textarea, select, [contenteditable="true"]'));
    }

    blockingUiOpen() {
      if (document.documentElement.classList.contains('sp-page-transition-active')) return true;
      if (document.querySelector('[data-sp-global-loader].is-active')) return true;
      if (document.querySelector(`dialog[open]:not(#${CSS.escape(this.dialog.id)})`)) return true;
      if (document.querySelector('[aria-modal="true"]:not([hidden])') && !this.dialog.open) return true;
      return false;
    }

    tryOpen(reason) {
      if (this.designMode) return this.open(reason, { ignoreEligibility: true });
      if (this.state === 'open' || this.state === 'dismissed') return;
      if (!this.viewportAllowed() || this.isSuppressed()) {
        this.state = 'dismissed';
        this.clearTriggerHandlers();
        return;
      }
      if (this.activeFormField() || this.blockingUiOpen()) {
        this.state = 'blocked';
        clearTimeout(this.blockRetryTimer);
        this.blockRetryTimer = window.setTimeout(() => {
          if (this.state === 'blocked') {
            this.state = 'armed';
            this.tryOpen(reason);
          }
        }, 1200);
        return;
      }
      this.open(reason);
    }

    open(reason, { ignoreEligibility = false } = {}) {
      if (!this.dialog || this.dialog.open) return;
      if (!ignoreEligibility && (this.isSuppressed() || !this.viewportAllowed())) return;
      this.clearTriggerHandlers();
      this.state = 'open';
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.dialog.dataset.animation = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'none' : this.animation;
      this.dialog.dataset.animationReady = 'true';
      this.dialog.showModal();
      this.acquireLock();
      this.setupCarousel();

      if (!this.designMode) {
        this.openCount += 1;
        this.session.set(`${this.storageBase}:opens`, this.openCount);
      }

      const first = this.dialog.querySelector('[data-sp-exit-popup-close], ' + FOCUSABLE);
      requestAnimationFrame(() => first?.focus({ preventScroll: true }));
      this.emit('open', { reason });
    }

    close(reason = 'close', { dismiss = true, restoreFocus = true } = {}) {
      if (!this.dialog?.open) return;
      this.dialog.close();
      this.releaseLock();
      this.state = dismiss && !this.designMode ? 'dismissed' : 'idle';
      if (dismiss && !this.designMode) this.markDismissed(reason);
      if (restoreFocus) requestAnimationFrame(() => this.previousFocus?.isConnected && this.previousFocus.focus({ preventScroll: true }));
      this.emit('close', { reason });
    }

    markDismissed(reason) {
      this.session.set(`${this.storageBase}:dismissed`, '1');
      const frequency = this.dataset.frequency || '7_days';
      if (frequency === 'session') return;
      if (frequency === 'never') {
        this.local.set(`${this.storageBase}:until`, 'never');
        return;
      }
      const map = { '1_day': 1, '3_days': 3, '7_days': 7, '14_days': 14, '30_days': 30 };
      const days = frequency === 'custom' ? Math.max(1, toNumber(this.dataset.customDays, 10)) : (map[frequency] || 7);
      this.local.set(`${this.storageBase}:until`, Date.now() + daysToMs(days));
      this.local.set(`${this.storageBase}:reason`, reason || 'close');
    }

    acquireLock() {
      document.documentElement.classList.add('sp-exit-popup-lock');
    }

    releaseLock() {
      document.documentElement.classList.remove('sp-exit-popup-lock');
    }

    onCancel(event) {
      event.preventDefault();
      this.close('escape');
    }

    onDialogClick(event) {
      if (this.dataset.backdropClose !== 'true' || event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) this.close('backdrop');
    }

    onKeydown(event) {
      if (!this.dialog?.open || event.key !== 'Tab') return;
      const focusable = [...this.dialog.querySelectorAll(FOCUSABLE)].filter((node) => !node.hidden && node.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    async copyDiscount(button) {
      const root = button.closest('.sp-exit-popup__discount');
      const codeElement = root?.querySelector('[data-sp-exit-popup-discount-code]');
      const code = codeElement?.dataset.originalCode || codeElement?.textContent?.trim();
      if (!code) return;
      if (codeElement && !codeElement.dataset.originalCode) codeElement.dataset.originalCode = code;
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
          copied = true;
        }
      } catch (_) {}

      if (!copied) {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
        textarea.remove();
      }

      const status = root?.querySelector('[data-sp-exit-popup-copy-status]');
      const message = copied ? `Code copied: ${code}` : `Copy failed. Code: ${code}`;
      if (status) status.textContent = message;
      window.Spider?.announce?.(message);

      if (copied && codeElement) {
        codeElement.textContent = 'Copied!';
        root?.classList.add('is-copied');
        const previousTimer = this.copyRestoreTimers.get(codeElement);
        if (previousTimer) clearTimeout(previousTimer);
        const timer = window.setTimeout(() => {
          if (codeElement.isConnected) codeElement.textContent = code;
          root?.classList.remove('is-copied');
          this.copyRestoreTimers.delete(codeElement);
        }, 1800);
        this.copyRestoreTimers.set(codeElement, timer);
      }

      this.emit('discount-copy', { code, copied });
      if (copied && this.dataset.dismissDiscountCopy === 'true' && !this.designMode) this.markDismissed('discount-copy');
    }

    onClick(event) {
      const close = event.target.closest('[data-sp-exit-popup-close]');
      if (close) {
        event.preventDefault();
        this.close('close-button');
        return;
      }

      const copy = event.target.closest('[data-sp-exit-popup-copy]');
      if (copy) {
        event.preventDefault();
        this.copyDiscount(copy);
        return;
      }

      const prev = event.target.closest('[data-sp-exit-popup-carousel-prev]');
      if (prev) {
        event.preventDefault();
        this.moveCarousel(-1);
        return;
      }
      const next = event.target.closest('[data-sp-exit-popup-carousel-next]');
      if (next) {
        event.preventDefault();
        this.moveCarousel(1);
        return;
      }

      const cta = event.target.closest('[data-sp-exit-popup-cta]');
      if (cta) {
        this.emit('cta', { href: cta.href || '' });
        if (this.dataset.dismissCta === 'true' && !this.designMode) this.markDismissed('cta');
      }
    }

    onNewsletterSubmit(event) {
      const form = event.target.closest('[data-sp-exit-popup-newsletter]');
      if (!form) return;
      this.emit('newsletter-submit');
    }

    setupCarousel() {
      if (this.carouselReady) return;
      this.carousel = this.querySelector('.sp-exit-popup__products-list.is-carousel');
      if (!this.carousel) return;
      this.carouselReady = true;
      this.carousel.addEventListener('scroll', this.onCarouselScroll, { passive: true });
      this.updateCarouselStatus();
    }

    onCarouselScroll() {
      this.updateCarouselStatus();
    }

    moveCarousel(direction) {
      if (!this.carousel) return;
      const cards = [...this.carousel.children];
      if (!cards.length) return;
      const gap = parseFloat(getComputedStyle(this.carousel).columnGap || getComputedStyle(this.carousel).gap) || 0;
      const amount = cards[0].getBoundingClientRect().width + gap;
      const rtl = getComputedStyle(this.carousel).direction === 'rtl';
      const sign = rtl ? -direction : direction;
      this.carousel.scrollBy({ left: amount * sign, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' });
      requestAnimationFrame(() => this.updateCarouselStatus());
    }

    updateCarouselStatus() {
      if (!this.carousel) return;
      const cards = [...this.carousel.children];
      const status = this.querySelector('[data-sp-exit-popup-carousel-status]');
      if (!cards.length || !status) return;
      const viewport = this.carousel.getBoundingClientRect();
      let bestIndex = 0;
      let bestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left - viewport.left);
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
      });
      status.textContent = `${bestIndex + 1} / ${cards.length}`;
    }

    onDrawerOpened() {
      if (this.dialog?.open) {
        this.close('drawer-open', { dismiss: false, restoreFocus: false });
        if (!this.designMode) this.session.set(`${this.storageBase}:dismissed`, '1');
        this.state = 'blocked';
      }
    }

    onDrawerClosed() {
      if (this.state === 'blocked') {
        clearTimeout(this.blockRetryTimer);
        this.state = 'armed';
        this.tryOpen('unblocked');
      }
      if (this.dialog?.open) this.acquireLock();
    }

    onPageTransitionStart() {
      this.clearTriggerHandlers();
      clearTimeout(this.blockRetryTimer);
      if (this.dialog?.open) this.close('navigation', { dismiss: false, restoreFocus: false });
      this.state = 'blocked';
    }

    onSectionSelect(event) {
      if (!this.contains(event.target) && event.target !== this.closest('.shopify-section')) return;
      if (this.dataset.previewEditor === 'true') this.open('editor-section', { ignoreEligibility: true });
    }

    onSectionDeselect(event) {
      if (!this.contains(event.target) && event.target !== this.closest('.shopify-section')) return;
      if (this.dialog?.open) this.close('editor-deselect', { dismiss: false, restoreFocus: false });
    }

    onBlockSelect(event) {
      if (!this.contains(event.target)) return;
      this.open('editor-block', { ignoreEligibility: true });
      requestAnimationFrame(() => event.target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
    }

    emit(name, detail = {}) {
      this.dispatchEvent(new CustomEvent(`sp:exit-popup:${name}`, { bubbles: true, detail: { sectionId: this.sectionId, ...detail } }));
    }
  }

  if (!customElements.get('sp-exit-popup')) {
    customElements.define('sp-exit-popup', SpiderExitPopup);
  }
})();
