(() => {
  'use strict';
  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let rtlScrollType;
  const getRtlScrollType = () => {
    if (rtlScrollType) return rtlScrollType;
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.dir = 'rtl';
    outer.style.cssText = 'position:absolute;left:-9999px;width:4px;height:1px;overflow:scroll;visibility:hidden;';
    inner.style.width = '8px';
    outer.append(inner);
    document.body.append(outer);
    if (outer.scrollLeft > 0) rtlScrollType = 'reverse';
    else {
      outer.scrollLeft = 1;
      rtlScrollType = outer.scrollLeft === 0 ? 'negative' : 'default';
    }
    outer.remove();
    return rtlScrollType;
  };

  const logicalScrollLeft = (element) => {
    if (getComputedStyle(element).direction !== 'rtl') return Math.max(0, element.scrollLeft);
    const max = Math.max(0, element.scrollWidth - element.clientWidth);
    const type = getRtlScrollType();
    if (type === 'negative') return Math.min(max, Math.abs(element.scrollLeft));
    if (type === 'reverse') return Math.min(max, Math.max(0, max - element.scrollLeft));
    return Math.min(max, Math.max(0, element.scrollLeft));
  };

  const setLogicalScrollLeft = (element, logical, behavior = 'auto') => {
    const max = Math.max(0, element.scrollWidth - element.clientWidth);
    const value = Math.min(max, Math.max(0, logical));
    if (getComputedStyle(element).direction !== 'rtl') {
      element.scrollTo({ left: value, behavior });
      return;
    }
    const type = getRtlScrollType();
    const physical = type === 'negative' ? -value : type === 'reverse' ? max - value : value;
    element.scrollTo({ left: physical, behavior });
  };

  class SpiderCarousel {
    constructor(block) {
      this.block = block;
      this.viewport = block.querySelector('[data-sp-carousel-viewport], [data-sp-featured-viewport], [data-sp-collections-grid-tabs-viewport]');
      this.track = block.querySelector('[data-sp-carousel-track], [data-sp-featured-items], [data-sp-collections-grid-tabs-items]');
      this.prev = block.querySelector('[data-sp-carousel-prev], [data-sp-featured-prev], [data-sp-collections-grid-tabs-prev]');
      this.next = block.querySelector('[data-sp-carousel-next], [data-sp-featured-next], [data-sp-collections-grid-tabs-next]');
      this.pagination = block.querySelector('[data-sp-carousel-pagination], [data-sp-featured-pagination], [data-sp-collections-grid-tabs-pagination]');
      this.pause = block.querySelector('[data-sp-carousel-pause], [data-sp-featured-pause], [data-sp-collections-grid-tabs-pause]');
      this.cards = [];
      this.pages = 1;
      this.page = 0;
      this.step = 0;
      this.timer = 0;
      this.timerStartedAt = 0;
      this.remaining = Number(block.dataset.autoplayDelay || 5000);
      this.userPaused = false;
      this.hoverPaused = false;
      this.focusPaused = false;
      this.offscreenPaused = false;
      this.hiddenPaused = document.hidden;
      this.dragging = false;
      this.dragPending = false;
      this.dragMoved = false;
      this.dragPointerId = null;
      this.startX = 0;
      this.startScroll = 0;
      this.suppressClickUntil = 0;
      this.raf = 0;
      this.resizeObserver = null;
      this.visibilityObserver = null;
      this.cardObserver = null;
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.designMode = block.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode);
      this.config = {
        loop: block.dataset.loop === 'true',
        autoplay: block.dataset.autoplay === 'true' && !this.designMode && !prefersReducedMotion(),
        delay: Math.max(3000, Number(block.dataset.autoplayDelay || 5000)),
        pauseHover: block.dataset.pauseHover === 'true',
        drag: block.dataset.drag === 'true',
        outsideOpacity: block.dataset.outsideOpacity === 'true'
      };
      this.remaining = this.config.delay;
      if (!this.viewport || !this.track) return;
      this.bind();
      this.measure();
      this.setupObservers();
      block.classList.add('is-initialized');
      this.schedule();
    }

    bind() {
      this.prev?.addEventListener('click', () => this.goBy(-1, true), { signal: this.signal });
      this.next?.addEventListener('click', () => this.goBy(1, true), { signal: this.signal });
      this.pause?.addEventListener('click', () => this.togglePause(), { signal: this.signal });

      this.viewport.addEventListener('scroll', () => this.onScroll(), { passive: true, signal: this.signal });
      this.viewport.addEventListener('keydown', (event) => this.onKeydown(event), { signal: this.signal });
      this.viewport.addEventListener('pointerdown', (event) => this.onPointerDown(event), { signal: this.signal });
      this.viewport.addEventListener('click', (event) => {
        if (Date.now() < this.suppressClickUntil && !event.target.closest('button, input, select, textarea')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }, { capture: true, signal: this.signal });
      window.addEventListener('pointermove', (event) => this.onPointerMove(event), { passive: false, signal: this.signal });
      window.addEventListener('pointerup', (event) => this.onPointerUp(event), { signal: this.signal });
      window.addEventListener('pointercancel', (event) => this.onPointerUp(event), { signal: this.signal });

      this.block.addEventListener('mouseenter', () => {
        if (!this.config.pauseHover) return;
        this.hoverPaused = true;
        this.pauseTimer();
      }, { signal: this.signal });
      this.block.addEventListener('mouseleave', () => {
        if (!this.config.pauseHover) return;
        this.hoverPaused = false;
        this.schedule();
      }, { signal: this.signal });
      this.block.addEventListener('focusin', () => {
        this.focusPaused = true;
        this.pauseTimer();
      }, { signal: this.signal });
      this.block.addEventListener('focusout', (event) => {
        if (!this.block.contains(event.relatedTarget)) {
          this.focusPaused = false;
          this.schedule();
        }
      }, { signal: this.signal });
      document.addEventListener('visibilitychange', () => {
        this.hiddenPaused = document.hidden;
        if (this.hiddenPaused) this.pauseTimer(); else this.schedule();
      }, { signal: this.signal });
    }

    setupObservers() {
      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(this.raf);
          this.raf = requestAnimationFrame(() => this.measure());
        });
        this.resizeObserver.observe(this.viewport);
      }
      if ('IntersectionObserver' in window) {
        this.visibilityObserver = new IntersectionObserver((entries) => {
          const entry = entries[0];
          this.offscreenPaused = !entry || entry.intersectionRatio < .15;
          if (this.offscreenPaused) this.pauseTimer(); else this.schedule();
        }, { threshold: [0, .15, .5] });
        this.visibilityObserver.observe(this.block);
      }
      this.setupCardObserver();
    }

    setupCardObserver() {
      this.cardObserver?.disconnect();
      if (!this.config.outsideOpacity || !('IntersectionObserver' in window)) return;
      this.cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('is-outside', entry.intersectionRatio < .82));
      }, { root: this.viewport, threshold: [.2, .82, 1] });
      this.cards.forEach((card) => this.cardObserver.observe(card));
    }

    measure() {
      this.cards = [...this.track.querySelectorAll('[data-sp-product-card], [data-sp-featured-card], [data-sp-collections-grid-tabs-card]')];
      const first = this.cards[0];
      const second = this.cards[1];
      if (!first) {
        this.pages = 1;
        this.page = 0;
        this.block.classList.add('is-one-page');
        return;
      }
      const computedTrack = getComputedStyle(this.track);
      const gap = Math.max(0, parseFloat(computedTrack.columnGap || computedTrack.gap || '0') || 0);
      const stride = Math.max(1, first.offsetWidth + gap);
      const visible = Math.max(1, Math.floor((this.viewport.clientWidth + gap + 1) / stride));
      this.step = Math.max(stride, stride * visible);
      this.block.style.setProperty('--sp-carousel-viewport-height', `${this.viewport.offsetHeight}px`);
      this.block.classList.toggle('is-underfilled', this.cards.length <= visible);
      const maxScroll = Math.max(0, this.track.scrollWidth - this.viewport.clientWidth);
      this.pages = Math.max(1, Math.ceil(maxScroll / this.step) + 1);
      this.block.classList.toggle('is-one-page', maxScroll <= 2 || this.cards.length <= visible);
      this.page = Math.min(this.pages - 1, this.normalizedPage());
      this.renderPagination();
      this.updateControls();
      this.setupCardObserver();
    }

    normalizedScroll() {
      return logicalScrollLeft(this.viewport);
    }

    normalizedPage() {
      if (this.step <= 0) return 0;
      return Math.max(0, Math.min(this.pages - 1, Math.round(this.normalizedScroll() / this.step)));
    }

    onScroll() {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => {
        const nextPage = this.normalizedPage();
        if (nextPage !== this.page) {
          this.page = nextPage;
          this.updatePagination();
          this.updateControls();
        }
      });
    }

    goBy(delta, user = false) {
      if (this.block.classList.contains('is-one-page')) return;
      let target = this.page + delta;
      if (target < 0) target = this.config.loop ? this.pages - 1 : 0;
      if (target >= this.pages) target = this.config.loop ? 0 : this.pages - 1;
      this.goTo(target, user);
    }

    goTo(page, user = false) {
      const target = Math.max(0, Math.min(this.pages - 1, page));
      const maxScroll = Math.max(0, this.track.scrollWidth - this.viewport.clientWidth);
      const logical = Math.min(maxScroll, target * this.step);
      setLogicalScrollLeft(this.viewport, logical, prefersReducedMotion() ? 'auto' : 'smooth');
      this.page = target;
      this.updatePagination();
      this.updateControls();
      if (user) {
        this.remaining = this.config.delay;
        this.pauseTimer();
        window.setTimeout(() => this.schedule(), 300);
      }
    }

    renderPagination() {
      if (!this.pagination) return;
      const style = this.block.dataset.paginationStyle || 'default';
      this.pagination.innerHTML = '';
      if (style === 'fraction') {
        const fraction = document.createElement('span');
        fraction.className = 'sp-carousel__fraction';
        fraction.dataset.spCarouselFraction = '';
        this.pagination.append(fraction);
        this.updatePagination();
        return;
      }
      for (let index = 0; index < this.pages; index += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sp-carousel__page';
        button.dataset.page = String(index);
        button.setAttribute('aria-label', `Go to product page ${index + 1}`);
        button.addEventListener('click', () => this.goTo(index, true), { signal: this.signal });
        if (style === 'numbers') button.textContent = String(index + 1);
        else {
          const dot = document.createElement('span');
          dot.className = 'sp-carousel__page-dot';
          dot.setAttribute('aria-hidden', 'true');
          button.append(dot);
        }
        this.pagination.append(button);
      }
      this.updatePagination();
    }

    updatePagination() {
      const fraction = this.pagination?.querySelector('[data-sp-carousel-fraction]');
      if (fraction) fraction.textContent = `${this.page + 1} / ${this.pages}`;
      this.pagination?.querySelectorAll('[data-page]').forEach((button) => {
        const active = Number(button.dataset.page) === this.page;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      });
    }

    updateControls() {
      const onePage = this.block.classList.contains('is-one-page');
      if (this.prev) this.prev.disabled = onePage || (!this.config.loop && this.page <= 0);
      if (this.next) this.next.disabled = onePage || (!this.config.loop && this.page >= this.pages - 1);
    }

    canAutoplay() {
      return this.config.autoplay && !this.block.classList.contains('is-one-page') && !this.userPaused && !this.hoverPaused && !this.focusPaused && !this.offscreenPaused && !this.hiddenPaused && !this.dragging && !prefersReducedMotion();
    }

    pauseTimer() {
      if (!this.timer) return;
      const elapsed = performance.now() - this.timerStartedAt;
      this.remaining = Math.max(250, this.remaining - elapsed);
      clearTimeout(this.timer);
      this.timer = 0;
    }

    schedule() {
      if (!this.canAutoplay()) {
        this.updatePause();
        return;
      }
      if (this.timer) return;
      this.remaining = Math.max(250, Number(this.remaining || this.config.delay));
      this.timerStartedAt = performance.now();
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.remaining = this.config.delay;
        this.goBy(1, false);
        this.schedule();
      }, this.remaining);
      this.updatePause();
    }

    togglePause() {
      this.userPaused = !this.userPaused;
      if (this.userPaused) this.pauseTimer();
      else this.schedule();
      this.updatePause();
    }

    updatePause() {
      if (!this.pause) return;
      this.pause.classList.toggle('is-paused', this.userPaused);
      this.pause.setAttribute('aria-pressed', this.userPaused ? 'true' : 'false');
      this.pause.setAttribute('aria-label', this.userPaused ? 'Resume autoplay' : 'Pause autoplay');
    }

    onKeydown(event) {
      if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.goBy(getComputedStyle(this.viewport).direction === 'rtl' ? 1 : -1, true); }
      if (event.key === 'ArrowRight') { event.preventDefault(); this.goBy(getComputedStyle(this.viewport).direction === 'rtl' ? -1 : 1, true); }
      if (event.key === 'Home') { event.preventDefault(); this.goTo(0, true); }
      if (event.key === 'End') { event.preventDefault(); this.goTo(this.pages - 1, true); }
    }

    onPointerDown(event) {
      if (!this.config.drag || event.pointerType === 'touch' || event.button !== 0) return;
      // Commerce controls should never become carousel drag candidates. Product links are
      // deliberately allowed: a normal click stays a native link; only a real horizontal
      // movement promotes the gesture into a drag.
      if (event.target.closest('button, input, select, textarea, label, form, [contenteditable="true"], [role="button"], [data-sp-product-card-option]')) return;
      this.dragPending = true;
      this.dragging = false;
      this.dragMoved = false;
      this.dragPointerId = event.pointerId;
      this.startX = event.clientX;
      this.startScroll = logicalScrollLeft(this.viewport);
    }

    onPointerMove(event) {
      if (!this.dragPending || event.pointerId !== this.dragPointerId) return;
      const delta = event.clientX - this.startX;

      // Do not capture/prevent anything until movement is clearly a drag. This preserves
      // native <a href> clicks on recommendation/product cards.
      if (!this.dragging && Math.abs(delta) <= 7) return;

      if (!this.dragging) {
        this.dragging = true;
        this.dragMoved = true;
        this.block.classList.add('is-dragging');
        this.pauseTimer();
        try { this.viewport.setPointerCapture?.(event.pointerId); } catch (_) {}
      }

      event.preventDefault();
      const rtl = getComputedStyle(this.viewport).direction === 'rtl';
      setLogicalScrollLeft(this.viewport, this.startScroll + (rtl ? delta : -delta), 'auto');
    }

    onPointerUp(event) {
      if (!this.dragPending) return;
      if (event?.pointerId != null && this.dragPointerId != null && event.pointerId !== this.dragPointerId) return;

      const wasDragging = this.dragging && this.dragMoved;
      this.dragPending = false;
      this.dragging = false;
      this.dragPointerId = null;
      this.block.classList.remove('is-dragging');

      // Critical: a normal click must not call goTo()/scrollTo() and must not suppress the
      // browser's native link navigation. Only completed real drags snap the carousel.
      if (!wasDragging) {
        this.dragMoved = false;
        this.schedule();
        return;
      }

      this.suppressClickUntil = Date.now() + 350;
      this.page = this.normalizedPage();
      this.goTo(this.page, false);
      this.dragMoved = false;
      this.remaining = this.config.delay;
      this.schedule();
    }

    destroy() {
      clearTimeout(this.timer);
      cancelAnimationFrame(this.raf);
      this.resizeObserver?.disconnect();
      this.visibilityObserver?.disconnect();
      this.cardObserver?.disconnect();
      this.abort.abort();
      this.block.classList.remove('is-initialized', 'is-dragging', 'is-underfilled');
      this.block.style.removeProperty('--sp-carousel-viewport-height');
    }
  }


  window.SpiderCarousel = { version: '1.0.0', mount(block){ if(!block) return null; if(block.__spGlobalCarousel) return block.__spGlobalCarousel; const instance=new SpiderCarousel(block); block.__spGlobalCarousel=instance; return instance; }, unmount(block){ block?.__spGlobalCarousel?.destroy?.(); if(block) delete block.__spGlobalCarousel; }, Class: SpiderCarousel };
  document.dispatchEvent(new CustomEvent('sp:carousel:ready',{detail:{service:window.SpiderCarousel,version:'1.0.0'}}));
})();
