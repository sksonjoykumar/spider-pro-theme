(() => {
  'use strict';

  class SpiderGiftCardPage {
    constructor(root) {
      this.root = root;
      this.copyButton = root.querySelector('[data-gift-card-copy]');
      this.copyLabel = root.querySelector('[data-gift-card-copy-label]');
      this.copyStatus = root.querySelector('[data-gift-card-copy-status]');
      this.code = root.querySelector('[data-gift-card-code]');
      this.printButton = root.querySelector('[data-gift-card-print]');
      this.qr = root.querySelector('[data-gift-card-qr]');
      this.copyResetTimer = 0;
      this.onCopy = this.onCopy.bind(this);
      this.onPrint = this.onPrint.bind(this);
      this.init();
    }

    init() {
      this.copyButton?.addEventListener('click', this.onCopy);
      this.printButton?.addEventListener('click', this.onPrint);
      this.initQr();
    }

    initQr() {
      if (!this.qr || !window.QRCode) return;
      const text = String(this.qr.dataset.qrText || '').trim();
      if (!text) return;

      this.qr.textContent = '';
      new window.QRCode(this.qr, {
        text,
        width: 144,
        height: 144,
        colorDark: '#000000',
        colorLight: '#ffffff'
      });
    }

    async onCopy() {
      const value = this.code?.textContent?.trim();
      if (!value || !this.copyButton) return;

      const originalLabel = this.copyLabel?.textContent || 'Copy code';
      let copied = false;

      try {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
          copied = true;
        }
      } catch (_) {
        copied = false;
      }

      if (!copied) copied = this.fallbackCopy(value);

      const message = copied ? 'Gift card code copied' : 'Select the gift card code and copy it manually.';
      if (this.copyStatus) this.copyStatus.textContent = message;
      if (copied && this.copyLabel) this.copyLabel.textContent = 'Copied!';

      window.clearTimeout(this.copyResetTimer);
      this.copyResetTimer = window.setTimeout(() => {
        if (this.copyLabel) this.copyLabel.textContent = originalLabel;
      }, 1800);
    }

    fallbackCopy(value) {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.inset = '-9999px auto auto -9999px';
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (_) {
        copied = false;
      }
      input.remove();
      return copied;
    }

    onPrint() {
      window.print();
    }

    destroy() {
      this.copyButton?.removeEventListener('click', this.onCopy);
      this.printButton?.removeEventListener('click', this.onPrint);
      window.clearTimeout(this.copyResetTimer);
    }
  }

  const init = () => {
    document.querySelectorAll('[data-gift-card-page]').forEach((root) => {
      if (!root.__spiderGiftCardPage) root.__spiderGiftCardPage = new SpiderGiftCardPage(root);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
