(() => {
  'use strict';
  const rootSelector = '.sp-account-page';

  const setPasswordState = (button) => {
    const control = button.closest('.sp-account-field__control');
    const input = control?.querySelector('input');
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.setAttribute('aria-pressed', String(!showing));
    const showLabel = button.dataset.showLabel || 'Show password';
    const hideLabel = button.dataset.hideLabel || 'Hide password';
    button.setAttribute('aria-label', showing ? showLabel : hideLabel);
    const svg = button.querySelector('svg');
    if (svg) svg.classList.toggle('is-showing', !showing);
  };

  const populateProvinces = (countrySelect) => {
    const scope = countrySelect.closest('form') || countrySelect.closest('.sp-account-expand__body');
    const provinceSelect = scope?.querySelector('[data-province-select]');
    const provinceField = provinceSelect?.closest('[data-province-field]');
    if (!provinceSelect || !provinceField) return;
    const option = countrySelect.options[countrySelect.selectedIndex];
    let provinces = [];
    try { provinces = JSON.parse(option?.dataset?.provinces || '[]'); } catch (_) { provinces = []; }
    const current = provinceSelect.dataset.default || provinceSelect.value || '';
    provinceSelect.replaceChildren();
    provinces.forEach(([value, label]) => {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = label;
      if (String(value) === String(current)) item.selected = true;
      provinceSelect.append(item);
    });
    provinceField.hidden = provinces.length === 0;
    provinceSelect.disabled = provinces.length === 0;
  };

  const initAccount = (root) => {
    if (!root || root.__spAccountReady) return;
    root.__spAccountReady = true;

    root.addEventListener('click', (event) => {
      const passwordButton = event.target.closest('[data-password-toggle]');
      if (passwordButton) { event.preventDefault(); setPasswordState(passwordButton); return; }

      const openButton = event.target.closest('[data-details-open]');
      if (openButton) {
        const target = document.getElementById(openButton.dataset.detailsOpen);
        if (target?.tagName === 'DETAILS') {
          target.open = true;
          target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          target.querySelector('input,select,textarea,button')?.focus({ preventScroll: true });
        }
        return;
      }

      const closeButton = event.target.closest('[data-details-close]');
      if (closeButton) {
        const details = closeButton.closest('details');
        if (details) details.open = false;
      }
    });

    root.querySelectorAll('details').forEach((details) => {
      if (details.querySelector('.sp-account-alert--error')) details.open = true;
    });

    root.querySelectorAll('[data-country-select]').forEach((select) => {
      if (select.dataset.default) {
        const match = Array.from(select.options).find((option) => option.value === select.dataset.default || option.text === select.dataset.default);
        if (match) select.value = match.value;
      }
      populateProvinces(select);
      select.addEventListener('change', () => {
        const province = (select.closest('form') || root).querySelector('[data-province-select]');
        if (province) province.dataset.default = '';
        populateProvinces(select);
      });
    });
  };

  const initAll = (scope = document) => scope.querySelectorAll(rootSelector).forEach(initAccount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll()); else initAll();
  document.addEventListener('shopify:section:load', (event) => initAll(event.target));
})();
