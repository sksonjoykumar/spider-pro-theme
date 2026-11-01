(() => {
  'use strict';
  const Spider = window.Spider = window.Spider || {};
  Spider.version = '2.0.1';
  Spider.events = Object.freeze({cartUpdated:'spider:cart:updated',cartError:'spider:cart:error',variantChanged:'spider:variant:changed',drawerOpened:'spider:drawer:opened',drawerClosed:'spider:drawer:closed',searchUpdated:'spider:search:updated',pageTransitionStart:'spider:page-transition:start',pageTransitionEnd:'spider:page-transition:end'});
  Spider.announce = (message) => { const region=document.getElementById('SpiderLiveRegion'); if(region){region.textContent='';requestAnimationFrame(()=>{region.textContent=String(message||'');});} };
  Spider.safeJson = (text,fallback={}) => { try { const value=JSON.parse(text); return value && typeof value==='object' ? value : fallback; } catch(error){ console.warn('[Spider] Invalid JSON',error); return fallback; } };
  document.addEventListener('click',(event)=>{const button=event.target.closest('[data-quantity-minus],[data-quantity-plus]');if(!button)return;const root=button.closest('[data-quantity]');const input=root?.querySelector('input[type="number"]');if(!input)return;const step=Number(input.step)||1;const min=input.min===''?0:Number(input.min);const max=input.max===''?Infinity:Number(input.max);const direction=button.hasAttribute('data-quantity-plus')?1:-1;input.value=String(Math.min(max,Math.max(min,(Number(input.value)||min)+direction*step)));input.dispatchEvent(new Event('change',{bubbles:true}));});
})();
