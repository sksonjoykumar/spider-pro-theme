/* Spider premium password page: native Shopify forms + safe countdown lifecycle. */
(() => {
  'use strict';
  if (window.__spPremiumPasswordBooted) return;
  window.__spPremiumPasswordBooted = true;

  class SpiderPasswordPage {
    constructor(root) {
      this.root = root;
      this.timer = null;
      this.click = this.click.bind(this);
      root.addEventListener('click', this.click);
      this.initCountdown();
      this.updateDate();
    }
    click(event) {
      const toggle = event.target.closest('[data-password-toggle]');
      if (!toggle || !this.root.contains(toggle)) return;
      const input = this.root.querySelector('[data-password-input]');
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggle.setAttribute('aria-pressed', String(!visible));
      const text = visible ? toggle.dataset.showLabel : toggle.dataset.hideLabel;
      toggle.setAttribute('aria-label', text);
      const node = toggle.querySelector('[data-password-toggle-text]');
      if (node) node.textContent = text;
      input.focus({preventScroll:true});
    }
    parseISO(value) {
      // Date must carry a Z or UTC offset; reject ambiguous device-local dates.
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(value || '')) return NaN;
      const date = Date.parse(value);
      return Number.isFinite(date) ? date : NaN;
    }
    updateDate() {
      this.root.querySelectorAll('[data-pw-launch-date]').forEach((node) => {
        if (node.dataset.override) {node.textContent = node.dataset.override; return;}
        const time = this.parseISO(node.dataset.launch);
        if (!Number.isFinite(time)) {node.textContent = 'To be announced'; return;}
        try {
          node.textContent = new Intl.DateTimeFormat('en-US', {
            weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',
            timeZone:node.dataset.timezone || 'UTC'
          }).format(new Date(time));
        } catch (_) {
          node.textContent = new Intl.DateTimeFormat('en-US', {
            month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'
          }).format(new Date(time)) + ' UTC';
        }
      });
    }
    initCountdown() {
      const container = this.root.querySelector('[data-pw-countdown]');
      if (!container) return;
      const timestamp = this.parseISO(container.dataset.launch);
      const items = ['days','hours','minutes','seconds'].map((unit) => container.querySelector(`[data-pw-count="${unit}"]`));
      const grid = container.querySelector('.sp-pw__count-grid');
      const finished = container.querySelector('[data-pw-countdown-finished]');
      const tick = () => {
        let remainder = timestamp - Date.now();
        if (!Number.isFinite(remainder) || remainder <= 0) {
          if (grid) grid.hidden = true;
          if (finished) finished.hidden = false;
          this.stopCountdown();
          return;
        }
        const days = Math.floor(remainder / 86400000); remainder %= 86400000;
        const hours = Math.floor(remainder / 3600000); remainder %= 3600000;
        const minutes = Math.floor(remainder / 60000); remainder %= 60000;
        const seconds = Math.floor(remainder / 1000);
        [days,hours,minutes,seconds].forEach((number,index) => {
          if (items[index]) items[index].textContent = String(number).padStart(2,'0');
        });
      };
      tick();
      if (Number.isFinite(timestamp) && timestamp > Date.now()) this.timer = window.setInterval(tick, 1000);
    }
    stopCountdown() {if (this.timer !== null) {window.clearInterval(this.timer);this.timer = null;}}
    destroy() {this.stopCountdown();this.root.removeEventListener('click',this.click);}
  }
  const init = (scope) => {
    if (scope.matches?.('[data-main-password]') && !scope.__spPasswordInstance) scope.__spPasswordInstance = new SpiderPasswordPage(scope);
    scope.querySelectorAll?.('[data-main-password]').forEach((root) => {
      if (!root.__spPasswordInstance) root.__spPasswordInstance = new SpiderPasswordPage(root);
    });
  };
  const destroy = (scope) => {
    const roots = scope.matches?.('[data-main-password]') ? [scope] : Array.from(scope.querySelectorAll?.('[data-main-password]') || []);
    roots.forEach((root) => {root.__spPasswordInstance?.destroy();delete root.__spPasswordInstance;});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>init(document),{once:true});
  else init(document);
  document.addEventListener('shopify:section:load',(event)=>init(event.target));
  document.addEventListener('shopify:section:unload',(event)=>destroy(event.target));
})();
