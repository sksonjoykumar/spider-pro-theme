(() => {
  'use strict';
  // The asset can be included by more than one section; install a single controller.
  if (document.documentElement.hasAttribute('data-sp-rp-controller-loaded')) return;
  document.documentElement.setAttribute('data-sp-rp-controller-loaded', '');
  const instances = new Map();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safeURL = (value, image = false) => {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === location.origin)) return '';
      if (!image && url.origin !== location.origin) return '';
      if (image && !(url.hostname === location.hostname || url.hostname.endsWith('.cdn.shopify.com') || url.hostname === 'cdn.shopify.com')) return '';
      return url.href;
    } catch { return ''; }
  };
  let rtlType;
  function directionType() {
    if (rtlType) return rtlType;
    const el = document.createElement('div'), content = document.createElement('div');
    el.dir = 'rtl'; el.style.cssText = 'position:absolute;top:-9999px;width:4px;height:2px;overflow:scroll';
    content.style.width = '8px'; el.append(content); document.body.append(el);
    if (el.scrollLeft > 0) rtlType = 'reverse';
    else { el.scrollLeft = 1; rtlType = el.scrollLeft === 0 ? 'negative' : 'default'; }
    el.remove(); return rtlType;
  }
  function logicalScroll(el) {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    if (getComputedStyle(el).direction !== 'rtl') return Math.max(0, Math.min(max, el.scrollLeft));
    const type = directionType();
    return type === 'negative' ? Math.min(max, Math.abs(el.scrollLeft)) : type === 'reverse' ? max - el.scrollLeft : el.scrollLeft;
  }
  function setLogicalScroll(el, value, behavior = 'smooth') {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const n = Math.max(0, Math.min(max, value));
    if (getComputedStyle(el).direction !== 'rtl') el.scrollTo({ left: n, behavior });
    else { const t = directionType(); el.scrollTo({ left: t === 'negative' ? -n : t === 'reverse' ? max - n : n, behavior }); }
  }
  const create = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = String(text);
    return el;
  };
  const relativeAge = value => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return '';
    const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };
  const clockIcon = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '8.5');
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', 'currentColor'); circle.setAttribute('stroke-width', '1.8');
    const hands = document.createElementNS(ns, 'path');
    hands.setAttribute('d', 'M12 7v5l3.2 2'); hands.setAttribute('fill', 'none'); hands.setAttribute('stroke', 'currentColor');
    hands.setAttribute('stroke-width', '1.8'); hands.setAttribute('stroke-linecap', 'round'); hands.setAttribute('stroke-linejoin', 'round');
    svg.append(circle, hands);
    return svg;
  };
  class PurchaseSection {
    constructor(root) {
      this.root = root; this.id = root.dataset.spRpId;
      this.list = root.querySelector('[data-sp-rp-list]');
      this.fallbackNodes = this.list ? [...this.list.childNodes].map(node => node.cloneNode(true)) : [];
      this.mode = root.dataset.spRpMode;
      this.source = root.dataset.spRpSource;
      this.abort = new AbortController(); this.signal = this.abort.signal;
      this.timeout = null; this.interval = null; this.toastTimer = null; this.autoplayTimer = null;
      this.validRemote = false; this.toastIndex = 0; this.toastCycles = 0; this.userPaused = false; this.dragSuppress = false;
      this.prev = root.querySelector('[data-sp-rp-prev]'); this.next = root.querySelector('[data-sp-rp-next]');
      this.progress = root.querySelector('[data-sp-rp-progress]'); this.dots = root.querySelector('[data-sp-rp-dots]');
      if (this.list && this.mode === 'style_1') this.bindCarousel();
      if (this.list && this.mode === 'style_4') this.bindToast();
      if (this.source === 'approved_public_endpoint') this.startEndpoint();
      if (this.list) this.refresh();
    }
    get cards() { return [...(this.list?.querySelectorAll('[data-sp-rp-item]:not(.sp-recent-purchased__clone)') || [])]; }
    setStatus(live) {
      const status = this.root.querySelector('[data-sp-rp-status]');
      if (!status) return;
      status.dataset.state = live ? 'live' : 'neutral';
      const label = status.querySelector('[data-sp-rp-status-text]');
      if (label) label.textContent = live ? this.root.dataset.spRpLiveLabel : this.root.dataset.spRpFallbackLabel;
    }
    bindCarousel() {
      this.prev?.addEventListener('click', () => this.move(-1), { signal:this.signal });
      this.next?.addEventListener('click', () => this.move(1), { signal:this.signal });
      this.list.addEventListener('scroll', () => {
        if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.refresh(); });
      }, { passive:true, signal:this.signal });
      let down = null;
      if (this.list && this.root.dataset.spRpDrag === 'true' && this.root.dataset.spRpDesignMode !== 'true') {
        this.list.addEventListener('pointerdown', e => {
          if (e.pointerType === 'touch' || e.button !== 0) return;
          down = {x:e.clientX,scroll:logicalScroll(this.list),moved:false};
        }, { signal:this.signal });
        this.list.addEventListener('pointermove', e => {
          if (!down) return;
          const dx = e.clientX - down.x;
          if (Math.abs(dx) < 6 && !down.moved) return;
          down.moved = true;
          const factor = getComputedStyle(this.list).direction === 'rtl' ? 1 : -1;
          setLogicalScroll(this.list, down.scroll + dx * factor, 'auto');
          this.dragSuppress = true;
        }, { signal:this.signal });
        const stop = () => { if (down?.moved) setTimeout(() => { this.dragSuppress = false; }, 120); down = null; };
        this.list.addEventListener('pointerup', stop, { signal:this.signal });
        this.list.addEventListener('pointercancel', stop, { signal:this.signal });
        this.list.addEventListener('click', e => { if (this.dragSuppress) { e.preventDefault(); e.stopPropagation(); } }, { capture:true, signal:this.signal });
      }
      this.root.addEventListener('mouseenter', () => this.pauseAutoplay(), {signal:this.signal});
      this.root.addEventListener('mouseleave', () => this.autoplay(), {signal:this.signal});
      this.root.addEventListener('focusin', () => this.pauseAutoplay(), {signal:this.signal});
      this.root.addEventListener('focusout', () => this.autoplay(), {signal:this.signal});
      document.addEventListener('visibilitychange', () => document.hidden ? this.pauseAutoplay() : this.autoplay(), {signal:this.signal});
      this.autoplay();
    }
    move(step) {
      const first = this.cards[0]; if (!first) return;
      const gap = parseFloat(getComputedStyle(this.list).gap) || 0;
      const width = first.getBoundingClientRect().width + gap;
      const max = Math.max(0, this.list.scrollWidth - this.list.clientWidth);
      let target = logicalScroll(this.list) + step * width;
      if (this.root.dataset.spRpInfinite === 'true') {
        if (target > max + 2) target = 0;
        if (target < -2) target = max;
      }
      setLogicalScroll(this.list, target, reducedMotion() ? 'auto':'smooth');
    }
    refresh() {
      if (!this.list) return;
      if (this.mode === 'style_1') {
        const max = Math.max(0,this.list.scrollWidth-this.list.clientWidth), current = logicalScroll(this.list);
        if (this.prev) this.prev.disabled = !max || (!this.root.dataset.spRpInfinite || this.root.dataset.spRpInfinite !== 'true') && current < 3;
        if (this.next) this.next.disabled = !max || this.root.dataset.spRpInfinite !== 'true' && current > max - 3;
        if (this.progress) this.progress.style.width = max > 0 ? `${Math.max(0, Math.min(100,current/max*100))}%`:'100%';
        if (this.dots) {
          const cards = this.cards, first = cards[0];
          const gap = parseFloat(getComputedStyle(this.list).gap) || 0;
          const width = first ? first.getBoundingClientRect().width + gap : 1;
          const pages = Math.max(1, Math.ceil(max / Math.max(1,width)) + 1);
          if (this.dots.children.length !== pages) {
            this.dots.replaceChildren();
            for(let i=0;i<pages;i++) {
              const button = create('button'); button.type = 'button'; button.setAttribute('aria-label',`Go to carousel position ${i+1}`);
              button.addEventListener('click', () => setLogicalScroll(this.list,i*width,reducedMotion()?'auto':'smooth'),{signal:this.signal});
              this.dots.append(button);
            }
          }
          const active = Math.min(pages-1, Math.round(current/Math.max(1,width)));
          [...this.dots.children].forEach((d,i) => d.setAttribute('aria-current',i===active?'true':'false'));
        }
      }
    }
    pauseAutoplay() { clearInterval(this.autoplayTimer); this.autoplayTimer = null; }
    autoplay() {
      if (this.mode !== 'style_1' || this.root.dataset.spRpAutoplay !== 'true' || reducedMotion() || document.hidden || this.root.matches(':hover') || this.root.contains(document.activeElement)) return;
      this.pauseAutoplay();
      const delay = Math.max(3000, Number(this.root.dataset.spRpAutoplayDelay) || 6000);
      this.autoplayTimer = setInterval(() => {
        if (this.next?.disabled) {
          if (this.root.dataset.spRpInfinite === 'true') setLogicalScroll(this.list,0,'auto');
          else this.pauseAutoplay();
        } else this.move(1);
      },delay);
    }
    bindToast() {
      const pause = this.root.querySelector('[data-sp-rp-toast-pause]');
      const dismiss = this.root.querySelector('[data-sp-rp-toast-dismiss]');
      pause?.addEventListener('click',() => { this.userPaused = !this.userPaused; pause.textContent = this.userPaused?'Resume updates':'Pause updates'; this.startToasts(); },{signal:this.signal});
      dismiss?.addEventListener('click',() => { this.pauseToasts(); this.root.querySelector('[data-sp-rp-data]')?.setAttribute('hidden',''); if (this.root.dataset.spRpRememberDismissal === 'true') { try{sessionStorage.setItem('sp-rp-dismissed-'+this.id,'true')}catch{} } },{signal:this.signal});
      this.root.addEventListener('focusin',() => this.pauseToasts(),{signal:this.signal});
      this.root.addEventListener('focusout',() => this.startToasts(),{signal:this.signal});
      this.root.addEventListener('mouseenter',() => this.pauseToasts(),{signal:this.signal});
      this.root.addEventListener('mouseleave',() => this.startToasts(),{signal:this.signal});
      document.addEventListener('visibilitychange',()=>document.hidden?this.pauseToasts():this.startToasts(),{signal:this.signal});
      try{if(this.root.dataset.spRpRememberDismissal==='true'&&sessionStorage.getItem('sp-rp-dismissed-'+this.id)==='true') this.root.querySelector('[data-sp-rp-data]')?.setAttribute('hidden','');}catch{}
    }
    pauseToasts(){clearInterval(this.toastTimer);this.toastTimer=null;}
    startToasts() {
      this.pauseToasts();
      if(this.mode!=='style_4'||!this.validRemote||this.userPaused||document.hidden||this.root.matches(':hover')||this.root.contains(document.activeElement)||this.root.querySelector('[data-sp-rp-data]')?.hidden)return;
      const cards=this.cards;if(cards.length<2)return;
      const max=Math.max(1,Number(this.root.dataset.spRpToastMax)||8);
      if(this.toastCycles>=max)return;
      this.toastTimer=setInterval(()=>{
        if(++this.toastCycles>=max)this.pauseToasts();
        this.toastIndex=(this.toastIndex+1)%this.cards.length;
        this.showToast();
      },Math.max(6000,Number(this.root.dataset.spRpToastDelay)||10000));
    }
    showToast(){this.cards.forEach((card,i)=>card.classList.toggle('is-current',i===this.toastIndex));}
    async startEndpoint() {
      const raw=this.root.dataset.spRpEndpoint;
      const endpoint=safeURL(raw); // Storefront same-origin app proxy only; avoid arbitrary third-party URLs.
      if(!endpoint || this.root.dataset.spRpTrusted!=='true') {this.setStatus(false);return;}
      this.endpoint=endpoint;
      const poll=async()=>{
        if(document.hidden)return;
        const ctrl=new AbortController();this.fetchController=ctrl;
        const ms=Math.max(2000,Number(this.root.dataset.spRpTimeout)||8000);
        const timer=setTimeout(()=>ctrl.abort(),ms);
        try {
          const response=await fetch(endpoint,{signal:ctrl.signal,credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
          if(!response.ok)throw new Error('Feed unavailable');
          const payload=await response.json();
          if(!payload||payload.status!=='live'||!Array.isArray(payload.activities)||!Number.isFinite(Date.parse(payload.updated_at)))throw new Error('Invalid feed');
          const fresh=Date.now()-Date.parse(payload.updated_at)<Math.max(180000,Number(this.root.dataset.spRpRefresh)*3000);
          if(!fresh)throw new Error('Stale feed');
          const max=Math.min(16,Math.max(1,Number(this.root.dataset.spRpMax)||8));
          const safeEvents=payload.activities.filter(e=>e&&typeof e.id==='string'&&typeof e.product_title==='string'&&e.product_title.length<200&&Number.isFinite(Date.parse(e.occurred_at))&&Date.now()-Date.parse(e.occurred_at)>Number(this.root.dataset.spRpAge)*60000&&Date.now()>Date.parse(e.occurred_at)).slice(0,max);
          if(!safeEvents.length)throw new Error('No eligible events');
          this.renderRemote(safeEvents);
          this.validRemote=true;this.root.dataset.spRpActiveEvents='true';
          this.setStatus(true);
          const footer=this.root.querySelector('[data-sp-rp-footer]'); if(footer) footer.textContent=this.root.dataset.spRpVerifiedLabel || 'Activity from an authorized feed';
          this.startToasts();
        } catch {const previouslyConnected = this.validRemote; this.validRemote=false;this.setStatus(false);this.pauseToasts();this.root.dataset.spRpActiveEvents='false';this.removeClones();
          if(previouslyConnected && this.list) this.list.replaceChildren(...this.fallbackNodes.map(node => node.cloneNode(true)));
          const footer=this.root.querySelector('[data-sp-rp-footer]'); if(footer) footer.textContent=this.root.dataset.spRpManualNotice || 'Selected products from our store';
          this.refresh();}
        finally {clearTimeout(timer);if(this.fetchController===ctrl)this.fetchController=null;}
      };
      await poll();
      this.interval=setInterval(poll,Math.max(60000,Number(this.root.dataset.spRpRefresh)*1000||60000));
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();else this.fetchController?.abort();},{signal:this.signal});
    }
    removeClones(){this.list?.querySelectorAll('.sp-recent-purchased__clone').forEach(e=>e.remove());}
    renderRemote(events){
      if(!this.list)return;
      this.removeClones();this.list.replaceChildren();
      events.forEach((e,i)=>{
        const li=create('li','sp-recent-purchased__item');li.dataset.spRpItem='';
        const card=create('article','sp-recent-purchased__card');
        const image=safeURL(e.image_url,true), link=safeURL(e.product_url);
        if(image){const wrap=create('div','sp-recent-purchased__media');const img=create('img','sp-recent-purchased__image');img.src=image;img.alt=String(e.product_title);img.loading='lazy';img.width=380;img.height=310;wrap.append(img);card.append(wrap);}
        const body=create('div','sp-recent-purchased__card-body');
        body.append(create('div','sp-recent-purchased__activity','A customer purchased'));
        body.append(create('h3','sp-recent-purchased__product-title',e.product_title));
        // Event timestamps are from the authorized feed; buyer identities, locations and remote prices are never rendered.
        if(this.root.dataset.spRpShowTime === 'true'){
          const age = relativeAge(e.occurred_at);
          if(age){
            const meta = create('p','sp-recent-purchased__meta');
            const item = create('span','sp-recent-purchased__meta-item');
            item.append(clockIcon(), create('span','',age));
            meta.append(item); body.append(meta);
          }
        }
        if(link){const a=create('a','sp-recent-purchased__link','View product →');a.href=link;body.append(a);}
        card.append(body);li.append(card);this.list.append(li);
      });
      if(this.mode==='style_3')this.makeTicker();
      if(this.mode==='style_4'){this.toastIndex=0;this.toastCycles=0;this.showToast();}
      this.refresh();
    }
    makeTicker(){
      this.removeClones();
      if(this.mode!=='style_3'||reducedMotion()||this.cards.length<3)return;
      const fragment=document.createDocumentFragment();
      this.cards.forEach(card=>{
        const clone=card.cloneNode(true);clone.classList.add('sp-recent-purchased__clone');clone.setAttribute('aria-hidden','true');
        clone.querySelectorAll('a,button,input,[tabindex]').forEach(el=>el.setAttribute('tabindex','-1'));
        clone.removeAttribute('data-sp-rp-item');clone.removeAttribute('data-sp-rp-block-id');fragment.append(clone);
      });this.list.append(fragment);
    }
    revealBlock(blockId){
      const block=this.list?.querySelector(`[data-sp-rp-block-id="${CSS.escape(blockId)}"]`);if(!block)return;
      if(this.mode==='style_1')block.scrollIntoView({inline:'nearest',block:'nearest',behavior:'auto'});
      if(this.mode==='style_4'){this.toastIndex=this.cards.indexOf(block);this.showToast();}
    }
    destroy(){this.abort.abort();clearInterval(this.interval);this.pauseAutoplay();this.pauseToasts();this.fetchController?.abort();if(this.frame)cancelAnimationFrame(this.frame);this.removeClones();}
  }
  function init(scope=document){
    const roots=scope.matches?.('[data-sp-recent-purchased]')?[scope]:[...scope.querySelectorAll('[data-sp-recent-purchased]')];
    roots.forEach(root=>{const id=root.dataset.spRpId;if(!id)return;instances.get(id)?.destroy();instances.set(id,new PurchaseSection(root));});
  }
  function unload(section){const root=section.matches?.('[data-sp-recent-purchased]')?section:section.querySelector('[data-sp-recent-purchased]');if(root){instances.get(root.dataset.spRpId)?.destroy();instances.delete(root.dataset.spRpId);}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init(),{once:true});else init();
  document.addEventListener('shopify:section:load',e=>init(e.target));
  document.addEventListener('shopify:section:unload',e=>unload(e.target));
  document.addEventListener('shopify:block:select',e=>{
    const id=e.detail?.blockId || (e.target instanceof Element ? e.target.dataset.spRpBlockId : null);
    const root=(e.target instanceof Element ? e.target.closest('[data-sp-recent-purchased]') : null) || (id ? document.querySelector(`[data-sp-rp-block-id="${CSS.escape(id)}"]`)?.closest('[data-sp-recent-purchased]') : null);
    if(!root)return;
    if(id)instances.get(root.dataset.spRpId)?.revealBlock(id);
  });
})();
