# Asset Audit — Spider Pro v1.0.0

## Method

Liquid, JSON, CSS, and JavaScript source was scanned for local `asset_url`
references. Those names were compared with files present in `assets/`. This is
a static scan; dynamic references and app-provided assets may require manual
review.

## Summary

- Existing files in `assets/`: 159.
- Existing assets referenced by the scan: 159.
- Existing assets with no static reference found: 0.
- Missing local asset references: 4.
- No assets were deleted or renamed during repository preparation.

## Missing references

| Missing asset | Source | Condition / observation |
|---|---|---|
| `sp-password-reference-logo.png` | `sections/main-password.liquid` | Used when no configured store/password logo is available and `show_reference_logo` is enabled; this setting defaults to true. |
| `sp-footer-headphones.webp` | `blocks/sp-premium-footer-newsletter.liquid` | Used when newsletter artwork is enabled and no custom `bg_image` is selected; `show_image` defaults to true. |
| `sp-404-box-artwork.webp` | `sections/main-404.liquid` | Used when the 404 illustration is enabled and no custom image is selected; `show_illustration` defaults to true. |
| `sp-newsletter-popup-editorial.jpg` | `snippets/sp-newsletter-popup-image.liquid` | Used when the popup image is enabled, no custom image is selected, and `use_reference_image` is true. |

## Resolution status

The original artwork was not present in the uploaded archive. This preparation
does not fabricate replacement images or change the original Liquid asset
references. Before release, either add the approved original files using the
exact names above or make and test an owner-approved fallback/default-setting
change in a separate code update.

## Store-specific image references

No `shopify://shop_images/` references were found in scanned JSON/Liquid files.

## Unused assets

All 159 current asset files were referenced by the static scan. No asset
deletion is recommended. Dynamic references should still be reviewed before
future cleanup.
