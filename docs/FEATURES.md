# Feature Inventory

This inventory is based on source files present in the uploaded Spider Pro v1.0.0
archive. File presence confirms a component/section exists in the package; it
does not prove every configuration has passed runtime testing.

## Storefront shell and navigation

| Feature area | Source references |
|---|---|
| Header and navigation | `sections/header.liquid`, `snippets/sp-header-*.liquid`, `assets/sp-header.css`, `assets/sp-header.js` |
| Announcement bar | `sections/announcement-bar.liquid`, `snippets/sp-announcement-*.liquid`, `assets/sp-announcement-bar.*` |
| Premium footer | `sections/footer.liquid`, `blocks/sp-premium-footer-*.liquid`, `snippets/sp-footer-*.liquid`, `assets/sp-footer.*` |
| Mobile toolbar | `sections/toolbar-mobile.liquid`, `snippets/sp-toolbar-mobile-*.liquid`, `assets/sp-toolbar-mobile.*` |
| Back to top | `sections/back-to-top.liquid`, `assets/sp-back-to-top.*` |

## Product discovery and merchandising

| Feature area | Source references |
|---|---|
| Collection browsing, filters and sorting | `sections/main-collection.liquid`, `snippets/sp-collection-*.liquid`, `snippets/sp-active-filters.liquid`, `assets/sp-facets.js` |
| Collection layouts | `sections/sp-collection-banner.liquid`, `sp-collection-mosaic.liquid`, `sp-collection-showcase.liquid`, `sp-collection-spotlight.liquid` |
| Product grids and carousels | `sections/sp-product-grid.liquid`, `sp-product-carousel.liquid`, related `assets/sp-product-grid.css` and `assets/sp-product-carousel.*` |
| Featured products and collections | `sections/featured-collection.liquid`, `sections/sp-featured-product.liquid`, `snippets/sp-featured-*.liquid` |
| Product recommendations | `sections/sp-product-recommendations.liquid`, `assets/sp-product-recommendations.*` |
| Search and predictive search | `sections/main-search.liquid`, `predictive-search.liquid`, `search-modal.liquid`, `snippets/sp-search-*.liquid`, `assets/sp-search-modal.*` |

## Product page and shopping interactions

| Feature area | Source references |
|---|---|
| Product page and media | `sections/main-product.liquid`, `sections/sp-product-hero.liquid`, `snippets/product-media-gallery.liquid`, `assets/sp-main-product.css` |
| Quick View and Quick Add | `snippets/sp-product-quick-view.liquid`, `snippets/sp-product-quick-add.liquid`, `snippets/sp-product-commerce-ui.liquid` |
| Product comparison | `sections/sp-product-comparison.liquid`, `sections/sp-compare-product-data.liquid`, `snippets/sp-product-compare.liquid`, `snippets/sp-product-comparison-*.liquid`, `assets/sp-product-comparison.css` |
| Wishlist | `sections/wishlist.liquid`, `snippets/sp-wishlist-*.liquid`, `assets/sp-wishlist*.js`, `assets/sp-wishlist.css` |
| Sticky add to cart | `snippets/sp-sticky-add-to-cart.liquid`, `assets/sp-sticky-add-to-cart.*` |
| Product bundles | `sections/sp-product-bundle.liquid`, `snippets/sp-product-bundle-*.liquid`, `assets/sp-product-bundle.*` |
| Recently viewed/purchased | `sections/sp-recently-viewed-products.liquid`, `sections/sp-recently-purchased.liquid`, related snippets and assets |
| Product tabs and specifications | `sections/sp-product-information-tabs.liquid`, `sections/sp-product-specifications-table.liquid`, `snippets/sp-specification-*.liquid` |
| Size guide and fit finder | `sections/sp-size-guide-fit-finder.liquid`, `snippets/sp-fit-*.liquid`, `assets/sp-size-guide-fit-finder.*` |
| Product hotspots and badges | `sections/sp-product-hotspots.liquid`, `sections/sp-certifications-product-badges.liquid`, `snippets/sp-product-badges.liquid` |

## Cart, customer and store utilities

| Feature area | Source references |
|---|---|
| Cart drawer and cart page | `sections/cart-drawer.liquid`, `sections/main-cart.liquid`, `snippets/sp-cart-drawer-*.liquid`, `assets/sp-cart-drawer.*`, `assets/sp-cart-controller.js` |
| Cart shipping/progress tools | `snippets/sp-cart-shipping-calculator.liquid`, `snippets/sp-premium-cart-progress.liquid`, `assets/sp-cart-shipping-calculator.js` |
| Customer account templates | `sections/main-account.liquid`, `main-login.liquid`, `main-register.liquid`, `main-addresses.liquid`, `main-order.liquid`, `main-reset-password.liquid`, `main-activate-account.liquid` |
| Localization | `snippets/localization-form.liquid`, `snippets/sp-header-localization.liquid`, `blocks/sp-premium-footer-localization.liquid` |
| Age verification and cookies | `sections/age-verification.liquid`, `sections/cookies.liquid`, `snippets/sp-age-verification-*.liquid`, `assets/sp-age-verification.*`, `assets/sp-cookies.*` |
| Shop Protect | `sections/shop-protect.liquid`, `assets/sp-shop-protect.*` |

## Marketing, content and engagement

| Feature area | Source references |
|---|---|
| Campaign banners and countdowns | `sections/sp-countdown-campaign-banner.liquid`, `sp-promotional-banner-cards.liquid`, `sp-cta-banner.liquid` |
| Exit and newsletter popups | `sections/exit-popup.liquid`, `sections/newsletter-popup.liquid`, related popup snippets and assets |
| Gift guide | `sections/sp-gift-guide.liquid`, `snippets/sp-gift-guide-card.liquid`, `assets/sp-gift-guide.*` |
| Shoppable video and social gallery | `sections/sp-shoppable-video.liquid`, `sections/sp-social-gallery.liquid`, corresponding assets |
| Testimonials | `sections/sp-testimonials-reviews.liquid`, `sections/sp-video-testimonials.liquid`, testimonial snippets |
| Interactive quiz | `sections/sp-interactive-quiz.liquid`, `assets/sp-interactive-quiz.*` |
| Before/after slider | `sections/sp-before-after-slider.liquid`, related snippets and assets |
| Brand/editorial content | `sections/sp-feature-cards.liquid`, `sp-story-with-image.liquid`, `sp-image-with-features.liquid`, `sp-values-grid.liquid`, `sp-stats-highlights.liquid`, `sp-logo-list.liquid`, `sp-featured-blog-posts.liquid` |
| Wholesale inquiry | `sections/sp-wholesale-b2b-cta.liquid`, `sections/sp-wholesale-inquiry-form.liquid`, related snippets/assets |
| Order tracking and product registration | `sections/sp-order-tracking.liquid`, `sections/sp-product-registration-form.liquid`, corresponding assets |
| Retail locations | `sections/sp-retail-locations.liquid`, related snippets/assets |
| Slideshow and marquee | `sections/sp-slideshow.liquid`, `sections/sp-scrolling-marquee.liquid`, corresponding assets |

## Core Shopify templates

The archive includes 404, article, blog, cart, collection variants, customer
account templates, gift card, home page, list collections, password, product
variants, search, and custom page templates. See `FILE-STRUCTURE.md`.
