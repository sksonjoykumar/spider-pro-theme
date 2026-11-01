(() => {
  'use strict';
  const node=document.getElementById('SpiderGlobalSettings');
  if(!node||!window.Spider)return;
  const config=window.Spider.safeJson(node.textContent,{});
  window.Spider.settings=Object.freeze(config);
  if(config.sp_dev_mode){
    const level=String(config.sp_log_level||'error');
    const enabled=level!=='silent';
    if(enabled&&config.sp_debug_info) console.info('[Spider Debug]',{settings:config,viewport:[innerWidth,innerHeight],designMode:document.documentElement.classList.contains('shopify-design-mode')});
  }

  const root=document.documentElement;
  if(config.sp_reduce_motion||window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('sp-reduce-motion');

  if(config.perf_reduce_motion){
    const constrained=(Number(navigator.deviceMemory||8)<=4)||(Number(navigator.hardwareConcurrency||8)<=4)||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(constrained) root.classList.add('sp-performance-reduced-motion');
  }

  if(config.perf_prefetch_navigation){
    const prefetched=new Set();
    const prefetch=(anchor)=>{
      if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
      let url;
      try{url=new URL(anchor.href,location.href);}catch(_){return;}
      if(url.origin!==location.origin||url.pathname===location.pathname||prefetched.has(url.href))return;
      prefetched.add(url.href);
      const link=document.createElement('link');
      link.rel='prefetch'; link.href=url.href; link.as='document';
      document.head.append(link);
    };
    document.addEventListener('pointerover',(event)=>prefetch(event.target.closest?.('a[href]')),{passive:true});
    document.addEventListener('focusin',(event)=>prefetch(event.target.closest?.('a[href]')));
  }

  if(config.sp_dev_mode&&config.perf_monitor){
    const warn=(...args)=>console.warn('[Spider Performance]',...args);
    const checkDom=()=>{
      const count=document.getElementsByTagName('*').length;
      if(count>Number(config.perf_dom_warning||1500)) warn(`DOM node count ${count} exceeds configured threshold ${config.perf_dom_warning}.`);
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',checkDom,{once:true}); else checkDom();
    if('PerformanceObserver' in window){
      try{
        const threshold=Number(config.perf_longtask_warning||100);
        const observer=new PerformanceObserver((list)=>{
          list.getEntries().forEach((entry)=>{ if(entry.duration>=threshold) warn(`Long task ${Math.round(entry.duration)}ms`,entry); });
        });
        observer.observe({type:'longtask',buffered:true});
      }catch(_){/* Long Task API is optional. */}
    }
  }
})();
