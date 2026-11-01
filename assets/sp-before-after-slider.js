/* Spider Before & After Slider — no dependencies, supports Shopify editor lifecycle. */
(() => {
  'use strict';
  if (window.SpiderBeforeAfterSlider) return;
  const controllers = new Map();
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

  class SpiderBeforeAfter {
    constructor(root) {
      this.root = root;
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.mode = root.dataset.spBaStyle;
      this.vertical = root.classList.contains('sp-ba--vertical');
      this.reverse = root.classList.contains('sp-ba--reverse');
      this.comparisons = Array.from(root.querySelectorAll('[data-sp-ba-comparison]'));
      this.position = 0;
      this.pointer = null;
      this.pointerStart = null;
      this.swipeCandidate = null;
      this.paused = false;
      this.interval = null;
      this.pendingFrames = new Set();
      this.init();
    }

    listen(node, event, callback, options = {}) {
      if (node) node.addEventListener(event, callback, { ...options, signal: this.signal });
    }

    init() {
      if (!this.comparisons.length) return;
      // A static view remains available until *all* handlers are installed.
      if (this.mode !== 'style_5' && this.mode !== 'style_3') {
        this.comparisons.forEach((comparison) => this.initRange(comparison));
      } else {
        this.comparisons.forEach((comparison) => this.initToggle(comparison));
      }
      if (this.mode === 'style_4' || this.mode === 'style_5') this.initGallery();
      this.root.classList.add('sp-ba--enhanced');
      if (this.mode === 'style_4' || this.mode === 'style_5') this.show(this.position, false);
    }

    interacted() {
      if (this.root.dataset.spBaHideHelper === 'true') {
        const helper = this.root.querySelector('[data-sp-ba-helper]');
        if (helper) helper.hidden = true;
      }
      if (this.mode === 'style_4' && !this.pointer) this.resetAutoplay();
    }

    initRange(comparison) {
      const frame = comparison.querySelector('[data-sp-ba-frame]');
      const range = comparison.querySelector('[data-sp-ba-range]');
      if (!frame || !range) return;
      let animationFrame = 0;
      let pendingPosition = Number(range.value);
      const sync = (value, userInput = false) => {
        const position = clamp(Math.round(Number(value) || 0), 0, 100);
        range.value = String(position);
        range.setAttribute('aria-valuetext', `${position} percent before, ${100 - position} percent after`);
        pendingPosition = position;
        if (!animationFrame) {
          animationFrame = requestAnimationFrame(() => {
            comparison.style.setProperty('--sp-ba-position', `${pendingPosition}%`);
            this.pendingFrames.delete(animationFrame);
            animationFrame = 0;
          });
          this.pendingFrames.add(animationFrame);
        }
        if (userInput) this.interacted();
      };
      const coordinate = (e) => {
        const bounds = frame.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return Number(range.value);
        const fraction = this.vertical
          ? clamp((e.clientY - bounds.top) / bounds.height, 0, 1)
          : clamp((e.clientX - bounds.left) / bounds.width, 0, 1);
        return (this.reverse ? 1 - fraction : fraction) * 100;
      };
      sync(range.value);
      // Most frame taps are available in horizontal mode. In vertical mode dragging
      // starts only on the handle, preserving ordinary vertical page scrolling.
      this.listen(frame, 'pointerdown', (e) => {
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.target.closest('button,a')) return;
        if (this.vertical && !e.target.closest('[data-sp-ba-range]')) return;
        const onRange = Boolean(e.target.closest('[data-sp-ba-range]'));
        // On touch screens, swiping the photograph navigates the carousel;
        // dragging its visible handle controls the image reveal.
        if (this.mode === 'style_4' && e.pointerType === 'touch' && !onRange) {
          this.swipeCandidate = { id: e.pointerId, x: e.clientX, y: e.clientY, frame, sync, coordinate };
          return;
        }
        if (onRange) {
          e.preventDefault();
          try { range.focus({ preventScroll: true }); } catch (_) { range.focus(); }
        }
        this.pointer = { frame, id: e.pointerId };
        frame.classList.add('sp-ba__frame--dragging');
        try { frame.setPointerCapture(e.pointerId); } catch (_) {}
        sync(coordinate(e), true);
      });
      this.listen(frame, 'pointermove', (e) => {
        if (this.swipeCandidate?.frame === frame && this.swipeCandidate.id === e.pointerId) {
          const dx = e.clientX - this.swipeCandidate.x;
          const dy = e.clientY - this.swipeCandidate.y;
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            const rtl = getComputedStyle(frame).direction === 'rtl';
            this.swipeCandidate = null;
            this.show(this.position + (dx < 0 ? (rtl ? -1 : 1) : (rtl ? 1 : -1)), true);
          }
          return;
        }
        if (!this.pointer || this.pointer.frame !== frame || e.pointerId !== this.pointer.id) return;
        sync(coordinate(e), true);
      });
      const finish = (e) => {
        if (this.swipeCandidate?.frame === frame && this.swipeCandidate.id === e.pointerId) {
          const candidate = this.swipeCandidate;
          this.swipeCandidate = null;
          if (e.type === 'pointerup' && Math.abs(e.clientX - candidate.x) < 15 && Math.abs(e.clientY - candidate.y) < 15) sync(coordinate(e), true);
          return;
        }
        if (!this.pointer || this.pointer.frame !== frame || e.pointerId !== this.pointer.id) return;
        frame.classList.remove('sp-ba__frame--dragging');
        try { if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId); } catch (_) {}
        this.pointer = null;
        if (this.mode === 'style_4') this.resetAutoplay();
      };
      this.listen(frame, 'pointerup', finish);
      this.listen(frame, 'pointercancel', finish);
      this.listen(frame, 'lostpointercapture', finish);
      this.listen(range, 'input', () => sync(range.value, true));
      this.listen(range, 'keydown', (e) => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) return;
        e.preventDefault();
        let next = Number(range.value);
        if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = 100;
        else if (e.key === 'PageUp') next += 10;
        else if (e.key === 'PageDown') next -= 10;
        else if (this.vertical && e.key === 'ArrowUp') next += this.reverse ? 1 : -1;
        else if (this.vertical && e.key === 'ArrowDown') next += this.reverse ? -1 : 1;
        else if (!this.vertical && e.key === 'ArrowRight') next += this.reverse ? -1 : 1;
        else if (!this.vertical && e.key === 'ArrowLeft') next += this.reverse ? 1 : -1;
        else if (e.key === 'ArrowUp') next += 1;
        else if (e.key === 'ArrowDown') next -= 1;
        sync(next, true);
      });
    }

    initToggle(comparison) {
      const buttons = Array.from(comparison.querySelectorAll('[data-sp-ba-toggle]'));
      const set = (state, userInput = false) => {
        comparison.dataset.spBaState = state;
        buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.spBaToggle === state)));
        if (userInput) this.interacted();
      };
      buttons.forEach((button) => {
        this.listen(button, 'click', () => set(button.dataset.spBaToggle, true));
      });
      set('before');
    }

    initGallery() {
      this.comparisons.forEach((comparison, i) => comparison.dataset.spBaIndex = i);
      this.listen(this.root, 'click', (e) => {
        const goto = e.target.closest('[data-sp-ba-goto]');
        const arrow = e.target.closest('[data-sp-ba-nav]');
        if (goto && this.root.contains(goto)) {
          this.show(Number(goto.dataset.spBaGoto), true);
        } else if (arrow && this.root.contains(arrow)) {
          this.show(this.position + (arrow.dataset.spBaNav === 'next' ? 1 : -1), true);
        }
      });
      if (this.mode !== 'style_4') return;
      this.listen(this.root, 'mouseenter', () => {
        if (this.root.dataset.spBaPauseHover === 'true') this.paused = true;
      });
      this.listen(this.root, 'mouseleave', () => { this.paused = false; });
      this.listen(this.root, 'focusin', () => { this.paused = true; });
      this.listen(this.root, 'focusout', (e) => {
        if (!this.root.contains(e.relatedTarget)) this.paused = false;
      });
      this.listen(document, 'visibilitychange', () => {
        if (document.hidden) this.paused = true;
        else this.paused = false;
      });
      if (this.root.dataset.spBaSwipe === 'true') this.initSwipe();
      this.resetAutoplay();
    }

    initSwipe() {
      const track = this.root.querySelector('[data-sp-ba-track]');
      if (!track) return;
      // Only swipes outside the comparison image drag surface change slides.
      this.listen(track, 'pointerdown', (e) => {
        if (e.target.closest('[data-sp-ba-frame],button,a,input') || !e.isPrimary) return;
        this.pointerStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
      });
      this.listen(track, 'pointerup', (e) => {
        if (!this.pointerStart || this.pointerStart.id !== e.pointerId) return;
        const dx = e.clientX - this.pointerStart.x;
        const dy = e.clientY - this.pointerStart.y;
        this.pointerStart = null;
        if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        const rtl = getComputedStyle(track).direction === 'rtl';
        this.show(this.position + (dx < 0 ? (rtl ? -1 : 1) : (rtl ? 1 : -1)), true);
      });
      this.listen(track, 'pointercancel', () => { this.pointerStart = null; });
    }

    show(requested, userInput = false) {
      const count = this.comparisons.length;
      if (!count) return;
      let next = Number.isFinite(requested) ? Math.trunc(requested) : 0;
      if (this.root.dataset.spBaLoop === 'true') next = (next + count) % count;
      else next = clamp(next, 0, count - 1);
      this.position = next;
      this.comparisons.forEach((comparison, i) => {
        comparison.hidden = i !== next;
        if ('inert' in comparison) comparison.inert = i !== next;
      });
      this.root.querySelectorAll('[data-sp-ba-goto]').forEach((button) => {
        button.setAttribute('aria-current', String(Number(button.dataset.spBaGoto) === next));
      });
      const fraction = this.root.querySelector('[data-sp-ba-fraction]');
      if (fraction) fraction.textContent = `${next + 1} / ${count}`;
      const prev = this.root.querySelector('[data-sp-ba-nav="prev"]');
      const nextButton = this.root.querySelector('[data-sp-ba-nav="next"]');
      if (prev) prev.disabled = this.root.dataset.spBaLoop !== 'true' && next === 0;
      if (nextButton) nextButton.disabled = this.root.dataset.spBaLoop !== 'true' && next === count - 1;
      if (userInput) this.interacted();
    }

    resetAutoplay() {
      if (this.interval) clearInterval(this.interval);
      this.interval = null;
      if (this.mode !== 'style_4' || this.root.dataset.spBaAutoplay !== 'true'
          || reducedMotion() || this.comparisons.length < 2) return;
      const delay = clamp(Number(this.root.dataset.spBaSpeed) || 6000, 3000, 12000);
      this.interval = window.setInterval(() => {
        if (this.paused || document.hidden || reducedMotion() || this.pointer) return;
        const next = this.position + 1;
        if (next >= this.comparisons.length && this.root.dataset.spBaLoop !== 'true') return;
        this.show(next, false);
      }, delay);
    }

    blockSelected(target) {
      const item = target.closest?.('[data-sp-ba-comparison]');
      if (item && this.root.contains(item) && ['style_4','style_5'].includes(this.mode)) {
        this.show(this.comparisons.indexOf(item), false);
      }
    }

    destroy() {
      this.abort.abort();
      for (const frame of this.pendingFrames) cancelAnimationFrame(frame);
      this.pendingFrames.clear();
      if (this.interval) clearInterval(this.interval);
      this.comparisons.forEach((comparison) => {
        comparison.hidden = false;
        comparison.inert = false;
        comparison.querySelector('[data-sp-ba-frame]')?.classList.remove('sp-ba__frame--dragging');
      });
      this.pointer = null;
      this.swipeCandidate = null;
      this.root.classList.remove('sp-ba--enhanced');
    }
  }

  const initAll = (scope = document) => {
    if (scope.matches?.('[data-sp-ba-root]')) init(scope);
    scope.querySelectorAll?.('[data-sp-ba-root]').forEach(init);
  };
  const init = (root) => {
    if (controllers.has(root) || root.dataset.spBaStyle === 'style_3') return;
    try { controllers.set(root, new SpiderBeforeAfter(root)); }
    catch (error) { console.error('[Spider Before & After] Initialization failed', error); }
  };
  const unloadAll = (scope) => {
    for (const [root, controller] of controllers) {
      if (root === scope || scope.contains(root)) {
        controller.destroy();
        controllers.delete(root);
      }
    }
  };
  const onBlockSelect = (e) => {
    const root = e.target.closest?.('[data-sp-ba-root]');
    const controller = controllers.get(root);
    if (controller) controller.blockSelected(e.target);
  };
  document.addEventListener('shopify:section:load', (e) => initAll(e.target));
  document.addEventListener('shopify:section:unload', (e) => unloadAll(e.target));
  document.addEventListener('shopify:block:select', onBlockSelect);
  window.SpiderBeforeAfterSlider = { initAll, unloadAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
})();
