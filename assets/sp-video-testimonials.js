(() => {
  'use strict';
  if (window.__spVideoTestimonialsLoaded) return;
  window.__spVideoTestimonialsLoaded = true;
  const ROOT = '[data-sp-vt]';
  const instances = new Map();
  const prefersReduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  class VideoTestimonials {
    constructor(root) {
      this.root = root;
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      this.viewport = root.querySelector('[data-sp-vt-viewport]');
      this.slides = [...root.querySelectorAll('[data-sp-vt-slide]')];
      this.prev = root.querySelector('[data-sp-vt-prev]');
      this.next = root.querySelector('[data-sp-vt-next]');
      this.dots = root.querySelector('[data-sp-vt-dots]');
      this.dialog = root.querySelector('[data-sp-vt-dialog]');
      this.slot = root.querySelector('[data-sp-vt-dialog-slot]');
      this.announcer = root.querySelector('[data-sp-vt-announcer]');
      this.page = 0;
      this.pages = 1;
      this.visible = 1;
      this.timer = null;
      this.hovered = false;
      this.focused = false;
      this.active = null;
      this.modalMedia = null;
      this.origin = null;
      this.originButton = null;
      this.customControlVideos = new WeakSet();
      this.drag = null;
      this.cancelNextClick = false;
      this.designMode = root.dataset.spVtDesign === 'true' || !!window.Shopify?.designMode;
      root.addEventListener('click', (event) => this.onClick(event), { signal: this.signal, capture: true });
      root.addEventListener('click', (event) => {
        const video = event.target.closest?.('[data-sp-vt-video]');
        if (!video || this.root.dataset.spVtNativeControls !== 'false') return;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      }, { signal: this.signal });
      root.addEventListener('play', (event) => this.onNativePlay(event), { signal: this.signal, capture: true });
      root.addEventListener('ended', (event) => this.onNativeEnd(event), { signal: this.signal, capture: true });
      document.addEventListener('sp-video-testimonial:playing', (event) => { if (event.detail?.owner !== this) this.stopAll(); }, {signal:this.signal});
      document.addEventListener('visibilitychange', () => {if (document.hidden) this.stopAll(); this.schedule();}, {signal:this.signal});
      document.addEventListener('shopify:block:select', (event) => {
        if (!this.root.contains(event.target)) return;
        this.stopAll(); this.stopTimer();
        const block = this.root.querySelector(`[data-sp-vt-block-id="${CSS.escape(event.detail.blockId)}"]`);
        if (block) this.goTo(this.slides.indexOf(block),false);
        else event.target.scrollIntoView?.({block:'nearest',behavior:'instant'});
      }, {signal:this.signal});
      document.addEventListener('shopify:block:deselect', () => this.schedule(), {signal:this.signal});
      this.dialog?.addEventListener('close', () => this.closeModal(), {signal:this.signal});
      this.dialog?.addEventListener('cancel', () => this.stopAll(), {signal:this.signal});
      // Native <dialog> does not dismiss on backdrop clicks by itself.
      this.dialog?.addEventListener('click', (event) => {
        if (event.target !== this.dialog || !this.dialog.open) return;
        const bounds = this.dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) this.dialog.close();
      }, {signal:this.signal});
      if (this.viewport && root.dataset.spVtStyle === 'style_1') this.initCarousel();
      // Honor the pointer-drag setting consistently in both horizontally scrollable styles.
      if (this.viewport && root.dataset.spVtSwipe === 'true' &&
          (root.dataset.spVtStyle === 'style_1' || root.dataset.spVtStyle === 'style_4')) this.initDrag();
      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver((entries) => {
          for (const entry of entries) if (!entry.isIntersecting && this.root.dataset.spVtPauseOut==='true' && entry.target===this.active) this.stopAll();
        }, {threshold:0.03});
        [...root.querySelectorAll('[data-sp-vt-card]')].forEach(card=>this.observer.observe(card));
      }
    }
    initCarousel() {
      this.measure();
      this.viewport.addEventListener('scroll', () => {clearTimeout(this.scrollTimer); this.scrollTimer=setTimeout(()=>this.measure(true),70);}, {signal:this.signal,passive:true});
      this.prev?.addEventListener('click', () => this.goBy(-1), {signal:this.signal});
      this.next?.addEventListener('click', () => this.goBy(1), {signal:this.signal});
      this.dots?.addEventListener('click', e => {const dot=e.target.closest('[data-sp-vt-page]');if(dot) this.goTo(Number(dot.dataset.spVtPage));}, {signal:this.signal});
      this.viewport.addEventListener('mouseenter',()=>{if(this.root.dataset.spVtPauseHover!=='true')return;this.hovered=true;this.stopTimer();},{signal:this.signal});
      this.viewport.addEventListener('mouseleave',()=>{this.hovered=false;this.schedule();},{signal:this.signal});
      this.viewport.addEventListener('focusin',()=>{this.focused=true;this.stopTimer();},{signal:this.signal});
      this.viewport.addEventListener('focusout',()=>{this.focused=false;this.schedule();},{signal:this.signal});
      if ('ResizeObserver' in window) {
        this.ro = new ResizeObserver(()=>{if(this.resizeRaf) cancelAnimationFrame(this.resizeRaf);this.resizeRaf=requestAnimationFrame(()=>this.measure(true));});
        this.ro.observe(this.viewport);
      } else window.addEventListener('resize', this.onResize=()=>this.measure(true), {signal:this.signal});
      this.schedule();
    }
    getStep(){if(this.slides.length < 2) return this.viewport?.clientWidth||0;return Math.abs(this.slides[1].getBoundingClientRect().left-this.slides[0].getBoundingClientRect().left)}
    measure(keepPage=false){
      if(!this.viewport||!this.slides.length)return;
      const step=this.getStep();
      this.visible=Math.max(1,Math.min(this.slides.length,Math.round((this.viewport.clientWidth+1)/Math.max(1,step))));
      this.pages=Math.max(1,this.slides.length-this.visible+1);
      if(keepPage){
        const edge=this.viewport.getBoundingClientRect();
        const rtl=getComputedStyle(this.viewport).direction==='rtl';
        let nearest=0,smallest=Infinity;
        this.slides.forEach((slide,index)=>{
          const rect=slide.getBoundingClientRect();
          const dist=Math.abs(rtl?rect.right-edge.right:rect.left-edge.left);
          if(dist<smallest){smallest=dist;nearest=index;}
        });
        this.page=Math.min(this.pages-1,nearest);
      }
      this.renderControls();
    }
    renderControls(){
      if(this.prev)this.prev.disabled=this.pages<=1||this.page<=0;
      if(this.next)this.next.disabled=this.pages<=1||this.page>=this.pages-1;
      if(!this.dots)return;
      if(this.dots.children.length!==this.pages){
        this.dots.replaceChildren();
        for(let i=0;i<this.pages;i++){
          const dot=document.createElement('button');dot.type='button';dot.className='sp-vt__dot';dot.dataset.spVtPage=String(i);dot.setAttribute('aria-label',`Show testimonial page ${i+1} of ${this.pages}`);this.dots.append(dot);
        }
      }
      [...this.dots.children].forEach((dot,i)=>{if(i===this.page)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});
    }
    goBy(dir){this.goTo(this.page+dir)}
    goTo(index,smooth=true){
      if(!this.viewport||!this.slides.length)return;
      const target=Math.max(0,Math.min(this.pages-1,index));
      this.page=target;this.stopAll();this.renderControls();
      const slide=this.slides[target],vRect=this.viewport.getBoundingClientRect(),sRect=slide.getBoundingClientRect();
      const rtl=getComputedStyle(this.viewport).direction==='rtl';
      const delta=rtl?sRect.right-vRect.right:sRect.left-vRect.left;
      this.viewport.scrollTo({left:this.viewport.scrollLeft+delta,behavior:smooth&&!prefersReduced()?'smooth':'instant'});
      this.schedule();
    }
    initDrag(){
      const vp=this.viewport;if(!vp)return;
      vp.addEventListener('pointerdown',e=>{
        if(e.pointerType==='touch'||e.button!==0||e.target.closest('video,iframe,input,select,textarea'))return;
        this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:vp.scrollLeft,moved:false};
      },{signal:this.signal});
      vp.addEventListener('pointermove',e=>{
        const d=this.drag;if(!d||e.pointerId!==d.id)return;
        const dx=e.clientX-d.x,dy=e.clientY-d.y;
        if(!d.moved && (Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.2))return;
        if(!d.moved){d.moved=true;vp.setPointerCapture?.(e.pointerId);this.stopTimer();}
        vp.scrollLeft=d.start-dx;
        if(e.cancelable)e.preventDefault();
      },{signal:this.signal});
      const end=()=>{if(this.drag?.moved){this.cancelNextClick=true;setTimeout(()=>{this.cancelNextClick=false},100);this.measure(true)}this.drag=null;this.schedule();};
      vp.addEventListener('pointerup',end,{signal:this.signal});
      vp.addEventListener('pointercancel',end,{signal:this.signal});
    }
    schedule(){
      this.stopTimer();
      if(this.destroyed)return;
      if(this.root.dataset.spVtAutoplay!=='true'||this.designMode||prefersReduced()||document.hidden||this.hovered||this.focused||this.active||this.pages<=1||!this.viewport)return;
      const delay=Math.max(3000,Number(this.root.dataset.spVtDelay||6)*1000);
      this.timer=setTimeout(()=>{
        if(this.page>=this.pages-1){if(this.root.dataset.spVtInfinite==='true')this.goTo(0);else this.stopTimer();}
        else this.goTo(this.page+1);
      },delay);
    }
    stopTimer(){clearTimeout(this.timer);this.timer=null;}
    onClick(e){
      if(this.cancelNextClick){e.preventDefault();e.stopImmediatePropagation();this.cancelNextClick=false;return;}
      if(e.target.closest('[data-sp-vt-close]')){this.dialog?.close();return;}
      const button=e.target.closest('[data-sp-vt-play]');
      if(!button||!this.root.contains(button))return;
      const card=button.closest('[data-sp-vt-card]');if(!card)return;
      this.beginPlayback(card,button);
    }
    onNativePlay(e){
      if(!e.target.matches?.('[data-sp-vt-video]'))return;
      const card=e.target.closest('[data-sp-vt-card]')||this.active;
      if(card){this.stopAll(card);this.active=card;card.classList.add('is-playing');this.stopTimer();document.dispatchEvent(new CustomEvent('sp-video-testimonial:playing',{detail:{owner:this}}));}
    }
    onNativeEnd(e){
      if(!e.target.matches?.('[data-sp-vt-video]'))return;
      const video=e.target;
      const media=video.closest('[data-sp-vt-media]');
      const custom=media?.querySelector('[data-sp-vt-custom-controls]');
      if(custom&&!custom.hidden&&custom.querySelector('[data-sp-vt-replay]'))return;
      this.stopAll();
    }
    hasExternalConsent(){
      if(this.root.dataset.spVtConsent!=='true')return true;
      const api=window.Shopify?.customerPrivacy;
      try {if(typeof api?.marketingAllowed==='function')return api.marketingAllowed()===true;
        const c=api?.currentVisitorConsent?.();return c?.marketing==='yes';
      }catch{return false;}
    }
    formatTime(seconds){
      if(!Number.isFinite(seconds)||seconds<0)return '0:00';
      const mins=Math.floor(seconds/60);
      const secs=String(Math.floor(seconds%60)).padStart(2,'0');
      return `${mins}:${secs}`;
    }
    bindCustomControls(video,media){
      if(this.customControlVideos.has(video))return;
      this.customControlVideos.add(video);
      const controls=media.querySelector('[data-sp-vt-custom-controls]');
      const playButton=controls?.querySelector('[data-sp-vt-toggle-play]');
      const playSymbol=controls?.querySelector('[data-sp-vt-toggle-symbol]');
      const progress=controls?.querySelector('[data-sp-vt-progress]');
      const time=controls?.querySelector('[data-sp-vt-time]');
      const mute=controls?.querySelector('[data-sp-vt-mute]');
      const volume=controls?.querySelector('[data-sp-vt-volume]');
      const replay=controls?.querySelector('[data-sp-vt-replay]');
      const fullscreen=controls?.querySelector('[data-sp-vt-fullscreen]');
      const update=()=>{
        const duration=Number.isFinite(video.duration)?video.duration:0;
        if(progress)progress.value=duration?String((video.currentTime/duration)*100):'0';
        if(time)time.textContent=`${this.formatTime(video.currentTime)} / ${this.formatTime(duration)}`;
        if(playButton)playButton.setAttribute('aria-label',video.ended?'Replay video':video.paused?'Play video':'Pause video');
        if(playSymbol)playSymbol.textContent=video.ended?'↻':video.paused?'▶':'Ⅱ';
        if(mute){
          const isMuted=video.muted||video.volume===0;
          mute.textContent=isMuted?'Unmute':'Mute';
          mute.setAttribute('aria-label',isMuted?'Unmute video':'Mute video');
        }
        if(volume)volume.value=String(video.muted?0:video.volume);
      };
      video.addEventListener('timeupdate',update,{signal:this.signal});
      video.addEventListener('loadedmetadata',update,{signal:this.signal});
      video.addEventListener('durationchange',update,{signal:this.signal});
      video.addEventListener('play',update,{signal:this.signal});
      video.addEventListener('pause',update,{signal:this.signal});
      video.addEventListener('ended',update,{signal:this.signal});
      video.addEventListener('volumechange',update,{signal:this.signal});
      playButton?.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{});else video.pause();},{signal:this.signal});
      progress?.addEventListener('input',()=>{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=video.duration*(Number(progress.value)/100);},{signal:this.signal});
      mute?.addEventListener('click',()=>{video.muted=!(video.muted||video.volume===0);update();},{signal:this.signal});
      volume?.addEventListener('input',()=>{video.volume=Number(volume.value);video.muted=video.volume===0;update();},{signal:this.signal});
      replay?.addEventListener('click',()=>{video.currentTime=0;video.play().catch(()=>{});},{signal:this.signal});
      fullscreen?.addEventListener('click',async()=>{
        try{
          if(document.fullscreenElement)await document.exitFullscreen();
          else if(media.requestFullscreen)await media.requestFullscreen();
          else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();
        }catch{}
      },{signal:this.signal});
      update();
    }
    async beginPlayback(card,button){
      this.stopAll();
      this.originButton=button;
      const media=card.querySelector('[data-sp-vt-media]');
      if(!media)return;
      const external=media.querySelector('[data-sp-vt-external]');
      // Validate the configured provider before opening or relocating media.
      if (external && (!external.dataset.spVtExternalId ||
          !['youtube','vimeo'].includes(external.dataset.spVtProvider))) {
        if(this.announcer) this.announcer.textContent='The testimonial video URL is unavailable. Please check the video configuration.';
        return;
      }
      if(external&&!this.hasExternalConsent()){
        if(this.announcer) this.announcer.textContent='External video needs marketing consent. Update your cookie preferences to watch, or use the video provider website.';
        const provider=external.dataset.spVtProvider,id=external.dataset.spVtExternalId;
        if(id&&(provider==='youtube'||provider==='vimeo')){
          let link=media.querySelector('.sp-vt__consent-link');
          if(!link){link=document.createElement('a');link.className='sp-vt__consent-link';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open video on '+(provider==='youtube'?'YouTube':'Vimeo');media.append(link);}
          link.href=provider==='youtube'?`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`:`https://vimeo.com/${encodeURIComponent(id)}`;
        }
        return;
      }
      this.active=card;
      media.classList.add('is-playing');
      if(this.root.dataset.spVtPlayback==='modal'&&this.dialog?.showModal){
        this.origin=document.createComment('video media origin');
        media.before(this.origin);
        this.slot.append(media);
        this.modalMedia=media;
        try { this.dialog.showModal(); }
        catch {
          this.origin.replaceWith(media);
          this.origin=null;this.modalMedia=null;
        }
      }
      if(external){
        const provider=external.dataset.spVtProvider,id=external.dataset.spVtExternalId;
        if(!id||!['youtube','vimeo'].includes(provider))return;
        const iframe=document.createElement('iframe');
        const autoplayValue=this.root.dataset.spVtAutoplayInteraction==='false'?'0':'1';
        const src=provider==='youtube'?`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=${autoplayValue}&playsinline=1&rel=0`:`https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=${autoplayValue}&dnt=1`;
        iframe.src=src;iframe.title='Customer testimonial video';iframe.allow='autoplay; fullscreen; picture-in-picture';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';external.replaceChildren(iframe);
        card.classList.add('is-playing');
      }else{
        const video=media.querySelector('[data-sp-vt-video]');if(!video)return;
        let any=false;
        video.querySelectorAll('source[data-sp-vt-src]').forEach(source=>{source.src=source.dataset.spVtSrc;delete source.dataset.spVtSrc;any=true});
        if(any)video.load();
        const autoplayOnInteraction = this.root.dataset.spVtAutoplayInteraction !== 'false';
        const useNativeControls = this.root.dataset.spVtNativeControls !== 'false';
        const customControls = media.querySelector('[data-sp-vt-custom-controls]');
        video.controls = useNativeControls;
        if(customControls)customControls.hidden=useNativeControls;
        this.bindCustomControls(video,media);
        card.classList.add('is-playing');
        if (!autoplayOnInteraction) {
          this.stopTimer();
          document.dispatchEvent(new CustomEvent('sp-video-testimonial:playing',{detail:{owner:this}}));
          return;
        }
        try{await video.play();}catch{card.classList.remove('is-playing');media.classList.remove('is-playing');video.controls=false;if(customControls)customControls.hidden=true;}
      }
      this.stopTimer();document.dispatchEvent(new CustomEvent('sp-video-testimonial:playing',{detail:{owner:this}}));
    }
    stopAll(except=null){
      if(this.modalMedia && except!==this.active){this.modalMedia.querySelectorAll('video').forEach(video=>{video.pause();video.controls=false;});this.modalMedia.querySelectorAll('[data-sp-vt-custom-controls]').forEach(el=>{el.hidden=true;});this.modalMedia.querySelectorAll('[data-sp-vt-external]').forEach(el=>el.replaceChildren());this.modalMedia.classList.remove('is-playing');}
      for(const card of this.root.querySelectorAll('[data-sp-vt-card]')){
        if(card===except)continue;
        card.querySelectorAll('video').forEach(video=>{video.pause();video.controls=false;});
        card.querySelectorAll('[data-sp-vt-custom-controls]').forEach(el=>{el.hidden=true;});
        card.querySelectorAll('[data-sp-vt-external]').forEach(el=>el.replaceChildren());
        card.classList.remove('is-playing');card.querySelector('[data-sp-vt-media]')?.classList.remove('is-playing');
      }
      if(this.active!==except)this.active=null;
      this.schedule();
    }
    closeModal(){
      this.stopAll();
      if(this.modalMedia&&this.origin?.parentNode){this.origin.replaceWith(this.modalMedia);}
      this.modalMedia=null;this.origin=null;
      if(this.originButton?.isConnected) this.originButton.focus({preventScroll:true});this.originButton=null;
    }
    destroy(){
      this.destroyed=true;
      this.stopTimer();clearTimeout(this.scrollTimer);if(this.resizeRaf)cancelAnimationFrame(this.resizeRaf);
      if(this.dialog?.open)this.dialog.close();
      this.stopAll();this.abort.abort();this.ro?.disconnect();this.observer?.disconnect();
    }
  }
  const mount=(scope=document)=>{
    const roots=scope.matches?.(ROOT)?[scope]:[...scope.querySelectorAll(ROOT)];
    roots.forEach(root=>{if(!instances.has(root))instances.set(root,new VideoTestimonials(root));});
  };
  const unmount=(scope)=>{for(const [root,inst] of instances){if(root===scope||scope.contains(root)){inst.destroy();instances.delete(root);}}};
  const init=()=>mount();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  document.addEventListener('shopify:section:load',e=>mount(e.target));
  document.addEventListener('shopify:section:unload',e=>unmount(e.target));
})();
