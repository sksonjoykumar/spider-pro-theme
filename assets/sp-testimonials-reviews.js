(() => {
  if (window.SpiderTestimonialsReviews) return;

  const instances = new Map();
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class SpiderTestimonialsReviews {
    constructor(root) {
      this.root = root;
      this.sectionId = root.dataset.spSectionId;
      this.viewport = root.querySelector('[data-sp-testimonials-viewport]');
      this.slides = Array.from(root.querySelectorAll('[data-sp-testimonial-slide]'));
      this.previous = root.querySelector('[data-sp-testimonials-prev]');
      this.next = root.querySelector('[data-sp-testimonials-next]');
      this.dots = Array.from(root.querySelectorAll('[data-sp-testimonials-dot]'));
      this.status = root.querySelector('[data-sp-testimonials-status]');
      this.abort = new AbortController();
      this.timer = null;
      this.scrollFrame = null;
      this.index = 0;
      this.pageCount = 1;
      this.active = false;
      this.dragging = false;
      this.dragX = 0;

      if (!this.viewport || this.slides.length < 2 || root.dataset.spCarousel !== 'true') return;
      this.bind();
      this.refresh();
      this.startAutoplay();
      this.active = true;
    }

    get perView() {
      const width = window.innerWidth;
      if (this.root.dataset.spLayout === 'style_1') {
        return width < 750 ? Number(getComputedStyle(this.root).getPropertyValue('--sp-testimonials-columns-m')) || 1 : this.slides.length;
      }
      if (width < 750) return Number(getComputedStyle(this.root).getPropertyValue('--sp-testimonials-slides-m')) || 1;
      if (width < 1200) return Number(getComputedStyle(this.root).getPropertyValue('--sp-testimonials-slides-t')) || 2;
      return Number(getComputedStyle(this.root).getPropertyValue('--sp-testimonials-slides-d')) || 4;
    }

    bind() {
      const options = { signal: this.abort.signal };
      this.viewport.dataset.spSwipeEnabled = this.root.dataset.spSwipe;
      this.previous?.addEventListener('click', () => this.move(-1, true), options);
      this.next?.addEventListener('click', () => this.move(1, true), options);
      this.dots.forEach((dot) => dot.addEventListener('click', () => this.goTo(Number(dot.dataset.index) * this.perView, true), options));
      this.viewport.addEventListener('scroll', () => {
        cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = requestAnimationFrame(() => this.syncFromScroll());
      }, { ...options, passive: true });
      if (this.root.dataset.spSwipe === 'true') {
        this.viewport.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a, button')) return;
          this.dragging = true;
          this.dragX = event.clientX;
          this.viewport.setPointerCapture(event.pointerId);
          this.viewport.classList.add('is-dragging');
          this.pauseAutoplay();
        }, options);
        this.viewport.addEventListener('pointermove', (event) => {
          if (!this.dragging) return;
          const delta = event.clientX - this.dragX;
          this.dragX = event.clientX;
          this.viewport.scrollBy({ left: -delta, behavior: 'auto' });
        }, options);
        const finishDrag = () => {
          if (!this.dragging) return;
          this.dragging = false;
          this.viewport.classList.remove('is-dragging');
          this.syncFromScroll();
          this.startAutoplay();
        };
        this.viewport.addEventListener('pointerup', finishDrag, options);
        this.viewport.addEventListener('pointercancel', finishDrag, options);
      }
      window.addEventListener('resize', () => this.refresh(), options);
      if (this.root.dataset.spPauseHover === 'true') {
        this.root.addEventListener('mouseenter', () => this.pauseAutoplay(), options);
        this.root.addEventListener('mouseleave', () => this.startAutoplay(), options);
      }
      this.root.addEventListener('focusin', () => this.pauseAutoplay(), options);
      this.root.addEventListener('focusout', (event) => {
        if (!this.root.contains(event.relatedTarget)) this.startAutoplay();
      }, options);
    }

    refresh() {
      const wasActive = this.active;
      this.pageCount = Math.max(1, Math.ceil(this.slides.length / this.perView));
      this.index = Math.min(this.index, Math.max(0, (this.pageCount - 1) * this.perView));
      this.dots.forEach((dot, i) => {
        const visible = i < this.pageCount;
        dot.hidden = !visible;
        dot.dataset.index = i;
      });
      const controls = this.root.querySelector('[data-sp-testimonials-controls]');
      if (controls) controls.hidden = this.pageCount <= 1;
      this.updateControls(false);
      if (wasActive) this.goTo(this.index, false);
    }

    move(direction, announce) {
      const step = this.perView;
      let target = this.index + (direction * step);
      const last = (this.pageCount - 1) * step;
      if (this.root.dataset.spInfinite === 'true') {
        if (target > last) target = 0;
        if (target < 0) target = last;
      } else {
        target = Math.max(0, Math.min(target, last));
      }
      this.goTo(target, announce);
      this.restartAutoplay();
    }

    goTo(index, announce) {
      this.index = Math.max(0, Math.min(index, this.slides.length - 1));
      const slide = this.slides[this.index];
      if (!slide) return;
      const viewportBox = this.viewport.getBoundingClientRect();
      const slideBox = slide.getBoundingClientRect();
      const rtl = getComputedStyle(this.root).direction === 'rtl';
      const left = rtl ? slideBox.right - viewportBox.right : slideBox.left - viewportBox.left;
      this.viewport.scrollBy({ left, behavior: reducedMotion() ? 'auto' : 'smooth' });
      this.updateControls(announce);
    }

    syncFromScroll() {
      const viewportBox = this.viewport.getBoundingClientRect();
      const rtl = getComputedStyle(this.root).direction === 'rtl';
      let closest = 0;
      let distance = Infinity;
      this.slides.forEach((slide, index) => {
        const box = slide.getBoundingClientRect();
        const current = Math.abs(rtl ? box.right - viewportBox.right : box.left - viewportBox.left);
        if (current < distance) { distance = current; closest = index; }
      });
      this.index = Math.floor(closest / this.perView) * this.perView;
      this.updateControls(false);
    }

    updateControls(announce) {
      const page = Math.min(this.pageCount - 1, Math.floor(this.index / this.perView));
      this.dots.forEach((dot, i) => {
        if (i === page) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      if (this.root.dataset.spInfinite !== 'true') {
        if (this.previous) this.previous.disabled = page === 0;
        if (this.next) this.next.disabled = page >= this.pageCount - 1;
      }
      if (announce && this.status) this.status.textContent = `Review page ${page + 1} of ${this.pageCount}`;
    }

    startAutoplay() {
      if (this.root.dataset.spAutoplay !== 'true' || reducedMotion() || document.hidden) return;
      if (this.root.dataset.spPauseHover === 'true' && (this.root.matches(':hover') || this.root.contains(document.activeElement))) return;
      this.pauseAutoplay();
      const speed = Number(this.root.dataset.spAutoplaySpeed) || 5000;
      this.timer = window.setInterval(() => this.move(1, false), speed);
    }

    pauseAutoplay() { window.clearInterval(this.timer); this.timer = null; }
    restartAutoplay() { this.pauseAutoplay(); this.startAutoplay(); }
    selectBlock(block) {
      const slide = block?.querySelector('[data-sp-testimonial-slide]') || block?.closest('[data-sp-testimonial-slide]');
      const index = this.slides.indexOf(slide);
      if (index >= 0) { this.pauseAutoplay(); this.goTo(index, false); }
    }
    destroy() {
      this.pauseAutoplay();
      cancelAnimationFrame(this.scrollFrame);
      this.abort.abort();
    }
  }

  const init = (scope = document) => {
    scope.querySelectorAll?.('[data-sp-testimonials]').forEach((root) => {
      const id = root.dataset.spSectionId;
      instances.get(id)?.destroy();
      instances.set(id, new SpiderTestimonialsReviews(root));
    });
  };

  const unload = (section) => {
    const root = section.querySelector?.('[data-sp-testimonials]');
    if (!root) return;
    instances.get(root.dataset.spSectionId)?.destroy();
    instances.delete(root.dataset.spSectionId);
  };

  document.addEventListener('DOMContentLoaded', () => init());
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => unload(event.target));
  document.addEventListener('shopify:block:select', (event) => {
    const root = event.target.closest?.('[data-sp-testimonials]');
    if (root) instances.get(root.dataset.spSectionId)?.selectBlock(event.target);
  });
  document.addEventListener('visibilitychange', () => instances.forEach((instance) => document.hidden ? instance.pauseAutoplay() : instance.startAutoplay()));

  window.SpiderTestimonialsReviews = { init, instances };
  if (document.readyState !== 'loading') init();
})();
