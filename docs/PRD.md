# PRD: Protein Powder Sale Tracker (v1)

Oct 27, 2026 · @Mohamed Babiker

## Overview

v1 is a small web app where I star Chemist Warehouse protein powders, see each one's price over time, and get a Telegram or email alert when a real discount appears. It keeps the v0 loop (scheduled scrape, price history, alerts) and adds a Next.js interface on top of a Supabase database.

**Problem.** Chemist Warehouse prices move with promotions. Checking by hand is easy to forget, and a "sale" tag does not say whether the price is actually below the usual one.

**Scope of v1.**

- A Next.js web app on Vercel with a Supabase database (Postgres and Auth).
- One store (Chemist Warehouse) and any number of starred products.
- Screens to add and manage starred products, see price history, and set alert rules.
- Telegram and email alerts, chosen per user.
- Sign-in and per-user data from the start, so the app can be opened to other people later without a rewrite.
- No recommendations, other stores or pickup availability yet.

The scraper stays a separate scheduled job, and all store-specific code stays behind one adapter. Adding a second store or product type later should not require a rewrite.

## Goals and success criteria

v1 succeeds if I can manage my watchlist from a browser, tell at a glance whether a price is genuinely low, and get one clear alert per real discount.

| Goal | How I know it works |
| --- | --- |
| Manage products without touching code | I paste a product URL and it appears in my watchlist, with its price shown after the next check |
| See price over time | Each product has a chart of every recorded price, with my target price and past alerts marked |
| Judge a deal quickly | Each product shows its current price, its 90-day low, and how far it sits below the 90-day median |
| Alert on real discounts | A drop below my target, or below the product's usual price, triggers one message on the channels I chose |
| No spam | The same price never triggers a second alert |
| Trust the data | Every product shows when it was last checked, and failing products are flagged |
| Cheap to run | Vercel, Supabase and GitHub Actions free tiers cover it |
| Ready for other users | Sign-in, per-user data and a shared product catalog exist from day one |

**Non-goals for v1:** similar-product recommendations, other stores, per-store pickup availability, a native mobile app, public sign-up, and payments.

## User story and core flow

**As** someone who buys the same protein powder regularly, **I want** to star one Chemist Warehouse product and get a message when it goes on sale, **so that** I buy at a low price without checking the site.

1. I add the product's Chemist Warehouse URL to my watchlist, with an optional target price.
2. On a schedule, the tool fetches the product page and reads the current price.
3. It stores the price with a timestamp.
4. It compares the price against my target and the product's recent price history.
5. If it qualifies as a sale and I have not been told about this price yet, it sends a Telegram or email message with the product name, old price, new price and the link.
6. If the price rises again and later drops, I get a new alert.

**v1 stories**

- As a user, I paste a Chemist Warehouse product URL and it appears in my watchlist with its name and current price.
- I open a product and see its price over time, so I can tell whether today's price is actually low.
- I set a target price, or a minimum percent drop, for each product separately.
- I pause a product while I have enough stock, and resume it later without losing its history.
- I choose whether alerts come by Telegram, email or both, and send myself a test message to confirm it works.
- I see a history of the alerts I was sent, with the price and date.
- I see when each product was last checked and which ones are failing to load.

## Functional requirements

**Part 1: scraping, rules and alerts** (the v0 engine, carried into v1). Every row is a must.

| ID | Area | Requirement |
| --- | --- | --- |
| F1 | Watchlist | A starred product is a row in the database (URL, optional target price). Starring it starts tracking it, and the web app manages these rows (W3 to W5) |
| F2 | Scraper | Fetch each product page and extract the current price, the product name, and any "was" or RRP price shown |
| F3 | Schedule | Run automatically once a week. Exact interval is an open question |
| F4 | Price history | Store every successful check: product, price, was-price, timestamp |
| F5 | Sale rule | Alert when the price is at or below my target, or at least X% below the median of the last 90 days. X is configurable |
| F6 | De-duplication | Do not re-alert for a price already alerted. Alert again only after the price has risen and dropped again |
| F7 | Notifications | Send via Telegram bot and email, chosen per user, behind one notifier interface |
| F8 | Message content | Product name, new price, previous price, percent off, direct link |
| F9 | Failure alerts | If a check returns no parseable price, record it. After 3 consecutive failures, message me once that the scraper may be broken |
| F10 | Cold start | With under 7 days of history, only the target-price rule applies, since the median is not yet meaningful |

**Why the history rule matters.** A displayed "was" price can be inflated. Comparing against what the price actually was over the last 90 days is the check for a real sale.

**Part 2: web app**

| ID | Screen or feature | Requirement | Priority |
| --- | --- | --- | --- |
| W1 | Sign-in | Email magic-link sign-in through Supabase Auth. Every watchlist, setting and alert belongs to one user | Must |
| W2 | Dashboard | List my starred products with name, current price, change since the last check, 90-day low, and a status: on sale, below target, normal, or check failing | Must |
| W3 | Add product | Paste a product URL. The app checks it is on the store's domain, fetches the name and price once, and stars it. If the product is already in the catalog, it reuses that record | Must |
| W4 | Product detail | Line chart of price over time with 30-day, 90-day and all-time ranges, my target price as a line, and markers where alerts fired. Below it, a table of recent checks | Must |
| W5 | Manage watch | Edit target price and minimum percent drop, pause or resume, and unstar. Unstarring keeps the product's price history | Must |
| W6 | Alert settings | Choose Telegram, email or both. Link Telegram through a bot link. A button sends a test message | Must |
| W7 | Alert history | List of alerts sent to me with product, price, channel and time | Should |
| W8 | Scrape health | Show last checked time on every product. Flag a product after 3 failed checks | Must |
| W9 | Check now | A button re-checks one product immediately, limited to a few times a day | Should |
| W10 | Deal label | Mark a displayed discount as a real sale, or as marked down only, by comparing the "was" price to the 90-day median | Should |
| W11 | Unit price | Show price per 100 g where the page gives the pack size | Could |
| W12 | Mobile and install | Layout works on a phone. Installable as a home-screen app | Could |

The catalog is shared: each product is scraped once per run however many people star it, and alerts fan out to everyone watching it.

## Technical approach

v1 has three parts: a Next.js web app, a Supabase database, and a scheduled scraper job that stays separate from the web app. The v0 loop is unchanged. The database and the web app wrap around it.

&#91;embedded content: v1 architecture · web app, database and scraper\]

The scraper job writes prices into Supabase and sends alerts. The web app reads and edits the same database, so it never talks to the store directly.

| Part | Choice | Why |
| --- | --- | --- |
| Web app | Next.js (App Router) and TypeScript on Vercel | Matches my skills. Server components load data, route handlers cover small actions |
| UI | Tailwind CSS with a component library such as shadcn/ui, and a charting library such as Recharts | Fast to build, and the price chart needs a reference line for the target price |
| Database and auth | Supabase: Postgres, Auth with magic links, row-level security | One service for data and sign-in, and it supports per-user data from day one |
| Scraper | TypeScript script on GitHub Actions cron, writing to Supabase with the service-role key | Keeps scraping and secrets out of the web app. The interval is a setting in the workflow |
| Scraping | Plain `fetch` first, Cheerio for HTML | Cheapest option. Playwright only if the page needs a real browser |
| Notifications | Telegram Bot API, and email through Resend | Telegram is one HTTP call to `sendMessage` after creating a bot with BotFather |
| Secrets | GitHub Actions secrets for the scraper, Vercel environment variables for the web app | The service-role key never reaches the browser |

**Data model.**

| Table | Columns |
| --- | --- |
| products | id, store, url (unique), name, image\_url, created\_at. One row per product, shared by everyone who stars it |
| price\_checks | id, product\_id, price, was\_price, checked\_at, ok. Pack size and stock status are added only if the page provides them |
| watches | id, user\_id, product\_id, target\_price, min\_drop\_pct, paused, created\_at. This is the "star" |
| notification\_settings | user\_id, telegram\_chat\_id, telegram\_enabled, email\_enabled |
| alerts | id, watch\_id, price, channel, sent\_at |

**Store adapter.** All Chemist Warehouse logic lives in one module with a single function: given a product URL, return name, price and was-price. A second store later means a second module with the same signature.

**Security.** Row-level security limits watches, notification settings and alerts to their owner. Products and price checks can be read by any signed-in user and written only by the scraper's service key. The app accepts only URLs on the store's domain, and the scraper never fetches any other address.

**First task: a data-source spike.** I have not yet checked how Chemist Warehouse exposes its prices. Before building anything else, open one product page and see whether the price is in embedded JSON-LD, in a JSON endpoint the page calls, or only in rendered HTML. That answer decides whether `fetch` plus Cheerio is enough. A JSON source is much more stable than parsing page markup.

## Web app screens

Five screens cover v1. The dashboard and product detail do most of the work.

| Route | Screen | What it shows |
| --- | --- | --- |
| `/login` | Sign-in | Email field and magic-link confirmation |
| `/` | Dashboard | A card or row per starred product: name, current price, change since last check, 90-day low, status badge. An "Add product" button opens a paste-URL dialog |
| `/products/[id]` | Product detail | Price chart with range toggle, target-price line and alert markers. Current price, 90-day low and median, last checked time, and the deal label. Edit target, pause and unstar controls. Recent checks table |
| `/alerts` | Alert history | Alerts sent to me, newest first |
| `/settings` | Settings | Notification channels, Telegram link and test message, email address, sign out |

The dashboard and product detail pages read from the database only. They never wait on a scrape, and "Check now" (W9) triggers one in the background.

## Non-functional requirements and risks

The biggest risk is the store blocking automated requests, so the spike comes first and the rest is cheap if it passes.

**Non-functional requirements**

- Politeness: one request per product per run, at most a few runs a day, with a clear user agent and no parallel hammering.
- Reliability: a failed run never sends a false alert, and never crashes the whole job.
- Cost: zero on free tiers.
- Privacy: no personal data beyond my own Telegram chat ID, kept in secrets.

**Risks**

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Site blocks scripted requests or GitHub's cloud IP ranges | Unknown until the spike | Try the JSON source first. Fall back to Playwright, or run the job from a home machine or small VPS |
| Page layout changes and the parser breaks | Medium over time | Failure alert after 3 bad checks (F9). Keep parsing in one adapter |
| Terms of use restrict automated access | Check before building | Read the site's terms and robots.txt. Keep it personal and low-frequency. Revisit before sharing it publicly |
| Alert spam from price flapping | Medium | De-duplication rule (F6) and a minimum percent drop |
| Scheduled GitHub workflows can run late or pause | Low | Accept delays of minutes. Make a commit now and then, since GitHub pauses scheduled runs on inactive repos |

**Added by v1**

- **Free-tier pausing.** Supabase has paused free projects after a period of inactivity. Confirm the current rule, since a weekly scrape sits close to a one-week threshold.
- **Data leaking between users.** A mistake in row-level security would expose someone's watchlist. Test with two accounts before inviting anyone.
- **Telegram linking.** Linking a chat must prove it belongs to the signed-in user, for example with a one-time code sent to the bot. Otherwise alerts could be pointed at someone else's chat.
- **User-supplied URLs.** The app accepts only the store's domain, so the scraper cannot be used to fetch arbitrary addresses.
- **Scope creep.** The web app invites features. Anything outside the requirements table waits until v1 has been used for a few weeks.

## Out of scope and roadmap

Everything below is deliberately left out of v1 and built only after v1 has proven useful in daily life.

| Later phase | What it adds | Start when |
| --- | --- | --- |
| Recommendations | Suggest similar products, for example the same type and size at a lower price | Several products have weeks of price data |
| Other stores | Additional store adapters behind the same interface | The Chemist Warehouse adapter has stayed stable |
| Pickup availability | Per-store stock and click-and-collect, using a postcode | Online price alerts are working well |
| Opening to others | Public sign-up, web push, invitations | The app is worth sharing. Revisit the store's terms before this step |

The v1 design keeps these open: products carry a `store` field, watches are already per user, and notifications go through one interface.

## Build plan and open questions

Steps 1 to 5 are the v0 engine and deliver alerts on their own. Steps 6 to 10 add the web app. Each step ends with something that runs.

- [ ] **1. Spike:** open a product page, find where the price lives, and confirm a plain request from a script returns it. Read the store's terms and robots.txt.
- [ ] **2. Adapter:** a function that takes a product URL and returns name, price and was-price. Test it against the live page.
- [ ] **3. Supabase:** create the project, the five tables, row-level security and magic-link sign-in.
- [ ] **4. Scraper job:** read all starred products, save each check, and run it from GitHub Actions cron.
- [ ] **5. Rules and Telegram:** target-price rule, 90-day median rule, de-duplication, failure alert, and a Telegram bot sending real messages.
- [ ] **6. App shell:** Next.js on Vercel with sign-in and the dashboard (W1, W2).
- [ ] **7. Add and manage:** the add-product dialog and the edit, pause and unstar controls (W3, W5).
- [ ] **8. Product detail:** the price chart with target line and alert markers (W4).
- [ ] **9. Alerts:** notification settings, Telegram linking, test message and alert history (W6, W7).
- [ ] **10. Health and polish:** scrape health flags, check now, deal label, mobile layout (W8 to W12).
- [ ] **11. Live with it:** use it for a few weeks before starting anything on the roadmap.

**Open questions**

- Which products do I start with, and what are my target prices?
- Weekly checks can miss a sale that lasts only a few days. Keep weekly, or check daily?
- What percent below the 90-day median counts as a sale?
- Is v1 just for me, or do I invite a few people straight away? That decides how much of sign-in and Telegram linking to harden.
- Telegram and email both in v1, or Telegram first?
- If the store blocks cloud servers, where does the scraper run: a home machine or a small VPS?
- Do I want it installable on my phone (W12), or is a mobile web page enough?
