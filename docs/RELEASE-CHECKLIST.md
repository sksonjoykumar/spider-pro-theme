# Release Checklist

## Repository and source

- [ ] Confirm release branch and version.
- [ ] Review diff; no unrelated refactoring.
- [ ] Confirm no credentials, customer data, or merchant-private data are committed.
- [ ] Confirm repository visibility is Private.
- [ ] Review collaborator access.
- [ ] Approve the proprietary LICENSE draft.
- [ ] Update CHANGELOG.md.

## Theme validation

- [ ] Run `shopify theme check`.
- [ ] Validate JSON and section schemas.
- [ ] Validate locale key parity.
- [ ] Verify snippet and section dependencies.
- [ ] Resolve the four missing assets in `ASSET-AUDIT.md`.
- [ ] Confirm referenced images and fonts load.
- [ ] Confirm saved theme settings are preserved.

## Storefront testing

- [ ] Preview desktop, tablet, and mobile.
- [ ] Test header, mega menu, announcement bar, and footer.
- [ ] Test product media and variant selection.
- [ ] Test collection filters, sorting, and pagination.
- [ ] Test Quick View and Choose Options.
- [ ] Test wishlist and product comparison.
- [ ] Test sticky add-to-cart and cart drawer.
- [ ] Test cart quantity, removal, discounts, shipping, and checkout handoff.
- [ ] Test search and predictive search.
- [ ] Test newsletter, popup, wholesale, registration, and tracking forms.
- [ ] Test customer account templates and localization.
- [ ] Review keyboard access, focus, contrast, and reduced motion.

## GitHub release

- [ ] Confirm GitHub Actions passes.
- [ ] Review README and documentation.
- [ ] Add approved storefront screenshots.
- [ ] Create a version tag only after owner approval.
- [ ] Prepare a Shopify-theme-only ZIP.
- [ ] Preview the ZIP on a development store.
- [ ] Publish only after explicit owner approval.
