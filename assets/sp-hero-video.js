(() => {
  'use strict';

  if (window.SpiderHeroVideoRuntime && window.SpiderHeroVideoRuntime.version) {
    return;
  }

  const SELECTOR = 'sp-hero-video';
  const MOBILE_QUERY = '(max-width: 749px)';
  const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
  const API_TIMEOUT = 12000;

  const runtime = {
    version: '1.0.0',
    instances: new Set(),
    apiPromises: new Map(),
    editorBound: false,
    globalBound: false,

    register(instance) {
      this.instances.add(instance);
      this.bindGlobalEvents();
      this.bindEditorEvents();
    },

    unregister(instance) {
      this.instances.delete(instance);
    },

    bindGlobalEvents() {
      if (this.globalBound) return;
      this.globalBound = true;

      document.addEventListener('visibilitychange', () => {
        this.instances.forEach((instance) => instance.onDocumentVisibility());
      });

      window.addEventListener('resize', () => {
        this.instances.forEach((instance) => instance.onSharedResize());
      }, { passive: true });
    },

    bindEditorEvents() {
      if (this.editorBound) return;
      this.editorBound = true;

      document.addEventListener('shopify:section:load', (event) => {
        const instance = event.target?.querySelector?.(SELECTOR);
        if (instance && typeof instance.editorLoad === 'function') instance.editorLoad();
      });

      document.addEventListener('shopify:section:unload', (event) => {
        const instance = event.target?.querySelector?.(SELECTOR);
        if (instance && typeof instance.destroy === 'function') instance.destroy();
      });

      document.addEventListener('shopify:section:select', (event) => {
        const instance = event.target?.querySelector?.(SELECTOR);
        if (instance && typeof instance.editorSelect === 'function') instance.editorSelect(true);
      });

      document.addEventListener('shopify:section:deselect', (event) => {
        const instance = event.target?.querySelector?.(SELECTOR);
        if (instance && typeof instance.editorSelect === 'function') instance.editorSelect(false);
      });
    },

    loadApi(provider) {
      if (provider === 'youtube' && window.YT?.Player) return Promise.resolve(window.YT);
      if (provider === 'vimeo' && window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
      if (this.apiPromises.has(provider)) return this.apiPromises.get(provider);

      const promise = provider === 'youtube' ? this.loadYouTube() : this.loadVimeo();
      this.apiPromises.set(provider, promise);
      promise.catch(() => this.apiPromises.delete(provider));
      return promise;
    },

    loadYouTube() {
      return new Promise((resolve, reject) => {
        if (window.YT?.Player) {
          resolve(window.YT);
          return;
        }

        let settled = false;
        const finish = () => {
          if (settled || !window.YT?.Player) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(window.YT);
        };
        const fail = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(new Error('YouTube API failed to load'));
        };

        const previousReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          try {
            if (typeof previousReady === 'function') previousReady();
          } finally {
            finish();
          }
        };

        let script = document.querySelector('script[data-sp-hero-video-api="youtube"], script[src*="youtube.com/iframe_api"]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'https://www.youtube.com/iframe_api';
          script.async = true;
          script.dataset.spHeroVideoApi = 'youtube';
          document.head.appendChild(script);
        }
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', fail, { once: true });

        const timeoutId = window.setTimeout(() => {
          if (window.YT?.Player) finish();
          else fail();
        }, API_TIMEOUT);
      });
    },

    loadVimeo() {
      return new Promise((resolve, reject) => {
        if (window.Vimeo?.Player) {
          resolve(window.Vimeo);
          return;
        }

        let settled = false;
        const finish = () => {
          if (settled) return;
          if (!window.Vimeo?.Player) {
            fail();
            return;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(window.Vimeo);
        };
        const fail = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(new Error('Vimeo API failed to load'));
        };

        let script = document.querySelector('script[data-sp-hero-video-api="vimeo"], script[src*="player.vimeo.com/api/player.js"]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'https://player.vimeo.com/api/player.js';
          script.async = true;
          script.dataset.spHeroVideoApi = 'vimeo';
          document.head.appendChild(script);
        }
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', fail, { once: true });

        const timeoutId = window.setTimeout(() => {
          if (window.Vimeo?.Player) finish();
          else fail();
        }, API_TIMEOUT);
      });
    }
  };

  window.SpiderHeroVideoRuntime = runtime;

  class SpiderHeroVideo extends HTMLElement {
    connectedCallback() {
      if (this._connected) return;
      this._connected = true;
      this._destroyed = false;
      this._playerPromise = null;
      this._playerReady = false;
      this._nearViewport = false;
      this._inViewport = false;
      this._editorSelected = false;
      this._userInitiated = false;
      this._userPaused = false;
      this._playing = false;
      this._systemPauseUntil = 0;
      this._nativeBound = false;
      this._nativePrepared = false;
      this.clickToPlay = this.dataset.clickToPlay === 'true';

      this.source = this.dataset.videoSource || 'shopify';
      this.provider = this.dataset.videoType || '';
      this.videoId = this.dataset.videoId || '';
      this.hasVideo = this.dataset.hasVideo === 'true';
      this.autoplay = this.dataset.autoplay === 'true';
      this.muted = this.dataset.muted === 'true';
      this.loop = this.dataset.loop === 'true';
      this.controls = this.dataset.controls === 'true';
      this.purpose = this.dataset.videoPurpose || 'decorative';
      this.videoTitle = this.dataset.videoTitle || 'Hero video';
      this.playMobile = this.dataset.playMobile !== 'false';
      this.fit = this.dataset.videoFit || 'cover';
      this.designMode = this.dataset.designMode === 'true';
      this.animation = this.dataset.animation || 'none';

      this.frame = this.querySelector('[data-sp-hv-frame]');
      this.poster = this.querySelector('[data-sp-hv-poster]');
      this.nativeVideo = this.querySelector('.sp-hero-video__native-video');
      this.externalTarget = this.querySelector('[data-sp-hv-external]');
      this.playbackButton = this.querySelector('[data-sp-hv-playback]');
      this.watchButton = this.querySelector('[data-sp-hv-watch]');
      this.statusElement = this.querySelector('[data-sp-hv-video-status]');
      this.content = this.querySelector('[data-sp-hv-content]');

      this.mobileQuery = window.matchMedia(MOBILE_QUERY);
      this.reducedQuery = window.matchMedia(REDUCED_QUERY);
      this.connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

      this.onPlaybackClickBound = this.onPlaybackClick.bind(this);
      this.onWatchClickBound = this.onWatchClick.bind(this);
      this.onMediaPolicyChangeBound = this.onMediaPolicyChange.bind(this);
      this.mobileQuery.addEventListener?.('change', this.onMediaPolicyChangeBound);
      this.reducedQuery.addEventListener?.('change', this.onMediaPolicyChangeBound);
      this.playbackButton?.addEventListener('click', this.onPlaybackClickBound);
      this.watchButton?.addEventListener('click', this.onWatchClickBound);

      this.configureNativeSemantics();
      this.setupObservers();
      this.setupAnimation();
      runtime.register(this);

      if (!this.hasVideo) this.classList.add('is-poster-only');
      if (!('IntersectionObserver' in window)) {
        this._nearViewport = true;
        this._inViewport = true;
        this.initializeIfNeeded();
        this.revealContent();
        this.updatePlayback();
      }
    }

    disconnectedCallback() {
      this.destroy();
    }

    configureNativeSemantics() {
      if (!this.nativeVideo) return;
      if (this.purpose === 'decorative') {
        this.nativeVideo.setAttribute('aria-hidden', 'true');
        this.nativeVideo.setAttribute('tabindex', '-1');
      } else {
        this.nativeVideo.removeAttribute('aria-hidden');
        this.nativeVideo.removeAttribute('tabindex');
        this.nativeVideo.setAttribute('aria-label', this.videoTitle);
      }
    }

    setupObservers() {
      if (!('IntersectionObserver' in window)) return;

      this.nearObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target !== this) continue;
          this._nearViewport = entry.isIntersecting;
          if (entry.isIntersecting) this.initializeIfNeeded();
        }
      }, { rootMargin: '300px 0px', threshold: 0.01 });
      this.nearObserver.observe(this);

      this.visibilityObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target !== this) continue;
          this._inViewport = entry.isIntersecting && entry.intersectionRatio > 0;
          if (this._inViewport) this.revealContent();
          this.updatePlayback();
        }
      }, { threshold: 0.01 });
      this.visibilityObserver.observe(this);
    }

    setupAnimation() {
      if (!this.content || this.animation === 'none' || this.reducedQuery.matches) return;
      this.classList.add('is-animation-pending');
      if (this._inViewport) this.revealContent();
    }

    revealContent() {
      if (!this.classList.contains('is-animation-pending')) return;
      requestAnimationFrame(() => this.classList.add('is-content-visible'));
    }

    onMediaPolicyChange() {
      if (this._destroyed) return;
      if (this.reducedQuery.matches) {
        this.classList.remove('is-animation-pending');
        this.classList.add('is-content-visible');
      }
      this.initializeIfNeeded();
      this.updatePlayback();
    }

    onDocumentVisibility() {
      this.updatePlayback();
    }

    onSharedResize() {
      if (this._destroyed) return;
      this.syncExternalSize();
    }

    editorLoad() {
      if (this._destroyed) return;
      this.initializeIfNeeded();
    }

    editorSelect(selected) {
      this._editorSelected = Boolean(selected);
      if (this._editorSelected) {
        this._nearViewport = true;
        this.initializeIfNeeded();
        this.revealContent();
      }
      this.updatePlayback();
    }

    saveDataBlocked() {
      return Boolean(this.connection?.saveData && this.purpose === 'decorative' && !this._userInitiated);
    }

    mobileBlocked() {
      return Boolean(this.mobileQuery.matches && !this.playMobile && this.purpose === 'decorative' && !this._userInitiated);
    }

    motionBlocked() {
      return Boolean(this.reducedQuery.matches && this.purpose === 'decorative' && !this._userInitiated);
    }

    shouldInitialize() {
      if (!this.hasVideo) return false;
      if (this.clickToPlay && !this._userInitiated) return false;
      if (this.mobileBlocked() || this.motionBlocked() || this.saveDataBlocked()) return false;
      return this._nearViewport || this._editorSelected || this._userInitiated;
    }

    shouldPlay() {
      if (!this.hasVideo || document.hidden || !this._inViewport) return false;
      if (this.mobileBlocked() || this.motionBlocked() || this.saveDataBlocked()) return false;
      if (this._userPaused) return false;
      return (this.autoplay && !this.clickToPlay) || this._userInitiated;
    }

    initializeIfNeeded() {
      if (!this.shouldInitialize()) {
        if (this.mobileBlocked() || this.motionBlocked() || this.saveDataBlocked()) {
          this.classList.add('is-poster-only');
        }
        return;
      }

      this.classList.remove('is-poster-only');
      if (this.source === 'shopify') {
        this.prepareNative();
      } else if (this.source === 'external') {
        this.prepareExternal();
      }
    }

    prepareNative() {
      if (!this.nativeVideo || this._nativePrepared) return;
      this._nativePrepared = true;
      if (!this._nativeBound) {
        this._nativeBound = true;
        this.nativeVideo.addEventListener('loadeddata', () => {
          if (!this.clickToPlay && (!this.autoplay || this.controls || this.purpose === 'meaningful' || this._userInitiated)) this.markReady();
        });
        this.nativeVideo.addEventListener('playing', () => {
          this.markReady();
          this.setPlaying(true);
          this._userPaused = false;
          this.classList.remove('is-autoplay-blocked', 'has-error');
        });
        this.nativeVideo.addEventListener('pause', () => {
          this.setPlaying(false);
          if (performance.now() > this._systemPauseUntil && this._inViewport) this._userPaused = true;
        });
        this.nativeVideo.addEventListener('error', () => this.failGracefully('native-video-error'));
      }

      if (this.nativeVideo.preload === 'none') this.nativeVideo.preload = 'metadata';
      try { this.nativeVideo.load(); } catch (_) { /* browser may already be loading */ }
      this.updatePlayback();
    }

    async prepareExternal() {
      if (!this.externalTarget || !this.provider || !this.videoId || this._playerReady || this._playerPromise) return;
      this.classList.add('is-loading');
      this.classList.remove('has-error');

      this._playerPromise = runtime.loadApi(this.provider)
        .then(() => {
          if (this._destroyed) return;
          if (this.provider === 'youtube') this.createYouTubePlayer();
          else if (this.provider === 'vimeo') this.createVimeoPlayer();
        })
        .catch(() => this.failGracefully(`${this.provider}-api-error`))
        .finally(() => { this._playerPromise = null; });
    }

    createYouTubePlayer() {
      if (!window.YT?.Player || !this.externalTarget || this._destroyed) return;
      const controls = this.controls || this.purpose === 'meaningful';
      this.player = new window.YT.Player(this.externalTarget, {
        videoId: this.videoId,
        playerVars: {
          autoplay: 0,
          controls: controls ? 1 : 0,
          disablekb: controls ? 0 : 1,
          fs: controls ? 1 : 0,
          iv_load_policy: 3,
          loop: this.loop ? 1 : 0,
          modestbranding: 1,
          playsinline: 1,
          playlist: this.loop ? this.videoId : undefined,
          rel: 0
        },
        events: {
          onReady: (event) => this.onYouTubeReady(event),
          onStateChange: (event) => this.onYouTubeState(event),
          onError: () => this.failGracefully('youtube-player-error')
        }
      });
    }

    onYouTubeReady(event) {
      if (this._destroyed) return;
      this._playerReady = true;
      this.iframe = event.target?.getIframe?.() || this.querySelector('iframe');
      this.configureExternalIframe();
      if (this.muted) event.target?.mute?.();
      else event.target?.unMute?.();
      this.setupExternalResize();
      if (!this.clickToPlay && (!this.autoplay || this.controls || this.purpose === 'meaningful' || this._userInitiated)) this.markReady();
      this.updatePlayback();
    }

    onYouTubeState(event) {
      if (this._destroyed || !window.YT?.PlayerState) return;
      if (event.data === window.YT.PlayerState.PLAYING) {
        this.markReady();
        this.setPlaying(true);
        this._userPaused = false;
      } else if (event.data === window.YT.PlayerState.PAUSED) {
        this.setPlaying(false);
        if (performance.now() > this._systemPauseUntil && this._inViewport) this._userPaused = true;
      } else if (event.data === window.YT.PlayerState.ENDED) {
        this.setPlaying(false);
        if (this.loop && this.shouldPlay()) this.playMedia();
      }
    }

    createVimeoPlayer() {
      if (!window.Vimeo?.Player || !this.externalTarget || this._destroyed) return;
      const controls = this.controls || this.purpose === 'meaningful';
      this.player = new window.Vimeo.Player(this.externalTarget, {
        id: this.videoId,
        autoplay: false,
        autopause: false,
        controls,
        loop: this.loop,
        muted: this.muted,
        responsive: false,
        dnt: true,
        title: this.purpose === 'meaningful',
        byline: false,
        portrait: false
      });

      this.player.ready()
        .then(() => {
          if (this._destroyed) return;
          this._playerReady = true;
          this.iframe = this.externalTarget.querySelector('iframe');
          this.configureExternalIframe();
          this.setupExternalResize();
          if (!this.clickToPlay && (!this.autoplay || controls || this.purpose === 'meaningful' || this._userInitiated)) this.markReady();
          return this.player.setVolume(this.muted ? 0 : 1);
        })
        .then(() => this.updatePlayback())
        .catch(() => this.failGracefully('vimeo-player-error'));

      this.player.on('play', () => {
        this.markReady();
        this.setPlaying(true);
        this._userPaused = false;
      });
      this.player.on('pause', () => {
        this.setPlaying(false);
        if (performance.now() > this._systemPauseUntil && this._inViewport) this._userPaused = true;
      });
      this.player.on('ended', () => {
        this.setPlaying(false);
        if (this.loop && this.shouldPlay()) this.playMedia();
      });
      this.player.on('error', () => this.failGracefully('vimeo-player-error'));
    }

    configureExternalIframe() {
      if (!this.iframe) return;
      this.iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
      this.iframe.setAttribute('title', this.videoTitle);
      if (this.purpose === 'decorative') {
        this.iframe.setAttribute('tabindex', '-1');
        this.iframe.setAttribute('aria-hidden', 'true');
      } else {
        this.iframe.removeAttribute('aria-hidden');
        this.iframe.removeAttribute('tabindex');
      }
    }

    setupExternalResize() {
      this.syncExternalSize();
      if ('ResizeObserver' in window && this.frame && !this.resizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.syncExternalSize());
        this.resizeObserver.observe(this.frame);
      }
    }

    syncExternalSize() {
      if (!this.iframe || !this.frame) return;
      const width = this.frame.clientWidth;
      const height = this.frame.clientHeight;
      if (!width || !height) return;

      const videoRatio = 16 / 9;
      const frameRatio = width / height;
      let targetWidth;
      let targetHeight;

      if (this.fit === 'contain') {
        if (frameRatio > videoRatio) {
          targetHeight = height;
          targetWidth = height * videoRatio;
        } else {
          targetWidth = width;
          targetHeight = width / videoRatio;
        }
      } else if (frameRatio > videoRatio) {
        targetWidth = width;
        targetHeight = width / videoRatio;
      } else {
        targetHeight = height;
        targetWidth = height * videoRatio;
      }

      this.iframe.style.width = `${Math.ceil(targetWidth)}px`;
      this.iframe.style.height = `${Math.ceil(targetHeight)}px`;
    }

    updatePlayback() {
      if (this._destroyed || !this.hasVideo) return;
      if (this.shouldInitialize()) this.initializeIfNeeded();

      if (this.source === 'external' && !this._playerReady) return;
      if (this.source === 'shopify' && !this.nativeVideo) return;

      if (this.shouldPlay()) this.playMedia();
      else this.pauseMedia();
    }

    playMedia() {
      if (this.source === 'shopify') this.playNative();
      else if (this.provider === 'youtube') this.playYouTube();
      else if (this.provider === 'vimeo') this.playVimeo();
    }

    pauseMedia() {
      this._systemPauseUntil = performance.now() + 1000;
      if (this.source === 'shopify' && this.nativeVideo && !this.nativeVideo.paused) {
        this.nativeVideo.pause();
      } else if (this.provider === 'youtube' && this.player?.pauseVideo) {
        this.player.pauseVideo();
      } else if (this.provider === 'vimeo' && this.player?.pause) {
        this.player.pause().catch(() => {});
      }
      this.setPlaying(false);
    }

    playNative() {
      if (!this.nativeVideo) return;
      this.nativeVideo.muted = this.muted;
      this.nativeVideo.loop = this.loop;
      const result = this.nativeVideo.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          if (!this._userInitiated) {
            this.classList.add('is-autoplay-blocked');
            this.classList.remove('is-ready');
            if (this.purpose === 'meaningful') this.nativeVideo.controls = true;
          }
          this.setPlaying(false);
        });
      }
    }

    playYouTube() {
      if (!this.player?.playVideo) return;
      if (this.muted) this.player.mute?.();
      else this.player.unMute?.();
      try { this.player.playVideo(); } catch (_) { this.failGracefully('youtube-play-error'); }
    }

    playVimeo() {
      if (!this.player?.play) return;
      this.player.setVolume?.(this.muted ? 0 : 1).catch?.(() => {});
      const result = this.player.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          if (!this._userInitiated) this.classList.add('is-autoplay-blocked');
          this.setPlaying(false);
        });
      }
    }

    onWatchClick(event) {
      event.preventDefault();
      if (!this.hasVideo) {
        if (this.statusElement) this.statusElement.textContent = 'Please select a video in the theme editor.';
        return;
      }
      if (!this._playing) this.onPlaybackClick();
      else if (this.nativeVideo) this.nativeVideo.focus();
    }

    onPlaybackClick() {
      if (!this.hasVideo) return;
      if (this._playing) {
        this._userPaused = true;
        this.pauseMedia();
        this.updatePlaybackButton();
        return;
      }

      this._userInitiated = true;
      this._userPaused = false;
      if (this.statusElement) this.statusElement.textContent = '';
      this.classList.remove('is-poster-only', 'is-autoplay-blocked', 'has-error');
      this._nearViewport = true;
      this.initializeIfNeeded();
      this.updatePlayback();
      this.updatePlaybackButton();
    }

    setPlaying(playing) {
      this._playing = Boolean(playing);
      if (this._playing) this.classList.add('has-played-once');
      this.classList.toggle('is-playing', this._playing);
      this.classList.toggle('is-paused', !this._playing);
      this.updatePlaybackButton();
    }

    updatePlaybackButton() {
      if (!this.playbackButton) return;
      this.playbackButton.setAttribute('aria-label', this._playing ? 'Pause video' : 'Play video');
      this.playbackButton.setAttribute('aria-pressed', String(this._playing));
    }

    markReady() {
      if (this._destroyed) return;
      this.classList.remove('is-loading', 'has-error', 'is-autoplay-blocked');
      this.classList.add('is-ready');
    }

    failGracefully(reason) {
      if (this._destroyed) return;
      this.dataset.videoError = reason;
      this.classList.remove('is-loading', 'is-ready', 'is-playing');
      this.classList.add('has-error', 'is-paused');
      if (this.statusElement) this.statusElement.textContent = 'The video could not be loaded. Please try again.';
      this.updatePlaybackButton();
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      this.nearObserver?.disconnect();
      this.visibilityObserver?.disconnect();
      this.resizeObserver?.disconnect();
      this.mobileQuery?.removeEventListener?.('change', this.onMediaPolicyChangeBound);
      this.reducedQuery?.removeEventListener?.('change', this.onMediaPolicyChangeBound);
      this.playbackButton?.removeEventListener('click', this.onPlaybackClickBound);
      this.watchButton?.removeEventListener('click', this.onWatchClickBound);

      try {
        if (this.source === 'shopify' && this.nativeVideo) this.nativeVideo.pause();
        if (this.provider === 'youtube' && this.player?.destroy) this.player.destroy();
        if (this.provider === 'vimeo' && this.player?.destroy) this.player.destroy();
      } catch (_) {
        // Teardown must remain non-fatal during Theme Editor replacement.
      }

      this.player = null;
      this.iframe = null;
      runtime.unregister(this);
    }
  }

  if (!customElements.get('sp-hero-video')) {
    customElements.define('sp-hero-video', SpiderHeroVideo);
  }
})();
