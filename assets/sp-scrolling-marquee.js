/* Spider Scrolling Marquee — standalone, editor-safe progressive enhancement. */
(() => {
  'use strict';
  if (window.__spScrollingMarqueeBooted) return;
  window.__spScrollingMarqueeBooted = true;
  const selector = '[data-sp-scrolling-marquee]';
  const registry = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const setPauseIcon = (btn, paused) => {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(paused));
    btn.setAttribute('aria-label', paused ? 'Resume marquee animation' : 'Pause marquee animation');
    const label = btn.querySelector('.sp-scrolling-marquee__pause-label');
    if (label) label.textContent = paused ? 'Play' : 'Pause';
    const svg = btn.querySelector('svg');
    if (svg) svg.innerHTML = paused ? '<path d="M8 5 19 12 8 19Z" fill="currentColor"/>' : '<path d="M7 5v14M17 5v14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>';
  };
  class Marquee {
    constructor(root) {
      this.root = root;
      this.rows = Array.from(root.querySelectorAll('[data-sp-marquee-row]'));
      this.pauses = new Set();
      this.abort = new AbortController();
      this.frame = 0;
      this.timer = 0;
      this.resizeObserver = null;
      this.isDrag = root.dataset.spLayout === 'style_5';
      this.button = root.querySelector('[data-sp-marquee-pause]');
      this.delay = Number(root.dataset.spDelay) || 3000;
      this.bypassDragClick = false;
      this.refresh = this.refresh.bind(this);
      this.schedule = this.schedule.bind(this);
      this.pause('motion', motion.matches);
      this.pause('hidden', document.hidden);
      if (root.dataset.spHover === 'true') {
        root.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') this.pause('hover', true); }, {signal:this.abort.signal});
        root.addEventListener('pointerleave', () => this.pause('hover', false), {signal:this.abort.signal});
      }
      if (root.dataset.spFocus !== 'false') {
        root.addEventListener('focusin', e => { if (e.target.closest('[data-sp-marquee-pause]')) { this.pause('focus', false); return; } this.pause('focus', true); const row = e.target.closest('[data-sp-marquee-row]'); if (row && !this.isDrag) { row.classList.add('is-editor-paused'); requestAnimationFrame(() => e.target.scrollIntoView({block:'nearest',inline:'nearest'})); } }, {signal:this.abort.signal});
        root.addEventListener('focusout', () => queueMicrotask(() => { const within = root.contains(document.activeElement); this.pause('focus', within); if (!within && !this.pauses.has('editor')) this.rows.forEach(row => row.classList.remove('is-editor-paused')); }), {signal:this.abort.signal});
      }
      if (root.dataset.spTouch === 'true') {
        root.addEventListener('touchstart', () => this.pause('touch', true), {passive:true,signal:this.abort.signal});
        root.addEventListener('touchend', () => this.laterResume(), {passive:true,signal:this.abort.signal});
        root.addEventListener('touchcancel', () => this.laterResume(), {passive:true,signal:this.abort.signal});
      }
      this.button?.addEventListener('click', () => {
        const paused = !this.pauses.has('user');
        this.pause('user', paused);
        setPauseIcon(this.button, paused);
      }, {signal:this.abort.signal});
      this.rows.forEach(row => {
        if (this.isDrag) this.enableDrag(row);
        else {
          const original = row.querySelector('[data-sp-marquee-original]');
          if (!original) return;
          Array.from(original.querySelectorAll('img')).forEach(img => {
            if (!img.complete) img.addEventListener('load', this.schedule, {signal:this.abort.signal});
          });
        }
      });
      if (!this.isDrag) {
        if ('ResizeObserver' in window) {
          this.resizeObserver = new ResizeObserver(() => this.schedule());
          this.resizeObserver.observe(root);
          this.rows.forEach(row => {
            const viewport = row.querySelector('[data-sp-marquee-viewport]');
            if (viewport) this.resizeObserver.observe(viewport);
          });
        } else window.addEventListener('resize', this.schedule, {signal:this.abort.signal});
        document.fonts?.ready?.then(() => { if (registry.get(this.root) === this) this.schedule(); });
        this.schedule();
      }
    }
    pause(reason, active) {
      if (active) this.pauses.add(reason);
      else this.pauses.delete(reason);
      this.root.classList.toggle('is-paused', this.pauses.size > 0);
    }
    laterResume() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.pause('touch', false), this.delay);
    }
    schedule() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.refresh(); });
    }
    refresh() {
      if (this.isDrag || !this.root.isConnected) return;
      this.rows.forEach(row => {
        const viewport = row.querySelector('[data-sp-marquee-viewport]');
        const track = row.querySelector('[data-sp-marquee-track]');
        const original = row.querySelector('[data-sp-marquee-original]');
        if (!viewport || !track || !original || !original.children.length) return;
        track.querySelectorAll('[data-sp-marquee-clone]').forEach(node => node.remove());
        row.classList.remove('is-ready');
        if (motion.matches) return;
        /* Measuring a single group in scrolling mode makes its width independent of viewport. */
        row.classList.add('is-ready');
        const distance = original.getBoundingClientRect().width;
        const width = viewport.getBoundingClientRect().width;
        if (!(distance > 0) || !(width > 0)) { row.classList.remove('is-ready'); return; }
        /* Each clone covers one full original group; leave an extra full group on-screen. */
        const copies = Math.min(100, Math.max(2, Math.ceil(width / distance) + 2));
        for (let i = 1; i < copies; i++) {
          const clone = original.cloneNode(true);
          clone.removeAttribute('data-sp-marquee-original');
          clone.setAttribute('data-sp-marquee-clone', '');
          clone.setAttribute('aria-hidden', 'true');
          clone.setAttribute('inert', '');
          clone.querySelectorAll('*').forEach(element => {
            for (const attr of [...element.attributes]) {
              if (attr.name === 'id' || attr.name === 'data-sp-marquee-block-id' || attr.name.startsWith('data-shopify-')) element.removeAttribute(attr.name);
            }
            if (element.matches('a,button,input,select,textarea,[tabindex]')) element.setAttribute('tabindex','-1');
          });
          track.appendChild(clone);
        }
        const speed = Math.max(10, Number(row.dataset.spSpeed) || 36);
        const mobileFactor = matchMedia('(max-width: 749px)').matches ? Math.max(.2,Number(this.root.dataset.spMobileSpeed)||.8) : 1;
        track.style.setProperty('--sp-mq-distance', `${-distance}px`);
        track.style.setProperty('--sp-mq-duration', `${distance/(speed * mobileFactor)}s`);
      });
      this.root.classList.toggle('is-paused', this.pauses.size > 0);
    }
    enableDrag(row) {
      const viewport = row.querySelector('[data-sp-marquee-viewport]');
      if (!viewport) return;
      let startX = 0, startScroll = 0, pointer = null, moved = false;
      viewport.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        pointer = e.pointerId; startX = e.clientX; startScroll = viewport.scrollLeft; moved = false;
        viewport.setPointerCapture?.(e.pointerId);
        this.pause('drag', true);
      }, {signal:this.abort.signal});
      viewport.addEventListener('pointermove', e => {
        if (pointer !== e.pointerId) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 7) moved = true;
        if (moved) viewport.scrollLeft = startScroll - dx;
      }, {signal:this.abort.signal});
      const finish = e => {
        if (pointer !== e.pointerId) return;
        if (moved) { this.bypassDragClick = true; setTimeout(() => { this.bypassDragClick = false; }, 100); }
        pointer = null;
        this.pause('drag', false);
        if (this.root.dataset.spAutoDrag === 'true') this.startDragAuto(row);
      };
      viewport.addEventListener('pointerup', finish, {signal:this.abort.signal});
      viewport.addEventListener('pointercancel', finish, {signal:this.abort.signal});
      viewport.addEventListener('click', e => {
        if (this.bypassDragClick && e.target.closest('a')) { e.preventDefault(); e.stopPropagation(); }
      }, {capture:true,signal:this.abort.signal});
      row.querySelector('[data-sp-marquee-prev]')?.addEventListener('click', () => this.moveDrag(row,-1), {signal:this.abort.signal});
      row.querySelector('[data-sp-marquee-next]')?.addEventListener('click', () => this.moveDrag(row,1), {signal:this.abort.signal});
      if (this.root.dataset.spAutoDrag === 'true') this.startDragAuto(row);
    }
    moveDrag(row, sign) {
      const viewport = row.querySelector('[data-sp-marquee-viewport]');
      const item = viewport.querySelector('[data-sp-marquee-original] > li');
      const amount = item ? item.getBoundingClientRect().width + 30 : 200;
      const rtl = getComputedStyle(viewport).direction === 'rtl';
      viewport.scrollBy({left:amount * sign * (rtl ? -1 : 1),behavior:motion.matches?'auto':'smooth'});
    }
    startDragAuto(row) {
      if (this.dragTimer) clearInterval(this.dragTimer);
      if (motion.matches) return;
      this.dragTimer = setInterval(() => {
        if (motion.matches || document.hidden || this.pauses.size) return;
        const el = row.querySelector('[data-sp-marquee-viewport]');
        const max = el.scrollWidth - el.clientWidth;
        if (Math.abs(el.scrollLeft) >= max - 4) el.scrollTo({left:0,behavior:'auto'});
        else this.moveDrag(row,1);
      }, Math.max(3800, this.delay));
    }
    blockSelect(blockId) {
      const target = Array.from(this.root.querySelectorAll('[data-sp-marquee-block-id]')).find(el => el.dataset.spMarqueeBlockId === blockId);
      if (!target) return;
      this.pause('editor', true);
      const row = target.closest('[data-sp-marquee-row]');
      row?.classList.add('is-editor-paused');
      requestAnimationFrame(() => target.scrollIntoView({behavior:'auto',block:'nearest',inline:'center'}));
    }
    blockDeselect() {
      this.pause('editor', false);
      this.rows.forEach(row => row.classList.remove('is-editor-paused'));
    }
    destroy() {
      this.abort.abort();
      this.resizeObserver?.disconnect();
      if (this.frame) cancelAnimationFrame(this.frame);
      clearTimeout(this.timer); clearInterval(this.dragTimer);
      this.rows.forEach(row => {
        row.querySelectorAll('[data-sp-marquee-clone]').forEach(node => node.remove());
        row.classList.remove('is-ready','is-editor-paused');
      });
      registry.delete(this.root);
    }
  }
  /* One document-level listener for every instance, including Theme Editor reloads. */
  document.addEventListener('visibilitychange', () => {
    for (const instance of registry.values()) instance.pause('hidden', document.hidden);
  });
  const handleMotionChange = () => {
    for (const instance of registry.values()) {
      instance.pause('motion', motion.matches);
      if (motion.matches) clearInterval(instance.dragTimer);
      else if (instance.isDrag && instance.root.dataset.spAutoDrag === 'true') {
        instance.rows.forEach(row => instance.startDragAuto(row));
      }
      instance.schedule();
    }
  };
  if (motion.addEventListener) motion.addEventListener('change', handleMotionChange);
  else if (motion.addListener) motion.addListener(handleMotionChange);
  function init(host=document) {
    if (host.matches?.(selector) && !registry.has(host)) registry.set(host,new Marquee(host));
    host.querySelectorAll?.(selector).forEach(node => { if (!registry.has(node)) registry.set(node,new Marquee(node)); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), {once:true});
  else init();
  document.addEventListener('shopify:section:load', event => init(event.target));
  document.addEventListener('shopify:section:unload', event => {
    for (const [node,instance] of registry) if (event.target === node || event.target.contains(node)) instance.destroy();
  });
  document.addEventListener('shopify:block:select', event => {
    const id = event.detail?.blockId;
    if (!id) return;
    for (const [node,instance] of registry) if (node.contains(event.target)) instance.blockSelect(id);
  });
  document.addEventListener('shopify:block:deselect', event => {
    for (const [node,instance] of registry) if (node.contains(event.target)) instance.blockDeselect();
  });
})();
