(() => {
  'use strict';

  const ACTION_SELECTORS = {
    filter: '[data-sp-facets-trigger], [data-drawer-open*="Filter"], [data-drawer-open*="Facet"]',
    sidebar: '[data-sp-sidebar-trigger], [data-drawer-open*="Sidebar"]',
    account: '[data-drawer-open="AccountDrawer"], [data-drawer-open="LoginDrawer"], [data-drawer-open="CustomerDrawer"]'
  };

  const isModifiedClick = (event) => event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

  class SpiderMobileToolbar extends HTMLElement {
    connectedCallback() {
      if (this.__spConnected) return;
      this.__spConnected = true;
      this.abortController = new AbortController();
      this.signal = this.abortController.signal;
      this.breakpoint = Number(this.dataset.breakpoint || 1024);
      this.pageType = this.dataset.pageType || '';
      this.designMode = this.dataset.designMode === 'true' || Boolean(window.Shopify?.designMode);
      this.behaviour = this.dataset.behaviour || 'always';
      this.lastScrollY = window.scrollY;
      this.scrollRAF = 0;
      this.syncRAF = 0;
      this.wishlistObserver = null;
      this.openSheetName = null;
      this.sheetOpener = null;
      this.restoreBodyOverflow = null;
      this.scrollThreshold = Math.max(6, Number(this.dataset.scrollThreshold || 10));
      this.addEventListener('click', (event) => this.onClick(event), { signal: this.signal });
      document.addEventListener('keydown', (event) => this.onKeydown(event), { signal: this.signal });
      const updateWishlist = (event) => {
        const n = Number(event.detail?.count ?? event.detail?.wishlist_count);
        if (Number.isFinite(n) && n >= 0) this.updateCount('wishlist', n);
      };
      ['spider:wishlist:updated', 'wishlist:updated'].forEach((name) => document.addEventListener(name, updateWishlist, { signal: this.signal }));
      window.addEventListener('resize', () => this.queueSync(), { signal: this.signal, passive: true });
      window.addEventListener('orientationchange', () => this.queueSync(), { signal: this.signal, passive: true });
      document.addEventListener('shopify:block:select', (event) => this.onBlockSelect(event), { signal: this.signal });

      const cartEvent = window.Spider?.events?.cartUpdated || 'spider:cart:updated';
      document.addEventListener(cartEvent, (event) => this.onCartUpdated(event), { signal: this.signal });

      if (this.behaviour === 'hide_scroll') {
        window.addEventListener('scroll', () => this.onScroll(), { signal: this.signal, passive: true });
      }

      this.resolveDependencies();
      this.syncCartFromDom();
      this.queueSync();
    }

    disconnectedCallback() {
      this.abortController?.abort();
      this.abortController = null;
      this.closeSheet(false);
      this.wishlistObserver?.disconnect();
      this.wishlistObserver = null;
      if (this.scrollRAF) cancelAnimationFrame(this.scrollRAF);
      if (this.syncRAF) cancelAnimationFrame(this.syncRAF);
      this.scrollRAF = 0;
      this.syncRAF = 0;
      this.releaseGlobalOffset();
      this.__spConnected = false;
    }

    onBlockSelect(event) {
      if (!this.designMode || !this.contains(event.target)) return;
      this.classList.remove('is-scroll-hidden');
      event.target.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }

    onClick(event) {
      if (event.target.closest('[data-sp-sheet-backdrop], [data-sp-sheet-close]')) {
        event.preventDefault();
        this.closeSheet();
        return;
      }
      const link = event.target.closest('[data-sp-toolbar-action]');
      if (!link || !this.contains(link) || isModifiedClick(event)) return;
      const action = link.dataset.spToolbarAction;
      if (action === 'categories' || action === 'more') {
        const target = action === 'more' ? 'quick' : 'categories';
        if (!this.querySelector(`[data-sp-sheet="${target}"]`)) return;
        event.preventDefault();
        if (this.openSheetName === target) this.closeSheet();
        else this.openSheet(target, link);
        return;
      }
      if (this.openSheetName) this.closeSheet(false);

      if (action === 'search' && link.dataset.searchBehaviour !== 'page') {
        const header = document.querySelector('sp-header');
        const drawer = header?.querySelector?.('[data-sp-search-drawer]');
        if (drawer && typeof header.openSearchDrawer === 'function') {
          event.preventDefault();
          header.openSearchDrawer(link);
          this.markDrawerActive('search', drawer);
        }
        return;
      }

      if (action === 'cart') {
        const dialog = document.getElementById('CartDrawer');
        if (dialog instanceof HTMLDialogElement && typeof window.Spider?.openDrawer === 'function') {
          event.preventDefault();
          window.Spider.openDrawer('CartDrawer', link);
          this.markDrawerActive('cart', dialog);
        }
        return;
      }

      if (action === 'menu') {
        const dialog = document.querySelector('dialog[data-sp-mobile-menu], dialog[id^="SpMobileMenu-"]');
        if (dialog?.id && typeof window.Spider?.openDrawer === 'function') {
          event.preventDefault();
          window.Spider.openDrawer(dialog.id, link);
        }
        return;
      }

      if (action === 'account' || action === 'filter' || action === 'sidebar') {
        const target = this.findBridgeTarget(action);
        if (!target) return;
        const drawerId = target.dataset?.drawerOpen;
        if (drawerId && document.getElementById(drawerId) instanceof HTMLDialogElement && typeof window.Spider?.openDrawer === 'function') {
          event.preventDefault();
          window.Spider.openDrawer(drawerId, link);
          return;
        }
        if (target instanceof HTMLDialogElement && target.id && typeof window.Spider?.openDrawer === 'function') {
          event.preventDefault();
          window.Spider.openDrawer(target.id, link);
          return;
        }
        if (target instanceof HTMLElement && target !== link) {
          event.preventDefault();
          target.click();
        }
      }
    }

    markDrawerActive(name, drawer) {
      this.querySelectorAll('.is-interaction-active').forEach((item) => item.classList.remove('is-interaction-active'));
      const item = this.querySelector(`[data-sp-toolbar-item="${name}"]`);
      if (!item) return;
      item.classList.add('is-interaction-active');
      drawer?.addEventListener?.('close', () => item.classList.remove('is-interaction-active'), { once: true, signal: this.signal });
    }

    openSheet(name, opener) {
      const panel = this.querySelector(`[data-sp-sheet="${name}"]`);
      if (!panel || !this.isLiveViewport()) return;
      if (this.openSheetName) this.closeSheet(false);
      this.openSheetName = name;
      this.dataset.activeSheet = name;
      this.sheetOpener = opener;
      this.querySelectorAll('[data-sp-sheet]').forEach((node) => { node.hidden = node !== panel; });
      const backdrop = this.querySelector('[data-sp-sheet-backdrop]');
      if (backdrop) backdrop.hidden = false;
      this.classList.add('is-sheet-open');
      this.classList.remove('is-scroll-hidden');
      this.querySelectorAll('[data-sp-toolbar-item]').forEach((item) => {
        const active = name === 'categories' && item.dataset.spToolbarItem === 'categories';
        item.classList.toggle('is-sheet-active', active);
        const toggle = item.querySelector('[aria-expanded]');
        if (toggle) toggle.setAttribute('aria-expanded', String(active));
      });
      if (this.restoreBodyOverflow === null) {
        this.restoreBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
      this.queueSync();
      panel.focus({ preventScroll: true });
    }

    closeSheet(restoreFocus = true) {
      if (!this.openSheetName) return;
      this.openSheetName = null;
      delete this.dataset.activeSheet;
      this.querySelectorAll('[data-sp-sheet]').forEach((node) => { node.hidden = true; });
      const backdrop = this.querySelector('[data-sp-sheet-backdrop]');
      if (backdrop) backdrop.hidden = true;
      this.classList.remove('is-sheet-open');
      this.querySelectorAll('.is-sheet-active').forEach((item) => item.classList.remove('is-sheet-active'));
      this.querySelectorAll('[aria-expanded][data-sp-toolbar-action="categories"]').forEach((control) => control.setAttribute('aria-expanded','false'));
      if (this.restoreBodyOverflow !== null) {
        document.body.style.overflow = this.restoreBodyOverflow;
        this.restoreBodyOverflow = null;
      }
      if (restoreFocus && this.sheetOpener?.isConnected) this.sheetOpener.focus({ preventScroll: true });
      this.sheetOpener = null;
      this.queueSync();
    }

    onKeydown(event) {
      if (!this.openSheetName) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeSheet();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = this.querySelector(`[data-sp-sheet="${this.openSheetName}"]`);
      if (!panel) return;
      const controls = [...panel.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter((el) => !el.hidden && el.getClientRects().length);
      if (!controls.length) { event.preventDefault(); panel.focus(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      } else if (!panel.contains(document.activeElement)) {
        event.preventDefault(); first.focus();
      }
    }

    findBridgeTarget(action) {
      if (action === 'filter') {
        return this.externalQuery(ACTION_SELECTORS.filter) ||
          this.externalQuery('dialog[data-facets-drawer], dialog[id*="Filter"], dialog[id*="Facet"]');
      }
      if (action === 'sidebar') {
        return this.externalQuery(ACTION_SELECTORS.sidebar) ||
          this.externalQuery('dialog[data-sp-sidebar-drawer], dialog[id*="Sidebar"]');
      }
      if (action === 'account') {
        return this.externalQuery(ACTION_SELECTORS.account) ||
          this.externalQuery('dialog[data-sp-account-drawer], dialog#AccountDrawer, dialog#LoginDrawer');
      }
      return null;
    }

    externalQuery(selector) {
      return [...document.querySelectorAll(selector)].find((node) => !this.contains(node)) || null;
    }

    resolveDependencies() {
      this.resolveUrlDependency('wishlist', '[data-sp-wishlist-link][href], [data-wishlist-link][href]');
      this.resolveUrlDependency('compare', '[data-sp-compare-link][href], [data-compare-link][href]');
      this.resolveContextDependency('filter');
      this.resolveContextDependency('sidebar');
      this.setupWishlistCountMirror();
      this.queueSync();
    }

    resolveUrlDependency(name, sourceSelector) {
      this.querySelectorAll(`[data-sp-toolbar-dependency="${name}"]`).forEach((item) => {
        const link = item.querySelector('a[href]');
        const fallback = item.dataset.fallbackUrl || '';
        const source = this.externalQuery(sourceSelector);
        const href = source?.getAttribute('href') || fallback || '';
        if (href) {
          link?.setAttribute('href', href);
          item.hidden = false;
          if (name === 'wishlist') {
            this.querySelectorAll('[data-sp-toolbar-wishlist-link]').forEach((anchor) => {
              anchor.href = href;
              anchor.hidden = false;
            });
          }
        } else {
          item.hidden = true;
          if (name === 'wishlist') this.querySelectorAll('[data-sp-toolbar-wishlist-link]').forEach((anchor) => anchor.hidden = true);
        }
      });
    }

    resolveContextDependency(name) {
      const filterContext = this.pageType === 'collection' || this.pageType === 'search';
      const sidebarContext = ['product', 'collection', 'blog', 'article'].includes(this.pageType);
      const contextAllowed = name === 'filter' ? filterContext : sidebarContext;
      const target = contextAllowed ? this.findBridgeTarget(name) : null;
      this.querySelectorAll(`[data-sp-toolbar-dependency="${name}"]`).forEach((item) => {
        item.hidden = !target;
      });
    }

    setupWishlistCountMirror() {
      this.wishlistObserver?.disconnect();
      this.wishlistObserver = null;
      const source = this.externalQuery('[data-wishlist-count], [data-sp-wishlist-count]');
      if (!source) return;
      const sync = () => {
        const value = Number(String(source.textContent || '').replace(/\D/g, ''));
        if (Number.isFinite(value)) this.updateCount('wishlist', value);
      };
      sync();
      if ('MutationObserver' in window) {
        this.wishlistObserver = new MutationObserver(sync);
        this.wishlistObserver.observe(source, { childList: true, characterData: true, subtree: true });
      }
    }

    onCartUpdated(event) {
      const count = Number(event.detail?.cart?.item_count);
      if (Number.isFinite(count)) this.updateCount('cart', count);
    }

    syncCartFromDom() {
      const source = this.externalQuery('[data-cart-count]');
      if (!source) return;
      const count = Number(String(source.textContent || '').replace(/\D/g, ''));
      if (Number.isFinite(count)) this.updateCount('cart', count);
    }

    updateCount(type, count) {
      const hideZero = this.dataset.hideZero === 'true';
      const cap = this.dataset.capCount === 'true';
      const display = cap && count > 99 ? '99+' : String(count);
      this.querySelectorAll(`[data-sp-toolbar-count="${type}"]`).forEach((badge) => {
        badge.dataset.count = String(count);
        badge.textContent = display;
        badge.hidden = hideZero && count === 0;
      });
      if (type === 'cart') {
        this.querySelectorAll('[data-sp-toolbar-item="cart"] .sp-mobile-toolbar__link').forEach((link) => {
          const label = link.querySelector('.sp-mobile-toolbar__label')?.textContent?.trim() || 'Cart';
          link.setAttribute('aria-label', `${label}, ${count} ${count === 1 ? 'item' : 'items'}`);
        });
      }
    }

    onScroll() {
      if (this.scrollRAF || this.openSheetName || this.contains(document.activeElement) && document.activeElement?.matches(':focus-visible')) return;
      this.scrollRAF = requestAnimationFrame(() => {
        this.scrollRAF = 0;
        if (!this.isLiveViewport()) return;
        const y = Math.max(0, window.scrollY);
        const delta = y - this.lastScrollY;
        if (this.openSheetName) return;
        if (y < 64) this.classList.remove('is-scroll-hidden');
        else if (delta > this.scrollThreshold) this.classList.add('is-scroll-hidden');
        else if (delta < -this.scrollThreshold) this.classList.remove('is-scroll-hidden');
        this.queueSync();
        if (Math.abs(delta) > 4) this.lastScrollY = y;
      });
    }

    isLiveViewport() {
      return window.innerWidth <= this.breakpoint;
    }

    queueSync() {
      if (this.syncRAF) cancelAnimationFrame(this.syncRAF);
      this.syncRAF = requestAnimationFrame(() => {
        this.syncRAF = 0;
        if (!this.isConnected) return;
        this.syncVisibilityAndOffset();
      });
    }

    syncVisibilityAndOffset() {
      const live = this.isLiveViewport();
      if (!live) { this.classList.remove('is-scroll-hidden'); this.closeSheet(false); }

      const visibleItems = [...this.querySelectorAll('[data-sp-toolbar-item]')].filter((item) => !item.hidden);
      this.style.setProperty('--sp-toolbar-item-count', String(visibleItems.length));
      this.classList.toggle('is-empty', visibleItems.length === 0);
      if (!live || visibleItems.length === 0) {
        this.releaseGlobalOffset();
        return;
      }

      const height = Math.ceil(this.getBoundingClientRect().height);
      const offset = this.classList.contains('is-scroll-hidden') ? 0 : Math.max(0, height);
      document.documentElement.style.setProperty('--sp-mobile-toolbar-height', `${offset}px`);
      document.documentElement.style.setProperty('--sp-mobile-toolbar-offset', `${offset}px`);
      document.documentElement.classList.add('sp-mobile-toolbar-visible');
      document.documentElement.dataset.spToolbarOwner = this.id || 'toolbar';
    }

    releaseGlobalOffset() {
      if (document.documentElement.dataset.spToolbarOwner && document.documentElement.dataset.spToolbarOwner !== (this.id || 'toolbar')) return;
      document.documentElement.style.removeProperty('--sp-mobile-toolbar-height');
      document.documentElement.style.removeProperty('--sp-mobile-toolbar-offset');
      document.documentElement.classList.remove('sp-mobile-toolbar-visible');
      delete document.documentElement.dataset.spToolbarOwner;
    }
  }

  if (!customElements.get('sp-mobile-toolbar')) {
    customElements.define('sp-mobile-toolbar', SpiderMobileToolbar);
  }
})();
