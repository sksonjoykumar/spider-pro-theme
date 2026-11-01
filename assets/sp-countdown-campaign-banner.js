/* Spider Countdown Campaign Banner: no dependencies, isolated per section. */
(() => {
  'use strict';
  const instances = new WeakMap();
  const active = new Set();
  const field = (el, key) => el.dataset[key] || '';
  const flag = (el, key) => field(el, key) === 'true';
  // Strict calendar timestamp with an explicit timezone and no browser-local fallback.
  function parseISO(text) {
    const v = String(text || '').trim();
    const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?(Z|[+-]\d\d:\d\d)$/.exec(v);
    if (!m) return null;
    const [y, mo, d, hh, mm, ss] = m.slice(1, 7).map(Number);
    if (y < 100 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
    const tz = m[8];
    let offset = 0;
    if (tz !== 'Z') {
      const oh = Number(tz.slice(1, 3)), om = Number(tz.slice(4, 6));
      if (oh > 14 || om > 59 || (oh === 14 && om > 0)) return null;
      offset = (oh * 60 + om) * (tz[0] === '+' ? 1 : -1);
    }
    const pure = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
    if (pure.getUTCFullYear() !== y || pure.getUTCMonth() !== mo - 1 || pure.getUTCDate() !== d || pure.getUTCHours() !== hh || pure.getUTCMinutes() !== mm || pure.getUTCSeconds() !== ss) return null;
    const ms = Date.UTC(y, mo - 1, d, hh, mm, ss, Number((m[7] || '').padEnd(3,'0'))) - offset * 60000;
    return Number.isFinite(ms) ? ms : null;
  }
  const format = (n, zero) => (zero ? String(n).padStart(2, '0') : String(n));
  function parts(milliseconds, root) {
    let seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const days = Math.floor(seconds / 86400); seconds %= 86400;
    let hours = Math.floor(seconds / 3600); seconds %= 3600;
    let minutes = Math.floor(seconds / 60); seconds %= 60;
    // Days hidden? Fold the extra time into the next visible unit to remain truthful.
    if (!root.querySelector('[data-sp-unit="days"]')) hours += days * 24;
    if (!root.querySelector('[data-sp-unit="hours"]')) minutes += hours * 60;
    if (!root.querySelector('[data-sp-unit="minutes"]')) seconds += minutes * 60;
    return {days, hours, minutes, seconds};
  }
  class Countdown {
    constructor(root) {
      this.root = root; this.id = root.id; this.timeout = 0; this.state = null;
      this.editor = flag(root, 'spDesignMode'); this.deadline = parseISO(field(root, 'spDeadline'));
      this.start = field(root, 'spStart') ? parseISO(field(root, 'spStart')) : null;
      this.stop = false; this.handles = [];
      this.timer = root.querySelector('[data-sp-timer]');
      this.fallback = root.querySelector('[data-sp-clock-fallback]');
      this.warning = root.querySelector('[data-sp-warning]');
      this.speech = root.querySelector('[data-sp-clock-accessible]');
      this.visibility = () => { if (!document.hidden && !this.stop) this.refresh(); };
      document.addEventListener('visibilitychange', this.visibility);
      if (!flag(root,'spEnabled')) { root.classList.add('sp-campaign--ready'); if(this.fallback) this.fallback.hidden = true; return; }
      if ((this.deadline === null || (field(root, 'spStart') && this.start === null) || (this.start !== null && this.start >= this.deadline)) && !(this.editor && field(root,'spMode') === 'manual_preview')) {
        if (this.warning) this.warning.hidden = false;
        if (!this.editor) { root.hidden = true; }
        else this.setState('invalid');
        return;
      }
      this.refresh();
    }
    setText(selector, value) {
      const el = this.root.querySelector(selector);
      if (el) { el.textContent = value || ''; el.hidden = !value; }
    }
    setState(state) {
      const el = this.root; const changed = this.state !== state;
      if (!changed) return;
      this.state = state; el.dataset.spState = state; el.classList.add('sp-campaign--ready');
      let name = state === 'active' ? 'Active' : state === 'upcoming' ? 'Upcoming' : state === 'expired' ? 'Expired' : 'Upcoming';
      if (state === 'invalid') name = 'Upcoming';
      this.setText('[data-sp-copy="eyebrow"]', field(el,'spCopy'+name+'Eyebrow'));
      this.setText('[data-sp-copy="heading"]', state === 'invalid' ? field(el,'spCopyError') : field(el,'spCopy'+name+'Heading'));
      this.setText('[data-sp-copy="description"]', state === 'invalid' ? '' : field(el,'spCopy'+name+'Description'));
      this.setText('[data-sp-note-value]', state === 'active' ? field(el,'spTextActiveNote') : state === 'upcoming' ? field(el,'spTextBeforeNote') : field(el,'spTextExpiredNote'));
      this.setText('[data-sp-image-badge-heading]', state === 'active' ? field(el,'spCaptionActive') : state === 'upcoming' ? field(el,'spCaptionBefore') : field(el,'spCaptionExpired'));
      const badges = el.querySelectorAll('[data-sp-offer-only]');
      badges.forEach(node => { node.hidden = state !== 'active'; });
      const actions = el.querySelector('[data-sp-actions]');
      if (actions) actions.hidden = state === 'upcoming' || state === 'invalid';
      const expired = el.querySelector('[data-sp-expired-action]');
      if (expired) expired.hidden = state !== 'expired';
      if (state === 'expired' && field(el,'spExpiry') === 'hide_section') el.hidden = true;
      else if (state === 'upcoming' && field(el,'spBefore') === 'hide_section') el.hidden = true;
      else el.hidden = false;
      if (this.timer) this.timer.hidden = state !== 'active' && !(state === 'upcoming' && field(el,'spBefore') === 'count_to_start');
      if (this.fallback) this.fallback.hidden = true;
      if (this.speech && changed) {
        const target = state === 'upcoming' && this.start !== null ? this.start : this.deadline;
        const timestamp = target !== null ? new Date(target).toUTCString() : '';
        this.speech.textContent = state === 'active' ? `${field(el,'spAccessiblePrefix')}. Deadline: ${timestamp}` : state === 'upcoming' ? `Campaign starts ${timestamp}` : state === 'expired' ? 'Campaign ended' : '';
      }
      if (state === 'expired' && field(el, 'spExpiry') === 'hide_countdown') {
        if (this.timer) this.timer.hidden = true;
        // For this mode, retain original campaign body but remove active sales controls.
      }
    }
    render(milliseconds) {
      if (!this.timer) return;
      this.timer.hidden = false;
      const v = parts(milliseconds, this.root);
      const lead = flag(this.root,'spLeadingZero');
      for (const [name,value] of Object.entries(v)) {
        const target = this.root.querySelector(`[data-sp-value="${name}"]`);
        if (target) { const fresh = format(value, lead); if (target.textContent !== fresh) target.textContent = fresh; }
        const label = this.root.querySelector(`[data-sp-unit-label="${name}"]`);
        if (label) {
          const singular = field(this.root, ({days:'spDaysOne',hours:'spHoursOne',minutes:'spMinutesOne',seconds:'spSecondsOne'})[name]);
          const plural = field(this.root, ({days:'spDaysMany',hours:'spHoursMany',minutes:'spMinutesMany',seconds:'spSecondsMany'})[name]);
          label.textContent = value === 1 ? singular : plural;
        }
      }
      const day = this.root.querySelector('[data-sp-unit="days"]');
      if (day) day.hidden = flag(this.root,'spZeroDays') && v.days === 0;
    }
    refresh() {
      if (this.stop) return;
      clearTimeout(this.timeout); this.timeout = 0;
      if (this.editor && field(this.root,'spMode') === 'manual_preview') {
        this.setState('active');
        this.render(((Number(field(this.root,'spPreviewDays')) || 0)*86400 + (Number(field(this.root,'spPreviewHours')) || 0)*3600 + (Number(field(this.root,'spPreviewMinutes')) || 0)*60 + (Number(field(this.root,'spPreviewSeconds')) || 0))*1000);
        return;
      }
      if (this.deadline === null) return;
      const now = Date.now();
      if (this.start !== null && now < this.start) {
        this.setState('upcoming');
        if (field(this.root,'spBefore') === 'count_to_start') this.render(this.start - now);
        else if (this.timer) this.timer.hidden = true;
      } else if (now >= this.deadline) {
        this.setState('expired');
        if (flag(this.root,'spUpdate') && !this.editor) this.root.dispatchEvent(new CustomEvent('sp:campaign-expired', { bubbles: true }));
        return;
      } else {
        this.setState('active'); this.render(this.deadline - now);
      }
      const wait = Math.max(80, 1020 - (Date.now() % 1000));
      this.timeout = window.setTimeout(() => this.refresh(), wait);
    }
    destroy() { this.stop = true; clearTimeout(this.timeout); document.removeEventListener('visibilitychange', this.visibility); active.delete(this); instances.delete(this.root); }
  }
  function init(scope = document) {
    if (scope.matches?.('[data-sp-campaign]') && !instances.has(scope)) {
      const item = new Countdown(scope); instances.set(scope,item); active.add(item);
    }
    scope.querySelectorAll?.('[data-sp-campaign]').forEach(el => { if (!instances.has(el)) { const item = new Countdown(el); instances.set(el,item); active.add(item); } });
  }
  const boot = () => init(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  document.addEventListener('shopify:section:load',e => init(e.target));
  document.addEventListener('shopify:section:unload',e => { for (const instance of Array.from(active)) if (e.target.contains(instance.root)) instance.destroy(); });
  document.addEventListener('shopify:block:select',e => { const parent = e.target.closest('[data-sp-campaign]'); if (parent) parent.scrollIntoView({block:'nearest',behavior:'auto'}); });
})();
