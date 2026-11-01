(() => {
  const TAG = 'sp-age-verification';
  if (customElements.get(TAG)) return;

  class SpiderAgeVerification extends HTMLElement {
    constructor() {
      super();
      this.config = null;
      this.dialog = null;
      this.error = null;
      this.year = null;
      this.month = null;
      this.day = null;
      this.rememberInput = null;
      this.timer = null;
      this.state = 'checking';
      this.editorPreview = false;
      this.memoryVerified = false;
      this.abortController = null;
      this.previousFocus = null;
    }

    connectedCallback() {
      this.abortController = new AbortController();
      const configNode = this.querySelector('[data-sp-age-config]');
      this.dialog = this.querySelector('[data-sp-age-dialog]');
      this.error = this.querySelector('[data-sp-age-error]');
      this.year = this.querySelector('[data-sp-age-year]');
      this.month = this.querySelector('[data-sp-age-month]');
      this.day = this.querySelector('[data-sp-age-day]');
      this.rememberInput = this.querySelector('[data-sp-age-remember]');

      if (!configNode || !this.dialog) return;

      try {
        this.config = JSON.parse(configNode.textContent || '{}');
      } catch (error) {
        console.error('[Spider Age Verification] Invalid configuration.', error);
        return;
      }

      this.bindEvents();
      this.updateDayOptions();
      this.initialize();
    }

    disconnectedCallback() {
      this.clearTimer();
      this.abortController?.abort();
      this.abortController = null;
      if (this.dialog?.open) this.safeClose(false);
      this.releasePageLock();
    }

    bindEvents() {
      const signal = this.abortController.signal;
      this.querySelector('[data-sp-age-verify]')?.addEventListener('click', () => this.verify(), { signal });
      this.querySelector('[data-sp-age-exit]')?.addEventListener('click', () => this.handleUnderage(), { signal });
      this.querySelector('[data-sp-age-close]')?.addEventListener('click', () => this.dismiss(), { signal });
      this.year?.addEventListener('change', () => this.updateDayOptions(), { signal });
      this.month?.addEventListener('change', () => this.updateDayOptions(), { signal });

      this.dialog.addEventListener('cancel', (event) => {
        if (!this.isDismissible() || !this.config.allowEscape) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        this.dismiss();
      }, { signal });

      this.dialog.addEventListener('click', (event) => {
        if (!this.isDismissible() || !this.config.allowBackdropClose) return;
        const rect = this.dialog.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) this.dismiss();
      }, { signal });

      if (this.config.designMode) {
        document.addEventListener('shopify:section:select', (event) => {
          if (String(event.detail?.sectionId || '') === String(this.config.sectionId) && this.config.previewInEditor) {
            this.editorPreview = true;
            this.open(true);
          }
        }, { signal });

        document.addEventListener('shopify:section:deselect', (event) => {
          if (String(event.detail?.sectionId || '') === String(this.config.sectionId) && this.editorPreview) {
            this.editorPreview = false;
            this.safeClose(false);
          }
        }, { signal });
      }
    }

    initialize() {
      if (this.config.designMode) {
        this.state = 'editor_preview';
        return;
      }

      if (!this.config.enabled || !this.config.pageEligible) {
        this.state = 'dismissed';
        return;
      }

      if (this.hasValidVerification()) {
        this.state = 'verified';
        return;
      }

      this.state = 'locked';
      const delay = Math.max(0, Number(this.config.displayDelay) || 0) * 1000;
      if (delay > 0) {
        this.timer = window.setTimeout(() => this.open(false), delay);
      } else {
        this.open(false);
      }
    }

    open(editorPreview = false) {
      if (!this.dialog || this.dialog.open) return;
      if (!editorPreview && (this.state === 'verified' || this.state === 'dismissed')) return;
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.clearError();
      this.applyPageLock();
      try {
        this.dialog.showModal();
      } catch (_) {
        this.dialog.setAttribute('open', '');
      }
      this.state = editorPreview ? 'editor_preview' : 'locked';
      queueMicrotask(() => {
        const initial = this.config.method === 'dob' ? this.year : this.querySelector('[data-sp-age-verify]');
        initial?.focus({ preventScroll: true });
      });
      this.dispatchEvent(new CustomEvent('sp:age-verification:shown', { bubbles: true, detail: { sectionId: this.config.sectionId } }));
      document.dispatchEvent(new CustomEvent('sp:age-verification:lock', { detail: { sectionId: this.config.sectionId } }));
    }

    verify() {
      if (this.config.designMode) {
        this.safeClose(false);
        return;
      }

      if (this.config.method === 'dob') {
        const result = this.validateBirthDate();
        if (!result.valid) {
          this.showError(result.message);
          this.state = 'locked';
          this.dispatchEvent(new CustomEvent('sp:age-verification:failed', { bubbles: true, detail: { sectionId: this.config.sectionId, reason: result.reason } }));
          return;
        }
        if (!result.allowed) {
          this.handleUnderage();
          return;
        }
      }

      this.persistVerification();
      this.state = 'verified';
      this.safeClose(true);
      this.dispatchEvent(new CustomEvent('sp:age-verification:verified', { bubbles: true, detail: { sectionId: this.config.sectionId, minimumAge: this.config.minimumAge } }));
      document.dispatchEvent(new CustomEvent('sp:age-verification:unlock', { detail: { sectionId: this.config.sectionId } }));
    }

    validateBirthDate() {
      const year = Number(this.year?.value);
      const month = Number(this.month?.value);
      const day = Number(this.day?.value);

      if (!year || !month || !day) {
        return { valid: false, allowed: false, reason: 'incomplete', message: 'Please select your complete date of birth.' };
      }

      const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
      if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
        return { valid: false, allowed: false, reason: 'invalid_date', message: 'Please enter a valid date of birth.' };
      }

      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
      if (candidate > todayDate) {
        return { valid: false, allowed: false, reason: 'future_date', message: 'Please enter a valid date of birth.' };
      }

      let age = today.getFullYear() - year;
      const birthdayPassed = today.getMonth() > month - 1 || (today.getMonth() === month - 1 && today.getDate() >= day);
      if (!birthdayPassed) age -= 1;

      return { valid: true, allowed: age >= Number(this.config.minimumAge), age };
    }

    updateDayOptions() {
      if (!this.day) return;
      const selectedDay = Number(this.day.value) || 0;
      const year = Number(this.year?.value) || 2000;
      const month = Number(this.month?.value) || 0;
      const max = month ? new Date(year, month, 0, 12).getDate() : 31;

      while (this.day.options.length > 1) this.day.remove(1);
      for (let value = 1; value <= max; value += 1) {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = String(value);
        this.day.appendChild(option);
      }
      if (selectedDay && selectedDay <= max) this.day.value = String(selectedDay);
    }

    handleUnderage() {
      if (this.config.designMode) {
        this.showError(this.config.underageMessage || 'Under-age preview action.');
        return;
      }

      this.state = 'underage';
      this.dispatchEvent(new CustomEvent('sp:age-verification:underage', { bubbles: true, detail: { sectionId: this.config.sectionId } }));

      if (this.config.underageAction === 'redirect') {
        if (this.navigateSafely(this.config.underageRedirectUrl)) return;
      }

      if (this.config.underageAction === 'back') {
        // Avoid sending a blocked visitor to another page of the same gated site.
        if (document.referrer && window.history.length > 1) {
          try {
            const referrer = new URL(document.referrer);
            if (referrer.origin !== window.location.origin) {
              window.history.back();
              return;
            }
          } catch (_) { /* fall back to configured destination */ }
        }
        if (this.navigateSafely(this.config.underageRedirectUrl)) return;
      }

      this.showError(this.config.underageMessage || `Sorry, you must be at least ${this.config.minimumAge} years old to enter this site.`);
    }

    navigateSafely(rawUrl) {
      if (!rawUrl) return false;
      try {
        const target = new URL(rawUrl, window.location.origin);
        const current = new URL(window.location.href);
        if (target.href === current.href || target.pathname === current.pathname && target.search === current.search) {
          this.showError(this.config.underageMessage || 'You do not meet the minimum age requirement.');
          return true;
        }
        window.location.assign(target.href);
        return true;
      } catch (_) {
        this.showError(this.config.underageMessage || 'You do not meet the minimum age requirement.');
        return true;
      }
    }

    dismiss() {
      if (!this.isDismissible()) return;
      this.state = 'dismissed';
      this.safeClose(true);
      document.dispatchEvent(new CustomEvent('sp:age-verification:unlock', { detail: { sectionId: this.config.sectionId, dismissed: true } }));
    }

    isDismissible() {
      return this.config?.gateBehavior === 'dismissible' || this.config?.designMode;
    }

    storageKey() {
      return `sp:age-verification:v${this.config.gateVersion}:${this.config.sectionId}`;
    }

    storagePayload() {
      return JSON.stringify({
        verified: true,
        verifiedAt: Date.now(),
        version: Number(this.config.gateVersion),
        minimumAge: Number(this.config.minimumAge)
      });
    }

    rememberDays() {
      if (this.config.rememberMode === 'session') return 0;
      if (this.config.rememberMode === 'custom') return Math.min(365, Math.max(1, Number(this.config.customRememberDays) || 1));
      return Math.max(1, Number(this.config.rememberMode) || 1);
    }

    persistVerification() {
      if (this.config.designMode) return;
      const key = this.storageKey();
      const payload = this.storagePayload();
      this.memoryVerified = true;

      // An unchecked, visible Remember Choice control means THIS PAGE ONLY.
      // When the control is absent, retain the legacy configured persistence.
      if (this.config.rememberCheckbox && this.rememberInput && !this.rememberInput.checked) {
        try { localStorage.removeItem(key); } catch (_) { /* storage unavailable */ }
        try { sessionStorage.removeItem(key); } catch (_) { /* storage unavailable */ }
        return;
      }

      try {
        if (this.config.rememberMode === 'session') {
          sessionStorage.setItem(key, payload);
        } else {
          localStorage.setItem(key, payload);
        }
      } catch (_) {
        try { sessionStorage.setItem(key, payload); } catch (_) { /* in-memory fallback remains */ }
      }
    }

    hasValidVerification() {
      if (this.memoryVerified) return true;
      const key = this.storageKey();
      let raw = null;

      try {
        raw = this.config.rememberMode === 'session' ? sessionStorage.getItem(key) : localStorage.getItem(key);
        if (!raw && this.config.rememberMode !== 'session') raw = sessionStorage.getItem(key);
      } catch (_) {
        try { raw = sessionStorage.getItem(key); } catch (_) { raw = null; }
      }

      if (!raw) return false;

      try {
        const record = JSON.parse(raw);
        if (!record?.verified) return false;
        if (Number(record.version) !== Number(this.config.gateVersion)) return false;
        if (Number(record.minimumAge) !== Number(this.config.minimumAge)) return false;
        if (!Number.isFinite(Number(record.verifiedAt))) return false;
        if (this.config.rememberMode === 'session') return true;

        const days = this.rememberDays();
        const expiresAt = Number(record.verifiedAt) + days * 86400000;
        if (Date.now() <= expiresAt) return true;

        try { localStorage.removeItem(key); } catch (_) { /* noop */ }
        return false;
      } catch (_) {
        return false;
      }
    }

    applyPageLock() {
      document.documentElement.classList.add('sp-age-verification-active');
      document.body?.classList.add('sp-age-verification-active');
    }

    releasePageLock() {
      document.documentElement.classList.remove('sp-age-verification-active');
      document.body?.classList.remove('sp-age-verification-active');
    }

    safeClose(restoreFocus = true) {
      this.clearTimer();
      if (this.dialog?.open) {
        try { this.dialog.close(); } catch (_) { this.dialog.removeAttribute('open'); }
      } else {
        this.dialog?.removeAttribute('open');
      }
      this.releasePageLock();
      if (restoreFocus && this.previousFocus?.isConnected) {
        queueMicrotask(() => this.previousFocus.focus({ preventScroll: true }));
      }
    }

    showError(message) {
      if (!this.error) return;
      this.error.textContent = message || 'Please try again.';
      this.error.hidden = false;
    }

    clearError() {
      if (!this.error) return;
      this.error.textContent = '';
      this.error.hidden = true;
    }

    clearTimer() {
      if (this.timer) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
    }
  }

  customElements.define(TAG, SpiderAgeVerification);
})();
