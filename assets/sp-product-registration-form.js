/* Spider Product Registration Form — Shopify contact-form enhancement. */
(function () {
  'use strict';

  function setupRegistration(root) {
    if (!root || root.dataset.spPrInitialized === 'true') return;
    root.dataset.spPrInitialized = 'true';

    var form = root.querySelector('.sp-product-registration__form');
    if (!form) return;

    var dateInput = form.querySelector('[data-registration-date]');
    var dateWrap = form.querySelector('[data-registration-date-wrap]');
    var submitButton = form.querySelector('[data-registration-submit]');
    var submitLabel = form.querySelector('[data-registration-submit-label]');
    var fullNameField = form.querySelector('[data-registration-full-name]');
    var summaryField = form.querySelector('[data-registration-summary]');

    function updateDatePlaceholder() {
      if (!dateInput || !dateWrap) return;
      dateWrap.dataset.hasValue = dateInput.value ? 'true' : 'false';
    }

    if (dateInput && dateWrap) {
      updateDatePlaceholder();
      dateInput.addEventListener('input', updateDatePlaceholder);
      dateInput.addEventListener('change', updateDatePlaceholder);
      dateInput.addEventListener('focus', updateDatePlaceholder);
      dateInput.addEventListener('blur', updateDatePlaceholder);
    }

    form.addEventListener('submit', function () {
      var firstName = form.querySelector('[data-registration-first-name]');
      var lastName = form.querySelector('[data-registration-last-name]');
      var email = form.querySelector('[data-registration-email]');
      var phone = form.querySelector('[data-registration-phone]');
      var product = form.querySelector('[data-registration-product]');
      var model = form.querySelector('[data-registration-model]');
      var serial = form.querySelector('[data-registration-serial]');
      var place = form.querySelector('[data-registration-place]');
      var additional = form.querySelector('[data-registration-additional]');
      var value = function (field) { return field && field.value ? field.value.trim() : ''; };
      var fullName = [value(firstName), value(lastName)].filter(Boolean).join(' ');

      if (fullNameField) fullNameField.value = fullName;
      if (summaryField) {
        var lines = [
          'Product registration request',
          'First name: ' + value(firstName),
          'Last name: ' + value(lastName),
          'Email address: ' + value(email),
          'Phone number: ' + value(phone),
          'Product name: ' + value(product),
          'Model number: ' + value(model),
          'Serial number: ' + value(serial),
          'Date of purchase: ' + value(dateInput),
          'Place of purchase: ' + value(place)
        ];
        if (additional) lines.push('Additional information: ' + value(additional));
        summaryField.value = lines.join('\n');
      }

      if (submitButton && !submitButton.disabled) {
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        if (submitLabel && submitButton.dataset.loadingLabel) {
          submitLabel.textContent = submitButton.dataset.loadingLabel;
        }
      }
    });
  }

  function initialize(scope) {
    if (!scope) return;
    if (scope.matches && scope.matches('[data-sp-product-registration]')) setupRegistration(scope);
    if (scope.querySelectorAll) {
      scope.querySelectorAll('[data-sp-product-registration]').forEach(setupRegistration);
    }
  }

  initialize(document);
  document.addEventListener('shopify:section:load', function (event) {
    initialize(event.target);
  });
})();
