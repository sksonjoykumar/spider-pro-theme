# Theme Architecture

## Platform model

The supplied source is organized as a Shopify Online Store 2.0 theme. It uses
Liquid files, JSON templates, section groups, reusable snippets, theme blocks,
configuration JSON, locale JSON, CSS, and JavaScript assets.

## Rendering layers

1. Layouts provide the outer document shell: `layout/theme.liquid`,
   `layout/password.liquid`, and `layout/gift_card.liquid`.
2. Templates define page composition through JSON or Liquid template files.
3. Sections provide configurable page-level components and Theme Editor schemas.
4. Blocks provide reusable content units and nested section content.
5. Snippets provide reusable Liquid components.
6. Assets contain CSS and JavaScript for shared and feature-specific behavior.
7. Config contains theme settings schema and saved settings data.
8. Locales contain storefront translations and schema labels.

## Global settings

Important shared files include:
- `snippets/global-settings-css.liquid`
- `snippets/global-settings-json.liquid`
- `snippets/global-settings-classes.liquid`
- `snippets/sp-section-color-scheme.liquid`
- `assets/sp-theme-settings.js`
- `assets/sp-theme-editor.js`
- `assets/sp-base.css`
- `assets/sp-reset.css`
- `assets/sp-components.css`

Trace setting IDs and references before changing or deleting global settings.

## JavaScript and CSS

Assets are organized by feature areas such as header, cart drawer, product
commerce, comparison, wishlist, collection filtering, popups, and storefront
sections. Search all references before removing or renaming an asset.

## Dependencies

- Liquid `{% render %}` statements connect components to snippets.
- JSON templates and section-group files reference section types.
- Section schemas define Theme Editor settings, presets, and nested blocks.
- Shared snippets provide global styles, classes, and reusable UI.
- CSS and JavaScript assets implement presentation and interactions.

## Static audit observations

- 201 unique render/include snippet names were found; all resolved.
- 39 section types referenced by JSON templates/groups were found; all resolved.
- All 108 section Liquid schema blocks parsed successfully.
- All 51 JSON files parsed after removing the Shopify-generated comment at the
  top of `templates/page.contact.json`.
- Ten storefront locale files each contain 565 matching translation keys.
- No `shopify://shop_images/` references were found in scanned JSON/Liquid files.
