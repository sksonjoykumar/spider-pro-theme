# File Structure

## Uploaded source inventory

| Directory | Files | Purpose |
|---|---:|---|
| `assets/` | 159 | CSS and JavaScript theme assets |
| `blocks/` | 33 | Reusable Shopify theme block files |
| `config/` | 2 | Theme settings schema and saved settings data |
| `layout/` | 3 | Theme, password, and gift-card layouts |
| `locales/` | 11 | Storefront translations and schema locale |
| `sections/` | 111 | Liquid sections and section-group JSON files |
| `snippets/` | 228 | Reusable Liquid components |
| `templates/` | 36 | JSON and Liquid templates |
| **Total** | **583** | **Original Shopify theme source** |

## Layout files

- `layout/theme.liquid`
- `layout/password.liquid`
- `layout/gift_card.liquid`

## Templates

- `404.json`
- `article.json`
- `blog.json`
- `cart.json`
- `collection.default.json`
- `collection.filter.json`
- `collection.full-width.json`
- `collection.json`
- `collection.modern.json`
- `collection.sidebar.json`
- `gift_card.liquid`
- `index.json`
- `list-collections.json`
- `page.about.json`
- `page.compare.json`
- `page.contact.json`
- `page.faq.json`
- `page.json`
- `page.landing.json`
- `page.lookbook.json`
- `page.wishlist.json`
- `password.json`
- `product.default.json`
- `product.full-width.json`
- `product.json`
- `product.modern.json`
- `product.quick-view.json`
- `product.sticky-cart.json`
- `search.json`

## Section files

- `age-verification.liquid`
- `announcement-bar.liquid`
- `apps.liquid`
- `back-to-top.liquid`
- `cart-drawer.liquid`
- `collection-list.liquid`
- `collections-grid-tabs.liquid`
- `cookies.liquid`
- `custom-liquid.liquid`
- `exit-popup.liquid`
- `featured-collection.liquid`
- `footer-newsletter.liquid`
- `footer.liquid`
- `header.liquid`
- `hero-video.liquid`
- `main-404.liquid`
- `main-account.liquid`
- `main-activate-account.liquid`
- `main-addresses.liquid`
- `main-article.liquid`
- `main-blog.liquid`
- `main-cart.liquid`
- `main-collection.liquid`
- `main-contact.liquid`
- `main-list-collections.liquid`
- `main-login.liquid`
- `main-order.liquid`
- `main-page.liquid`
- `main-password.liquid`
- `main-product.liquid`
- `main-register.liquid`
- `main-reset-password.liquid`
- `main-search.liquid`
- `newsletter-popup.liquid`
- `predictive-search.liquid`
- `search-modal.liquid`
- `shop-protect.liquid`
- `snow-effect.liquid`
- `sp-before-after-slider.liquid`
- `sp-certifications-product-badges.liquid`
- `sp-collection-banner.liquid`
- `sp-collection-mosaic.liquid`
- `sp-collection-showcase.liquid`
- `sp-collection-spotlight.liquid`
- `sp-compare-product-data.liquid`
- `sp-countdown-campaign-banner.liquid`
- `sp-cta-banner.liquid`
- `sp-faq-accordion.liquid`
- `sp-feature-cards.liquid`
- `sp-featured-blog-posts.liquid`
- `sp-featured-product.liquid`
- `sp-gift-guide.liquid`
- `sp-hero-banner.liquid`
- `sp-image-with-features.liquid`
- `sp-interactive-quiz.liquid`
- `sp-logo-list.liquid`
- `sp-order-tracking.liquid`
- `sp-page-intro.liquid`
- `sp-product-bundle.liquid`
- `sp-product-carousel.liquid`
- `sp-product-comparison.liquid`
- `sp-product-grid.liquid`
- `sp-product-hero.liquid`
- `sp-product-hotspots.liquid`
- `sp-product-information-tabs.liquid`
- `sp-product-recommendations.liquid`
- `sp-product-registration-form.liquid`
- `sp-product-showcase.liquid`
- `sp-product-specifications-table.liquid`
- `sp-promotional-banner-cards.liquid`
- `sp-recently-purchased.liquid`
- `sp-recently-viewed-products.liquid`
- `sp-retail-locations.liquid`
- `sp-rv-card-07.liquid`
- `sp-rv-card-1.liquid`
- `sp-rv-card-10.liquid`
- `sp-rv-card-11.liquid`
- `sp-rv-card-12.liquid`
- `sp-rv-card-13.liquid`
- `sp-rv-card-14.liquid`
- `sp-rv-card-15.liquid`
- `sp-rv-card-16.liquid`
- `sp-rv-card-2.liquid`
- `sp-rv-card-3.liquid`
- `sp-rv-card-4.liquid`
- `sp-rv-card-5.liquid`
- `sp-rv-card-6.liquid`
- `sp-rv-card-7.liquid`
- `sp-rv-card-8.liquid`
- `sp-rv-card-9.liquid`
- `sp-rv-card-global.liquid`
- `sp-scrolling-marquee.liquid`
- `sp-search-modal-predictive.liquid`
- `sp-shoppable-video.liquid`
- `sp-size-guide-fit-finder.liquid`
- `sp-slideshow.liquid`
- `sp-social-gallery.liquid`
- `sp-split-hero.liquid`
- `sp-stats-highlights.liquid`
- `sp-story-with-image.liquid`
- `sp-testimonials-reviews.liquid`
- `sp-values-grid.liquid`
- `sp-video-testimonials.liquid`
- `sp-wholesale-b2b-cta.liquid`
- `sp-wholesale-inquiry-form.liquid`
- `spacer.liquid`
- `toolbar-mobile.liquid`
- `wishlist.liquid`

## Important configuration files

- `config/settings_schema.json` — theme metadata, global settings, and Theme
  Editor controls.
- `config/settings_data.json` — current theme settings and saved section data.
  Review for merchant-specific content before sharing with others.
- `sections/header-group.json` — header section group.
- `sections/footer-group.json` — footer section group.
- `sections/system-group.json` — system section group.

## Assets

The assets directory contains 82 CSS and 77 JavaScript files. The static scan
found all 159 present asset files referenced at least once. Four additional
local asset names are referenced but missing; see `ASSET-AUDIT.md`.
