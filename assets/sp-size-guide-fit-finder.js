(() => {
  'use strict';
  if (window.__spSizeFitBootstrapped) return;
  window.__spSizeFitBootstrapped = true;
  const selector = '[data-sp-fit-root]';
  const instances = new WeakMap();
  const DIMENSIONS = ['height', 'chest', 'waist', 'hips', 'inseam', 'shoulder'];
  const NORMAL_LIMITS = { height:[75,260], chest:[35,250], waist:[30,250], hips:[35,260], inseam:[30,140], shoulder:[15,100] };
  const TO_CM = 2.54;
  const norm = x => String(x ?? '').trim().toLocaleLowerCase().replace(/[\s_-]+/g,'');
  const same = (a,b) => norm(a) === norm(b);
  const rounded = (x, digits=1) => Number(x.toFixed(digits));
  const validNumber = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));

  class SizeFit {
    constructor(root) {
      this.root = root;
      this.abort = new AbortController();
      this.signal = this.abort.signal;
      try { this.config = JSON.parse(root.querySelector('[data-sp-fit-config]')?.textContent || '{}'); }
      catch { this.config = {}; }
      this.layout = root.dataset.spLayout;
      this.unit = root.dataset.spUnit === 'in' ? 'in' : 'cm';
      this.measurements = {};
      this.form = root.querySelector('[data-sp-form]');
      this.inputs = [...root.querySelectorAll('[data-sp-measure]')];
      this.activeStep = 0;
      this.dialog = root.querySelector('[data-sp-dialog]');
      this.dialogLauncher = null;
      this.dialogPreviousOverflow = null;
      this.rules = (this.config.rules || []).map((r, i) => ({...r, order:Number(r.order || i+1)})).sort((a,b)=>a.order-b.order);
      this.init();
    }
    one(s) { return this.root.querySelector(s); }
    many(s) { return [...this.root.querySelectorAll(s)]; }
    listen(node, event, fn, opts={}) { node?.addEventListener(event,fn,{...opts,signal:this.signal}); }
    init() {
      this.restoreUnit();
      this.unitPicker();
      this.updateUnit();
      if (this.layout === 'style_1') this.initializeTabs();
      if (this.layout === 'style_3') this.initializeWizard();
      if (this.layout === 'style_4') this.initializeDialog();
      if (this.layout === 'style_5') this.initializeAccordions();
      this.listen(this.form,'submit',e=>{e.preventDefault();if(this.layout === 'style_3') this.wizardSubmit(); else this.calculate();});
      this.listen(this.root,'click',e=>{
        const chartLink=e.target.closest('[data-sp-open-chart]');
        if(chartLink){ e.preventDefault();this.revealChart(); }
      });
      [this.one('[data-sp-submit]'),this.one('[data-sp-wizard-next]')].forEach(btn=>{if(btn)btn.disabled=!this.config.approved;});
      this.root.classList.add('sp-fit--ready');
    }
    restoreUnit() {
      if (this.root.dataset.spRememberUnit !== 'true') return;
      try { const u=localStorage.getItem('sp-fit-unit-preference'); if(u==='in'||u==='cm') this.unit=u; } catch(_) {}
    }
    unitPicker() {
      const choices=this.many('[data-sp-unit-picker] input');
      choices.forEach(input=>{
        input.checked=input.value===this.unit;
        this.listen(input,'change',()=>{
          if(!input.checked) return;
          this.collectCentimeters();
          this.unit=input.value;
          this.updateUnit();
          if(this.root.dataset.spRememberUnit==='true') try{localStorage.setItem('sp-fit-unit-preference',this.unit);}catch(_){}
        });
      });
    }
    collectCentimeters() {
      // The current rendered values are converted to centimeters once and kept as canonical numbers.
      for(const input of this.inputs){
        if(input.value.trim()===''){delete this.measurements[input.dataset.spMeasure];continue;}
        const n=Number(input.value);
        if(Number.isFinite(n)) this.measurements[input.dataset.spMeasure]=n*(this.unit==='in'?TO_CM:1);
      }
    }
    updateUnit() {
      this.many('[data-sp-unit-picker] input').forEach(i=>i.checked=i.value===this.unit);
      this.many('[data-sp-unit-label]').forEach(el=>el.textContent=this.unit);
      this.inputs.forEach(input=>{
        const dim=input.dataset.spMeasure;
        const value=this.measurements[dim];
        input.value=Number.isFinite(value)?String(rounded(value/(this.unit==='in'?TO_CM:1),this.unit==='in'?2:1)):'';
        const limits=NORMAL_LIMITS[dim]||[0,300];
        input.min=String(rounded(limits[0]/(this.unit==='in'?TO_CM:1),2));
        input.max=String(rounded(limits[1]/(this.unit==='in'?TO_CM:1),2));
        this.clearError(input);
      });
      this.many('[data-sp-cm-range]').forEach(span=>{
        const min=Number(span.dataset.spMin),max=Number(span.dataset.spMax);
        if(!Number.isFinite(min)||!Number.isFinite(max))return;
        const factor=this.unit==='in'?TO_CM:1;
        const decimals=this.unit==='in'?1:0;
        span.textContent=`${rounded(min/factor,decimals)}–${rounded(max/factor,decimals)}`;
      });
    }
    clearError(input){
      input.removeAttribute('aria-invalid');
      const el=this.one(`[data-sp-error="${input.dataset.spMeasure}"]`);
      if(el) el.textContent='';
    }
    setError(input,message) {
      input.setAttribute('aria-invalid','true');
      const el=this.one(`[data-sp-error="${input.dataset.spMeasure}"]`);
      if(el)el.textContent=message;
    }
    readMeasurements({showErrors=true}={}) {
      const result={};let error=false;let firstInvalid=null;
      this.inputs.forEach(input=>{
        const dim=input.dataset.spMeasure, raw=input.value.trim();
        this.clearError(input);
        if(!raw){
          if(input.required){error=true;if(!firstInvalid)firstInvalid=input;if(showErrors)this.setError(input,'This measurement is required.');}
          return;
        }
        const display=Number(raw),cm=display*(this.unit==='in'?TO_CM:1),[min,max]=NORMAL_LIMITS[dim]||[0,300];
        if(!Number.isFinite(display)||cm<min||cm>max){
          error=true;if(!firstInvalid)firstInvalid=input;
          if(showErrors)this.setError(input,`Enter a value between ${rounded(min/(this.unit==='in'?TO_CM:1),1)} and ${rounded(max/(this.unit==='in'?TO_CM:1),1)} ${this.unit}.`);
        } else result[dim]=cm;
      });
      if(error && showErrors)firstInvalid?.focus();
      if(!error)this.measurements={...result};
      return error?null:result;
    }
    validRules() {
      const required=this.inputs.filter(i=>i.required).map(i=>i.dataset.spMeasure);
      return this.rules.filter(rule=>{
        // Rule is usable only if each required measurement has a nonempty valid cm range.
        const configuredValid=Object.entries(rule.ranges||{}).every(([axis,range])=>{
          if(!Array.isArray(range)||range.every(x=>x===null||x===undefined||x===''))return true;
          return this.rangesOkay(range);
        });
        return configuredValid && required.length>0 && required.every(axis=>this.rangesOkay(rule.ranges?.[axis]));
      });
    }
    rangesOkay(range){return Array.isArray(range)&&range.length===2&&validNumber(range[0])&&validNumber(range[1])&&Number(range[0])<=Number(range[1]);}
    matches(rule,values) {
      for(const [axis,value] of Object.entries(values)) {
        const range=rule.ranges?.[axis];
        if(!this.rangesOkay(range))continue; // Optional range not configured: ignored, never zero.
        if(value<Number(range[0])-1e-6 || value>Number(range[1])+1e-6)return false;
      }
      return true;
    }
    calculate() {
      if(!this.form)return false;
      const wrongProduct=this.config.sizeScope==='selected' && !this.config.designMode &&
        (!this.config.scopeProductId || String(this.config.scopeProductId)!==String(this.config.productId));
      if(!this.config.approved || this.config.basis!=='body' || wrongProduct) {
        this.setResult('configuration_error',null,'Recommendations require an approved body-measurement size chart.');
        return false;
      }
      const values=this.readMeasurements();
      if(!values){this.setResult('invalid_input',null,'Please check the highlighted measurements.');return false;}
      const candidates=this.validRules();
      if(!candidates.length){this.setResult('configuration_error',null,'No valid size ranges are configured for the required measurements.');return false;}
      const matched=candidates.filter(rule=>this.matches(rule,values));
      if(!matched.length){this.setResult('no_match',null,this.config.noMatchText||'Consult the full size chart.');return false;}
      // Baseline = smallest configured size containing all supplied measurements.
      let selection=matched[0];
      const preference=this.one('input[name^="sp-fit-choice-"]:checked')?.value||'regular';
      if(preference==='slim'){
        // Smaller only when the customer's measurements are still inside that rule.
        const idx=candidates.indexOf(selection);
        const smaller=candidates.slice(0,idx).reverse().find(r=>this.matches(r,values));
        if(smaller) selection=smaller;
      } else if(preference==='relaxed'){
        // A relaxed fit can pick the next explicitly configured size, never a fabricated one.
        const idx=candidates.indexOf(selection);
        if(idx>=0 && candidates[idx+1]) selection=candidates[idx+1];
      }
      const variant=this.resolveVariant(selection);
      let title=`${preference[0].toUpperCase()+preference.slice(1)} fit`;
      let message=selection.note||'Based on the configured measurement ranges and selected fit.';
      let state='matched';
      if(variant?.available===false){state='matched_unavailable';message+=' This size is currently sold out in the selected product options.';}
      if(this.config.enableVariantMatch && this.config.productId && !variant) message+=' Check product options to confirm size availability.';
      this.setResult(state,selection,message,title);
      this.many('[data-sp-rule-row]').forEach(row=>row.classList.toggle('is-recommended',row.dataset.spRuleRow===selection.id));
      if(variant && variant.available && this.config.enableVariantSelection) this.selectExactVariant(variant);
      // Deliberately exclude body measurements from all global events.
      this.root.dispatchEvent(new CustomEvent('sp:fit-recommendation',{bubbles:true,detail:{sectionId:this.root.dataset.spSectionId,productId:this.config.productId||null,recommendedSize:selection.label,matchedVariantId:variant?.id||null,available:variant?.available??null,fitPreference:preference,unit:this.unit}}));
      return true;
    }
    resolveVariant(rule) {
      const opts=this.config.productOptions||[];
      if(!this.config.enableVariantMatch||!this.config.productId||!opts.length)return null;
      const sizeIndex=opts.findIndex(option=>same(option,this.config.sizeOption||'Size'));
      if(sizeIndex<0)return null;
      const aliases=[rule.label,...String(rule.aliases||'').split(',').map(x=>x.trim())].filter(Boolean);
      // Respect already selected Color/Material/other options; never silently replace them.
      const productRoot=document.querySelector(`[data-main-product][data-product-id="${String(this.config.productId).replace(/[^0-9]/g,'')}"]`);
      const activeId=productRoot?.dataset.selectedVariantId||this.config.selectedVariantId;
      const current=(this.config.variants||[]).find(v=>String(v.id)===String(activeId));
      const list=(this.config.variants||[]).filter(v=>v.options && aliases.some(a=>same(a,v.options[sizeIndex])) && v.options.every((voption,i)=>i===sizeIndex||!current||same(voption,current.options[i])));
      return list.length===1?list[0]:null; // Ambiguous combos are intentionally never guessed.
    }
    selectExactVariant(variant) {
      // Spider's supported form controller listens to *real option input change*, not variantChanged notifications.
      const productRoot=document.querySelector(`[data-main-product][data-product-id="${String(this.config.productId).replace(/[^0-9]/g,'')}"]`);
      const groups=[...(productRoot?.querySelectorAll('[data-option-group]')||[])].sort((a,b)=>Number(a.dataset.optionIndex)-Number(b.dataset.optionIndex));
      const sizeIndex=(this.config.productOptions||[]).findIndex(x=>same(x,this.config.sizeOption||'Size'));
      const group=groups[sizeIndex];
      if(!group)return; // Do not force product selection if existing controller cannot be safely used.
      const correct=variant.options[sizeIndex];
      const target=[...group.querySelectorAll('[data-option-input]')].find(el=>same(el.value,correct));
      if(!target || target.disabled)return;
      const current=group.querySelector('input[data-option-input]:checked')||group.querySelector('select[data-option-input]');
      if(current && same(current.value,correct))return;
      if(target.matches('select'))target.value=correct;
      else target.checked=true;
      target.dispatchEvent(new Event('change',{bubbles:true}));
    }
    setResult(state,rule,message,title='Size recommendation') {
      const box=this.one('[data-sp-result]');if(!box)return;
      box.hidden=false;box.dataset.spState=state;
      const circle=this.one('[data-sp-result-size]');
      circle.textContent=rule?.label||'i';
      circle.style.fontSize=rule && rule.label.length>3?'18px':'';
      this.one('[data-sp-result-title]').textContent=title;
      this.one('[data-sp-result-message]').textContent=message;
    }
    initializeTabs() {
      this.tabs=this.many('[data-sp-tab]');
      this.tabs.forEach(tab=>{
        this.listen(tab,'click',()=>this.activateTab(tab.dataset.spTab));
        this.listen(tab,'keydown',e=>{
          const idx=this.tabs.indexOf(tab),rtl=getComputedStyle(this.root).direction==='rtl';let next=null;
          if(e.key==='Home')next=0;
          if(e.key==='End')next=this.tabs.length-1;
          if(e.key==='ArrowRight')next=(idx+(rtl?-1:1)+this.tabs.length)%this.tabs.length;
          if(e.key==='ArrowLeft')next=(idx+(rtl?1:-1)+this.tabs.length)%this.tabs.length;
          if(next!==null){e.preventDefault();this.activateTab(this.tabs[next].dataset.spTab);this.tabs[next].focus();}
        });
      });
      const active=this.tabs.find(t=>t.getAttribute('aria-selected')==='true')||this.tabs[0];
      if(active)this.activateTab(active.dataset.spTab);
    }
    activateTab(name) {
      this.many('[data-sp-tab]').forEach(t=>{const on=t.dataset.spTab===name;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;});
      this.many('[data-sp-panel]').forEach(p=>{p.hidden=p.dataset.spPanel!==name;p.toggleAttribute('inert',p.hidden);});
    }
    initializeWizard() {
      this.activeStep=0;
      this.renderWizard();
      this.listen(this.one('[data-sp-wizard-next]'),'click',()=>this.nextWizard());
      this.listen(this.one('[data-sp-wizard-back]'),'click',()=>{if(this.activeStep>0){this.activeStep--;this.renderWizard();}});
    }
    renderWizard() {
      this.many('[data-sp-wizard-step]').forEach(el=>el.classList.toggle('is-active',Number(el.dataset.spWizardStep)===this.activeStep));
      const label=this.one('[data-sp-progress-text]');if(label)label.textContent=`Step ${this.activeStep+1} of 4`;
      const bar=this.one('[data-sp-progress-bar]');if(bar)bar.style.width=`${(this.activeStep+1)*25}%`;
      const back=this.one('[data-sp-wizard-back]');if(back)back.hidden=this.activeStep===0;
      const next=this.one('[data-sp-wizard-next]');if(next)next.textContent=this.activeStep===3?'Start again':this.activeStep===2?'Find my size →':'Continue →';
    }
    nextWizard() {
      if(this.activeStep===3){this.activeStep=0;this.renderWizard();return;}
      if(this.activeStep===1 && !this.readMeasurements())return;
      if(this.activeStep===2){const success=this.calculate();if(!success)return;}
      this.activeStep++;
      this.renderWizard();
    }
    wizardSubmit(){this.nextWizard();}
    initializeDialog() {
      if(!this.dialog)return;
      this.many('[data-sp-launch]').forEach(btn=>this.listen(btn,'click',()=>this.openDialog(btn.dataset.spLaunch,btn)));
      this.listen(this.one('[data-sp-dialog-close]'),'click',()=>this.dialog.close());
      this.listen(this.dialog,'close',()=>{
        document.body.style.overflow=this.dialogPreviousOverflow??'';
        this.dialogLauncher?.focus();this.dialogLauncher=null;
      });
      this.listen(this.dialog,'click',e=>{if(e.target===this.dialog)this.dialog.close();});
    }
    openDialog(view,launcher) {
      if(!this.dialog)return;
      this.dialogLauncher=launcher;
      this.many('[data-sp-dialog-view]').forEach(el=>el.hidden=el.dataset.spDialogView!==view);
      if(!this.dialog.open){this.dialogPreviousOverflow=document.body.style.overflow;this.dialog.showModal();document.body.style.overflow='hidden';}
      this.one('[data-sp-dialog-close]')?.focus();
    }
    initializeAccordions() {
      if(this.root.dataset.spAccordionMode!=='single')return;
      this.many('[data-sp-accordion]').forEach(details=>this.listen(details,'toggle',()=>{
        if(details.open)this.many('[data-sp-accordion]').forEach(other=>{if(other!==details)other.open=false;});
      }));
    }
    revealChart() {
      if(this.layout==='style_1')this.activateTab('size_guide');
      if(this.layout==='style_3'){const details=this.one('[data-sp-guide-details]');if(details)details.open=true;}
      if(this.layout==='style_4')this.openDialog('size_guide',this.dialogLauncher||this.one('[data-sp-launch="size_guide"]'));
      if(this.layout==='style_5')this.many('[data-sp-accordion]')[1].open=true;
      const chart=this.one('[data-sp-chart]');chart?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    revealBlock(blockId) {
      const el=this.many('[data-sp-block-id], [data-sp-rule-row]').find(n=>n.dataset.spBlockId===blockId || n.dataset.spRuleRow===blockId);
      if(!el)return;
      if(this.layout==='style_1')this.activateTab('size_guide');
      if(this.layout==='style_3'){this.one('[data-sp-guide-details]')?.setAttribute('open','');}
      if(this.layout==='style_4')this.openDialog('size_guide',this.one('[data-sp-launch="size_guide"]'));
      if(this.layout==='style_5')el.closest('details')?.setAttribute('open','');
      el.scrollIntoView({block:'nearest',behavior:'auto'});
    }
    destroy() {
      this.abort.abort();
      if(this.dialog?.open)this.dialog.close();
      if(this.dialogPreviousOverflow!==null)document.body.style.overflow=this.dialogPreviousOverflow;
      this.inputs.forEach(input=>input.value='');this.measurements={};
      this.root.classList.remove('sp-fit--ready');
    }
  }
  const mount=root=>{if(!root||instances.has(root))return;instances.set(root,new SizeFit(root));};
  const unmount=root=>{const obj=instances.get(root);if(obj){obj.destroy();instances.delete(root);}};
  const start=()=>document.querySelectorAll(selector).forEach(mount);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  document.addEventListener('shopify:section:load',e=>e.target.querySelectorAll?.(selector).forEach(mount));
  document.addEventListener('shopify:section:unload',e=>e.target.querySelectorAll?.(selector).forEach(unmount));
  document.addEventListener('shopify:block:select',e=>{
    const root=e.target.closest?.(selector),obj=root&&instances.get(root);
    if(obj)obj.revealBlock(e.detail?.blockId||'');
  });
})();
