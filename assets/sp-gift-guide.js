/* Spider Gift Guide — independent section instances, no external libraries. */
(() => {
  'use strict';
  const singletonKey = Symbol.for('spider.gift-guide.runtime');
  if (window[singletonKey]) { window[singletonKey].init(document); return; }
  const instances = new Map();
  const motionReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const norm = str => String(str || '').trim().toLowerCase();

  class GiftGuide {
    constructor(root) {
      this.root = root;
      this.id = root.dataset.spSectionId;
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.style = [...root.classList].find(c => c.startsWith('sp-gift-guide--style_')) || '';
      this.track = root.querySelector('[data-sp-gift-cards]');
      if (!this.track) return;
      this.cards = [...root.querySelectorAll('[data-sp-gift-card]')];
      this.featuredSlot = root.querySelector('[data-sp-gift-featured-slot]');
      this.filterControls = root.querySelector('[data-sp-gift-guide-filter-controls]');
      this.filters = [...root.querySelectorAll('[data-sp-gift-filter]')];
      this.clear = root.querySelector('[data-sp-gift-clear]');
      this.live = root.querySelector('[data-sp-gift-live]');
      this.empty = root.querySelector('[data-sp-gift-empty]');
      this.prev = root.querySelector('[data-sp-gift-prev]');
      this.next = root.querySelector('[data-sp-gift-next]');
      this.progress = root.querySelector('[data-sp-gift-progress]');
      this.carousel = this.style.endsWith('style_3');
      this.currentFilter = 'all';
      this.draggedAt = 0;
      this.pauses = new Set();
      this.timer = 0;
      this.drag = null;
      this.enabled = root.dataset.spEnableFilters === 'true';
      this.root.classList.add('sp-gift-guide--ready');
      if (this.enabled && this.filters.length) this.setupFilters();
      else if (this.filterControls) this.filterControls.hidden = true;
      if (this.carousel) this.setupCarousel();
      this.applyFilter(false);
    }
    setupFilters() {
      this.filters.forEach(btn => btn.addEventListener('click', () => this.setFilter(norm(btn.dataset.spGiftFilter), true), {signal:this.signal}));
      this.clear?.addEventListener('click', () => this.setFilter('all', true), {signal:this.signal});
      let initial = norm(this.root.dataset.spDefaultFilter);
      if (initial === 'all') {
        const editorialDefault = this.filters.find(x => x.dataset.spGiftDefault === 'true');
        if (editorialDefault) initial = norm(editorialDefault.dataset.spGiftFilter);
      }
      const chosen = this.filters.find(x => norm(x.dataset.spGiftFilter) === initial);
      if (!chosen) {
        const defaultButton = this.filters.find(x => x.getAttribute('aria-pressed') === 'true');
        initial = norm(defaultButton?.dataset.spGiftFilter || this.filters[0]?.dataset.spGiftFilter || 'all');
      }
      this.currentFilter = initial;
    }
    setFilter(key, announce = true) {
      this.currentFilter = key || 'all';
      this.applyFilter(announce);
    }
    matches(card) {
      if (!this.enabled || this.currentFilter === 'all') return true;
      const keys = String(card.dataset.spGiftKeys || '').split(',').map(norm);
      return keys.includes(this.currentFilter);
    }
    applyFilter(announce) {
      this.cards.forEach(card => { card.hidden = !this.matches(card); });
      const visible = this.cards.filter(card => !card.hidden);
      this.empty && (this.empty.hidden = visible.length > 0);
      this.filters.forEach(btn => {
        const active = norm(btn.dataset.spGiftFilter) === this.currentFilter;
        btn.setAttribute('aria-pressed', String(active));
      });
      if (this.clear) this.clear.hidden = this.currentFilter === 'all';
      // Dynamic mosaic: reflow the same DOM nodes, never clone gift cards.
      this.cards.forEach(c => c.classList.remove('sp-gift-guide__card--active-featured'));
      const featured = visible.find(c => c.dataset.spGiftIsFeatured === 'true') || visible[0];
      if (featured) featured.classList.add('sp-gift-guide__card--active-featured');
      if (this.carousel) this.relocateFeatured(featured);
      if (this.live && announce) {
        const word = this.root.dataset.spSelectedCountText || 'gift guides available';
        this.live.textContent = `${visible.length} ${word}`;
      }
      if (this.carousel) {
        this.track.scrollLeft = 0;
        requestAnimationFrame(() => this.updateCarousel());
      }
    }
    relocateFeatured(featured) {
      if (!this.featuredSlot) return;
      // Preserve exact merchant block order inside the scroll track.
      this.cards.forEach(c => this.track.appendChild(c));
      if (featured) this.featuredSlot.appendChild(featured);
    }
    setupCarousel() {
      this.track.tabIndex = 0;
      this.track.setAttribute('aria-label', this.root.dataset.spCarouselKeyLabel || 'Gift guide carousel');
      this.track.addEventListener('scroll', () => this.updateCarousel(), {passive:true,signal:this.signal});
      this.prev?.addEventListener('click', () => this.move(-1), {signal:this.signal});
      this.next?.addEventListener('click', () => this.move(1), {signal:this.signal});
      this.track.addEventListener('keydown', e => {
        if (e.target !== this.track) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const rtl = getComputedStyle(this.track).direction === 'rtl';
          const direction = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
          e.preventDefault(); this.move(direction);
        }
      }, {signal:this.signal});
      // Touch uses native overflow scrolling; mouse/pen may drag without selecting text.
      this.track.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch' || e.button !== 0) return;
        this.drag = {id:e.pointerId, x:e.clientX, left:this.track.scrollLeft, moved:false};
        this.pauses.add('drag'); this.stopAutoplay();
      }, {signal:this.signal});
      this.track.addEventListener('pointermove', e => {
        if (!this.drag || this.drag.id !== e.pointerId) return;
        const dx = e.clientX - this.drag.x;
        if (Math.abs(dx) > 7) {
          if (!this.drag.moved) {this.drag.moved=true;this.track.setPointerCapture?.(e.pointerId);this.track.classList.add('sp-gift-guide__cards--dragging');}
          this.track.scrollLeft = this.drag.left - dx;
        }
      }, {signal:this.signal});
      const end = e => {
        if (!this.drag || this.drag.id !== e.pointerId) return;
        if (this.drag.moved) this.draggedAt = Date.now();
        this.drag = null;
        this.track.classList.remove('sp-gift-guide__cards--dragging');
        this.pauses.delete('drag'); this.startAutoplay();
      };
      this.track.addEventListener('pointerup',end,{signal:this.signal});
      this.track.addEventListener('pointercancel',end,{signal:this.signal});
      this.track.addEventListener('lostpointercapture',end,{signal:this.signal});
      this.track.addEventListener('click', e => {
        if (Date.now()-this.draggedAt < 350) { e.preventDefault();e.stopPropagation(); }
      }, {signal:this.signal,capture:true});
      this.root.addEventListener('mouseenter',() => { if(this.root.dataset.spCarouselHoverPause === 'true'){this.pauses.add('hover');this.stopAutoplay();} },{signal:this.signal});
      this.root.addEventListener('mouseleave',() => {this.pauses.delete('hover');this.startAutoplay();},{signal:this.signal});
      this.root.addEventListener('focusin',() => {this.pauses.add('focus');this.stopAutoplay();},{signal:this.signal});
      this.root.addEventListener('focusout',e => {if(!this.root.contains(e.relatedTarget)){this.pauses.delete('focus');this.startAutoplay();}},{signal:this.signal});
      document.addEventListener('visibilitychange',()=> {if(document.hidden){this.pauses.add('hidden');this.stopAutoplay();}else{this.pauses.delete('hidden');this.startAutoplay();}},{signal:this.signal});
      window.addEventListener('resize',()=>this.updateCarousel(),{passive:true,signal:this.signal});
      this.updateCarousel(); this.startAutoplay();
    }
    visibleTrackCards() { return this.cards.filter(c => c.parentElement === this.track && !c.hidden); }
    move(direction) {
      const card = this.visibleTrackCards()[0];
      if (!card) return;
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      const delta = (card.getBoundingClientRect().width + gap) * direction;
      const rtl = getComputedStyle(this.track).direction === 'rtl';
      this.track.scrollBy({left:rtl ? -delta : delta,behavior:motionReduced()?'instant':'smooth'});
    }
    updateCarousel() {
      if (!this.carousel) return;
      const max = Math.max(0,this.track.scrollWidth-this.track.clientWidth);
      const rtl = getComputedStyle(this.track).direction === 'rtl';
      const pos = rtl ? Math.abs(this.track.scrollLeft) : this.track.scrollLeft;
      const progress = max ? Math.max(0,Math.min(1,pos/max)) : 0;
      if(this.prev) this.prev.disabled = max < 2 || pos <= 2;
      if(this.next) this.next.disabled = max < 2 || pos >= max-2;
      if(this.progress) this.progress.style.width = `${Math.round((max ? .2 + progress*.8 : 1)*100)}%`;
    }
    stopAutoplay() {if (this.timer) clearInterval(this.timer);this.timer=0;}
    startAutoplay() {
      this.stopAutoplay();
      if(!this.carousel || this.root.dataset.spCarouselAutoplay !== 'true' || this.root.dataset.spDesignMode === 'true' || motionReduced() || document.hidden || this.pauses.size) return;
      const speed = Math.max(3000,Number(this.root.dataset.spCarouselSpeed) || 5000);
      this.timer = setInterval(() => {if(this.next?.disabled){this.track.scrollTo({left:0,behavior:'smooth'});}else{this.move(1);}},speed);
    }
    revealBlock(blockId) {
      const chosen = this.cards.find(c => c.dataset.spGiftCardId === blockId);
      if(!chosen) return false;
      if(this.enabled && this.currentFilter !== 'all' && !this.matches(chosen)) {
        const keys = String(chosen.dataset.spGiftKeys || '').split(',').map(norm);
        const key = keys.find(k => this.filters.some(btn => norm(btn.dataset.spGiftFilter) === k));
        this.setFilter(key || 'all',false);
      }
      if(chosen.hidden) this.setFilter('all',false);
      chosen.scrollIntoView({behavior:motionReduced()?'instant':'smooth',block:'nearest',inline:'nearest'});
      return true;
    }
    destroy() {
      this.stopAutoplay(); this.abort.abort();
      if(this.carousel && this.featuredSlot) this.cards.forEach(c => this.track.appendChild(c));
      this.root.classList.remove('sp-gift-guide--ready');
    }
  }
  function init(scope=document) {
    const roots = scope.matches?.('[data-sp-gift-guide]') ? [scope] : [...scope.querySelectorAll('[data-sp-gift-guide]')];
    roots.forEach(root => {const id=root.dataset.spSectionId; if(!id || (instances.has(id) && instances.get(id).root === root))return; instances.get(id)?.destroy(); instances.set(id,new GiftGuide(root));});
  }
  function unload(sectionId) {for (const [id,instance] of instances) {if(id===sectionId){instance.destroy();instances.delete(id);}}}
  window[singletonKey] = { init };
  init();
  document.addEventListener('shopify:section:load',event => init(event.target));
  document.addEventListener('shopify:section:unload',event => {const root=event.target.matches?.('[data-sp-gift-guide]') ? event.target : event.target.querySelector('[data-sp-gift-guide]');if(root)unload(root.dataset.spSectionId);});
  document.addEventListener('shopify:block:select',event => {
    for(const instance of instances.values()) if(instance.root.contains(event.target)) {
      const filter = event.target.closest?.('[data-sp-gift-filter]');
      if(filter) instance.setFilter(norm(filter.dataset.spGiftFilter),false);
      else instance.revealBlock(event.detail?.blockId);
      break;
    }
  });
})();
