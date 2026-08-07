# Strato V2 — Sprouts agentic GTM prototype

Static HTML prototype. No build step, no environment variables.

## Routes

| URL | File | What it is |
|---|---|---|
| `/` | `index.html` | The current app: Mission Control, Discover, Prospect, Segments, Opportunities, Website Visitors, Agents & Workflows, Personalization Engine, Connections, Settings. |
| `/onboarding` | `onboarding.html` | Standalone onboarding flow. |

`/app` redirects to `/`.

Neither page is self-contained: both load `./support.js` at runtime, and the
app renders the logo from `uploads/`. Keep those alongside the HTML.

## Why the filenames matter

`cleanUrls` strips `.html`, so a file named `Foo Bar.dc.html` is served at
`/Foo Bar.dc` and the `.html` path only exists as a 308 redirect. Rewrites
pointing at such a path resolve to nothing and 404. That is why these files
have plain, extensionless-friendly names and the routing needs no rewrites:
`/` is `index.html` on disk, and `/onboarding` falls out of `cleanUrls`.

Renaming these files back to names with spaces or a `.dc.html` double
extension will break the routing again.

## Vercel setup

The GitHub repo root is the parent directory, not this folder, so the Vercel
project's **Root Directory** must be `deploy`. With that set, this
`vercel.json` is the one Vercel reads and everything in here is what ships.

1. vercel.com/new → import the repo.
2. Framework preset: **Other**. Leave Build Command and Output Directory empty.
3. Root Directory: **`deploy`**.
4. Deploy.

## Updating the app

`index.html` is a copy of `Sprouts Agent-First v8.dc.html` in the repo root,
with its one cross-link repointed at `/onboarding`. After editing the root
file, copy it here as `index.html` and redo that link — nothing outside
`deploy/` is uploaded by Vercel.
