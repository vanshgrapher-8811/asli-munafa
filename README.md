# Asli Munafa · असली मुनाफ़ा

A small, private calculator that shows an Indian small-business owner their **real profit**: from money in, through GST, returns, product cost, selling costs, marketing and running costs, down to net profit. Every step is explained in plain English or Hindi.

> "Out of every ₹100 your customers paid, you keep ₹X."

It goes with the reel *"Why most small businesses don't know their real profit"*. The worked example from the reel is the **Online / D2C** preset.

Live: https://asli-munafa.pages.dev · By [@itworks_withvansh](https://www.instagram.com/itworks_withvansh/)

## Privacy: what's guaranteed and how to check

| Guarantee | How it's enforced |
|---|---|
| Numbers never leave the device | All maths runs in the browser (`src/engine.js`). There is no server code at all. |
| The page *can't* send data, even by mistake | A Content Security Policy sets `connect-src 'none'` and `form-action 'none'`. `fetch`, XHR, beacons and form posts are blocked by the browser. |
| No third parties | No CDNs, Google Fonts, analytics, cookies or pixels. Fonts are self-hosted WOFF2 files in `fonts/`. |
| Nothing is stored by default | `localStorage` is only used when the owner turns on **Remember on this device**. Turning it off deletes it. |
| Works in airplane mode | A tiny service worker (`src/sw.js`) caches the app shell. Without one (for example in Instagram's in-app browser), everything still works once the page has loaded. |
| Fully offline copy | `dist/asli-munafa.html` is one self-contained file (CSS, JS, fonts inlined) with an even stricter CSP (`default-src 'none'`). |

**Verify it yourself**

1. Open the site, then open DevTools → **Network** and clear it.
2. Type numbers, switch the business type, switch to Hindi, move the what-if sliders, make a share image.
3. The Network tab stays empty. (Tested: 11 requests at load, 0 after.)
4. Or: load the page once, switch on airplane mode, reload. It still works.
5. In the console, `fetch('/')` fails with a CSP error: the page really can't talk to the network.

## Run it locally

Needs Node 18 or newer. There are no npm dependencies.

```bash
npm test          # engine + i18n tests (node --test)
npm run build     # writes dist/
npm run serve     # http://localhost:4173, with the same headers as production
```

`npm run preview` runs build + serve in one go.

Settings live in `src/config.js`:

- `INSTAGRAM_HANDLE`: used in the end CTA ("DM 'PROFIT' to @…")
- `GITHUB_URL`: linked from the privacy explainer and footer
- `SITE_URL`: printed on the share card

## Project layout

```
index.html                 page shell (static text in English; JS fills in the rest)
src/engine.js              pure maths, no DOM (tested)
src/presets.js             business types + example numbers (examples, not benchmarks)
src/i18n.js                every on-screen string in English + Hindi, number formatting
src/ui.js                  rendering, inputs, ladder, what-if, the four worlds' motion
src/share.js               share/save PNG drawn on a local <canvas>
src/sw.js                  service worker template (build fills in version + file list)
src/config.js              handle, GitHub URL, site URL
styles/main.css            Vintage Futurism v2: Canvas, Sunburst, Horizon, Lens
fonts/                     Unbounded 800, Poppins 400/600 (+ Devanagari), Space Mono (OFL)
tests/                     node --test
build/build-single-file.mjs  bundles JS, fingerprints assets, writes _headers, builds the single file
build/serve.mjs            local static server (compression + _headers)
dist/                      deploy this folder (generated, not committed)
```

Build output: about 207 KB for HTML + JS + CSS before compression (about 45 KB with brotli). Fonts add 157 KB and are only fetched when needed.

## The maths (summary)

All inputs are monthly. `G` = money customers paid.

- Regular GST, price includes GST: `salesExGst = G / (1 + r)`. Excludes GST: `salesExGst = G` (GST shown for info only).
- Composition scheme: `compositionTax = G × c` is a cost. Not registered: `salesExGst = G`.
- `NR = salesExGst − returns − compositionTax` → `CM1 = NR − COGS` → `CM2 = CM1 − selling` → `CM3 = CM2 − marketing` → `EBITDA = CM3 − fixed` → `PBT = EBITDA − depreciation − interest` → `net = PBT − max(0, PBT) × taxRate`.
- Payment fees are a % of `G`; marketplace commission is a % of sales ex-GST.
- Break-even treats COGS, returns, selling and marketing as variable, so `breakEven = fixed × G / CM3`. It is "not reachable" when CM3 ≤ 0.
- Cash: `netProfit + depreciation − extra stock − (udhaar given − collected) + (supplier credit − paid) − loan principal − personal withdrawals`. A blank "stock bought" means "same as stock used".

The reel's worked example is a test case (`tests/engine.test.js`) and matches to ±₹1.

## Deploy (Cloudflare Pages, free)

These steps need Vansh's own login, so they're left for him.

1. **Push to GitHub** (public):
   ```bash
   git remote add origin https://github.com/vanshgrapher-8811/asli-munafa.git
   git push -u origin main
   ```
2. **Create the Pages project.** Either:
   - **Dashboard:** Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pick the repo. Build command `npm run build`, output directory `dist`. No environment variables needed.
   - **CLI** (wrangler is already installed on this machine):
     ```bash
     wrangler login
     npm run build
     wrangler pages deploy dist --project-name asli-munafa
     ```
3. **Custom domain:** in the Pages project → Custom domains → add `profit.<your-domain>`. If the domain's DNS is on Cloudflare, the CNAME is added for you and HTTPS is automatic.
4. **Headers:** `dist/_headers` is applied automatically. It sets the CSP (including `frame-ancestors 'none'`, which only works as a header), `Referrer-Policy: no-referrer`, a `Permissions-Policy` that disables camera, mic, geolocation and payment, `X-Content-Type-Options: nosniff`, long caching for fingerprinted assets, and `Content-Disposition: attachment` for the offline file. The service worker gets its own narrow CSP.
5. Update `src/config.js` with the real URLs, then rebuild and redeploy.

**Fallback: GitHub Pages.** Settings → Pages → Source: *GitHub Actions*, then run the "Deploy to GitHub Pages" workflow manually (`.github/workflows/pages.yml`). GitHub Pages ignores `_headers`, but the CSP `<meta>` tag in the page still blocks all network access.

## Take it down

1. Cloudflare → Workers & Pages → `asli-munafa` → Settings → **Delete project** (or `wrangler pages project delete asli-munafa`).
2. Remove the `profit` DNS record from your domain if it's still there.
3. Optionally archive or delete the GitHub repo. Anyone who saved `asli-munafa.html` keeps a working copy; it never contacts you, so there is nothing to switch off.

## Credits and licence

Code: MIT. Fonts: Unbounded, Poppins and Space Mono, all under the SIL Open Font License 1.1 (see `fonts/LICENSE-*.txt`); subsets from Fontsource.

This tool gives estimates to help owners think. It is not tax or financial advice.
