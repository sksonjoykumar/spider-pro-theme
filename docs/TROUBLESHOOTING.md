# Troubleshooting

## Theme upload fails

- Confirm the ZIP contains Shopify theme directories at its root.
- Do not upload the GitHub repository archive; use the Shopify-theme-only ZIP.
- Confirm `assets/`, `blocks/`, `config/`, `layout/`, `locales/`, `sections/`,
  `snippets/`, and `templates/` are present.
- Run `shopify theme check` and review Shopify's upload error.

## Liquid render/include error

- Confirm the referenced snippet exists in `snippets/`.
- Check spelling of the `{% render %}` target and named arguments.
- Search the whole repository before renaming a snippet.

## Missing image or asset

- Check exact filename and capitalization under `assets/`.
- Review `docs/ASSET-AUDIT.md`; four local asset references are missing from the
  supplied v1.0.0 archive.
- Restore approved source artwork or configure a custom image/disable the
  reference-image setting where appropriate.

## Theme Editor setting missing

- Validate the section's `{% schema %}` JSON.
- Check setting type, ID, options, and default.
- Review `enabled_on`, `disabled_on`, and section-group placement.
- Avoid changing setting IDs without a migration plan.

## Cart drawer issue

- Inspect browser console and network errors.
- Check `assets/sp-cart-controller.js`, `assets/sp-cart-drawer.js`, and
  `snippets/sp-cart-drawer-*.liquid`.
- Test add, remove, quantity update, shipping, discount, and checkout handoff.
- Isolate third-party app conflicts.

## Product variant or Quick View issue

- Check product form and variant-picker snippets.
- Verify variant IDs, option availability, and product media.
- Test single-variant, multi-variant, unavailable, and media-linked variants.
- Inspect `assets/sp-product-form.js`, `assets/sp-product-commerce.js`,
  `assets/sp-product-gallery.js`, and Quick View snippets.

## CSS or font code appears as visible page text

- Inspect rendered HTML around font declarations.
- Ensure generated `@font-face` CSS is inside a `<style>` element or external CSS.
- Check global typography snippets and custom Liquid settings.

## JavaScript errors

- Find the first browser-console error.
- Verify referenced asset filenames and load order.
- Check that feature initialization handles missing section elements.
- Test without third-party app scripts to isolate conflicts.

## Locale text missing

- Confirm the translation key exists in the default locale.
- Check all storefront locale files for key parity.
- Treat `en.default.schema.json` as schema translation data, not a storefront
  locale file.
