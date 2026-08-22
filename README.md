# VAV Group Website

Production website for **VAV Group** at [vavgroup.pro](https://vavgroup.pro), deployed automatically from `main` through GitHub Pages.

The site is built with Astro and TypeScript, uses no client-side framework, and ships only the small amount of JavaScript required by navigation, forms and the VAV Assistant. Russian is the current locale; the project keeps locale configuration separate so English can be added later without replacing the page architecture.

## Requirements

- Node.js 24 recommended; minimum supported version: 22.12
- pnpm 11.19.0

Enable the pinned package manager if it is not already available:

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
```

## Local development

```bash
pnpm install
pnpm dev
```

Astro prints the local URL, normally `http://localhost:4321`.

Production checks and build:

```bash
pnpm check
pnpm build
```

Preview the generated `dist/` site:

```bash
pnpm preview
```

## Project structure

```text
src/
  components/     reusable interface and conversion components
  data/           shared VAV division content and typed case registry
  i18n/           locale configuration
  layouts/        global HTML, metadata, analytics and navigation shell
  pages/          Astro routes and XML sitemap endpoint
  styles/         global design tokens and base styles
public/           favicon, social preview, robots.txt and domain file
assistant/        Cloudflare Worker for AI answers and Telegram lead delivery
.github/workflows deployment to GitHub Pages
```

Repeated division content lives in `src/data/divisions.ts`. The public, founder-approved case content lives in `src/data/cases.ts`; confidential evidence and review material remain outside the public source tree. Shared visual tokens are in `src/styles/global.css`.

## Case-study intake

Confidential source material, evidence, review files and founder documents stay in the local `intake/`, `docs/` or `sources/` areas. These directories are ignored by version control and must never be copied into `public/`, `src/` or `dist/`.

No case is published automatically. The three V3 cases in `src/data/cases.ts` are the only founder-approved public versions; they are anonymized and deliberately exclude unsupported metrics, client names and internal evidence references.

Public case routes:

- `/cases`
- `/cases/retail-process-automation`
- `/cases/retail-commercial-system`
- `/cases/complex-b2b-opportunity`

Run `pnpm lint` before publishing. The content safety check verifies the approved slugs, founder-experience markers, C06 non-closure wording, inactive email aliases and prohibited unsupported metrics.

## Environment configuration

Copy `.env.example` to `.env` for local development. Never commit `.env`.

```env
PUBLIC_FORMSPREE_ENDPOINT=
PUBLIC_YANDEX_METRICA_ID=
PUBLIC_GOOGLE_ANALYTICS_ID=
```

All three values are optional. The production site builds without them and does not emit analytics scripts when IDs are absent.

Variables prefixed with `PUBLIC_` are included in browser-delivered code. They must never contain API keys, passwords or private credentials.

## Activate the contact form

The form is prepared specifically for Formspree. Without a configured endpoint it is visibly disabled, does not send or store entered data, and offers the approved email and phone fallback.

Formspree setup:

1. Create a form in Formspree and copy its HTTPS endpoint, for example `https://formspree.io/f/...`.
2. Add `PUBLIC_FORMSPREE_ENDPOINT=<endpoint>` to local `.env`.
3. In GitHub, open **Repository → Settings → Secrets and variables → Actions → Variables**.
4. Create a repository variable named `PUBLIC_FORMSPREE_ENDPOINT` with that endpoint.
5. Trigger the Pages workflow again.
6. Submit a real test and confirm that the destination inbox, spam handling, privacy text and retention settings are correct.

The endpoint is intentionally treated as a public configuration value and is accepted only when it is an HTTPS `formspree.io/f/…` URL. Do not place an API key or other secret in it.

The published privacy policy discloses the currently disabled Formspree architecture. Obtain a qualified legal review before activating this or another processor.

## VAV Assistant and Telegram

The site contains a premium assistant widget with two modes:

- local guided answers from approved public VAV content when no backend endpoint is configured;
- Cloudflare Workers AI answers when the protected Worker is connected.

The separate lead handoff and the main `/contacts` form send the visitor's name, contact and business context to Valentin's Telegram bot after activation. Contact details are not sent to the AI model. The Worker redacts contact-like text before any AI request and falls back to guided answers if AI is unavailable.

Run [connect-vav-assistant.bat](connect-vav-assistant.bat) after creating a bot through Telegram's official `@BotFather`. The launcher handles Cloudflare authorization, protected secret storage, webhook registration, a Telegram delivery test, public runtime configuration, production checks and the GitHub push. The BotFather token is entered in a hidden prompt and is never written to GitHub or a project file.

Full operational and security notes are in [assistant/README.md](assistant/README.md). Review the privacy policy and applicable personal-data localization and cross-border-transfer requirements before enabling external processing in production.

## Analytics

Tracking is off by default.

To enable an integration, create the corresponding GitHub Actions repository variable:

- `PUBLIC_YANDEX_METRICA_ID`
- `PUBLIC_GOOGLE_ANALYTICS_ID`

Use the same names in local `.env` when testing. Review the privacy/cookie requirements that apply to the selected configuration before enabling tracking.

## GitHub Pages deployment

The workflow at `.github/workflows/deploy.yml` follows the current official Astro GitHub Pages flow: checkout, build/upload with `withastro/action`, then publish with `actions/deploy-pages`.

1. Create or choose a clean GitHub repository and copy only the public website source listed under **Repository privacy** below.
2. Push the clean repository to its `main` branch, including `pnpm-lock.yaml`.
3. Open **Repository → Settings → Pages**.
4. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. Open the **Actions** tab and run **Deploy to GitHub Pages**, or push to `main`.
6. Wait for the `build` and `deploy` jobs to finish and record the actual Pages hostname.
7. In **Settings → Pages → Custom domain**, enter `vavgroup.pro` and save it **before changing DNS**.
8. Only after GitHub validates the domain and displays the required target, configure DNS and then enable **Enforce HTTPS**.

Official references:

- [Astro: deploy to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)
- [GitHub: use a custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub: manage a Pages custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

`astro.config.mjs` already sets `site` to `https://vavgroup.pro` and deliberately has no repository `base`, so asset and canonical paths work at the custom domain. `public/CNAME` contains `vavgroup.pro`; with a custom Actions workflow, GitHub Pages settings remain authoritative and GitHub may ignore this file.

### Windows one-click setup

The clean release repository includes two Windows launchers:

- `setup-github-pages.bat` — first-time GitHub authentication, repository creation, privacy audit, production build, push and Pages activation;
- `publish-update.bat` — validates, commits and pushes later approved updates.

Run the files only from this clean release repository. On first use, the setup launcher can install the official GitHub CLI through Windows Package Manager. Authentication opens GitHub's official browser flow; the launcher never asks for or stores a password, SMS code, 2FA code or access token. The active GitHub username is shown and must be confirmed before a repository is created.

The setup intentionally does not modify REG.RU, nameservers or DNS. Domain connection is a separate reviewed step after GitHub Pages returns the real production hostname.

## Repository privacy

The current local workspace contains internal business-review material and must not be pushed wholesale to a public repository. The recommended release method is a separate clean deployment repository containing only:

- `.github/`
- `public/`
- `scripts/`
- `src/`
- `.env.example`, `.gitignore`, `README.md`
- `astro.config.mjs`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`

Never copy `intake/`, `docs/`, `sources/`, `tmp/`, CVs, evidence, office documents, private screenshots or local environment files. The current `.gitignore` protects these paths when a new repository is initialized, but it cannot remove files that were already committed elsewhere. Always inspect the staged file list before the first push.

## DNS for `vavgroup.pro`

Do not preconfigure DNS. First deploy the clean repository, record the actual GitHub Pages hostname, add `vavgroup.pro` under **Settings → Pages → Custom domain**, and wait for GitHub's domain check. Then copy the exact current apex record values shown by GitHub's official instructions and point `www` to the actual Pages hostname for the selected account or organization. Do not use a repository name in the `www` target and do not create wildcard records.

### Email DNS safety

Website DNS and email DNS are independent. When configuring Pages:

- preserve every existing MX record;
- preserve SPF and DMARC TXT records;
- preserve DKIM records, including provider-specific CNAME or TXT records;
- change only conflicting apex website records and the `www` record;
- verify email delivery after the DNS change.

The only public contact address in V4 is `valentin@vavgroup.pro`. The public contact is Валентин Стратила, `+7 (922) 461-55-17`. No additional email aliases are presented as active channels.

Verify the final records with the DNS provider and GitHub Pages before enforcing HTTPS.

## Social preview and icons

- Open Graph and X image: `/og/vav-group.jpg` (1200×630)
- SVG favicon: `/favicon.svg`
- Apple touch icon: `/apple-touch-icon.png` (180×180)
- Theme color: `#0b1720`

No web manifest is used and the site is not configured as a PWA.

## Cloudflare Pages compatibility

No framework adapter is required for the static build.

1. Connect the repository in Cloudflare Pages.
2. Select Astro or set the build command to `pnpm build`.
3. Set the output directory to `dist`.
4. Use Node.js 24.
5. Add the same optional `PUBLIC_*` environment variables.
6. Configure the custom domain in Cloudflare only if Cloudflare Pages becomes the selected production host; do not point the domain to both platforms simultaneously.

## Pre-launch content checklist

- Add the founder photo only after selecting and licensing the real asset.
- Add further case studies only with verified context, permission and results.
- Approve the privacy policy and form-provider disclosure with counsel.
- Configure the contact-form endpoint and test delivery.
- Add analytics IDs only after deciding the consent/privacy approach.
- Replace the temporary text/SVG mark when the professional logo system is ready.

## Future extensions

The static-first architecture leaves room for a CRM integration, qualified-lead workflow, AI assistant, booking, courses, knowledge base, diagnostic tools, calculators, case-study collections, multilingual routes, client portal and standalone automation/SaaS products. Add server-side features behind explicit APIs or a dedicated backend; never place private credentials in Astro public variables.
