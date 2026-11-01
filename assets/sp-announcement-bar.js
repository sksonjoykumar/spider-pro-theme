(() => {
  'use strict';

  if (customElements.get('sp-announcement-bar')) return;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const parseLocalDateTime = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return null;

    const localMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (localMatch) {
      const [, year, month, day, hour, minute, second = '0'] = localMatch;
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        0
      );

      const valid = date.getFullYear() === Number(year)
        && date.getMonth() === Number(month) - 1
        && date.getDate() === Number(day)
        && date.getHours() === Number(hour)
        && date.getMinutes() === Number(minute)
        && date.getSeconds() === Number(second);

      return valid ? date : null;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
  };

  class SpiderAnnouncementBar extends HTMLElement {
    constructor() {
      super();
      this.connected = false;
      this.mode = 'static';
      this.items = [];
      this.currentItem = null;
      this.currentIndex = 0;
      this.autoplayTimer = 0;
      this.transitionTimer = 0;
      this.countdownTimer = 0;
      this.dismissTimer = 0;
      this.resizeFrame = 0;
      this.pauses = new Set();
      this.resizeObserver = null;
      this.userPaused = false;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.onPrevious = () => this.navigate(-1);
      this.onNext = () => this.navigate(1);
      this.onClose = () => this.dismiss();
      this.onMotionToggle = () => this.toggleMotion();
      this.onMouseEnter = () => this.pause('hover');
      this.onMouseLeave = () => this.resume('hover');
      this.onFocusIn = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-sp-announcement-motion-toggle]')) return;
        this.pause('focus');
      };
      this.onFocusOut = (event) => {
        const nextTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (!nextTarget || !this.contains(nextTarget) || nextTarget.closest('[data-sp-announcement-motion-toggle]')) {
          this.resume('focus');
        }
      };
      this.onVisibility = () => document.hidden ? this.pause('document-hidden') : this.resume('document-hidden');
      this.onMotionChange = () => this.syncMotionPreference();
      this.onResize = () => this.queueMeasurements();
      this.onSectionSelect = (event) => this.handleSectionSelect(event);
      this.onSectionDeselect = (event) => this.handleSectionDeselect(event);
      this.onBlockSelect = (event) => this.handleBlockSelect(event);
      this.onBlockDeselect = (event) => this.handleBlockDeselect(event);
    }

    connectedCallback() {
      if (this.connected) return;
      this.connected = true;
      this.pauses.clear();
      this.userPaused = false;

      this.mode = ['static', 'slider', 'marquee'].includes(this.dataset.mode) ? this.dataset.mode : 'static';
      this.autoplayEnabled = this.dataset.autoplay === 'true';
      this.autoplayInterval = Math.max(2000, toNumber(this.dataset.autoplayInterval, 5000));
      this.pauseOnHover = this.dataset.pauseHover === 'true';
      this.marqueePauseHover = this.dataset.marqueePauseHover === 'true';
      this.transitionDuration = Math.max(0, toNumber(this.dataset.transitionDuration, 300));
      this.dismissalMode = this.dataset.dismissal || 'session';
      this.dismissalVersion = this.dataset.dismissalVersion || '1';
      this.isDesignMode = this.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode);
      this.isSticky = this.dataset.sticky === 'true';
      this.sectionId = this.dataset.sectionId || 'global';
      this.sectionWrapper = this.closest('.sp-announcement-section') || this.closest('.shopify-section');

      this.items = Array.from(this.querySelectorAll('[data-sp-announcement-item][data-duplicate="false"]'));
      this.previousButton = this.querySelector('[data-sp-announcement-previous]');
      this.nextButton = this.querySelector('[data-sp-announcement-next]');
      this.closeButton = this.querySelector('[data-sp-announcement-close]');
      this.motionToggle = this.querySelector('[data-sp-announcement-motion-toggle]');
      this.controlsWrap = this.querySelector('[data-sp-announcement-controls]');
      this.motionPauseIcon = this.querySelector('[data-sp-announcement-pause-icon]');
      this.motionPlayIcon = this.querySelector('[data-sp-announcement-play-icon]');
      this.motionLabel = this.querySelector('[data-sp-announcement-motion-label]');
      this.marquee = this.querySelector('[data-sp-announcement-marquee]');

      if (this.isDismissed()) {
        this.hideImmediately();
        return;
      }

      this.previousButton?.addEventListener('click', this.onPrevious);
      this.nextButton?.addEventListener('click', this.onNext);
      this.closeButton?.addEventListener('click', this.onClose);
      this.motionToggle?.addEventListener('click', this.onMotionToggle);
      this.addEventListener('focusin', this.onFocusIn);
      this.addEventListener('focusout', this.onFocusOut);

      const pauseOnHoverForMode = this.mode === 'slider'
        ? this.pauseOnHover
        : this.mode === 'marquee' && this.marqueePauseHover;
      if (pauseOnHoverForMode) {
        this.addEventListener('mouseenter', this.onMouseEnter);
        this.addEventListener('mouseleave', this.onMouseLeave);
      }

      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('resize', this.onResize, { passive: true });
      this.reducedMotion.addEventListener?.('change', this.onMotionChange);

      if (this.isDesignMode) {
        document.addEventListener('shopify:section:select', this.onSectionSelect);
        document.addEventListener('shopify:section:deselect', this.onSectionDeselect);
        document.addEventListener('shopify:block:select', this.onBlockSelect);
        document.addEventListener('shopify:block:deselect', this.onBlockDeselect);
      }

      this.initResizeObserver();
      this.initCountdowns();
      this.syncMode();
      this.syncMotionPreference();
      this.syncMotionControl();
      if (document.hidden) this.pause('document-hidden');
      this.queueMeasurements();
      this.scheduleAutoplay();
    }

    disconnectedCallback() {
      if (!this.connected) return;
      this.connected = false;

      this.clearAutoplay();
      this.clearCountdowns();
      window.clearTimeout(this.transitionTimer);
      window.clearTimeout(this.dismissTimer);
      window.cancelAnimationFrame(this.resizeFrame);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;

      this.previousButton?.removeEventListener('click', this.onPrevious);
      this.nextButton?.removeEventListener('click', this.onNext);
      this.closeButton?.removeEventListener('click', this.onClose);
      this.motionToggle?.removeEventListener('click', this.onMotionToggle);
      this.removeEventListener('focusin', this.onFocusIn);
      this.removeEventListener('focusout', this.onFocusOut);
      this.removeEventListener('mouseenter', this.onMouseEnter);
      this.removeEventListener('mouseleave', this.onMouseLeave);
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('resize', this.onResize);
      this.reducedMotion.removeEventListener?.('change', this.onMotionChange);
      document.removeEventListener('shopify:section:select', this.onSectionSelect);
      document.removeEventListener('shopify:section:deselect', this.onSectionDeselect);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);

      this.syncSticky(false);
    }

    eligibleItems() {
      return this.items.filter((item) => item.dataset.enabled === 'true' && item.dataset.expired !== 'true');
    }

    syncMode() {
      if (this.mode === 'slider') {
        const eligible = this.eligibleItems();
        if (!eligible.length) {
          if (!this.isDesignMode) this.hideForNoItems();
          return;
        }
        const current = eligible.includes(this.currentItem) ? this.currentItem : eligible[0];
        this.showItem(current, { animate: false });
      } else if (this.mode === 'static') {
        const eligible = this.eligibleItems();
        if (!eligible.length) {
          if (!this.isDesignMode) this.hideForNoItems();
          return;
        }
        this.showItem(eligible[0], { animate: false });
      } else {
        this.items.forEach((item) => {
          const visible = item.dataset.enabled === 'true' && item.dataset.expired !== 'true';
          item.hidden = !visible;
          item.classList.toggle('is-active', visible);
          item.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });
        if (!this.eligibleItems().length && !this.isDesignMode) this.hideForNoItems();
      }
    }

    showItem(item, options = {}) {
      if (!item) return;
      const editorPreview = Boolean(options.editorPreview);
      const animate = options.animate !== false && !this.reducedMotion.matches;

      window.clearTimeout(this.transitionTimer);
      this.items.forEach((candidate) => {
        const active = candidate === item;
        candidate.hidden = !active;
        candidate.classList.toggle('is-active', active);
        candidate.classList.toggle('is-editor-preview', active && editorPreview);
        candidate.classList.remove('is-entering');
        candidate.setAttribute('aria-hidden', active ? 'false' : 'true');
        this.syncFocusable(candidate, active);
      });

      this.currentItem = item;
      const eligible = this.eligibleItems();
      const eligibleIndex = eligible.indexOf(item);
      this.currentIndex = eligibleIndex >= 0 ? eligibleIndex : 0;

      if (animate) {
        requestAnimationFrame(() => {
          if (!this.connected || this.currentItem !== item) return;
          item.classList.add('is-entering');
        });
        this.transitionTimer = window.setTimeout(() => item.classList.remove('is-entering'), this.transitionDuration + 60);
      }

      this.queueMeasurements();
    }

    syncFocusable(item, active) {
      item.querySelectorAll(FOCUSABLE).forEach((element) => {
        if (!active) {
          if (!element.hasAttribute('data-sp-original-tabindex')) {
            element.setAttribute('data-sp-original-tabindex', element.getAttribute('tabindex') ?? '');
          }
          element.setAttribute('tabindex', '-1');
          return;
        }

        if (element.hasAttribute('data-sp-original-tabindex')) {
          const original = element.getAttribute('data-sp-original-tabindex');
          if (original === '') element.removeAttribute('tabindex');
          else element.setAttribute('tabindex', original);
          element.removeAttribute('data-sp-original-tabindex');
        } else if (element.getAttribute('tabindex') === '-1') {
          element.removeAttribute('tabindex');
        }
      });
    }

    navigate(step) {
      if (this.mode !== 'slider') return;
      const eligible = this.eligibleItems();
      if (eligible.length < 2) return;

      const currentIndex = Math.max(0, eligible.indexOf(this.currentItem));
      const nextIndex = (currentIndex + step + eligible.length) % eligible.length;
      this.showItem(eligible[nextIndex], { animate: true });
      this.restartAutoplay();
    }

    toggleMotion() {
      if (this.userPaused) {
        this.userPaused = false;
        this.resume('user');
      } else {
        this.userPaused = true;
        this.pause('user');
      }
      this.syncMotionControl();
    }

    syncMotionControl() {
      if (!this.motionToggle) return;
      const explicitlyPaused = this.userPaused;
      const label = explicitlyPaused
        ? (this.motionToggle.dataset.resumeLabel || 'Resume announcements')
        : (this.motionToggle.dataset.pauseLabel || 'Pause announcements');
      this.motionToggle.setAttribute('aria-label', label);
      this.motionToggle.setAttribute('aria-pressed', String(explicitlyPaused));
      if (this.motionLabel) this.motionLabel.textContent = label;
      if (this.motionPauseIcon) this.motionPauseIcon.hidden = explicitlyPaused;
      if (this.motionPlayIcon) this.motionPlayIcon.hidden = !explicitlyPaused;
    }

    pause(reason) {
      this.pauses.add(reason);
      this.clearAutoplay();
      if (this.mode === 'marquee') this.classList.add('is-marquee-paused');
    }

    resume(reason) {
      this.pauses.delete(reason);
      if (!this.pauses.size && this.mode === 'marquee') this.classList.remove('is-marquee-paused');
      this.scheduleAutoplay();
    }

    clearAutoplay() {
      if (!this.autoplayTimer) return;
      window.clearTimeout(this.autoplayTimer);
      this.autoplayTimer = 0;
    }

    restartAutoplay() {
      this.clearAutoplay();
      this.scheduleAutoplay();
    }

    scheduleAutoplay() {
      this.clearAutoplay();
      if (this.mode !== 'slider' || !this.autoplayEnabled || this.pauses.size || this.reducedMotion.matches) return;
      if (this.eligibleItems().length < 2) return;

      this.autoplayTimer = window.setTimeout(() => {
        this.autoplayTimer = 0;
        this.navigate(1);
        this.scheduleAutoplay();
      }, this.autoplayInterval);
    }

    syncMotionPreference() {
      if (this.reducedMotion.matches) this.pause('reduced-motion');
      else this.resume('reduced-motion');
      this.syncMotionControl();
    }

    initCountdowns() {
      this.countdowns = Array.from(this.querySelectorAll('[data-sp-announcement-item][data-duplicate="false"] [data-sp-announcement-countdown]'))
        .filter((countdown) => countdown.closest('[data-sp-announcement-item]')?.dataset.enabled === 'true');
      if (!this.countdowns.length) return;

      let hasValidCountdown = false;
      this.countdowns.forEach((countdown) => {
        const end = parseLocalDateTime(countdown.dataset.end);
        if (!end) {
          countdown.hidden = true;
          countdown.dataset.invalid = 'true';
          return;
        }
        countdown.__spEnd = end.getTime();
        this.setCountdownVisibility(countdown, false);
        hasValidCountdown = true;
      });

      if (!hasValidCountdown) return;
      this.tickCountdowns();
      this.countdownTimer = window.setInterval(() => this.tickCountdowns(), 1000);
    }

    tickCountdowns() {
      if (!this.countdowns?.length) return;
      const now = Date.now();
      let activeCount = 0;
      let completedAny = false;

      this.countdowns.forEach((countdown) => {
        if (countdown.dataset.invalid === 'true' || countdown.dataset.complete === 'true') return;
        const end = countdown.__spEnd;
        if (!Number.isFinite(end)) return;

        const remaining = Math.max(0, end - now);
        if (remaining <= 0) {
          this.completeCountdown(countdown);
          completedAny = true;
          return;
        }

        activeCount += 1;
        const totalSeconds = Math.floor(remaining / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        this.setCountdownValue(countdown, '[data-sp-countdown-days]', days, 2);
        this.setCountdownValue(countdown, '[data-sp-countdown-hours]', hours, 2);
        this.setCountdownValue(countdown, '[data-sp-countdown-minutes]', minutes, 2);
        this.setCountdownValue(countdown, '[data-sp-countdown-seconds]', seconds, 2);
      });

      if (!activeCount && this.countdownTimer) this.clearCountdowns();
      if (completedAny) this.queueMeasurements();
    }

    countdownTargets(countdown) {
      const item = countdown?.closest('[data-sp-announcement-item]');
      const blockId = item?.dataset.blockId;
      if (!blockId) return countdown ? [countdown] : [];
      const selector = `[data-sp-announcement-item][data-block-id="${CSS.escape(blockId)}"] [data-sp-announcement-countdown]`;
      return Array.from(this.querySelectorAll(selector));
    }

    setCountdownVisibility(countdown, hidden) {
      this.countdownTargets(countdown).forEach((target) => { target.hidden = hidden; });
    }

    setCountdownValue(countdown, selector, value, width) {
      this.countdownTargets(countdown).forEach((target) => {
        const element = target.querySelector(selector);
        if (element) element.textContent = String(value).padStart(width, '0');
      });
    }

    completeCountdown(countdown) {
      countdown.dataset.complete = 'true';
      this.setCountdownValue(countdown, '[data-sp-countdown-days]', 0, 2);
      this.setCountdownValue(countdown, '[data-sp-countdown-hours]', 0, 2);
      this.setCountdownValue(countdown, '[data-sp-countdown-minutes]', 0, 2);
      this.setCountdownValue(countdown, '[data-sp-countdown-seconds]', 0, 2);

      if (countdown.dataset.hideComplete === 'true') this.setCountdownVisibility(countdown, true);
      if (countdown.dataset.hideAnnouncement === 'true') {
        const item = countdown.closest('[data-sp-announcement-item]');
        const blockId = item?.dataset.blockId;
        if (blockId) this.expireBlock(blockId);
      }
    }

    expireBlock(blockId) {
      this.querySelectorAll(`[data-sp-announcement-item][data-block-id="${CSS.escape(blockId)}"]`).forEach((item) => {
        item.dataset.expired = 'true';
        item.hidden = true;
        item.classList.remove('is-active', 'is-entering');
        item.setAttribute('aria-hidden', 'true');
        this.syncFocusable(item, false);
      });

      if (this.isDesignMode) return;
      const eligible = this.eligibleItems();
      if (!eligible.length) {
        this.hideForNoItems();
        return;
      }

      if (this.mode === 'slider' || this.mode === 'static') {
        this.showItem(eligible[0], { animate: false });
      }
      this.restartAutoplay();
    }

    clearCountdowns() {
      if (this.countdownTimer) {
        window.clearInterval(this.countdownTimer);
        this.countdownTimer = 0;
      }
    }

    dismissalKey() {
      return `sp_announcement_${this.sectionId}_v${this.dismissalVersion}`;
    }

    isDismissed() {
      if (this.isDesignMode || this.dismissalMode === 'none') return false;
      const key = this.dismissalKey();

      try {
        if (this.dismissalMode === 'session') return sessionStorage.getItem(key) === '1';
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const record = JSON.parse(raw);
        if (!record?.expires || Date.now() >= Number(record.expires)) {
          localStorage.removeItem(key);
          return false;
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    rememberDismissal() {
      if (this.isDesignMode || this.dismissalMode === 'none') return;
      const key = this.dismissalKey();

      try {
        if (this.dismissalMode === 'session') {
          sessionStorage.setItem(key, '1');
          return;
        }

        const daysByMode = {
          '1_day': 1,
          '7_days': 7,
          '30_days': 30
        };
        const days = daysByMode[this.dismissalMode];
        if (!days) return;
        localStorage.setItem(key, JSON.stringify({ expires: Date.now() + days * 86400000 }));
      } catch (_) {}
    }

    dismiss() {
      if (this.classList.contains('is-closing') || this.classList.contains('is-hidden')) return;
      this.rememberDismissal();
      this.clearAutoplay();
      this.clearCountdowns();
      this.syncSticky(false);

      if (this.reducedMotion.matches) {
        this.hideImmediately();
        return;
      }

      this.classList.add('is-closing');
      this.dismissTimer = window.setTimeout(() => this.hideImmediately(), 190);
    }

    hideImmediately() {
      this.classList.remove('is-closing');
      this.classList.add('is-hidden');
      this.setAttribute('aria-hidden', 'true');
      this.syncSticky(false);
      if (this.sectionWrapper) this.sectionWrapper.classList.add('is-hidden');
    }

    hideForNoItems() {
      this.clearAutoplay();
      this.clearCountdowns();
      this.hideImmediately();
    }

    initResizeObserver() {
      if (!('ResizeObserver' in window)) return;
      this.resizeObserver = new ResizeObserver(() => this.queueMeasurements());
      this.resizeObserver.observe(this);
      if (this.controlsWrap) this.resizeObserver.observe(this.controlsWrap);
    }

    queueMeasurements() {
      window.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = window.requestAnimationFrame(() => {
        this.measureCloseZone();
        this.syncSticky(this.isSticky && !this.classList.contains('is-hidden'));
      });
    }

    measureCloseZone() {
      if (!this.controlsWrap || this.controlsWrap.offsetParent === null) {
        this.style.setProperty('--sp-announcement-close-zone', '0px');
        return;
      }
      const width = Math.ceil(this.controlsWrap.getBoundingClientRect().width);
      this.style.setProperty('--sp-announcement-close-zone', `${Math.max(40, width)}px`);
    }

    syncSticky(active) {
      const shouldStick = Boolean(active && this.isSticky && !this.classList.contains('is-hidden'));
      this.sectionWrapper?.classList.toggle('sp-announcement-section--sticky', shouldStick);

      if (!shouldStick) {
        document.documentElement.style.setProperty('--sp-announcement-bar-height', '0px');
        document.documentElement.classList.remove('sp-announcement-sticky-active');
        return;
      }

      const visible = this.getClientRects().length > 0;
      const height = visible ? Math.ceil(this.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--sp-announcement-bar-height', `${height}px`);
      document.documentElement.classList.toggle('sp-announcement-sticky-active', height > 0);
    }

    eventBelongsToSection(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (target && (target === this || this.contains(target) || target.contains?.(this))) return true;
      return event.detail?.sectionId === this.sectionId;
    }

    resolveBlock(event) {
      const target = event.target instanceof Element ? event.target : null;
      const targetItem = target?.closest?.('[data-sp-announcement-item]');
      if (targetItem && this.contains(targetItem)) return targetItem;

      const blockId = event.detail?.blockId;
      if (!blockId) return null;
      return this.querySelector(`[data-sp-announcement-item][data-duplicate="false"][data-block-id="${CSS.escape(blockId)}"]`);
    }

    handleSectionSelect(event) {
      if (!this.eventBelongsToSection(event)) return;
      this.pause('editor');
    }

    handleSectionDeselect(event) {
      if (!this.eventBelongsToSection(event)) return;
      this.resume('editor');
    }

    handleBlockSelect(event) {
      const item = this.resolveBlock(event);
      if (!item) return;
      this.pause('editor');

      if (this.mode === 'marquee') {
        item.classList.add('is-editor-preview');
        item.hidden = false;
        item.setAttribute('aria-hidden', 'false');
        this.classList.add('is-editor-marquee');
        const wrapper = item.closest('[data-sp-announcement-marquee-item]') || item;
        requestAnimationFrame(() => wrapper.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' }));
        return;
      }

      this.showItem(item, { animate: false, editorPreview: true });
    }

    handleBlockDeselect(event) {
      const item = this.resolveBlock(event);
      item?.classList.remove('is-editor-preview');

      if (this.mode === 'marquee') {
        this.classList.remove('is-editor-marquee');
        this.syncMode();
      } else {
        this.syncMode();
      }
      this.resume('editor');
    }
  }

  customElements.define('sp-announcement-bar', SpiderAnnouncementBar);
})();
