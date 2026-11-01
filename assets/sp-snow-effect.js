(() => {
  'use strict';

  const TAG = 'sp-snow-effect';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const bool = (value, fallback = false) => typeof value === 'boolean' ? value : fallback;
  const isValidDay = (month, day, year = 2000) => Number.isInteger(month) && Number.isInteger(day)
    && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  const parseTime = (value, fallback) => {
    const found = /^(\d{2}):(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
    if (!found) return fallback;
    const h = +found[1], m = +found[2];
    return h < 24 && m < 60 ? h * 60 + m : null;
  };
  const parseDate = value => {
    const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!matched) return null;
    const year = +matched[1], month = +matched[2], day = +matched[3];
    return year >= 1970 && year <= 9999 && isValidDay(month, day, year)
      ? year * 10000 + month * 100 + day : null;
  };
  const parsePathExclusions = value => String(value || '').split(/[\r\n,]+/)
    .map(path => path.trim()).filter(path => path.startsWith('/') && path.length > 1).slice(0, 30);

  class SpiderSnowEffect extends HTMLElement {
    constructor() {
      super();
      this.canvas = null;
      this.ctx = null;
      this.overlay = null;
      this.config = null;
      this.particles = [];
      this.rafId = 0;
      this.resizeTimer = 0;
      this.connectRetry = 0;
      this.scheduleTimer = 0;
      this.overlayTimer = 0;
      this.quality = 1;
      this.averageFrame = 0;
      this.measuredFrames = 0;
      this.lastDrawTime = 0;
      this.pausedForOverlay = false;
      this.dismissButton = null;
      this.dismissed = false;
      this.storeTZWarning = false;
      this.boundPageShow = this.onPageShow.bind(this);
      this.boundFocus = this.onPageShow.bind(this);
      this.boundDialogToggle = this.onDialogToggle.bind(this);
      this.boundDismiss = this.onDismiss.bind(this);
      this.lastFrame = 0;
      this.frameInterval = 1000 / 45;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.running = false;
      this.staticMode = false;
      this.editorSelected = false;
      this.loaderPaused = false;
      this.motionQuery = null;
      this.boundResize = this.onResize.bind(this);
      this.boundVisibility = this.onVisibilityChange.bind(this);
      this.boundMotion = this.onMotionChange.bind(this);
      this.boundSectionSelect = this.onSectionSelect.bind(this);
      this.boundSectionDeselect = this.onSectionDeselect.bind(this);
      this.boundTransitionStart = this.onPageTransitionStart.bind(this);
      this.boundTransitionEnd = this.onPageTransitionEnd.bind(this);
      this.tick = this.tick.bind(this);
    }

    connectedCallback() {
      if (this.dataset.spSnowConnected === 'true') return;
      const configNode = this.querySelector('[data-sp-snow-config]');
      this.canvas = this.querySelector('[data-sp-snow-canvas]');
      this.overlay = this.querySelector('[data-sp-snow-overlay]');
      this.dismissButton = this.querySelector('[data-sp-snow-dismiss]');
      if (!configNode || !this.canvas) {
        if (!this.connectRetry && this.isConnected) {
          this.connectRetry = requestAnimationFrame(() => {
            this.connectRetry = 0;
            this.connectedCallback();
          });
        }
        return;
      }

      try {
        this.config = JSON.parse(configNode.textContent || '{}');
      } catch (error) {
        console.warn('[Spider Snow Effect] Invalid configuration.', error);
        return;
      }

      this.ctx = this.canvas.getContext('2d', { alpha: true });
      if (!this.ctx) return;

      this.dataset.spSnowConnected = 'true';
      this.dismissed = this.readDismissal();
      this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
      this.applyOverlay();
      this.addListeners();
      this.evaluate();
      if (bool(this.config.scheduleEnabled, false)) {
        this.scheduleTimer = window.setInterval(() => this.evaluate(), 30000);
      }
      if (bool(this.config.pauseOnOverlays, true)) {
        this.overlayTimer = window.setInterval(() => this.checkOverlay(), 1800);
      }
    }

    disconnectedCallback() {
      this.removeListeners();
      this.stop();
      if (this.scheduleTimer) window.clearInterval(this.scheduleTimer);
      if (this.overlayTimer) window.clearInterval(this.overlayTimer);
      this.scheduleTimer = 0;
      this.overlayTimer = 0;
      if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
      if (this.connectRetry) cancelAnimationFrame(this.connectRetry);
      this.resizeTimer = 0;
      this.connectRetry = 0;
      this.particles.length = 0;
      this.canvas = null;
      this.ctx = null;
      this.overlay = null;
      this.dismissButton = null;
      this.averageFrame = 0;
      this.measuredFrames = 0;
      this.quality = 1;
      this.removeAttribute('data-sp-snow-connected');
    }

    addListeners() {
      window.addEventListener('resize', this.boundResize, { passive: true });
      document.addEventListener('visibilitychange', this.boundVisibility);
      window.addEventListener('pageshow', this.boundPageShow);
      window.addEventListener('focus', this.boundFocus);
      document.addEventListener('toggle', this.boundDialogToggle, true);
      if (this.dismissButton) this.dismissButton.addEventListener('click', this.boundDismiss);
      document.addEventListener('shopify:section:select', this.boundSectionSelect);
      document.addEventListener('shopify:section:deselect', this.boundSectionDeselect);
      document.addEventListener('spider:page-transition:start', this.boundTransitionStart);
      document.addEventListener('spider:page-transition:end', this.boundTransitionEnd);
      if (this.motionQuery) {
        if (this.motionQuery.addEventListener) this.motionQuery.addEventListener('change', this.boundMotion);
        else if (this.motionQuery.addListener) this.motionQuery.addListener(this.boundMotion);
      }
    }

    removeListeners() {
      window.removeEventListener('resize', this.boundResize);
      document.removeEventListener('visibilitychange', this.boundVisibility);
      window.removeEventListener('pageshow', this.boundPageShow);
      window.removeEventListener('focus', this.boundFocus);
      document.removeEventListener('toggle', this.boundDialogToggle, true);
      if (this.dismissButton) this.dismissButton.removeEventListener('click', this.boundDismiss);
      document.removeEventListener('shopify:section:select', this.boundSectionSelect);
      document.removeEventListener('shopify:section:deselect', this.boundSectionDeselect);
      document.removeEventListener('spider:page-transition:start', this.boundTransitionStart);
      document.removeEventListener('spider:page-transition:end', this.boundTransitionEnd);
      if (this.motionQuery) {
        if (this.motionQuery.removeEventListener) this.motionQuery.removeEventListener('change', this.boundMotion);
        else if (this.motionQuery.removeListener) this.motionQuery.removeListener(this.boundMotion);
      }
    }

    onResize() {
      if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.resizeTimer = 0;
        this.evaluate(true);
      }, 140);
    }

    onVisibilityChange() {
      if (document.hidden) {
        this.stop();
      } else {
        this.evaluate();
      }
    }

    onPageShow() {
      this.evaluate();
    }

    onDialogToggle() {
      this.checkOverlay();
    }

    getDismissalKey() {
      return `spider-snow-hidden:${String(this.config?.sectionId || 'global')}`;
    }

    readDismissal() {
      if (!bool(this.config?.dismissEnabled, false) || window.Shopify?.designMode) return false;
      try { return sessionStorage.getItem(this.getDismissalKey()) === '1'; }
      catch (_) { return false; }
    }

    onDismiss() {
      this.dismissed = true;
      try { sessionStorage.setItem(this.getDismissalKey(), '1'); } catch (_) { /* session-only fallback */ }
      this.evaluate();
    }

    overlayIsBlocking() {
      if (!bool(this.config?.pauseOnOverlays, true)) return false;
      const selectors = [
        'dialog[open]',
        '[role="dialog"][aria-modal="true"]:not([aria-hidden="true"]):not([hidden])',
        '[data-sp-overlay-state="open"]',
        'sp-cart-drawer[open]', 'sp-search-drawer[open]',
        '.sp-cart-drawer.is-open', '.sp-search-drawer.is-open',
        '.sp-quick-view.is-open', '.sp-mobile-menu.is-open'
      ];
      for (const selector of selectors) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
          if (!this.contains(node) && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden') return true;
        }
      }
      return false;
    }

    checkOverlay() {
      if (!this.config || !this.isConnected) return;
      const previous = this.pausedForOverlay;
      this.pausedForOverlay = this.overlayIsBlocking();
      if (previous !== this.pausedForOverlay) this.evaluate();
    }

    onMotionChange() {
      this.evaluate(true);
    }

    onSectionSelect(event) {
      if (!this.config || String(event.detail?.sectionId || '') !== String(this.config.sectionId || '')) return;
      this.editorSelected = true;
      this.evaluate(true);
    }

    onSectionDeselect(event) {
      if (!this.config || String(event.detail?.sectionId || '') !== String(this.config.sectionId || '')) return;
      this.editorSelected = false;
      this.evaluate(true);
    }

    onPageTransitionStart() {
      this.loaderPaused = true;
      this.stop();
    }

    onPageTransitionEnd() {
      this.loaderPaused = false;
      this.evaluate();
    }

    viewportClass() {
      const width = window.innerWidth || document.documentElement.clientWidth || 0;
      if (width <= 749) return 'mobile';
      if (width <= 989) return 'tablet';
      return 'desktop';
    }

    viewportAllowed() {
      const viewport = this.viewportClass();
      if (viewport === 'mobile') return bool(this.config.showMobile, true);
      if (viewport === 'tablet') return bool(this.config.showTablet, true);
      return bool(this.config.showDesktop, true);
    }

    scheduleAllowed() {
      if (!bool(this.config.scheduleEnabled, false)) return true;
      const startMinute = parseTime(this.config.scheduleStartTime, 0);
      const endMinute = parseTime(this.config.scheduleEndTime, 1439);
      if (startMinute === null || endMinute === null) return this.invalidSchedule('Invalid HH:MM time setting');

      let now = new Date();
      if ((this.config.timezoneMode || 'store') === 'store') {
        const tz = String(this.config.storeTimezone || '').trim();
        if (tz) {
          try {
            const pieces = new Intl.DateTimeFormat('en-US', {
              timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
            }).formatToParts(now);
            const parts = Object.fromEntries(pieces.map(part => [part.type, Number(part.value)]));
            return this.schedulePartsAllowed(parts.year, parts.month, parts.day, parts.hour * 60 + parts.minute, startMinute, endMinute);
          } catch (_) {
            if (!this.storeTZWarning) this.warn('Invalid store timezone. Using visitor time. Enter a valid IANA timezone.');
            this.storeTZWarning = true;
          }
        } else if (!this.storeTZWarning) {
          this.warn('Store timezone not provided. Using visitor time until a valid IANA timezone is configured.');
          this.storeTZWarning = true;
        }
      }
      return this.schedulePartsAllowed(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours() * 60 + now.getMinutes(), startMinute, endMinute);
    }

    warn(message) {
      if (this.config?.debug) console.warn('[Spider Snow Effect]', message);
    }

    invalidSchedule(message) {
      this.warn(message);
      return false;
    }

    schedulePartsAllowed(year, month, day, minutes, startMinute, endMinute) {
      const currentDate = year * 10000 + month * 100 + day;
      const currentMD = month * 100 + day;
      const mode = this.config.scheduleMode || 'annual';
      if (mode === 'once') {
        const startDate = parseDate(this.config.scheduleStartDate);
        const endDate = parseDate(this.config.scheduleEndDate);
        if (!startDate || !endDate || startDate > endDate || (startDate === endDate && startMinute > endMinute)) {
          return this.invalidSchedule('Invalid one-time start/end dates');
        }
        return (currentDate > startDate || currentDate === startDate && minutes >= startMinute)
          && (currentDate < endDate || currentDate === endDate && minutes <= endMinute);
      }
      const startMonth = number(this.config.scheduleStartMonth, 12);
      const endMonth = number(this.config.scheduleEndMonth, 1);
      const startDay = number(this.config.scheduleStartDay, 1);
      const endDay = number(this.config.scheduleEndDay, 10);
      if (![startMonth, startDay, endMonth, endDay].every(Number.isInteger)
        || !isValidDay(startMonth, startDay) || !isValidDay(endMonth, endDay)) {
        return this.invalidSchedule('Invalid recurring month/day schedule');
      }
      const startMD = startMonth * 100 + startDay;
      const endMD = endMonth * 100 + endDay;
      if (startMD === endMD && startMinute > endMinute) return this.invalidSchedule('Start time is later than end time on same annual date');
      const afterStart = currentMD > startMD || currentMD === startMD && minutes >= startMinute;
      const beforeEnd = currentMD < endMD || currentMD === endMD && minutes <= endMinute;
      return startMD <= endMD ? afterStart && beforeEnd : afterStart || beforeEnd;
    }

    reducedMotionState() {
      if (!this.motionQuery?.matches) return 'normal';
      const mode = this.config.reducedMotion || 'disable';
      if (mode === 'static') return 'static';
      if (mode === 'reduced') return 'reduced';
      return 'disabled';
    }

    shouldBeActive() {
      if (!this.config || !this.canvas) return false;
      const editorOverride = Boolean(window.Shopify?.designMode)
        && bool(this.config.previewEditor, true)
        && this.editorSelected;
      if (editorOverride) return true;
      if (this.dismissed) return false;
      if (!bool(this.config.enabled, true)) return false;
      if (!bool(this.config.pageEligible, true)) return false;
      const currentPath = window.location.pathname;
      if (parsePathExclusions(this.config.excludedPaths).some(path =>
        path.endsWith('*') ? currentPath.startsWith(path.slice(0, -1)) : currentPath === path
      )) return false;
      if (!this.viewportAllowed()) return false;
      if (!this.scheduleAllowed()) return false;
      if (this.reducedMotionState() === 'disabled') return false;
      return true;
    }

    evaluate(rebuild = false) {
      if (!this.config || !this.canvas || !this.ctx) return;
      this.applyOverlay();
      this.pausedForOverlay = this.overlayIsBlocking();

      if (!this.shouldBeActive()) {
        this.deactivate();
        return;
      }

      this.classList.add('is-active');
      if (this.dismissButton) this.dismissButton.hidden = false;
      const resized = this.resizeCanvas();
      this.staticMode = this.reducedMotionState() === 'static';
      if (rebuild || resized || this.particles.length === 0) this.createParticles();

      if (this.staticMode) {
        this.stop();
        this.drawFrame(0, false);
        return;
      }

      if (document.hidden || this.loaderPaused || this.pausedForOverlay) {
        this.stop();
        return;
      }

      this.start();
    }

    deactivate() {
      this.stop();
      this.classList.remove('is-active');
      if (this.dismissButton) this.dismissButton.hidden = true;
      if (this.ctx && this.width && this.height) this.ctx.clearRect(0, 0, this.width, this.height);
    }

    applyOverlay() {
      if (!this.overlay || !this.config) return;
      const enabled = bool(this.config.overlayEnabled, false);
      const opacity = enabled ? clamp(number(this.config.overlayOpacity, 0), 0, 0.8) : 0;
      this.style.setProperty('--sp-snow-overlay-color', this.config.overlayColor || '#000000');
      this.style.setProperty('--sp-snow-overlay-opacity', String(opacity));
    }

    performanceProfile() {
      const mode = this.config.performanceMode || 'auto';
      const viewport = this.viewportClass();
      if (mode === 'high') return { fps: 60, count: 1, dpr: 2 };
      if (mode === 'balanced') return { fps: 45, count: 0.85, dpr: 1.5 };
      if (mode === 'battery') return { fps: 30, count: 0.55, dpr: 1 };
      if (viewport === 'mobile') return { fps: 30, count: 0.72, dpr: 1.5 };
      if (viewport === 'tablet') return { fps: 40, count: 0.88, dpr: 1.75 };
      return { fps: 45, count: 1, dpr: 2 };
    }

    resizeCanvas() {
      const width = Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || 1));
      const height = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 1));
      const profile = this.performanceProfile();
      const dpr = clamp(number(window.devicePixelRatio, 1), 1,
        Math.min(profile.dpr, clamp(number(this.config.dprLimit, 2), 1, 3)));
      const changed = width !== this.width || height !== this.height || Math.abs(dpr - this.dpr) > 0.01;
      if (!changed) return false;

      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(width * dpr));
      this.canvas.height = Math.max(1, Math.round(height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    effectConfig() {
      const preset = this.config.preset || 'legacy';
      if (preset === 'light') return { density: 'custom', counts: [70, 40, 20], minSize: 2, maxSize: 5, speed: 2, opacity: 0.65, wind: 'none' };
      if (preset === 'gentle') return { density: 'custom', counts: [110, 65, 35], minSize: 2, maxSize: 7, speed: 3, opacity: 0.7, wind: this.config.windDirection || 'none' };
      if (preset === 'heavy') return { density: 'custom', counts: [175, 100, 55], minSize: 2, maxSize: 9, speed: 5, opacity: 0.82, wind: this.config.windDirection || 'none' };
      return { density: this.config.density || 'medium', counts: null, minSize: number(this.config.minSize, 2), maxSize: number(this.config.maxSize, 7), speed: number(this.config.speed, 3), opacity: number(this.config.snowOpacity, 0.7), wind: this.config.windDirection || 'none' };
    }

    particleCap() {
      const viewport = this.viewportClass();
      const effect = this.effectConfig();
      const density = effect.density;
      const presets = {
        low: { desktop: 65, tablet: 42, mobile: 26 },
        medium: { desktop: 120, tablet: 78, mobile: 48 },
        high: { desktop: 190, tablet: 125, mobile: 78 }
      };

      let cap;
      if (density === 'custom') {
        cap = viewport === 'mobile'
          ? clamp(effect.counts ? effect.counts[2] : number(this.config.particlesMobile, 45), 5, 100)
          : viewport === 'tablet'
            ? clamp(effect.counts ? effect.counts[1] : number(this.config.particlesTablet, 75), 10, 180)
            : clamp(effect.counts ? effect.counts[0] : number(this.config.particlesDesktop, 120), 10, 250);
      } else {
        cap = presets[density]?.[viewport] || presets.medium[viewport];
      }

      const referenceArea = viewport === 'mobile' ? 390 * 844 : viewport === 'tablet' ? 820 * 1100 : 1440 * 900;
      const currentArea = Math.max(1, this.width * this.height);
      const areaScale = clamp(Math.sqrt(currentArea / referenceArea), 0.55, 1);
      const profile = this.performanceProfile();
      let count = cap * areaScale * profile.count * this.quality;

      if (viewport === 'mobile' && bool(this.config.reduceMobile, true)) count *= 0.72;
      if (this.reducedMotionState() === 'reduced') count *= 0.35;
      return Math.max(5, Math.round(count));
    }

    createParticles() {
      const count = this.particleCap();
      const effect = this.effectConfig();
      const min = clamp(effect.minSize, 1, 16);
      const max = Math.max(min, clamp(effect.maxSize, 2, 16));
      const style = this.config.style || 'soft_circle';
      this.particles.length = count;

      for (let index = 0; index < count; index += 1) {
        const mode = this.config.depthEffect || 'legacy';
        const depth = mode === 'off' ? 1 : mode === 'enhanced' ? 0.25 + Math.random() * 1.1 : mode === 'subtle' ? 0.7 + Math.random() * 0.48 : 0.45 + Math.random() * 0.75;
        const size = (min + Math.random() * (max - min)) * (mode === 'enhanced' ? depth : 1);
        this.particles[index] = {
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          size,
          depth,
          velocityFactor: 0.72 + Math.random() * 0.7,
          opacity: 0.45 + Math.random() * 0.55,
          drift: (Math.random() - 0.5) * 5,
          phase: Math.random() * Math.PI * 2,
          swayRate: 0.45 + Math.random() * 0.9,
          swayAmount: 4 + Math.random() * 11,
          rotation: Math.random() * Math.PI,
          rotationSpeed: (Math.random() - 0.5) * 0.7,
          colorIndex: bool(this.config.multiColor, false) && Math.random() > 0.68 ? 1 : 0,
          shape: style === 'mixed' ? (Math.random() > 0.72 ? 'snowflake' : 'soft_circle') : style
        };
      }
    }

    targetFrameInterval() {
      const profile = this.performanceProfile();
      let fps = profile.fps;
      if (this.config.fpsMode === '30' || this.config.fpsMode === '60') fps = Number(this.config.fpsMode);
      if (this.reducedMotionState() === 'reduced') fps = Math.min(fps, 12);
      return 1000 / fps;
    }

    start() {
      if (this.running || this.staticMode) return;
      if (clamp(this.effectConfig().opacity, 0, 1) <= 0) {
        this.drawFrame(0, false);
        return;
      }
      this.running = true;
      this.lastFrame = 0;
      this.lastDrawTime = 0;
      this.averageFrame = 0;
      this.measuredFrames = 0;
      this.frameInterval = this.targetFrameInterval();
      this.rafId = requestAnimationFrame(this.tick);
    }

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      this.lastFrame = 0;
    }

    tick(timestamp) {
      if (!this.running) return;
      if (document.hidden || this.loaderPaused || this.pausedForOverlay || !this.isConnected) {
        this.stop();
        return;
      }

      if (!this.lastFrame) this.lastFrame = timestamp;
      const elapsed = timestamp - this.lastFrame;
      if (elapsed >= this.frameInterval) {
        const dt = Math.min(elapsed / 1000, 0.05);
        this.lastFrame = timestamp - (elapsed % this.frameInterval);
        this.drawFrame(dt, true, timestamp / 1000);
        this.measureQuality(elapsed);
      }
      this.rafId = requestAnimationFrame(this.tick);
    }

    measureQuality(elapsed) {
      if (this.config.performanceMode !== 'auto' || !bool(this.config.adaptiveQuality, true)) return;
      if (elapsed <= 0 || elapsed > 250) return;
      this.averageFrame = this.averageFrame ? this.averageFrame * 0.92 + elapsed * 0.08 : elapsed;
      this.measuredFrames += 1;
      if (this.measuredFrames < 120) return;
      this.measuredFrames = 0;
      const before = this.quality;
      if (this.averageFrame > Math.max(this.frameInterval * 1.5, this.frameInterval + 10)) this.quality = Math.max(0.4, this.quality - 0.1);
      else if (this.averageFrame < this.frameInterval * 1.15) this.quality = Math.min(1, this.quality + 0.05);
      if (Math.abs(this.quality - before) > 0.001) this.adjustParticleCount();
    }

    adjustParticleCount() {
      const count = this.particleCap();
      if (count < this.particles.length) this.particles.length = count;
      else if (count > this.particles.length) {
        const current = this.particles.slice();
        this.createParticles();
        for (let i = 0; i < current.length; i += 1) this.particles[i] = current[i];
      }
    }

    windVelocity() {
      const direction = this.effectConfig().wind;
      const strength = clamp(number(this.config.windStrength, 1.5), -5, 5);
      if (direction === 'none') return 0;
      if (direction === 'left') return -Math.abs(strength || 1.5) * 12;
      if (direction === 'right') return Math.abs(strength || 1.5) * 12;
      return strength * 12;
    }

    drawFrame(dt, move, time = 0) {
      if (!this.ctx || !this.canvas || !this.width || !this.height) return;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      const opacity = clamp(this.effectConfig().opacity, 0, 1);
      if (opacity <= 0 || this.particles.length === 0) return;

      const speedSetting = clamp(this.effectConfig().speed, 1, 10);
      const baseVelocity = 18 + speedSetting * 16;
      const reduced = this.reducedMotionState() === 'reduced';
      const motionMultiplier = reduced ? 0.25 : 1;
      const wind = this.windVelocity() * motionMultiplier;
      const sway = bool(this.config.sway, true);
      const softness = clamp(number(this.config.softness, 1), 0, 5);
      const primary = this.config.primaryColor || '#FFFFFF';
      const secondary = this.config.secondaryColor || '#EAF5FF';

      for (let i = 0; i < this.particles.length; i += 1) {
        const particle = this.particles[i];

        if (move) {
          const vertical = baseVelocity * particle.depth * particle.velocityFactor * motionMultiplier;
          let horizontal = (wind + particle.drift) * motionMultiplier;
          if (sway && !reduced) horizontal += Math.sin(time * particle.swayRate + particle.phase) * particle.swayAmount;
          particle.y += vertical * dt;
          particle.x += horizontal * dt;
          particle.rotation += particle.rotationSpeed * dt * motionMultiplier;

          const margin = Math.max(16, particle.size * 3);
          if (particle.x < -margin) particle.x = this.width + margin;
          else if (particle.x > this.width + margin) particle.x = -margin;

          if (particle.y > this.height + margin) {
            particle.y = -margin - Math.random() * Math.min(80, this.height * 0.08);
            particle.x = Math.random() * this.width;
          }
        }

        const color = particle.colorIndex === 1 ? secondary : primary;
        const alpha = clamp(opacity * particle.opacity, 0, 1);
        if (particle.shape === 'snowflake' && particle.size >= 3) {
          this.drawSnowflake(particle, color, alpha);
        } else {
          this.drawSoftCircle(particle, color, alpha, softness);
        }
      }

      ctx.globalAlpha = 1;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    drawSoftCircle(particle, color, alpha, softness) {
      const ctx = this.ctx;
      if (softness > 0) {
        ctx.globalAlpha = alpha * clamp(0.12 + softness * 0.045, 0.12, 0.35);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (1 + softness * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    drawSnowflake(particle, color, alpha) {
      const ctx = this.ctx;
      const radius = Math.max(1.5, particle.size * 0.72);
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = clamp(particle.size * 0.13, 0.55, 1.8);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let arm = 0; arm < 3; arm += 1) {
        const angle = arm * Math.PI / 3;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        ctx.moveTo(-x, -y);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SpiderSnowEffect);
})();
