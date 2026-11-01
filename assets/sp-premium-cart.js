/* Spider Premium Cart — page-only enhancements; native Spider controller remains cart source of truth. */
(() => {
  'use strict';
  const KEY = 'spider-premium-cart-saved-v1';
  const rootUrl = () => {
    const route = window.Shopify?.routes?.root || '/';
    return route.endsWith('/') ? route : `${route}/`;
  };
  const load = () => { try { const stored = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(stored) ? stored.filter(x => x && x.variantId) : []; } catch { return []; } };
  const persist = (records) => { localStorage.setItem(KEY, JSON.stringify(records)); };
  const main = () => document.querySelector('[data-main-cart].sp-premium-cart');
  let busy = false;
  let noteTimer = 0;

  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  };
  const report = (message) => {
    const region = document.querySelector('[data-premium-saved-error]');
    if (region) region.textContent = String(message || '');
    window.Spider?.announce?.(message);
  };

  const renderSaved = () => {
    const section = main();
    if (!section) return;
    const wrap = section.querySelector('[data-premium-saved-list]');
    if (!wrap) return;
    const list = wrap.querySelector('[data-premium-saved-items]');
    const records = load();
    if (!list) return;
    list.replaceChildren();
    wrap.hidden = records.length === 0;
    records.forEach((item) => {
      const row = el('div', 'sp-premium-cart__saved-item');
      if (item.image) {
        const image = el('img');
        image.src = item.image;
        image.alt = item.title || '';
        image.loading = 'lazy';
        row.appendChild(image);
      }
      const info = el('div', 'sp-premium-cart__saved-info');
      const link = el('a', '', item.title);
      link.href = item.url && item.url.startsWith('/') ? item.url : `${rootUrl()}products`;
      info.append(link, el('span', '', `Quantity: ${item.quantity}`));
      row.append(info);
      const actions = el('div', 'sp-premium-cart__saved-actions');
      const move = el('button', '', 'Move to cart');
      move.type = 'button';
      move.dataset.premiumRestore = item.id;
      const remove = el('button', '', 'Remove');
      remove.type = 'button';
      remove.dataset.premiumUnsave = item.id;
      actions.append(move, remove);
      row.append(actions);
      list.append(row);
    });
  };

  const enhance = () => {
    const section = main();
    if (!section) return;
    section.querySelectorAll('[data-premium-save]').forEach(btn => { btn.hidden = false; });
    const note = section.querySelector('[data-cart-note]');
    const counter = section.querySelector('[data-premium-note-count]');
    if (note && counter) counter.textContent = `${note.value.length}/${note.maxLength}`;
    renderSaved();
  };

  async function updateCart(endpoint, payload, source) {
    const controller = window.Spider?.cartController;
    const url = `${rootUrl()}cart/${endpoint}.js`;
    if (controller?.request) return controller.request(url, payload, { source });
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.description || data.message || 'Cart update failed');
    window.location.reload();
    return data;
  }

  async function saveItem(button) {
    if (busy) return;
    const data = button.dataset;
    const variantId = Number(data.variantId);
    const quantity = Number(data.quantity);
    if (!variantId || !quantity) return report('Unable to save this item.');
    let properties = {};
    try { properties = JSON.parse(data.properties || '{}'); } catch (_) { properties = {}; }
    if (Array.isArray(properties)) properties = Object.fromEntries(properties.filter(p => Array.isArray(p) && p.length >= 2));
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,9)}`,
      variantId, quantity,
      title: String(data.title || 'Saved product'),
      url: String(data.productUrl || ''),
      image: String(data.image || ''),
      properties,
      sellingPlan: data.sellingPlan ? Number(data.sellingPlan) : null
    };
    const saved = load();
    try { persist(saved); } catch { return report('Browser storage is unavailable; item not removed from cart.'); }
    busy = true;
    button.disabled = true;
    try {
      await updateCart('change', { id: data.itemKey, quantity: 0 }, 'save-for-later');
      persist([...saved, record]);
      enhance();
      report('Item saved for later on this browser.');
    } catch (err) { report(err.message || 'Could not save this item.'); }
    finally { busy = false; button.disabled = false; }
  }

  async function restoreItem(button) {
    if (busy) return;
    const saved = load();
    const record = saved.find(i => i.id === button.dataset.premiumRestore);
    if (!record) return;
    busy = true;
    button.disabled = true;
    try {
      const payload = { items: [{ id: record.variantId, quantity: record.quantity, properties: record.properties || {} }] };
      if (record.sellingPlan) payload.items[0].selling_plan = record.sellingPlan;
      const response = await fetch(`${rootUrl()}cart/add.js`, { method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.description || data.message || 'Product could not be added to the cart.');
      persist(saved.filter(x => x.id !== record.id));
      // Canonical refresh also synchronizes the cart drawer, header, summary and shipping progress.
      if (window.Spider?.cartController?.refresh) await window.Spider.cartController.refresh({ source:'save-for-later-restore' });
      else window.location.reload();
      enhance();
      report('Item moved to your cart.');
    } catch (err) { report(err.message || 'This item may be unavailable.'); }
    finally { busy = false; button.disabled = false; }
  }

  async function saveNote(section) {
    if (busy) return;
    const note = section.querySelector('[data-cart-note]');
    const message = section.querySelector('[data-premium-note-message]');
    if (!note) return;
    busy = true;
    if (message) message.textContent = 'Saving…';
    try {
      await updateCart('update', {note:note.value}, 'cart-note');
      const region = main()?.querySelector('[data-premium-note-message]');
      if (region) region.textContent = 'Note saved';
    } catch (err) {
      const region = main()?.querySelector('[data-premium-note-message]');
      if (region) region.textContent = err.message || 'Unable to save note';
    } finally { busy = false; }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !button.closest('[data-main-cart].sp-premium-cart')) return;
    if (button.matches('[data-premium-save]')) { event.preventDefault(); saveItem(button); }
    if (button.matches('[data-premium-restore]')) { event.preventDefault(); restoreItem(button); }
    if (button.matches('[data-premium-unsave]')) {
      const id = button.dataset.premiumUnsave;
      persist(load().filter(item => item.id !== id));
      renderSaved();
    }
    if (button.matches('[data-premium-note-save]')) { event.preventDefault(); clearTimeout(noteTimer); saveNote(button.closest('[data-main-cart]')); }
    if (button.matches('[data-premium-discount-toggle]')) {
      event.preventDefault();
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      const entry = button.closest('[data-cart-summary]').querySelector('[data-premium-discount-entry]');
      if (entry) entry.hidden = expanded;
      if (!expanded) entry?.querySelector('input')?.focus();
    }
    if (button.matches('[data-premium-discount-apply]')) {
      event.preventDefault();
      const code = button.closest('[data-premium-discount-entry]')?.querySelector('[data-premium-discount-code]')?.value.trim();
      if (!code) return;
      const root = rootUrl();
      // Shopify discount link handles validation. Do not claim a discount is applied before checkout.
      window.location.assign(`${root}discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(root+'cart')}`);
    }
  });
  document.addEventListener('input', event => {
    const note = event.target.closest('[data-main-cart].sp-premium-cart [data-cart-note]');
    if (!note) return;
    const count = note.closest('[data-main-cart]')?.querySelector('[data-premium-note-count]');
    if (count) count.textContent = `${note.value.length}/${note.maxLength}`;
  });
  document.addEventListener('focusout', event => {
    const note = event.target.closest('[data-main-cart].sp-premium-cart [data-cart-note]');
    const section = note?.closest('[data-main-cart]');
    if (!section || section.querySelector('[data-cart-form]')?.dataset.cartNoteAutosave !== 'true') return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      const current = main();
      if (current && current.querySelector('[data-cart-note]') === note) saveNote(current);
    }, 650);
  });

  document.addEventListener('spider:cart:updated', () => { queueMicrotask(enhance); });
  document.addEventListener('shopify:section:load', () => { queueMicrotask(enhance); });
  document.addEventListener('DOMContentLoaded', enhance, {once:true});
  if (document.readyState !== 'loading') enhance();
})();
