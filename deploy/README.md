# Strato V2 — Sprouts agentic GTM prototype

Static HTML prototype. No build step, no dependencies, no environment variables.

- `index.html` — the onboarding journey. Its final CTA ("Take me to my briefing") opens the full app, which is embedded in the same file.
- `app.html` — the app on its own: Mission Control, Discover, Segments, Opportunities, Website Visitors, Agents & Workflows, Personalization Engine, Connections, Settings.

## Deploy on Vercel

1. Push this folder to a GitHub repo.
2. Go to vercel.com/new and import the repo.
3. Framework preset: **Other**. Leave Build Command and Output Directory empty.
4. Deploy.

Vercel serves the repo root as static files, so `/` renders the onboarding and `/app` renders the app.
