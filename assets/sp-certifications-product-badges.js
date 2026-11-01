/* Spider certifications: progressive enhancement for filtering, native dialog and CSS snap carousel. */
(() => {
  'use strict';
  const selector = '[data-sp-cpb-root]';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minmax = (n, a, b) => Math.min(b, Math.max(a, n));
  function init(root) {
    if (!root || root._spCpb) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const state = { controller, timer: null, restore: null, index: 0, destroyed: false, dragging: false, swipeDistance: 0 };
    root._spCpb = state;
    const mode = root.dataset.spCpbStyle;
    const cards = $$('[data-sp-cpb-card]');
    const filterSelect = $('[data-sp-cpb-filter-select]');
    const track = $('[data-sp-cpb-track-wrap]');
    const controls = $('[data-sp-cpb-controls]');
    const isRTL = root.dataset.spCpbRtl === 'true' || getComputedStyle(root).direction === 'rtl';
    // Modal: only one native <dialog> per section, source content remains in <details> for no-JS.
    if (root.dataset.spCpbDetails === 'modal' || root.dataset.spCpbDetails === 'drawer') {
      const dialog = $('[data-sp-cpb-dialog]');
      if (dialog && typeof dialog.showModal === 'function') {
        root.classList.add('sp-cpb--dialog-ready');
        const title = $('[data-sp-cpb-dialog-title]');
        const content = $('[data-sp-cpb-dialog-content]');
        const close = $('[data-sp-cpb-close]');
        const dialogPrev = $('[data-sp-cpb-detail-prev]');
        const dialogNext = $('[data-sp-cpb-detail-next]');
        const showCardDetails = (card) => {
          if (!card) return;
          const source = card.querySelector('[data-sp-cpb-details-content]');
          if (!source) return;
          title.textContent = card.querySelector('.sp-cpb__card-title')?.textContent || 'Standard details';
          content.replaceChildren(source.cloneNode(true));
          state.activeCard = card;
        };
        $$('[data-sp-cpb-open]').forEach(button => {
          button.hidden = false;
          button.addEventListener('click', () => {
            const card = button.closest('[data-sp-cpb-card]');
            if (!card) return;
            state.restore = button;
            showCardDetails(card);
            dialog.showModal();
            close?.focus();
          }, { signal });
        });
        close?.addEventListener('click', () => dialog.close(), { signal });
        const navigateDialog = direction => {
          const available = cards.filter(card => !card.hidden && card.querySelector('[data-sp-cpb-details-content]'));
          if (!available.length) return;
          const current = Math.max(0, available.indexOf(state.activeCard));
          const newIndex = (current + direction + available.length) % available.length;
          showCardDetails(available[newIndex]);
        };
        dialogPrev?.addEventListener('click', () => navigateDialog(-1), { signal });
        dialogNext?.addEventListener('click', () => navigateDialog(1), { signal });
        dialog.addEventListener('click', event => {
          if (root.dataset.spCpbOverlayClose === 'true' || dialog.dataset.spCpbOverlayClose === 'true') {
            if (event.target === dialog) dialog.close();
          }
        }, { signal });
        dialog.addEventListener('close', () => { content.replaceChildren(); if (state.restore?.isConnected) state.restore.focus(); }, { signal });
      }
    }
    if (mode === 'style_4') {
      const filters = $$('[data-sp-cpb-filter]');
      const setCategory = (category) => {
        if (!filters.length) return;
        const available = filters.some(x => x.dataset.spCpbFilter === category);
        const selected = available ? category : filters[0].dataset.spCpbFilter;
        filters.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.spCpbFilter === selected)));
        if (filterSelect) filterSelect.value = selected;
        cards.forEach(card => { card.hidden = selected !== 'all' && card.dataset.spCpbCategory !== selected; });
      };
      filters.forEach(btn => btn.addEventListener('click', () => setCategory(btn.dataset.spCpbFilter), { signal }));
      filterSelect?.addEventListener('change', () => setCategory(filterSelect.value), { signal });
      state.setCategory = setCategory;
      const first = root.dataset.spCpbDefaultCategory || 'all';
      setCategory(first);
    }
    if (mode === 'style_5' && track && controls && cards.length > 1) {
      const prev = $('[data-sp-cpb-prev]');
      const next = $('[data-sp-cpb-next]');
      const dots = $('[data-sp-cpb-dots]');
      const progress = $('[data-sp-cpb-progress]');
      const countVisible = () => {
        if (cards.length < 2) return 1;
        const d = Math.abs(cards[1].offsetLeft - cards[0].offsetLeft);
        return Math.max(1, Math.min(cards.length, Math.round(track.clientWidth / (d || cards[0].offsetWidth || track.clientWidth))));
      };
      const max = () => Math.max(0, cards.length - countVisible());
      const indexFromScroll = () => {
        const r = track.getBoundingClientRect();
        const width = cards[0]?.getBoundingClientRect().width || 1;
        let closest = 0, smallest = Infinity;
        cards.forEach((card, i) => {
          const rect = card.getBoundingClientRect();
          const offset = Math.abs((isRTL ? r.right - rect.right : rect.left - r.left));
          if (offset < smallest) { smallest = offset; closest = i; }
        });
        return minmax(closest, 0, max());
      };
      const draw = () => {
        const limit = max();
        state.index = minmax(indexFromScroll(), 0, limit);
        if (prev) prev.disabled = root.dataset.spCpbInfinite !== 'true' && state.index === 0;
        if (next) next.disabled = root.dataset.spCpbInfinite !== 'true' && state.index >= limit;
        if (progress) progress.style.width = `${((state.index + 1) / (limit + 1)) * 100}%`;
        if (dots) Array.from(dots.children).forEach((el, i) => {
          el.setAttribute('aria-current', String(i === state.index));
          el.setAttribute('aria-label', `Go to carousel position ${i + 1}`);
        });
      };
      const move = (index, instant = false) => {
        const limit = max();
        const i = root.dataset.spCpbInfinite === 'true' ? (index < 0 ? limit : index > limit ? 0 : index) : minmax(index, 0, limit);
        const card = cards[i];
        if (!card) return;
        const r = track.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        const delta = isRTL ? cr.right - r.right : cr.left - r.left;
        track.scrollTo({ left: track.scrollLeft + delta, behavior: instant || reduced() ? 'auto' : 'smooth' });
        state.index = i;
        // Even while smooth scrolling, expose target position immediately.
        if (prev) prev.disabled = root.dataset.spCpbInfinite !== 'true' && i === 0;
        if (next) next.disabled = root.dataset.spCpbInfinite !== 'true' && i >= limit;
      };
      state.move = move;
      const rebuild = () => {
        const limit = max();
        if (dots) {
          dots.replaceChildren();
          for (let i = 0; i <= limit; i++) {
            const d = document.createElement('button');
            d.type = 'button'; d.className = 'sp-cpb__dot';
            d.setAttribute('aria-label', `Go to carousel position ${i + 1}`);
            d.addEventListener('click', () => move(i), { signal });
            dots.appendChild(d);
          }
        }
        draw();
      };
      prev?.addEventListener('click', () => move(state.index - 1), { signal });
      next?.addEventListener('click', () => move(state.index + 1), { signal });
      let frame = 0;
      track.addEventListener('scroll', () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; draw(); }); }, { passive: true, signal });
      window.addEventListener('resize', rebuild, { passive: true, signal });
      if (root.dataset.spCpbPointerDrag === 'true' || root.dataset.spCpbSwipe === 'true') {
        let origin = 0, initial = 0, pointerId = null;
        track.addEventListener('pointerdown', e => {
          if (e.pointerType === 'touch') return; // Native touch scroll-snap leaves vertical page scrolling available.
          if (root.dataset.spCpbPointerDrag !== 'true' || e.button !== 0 || e.target.closest('button,input,textarea,select,summary')) return;
          origin = e.clientX; initial = track.scrollLeft; pointerId = e.pointerId; state.dragging = true; state.swipeDistance = 0;
        }, { signal });
        track.addEventListener('pointermove', e => {
          if (!state.dragging || e.pointerId !== pointerId) return;
          state.swipeDistance = e.clientX - origin;
          if (Math.abs(state.swipeDistance) > 5) {
            if (!track.hasPointerCapture(pointerId)) track.setPointerCapture(pointerId);
            track.scrollLeft = initial - state.swipeDistance;
          }
        }, { signal });
        const end = () => { state.dragging = false; pointerId = null; };
        track.addEventListener('pointerup', end, { signal });
        track.addEventListener('pointercancel', end, { signal });
        track.addEventListener('click', e => {
          if (Math.abs(state.swipeDistance) > 6) { e.preventDefault(); e.stopPropagation(); state.swipeDistance = 0; }
        }, { capture: true, signal });
      }
      rebuild();
      const speed = Math.max(2000, Number(root.dataset.spCpbAutoplaySpeed || 5000));
      if (root.dataset.spCpbAutoplay === 'true' && !reduced()) {
        state.timer = window.setInterval(() => {
          if (state.destroyed || document.hidden || state.dragging || root.contains(document.activeElement) || (root.dataset.spCpbPauseHover === 'true' && root.matches(':hover'))) return;
          move(state.index + 1);
        }, speed);
      }
    }
    // Activate only after associated interactive enhancement has succeeded.
    root.classList.add('sp-cpb--ready');
  }
  function destroy(root) {
    const state = root?._spCpb;
    if (!state) return;
    state.destroyed = true;
    if (state.timer) window.clearInterval(state.timer);
    const dialog = root.querySelector('[data-sp-cpb-dialog]');
    if (dialog?.open) dialog.close();
    state.controller.abort();
    root.classList.remove('sp-cpb--ready', 'sp-cpb--dialog-ready');
    delete root._spCpb;
  }
  function activateSelectedBlock(detail) {
    const block = detail?.blockId && Array.from(document.querySelectorAll('[data-sp-cpb-block-id]')).find(el => el.dataset.spCpbBlockId === detail.blockId);
    if (!block) return;
    const root = block.closest(selector);
    const state = root?._spCpb;
    if (!state) return;
    if (state.setCategory) state.setCategory(block.dataset.spCpbCategory);
    if (state.move) {
      const cards = Array.from(root.querySelectorAll('[data-sp-cpb-card]'));
      state.move(cards.indexOf(block), true);
    }
    block.scrollIntoView({ block:'nearest', behavior:'auto' });
  }
  function boot(context = document) { context.querySelectorAll(selector).forEach(init); if (context.matches?.(selector)) init(context); }
  if (!window.__spCpbEventsBound) {
    window.__spCpbEventsBound = true;
    document.addEventListener('shopify:section:load', e => boot(e.target));
    document.addEventListener('shopify:section:unload', e => { e.target.querySelectorAll(selector).forEach(destroy); if (e.target.matches?.(selector)) destroy(e.target); });
    document.addEventListener('shopify:block:select', e => activateSelectedBlock(e.detail));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), { once:true });
  else boot();
})();
