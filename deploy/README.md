# Strato V2 — Sprouts agentic GTM prototype

Static HTML prototype. No build step, no dependencies, no environment variables.

## Routes

| URL | File | What it is |
|---|---|---|
| `/` and `/app` | `Sprouts Agent-First v8.dc.html` | The current app: Mission Control, Discover, Prospect, Segments, Opportunities, Website Visitors, Agents & Workflows, Personalization Engine, Connections, Settings. |
| `/onboarding` | `Onboarding Journey.dc.html` | Standalone onboarding flow. |

There is deliberately no `index.html`. Vercel checks the filesystem before it
applies rewrites, so an `index.html` would always win `/` and the rewrite below
would never fire.

The two `.dc.html` files are **not** self-contained: they load `./support.js` at
runtime and cross-link each other by their original filenames. Keep those names
as they are, and keep `support.js` and `uploads/` alongside them — renaming any
of it breaks the links silently.

`/`, `/app`, and `/onboarding` are rewrites in `vercel.json`, which is what lets
those files keep their spaces-and-dots names while still having clean URLs.

## Vercel setup

The GitHub repo root is the parent directory, not this folder, so the Vercel
project's **Root Directory** must be set to `deploy`. With that set, this
`vercel.json` is the one Vercel reads and everything in here is what ships.

1. vercel.com/new → import the repo.
2. Framework preset: **Other**. Leave Build Command and Output Directory empty.
3. Root Directory: **`deploy`**.
4. Deploy.

## Updating the app

`Sprouts Agent-First v8.dc.html` is a copy of the file of the same name in the
repo root. After editing the root copy, copy it (and `support.js`, if it
changed) into this folder — nothing outside `deploy/` is uploaded by Vercel.
