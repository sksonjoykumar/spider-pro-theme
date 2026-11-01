# Contributing to Spider Pro

Spider Pro is proprietary commercial theme software. Repository access is
limited to the owner and explicitly authorized collaborators.

## Before changing code

1. Confirm authorization to access and modify this private repository.
2. Create a dedicated feature or fix branch.
3. Read `docs/THEME-ARCHITECTURE.md` and `docs/FILE-STRUCTURE.md`.
4. Trace Liquid, section, block, snippet, CSS, JavaScript, and JSON dependencies.
5. Preserve existing merchant settings and Shopify Online Store 2.0 structures.

## Development rules

- Keep changes focused; avoid unrelated refactoring.
- Do not rename section, block, snippet, or setting IDs without an approved
  migration plan.
- Do not change image paths or remove assets without dependency verification.
- Do not add third-party libraries without owner approval.
- Never commit credentials, customer information, store exports, or `.env` files.
- Update documentation when behavior or settings change.
- Test changes in an unpublished development theme.

## Validation

Run `shopify theme check`, validate JSON and section schemas, and test relevant
Theme Editor controls and storefront interactions on desktop and mobile.

## Pull requests

Describe the change, affected files/features, validation performed, screenshots
or recordings for visual changes, and any known limitations. Do not merge or
publish without owner approval.
