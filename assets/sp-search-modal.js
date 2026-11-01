/* Spider Premium Global Search Modal. A single accessible Search UI shared by header + toolbar. */
(() => {
  'use strict';
  const ROOT = '[data-sp-search-modal]';
  const HISTORY_KEY = 'spider:search-modal:recent:v1';
  const focusables = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let instance = null;

  class SpiderSearchModal {
    constructor(root) {
      this.root = root;
      this.dialog = root.querySelector('[data-sp-smodal-dialog]');
      this.input = root.querySelector('[data-sp-smodal-input]');
      this.form = root.querySelector('[data-sp-smodal-form]');
      this.clear = root.querySelector('[data-sp-smodal-clear]');
      this.results = root.querySelector('[data-sp-smodal-results]');
      this.status = root.querySelector('[data-sp-smodal-status]');
      this.initial = this.results?.innerHTML || '';
      this.recentBlock = root.querySelector('[data-sp-smodal-recent]');
      this.recentList = root.querySelector('[data-sp-smodal-recent-list]');
      this.opened = false;
      this.lastTrigger = null;
      this.abort = null;
      this.requestId = 0;
      this.debounce = null;
      this.closeDelay = null;
      this.listeners = new AbortController();
      this.signal = this.listeners.signal;
      this.enabled = root.dataset.enabled === 'true';
      this.bind();
      this.renderRecent();
      this.updateClear();
    }
    bind() {
      this.root.addEventListener('click', e => this.onClick(e), { signal:this.signal });
      this.input?.addEventListener('input', () => this.onInput(), { signal:this.signal });
      this.form?.addEventListener('submit', () => this.remember(this.input?.value), { signal:this.signal });
      document.addEventListener('keydown', e => this.onKeydown(e), { signal:this.signal, capture:true });
    }
    onClick(event) {
      if (event.target.closest('[data-sp-smodal-close]')) { event.preventDefault(); this.close(); return; }
      if (event.target.closest('[data-sp-smodal-backdrop]') && this.root.dataset.closeBackdrop === 'true') { this.close(); return; }
      if (event.target.closest('[data-sp-smodal-clear]')) { event.preventDefault(); this.input.value=''; this.onInput(); this.input.focus(); return; }
      if (event.target.closest('[data-sp-smodal-clear-all]')) { event.preventDefault(); this.saveHistory([]); this.renderRecent(); return; }
      const remove = event.target.closest('[data-sp-smodal-remove-recent]');
      if (remove) { event.preventDefault(); const index=Number(remove.dataset.spSmodalRemoveRecent); const entries=this.getHistory();entries.splice(index,1);this.saveHistory(entries);this.renderRecent();return; }
      const term = event.target.closest('[data-sp-smodal-term]');
      if (term) { event.preventDefault(); this.input.value = term.dataset.spSmodalTerm || ''; this.updateClear(); this.search(this.input.value); this.input.focus(); return; }
      const link = event.target.closest('a[href]');
      if (link && this.root.contains(link) && this.input?.value.trim()) this.remember(this.input.value);
    }
    onKeydown(event) {
      if (!this.opened) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
      if (event.key !== 'Tab') return;
      const nodes=[...this.dialog.querySelectorAll(focusables)].filter(el => !el.hidden && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden');
      if (!nodes.length) {event.preventDefault(); this.dialog.focus();return;}
      const first=nodes[0], last=nodes[nodes.length-1];
      if (event.shiftKey && (document.activeElement===first || !this.dialog.contains(document.activeElement))) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && (document.activeElement===last || !this.dialog.contains(document.activeElement))) {event.preventDefault();first.focus();}
    }
    open(trigger) {
      if (!this.enabled) { window.location.href=this.root.dataset.searchUrl || '/search'; return; }
      if (this.opened) {this.input.focus({preventScroll:true}); return;}
      this.lastTrigger = trigger || document.activeElement;
      this.lastTrigger?.setAttribute?.('aria-expanded','true');
      // Close an open Spider drawer through the existing shared system, not a new drawer engine.
      const current = document.querySelector('dialog[open]');
      if (current && typeof window.Spider?.closeDrawer==='function') window.Spider.closeDrawer(current,false,true);
      const header = document.querySelector('sp-header');
      if (header?.searchDrawerOpen && typeof header.closeSearchDrawer==='function') header.closeSearchDrawer(false,true);
      window.clearTimeout(this.closeDelay);
      this.opened=true;
      this.root.hidden=false;
      this.root.setAttribute('aria-hidden','false');
      document.documentElement.classList.add('sp-smodal-open');
      requestAnimationFrame(() => {
        if (!this.opened) return;
        this.root.classList.add('is-open');
        // Autofocus on desktop, but avoid undesirable mobile keyboard popping by default.
        if (window.matchMedia('(pointer:fine)').matches) this.input?.focus({preventScroll:true});
        else this.dialog?.focus({preventScroll:true});
      });
      document.dispatchEvent(new CustomEvent('spider:search-modal:open'));
    }
    close() {
      if (!this.opened) return;
      this.opened=false;
      this.stopRequest();
      this.root.classList.remove('is-open');
      this.root.setAttribute('aria-hidden','true');
      document.documentElement.classList.remove('sp-smodal-open');
      const trigger=this.lastTrigger;
      trigger?.setAttribute?.('aria-expanded','false');
      this.lastTrigger=null;
      const complete = () => {if (!this.opened) this.root.hidden=true;};
      window.clearTimeout(this.closeDelay);
      if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) complete();
      else this.closeDelay=window.setTimeout(complete, Number(getComputedStyle(this.root).getPropertyValue('--sp-smodal-duration').replace('ms','')) || 300);
      if (trigger && trigger.isConnected && typeof trigger.focus === 'function') requestAnimationFrame(()=>trigger.focus({preventScroll:true}));
      document.dispatchEvent(new CustomEvent('spider:search-modal:close'));
    }
    updateClear() {if(this.clear)this.clear.hidden = !this.input?.value;}
    onInput() {
      this.updateClear();
      const query=(this.input?.value || '').trim();
      this.stopRequest();
      const min = Math.max(1,Math.min(4,Number(this.root.dataset.minChars)||2));
      if (query.length < min) {this.results.innerHTML=this.initial; this.announce('');this.results.setAttribute('aria-busy','false');return;}
      this.results.setAttribute('aria-busy','true');
      this.debounce=window.setTimeout(()=>this.search(query),Math.max(100,Number(this.root.dataset.debounce)||250));
    }
    stopRequest() {
      clearTimeout(this.debounce);this.debounce=null;
      this.abort?.abort();this.abort=null;
      this.requestId+=1;
      this.results?.setAttribute('aria-busy','false');
    }
    async search(rawQuery) {
      const query=String(rawQuery||'').trim();
      const min=Math.max(1,Number(this.root.dataset.minChars)||2);
      this.updateClear();
      this.stopRequest();
      if(query.length<min) {this.results.innerHTML=this.initial;return;}
      this.results.setAttribute('aria-busy','true');
      this.announce('Searching…');
      const id=++this.requestId;
      this.abort=new AbortController();
      try {
        const rawUrl=this.root.dataset.predictiveUrl || '/search/suggest';
        const url=/^https?:\/\//i.test(rawUrl) ? new URL(rawUrl) : new URL(rawUrl,location.origin);
        url.searchParams.set('q',query);
        url.searchParams.set('resources[type]',this.root.dataset.types || 'product,collection,query');
        url.searchParams.set('resources[limit]','10');
        url.searchParams.set('section_id',this.root.dataset.resultSection || 'sp-search-modal-predictive');
        const response=await fetch(url.toString(),{headers:{Accept:'text/html'},signal:this.abort.signal});
        if(!response.ok)throw new Error('Search is temporarily unavailable');
        const markup=await response.text();
        if(id!==this.requestId || query!==(this.input.value||'').trim())return;
        const doc=new DOMParser().parseFromString(markup,'text/html');
        const payload=doc.querySelector('[data-sp-smodal-predictive-content]');
        if(!payload)throw new Error('The Shopify search response could not be rendered');
        // Markup is Shopify section-rendered Liquid, not interpolated HTML from user input.
        this.results.replaceChildren(...Array.from(payload.childNodes).map(node=>document.importNode(node,true)));
        this.limitResults();
        this.announce('Search results updated');
      } catch (error) {
        if(error.name==='AbortError' || id!==this.requestId)return;
        this.results.replaceChildren();
        const notice=document.createElement('div');notice.className='sp-smodal__message';
        const heading=document.createElement('strong');heading.textContent='Search temporarily unavailable';
        const message=document.createElement('span');message.textContent='You can still search the store.';
        const link=document.createElement('a');link.href=(this.root.dataset.searchUrl||'/search')+'?q='+encodeURIComponent(query);link.textContent='View search results →';
        notice.append(heading,message,link);this.results.append(notice);
        this.announce('Search unavailable. Try viewing all results.');
      } finally {
        if(id===this.requestId)this.results.setAttribute('aria-busy','false');
      }
    }
    limitResults() {
      for (const [selector, control] of [['[data-sp-smodal-rating]','showRating'],['[data-sp-smodal-compare]','showCompare'],['[data-sp-smodal-sale]','showSale'],['[data-sp-smodal-vendor]','showVendor'],['[data-sp-smodal-collection-count]','showCollectionCount']]) {
        if(this.root.dataset[control]==='false') this.results.querySelectorAll(selector).forEach(node=>node.remove());
      }
      for (const [selector, max] of [['[data-sp-smodal-product]', Number(this.root.dataset.productLimit)||4],['[data-sp-smodal-collection]',Number(this.root.dataset.collectionLimit)||4]]) {
        [...this.results.querySelectorAll(selector)].forEach((item,index)=>{if(index>=max)item.remove();});
      }
    }
    announce(message) {if(this.status)this.status.textContent=message;}
    getHistory() {
      if(this.root.dataset.history!=='true')return [];
      try {const entries=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(entries)?entries.filter(e=>typeof e==='string').slice(0,10):[];}catch{return [];}
    }
    saveHistory(entries) {try{localStorage.setItem(HISTORY_KEY,JSON.stringify(entries));}catch{ /* no storage permission */ }}
    remember(value) {
      if(this.root.dataset.history!=='true')return;
      const query=String(value||'').trim().slice(0,120);
      if(!query)return;
      const max=Math.max(1,Math.min(10,Number(this.root.dataset.historyMax)||5));
      const next=[query,...this.getHistory().filter(q=>q.toLocaleLowerCase()!==query.toLocaleLowerCase())].slice(0,max);
      this.saveHistory(next);this.renderRecent();
    }
    renderRecent() {
      if(!this.recentList || !this.recentBlock)return;
      const entries=this.getHistory();this.recentList.replaceChildren();this.recentBlock.hidden=entries.length===0;
      entries.forEach((term,index)=>{
        const li=document.createElement('li'),row=document.createElement('div');row.className='sp-smodal__recent-row';
        const search=document.createElement('button');search.type='button';search.dataset.spSmodalTerm=term;
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','17');svg.setAttribute('height','17');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');
        const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r','9');
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M12 6v6l4 2');svg.append(circle,path);
        const span=document.createElement('span');span.textContent=term;search.append(svg,span);
        const remove=document.createElement('button');remove.type='button';remove.className='sp-smodal__recent-remove';remove.dataset.spSmodalRemoveRecent=String(index);remove.setAttribute('aria-label','Remove '+term);remove.textContent='×';
        row.append(search,remove);li.append(row);this.recentList.append(li);
      });
    }
    destroy() {this.close();this.stopRequest();clearTimeout(this.closeDelay);this.listeners.abort();}
  }
  function get() {return instance && instance.root?.isConnected ? instance : null;}
  function create(root=document) {
    const node=root.matches?.(ROOT)?root:root.querySelector?.(ROOT);
    if(!node)return;
    if(instance && instance.root===node)return;
    instance?.destroy();instance=new SpiderSearchModal(node);
  }
  function open(trigger){const modal=get();if(modal)modal.open(trigger);else window.location.assign(document.querySelector('[data-search-url]')?.dataset.searchUrl||'/search');}
  function globalClick(event){
    const trigger=event.target.closest?.('[data-sp-search-drawer-toggle],[data-sp-search-toggle],[data-sp-toolbar-action="search"],[data-sp-mobile-search-utility],[data-sp-global-search-trigger]');
    if(!trigger || trigger.closest(ROOT) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    if(trigger.dataset.spToolbarAction==='search' && trigger.dataset.searchBehaviour==='page')return;
    const modal=get();if(!modal)return;
    event.preventDefault();event.stopPropagation();
    // Header and toolbar are clients; their legacy delegated events must not open duplicate surfaces.
    open(trigger);
  }
  function install(){
    window.Spider=window.Spider||{};
    window.Spider.openSearchModal=open;
    window.Spider.closeSearchModal=()=>get()?.close();
    create(document);
  }
  document.addEventListener('click',globalClick,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  document.addEventListener('shopify:section:load',event=>create(event.target));
  document.addEventListener('shopify:section:unload',event=>{if(instance && event.target.contains(instance.root)){instance.destroy();instance=null;}});
})();
