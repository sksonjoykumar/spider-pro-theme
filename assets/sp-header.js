(() => {
  'use strict';

  const SELECTORS = {
    item: '[data-sp-menu-item]',
    toggle: '[data-sp-submenu-toggle]',
    submenu: '[data-sp-submenu]',
    searchToggle: '[data-sp-search-toggle]',
    searchPanel: '[data-sp-search-panel]',
    searchClose: '[data-sp-search-close]',
    searchDrawerToggle: '[data-sp-search-drawer-toggle]',
    searchDrawer: '[data-sp-search-drawer]',
    searchDrawerClose: '[data-sp-search-drawer-close]',
    searchBackdrop: '[data-sp-search-backdrop]',
    mobileOpen: '[data-sp-mobile-submenu-open]',
    mobileBack: '[data-sp-mobile-submenu-back]',
    mobilePanel: '[data-sp-mobile-submenu]',
    mobileDrawer: '[data-sp-mobile-menu]',
    mobileDrawerTrigger: '[data-sp-mobile-drawer-trigger]',
    mobileView: '[data-sp-mobile-view]',
    mobileSearchUtility: '[data-sp-mobile-search-utility]',
    mobileCartUtility: '[data-sp-mobile-cart-utility]',
    localizationForm: '.sp-header-localization',
    localizationSelect: '[data-sp-localization-select]',
  };

  const focusableSelector =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  class SpiderPremiumHeader extends HTMLElement {
    constructor() {
      super();
      this.abortController = null;
      this.resizeObserver = null;
      this.lastScrollY = window.scrollY;
      this.ticking = false;
      this.hoverTimers = new WeakMap();
      this.mediaDesktop = window.matchMedia('(min-width: 990px)');
      this.mediaHover = window.matchMedia('(hover: hover) and (pointer: fine)');
      this.boundScroll = () => this.queueScroll();
      this.boundResize = () => {
        if (this.mediaDesktop.matches && this.mobileDrawer?.open) {
          window.Spider?.closeDrawer?.(this.mobileDrawer, false);
        }
        this.scheduleFitCheck();
      };
      this.boundMediaChange = () => this.onViewportChange();
      this.searchAbortController = null;
      this.searchDebounceTimer = null;
      this.searchCloseTimer = null;
      this.searchRequestId = 0;
      this.searchDrawerOpen = false;
      this.searchDrawerTrigger = null;
      this.mobileDrawer = null;
      this.mobileViewportObserver = null;
      this.mobileDrawerTransitionTimers = new Set();
      this.cartEditorPreviewOwned = false;
      this.cartEditorPreviewFrame = null;
      this.cartDrawerIsOpen = false;
      this.boundCartDrawerEvent = event => this.onCartDrawerEvent(event);
      this.boundCartDialogClosed = event => this.onCartDialogClosed(event);
    }

    connectedCallback() {
      if (this.__spConnected) return;
      this.__spConnected = true;
      this.abortController = new AbortController();
      const { signal } = this.abortController;

      this.desktop = this.querySelector('[data-sp-header-desktop]');
      this.sectionWrapper = this.closest(
        '.sp-header-section, .shopify-section'
      );
      this.dropdownMode = this.dataset.dropdownMode || 'hover';
      this.stickyBehavior = this.dataset.stickyBehavior || 'always';
      this.designMode =
        this.dataset.designMode === 'true' ||
        Boolean(window.Shopify?.designMode);

      this.setupSearchDrawer(signal);
      this.setupMobileDrawer(signal);

      // The default Cart Drawer is rendered in Spider's System Group.
      // Listen to its existing lifecycle instead of introducing another controller.
      document.addEventListener('spider:drawer:opened', this.boundCartDrawerEvent, { signal });
      document.addEventListener('spider:drawer:closed', this.boundCartDrawerEvent, { signal });
      document.addEventListener('close', this.boundCartDialogClosed, { capture: true, signal });
      this.syncCartDrawerState();
      if (this.designMode && this.dataset.cartEditorPreview === 'true') {
        this.cartEditorPreviewFrame = requestAnimationFrame(() => {
          this.cartEditorPreviewFrame = null;
          this.openCartDrawerEditorPreview();
        });
      }

      this.addEventListener('click', event => this.onClick(event), { signal });
      this.addEventListener('keydown', event => this.onKeyDown(event), {
        signal,
      });
      this.addEventListener('focusout', event => this.onFocusOut(event), {
        signal,
      });
      document.addEventListener(
        'click',
        event => {
          if (!this.contains(event.target)) {
            this.closeAll();
            this.closeSearch();
          }
        },
        { signal }
      );
      this.addEventListener(
        'pointerenter',
        event => this.onPointerEnter(event),
        { signal, capture: true }
      );
      this.addEventListener(
        'pointerleave',
        event => this.onPointerLeave(event),
        { signal, capture: true }
      );
      window.addEventListener('scroll', this.boundScroll, {
        passive: true,
        signal,
      });
      window.addEventListener('resize', this.boundResize, {
        passive: true,
        signal,
      });
      this.mediaDesktop.addEventListener?.('change', this.boundMediaChange, {
        signal,
      });

      this.querySelectorAll(SELECTORS.localizationForm).forEach(form => {
        form.addEventListener('submit', event => event.stopPropagation(), {
          signal,
        });
      });
      this.querySelectorAll(
        '[data-sp-country-select][data-show-flag="true"]'
      ).forEach(select => this.decorateCountryFlags(select));
      this.querySelectorAll(SELECTORS.localizationSelect).forEach(select => {
        select.addEventListener(
          'change',
          () => {
            const form = select.closest('form');
            if (form) HTMLFormElement.prototype.submit.call(form);
          },
          { signal }
        );
      });

      this.syncFitObserver();

      this.updateMegaTop();
      this.checkFit();
      this.updateStickyState(true);
    }

    disconnectedCallback() {
      if (!this.__spConnected) return;
      this.__spConnected = false;
      this.teardownSearchDrawer();
      this.teardownMobileDrawer();
      if (this.cartEditorPreviewFrame != null) cancelAnimationFrame(this.cartEditorPreviewFrame);
      this.cartEditorPreviewFrame = null;
      this.closeCartDrawerEditorPreview();
      this.cartDrawerIsOpen = false;
      this.removeAttribute('data-cart-drawer-active');
      this.abortController?.abort();
      this.abortController = null;
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.hoverTimers = new WeakMap();
      this.sectionWrapper?.classList.remove('sp-header-section--sticky');
    }

    onViewportChange() {
      this.closeAll();
      this.closeSearch();
      this.closeSearchDrawer(false);
      if (this.mediaDesktop.matches && this.mobileDrawer?.open) {
        window.Spider?.closeDrawer?.(this.mobileDrawer, false);
      }
      this.syncFitObserver();
      this.scheduleFitCheck();
      this.updateStickyState(true);
    }

    syncFitObserver() {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      if (!('ResizeObserver' in window) || !this.desktop || !this.mediaDesktop.matches) return;
      this.resizeObserver = new ResizeObserver(() => this.scheduleFitCheck());
      const observed = new Set([
        this.desktop,
        ...this.desktop.querySelectorAll(
          '.sp-header__desktop-row, .sp-header__logo-link, .sp-header__navigation, .sp-header__actions'
        ),
      ]);
      observed.forEach(node => {
        if (node) this.resizeObserver.observe(node);
      });
    }

    onClick(event) {
      const mobileDrawerTrigger = event.target.closest(SELECTORS.mobileDrawerTrigger);
      if (
        mobileDrawerTrigger &&
        this.contains(mobileDrawerTrigger) &&
        this.designMode &&
        this.mobileDrawer
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.openMobileDrawerEditorSafe(mobileDrawerTrigger);
        return;
      }
      const mobileDrawerBackdrop =
        event.target === this.mobileDrawer ? this.mobileDrawer : null;
      if (
        mobileDrawerBackdrop &&
        mobileDrawerBackdrop.dataset.closeStyle === 'icon'
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const mobileSearchUtility = event.target.closest(
        SELECTORS.mobileSearchUtility
      );
      if (mobileSearchUtility && this.contains(mobileSearchUtility)) {
        event.preventDefault();
        event.stopPropagation();
        this.openSearchFromMobileDrawer();
        return;
      }

      const mobileCartUtility = event.target.closest(
        SELECTORS.mobileCartUtility
      );
      if (mobileCartUtility && this.contains(mobileCartUtility)) {
        event.preventDefault();
        event.stopPropagation();
        this.openCartFromMobileDrawer(
          mobileCartUtility.dataset.cartTarget || 'CartDrawer',
          mobileCartUtility.dataset.cartUrl || ''
        );
        return;
      }

      const searchDrawerToggle = event.target.closest(
        SELECTORS.searchDrawerToggle
      );
      if (searchDrawerToggle && this.contains(searchDrawerToggle)) {
        event.preventDefault();
        this.openSearchDrawer(searchDrawerToggle);
        return;
      }

      const searchDrawerClose = event.target.closest(
        SELECTORS.searchDrawerClose
      );
      if (searchDrawerClose && this.searchDrawer?.contains(searchDrawerClose)) {
        event.preventDefault();
        this.closeSearchDrawer(true);
        return;
      }

      const searchBackdrop = event.target.closest(SELECTORS.searchBackdrop);
      if (searchBackdrop && this.searchDrawer?.contains(searchBackdrop)) {
        event.preventDefault();
        if (this.searchDrawer.dataset.closeOverlay === 'true')
          this.closeSearchDrawer(true);
        return;
      }

      const clearSearch = event.target.closest('[data-sp-search-clear]');
      if (clearSearch && this.searchDrawer?.contains(clearSearch)) {
        event.preventDefault();
        if (this.searchInput) {
          this.searchInput.value = '';
          this.handleSearchInput(true);
          this.searchInput.focus();
        }
        return;
      }

      const clearRecent = event.target.closest('[data-sp-search-recent-clear]');
      if (clearRecent && this.searchDrawer?.contains(clearRecent)) {
        event.preventDefault();
        this.clearRecentSearches();
        return;
      }

      const querySuggestion = event.target.closest(
        '[data-sp-search-query-suggestion]'
      );
      if (querySuggestion && this.searchDrawer?.contains(querySuggestion)) {
        event.preventDefault();
        const term =
          querySuggestion.dataset.spSearchQuerySuggestion ||
          querySuggestion.textContent?.trim() ||
          '';
        if (this.searchInput && term) {
          this.searchInput.value = term;
          this.updateSearchClear();
          this.performPredictiveSearch(term);
          this.searchInput.focus();
        }
        return;
      }

      const drawerNavigation = event.target.closest('a[href]');
      if (drawerNavigation && this.searchDrawer?.contains(drawerNavigation)) {
        const term =
          drawerNavigation.dataset.spSearchTerm ||
          this.searchInput?.value?.trim();
        if (term) this.addRecentSearch(term);
      }

      const otherDrawerTrigger = event.target.closest('[data-drawer-open]');
      if (
        otherDrawerTrigger &&
        this.contains(otherDrawerTrigger) &&
        this.searchDrawerOpen
      ) {
        this.closeSearchDrawer(false);
      }
      const toggle = event.target.closest(SELECTORS.toggle);
      if (toggle && this.contains(toggle)) {
        event.preventDefault();
        const item = toggle.closest(SELECTORS.item);
        this.toggleItem(item, toggle.getAttribute('aria-expanded') !== 'true');
        return;
      }

      const searchToggle = event.target.closest(SELECTORS.searchToggle);
      if (searchToggle && this.contains(searchToggle)) {
        event.preventDefault();
        const id = searchToggle.getAttribute('aria-controls');
        const panel = id ? this.querySelector(`#${CSS.escape(id)}`) : null;
        if (!panel) return;
        const open = panel.hidden;
        if (open) this.openSearch(searchToggle, panel);
        else this.closeSearch(true, panel);
        return;
      }

      const searchClose = event.target.closest(SELECTORS.searchClose);
      if (searchClose) {
        event.preventDefault();
        this.closeSearch(true, searchClose.closest(SELECTORS.searchPanel));
        return;
      }

      const mobileOpen = event.target.closest(SELECTORS.mobileOpen);
      if (mobileOpen && this.contains(mobileOpen)) {
        event.preventDefault();
        this.openMobilePanel(mobileOpen);
        return;
      }

      const mobileBack = event.target.closest(SELECTORS.mobileBack);
      if (mobileBack && this.contains(mobileBack)) {
        event.preventDefault();
        this.closeMobilePanel(mobileBack.closest(SELECTORS.mobilePanel), true);
        return;
      }

      if (
        !event.target.closest(SELECTORS.item) &&
        !event.target.closest('[data-sp-contact]')
      )
        this.closeAll();
    }

    onKeyDown(event) {
      if (this.searchDrawerOpen && this.searchDrawer) {
        if (
          event.key === 'Escape' &&
          this.searchDrawer.dataset.closeEscape === 'true'
        ) {
          event.preventDefault();
          event.stopPropagation();
          this.closeSearchDrawer(true);
          return;
        }
        if (event.key === 'Tab') {
          this.trapSearchDrawerFocus(event);
          return;
        }
      }
      if (event.key === 'Escape') {
        const mobilePanel = event.target.closest(SELECTORS.mobilePanel);
        if (mobilePanel && !mobilePanel.hidden) {
          event.preventDefault();
          this.closeMobilePanel(mobilePanel, true);
          return;
        }
        const openItem = event.target.closest(SELECTORS.item);
        if (openItem?.classList.contains('is-open')) {
          event.preventDefault();
          const toggle = openItem.querySelector(
            ':scope > .sp-header__menu-link-row > [data-sp-submenu-toggle]'
          );
          this.toggleItem(openItem, false);
          toggle?.focus();
          return;
        }
        const activeSearch =
          event.target.closest(SELECTORS.searchPanel) ||
          [...this.querySelectorAll(SELECTORS.searchPanel)].find(
            panel => !panel.hidden
          );
        if (activeSearch && !activeSearch.hidden) {
          event.preventDefault();
          this.closeSearch(true, activeSearch);
          return;
        }
        this.closeAll();
      }

      const item = event.target.closest(SELECTORS.item);
      if (!item || !this.contains(item)) return;
      const items = [...item.parentElement.children].filter(node =>
        node.matches?.(SELECTORS.item)
      );
      const index = items.indexOf(item);
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const rtl = getComputedStyle(this).direction === 'rtl';
        const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
        const next =
          items[(index + (forward ? 1 : -1) + items.length) % items.length];
        next?.querySelector('.sp-header__menu-link')?.focus();
      } else if (event.key === 'ArrowDown') {
        const toggle = item.querySelector(
          ':scope > .sp-header__menu-link-row > [data-sp-submenu-toggle]'
        );
        const submenu = item.querySelector(':scope > [data-sp-submenu]');
        if (!toggle || !submenu) return;
        event.preventDefault();
        this.toggleItem(item, true);
        requestAnimationFrame(() =>
          submenu.querySelector(focusableSelector)?.focus()
        );
      }
    }

    onFocusOut(event) {
      const item = event.target.closest(SELECTORS.item);
      if (
        item &&
        !item.contains(event.relatedTarget) &&
        this.dropdownMode === 'click'
      )
        this.toggleItem(item, false);
    }

    onPointerEnter(event) {
      const contact = event.target.closest?.(
        '[data-sp-contact][data-open-mode="hover"]'
      );
      if (
        contact &&
        this.contains(contact) &&
        this.mediaDesktop.matches &&
        this.mediaHover.matches
      )
        contact.open = true;
      if (
        this.dropdownMode !== 'hover' ||
        !this.mediaDesktop.matches ||
        !this.mediaHover.matches
      )
        return;
      const item = event.target.closest?.(SELECTORS.item);
      if (!item || !this.contains(item) || !item.matches('.has-submenu'))
        return;
      const timer = this.hoverTimers.get(item);
      if (timer) clearTimeout(timer);
      this.toggleItem(item, true);
    }

    onPointerLeave(event) {
      const contact = event.target.closest?.(
        '[data-sp-contact][data-open-mode="hover"]'
      );
      if (
        contact &&
        this.contains(contact) &&
        this.mediaDesktop.matches &&
        this.mediaHover.matches &&
        !contact.contains(event.relatedTarget)
      )
        contact.open = false;
      if (
        this.dropdownMode !== 'hover' ||
        !this.mediaDesktop.matches ||
        !this.mediaHover.matches
      )
        return;
      const item = event.target.closest?.(SELECTORS.item);
      if (
        !item ||
        !this.contains(item) ||
        !item.matches('.has-submenu') ||
        item.contains(event.relatedTarget)
      )
        return;
      const timer = window.setTimeout(() => this.toggleItem(item, false), 110);
      this.hoverTimers.set(item, timer);
    }

    toggleItem(item, open) {
      if (!item) return;
      const toggle = item.querySelector(
        ':scope > .sp-header__menu-link-row > [data-sp-submenu-toggle]'
      );
      const submenu = item.querySelector(':scope > [data-sp-submenu]');
      if (!toggle || !submenu) return;
      if (open) this.closeAll(item);
      item.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      submenu.hidden = !open;
      if (open) this.positionSubmenu(item, submenu);
    }

    closeAll(except = null) {
      this.querySelectorAll(`${SELECTORS.item}.is-open`).forEach(item => {
        if (item === except) return;
        const toggle = item.querySelector(
          ':scope > .sp-header__menu-link-row > [data-sp-submenu-toggle]'
        );
        const submenu = item.querySelector(':scope > [data-sp-submenu]');
        item.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
        if (submenu) submenu.hidden = true;
      });
      this.querySelectorAll('[data-sp-contact][open]').forEach(details =>
        details.removeAttribute('open')
      );
    }

    positionSubmenu(item, submenu) {
      this.updateMegaTop();
      if (submenu.classList.contains('sp-header__submenu--mega')) return;
      submenu.style.removeProperty('inset-inline-start');
      submenu.style.removeProperty('inset-inline-end');
      requestAnimationFrame(() => {
        const rect = submenu.getBoundingClientRect();
        const gutter = 10;
        if (rect.right > window.innerWidth - gutter) {
          submenu.style.setProperty('inset-inline-start', 'auto');
          submenu.style.setProperty('inset-inline-end', '0');
        } else if (rect.left < gutter) {
          submenu.style.setProperty('inset-inline-start', '0');
          submenu.style.setProperty('inset-inline-end', 'auto');
        }
      });
    }

    setupSearchDrawer(signal) {
      this.searchDrawer = this.querySelector(SELECTORS.searchDrawer);
      if (!this.searchDrawer) return;

      this.searchPanelDrawer = this.searchDrawer.querySelector(
        '[data-sp-search-panel-drawer]'
      );
      this.searchFormDrawer = this.searchDrawer.querySelector(
        '[data-sp-search-drawer-form]'
      );
      this.searchInput = this.searchDrawer.querySelector(
        '[data-sp-search-input]'
      );
      this.searchScope = this.searchDrawer.querySelector(
        '[data-sp-search-scope]'
      );
      this.searchTypeInput = this.searchDrawer.querySelector(
        '[data-sp-search-type]'
      );
      this.searchClear = this.searchDrawer.querySelector(
        '[data-sp-search-clear]'
      );
      this.searchEmpty = this.searchDrawer.querySelector(
        '[data-sp-search-empty]'
      );
      this.searchResults = this.searchDrawer.querySelector(
        '[data-sp-search-results]'
      );
      this.searchLoading = this.searchDrawer.querySelector(
        '[data-sp-search-loading]'
      );
      this.searchError = this.searchDrawer.querySelector(
        '[data-sp-search-error]'
      );
      this.searchNoResults = this.searchDrawer.querySelector(
        '[data-sp-search-no-results]'
      );
      this.searchNoResultsTitle = this.searchDrawer.querySelector(
        '[data-sp-search-no-results-title]'
      );
      this.searchResultSections = this.searchDrawer.querySelector(
        '[data-sp-search-result-sections]'
      );
      this.searchStatus = this.searchDrawer.querySelector(
        '[data-sp-search-status]'
      );
      this.searchViewAll = this.searchDrawer.querySelector(
        '[data-sp-search-view-all]'
      );
      this.searchViewAllQuery = this.searchDrawer.querySelector(
        '[data-sp-search-view-all-query]'
      );
      this.searchRecentSection = this.searchDrawer.querySelector(
        '[data-sp-search-recent-section]'
      );
      this.searchRecentList = this.searchDrawer.querySelector(
        '[data-sp-search-recent-list]'
      );

      this.searchInput?.addEventListener(
        'input',
        () => this.handleSearchInput(false),
        { signal }
      );
      this.searchScope?.addEventListener(
        'change',
        () => {
          this.syncSearchFormType();
          const query = this.searchInput?.value?.trim() || '';
          if (query.length >= this.searchMinChars())
            this.performPredictiveSearch(query);
        },
        { signal }
      );
      this.searchFormDrawer?.addEventListener(
        'submit',
        () => {
          const term = this.searchInput?.value?.trim();
          if (term) this.addRecentSearch(term);
          this.syncSearchFormType();
        },
        { signal }
      );

      this.syncSearchFormType();
      this.updateSearchClear();
      this.renderRecentSearches();
      this.resetSearchDrawerContent();

      if (
        this.searchDrawer.dataset.designMode === 'true' &&
        this.searchDrawer.dataset.editorPreview === 'true'
      ) {
        requestAnimationFrame(() =>
          this.openSearchDrawer(null, { editorPreview: true })
        );
      }
    }

    teardownSearchDrawer() {
      window.clearTimeout(this.searchDebounceTimer);
      window.clearTimeout(this.searchCloseTimer);
      this.searchDebounceTimer = null;
      this.searchCloseTimer = null;
      this.searchAbortController?.abort();
      this.searchAbortController = null;
      this.searchRequestId += 1;
      if (this.searchDrawerOpen) this.closeSearchDrawer(false, true);
    }

    openSearchDrawer(trigger = null, options = {}) {
      // The independent System Group Search Modal owns the modern search UI.
      // Retain the legacy drawer controller for compatibility, but never leave
      // a Header search trigger inert when the legacy drawer is not rendered.
      if (!this.searchDrawer) {
        if (typeof window.Spider?.openSearchModal === 'function') {
          window.Spider.openSearchModal(trigger);
        } else {
          window.location.assign(this.dataset.searchUrl || '/search');
        }
        return;
      }
      if (this.searchDrawerOpen) {
        if (trigger) this.searchDrawerTrigger = trigger;
        return;
      }

      this.closeAll();
      this.closeSearch(false);
      this.classList.remove('is-scroll-hidden');
      this.classList.add('is-search-drawer-open');
      const mobileMenu = this.querySelector('[data-sp-mobile-menu][open]');
      mobileMenu?.querySelector('[data-drawer-close]')?.click();
      const cartDrawer = document.querySelector(
        '#CartDrawer[open], dialog#CartDrawer[open]'
      );
      cartDrawer?.querySelector('[data-drawer-close]')?.click();

      window.clearTimeout(this.searchCloseTimer);
      this.searchDrawerTrigger = trigger || this.searchDrawerTrigger;
      this.searchDrawer.hidden = false;
      this.searchDrawer.setAttribute('aria-hidden', 'false');
      this.searchDrawerOpen = true;
      this.querySelectorAll(SELECTORS.searchDrawerToggle).forEach(button =>
        button.setAttribute(
          'aria-expanded',
          button === trigger ? 'true' : 'false'
        )
      );
      if (this.searchDrawer.dataset.lockScroll === 'true')
        document.documentElement.classList.add('sp-search-drawer-lock');

      requestAnimationFrame(() => {
        if (!this.searchDrawerOpen) return;
        this.searchDrawer.classList.add('is-open');
        const shouldFocus =
          options.editorPreview !== true && this.shouldAutofocusSearch();
        if (shouldFocus) {
          window.setTimeout(
            () => this.searchInput?.focus({ preventScroll: true }),
            this.mediaDesktop.matches ? 20 : 90
          );
        } else if (options.editorPreview !== true) {
          this.searchPanelDrawer?.focus({ preventScroll: true });
        }
      });
    }

    closeSearchDrawer(restore = false, immediate = false) {
      if (!this.searchDrawer) return;
      this.searchAbortController?.abort();
      this.searchAbortController = null;
      window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
      this.searchRequestId += 1;

      const trigger = this.searchDrawerTrigger;
      this.searchDrawerOpen = false;
      this.classList.remove('is-search-drawer-open');
      this.searchDrawer.classList.remove('is-open');
      this.searchDrawer.setAttribute('aria-hidden', 'true');
      this.querySelectorAll(SELECTORS.searchDrawerToggle).forEach(button =>
        button.setAttribute('aria-expanded', 'false')
      );
      document.documentElement.classList.remove('sp-search-drawer-lock');

      const finish = () => {
        if (!this.searchDrawer || this.searchDrawerOpen) return;
        this.searchDrawer.hidden = true;
      };
      window.clearTimeout(this.searchCloseTimer);
      if (
        immediate ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        finish();
      else
        this.searchCloseTimer = window.setTimeout(
          finish,
          this.searchAnimationDuration() + 40
        );

      if (restore && trigger?.isConnected)
        requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
      this.searchDrawerTrigger = null;
    }

    shouldAutofocusSearch() {
      if (!this.searchDrawer) return false;
      if (this.mediaDesktop.matches)
        return this.searchDrawer.dataset.autofocus === 'true';
      return this.searchDrawer.dataset.mobileAutofocus === 'true';
    }

    searchAnimationDuration() {
      const value = Number.parseFloat(
        getComputedStyle(this).getPropertyValue('--sp-search-drawer-animation')
      );
      return Number.isFinite(value) ? value : 300;
    }

    trapSearchDrawerFocus(event) {
      const panel = this.searchPanelDrawer;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll(focusableSelector)].filter(
        node => {
          const style = getComputedStyle(node);
          return (
            !node.hidden &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          );
        }
      );
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    searchMinChars() {
      return Math.max(
        1,
        Math.min(4, Number(this.searchDrawer?.dataset.minChars || 2))
      );
    }

    handleSearchInput(immediateReset = false) {
      if (!this.searchInput || !this.searchDrawer) return;
      const query = this.searchInput.value.trim();
      this.updateSearchClear();
      window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
      this.searchAbortController?.abort();
      this.searchAbortController = null;

      if (query.length < this.searchMinChars()) {
        this.resetSearchDrawerContent();
        return;
      }

      if (this.searchDrawer.dataset.predictive !== 'true') {
        this.renderSearchOnlyState(query);
        return;
      }

      this.setSearchLoading(true);
      const delay = immediateReset ? 0 : 250;
      this.searchDebounceTimer = window.setTimeout(
        () => this.performPredictiveSearch(query),
        delay
      );
    }

    updateSearchClear() {
      if (!this.searchClear || !this.searchInput) return;
      this.searchClear.hidden = this.searchInput.value.length === 0;
    }

    syncSearchFormType() {
      if (!this.searchTypeInput) return;
      const scope = this.searchScope?.value || 'all';
      const searchable = ['product', 'page', 'article'];
      if (searchable.includes(scope)) {
        this.searchTypeInput.disabled = false;
        this.searchTypeInput.value = scope;
      } else {
        this.searchTypeInput.disabled = true;
        this.searchTypeInput.value = '';
      }
    }

    enabledSearchTypes() {
      return (
        this.searchDrawer?.dataset.resourceTypes || 'product,collection,query'
      )
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    }

    scopedSearchTypes() {
      const enabled = this.enabledSearchTypes();
      const scope = this.searchScope?.value || 'all';
      if (scope !== 'all' && enabled.includes(scope)) return [scope];
      return enabled;
    }

    async performPredictiveSearch(rawQuery) {
      if (!this.searchDrawer || !this.searchInput) return;
      const query = String(rawQuery || '').trim();
      if (query.length < this.searchMinChars()) {
        this.resetSearchDrawerContent();
        return;
      }
      if (this.searchDrawer.dataset.predictive !== 'true') {
        this.renderSearchOnlyState(query);
        return;
      }

      this.searchAbortController?.abort();
      this.searchAbortController = new AbortController();
      const requestId = ++this.searchRequestId;
      this.setSearchLoading(true);

      try {
        let base = this.searchDrawer.dataset.predictiveUrl || '/search/suggest';
        if (!/\.json(?:\?|$)/.test(base))
          base = base.replace(/\/?$/, '') + '.json';
        const url = /^[a-z][a-z0-9+.-]*:/i.test(base)
          ? new URL(base)
          : new URL(base, window.location.origin);
        url.searchParams.set('q', query);
        url.searchParams.set(
          'resources[type]',
          this.scopedSearchTypes().join(',')
        );
        url.searchParams.set('resources[limit]', '10');
        url.searchParams.set(
          'resources[options][unavailable_products]',
          'last'
        );

        const response = await fetch(url.toString(), {
          signal: this.searchAbortController.signal,
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
        if (!response.ok)
          throw new Error(`Predictive search failed: ${response.status}`);
        const payload = await response.json();
        if (
          requestId !== this.searchRequestId ||
          query !== this.searchInput.value.trim()
        )
          return;
        const results = payload?.resources?.results || {};
        this.renderPredictiveResults(results, query);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (requestId !== this.searchRequestId) return;
        this.renderSearchError(query);
      }
    }

    setSearchLoading(loading) {
      if (!this.searchResults) return;
      this.searchResults.setAttribute('aria-busy', loading ? 'true' : 'false');
      if (this.searchLoading) this.searchLoading.hidden = !loading;
      if (loading) {
        if (this.searchEmpty) this.searchEmpty.hidden = true;
        if (this.searchError) this.searchError.hidden = true;
        if (this.searchNoResults) this.searchNoResults.hidden = true;
        if (this.searchResultSections) this.searchResultSections.hidden = true;
        if (this.searchViewAll) this.searchViewAll.hidden = true;
      }
    }

    resetSearchDrawerContent() {
      this.setSearchLoading(false);
      if (this.searchEmpty) this.searchEmpty.hidden = false;
      if (this.searchError) this.searchError.hidden = true;
      if (this.searchNoResults) this.searchNoResults.hidden = true;
      if (this.searchResultSections) this.searchResultSections.hidden = true;
      if (this.searchViewAll) this.searchViewAll.hidden = true;
      this.clearSearchResultLists();
      if (this.searchStatus) this.searchStatus.textContent = '';
      this.renderRecentSearches();
    }

    renderSearchOnlyState(query) {
      this.setSearchLoading(false);
      if (this.searchEmpty) this.searchEmpty.hidden = true;
      if (this.searchError) this.searchError.hidden = true;
      if (this.searchNoResults) this.searchNoResults.hidden = true;
      if (this.searchResultSections) this.searchResultSections.hidden = true;
      this.updateViewAll(query, true);
      if (this.searchStatus)
        this.searchStatus.textContent = 'Press Enter to search.';
    }

    renderSearchError(query) {
      this.setSearchLoading(false);
      if (this.searchEmpty) this.searchEmpty.hidden = true;
      if (this.searchError) this.searchError.hidden = false;
      if (this.searchNoResults) this.searchNoResults.hidden = true;
      if (this.searchResultSections) this.searchResultSections.hidden = true;
      this.updateViewAll(query, true);
      if (this.searchStatus)
        this.searchStatus.textContent =
          'Unable to load suggestions. You can still submit the search form.';
    }

    clearSearchResultLists() {
      this.searchDrawer
        ?.querySelectorAll('[data-sp-search-list]')
        .forEach(list => list.replaceChildren());
      this.searchDrawer
        ?.querySelectorAll('[data-sp-search-section]')
        .forEach(section => {
          section.hidden = true;
        });
    }

    renderPredictiveResults(results, query) {
      this.setSearchLoading(false);
      this.clearSearchResultLists();
      if (this.searchEmpty) this.searchEmpty.hidden = true;
      if (this.searchError) this.searchError.hidden = true;

      let total = 0;
      total += this.renderQueryResults(
        results.queries || [],
        this.searchLimit('query')
      );
      total += this.renderProductResults(
        results.products || [],
        this.searchLimit('product')
      );
      total += this.renderSimpleResults(
        'collections',
        results.collections || [],
        this.searchLimit('collection'),
        'Collection'
      );
      total += this.renderSimpleResults(
        'pages',
        results.pages || [],
        this.searchLimit('page'),
        'Page'
      );
      total += this.renderSimpleResults(
        'articles',
        results.articles || [],
        this.searchLimit('article'),
        'Article'
      );

      if (this.searchResultSections)
        this.searchResultSections.hidden = total === 0;
      if (this.searchNoResults) this.searchNoResults.hidden = total !== 0;
      if (this.searchNoResultsTitle && total === 0)
        this.searchNoResultsTitle.textContent = `No results found for “${query}”.`;
      this.updateViewAll(query, true);
      if (this.searchStatus)
        this.searchStatus.textContent = total
          ? `${total} results found.`
          : `No results found for ${query}.`;
    }

    searchLimit(type) {
      const map = {
        product: 'productLimit',
        collection: 'collectionLimit',
        query: 'queryLimit',
        page: 'pageLimit',
        article: 'articleLimit',
      };
      const key = map[type];
      return Math.max(
        1,
        Math.min(10, Number(this.searchDrawer?.dataset[key] || 5))
      );
    }

    renderQueryResults(items, limit) {
      const section = this.searchDrawer?.querySelector(
        '[data-sp-search-section="queries"]'
      );
      const list = this.searchDrawer?.querySelector(
        '[data-sp-search-list="queries"]'
      );
      if (!section || !list) return 0;
      const usable = items.slice(0, limit);
      usable.forEach(item => {
        const term = item?.text || item?.styled_text || item?.title || '';
        if (!term) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sp-search-drawer__suggestion';
        button.dataset.spSearchQuerySuggestion = term;
        const text = document.createElement('span');
        text.textContent = term;
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        button.append(text, arrow);
        list.appendChild(button);
      });
      section.hidden = list.children.length === 0;
      return list.children.length;
    }

    renderProductResults(items, limit) {
      const section = this.searchDrawer?.querySelector(
        '[data-sp-search-section="products"]'
      );
      const list = this.searchDrawer?.querySelector(
        '[data-sp-search-list="products"]'
      );
      if (!section || !list) return 0;
      items.slice(0, limit).forEach(product => {
        if (!product?.url || !product?.title) return;
        const link = document.createElement('a');
        link.className = 'sp-search-drawer__product';
        link.href = product.url;
        link.dataset.spSearchTerm = this.searchInput?.value?.trim() || '';

        if (
          this.searchDrawer.dataset.showProductImages === 'true' &&
          product.featured_image?.url
        ) {
          const media = document.createElement('span');
          media.className = 'sp-search-drawer__product-media';
          media.dataset.ratio =
            this.searchDrawer.dataset.productImageRatio || 'square';
          const image = document.createElement('img');
          image.src = this.searchImageUrl(
            product.featured_image.url,
            Math.max(
              120,
              Number.parseInt(
                getComputedStyle(this).getPropertyValue(
                  '--sp-search-product-image-size'
                ),
                10
              ) * 2 || 144
            )
          );
          image.alt = product.featured_image.alt || product.title;
          image.loading = 'lazy';
          image.decoding = 'async';
          media.appendChild(image);
          link.appendChild(media);
        }

        const copy = document.createElement('span');
        copy.className = 'sp-search-drawer__product-copy';
        const title = document.createElement('span');
        title.className = 'sp-search-drawer__product-title';
        title.textContent = product.title;
        copy.appendChild(title);

        if (this.searchDrawer.dataset.showVendor === 'true' && product.vendor) {
          const vendor = document.createElement('span');
          vendor.className = 'sp-search-drawer__vendor';
          vendor.textContent = product.vendor;
          copy.appendChild(vendor);
        }

        if (this.searchDrawer.dataset.showPrice === 'true') {
          const priceValue = this.searchNumber(
            product.price_min ?? product.price
          );
          const compareValue = this.searchNumber(
            product.compare_at_price_min ?? product.compare_at_price_max
          );
          const row = document.createElement('span');
          row.className = 'sp-search-drawer__price-row';
          const price = document.createElement('span');
          price.className = 'sp-search-drawer__price';
          price.textContent = this.formatSearchMoney(priceValue);
          row.appendChild(price);
          if (
            this.searchDrawer.dataset.showCompare === 'true' &&
            compareValue > priceValue
          ) {
            const compare = document.createElement('span');
            compare.className = 'sp-search-drawer__compare';
            compare.textContent = this.formatSearchMoney(compareValue);
            row.appendChild(compare);
            if (this.searchDrawer.dataset.showSale === 'true') {
              const sale = document.createElement('span');
              sale.className = 'sp-search-drawer__sale';
              sale.textContent = 'Sale';
              row.appendChild(sale);
            }
          }
          copy.appendChild(row);
        }
        link.appendChild(copy);
        list.appendChild(link);
      });
      section.hidden = list.children.length === 0;
      return list.children.length;
    }

    renderSimpleResults(type, items, limit, label) {
      const section = this.searchDrawer?.querySelector(
        `[data-sp-search-section="${type}"]`
      );
      const list = this.searchDrawer?.querySelector(
        `[data-sp-search-list="${type}"]`
      );
      if (!section || !list) return 0;
      items.slice(0, limit).forEach(item => {
        if (!item?.url || !item?.title) return;
        const link = document.createElement('a');
        link.className = 'sp-search-drawer__result-link';
        link.href = item.url;
        link.dataset.spSearchTerm = this.searchInput?.value?.trim() || '';
        const title = document.createElement('span');
        title.textContent = item.title;
        const meta = document.createElement('span');
        meta.className = 'sp-search-drawer__result-meta';
        meta.textContent = label;
        link.append(title, meta);
        list.appendChild(link);
      });
      section.hidden = list.children.length === 0;
      return list.children.length;
    }

    searchImageUrl(rawUrl, width) {
      try {
        const url = new URL(rawUrl, window.location.origin);
        url.searchParams.set('width', String(width));
        return url.toString();
      } catch (_) {
        return rawUrl;
      }
    }

    searchNumber(value) {
      const number = Number.parseFloat(
        String(value ?? '').replace(/[^0-9.-]/g, '')
      );
      return Number.isFinite(number) ? number : 0;
    }

    formatSearchMoney(value) {
      try {
        return new Intl.NumberFormat(
          this.searchDrawer?.dataset.locale || undefined,
          {
            style: 'currency',
            currency: this.searchDrawer?.dataset.currency || 'USD',
          }
        ).format(value || 0);
      } catch (_) {
        return String(value || 0);
      }
    }

    updateViewAll(query, visible) {
      if (!this.searchViewAll) return;
      const base = this.searchDrawer?.dataset.searchUrl || '/search';
      const url = /^[a-z][a-z0-9+.-]*:/i.test(base)
        ? new URL(base)
        : new URL(base, window.location.origin);
      url.searchParams.set('q', query);
      const scope = this.searchScope?.value || 'all';
      if (['product', 'page', 'article'].includes(scope))
        url.searchParams.set('type', scope);
      this.searchViewAll.href = `${url.pathname}${url.search}`;
      this.searchViewAll.hidden = !visible;
      if (this.searchViewAllQuery) this.searchViewAllQuery.textContent = query;
    }

    recentStorageKey() {
      return `sp_recent_searches_${this.dataset.sectionId || 'header'}_v1`;
    }

    readRecentSearches() {
      if (this.searchDrawer?.dataset.recentEnabled !== 'true') return [];
      try {
        const value = JSON.parse(
          localStorage.getItem(this.recentStorageKey()) || '[]'
        );
        return Array.isArray(value)
          ? value
              .filter(item => typeof item === 'string' && item.trim())
              .slice(0, Number(this.searchDrawer.dataset.recentMax || 5))
          : [];
      } catch (_) {
        return [];
      }
    }

    addRecentSearch(rawTerm) {
      if (this.searchDrawer?.dataset.recentEnabled !== 'true') return;
      const term = String(rawTerm || '')
        .trim()
        .slice(0, 120);
      if (!term) return;
      const max = Math.max(
        3,
        Math.min(8, Number(this.searchDrawer.dataset.recentMax || 5))
      );
      const values = [
        term,
        ...this.readRecentSearches().filter(
          item => item.toLocaleLowerCase() !== term.toLocaleLowerCase()
        ),
      ].slice(0, max);
      try {
        localStorage.setItem(this.recentStorageKey(), JSON.stringify(values));
      } catch (_) {}
      this.renderRecentSearches();
    }

    clearRecentSearches() {
      try {
        localStorage.removeItem(this.recentStorageKey());
      } catch (_) {}
      this.renderRecentSearches();
    }

    renderRecentSearches() {
      if (
        !this.searchRecentSection ||
        !this.searchRecentList ||
        !this.searchDrawer
      )
        return;
      const values = this.readRecentSearches();
      this.searchRecentList.replaceChildren();
      values.forEach(term => {
        const link = document.createElement('a');
        link.className = 'sp-search-drawer__chip';
        const base = this.searchDrawer.dataset.searchUrl || '/search';
        const url = /^[a-z][a-z0-9+.-]*:/i.test(base)
          ? new URL(base)
          : new URL(base, window.location.origin);
        url.searchParams.set('q', term);
        link.href = `${url.pathname}${url.search}`;
        link.dataset.spSearchTerm = term;
        link.textContent = term;
        this.searchRecentList.appendChild(link);
      });
      this.searchRecentSection.hidden = values.length === 0;
    }

    openSearch(trigger, panel) {
      this.closeAll();
      this.querySelectorAll(SELECTORS.searchPanel).forEach(other => {
        if (other !== panel) this.closeSearch(false, other);
      });
      panel.hidden = false;
      panel.__spTrigger = trigger;
      trigger.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() =>
        panel.querySelector('input[type="search"]')?.focus()
      );
    }

    closeSearch(restore = false, panel = null) {
      const panels = panel
        ? [panel]
        : [...this.querySelectorAll(SELECTORS.searchPanel)];
      panels.forEach(current => {
        if (!current || current.hidden) return;
        current.hidden = true;
        const trigger = current.__spTrigger;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (restore && trigger) requestAnimationFrame(() => trigger.focus());
      });
      if (!panel)
        this.querySelectorAll(SELECTORS.searchToggle).forEach(button =>
          button.setAttribute('aria-expanded', 'false')
        );
    }

    setupMobileDrawer(signal) {
      this.mobileDrawer = this.querySelector(SELECTORS.mobileDrawer);
      if (!this.mobileDrawer) return;

      this.mobileDrawer.addEventListener(
        'close',
        () => this.resetMobileNavigation(),
        { signal }
      );

      if (
        this.designMode &&
        this.mobileDrawer.dataset.editorPreview === 'true' &&
        !this.mediaDesktop.matches
      ) {
        requestAnimationFrame(() => {
          const trigger = this.querySelector(SELECTORS.mobileDrawerTrigger);
          if (!this.mobileDrawer?.open && trigger) {
            this.openMobileDrawerEditorSafe(trigger);
          }
        });
      }
    }

    openMobileDrawerEditorSafe(trigger) {
      if (!this.mobileDrawer || this.mobileDrawer.open) return;

      // Shopify Theme Editor frequently replaces the entire Header section
      // while settings are changed. Keeping a modal <dialog> in the browser
      // top-layer during that replacement can make the editor iframe unstable.
      // In design mode we therefore use non-modal dialog.show() for visual
      // preview. Live storefront keeps Spider's normal showModal() behaviour.
      document.querySelectorAll('dialog.sp-drawer[open]').forEach(dialog => {
        if (dialog !== this.mobileDrawer) {
          if (window.Spider?.closeDrawer) window.Spider.closeDrawer(dialog, false);
          else dialog.close?.();
        }
      });

      this.mobileDrawer.__trigger = trigger || null;
      this.mobileDrawer.show();
      trigger?.setAttribute('aria-expanded', 'true');
      this.resetMobileNavigation();
      requestAnimationFrame(() => {
        this.mobileDrawer?.querySelector('[data-drawer-close], a[href], button:not([disabled])')?.focus({ preventScroll: true });
      });
    }

    teardownMobileDrawer() {
      this.mobileViewportObserver?.disconnect();
      this.mobileViewportObserver = null;
      this.mobileDrawerTransitionTimers.forEach(timer => clearTimeout(timer));
      this.mobileDrawerTransitionTimers.clear();
      this.resetMobileNavigation();
      this.mobileDrawer = null;
    }

    mobileDrawerAnimationDuration() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
      const value = parseFloat(
        getComputedStyle(this).getPropertyValue('--sp-mobile-drawer-animation')
      );
      return Number.isFinite(value) ? Math.max(0, value) : 300;
    }

    activeMobileView() {
      if (!this.mobileDrawer) return null;
      return [...this.mobileDrawer.querySelectorAll(SELECTORS.mobileView)].find(
        view => !view.hidden
      ) || null;
    }

    openMobilePanel(button) {
      const id = button.getAttribute('data-sp-mobile-submenu-open');
      const panel = id ? this.querySelector(`#${CSS.escape(id)}`) : null;
      if (!panel || !this.mobileDrawer?.contains(panel)) return;

      const current = this.activeMobileView();
      panel.__spTrigger = button;
      panel.dataset.spMobileParentView =
        current?.dataset.spMobileView || panel.dataset.spMobileParentView || 'root';

      button.setAttribute('aria-expanded', 'true');
      if (current && current !== panel) {
        current.hidden = true;
        current.setAttribute('aria-hidden', 'true');
      }
      panel.hidden = false;
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.remove('is-entering');
      requestAnimationFrame(() => {
        panel.classList.add('is-entering');
        panel.querySelector('[data-sp-mobile-submenu-back]')?.focus({ preventScroll: true });
      });
    }

    closeMobilePanel(panel, restore = false) {
      if (!panel || !this.mobileDrawer?.contains(panel)) return;
      const parentKey = panel.dataset.spMobileParentView || 'root';
      const parent = this.mobileDrawer.querySelector(
        `[data-sp-mobile-view="${CSS.escape(parentKey)}"]`
      );
      const trigger =
        panel.__spTrigger ||
        this.querySelector(
          `[data-sp-mobile-submenu-open="${CSS.escape(panel.id)}"]`
        );

      panel.classList.remove('is-entering');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      trigger?.setAttribute('aria-expanded', 'false');
      if (parent) {
        parent.hidden = false;
        parent.setAttribute('aria-hidden', 'false');
      }
      if (restore) requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
    }

    resetMobileNavigation() {
      if (!this.mobileDrawer) return;
      this.mobileDrawer.querySelectorAll(SELECTORS.mobilePanel).forEach(panel => {
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        panel.classList.remove('is-entering');
      });
      this.mobileDrawer.querySelectorAll(SELECTORS.mobileOpen).forEach(button =>
        button.setAttribute('aria-expanded', 'false')
      );
      const root = this.mobileDrawer.querySelector('[data-sp-mobile-view="root"]');
      if (root) {
        root.hidden = false;
        root.setAttribute('aria-hidden', 'false');
      }
    }

    closeMobileDrawerWithoutRestore() {
      if (!this.mobileDrawer?.open) return;
      if (window.Spider?.closeDrawer) {
        window.Spider.closeDrawer(this.mobileDrawer, false);
      } else {
        this.mobileDrawer.close();
      }
    }

    openSearchFromMobileDrawer() {
      if (!this.searchDrawer && typeof window.Spider?.openSearchModal === 'function') {
        const trigger = this.querySelector(SELECTORS.mobileSearchUtility);
        this.closeMobileDrawerWithoutRestore();
        requestAnimationFrame(() => window.Spider?.openSearchModal?.(trigger));
        return;
      }
      if (!this.searchDrawer) {
        window.location.assign(this.mobileDrawer?.dataset.searchUrl || '/search');
        return;
      }
      const externalTrigger =
        this.querySelector('.sp-header__mobile-row [data-sp-search-drawer-toggle]') ||
        this.querySelector('.sp-header__desktop [data-sp-search-drawer-toggle]') ||
        this.querySelector(SELECTORS.mobileDrawerTrigger);
      this.closeMobileDrawerWithoutRestore();
      requestAnimationFrame(() => this.openSearchDrawer(externalTrigger));
    }

    openCartFromMobileDrawer(id, cartUrl = '') {
      const externalTrigger =
        this.querySelector(`.sp-header__mobile-row [data-drawer-open="${CSS.escape(id)}"]`) ||
        this.querySelector(`.sp-header__desktop [data-drawer-open="${CSS.escape(id)}"]`) ||
        this.querySelector(SELECTORS.mobileDrawerTrigger);
      this.closeMobileDrawerWithoutRestore();
      requestAnimationFrame(() => {
        const cartDialog = document.getElementById(id);
        if (cartDialog instanceof HTMLDialogElement && window.Spider?.openDrawer) {
          window.Spider.openDrawer(id, externalTrigger);
        } else if (externalTrigger) {
          externalTrigger.click();
        } else if (cartUrl) {
          window.location.assign(cartUrl);
        }
      });
    }

    decorateCountryFlags(select) {
      [...select.options].forEach(option => {
        const iso = option.value?.toUpperCase();
        if (!/^[A-Z]{2}$/.test(iso) || option.dataset.spFlagged === 'true')
          return;
        const flag = String.fromCodePoint(
          ...[...iso].map(char => 127397 + char.charCodeAt(0))
        );
        option.textContent = `${flag} ${option.textContent}`;
        option.dataset.spFlagged = 'true';
      });
    }

    scheduleFitCheck() {
      cancelAnimationFrame(this.fitFrame);
      this.fitFrame = requestAnimationFrame(() => this.checkFit());
    }

    checkFit() {
      if (!this.desktop || !this.mediaDesktop.matches) {
        this.desktop?.classList.remove('is-fallback');
        this.updateMegaTop();
        return;
      }

      const layout = this.dataset.layout || 'logo-left';
      const canFallback =
        layout === 'logo-left' ||
        layout === 'logo-center' ||
        layout === 'split-menu';
      if (!canFallback) {
        this.desktop.classList.remove('is-fallback');
        this.updateMegaTop();
        return;
      }

      const row = this.desktop.querySelector(
        ':scope > .sp-header__desktop-row'
      );
      if (!row) return;
      const requiredWidth = this.getRequiredRowWidth(row, layout);
      const availableWidth = row.clientWidth;
      const needsFallback = requiredWidth > availableWidth + 1;

      if (this.desktop.classList.contains('is-fallback') !== needsFallback) {
        this.desktop.classList.toggle('is-fallback', needsFallback);
      }
      this.updateMegaTop();
    }

    getRequiredRowWidth(row, layout) {
      const outerGap = this.getGap(row);
      const logo = row.querySelector(
        '.sp-header__slot--logo .sp-header__logo-link'
      );
      const logoWidth = logo?.getBoundingClientRect().width || 0;

      if (layout === 'logo-left') {
        const nav = row.querySelector(
          ':scope > .sp-header__slot--nav .sp-header__menu'
        );
        const actions = row.querySelector(
          ':scope > .sp-header__slot--actions .sp-header__actions'
        );
        const navWidth = this.getMenuNaturalWidth(nav);
        const actionsWidth = this.getFlexNaturalWidth(actions);
        if ((this.dataset.menuPosition || 'center') === 'center') {
          return (
            2 * Math.max(logoWidth, actionsWidth) + navWidth + outerGap * 2
          );
        }
        return logoWidth + navWidth + actionsWidth + outerGap * 2;
      }

      if (layout === 'logo-center') {
        const nav = row.querySelector(
          ':scope > .sp-header__slot--nav .sp-header__menu'
        );
        const actions = row.querySelector(
          ':scope > .sp-header__slot--actions .sp-header__actions'
        );
        const navWidth = this.getMenuNaturalWidth(nav);
        const actionsWidth = this.getFlexNaturalWidth(actions);
        return 2 * Math.max(navWidth, actionsWidth) + logoWidth + outerGap * 2;
      }

      if (layout === 'split-menu') {
        const leftMenu = row.querySelector(
          ':scope > .sp-header__slot--split-left .sp-header__menu'
        );
        const rightZone = row.querySelector(
          ':scope > .sp-header__split-right-zone'
        );
        const rightMenu = rightZone?.querySelector(
          '.sp-header__slot--split-right .sp-header__menu'
        );
        const actions = rightZone?.querySelector(
          '.sp-header__slot--actions .sp-header__actions'
        );
        const leftWidth = this.getMenuNaturalWidth(leftMenu);
        const rightWidth =
          this.getMenuNaturalWidth(rightMenu) +
          this.getFlexNaturalWidth(actions) +
          (rightMenu && actions ? this.getGap(rightZone) : 0);
        return 2 * Math.max(leftWidth, rightWidth) + logoWidth + outerGap * 2;
      }

      return row.scrollWidth;
    }

    getMenuNaturalWidth(menu) {
      if (!menu) return 0;
      const items = [...menu.children].filter(
        node => node.getClientRects().length
      );
      const gap = this.getGap(menu);
      return (
        items.reduce(
          (total, node) => total + node.getBoundingClientRect().width,
          0
        ) +
        Math.max(0, items.length - 1) * gap
      );
    }

    getFlexNaturalWidth(container) {
      if (!container) return 0;
      const children = [...container.children].filter(node => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.position !== 'absolute';
      });
      const gap = this.getGap(container);
      return (
        children.reduce(
          (total, node) => total + node.getBoundingClientRect().width,
          0
        ) +
        Math.max(0, children.length - 1) * gap
      );
    }

    getGap(node) {
      if (!node) return 0;
      const style = getComputedStyle(node);
      const raw = style.columnGap !== 'normal' ? style.columnGap : style.gap;
      const value = Number.parseFloat(raw);
      return Number.isFinite(value) ? value : 0;
    }

    updateMegaTop() {
      const rect = this.getBoundingClientRect();
      const top = Math.max(0, Math.round(rect.bottom));
      this.style.setProperty('--sp-header-mega-top', `${top}px`);
    }

    queueScroll() {
      if (this.ticking) return;
      this.ticking = true;
      requestAnimationFrame(() => {
        this.ticking = false;
        this.updateStickyState(false);
      });
    }

    stickyApplies() {
      const mode = this.dataset.sticky || 'all';
      if (mode === 'none') return false;
      if (mode === 'desktop') return this.mediaDesktop.matches;
      if (mode === 'mobile') return !this.mediaDesktop.matches;
      return true;
    }

    // Open the REAL global Cart Drawer for a visual preview in Shopify's
    // editor. Non-modal dialog.show() avoids a top-layer dialog surviving
    // section replacement while design settings are changed. This has no
    // effect on storefront visitors and does not modify Cart Drawer files.
    openCartDrawerEditorPreview() {
      if (!this.isConnected || !this.designMode || this.dataset.cartEditorPreview !== 'true') return;
      const dialog = document.getElementById('CartDrawer');
      if (!(dialog instanceof HTMLDialogElement)) return;
      if (dialog.open) return; // Do not claim ownership of a manually opened drawer.

      document.querySelectorAll('dialog.sp-drawer[open]').forEach(other => {
        if (other === dialog) return;
        if (typeof window.Spider?.closeDrawer === 'function') window.Spider.closeDrawer(other, false, true);
        else other.close?.();
      });

      try {
        dialog.show(); // Intentionally non-modal for Shopify editor stability.
      } catch (_) { return; }
      this.cartEditorPreviewOwned = true;
      dialog.dataset.spHeaderEditorPreview = 'true';
      dialog.classList.add('sp-drawer--entered');
      dialog.__spRestoreFocus = false;
      this.syncCartDrawerState();
    }

    closeCartDrawerEditorPreview() {
      if (!this.cartEditorPreviewOwned) return;
      this.cartEditorPreviewOwned = false;
      const dialog = document.getElementById('CartDrawer');
      if (!(dialog instanceof HTMLDialogElement) || dialog.dataset.spHeaderEditorPreview !== 'true') return;
      delete dialog.dataset.spHeaderEditorPreview;
      if (dialog.open) {
        if (typeof window.Spider?.closeDrawer === 'function') window.Spider.closeDrawer(dialog, false, true);
        else dialog.close();
      }
    }

    onCartDrawerEvent(event) {
      if (event?.detail?.id !== 'CartDrawer') return;
      this.syncCartDrawerState();
    }

    onCartDialogClosed(event) {
      if (event.target?.id !== 'CartDrawer') return;
      const dialog = event.target;
      if (dialog.dataset.spHeaderEditorPreview === 'true') {
        delete dialog.dataset.spHeaderEditorPreview;
        this.cartEditorPreviewOwned = false;
      }
      this.syncCartDrawerState();
    }

    syncCartDrawerState() {
      const dialog = document.getElementById('CartDrawer');
      const active = Boolean(dialog?.open);
      if (this.cartDrawerIsOpen === active) return;
      this.cartDrawerIsOpen = active;
      this.toggleAttribute('data-cart-drawer-active', active);
      if (active) {
        this.classList.remove('is-scroll-hidden');
        this.lastScrollY = Math.max(0, window.scrollY);
      } else {
        // Resume the merchant's existing sticky behavior without a false
        // scroll-down delta caused by the native dialog's scroll lock.
        this.updateStickyState(true);
      }
    }

    updateStickyState(force) {
      const y = Math.max(0, window.scrollY);
      const active = this.stickyApplies();
      this.sectionWrapper?.classList.toggle(
        'sp-header-section--sticky',
        active
      );
      this.classList.toggle('is-scrolled', active && y > 8);
      // Opening a native dialog locks/adjusts scrolling; treat that as an
      // overlay interaction, never as intentional scroll-down navigation.
      if (this.cartDrawerIsOpen || document.getElementById('CartDrawer')?.open) {
        this.classList.remove('is-scroll-hidden');
        this.lastScrollY = y;
        this.updateMegaTop();
        return;
      }
      if (!active || this.stickyBehavior !== 'scroll_up') {
        this.classList.remove('is-scroll-hidden');
        this.lastScrollY = y;
        return;
      }
      if (force || y < 80) this.classList.remove('is-scroll-hidden');
      else if (y > this.lastScrollY + 6) this.classList.add('is-scroll-hidden');
      else if (y < this.lastScrollY - 4)
        this.classList.remove('is-scroll-hidden');
      this.lastScrollY = y;
      this.updateMegaTop();
    }

    openMegaForBlock(blockId) {
      if (!blockId) return;
      const mega = this.querySelector(
        `[data-sp-mega-block-id="${CSS.escape(blockId)}"]`
      );
      const item = mega?.closest(SELECTORS.item);
      if (item) this.toggleItem(item, true);
    }
  }

  if (!customElements.get('sp-header'))
    customElements.define('sp-header', SpiderPremiumHeader);

  if (!window.__spPremiumHeaderEditorEvents) {
    window.__spPremiumHeaderEditorEvents = true;
    document.addEventListener('shopify:block:select', event => {
      const header =
        event.target?.closest?.('sp-header') ||
        document.querySelector(
          `sp-header[data-section-id="${CSS.escape(event.detail?.sectionId || '')}"]`
        );
      if (!header) return;
      const blockId = event.detail?.blockId;
      const searchSuggestion = blockId
        ? header.querySelector(
            `[data-sp-search-suggestion-block="${CSS.escape(blockId)}"]`
          )
        : null;
      if (searchSuggestion && header.searchDrawer) {
        header.openSearchDrawer?.(null, { editorPreview: true });
        requestAnimationFrame(() =>
          searchSuggestion.scrollIntoView?.({ block: 'nearest' })
        );
        return;
      }
      if (header.dataset.openMegaEditor === 'true')
        header.openMegaForBlock?.(blockId);
    });
    document.addEventListener('shopify:block:deselect', event => {
      const header =
        event.target?.closest?.('sp-header') ||
        document.querySelector(
          `sp-header[data-section-id="${CSS.escape(event.detail?.sectionId || '')}"]`
        );
      header?.closeAll?.();
    });
    document.addEventListener('shopify:section:unload', event => {
      event.target
        ?.querySelectorAll?.('sp-header')
        .forEach(header => header.disconnectedCallback?.());
    });
  }
})();
