/* Spider Wholesale Inquiry Form: native Shopify contact submission, no fake success state. */
(() => {
  const init = (root = document) => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.sp-wholesale-inquiry__form').forEach((form) => {
      if (form.dataset.spWholesaleInquiryBound === 'true') return;
      form.dataset.spWholesaleInquiryBound = 'true';

      form.addEventListener('submit', (event) => {
        const button = form.querySelector('[data-sp-wholesale-submit]');
        if (!button) return;
        if (button.dataset.spSubmitting === 'true') {
          event.preventDefault();
          return;
        }
        if (!form.checkValidity()) return;

        button.dataset.spSubmitting = 'true';
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        const label = button.querySelector('[data-sp-submit-label]');
        if (label) label.textContent = 'Submitting…';
      });
    });
  };

  if (window.__spWholesaleInquiryInit) {
    window.__spWholesaleInquiryInit(document);
    return;
  }
  window.__spWholesaleInquiryInit = init;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document), { once: true });
  } else {
    init(document);
  }
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
