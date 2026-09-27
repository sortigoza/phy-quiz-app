# Deploying Physics Quiz

This guide is for anyone hosting their own copy of the app: a school that wants it on its own domain, or a fork. The app is static files with no server side, so any static host works. GitHub Pages is the one this repository deploys to, and comes first; Vercel, Netlify and Amazon S3 with CloudFront follow.

## What you are deploying

`pnpm build` writes the whole app to `dist/`. Every path in it is relative, so the same `dist/` works unchanged at a domain root (`https://quiz.example.edu/`), on a subpath (`https://example.edu/physics/quiz/`), or on a GitHub Pages project site, with no rebuild and no configuration.

| Path in `dist/` | What it is | Cache |
| --- | --- | --- |
| `index.html` | The one page | revalidate every time |
| `sw.js` | The service worker, which makes the app work offline | revalidate every time |
| `manifest.webmanifest` | Makes the app installable | revalidate every time |
| `assets/*`, `workbox-*.js` | Scripts, styles and KaTeX fonts, with a content hash in every name | for a year, immutable |
| `llms.txt` | The bank format for AI agents | revalidate every time |
| `schema/bank-v1.schema.json` | The bank JSON Schema for editors | revalidate every time |
| `examples/*` | The example banks and the example repository | revalidate every time |
| icons, `music/crab-canon.mid` | Icons and the library music | a day is fine |

Things every host must get right:

- **HTTPS.** Browsers only run service workers over HTTPS (or on `localhost`), so without it the app neither installs nor works offline.
- **`sw.js` and `index.html` must not be cached for long.** A browser checks `sw.js` for updates, and a stale copy held by a CDN keeps everyone on the old app. `no-cache` means "revalidate before use", not "never cache", and is what you want.
- **No rewrites are needed.** There is one page and no client-side routes: bank links carry everything after `#`, which never reaches the server. A 404 page is unnecessary too.
- **Content types**, which most hosts already get right: `.webmanifest` as `application/manifest+json`, `.yaml` as `application/yaml` (or any text type), `.mid` as `audio/midi`.
- **Cross-origin headers on `examples/` and `schema/` are optional**. They let another site's copy of the app load your example banks by URL. Editors fetch the schema outside the browser and do not need them.

After deploying, open the app, then check `https://<your address>/llms.txt` and `https://<your address>/schema/bank-v1.schema.json` load. To check offline support, open the app once, turn the network off in the browser's developer tools, and reload.

If you publish [private banks](./bank-format.md#private-banks) for your copy, pass its address to the author tool so bank links open it rather than the public app: `pnpm bank-crypto encrypt ... --app-url https://quiz.example.edu/`.

## GitHub Pages

The repository deploys itself here with [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). On a fork:

1. In the fork's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push to `main`, or run the **Deploy to GitHub Pages** workflow by hand from the **Actions** tab. It installs, lints, tests, builds and publishes `dist/`.
3. The app appears at `https://<user>.github.io/<repository>/`. A project site lives on a subpath, which the relative build handles without configuration.

Until v1.0.0 every push to `main` publishes. From v1.0.0 the workflow publishes on version tags instead (ticket 14), so `main` can move without changing what is live; see [development.md](./development.md#releasing).

**A custom domain.** Add it under **Settings → Pages → Custom domain**, then create the DNS record GitHub shows (a `CNAME` to `<user>.github.io` for a subdomain). Tick **Enforce HTTPS** once the certificate is issued. Nothing in the build changes.

GitHub Pages sets its own cache headers (ten minutes on everything) and cannot be told otherwise. That is safe for this app: at worst, a new version reaches people ten minutes later. It also sends `Access-Control-Allow-Origin: *` on every file, so banks published on Pages load by URL from anywhere.

## Vercel

1. In Vercel, **Add New → Project**, and import the repository.
2. Vercel detects Vite and pnpm. Check the settings read: **Build Command** `pnpm build`, **Output Directory** `dist`. Leave **Root Directory** empty.
3. Add a `vercel.json` at the repository root for the cache and cross-origin headers, then deploy:

```json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/workbox-(.*).js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/(sw.js|index.html|manifest.webmanifest|llms.txt)",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
    },
    {
      "source": "/(examples|schema)/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" },
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ]
}
```

Every push to the default branch then deploys to production, and every pull request gets its own preview address, where the app works in full, offline included. Preview and production are different origins, so each keeps its own library and history in the browser.

## Netlify

1. In Netlify, **Add new site → Import an existing project**, and pick the repository.
2. Netlify reads the build settings from a `netlify.toml` at the repository root. Add this one, which also sets the headers:

```toml
[build]
  command = "pnpm build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/workbox-*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"

[[headers]]
  for = "/examples/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"

[[headers]]
  for = "/schema/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
```

Netlify detects pnpm from the lockfile. Its default for everything else is to revalidate on every request, which is what `index.html` and the other small files want. Deploy previews work as on Vercel.

**Without a repository**, drag the `dist/` folder built on your own machine onto the Netlify dashboard's **Sites** page. The headers above then need a `dist/_headers` file instead; the `netlify.toml` route is less work to keep.

## Amazon S3 and CloudFront

S3 holds the files; CloudFront serves them over HTTPS on your domain. You need an AWS account and the [AWS CLI](https://aws.amazon.com/cli/) signed in.

**Once:**

1. Create an S3 bucket, say `physics-quiz-site`, with **Block all public access** left on. CloudFront reads it, nobody else does.
2. Create a CloudFront distribution with the bucket as its origin, using **Origin access control** (CloudFront offers to update the bucket policy; accept). Set **Viewer protocol policy** to **Redirect HTTP to HTTPS** and **Default root object** to `index.html`.
3. For your own domain, request a certificate in AWS Certificate Manager in `us-east-1`, add the domain as an **Alternate domain name** on the distribution with that certificate, and point a DNS `CNAME` (or a Route 53 alias) at the distribution's `*.cloudfront.net` address.

To serve the app on a subpath of the distribution instead, upload into a prefix, such as `s3://physics-quiz-site/quiz/`, and open `https://<domain>/quiz/`, with the trailing slash. Set the default root object only for the root; CloudFront does not apply it to subfolders, so link to `/quiz/index.html` or add a CloudFront Function that appends `index.html` to paths ending in `/`.

**Each deployment**, from the repository:

```bash
pnpm build

# Hashed files: cache for a year.
aws s3 sync dist/ s3://physics-quiz-site/ \
  --exclude "*" --include "assets/*" --include "workbox-*.js" \
  --cache-control "public, max-age=31536000, immutable"

# Everything else: revalidate on every request. --delete removes files the new build no longer has.
aws s3 sync dist/ s3://physics-quiz-site/ --delete \
  --exclude "assets/*" --exclude "workbox-*.js" \
  --cache-control "no-cache"

# Types the CLI does not guess by itself.
aws s3 cp dist/manifest.webmanifest s3://physics-quiz-site/manifest.webmanifest \
  --content-type "application/manifest+json" --cache-control "no-cache"
aws s3 cp dist/examples/ s3://physics-quiz-site/examples/ --recursive \
  --exclude "*" --include "*.yaml" --content-type "application/yaml" --cache-control "no-cache"

# Old hashed files are harmless; the service worker and page must not be stale at the edge.
aws cloudfront create-invalidation --distribution-id <your distribution id> \
  --paths "/index.html" "/sw.js" "/manifest.webmanifest" "/"
```

The first `sync` has no `--delete`, so assets from earlier builds stay in the bucket. That is deliberate: a browser still running the old page can finish loading it. They are small; clear out old ones now and then if you like.

For cross-origin access to `examples/` and `schema/`, attach CloudFront's managed **SimpleCORS** response headers policy to a cache behaviour for those two paths.
