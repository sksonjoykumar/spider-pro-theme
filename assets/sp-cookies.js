(() => {
  'use strict';

  const ROOT = document.documentElement;
  const PRIVACY_FEATURE = [{ name: 'consent-tracking-api', version: '0.2' }];
  const NATIVE_BANNER_SELECTORS = [
    '#shopify-pc__banner',
    '.shopify-pc__banner__dialog',
    '[data-shopify-privacy-banner]'
  ];

  const shared = window.SpiderCookiesPrivacy || (window.SpiderCookiesPrivacy = {
    apiPromise: null,
    instances: new Set()
  });

  function isDesignMode() {
    return Boolean(window.Shopify && window.Shopify.designMode);
  }

  function loadPrivacyApi() {
    if (window.Shopify && window.Shopify.customerPrivacy) {
      return Promise.resolve(window.Shopify.customerPrivacy);
    }

    if (shared.apiPromise) return shared.apiPromise;

    shared.apiPromise = new Promise((resolve, reject) => {
      if (!window.Shopify || typeof window.Shopify.loadFeatures !== 'function') {
        shared.apiPromise = null;
        reject(new Error('Shopify Customer Privacy loader is unavailable.'));
        return;
      }

      try {
        window.Shopify.loadFeatures(PRIVACY_FEATURE, (error) => {
          if (error) {
            shared.apiPromise = null;
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          if (!window.Shopify.customerPrivacy) {
            shared.apiPromise = null;
            reject(new Error('Shopify Customer Privacy API did not initialize.'));
            return;
          }
          resolve(window.Shopify.customerPrivacy);
        });
      } catch (error) {
        shared.apiPromise = null;
        reject(error);
      }
    });

    return shared.apiPromise;
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function visibleElement(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  class SpiderCookiesBanner extends HTMLElement {
    connectedCallback() {
      if (this._connected) return;
      this._connected = true;
      shared.instances.add(this);

      this.panel = this.querySelector('[data-sp-cookies-panel]');
      if (!this.panel) return;

      this.sectionId = this.dataset.sectionId || this.id || 'cookies';
      this.mode = this.dataset.displayMode || 'shopify_region';
      this.showUntilDecision = this.dataset.showUntilDecision !== 'false';
      this.noticeDays = Math.max(1, Number.parseInt(this.dataset.noticeDays || '60', 10) || 60);
      this.enablePreferences = this.dataset.enablePreferences === 'true';
      this.showCloseButton = this.dataset.showCloseButton === 'true';
      this.draft = null;
      this.draftModified = false;
      this.modalLockHeld = false;
      this.hasOverlay = Boolean(this.querySelector('[data-sp-cookies-overlay]'));
      this.bannerPreviousFocus = null;
      this.previewInEditor = this.dataset.previewInEditor !== 'false';
      this.avoidToolbar = this.dataset.avoidMobileToolbar !== 'false';
      this.useSafeArea = this.dataset.safeArea !== 'false';
      this.animationDuration = Math.max(0, Number.parseInt(this.dataset.animationDuration || '260', 10) || 260);
      this.state = 'idle';
      this.api = null;
      this.lastFocus = null;
      this.noticeMemory = false;
      this.abortController = new AbortController();
      this.signal = this.abortController.signal;
      this.resizeObserver = null;
      this.nativeBannerObserver = null;
      this.hideTimer = 0;

      this.acceptButton = this.querySelector('[data-sp-cookies-accept]');
      this.declineButton = this.querySelector('[data-sp-cookies-decline]');
      this.manageButton = this.querySelector('[data-sp-cookies-manage]');
      this.noticeClose = this.querySelector('[data-sp-cookies-notice-close]');
      this.status = this.querySelector('[data-sp-cookies-status]');
      this.preferencesDialog = this.querySelector('[data-sp-cookies-preferences-dialog]');
      this.preferencesForm = this.querySelector('[data-sp-cookies-preferences-form]');
      this.preferenceStatus = this.querySelector('[data-sp-cookies-preferences-status]');
      this.unsavedHint = this.querySelector('[data-sp-cookies-unsaved]');

      if (!this.useSafeArea) this.style.setProperty('--sp-cookie-safe-area', '0px');

      this.addEventListener('click', this.onClick.bind(this), { signal: this.signal });
      this.addEventListener('change', this.onChange.bind(this), { signal: this.signal });
      document.addEventListener('keydown', this.onBannerKeydown.bind(this), { signal: this.signal });
      this.preferencesForm?.addEventListener('submit', this.onPreferencesSubmit.bind(this), { signal: this.signal });
      this.preferencesDialog?.addEventListener('cancel', this.onPreferencesCancel.bind(this), { signal: this.signal });
      this.preferencesDialog?.addEventListener('click', this.onPreferencesBackdrop.bind(this), { signal: this.signal });
      this.preferencesDialog?.addEventListener('keydown', this.onPreferencesKeydown.bind(this), { signal: this.signal });
      document.addEventListener('visitorConsentCollected', this.onConsentChanged.bind(this), { signal: this.signal });
      document.addEventListener('spider:cookies:open-preferences', () => this.openPreferences(document.activeElement), { signal: this.signal });
      document.addEventListener('shopify:section:select', this.onSectionSelect.bind(this), { signal: this.signal });
      document.addEventListener('shopify:section:deselect', this.onSectionDeselect.bind(this), { signal: this.signal });
      window.addEventListener('resize', this.onResize.bind(this), { signal: this.signal, passive: true });

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => this.updateOffsets());
        this.resizeObserver.observe(this.panel);
      }

      if (isDesignMode() && this.previewInEditor) {
        this.show({ preview: true });
      } else {
        this.initialize();
      }
    }

    disconnectedCallback() {
      this._connected = false;
      shared.instances.delete(this);
      this.abortController?.abort();
      this.resizeObserver?.disconnect();
      this.nativeBannerObserver?.disconnect();
      window.clearTimeout(this.hideTimer);
      this.releaseOffsets();
      this.releasePreferencesLock();
      ROOT.classList.remove('sp-cookies-overlay-open');
      if (this.bannerPreviousFocus?.isConnected && !isDesignMode()) { try { this.bannerPreviousFocus.focus({ preventScroll: true }); } catch (_) {} }
      if (this.preferencesDialog?.open) this.preferencesDialog.close();
    }

    async initialize() {
      if (this.mode === 'notice_only') {
        if (!this.noticeDismissed()) this.show();
        return;
      }

      this.setState('loading');
      try {
        this.api = await loadPrivacyApi();
        if (!this.isConnected || isDesignMode()) return;
        if (this.nativeShopifyBannerVisible()) {
          this.setState('blocked');
          this.updateCloseVisibility();
          return;
        }

        const shouldShow = this.shouldDisplayFromShopify();
        if (shouldShow) this.show();
        else this.hide({ immediate: true, resolved: true });
      } catch (error) {
        if (!this.isConnected) return;
        this.setState('error');
        this.announce(this.errorText());
        this.show({ error: true });
      }
    }

    shouldDisplayFromShopify() {
      if (!this.api) return false;
      try {
        const consent = this.api.currentVisitorConsent?.() || {};
        const undecided = ['preferences', 'analytics', 'marketing']
          .some((key) => consent[key] === '' || consent[key] == null);

        if (this.mode === 'shopify_region') {
          const regionRequiresBanner = Boolean(this.api.shouldShowBanner?.());
          return regionRequiresBanner || (this.showUntilDecision && undecided);
        }

        return undecided;
      } catch (_) {
        return false;
      }
    }

    nativeShopifyBannerVisible() {
      return NATIVE_BANNER_SELECTORS.some((selector) => {
        const node = document.querySelector(selector);
        return node && !this.contains(node) && visibleElement(node);
      });
    }

    observeNativeBanner() {
      if (this.mode === 'notice_only' || this.nativeBannerObserver || !('MutationObserver' in window)) return;
      this.nativeBannerObserver = new MutationObserver(() => {
        if (this.state === 'open' && this.nativeShopifyBannerVisible()) {
          this.hide({ immediate: true });
          this.setState('blocked');
        }
      });
      this.nativeBannerObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    noticeKey() {
      return `sp:cookies:notice:${this.sectionId}`;
    }

    noticeDismissed() {
      if (this.noticeMemory) return true;
      const raw = safeLocalStorageGet(this.noticeKey());
      if (!raw) return false;
      const expires = Number.parseInt(raw, 10);
      return Number.isFinite(expires) && expires > Date.now();
    }

    saveNoticeDismissal() {
      if (isDesignMode()) return;
      const expires = Date.now() + (this.noticeDays * 86400000);
      if (!safeLocalStorageSet(this.noticeKey(), String(expires))) {
        this.noticeMemory = true;
      }
    }

    onClick(event) {
      const accept = event.target.closest('[data-sp-cookies-accept]');
      const decline = event.target.closest('[data-sp-cookies-decline]');
      const manage = event.target.closest('[data-sp-cookies-manage]');
      const close = event.target.closest('[data-sp-cookies-notice-close]');
      const prefClose = event.target.closest('[data-sp-cookies-preferences-close]');

      if (accept) {
        event.preventDefault();
        this.handleDecision('accept');
      } else if (decline) {
        event.preventDefault();
        this.handleDecision('decline');
      } else if (manage) {
        event.preventDefault();
        this.openPreferences(manage);
      } else if (close) {
        event.preventDefault();
        if (this.mayDismissWithoutConsent()) {
          if (this.mode === 'notice_only') this.saveNoticeDismissal();
          this.hide({ resolved: this.mode === 'notice_only' });
        }
      } else if (prefClose) {
        event.preventDefault();
        this.closePreferences();
      }
    }

    onChange(event) {
      const input = event.target.closest('[data-sp-cookies-card]');
      if (!input || this.mode === 'notice_only') return;
      if (!this.draft) this.draft = this.getCurrentSelections();
      this.draft[input.dataset.spCookiesCard] = Boolean(input.checked);
      this.draftModified = true;
      if (this.unsavedHint) this.unsavedHint.hidden = false;
      // Draft selections remain unsaved until visitor selects Customize then Save.
    }

    getCurrentSelections() {
      let consent = {};
      try { consent = (!isDesignMode() && this.api?.currentVisitorConsent?.()) || {}; } catch (_) {}
      return {
        preferences: consent.preferences === 'yes',
        analytics: consent.analytics === 'yes',
        marketing: consent.marketing === 'yes'
      };
    }

    syncBannerCards(force = false) {
      if (!this.draft || force) this.draft = this.getCurrentSelections();
      this.querySelectorAll('[data-sp-cookies-card]').forEach((input) => {
        input.checked = Boolean(this.draft[input.dataset.spCookiesCard]);
      });
      if (this.unsavedHint) this.unsavedHint.hidden = !this.draftModified;
    }

    mayDismissWithoutConsent() {
      if (isDesignMode()) return true;
      if (this.mode === 'notice_only') return true;
      if (!this.showCloseButton || this.mode !== 'shopify_region' || !this.api) return false;
      try { return !Boolean(this.api.shouldShowBanner?.()); } catch (_) { return false; }
    }

    updateCloseVisibility() {
      if (this.noticeClose) this.noticeClose.hidden = !this.mayDismissWithoutConsent();
    }

    onBannerKeydown(event) {
      if (!['open', 'error', 'saving'].includes(this.state) || this.preferencesDialog?.open) return;
      if (event.key === 'Escape' && this.mayDismissWithoutConsent()) {
        event.preventDefault();
        if (this.mode === 'notice_only') this.saveNoticeDismissal();
        this.hide({ resolved: this.mode === 'notice_only' });
        return;
      }
      if (event.key !== 'Tab' || !this.hasOverlay || !this.panel || !visibleElement(this.panel)) return;
      const focusables = this.focusables(this.panel);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !this.panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !this.panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }

    async handleDecision(kind) {
      if (this.state === 'saving') return;

      if (isDesignMode()) {
        this.announce('Theme Editor preview only — visitor consent was not changed.');
        this.dispatch('spider:cookies:preview-action', { action: kind });
        this.hide({ resolved: false });
        return;
      }

      if (this.mode === 'notice_only') {
        this.saveNoticeDismissal();
        this.dispatch('spider:cookies:notice-action', { action: kind });
        this.hide({ resolved: true });
        return;
      }

      if (!this.api) {
        try {
          this.api = await loadPrivacyApi();
        } catch (_) {
          this.setState('error');
          this.announce(this.errorText());
          return;
        }
      }

      const payload = kind === 'accept'
        ? { preferences: true, analytics: true, marketing: true }
        : { preferences: false, analytics: false, marketing: false };

      await this.submitConsent(payload, kind);
    }

    async submitConsent(payload, source) {
      this.setBusy(true);
      this.setState('saving');
      try {
        await this.setTrackingConsent(payload);
        this.draftModified = false;
        this.draft = this.getCurrentSelections();
        this.syncBannerCards();
        this.dispatch('spider:cookies:consent', { source, payload });
        this.announce(source === 'decline' ? 'Privacy preference saved.' : 'Cookie preferences saved.');
        this.hide({ resolved: true });
      } catch (_) {
        this.setState('error');
        this.announce(this.errorText());
      } finally {
        this.setBusy(false);
      }
    }

    setTrackingConsent(payload) {
      return new Promise((resolve, reject) => {
        if (!this.api || typeof this.api.setTrackingConsent !== 'function') {
          reject(new Error('Customer Privacy API unavailable.'));
          return;
        }

        let settled = false;
        let verifyTimer = 0;
        let timeout = 0;

        const cleanup = () => {
          window.clearTimeout(verifyTimer);
          window.clearTimeout(timeout);
          document.removeEventListener('visitorConsentCollected', onCollected);
        };

        const finish = (result = {}) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };

        const fail = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        const consentMatches = () => {
          try {
            const current = this.api.currentVisitorConsent?.() || {};
            return Object.entries(payload).every(([key, value]) => {
              if (!['preferences', 'analytics', 'marketing', 'sale_of_data'].includes(key)) return true;
              return current[key] === (value ? 'yes' : 'no');
            });
          } catch (_) {
            return false;
          }
        };

        const onCollected = () => {
          if (consentMatches()) finish({});
        };

        document.addEventListener('visitorConsentCollected', onCollected);

        // Some storefronts publish the consent event before/without the callback.
        // Verify once after the API has had time to persist the choice.
        verifyTimer = window.setTimeout(() => {
          if (!settled && consentMatches()) finish({});
        }, 1200);

        timeout = window.setTimeout(() => {
          if (consentMatches()) finish({});
          else fail(new Error('Customer Privacy API timed out.'));
        }, 6000);

        try {
          this.api.setTrackingConsent(payload, (result) => {
            if (result && result.error) {
              fail(new Error(Array.isArray(result.error) ? result.error.join(', ') : String(result.error)));
              return;
            }
            finish(result || {});
          });
        } catch (error) {
          fail(error);
        }
      });
    }

    async openPreferences(trigger) {
      if (!this.preferencesDialog || !this.enablePreferences) return;
      if (this.mode === 'notice_only') return;

      if (!this.api && !isDesignMode()) {
        try {
          this.api = await loadPrivacyApi();
        } catch (_) {
          this.announce(this.errorText());
          return;
        }
      }

      this.lastFocus = trigger || document.activeElement;
      this.syncPreferenceControls();
      this.acquirePreferencesLock();
      if (typeof this.preferencesDialog.showModal === 'function') this.preferencesDialog.showModal();
      else this.preferencesDialog.setAttribute('open', '');
      requestAnimationFrame(() => this.firstFocusable(this.preferencesDialog)?.focus());
    }

    closePreferences() {
      if (!this.preferencesDialog) return;
      if (this.preferencesDialog.open && typeof this.preferencesDialog.close === 'function') this.preferencesDialog.close();
      else this.preferencesDialog.removeAttribute('open');
      this.releasePreferencesLock();
      if (this.lastFocus && this.lastFocus.isConnected) this.lastFocus.focus({ preventScroll: true });
    }

    syncPreferenceControls() {
      const consent = (!isDesignMode() && this.api?.currentVisitorConsent?.()) || {};
      const selection = this.draftModified && this.draft ? this.draft : this.getCurrentSelections();
      this.preferencesDialog?.querySelectorAll('[data-sp-consent]').forEach((input) => {
        input.checked = Boolean(selection[input.dataset.spConsent]);
      });
      if (this.preferenceStatus) this.preferenceStatus.textContent = '';

      const saleRow = this.preferencesDialog?.querySelector('[data-sp-data-sale-row]');
      const saleInput = this.preferencesDialog?.querySelector('[data-sp-consent-sale-opt-out]');
      if (saleRow && saleInput) {
        let eligible = false;
        try {
          eligible = Boolean(this.api?.saleOfDataRegion?.());
        } catch (_) {
          eligible = false;
        }
        saleRow.hidden = !eligible;
        if (eligible) {
          saleInput.checked = consent.sale_of_data === 'no';
          saleInput.dataset.initiallyOptedOut = String(Boolean(saleInput.checked));
        }
      }
    }

    async onPreferencesSubmit(event) {
      event.preventDefault();
      if (isDesignMode()) {
        this.announce('Theme Editor preview only — visitor consent was not changed.');
        this.closePreferences();
        return;
      }
      if (!this.api) return;

      const payload = {};
      this.preferencesDialog.querySelectorAll('[data-sp-consent]').forEach((input) => {
        payload[input.dataset.spConsent] = Boolean(input.checked);
      });

      const saleRow = this.preferencesDialog.querySelector('[data-sp-data-sale-row]');
      const saleInput = this.preferencesDialog.querySelector('[data-sp-consent-sale-opt-out]');
      // Shopify data sale / sharing is a separate, user-initiated choice.
      // Do not send any sale-of-data value unless this checkbox was changed.
      if (saleInput && saleRow && !saleRow.hidden && saleInput.checked !== (saleInput.dataset.initiallyOptedOut === 'true')) {
        payload.sale_of_data = !saleInput.checked;
      }

      this.setBusy(true);
      try {
        await this.setTrackingConsent(payload);
        this.draftModified = false;
        this.draft = this.getCurrentSelections();
        this.syncBannerCards();
        this.dispatch('spider:cookies:preferences-saved', { payload });
        this.announce('Privacy preferences saved.');
        this.closePreferences();
        this.hide({ resolved: true });
      } catch (_) {
        this.setState('error');
        this.announce(this.errorText());
        if (this.preferenceStatus) this.preferenceStatus.textContent = this.errorText();
      } finally {
        this.setBusy(false);
      }
    }

    onPreferencesCancel(event) {
      event.preventDefault();
      this.closePreferences();
    }

    onPreferencesBackdrop(event) {
      if (event.target === this.preferencesDialog) this.closePreferences();
    }

    onPreferencesKeydown(event) {
      if (event.key !== 'Tab') return;
      const focusables = this.focusables(this.preferencesDialog);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    focusables(scope) {
      return [...scope.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.hidden && visibleElement(node));
    }

    firstFocusable(scope) {
      return this.focusables(scope)[0] || null;
    }

    acquirePreferencesLock() {
      if (this.modalLockHeld) return;
      this.modalLockHeld = true;
      const current = Number.parseInt(ROOT.dataset.spCookiesLockCount || '0', 10) || 0;
      ROOT.dataset.spCookiesLockCount = String(current + 1);
      ROOT.classList.add('sp-cookies-preferences-open');
    }

    releasePreferencesLock() {
      if (!this.modalLockHeld) return;
      this.modalLockHeld = false;
      const current = Number.parseInt(ROOT.dataset.spCookiesLockCount || '0', 10) || 0;
      if (current <= 1) {
        delete ROOT.dataset.spCookiesLockCount;
        ROOT.classList.remove('sp-cookies-preferences-open');
      } else {
        ROOT.dataset.spCookiesLockCount = String(current - 1);
      }
    }

    onConsentChanged() {
      if (isDesignMode() || this.mode === 'notice_only' || !this.api || this.state === 'saving') return;
      try {
        if (!this.shouldDisplayFromShopify()) this.hide({ resolved: true });
        this.updateCloseVisibility();
        if (!this.draftModified) this.syncBannerCards(true);
      } catch (_) {}
    }

    onSectionSelect(event) {
      if (!isDesignMode() || !this.previewInEditor) return;
      const section = event.target?.closest?.('.shopify-section') || event.target;
      if (section && section.contains(this)) this.show({ preview: true });
    }

    onSectionDeselect(event) {
      if (!isDesignMode() || !this.previewInEditor) return;
      const section = event.target?.closest?.('.shopify-section') || event.target;
      if (section && section.contains(this)) this.hide({ immediate: true });
    }

    onResize() {
      if (this._resizeRAF) return;
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = 0;
        this.updateOffsets();
      });
    }

    show(options = {}) {
      if (!this.panel || this.state === 'open') return;
      if (!options.preview && !isDesignMode() && this.nativeShopifyBannerVisible()) {
        this.setState('blocked');
        return;
      }

      this.setState(options.error ? 'error' : 'open');
      this.bannerPreviousFocus = document.activeElement;
      this.draftModified = false;
      this.syncBannerCards(true);
      this.updateCloseVisibility();
      this.panel.dataset.state = options.error ? 'error' : 'visible';
      this.dataset.state = options.error ? 'error' : 'open';
      if (this.hasOverlay && !isDesignMode()) window.requestAnimationFrame(() => {
        if (this.isConnected && this.state === 'open' && !this.preferencesDialog?.open) this.firstFocusable(this.panel)?.focus({ preventScroll: true });
      });
      ROOT.classList.add('sp-cookies-visible');
      if (this.hasOverlay && !isDesignMode()) ROOT.classList.add('sp-cookies-overlay-open');
      if (this.mode !== 'notice_only') ROOT.classList.add('sp-privacy-consent-pending');
      this.updateOffsets();
      this.observeNativeBanner();
      this.dispatch('spider:cookies:shown', { mode: this.mode, preview: Boolean(options.preview) });
      if (this.mode !== 'notice_only') this.dispatch('spider:privacy:pending', { source: 'cookies' });
    }

    hide(options = {}) {
      if (!this.panel) return;
      window.clearTimeout(this.hideTimer);
      const finalize = () => {
        this.panel.dataset.state = 'hidden';
        this.setState(options.resolved ? 'resolved' : 'closed');
        this.dataset.state = 'hidden';
        if (!isDesignMode() && this.bannerPreviousFocus?.isConnected && this.panel.contains(document.activeElement)) {
          try { this.bannerPreviousFocus.focus({ preventScroll: true }); } catch (_) {}
        }
        this.releaseOffsets();
        this.nativeBannerObserver?.disconnect();
        this.nativeBannerObserver = null;
        this.dispatch('spider:cookies:hidden', { mode: this.mode, resolved: Boolean(options.resolved) });
        if (options.resolved && this.mode !== 'notice_only') this.dispatch('spider:privacy:resolved', { source: 'cookies' });
      };

      if (options.immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finalize();
      } else {
        this.panel.dataset.state = 'hidden';
        this.hideTimer = window.setTimeout(finalize, this.animationDuration + 30);
      }
    }

    updateOffsets() {
      if (!this.panel || !['open', 'saving', 'error'].includes(this.state)) return;
      let toolbarOffset = 0;
      if (this.avoidToolbar) {
        const raw = getComputedStyle(ROOT).getPropertyValue('--sp-mobile-toolbar-offset');
        toolbarOffset = Math.max(0, Number.parseFloat(raw) || 0);
      }

      this.classList.toggle('has-mobile-toolbar', toolbarOffset > 0);
      this.style.setProperty('--sp-cookie-toolbar-offset', `${toolbarOffset}px`);
      if (!this.useSafeArea) this.style.setProperty('--sp-cookie-safe-area', '0px');

      const height = Math.ceil(this.panel.getBoundingClientRect().height);
      const bottom = Math.max(0, Number.parseFloat(window.getComputedStyle(this.panel).bottom) || 0);
      const clearance = Math.max(0, height + bottom - toolbarOffset);
      ROOT.style.setProperty('--sp-cookie-banner-height', `${clearance}px`);
      ROOT.style.setProperty('--sp-cookie-banner-offset', `${Math.max(0, clearance + toolbarOffset)}px`);
      ROOT.dataset.spCookieBannerOwner = this.sectionId;
    }

    releaseOffsets() {
      if (ROOT.dataset.spCookieBannerOwner && ROOT.dataset.spCookieBannerOwner !== this.sectionId) return;
      ROOT.style.setProperty('--sp-cookie-banner-height', '0px');
      ROOT.style.setProperty('--sp-cookie-banner-offset', '0px');
      ROOT.classList.remove('sp-cookies-visible', 'sp-privacy-consent-pending', 'sp-cookies-overlay-open');
      delete ROOT.dataset.spCookieBannerOwner;
    }

    setBusy(busy) {
      this.panel?.setAttribute('aria-busy', busy ? 'true' : 'false');
      [this.acceptButton, this.declineButton, ...this.querySelectorAll('[data-sp-cookies-manage]'), this.noticeClose].forEach((button) => {
        if (button) button.disabled = busy;
      });
      this.querySelectorAll('[data-sp-cookies-card]').forEach((input) => { input.disabled = busy; });
      this.preferencesDialog?.querySelectorAll('button, input').forEach((control) => {
        if (!control.matches('.sp-cookies__switch--locked input')) control.disabled = busy;
      });
    }

    setState(state) {
      this.state = state;
      this.dataset.state = state;
      if (this.panel && state !== 'open') {
        if (state === 'saving') this.panel.dataset.state = 'saving';
        if (state === 'error') this.panel.dataset.state = 'error';
      }
    }

    errorText() {
      return this.querySelector('[data-sp-cookies-status]')?.dataset.errorMessage || "We couldn't save your privacy preference. Please try again.";
    }

    announce(message) {
      if (this.status) this.status.textContent = message;
      const globalRegion = document.getElementById('SpiderLiveRegion');
      if (globalRegion) globalRegion.textContent = message;
    }

    dispatch(name, detail = {}) {
      document.dispatchEvent(new CustomEvent(name, { detail: { sectionId: this.sectionId, ...detail } }));
    }
  }

  if (!customElements.get('sp-cookies-banner')) {
    customElements.define('sp-cookies-banner', SpiderCookiesBanner);
  }
})();
