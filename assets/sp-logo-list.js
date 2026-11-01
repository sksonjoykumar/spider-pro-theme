/* Spider Theme Logo List — native, finite-first scroll-snap carousel. */
(() => {
  'use strict';
  if (window.__spLogoListBound) return;
  window.__spLogoListBound = true;
  const instances = new Map();
  let rtlType;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rtlScrollType = () => {
    if (rtlType) return rtlType;
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.dir = 'rtl';
    outer.style.cssText = 'position:absolute;left:-9999px;width:4px;height:1px;overflow:scroll;visibility:hidden';
    inner.style.width = '8px'; outer.append(inner); document.body.append(outer);
    if (outer.scrollLeft > 0) rtlType = 'reverse';
    else { outer.scrollLeft = 1; rtlType = outer.scrollLeft === 0 ? 'negative' : 'default'; }
    outer.remove(); return rtlType;
  };
  const logical = (el) => {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    if (getComputedStyle(el).direction !== 'rtl') return clamp(el.scrollLeft, 0, max);
    const t = rtlScrollType();
    return clamp(t === 'negative' ? -el.scrollLeft : t === 'reverse' ? max - el.scrollLeft : el.scrollLeft, 0, max);
  };
  const setLogical = (el, amount, smooth = true) => {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const value = clamp(amount, 0, max);
    const t = getComputedStyle(el).direction === 'rtl' ? rtlScrollType() : 'ltr';
    const left = t === 'negative' ? -value : t === 'reverse' ? max - value : value;
    el.scrollTo({ left, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };
  class LogoCarousel {
    constructor(root) {
      this.root = root;
      this.viewport = root.querySelector('[data-sp-logo-viewport]');
      this.track = root.querySelector('[data-sp-logo-track]');
      this.prev = root.querySelector('[data-sp-logo-prev]');
      this.next = root.querySelector('[data-sp-logo-next]');
      this.dots = root.querySelector('[data-sp-logo-dots]');
      this.fraction = root.querySelector('[data-sp-logo-fraction]');
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.raf = null; this.timer = null; this.resize = null;
      this.max = 0; this.stride = 1; this.pages = 1;
      this.dragging = false; this.pointerId = null; this.dragMoved = false;
      this.startX = 0; this.startLeft = 0; this.suppressClickUntil = 0;
      this.pausedHover = false; this.pausedFocus = false;
      this.autoplay = root.dataset.spAutoplay === 'true' && !reducedMotion() && root.dataset.spDesignMode !== 'true';
      this.loop = root.dataset.spLoop === 'true';
      this.speed = Math.max(3000, Number(root.dataset.spAutoplaySpeed || 5000));
      this.pauseHover = root.dataset.spAutoplayHover === 'true';
      if (!this.viewport || !this.track) return;
      this.bind(); this.measure(); root.classList.add('sp-logo-list--js-ready');
      if ('ResizeObserver' in window) { this.resize = new ResizeObserver(() => this.measure()); this.resize.observe(this.viewport); }
      else window.addEventListener('resize', () => this.measure(), { signal: this.signal });
      this.startTimer();
    }
    get cards() { return Array.from(this.track.querySelectorAll('[data-sp-logo-item]')); }
    onFrame() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => { this.raf = null; this.update(); }); }
    bind() {
      this.prev?.addEventListener('click', () => this.go(-1), { signal: this.signal });
      this.next?.addEventListener('click', () => this.go(1), { signal: this.signal });
      this.viewport.addEventListener('scroll', () => this.onFrame(), { passive: true, signal: this.signal });
      this.viewport.addEventListener('keydown', e => {
        if (e.target !== this.viewport) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); this.go((e.key === 'ArrowRight' ? 1 : -1) * (getComputedStyle(this.viewport).direction === 'rtl' ? -1 : 1)); }
        else if (e.key === 'Home') { e.preventDefault(); setLogical(this.viewport, 0); }
        else if (e.key === 'End') { e.preventDefault(); setLogical(this.viewport, this.max); }
      }, { signal: this.signal });
      this.viewport.addEventListener('pointerdown', e => {
        if (e.button !== 0 || this.root.dataset.spDrag !== 'true' || e.pointerType === 'touch') return;
        this.dragging = true; this.dragMoved = false; this.pointerId = e.pointerId;
        this.startX = e.clientX; this.startLeft = logical(this.viewport); this.stopTimer();
        this.viewport.style.scrollSnapType = 'none';
        try { this.viewport.setPointerCapture(e.pointerId); } catch (_) {}
      }, { signal: this.signal });
      this.viewport.addEventListener('pointermove', e => {
        if (!this.dragging || this.pointerId !== e.pointerId) return;
        const delta = e.clientX - this.startX;
        if (Math.abs(delta) > 5) this.dragMoved = true;
        if (!this.dragMoved) return;
        e.preventDefault();
        const dir = getComputedStyle(this.viewport).direction === 'rtl' ? -1 : 1;
        setLogical(this.viewport, this.startLeft - delta * dir, false);
      }, { signal: this.signal });
      const end = e => {
        if (!this.dragging || e.pointerId !== this.pointerId) return;
        if (this.dragMoved) this.suppressClickUntil = Date.now() + 350;
        this.dragging = false; this.pointerId = null; this.viewport.style.scrollSnapType = '';
        try { this.viewport.releasePointerCapture(e.pointerId); } catch (_) {}
        this.startTimer();
      };
      this.viewport.addEventListener('pointerup', end, { signal: this.signal });
      this.viewport.addEventListener('pointercancel', end, { signal: this.signal });
      this.viewport.addEventListener('lostpointercapture', e => { if (this.dragging) end(e); }, { signal: this.signal });
      this.viewport.addEventListener('click', e => {
        if (Date.now() < this.suppressClickUntil) { e.preventDefault(); e.stopPropagation(); }
      }, { capture: true, signal: this.signal });
      this.root.addEventListener('mouseenter', () => { if (this.pauseHover) { this.pausedHover = true; this.stopTimer(); } }, { signal: this.signal });
      this.root.addEventListener('mouseleave', () => { this.pausedHover = false; this.startTimer(); }, { signal: this.signal });
      this.root.addEventListener('focusin', () => { this.pausedFocus = true; this.stopTimer(); }, { signal: this.signal });
      this.root.addEventListener('focusout', e => { if (!this.root.contains(e.relatedTarget)) { this.pausedFocus = false; this.startTimer(); } }, { signal: this.signal });
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.stopTimer(); else { this.update(); this.startTimer(); } }, { signal: this.signal });
    }
    measure() {
      this.max = Math.max(0, this.viewport.scrollWidth - this.viewport.clientWidth);
      const card = this.cards[0];
      const styles = getComputedStyle(this.track);
      const gap = parseFloat(styles.gap || styles.columnGap || 0) || 0;
      this.stride = card ? card.getBoundingClientRect().width + gap : 1;
      this.pages = this.max > 2 ? Math.max(2, Math.ceil(this.max / this.stride) + 1) : 1;
      this.root.classList.toggle('sp-logo-list--no-scroll', this.max <= 2);
      this.buildDots(); this.update();
      if (this.max <= 2) this.stopTimer(); else this.startTimer();
    }
    buildDots() {
      if (!this.dots || this.dots.children.length === this.pages) return;
      this.dots.replaceChildren();
      for (let i = 0; i < this.pages; i++) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'sp-logo-list__dot';
        button.setAttribute('aria-label', `Go to partner page ${i + 1}`);
        button.addEventListener('click', () => setLogical(this.viewport, Math.min(this.max, i * this.stride)), { signal: this.signal });
        this.dots.append(button);
      }
    }
    update() {
      const now = logical(this.viewport);
      const progress = this.max > 0 ? now / this.max : 0;
      const visibleFraction = this.viewport.scrollWidth ? clamp(this.viewport.clientWidth / this.viewport.scrollWidth, 0, 1) : 1;
      this.root.style.setProperty('--sp-logo-progress-width', `${(visibleFraction * 100).toFixed(3)}%`);
      this.root.style.setProperty('--sp-logo-progress-left', `${(progress * (1 - visibleFraction) * 100).toFixed(3)}%`);
      if (this.prev) this.prev.disabled = this.max < 2 || (!this.loop && now <= 2);
      if (this.next) this.next.disabled = this.max < 2 || (!this.loop && now >= this.max - 2);
      const page = this.max <= 2 ? 0 : clamp(Math.round(now / this.stride), 0, this.pages - 1);
      if (this.fraction) this.fraction.textContent = `${page + 1} / ${this.pages}`;
      this.dots?.querySelectorAll('button').forEach((dot, i) => dot.setAttribute('aria-current', i === page ? 'true' : 'false'));
    }
    go(direction) {
      if (this.max <= 2) return;
      const current = logical(this.viewport);
      const target = direction > 0 ? Math.min(this.max, (Math.floor(current / this.stride + .05) + 1) * this.stride) : Math.max(0, (Math.ceil(current / this.stride - .05) - 1) * this.stride);
      if (this.loop && direction > 0 && current >= this.max - 2) setLogical(this.viewport, 0);
      else if (this.loop && direction < 0 && current <= 2) setLogical(this.viewport, this.max);
      else setLogical(this.viewport, target);
    }
    startTimer() {
      if (!this.autoplay || this.timer || this.dragging || this.max <= 2 || this.pausedHover || this.pausedFocus || document.hidden || reducedMotion()) return;
      this.timer = window.setInterval(() => {
        if (logical(this.viewport) >= this.max - 2 && !this.loop) { this.stopTimer(); return; }
        this.go(1);
      }, this.speed);
    }
    stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
    selectBlock(blockId) {
      const block = this.cards.find(el => el.dataset.spLogoBlock === blockId);
      if (!block) return;
      this.stopTimer();
      const cards = this.cards;
      const index = cards.indexOf(block);
      setLogical(this.viewport, Math.min(this.max, index * this.stride), false);
      this.onFrame();
    }
    destroy() {
      this.stopTimer(); this.abort.abort(); this.resize?.disconnect();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.root.style.removeProperty('--sp-logo-progress-width');
      this.root.style.removeProperty('--sp-logo-progress-left');
    }
  }
  const init = (scope = document) => {
    const roots = scope.matches?.('[data-sp-logo-list]') ? [scope] : [...scope.querySelectorAll('[data-sp-logo-list]')];
    roots.forEach(root => { if (root.dataset.spStyle === 'style_1' && !instances.has(root)) instances.set(root, new LogoCarousel(root)); });
  };
  const unload = scope => {
    for (const [root, instance] of instances) {
      if (scope === root || scope.contains(root)) { instance.destroy(); instances.delete(root); }
    }
  };
  document.addEventListener('shopify:section:load', e => init(e.target));
  document.addEventListener('shopify:section:unload', e => unload(e.target));
  document.addEventListener('shopify:block:select', e => {
    const root = e.target.closest('[data-sp-logo-list]');
    instances.get(root)?.selectBlock(e.detail?.blockId);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
})();
