# Customization Guide

## Work on an unpublished theme

Back up the live theme and test changes on a development or unpublished theme.

## Global theme settings

- Open Shopify Admin → Online Store → Themes → Customize → Theme settings.
- Definitions are in `config/settings_schema.json`.
- Saved values are in `config/settings_data.json`.
- Shared CSS/JSON/class helpers are in `snippets/global-settings-*.liquid`.
- Shared color-scheme handling is in `snippets/sp-section-color-scheme.liquid`.

Do not rename setting IDs casually; saved merchant values may depend on them.

## Header and navigation

- Section: `sections/header.liquid`
- Announcement: `sections/announcement-bar.liquid`
- Snippets: `snippets/sp-header-*.liquid`
- Assets: `assets/sp-header.css`, `assets/sp-header.js`

Configure logo, menus, search, account, wishlist, and cart using available
Theme Editor controls. Test desktop and mobile navigation.

## Footer

- Section: `sections/footer.liquid`
- Blocks: `blocks/sp-premium-footer-*.liquid`
- Snippets: `snippets/sp-footer-*.liquid`
- Assets: `assets/sp-footer.css`, `assets/sp-footer.js`

Review block settings and supply merchant-owned imagery where required. Check
`ASSET-AUDIT.md` for reference artwork missing from the uploaded source.

## Product and collection pages

- Product templates: `templates/product*.json`
- Product section: `sections/main-product.liquid`
- Product hero: `sections/sp-product-hero.liquid`
- Collection templates: `templates/collection*.json`
- Collection section: `sections/main-collection.liquid`

Test variant selection, quantity, product media, filters, sorting, pagination,
recommendations, and cart actions after changing settings.

## Custom sections

Sections with the `sp-` prefix are Spider Pro section files. Add and configure
them through the Theme Editor where their schemas and enabled-on rules allow.
Do not create duplicate section files just to add a style if an existing
section already exposes a style setting.

## Typography, colors, and spacing

Use available theme settings and section controls. Check global design snippets
and CSS variables before adding overrides. Ensure generated `@font-face` rules
are inside a `<style>` element or a valid stylesheet; raw CSS must not render
as page text.

## Store-specific content

Review `config/settings_data.json` and section-group JSON for merchant-specific
text, menus, image selections, and store settings before sharing a repository
snapshot outside the authorized team.
