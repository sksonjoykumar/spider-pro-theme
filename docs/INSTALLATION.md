# Installation and Development

## Before installation

Back up the current theme and test changes in a development store or unpublished
theme. The full GitHub repository ZIP contains `docs/` and `.github/`; it is not
the Shopify upload archive. Use the separate Shopify-theme-only ZIP.

## Upload through Shopify Admin

1. Open Shopify Admin → Online Store → Themes.
2. Choose Add theme → Upload ZIP.
3. Upload the Shopify-theme-only ZIP.
4. Preview the unpublished theme.
5. Open Customize and review global settings, header, footer, templates, sections,
   and system features.
6. Test the store before publishing.

## Shopify CLI

Install and authenticate Shopify CLI using Shopify's official documentation:
https://shopify.dev/docs/api/shopify-cli

From the theme root:

```bash
shopify theme dev --store your-store.myshopify.com
shopify theme check
shopify theme push --unpublished --store your-store.myshopify.com
```

Replace the example store domain with an authorized development store. Do not
run a publishing command until the owner approves the release.

## Connect a private GitHub repository

1. Create a Private repository on GitHub.
2. Push the approved Spider Pro branch.
3. In Shopify Admin → Online Store → Themes, choose the option to connect a
   theme from GitHub.
4. Authorize Shopify to access the private repository if prompted.
5. Select the repository and branch.
6. Preview the connected theme before publishing.

Shopify Admin labels and available connection options can vary. Do not make the
repository public to bypass private-repository authorization.

## Shopify upload ZIP contents

The Shopify ZIP must have these directories at its root:
`assets/`, `blocks/`, `config/`, `layout/`, `locales/`, `sections/`,
`snippets/`, and `templates/`. Do not upload the GitHub repository ZIP.

## Safe workflow

1. Pull the latest approved branch.
2. Create a feature branch.
3. Make the smallest required change.
4. Run `shopify theme check`.
5. Validate JSON and test affected Theme Editor controls.
6. Preview desktop and mobile.
7. Open a pull request with test evidence.
8. Merge only after owner review.
