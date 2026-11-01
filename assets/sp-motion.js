(() => {
  'use strict';
  const cfg=window.Spider?.settings||{};
  if(!cfg.sp_motion_enable)return;
  const root=document.documentElement;
  const reduced=cfg.sp_reduce_motion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced){root.classList.add(cfg.sp_motion_a11y_mode?'sp-motion-opacity-only':'sp-reduce-motion');return;}
  if(!cfg.scroll_motion_enable)return;
  const style=String(cfg.sp_motion_style||'fade-up');
  const repeat=Boolean(cfg.sp_motion_repeat);
  const threshold=Math.max(0,Math.min(40,Number(cfg.scroll_trigger_dist||12)))/100;
  const stagger=Math.max(0,Number(cfg.scroll_stagger||80));
  const selector='.sp-section, [data-sp-animate]';
  const prepare=(scope=document)=>{
    const nodes=[...scope.querySelectorAll(selector)].filter(n=>!n.dataset.spMotionBound);
    nodes.forEach((node,index)=>{node.dataset.spMotionBound='true';node.dataset.spMotionStyle=node.dataset.spMotionStyle||style;node.style.setProperty('--sp-motion-item-delay',`${index%8*stagger}ms`);observer.observe(node);});
  };
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('sp-motion-visible');if(!repeat)observer.unobserve(entry.target);}
      else if(repeat)entry.target.classList.remove('sp-motion-visible');
    });
  },{threshold});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>prepare(),{once:true});else prepare();
  document.addEventListener('shopify:section:load',e=>prepare(e.target));
  document.addEventListener('shopify:section:unload',e=>{e.target.querySelectorAll?.(selector).forEach(n=>observer.unobserve(n));});
})();
