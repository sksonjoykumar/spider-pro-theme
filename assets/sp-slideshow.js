(() => {
  'use strict';

  if (customElements.get('sp-slideshow')) return;

  class SpiderSlideshow extends HTMLElement {
    connectedCallback() {
      if (this._initialized) return;
      this._initialized = true;
      this._destroyed = false;
      this.slides = Array.from(this.querySelectorAll('[data-slide-index]'));
      this.dots = Array.from(this.querySelectorAll('[data-slideshow-dot]'));
      this.previousButton = this.querySelector('[data-slideshow-prev]');
      this.nextButton = this.querySelector('[data-slideshow-next]');
      this.autoplay = this.dataset.autoplay === 'true';
      this.interval = Math.max(3000, Number.parseInt(this.dataset.interval, 10) || 5000);
      this.pauseOnHover = this.dataset.pauseHover === 'true';
      this.designMode = this.dataset.designMode === 'true';
      this.currentIndex = Math.max(0, this.slides.findIndex((slide) => slide.classList.contains('is-active')));
      this.timer = null;
      this.hovered = false;
      this.focusWithin = false;
      this.inViewport = true;
      this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.onPrevious = () => this.goTo(this.currentIndex - 1, true);
      this.onNext = () => this.goTo(this.currentIndex + 1, true);
      this.onDotClick = (event) => {
        const button = event.target.closest('[data-slideshow-dot]');
        if (!button || !this.contains(button)) return;
        const index = Number.parseInt(button.dataset.slideshowDot, 10);
        if (Number.isFinite(index)) this.goTo(index, true);
      };
      this.onKeydown = (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches('input, textarea, select')) return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          this.goTo(this.currentIndex - 1, true);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          this.goTo(this.currentIndex + 1, true);
        }
      };
      this.onPointerEnter = () => {
        this.hovered = true;
        if (this.pauseOnHover) this.stopAutoplay();
      };
      this.onPointerLeave = () => {
        this.hovered = false;
        this.syncAutoplay();
      };
      this.onFocusIn = () => {
        this.focusWithin = true;
        this.stopAutoplay();
      };
      this.onFocusOut = (event) => {
        if (!event.relatedTarget || !this.contains(event.relatedTarget)) {
          this.focusWithin = false;
          this.syncAutoplay();
        }
      };
      this.onVisibilityChange = () => this.syncAutoplay();
      this.onReducedMotionChange = () => this.syncAutoplay();

      this.previousButton?.addEventListener('click', this.onPrevious);
      this.nextButton?.addEventListener('click', this.onNext);
      this.querySelector('.sp-slideshow__pagination')?.addEventListener('click', this.onDotClick);
      this.addEventListener('keydown', this.onKeydown);
      this.addEventListener('focusin', this.onFocusIn);
      this.addEventListener('focusout', this.onFocusOut);
      if (this.pauseOnHover) {
        this.addEventListener('pointerenter', this.onPointerEnter, { passive: true });
        this.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
      }
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.reducedMotionQuery.addEventListener?.('change', this.onReducedMotionChange);

      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver((entries) => {
          const entry = entries[0];
          this.inViewport = Boolean(entry && entry.isIntersecting);
          this.syncAutoplay();
        }, { threshold: 0.1 });
        this.observer.observe(this);
      }

      this.goTo(this.currentIndex, false);
      this.syncAutoplay();
    }

    disconnectedCallback() {
      this.destroy();
    }

    goTo(index, userInitiated = false) {
      if (!this.slides || this.slides.length === 0) return;
      const count = this.slides.length;
      const nextIndex = ((index % count) + count) % count;
      this.currentIndex = nextIndex;

      this.slides.forEach((slide, slideIndex) => {
        const active = slideIndex === nextIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });

      this.dots.forEach((dot, dotIndex) => {
        const active = dotIndex === nextIndex;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-current', active ? 'true' : 'false');
      });

      if (userInitiated) this.stopAutoplay();
      this.syncAutoplay();
    }

    canAutoplay() {
      return this.autoplay
        && !this.designMode
        && this.slides.length > 1
        && !this.reducedMotionQuery.matches
        && !document.hidden
        && this.inViewport
        && !this.focusWithin
        && !(this.pauseOnHover && this.hovered);
    }

    syncAutoplay() {
      if (this.canAutoplay()) {
        if (this.timer) return;
        this.timer = window.setInterval(() => {
          if (!this._destroyed) this.goTo(this.currentIndex + 1, false);
        }, this.interval);
      } else {
        this.stopAutoplay();
      }
    }

    stopAutoplay() {
      if (!this.timer) return;
      window.clearInterval(this.timer);
      this.timer = null;
    }

    destroy() {
      if (!this._initialized || this._destroyed) return;
      this._destroyed = true;
      this.stopAutoplay();
      this.observer?.disconnect();
      this.previousButton?.removeEventListener('click', this.onPrevious);
      this.nextButton?.removeEventListener('click', this.onNext);
      this.querySelector('.sp-slideshow__pagination')?.removeEventListener('click', this.onDotClick);
      this.removeEventListener('keydown', this.onKeydown);
      this.removeEventListener('focusin', this.onFocusIn);
      this.removeEventListener('focusout', this.onFocusOut);
      if (this.pauseOnHover) {
        this.removeEventListener('pointerenter', this.onPointerEnter);
        this.removeEventListener('pointerleave', this.onPointerLeave);
      }
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.reducedMotionQuery?.removeEventListener?.('change', this.onReducedMotionChange);
      this._initialized = false;
    }
  }

  customElements.define('sp-slideshow', SpiderSlideshow);
})();
