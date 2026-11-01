(() => {
 'use strict';
 const selector = '[data-sp-promo-section][data-sp-promo-layout="style_4"]';
 const instances = new WeakMap();
 const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let rtlMode;
 function getRtlMode() {
  if(rtlMode) return rtlMode;
  const a=document.createElement('div'),b=document.createElement('div');
  a.dir='rtl';a.style.cssText='position:absolute;left:-99999px;width:4px;height:1px;overflow:scroll';b.style.width='8px';a.append(b);document.body.append(a);
  if(a.scrollLeft>0) rtlMode='reverse';
  else {a.scrollLeft=1;rtlMode=a.scrollLeft===0?'negative':'default'}
  a.remove();return rtlMode;
 }
 function pos(el) {
  const max=Math.max(0,el.scrollWidth-el.clientWidth);
  if(getComputedStyle(el).direction!=='rtl') return Math.max(0,Math.min(max,el.scrollLeft));
  if(getRtlMode()==='negative') return Math.min(max,Math.abs(el.scrollLeft));
  if(getRtlMode()==='reverse') return Math.min(max,Math.max(0,max-el.scrollLeft));
  return Math.min(max,Math.max(0,el.scrollLeft));
 }
 function go(el,value,behavior='smooth') {
  const max=Math.max(0,el.scrollWidth-el.clientWidth);const next=Math.max(0,Math.min(max,value));let x=next;
  if(getComputedStyle(el).direction==='rtl'){
   const mode=getRtlMode();x=mode==='negative'?-next:mode==='reverse'?max-next:next;
  }
  el.scrollTo({left:x,behavior});
 }
 class PromoCarousel {
  constructor(root) {
   this.root=root;this.viewport=root.querySelector('[data-sp-promo-viewport]');this.items=Array.from(root.querySelectorAll('[data-sp-promo-item]'));
   if(!this.viewport || !this.items.length) return;
   this.prev=root.querySelector('[data-sp-promo-prev]');this.next=root.querySelector('[data-sp-promo-next]');this.progress=root.querySelector('[data-sp-promo-progress]');this.dots=root.querySelector('[data-sp-promo-dots]');
   this.abort=new AbortController();this.signal=this.abort.signal;this.raf=0;this.timer=0;
   this.drag=null;this.noClickUntil=0;this.hovering=false;this.focused=false;
   this.loop=root.dataset.spPromoLoop==='true';this.allowDrag=root.dataset.spPromoDrag==='true';this.autoplay=root.dataset.spPromoAutoplay==='true' && root.dataset.spPromoDesignMode!=='true' && !reduced();
   this.delay=Math.max(2500,Number(root.dataset.spPromoAutoplayDelay)||5000);
   this.pauseHover=root.dataset.spPromoPauseHover==='true';
   this.bind();this.update();
   if('ResizeObserver' in window) {this.resize=new ResizeObserver(()=>this.requestUpdate());this.resize.observe(this.viewport)}
   else window.addEventListener('resize',()=>this.requestUpdate(),{signal:this.signal,passive:true});
   this.schedule();
  }
  get max(){return Math.max(0,this.viewport.scrollWidth-this.viewport.clientWidth)}
  get step(){const first=this.items[0],second=this.items[1];return second?Math.abs(second.offsetLeft-first.offsetLeft):first?.getBoundingClientRect().width||1}
  bind(){
   this.prev?.addEventListener('click',()=>this.shift(-1),{signal:this.signal});
   this.next?.addEventListener('click',()=>this.shift(1),{signal:this.signal});
   this.viewport.addEventListener('scroll',()=>this.requestUpdate(),{signal:this.signal,passive:true});
   this.viewport.addEventListener('keydown',(e)=>{
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
     if(e.target.closest('a,button,input,textarea,select')) return;
     e.preventDefault();this.shift(e.key==='ArrowRight'?(getComputedStyle(this.viewport).direction==='rtl'?-1:1):(getComputedStyle(this.viewport).direction==='rtl'?1:-1));
    }
   },{signal:this.signal});
   this.viewport.addEventListener('pointerdown',(e)=>{
    if(!this.allowDrag || e.pointerType==='touch' || e.button!==0)return;
    this.drag={x:e.clientX,start:pos(this.viewport),moved:false,pointerId:e.pointerId};this.pause();
   },{signal:this.signal});
   window.addEventListener('pointermove',(e)=>{
    if(!this.drag||this.drag.pointerId!==e.pointerId)return;
    const dx=e.clientX-this.drag.x;
    if(Math.abs(dx)<7 && !this.drag.moved)return;
    this.drag.moved=true;
    this.viewport.classList.add('is-dragging');
    const rtl=getComputedStyle(this.viewport).direction==='rtl';go(this.viewport,this.drag.start+(rtl?dx:-dx),'auto');
   },{signal:this.signal});
   window.addEventListener('pointerup',(e)=>{if(this.drag?.pointerId!==e.pointerId)return;if(this.drag.moved)this.noClickUntil=Date.now()+350;this.drag=null;this.viewport.classList.remove('is-dragging');this.schedule()},{signal:this.signal});
   window.addEventListener('pointercancel',()=>{this.drag=null;this.viewport.classList.remove('is-dragging')},{signal:this.signal});
   this.viewport.addEventListener('click',(e)=>{if(Date.now()<this.noClickUntil){e.preventDefault();e.stopPropagation()}},{capture:true,signal:this.signal});
   this.root.addEventListener('mouseenter',()=>{this.hovering=true;if(this.pauseHover)this.pause()},{signal:this.signal});
   this.root.addEventListener('mouseleave',()=>{this.hovering=false;this.schedule()},{signal:this.signal});
   this.root.addEventListener('focusin',()=>{this.focused=true;this.pause()},{signal:this.signal});
   this.root.addEventListener('focusout',()=>{queueMicrotask(()=>{this.focused=this.root.contains(document.activeElement);this.schedule()})},{signal:this.signal});
   document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();else{this.update();this.schedule()}},{signal:this.signal});
   window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(reduced())this.pause();else this.schedule()},{signal:this.signal});
  }
  requestUpdate(){if(this.raf)return;this.raf=requestAnimationFrame(()=>{this.raf=0;this.update()})}
  snapPoints(){let pts=[0];const max=this.max,step=this.step;if(max<2||step<=0)return pts;for(let n=step;n<max-1;n+=step)pts.push(n);pts.push(max);return pts}
  update(){
   const max=this.max,p=pos(this.viewport),points=this.snapPoints();
   if(this.prev)this.prev.disabled=max<2||(!this.loop&&p<=2);
   if(this.next)this.next.disabled=max<2||(!this.loop&&p>=max-2);
   if(this.progress)this.progress.style.width=(max>0?Math.min(100,Math.max(0,(p/max)*100)):100)+'%';
   if(this.dots){
    if(this.dots.children.length!==points.length){this.dots.replaceChildren();points.forEach((point,i)=>{const dot=document.createElement('button');dot.type='button';dot.className='sp-promo__dot';dot.setAttribute('aria-label',`Go to promotion page ${i+1}`);dot.addEventListener('click',()=>{go(this.viewport,point);this.pause();this.schedule()},{signal:this.signal});this.dots.append(dot)})}
    let idx=0;for(let i=0;i<points.length;i++){if(Math.abs(points[i]-p)<Math.abs(points[idx]-p))idx=i}
    Array.from(this.dots.children).forEach((dot,i)=>dot.setAttribute('aria-current',String(i===idx)));
   }
  }
  shift(direction,automatic=false){const max=this.max;if(max<2)return;
   const p=pos(this.viewport),step=this.step||this.viewport.clientWidth;
   let next=p+step*direction;
   if(next>max+2)next=this.loop?0:max;
   if(next< -2)next=this.loop?max:0;
   go(this.viewport,next,reduced()?'auto':'smooth');
   if(!automatic){this.pause();this.schedule()}
  }
  pause(){clearTimeout(this.timer);this.timer=0}
  schedule(){this.pause();if(!this.autoplay||reduced()||document.hidden||this.focused||(this.pauseHover&&this.hovering)||this.max<2)return;this.timer=setTimeout(()=>{this.shift(1,true);this.schedule()},this.delay)}
  reveal(blockId){const item=this.items.find(x=>x.querySelector(`[data-sp-promo-block-id="${CSS.escape(blockId)}"]`));if(!item)return;const base=this.items[0].getBoundingClientRect();const rect=item.getBoundingClientRect();const direction=getComputedStyle(this.viewport).direction==='rtl'?-1:1;go(this.viewport,pos(this.viewport)+(rect.left-base.left)*direction,'smooth');this.pause()}
  destroy(){this.pause();if(this.raf)cancelAnimationFrame(this.raf);this.resize?.disconnect();this.abort?.abort();this.viewport?.classList.remove('is-dragging')}
 }
 function init(root){if(!root||instances.has(root))return;const item=new PromoCarousel(root);instances.set(root,item)}
 function boot(scope=document){if(scope.matches?.(selector))init(scope);scope.querySelectorAll?.(selector).forEach(init)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot(),{once:true});else boot();
 document.addEventListener('shopify:section:load',event=>boot(event.target));
 document.addEventListener('shopify:section:unload',event=>{const roots=event.target.matches?.(selector)?[event.target]:Array.from(event.target.querySelectorAll?.(selector)||[]);roots.forEach(root=>{instances.get(root)?.destroy();instances.delete(root)})});
 document.addEventListener('shopify:block:select',event=>{const root=event.target.closest?.(selector);if(root)instances.get(root)?.reveal(event.detail?.blockId)});
})();
