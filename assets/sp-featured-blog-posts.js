(() => {
  'use strict';

  const instances = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  class FeaturedBlogCarousel {
    constructor(root) {
      this.root = root;
      this.carousel = root.querySelector('[data-sp-carousel]');
      this.slides = [...root.querySelectorAll('[data-sp-slide]')];
      if (!this.carousel || root.dataset.spLayout !== 'style_3') return;

      this.viewport = this.carousel.querySelector('[data-sp-carousel-viewport]');
      this.track = this.carousel.querySelector('[data-sp-carousel-track]');
      this.slides = [...this.carousel.querySelectorAll('[data-sp-slide]')];
      this.prev = this.carousel.querySelector('[data-sp-carousel-prev]');
      this.next = this.carousel.querySelector('[data-sp-carousel-next]');
      this.dots = this.carousel.querySelector('[data-sp-carousel-dots]');
      if (!this.viewport || !this.track || !this.slides.length) return;

      this.controller = new AbortController();
      this.signal = this.controller.signal;
      this.loop = this.carousel.dataset.spLoop === 'true';
      this.canSwipe = this.carousel.dataset.spSwipe === 'true';
      this.autoplay = this.carousel.dataset.spAutoplay === 'true' && !reducedMotion.matches;
      this.delay = Math.max(3000, Number(this.carousel.dataset.spAutoplaySpeed) || 5000);
      this.pauseHover = this.carousel.dataset.spPauseHover === 'true';
      this.paused = false;
      this.hovered = false;
      this.focused = false;
      this.index = 0;
      this.resizeFrame = 0;
      this.scrollFrame = 0;
      this.dragging = false;
      this.dragMoved = false;
      this.bind();
      this.refresh();
      this.start();
    }

    get perView() {
      if (matchMedia('(max-width: 749px)').matches) return Number(getComputedStyle(this.root).getPropertyValue('--sp-fb-slides-m')) || 1;
      if (matchMedia('(max-width: 1199px)').matches) return Number(getComputedStyle(this.root).getPropertyValue('--sp-fb-slides-t')) || 2;
      return Number(getComputedStyle(this.root).getPropertyValue('--sp-fb-slides-d')) || 3;
    }

    get pages() { return Math.max(1, Math.ceil(this.slides.length / this.perView)); }

    bind() {
      const options = { signal: this.signal };
      this.prev?.addEventListener('click', () => this.go(this.index - 1), options);
      this.next?.addEventListener('click', () => this.go(this.index + 1), options);
      this.viewport.addEventListener('scroll', () => {
        cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = requestAnimationFrame(() => this.syncFromScroll());
      }, { ...options, passive: true });
      window.addEventListener('resize', () => {
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = requestAnimationFrame(() => this.refresh());
      }, options);
      this.viewport.addEventListener('keydown', (event) => {
        const previousKey = document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
        const nextKey = document.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
        if (event.key === previousKey) { event.preventDefault(); this.go(this.index - 1); }
        if (event.key === nextKey) { event.preventDefault(); this.go(this.index + 1); }
      }, options);
      this.carousel.addEventListener('focusin', () => { this.focused = true; this.updatePause(); }, options);
      this.carousel.addEventListener('focusout', (event) => {
        if (!this.carousel.contains(event.relatedTarget)) { this.focused = false; this.updatePause(); }
      }, options);
      if (this.pauseHover) {
        this.carousel.addEventListener('mouseenter', () => { this.hovered = true; this.updatePause(); }, options);
        this.carousel.addEventListener('mouseleave', () => { this.hovered = false; this.updatePause(); }, options);
      }
      document.addEventListener('visibilitychange', () => this.updatePause(), options);
      reducedMotion.addEventListener?.('change', () => {
        this.autoplay = this.carousel.dataset.spAutoplay === 'true' && !reducedMotion.matches;
        this.updatePause();
      }, options);
      if (this.canSwipe) this.bindDrag(options);
    }

    bindDrag(options) {
      this.viewport.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch' || event.button !== 0) return;
        this.dragging = true;
        this.dragMoved = false;
        this.startX = event.clientX;
        this.startScroll = this.viewport.scrollLeft;
        this.viewport.setPointerCapture?.(event.pointerId);
      }, options);
      this.viewport.addEventListener('pointermove', (event) => {
        if (!this.dragging) return;
        const delta = event.clientX - this.startX;
        if (Math.abs(delta) > 4) this.dragMoved = true;
        this.viewport.scrollLeft = this.startScroll - delta;
        if (this.dragMoved) event.preventDefault();
      }, options);
      const end = () => { this.dragging = false; };
      this.viewport.addEventListener('pointerup', end, options);
      this.viewport.addEventListener('pointercancel', end, options);
      this.viewport.addEventListener('click', (event) => {
        if (this.dragMoved) { event.preventDefault(); event.stopPropagation(); this.dragMoved = false; }
      }, { ...options, capture: true });
    }

    refresh() {
      this.index = Math.min(this.index, this.pages - 1);
      this.buildDots();
      this.updateControls();
    }

    buildDots() {
      if (!this.dots) return;
      this.dots.replaceChildren();
      for (let page = 0; page < this.pages; page += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'sp-featured-blog__dot';
        dot.setAttribute('aria-label', `Go to carousel page ${page + 1} of ${this.pages}`);
        dot.addEventListener('click', () => this.go(page), { signal: this.signal });
        this.dots.append(dot);
      }
    }

    targetFor(page) { return this.slides[Math.min(page * this.perView, this.slides.length - 1)]; }

    go(page) {
      const last = this.pages - 1;
      if (this.loop) page = page < 0 ? last : page > last ? 0 : page;
      page = Math.max(0, Math.min(last, page));
      const target = this.targetFor(page);
      if (!target) return;
      const viewportRect = this.viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const delta = document.dir === 'rtl' ? targetRect.right - viewportRect.right : targetRect.left - viewportRect.left;
      this.viewport.scrollBy({ left: delta, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      this.index = page;
      this.updateControls();
    }

    syncFromScroll() {
      const viewportRect = this.viewport.getBoundingClientRect();
      const edge = document.dir === 'rtl' ? viewportRect.right : viewportRect.left;
      let closest = 0;
      let distance = Infinity;
      this.slides.forEach((slide, slideIndex) => {
        const rect = slide.getBoundingClientRect();
        const slideEdge = document.dir === 'rtl' ? rect.right : rect.left;
        const currentDistance = Math.abs(slideEdge - edge);
        if (currentDistance < distance) { distance = currentDistance; closest = slideIndex; }
      });
      this.index = Math.min(this.pages - 1, Math.round(closest / this.perView));
      this.updateControls();
    }

    updateControls() {
      if (this.prev) this.prev.disabled = !this.loop && this.index <= 0;
      if (this.next) this.next.disabled = !this.loop && this.index >= this.pages - 1;
      [...(this.dots?.children || [])].forEach((dot, dotIndex) => dot.setAttribute('aria-current', dotIndex === this.index ? 'true' : 'false'));
    }

    updatePause() {
      this.paused = document.hidden || this.focused || (this.pauseHover && this.hovered) || reducedMotion.matches;
      if (this.paused) this.stop(); else this.start();
    }

    start() {
      this.stop();
      if (!this.autoplay || this.paused || this.pages < 2) return;
      this.timer = window.setInterval(() => {
        if (!this.loop && this.index >= this.pages - 1) { this.stop(); return; }
        this.go(this.index + 1);
      }, this.delay);
    }

    stop() { if (this.timer) window.clearInterval(this.timer); this.timer = 0; }

    revealBlock(blockId) {
      if (!blockId) return;
      const item = this.root.querySelector(`[data-sp-block-id="${CSS.escape(blockId)}"]`);
      if (!item) return;
      const slideIndex = this.slides.indexOf(item);
      if (this.carousel && slideIndex >= 0) this.go(Math.floor(slideIndex / this.perView));
      else item.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
    }

    destroy() {
      this.stop();
      cancelAnimationFrame(this.resizeFrame);
      cancelAnimationFrame(this.scrollFrame);
      this.controller?.abort();
    }
  }

  const init = (scope = document) => {
    scope.querySelectorAll?.('[data-sp-featured-blog]').forEach((root) => {
      if (instances.has(root)) return;
      instances.set(root, new FeaturedBlogCarousel(root));
    });
  };

  const destroy = (scope) => {
    scope.querySelectorAll?.('[data-sp-featured-blog]').forEach((root) => {
      instances.get(root)?.destroy();
      instances.delete(root);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();

  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));
  document.addEventListener('shopify:block:select', (event) => {
    const root = event.target.closest?.('[data-sp-featured-blog]');
    instances.get(root)?.revealBlock(event.detail?.blockId || event.target.dataset.spBlockId);
  });
})();
