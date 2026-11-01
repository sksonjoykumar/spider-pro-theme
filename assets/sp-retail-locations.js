/* Spider Retail Locations — progressive enhancement; no third-party dependencies. */
(() => {
  'use strict';
  if (window.__spRetailLocationsInstalled) return;
  window.__spRetailLocationsInstalled = true;
  const instances = new Map();
  const normalize = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const validCoord = (value, limit) => {
    const raw = String(value ?? '').trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
  };
  const distanceKm = (a, b, x, y) => {
    const radians = n => n * Math.PI / 180;
    const deltaLat = radians(x - a), deltaLng = radians(y - b);
    const theta = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(a)) * Math.cos(radians(x)) * Math.sin(deltaLng / 2) ** 2;
    return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, theta)));
  };

  class RetailLocations {
    constructor(root) {
      this.root = root;
      this.controller = new AbortController();
      this.signal = this.controller.signal;
      this.items = [...root.querySelectorAll('[data-sp-card]')].map((element, order) => ({
        element, order, id: element.dataset.spId,
        region: element.dataset.spRegion || '', type: element.dataset.spType || '',
        search: normalize(element.dataset.spSearch), city: normalize(element.dataset.spSearchCity),
        address: normalize(element.dataset.spSearchAddress),
        lat: validCoord(element.dataset.spLat, 90), lng: validCoord(element.dataset.spLng, 180),
        distance: null
      }));
      this.markers = [...root.querySelectorAll('[data-sp-marker]')];
      this.mapCanvas = root.querySelector('[data-sp-map-canvas]');
      this.mapZoomInButton = root.querySelector('[data-sp-map-zoom="in"]');
      this.mapZoomOutButton = root.querySelector('[data-sp-map-zoom="out"]');
      this.mapZoomStatus = root.querySelector('[data-sp-map-zoom-status]');
      this.mapZoom = 1;
      this.query = root.querySelector('[data-sp-query]');
      this.region = root.querySelector('[data-sp-region-select]');
      this.type = root.querySelector('[data-sp-type-select]');
      this.count = root.querySelector('[data-sp-count]');
      this.empty = root.querySelector('[data-sp-empty]');
      this.form = root.querySelector('[data-sp-form]');
      this.geo = root.querySelector('[data-sp-geolocate]');
      this.geoFeedback = root.querySelector('[data-sp-geo-feedback]');
      if(this.geo && !this.items.some(i=>i.lat !== null && i.lng !== null)) this.geo.disabled=true;
      this.clear = root.querySelector('[data-sp-clear]');
      this.viewButtons = [...root.querySelectorAll('[data-sp-view-button]')];
      this.desktopViewButtons = [...root.querySelectorAll('[data-sp-desktop-view-button]')];
      this.mapPanel = root.querySelector('[data-sp-map-panel]');
      this.active = null;
      this.searchText = '';
      this.queryDebounce = 0;
      this.hasMap = root.dataset.spHasMap === 'true';
      this.liveMode = root.dataset.spSearchMode === 'live';
      this.minChars = Math.max(1, Number(root.dataset.spMinChars) || 1);
      this.distanceUnit = root.dataset.spDistanceUnit === 'kilometers' ? 'kilometers' : 'miles';
      this.sortDistance = root.dataset.spSortDistance === 'true';
      this.geolocation = null;
      this.buildFilters();
      this.spreadMarkers();
      this.bind();
      this.setView(this.loadInitialView());
      this.setDesktopView('map');
      this.update({announce: false});
      this.initializeEmbed();
    }
    on(element, name, fn) { element?.addEventListener(name, fn, {signal: this.signal}); }
    buildFilters() {
      const addOptions = (select, values, allLabel) => {
        if (!select) return;
        const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const fragment = document.createDocumentFragment();
        for (const value of unique) { const opt = document.createElement('option'); opt.value = value; opt.textContent = value; fragment.append(opt); }
        select.append(fragment);
        const first = select.options[0]; if (first) first.textContent = allLabel;
      };
      addOptions(this.region, this.items.map(i => i.region), this.root.dataset.spAllLabel || 'All locations');
      const labels = {retail:'Retail store', flagship:'Flagship store', showroom:'Showroom', outlet:'Outlet', pickup:'Pickup point'};
      if (this.type) {
        for (const type of [...new Set(this.items.map(i => i.type))].filter(Boolean)) {
          const option = document.createElement('option'); option.value = type; option.textContent = labels[type] || type;
          this.type.append(option);
        }
      }
      if (this.region && this.root.dataset.spAllOption === 'false' && this.region.options.length > 1) {
        this.region.options[0].remove();this.region.selectedIndex=0;
      }
      if (this.region && this.root.dataset.spDefaultRegion) {
        const requested = normalize(this.root.dataset.spDefaultRegion);
        const option = [...this.region.options].find(o => normalize(o.value) === requested);
        if (option) this.region.value = option.value;
      }
      if (this.region && (this.root.classList.contains('sp-rl--filter-buttons') || this.root.classList.contains('sp-rl--filter-tabs'))) {
        this.renderRegionButtons();
      }
    }
    spreadMarkers() {
      if(!this.root.classList.contains('sp-rl--cluster-spread'))return;
      const buckets=new Map();
      for(const marker of this.markers){
        const key=marker.style.getPropertyValue('--sp-rl-x')+'/'+marker.style.getPropertyValue('--sp-rl-y');
        if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(marker);
      }
      for(const group of buckets.values()){
        if(group.length<2)continue;
        group.forEach((marker,index)=>{
          const angle=(index/group.length)*Math.PI*2;const radius=group.length>8?25:16;
          marker.style.setProperty('--sp-rl-spread-x',`${Math.round(Math.cos(angle)*radius)}px`);
          marker.style.setProperty('--sp-rl-spread-y',`${Math.round(Math.sin(angle)*radius)}px`);
        });
      }
    }
    renderRegionButtons() {
      const wrap = document.createElement('div');
      wrap.className = 'sp-rl__filter-chips';
      wrap.setAttribute('aria-label','Filter stores by region');
      wrap.dataset.spRegionChips = '';
      for (const option of this.region.options) {
        const btn = document.createElement('button'); btn.type='button';btn.className='sp-rl__filter-chip';
        btn.dataset.spRegionValue = option.value;btn.textContent=option.textContent;
        btn.setAttribute('aria-pressed',String(option.value === this.region.value));
        wrap.append(btn);
      }
      this.region.closest('.sp-rl__filter-wrap')?.insertAdjacentElement('afterend',wrap);
      this.regionChips = wrap;
    }
    syncRegionChips() {
      this.regionChips?.querySelectorAll('[data-sp-region-value]').forEach(button => {
        button.setAttribute('aria-pressed',String(button.dataset.spRegionValue === this.region.value));
      });
    }
    bind() {
      this.on(this.form, 'submit', e => {
        e.preventDefault();this.searchText = normalize(this.query?.value);
        this.update({announce:true});
      });
      this.on(this.query, 'input', () => {
        if (this.clear) this.clear.hidden = !this.query.value;
        if (!this.liveMode) return;
        window.clearTimeout(this.queryDebounce);
        this.queryDebounce = window.setTimeout(() => {this.searchText = normalize(this.query.value);this.update({announce:false});}, 210);
      });
      this.on(this.clear, 'click', () => {
        if(this.query) this.query.value = '';
        this.clear.hidden = true; this.searchText = '';
        if(this.region) this.region.value=''; if(this.type) this.type.value='';
        this.update({announce:true});this.query?.focus();
      });
      for (const select of [this.region, this.type]) this.on(select, 'change', () => {this.syncRegionChips(); this.update({announce:true});});
      this.on(this.root, 'click', e => {
        const chip = e.target.closest('[data-sp-region-value]');
        if (chip && this.root.contains(chip) && this.region) {
          this.region.value=chip.dataset.spRegionValue;
          this.syncRegionChips();this.update({announce:true});return;
        }
        const button = e.target.closest('[data-sp-map-zoom], [data-sp-marker], [data-sp-select], [data-sp-view-button], [data-sp-desktop-view-button]');
        if (!button || !this.root.contains(button)) return;
        if (button.dataset.spMapZoom) {this.zoomMap(button.dataset.spMapZoom);return;}
        if (button.dataset.spViewButton) {this.setView(button.dataset.spViewButton);return;}
        if (button.dataset.spDesktopViewButton) {this.setDesktopView(button.dataset.spDesktopViewButton);return;}
        const id = button.dataset.spId || button.closest('[data-sp-card]')?.dataset.spId;
        this.select(id, true);
      });
      this.on(this.geo,'click',() => this.locate());
    }
    filteredItems() {
      const query = this.searchText.length >= this.minChars ? this.searchText : '';
      const searchMode = this.root.dataset.spSearchFields;
      const region = this.region?.value || '';
      const type = this.type?.value || '';
      return this.items.filter(item => {
        if (region && region !== item.region) return false;
        if (type && type !== item.type) return false;
        if (!query) return true;
        const fields = searchMode === 'address' ? item.address : searchMode === 'city' ? item.city : item.search;
        return fields.includes(query);
      });
    }
    update({announce=true}={}) {
      const filtered = this.filteredItems();
      const visible = new Set(filtered.map(x => x.id));
      for (const item of this.items) item.element.hidden = !visible.has(item.id);
      const distanceSorted = this.geolocation && this.sortDistance;
      // Keep featured cards in place and preserve the region-directory group hierarchy.
      if (distanceSorted && !this.root.classList.contains('sp-rl--style_5')) {
        for (const list of this.root.querySelectorAll('[data-sp-card-list]')) {
          const cards = [...list.children].filter(el => el.hasAttribute('data-sp-card'));
          cards.sort((a,b) => {
            const itemA = this.items.find(i=>i.id === a.dataset.spId);
            const itemB = this.items.find(i=>i.id === b.dataset.spId);
            return (itemA?.distance ?? Infinity) - (itemB?.distance ?? Infinity) || (itemA?.order ?? 0) - (itemB?.order ?? 0);
          });
          list.append(...cards);
        }
      } else if (!this.geolocation && !this.root.classList.contains('sp-rl--style_5')) {
        for (const list of this.root.querySelectorAll('[data-sp-card-list]')) {
          const cards = [...list.children].filter(el=>el.hasAttribute('data-sp-card'));
          cards.sort((a,b)=>this.items.find(i=>i.id===a.dataset.spId).order - this.items.find(i=>i.id===b.dataset.spId).order);
          list.append(...cards);
        }
      }
      for (const group of this.root.querySelectorAll('[data-sp-region-group]')) {
        const hasVisible = [...group.querySelectorAll('[data-sp-card]')].some(card=>!card.hidden);
        group.hidden = !hasVisible;
        if (this.searchText) group.open = true;
      }
      for (const marker of this.markers) {
        marker.hidden = !visible.has(marker.dataset.spId);
      }
      const ordered = this.root.classList.contains('sp-rl--style_4') ?
        [...this.root.querySelectorAll('[data-sp-card]')].filter(el=>!el.hidden) :
        [...this.root.querySelectorAll('[data-sp-card-list] > [data-sp-card]')].filter(el=>!el.hidden);
      ordered.forEach((element, index) => {
        const marker = this.markers.find(m=>m.dataset.spId === element.dataset.spId);
        if (!marker) return;
        const num = index+1;
        const content = marker.querySelector('.sp-rl__marker-content');
        if (content) content.dataset.spNumber = String(num);
        marker.dataset.spMarkerIndex = String(num);
      });
      if (this.empty) {
        this.empty.hidden = filtered.length !== 0;
        if (filtered.length === 0 && this.items.length > 0) this.empty.querySelector('p').textContent = this.root.dataset.spNoResults || 'Try another city, address, or filter.';
      }
      if (!filtered.some(i => i.id===this.active)) this.active = filtered[0]?.id || null;
      this.reflectActive(false);
      if (this.count && announce) this.count.textContent = `${filtered.length} ${filtered.length===1?'store':'stores'} found`;
    }
    zoomMap(direction) {
      if (!this.mapCanvas) return;
      const step = 0.2;
      const next = direction === 'in'
        ? Math.min(2.4, Math.round((this.mapZoom + step) * 100) / 100)
        : Math.max(1, Math.round((this.mapZoom - step) * 100) / 100);
      this.mapZoom = next;
      this.mapCanvas.style.setProperty('--sp-rl-map-zoom', String(next));
      if (this.mapZoomInButton) this.mapZoomInButton.disabled = next >= 2.4;
      if (this.mapZoomOutButton) this.mapZoomOutButton.disabled = next <= 1;
      if (this.mapZoomStatus) this.mapZoomStatus.textContent = `Map zoom ${Math.round(next * 100)} percent`;
    }
    select(id, scroll) {
      if (!id) return;
      const item = this.items.find(i=>i.id===id);
      if (!item) return;
      if (item.element.hidden) {
        if (this.query) this.query.value='';this.searchText='';
        if (this.region) this.region.value='';if(this.type)this.type.value='';
        this.syncRegionChips();this.update({announce:false});
      }
      this.active=id;
      this.reflectActive(scroll);
      if (scroll && !this.onMobileMap()) {
        item.element.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      }
      if(this.count) this.count.textContent = `${item.element.querySelector('.sp-rl__store-name')?.textContent || 'Store'} selected`;
    }
    reflectActive(scroll) {
      for (const item of this.items) {
        const active=item.id===this.active;
        item.element.dataset.spSelected=String(active);
        const button=item.element.querySelector('[data-sp-select]');
        if(button)button.setAttribute('aria-pressed',String(active));
      }
      for(const marker of this.markers) {
        const active=marker.dataset.spId===this.active;
        marker.dataset.spActive=String(active);
        marker.setAttribute('aria-pressed',String(active));
      }
    }
    setDesktopView(view){
      if(!this.hasMap)return;
      const next=view==='list'?'list':'map';
      this.root.dataset.spDesktopView=next;
      for(const button of this.desktopViewButtons)button.setAttribute('aria-pressed',String(button.dataset.spDesktopViewButton===next));
    }
    onMobileMap(){return matchMedia('(max-width:749px)').matches && this.root.dataset.spView==='map';}
    loadInitialView() {
      let view=this.root.dataset.spMobileView==='map'?'map':'list';
      if(this.root.dataset.spRememberView==='true'){
        try{const saved=localStorage.getItem(`sp-retail-view-${this.root.dataset.spSectionId}`);if(saved==='map'||saved==='list')view=saved;}catch{}
      }
      return view;
    }
    setView(view) {
      if (!this.hasMap || !this.viewButtons.length) return;
      const next=view==='map'?'map':'list';
      this.root.dataset.spView=next;
      for(const button of this.viewButtons)button.setAttribute('aria-pressed',String(button.dataset.spViewButton===next));
      if(this.root.dataset.spRememberView==='true'){
        try{localStorage.setItem(`sp-retail-view-${this.root.dataset.spSectionId}`,next);}catch{}
      }
    }
    locate() {
      if(!this.geo || this.geo.disabled)return;
      if(!navigator.geolocation || !window.isSecureContext){this.setGeoFeedback('Location requires a supported browser and a secure HTTPS connection.');return;}
      this.geo.disabled=true;this.geo.setAttribute('aria-busy','true');this.setGeoFeedback('Finding your location…');
      navigator.geolocation.getCurrentPosition(
        position=>{
          if(this.signal.aborted)return;
          const lat=position.coords.latitude,lng=position.coords.longitude;
          this.geolocation=true; // only a boolean is retained; coordinates are never saved.
          for(const item of this.items) {
            item.distance=(item.lat!==null && item.lng!==null)?distanceKm(lat,lng,item.lat,item.lng):null;
            const display=item.element.querySelector('[data-sp-distance]');
            if(display){
              display.hidden=item.distance===null;
              if(item.distance!==null){const value=this.distanceUnit==='miles'?item.distance*.621371:item.distance;
                display.textContent=`Approx. ${value.toLocaleString(undefined,{maximumFractionDigits:1,minimumFractionDigits:1})} ${this.distanceUnit==='miles'?'mi':'km'} away (straight line)`;
              }
            }
          }
          this.setGeoFeedback('Approximate straight-line distances have been calculated on this device.');
          this.geo.disabled=false;this.geo.removeAttribute('aria-busy');this.update({announce:true});
        },
        error=>{
          if(this.signal.aborted)return;
          const messages={1:'Location permission was denied. You can still search stores.',2:'Your location is unavailable. You can still search stores.',3:'Location request timed out. You can still search stores.'};
          this.setGeoFeedback(messages[error.code] || 'We could not determine your location.');
          this.geo.disabled=false;this.geo.removeAttribute('aria-busy');
        },{enableHighAccuracy:false,timeout:12000,maximumAge:0}
      );
    }
    setGeoFeedback(value){if(this.geoFeedback){this.geoFeedback.textContent=value;this.geoFeedback.hidden=false;}}
    initializeEmbed() {
      const node=this.root.querySelector('[data-sp-embed]');if(!node)return;
      let src;
      try {
        src=new URL(node.dataset.spEmbedUrl);
        if(src.protocol!=='https:' || !(['www.google.com','maps.google.com','www.openstreetmap.org'].includes(src.hostname)))return;
      } catch{return;}
      this.embedNode=node;this.embedUrl=src.href;
      const attempt=()=>{
        const privacy=window.Shopify?.customerPrivacy;
        if(!privacy || typeof privacy.preferencesProcessingAllowed!=='function' || !privacy.preferencesProcessingAllowed()) return;
        if(node.querySelector('iframe'))return;
        const frame=document.createElement('iframe');frame.src=this.embedUrl;frame.title=node.dataset.spEmbedTitle || 'Store location map';
        frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=false;
        node.replaceChildren(frame);
      };
      attempt();
      this.on(document,'visitorConsentCollected',attempt);
    }
    revealEditorBlock(id) {
      this.select(id,false);
      const item=this.items.find(i=>i.id===id);if(!item)return;
      const group=item.element.closest('[data-sp-region-group]');if(group)group.open=true;
      if(this.hasMap && this.onMobileMap()) this.setView('list');
      item.element.scrollIntoView({block:'nearest'});
    }
    destroy() {
      window.clearTimeout(this.queryDebounce);
      this.controller.abort();
      this.embedNode?.querySelector('iframe')?.remove();
      this.items.length=0;this.markers.length=0;
    }
  }
  function initialize(scope=document) {
    const roots=[...scope.querySelectorAll('[data-sp-retail-locations]')];
    if(scope.matches?.('[data-sp-retail-locations]')) roots.unshift(scope);
    for(const root of roots){if(instances.has(root))continue;instances.set(root,new RetailLocations(root));}
  }
  function dispose(scope){for(const [root,instance] of instances){if(root===scope || scope.contains(root)){instance.destroy();instances.delete(root);}}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initialize(),{once:true});else initialize();
  document.addEventListener('shopify:section:load',event=>initialize(event.target));
  document.addEventListener('shopify:section:unload',event=>dispose(event.target));
  document.addEventListener('shopify:block:select',event=>{
    for(const [root,instance] of instances){if(root.contains(event.target) || root.closest('#shopify-section-'+event.detail?.sectionId)){instance.revealEditorBlock(event.detail?.blockId);break;}}
  });
})();
