(() => {
  'use strict';

  if (customElements.get('sp-shoppable-video')) return;

  class SpiderShoppableVideo extends HTMLElement {
    connectedCallback() {
      if (this.__connected) return;
      this.__connected = true;
      this.abort = new AbortController();

      this.hotspots = [...this.querySelectorAll('[data-hotspot-button]')];
      this.targets = [...this.querySelectorAll('[data-hotspot-target]')];
      this.triggers = [...this.querySelectorAll('[data-hotspot-trigger]')];
      this.strip = this.querySelector('.sp-shoppable-video__strip');
      this.hostedVideo = this.querySelector('[data-hosted-video]');
      this.externalWrap = this.querySelector('[data-external-video]');
      this.externalEmbed = this.querySelector('[data-video-embed]');
      this.playButton = this.querySelector('[data-video-play]');

      this.addEventListener('click', this.onClick, { signal: this.abort.signal });

      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;

      if (this.dataset.autoplay === 'true' && !this.reducedMotion?.matches) {
        if (this.hostedVideo) {
          this.hostedVideo.muted = true;
          const playPromise = this.hostedVideo.play();
          if (playPromise?.catch) playPromise.catch(() => {});
        } else if (this.externalWrap) {
          this.loadExternal(true);
        }
      }
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.__connected = false;
    }

    onClick = (event) => {
      const hotspot = event.target.closest('[data-hotspot-button]');
      if (hotspot && this.contains(hotspot)) {
        this.activate(hotspot.dataset.hotspotIndex, true);
        return;
      }

      const trigger = event.target.closest('[data-hotspot-trigger]');
      if (trigger && this.contains(trigger)) {
        this.activate(trigger.dataset.hotspotIndex, true);
        return;
      }

      const play = event.target.closest('[data-video-play]');
      if (play && this.contains(play)) {
        if (this.externalEmbed?.dataset.loaded === 'true') {
          this.toggleExternalPlayback();
        } else {
          this.loadExternal(true);
        }
      }
    };

    activate(index, shouldScroll = false) {
      const key = String(index);

      this.hotspots.forEach((item) => {
        const active = item.dataset.hotspotIndex === key;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      this.targets.forEach((item) => {
        const active = item.dataset.hotspotIndex === key;
        item.classList.toggle('is-active', active);

        if (active && shouldScroll && window.innerWidth < 900) {
          item.scrollIntoView({
            behavior: this.reducedMotion?.matches ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      });

      this.triggers.forEach((item) => {
        item.classList.toggle('is-active', item.dataset.hotspotIndex === key);
      });

      if (shouldScroll && this.strip) {
        const stripItem = this.strip.querySelector(`[data-hotspot-trigger][data-hotspot-index="${CSS.escape(key)}"]`);
        stripItem?.scrollIntoView({
          behavior: this.reducedMotion?.matches ? 'auto' : 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }

    activateBlock(blockId) {
      if (!blockId) return;
      const hotspot = this.querySelector(`[data-hotspot-button][data-block-id="${CSS.escape(String(blockId))}"]`);
      if (hotspot) this.activate(hotspot.dataset.hotspotIndex, false);
    }

    sendExternalCommand(action) {
      const iframe = this.externalEmbed?.querySelector('iframe');
      if (!iframe?.contentWindow) return;

      if (this.dataset.externalProvider === 'youtube') {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: action === 'play' ? 'playVideo' : 'pauseVideo',
            args: []
          }),
          '*'
        );
      } else if (this.dataset.externalProvider === 'vimeo') {
        iframe.contentWindow.postMessage(
          { method: action === 'play' ? 'play' : 'pause' },
          '*'
        );
      }
    }

    setExternalPlaying(playing) {
      if (!this.playButton) return;
      this.playButton.dataset.playing = playing ? 'true' : 'false';
      this.playButton.setAttribute(
        'aria-label',
        playing
          ? (this.dataset.pauseLabel || 'Pause video')
          : (this.dataset.playLabel || 'Play video')
      );
    }

    toggleExternalPlayback() {
      const playing = this.playButton?.dataset.playing === 'true';
      this.sendExternalCommand(playing ? 'pause' : 'play');
      this.setExternalPlaying(!playing);
    }

    loadExternal(autoplay = false) {
      if (!this.externalEmbed || this.externalEmbed.dataset.loaded === 'true') return;

      const provider = this.dataset.externalProvider;
      const id = this.dataset.externalId;
      if (!provider || !id) return;

      const loop = this.dataset.loop === 'true';
      const muted = autoplay || this.dataset.muted === 'true';
      let src = '';

      if (provider === 'youtube') {
        const params = new URLSearchParams({
          playsinline: '1',
          rel: '0',
          controls: '0',
          disablekb: '1',
          fs: '0',
          iv_load_policy: '3',
          modestbranding: '1',
          enablejsapi: '1',
          autoplay: autoplay ? '1' : '0',
          mute: muted ? '1' : '0',
          loop: loop ? '1' : '0'
        });
        if (loop) params.set('playlist', id);
        src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
      } else if (provider === 'vimeo') {
        const params = new URLSearchParams({
          autoplay: autoplay ? '1' : '0',
          muted: muted ? '1' : '0',
          loop: loop ? '1' : '0',
          controls: '0',
          title: '0',
          byline: '0',
          portrait: '0'
        });
        src = `https://player.vimeo.com/video/${encodeURIComponent(id)}?${params.toString()}`;
      }

      if (!src) return;

      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = this.querySelector('.sp-shoppable-video__heading')?.textContent?.trim() || 'Video';
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.loading = 'eager';

      this.externalEmbed.replaceChildren(iframe);
      this.externalEmbed.hidden = false;
      this.externalEmbed.dataset.loaded = 'true';

      this.setExternalPlaying(Boolean(autoplay));
    }
  }

  customElements.define('sp-shoppable-video', SpiderShoppableVideo);

  if (!window.__spShoppableVideoEditorEvents) {
    window.__spShoppableVideoEditorEvents = true;

    document.addEventListener('shopify:block:select', (event) => {
      const sectionId = event.detail?.sectionId;
      const blockId = event.detail?.blockId;
      if (!sectionId || !blockId) return;

      const section = document.querySelector(
        `sp-shoppable-video[data-section-id="${CSS.escape(String(sectionId))}"]`
      );

      section?.activateBlock?.(blockId);
    });
  }
})();
