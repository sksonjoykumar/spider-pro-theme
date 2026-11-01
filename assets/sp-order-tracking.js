(() => {
  if (window.__spOrderTrackingScriptLoaded) return;
  window.__spOrderTrackingScriptLoaded = true;

  const ROOT_SELECTOR = '[data-sp-order-tracking]';
  const STATUS_STEPS = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  const STATUS_ALIASES = {
    placed: ['placed', 'order placed', 'created', 'confirmed', 'processing'],
    packed: ['packed', 'packing', 'prepared', 'ready to ship'],
    shipped: ['shipped', 'in transit', 'in_transit', 'transit', 'picked up', 'dispatched', 'on the way'],
    out_for_delivery: ['out for delivery', 'out_for_delivery', 'delivery today'],
    delivered: ['delivered', 'complete', 'completed'],
  };

  function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  }

  function text(value, fallback = '—') {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'number') return String(value);
    return String(value);
  }

  function setField(root, key, value, fallback = '—') {
    const node = root.querySelector(`[data-sp-field="${key}"]`);
    if (node) node.textContent = text(value, fallback);
  }

  function statusIndex(status) {
    const normalized = normalize(status);
    for (let index = STATUS_STEPS.length - 1; index >= 0; index -= 1) {
      if (STATUS_ALIASES[STATUS_STEPS[index]].some((alias) => normalized === normalize(alias) || normalized.includes(normalize(alias)))) {
        return index;
      }
    }
    return -1;
  }

  function findTimelineDate(timeline, key, index) {
    if (!Array.isArray(timeline)) return '';
    const aliases = [key, key.replace(/_/g, ' ')];
    const match = timeline.find((item) => {
      const itemKey = normalize(item?.key || item?.status || item?.label);
      return aliases.some((alias) => itemKey === normalize(alias));
    }) || timeline[index];
    return match ? (match.date || match.timestamp || match.completedAt || '') : '';
  }

  function updateTimeline(root, order) {
    const currentIndex = statusIndex(order.status);
    const timeline = Array.isArray(order.timeline) ? order.timeline : [];
    root.querySelectorAll('[data-sp-step]').forEach((step, index) => {
      const key = step.getAttribute('data-sp-step');
      const dateNode = step.querySelector('[data-sp-step-date]');
      step.classList.toggle('is-complete', currentIndex >= 0 && index <= currentIndex);
      step.classList.toggle('is-current', currentIndex === index);
      if (dateNode) {
        const date = findTimelineDate(timeline, key, index);
        if (date) dateNode.textContent = text(date);
        else if (index === 0 && order.orderDate) dateNode.textContent = text(order.orderDate);
        else if (index <= currentIndex && currentIndex >= 0) dateNode.textContent = 'Complete';
        else dateNode.textContent = 'Pending';
      }
    });
  }

  function getOrderPayload(data) {
    if (!data || typeof data !== 'object') throw new Error('The tracking service returned an invalid response.');
    if (data.success === false || data.ok === false) throw new Error(text(data.message, 'No matching tracking details were found.'));
    const order = data.order && typeof data.order === 'object' ? data.order : data;
    const hasOrderIdentifier = Boolean(order.orderNumber || order.order_number || order.name || order.id);
    if (!hasOrderIdentifier) throw new Error(text(data.message, 'No matching tracking details were found.'));
    return {
      orderNumber: order.orderNumber || order.order_number || order.name || order.id,
      orderDate: order.orderDate || order.order_date || order.placedAt || order.createdAt || '',
      itemCount: order.itemCount ?? order.item_count ?? order.totalQuantity ?? '',
      total: order.total || order.totalPrice || order.total_price || '',
      status: order.status || order.fulfillmentStatus || order.fulfillment_status || 'Tracking update',
      estimatedDelivery: order.estimatedDelivery || order.estimated_delivery || order.deliveryWindow || '',
      carrier: order.carrier || order.shippingCarrier || order.shipping_carrier || '',
      currentLocation: order.currentLocation || order.current_location || order.location || '',
      locationNote: order.locationNote || order.location_note || order.lastEvent || order.last_event || '',
      trackingNumber: order.trackingNumber || order.tracking_number || order.trackingCode || order.tracking_code || '',
      timeline: order.timeline || order.events || [],
    };
  }

  function showFeedback(root, message, type) {
    const feedback = root.querySelector('[data-sp-feedback]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.remove('is-error', 'is-success');
    if (type) feedback.classList.add(`is-${type}`);
    feedback.hidden = false;
  }

  function setBusy(form, busy, defaultLabel) {
    const button = form.querySelector('[data-sp-submit]');
    const label = form.querySelector('[data-sp-submit-label]');
    if (!button) return;
    button.disabled = busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (label) label.textContent = busy ? 'Finding order…' : defaultLabel;
  }

  function renderOrder(root, order) {
    setField(root, 'orderNumber', order.orderNumber ? (String(order.orderNumber).startsWith('#') ? order.orderNumber : `#${order.orderNumber}`) : '—');
    setField(root, 'orderDate', order.orderDate ? `Placed on ${order.orderDate}` : 'Order date unavailable');
    const itemCountText = order.itemCount === '' || order.itemCount === null || order.itemCount === undefined
      ? 'Item count unavailable'
      : (/^\d+$/.test(String(order.itemCount).trim())
        ? `${order.itemCount} ${Number(order.itemCount) === 1 ? 'item' : 'items'}`
        : String(order.itemCount));
    setField(root, 'itemCount', itemCountText);
    setField(root, 'total', order.total || 'Total unavailable');
    setField(root, 'statusText', order.status || 'Status unavailable');
    setField(root, 'estimatedDelivery', order.estimatedDelivery || 'Not available yet');
    setField(root, 'carrier', order.carrier || 'Not available yet');
    setField(root, 'currentLocation', order.currentLocation || 'Location unavailable');
    setField(root, 'locationNote', order.locationNote || 'No recent location update');
    setField(root, 'trackingNumber', order.trackingNumber || 'Not available yet');
    updateTimeline(root, order);
    const copyButton = root.querySelector('[data-sp-copy]');
    if (copyButton) {
      copyButton.disabled = !order.trackingNumber;
      copyButton.setAttribute('aria-label', order.trackingNumber ? 'Copy tracking number' : 'Tracking number unavailable');
    }
    const emptyState = root.querySelector('[data-sp-empty-state]');
    const resultView = root.querySelector('[data-sp-result-view]');
    if (emptyState) emptyState.hidden = true;
    if (resultView) resultView.hidden = false;
    root.setAttribute('data-sp-has-result', 'true');
  }

  async function requestTracking(root, form) {
    if (form.dataset.spRequesting === 'true') return;
    const endpoint = (root.getAttribute('data-sp-tracking-endpoint') || '').trim();
    const endpointMissingMessage = root.getAttribute('data-sp-endpoint-missing') || 'Order tracking is not connected yet. Please contact support.';
    const genericErrorMessage = root.getAttribute('data-sp-request-error') || 'We could not retrieve tracking details. Please check your information and try again.';
    if (!endpoint) {
      showFeedback(root, endpointMissingMessage, 'error');
      return;
    }

    const orderNumberInput = form.querySelector('[data-sp-order-number]');
    const emailInput = form.querySelector('[data-sp-order-email]');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    let endpointUrl;
    try {
      endpointUrl = new URL(endpoint, window.location.origin);
      if (endpointUrl.origin !== window.location.origin && endpointUrl.protocol !== 'https:') {
        throw new Error('External tracking endpoints must use HTTPS.');
      }
    } catch (error) {
      showFeedback(root, error.message || 'The tracking endpoint is not a valid URL.', 'error');
      return;
    }

    form.dataset.spRequesting = 'true';
    const emptyState = root.querySelector('[data-sp-empty-state]');
    const resultView = root.querySelector('[data-sp-result-view]');
    if (emptyState) emptyState.hidden = false;
    if (resultView) resultView.hidden = true;
    root.removeAttribute('data-sp-has-result');
    setBusy(form, true, form.querySelector('[data-sp-submit-label]')?.textContent || 'Track order');
    const defaultLabel = form.getAttribute('data-sp-default-label') || 'Track order';
    const feedback = root.querySelector('[data-sp-feedback]');
    if (feedback) feedback.hidden = true;

    try {
      const response = await fetch(endpointUrl.toString(), {
        method: 'POST',
        credentials: endpointUrl.origin === window.location.origin ? 'same-origin' : 'omit',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumberInput.value.trim(),
          email: emailInput.value.trim(),
        }),
      });
      let payload;
      try { payload = await response.json(); } catch (_) { throw new Error('The tracking service did not return valid JSON.'); }
      if (!response.ok) {
        const message = payload && (payload.message || payload.error);
        throw new Error(text(message, genericErrorMessage));
      }
      const order = getOrderPayload(payload);
      renderOrder(root, order);
      showFeedback(root, 'Tracking details loaded.', 'success');
    } catch (error) {
      showFeedback(root, error && error.message ? error.message : genericErrorMessage, 'error');
    } finally {
      form.dataset.spRequesting = 'false';
      setBusy(form, false, defaultLabel);
    }
  }

  async function copyTrackingNumber(root, button) {
    const trackingNode = root.querySelector('[data-sp-field="trackingNumber"]');
    const trackingNumber = trackingNode ? trackingNode.textContent.trim() : '';
    if (!trackingNumber || trackingNumber === '—' || trackingNumber === 'Not available yet') return;
    const originalLabel = button.getAttribute('aria-label') || 'Copy tracking number';
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(trackingNumber);
      } else {
        const helper = document.createElement('textarea');
        helper.value = trackingNumber;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand('copy');
        helper.remove();
        if (!copied) throw new Error('Copy failed');
      }
      button.setAttribute('aria-label', 'Tracking number copied');
      button.setAttribute('title', 'Copied');
      showFeedback(root, 'Tracking number copied.', 'success');
      window.setTimeout(() => {
        button.setAttribute('aria-label', originalLabel);
        button.setAttribute('title', 'Copy tracking number');
      }, 1800);
    } catch (_) {
      showFeedback(root, 'Unable to copy automatically. Please select and copy the tracking number.', 'error');
    }
  }

  function init(root) {
    if (root.dataset.spTrackingInitialized === 'true') return;
    root.dataset.spTrackingInitialized = 'true';
    const form = root.querySelector('[data-sp-tracking-form]');
    if (!form) return;
    const submitLabel = form.querySelector('[data-sp-submit-label]');
    form.setAttribute('data-sp-default-label', submitLabel ? submitLabel.textContent.trim() : 'Track order');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      requestTracking(root, form);
    });
    const copyButton = root.querySelector('[data-sp-copy]');
    if (copyButton) copyButton.addEventListener('click', () => copyTrackingNumber(root, copyButton));
  }

  function initAll(scope = document) {
    if (scope.matches && scope.matches(ROOT_SELECTOR)) init(scope);
    if (scope.querySelectorAll) scope.querySelectorAll(ROOT_SELECTOR).forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll());
  } else {
    initAll();
  }
  document.addEventListener('shopify:section:load', (event) => initAll(event.target));
  document.addEventListener('shopify:section:unload', (event) => {
    const target = event.target;
    if (target.matches?.(ROOT_SELECTOR)) delete target.dataset.spTrackingInitialized;
    target.querySelectorAll?.(ROOT_SELECTOR).forEach((root) => { delete root.dataset.spTrackingInitialized; });
  });
})();
