# Protein Price Tracker

Personal tool that watches starred Chemist Warehouse protein powder products and sends a Telegram or email alert when a real discount appears. A small Next.js web app lets me star products, see price history, and set alert rules.

The source of truth for scope and requirements is `docs/PRD.md`. Read it before starting any task. If this file and the PRD disagree, the PRD wins. Ask me before changing scope.

## Stack

- TypeScript everywhere, Node LTS.
- Web app: Next.js (App Router) on Vercel, Tailwind CSS, a charting library for the price chart.
- Database and auth: Supabase (Postgres, magic-link Auth, row-level security).
- Scraper: a TypeScript script run on a GitHub Actions cron, writing to Supabase with the service-role key.
- Scraping: plain `fetch` plus Cheerio first. Playwright only if the page truly needs a browser.
- Notifications: Telegram Bot API first, email via Resend second, behind one notifier interface.

## Repo layout

```
CLAUDE.md
docs/PRD.md              source of truth for requirements
packages/core/           store adapter, sale rules, shared types
apps/scraper/            the scheduled scraper job
apps/web/                Next.js app (not created until build step 6)
supabase/migrations/     SQL migrations
.github/workflows/       scrape.yml and CI
```

If the actual repo differs from this, follow the repo and tell me about the difference.

## Build order

Follow the build plan in `docs/PRD.md`, one step at a time:

1. Spike: find where the product price lives on a Chemist Warehouse page and confirm a plain request returns it.
2. Store adapter in `packages/core`.
3. Supabase project, five tables, row-level security, magic-link sign-in.
4. Scraper job writing price checks, run from GitHub Actions cron.
5. Sale rules, de-duplication, failure alert, Telegram bot.
6. Web app: sign-in and dashboard.
7. Add product and manage watches.
8. Product detail with price chart.
9. Alert settings, Telegram linking, alert history.
10. Scrape health and polish.

Do only the step I ask for. Do not scaffold `apps/web` before step 6. Do not start roadmap items (recommendations, other stores, pickup availability, public sign-up).

## Rules for the work

- Start non-trivial tasks by proposing a short plan and wait for my approval before editing files.
- Keep all Chemist Warehouse logic inside the store adapter. One function: given a product URL, return name, price and was-price. A second store later means a second module with the same signature.
- Sale logic lives in `packages/core` as pure functions with unit tests. Rules: price at or below target, or at least X% below the 90-day median. With under 7 days of history, only the target rule applies. Never alert twice on the same price. Alert again only after the price has risen and dropped again.
- A failed or unparseable check is recorded with `ok = false` and never produces a price alert. After 3 consecutive failures, send one "scraper may be broken" message.
- The web app only accepts product URLs on the store's domain. The scraper never fetches any other address.
- Be polite to the store: one request per product per run, a clear user agent, no parallel hammering, respect robots.txt.
- The web app reads and writes the database. Its pages must never wait on a scrape.
- Row-level security: watches, notification settings and alerts are readable and writable only by their owner. Products and price checks are readable by signed-in users and writable only by the scraper's service key.
- When you hit a decision the PRD does not cover, ask me instead of guessing.

## Secrets and safety

- Never commit secrets. Use `.env.local` for the web app and GitHub Actions secrets for the scraper. Keep `.env.example` files with placeholder names only.
- The Supabase service-role key must never reach the browser or any `NEXT_PUBLIC_` variable.
- Do not read or print `.env*` files.
- Do not run destructive commands (dropping tables, force-pushing, deleting branches) without asking.

## Git workflow

- One branch per build step, named like `step-2-store-adapter`.
- Small commits with descriptive messages. Open a PR per step with a summary of what changed and how it was tested.
- Do not push to `main` directly.

## Verification

Before saying a task is done:

- Run the type check, lint and tests, and fix failures.
- For the adapter, test against a real product page and show me the parsed result.
- For database changes, include a migration in `supabase/migrations/` and tell me how to apply it.
- Report what you ran and what the output was. If you could not run something, say so.

## Commands

npm workspaces from the repo root. Keep these current:

```
npm install
npm run build        # tsc build of every workspace
npm run typecheck    # tsc --noEmit, including tests and scripts
npm run lint         # eslint with typescript-eslint (type-aware)
npm test             # vitest; never touches the network
npm run check-url -w @motein/core -- <product-url>   # live adapter check against the real store
```

TypeScript is pinned to 6.0.x because typescript-eslint does not support 7.x yet.

## Open decisions

- W3 (add product) needs a name and price on first add. Either the web app imports the adapter from `packages/core`, or it saves the URL as pending and the scraper fills in details on its next run. Ask me before building W3.
- Check interval is weekly in the PRD. Daily is an open question.