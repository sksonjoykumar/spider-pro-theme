/* Spider Interactive Quiz — accessible, section-scoped progressive enhancement. */
(() => {
  'use strict';
  // The same deferred asset can be included by multiple Shopify section instances.
  // A document-scoped marker prevents duplicate global lifecycle handlers.
  if (document.documentElement.hasAttribute('data-sp-iq-bootstrapped')) return;
  document.documentElement.setAttribute('data-sp-iq-bootstrapped', '');
  const selector = '[data-sp-iq-root]';
  const instances = new WeakMap();
  const readKeys = value => String(value || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const clean = value => String(value || '').trim().toLowerCase();
  const format = (text,values) => String(text||'').replace(/\{([a-z]+)\}/g,(match,key)=>Object.hasOwn(values,key) ? String(values[key]) : match);
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class SpiderQuiz {
    constructor(root) {
      this.root = root;
      this.form = root.querySelector('[data-sp-iq-form]');
      this.steps = [];
      this.index = 0;
      this.onResult = false;
      this.results = Array.from(root.querySelectorAll('[data-sp-iq-result]'));
      this.resultZone = root.querySelector('[data-sp-iq-results]');
      this.counter = root.querySelector('[data-sp-iq-counter]');
      this.progress = root.querySelector('[data-sp-iq-progress]');
      this.progressBar = root.querySelector('[data-sp-iq-progress-bar]');
      this.next = root.querySelector('[data-sp-iq-next]');
      this.back = root.querySelector('[data-sp-iq-back]');
      this.restart = root.querySelector('[data-sp-iq-restart]');
      this.error = root.querySelector('[data-sp-iq-error]');
      this.live = root.querySelector('[data-sp-iq-live]');
      this.empty = root.querySelector('[data-sp-iq-empty]');
      this.warnings = [];
      this.timeout = null;
      this.listeners = [];
      this.storageKey = `sp-iq:${root.dataset.spIqSection}:${root.dataset.spIqConfigVersion || '1'}`;
      this.buildSteps();
      if (!this.steps.length || !this.form) {
        if (root.dataset.spIqPreview === 'true') this.showWarning('Please configure at least one question with valid answers.');
        return;
      }
      this.attach();
      this.restore();
      this.render(false);
      root.classList.add('sp-iq--ready');
    }
    listen(target, event, handler, options) {
      if (!target) return;
      target.addEventListener(event, handler, options);
      this.listeners.push(() => target.removeEventListener(event, handler, options));
    }
    showWarning(message) {
      const warning = document.createElement('p');
      warning.className = 'sp-iq__editor-warning';
      warning.textContent = message;
      this.root.querySelector('.sp-iq__main')?.prepend(warning);
    }
    buildSteps() {
      const seenQuestions = new Set();
      for (const element of this.root.querySelectorAll('[data-sp-iq-step]')) {
        const key = clean(element.dataset.spIqKey);
        if (!key || seenQuestions.has(key)) { this.warnings.push(`Question key is empty or repeated: ${key}`); element.hidden = true; continue; }
        seenQuestions.add(key);
        const answers = [];
        const seenAnswers = new Set();
        for (const el of element.querySelectorAll('[data-sp-iq-answer]')) {
          const answerKey = clean(el.dataset.spIqAnswerKey);
          const input = el.querySelector('input');
          if (!answerKey || seenAnswers.has(answerKey) || !input) { this.warnings.push(`Invalid answer key for question ${key}`); el.hidden = true; continue; }
          seenAnswers.add(answerKey);
          answers.push({ el, input, key: answerKey, results: readKeys(el.dataset.spIqResultKeys), weight: Math.max(0, Number(el.dataset.spIqWeight) || 0) });
        }
        if (!answers.length) { this.warnings.push(`No valid answers for ${key}`); element.hidden = true; continue; }
        this.steps.push({ element, key, answers, multiple: element.dataset.spIqKind === 'multiple', required: element.dataset.spIqRequired === 'true', max: Math.max(0,Number(element.dataset.spIqMax) || 0) });
      }
      if (this.warnings.length && this.root.dataset.spIqPreview === 'true') this.showWarning(this.warnings.join(' · '));
    }
    attach() {
      this.listen(this.form, 'submit', event => event.preventDefault());
      this.listen(this.form, 'change', event => {
        const input = event.target.closest('input[type="radio"],input[type="checkbox"]');
        if (!input) return;
        const step = this.steps[this.index];
        if (!step || !step.answers.some(answer => answer.input === input)) return;
        clearTimeout(this.timeout);
        if (step.multiple && step.max) {
          const checked = step.answers.filter(answer => answer.input.checked);
          if (checked.length > step.max) { input.checked = false; this.syncAnswers(); this.showError(format(this.root.dataset.spIqMaxMessage || 'Choose up to {max} answers.',{max:step.max})); return; }
        }
        this.hideError();
        this.syncAnswers();
        this.save();
        if (!step.multiple && this.root.dataset.spIqAuto === 'true') {
          const ms = reducedMotion() ? 0 : Math.min(1200,Math.max(0,Number(this.root.dataset.spIqDelay) || 0));
          this.timeout = setTimeout(() => this.forward(), ms);
        }
      });
      this.listen(this.next, 'click', () => this.forward());
      this.listen(this.back, 'click', () => this.backward());
      this.listen(this.restart, 'click', () => this.reset());
    }
    announce(text) { if (this.live) this.live.textContent = text; }
    showError(text) { if (this.error) { this.error.textContent = text; this.error.hidden = false; this.error.focus?.(); } this.announce(text); }
    hideError() { if (this.error) this.error.hidden = true; }
    syncAnswers() {
      this.steps.forEach(step => step.answers.forEach(answer => {
        answer.el.classList.toggle('sp-iq__answer--selected', Boolean(answer.input.checked));
      }));
    }
    selected(step) { return step.answers.filter(answer => answer.input.checked); }
    forward() {
      clearTimeout(this.timeout);
      const step = this.steps[this.index];
      if (!step) return;
      if ((step.required || this.root.dataset.spIqRequire === 'true') && !this.selected(step).length) {
        this.showError(this.root.dataset.spIqValidationLabel || 'Please choose an answer before continuing.');
        return;
      }
      this.hideError();
      if (this.index === this.steps.length - 1) this.finish();
      else { this.index += 1; this.render(true); this.save(); }
    }
    backward() {
      clearTimeout(this.timeout);
      if (this.onResult) { this.onResult = false; this.index = this.steps.length - 1; this.render(true); }
      else if (this.index > 0) { this.index -= 1; this.render(true); }
      this.save();
    }
    drawProgress(percent) {
      if (this.progress) this.progress.setAttribute('aria-valuenow', String(percent));
      if (this.progressBar) this.progressBar.style.width = `${percent}%`;
    }
    render(focus) {
      this.onResult = false;
      this.resultZone.hidden = true;
      if (this.form) this.form.hidden = false;
      this.steps.forEach((step, i) => { step.element.hidden = this.index !== i; });
      const current = this.steps[this.index];
      this.syncAnswers();
      this.root.querySelectorAll('[data-sp-iq-nav-key]').forEach(item => {
        const active = item.dataset.spIqNavKey === current.key;
        item.classList.toggle('sp-iq__sidebar-item--active', active);
        if (active) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      });
      const count = this.index + 1;
      if (this.counter) this.counter.textContent = format(this.root.dataset.spIqCounterFormat || 'Question {current} of {total}',{current:count,total:this.steps.length});
      this.drawProgress(Math.round(count / this.steps.length * 100));
      if (this.back) this.back.disabled = count === 1;
      if (this.next) this.next.textContent = count === this.steps.length ? (this.root.dataset.spIqFinishLabel || 'View my result') : (this.root.dataset.spIqContinueLabel || 'Continue →');
      this.hideError();
      if (focus) current.element.querySelector('[data-sp-iq-focus]')?.focus({preventScroll:true});
      this.announce(format(this.root.dataset.spIqStepMessage || 'Question {current} of {total}: {title}',{current:count,total:this.steps.length,title:current.element.querySelector('.sp-iq__legend')?.textContent || ''}));
    }
    getWinner() {
      const candidates = this.results.map((node, index) => ({ node, index, key: clean(node.dataset.spIqResultKey), tags:readKeys(node.dataset.spIqResultTags), min:Math.max(0,Number(node.dataset.spIqMinScore) || 0), fallback:node.dataset.spIqFallback === 'true', score:0 }));
      const available = candidates.filter(item => item.key);
      for (const step of this.steps) for (const answer of this.selected(step)) {
        for (const candidate of available) if (answer.results.some(key => key === candidate.key || candidate.tags.includes(key))) candidate.score += answer.weight;
      }
      const matching = available.filter(candidate => candidate.score > 0 && candidate.score >= candidate.min).sort((a,b) => b.score-a.score || a.index-b.index);
      return matching[0]?.node || available.find(candidate => candidate.fallback)?.node || null;
    }
    finish() {
      clearTimeout(this.timeout);
      this.onResult = true;
      this.form.hidden = true;
      this.resultZone.hidden = false;
      const winner = this.getWinner();
      for (const item of this.results) item.classList.toggle('sp-iq__result--active', winner === item);
      if (this.empty) this.empty.hidden = Boolean(winner);
      if (this.counter) this.counter.textContent = '';
      this.drawProgress(100);
      this.save();
      this.resultZone.querySelector('[data-sp-iq-result-focus]')?.focus({preventScroll:true});
      this.announce(winner ? format(this.root.dataset.spIqResultMessage || 'Your recommendation: {title}',{title:winner.querySelector('.sp-iq__result-title')?.textContent || ''}) : (this.root.dataset.spIqEmptyMessage || 'Your results are ready.'));
    }
    reset() {
      clearTimeout(this.timeout);
      this.steps.forEach(step => step.answers.forEach(answer => answer.input.checked = false));
      this.index = 0;
      this.onResult = false;
      if (this.root.dataset.spIqRemember === 'true') { try { sessionStorage.removeItem(this.storageKey); } catch (_) {} }
      this.syncAnswers();
      this.render(true);
    }
    save() {
      if (this.root.dataset.spIqRemember !== 'true') return;
      const selected = Object.fromEntries(this.steps.map(step => [step.key,this.selected(step).map(answer => answer.key)]));
      try { sessionStorage.setItem(this.storageKey,JSON.stringify({index:this.index,onResult:this.onResult,selected})); } catch (_) {}
    }
    restore() {
      if (this.root.dataset.spIqRemember !== 'true') return;
      try {
        const saved = JSON.parse(sessionStorage.getItem(this.storageKey) || 'null');
        if (!saved || !saved.selected || typeof saved.selected !== 'object') return;
        this.steps.forEach(step => {
          const old = Array.isArray(saved.selected[step.key]) ? saved.selected[step.key] : [];
          let used = 0;
          for (const answer of step.answers) {
            const match = old.includes(answer.key);
            const allowed = (!step.max || used < step.max) && (step.multiple || used < 1);
            answer.input.checked = Boolean(match && allowed);
            if (answer.input.checked) used++;
          }
        });
        this.index = Math.max(0,Math.min(this.steps.length - 1,Number(saved.index)||0));
        // Reopen the final step instead of silently displaying a stale result.
        this.onResult = false;
      } catch (_) { try { sessionStorage.removeItem(this.storageKey); } catch (_) {} }
    }
    selectBlock(target) {
      const question = target.closest('[data-sp-iq-step]');
      if (question) {
        const i = this.steps.findIndex(step => step.element === question);
        if (i >= 0) { clearTimeout(this.timeout); this.index = i; this.render(false); }
        return;
      }
      const result = target.closest('[data-sp-iq-result]');
      if (result && this.results.includes(result)) {
        clearTimeout(this.timeout);
        this.onResult = true;
        this.form.hidden = true;
        this.resultZone.hidden = false;
        this.results.forEach(item => item.classList.toggle('sp-iq__result--active',item === result));
        if (this.empty) this.empty.hidden = true;
      }
    }
    destroy() { clearTimeout(this.timeout); this.listeners.forEach(off => off()); this.listeners=[]; this.root.classList.remove('sp-iq--ready'); }
  }
  const init = scope => { const elements = scope.matches?.(selector) ? [scope] : Array.from(scope.querySelectorAll?.(selector) || []); elements.forEach(root => { if (!instances.has(root)) instances.set(root,new SpiderQuiz(root)); }); };
  const dispose = scope => { const roots = scope.matches?.(selector) ? [scope] : Array.from(scope.querySelectorAll?.(selector) || []); roots.forEach(root => { instances.get(root)?.destroy(); instances.delete(root); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>init(document),{once:true}); else init(document);
  document.addEventListener('shopify:section:load',event => init(event.target));
  document.addEventListener('shopify:section:unload',event => dispose(event.target));
  document.addEventListener('shopify:block:select',event => { const root = event.target.closest(selector); if (root) instances.get(root)?.selectBlock(event.target); });
})();
