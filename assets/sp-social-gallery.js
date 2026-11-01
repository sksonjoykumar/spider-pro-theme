/* Spider Social Gallery — scoped, dependency-free. */
(() => {
  'use strict';
  if (window.__spSocialGalleryLoaded) return;
  window.__spSocialGalleryLoaded = true;
  const instances = new Map();
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function create(root) {
    if (instances.has(root)) return;
    const abort = new AbortController(), signal = abort.signal;
    const $ = s => root.querySelector(s);
    const $$ = s => Array.from(root.querySelectorAll(s));
    const list = $('[data-sp-list]');
    if (!list) return;
    const items = $$('[data-sp-item]');
    const isCarousel = root.dataset.spStyle === 'style_3';
    const dialog = $('[data-sp-dialog]');
    let carouselIndex = 0, visibleSlides = 1, pages = 1, slideStep = 0, autoplayId = null;
    let hover = false, focus = false, dragging = false, dragMoved = false, dragStartX = 0, dragScroll = 0, suppressUntil = 0;
    let currentLightboxIndex = 0, launcher = null, previousOverflow = '';
    let observer = null;
    const on = (target, name, cb, options = {}) => target?.addEventListener(name, cb, { ...options, signal });
    const watchList = items.filter(el => el.querySelector('[data-sp-open]'));
    const rtl = () => getComputedStyle(list).direction === 'rtl';
    let rtlType;
    const getRTLType = () => {
      if (rtlType) return rtlType;
      const outer = document.createElement('div');
      outer.dir = 'rtl'; outer.style.cssText = 'position:absolute;left:-9999px;width:4px;height:1px;overflow:scroll;';
      const inner = document.createElement('div'); inner.style.width = '8px'; outer.append(inner); document.body.append(outer);
      if (outer.scrollLeft > 0) rtlType = 'reverse';
      else { outer.scrollLeft = 1; rtlType = outer.scrollLeft === 0 ? 'negative' : 'default'; }
      outer.remove(); return rtlType;
    };
    const maxScroll = () => Math.max(0, list.scrollWidth - list.clientWidth);
    const logicalLeft = () => {
      const max = maxScroll();
      if (!rtl()) return Math.max(0, list.scrollLeft);
      const type = getRTLType();
      return type === 'negative' ? Math.abs(list.scrollLeft) : type === 'reverse' ? max - list.scrollLeft : list.scrollLeft;
    };
    const setLogicalLeft = (x, behavior = 'auto') => {
      const max = maxScroll(), val = Math.max(0, Math.min(max, x));
      let physical = val;
      if (rtl()) { const t = getRTLType(); physical = t === 'negative' ? -val : t === 'reverse' ? max - val : val; }
      list.scrollTo({ left: physical, behavior });
    };
    const mediaPause = (except = null) => {
      root.querySelectorAll('video').forEach(v => { if (v !== except) v.pause(); });
    };
    const closeLightbox = () => {
      if (!dialog?.open) return;
      dialog.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
      dialog.close();
    };
    const lightboxItems = () => watchList.filter(x => x.dataset.spOpenAllowed === 'true');
    const renderLightbox = (index) => {
      if (!dialog) return;
      const eligible = lightboxItems(); if (!eligible.length) return;
      currentLightboxIndex = ((index % eligible.length) + eligible.length) % eligible.length;
      const item = eligible[currentLightboxIndex], container = dialog.querySelector('[data-sp-dialog-visual]');
      container.replaceChildren();
      if (item.dataset.spType === 'video') {
        const src = item.querySelector('video');
        if (src) {
          const copy = src.cloneNode(true); copy.removeAttribute('autoplay'); copy.autoplay = false;
          copy.controls = true; copy.preload = 'metadata'; copy.muted = false; container.append(copy);
        }
      } else if (item.dataset.spMediaFull) {
        const img = document.createElement('img'); img.src = item.dataset.spMediaFull;
        img.alt = item.dataset.spLabel || 'Gallery photograph'; img.loading = 'eager'; container.append(img);
      }
      const cap = dialog.querySelector('[data-sp-dialog-caption]'), creator = dialog.querySelector('[data-sp-dialog-creator]');
      if (cap) { cap.textContent = root.dataset.spLightboxCaption === 'true' ? item.dataset.spCaption || '' : ''; cap.hidden = !cap.textContent; }
      if (creator) { creator.textContent = root.dataset.spLightboxCreator === 'true' ? item.dataset.spCreator || '' : ''; creator.hidden = !creator.textContent; }
      const product = dialog.querySelector('[data-sp-dialog-product]');
      if (product) {
        const show = root.dataset.spLightboxProduct === 'true' && !!item.dataset.spProductUrl;
        product.hidden = !show;
        if (show) {
          const title = product.querySelector('[data-sp-dialog-product-title]');
          const price = product.querySelector('[data-sp-dialog-product-price]');
          const link = product.querySelector('[data-sp-dialog-product-link]');
          title.textContent = item.dataset.spProductTitle || ''; price.textContent = item.dataset.spProductPrice || '';
          link.href = item.dataset.spProductUrl;
        }
      }
    };
    const openLightbox = (item, origin) => {
      if (!dialog || !dialog.showModal || !lightboxItems().includes(item)) return;
      launcher = origin; mediaPause(); renderLightbox(lightboxItems().indexOf(item));
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      dialog.showModal(); dialog.querySelector('[data-sp-dialog-close]')?.focus();
    };
    if (dialog) {
      on(dialog, 'close', () => { document.documentElement.style.overflow = previousOverflow; dialog.querySelector('[data-sp-dialog-visual]')?.replaceChildren(); launcher?.focus?.({ preventScroll: true }); });
      on(dialog, 'click', event => { if (event.target === dialog && root.dataset.spCloseOverlay === 'true') closeLightbox(); });
      on(dialog.querySelector('[data-sp-dialog-close]'), 'click', closeLightbox);
      on(dialog.querySelector('[data-sp-dialog-prev]'), 'click', () => renderLightbox(currentLightboxIndex - 1));
      on(dialog.querySelector('[data-sp-dialog-next]'), 'click', () => renderLightbox(currentLightboxIndex + 1));
      on(dialog, 'keydown', event => {
        if (event.key === 'ArrowRight' && !rtl()) { event.preventDefault(); renderLightbox(currentLightboxIndex + 1); }
        if (event.key === 'ArrowLeft' && !rtl()) { event.preventDefault(); renderLightbox(currentLightboxIndex - 1); }
      });
    }
    items.forEach(item => {
      on(item.querySelector('[data-sp-open]'), 'click', e => { if (Date.now() < suppressUntil) return; e.preventDefault(); openLightbox(item, e.currentTarget); });
      const hotspot = item.querySelector('[data-sp-hotspot]');
      const product = item.querySelector('[data-sp-product]');
      if (hotspot && product) on(hotspot, 'click', e => { e.stopPropagation(); const open = product.hidden; product.hidden = !open; hotspot.setAttribute('aria-expanded', String(open)); });
      const video = item.querySelector('video');
      if (video) on(video, 'play', () => { mediaPause(video); });
    });
    if ('IntersectionObserver' in window && root.querySelector('video')) {
      observer = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) target.pause();
        else if (root.dataset.spVideoAutoplay === 'true' && target.closest('[data-sp-item]')?.dataset.spVideoAuto === 'true' && !reduced() && !document.hidden && root.dataset.spDesignMode !== 'true') {
          target.muted = true; target.play().catch(() => {});
        }
      }), { threshold: 0.55 });
      root.querySelectorAll('.sp-social-gallery__item video').forEach(video => observer.observe(video));
    }
    function measure() {
      if (!isCarousel || !items.length) return;
      const computed = getComputedStyle(list), gap = parseFloat(computed.gap) || 0;
      slideStep = items[0].getBoundingClientRect().width + gap;
      visibleSlides = Math.max(1, Math.min(items.length, Math.round((list.clientWidth + gap) / (slideStep || 1))));
      pages = Math.max(1, items.length - visibleSlides + 1);
      carouselIndex = Math.min(carouselIndex, pages - 1);
      update();
    }
    function update() {
      if (!isCarousel) return;
      const position = Math.max(0, Math.min(pages - 1, Math.round(logicalLeft() / (slideStep || 1))));
      carouselIndex = position;
      const prev = $('[data-sp-prev]'), next = $('[data-sp-next]');
      const loop = root.dataset.spInfinite === 'true';
      if (prev) prev.disabled = pages <= 1 || (!loop && position <= 0);
      if (next) next.disabled = pages <= 1 || (!loop && position >= pages - 1);
      const progress = $('[data-sp-progress]');
      if (progress) {
        const value = pages <= 1 ? 100 : Math.round((position / (pages - 1)) * 100);
        progress.setAttribute('aria-valuenow', value);
        const fill = progress.querySelector('[data-sp-progress-fill]'); if (fill) fill.style.width = value + '%';
      }
      const dots = $('[data-sp-dots]');
      if (dots) dots.querySelectorAll('button').forEach((btn, i) => btn.setAttribute('aria-current', String(i === position)));
    }
    function goTo(index) {
      if (!isCarousel || pages < 2) return;
      const loop = root.dataset.spInfinite === 'true';
      const next = loop ? (index + pages) % pages : Math.max(0, Math.min(pages - 1, index));
      carouselIndex = next;
      setLogicalLeft(next * slideStep, reduced() ? 'auto' : 'smooth');
      window.setTimeout(update, 400);
    }
    function stopAutoplay() { if (autoplayId) window.clearInterval(autoplayId); autoplayId = null; }
    function restartAutoplay() {
      stopAutoplay();
      if (!isCarousel || pages <= 1 || root.dataset.spAutoplay !== 'true' || reduced() || root.dataset.spDesignMode === 'true' || document.hidden || hover || focus) return;
      const delay = Math.max(3000, Number(root.dataset.spAutoplaySpeed || 5000));
      autoplayId = window.setInterval(() => goTo(carouselIndex + 1), delay);
    }
    if (isCarousel) {
      on($('[data-sp-prev]'), 'click', () => { goTo(carouselIndex - 1); restartAutoplay(); });
      on($('[data-sp-next]'), 'click', () => { goTo(carouselIndex + 1); restartAutoplay(); });
      on(list, 'scroll', () => window.requestAnimationFrame(update), { passive: true });
      on(list, 'pointerdown', e => {
        if (root.dataset.spPointerDrag !== 'true' || e.pointerType === 'touch' || e.target.closest('a,video,[data-sp-hotspot]')) return;
        dragging = true; dragMoved = false; dragStartX = e.clientX; dragScroll = logicalLeft();
      });
      on(list, 'pointermove', e => {
        if (!dragging) return;
        const movement = e.clientX - dragStartX;
        if (Math.abs(movement) > 5) { dragMoved = true; list.style.scrollSnapType = 'none'; setLogicalLeft(dragScroll + (rtl() ? movement : -movement)); }
      });
      const endDrag = () => {
        if (!dragging) return;
        dragging = false; list.style.scrollSnapType = '';
        if (dragMoved) { suppressUntil = Date.now() + 350; goTo(Math.round(logicalLeft() / (slideStep || 1))); }
        restartAutoplay();
      };
      on(window, 'pointerup', endDrag); on(window, 'pointercancel', endDrag);
      on(list, 'click', e => { if (Date.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); } }, { capture: true });
      on(root, 'mouseenter', () => { if (root.dataset.spPauseHover === 'true') { hover = true; stopAutoplay(); } });
      on(root, 'mouseleave', () => { hover = false; restartAutoplay(); });
      on(root, 'focusin', () => { focus = true; stopAutoplay(); });
      on(root, 'focusout', () => { focus = root.contains(document.activeElement); if (!focus) restartAutoplay(); });
      const dots = $('[data-sp-dots]');
      if (dots) {
        const makeDots = () => { dots.replaceChildren(); for (let i = 0; i < pages; i++) {
          const btn = document.createElement('button'); btn.type = 'button'; btn.setAttribute('aria-label', `Show gallery page ${i + 1}`);
          on(btn, 'click', () => goTo(i)); dots.append(btn);
        } update(); };
        let oldPages = 0;
        on(window, 'resize', () => { measure(); if (pages !== oldPages) { oldPages = pages; makeDots(); } });
        measure(); oldPages = pages; makeDots();
      } else on(window, 'resize', measure);
      measure(); restartAutoplay();
    }
    on(document, 'visibilitychange', () => { if (document.hidden) { mediaPause(); stopAutoplay(); } else restartAutoplay(); });
    root.classList.add('is-ready');
    const instance = {
      reveal(blockId) { const el = items.find(item => item.dataset.spBlockId === blockId); if (!el) return; if (dialog?.open) closeLightbox(); if (isCarousel) { goTo(Math.min(items.indexOf(el), pages - 1)); } else el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); },
      destroy() { stopAutoplay(); if (dialog?.open) closeLightbox(); observer?.disconnect(); mediaPause(); abort.abort(); root.classList.remove('is-ready'); instances.delete(root); }
    };
    instances.set(root, instance);
  }
  function init(container = document) {
    if (container.matches?.('[data-sp-social-gallery]')) create(container);
    container.querySelectorAll?.('[data-sp-social-gallery]').forEach(create);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', event => init(event.target));
  document.addEventListener('shopify:section:unload', event => {
    instances.forEach((instance, root) => { if (event.target.contains(root)) instance.destroy(); });
  });
  document.addEventListener('shopify:block:select', event => {
    const blockId = event.detail?.blockId;
    if (!blockId) return;
    instances.forEach((instance, root) => { if (event.target.closest?.('[data-sp-social-gallery]') === root || root.contains(event.target)) instance.reveal(blockId); });
  });
})();
