/* Spider Premium Product Advanced — optional zoom preview and data-driven blocks.
   Does not replace ProductGallery or Shopify's variant/form controllers. */
(() => {
  'use strict';
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
  const instances = new WeakMap();

  class SpiderAdvancedProduct {
    constructor(root) {
      this.root = root;
      this.gallery = root.querySelector('[data-product-gallery]');
      this.viewport = this.gallery?.querySelector('[data-gallery-viewport]');
      this.panel = this.gallery?.querySelector('[data-hover-zoom-panel]');
      this.raf = 0;
      this.lastPointer = null;
      this.zoomSource = '';
      this.zoomerEnabled = !!(this.gallery?.dataset.hoverZoomEnabled === 'true' && this.panel);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.hideZoom = this.hideZoom.bind(this);
      this.onMediaChange = this.onMediaChange.bind(this);
      this.onViewportChange = this.onViewportChange.bind(this);
      this.onFinePointerChange = this.onFinePointerChange.bind(this);
      this.onVisibility = this.onVisibility.bind(this);
      if (this.zoomerEnabled) {
        this.viewport?.addEventListener('pointermove', this.onPointerMove, {passive:true});
        this.viewport?.addEventListener('pointerleave', this.hideZoom);
        this.gallery.addEventListener('sp:product:media-change', this.onMediaChange);
        this.gallery.addEventListener('focusin', this.hideZoom);
        window.addEventListener('scroll', this.hideZoom, {passive: true});
        window.addEventListener('resize', this.onViewportChange);
        finePointer.addEventListener?.('change', this.onFinePointerChange);
      }
      this.startCountdowns();
      this.updateDeliveries();
      this.initSoldCounts();
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    activeImage() {
      const item = this.gallery?.querySelector('.sp-product-media.is-active[data-media-type="image"]');
      if (!item) return null;
      const surface = item.querySelector('[data-media-zoom], [data-media-hover-zoom]');
      const image = item.querySelector('.sp-product-media__image');
      return surface && image ? {surface, image} : null;
    }
    onPointerMove(event) {
      if (!finePointer.matches || window.innerWidth < 750 || event.pointerType === 'touch' || !event.target.closest('[data-media-zoom], [data-media-hover-zoom]')) {
        this.hideZoom(); return;
      }
      this.lastPointer = {x:event.clientX, y:event.clientY};
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.drawZoom(); });
    }
    drawZoom() {
      if (!this.panel || !this.lastPointer || !finePointer.matches) return;
      const media = this.activeImage();
      if (!media || !media.image.complete || !media.image.naturalWidth) { this.hideZoom(); return; }
      const sourceRect = media.image.getBoundingClientRect();
      if (!sourceRect.width || !sourceRect.height) { this.hideZoom(); return; }
      const fit = getComputedStyle(media.image).objectFit;
      let iw=sourceRect.width, ih=sourceRect.height, ix=sourceRect.left, iy=sourceRect.top;
      const ratio=media.image.naturalWidth/media.image.naturalHeight;
      if (fit === 'contain') {
        iw=Math.min(sourceRect.width, sourceRect.height*ratio);
        ih=iw/ratio;
        ix=sourceRect.left+(sourceRect.width-iw)/2;
        iy=sourceRect.top+(sourceRect.height-ih)/2;
      } else if (fit === 'cover') {
        // image covers the full box; magnifier uses this displayed box as its coordinate space
      }
      const fx=clamp((this.lastPointer.x-ix)/iw,0,1);
      const fy=clamp((this.lastPointer.y-iy)/ih,0,1);
      const width=Math.min(Number(this.gallery.dataset.hoverZoomPanelWidth)||420,window.innerWidth-24);
      const height=Math.min(Math.max(280, sourceRect.height),window.innerHeight-24);
      const prefer=this.gallery.dataset.hoverZoomSide||'auto';
      const right=sourceRect.right+12, left=sourceRect.left-width-12;
      let x;
      if ((prefer==='left' && left>=12) || (right+width>window.innerWidth-12 && left>=12)) x=left;
      else if (right+width<=window.innerWidth-12) x=right;
      else if (left>=12) x=left;
      else x=clamp(sourceRect.right-width,12,window.innerWidth-width-12);
      const y=clamp(sourceRect.top,12,Math.max(12,window.innerHeight-height-12));
      const factor=Number(this.gallery.dataset.hoverZoomFactor)||2;
      const bgw=Math.max(width,iw*factor), bgh=Math.max(height,ih*factor);
      const bx=bgw<=width?(width-bgw)/2:clamp(width/2-fx*bgw,width-bgw,0);
      const by=bgh<=height?(height-bgh)/2:clamp(height/2-fy*bgh,height-bgh,0);
      const src=media.surface.dataset.zoomSrc||media.image.currentSrc||media.image.src;
      if (src!==this.zoomSource) { this.zoomSource=src;this.panel.style.backgroundImage=`url("${src.replaceAll('"','%22')}")`; }
      this.panel.style.cssText += `;left:${x}px;top:${y}px;width:${width}px;height:${height}px;background-size:${bgw}px ${bgh}px;background-position:${bx}px ${by}px;`;
      this.panel.classList.add('is-visible');
      this.panel.setAttribute('aria-hidden','false');
    }
    hideZoom() {
      if (this.raf) {cancelAnimationFrame(this.raf);this.raf=0;}
      this.lastPointer=null;
      this.panel?.classList.remove('is-visible');
      this.panel?.setAttribute('aria-hidden','true');
    }
    onMediaChange() { this.hideZoom(); this.zoomSource=''; }
    onViewportChange() { this.hideZoom(); }
    onFinePointerChange() { if (!finePointer.matches) this.hideZoom(); }
    onVisibility() { if (document.hidden) this.hideZoom(); else this.updateCountdowns(); }
    startCountdowns() {
      this.timers = [...this.root.querySelectorAll('[data-sp-countdown]')].map((element)=>({element, expires:Date.parse(element.dataset.countdownTarget)}))
        .filter(({element,expires})=>{ if (!Number.isFinite(expires)) {element.hidden=true;return false;} return true; });
      if (!this.timers.length) return;
      this.updateCountdowns();
      this.interval = setInterval(()=>{if (!document.hidden) this.updateCountdowns();},1000);
    }
    updateCountdowns() {
      this.timers?.forEach(({element,expires})=>{
        const remaining=Math.max(0,Math.floor((expires-Date.now())/1000));
        if (remaining===0 && element.dataset.countdownHideExpired==='true') {element.hidden=true;const wrapper=element.closest('[data-product-block]');if(wrapper)wrapper.hidden=true;return;}
        element.hidden=false;
        const wrapper=element.closest('[data-product-block]');if(wrapper)wrapper.hidden=false;
        if (remaining===0) {
          element.querySelector('.sp-product-countdown__units')?.replaceChildren(document.createTextNode(element.dataset.countdownExpired||'Offer ended'));
          return;
        }
        const days=Math.floor(remaining/86400);
        const values={days,hours:element.dataset.countdownDays==='true'?Math.floor(remaining%86400/3600):Math.floor(remaining/3600),minutes:Math.floor(remaining%3600/60),seconds:remaining%60};
        Object.entries(values).forEach(([key,value])=>{const node=element.querySelector(`[data-timer-${key}]`);if(node)node.textContent=pad(value);});
      });
    }
    updateDeliveries() {
      this.root.querySelectorAll('[data-sp-delivery]').forEach((element)=>{
        let min=Number(element.dataset.deliveryMin),max=Number(element.dataset.deliveryMax);
        if (!Number.isFinite(min)||!Number.isFinite(max)||max<min||max<=0) return;
        const zone=element.dataset.deliveryZone?.trim()||Intl.DateTimeFormat().resolvedOptions().timeZone;
        let parts;
        try {parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));}
        catch {return;}
        let day=new Date(Date.UTC(parts.year,parts.month-1,parts.day));
        const cutoff=/^([01]\d|2[0-3]):[0-5]\d$/.test(element.dataset.deliveryCutoff||'')?element.dataset.deliveryCutoff:null;
        if (cutoff) {const [h,m]=cutoff.split(':').map(Number);if(parts.hour*60+parts.minute>=h*60+m)day.setUTCDate(day.getUTCDate()+1);}
        const business=element.dataset.deliveryBusiness==='true';
        const addDays=(count)=>{const date=new Date(day);let n=count;while(n>0){date.setUTCDate(date.getUTCDate()+1);if(!business||![0,6].includes(date.getUTCDay()))n--;}
          if(count===0&&business){while([0,6].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()+1);}return date;};
        const start=addDays(min),end=addDays(max);
        const fmt=new Intl.DateTimeFormat(document.documentElement.lang||'en',{month:'short',day:'numeric',timeZone:'UTC'});
        const span=element.querySelector('[data-sp-delivery-range]');if(span)span.textContent=`${fmt.format(start)} – ${fmt.format(end)}`;
        element.hidden=false;
      });
    }
    initSoldCounts() {
      this.root.querySelectorAll('[data-sp-sold-count][data-sp-sold-animate="true"]').forEach(node=>{
        if(reduceMotion.matches)return;
        const total=Number(node.dataset.spSoldCount);if(!Number.isFinite(total)||total<=0)return;
        const start=performance.now(),duration=700;
        const frame=(time)=>{if(!node.isConnected)return;const t=clamp((time-start)/duration,0,1);node.textContent=String(Math.round(total*(1-(1-t)**3)));if(t<1)requestAnimationFrame(frame);};
        requestAnimationFrame(frame);
      });
    }
    destroy() {
      this.hideZoom();clearInterval(this.interval);
      this.viewport?.removeEventListener('pointermove',this.onPointerMove);
      this.viewport?.removeEventListener('pointerleave',this.hideZoom);
      this.gallery?.removeEventListener('sp:product:media-change',this.onMediaChange);
      this.gallery?.removeEventListener('focusin',this.hideZoom);
      window.removeEventListener('scroll',this.hideZoom);
      window.removeEventListener('resize',this.onViewportChange);
      finePointer.removeEventListener?.('change',this.onFinePointerChange);
      document.removeEventListener('visibilitychange',this.onVisibility);
    }
  }
  function init(scope=document) {
    const roots=scope.matches?.('[data-main-product]')?[scope]:[...scope.querySelectorAll?.('[data-main-product]')||[]];
    roots.forEach(root=>{if(!instances.has(root))instances.set(root,new SpiderAdvancedProduct(root));});
  }
  function unload(scope) {
    const roots=scope.matches?.('[data-main-product]')?[scope]:[...scope.querySelectorAll?.('[data-main-product]')||[]];
    roots.forEach(root=>{instances.get(root)?.destroy();instances.delete(root);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init(),{once:true});else init();
  document.addEventListener('shopify:section:load',event=>init(event.target));
  document.addEventListener('shopify:section:unload',event=>unload(event.target));
})();
