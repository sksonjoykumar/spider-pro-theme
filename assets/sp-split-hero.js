(function () {
  'use strict';

  var selector = '[data-sp-split-hero]';
  var instances = new WeakMap();

  function initialize(root) {
    if (!root || instances.has(root)) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-sp-slide]'));
    if (slides.length < 2) return;

    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-sp-dot]'));
    var previousButton = root.querySelector('[data-sp-prev]');
    var nextButton = root.querySelector('[data-sp-next]');
    var autoplay = root.getAttribute('data-autoplay') === 'true';
    var pauseOnHover = root.getAttribute('data-pause-hover') === 'true';
    var interval = Math.max(3000, parseInt(root.getAttribute('data-interval'), 10) || 5000);
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var activeIndex = slides.findIndex(function (slide) { return slide.classList.contains('is-active'); });
    var timer = null;
    var pointerPaused = false;
    var focusPaused = false;
    var listeners = [];

    if (activeIndex < 0) activeIndex = 0;

    function listen(element, eventName, handler) {
      if (!element) return;
      element.addEventListener(eventName, handler);
      listeners.push([element, eventName, handler]);
    }

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach(function (slide, slideIndex) {
        var active = slideIndex === activeIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach(function (dot, dotIndex) {
        var active = dotIndex === activeIndex;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function stopAutoplay() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function startAutoplay() {
      stopAutoplay();
      if (!autoplay || reducedMotion || pointerPaused || focusPaused || document.hidden) return;
      timer = window.setInterval(function () {
        showSlide(activeIndex + 1);
      }, interval);
    }

    function manualNavigation(index) {
      showSlide(index);
      startAutoplay();
    }

    listen(previousButton, 'click', function () { manualNavigation(activeIndex - 1); });
    listen(nextButton, 'click', function () { manualNavigation(activeIndex + 1); });
    dots.forEach(function (dot) {
      listen(dot, 'click', function () {
        var index = parseInt(dot.getAttribute('data-sp-slide-index'), 10);
        if (!Number.isNaN(index)) manualNavigation(index);
      });
    });

    if (pauseOnHover) {
      listen(root, 'mouseenter', function () { pointerPaused = true; stopAutoplay(); });
      listen(root, 'mouseleave', function () { pointerPaused = false; startAutoplay(); });
    }

    listen(root, 'focusin', function () { focusPaused = true; stopAutoplay(); });
    listen(root, 'focusout', function (event) {
      if (!root.contains(event.relatedTarget)) {
        focusPaused = false;
        startAutoplay();
      }
    });

    function onVisibilityChange() {
      if (document.hidden) stopAutoplay();
      else startAutoplay();
    }
    listen(document, 'visibilitychange', onVisibilityChange);

    showSlide(activeIndex);
    startAutoplay();

    instances.set(root, {
      cleanup: function () {
        stopAutoplay();
        listeners.forEach(function (item) {
          item[0].removeEventListener(item[1], item[2]);
        });
        instances.delete(root);
      }
    });
  }

  function initializeWithin(scope) {
    if (!scope) return;
    if (scope.matches && scope.matches(selector)) initialize(scope);
    if (scope.querySelectorAll) {
      Array.prototype.forEach.call(scope.querySelectorAll(selector), initialize);
    }
  }

  function cleanupWithin(scope) {
    if (!scope) return;
    var roots = [];
    if (scope.matches && scope.matches(selector)) roots.push(scope);
    if (scope.querySelectorAll) {
      roots = roots.concat(Array.prototype.slice.call(scope.querySelectorAll(selector)));
    }
    roots.forEach(function (root) {
      var instance = instances.get(root);
      if (instance) instance.cleanup();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initializeWithin(document); }, { once: true });
  } else {
    initializeWithin(document);
  }

  document.addEventListener('shopify:section:load', function (event) { initializeWithin(event.target); });
  document.addEventListener('shopify:section:unload', function (event) { cleanupWithin(event.target); });
})();
